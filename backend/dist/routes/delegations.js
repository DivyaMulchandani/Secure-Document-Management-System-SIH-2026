"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../services/db");
const auth_1 = require("../services/auth");
const authorization_1 = require("../services/authorization");
const router = (0, express_1.Router)();
// GET /api/delegations
router.get('/', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const delegRes = await (0, db_1.query)(`
    SELECT da.*,
           c.fir_number, c.title as case_title,
           u_grant.display_name as granted_by_name,
           u_to.display_name as granted_to_name, u_to.username as granted_to_username,
           o_to.name as granted_to_org_name
    FROM delegated_access da
    JOIN cases c ON da.case_id = c.id
    JOIN users u_grant ON da.granted_by_user_id = u_grant.id
    JOIN users u_to ON da.granted_to_user_id = u_to.id
    JOIN organization_nodes o_to ON u_to.primary_organization_id = o_to.id
    WHERE (
      $1 = 'MASTER_ADMIN'
      OR da.granted_by_user_id = $2
      OR da.granted_to_user_id = $2
      OR c.originating_organization_id IN (
        SELECT id FROM organization_nodes WHERE hierarchy_path = $3 OR hierarchy_path LIKE $3 || '.%'
      )
    )
    ORDER BY da.created_at DESC;
  `, [user.roleId, user.userId, user.organizationPath]);
    return res.json({ delegations: delegRes.rows });
});
// POST /api/delegations (Issue Temporary Delegated Access)
router.post('/', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const { caseId, grantedToUserId, permissions, reason, startsAt, expiresAt } = req.body;
    if (!caseId || !grantedToUserId || !permissions || !Array.isArray(permissions) || !reason || !startsAt || !expiresAt) {
        return res.status(400).json({ error: 'Validation Error', message: 'Missing required delegation parameters' });
    }
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    // Granter must have DELEGATION_MANAGE permission and case access
    const authz = await (0, authorization_1.authorize)(user, 'DELEGATION_MANAGE', {
        type: 'CASE',
        id: caseId,
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    // Permission Ceiling Enforcement: Granter cannot delegate permissions they do not possess!
    for (const p of permissions) {
        if (!user.permissions.includes(p) && user.roleId !== 'MASTER_ADMIN') {
            return res.status(403).json({
                error: 'Privilege Ceiling Violation',
                message: `Cannot delegate permission '${p}' as you do not possess it in your active role.`,
            });
        }
    }
    const delegRes = await (0, db_1.query)(`
    INSERT INTO delegated_access (
      case_id, granted_by_user_id, granted_to_user_id, permissions, reason, starts_at, expires_at, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
    RETURNING *;
  `, [caseId, user.userId, grantedToUserId, permissions, reason, startsAt, expiresAt]);
    await (0, db_1.query)(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'DELEGATED_ACCESS_GRANTED', 'Temporary Delegated Access Granted', $2, $3, $4, 'DELEGATION', $5);
  `, [caseId, `Temporary access granted by ${user.displayName} until ${new Date(expiresAt).toLocaleString()}`, user.userId, user.organizationId, delegRes.rows[0].id]);
    await (0, db_1.query)(`
    INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
    VALUES ($1, $2, 'DELEGATION_GRANTED', 'DELEGATION', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
  `, [user.userId, user.organizationId, delegRes.rows[0].id, caseId, req.ip, req.headers['user-agent'], JSON.stringify({ grantee: grantedToUserId, expires: expiresAt })]);
    return res.status(201).json({ success: true, delegation: delegRes.rows[0] });
});
// PUT /api/delegations/:id/revoke
router.put('/:id/revoke', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const delegId = req.params.id;
    const dRes = await (0, db_1.query)(`SELECT * FROM delegated_access WHERE id = $1;`, [delegId]);
    if (dRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Delegation not found' });
    const d = dRes.rows[0];
    if (d.granted_by_user_id !== user.userId && user.roleId !== 'MASTER_ADMIN') {
        return res.status(403).json({ error: 'Access Denied', message: 'Only the granter or master administrator can revoke this delegation' });
    }
    await (0, db_1.query)(`UPDATE delegated_access SET status = 'REVOKED' WHERE id = $1;`, [delegId]);
    await (0, db_1.query)(`
    INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent)
    VALUES ($1, $2, 'DELEGATION_REVOKED', 'DELEGATION', $3, $4, 'ALLOW', $5, $6);
  `, [user.userId, user.organizationId, delegId, d.case_id, req.ip, req.headers['user-agent']]);
    return res.json({ success: true, message: 'Delegation revoked successfully' });
});
exports.default = router;
