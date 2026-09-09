import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';

const router = Router();

// GET /api/cases/:id/court
router.get('/cases/:id/court', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const caseId = req.params.id;

  const caseRes = await query(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
  if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Case not found' });

  const authz = await authorize(user, 'CASE_READ', {
    type: 'COURT',
    caseId,
    owningOrgId: caseRes.rows[0].originating_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const courtCaseRes = await query(`
    SELECT cc.*, o.name as court_organization_name, o.code as court_organization_code
    FROM court_cases cc
    JOIN organization_nodes o ON cc.court_organization_id = o.id
    WHERE cc.case_id = $1;
  `, [caseId]);

  if (courtCaseRes.rows.length === 0) {
    return res.json({ courtCase: null, proceedings: [], orders: [], judgements: [] });
  }

  const cc = courtCaseRes.rows[0];

  const [proceedings, orders, judgements] = await Promise.all([
    query(`
      SELECT cp.*, u.display_name as recorded_by_name
      FROM court_proceedings cp
      JOIN users u ON cp.recorded_by_id = u.id
      WHERE cp.court_case_id = $1
      ORDER BY cp.hearing_date DESC;
    `, [cc.id]),
    query(`
      SELECT co.*, u.display_name as issued_by_name
      FROM court_orders co
      JOIN users u ON co.issued_by_id = u.id
      WHERE co.court_case_id = $1
      ORDER BY co.order_date DESC;
    `, [cc.id]),
    query(`
      SELECT cj.*, u.display_name as pronounced_by_name
      FROM court_judgements cj
      JOIN users u ON cj.pronounced_by_id = u.id
      WHERE cj.court_case_id = $1;
    `, [cc.id]),
  ]);

  return res.json({
    courtCase: cc,
    proceedings: proceedings.rows,
    orders: orders.rows,
    judgements: judgements.rows,
  });
});

// POST /api/cases/:id/court (Register Court Case)
router.post('/cases/:id/court', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const caseId = req.params.id;
  const { courtOrganizationId, cnrNumber, courtCaseType, courtCaseNumber, presidingJudgeName, filingDate } = req.body;

  if (!courtOrganizationId || !cnrNumber || !courtCaseType || !courtCaseNumber) {
    return res.status(400).json({ error: 'Validation Error', message: 'Court organization, CNR number, case type, and case number are required' });
  }

  const caseRes = await query(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
  if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Case not found' });

  const authz = await authorize(user, 'COURT_CREATE', {
    type: 'COURT',
    caseId,
    owningOrgId: courtOrganizationId,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  try {
    const ccRes = await query(`
      INSERT INTO court_cases (
        case_id, court_organization_id, cnr_number, court_case_type, court_case_number,
        filing_date, presiding_judge_name, current_stage, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'COGNIZANCE', 'PENDING')
      RETURNING *;
    `, [caseId, courtOrganizationId, cnrNumber, courtCaseType, courtCaseNumber, filingDate || new Date(), presidingJudgeName || '']);

    // Grant case agency participation to Court
    await query(`
      INSERT INTO case_agency_participation (case_id, organization_id, agency_branch, access_role)
      VALUES ($1, $2, 'JUDICIARY', 'TRIAL_COURT')
      ON CONFLICT DO NOTHING;
    `, [caseId, courtOrganizationId]);

    // Update case status to TRIAL_IN_PROGRESS
    await query(`UPDATE cases SET status = 'TRIAL_IN_PROGRESS', updated_at = NOW() WHERE id = $1;`, [caseId]);

    // Timeline event
    await query(`
      INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
      VALUES ($1, 'COURT_CASE_CREATED', 'Court Trial Case Instituted', $2, $3, $4, 'COURT', $5);
    `, [caseId, `CNR: ${cnrNumber} (${courtCaseNumber}) instituted by ${user.displayName}`, user.userId, courtOrganizationId, ccRes.rows[0].id]);

    return res.status(201).json({ success: true, courtCase: ccRes.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'CNR number already exists' });
    }
    return res.status(500).json({ error: 'Server Error', message: 'Failed to register court case' });
  }
});

// POST /api/court/cases/:id/hearings
router.post('/cases/:id/hearings', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const courtCaseId = req.params.id;
  const { hearingDate, businessConducted, nextDate, purposeOfNextHearing } = req.body;

  if (!businessConducted) {
    return res.status(400).json({ error: 'Validation Error', message: 'Business conducted is required' });
  }

  const ccRes = await query(`SELECT case_id, court_organization_id FROM court_cases WHERE id = $1;`, [courtCaseId]);
  if (ccRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Court case not found' });
  const cc = ccRes.rows[0];

  const authz = await authorize(user, 'COURT_HEARING_RECORD', {
    type: 'COURT',
    id: courtCaseId,
    caseId: cc.case_id,
    owningOrgId: cc.court_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const pRes = await query(`
    INSERT INTO court_proceedings (court_case_id, hearing_date, business_conducted, next_date, purpose_of_next_hearing, recorded_by_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `, [courtCaseId, hearingDate || new Date(), businessConducted, nextDate || null, purposeOfNextHearing || '', user.userId]);

  await query(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'HEARING_RECORDED', 'Trial Hearing Daily Order Recorded', $2, $3, $4, 'COURT_PROCEEDING', $5);
  `, [cc.case_id, `Proceeding recorded by ${user.displayName}. Next Date: ${nextDate ? new Date(nextDate).toDateString() : 'N/A'}`, user.userId, cc.court_organization_id, pRes.rows[0].id]);

  return res.status(201).json({ success: true, proceeding: pRes.rows[0] });
});

// POST /api/court/cases/:id/orders
router.post('/cases/:id/orders', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const courtCaseId = req.params.id;
  const { orderType, summary, orderDate } = req.body;

  if (!orderType || !summary) {
    return res.status(400).json({ error: 'Validation Error', message: 'Order type and summary are required' });
  }

  const ccRes = await query(`SELECT case_id, court_organization_id FROM court_cases WHERE id = $1;`, [courtCaseId]);
  if (ccRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Court case not found' });
  const cc = ccRes.rows[0];

  const authz = await authorize(user, 'COURT_ORDER_ISSUE', {
    type: 'COURT',
    id: courtCaseId,
    caseId: cc.case_id,
    owningOrgId: cc.court_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const oRes = await query(`
    INSERT INTO court_orders (court_case_id, order_date, order_type, summary, issued_by_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `, [courtCaseId, orderDate || new Date(), orderType, summary, user.userId]);

  await query(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'ORDER_ISSUED', 'Judicial Order Pronounced', $2, $3, $4, 'COURT_ORDER', $5);
  `, [cc.case_id, `Order (${orderType}) issued by ${user.displayName}`, user.userId, cc.court_organization_id, oRes.rows[0].id]);

  return res.status(201).json({ success: true, order: oRes.rows[0] });
});

// POST /api/court/cases/:id/judgement
router.post('/cases/:id/judgement', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const courtCaseId = req.params.id;
  const { verdict, sentencesAwarded, judgementSummary, judgementDate } = req.body;

  if (!verdict || !judgementSummary) {
    return res.status(400).json({ error: 'Validation Error', message: 'Verdict and judgement summary are required' });
  }

  const ccRes = await query(`SELECT case_id, court_organization_id FROM court_cases WHERE id = $1;`, [courtCaseId]);
  if (ccRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Court case not found' });
  const cc = ccRes.rows[0];

  const authz = await authorize(user, 'COURT_JUDGEMENT', {
    type: 'COURT',
    id: courtCaseId,
    caseId: cc.case_id,
    owningOrgId: cc.court_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const jRes = await query(`
    INSERT INTO court_judgements (court_case_id, judgement_date, verdict, sentences_awarded, judgement_summary, pronounced_by_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `, [courtCaseId, judgementDate || new Date(), verdict, JSON.stringify(sentencesAwarded || []), judgementSummary, user.userId]);

  // Update court case status to DISPOSED
  await query(`UPDATE court_cases SET status = 'DISPOSED', current_stage = 'JUDGEMENT', updated_at = NOW() WHERE id = $1;`, [courtCaseId]);
  await query(`UPDATE cases SET status = 'DISPOSED', updated_at = NOW() WHERE id = $1;`, [cc.case_id]);

  await query(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'JUDGEMENT_CREATED', 'Final Trial Judgement Pronounced', $2, $3, $4, 'COURT_JUDGEMENT', $5);
  `, [cc.case_id, `Verdict: ${verdict} pronounced by ${user.displayName}`, user.userId, cc.court_organization_id, jRes.rows[0].id]);

  return res.status(201).json({ success: true, judgement: jRes.rows[0] });
});

export default router;
