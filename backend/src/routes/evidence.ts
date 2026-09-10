import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';
import { appendLedgerBlock, verifyLedger } from '../services/ledger';

const router = Router();

// GET /api/cases/:id/evidence
router.get('/:id/evidence', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const caseId = req.params.id;

  const caseRes = await query(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
  if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Case not found' });

  const authz = await authorize(user, 'EVIDENCE_READ', {
    type: 'EVIDENCE',
    caseId,
    owningOrgId: caseRes.rows[0].originating_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const evRes = await query(`
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
router.post('/:id/evidence', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const caseId = req.params.id;
  const { evidenceTag, category, description, collectedAt, collectionLocation, storageLocation, sealStatus } = req.body;

  if (!evidenceTag || !category || !description || !collectionLocation || !storageLocation) {
    return res.status(400).json({ error: 'Validation Error', message: 'Missing required evidence fields' });
  }

  const caseRes = await query(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
  if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Case not found' });

  const authz = await authorize(user, 'EVIDENCE_CREATE', {
    type: 'EVIDENCE',
    caseId,
    owningOrgId: caseRes.rows[0].originating_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  try {
    const evRes = await query(`
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
    await query(`
      INSERT INTO evidence_custody_events (
        evidence_id, timestamp, from_user_id, from_organization_id, to_user_id, to_organization_id,
        action_type, reason, seal_condition
      ) VALUES (
        $1, NOW(), $2, $3, $2, $3, 'COLLECTION', 'Initial seizure and bagging at crime scene', $4
      );
    `, [ev.id, user.userId, user.organizationId, sealStatus || 'INTACT_AND_VERIFIED']);

    // Timeline event
    await query(`
      INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
      VALUES ($1, 'EVIDENCE_COLLECTED', 'Physical Evidence Registered', $2, $3, $4, 'EVIDENCE', $5);
    `, [caseId, `Tag: ${evidenceTag} (${category}) collected by ${user.displayName}`, user.userId, user.organizationId, ev.id]);

    // Audit log
    await query(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'EVIDENCE_CREATED', 'EVIDENCE', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
    `, [user.userId, user.organizationId, ev.id, caseId, req.ip, req.headers['user-agent'], JSON.stringify({ tag: evidenceTag, category })]);

    return res.status(201).json({ success: true, evidence: ev });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'Evidence tag already registered for this case' });
    }
    return res.status(500).json({ error: 'Server Error', message: 'Failed to register evidence' });
  }
});

// POST /api/evidence/:id/transfer (Chain-of-Custody Handoff)
router.post('/:id/transfer', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const evidenceId = req.params.id;
  const { toUserId, toOrganizationId, actionType, reason, sealCondition } = req.body;

  if (!toUserId || !toOrganizationId || !actionType || !reason) {
    return res.status(400).json({ error: 'Validation Error', message: 'Recipient, destination organization, action type, and reason are required' });
  }

  const evRes = await query(`
    SELECT e.*, c.originating_organization_id
    FROM evidence e
    JOIN cases c ON e.case_id = c.id
    WHERE e.id = $1;
  `, [evidenceId]);

  if (evRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Evidence item not found' });
  const ev = evRes.rows[0];

  const authz = await authorize(user, 'EVIDENCE_TRANSFER', {
    type: 'EVIDENCE',
    id: evidenceId,
    caseId: ev.case_id,
    owningOrgId: ev.current_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  // Determine new status based on transfer destination
  const destOrgRes = await query(`SELECT agency_branch FROM organization_nodes WHERE id = $1;`, [toOrganizationId]);
  const destBranch = destOrgRes.rows[0]?.agency_branch;

  let newStatus = 'TRANSFERRED';
  if (destBranch === 'FORENSICS') newStatus = 'IN_FORENSIC_LAB';
  else if (destBranch === 'JUDICIARY') newStatus = 'PRESENTED_IN_COURT';
  else if (actionType === 'RETURN') newStatus = 'RETURNED';

  const seal = sealCondition || 'INTACT_AND_VERIFIED';

  const custodyEvent = await withTransaction(async (tx) => {
    // 1. Insert Chain of Custody Event
    const custodyRes = await tx.query(`
      INSERT INTO evidence_custody_events (
        evidence_id, timestamp, from_user_id, from_organization_id, to_user_id, to_organization_id,
        action_type, reason, seal_condition
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `, [
      evidenceId, user.userId, ev.current_organization_id,
      toUserId, toOrganizationId, actionType, reason, seal
    ]);

    // 2. Update Evidence Current Custodian and Org
    await tx.query(`
      UPDATE evidence
      SET current_custodian_id = $1, current_organization_id = $2,
          seal_status = $3, status = $4, updated_at = NOW()
      WHERE id = $5;
    `, [toUserId, toOrganizationId, seal, newStatus, evidenceId]);

    // 3. Record in Timeline
    await tx.query(`
      INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
      VALUES ($1, 'EVIDENCE_TRANSFERRED', 'Chain-of-Custody Transfer Executed', $2, $3, $4, 'EVIDENCE', $5);
    `, [ev.case_id, `Evidence ${ev.evidence_tag} transferred (${actionType}) to ${toOrganizationId}`, user.userId, user.organizationId, evidenceId]);

    // 4. Audit Log
    await tx.query(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'EVIDENCE_TRANSFERRED', 'EVIDENCE', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
    `, [user.userId, user.organizationId, evidenceId, ev.case_id, req.ip, req.headers['user-agent'], JSON.stringify({ actionType, toOrg: toOrganizationId })]);

    // 5. Anchor the custody transition on the integrity ledger.
    await appendLedgerBlock(tx, {
      eventType: 'EVIDENCE_CUSTODY',
      refTable: 'evidence_custody_events',
      refId: custodyRes.rows[0].id,
      caseId: ev.case_id,
      orgId: user.organizationId,
      bodyId: user.bodyId || user.agencyBranch,
      payload: {
        evidenceId,
        evidenceTag: ev.evidence_tag,
        actionType,
        fromOrg: ev.current_organization_id,
        toOrg: toOrganizationId,
        toUser: toUserId,
        actorId: user.userId,
        sealCondition: seal,
        newStatus,
        at: new Date(custodyRes.rows[0].timestamp).toISOString(),
      },
    });

    return custodyRes.rows[0];
  });

  return res.json({ success: true, custodyEvent, newStatus });
});

// GET /api/evidence/:id/custody (Full Audit Chain of Custody)
router.get('/:id/custody', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const evidenceId = req.params.id;

  const evRes = await query(`
    SELECT e.id, e.case_id, c.originating_organization_id
    FROM evidence e
    JOIN cases c ON e.case_id = c.id
    WHERE e.id = $1;
  `, [evidenceId]);

  if (evRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Evidence not found' });

  const authz = await authorize(user, 'EVIDENCE_READ', {
    type: 'EVIDENCE',
    id: evidenceId,
    caseId: evRes.rows[0].case_id,
    owningOrgId: evRes.rows[0].originating_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const events = await query(`
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

  // Chain-of-custody integrity: how many of these transitions are anchored on
  // the hash-chained ledger, and is that ledger currently intact end-to-end.
  const anchoredRes = await query(
    `SELECT COUNT(*)::int AS n FROM ledger_blocks
     WHERE event_ref_table = 'evidence_custody_events'
       AND event_ref_id = ANY($1::text[])`,
    [events.rows.map((e: any) => String(e.id))]
  );
  const ledger = await verifyLedger();

  return res.json({
    custodyHistory: events.rows,
    integrity: {
      chainVerified: ledger.valid,
      anchoredTransitions: anchoredRes.rows[0].n,
      totalTransitions: events.rows.length,
      ledgerBrokenAt: ledger.brokenAt,
    },
  });
});

export default router;
