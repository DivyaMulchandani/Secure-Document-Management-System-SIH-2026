import { Router, Request, Response } from 'express';
import { authenticateCredentials, terminateSession, requireAuth, requestLoginOtp, verifyLoginOtp, COOKIE_NAME } from '../services/auth';

const router = Router();

// Rate limiting map for IP brute-force protection
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 mins
const MAX_ATTEMPTS = 250;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }
  if (now - record.firstAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }
  record.count++;
  return record.count <= MAX_ATTEMPTS;
}

// POST /api/auth/request-otp (Passwordless Login Step 1)
router.post('/request-otp', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || '';
  const { identifier } = req.body;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many authentication attempts from this IP. Please wait 15 minutes.',
    });
  }

  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return res.status(400).json({ error: 'Validation Error', message: 'Official Email or Government ID is required' });
  }

  try {
    const result = await requestLoginOtp(identifier.trim(), ip, ua);
    if (!result.success) {
      return res.status(result.code || 400).json({ error: 'Request Failed', message: result.error });
    }
    return res.json(result);
  } catch (err: any) {
    console.error('Request OTP caught error:', err);
    return res.status(500).json({ error: 'Auth Error', detail: err.message });
  }
});

// POST /api/auth/verify-otp (Passwordless Login Step 2)
router.post('/verify-otp', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || '';
  const { identifier, otp } = req.body;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many authentication attempts from this IP. Please wait 15 minutes.',
    });
  }

  if (!identifier || !otp) {
    return res.status(400).json({ error: 'Validation Error', message: 'Identifier and OTP code are required' });
  }

  try {
    const result = await verifyLoginOtp(identifier.trim(), otp.trim(), ip, ua);
    if (!result.success || !result.sessionToken || !result.user) {
      return res.status(result.code || 401).json({ error: 'Authentication Failed', message: result.error });
    }

    loginAttempts.delete(ip);

    // Set HTTP-Only Secure Cookie
    res.cookie(COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: false, // Set to true if HTTPS
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    return res.json({
      success: true,
      token: result.sessionToken,
      user: result.user,
    });
  } catch (err: any) {
    console.error('Verify OTP caught error:', err);
    return res.status(500).json({ error: 'Auth Error', detail: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || '';
  const username = ((req.body.username || req.body.identifier || req.body.email || '') as string).trim();
  const password = req.body.password;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many authentication attempts from this IP. Please wait 15 minutes.',
    });
  }

  if (!username || !password) {
    return res.status(400).json({ error: 'Validation Error', message: 'Official identifier and password are required' });
  }

  try {
    const result = await authenticateCredentials(username, password, ip, ua);
    if (!result.success || !result.sessionToken || !result.user) {
      return res.status(result.code || 401).json({ error: 'Authentication Failed', message: result.error });
    }

    loginAttempts.delete(ip);

    // Set HTTP-Only Secure Cookie
    res.cookie(COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: false, // Set to true if HTTPS
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    return res.json({
      success: true,
      token: result.sessionToken,
      user: result.user,
    });
  } catch (err: any) {
    console.error('Auth login caught error:', err);
    return res.status(500).json({ error: 'Auth Error', detail: err.message, stack: err.stack });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  const token = req.cookies?.[COOKIE_NAME] || req.headers['authorization']?.replace('Bearer ', '');
  const ip = req.ip || '127.0.0.1';
  const ua = req.headers['user-agent'] || '';

  if (token) {
    await terminateSession(token, req.userSession?.userId, ip, ua);
  }

  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  return res.json({
    authenticated: true,
    user: req.userSession,
  });
});

export default router;
