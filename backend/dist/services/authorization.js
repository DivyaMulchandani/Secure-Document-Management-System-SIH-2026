"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = authorize;
const db_1 = require("./db");
const ledger_1 = require("./ledger");
// Agency Branch Allowed Actions Matrix
const AGENCY_BOUNDARY_ACTIONS = {
    POLICE: new Set([
        'CASE_CREATE', 'CASE_READ', 'CASE_UPDATE', 'CASE_ASSIGN', 'CASE_CLOSE',
        'FIR_CREATE', 'FIR_READ', 'FIR_UPDATE',
        'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'INVESTIGATION_UPDATE',
        'EVIDENCE_CREATE', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER', 'EVIDENCE_RETURN',
        'FORENSIC_CREATE', // submitting to lab
        'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
        'COURT_READ', // police can view court dates
        'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
        'ORG_CREATE', 'ORG_READ', 'ORG_UPDATE',
        'DELEGATION_MANAGE', 'AUDIT_READ'
    ]),
    FORENSICS: new Set([
        'CASE_READ', 'FIR_READ',
        'EVIDENCE_READ', 'EVIDENCE_TRANSFER', // lab receiving & return
        'FORENSIC_EXAMINE', 'FORENSIC_REPORT',
        'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
        'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
        'ORG_READ', 'AUDIT_READ'
    ]),
    JUDICIARY: new Set([
        'CASE_READ', 'FIR_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ',
        'COURT_CREATE', 'COURT_HEARING_RECORD', 'COURT_ORDER_ISSUE', 'COURT_JUDGEMENT',
        'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
        'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
        'ORG_READ', 'AUDIT_READ'
    ]),
    MASTER: new Set([
        // Master admin can audit and administer, but cannot forge operational field actions without delegation
        'CASE_CREATE', 'CASE_READ', 'CASE_UPDATE', 'CASE_CLOSE',
        'FIR_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ',
        'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
        'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
        'ORG_CREATE', 'ORG_READ', 'ORG_UPDATE',
        'DELEGATION_MANAGE', 'AUDIT_READ'
    ]),
};
async function authorize(user, action, resource, meta) {
    const ip = meta?.ip || '127.0.0.1';
    const ua = meta?.userAgent || '';
    // 1. MASTER ADMIN Root Authority
    if (user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN') {
        return { allowed: true, statusCode: 200 };
    }
    // 2. Role Permission Check
    const hasBasePermission = user.permissions.includes(action);
    // Check temporary delegation if base permission not in role
    let delegationMatched = false;
    if (!hasBasePermission && resource.caseId) {
        const delegRes = await (0, db_1.query)(`
      SELECT id FROM delegated_access
      WHERE case_id = $1 AND granted_to_user_id = $2
        AND $3 = ANY(permissions)
        AND status = 'ACTIVE'
        AND NOW() BETWEEN starts_at AND expires_at;
    `, [resource.caseId, user.userId, action]);
        if (delegRes.rows.length > 0) {
            delegationMatched = true;
        }
    }
    if (!hasBasePermission && !delegationMatched) {
        await logDecision(user, action, resource, 'DENY', 'User role does not possess required permission', ip, ua);
        return {
            allowed: false,
            reason: `Access Denied: Missing permission '${action}' for role '${user.roleName}'.`,
            statusCode: 403,
        };
    }
    // 3. Agency Boundary Check
    const allowedAgencyActions = AGENCY_BOUNDARY_ACTIONS[user.agencyBranch];
    if (allowedAgencyActions && !allowedAgencyActions.has(action) && !delegationMatched) {
        await logDecision(user, action, resource, 'DENY', `Action ${action} violates agency boundary for branch ${user.agencyBranch}`, ip, ua);
        return {
            allowed: false,
            reason: `Institutional Boundary Violation: Agency branch '${user.agencyBranch}' is prohibited from performing '${action}'.`,
            statusCode: 403,
        };
    }
    // 4. Subtree Organizational Scope Check & Sibling Isolation
    const targetOrgId = resource.owningOrgId || resource.targetOrgId;
    if (targetOrgId) {
        // Check explicit admin_scopes first if configured
        const userScopesRes = await (0, db_1.query)(`
      SELECT s.organization_node_id, s.scope_type, o.hierarchy_path
      FROM admin_scopes s
      JOIN organization_nodes o ON s.organization_node_id = o.id
      WHERE s.user_id = $1;
    `, [user.userId]);
        let isWithinSubtree = false;
        if (userScopesRes.rows.length > 0) {
            for (const sc of userScopesRes.rows) {
                if (sc.scope_type === 'SUBTREE') {
                    if (targetOrgId === sc.organization_node_id) {
                        isWithinSubtree = true;
                        break;
                    }
                    const checkTarget = await (0, db_1.query)(`
            SELECT id FROM organization_nodes
            WHERE id = $1 AND (hierarchy_path = $2 OR hierarchy_path LIKE $2 || '.%');
          `, [targetOrgId, sc.hierarchy_path]);
                    if (checkTarget.rows.length > 0) {
                        isWithinSubtree = true;
                        break;
                    }
                }
                else if (sc.scope_type === 'NODE_ONLY') {
                    if (targetOrgId === sc.organization_node_id) {
                        isWithinSubtree = true;
                        break;
                    }
                }
            }
        }
        else {
            // Default to primary organization descendant subtree
            const scopeRes = await (0, db_1.query)(`
        SELECT id, hierarchy_path FROM organization_nodes
        WHERE id = $1
          AND (hierarchy_path = $2 OR hierarchy_path LIKE $2 || '.%');
      `, [targetOrgId, user.organizationPath]);
            isWithinSubtree = scopeRes.rows.length > 0;
        }
        if (isWithinSubtree || delegationMatched) {
            return { allowed: true, statusCode: 200 };
        }
        // 5. Cross-Agency Case Participation Check
        if (resource.caseId) {
            const partRes = await (0, db_1.query)(`
        SELECT id, access_role FROM case_agency_participation
        WHERE case_id = $1
          AND (
            organization_id = $2
            OR organization_id IN (
              SELECT id FROM organization_nodes
              WHERE hierarchy_path = $3 OR $3 LIKE hierarchy_path || '.%'
            )
          );
      `, [resource.caseId, user.organizationId, user.organizationPath]);
            if (partRes.rows.length > 0) {
                return { allowed: true, statusCode: 200 };
            }
        }
        // 6. Temporary Delegated Access Check
        if (resource.caseId) {
            const activeDelegRes = await (0, db_1.query)(`
        SELECT id FROM delegated_access
        WHERE case_id = $1 AND granted_to_user_id = $2
          AND status = 'ACTIVE'
          AND NOW() BETWEEN starts_at AND expires_at;
      `, [resource.caseId, user.userId]);
            if (activeDelegRes.rows.length > 0) {
                return { allowed: true, statusCode: 200 };
            }
        }
        // Target organization is OUTSIDE user's vertical subtree (e.g. Sibling station or Cross-agency)
        // Sibling Isolation: If target is in the same agency branch but outside subtree, strictly DENY!
        const targetBranchRes = await (0, db_1.query)(`
      SELECT agency_branch FROM organization_nodes WHERE id = $1;
    `, [targetOrgId]);
        const targetBranch = targetBranchRes.rows[0]?.agency_branch;
        if (targetBranch === user.agencyBranch) {
            // Sibling isolation triggered! (e.g. Station A accessing Station B, or Surat accessing Ahmedabad)
            await logDecision(user, action, resource, 'DENY', 'Sibling Isolation: Attempt to access peer organizational node outside descendant subtree', ip, ua);
            return {
                allowed: false,
                reason: 'Access Denied: Sibling Isolation Policy prevents accessing records of sibling or unadministered organization nodes.',
                statusCode: 403,
            };
        }
        // Neither subtree, nor participation, nor delegation: DENY
        await logDecision(user, action, resource, 'DENY', 'Organizational Scope Out of Bounds', ip, ua);
        return {
            allowed: false,
            reason: 'Access Denied: You do not possess jurisdictional scope or case participation for this organization resource.',
            statusCode: 403,
        };
    }
    // If no specific org ID is targeted (e.g. global list with SQL filtering), allowed
    return { allowed: true, statusCode: 200 };
}
async function logDecision(user, action, resource, result, reason, ip, ua) {
    try {
        await (0, db_1.withTransaction)(async (tx) => {
            const auditRes = await tx.query(`
        INSERT INTO audit_logs (
          user_id, actor_user_id, organization_id, organization_node_id, body_id,
          action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value, metadata
        )
        VALUES ($1, $1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, json_build_object('reason', $11::text), json_build_object('reason', $11::text))
        RETURNING id;
      `, [user.userId, user.organizationId, user.bodyId || user.agencyBranch, action, resource.type, resource.id || null, resource.caseId || null, result, ip, ua, reason]);
            // Anchor the authorization decision on the tamper-evident ledger so the
            // audit trail's integrity is verifiable independently of DB permissions.
            await (0, ledger_1.appendLedgerBlock)(tx, {
                eventType: 'AUDIT_DECISION',
                refTable: 'audit_logs',
                refId: auditRes.rows[0].id,
                caseId: resource.caseId || null,
                orgId: user.organizationId,
                bodyId: user.bodyId || user.agencyBranch,
                payload: {
                    actorId: user.userId,
                    action,
                    resourceType: resource.type,
                    resourceId: resource.id || null,
                    caseId: resource.caseId || null,
                    result,
                    reason,
                    ip,
                },
            });
        });
    }
    catch (err) {
        console.error('Audit log / ledger append failed:', err);
    }
}
