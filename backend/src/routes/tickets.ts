import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../services/db';
import { requireAuth, maskEmail } from '../services/auth';
import { authorize } from '../services/authorization';
import { sendOtpEmail } from '../services/mailer';

const router = Router();

// GET /api/tickets - List tickets scoped by authority
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  const bodyFilter = req.query.body as string;
  const statusFilter = req.query.status as string;

  const conditions: string[] = [];
  const params: any[] = [];

  if (!isMaster) {
    params.push(user.agencyBranch);
    conditions.push(`t.body_id = $${params.length}`);
  } else if (bodyFilter && ['POLICE', 'FORENSICS', 'JUDICIARY', 'MASTER'].includes(bodyFilter.toUpperCase())) {
    params.push(bodyFilter.toUpperCase());
    conditions.push(`t.body_id = $${params.length}`);
  }

  if (statusFilter) {
    params.push(statusFilter.toUpperCase());
    conditions.push(`t.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const ticketsRes = await query(`
    SELECT t.id, t.ticket_number, t.requester_user_id, t.requester_email,
           t.requester_government_id, t.requester_name, t.organization_id,
           t.body_id, t.action_type, t.target_resource_type, t.target_resource_id,
           t.justification, t.payload, t.before_state, t.status,
           t.verified_at, t.executed_at, t.created_at, t.updated_at,
           o.name as org_name, o.code as org_code
    FROM update_tickets t
    LEFT JOIN organization_nodes o ON t.organization_id = o.id
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT 100;
  `, params);

  return res.json({ tickets: ticketsRes.rows });
});

// GET /api/tickets/:id - Detailed view of single ticket
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const ticketId = req.params.id;

  const ticketRes = await query(`
    SELECT t.*, o.name as org_name, o.code as org_code, o.hierarchy_path
    FROM update_tickets t
    LEFT JOIN organization_nodes o ON t.organization_id = o.id
    WHERE t.id = $1;
  `, [ticketId]);

  if (ticketRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Ticket not found' });
  }

  const ticket = ticketRes.rows[0];
  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  if (!isMaster && ticket.body_id !== user.agencyBranch && ticket.requester_user_id !== user.userId) {
    return res.status(403).json({ error: 'Access Denied', message: 'Access to ticket restricted by agency boundary' });
  }

  delete ticket.otp_code;

  return res.json({ ticket });
});

// POST /api/tickets/request-otp & /api/tickets/generate-otp - Step 1: Initiate ticket & send OTP
async function handleRequestOtp(req: Request, res: Response) {
  try {
    const user = req.userSession!;
    const { actionType, targetResourceType, targetResourceId, justification, payload } = req.body;

  if (!actionType || !targetResourceType || !justification || typeof justification !== 'string' || justification.trim().length < 5) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Compulsory justification (minimum 5 characters) and valid action parameters are required to generate an update ticket.',
    });
  }

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  let beforeState: any = {};
  if (targetResourceId) {
    if (targetResourceType === 'USER') {
      const uRes = await query(`
        SELECT u.id, u.username, u.email, u.display_name, u.badge_number, u.government_id,
               u.designation, u.status, u.is_layer_admin, u.primary_role_id, u.primary_organization_id,
               o.agency_branch, o.hierarchy_path
        FROM users u
        JOIN organization_nodes o ON u.primary_organization_id = o.id
        WHERE u.id = $1;
      `, [targetResourceId]);
      if (uRes.rows.length > 0) {
        beforeState = uRes.rows[0];
        if (!isMaster) {
          if (uRes.rows[0].agency_branch !== user.agencyBranch) {
            return res.status(403).json({ error: 'Agency Boundary Violation', message: 'Cannot modify users in another agency branch' });
          }
          const isWithinSubtree = uRes.rows[0].hierarchy_path === user.organizationPath ||
            uRes.rows[0].hierarchy_path.startsWith(user.organizationPath + '.');
          if (!isWithinSubtree) {
            return res.status(403).json({ error: 'Access Denied', message: 'Sibling Isolation: Cannot modify users outside your descendant subtree' });
          }
        }
      }
    } else if (targetResourceType === 'ORGANIZATION_NODE' || targetResourceType === 'ORG') {
      const oRes = await query(`
        SELECT id, name, code, level, agency_branch, hierarchy_path, jurisdiction_area, status
        FROM organization_nodes WHERE id = $1;
      `, [targetResourceId]);
      if (oRes.rows.length > 0) {
        beforeState = oRes.rows[0];
        if (!isMaster) {
          if (oRes.rows[0].agency_branch !== user.agencyBranch) {
            return res.status(403).json({ error: 'Agency Boundary Violation', message: 'Cannot modify office nodes in another agency branch' });
          }
          const isWithinSubtree = oRes.rows[0].hierarchy_path === user.organizationPath ||
            oRes.rows[0].hierarchy_path.startsWith(user.organizationPath + '.');
          if (!isWithinSubtree) {
            return res.status(403).json({ error: 'Access Denied', message: 'Sibling Isolation: Cannot modify office nodes outside your descendant subtree' });
          }
        }
      }
    }
  }

  const year = new Date().getFullYear();
  const randSeq = crypto.randomBytes(3).toString('hex').toUpperCase();
  const ticketNumber = `TCK-${year}-${randSeq}`;

  const otpCode = Math.floor(100000 + crypto.randomInt(900000)).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  const newTicket = await query(`
    INSERT INTO update_tickets (
      ticket_number, requester_user_id, requester_email, requester_government_id,
      requester_name, organization_id, body_id, action_type, target_resource_type,
      target_resource_id, justification, payload, before_state, otp_code,
      otp_expires_at, status, ip_address, user_agent
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING_OTP', $16, $17)
    RETURNING id, ticket_number, requester_email, action_type, status, created_at;
  `, [
    ticketNumber, user.userId, user.email, user.governmentId || user.badgeNumber || 'N/A',
    user.displayName, user.organizationId, user.bodyId || user.agencyBranch,
    actionType, targetResourceType, targetResourceId || null,
    justification.trim(), JSON.stringify(payload || {}), JSON.stringify(beforeState),
    otpCode, expiresAt, req.ip, req.headers['user-agent']
  ]);

  const ticket = newTicket.rows[0];

  const meta = JSON.stringify({ ticketNumber, actionType, justification: justification.trim() });
  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata
    )
    VALUES ($1, $1, $2, $2, $3, 'TICKET_GENERATED', 'TICKET', $4, 'ALLOW', $5, $6, $7::jsonb);
  `, [user.userId, user.organizationId, user.bodyId || user.agencyBranch, ticketNumber, req.ip, req.headers['user-agent'], meta]);

  console.log(`[LEA TICKET AUTH] OTP for Ticket ${ticketNumber} (${actionType}): [ ${otpCode} ] -> ${user.email}`);

  const mailResult = await sendOtpEmail(user.email, otpCode, 'UPDATE_TICKET_AUTHORIZATION', {
    displayName: user.displayName,
    ticketNumber: ticket.ticket_number,
    actionType,
    ipAddress: req.ip,
  });

  return res.status(201).json({
    success: true,
    ticketId: ticket.id,
    ticketNumber: ticket.ticket_number,
    actionType: ticket.action_type,
    status: ticket.status,
    requesterEmail: maskEmail(user.email),
    message: mailResult.mode === 'LIVE_SMTP'
      ? `Mandatory update ticket ${ticket.ticket_number} generated. Authorization code dispatched to ${maskEmail(user.email)} via secure SMTP relay.`
      : `Mandatory update ticket ${ticket.ticket_number} generated. Enter the 6-digit OTP sent to ${maskEmail(user.email)} to authorize execution.`,
    devOtpPreview: otpCode,
    deliveryMode: mailResult.mode,
  });
  } catch (err: any) {
    console.error('Failed to generate update ticket:', err);
    return res.status(500).json({ error: 'Ticket Generation Failed', message: err.message });
  }
}

