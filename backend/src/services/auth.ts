import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { query } from './db';
import { sendOtpEmail } from './mailer';

export interface UserSessionPayload {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  badgeNumber?: string;
  governmentId?: string;
  phoneNumber?: string;
  designation?: string;
  departmentWing?: string;
  clearanceLevel: string;
  isLayerAdmin: boolean;
  roleId: string;
  roleName: string;
  agencyBranch: string;
  bodyId?: string;
  organizationId: string;
  organizationName: string;
  organizationCode: string;
  organizationPath: string;
  permissions: string[];
  adminScopes?: Array<{
    organizationNodeId: string;
    scopeType: string;
    orgName: string;
    orgCode: string;
    hierarchyPath: string;
  }>;
}

declare global {
  namespace Express {
    interface Request {
      userSession?: UserSessionPayload;
    }
  }
}

const SESSION_COOKIE_NAME = 'auth_session_token';
const SESSION_TTL_HOURS = 8;

export async function authenticateCredentials(username: string, plainPassword: string, ip: string, userAgent: string) {
  // Query user by username
  const userRes = await query(`
    SELECT u.id, u.username, u.email, u.display_name, u.badge_number, u.government_id, u.password_hash,
           u.phone_number, u.designation, u.department_wing, u.clearance_level, u.is_layer_admin,
           u.status, u.failed_login_count, u.locked_until,
           r.id as role_id, r.name as role_name, r.agency_branch as role_agency_branch,
           o.id as org_id, o.body_id, o.agency_branch as org_agency_branch, o.name as org_name, o.code as org_code, o.hierarchy_path as org_path
    FROM users u
    JOIN roles r ON u.primary_role_id = r.id
    JOIN organization_nodes o ON u.primary_organization_id = o.id
    WHERE LOWER(u.username) = LOWER($1)
       OR LOWER(u.email) = LOWER($1)
       OR LOWER(COALESCE(u.government_id, '')) = LOWER($1);
  `, [username.trim()]);

  if (userRes.rows.length === 0) {
    // Record login failure audit
    await query(`
      INSERT INTO audit_logs (action, resource_type, resource_id, result, ip_address, user_agent, after_value)
      VALUES ('LOGIN_FAILURE', 'USER', $1, 'DENY', $2, $3, '{"reason": "User not found"}');
    `, [username, ip, userAgent]);
    return { success: false, error: 'Invalid credentials or account inaccessible', code: 401 };
  }

  const u = userRes.rows[0];

  // Check account lockout
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const remainingMins = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / (60 * 1000));
    await query(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'LOGIN_LOCKOUT_DENIED', 'USER', $3, 'DENY', $4, $5, '{"reason": "Account locked"}');
    `, [u.id, u.org_id, u.username, ip, userAgent]);
    return { success: false, error: `Account locked due to consecutive failed attempts. Try again in ${remainingMins} minutes.`, code: 423 };
  }

  if (u.status !== 'ACTIVE') {
    return { success: false, error: 'Account has been disabled or suspended by an administrator.', code: 403 };
  }

  // Verify password hash
  const matches = await bcrypt.compare(plainPassword, u.password_hash);
  if (!matches) {
    const newCount = (u.failed_login_count || 0) + 1;
    let lockUntil = null;
    if (newCount >= 5) {
      lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 mins lock
    }

    await query(`
      UPDATE users
      SET failed_login_count = $1, locked_until = $2, updated_at = NOW()
      WHERE id = $3;
    `, [newCount, lockUntil, u.id]);

    await query(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'LOGIN_FAILURE', 'USER', $3, 'DENY', $4, $5, json_build_object('attempt', $6, 'locked', $7));
    `, [u.id, u.org_id, u.username, ip, userAgent, newCount, !!lockUntil]);

    return { success: false, error: 'Invalid credentials or account inaccessible', code: 401 };
  }

  // Password valid! Reset failed count & update last login
  await query(`
    UPDATE users
    SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
    WHERE id = $1;
  `, [u.id]);

  // Load user permissions
  const permRes = await query(`
    SELECT permission_id FROM role_permissions WHERE role_id = $1;
  `, [u.role_id]);
  const permissions = permRes.rows.map(r => r.permission_id);

  // Load admin scopes
  const scopesRes = await query(`
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
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const sessionHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  await query(`
    INSERT INTO user_sessions (id, user_id, ip_address, user_agent, expires_at)
    VALUES ($1, $2, $3, $4, $5);
  `, [sessionHash, u.id, ip, userAgent, expiresAt]);

  // Audit success
  const metaJson = JSON.stringify({ username: u.username });
  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
    )
    VALUES ($1, $1, $2, $2, $3, 'LOGIN', 'SESSION', $4, 'ALLOW', $5, $6, $7::jsonb, $7::jsonb);
  `, [u.id, u.org_id, u.body_id || u.agency_branch, u.username, ip, userAgent, metaJson]);

  const userPayload: UserSessionPayload = {
    userId: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name,
    badgeNumber: u.badge_number,
    governmentId: u.government_id || u.badge_number,
    phoneNumber: u.phone_number,
    designation: u.designation,
    departmentWing: u.department_wing,
    clearanceLevel: u.clearance_level || 'CONFIDENTIAL',
    isLayerAdmin: !!u.is_layer_admin,
    roleId: u.role_id,
    roleName: u.role_name,
    agencyBranch: (u.body_id || u.org_agency_branch || (u.role_agency_branch !== 'ALL' ? u.role_agency_branch : 'POLICE')) as any,
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

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@gov.in';
  const [user, domain] = email.split('@');
  const visible = user.length > 2 ? user.slice(0, 2) : user.slice(0, 1);
  return `${visible}***@${domain}`;
}

