import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';

const router = Router();

// GET /api/audit
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const { action, result, caseId, limit } = req.query;

  const authz = await authorize(user, 'AUDIT_READ', { type: 'SYSTEM' }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  let queryText = `
    SELECT a.*, u.username, u.display_name, o.name as org_name, o.code as org_code,
           c.fir_number
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    LEFT JOIN organization_nodes o ON a.organization_id = o.id
    LEFT JOIN cases c ON a.case_id = c.id
    WHERE 1=1
  `;

  const params: any[] = [];

  // Scoped audit filtering: non-master admins only see audit records within their org or cases
  if (user.roleId !== 'MASTER_ADMIN') {
    params.push(user.organizationPath);
    queryText += ` AND (o.hierarchy_path = $${params.length} OR o.hierarchy_path LIKE $${params.length} || '.%')`;
  }

  if (action) {
    params.push(action);
    queryText += ` AND a.action = $${params.length}`;
  }
  if (result) {
    params.push(result);
    queryText += ` AND a.result = $${params.length}`;
  }
  if (caseId) {
    params.push(caseId);
    queryText += ` AND a.case_id = $${params.length}`;
  }

  const maxRows = Math.min(parseInt(limit as string, 10) || 100, 500);
  params.push(maxRows);
  queryText += ` ORDER BY a.timestamp DESC LIMIT $${params.length};`;

  const logs = await query(queryText, params);
  return res.json({ auditLogs: logs.rows });
});

export default router;