router.post('/request-otp', requireAuth, handleRequestOtp);
router.post('/generate-otp', requireAuth, handleRequestOtp);

// POST /api/tickets/execute-with-otp - Step 2: Verify OTP & Execute Action
router.post('/execute-with-otp', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const { ticketId, otp, otpCode } = req.body;
  const effectiveOtp = otp || otpCode;

  if (!ticketId || !effectiveOtp) {
    return res.status(400).json({ error: 'Validation Error', message: 'Ticket ID and OTP are required' });
  }

  const ticketRes = await query(`
    SELECT * FROM update_tickets WHERE id = $1;
  `, [ticketId]);

  if (ticketRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Update ticket not found' });
  }

  const ticket = ticketRes.rows[0];

  if (ticket.status === 'EXECUTED') {
    return res.status(409).json({ error: 'Already Executed', message: `Ticket ${ticket.ticket_number} has already been executed.` });
  }

  if (ticket.status === 'REJECTED') {
    return res.status(403).json({ error: 'Ticket Rejected', message: `Ticket ${ticket.ticket_number} has been rejected or cancelled.` });
  }

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  if (!isMaster && ticket.requester_user_id !== user.userId) {
    return res.status(403).json({ error: 'Forbidden', message: 'Only the requesting official or master admin may verify this ticket.' });
  }

  if (new Date(ticket.otp_expires_at) < new Date()) {
    return res.status(401).json({ error: 'Expired OTP', message: 'Authorization OTP has expired. Please request a new ticket.' });
  }

  if (ticket.otp_code !== effectiveOtp.trim()) {
    return res.status(401).json({ error: 'Invalid OTP', message: 'Incorrect 6-digit authorization code.' });
  }

  let executionResult: any = null;
  const payload = req.body.payload ? { ...(ticket.payload || {}), ...req.body.payload } : (ticket.payload || {});

  try {
    switch (ticket.action_type) {
      case 'CREATE_OFFICE': {
        const { parentId, adminLevelId, typeId, name, code, jurisdictionArea, metadata } = payload;
        if (!name || !code) {
          throw new Error('Office Name and Code are required.');
        }

        let adminLevel: any = null;
        if (adminLevelId) {
          const alRes = await query(`SELECT * FROM admin_levels WHERE id = $1;`, [adminLevelId]);
          if (alRes.rows.length === 0) {
            throw new Error(`Selected hierarchy layer (${adminLevelId}) not found in database.`);
          }
          adminLevel = alRes.rows[0];
        }

        let parent: any = null;
        if (parentId) {
          const parentRes = await query(`
            SELECT id, hierarchy_path, level, agency_branch, body_id FROM organization_nodes WHERE id = $1;
          `, [parentId]);
          if (parentRes.rows.length === 0) throw new Error('Parent office node not found.');
          parent = parentRes.rows[0];
        }

        const targetBodyId = adminLevel ? adminLevel.body_id : (parent ? parent.body_id : (ticket.body_id || user.agencyBranch));

        // Enforce Sovereign Agency Boundary on Parent
        if (parent && parent.body_id !== targetBodyId) {
          throw new Error(`Institutional Boundary Violation: Cannot establish a ${targetBodyId} office under a ${parent.body_id} parent office.`);
        }

        const resolvedLevel = adminLevel ? adminLevel.level_number : (parent ? parent.level + 1 : 1);

        // Enforce Hierarchy Ordering (Prevent Level Inversion)
        if (parent && parent.level >= resolvedLevel) {
          throw new Error(`Inverted Hierarchy Violation: Parent office level (${parent.level}) must be strictly lower than child layer level (${resolvedLevel}).`);
        }

        if (!parent && resolvedLevel > 1) {
          throw new Error(`Parent office node is required for Level ${resolvedLevel} offices.`);
        }

        // Enforce Creator Authority
        if (!isMaster) {
          if (user.agencyBranch !== targetBodyId) {
            throw new Error(`Institutional Boundary Violation: Cannot create offices in agency '${targetBodyId}' from '${user.agencyBranch}'.`);
          }

          // Check if creator's mapped level permits creating sub-offices
          const creatorLevelRes = await query(`
            SELECT al.can_create_sub_offices
            FROM users u
            JOIN organization_nodes o ON u.primary_organization_id = o.id
            LEFT JOIN admin_levels al ON o.admin_level_id = al.id
            WHERE u.id = $1;
          `, [user.userId]);

          if (creatorLevelRes.rows.length > 0 && creatorLevelRes.rows[0].can_create_sub_offices === false) {
            throw new Error('Authority Denied: Your assigned administrative layer does not have permission to commission subordinate offices.');
          }

          // Sibling Isolation
          if (parent) {
            const isWithinSubtree = parent.hierarchy_path === user.organizationPath ||
              parent.hierarchy_path.startsWith(user.organizationPath + '.');
            if (!isWithinSubtree) {
              throw new Error('Sibling Isolation: You cannot create child office nodes outside your descendant command subtree.');
            }
          }
        }

        const cleanCode = code.toUpperCase().replace(/[^A-Z0-9_-]/g, '-').replace(/-+/g, '-');
        const pathPart = cleanCode.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const hierarchyPath = parent ? `${parent.hierarchy_path}.${pathPart}` : `${targetBodyId}.${pathPart}`;
        const resolvedTypeId = adminLevel?.office_type_id || typeId || 'OFFICE';
        const assignedAdminLevelId = adminLevel ? adminLevel.id : null;

        const insOrg = await query(`
          INSERT INTO organization_nodes (
            parent_id, body_id, agency_branch, type_id, node_type_id, admin_level_id,
            name, code, hierarchy_path, level, jurisdiction_area, metadata
          )
          VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *;
        `, [
          parent ? parent.id : null,
          targetBodyId,
          targetBodyId,
          resolvedTypeId,
          assignedAdminLevelId,
          name.trim(),
          cleanCode,
          hierarchyPath,
          resolvedLevel,
          jurisdictionArea ? jurisdictionArea.trim() : '',
          metadata ? JSON.stringify(metadata) : '{}'
        ]);

        executionResult = insOrg.rows[0];
        break;
      }

      case 'UPDATE_OFFICE': {
        const { name, jurisdictionArea, metadata } = payload;
        const upOrg = await query(`
          UPDATE organization_nodes
          SET name = COALESCE($1, name),
              jurisdiction_area = COALESCE($2, jurisdiction_area),
              metadata = COALESCE($3, metadata),
              updated_at = NOW()
          WHERE id = $4
          RETURNING *;
        `, [name, jurisdictionArea, metadata ? JSON.stringify(metadata) : null, ticket.target_resource_id]);
        executionResult = upOrg.rows[0];
        break;
      }

      case 'UPDATE_OFFICE_STATUS': {
        const { status } = payload;
        const upOrg = await query(`
          UPDATE organization_nodes SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *;
        `, [status, ticket.target_resource_id]);
        executionResult = upOrg.rows[0];
        break;
      }

      case 'DELETE_OFFICE': {
        const nodeId = ticket.target_resource_id;
        const nodeRes = await query(`SELECT * FROM organization_nodes WHERE id = $1;`, [nodeId]);
        if (nodeRes.rows.length === 0) throw new Error('Office node not found');
        const node = nodeRes.rows[0];

        if (!node.parent_id || node.level === 1) {
          throw new Error('Sovereign root nodes (Level 1 Apex) cannot be deleted.');
        }

        const childCountRes = await query(`SELECT COUNT(*) as count FROM organization_nodes WHERE parent_id = $1;`, [nodeId]);
        const childCount = parseInt(childCountRes.rows[0].count, 10);
        if (childCount > 0) {
          throw new Error(`Cannot delete office '${node.name}': ${childCount} subordinate child office(s) exist under this node. Delete or reassign child offices first.`);
        }

        const userCountRes = await query(`SELECT COUNT(*) as count FROM users WHERE primary_organization_id = $1;`, [nodeId]);
        const userCount = parseInt(userCountRes.rows[0].count, 10);
        if (userCount > 0) {
          throw new Error(`Cannot delete office '${node.name}': ${userCount} personnel are currently assigned to this office. Reassign personnel first.`);
        }

        await query(`DELETE FROM organization_nodes WHERE id = $1;`, [nodeId]);
        executionResult = { deletedId: nodeId, code: node.code, name: node.name };
        break;
      }

      case 'CREATE_USER': {
        const {
          username, email, displayName, badgeNumber, governmentId, phoneNumber,
          designation, departmentWing, clearanceLevel, isLayerAdmin,
          password, roleId, organizationId
        } = payload;

        const effectiveGovId = governmentId || badgeNumber || `GJ-${Date.now().toString().slice(-6)}`;
        const effectiveBadge = badgeNumber || effectiveGovId;
        const rawPass = password || crypto.randomBytes(16).toString('hex');
        const passwordHash = await bcrypt.hash(rawPass, 10);
        const isNewAdmin = !!isLayerAdmin || (roleId && roleId.includes('ADMIN'));

        const newU = await query(`
          INSERT INTO users (
            username, email, display_name, badge_number, government_id, phone_number,
            designation, department_wing, clearance_level, is_layer_admin,
            password_hash, primary_role_id, primary_organization_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id, username, email, display_name, badge_number, government_id, designation, is_layer_admin, status;
        `, [
          username, email, displayName, effectiveBadge, effectiveGovId, phoneNumber || null,
          designation || null, departmentWing || null, clearanceLevel || 'CONFIDENTIAL', isNewAdmin,
          passwordHash, roleId, organizationId
        ]);

        const newUserId = newU.rows[0].id;
        await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`, [newUserId, roleId]);

        if (isNewAdmin) {
          await query(`
            INSERT INTO admin_scopes (user_id, organization_node_id, scope_type)
            VALUES ($1, $2, 'SUBTREE') ON CONFLICT DO NOTHING;
          `, [newUserId, organizationId]);
        }
        executionResult = newU.rows[0];
        break;
      }

      case 'UPDATE_USER': {
        const {
          displayName, badgeNumber, governmentId, phoneNumber, designation,
          departmentWing, clearanceLevel, isLayerAdmin, roleId, organizationId
        } = payload;

        const upUser = await query(`
          UPDATE users
          SET display_name = COALESCE($1, display_name),
              badge_number = COALESCE($2, badge_number),
              government_id = COALESCE($3, government_id),
              phone_number = COALESCE($4, phone_number),
              designation = COALESCE($5, designation),
              department_wing = COALESCE($6, department_wing),
              clearance_level = COALESCE($7, clearance_level),
              is_layer_admin = COALESCE($8, is_layer_admin),
              primary_role_id = COALESCE($9, primary_role_id),
              primary_organization_id = COALESCE($10, primary_organization_id),
              updated_at = NOW()
          WHERE id = $11
          RETURNING id, username, email, display_name, badge_number, government_id, designation, is_layer_admin, status;
        `, [
          displayName, badgeNumber, governmentId, phoneNumber, designation,
          departmentWing, clearanceLevel, isLayerAdmin, roleId, organizationId, ticket.target_resource_id
        ]);
        executionResult = upUser.rows[0];
        break;
      }

      case 'UPDATE_USER_STATUS': {
        const { status } = payload;
        const upUser = await query(`
          UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2
          RETURNING id, username, email, status;
        `, [status, ticket.target_resource_id]);
        executionResult = upUser.rows[0];
        break;
      }

      case 'DELETE_USER': {
        const targetUserId = ticket.target_resource_id;
        await query(`DELETE FROM user_sessions WHERE user_id = $1;`, [targetUserId]);
        await query(`DELETE FROM admin_scopes WHERE user_id = $1;`, [targetUserId]);
        await query(`DELETE FROM user_roles WHERE user_id = $1;`, [targetUserId]);
        await query(`UPDATE audit_logs SET user_id = NULL WHERE user_id = $1;`, [targetUserId]);
        await query(`UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = $1;`, [targetUserId]);
        await query(`DELETE FROM users WHERE id = $1;`, [targetUserId]);
        executionResult = { deletedUserId: targetUserId };
        break;
      }

      case 'CREATE_OFFICE_POSITION': {
        const { code, name, description, bodyId } = payload;
        const cleanCode = code.toUpperCase().replace(/\s+/g, '_');
        const newPos = await query(`
          INSERT INTO organization_node_types (id, code, name, description, body_id, is_active)
          VALUES ($1, $2, $3, $4, $5, TRUE)
          ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, body_id = EXCLUDED.body_id
          RETURNING *;
        `, [cleanCode, cleanCode, name, description || '', bodyId]);
        executionResult = newPos.rows[0];
        break;
      }

      default:
        throw new Error(`Unsupported action type: ${ticket.action_type}`);
    }

    const effectiveTargetId = executionResult?.id || ticket.target_resource_id;
    await query(`
      UPDATE update_tickets
      SET status = 'EXECUTED',
          payload = $1,
          target_resource_id = COALESCE($2, target_resource_id),
          verified_at = NOW(),
          executed_at = NOW(),
          updated_at = NOW()
      WHERE id = $3;
    `, [JSON.stringify(payload), effectiveTargetId, ticket.id]);

    const auditMeta = JSON.stringify({
      ticketNumber: ticket.ticket_number,
      actionType: ticket.action_type,
      justification: ticket.justification,
      targetResourceType: ticket.target_resource_type,
      targetResourceId: ticket.target_resource_id,
      executedBy: user.email,
    });

    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
      )
      VALUES ($1, $1, $2, $2, $3, 'TICKET_EXECUTED', $4, $5, 'ALLOW', $6, $7, $8::jsonb, $9::jsonb);
    `, [
      user.userId, user.organizationId, ticket.body_id, ticket.target_resource_type,
      ticket.ticket_number, req.ip, req.headers['user-agent'], auditMeta,
      JSON.stringify(executionResult || {})
    ]);

    return res.json({
      success: true,
      ticketNumber: ticket.ticket_number,
      actionType: ticket.action_type,
      status: 'EXECUTED',
      result: executionResult,
      message: `Ticket ${ticket.ticket_number} verified and executed successfully.`,
    });

  } catch (err: any) {
    console.error('Ticket execution error:', err);
    return res.status(500).json({ error: 'Execution Failed', message: err.message });
  }
});

export default router;
