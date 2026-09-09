"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../services/db");
const auth_1 = require("../services/auth");
const authorization_1 = require("../services/authorization");
const router = (0, express_1.Router)();
// GET /api/cases/:id/investigation
router.get('/:id/investigation', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'INVESTIGATION_READ', {
        type: 'INVESTIGATION',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    // Fetch all investigation sub-components
    const [persons, diary, panchnamas, witnesses, chargesheet] = await Promise.all([
        (0, db_1.query)(`
      SELECT cp.id, cp.role_in_case, cp.custody_status, cp.arrest_date, cp.notes,
             p.id as person_id, p.full_name, p.alias, p.id_proof_type, p.id_proof_number, p.phone
      FROM case_persons cp
      JOIN persons p ON cp.person_id = p.id
      WHERE cp.case_id = $1
      ORDER BY cp.created_at ASC;
    `, [caseId]),
        (0, db_1.query)(`
      SELECT i.*, u.display_name as officer_name, u.badge_number as officer_badge
      FROM investigations i
      JOIN users u ON i.officer_id = u.id
      WHERE i.case_id = $1
      ORDER BY i.diary_entry_number ASC;
    `, [caseId]),
        (0, db_1.query)(`
      SELECT p.*, u.display_name as conducted_by_name
      FROM panchnamas p
      JOIN users u ON p.conducted_by_id = u.id
      WHERE p.case_id = $1
      ORDER BY p.conducted_at DESC;
    `, [caseId]),
        (0, db_1.query)(`
      SELECT w.*, p.full_name as witness_name, u.display_name as recorded_by_name
      FROM witness_statements w
      JOIN persons p ON w.witness_person_id = p.id
      JOIN users u ON w.recorded_by_id = u.id
      WHERE w.case_id = $1
      ORDER BY w.statement_date DESC;
    `, [caseId]),
        (0, db_1.query)(`
      SELECT cs.*, u.display_name as submitting_officer_name, o.name as target_court_name
      FROM chargesheets cs
      JOIN users u ON cs.submitting_officer_id = u.id
      LEFT JOIN organization_nodes o ON cs.target_court_id = o.id
      WHERE cs.case_id = $1;
    `, [caseId]),
    ]);
    return res.json({
        persons: persons.rows,
        caseDiary: diary.rows,
        panchnamas: panchnamas.rows,
        witnessStatements: witnesses.rows,
        chargesheet: chargesheet.rows[0] || null,
    });
});
// POST /api/cases/:id/persons
router.post('/:id/persons', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const { fullName, alias, idProofType, idProofNumber, gender, phone, roleInCase, custodyStatus, arrestDate, notes } = req.body;
    if (!fullName || !roleInCase) {
        return res.status(400).json({ error: 'Validation Error', message: 'Name and role in case are required' });
    }
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'INVESTIGATION_CREATE', {
        type: 'INVESTIGATION',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    const pRes = await (0, db_1.query)(`
    INSERT INTO persons (full_name, alias, id_proof_type, id_proof_number, gender, phone)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id;
  `, [fullName, alias || null, idProofType || null, idProofNumber || null, gender || null, phone || null]);
    const personId = pRes.rows[0].id;
    const cpRes = await (0, db_1.query)(`
    INSERT INTO case_persons (case_id, person_id, role_in_case, custody_status, arrest_date, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `, [caseId, personId, roleInCase, custodyStatus || 'NONE', arrestDate || null, notes || null]);
    await (0, db_1.query)(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'PERSON_RECORDED', 'Person Linked to Investigation', $2, $3, $4, 'PERSON', $5);
  `, [caseId, `${roleInCase}: ${fullName} recorded by ${user.displayName}`, user.userId, user.organizationId, personId]);
    return res.status(201).json({ success: true, casePerson: cpRes.rows[0] });
});
// POST /api/cases/:id/diary
router.post('/:id/diary', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'INVESTIGATION_CREATE', {
        type: 'INVESTIGATION',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    const { entryDate, locationVisited } = req.body;
    const details = req.body.investigationDetails || req.body.observations;
    if (!details) {
        return res.status(400).json({ error: 'Validation Error', message: 'Investigation details are required' });
    }
    // Sequential diary entry number
    const countRes = await (0, db_1.query)(`SELECT COUNT(*) as count FROM investigations WHERE case_id = $1;`, [caseId]);
    const entryNum = parseInt(countRes.rows[0].count, 10) + 1;
    const diaryRes = await (0, db_1.query)(`
    INSERT INTO investigations (case_id, diary_entry_number, entry_date, location_visited, investigation_details, officer_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `, [caseId, entryNum, entryDate || new Date(), locationVisited || '', details, user.userId]);
    await (0, db_1.query)(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'CASE_DIARY_ENTRY', $2, $3, $4, $5, 'INVESTIGATION', $6);
  `, [caseId, `Case Diary Entry #${entryNum}`, `Recorded at ${locationVisited || 'Station'} by ${user.displayName}`, user.userId, user.organizationId, diaryRes.rows[0].id]);
    return res.status(201).json({ success: true, diaryEntry: diaryRes.rows[0] });
});
// POST /api/cases/:id/panchnama
router.post('/:id/panchnama', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const { panchnamaType, location, panchWitnesses, findingsSummary, conductedAt } = req.body;
    if (!panchnamaType || !location || !findingsSummary) {
        return res.status(400).json({ error: 'Validation Error', message: 'Panchnama type, location, and findings summary are required' });
    }
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'INVESTIGATION_CREATE', {
        type: 'INVESTIGATION',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    const pRes = await (0, db_1.query)(`
    INSERT INTO panchnamas (case_id, panchnama_type, location, panch_witnesses, findings_summary, conducted_at, conducted_by_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `, [
        caseId, panchnamaType, location,
        JSON.stringify(panchWitnesses || []),
        findingsSummary,
        conductedAt || new Date(),
        user.userId
    ]);
    await (0, db_1.query)(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'PANCHNAMA_RECORDED', $2, $3, $4, $5, 'PANCHNAMA', $6);
  `, [caseId, `${panchnamaType} Panchnama Recorded`, `Conducted at ${location} by ${user.displayName}`, user.userId, user.organizationId, pRes.rows[0].id]);
    return res.status(201).json({ success: true, panchnama: pRes.rows[0] });
});
// POST /api/cases/:id/witnesses
router.post('/:id/witnesses', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const { witnessPersonId, statementText, statementDate } = req.body;
    if (!witnessPersonId || !statementText) {
        return res.status(400).json({ error: 'Validation Error', message: 'Witness person and statement text are required' });
    }
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'INVESTIGATION_CREATE', {
        type: 'INVESTIGATION',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    const wRes = await (0, db_1.query)(`
    INSERT INTO witness_statements (case_id, witness_person_id, statement_text, statement_date, recorded_by_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `, [caseId, witnessPersonId, statementText, statementDate || new Date(), user.userId]);
    await (0, db_1.query)(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'WITNESS_STATEMENT_RECORDED', 'Witness Statement Recorded', $2, $3, $4, 'WITNESS', $5);
  `, [caseId, `Statement recorded by ${user.displayName}`, user.userId, user.organizationId, wRes.rows[0].id]);
    return res.status(201).json({ success: true, witnessStatement: wRes.rows[0] });
});
// POST /api/cases/:id/chargesheet
router.post('/:id/chargesheet', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const { chargesheetNumber, targetCourtId, accusedCharges, prosecutionWitnessList, briefFacts } = req.body;
    if (!chargesheetNumber || !targetCourtId || !briefFacts) {
        return res.status(400).json({ error: 'Validation Error', message: 'Chargesheet number, target court, and brief facts are required' });
    }
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'INVESTIGATION_UPDATE', {
        type: 'INVESTIGATION',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    const csRes = await (0, db_1.query)(`
    INSERT INTO chargesheets (case_id, chargesheetNumber, target_court_id, accused_charges, prosecution_witness_list, brief_facts, submitting_officer_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (case_id) DO UPDATE SET
      chargesheet_number = EXCLUDED.chargesheet_number,
      target_court_id = EXCLUDED.target_court_id,
      accused_charges = EXCLUDED.accused_charges,
      brief_facts = EXCLUDED.brief_facts
    RETURNING *;
  `, [
        caseId, chargesheetNumber, targetCourtId,
        JSON.stringify(accusedCharges || []),
        JSON.stringify(prosecutionWitnessList || []),
        briefFacts,
        user.userId
    ]);
    // Update case status to CHARGESHEETED
    await (0, db_1.query)(`UPDATE cases SET status = 'CHARGESHEETED', updated_at = NOW() WHERE id = $1;`, [caseId]);
    // Grant court participation
    await (0, db_1.query)(`
    INSERT INTO case_agency_participation (case_id, organization_id, agency_branch, access_role)
    VALUES ($1, $2, 'JUDICIARY', 'TRIAL_COURT')
    ON CONFLICT DO NOTHING;
  `, [caseId, targetCourtId]);
    await (0, db_1.query)(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'CHARGESHEET_SUBMITTED', 'Formal Police Report / Chargesheet Filed', $2, $3, $4, 'CHARGESHEET', $5);
  `, [caseId, `Chargesheet ${chargesheetNumber} submitted to court by ${user.displayName}`, user.userId, user.organizationId, csRes.rows[0].id]);
    return res.status(201).json({ success: true, chargesheet: csRes.rows[0] });
});
exports.default = router;
