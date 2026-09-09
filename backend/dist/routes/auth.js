"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../services/auth");
const router = (0, express_1.Router)();
// Rate limiting map for IP brute-force protection
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 mins
const MAX_ATTEMPTS = 250;
function checkRateLimit(ip) {
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
// POST /api/auth/login
router.post('/login', async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const ua = req.headers['user-agent'] || '';
    const { username, password } = req.body;
    if (!checkRateLimit(ip)) {
        return res.status(429).json({
            error: 'Rate Limit Exceeded',
            message: 'Too many authentication attempts from this IP. Please wait 15 minutes.',
        });
    }
    if (!username || !password) {
        return res.status(400).json({ error: 'Validation Error', message: 'Username and password are required' });
    }
    try {
        const result = await (0, auth_1.authenticateCredentials)(username, password, ip, ua);
        if (!result.success || !result.sessionToken || !result.user) {
            return res.status(result.code || 401).json({ error: 'Authentication Failed', message: result.error });
        }
        loginAttempts.delete(ip);
        // Set HTTP-Only Secure Cookie
        res.cookie(auth_1.COOKIE_NAME, result.sessionToken, {
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
    }
    catch (err) {
        console.error('Auth login caught error:', err);
        return res.status(500).json({ error: 'Auth Error', detail: err.message, stack: err.stack });
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
