import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';
import { verifyLedger } from '../services/ledger';

const router = Router();

// GET /api/ledger/verify -- walk the whole hash chain and report integrity.
router.get('/verify', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const authz = await authorize(user, 'AUDIT_READ', { type: 'SYSTEM' }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const result = await verifyLedger();
  return res.json(result);
});

// GET /api/ledger -- list recent blocks (hashes + metadata only; no payloads exist).
// Scoped: non-master callers only see blocks their organisation originated or that
// anchor a case in their vertical subtree.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const authz = await authorize(user, 'AUDIT_READ', { type: 'SYSTEM' }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
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
            lb.case_id, lb.org_id, lb.body_id, lb.payload_hash, lb.block_hash,
            (lb.org_signature IS NOT NULL) AS signed, lb.created_at,
            o.name AS org_name, o.code AS org_code, c.fir_number
     FROM ledger_blocks lb
     LEFT JOIN organization_nodes o ON lb.org_id = o.id
     LEFT JOIN cases c ON lb.case_id = c.id
     ${scope}
     ORDER BY lb.seq DESC
     LIMIT $${params.length}`,
    params
  );

  return res.json({ blocks: rows.rows });
});

export default router;
