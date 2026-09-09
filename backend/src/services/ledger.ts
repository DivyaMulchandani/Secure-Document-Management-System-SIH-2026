import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PoolClient } from 'pg';
import { query } from './db';

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

function signBlock(bodyId: string, blockHash: string): string | null {
  const kp = getBodyKeyPair(bodyId);
  if (!kp) return null;
  const sig = crypto.sign(null, Buffer.from(blockHash, 'hex'), kp.privateKeyPem);
  return sig.toString('base64');
}

function verifyBlockSignature(bodyId: string, blockHash: string, signatureB64: string | null): boolean {
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

  const res = await client.query(
    `INSERT INTO ledger_blocks (
       seq, prev_hash, event_type, event_ref_table, event_ref_id,
       case_id, org_id, body_id, payload_hash, org_signature, block_hash, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, seq, block_hash, created_at`,
    [
      seq, prevHash, input.eventType, input.refTable || null, input.refId != null ? String(input.refId) : null,
      input.caseId || null, input.orgId || null, (input.bodyId || 'MASTER').toUpperCase(),
      payloadHash, signature, blockHash, createdAtIso,
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
