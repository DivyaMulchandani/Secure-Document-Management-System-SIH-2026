import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';
import { appendLedgerBlock } from '../services/ledger';

const BCRYPT_COST = 12;

const router = Router();

// GET /api/users/roles
router.get('/roles', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  let roles;
  if (isMaster) {
    roles = await query(`SELECT id, agency_branch, name, description FROM roles ORDER BY agency_branch ASC, name ASC;`);
  } else {
    roles = await query(`
      SELECT id, agency_branch, name, description FROM roles
      WHERE (agency_branch = $1 OR agency_branch = 'ALL') AND id NOT IN ('MASTER_ADMIN', 'SYSTEM_MASTER_ADMIN')
      ORDER BY name ASC;
    `, [user.agencyBranch]);
  }
  return res.json({ roles: roles.rows });
});

// GET /api/users/assignable-roles (Dynamically filtered by administrator role, agency, and target node)
router.get('/assignable-roles', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const nodeId = req.query.nodeId as string;
  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  if (isMaster) {
    const roles = await query(`SELECT id, agency_branch, name, description FROM roles ORDER BY name ASC;`);
    return res.json({ roles: roles.rows });
  }

  let targetBranch = user.agencyBranch;
  if (nodeId) {
    const nodeRes = await query(`SELECT agency_branch, type_id, node_type_id FROM organization_nodes WHERE id = $1;`, [nodeId]);
    if (nodeRes.rows.length > 0) {
      targetBranch = nodeRes.rows[0].agency_branch;
    }
  }

  const rolesRes = await query(`
    SELECT id, agency_branch, name, description FROM roles
    WHERE (agency_branch = $1 OR agency_branch = 'ALL') AND id NOT IN ('MASTER_ADMIN', 'SYSTEM_MASTER_ADMIN')
    ORDER BY name ASC;
  `, [targetBranch]);

  return res.json({ roles: rolesRes.rows });
});

// GET /api/users/hierarchy-summary
router.get('/hierarchy-summary', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  // Parameterised subtree filter -- never interpolate identity-derived
  // values (organizationPath originates from an org "code" field) into SQL text.
  const params: any[] = [];
  let orgFilter = '1=1';
  if (!isMaster) {
    params.push(user.organizationPath);
    orgFilter = `(o.hierarchy_path = $1 OR o.hierarchy_path LIKE $1 || '.%')`;
  }

  const summaryRes = await query(`
    SELECT o.id, o.name, o.code, o.agency_branch, o.level, o.parent_id, o.hierarchy_path, o.body_id,
           COUNT(u.id) as total_personnel,
           COUNT(u.id) FILTER (WHERE u.is_layer_admin = TRUE OR u.primary_role_id LIKE '%ADMIN%') as layer_admins_count
    FROM organization_nodes o
    LEFT JOIN users u ON u.primary_organization_id = o.id
    WHERE ${orgFilter}
    GROUP BY o.id, o.name, o.code, o.agency_branch, o.level, o.parent_id, o.hierarchy_path, o.body_id
    ORDER BY o.agency_branch ASC, o.level ASC, o.name ASC;
  `, params);

  return res.json({ summary: summaryRes.rows });
});

