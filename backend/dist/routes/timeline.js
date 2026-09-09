"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../services/db");
const auth_1 = require("../services/auth");
const authorization_1 = require("../services/authorization");
const router = (0, express_1.Router)();
// GET /api/cases/:id/timeline
router.get('/cases/:id/timeline', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'CASE_READ', {
        type: 'CASE',
        id: caseId,
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    const events = await (0, db_1.query)(`
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
exports.default = router;
