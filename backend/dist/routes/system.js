"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../services/db");
const auth_1 = require("../services/auth");
const router = (0, express_1.Router)();
// GET /api/system/stats
router.get('/stats', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    // Scoped count queries
    const isMaster = user.roleId === 'MASTER_ADMIN';
    // Defence-in-depth: hierarchy_path is a dotted materialised path of org codes.
    // Reject anything outside that alphabet before it is used to build SQL text
    // (org codes are also strictly whitelisted at creation time in organizations.ts).
    if (!isMaster && !/^[A-Za-z0-9_.-]+$/.test(user.organizationPath || '')) {
        return res.status(400).json({ error: 'Bad Request', message: 'Invalid organization scope on session.' });
    }
    const safePath = (user.organizationPath || '').replace(/'/g, '');
    const orgFilter = isMaster ? '1=1' : `(o.hierarchy_path = '${safePath}' OR o.hierarchy_path LIKE '${safePath}.%')`;
    const [casesStats, evidenceStats, forensicStats, courtStats, userStats, orgStats, agencyStats] = await Promise.all([
        (0, db_1.query)(`
      SELECT 
        COUNT(*) as total_cases,
        COUNT(*) FILTER (WHERE c.status = 'UNDER_INVESTIGATION') as under_investigation,
        COUNT(*) FILTER (WHERE c.status = 'CHARGESHEETED') as chargesheeted,
        COUNT(*) FILTER (WHERE c.status = 'TRIAL_IN_PROGRESS') as in_trial,
        COUNT(*) FILTER (WHERE c.status = 'DISPOSED') as disposed
      FROM cases c
      JOIN organization_nodes o ON c.originating_organization_id = o.id
      WHERE ${orgFilter};
    `),
        (0, db_1.query)(`
      SELECT 
        COUNT(*) as total_evidence,
        COUNT(*) FILTER (WHERE e.status = 'IN_POLICE_CUSTODY') as in_police_custody,
        COUNT(*) FILTER (WHERE e.status = 'IN_FORENSIC_LAB') as in_forensic_lab,
        COUNT(*) FILTER (WHERE e.status = 'PRESENTED_IN_COURT') as in_court
      FROM evidence e
      JOIN organization_nodes o ON e.current_organization_id = o.id
      WHERE ${isMaster ? '1=1' : `(o.hierarchy_path = '${user.organizationPath}' OR o.hierarchy_path LIKE '${user.organizationPath}.%')`};
    `),
        (0, db_1.query)(`
      SELECT 
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE fs.status = 'SUBMITTED') as pending_examination,
        COUNT(*) FILTER (WHERE fs.status = 'REPORT_ISSUED') as reports_sealed
      FROM forensic_submissions fs
      JOIN organization_nodes o ON fs.target_forensic_org_id = o.id
      WHERE ${isMaster ? '1=1' : `(o.hierarchy_path = '${user.organizationPath}' OR o.hierarchy_path LIKE '${user.organizationPath}.%')`};
    `),
        (0, db_1.query)(`
      SELECT 
        COUNT(*) as total_court_cases,
        COUNT(*) FILTER (WHERE cc.status = 'PENDING') as pending_trials,
        COUNT(*) FILTER (WHERE cc.status = 'DISPOSED') as disposed_trials
      FROM court_cases cc
      JOIN organization_nodes o ON cc.court_organization_id = o.id
      WHERE ${isMaster ? '1=1' : `(o.hierarchy_path = '${user.organizationPath}' OR o.hierarchy_path LIKE '${user.organizationPath}.%')`};
    `),
        (0, db_1.query)(`
      SELECT COUNT(*) as total_users FROM users u
      JOIN organization_nodes o ON u.primary_organization_id = o.id
      WHERE ${orgFilter};
    `),
        (0, db_1.query)(`
      SELECT COUNT(*) as total_organizations FROM organization_nodes o
      WHERE ${orgFilter};
    `),
        (0, db_1.query)(`
      SELECT 
        o.agency_branch,
        COUNT(DISTINCT o.id) as total_nodes,
        COUNT(u.id) as total_personnel,
        COUNT(u.id) FILTER (WHERE u.is_layer_admin = TRUE) as layer_admins,
        COUNT(u.id) FILTER (WHERE u.status = 'ACTIVE') as active_personnel
      FROM organization_nodes o
      LEFT JOIN users u ON u.primary_organization_id = o.id
      WHERE ${orgFilter}
      GROUP BY o.agency_branch;
    `),
    ]);
    const agencyBodiesMap = {};
    for (const row of (agencyStats?.rows || [])) {
        agencyBodiesMap[row.agency_branch] = {
            totalNodes: parseInt(row.total_nodes, 10) || 0,
            totalPersonnel: parseInt(row.total_personnel, 10) || 0,
            layerAdmins: parseInt(row.layer_admins, 10) || 0,
            activePersonnel: parseInt(row.active_personnel, 10) || 0,
        };
    }
    // Recent activity events
    const recentEvents = await (0, db_1.query)(`
    SELECT t.id, t.event_type, t.title, t.description, t.occurred_at,
           c.fir_number, u.display_name as actor_name, o.code as org_code, o.agency_branch
    FROM case_timeline t
    JOIN cases c ON t.case_id = c.id
    JOIN users u ON t.actor_id = u.id
    JOIN organization_nodes o ON t.organization_id = o.id
    WHERE ${orgFilter}
    ORDER BY t.occurred_at DESC
    LIMIT 8;
  `);
    return res.json({
        cases: casesStats.rows[0],
        evidence: evidenceStats.rows[0],
        forensics: forensicStats.rows[0],
        court: courtStats.rows[0],
        usersCount: parseInt(userStats.rows[0].total_users, 10),
        orgsCount: parseInt(orgStats.rows[0].total_organizations, 10),
        agencyBodies: agencyBodiesMap,
        recentEvents: recentEvents.rows,
    });
});
// GET /api/system/status
router.get('/status', (req, res) => {
    return res.json({
        status: 'ONLINE',
        systemName: 'SECURE MULTI-AGENCY INVESTIGATION & CASE MANAGEMENT PLATFORM',
        jurisdiction: 'State of Gujarat / India',
        version: '2.4.0-institutional',
        database: 'PostgreSQL 16 (Drizzle Engine, Schema: investigation)',
        securityModel: 'Zero-Client-Trust RBAC with Subtree Sibling Isolation',
        timestamp: new Date().toISOString(),
    });
});
// GET /api/system/master/overview (Master Admin Apex Only)
router.get('/master/overview', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    if (user.roleId !== 'MASTER_ADMIN') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Master Administrator access required for apex system overview.',
        });
    }
    const bodiesRes = await (0, db_1.query)(`
    SELECT b.id, b.name, b.code,
           COUNT(DISTINCT o.id) as node_count,
           COUNT(DISTINCT u.id) as personnel_count,
           COUNT(DISTINCT u.id) FILTER (WHERE u.is_layer_admin = TRUE) as admin_count
    FROM organization_bodies b
    LEFT JOIN organization_nodes o ON o.body_id = b.id
    LEFT JOIN users u ON u.primary_organization_id = o.id
    GROUP BY b.id, b.name, b.code
    ORDER BY b.id;
  `);
    return res.json({
        success: true,
        apexAuthority: 'GUJARAT_STATE_JUSTICE_COMMAND',
        bodies: bodiesRes.rows,
    });
});
exports.default = router;
