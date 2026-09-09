"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../services/db");
const auth_1 = require("../services/auth");
const authorization_1 = require("../services/authorization");
const router = (0, express_1.Router)();
// GET /api/cases/:id/evidence
router.get('/:id/evidence', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'EVIDENCE_READ', {
        type: 'EVIDENCE',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    const evRes = await (0, db_1.query)(`
    SELECT e.*, 
           u_col.display_name as collected_by_name,
           u_cust.display_name as current_custodian_name,
           o.name as current_organization_name, o.code as current_organization_code
    FROM evidence e
    JOIN users u_col ON e.collected_by_id = u_col.id
    JOIN users u_cust ON e.current_custodian_id = u_cust.id
    JOIN organization_nodes o ON e.current_organization_id = o.id
    WHERE e.case_id = $1
    ORDER BY e.collected_at DESC;
  `, [caseId]);
    return res.json({ evidence: evRes.rows });
});
// POST /api/cases/:id/evidence
router.post('/:id/evidence', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const { evidenceTag, category, description, collectedAt, collectionLocation, storageLocation, sealStatus } = req.body;
    if (!evidenceTag || !category || !description || !collectionLocation || !storageLocation) {
        return res.status(400).json({ error: 'Validation Error', message: 'Missing required evidence fields' });
    }
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'EVIDENCE_CREATE', {
        type: 'EVIDENCE',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    try {
        const evRes = await (0, db_1.query)(`
      INSERT INTO evidence (
        case_id, evidence_tag, category, description, collected_at, collected_by_id,
        collection_location, current_custodian_id, current_organization_id, storage_location,
        seal_status, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $6, $8, $9, $10, 'IN_POLICE_CUSTODY'
      ) RETURNING *;
    `, [
            caseId, evidenceTag, category, description, collectedAt || new Date(),
            user.userId, collectionLocation, user.organizationId, storageLocation, sealStatus || 'INTACT_AND_VERIFIED'
        ]);
        const ev = evRes.rows[0];
        // Record initial chain-of-custody event (COLLECTION)
        await (0, db_1.query)(`
      INSERT INTO evidence_custody_events (
        evidence_id, timestamp, from_user_id, from_organization_id, to_user_id, to_organization_id,
        action_type, reason, seal_condition
      ) VALUES (
        $1, NOW(), $2, $3, $2, $3, 'COLLECTION', 'Initial seizure and bagging at crime scene', $4
      );
    `, [ev.id, user.userId, user.organizationId, sealStatus || 'INTACT_AND_VERIFIED']);
        // Timeline event
        await (0, db_1.query)(`
      INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
      VALUES ($1, 'EVIDENCE_COLLECTED', 'Physical Evidence Registered', $2, $3, $4, 'EVIDENCE', $5);
    `, [caseId, `Tag: ${evidenceTag} (${category}) collected by ${user.displayName}`, user.userId, user.organizationId, ev.id]);
        // Audit log
        await (0, db_1.query)(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'EVIDENCE_CREATED', 'EVIDENCE', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
    `, [user.userId, user.organizationId, ev.id, caseId, req.ip, req.headers['user-agent'], JSON.stringify({ tag: evidenceTag, category })]);
        return res.status(201).json({ success: true, evidence: ev });
    }
    catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Conflict', message: 'Evidence tag already registered for this case' });
        }
        return res.status(500).json({ error: 'Server Error', message: 'Failed to register evidence' });
    }
});
// POST /api/evidence/:id/transfer (Chain-of-Custody Handoff)
router.post('/:id/transfer', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const evidenceId = req.params.id;
    const { toUserId, toOrganizationId, actionType, reason, sealCondition } = req.body;
    if (!toUserId || !toOrganizationId || !actionType || !reason) {
        return res.status(400).json({ error: 'Validation Error', message: 'Recipient, destination organization, action type, and reason are required' });
    }
    const evRes = await (0, db_1.query)(`
    SELECT e.*, c.originating_organization_id
    FROM evidence e
    JOIN cases c ON e.case_id = c.id
    WHERE e.id = $1;
  `, [evidenceId]);
    if (evRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Evidence item not found' });
    const ev = evRes.rows[0];
    const authz = await (0, authorization_1.authorize)(user, 'EVIDENCE_TRANSFER', {
        type: 'EVIDENCE',
        id: evidenceId,
        caseId: ev.case_id,
        owningOrgId: ev.current_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    // Determine new status based on transfer destination
    const destOrgRes = await (0, db_1.query)(`SELECT agency_branch FROM organization_nodes WHERE id = $1;`, [toOrganizationId]);
    const destBranch = destOrgRes.rows[0]?.agency_branch;
    let newStatus = 'TRANSFERRED';
    if (destBranch === 'FORENSICS')
        newStatus = 'IN_FORENSIC_LAB';
    else if (destBranch === 'JUDICIARY')
        newStatus = 'PRESENTED_IN_COURT';
    else if (actionType === 'RETURN')
        newStatus = 'RETURNED';
    // 1. Insert Chain of Custody Event
    const custodyRes = await (0, db_1.query)(`
    INSERT INTO evidence_custody_events (
      evidence_id, timestamp, from_user_id, from_organization_id, to_user_id, to_organization_id,
      action_type, reason, seal_condition
    ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `, [
        evidenceId, user.userId, ev.current_organization_id,
        toUserId, toOrganizationId, actionType, reason, sealCondition || 'INTACT_AND_VERIFIED'
    ]);
    // 2. Update Evidence Current Custodian and Org
    await (0, db_1.query)(`
    UPDATE evidence
    SET current_custodian_id = $1, current_organization_id = $2,
        seal_status = $3, status = $4, updated_at = NOW()
    WHERE id = $5;
  `, [toUserId, toOrganizationId, sealCondition || 'INTACT_AND_VERIFIED', newStatus, evidenceId]);
    // 3. Record in Timeline
    await (0, db_1.query)(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'EVIDENCE_TRANSFERRED', 'Chain-of-Custody Transfer Executed', $2, $3, $4, 'EVIDENCE', $5);
  `, [ev.case_id, `Evidence ${ev.evidence_tag} transferred (${actionType}) to ${toOrganizationId}`, user.userId, user.organizationId, evidenceId]);
    // 4. Audit Log
    await (0, db_1.query)(`
    INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
    VALUES ($1, $2, 'EVIDENCE_TRANSFERRED', 'EVIDENCE', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
  `, [user.userId, user.organizationId, evidenceId, ev.case_id, req.ip, req.headers['user-agent'], JSON.stringify({ actionType, toOrg: toOrganizationId })]);
    return res.json({ success: true, custodyEvent: custodyRes.rows[0], newStatus });
});
// GET /api/evidence/:id/custody (Full Audit Chain of Custody)
router.get('/:id/custody', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const evidenceId = req.params.id;
    const evRes = await (0, db_1.query)(`
    SELECT e.id, e.case_id, c.originating_organization_id
    FROM evidence e
    JOIN cases c ON e.case_id = c.id
    WHERE e.id = $1;
  `, [evidenceId]);
    if (evRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Evidence not found' });
    const authz = await (0, authorization_1.authorize)(user, 'EVIDENCE_READ', {
        type: 'EVIDENCE',
        id: evidenceId,
        caseId: evRes.rows[0].case_id,
        owningOrgId: evRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    const events = await (0, db_1.query)(`
    SELECT ec.*,
           u_from.display_name as from_user_name, o_from.name as from_org_name, o_from.code as from_org_code,
           u_to.display_name as to_user_name, o_to.name as to_org_name, o_to.code as to_org_code
    FROM evidence_custody_events ec
    JOIN users u_from ON ec.from_user_id = u_from.id
    JOIN organization_nodes o_from ON ec.from_organization_id = o_from.id
    JOIN users u_to ON ec.to_user_id = u_to.id
    JOIN organization_nodes o_to ON ec.to_organization_id = o_to.id
    WHERE ec.evidence_id = $1
    ORDER BY ec.timestamp ASC;
  `, [evidenceId]);
    return res.json({ custodyHistory: events.rows });
});
exports.default = router;
