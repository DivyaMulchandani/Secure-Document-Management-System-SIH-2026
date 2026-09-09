"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("./services/db");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const auth_1 = __importDefault(require("./routes/auth"));
const organizations_1 = __importDefault(require("./routes/organizations"));
const users_1 = __importDefault(require("./routes/users"));
const cases_1 = __importDefault(require("./routes/cases"));
const investigation_1 = __importDefault(require("./routes/investigation"));
const evidence_1 = __importDefault(require("./routes/evidence"));
const forensics_1 = __importDefault(require("./routes/forensics"));
const court_1 = __importDefault(require("./routes/court"));
const documents_1 = __importDefault(require("./routes/documents"));
const timeline_1 = __importDefault(require("./routes/timeline"));
const delegations_1 = __importDefault(require("./routes/delegations"));
const search_1 = __importDefault(require("./routes/search"));
const audit_1 = __importDefault(require("./routes/audit"));
const system_1 = __importDefault(require("./routes/system"));
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '5000', 10);
// Basic Cookie Parser Middleware
app.use((req, res, next) => {
    const cookieHeader = req.headers.cookie;
    req.cookies = {};
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            const name = parts[0]?.trim();
            const val = parts.slice(1).join('=').trim();
            if (name)
                req.cookies[name] = decodeURIComponent(val);
        });
    }
    next();
});
// Security Headers
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));
// CORS Configuration
app.use((0, cors_1.default)({
    origin: true, // Allow frontend dev origin
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'HEALTHY', timestamp: new Date().toISOString() });
});
// Mount Routes
app.use('/api/auth', auth_1.default);
app.use('/api/organizations', organizations_1.default);
app.use('/api/users', users_1.default);
app.use('/api/cases', cases_1.default);
app.use('/api', investigation_1.default);
app.use('/api/cases', investigation_1.default);
app.use('/api/cases', evidence_1.default);
app.use('/api/evidence', evidence_1.default);
app.use('/api', forensics_1.default);
app.use('/api/forensics', forensics_1.default);
app.use('/api', court_1.default);
app.use('/api/court', court_1.default);
app.use('/api', documents_1.default);
app.use('/api/documents', documents_1.default);
app.use('/api', timeline_1.default);
app.use('/api/delegations', delegations_1.default);
app.use('/api/search', search_1.default);
app.use('/api/audit', audit_1.default);
app.use('/api/system', system_1.default);
// Global Error Handler (Sanitizes internal server details)
app.use((err, req, res, next) => {
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
    await (0, db_1.initDatabase)();
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
exports.default = app;
