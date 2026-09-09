import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';

const router = Router();

// GET /api/cases/:id/timeline
router.get('/cases/:id/timeline', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const caseId = req.params.id;

  const caseRes = await query(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
  if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Case not found' });

  const authz = await authorize(user, 'CASE_READ', {
    type: 'CASE',
    id: caseId,
    caseId,
    owningOrgId: caseRes.rows[0].originating_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const events = await query(`
    SELECT t.*, u.display_name as actor_name, u.badge_number as actor_badge,
           o.name as organization_name, o.code as organization_code, o.agency_branch
    FROM case_timeline t
    JOIN users u ON t.actor_id = u.id
    JOIN organization_nodes o ON t.organization_id = o.id
    WHERE t.case_id = $1
    ORDER BY t.occurred_at ASC;
  `, [caseId]);

  return res.json({ timeline: events.rows });
});

export default router;
