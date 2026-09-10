import { PoolClient } from 'pg';
import { query, withTransaction } from './db';
import { signBlock, verifyBlockSignature } from './ledger';
import crypto from 'crypto';

/**
 * Quorum consensus / block finality (Phase 3).
 *
 * The four sovereign bodies -- POLICE, JUDICIARY, FORENSICS, MASTER -- each act
 * as an independent VALIDATOR NODE. A freshly appended block is PROPOSED. Every
 * validator independently re-derives the block's hash from the immutable stored
 * columns (validateBlock) and, only if it recomputes correctly, contributes an
 * Ed25519 co-signature over the block_hash. Once a QUORUM of DISTINCT bodies has
 * co-signed, the block is FINAL. This is a PBFT-style commit: finality requires
 * multi-party agreement, not a single writer's say-so.
 *
 * In this single-process build every validator runs in-process and the co-sign
 * round is driven by runConsensusRound(). The interface is deliberately shaped
 * so that swapping a validator for a remote peer node is a transport change
 * (call its /attest endpoint) rather than a redesign: each body only ever needs
 * the block_hash + immutable columns to validate, never another node's private
 * state.
 */

export const VALIDATOR_BODIES = ['POLICE', 'JUDICIARY', 'FORENSICS', 'MASTER'] as const;
export type ValidatorBody = (typeof VALIDATOR_BODIES)[number];

