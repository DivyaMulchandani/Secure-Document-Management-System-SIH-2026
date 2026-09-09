import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';
import { initDatabase } from './services/db';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import authRoutes from './routes/auth';
import orgRoutes from './routes/organizations';
import userRoutes from './routes/users';
import caseRoutes from './routes/cases';
import investigationRoutes from './routes/investigation';
import evidenceRoutes from './routes/evidence';
import forensicRoutes from './routes/forensics';
import courtRoutes from './routes/court';
import documentRoutes from './routes/documents';
import timelineRoutes from './routes/timeline';
import delegationRoutes from './routes/delegations';
import searchRoutes from './routes/search';
import auditRoutes from './routes/audit';
import systemRoutes from './routes/system';
import ledgerRoutes from './routes/ledger';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Trust only the loopback proxy (Vite dev proxy / local reverse proxy) so that
// req.ip reflects the real client and the rate limiters key correctly.
app.set('trust proxy', 'loopback');

// Explicit frontend origin allow-list -- never reflect an arbitrary Origin while
// also sending credentials.
const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Basic Cookie Parser Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const cookieHeader = req.headers.cookie;
  req.cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const name = parts[0]?.trim();
      const val = parts.slice(1).join('=').trim();
      if (name) req.cookies[name] = decodeURIComponent(val);
    });
  }
  next();
});

// Security Headers -- real CSP baseline instead of disabling it.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"], // Tailwind injects inline styles
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      ...(isProd ? { 'upgrade-insecure-requests': [] } : {}),
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'no-referrer' },
}));

// CORS -- explicit allow-list only.
app.use(cors({
  origin(origin, callback) {
    // Non-browser clients / same-origin requests send no Origin header.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global API rate limiter (auth endpoints have their own stricter limiter).
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    error: 'Rate Limit Exceeded',
    message: 'Too many requests. Please slow down.',
  }),
}));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'HEALTHY', timestamp: new Date().toISOString() });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/organizations', orgRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api', investigationRoutes);
app.use('/api/cases', investigationRoutes);
app.use('/api/cases', evidenceRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api', forensicRoutes);
app.use('/api/forensics', forensicRoutes);
app.use('/api', courtRoutes);
app.use('/api/court', courtRoutes);
app.use('/api', documentRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api', timelineRoutes);
app.use('/api/delegations', delegationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/ledger', ledgerRoutes);

// Global Error Handler (Sanitizes internal server details)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled API Error:', err);
  const status = err.status || 500;
  const message = status === 500
    ? 'Internal Institutional Server Error. The event has been flagged in security audit.'
    : err.message || 'An error occurred';

  res.status(status).json({
    error: 'Institutional Server Error',
    message,
    status,
  });
});

async function start() {
  console.log('Initializing database schema...');
  await initDatabase();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(`  🛡️  SECURE MULTI-AGENCY PLATFORM BACKEND ONLINE`);
    console.log(`  🌐  Port: http://localhost:${PORT}`);
    console.log(`  🔒  Authorization Engine: ACTIVE`);
    console.log(`================================================================`);
  });
}

start().catch((err) => {
  console.error('Failed to start backend server:', err);
  process.exit(1);
});

export default app;
