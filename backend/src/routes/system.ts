import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { requireAuth } from '../services/auth';
import { getSmtpConfig, saveSmtpConfig, testSmtpConnection } from '../services/mailer';

const router = Router();

// GET /api/system/stats
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;

  // Scoped count queries
  const isMaster = user.roleId === 'MASTER_ADMIN';
  const orgFilter = isMaster ? '1=1' : `(o.hierarchy_path = '${user.organizationPath}' OR o.hierarchy_path LIKE '${user.organizationPath}.%')`;

  const [casesStats, evidenceStats, forensicStats, courtStats, userStats, orgStats, agencyStats] = await Promise.all([
    query(`
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
    query(`
      SELECT 
        COUNT(*) as total_evidence,
        COUNT(*) FILTER (WHERE e.status = 'IN_POLICE_CUSTODY') as in_police_custody,
        COUNT(*) FILTER (WHERE e.status = 'IN_FORENSIC_LAB') as in_forensic_lab,
        COUNT(*) FILTER (WHERE e.status = 'PRESENTED_IN_COURT') as in_court
      FROM evidence e
      JOIN organization_nodes o ON e.current_organization_id = o.id
      WHERE ${isMaster ? '1=1' : `(o.hierarchy_path = '${user.organizationPath}' OR o.hierarchy_path LIKE '${user.organizationPath}.%')`};
    `),
    query(`
      SELECT 
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE fs.status = 'SUBMITTED') as pending_examination,
        COUNT(*) FILTER (WHERE fs.status = 'REPORT_ISSUED') as reports_sealed
      FROM forensic_submissions fs
      JOIN organization_nodes o ON fs.target_forensic_org_id = o.id
      WHERE ${isMaster ? '1=1' : `(o.hierarchy_path = '${user.organizationPath}' OR o.hierarchy_path LIKE '${user.organizationPath}.%')`};
    `),
    query(`
      SELECT 
        COUNT(*) as total_court_cases,
        COUNT(*) FILTER (WHERE cc.status = 'PENDING') as pending_trials,
        COUNT(*) FILTER (WHERE cc.status = 'DISPOSED') as disposed_trials
      FROM court_cases cc
      JOIN organization_nodes o ON cc.court_organization_id = o.id
      WHERE ${isMaster ? '1=1' : `(o.hierarchy_path = '${user.organizationPath}' OR o.hierarchy_path LIKE '${user.organizationPath}.%')`};
    `),
    query(`
      SELECT COUNT(*) as total_users FROM users u
      JOIN organization_nodes o ON u.primary_organization_id = o.id
      WHERE ${orgFilter};
    `),
    query(`
      SELECT COUNT(*) as total_organizations FROM organization_nodes o
      WHERE ${orgFilter};
    `),
    query(`
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

  const agencyBodiesMap: Record<string, any> = {};
  for (const row of (agencyStats?.rows || [])) {
    agencyBodiesMap[row.agency_branch] = {
      totalNodes: parseInt(row.total_nodes, 10) || 0,
      totalPersonnel: parseInt(row.total_personnel, 10) || 0,
      layerAdmins: parseInt(row.layer_admins, 10) || 0,
      activePersonnel: parseInt(row.active_personnel, 10) || 0,
    };
  }

  // Recent activity events
  const recentEvents = await query(`
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
router.get('/status', (req: Request, res: Response) => {
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
router.get('/master/overview', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;

  if (user.roleId !== 'MASTER_ADMIN') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Master Administrator access required for apex system overview.',
    });
  }

  const bodiesRes = await query(`
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

// GET /api/system/smtp/config - View current SMTP Relay Configuration (masked password)
router.get('/smtp/config', requireAuth, async (req: Request, res: Response) => {
  const config = await getSmtpConfig(true);
  return res.json({ success: true, config });
});

// POST /api/system/smtp/config - Save SMTP Relay Configuration
router.post('/smtp/config', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  if (!isMaster && !user.isLayerAdmin) {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'Master or Layer Administrator authority required to configure system SMTP relay.',
    });
  }

  const { mode, host, port, secure, user: smtpUser, pass, fromEmail, fromName } = req.body;

  try {
    const updated = await saveSmtpConfig({
      mode,
      host,
      port: port !== undefined ? Number(port) : undefined,
      secure: secure !== undefined ? Boolean(secure) : undefined,
      user: smtpUser,
      pass,
      fromEmail,
      fromName,
    });

    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata
      )
      VALUES ($1, $1, $2, $2, $3, 'SMTP_CONFIG_UPDATED', 'SYSTEM_CONFIG', 'SMTP_RELAY', 'ALLOW', $4, $5, json_build_object('mode', $6::text, 'host', $7::text, 'port', $8::int));
    `, [user.userId, user.organizationId, user.agencyBranch, req.ip, req.headers['user-agent'], updated.mode, updated.host, updated.port]);

    return res.json({
      success: true,
      message: `SMTP configuration updated successfully. Mode: ${updated.mode}.`,
      config: updated,
    });
  } catch (err: any) {
    console.error('Failed to save SMTP configuration:', err);
    return res.status(500).json({ error: 'Save Failed', message: err.message });
  }
});

// POST /api/system/smtp/test - Dispatch Live SMTP Connection Test & Diagnostic Email
router.post('/smtp/test', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const targetEmail = (req.body.targetEmail || user.email || '').trim();

  if (!targetEmail || !targetEmail.includes('@')) {
    return res.status(400).json({ error: 'Validation Error', message: 'Valid target email address is required for SMTP test transmission.' });
  }

  try {
    const testResult = await testSmtpConnection(targetEmail);

    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata
      )
      VALUES ($1, $1, $2, $2, $3, 'SMTP_TEST_DISPATCHED', 'SYSTEM_DIAGNOSTIC', 'SMTP_RELAY', $4, $5, $6, $7::jsonb);
    `, [
      user.userId,
      user.organizationId,
      user.agencyBranch,
      testResult.success ? 'ALLOW' : 'DENY',
      req.ip,
      req.headers['user-agent'],
      JSON.stringify({ targetEmail, success: testResult.success, latencyMs: testResult.diagnostics?.latencyMs })
    ]);

    return res.json(testResult);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `SMTP Diagnostic Error: ${err.message}`,
    });
  }
});

