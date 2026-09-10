import crypto from 'crypto';
import { PoolClient } from 'pg';
import { query } from './db';
import { signBlock, verifyBlockSignature } from './ledger';

/**
 * External anchoring (Phase 2).
 *
 * The hash-chain + append-only triggers stop tampering by anyone below the
 * database owner. They do NOT stop an actor who can rewrite the ENTIRE database
 * (and recompute every hash) from silently rewriting history. The defence is to
 * periodically publish the latest checkpoint's Merkle root to an out-of-band
 * target that the platform's operators do not control, so any later rewrite
 * disagrees with a value already witnessed elsewhere.
 *
 * Targets are pluggable:
 *   - RFC3161_TSA     : POST the root to an RFC-3161 timestamp authority (ANCHOR_TSA_URL).
 *   - OPENTIMESTAMPS  : submit to an OpenTimestamps calendar (ANCHOR_OTS_URL).
 *   - LOCAL_NOTARY    : offline fallback -- MASTER-key countersignature + timestamp.
 *                       Honest caveat: this is only as strong as MASTER key custody;
 *                       it gives a portable, verifiable receipt for demos/air-gapped
 *                       installs, NOT independence from the operators. Configure a
 *                       real external target in production.
 *
 * Only the 32-byte root is ever transmitted -- never PII, payloads, or identifiers.
 * Any outbound network target must be explicitly configured by the operator via
 * env; with nothing configured the service uses LOCAL_NOTARY and makes no network
 * calls.
 */

export type AnchorTarget = 'RFC3161_TSA' | 'OPENTIMESTAMPS' | 'LOCAL_NOTARY';

export function configuredAnchorTarget(): AnchorTarget {
  const t = (process.env.ANCHOR_TARGET || '').toUpperCase();
  if (t === 'RFC3161_TSA' && process.env.ANCHOR_TSA_URL) return 'RFC3161_TSA';
  if (t === 'OPENTIMESTAMPS' && process.env.ANCHOR_OTS_URL) return 'OPENTIMESTAMPS';
  return 'LOCAL_NOTARY';
}

interface AnchorReceipt {
  target: AnchorTarget;
  reference: string | null;
  receipt: string | null;   // base64 opaque proof, verifiable out-of-band
  status: 'CONFIRMED' | 'PENDING' | 'FAILED';
}

/** Produce the out-of-band receipt for a root. Network targets are used only when configured. */
async function obtainReceipt(root: string, checkpointSeq: number): Promise<AnchorReceipt> {
  const target = configuredAnchorTarget();

  if (target === 'LOCAL_NOTARY') {
    const witnessedAt = new Date().toISOString();
    const preimage = `${checkpointSeq}|${root}|${witnessedAt}`;
    const sig = signBlock('MASTER', crypto.createHash('sha256').update(preimage).digest('hex'));
    const receipt = Buffer.from(JSON.stringify({ preimage, witnessedAt, sig }), 'utf8').toString('base64');
    return { target, reference: `local-notary:${witnessedAt}`, receipt, status: sig ? 'CONFIRMED' : 'FAILED' };
  }

  // Network targets: submit only the root. Kept behind explicit env config; a
  // failure is recorded as PENDING rather than throwing, so the checkpoint stands
  // and the anchor can be retried.
  try {
    const url = target === 'RFC3161_TSA' ? process.env.ANCHOR_TSA_URL! : process.env.ANCHOR_OTS_URL!;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(root, 'hex'),
    });
    if (!resp.ok) return { target, reference: null, receipt: null, status: 'PENDING' };
    const body = Buffer.from(await resp.arrayBuffer()).toString('base64');
    return { target, reference: `${target}:${resp.headers.get('location') || 'submitted'}`, receipt: body, status: 'CONFIRMED' };
  } catch {
    return { target, reference: null, receipt: null, status: 'PENDING' };
  }
}

export interface AnchorResult {
  anchored: boolean;
  reason?: string;
  checkpointSeq?: number;
  root?: string;
  target?: AnchorTarget;
  status?: string;
}

/**
 * Anchor the latest not-yet-anchored checkpoint. Call after createCheckpoint().
 * Must run inside a transaction so the anchor row commits with its checkpoint view.
 */
export async function anchorLatestCheckpoint(client: PoolClient): Promise<AnchorResult> {
  const cp = (
    await client.query(
      `SELECT c.checkpoint_seq, c.merkle_root
         FROM ledger_checkpoints c
         LEFT JOIN ledger_anchors a ON a.checkpoint_seq = c.checkpoint_seq
        WHERE a.id IS NULL
        ORDER BY c.checkpoint_seq ASC
        LIMIT 1`
    )
  ).rows[0];
  if (!cp) return { anchored: false, reason: 'no unanchored checkpoint' };

  const checkpointSeq = Number(cp.checkpoint_seq);
  const root = cp.merkle_root as string;
  const receipt = await obtainReceipt(root, checkpointSeq);

  await client.query(
    `INSERT INTO ledger_anchors
       (checkpoint_seq, anchored_root, anchor_target, anchor_reference, anchor_receipt, status)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [checkpointSeq, root, receipt.target, receipt.reference, receipt.receipt, receipt.status]
  );

  return { anchored: true, checkpointSeq, root, target: receipt.target, status: receipt.status };
}

export interface AnchorVerifyResult {
  checkpointSeq: number;
  root: string;
  target: string;
  status: string;
  receiptValid: boolean;   // for LOCAL_NOTARY, the MASTER countersignature re-verifies
  anchoredAt: string;
}

/** List anchors and, for LOCAL_NOTARY receipts, re-verify the countersignature. */
export async function listAnchors(limit = 50): Promise<AnchorVerifyResult[]> {
  const rows = (
    await query(
      `SELECT checkpoint_seq, anchored_root, anchor_target, anchor_reference, anchor_receipt, status, anchored_at
         FROM ledger_anchors ORDER BY checkpoint_seq DESC LIMIT $1`,
      [Math.min(limit, 200)]
    )
  ).rows;

  return rows.map((r) => {
    let receiptValid = false;
    if (r.anchor_target === 'LOCAL_NOTARY' && r.anchor_receipt) {
      try {
        const parsed = JSON.parse(Buffer.from(r.anchor_receipt, 'base64').toString('utf8'));
        const digest = crypto.createHash('sha256').update(parsed.preimage).digest('hex');
        receiptValid = verifyBlockSignature('MASTER', digest, parsed.sig);
      } catch {
        receiptValid = false;
      }
    } else {
      receiptValid = r.status === 'CONFIRMED';
    }
    return {
      checkpointSeq: Number(r.checkpoint_seq),
      root: r.anchored_root,
      target: r.anchor_target,
      status: r.status,
      receiptValid,
      anchoredAt: r.anchored_at,
    };
  });
}
