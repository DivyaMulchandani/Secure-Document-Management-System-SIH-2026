"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.COOKIE_NAME = void 0;
exports.authenticateCredentials = authenticateCredentials;
exports.terminateSession = terminateSession;
exports.requireAuth = requireAuth;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
const SESSION_COOKIE_NAME = 'auth_session_token';
const SESSION_TTL_HOURS = 8;
async function authenticateCredentials(username, plainPassword, ip, userAgent) {
    // Query user by username
    const userRes = await (0, db_1.query)(`
    SELECT u.id, u.username, u.email, u.display_name, u.badge_number, u.password_hash,
           u.phone_number, u.designation, u.department_wing, u.clearance_level, u.is_layer_admin,
           u.status, u.failed_login_count, u.locked_until,
           r.id as role_id, r.name as role_name, r.agency_branch as role_agency_branch,
           o.id as org_id, o.body_id, o.agency_branch as org_agency_branch, o.name as org_name, o.code as org_code, o.hierarchy_path as org_path
    FROM users u
    JOIN roles r ON u.primary_role_id = r.id
    JOIN organization_nodes o ON u.primary_organization_id = o.id
    WHERE LOWER(u.username) = LOWER($1);
  `, [username]);
    if (userRes.rows.length === 0) {
        // Record login failure audit
        await (0, db_1.query)(`
      INSERT INTO audit_logs (action, resource_type, resource_id, result, ip_address, user_agent, after_value)
      VALUES ('LOGIN_FAILURE', 'USER', $1, 'DENY', $2, $3, '{"reason": "User not found"}');
    `, [username, ip, userAgent]);
        return { success: false, error: 'Invalid credentials or account inaccessible', code: 401 };
    }
    const u = userRes.rows[0];
    // Check account lockout
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
        const remainingMins = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / (60 * 1000));
        await (0, db_1.query)(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'LOGIN_LOCKOUT_DENIED', 'USER', $3, 'DENY', $4, $5, '{"reason": "Account locked"}');
    `, [u.id, u.org_id, u.username, ip, userAgent]);
        return { success: false, error: `Account locked due to consecutive failed attempts. Try again in ${remainingMins} minutes.`, code: 423 };
    }
    if (u.status !== 'ACTIVE') {
        return { success: false, error: 'Account has been disabled or suspended by an administrator.', code: 403 };
    }
    // Verify password hash
    const matches = await bcryptjs_1.default.compare(plainPassword, u.password_hash);
    if (!matches) {
        const newCount = (u.failed_login_count || 0) + 1;
        let lockUntil = null;
        if (newCount >= 5) {
            lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 mins lock
        }
        await (0, db_1.query)(`
      UPDATE users
      SET failed_login_count = $1, locked_until = $2, updated_at = NOW()
      WHERE id = $3;
    `, [newCount, lockUntil, u.id]);
        await (0, db_1.query)(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'LOGIN_FAILURE', 'USER', $3, 'DENY', $4, $5, json_build_object('attempt', $6, 'locked', $7));
    `, [u.id, u.org_id, u.username, ip, userAgent, newCount, !!lockUntil]);
        return { success: false, error: 'Invalid credentials or account inaccessible', code: 401 };
    }
    // Password valid! Reset failed count & update last login
    await (0, db_1.query)(`
    UPDATE users
    SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
    WHERE id = $1;
  `, [u.id]);
    // Load user permissions
    const permRes = await (0, db_1.query)(`
    SELECT permission_id FROM role_permissions WHERE role_id = $1;
  `, [u.role_id]);
    const permissions = permRes.rows.map(r => r.permission_id);
    // Load admin scopes
    const scopesRes = await (0, db_1.query)(`
    SELECT s.organization_node_id, s.scope_type, o.name as org_name, o.code as org_code, o.hierarchy_path
    FROM admin_scopes s
    JOIN organization_nodes o ON s.organization_node_id = o.id
    WHERE s.user_id = $1;
  `, [u.id]);
    const adminScopes = scopesRes.rows.map(r => ({
        organizationNodeId: r.organization_node_id,
        scopeType: r.scope_type,
        orgName: r.org_name,
        orgCode: r.org_code,
        hierarchyPath: r.hierarchy_path,
    }));
    // Generate high-entropy session token
    const sessionToken = crypto_1.default.randomBytes(32).toString('hex');
    const sessionHash = crypto_1.default.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
    await (0, db_1.query)(`
    INSERT INTO user_sessions (id, user_id, ip_address, user_agent, expires_at)
    VALUES ($1, $2, $3, $4, $5);
  `, [sessionHash, u.id, ip, userAgent, expiresAt]);
    // Audit success
    const metaJson = JSON.stringify({ username: u.username });
    await (0, db_1.query)(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
    )
    VALUES ($1, $1, $2, $2, $3, 'LOGIN', 'SESSION', $4, 'ALLOW', $5, $6, $7::jsonb, $7::jsonb);
  `, [u.id, u.org_id, u.body_id || u.agency_branch, u.username, ip, userAgent, metaJson]);
    const userPayload = {
        userId: u.id,
        username: u.username,
        displayName: u.display_name,
        badgeNumber: u.badge_number,
        phoneNumber: u.phone_number,
        designation: u.designation,
        departmentWing: u.department_wing,
        clearanceLevel: u.clearance_level || 'CONFIDENTIAL',
        isLayerAdmin: !!u.is_layer_admin,
        roleId: u.role_id,
        roleName: u.role_name,
        agencyBranch: (u.body_id || u.org_agency_branch || (u.role_agency_branch !== 'ALL' ? u.role_agency_branch : 'POLICE')),
        bodyId: u.body_id || u.org_agency_branch,
        organizationId: u.org_id,
        organizationName: u.org_name,
        organizationCode: u.org_code,
        organizationPath: u.org_path,
        permissions,
        adminScopes,
    };
    return { success: true, sessionToken, user: userPayload };
}
async function terminateSession(sessionToken, userId, ip, userAgent) {
    if (!sessionToken)
        return;
    const sessionHash = crypto_1.default.createHash('sha256').update(sessionToken).digest('hex');
    await (0, db_1.query)(`DELETE FROM user_sessions WHERE id = $1;`, [sessionHash]);
    if (userId) {
        await (0, db_1.query)(`
      INSERT INTO audit_logs (user_id, actor_user_id, action, resource_type, resource_id, result, ip_address, user_agent)
      VALUES ($1, $1, 'LOGOUT', 'SESSION', $2, 'SUCCESS', $3, $4);
    `, [userId, userId, ip || '127.0.0.1', userAgent || '']);
    }
}
// Session Validation Middleware
async function requireAuth(req, res, next) {
    const token = req.cookies?.[SESSION_COOKIE_NAME] || req.headers['authorization']?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({
            error: 'Authentication Required',
            message: 'Unauthenticated request. Please log in to access this protected institutional resource.',
            status: 401,
        });
    }
    const sessionHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
    const sessRes = await (0, db_1.query)(`
    SELECT s.id as session_id, s.expires_at,
           u.id as user_id, u.username, u.display_name, u.badge_number,
           u.phone_number, u.designation, u.department_wing, u.clearance_level, u.is_layer_admin,
           u.status as user_status,
           r.id as role_id, r.name as role_name, r.agency_branch as role_agency_branch,
           o.id as org_id, o.body_id, o.agency_branch as org_agency_branch, o.name as org_name, o.code as org_code, o.hierarchy_path as org_path
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    JOIN roles r ON u.primary_role_id = r.id
    JOIN organization_nodes o ON u.primary_organization_id = o.id
    WHERE s.id = $1 AND s.expires_at > NOW();
  `, [sessionHash]);
    if (sessRes.rows.length === 0) {
        return res.status(401).json({
            error: 'Session Expired or Invalid',
            message: 'Session is invalid or has expired. Please re-authenticate.',
            status: 401,
        });
    }
    const s = sessRes.rows[0];
    if (s.user_status !== 'ACTIVE') {
        return res.status(403).json({
            error: 'Account Suspended',
            message: 'Your account is not active. Access denied.',
            status: 403,
        });
    }
    // Load permissions
    const permRes = await (0, db_1.query)(`
    SELECT permission_id FROM role_permissions WHERE role_id = $1;
  `, [s.role_id]);
    const permissions = permRes.rows.map(r => r.permission_id);
    // Load admin scopes
    const scopesRes = await (0, db_1.query)(`
    SELECT s.organization_node_id, s.scope_type, o.name as org_name, o.code as org_code, o.hierarchy_path
    FROM admin_scopes s
    JOIN organization_nodes o ON s.organization_node_id = o.id
    WHERE s.user_id = $1;
  `, [s.user_id]);
    const adminScopes = scopesRes.rows.map(r => ({
        organizationNodeId: r.organization_node_id,
        scopeType: r.scope_type,
        orgName: r.org_name,
        orgCode: r.org_code,
        hierarchyPath: r.hierarchy_path,
    }));
    req.userSession = {
        userId: s.user_id,
        username: s.username,
        displayName: s.display_name,
        badgeNumber: s.badge_number,
        phoneNumber: s.phone_number,
        designation: s.designation,
        departmentWing: s.department_wing,
        clearanceLevel: s.clearance_level || 'CONFIDENTIAL',
        isLayerAdmin: !!s.is_layer_admin,
        roleId: s.role_id,
        roleName: s.role_name,
        agencyBranch: (s.body_id || s.org_agency_branch || (s.role_agency_branch !== 'ALL' ? s.role_agency_branch : 'POLICE')),
        bodyId: s.body_id || s.org_agency_branch,
        organizationId: s.org_id,
        organizationName: s.org_name,
        organizationCode: s.org_code,
        organizationPath: s.org_path,
        permissions,
        adminScopes,
    };
    next();
}
exports.COOKIE_NAME = SESSION_COOKIE_NAME;
