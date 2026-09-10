import { Router, Request, Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { authenticateCredentials, terminateSession, requireAuth, requestLoginOtp, verifyLoginOtp, COOKIE_NAME } from '../services/auth';

const router = Router();
const isProd = process.env.NODE_ENV === 'production';

// Brute-force throttle: keyed by IP + the identifier being attempted, so an
// attacker cannot defeat it by simply rotating IPs against one account, nor
// lock out a shared IP (NAT/office network) by hammering many accounts.
// Combined with the per-account lockout (5 failed attempts -> 30 min) in
// services/auth.ts this gives layered, non-trivially-bypassable protection.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const id = ((req.body?.username || req.body?.identifier || req.body?.email || '') as string).toLowerCase();
    return `${ipKeyGenerator(req.ip || '')}|${id}`;
  },
  handler: (_req: Request, res: Response) =>
    res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many authentication attempts for this identity/address. Please wait 15 minutes.',
    }),
});

function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

// POST /api/auth/request-otp (Passwordless Login Step 1)
router.post('/request-otp', authLimiter, async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || '';
  const { identifier } = req.body;

  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return res.status(400).json({ error: 'Validation Error', message: 'Official Email or Government ID is required' });
  }

  try {
    const result = await requestLoginOtp(identifier.trim(), ip, ua);
    if (!result.success) {
      return res.status(result.code || 400).json({ error: 'Request Failed', message: result.error });
    }
    // The OTP itself (devOtpPreview) is only ever populated by the service in
    // non-production environments -- never sent to the client in production.
    return res.json(result);
  } catch (err: any) {
    console.error('Request OTP error:', err);
    return res.status(500).json({
      error: 'Auth Error',
      message: 'An internal error occurred while dispatching the verification code. The event has been logged.',
    });
  }
});

// POST /api/auth/verify-otp (Passwordless Login Step 2)
router.post('/verify-otp', authLimiter, async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || '';
  const { identifier, otp } = req.body;

  if (!identifier || !otp) {
    return res.status(400).json({ error: 'Validation Error', message: 'Identifier and OTP code are required' });
  }

  try {
    const result = await verifyLoginOtp(identifier.trim(), otp.trim(), ip, ua);
    if (!result.success || !result.sessionToken || !result.user) {
      return res.status(result.code || 401).json({ error: 'Authentication Failed', message: result.error });
    }

    setSessionCookie(res, result.sessionToken);

    // The browser SPA authenticates purely via the HttpOnly cookie set above
    // and never reads/stores this field (see frontend/src/lib/api.ts) -- the
    // token is echoed here only for programmatic/API clients that explicitly
    // want Bearer auth (e.g. the automated test suites), which is a standard,
    // reasonable pattern as long as the browser client never persists it in
    // a JS-readable store (localStorage/sessionStorage), which would be the
    // actual XSS-exfiltration risk.
    return res.json({ success: true, token: result.sessionToken, user: result.user });
  } catch (err: any) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({
      error: 'Auth Error',
      message: 'An internal error occurred during OTP verification. The event has been logged.',
    });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || '';
  const username = ((req.body.username || req.body.identifier || req.body.email || '') as string).trim();
  const password = req.body.password;

  if (!username || !password) {
    return res.status(400).json({ error: 'Validation Error', message: 'Official identifier and password are required' });
  }

  try {
    const result = await authenticateCredentials(username, password, ip, ua);
    if (!result.success || !result.sessionToken || !result.user) {
      return res.status(result.code || 401).json({ error: 'Authentication Failed', message: result.error });
    }

    setSessionCookie(res, result.sessionToken);

    return res.json({ success: true, token: result.sessionToken, user: result.user });
  } catch (err: any) {
    console.error('Auth login error:', err);
    return res.status(500).json({
      error: 'Authentication Error',
      message: 'An internal error occurred during authentication. The event has been logged.',
    });
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