export async function requestLoginOtp(identifier: string, ip: string, userAgent: string) {
  const trimmed = identifier.trim().toLowerCase();
  const userRes = await query(`
    SELECT u.id, u.username, u.email, u.display_name, u.status, u.locked_until,
           u.primary_organization_id as org_id, o.body_id, o.agency_branch
    FROM users u
    JOIN organization_nodes o ON u.primary_organization_id = o.id
    WHERE LOWER(u.email) = $1 
       OR LOWER(u.username) = $1 
       OR LOWER(COALESCE(u.government_id, '')) = $1
       OR LOWER(COALESCE(u.badge_number, '')) = $1;
  `, [trimmed]);

  if (userRes.rows.length === 0) {
    await query(`
      INSERT INTO audit_logs (action, resource_type, resource_id, result, ip_address, user_agent, after_value)
      VALUES ('LOGIN_OTP_DENIED', 'USER', $1, 'DENY', $2, $3, '{"reason": "User not found for OTP request"}');
    `, [identifier, ip, userAgent]);
    return { success: false, error: 'No official personnel account found matching this identifier', code: 404 };
  }

  const u = userRes.rows[0];

  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const remainingMins = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / (60 * 1000));
    return { success: false, error: `Account locked due to consecutive failed attempts. Try again in ${remainingMins} minutes.`, code: 423 };
  }

  if (u.status !== 'ACTIVE') {
    return { success: false, error: 'Account has been disabled or suspended by an administrator.', code: 403 };
  }

  // Invalidate previous unconsumed OTPs for this email
  await query(`
    UPDATE login_otps SET consumed = TRUE 
    WHERE LOWER(email) = LOWER($1) AND consumed = FALSE;
  `, [u.email]);

  // Generate 6-digit cryptographic OTP
  const otpCode = Math.floor(100000 + crypto.randomInt(900000)).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await query(`
    INSERT INTO login_otps (email, otp_code, expires_at, ip_address)
    VALUES ($1, $2, $3, $4);
  `, [u.email.toLowerCase(), otpCode, expiresAt, ip]);

  // Audit OTP Request
  const otpMeta = JSON.stringify({ email: u.email, method: 'PASSWORDLESS_OTP' });
  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata
    )
    VALUES ($1, $1, $2, $2, $3, 'LOGIN_OTP_REQUESTED', 'SESSION', $4, 'ALLOW', $5, $6, $7::jsonb);
  `, [u.id, u.org_id, u.body_id || u.agency_branch, u.email, ip, userAgent, otpMeta]);

  console.log(`[LEA AUTH GATEWAY] Login OTP generated for ${u.email}: [ ${otpCode} ] (Valid 10 mins)`);

  const mailResult = await sendOtpEmail(u.email, otpCode, 'LOGIN_AUTHENTICATION', {
    displayName: u.display_name,
    ipAddress: ip,
  });

  return {
    success: true,
    message: mailResult.mode === 'LIVE_SMTP'
      ? `Verification code dispatched via secure SMTP relay to registered government email ${maskEmail(u.email)}`
      : `Verification code sent to registered government email ${maskEmail(u.email)}`,
    email: u.email,
    emailMasked: maskEmail(u.email),
    devOtpPreview: otpCode,
    deliveryMode: mailResult.mode,
  };
}

export async function verifyLoginOtp(identifier: string, otpCode: string, ip: string, userAgent: string) {
  const trimmed = identifier.trim().toLowerCase();
  const userRes = await query(`
    SELECT u.id, u.username, u.email, u.display_name, u.badge_number, u.government_id,
           u.phone_number, u.designation, u.department_wing, u.clearance_level, u.is_layer_admin,
           u.status, u.failed_login_count, u.locked_until,
           r.id as role_id, r.name as role_name, r.agency_branch as role_agency_branch,
           o.id as org_id, o.body_id, o.agency_branch as org_agency_branch, o.name as org_name, o.code as org_code, o.hierarchy_path as org_path
    FROM users u
    JOIN roles r ON u.primary_role_id = r.id
    JOIN organization_nodes o ON u.primary_organization_id = o.id
    WHERE LOWER(u.email) = $1 
       OR LOWER(u.username) = $1 
       OR LOWER(COALESCE(u.government_id, '')) = $1
       OR LOWER(COALESCE(u.badge_number, '')) = $1;
  `, [trimmed]);

  if (userRes.rows.length === 0) {
    return { success: false, error: 'Official personnel account not found', code: 404 };
  }

  const u = userRes.rows[0];

  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    const remainingMins = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / (60 * 1000));
    return { success: false, error: `Account locked. Try again in ${remainingMins} minutes.`, code: 423 };
  }

  if (u.status !== 'ACTIVE') {
    return { success: false, error: 'Account suspended or inactive.', code: 403 };
  }

  // Check valid unconsumed OTP
  const otpRes = await query(`
    SELECT id, otp_code, expires_at 
    FROM login_otps 
    WHERE LOWER(email) = LOWER($1) AND consumed = FALSE AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1;
  `, [u.email]);

  if (otpRes.rows.length === 0 || otpRes.rows[0].otp_code !== otpCode.trim()) {
    const newCount = (u.failed_login_count || 0) + 1;
    let lockUntil = null;
    if (newCount >= 5) {
      lockUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
    await query(`
      UPDATE users SET failed_login_count = $1, locked_until = $2, updated_at = NOW() WHERE id = $3;
    `, [newCount, lockUntil, u.id]);

    await query(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'LOGIN_FAILURE', 'USER', $3, 'DENY', $4, $5, json_build_object('reason', 'Invalid OTP', 'attempt', $6));
    `, [u.id, u.org_id, u.email, ip, userAgent, newCount]);

    return { success: false, error: 'Invalid or expired one-time verification code', code: 401 };
  }

  // Mark OTP consumed
  await query(`UPDATE login_otps SET consumed = TRUE WHERE id = $1;`, [otpRes.rows[0].id]);

  // Reset failed login count
  await query(`
    UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
    WHERE id = $1;
  `, [u.id]);

  // Load user permissions
  const permRes = await query(`SELECT permission_id FROM role_permissions WHERE role_id = $1;`, [u.role_id]);
  const permissions = permRes.rows.map(r => r.permission_id);

  // Load admin scopes
  const scopesRes = await query(`
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

  // Generate session token
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const sessionHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  await query(`
    INSERT INTO user_sessions (id, user_id, ip_address, user_agent, expires_at)
    VALUES ($1, $2, $3, $4, $5);
  `, [sessionHash, u.id, ip, userAgent, expiresAt]);

  // Audit login success
  const metaJson = JSON.stringify({ email: u.email, username: u.username, method: 'PASSWORDLESS_OTP' });
  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
    )
    VALUES ($1, $1, $2, $2, $3, 'LOGIN', 'SESSION', $4, 'ALLOW', $5, $6, $7::jsonb, $7::jsonb);
  `, [u.id, u.org_id, u.body_id || u.agency_branch, u.username, ip, userAgent, metaJson]);

  const userPayload: UserSessionPayload = {
    userId: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name,
    badgeNumber: u.badge_number,
    governmentId: u.government_id || u.badge_number,
    phoneNumber: u.phone_number,
    designation: u.designation,
    departmentWing: u.department_wing,
    clearanceLevel: u.clearance_level || 'CONFIDENTIAL',
    isLayerAdmin: !!u.is_layer_admin,
    roleId: u.role_id,
    roleName: u.role_name,
    agencyBranch: (u.body_id || u.org_agency_branch || (u.role_agency_branch !== 'ALL' ? u.role_agency_branch : 'POLICE')) as any,
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

export async function terminateSession(sessionToken: string, userId?: string, ip?: string, userAgent?: string) {
  if (!sessionToken) return;
  const sessionHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
  await query(`DELETE FROM user_sessions WHERE id = $1;`, [sessionHash]);
  if (userId) {
    await query(`
      INSERT INTO audit_logs (user_id, actor_user_id, action, resource_type, resource_id, result, ip_address, user_agent)
      VALUES ($1, $1, 'LOGOUT', 'SESSION', $2, 'SUCCESS', $3, $4);
    `, [userId, userId, ip || '127.0.0.1', userAgent || '']);
  }
}

// Session Validation Middleware
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME] || req.headers['authorization']?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      error: 'Authentication Required',
      message: 'Unauthenticated request. Please log in to access this protected institutional resource.',
      status: 401,
    });
  }

  const sessionHash = crypto.createHash('sha256').update(token).digest('hex');

  const sessRes = await query(`
    SELECT s.id as session_id, s.expires_at,
           u.id as user_id, u.username, u.email, u.display_name, u.badge_number, u.government_id,
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
  const permRes = await query(`
    SELECT permission_id FROM role_permissions WHERE role_id = $1;
  `, [s.role_id]);
  const permissions = permRes.rows.map(r => r.permission_id);

  // Load admin scopes
  const scopesRes = await query(`
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
    email: s.email,
    displayName: s.display_name,
    badgeNumber: s.badge_number,
    governmentId: s.government_id || s.badge_number,
    phoneNumber: s.phone_number,
    designation: s.designation,
    departmentWing: s.department_wing,
    clearanceLevel: s.clearance_level || 'CONFIDENTIAL',
    isLayerAdmin: !!s.is_layer_admin,
    roleId: s.role_id,
    roleName: s.role_name,
    agencyBranch: (s.body_id || s.org_agency_branch || (s.role_agency_branch !== 'ALL' ? s.role_agency_branch : 'POLICE')) as any,
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

export const COOKIE_NAME = SESSION_COOKIE_NAME;