/** Quorum size: how many distinct bodies must co-sign before a block is FINAL. */
export function quorumSize(): number {
  const n = parseInt(process.env.CONSENSUS_QUORUM || '3', 10);
  if (Number.isNaN(n) || n < 1) return 3;
  return Math.min(n, VALIDATOR_BODIES.length);
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function computeBlockHash(prevHash: string, payloadHash: string, seq: number): string {
  return sha256(`${prevHash}|${payloadHash}|${seq}`);
}

export interface ValidationResult {
  seq: number;
  valid: boolean;
  reason: string | null;
  blockHash: string | null;
}

/**
 * A validator independently re-derives the block hash from its immutable stored
 * columns and confirms it matches block_hash. It does NOT trust the stored hash.
 */
export async function validateBlock(seq: number): Promise<ValidationResult> {
  const b = (
    await query('SELECT seq, prev_hash, payload_hash, block_hash FROM ledger_blocks WHERE seq = $1', [seq])
  ).rows[0];
  if (!b) return { seq, valid: false, reason: 'block not found', blockHash: null };

  const recomputed = computeBlockHash(b.prev_hash, b.payload_hash, Number(b.seq));
  if (recomputed !== b.block_hash) {
    return { seq, valid: false, reason: 'recomputed block_hash mismatch', blockHash: b.block_hash };
  }

  // Linkage: prev_hash must equal the previous block's block_hash (or genesis).
  if (Number(b.seq) > 1) {
    const prev = (await query('SELECT block_hash FROM ledger_blocks WHERE seq = $1', [Number(b.seq) - 1])).rows[0];
    if (!prev || prev.block_hash !== b.prev_hash) {
      return { seq, valid: false, reason: 'prev_hash linkage broken', blockHash: b.block_hash };
    }
  } else if (b.prev_hash !== '0'.repeat(64)) {
    return { seq, valid: false, reason: 'genesis prev_hash invalid', blockHash: b.block_hash };
  }

  return { seq, valid: true, reason: null, blockHash: b.block_hash };
}

export interface CoSignResult {
  seq: number;
  bodyId: string;
  accepted: boolean;
  reason: string | null;
  signatures: number;
  quorum: number;
  finalized: boolean;
}

/**
 * One validator body validates then co-signs a block. Idempotent per (seq,body):
 * a repeat vote is accepted as a no-op. Flips the block to FINAL when the number
 * of distinct valid signatures reaches quorum.
 */
export async function coSignBlock(client: PoolClient, seq: number, bodyId: ValidatorBody): Promise<CoSignResult> {
  const quorum = quorumSize();

  const validation = await validateBlock(seq);
  if (!validation.valid || !validation.blockHash) {
    return { seq, bodyId, accepted: false, reason: validation.reason || 'validation failed', signatures: 0, quorum, finalized: false };
  }

  const signature = signBlock(bodyId, validation.blockHash);
  if (!signature) {
    return { seq, bodyId, accepted: false, reason: `no signing key for ${bodyId}`, signatures: 0, quorum, finalized: false };
  }

  // Record the vote (unique per body per block; ON CONFLICT => idempotent).
  await client.query(
    `INSERT INTO ledger_block_signatures (block_seq, body_id, signature)
     VALUES ($1,$2,$3)
     ON CONFLICT (block_seq, body_id) DO NOTHING`,
    [seq, bodyId, signature]
  );

  // Count DISTINCT valid signatures. We re-verify each stored signature so a
  // forged row cannot inflate the count toward quorum.
  const sigs = (
    await client.query('SELECT body_id, signature FROM ledger_block_signatures WHERE block_seq = $1', [seq])
  ).rows;
  let validCount = 0;
  for (const s of sigs) {
    if (verifyBlockSignature(s.body_id, validation.blockHash, s.signature)) validCount++;
  }

  let finalized = false;
  if (validCount >= quorum) {
    // consensus_state is intentionally OUTSIDE the immutable-columns trigger set.
    await client.query(
      `UPDATE ledger_blocks SET consensus_state = 'FINAL' WHERE seq = $1 AND consensus_state IS DISTINCT FROM 'FINAL'`,
      [seq]
    );
    finalized = true;
  }

  return { seq, bodyId, accepted: true, reason: null, signatures: validCount, quorum, finalized };
}

export interface ConsensusRoundResult {
  processed: number;      // blocks that reached quorum this round
  stillPending: number;   // proposed blocks that did not reach quorum
  finalizedSeqs: number[];
}

/**
 * Drive a consensus round over all currently-PROPOSED blocks: every validator
 * body validates and co-signs each one, and blocks meeting quorum become FINAL.
 * This is the in-process stand-in for independent nodes gossiping attestations.
 */
export async function runConsensusRound(): Promise<ConsensusRoundResult> {
  const pending = (
    await query(
      `SELECT seq FROM ledger_blocks WHERE consensus_state IS NULL OR consensus_state <> 'FINAL' ORDER BY seq ASC`
    )
  ).rows.map((r) => Number(r.seq));

  const finalizedSeqs: number[] = [];
  for (const seq of pending) {
    const finalized = await withTransaction(async (client) => {
      let didFinalize = false;
      for (const body of VALIDATOR_BODIES) {
        const r = await coSignBlock(client, seq, body);
        if (r.finalized) didFinalize = true;
      }
      return didFinalize;
    });
    if (finalized) finalizedSeqs.push(seq);
  }

  return {
    processed: finalizedSeqs.length,
    stillPending: pending.length - finalizedSeqs.length,
    finalizedSeqs,
  };
}

export interface BlockConsensus {
  seq: number;
  state: string;                 // PROPOSED | FINAL (legacy NULL reported as FINAL)
  quorum: number;
  signatures: { bodyId: string; valid: boolean; signedAt: string }[];
  validSignatures: number;
}

/** Report the consensus status + co-signatures for one block. */
export async function getBlockConsensus(seq: number): Promise<BlockConsensus | null> {
  const b = (await query('SELECT seq, block_hash, consensus_state FROM ledger_blocks WHERE seq = $1', [seq])).rows[0];
  if (!b) return null;

  const rows = (
    await query('SELECT body_id, signature, signed_at FROM ledger_block_signatures WHERE block_seq = $1 ORDER BY signed_at ASC', [seq])
  ).rows;

  const signatures = rows.map((s) => ({
    bodyId: s.body_id,
    valid: verifyBlockSignature(s.body_id, b.block_hash, s.signature),
    signedAt: s.signed_at,
  }));

  return {
    seq: Number(b.seq),
    state: b.consensus_state || 'FINAL', // legacy rows predate the column
    quorum: quorumSize(),
    signatures,
    validSignatures: signatures.filter((s) => s.valid).length,
  };
}
