import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import ticketRoutes from './routes/tickets';
import ledgerRoutes from './routes/ledger';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

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

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS Configuration
app.use(cors({
  origin: true, // Allow frontend dev origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
app.use('/api/tickets', ticketRoutes);
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(`  🛡️  SECURE MULTI-AGENCY PLATFORM BACKEND ONLINE`);
    console.log(`  🌐  Port: http://localhost:${PORT}`);
    console.log(`  🔒  Authorization Engine: ACTIVE`);
    console.log(`================================================================`);
  });

  server.on('error', (err) => {
    console.error('[LIFECYCLE] HTTP Server Error:', err);
  });

  // Keep event loop active
  setInterval(() => {}, 1000 * 60 * 60);
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

process.on('exit', (code) => {
  console.log(`[LIFECYCLE] process.on('exit') called with code:`, code);
});

process.on('beforeExit', (code) => {
  console.log(`[LIFECYCLE] process.on('beforeExit') called with code:`, code);
});

process.on('SIGTERM', () => {
  console.log(`[LIFECYCLE] Received SIGTERM signal`);
});

process.on('SIGINT', () => {
  console.log(`[LIFECYCLE] Received SIGINT signal`);
});

process.on('SIGHUP', () => {
  console.log(`[LIFECYCLE] Received SIGHUP signal`);
});

start().catch((err) => {
  console.error('Failed to start backend server:', err);
  process.exit(1);
});

export default app;
