"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = require("express-rate-limit");
const auth_1 = require("../services/auth");
const router = (0, express_1.Router)();
const isProd = process.env.NODE_ENV === 'production';
// Brute-force throttle: keyed by IP + username so an attacker cannot simply
// rotate one of the two. Combined with the account-level lockout (5 failed
// attempts -> 30 min) in services/auth.ts this gives layered protection.
const loginLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
        const uname = typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
        return `${(0, express_rate_limit_1.ipKeyGenerator)(req.ip || '')}|${uname}`;
    },
    handler: (_req, res) => res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: 'Too many authentication attempts for this identity/address. Please wait 15 minutes.',
    }),
});
// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const ua = req.headers['user-agent'] || '';
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Validation Error', message: 'Username and password are required' });
    }
    try {
        const result = await (0, auth_1.authenticateCredentials)(username, password, ip, ua);
        if (!result.success || !result.sessionToken || !result.user) {
            return res.status(result.code || 401).json({ error: 'Authentication Failed', message: result.error });
        }
        // Session material is delivered ONLY as an HttpOnly cookie -- never in the
        // response body (which would leak into dev tools, HAR captures and logs).
        res.cookie(auth_1.COOKIE_NAME, result.sessionToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000,
            path: '/',
        });
        return res.json({ success: true, user: result.user });
    }
    catch (err) {
        // Do not leak internal error details (message/stack) to the client.
        console.error('Auth login error:', err);
        return res.status(500).json({
            error: 'Authentication Error',
            message: 'An internal error occurred during authentication. The event has been logged.',
        });
    }
});
// POST /api/auth/logout
router.post('/logout', auth_1.requireAuth, async (req, res) => {
    const token = req.cookies?.[auth_1.COOKIE_NAME] || req.headers['authorization']?.replace('Bearer ', '');
    const ip = req.ip || '127.0.0.1';
    const ua = req.headers['user-agent'] || '';
    if (token) {
        await (0, auth_1.terminateSession)(token, req.userSession?.userId, ip, ua);
    }
    res.clearCookie(auth_1.COOKIE_NAME, { path: '/' });
    return res.json({ success: true, message: 'Logged out successfully' });
});
// GET /api/auth/me
router.get('/me', auth_1.requireAuth, (req, res) => {
    return res.json({
        authenticated: true,
        user: req.userSession,
    });
});
exports.default = router;