// GET /api/system/analytics/dashboard - Comprehensive Visual Analytics Telemetry
router.get('/analytics/dashboard', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  // 1. Ticket status counts
  const ticketStatusRes = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'PENDING_OTP') as pending_otp,
      COUNT(*) FILTER (WHERE status = 'VERIFIED') as verified,
      COUNT(*) FILTER (WHERE status = 'EXECUTED') as executed,
      COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected
    FROM update_tickets;
  `);

  // 2. Ticket action type distribution
  const actionTypeRes = await query(`
    SELECT action_type, COUNT(*) as count
    FROM update_tickets
    GROUP BY action_type
    ORDER BY count DESC;
  `);

  // 3. Ticket daily timeline (last 7 days)
  const ticketTimelineRes = await query(`
    SELECT 
      TO_CHAR(d.day, 'YYYY-MM-DD') as date,
      TO_CHAR(d.day, 'Dy') as day_label,
      COUNT(t.id) as generated_count,
      COUNT(t.id) FILTER (WHERE t.status = 'EXECUTED') as executed_count
    FROM (
      SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval)::date as day
    ) d
    LEFT JOIN update_tickets t ON DATE(t.created_at) = d.day
    GROUP BY d.day
    ORDER BY d.day ASC;
  `);

  // 4. Sovereign Agency distribution
  const agencyDistRes = await query(`
    SELECT 
      b.id, b.name, b.code,
      COUNT(DISTINCT o.id) as office_count,
      COUNT(DISTINCT u.id) as personnel_count,
      COUNT(DISTINCT u.id) FILTER (WHERE u.is_layer_admin = TRUE OR r.id LIKE '%ADMIN%') as admin_count,
      COUNT(DISTINCT c.id) as case_count
    FROM organization_bodies b
    LEFT JOIN organization_nodes o ON o.body_id = b.id
    LEFT JOIN users u ON u.primary_organization_id = o.id
    LEFT JOIN roles r ON u.primary_role_id = r.id
    LEFT JOIN cases c ON c.originating_organization_id = o.id
    GROUP BY b.id, b.name, b.code
    ORDER BY CASE b.id WHEN 'POLICE' THEN 1 WHEN 'JUDICIARY' THEN 2 WHEN 'FORENSICS' THEN 3 ELSE 4 END;
  `);

  // 5. Hierarchy Depth distribution (Level 1 to Level 5)
  const levelDistRes = await query(`
    SELECT 
      o.level,
      CASE o.level
        WHEN 1 THEN 'Layer 1: Apex Leadership'
        WHEN 2 THEN 'Layer 2: Zonal / Range Command'
        WHEN 3 THEN 'Layer 3: Division / District'
        WHEN 4 THEN 'Layer 4: Police Station / Unit'
        ELSE 'Layer ' || o.level || ': Outposts & Beats'
      END as level_label,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE o.body_id = 'POLICE') as police_count,
      COUNT(*) FILTER (WHERE o.body_id = 'JUDICIARY') as judiciary_count,
      COUNT(*) FILTER (WHERE o.body_id = 'FORENSICS') as forensics_count
    FROM organization_nodes o
    GROUP BY o.level
    ORDER BY o.level ASC;
  `);

  // 6. Security Gate Telemetry (Audit logs)
  const securityGateRes = await query(`
    SELECT
      COUNT(*) FILTER (WHERE action IN ('LOGIN', 'LOGIN_OTP_REQUESTED')) as total_auth_events,
      COUNT(*) FILTER (WHERE action = 'LOGIN' AND result = 'ALLOW') as successful_logins,
      COUNT(*) FILTER (WHERE action = 'LOGIN_FAILURE' OR action = 'LOGIN_OTP_DENIED') as failed_attempts,
      COUNT(*) FILTER (WHERE action = 'LOGIN_LOCKOUT_DENIED') as lockout_events,
      COUNT(*) FILTER (WHERE action = 'TICKET_EXECUTED') as executed_tickets_total
    FROM audit_logs
    WHERE timestamp >= NOW() - INTERVAL '30 days';
  `);

  // 7. Recent ticket activity
  const recentTicketsRes = await query(`
    SELECT 
      t.id, t.ticket_number, t.action_type, t.status, t.requester_name, t.requester_email,
      t.created_at, t.executed_at, o.name as org_name
    FROM update_tickets t
    LEFT JOIN organization_nodes o ON t.organization_id = o.id
    ORDER BY t.created_at DESC
    LIMIT 6;
  `);

  const tStatus = ticketStatusRes.rows[0];
  const secGate = securityGateRes.rows[0];

  const totalTickets = parseInt(tStatus.total || '0', 10);
  const executedTickets = parseInt(tStatus.executed || '0', 10);
  const complianceRate = totalTickets > 0 ? Math.round((executedTickets / totalTickets) * 100) : 100;

  return res.json({
    success: true,
    summary: {
      totalTickets,
      executedTickets,
      pendingOtpTickets: parseInt(tStatus.pending_otp || '0', 10),
      rejectedTickets: parseInt(tStatus.rejected || '0', 10),
      complianceRate,
      successfulLogins: parseInt(secGate.successful_logins || '0', 10),
      failedAttempts: parseInt(secGate.failed_attempts || '0', 10),
      lockouts: parseInt(secGate.lockout_events || '0', 10),
    },
    ticketStatus: [
      { name: 'Executed', value: executedTickets, color: '#059669' },
      { name: 'Pending OTP', value: parseInt(tStatus.pending_otp || '0', 10), color: '#d97706' },
      { name: 'Rejected', value: parseInt(tStatus.rejected || '0', 10), color: '#dc2626' },
    ],
    actionTypes: actionTypeRes.rows.map(r => ({
      action: r.action_type,
      count: parseInt(r.count, 10),
    })),
    timeline: ticketTimelineRes.rows.map(r => ({
      date: r.date,
      day: r.day_label,
      generated: parseInt(r.generated_count, 10),
      executed: parseInt(r.executed_count, 10),
    })),
    agencyDistribution: agencyDistRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      offices: parseInt(r.office_count, 10),
      personnel: parseInt(r.personnel_count, 10),
      admins: parseInt(r.admin_count, 10),
      cases: parseInt(r.case_count, 10),
    })),
    hierarchyLevels: levelDistRes.rows.map(r => ({
      level: r.level,
      label: r.level_label,
      total: parseInt(r.count, 10),
      police: parseInt(r.police_count, 10),
      judiciary: parseInt(r.judiciary_count, 10),
      forensics: parseInt(r.forensics_count, 10),
    })),
    recentTickets: recentTicketsRes.rows,
  });
});

export default router;
