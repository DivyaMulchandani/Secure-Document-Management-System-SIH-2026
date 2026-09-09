"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../services/db");
const auth_1 = require("../services/auth");
const authorization_1 = require("../services/authorization");
const router = (0, express_1.Router)();
// GET /api/users/roles
router.get('/roles', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
    let roles;
    if (isMaster) {
        roles = await (0, db_1.query)(`SELECT id, agency_branch, name, description FROM roles ORDER BY agency_branch ASC, name ASC;`);
    }
    else {
        roles = await (0, db_1.query)(`
      SELECT id, agency_branch, name, description FROM roles
      WHERE (agency_branch = $1 OR agency_branch = 'ALL') AND id NOT IN ('MASTER_ADMIN', 'SYSTEM_MASTER_ADMIN')
      ORDER BY name ASC;
    `, [user.agencyBranch]);
    }
    return res.json({ roles: roles.rows });
});
// GET /api/users/assignable-roles (Dynamically filtered by administrator role, agency, and target node)
router.get('/assignable-roles', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const nodeId = req.query.nodeId;
    const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
    if (isMaster) {
        const roles = await (0, db_1.query)(`SELECT id, agency_branch, name, description FROM roles ORDER BY name ASC;`);
        return res.json({ roles: roles.rows });
    }
    let targetBranch = user.agencyBranch;
    if (nodeId) {
        const nodeRes = await (0, db_1.query)(`SELECT agency_branch, type_id, node_type_id FROM organization_nodes WHERE id = $1;`, [nodeId]);
        if (nodeRes.rows.length > 0) {
            targetBranch = nodeRes.rows[0].agency_branch;
        }
    }
    const rolesRes = await (0, db_1.query)(`
    SELECT id, agency_branch, name, description FROM roles
    WHERE (agency_branch = $1 OR agency_branch = 'ALL') AND id NOT IN ('MASTER_ADMIN', 'SYSTEM_MASTER_ADMIN')
    ORDER BY name ASC;
  `, [targetBranch]);
    return res.json({ roles: rolesRes.rows });
});
// GET /api/users/hierarchy-summary
router.get('/hierarchy-summary', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
    const orgFilter = isMaster ? '1=1' : `(o.hierarchy_path = '${user.organizationPath}' OR o.hierarchy_path LIKE '${user.organizationPath}.%')`;
    const summaryRes = await (0, db_1.query)(`
    SELECT o.id, o.name, o.code, o.agency_branch, o.level, o.parent_id, o.hierarchy_path, o.body_id,
           COUNT(u.id) as total_personnel,
           COUNT(u.id) FILTER (WHERE u.is_layer_admin = TRUE OR u.primary_role_id LIKE '%ADMIN%') as layer_admins_count
    FROM organization_nodes o
    LEFT JOIN users u ON u.primary_organization_id = o.id
    WHERE ${orgFilter}
    GROUP BY o.id, o.name, o.code, o.agency_branch, o.level, o.parent_id, o.hierarchy_path, o.body_id
    ORDER BY o.agency_branch ASC, o.level ASC, o.name ASC;
  `);
    return res.json({ summary: summaryRes.rows });
});
// GET /api/users
router.get('/', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const agencyBranchQuery = req.query.agencyBranch;
    const layerAdminOnly = req.query.layerAdminOnly === 'true';
    const orgIdQuery = req.query.orgId;
    const authz = await (0, authorization_1.authorize)(user, 'USER_READ', { type: 'USER' }, {
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
    const conditions = [];
    const params = [];
    const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
    // Hierarchical scope restriction using admin_scopes
    if (!isMaster) {
        const callerScopesRes = await (0, db_1.query)(`
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
                }
                else {
                    return `o.hierarchy_path = $${pIdx}`;
                }
            });
            conditions.push(`(${scopeConditions.join(' OR ')})`);
        }
        else {
            params.push(user.organizationPath);
            conditions.push(`(o.hierarchy_path = $${params.length} OR o.hierarchy_path LIKE $${params.length} || '.%')`);
        }
        params.push(user.agencyBranch);
        conditions.push(`o.agency_branch = $${params.length}`);
    }
    else if (agencyBranchQuery && ['POLICE', 'FORENSICS', 'JUDICIARY', 'MASTER'].includes(agencyBranchQuery)) {
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
    const usersRes = await (0, db_1.query)(baseQuery, params);
    return res.json({ users: usersRes.rows });
});
// POST /api/users/body-admin (Master Admin Only)
router.post('/body-admin', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
    if (!isMaster) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Apex Governance Violation: Only the System Master Administrator can provision Sovereign Body Administrators.',
        });
    }
    const { bodyId, username, email, displayName, badgeNumber, phoneNumber, designation, departmentWing, password } = req.body;
    if (!bodyId || !username || !email || !displayName || !password) {
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
    }
    else if (bodyId === 'JUDICIARY') {
        rootCode = 'GUJ-JUD-APEX';
        defaultRole = 'COURT_ADMIN';
        branch = 'JUDICIARY';
    }
    else if (bodyId === 'FORENSICS') {
        rootCode = 'GUJ-FSL-APEX';
        defaultRole = 'FORENSIC_ADMIN';
        branch = 'FORENSICS';
    }
    else {
        return res.status(400).json({ error: 'Invalid Body ID', message: 'bodyId must be POLICE, JUDICIARY, or FORENSICS' });
    }
    const rootOrgRes = await (0, db_1.query)(`
    SELECT id, name, code, hierarchy_path, body_id FROM organization_nodes WHERE code = $1;
  `, [rootCode]);
    if (rootOrgRes.rows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: `Root organization node ${rootCode} for body ${bodyId} not found` });
    }
    const rootOrg = rootOrgRes.rows[0];
    try {
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const newAdmin = await (0, db_1.query)(`
      INSERT INTO users (
        username, email, display_name, badge_number, phone_number,
        designation, department_wing, clearance_level, is_layer_admin,
        password_hash, primary_role_id, primary_organization_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'TOP_SECRET', TRUE, $8, $9, $10)
      RETURNING id, username, email, display_name, badge_number, phone_number,
                designation, department_wing, clearance_level, is_layer_admin,
                status, primary_role_id, primary_organization_id, created_at;
    `, [
            username, email, displayName, badgeNumber || null, phoneNumber || null,
            designation || `${branch} Sovereign Body Administrator`, departmentWing || `${branch} Executive Command`,
            passwordHash, defaultRole, rootOrg.id
        ]);
        const newAdminId = newAdmin.rows[0].id;
        // Insert user_roles
        await (0, db_1.query)(`
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2), ($1, 'BODY_ADMIN')
      ON CONFLICT DO NOTHING;
    `, [newAdminId, defaultRole]);
        // Insert admin_scopes for body admin with SUBTREE reach
        await (0, db_1.query)(`
      INSERT INTO admin_scopes (user_id, organization_node_id, scope_type)
      VALUES ($1, $2, 'SUBTREE')
      ON CONFLICT DO NOTHING;
    `, [newAdminId, rootOrg.id]);
        await (0, db_1.query)(`
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
    }
    catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Conflict', message: 'Username or email is already registered' });
        }
        return res.status(500).json({ error: 'Server Error', message: 'Failed to provision body administrator' });
    }
});
// POST /api/users
router.post('/', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const { username, email, displayName, badgeNumber, phoneNumber, designation, departmentWing, clearanceLevel, isLayerAdmin, password, roleId, organizationId } = req.body;
    if (!username || !email || !displayName || !password || !roleId || !organizationId) {
        return res.status(400).json({ error: 'Validation Error', message: 'Missing required user parameters' });
    }
    // Fetch target organization
    const targetOrgRes = await (0, db_1.query)(`
    SELECT id, name, agency_branch, body_id, hierarchy_path, level
    FROM organization_nodes WHERE id = $1;
  `, [organizationId]);
    if (targetOrgRes.rows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'Target organization node not found' });
    }
    const targetOrg = targetOrgRes.rows[0];
    // Fetch target role
    const targetRoleRes = await (0, db_1.query)(`SELECT id, name, agency_branch FROM roles WHERE id = $1;`, [roleId]);
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
        const callerScopesRes = await (0, db_1.query)(`
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
                }
                else if (sc.scope_type === 'NODE_ONLY') {
                    if (organizationId === sc.organization_node_id) {
                        isWithinSubtree = true;
                        break;
                    }
                }
            }
        }
        else {
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
    }
    // Base permission check
    const authz = await (0, authorization_1.authorize)(user, 'USER_CREATE', { type: 'USER', owningOrgId: organizationId }, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
    });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    try {
        const isNewUserAdmin = !!isLayerAdmin || roleId.includes('ADMIN');
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const newU = await (0, db_1.query)(`
      INSERT INTO users (
        username, email, display_name, badge_number, phone_number,
        designation, department_wing, clearance_level, is_layer_admin,
        password_hash, primary_role_id, primary_organization_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, username, email, display_name, badge_number, phone_number,
                designation, department_wing, clearance_level, is_layer_admin,
                status, primary_role_id, primary_organization_id, created_at;
    `, [
            username, email, displayName, badgeNumber || null, phoneNumber || null,
            designation || null, departmentWing || null, clearanceLevel || 'CONFIDENTIAL', isNewUserAdmin,
            passwordHash, roleId, organizationId
        ]);
        const newUserId = newU.rows[0].id;
        // Insert user_roles
        await (0, db_1.query)(`
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING;
    `, [newUserId, roleId]);
        // Insert admin_scopes if user is an admin
        if (isNewUserAdmin) {
            await (0, db_1.query)(`
        INSERT INTO admin_scopes (user_id, organization_node_id, scope_type)
        VALUES ($1, $2, 'SUBTREE')
        ON CONFLICT DO NOTHING;
      `, [newUserId, organizationId]);
        }
        const auditAction = isNewUserAdmin ? 'ADMIN_CREATED' : 'USER_CREATED';
        await (0, db_1.query)(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
      )
      VALUES ($1, $1, $2, $2, $3, $4, 'USER', $5, 'ALLOW', $6, $7, $8::jsonb, $8::jsonb);
    `, [
            user.userId, organizationId, targetOrg.body_id || targetOrg.agency_branch,
            auditAction, newUserId, req.ip, req.headers['user-agent'],
            JSON.stringify({ username, role: roleId, org: organizationId, is_layer_admin: isNewUserAdmin })
        ]);
        return res.status(201).json({ success: true, user: newU.rows[0] });
    }
    catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Conflict', message: 'Username or email is already registered' });
        }
        return res.status(500).json({ error: 'Server Error', message: 'Failed to create user' });
    }
});
// PUT /api/users/:id
router.put('/:id', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const targetUserId = req.params.id;
    const { displayName, badgeNumber, phoneNumber, designation, departmentWing, clearanceLevel, isLayerAdmin, roleId, organizationId } = req.body;
    const targetRes = await (0, db_1.query)(`
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
    const authz = await (0, authorization_1.authorize)(user, 'USER_UPDATE', {
        type: 'USER',
        id: targetUserId,
        owningOrgId: target.primary_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    await (0, db_1.query)(`
    UPDATE users
    SET display_name = COALESCE($1, display_name),
        badge_number = COALESCE($2, badge_number),
        phone_number = COALESCE($3, phone_number),
        designation = COALESCE($4, designation),
        department_wing = COALESCE($5, department_wing),
        clearance_level = COALESCE($6, clearance_level),
        is_layer_admin = COALESCE($7, is_layer_admin),
        primary_role_id = COALESCE($8, primary_role_id),
        primary_organization_id = COALESCE($9, primary_organization_id),
        updated_at = NOW()
    WHERE id = $10;
  `, [
        displayName, badgeNumber, phoneNumber, designation,
        departmentWing, clearanceLevel, isLayerAdmin, roleId, organizationId, targetUserId
    ]);
    if (roleId) {
        await (0, db_1.query)(`
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    `, [targetUserId, roleId]);
    }
    await (0, db_1.query)(`
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
router.put('/:id/status', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const targetUserId = req.params.id;
    const { status } = req.body;
    if (!['ACTIVE', 'LOCKED', 'SUSPENDED'].includes(status)) {
        return res.status(400).json({ error: 'Validation Error', message: 'Invalid status' });
    }
    const targetRes = await (0, db_1.query)(`
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
    const authz = await (0, authorization_1.authorize)(user, 'USER_DEACTIVATE', {
        type: 'USER',
        id: targetUserId,
        owningOrgId: target.primary_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    await (0, db_1.query)(`UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2;`, [status, targetUserId]);
    const auditAction = status !== 'ACTIVE' ? 'USER_DISABLED' : 'USER_STATUS_UPDATED';
    await (0, db_1.query)(`
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
async function logDecision(user, action, orgId, reason, req) {
    try {
        await (0, db_1.query)(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, result, ip_address, user_agent, metadata, after_value
      )
      VALUES ($1, $1, $2, $2, $3, $4, 'USER', 'DENY', $5, $6, json_build_object('reason', $7::text), json_build_object('reason', $7::text));
    `, [user.userId, orgId, user.bodyId || user.agencyBranch, action, req.ip, req.headers['user-agent'], reason]);
    }
    catch (err) {
        console.error('Audit log failed:', err);
    }
}
exports.default = router;