// GET /api/users
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const agencyBranchQuery = req.query.agencyBranch as string;
  const layerAdminOnly = req.query.layerAdminOnly === 'true';
  const orgIdQuery = req.query.orgId as string;

  const authz = await authorize(user, 'USER_READ', { type: 'USER' }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  let baseQuery = `
    SELECT u.id, u.username, u.email, u.display_name, u.badge_number,
           u.phone_number, u.designation, u.department_wing, u.clearance_level, u.is_layer_admin,
           u.status, u.failed_login_count, u.locked_until, u.last_login_at, u.created_at,
           r.id as role_id, r.name as role_name, r.agency_branch as role_agency_branch,
           o.id as org_id, o.name as org_name, o.code as org_code, o.hierarchy_path as org_path,
           o.level as org_level, o.body_id, o.agency_branch
    FROM users u
    JOIN roles r ON u.primary_role_id = r.id
    JOIN organization_nodes o ON u.primary_organization_id = o.id
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  // Hierarchical scope restriction using admin_scopes
  if (!isMaster) {
    const callerScopesRes = await query(`
      SELECT s.organization_node_id, s.scope_type, o.hierarchy_path
      FROM admin_scopes s
      JOIN organization_nodes o ON s.organization_node_id = o.id
      WHERE s.user_id = $1;
    `, [user.userId]);

    if (callerScopesRes.rows.length > 0) {
      const scopeConditions = callerScopesRes.rows.map(sc => {
        params.push(sc.hierarchy_path);
        const pIdx = params.length;
        if (sc.scope_type === 'SUBTREE') {
          return `(o.hierarchy_path = $${pIdx} OR o.hierarchy_path LIKE $${pIdx} || '.%')`;
        } else {
          return `o.hierarchy_path = $${pIdx}`;
        }
      });
      conditions.push(`(${scopeConditions.join(' OR ')})`);
    } else {
      params.push(user.organizationPath);
      conditions.push(`(o.hierarchy_path = $${params.length} OR o.hierarchy_path LIKE $${params.length} || '.%')`);
    }

    params.push(user.agencyBranch);
    conditions.push(`o.agency_branch = $${params.length}`);
  } else if (agencyBranchQuery && ['POLICE', 'FORENSICS', 'JUDICIARY', 'MASTER'].includes(agencyBranchQuery)) {
    params.push(agencyBranchQuery);
    conditions.push(`o.agency_branch = $${params.length}`);
  }

  if (layerAdminOnly) {
    conditions.push(`(u.is_layer_admin = TRUE OR r.id LIKE '%ADMIN%')`);
  }

  if (orgIdQuery) {
    params.push(orgIdQuery);
    conditions.push(`o.id = $${params.length}`);
  }

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ');
  }

  baseQuery += ` ORDER BY o.level ASC, u.is_layer_admin DESC, u.created_at DESC;`;

  const usersRes = await query(baseQuery, params);
  return res.json({ users: usersRes.rows });
});

// POST /api/users/body-admin (Master Admin Only)
router.post('/body-admin', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  if (!isMaster) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Apex Governance Violation: Only the System Master Administrator can provision Sovereign Body Administrators.',
    });
  }

  const {
    bodyId, username, email, displayName, badgeNumber, governmentId,
    phoneNumber, designation, departmentWing, password
  } = req.body;

  if (!bodyId || !username || !email || !displayName) {
    return res.status(400).json({ error: 'Validation Error', message: 'Missing required parameters for body administrator' });
  }

  // Determine root node and primary admin role
  let rootCode = '';
  let defaultRole = '';
  let branch = '';

  if (bodyId === 'POLICE') {
    rootCode = 'GUJ-POL-STATE-HQ';
    defaultRole = 'POLICE_ADMIN';
    branch = 'POLICE';
  } else if (bodyId === 'JUDICIARY') {
    rootCode = 'GUJ-JUD-APEX';
    defaultRole = 'COURT_ADMIN';
    branch = 'JUDICIARY';
  } else if (bodyId === 'FORENSICS') {
    rootCode = 'GUJ-FSL-APEX';
    defaultRole = 'FORENSIC_ADMIN';
    branch = 'FORENSICS';
  } else {
    return res.status(400).json({ error: 'Invalid Body ID', message: 'bodyId must be POLICE, JUDICIARY, or FORENSICS' });
  }

  const rootOrgRes = await query(`
    SELECT id, name, code, hierarchy_path, body_id FROM organization_nodes WHERE code = $1;
  `, [rootCode]);

  if (rootOrgRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: `Root organization node ${rootCode} for body ${bodyId} not found` });
  }

  const rootOrg = rootOrgRes.rows[0];
  const effectiveGovId = governmentId || badgeNumber || `${branch}-APEX-001`;
  const effectiveBadge = badgeNumber || effectiveGovId;
  const effectivePassword = password || 'Gov@Secure2026!';

  try {
    const passwordHash = await bcrypt.hash(effectivePassword, BCRYPT_COST);
    const newAdmin = await query(`
      INSERT INTO users (
        username, email, display_name, badge_number, government_id, phone_number,
        designation, department_wing, clearance_level, is_layer_admin,
        password_hash, primary_role_id, primary_organization_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'TOP_SECRET', TRUE, $9, $10, $11)
      RETURNING id, username, email, display_name, badge_number, government_id, phone_number,
                designation, department_wing, clearance_level, is_layer_admin,
                status, primary_role_id, primary_organization_id, created_at;
    `, [
      username, email, displayName, effectiveBadge, effectiveGovId, phoneNumber || null,
      designation || `${branch} Sovereign Body Administrator`, departmentWing || `${branch} Executive Command`,
      passwordHash, defaultRole, rootOrg.id
    ]);

    const newAdminId = newAdmin.rows[0].id;

    // Insert user_roles
    await query(`
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2), ($1, 'BODY_ADMIN')
      ON CONFLICT DO NOTHING;
    `, [newAdminId, defaultRole]);

    // Insert admin_scopes for body admin with SUBTREE reach
    await query(`
      INSERT INTO admin_scopes (user_id, organization_node_id, scope_type)
      VALUES ($1, $2, 'SUBTREE')
      ON CONFLICT DO NOTHING;
    `, [newAdminId, rootOrg.id]);

    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
      )
      VALUES ($1, $1, $2, $2, $3, 'ADMIN_CREATED', 'USER', $4, 'ALLOW', $5, $6, $7::jsonb, $7::jsonb);
    `, [
      user.userId, rootOrg.id, bodyId, newAdminId, req.ip, req.headers['user-agent'],
      JSON.stringify({ username, bodyId, role: defaultRole, orgCode: rootCode, action: 'BODY_ADMIN_PROVISIONED' })
    ]);

    return res.status(201).json({ success: true, user: newAdmin.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'Username or email is already registered' });
    }
    return res.status(500).json({ error: 'Server Error', message: 'Failed to provision body administrator' });
  }
});

