import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';
import { appendLedgerBlock } from '../services/ledger';

const router = Router();

// GET /api/cases
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const { status, year, search } = req.query;

  let queryText = `
    SELECT DISTINCT c.id, c.fir_number, c.case_type, c.legacy_fir_number, c.year,
           c.title, c.description, c.incident_date, c.incident_location, c.status,
           c.is_legacy, c.created_at,
           o.name as originating_org_name, o.code as originating_org_code,
           u.display_name as lead_investigator_name
    FROM cases c
    JOIN organization_nodes o ON c.originating_organization_id = o.id
    LEFT JOIN users u ON c.lead_investigator_id = u.id
    LEFT JOIN case_agency_participation cap ON c.id = cap.case_id
    LEFT JOIN delegated_access da ON c.id = da.case_id AND da.granted_to_user_id = $1 AND da.status = 'ACTIVE' AND NOW() BETWEEN da.starts_at AND da.expires_at
    WHERE (
      -- Master Admin has visibility
      $2 IN ('MASTER_ADMIN', 'SYSTEM_MASTER_ADMIN')
      -- Originating agency in user's vertical subtree
      OR o.hierarchy_path = $3 OR o.hierarchy_path LIKE $3 || '.%'
      -- Cross-agency participation grant
      OR cap.organization_id = $4
      -- Active temporary delegation
      OR da.id IS NOT NULL
    )
  `;

  const params: any[] = [user.userId, user.roleId, user.organizationPath, user.organizationId];

  if (status) {
    params.push(status);
    queryText += ` AND c.status = $${params.length}`;
  }
  if (year) {
    params.push(parseInt(year as string, 10));
    queryText += ` AND c.year = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    queryText += ` AND (c.fir_number ILIKE $${params.length} OR c.title ILIKE $${params.length} OR c.description ILIKE $${params.length})`;
  }

  queryText += ` ORDER BY c.created_at DESC;`;

  const casesRes = await query(queryText, params);
  return res.json({ cases: casesRes.rows });
});

// POST /api/cases (New FIR or Legacy Case Creation)
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const {
    caseType, // 'NEW_FIR' | 'LEGACY_FIR'
    title,
    description,
    incidentDate,
    incidentLocation,
    originatingOrganizationId,
    leadInvestigatorId,
    legacyFirNumber,
    firData,
    confirmDuplicateOverride,
  } = req.body;

  const targetOrgId = originatingOrganizationId || user.organizationId;

  // 1. Authorize Case Creation
  const authz = await authorize(user, 'CASE_CREATE', {
    type: 'CASE',
    owningOrgId: targetOrgId,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  if (!title || !firData?.complainantName || !firData?.firContent) {
    return res.status(400).json({ error: 'Validation Error', message: 'Missing required case or FIR fields' });
  }

  const year = new Date().getFullYear();

  // 2. Fetch Originating Organization Details
  const orgRes = await query(`SELECT code, name FROM organization_nodes WHERE id = $1;`, [targetOrgId]);
  if (orgRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Originating organization not found' });
  }
  const orgCode = orgRes.rows[0].code;

  let officialFirNumber = '';
  let isLegacy = false;

  if (caseType === 'LEGACY_FIR') {
    isLegacy = true;
    if (!legacyFirNumber) {
      return res.status(400).json({ error: 'Validation Error', message: 'Legacy FIR number is required for legacy cases' });
    }
    officialFirNumber = `LEGACY-${legacyFirNumber}/${year}/${orgCode}`;

    // Duplicate Detection for Legacy FIRs
    const dupRes = await query(`
      SELECT id, fir_number, title, created_at FROM cases
      WHERE originating_organization_id = $1 AND legacy_fir_number = $2;
    `, [targetOrgId, legacyFirNumber]);

    if (dupRes.rows.length > 0 && !confirmDuplicateOverride) {
      return res.status(409).json({
        error: 'Duplicate Warning',
        warning: true,
        message: `Potential duplicate detected! A legacy case with FIR number '${legacyFirNumber}' already exists in this organization.`,
        existingCase: dupRes.rows[0],
      });
    }
  } else {
    // Generate sequential official FIR number
    const countRes = await query(`
      SELECT COUNT(*) as count FROM cases
      WHERE originating_organization_id = $1 AND year = $2;
    `, [targetOrgId, year]);
    const seq = (parseInt(countRes.rows[0].count, 10) + 1).toString().padStart(4, '0');
    officialFirNumber = `${seq}/${year}/${orgCode}`;
  }

  try {
    // Steps 3-7 (+ ledger anchor) commit atomically: a case can never exist
    // without its FIR, participation, timeline, audit and ledger records.
    const createdCase = await withTransaction(async (tx) => {
      // 3. Create Case Record
      const caseRes = await tx.query(`
        INSERT INTO cases (
          fir_number, case_type, legacy_fir_number, year, originating_organization_id,
          lead_investigator_id, title, description, incident_date, incident_location,
          status, is_legacy, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'UNDER_INVESTIGATION', $11, $12
        ) RETURNING *;
      `, [
        officialFirNumber, caseType || 'NEW_FIR', legacyFirNumber || null, year,
        targetOrgId, leadInvestigatorId || user.userId, title, description || '',
        incidentDate || new Date(), incidentLocation || '', isLegacy, user.userId
      ]);

      const created = caseRes.rows[0];

      // 4. Initial Case Agency Participation (Originating Unit)
      await tx.query(`
        INSERT INTO case_agency_participation (case_id, organization_id, agency_branch, access_role)
        VALUES ($1, $2, $3, 'ORIGINATING_AGENCY');
      `, [created.id, targetOrgId, user.agencyBranch]);

      // 5. Insert FIR Record
      await tx.query(`
        INSERT INTO firs (
          case_id, registration_date, complainant_name, complainant_contact, complainant_address,
          acts_and_sections, general_diary_reference, fir_content
        ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7);
      `, [
        created.id,
        firData.complainantName,
        firData.complainantContact || '',
        firData.complainantAddress || '',
        JSON.stringify(firData.actsAndSections || [{ act: 'Bharatiya Nyaya Sanhita, 2023', sections: ['General Cognizance'] }]),
        firData.generalDiaryReference || '',
        firData.firContent
      ]);

      // 6. Record in Case Timeline
      await tx.query(`
        INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
        VALUES ($1, 'CASE_CREATED', 'FIR Registered & Case Workspace Initialized', $2, $3, $4, 'CASE', $1);
      `, [created.id, `FIR ${officialFirNumber} registered by ${user.displayName}`, user.userId, targetOrgId]);

      // 7. Audit Log
      await tx.query(`
        INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
        VALUES ($1, $2, 'CASE_CREATED', 'CASE', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
      `, [user.userId, targetOrgId, created.id, created.id, req.ip, req.headers['user-agent'], JSON.stringify({ fir: officialFirNumber, type: caseType })]);

      // 8. Anchor an integrity-ledger block for this registration.
      await appendLedgerBlock(tx, {
        eventType: 'CASE_CREATED',
        refTable: 'cases',
        refId: created.id,
        caseId: created.id,
        orgId: targetOrgId,
        bodyId: user.bodyId || user.agencyBranch,
        payload: {
          firNumber: officialFirNumber,
          caseType: caseType || 'NEW_FIR',
          originatingOrgId: targetOrgId,
          createdBy: user.userId,
          year,
        },
      });

      return created;
    });

    return res.status(201).json({ success: true, case: createdCase });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'FIR number already registered for this organization and year' });
    }
    console.error('Case creation error:', err);
    return res.status(500).json({ error: 'Server Error', message: 'Failed to create case' });
  }
});

// GET /api/cases/:id (Comprehensive Case Workspace Data)
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const caseId = req.params.id;

  // Retrieve case
  const caseRes = await query(`
    SELECT c.*, o.name as originating_org_name, o.code as originating_org_code, o.agency_branch as originating_branch,
           u.display_name as lead_investigator_name, u.badge_number as lead_investigator_badge
    FROM cases c
    JOIN organization_nodes o ON c.originating_organization_id = o.id
    LEFT JOIN users u ON c.lead_investigator_id = u.id
    WHERE c.id = $1;
  `, [caseId]);

  if (caseRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
  }

  const caseData = caseRes.rows[0];

  // Authorize Case Read
  const authz = await authorize(user, 'CASE_READ', {
    type: 'CASE',
    id: caseId,
    owningOrgId: caseData.originating_organization_id,
    caseId,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  // Load FIR Data
  const firRes = await query(`SELECT * FROM firs WHERE case_id = $1;`, [caseId]);

  // Load Agency Participation
  const partRes = await query(`
    SELECT cap.id, cap.agency_branch, cap.access_role, cap.granted_at,
           o.name as org_name, o.code as org_code
    FROM case_agency_participation cap
    JOIN organization_nodes o ON cap.organization_id = o.id
    WHERE cap.case_id = $1
    ORDER BY cap.granted_at ASC;
  `, [caseId]);

  // Determine authorized tabs for the frontend UI based on role and agency branch
  const tabs = {
    overview: true,
    fir: user.permissions.includes('FIR_READ'),
    persons: user.permissions.includes('CASE_READ'),
    investigation: user.permissions.includes('INVESTIGATION_READ') && user.agencyBranch !== 'FORENSICS',
    panchnama: user.permissions.includes('INVESTIGATION_READ') && user.agencyBranch !== 'FORENSICS',
    evidence: user.permissions.includes('EVIDENCE_READ'),
    forensics: user.permissions.includes('CASE_READ'),
    court: user.permissions.includes('CASE_READ'),
    chargesheet: user.permissions.includes('INVESTIGATION_READ') && user.agencyBranch !== 'FORENSICS',
    documents: user.permissions.includes('DOCUMENT_READ'),
    timeline: true,
    audit: user.permissions.includes('AUDIT_READ') || user.roleId === 'MASTER_ADMIN',
  };

  return res.json({
    case: caseData,
    fir: firRes.rows[0] || null,
    participatingAgencies: partRes.rows,
    authorizedTabs: tabs,
  });
});

// PUT /api/cases/:id/status
router.put('/:id/status', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const caseId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['REGISTERED', 'UNDER_INVESTIGATION', 'CHARGESHEETED', 'TRIAL_IN_PROGRESS', 'DISPOSED', 'CLOSED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid case status' });
  }

  const caseRes = await query(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
  if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Case not found' });

  const authz = await authorize(user, 'CASE_UPDATE', {
    type: 'CASE',
    id: caseId,
    owningOrgId: caseRes.rows[0].originating_organization_id,
    caseId,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  await query(`UPDATE cases SET status = $1, updated_at = NOW() WHERE id = $2;`, [status, caseId]);

  await query(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'CASE_STATUS_UPDATED', 'Case Lifecycle Status Updated', $2, $3, $4, 'CASE', $1);
  `, [caseId, `Status updated to ${status} by ${user.displayName}`, user.userId, user.organizationId]);

  await query(`
    INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
    VALUES ($1, $2, 'CASE_STATUS_UPDATED', 'CASE', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
  `, [user.userId, user.organizationId, caseId, caseId, req.ip, req.headers['user-agent'], JSON.stringify({ status })]);

  return res.json({ success: true, message: `Status updated to ${status}` });
});

export default router;
