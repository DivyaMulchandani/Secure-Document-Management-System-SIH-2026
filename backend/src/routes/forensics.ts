import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';

const router = Router();

// GET /api/cases/:id/forensics
router.get('/cases/:id/forensics', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const caseId = req.params.id;

  const caseRes = await query(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
  if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Case not found' });

  const authz = await authorize(user, 'CASE_READ', {
    type: 'FORENSIC',
    caseId,
    owningOrgId: caseRes.rows[0].originating_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const submissions = await query(`
    SELECT fs.*,
           o_req.name as requesting_org_name, o_req.code as requesting_org_code,
           o_lab.name as target_lab_name, o_lab.code as target_lab_code,
           fr.id as report_id, fr.report_number, fr.summary_of_analysis, fr.formal_conclusion,
           fr.signed_at as report_signed_at, fr.status as report_status,
           u_rep.display_name as lead_examiner_name
    FROM forensic_submissions fs
    JOIN organization_nodes o_req ON fs.requesting_organization_id = o_req.id
    JOIN organization_nodes o_lab ON fs.target_forensic_org_id = o_lab.id
    LEFT JOIN forensic_reports fr ON fs.id = fr.submission_id
    LEFT JOIN users u_rep ON fr.lead_examiner_id = u_rep.id
    WHERE fs.case_id = $1
    ORDER BY fs.submitted_at DESC;
  `, [caseId]);

  return res.json({ submissions: submissions.rows });
});

// POST /api/cases/:id/forensics/submit
router.post('/cases/:id/forensics/submit', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const caseId = req.params.id;
  const { targetForensicOrgId, submissionMemoNumber, examinationRequested, scientificDivision } = req.body;

  if (!targetForensicOrgId || !submissionMemoNumber || !examinationRequested || !scientificDivision) {
    return res.status(400).json({ error: 'Validation Error', message: 'Target forensic lab, memo number, requested exam, and division are required' });
  }

  const caseRes = await query(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
  if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Case not found' });

  const authz = await authorize(user, 'FORENSIC_CREATE', {
    type: 'FORENSIC',
    caseId,
    owningOrgId: caseRes.rows[0].originating_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  // 1. Create Forensic Submission
  const subRes = await query(`
    INSERT INTO forensic_submissions (
      case_id, requesting_organization_id, target_forensic_org_id, submission_memo_number,
      examination_requested, scientific_division, status, submitted_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTED', NOW())
    RETURNING *;
  `, [caseId, user.organizationId, targetForensicOrgId, submissionMemoNumber, examinationRequested, scientificDivision]);

  // 2. Grant Case Agency Participation to Forensic Laboratory
  await query(`
    INSERT INTO case_agency_participation (case_id, organization_id, agency_branch, access_role)
    VALUES ($1, $2, 'FORENSICS', 'FORENSIC_EXAMINER_LAB')
    ON CONFLICT DO NOTHING;
  `, [caseId, targetForensicOrgId]);

  // 3. Timeline event
  await query(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'FORENSIC_SUBMITTED', 'Forensic Examination Memo Dispatched', $2, $3, $4, 'FORENSIC', $5);
  `, [caseId, `Memo ${submissionMemoNumber} for ${scientificDivision} submitted to lab`, user.userId, user.organizationId, subRes.rows[0].id]);

  // 4. Audit Log
  await query(`
    INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
    VALUES ($1, $2, 'FORENSIC_SUBMITTED', 'FORENSIC', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
  `, [user.userId, user.organizationId, subRes.rows[0].id, caseId, req.ip, req.headers['user-agent'], JSON.stringify({ division: scientificDivision, memo: submissionMemoNumber })]);

  return res.status(201).json({ success: true, submission: subRes.rows[0] });
});

// GET /api/forensics/submissions (Forensic Laboratory Inbox)
router.get('/submissions', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;

  const authz = await authorize(user, 'FORENSIC_EXAMINE', { type: 'FORENSIC' }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  let submissionsRes;
  if (user.roleId === 'MASTER_ADMIN') {
    submissionsRes = await query(`
      SELECT fs.*, c.fir_number, c.title as case_title,
             o_req.name as requesting_org_name, o_lab.name as target_lab_name,
             fr.report_number, fr.status as report_status
      FROM forensic_submissions fs
      JOIN cases c ON fs.case_id = c.id
      JOIN organization_nodes o_req ON fs.requesting_organization_id = o_req.id
      JOIN organization_nodes o_lab ON fs.target_forensic_org_id = o_lab.id
      LEFT JOIN forensic_reports fr ON fs.id = fr.submission_id
      ORDER BY fs.submitted_at DESC;
    `);
  } else {
    submissionsRes = await query(`
      SELECT fs.*, c.fir_number, c.title as case_title,
             o_req.name as requesting_org_name, o_lab.name as target_lab_name,
             fr.report_number, fr.status as report_status
      FROM forensic_submissions fs
      JOIN cases c ON fs.case_id = c.id
      JOIN organization_nodes o_req ON fs.requesting_organization_id = o_req.id
      JOIN organization_nodes o_lab ON fs.target_forensic_org_id = o_lab.id
      LEFT JOIN forensic_reports fr ON fs.id = fr.submission_id
      WHERE o_lab.hierarchy_path = $1 OR o_lab.hierarchy_path LIKE $1 || '.%'
         OR $1 LIKE o_lab.hierarchy_path || '.%'
      ORDER BY fs.submitted_at DESC;
    `, [user.organizationPath]);
  }

  return res.json({ submissions: submissionsRes.rows });
});

// POST /api/forensics/submissions/:id/reports (Issue & Seal Forensic Report)
router.post('/submissions/:id/reports', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const submissionId = req.params.id;
  const { reportNumber, summaryOfAnalysis, formalConclusion } = req.body;

  if (!reportNumber || !summaryOfAnalysis || !formalConclusion) {
    return res.status(400).json({ error: 'Validation Error', message: 'Report number, analysis summary, and formal conclusion are required' });
  }

  const subRes = await query(`
    SELECT fs.*, c.originating_organization_id
    FROM forensic_submissions fs
    JOIN cases c ON fs.case_id = c.id
    WHERE fs.id = $1;
  `, [submissionId]);

  if (subRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Submission not found' });
  const sub = subRes.rows[0];

  const authz = await authorize(user, 'FORENSIC_REPORT', {
    type: 'FORENSIC',
    id: submissionId,
    caseId: sub.case_id,
    owningOrgId: sub.target_forensic_org_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  try {
    const reportRes = await query(`
      INSERT INTO forensic_reports (
        submission_id, report_number, lead_examiner_id, summary_of_analysis,
        formal_conclusion, signed_at, status
      ) VALUES ($1, $2, $3, $4, $5, NOW(), 'FINAL_SEALED')
      RETURNING *;
    `, [submissionId, reportNumber, user.userId, summaryOfAnalysis, formalConclusion]);

    // Update submission status
    await query(`UPDATE forensic_submissions SET status = 'REPORT_ISSUED' WHERE id = $1;`, [submissionId]);

    // Record Timeline event
    await query(`
      INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
      VALUES ($1, 'FORENSIC_REPORT_CREATED', 'Forensic Scientific Report Sealed', $2, $3, $4, 'FORENSIC_REPORT', $5);
    `, [sub.case_id, `Formal Report ${reportNumber} sealed by ${user.displayName}`, user.userId, user.organizationId, reportRes.rows[0].id]);

    // Audit Log
    await query(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'FORENSIC_REPORT_CREATED', 'FORENSIC', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
    `, [user.userId, user.organizationId, reportRes.rows[0].id, sub.case_id, req.ip, req.headers['user-agent'], JSON.stringify({ report: reportNumber })]);

    return res.status(201).json({ success: true, report: reportRes.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'Report number already exists' });
    }
    return res.status(500).json({ error: 'Server Error', message: 'Failed to issue forensic report' });
  }
});

export default router;