// POST /api/users
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const {
    username, email, displayName, badgeNumber, governmentId, phoneNumber,
    designation, departmentWing, clearanceLevel, isLayerAdmin,
    password
  } = req.body;
  const roleId = req.body.roleId || req.body.primaryRoleId;
  const organizationId = req.body.organizationId || req.body.primaryOrganizationId;

  const effectiveUsername = (username || (email ? email.split('@')[0] : '')).trim();
  const effectiveGovId = (governmentId || badgeNumber || `GJ-${Date.now().toString().slice(-6)}`).trim();
  const effectiveBadge = badgeNumber || effectiveGovId;
  const effectivePassword = password || `Gov@Secure${crypto.randomBytes(4).toString('hex')}`;

  if (!effectiveUsername || !email || !displayName || !roleId || !organizationId) {
    return res.status(400).json({ error: 'Validation Error', message: 'Missing required user parameters' });
  }

  // Fetch target organization
  const targetOrgRes = await query(`
    SELECT id, name, agency_branch, body_id, hierarchy_path, level
    FROM organization_nodes WHERE id = $1;
  `, [organizationId]);

  if (targetOrgRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Target organization node not found' });
  }
  const targetOrg = targetOrgRes.rows[0];

  // Fetch target role
  const targetRoleRes = await query(`SELECT id, name, agency_branch FROM roles WHERE id = $1;`, [roleId]);
  if (targetRoleRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Assigned role not found' });
  }
  const targetRole = targetRoleRes.rows[0];

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  // Hierarchical Authority & Agency Boundary Checks
  if (!isMaster) {
    // 1. Cross-agency boundary check
    if (targetOrg.agency_branch !== user.agencyBranch || (targetRole.agency_branch !== user.agencyBranch && targetRole.agency_branch !== 'ALL')) {
      await logDecision(user, 'ACCESS_DENIED', organizationId, 'Cross-agency provisioning prohibited', req);
      return res.status(403).json({
        error: 'Institutional Boundary Violation',
        message: `Agency '${user.agencyBranch}' personnel cannot provision users or roles in '${targetOrg.agency_branch}'.`,
      });
    }

    // 2. Subtree Scope Check using caller's admin_scopes
    const callerScopesRes = await query(`
      SELECT s.organization_node_id, s.scope_type, o.hierarchy_path
      FROM admin_scopes s
      JOIN organization_nodes o ON s.organization_node_id = o.id
      WHERE s.user_id = $1;
    `, [user.userId]);

    let isWithinSubtree = false;
    if (callerScopesRes.rows.length > 0) {
      for (const sc of callerScopesRes.rows) {
        if (sc.scope_type === 'SUBTREE') {
          if (organizationId === sc.organization_node_id) {
            isWithinSubtree = true;
            break;
          }
          if (targetOrg.hierarchy_path.startsWith(sc.hierarchy_path + '.')) {
            isWithinSubtree = true;
            break;
          }
        } else if (sc.scope_type === 'NODE_ONLY') {
          if (organizationId === sc.organization_node_id) {
            isWithinSubtree = true;
            break;
          }
        }
      }
    } else {
      isWithinSubtree = targetOrg.hierarchy_path === user.organizationPath ||
        targetOrg.hierarchy_path.startsWith(user.organizationPath + '.');
    }

    if (!isWithinSubtree) {
      await logDecision(user, 'ACCESS_DENIED', organizationId, 'Sibling Isolation: Provisioning outside descendant subtree prohibited', req);
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Sibling Isolation Policy: You cannot provision users or admins outside your own organizational descendant subtree.',
      });
    }

    // 3. Layer Admin Provisioning Authority Check
    const isNewUserAdmin = !!isLayerAdmin || targetRole.id.includes('ADMIN');
    if (isNewUserAdmin) {
      const isCreatorAdmin = user.roleId.includes('ADMIN') || user.isLayerAdmin;
      if (!isCreatorAdmin) {
        return res.status(403).json({
          error: 'Privilege Escalation Blocked',
          message: 'Only an authorized Layer Administrator may provision another Layer Administrator.',
        });
      }
    }

    // 4. Anti-Privilege Escalation: Master Admin cannot be provisioned by non-master
    if (roleId === 'MASTER_ADMIN' || roleId === 'SYSTEM_MASTER_ADMIN') {
      return res.status(403).json({
        error: 'Privilege Escalation Blocked',
        message: 'Only a Master Administrator may provision another Master Administrator.',
      });
    }

    // NOTE: a strict "assigned role's permissions must be a subset of the
    // creator's own" rule was tried here and reverted -- this platform
    // deliberately allows a body admin (e.g. POLICE_ADMIN) to provision the
    // reusable NODE_ADMIN role, which intentionally carries broader
    // cross-domain (forensic/court) permissions for delegated nodes. Agency
    // boundary + subtree scope + the MASTER_ADMIN block above are the actual
    // anti-escalation gates for this role model.
  }

  // Base permission check
  const authz = await authorize(user, 'USER_CREATE', { type: 'USER', owningOrgId: organizationId }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  try {
    const isNewUserAdmin = !!isLayerAdmin || roleId.includes('ADMIN');
    const passwordHash = await bcrypt.hash(effectivePassword, BCRYPT_COST);

    // User row + role grant + admin scope + audit + ledger anchor all commit
    // atomically -- a provisioned account can never exist without its audit trail.
    const createdUser = await withTransaction(async (tx) => {
      const newU = await tx.query(`
        INSERT INTO users (
          username, email, display_name, badge_number, government_id, phone_number,
          designation, department_wing, clearance_level, is_layer_admin,
          password_hash, primary_role_id, primary_organization_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, username, email, display_name, badge_number, government_id, phone_number,
                  designation, department_wing, clearance_level, is_layer_admin,
                  status, primary_role_id, primary_organization_id, created_at;
      `, [
        effectiveUsername, email, displayName, effectiveBadge, effectiveGovId, phoneNumber || null,
        designation || null, departmentWing || null, clearanceLevel || 'CONFIDENTIAL', isNewUserAdmin,
        passwordHash, roleId, organizationId
      ]);

      const newUserId = newU.rows[0].id;

      await tx.query(`
        INSERT INTO user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `, [newUserId, roleId]);

      if (isNewUserAdmin) {
        await tx.query(`
          INSERT INTO admin_scopes (user_id, organization_node_id, scope_type)
          VALUES ($1, $2, 'SUBTREE')
          ON CONFLICT DO NOTHING;
        `, [newUserId, organizationId]);
      }

      const auditAction = isNewUserAdmin ? 'ADMIN_CREATED' : 'USER_CREATED';

      const auditRes = await tx.query(`
        INSERT INTO audit_logs (
          user_id, actor_user_id, organization_id, organization_node_id, body_id,
          action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
        )
        VALUES ($1, $1, $2, $2, $3, $4, 'USER', $5, 'ALLOW', $6, $7, $8::jsonb, $8::jsonb)
        RETURNING id;
      `, [
        user.userId, organizationId, targetOrg.body_id || targetOrg.agency_branch,
        auditAction, newUserId, req.ip, req.headers['user-agent'],
        JSON.stringify({ username, role: roleId, org: organizationId, is_layer_admin: isNewUserAdmin })
      ]);

      // Anchor identity-provisioning events on the integrity ledger too --
      // "who provisioned whom, with what role, when" is exactly the kind of
      // record that should be tamper-evident in a multi-agency system.
      await appendLedgerBlock(tx, {
        eventType: auditAction,
        refTable: 'users',
        refId: newUserId,
        orgId: organizationId,
        bodyId: targetOrg.body_id || targetOrg.agency_branch,
        payload: {
          provisionedBy: user.userId,
          username: effectiveUsername,
          roleId,
          organizationId,
          isLayerAdmin: isNewUserAdmin,
          auditLogId: auditRes.rows[0].id,
        },
      });

      return newU.rows[0];
    });

    return res.status(201).json({ success: true, user: createdUser });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'Username or email is already registered' });
    }
    return res.status(500).json({ error: 'Server Error', message: 'Failed to create user' });
  }
});

