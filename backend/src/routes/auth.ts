import { Router, Request, Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { authenticateCredentials, terminateSession, requireAuth, COOKIE_NAME } from '../services/auth';

const router = Router();

const isProd = process.env.NODE_ENV === 'production';

// Brute-force throttle: keyed by IP + username so an attacker cannot simply
// rotate one of the two. Combined with the account-level lockout (5 failed
// attempts -> 30 min) in services/auth.ts this gives layered protection.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const uname = typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
    return `${ipKeyGenerator(req.ip || '')}|${uname}`;
  },
  handler: (_req: Request, res: Response) =>
    res.status(429).json({
      error: 'Rate Limit Exceeded',
      message: 'Too many authentication attempts for this identity/address. Please wait 15 minutes.',
    }),
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || '';
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Validation Error', message: 'Username and password are required' });
  }

  try {
    const result = await authenticateCredentials(username, password, ip, ua);
    if (!result.success || !result.sessionToken || !result.user) {
      return res.status(result.code || 401).json({ error: 'Authentication Failed', message: result.error });
    }

    // Session material is delivered ONLY as an HttpOnly cookie -- never in the
    // response body (which would leak into dev tools, HAR captures and logs).
    res.cookie(COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    return res.json({ success: true, user: result.user });
  } catch (err: any) {
    // Do not leak internal error details (message/stack) to the client.
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
