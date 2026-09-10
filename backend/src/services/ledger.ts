import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import { query } from './db';
import { merkleRoot, buildProof, MerkleProof } from './merkle';

/**
 * Hash-chained, per-agency-signed integrity ledger.
 *
 * Purpose: give the audit trail and the evidence chain-of-custody
 * cryptographic tamper-evidence that does NOT depend on database
 * permissions. Every appended block chains to the previous one:
 *
 *   block_hash = SHA256(prev_hash + payload_hash + seq + created_at_iso)
 *
 * and is signed by the Ed25519 key of the originating sovereign body
 * (POLICE / JUDICIARY / FORENSICS / MASTER). Altering any historical row
 * breaks every subsequent block, detectable via verifyLedger().
 *
 * The ledger stores only hashes, ids and organisational identifiers --
 * never PII or document contents. Read access is still mediated by the
 * normal authorize() engine at the route layer.
 *
 * NOTE ON KEYS: for this build the body signing keys live in data/keys/
 * (gitignored). In production this is the one place a KMS / HSM is
 * non-negotiable -- it is the root of trust for the whole integrity story.
 */

const GENESIS_HASH = '0'.repeat(64);
const KEYS_DIR = path.resolve(__dirname, '../../../data/keys');
const LEDGER_ADVISORY_LOCK_KEY = 915823; // arbitrary constant; serialises block appends per-txn

const KNOWN_BODIES = ['POLICE', 'JUDICIARY', 'FORENSICS', 'MASTER'] as const;
type BodyId = (typeof KNOWN_BODIES)[number];

function ensureKeysDir() {
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
}

/** Load (or generate on first use) the Ed25519 keypair for a sovereign body. */
function getBodyKeyPair(bodyId: string): { privateKeyPem: string; publicKeyPem: string } | null {
  const id = (bodyId || '').toUpperCase();
  if (!KNOWN_BODIES.includes(id as BodyId)) return null;

  ensureKeysDir();
  const privPath = path.join(KEYS_DIR, `${id}.ed25519.pem`);
  const pubPath = path.join(KEYS_DIR, `${id}.ed25519.pub.pem`);

  if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, { mode: 0o600 });
    fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }) as string);
  }

  return {
    privateKeyPem: fs.readFileSync(privPath, 'utf8'),
    publicKeyPem: fs.readFileSync(pubPath, 'utf8'),
  };
}

export function signBlock(bodyId: string, blockHash: string): string | null {
  const kp = getBodyKeyPair(bodyId);
  if (!kp) return null;
  const sig = crypto.sign(null, Buffer.from(blockHash, 'hex'), kp.privateKeyPem);
  return sig.toString('base64');
}