// PUT /api/users/:id
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const targetUserId = req.params.id;
  const {
    displayName, badgeNumber, governmentId, phoneNumber, designation,
    departmentWing, clearanceLevel, isLayerAdmin, roleId, organizationId
  } = req.body;

  const targetRes = await query(`
    SELECT u.id, u.primary_organization_id, u.is_layer_admin, o.hierarchy_path, o.agency_branch, o.body_id
    FROM users u
    JOIN organization_nodes o ON u.primary_organization_id = o.id
    WHERE u.id = $1;
  `, [targetUserId]);

  if (targetRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'User not found' });
  }
  const target = targetRes.rows[0];

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  // Subtree Scope & Anti-Privilege Escalation for non-master admins
  if (!isMaster) {
    // 1. Check if target is a parent/ancestor
    if (user.organizationPath !== target.hierarchy_path && user.organizationPath.startsWith(target.hierarchy_path + '.')) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Anti-Privilege Escalation: Subordinate administrators cannot modify parent or ancestor organization records.',
      });
    }

    // 2. Check if target is within own vertical descendant subtree
    const isWithinSubtree = target.hierarchy_path === user.organizationPath ||
      target.hierarchy_path.startsWith(user.organizationPath + '.');

    if (!isWithinSubtree || target.agency_branch !== user.agencyBranch) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Sibling Isolation Policy: You can only update user records within your own administrative descendant subtree.',
      });
    }

    // 3. Non-layer admin cannot modify a layer admin
    if (target.is_layer_admin && !user.isLayerAdmin && user.userId !== targetUserId) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Privilege Escalation Blocked: Non-admin personnel cannot modify Layer Administrators.',
      });
    }

    // 4. Cannot elevate to MASTER_ADMIN
    if (roleId === 'MASTER_ADMIN' || roleId === 'SYSTEM_MASTER_ADMIN') {
      return res.status(403).json({
        error: 'Privilege Escalation Blocked',
        message: 'Only a Master Administrator may assign the Master Administrator role.',
      });
    }
  }

  // Base permission check
  const authz = await authorize(user, 'USER_UPDATE', {
    type: 'USER',
    id: targetUserId,
    owningOrgId: target.primary_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  await query(`
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
    WHERE id = $11;
  `, [
    displayName, badgeNumber, governmentId, phoneNumber, designation,
    departmentWing, clearanceLevel, isLayerAdmin, roleId, organizationId, targetUserId
  ]);

  if (roleId) {
    await query(`
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    `, [targetUserId, roleId]);
  }

  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
    )
    VALUES ($1, $1, $2, $2, $3, 'USER_UPDATED', 'USER', $4, 'ALLOW', $5, $6, $7::jsonb, $7::jsonb);
  `, [
    user.userId, target.primary_organization_id, target.body_id || user.agencyBranch,
    targetUserId, req.ip, req.headers['user-agent'],
    JSON.stringify({ updated_by: user.username, target_user_id: targetUserId })
  ]);

  return res.json({ success: true, message: 'User profile updated successfully' });
});

// PUT /api/users/:id/status
router.put('/:id/status', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const targetUserId = req.params.id;
  const { status } = req.body;

  if (!['ACTIVE', 'LOCKED', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid status' });
  }

  const targetRes = await query(`
    SELECT u.id, u.primary_organization_id, u.is_layer_admin, o.hierarchy_path, o.agency_branch, o.body_id
    FROM users u
    JOIN organization_nodes o ON u.primary_organization_id = o.id
    WHERE u.id = $1;
  `, [targetUserId]);

  if (targetRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'User not found' });
  }
  const target = targetRes.rows[0];

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  if (!isMaster) {
    // 1. Ancestor check
    if (user.organizationPath !== target.hierarchy_path && user.organizationPath.startsWith(target.hierarchy_path + '.')) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Anti-Privilege Escalation: Subordinate administrators cannot modify parent or ancestor organization records.',
      });
    }

    // 2. Subtree check
    const isWithinSubtree = target.hierarchy_path === user.organizationPath ||
      target.hierarchy_path.startsWith(user.organizationPath + '.');

    if (!isWithinSubtree || target.agency_branch !== user.agencyBranch) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Sibling Isolation: You cannot alter status of users outside your administrative descendant subtree.',
      });
    }
  }

  const authz = await authorize(user, 'USER_DEACTIVATE', {
    type: 'USER',
    id: targetUserId,
    owningOrgId: target.primary_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  await query(`UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2;`, [status, targetUserId]);

  const auditAction = status !== 'ACTIVE' ? 'USER_DISABLED' : 'USER_STATUS_UPDATED';

  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
    )
    VALUES ($1, $1, $2, $2, $3, $4, 'USER', $5, 'ALLOW', $6, $7, $8::jsonb, $8::jsonb);
  `, [
    user.userId, target.primary_organization_id, target.body_id || user.agencyBranch,
    auditAction, targetUserId, req.ip, req.headers['user-agent'],
    JSON.stringify({ new_status: status })
  ]);

  return res.json({ success: true, message: `User status updated to ${status}` });
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const targetUserId = req.params.id;

  // 1. Prevent self-deletion
  if (targetUserId === user.userId) {
    return res.status(400).json({
      error: 'Prohibited',
      message: 'Self-Termination Prohibited: Administrators cannot delete their own credentials.'
    });
  }

  // 2. Fetch target user and their organization node
  const targetRes = await query(`
    SELECT u.id, u.username, u.display_name, u.primary_role_id, u.is_layer_admin,
           u.primary_organization_id, o.hierarchy_path, o.agency_branch, o.body_id,
           o.level, o.code as org_code, o.name as org_name
    FROM users u
    JOIN organization_nodes o ON u.primary_organization_id = o.id
    WHERE u.id = $1;
  `, [targetUserId]);

  if (targetRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'User record not found' });
  }

  const target = targetRes.rows[0];

  // 3. Prevent deletion of Apex Master Admin accounts
  if (target.primary_role_id === 'MASTER_ADMIN' || target.primary_role_id === 'SYSTEM_MASTER_ADMIN' || target.username === 'master_admin') {
    return res.status(403).json({
      error: 'Apex Protection',
      message: 'Sovereign Protection: Apex Master Administrator accounts cannot be deleted.'
    });
  }

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  // 4. Hierarchical boundary checks for non-master callers
  if (!isMaster) {
    // Cross-agency boundary check
    if (target.agency_branch !== user.agencyBranch) {
      await logDecision(user, 'USER_DELETED', target.primary_organization_id, 'Cross-agency deletion prohibited', req);
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Cross-Agency Violation: Cannot delete personnel outside your sovereign agency branch.'
      });
    }

    // Ancestor check: subordinate admins cannot delete ancestor users
    if (user.organizationPath !== target.hierarchy_path && user.organizationPath.startsWith(target.hierarchy_path + '.')) {
      await logDecision(user, 'USER_DELETED', target.primary_organization_id, 'Cannot delete parent organization user', req);
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Anti-Privilege Escalation: Subordinate administrators cannot delete parent organization personnel.'
      });
    }

    // Subtree check: target must be within caller's descendant organization subtree
    const isWithinSubtree = target.hierarchy_path === user.organizationPath ||
      target.hierarchy_path.startsWith(user.organizationPath + '.');

    if (!isWithinSubtree) {
      await logDecision(user, 'USER_DELETED', target.primary_organization_id, 'Sibling isolation violation on deletion', req);
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Sibling Isolation: You cannot delete personnel outside your administrative descendant subtree.'
      });
    }

    // Peer / higher layer admin check
    const callerNodeRes = await query(`SELECT level FROM organization_nodes WHERE id = $1;`, [user.organizationId]);
    const callerLevel = callerNodeRes.rows[0]?.level ?? 99;

    if (target.is_layer_admin && callerLevel >= target.level && target.id !== user.userId) {
      await logDecision(user, 'USER_DELETED', target.primary_organization_id, 'Cannot delete peer or higher level administrator', req);
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Anti-Privilege Escalation: Administrators cannot delete peer or higher layer administrators.'
      });
    }
  }

  // 5. Check authorization permission
  const authz = await authorize(user, 'USER_DEACTIVATE', {
    type: 'USER',
    id: targetUserId,
    owningOrgId: target.primary_organization_id,
  }, { ip: req.ip, userAgent: req.headers['user-agent'] });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  // 6. Cascade delete dependencies
  await query(`DELETE FROM user_sessions WHERE user_id = $1;`, [targetUserId]);
  await query(`DELETE FROM admin_scopes WHERE user_id = $1;`, [targetUserId]);
  await query(`DELETE FROM user_roles WHERE user_id = $1;`, [targetUserId]);
  await query(`UPDATE audit_logs SET user_id = NULL WHERE user_id = $1;`, [targetUserId]);
  await query(`UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = $1;`, [targetUserId]);
  await query(`UPDATE cases SET lead_investigator_id = NULL WHERE lead_investigator_id = $1;`, [targetUserId]);
  await query(`UPDATE cases SET created_by = $2 WHERE created_by = $1;`, [user.userId, targetUserId]);
  await query(`DELETE FROM users WHERE id = $1;`, [targetUserId]);

  // 7. Audit log
  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata, before_value
    )
    VALUES ($1, $1, $2, $2, $3, 'USER_DELETED', 'USER', $4, 'ALLOW', $5, $6, $7::jsonb, $7::jsonb);
  `, [
    user.userId, target.primary_organization_id, target.body_id || user.agencyBranch,
    targetUserId, req.ip, req.headers['user-agent'],
    JSON.stringify({
      deleted_username: target.username,
      deleted_display_name: target.display_name,
      deleted_role_id: target.primary_role_id,
      deleted_is_layer_admin: target.is_layer_admin,
      org_code: target.org_code,
      org_name: target.org_name
    })
  ]);

  return res.json({
    success: true,
    message: `User ${target.display_name} (@${target.username}) has been permanently deleted from the organizational roster.`
  });
});

async function logDecision(user: any, action: string, orgId: string, reason: string, req: Request) {
  try {
    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, result, ip_address, user_agent, metadata, after_value
      )
      VALUES ($1, $1, $2, $2, $3, $4, 'USER', 'DENY', $5, $6, json_build_object('reason', $7::text), json_build_object('reason', $7::text));
    `, [user.userId, orgId, user.bodyId || user.agencyBranch, action, req.ip, req.headers['user-agent'], reason]);
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

export default router;
