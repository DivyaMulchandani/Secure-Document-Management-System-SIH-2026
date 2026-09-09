"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../services/db");
const auth_1 = require("../services/auth");
const authorization_1 = require("../services/authorization");
const router = (0, express_1.Router)();
// GET /api/audit
router.get('/', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const { action, result, caseId, limit } = req.query;
    const authz = await (0, authorization_1.authorize)(user, 'AUDIT_READ', { type: 'SYSTEM' }, {
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
    const params = [];
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
    const maxRows = Math.min(parseInt(limit, 10) || 100, 500);
    params.push(maxRows);
    queryText += ` ORDER BY a.timestamp DESC LIMIT $${params.length};`;
    const logs = await (0, db_1.query)(queryText, params);
    return res.json({ auditLogs: logs.rows });
});
exports.default = router;
