import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';
import { verifyLedger, createCheckpoint, inclusionProof } from '../services/ledger';
import { verifyProof, MerkleProof } from '../services/merkle';
import { runConsensusRound, getBlockConsensus, quorumSize } from '../services/consensus';
import { anchorLatestCheckpoint, listAnchors, configuredAnchorTarget } from '../services/anchor';

const router = Router();

function isMasterUser(roleId: string): boolean {
  return roleId === 'MASTER_ADMIN' || roleId === 'SYSTEM_MASTER_ADMIN';
}

/** Shared AUDIT_READ gate used by every read endpoint. Returns true if allowed (else responds). */
async function requireAuditRead(req: Request, res: Response): Promise<boolean> {
  const user = req.userSession!;
  const authz = await authorize(user, 'AUDIT_READ', { type: 'SYSTEM' }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  if (!authz.allowed) {
    res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    return false;
  }
  return true;
}

// GET /api/ledger/verify -- walk the whole hash chain and report integrity.
router.get('/verify', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  return res.json(await verifyLedger());
});

// GET /api/ledger/config -- consensus + anchoring parameters (read-only, for the explorer UI).
router.get('/config', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  return res.json({ quorum: quorumSize(), anchorTarget: configuredAnchorTarget() });
});

// GET /api/ledger -- list recent blocks (hashes + metadata only; no payloads exist).
// Scoped: non-master callers only see blocks their organisation originated or that
// anchor a case in their vertical subtree.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  const user = req.userSession!;

  const isMaster = isMasterUser(user.roleId);
  const limit = Math.min(parseInt((req.query.limit as string) || '100', 10) || 100, 500);

  const params: any[] = [];
  let scope = '';
  if (!isMaster) {
    params.push(user.organizationId, user.organizationPath);
    scope = `WHERE (
      lb.org_id = $1
      OR lb.case_id IN (
        SELECT c.id FROM cases c
        JOIN organization_nodes o ON c.originating_organization_id = o.id
        WHERE o.hierarchy_path = $2 OR o.hierarchy_path LIKE $2 || '.%'
      )
    )`;
  }
  params.push(limit);

  const rows = await query(
    `SELECT lb.id, lb.seq, lb.prev_hash, lb.event_type, lb.event_ref_table, lb.event_ref_id,
            lb.case_id, lb.org_id, lb.body_id, lb.payload_hash, lb.block_hash, lb.merkle_root,
            COALESCE(lb.consensus_state, 'FINAL') AS consensus_state,
            (lb.org_signature IS NOT NULL) AS signed, lb.created_at,
            o.name AS org_name, o.code AS org_code, c.fir_number,
            (SELECT COUNT(*)::int FROM ledger_block_signatures s WHERE s.block_seq = lb.seq) AS cosign_count
     FROM ledger_blocks lb
     LEFT JOIN organization_nodes o ON lb.org_id = o.id
     LEFT JOIN cases c ON lb.case_id = c.id
     ${scope}
     ORDER BY lb.seq DESC
     LIMIT $${params.length}`,
    params
  );

  return res.json({ blocks: rows.rows, quorum: quorumSize() });
});

// GET /api/ledger/block/:seq -- one block plus its consensus co-signatures.
router.get('/block/:seq', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  const seq = parseInt(String(req.params.seq), 10);
  if (Number.isNaN(seq)) return res.status(400).json({ error: 'Bad Request', message: 'seq must be a number' });

  const block = (
    await query(
      `SELECT lb.seq, lb.prev_hash, lb.event_type, lb.event_ref_table, lb.event_ref_id,
              lb.case_id, lb.org_id, lb.body_id, lb.payload_hash, lb.block_hash, lb.merkle_root,
              COALESCE(lb.consensus_state, 'FINAL') AS consensus_state, lb.created_at,
              o.name AS org_name, o.code AS org_code
       FROM ledger_blocks lb
       LEFT JOIN organization_nodes o ON lb.org_id = o.id
       WHERE lb.seq = $1`,
      [seq]
    )
  ).rows[0];
  if (!block) return res.status(404).json({ error: 'Not Found', message: `no block at seq ${seq}` });

  const consensus = await getBlockConsensus(seq);
  return res.json({ block, consensus });
});

// GET /api/ledger/proof/:refTable/:refId -- Merkle inclusion proof for a record.
router.get('/proof/:refTable/:refId', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  const result = await inclusionProof(String(req.params.refTable), String(req.params.refId));
  if (!result.found) return res.status(404).json({ error: 'Not Found', message: result.reason });
  return res.json(result);
});

// POST /api/ledger/verify-proof -- independently verify a supplied Merkle proof.
// Pure recomputation; useful for demonstrating third-party verifiability.
router.post('/verify-proof', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  const proof = req.body?.proof as MerkleProof | undefined;
  if (!proof || !proof.leaf || !Array.isArray(proof.path) || !proof.root) {
    return res.status(400).json({ error: 'Bad Request', message: 'proof {leaf, path, root} required' });
  }
  return res.json({ valid: verifyProof(proof), root: proof.root });
});

// GET /api/ledger/checkpoints -- list Merkle checkpoints (with anchor status).
router.get('/checkpoints', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  const rows = await query(
    `SELECT c.checkpoint_seq, c.from_seq, c.to_seq, c.block_count, c.merkle_root,
            c.tip_block_hash, c.created_at,
            a.anchor_target, a.status AS anchor_status, a.anchored_at
       FROM ledger_checkpoints c
       LEFT JOIN ledger_anchors a ON a.checkpoint_seq = c.checkpoint_seq
      ORDER BY c.checkpoint_seq DESC LIMIT 100`
  );
  return res.json({ checkpoints: rows.rows });
});

// POST /api/ledger/checkpoint -- seal new blocks into a Merkle checkpoint (master only).
router.post('/checkpoint', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  const user = req.userSession!;
  if (!isMasterUser(user.roleId)) {
    return res.status(403).json({ error: 'Access Denied', message: 'checkpoint sealing is a master-authority action' });
  }
  const result = await withTransaction((client) => createCheckpoint(client, user.userId));
  if (!result) return res.json({ created: false, message: 'no new blocks to checkpoint' });
  return res.json({ created: true, checkpoint: result });
});

// GET /api/ledger/anchors -- list external anchors, re-verifying local-notary receipts.
router.get('/anchors', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  return res.json({ anchors: await listAnchors(), target: configuredAnchorTarget() });
});

// POST /api/ledger/anchor -- publish the next unanchored checkpoint root externally (master only).
router.post('/anchor', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  const user = req.userSession!;
  if (!isMasterUser(user.roleId)) {
    return res.status(403).json({ error: 'Access Denied', message: 'anchoring is a master-authority action' });
  }
  const result = await withTransaction((client) => anchorLatestCheckpoint(client));
  return res.json(result);
});

// POST /api/ledger/consensus/round -- run a validator consensus round over pending blocks (master only).
router.post('/consensus/round', requireAuth, async (req: Request, res: Response) => {
  if (!(await requireAuditRead(req, res))) return;
  const user = req.userSession!;
  if (!isMasterUser(user.roleId)) {
    return res.status(403).json({ error: 'Access Denied', message: 'driving a consensus round is a master-authority action' });
  }
  return res.json(await runConsensusRound());
});

export default router;