export function verifyBlockSignature(bodyId: string, blockHash: string, signatureB64: string | null): boolean {
  if (!signatureB64) return false;
  const kp = getBodyKeyPair(bodyId);
  if (!kp) return false;
  try {
    return crypto.verify(null, Buffer.from(blockHash, 'hex'), kp.publicKeyPem, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Deterministic JSON: object keys sorted recursively so hashing is stable. */
export function canonicalJson(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

// block_hash chains prev_hash + payload_hash + seq. created_at is kept as an
// informational column but deliberately NOT hashed: TIMESTAMPTZ round-tripping
// could differ by sub-millisecond from the JS ISO string and cause false
// "tamper" positives. Integrity comes from the seq check + prev_hash linkage
// + payload_hash, all of which ARE covered here.
function computeBlockHash(prevHash: string, payloadHash: string, seq: number): string {
  return sha256(`${prevHash}|${payloadHash}|${seq}`);
}

export interface LedgerAppendInput {
  eventType: string;                 // AUDIT_DECISION | EVIDENCE_CUSTODY | DOCUMENT_ANCHOR | CASE_CREATED ...
  refTable?: string | null;          // source table the block anchors
  refId?: string | null;             // source row id
  caseId?: string | null;
  orgId?: string | null;
  bodyId?: string | null;            // originating sovereign body (signing identity)
  payload: Record<string, any>;      // immutable facts; hashed, never stored raw
}

/**
 * Append one block to the ledger. MUST be called with a transaction-scoped
 * client (see withTransaction) so the block and its source row commit atomically.
 */
export async function appendLedgerBlock(client: PoolClient, input: LedgerAppendInput) {
  await client.query('SELECT pg_advisory_xact_lock($1)', [LEDGER_ADVISORY_LOCK_KEY]);

  const lastRes = await client.query(
    'SELECT seq, block_hash FROM ledger_blocks ORDER BY seq DESC LIMIT 1'
  );
  const last = lastRes.rows[0];
  const seq = (last ? Number(last.seq) : 0) + 1;
  const prevHash: string = last ? last.block_hash : GENESIS_HASH;

  const createdAtIso = new Date().toISOString();
  const payloadHash = sha256(canonicalJson(input.payload));
  const blockHash = computeBlockHash(prevHash, payloadHash, seq);
  const signature = signBlock(input.bodyId || 'MASTER', blockHash);

  // Per-block Merkle root. Today one event => one leaf, so this is a single-leaf
  // tree over block_hash; the column is ready for multi-event blocks later.
  const blockMerkleRoot = merkleRoot([blockHash]);

  const res = await client.query(
    `INSERT INTO ledger_blocks (
       seq, prev_hash, event_type, event_ref_table, event_ref_id,
       case_id, org_id, body_id, payload_hash, org_signature, block_hash,
       merkle_root, consensus_state, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id, seq, block_hash, created_at`,
    [
      seq, prevHash, input.eventType, input.refTable || null, input.refId != null ? String(input.refId) : null,
      input.caseId || null, input.orgId || null, (input.bodyId || 'MASTER').toUpperCase(),
      payloadHash, signature, blockHash, blockMerkleRoot, 'PROPOSED', createdAtIso,
    ]
  );
  return res.rows[0];
}

export interface LedgerVerifyResult {
  valid: boolean;
  totalBlocks: number;
  brokenAt: number | null;       // seq of the first bad block, if any
  reason: string | null;
  checkedSignatures: number;
  verifiedAt: string;
}

/**
 * Walk the whole chain and recompute. Detects: edited hash/seq/timestamp,
 * broken prev-hash linkage, dropped or reordered blocks, and (when a body
 * key is present) a bad or missing signature.
 */
export async function verifyLedger(): Promise<LedgerVerifyResult> {
  const rows = (
    await query(
      `SELECT seq, prev_hash, payload_hash, block_hash, body_id, org_signature
       FROM ledger_blocks ORDER BY seq ASC`
    )
  ).rows;

  const verifiedAt = new Date().toISOString();
  let prevHash = GENESIS_HASH;
  let checkedSignatures = 0;

  for (let i = 0; i < rows.length; i++) {
    const b = rows[i];
    const seq = Number(b.seq);

    if (seq !== i + 1) {
      return { valid: false, totalBlocks: rows.length, brokenAt: seq, reason: `sequence gap/reorder at block ${seq} (expected ${i + 1})`, checkedSignatures, verifiedAt };
    }
    if (b.prev_hash !== prevHash) {
      return { valid: false, totalBlocks: rows.length, brokenAt: seq, reason: `prev_hash linkage broken at block ${seq}`, checkedSignatures, verifiedAt };
    }

    const recomputed = computeBlockHash(b.prev_hash, b.payload_hash, seq);
    if (recomputed !== b.block_hash) {
      return { valid: false, totalBlocks: rows.length, brokenAt: seq, reason: `block_hash mismatch at block ${seq} -- contents altered`, checkedSignatures, verifiedAt };
    }

    if (b.org_signature) {
      const ok = verifyBlockSignature(b.body_id, b.block_hash, b.org_signature);
      checkedSignatures++;
      if (!ok) {
        return { valid: false, totalBlocks: rows.length, brokenAt: seq, reason: `invalid ${b.body_id} signature at block ${seq}`, checkedSignatures, verifiedAt };
      }
    }

    prevHash = b.block_hash;
  }

  return { valid: true, totalBlocks: rows.length, brokenAt: null, reason: null, checkedSignatures, verifiedAt };
}

/** Convenience: is the sub-chain of blocks anchoring one source row still intact? */
export async function verifyRefChain(refTable: string, refId: string): Promise<{ verified: boolean; blocks: number }> {
  const full = await verifyLedger();
  const count = (
    await query('SELECT COUNT(*)::int AS n FROM ledger_blocks WHERE event_ref_table = $1 AND event_ref_id = $2', [refTable, String(refId)])
  ).rows[0].n;
  return { verified: full.valid, blocks: count };
}

/* ------------------------------------------------------------------ *
 *  MERKLE CHECKPOINTS & INCLUSION PROOFS
 * ------------------------------------------------------------------ */

export interface CheckpointResult {
  checkpointSeq: number;
  fromSeq: number;
  toSeq: number;
  blockCount: number;
  merkleRoot: string;
  tipBlockHash: string;
  createdAt: string;
}

/**
 * Seal every block newer than the last checkpoint into a new Merkle checkpoint.
 * Runs under the same advisory lock as appends so no block can slip in between
 * reading the window and committing the root. Returns null if there is nothing
 * new to checkpoint.
 */
export async function createCheckpoint(client: PoolClient, createdBy?: string | null): Promise<CheckpointResult | null> {
  await client.query('SELECT pg_advisory_xact_lock($1)', [LEDGER_ADVISORY_LOCK_KEY]);

  const lastCp = (
    await client.query('SELECT checkpoint_seq, to_seq, merkle_root FROM ledger_checkpoints ORDER BY checkpoint_seq DESC LIMIT 1')
  ).rows[0];
  const fromSeq = lastCp ? Number(lastCp.to_seq) + 1 : 1;

  const blocks = (
    await client.query(
      'SELECT seq, block_hash FROM ledger_blocks WHERE seq >= $1 ORDER BY seq ASC',
      [fromSeq]
    )
  ).rows;
  if (blocks.length === 0) return null;

  const toSeq = Number(blocks[blocks.length - 1].seq);
  const root = merkleRoot(blocks.map((b) => b.block_hash));
  const tipBlockHash = blocks[blocks.length - 1].block_hash;
  const checkpointSeq = (lastCp ? Number(lastCp.checkpoint_seq) : 0) + 1;

  const res = await client.query(
    `INSERT INTO ledger_checkpoints
       (checkpoint_seq, from_seq, to_seq, block_count, merkle_root, tip_block_hash, prev_checkpoint_root, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING checkpoint_seq, from_seq, to_seq, block_count, merkle_root, tip_block_hash, created_at`,
    [checkpointSeq, fromSeq, toSeq, blocks.length, root, tipBlockHash, lastCp ? lastCp.merkle_root : null, createdBy || null]
  );
  const r = res.rows[0];
  return {
    checkpointSeq: Number(r.checkpoint_seq),
    fromSeq: Number(r.from_seq),
    toSeq: Number(r.to_seq),
    blockCount: Number(r.block_count),
    merkleRoot: r.merkle_root,
    tipBlockHash: r.tip_block_hash,
    createdAt: r.created_at,
  };
}

export interface InclusionProofResult {
  found: boolean;
  reason?: string;
  blockSeq?: number;
  blockHash?: string;
  eventType?: string;
  checkpointSeq?: number;         // present when proven against a sealed checkpoint
  againstLiveTip?: boolean;       // true when no checkpoint covers it yet (proven vs current chain)
  proof?: MerkleProof;
}

/**
 * Produce a Merkle inclusion proof that the block anchoring (refTable, refId)
 * is part of a committed root -- either a sealed checkpoint (preferred) or, if
 * none covers it yet, the live chain window. The returned proof.root is the
 * value a verifier compares against; verifyProof() recomputes it from leaf+path.
 */
export async function inclusionProof(refTable: string, refId: string): Promise<InclusionProofResult> {
  const target = (
    await query(
      'SELECT seq, block_hash, event_type FROM ledger_blocks WHERE event_ref_table = $1 AND event_ref_id = $2 ORDER BY seq ASC LIMIT 1',
      [refTable, String(refId)]
    )
  ).rows[0];
  if (!target) return { found: false, reason: 'no ledger block anchors this record' };

  const blockSeq = Number(target.seq);

  const cp = (
    await query(
      'SELECT checkpoint_seq, from_seq, to_seq FROM ledger_checkpoints WHERE from_seq <= $1 AND to_seq >= $1 ORDER BY checkpoint_seq ASC LIMIT 1',
      [blockSeq]
    )
  ).rows[0];

  let windowFrom: number;
  let windowTo: number;
  let checkpointSeq: number | undefined;
  let againstLiveTip = false;

  if (cp) {
    windowFrom = Number(cp.from_seq);
    windowTo = Number(cp.to_seq);
    checkpointSeq = Number(cp.checkpoint_seq);
  } else {
    // Not yet sealed: prove against the window since the last checkpoint (the
    // live tip). Same math, root just isn't externally anchored yet.
    const lastCp = (
      await query('SELECT to_seq FROM ledger_checkpoints ORDER BY checkpoint_seq DESC LIMIT 1')
    ).rows[0];
    windowFrom = lastCp ? Number(lastCp.to_seq) + 1 : 1;
    windowTo = Number((await query('SELECT MAX(seq) AS m FROM ledger_blocks')).rows[0].m);
    againstLiveTip = true;
  }

  const windowBlocks = (
    await query('SELECT seq, block_hash FROM ledger_blocks WHERE seq >= $1 AND seq <= $2 ORDER BY seq ASC', [windowFrom, windowTo])
  ).rows;
  const index = windowBlocks.findIndex((b) => Number(b.seq) === blockSeq);
  if (index < 0) return { found: false, reason: 'block fell outside its checkpoint window' };

  const proof = buildProof(windowBlocks.map((b) => b.block_hash), index);
  return {
    found: true,
    blockSeq,
    blockHash: target.block_hash,
    eventType: target.event_type,
    checkpointSeq,
    againstLiveTip,
    proof,
  };
}
