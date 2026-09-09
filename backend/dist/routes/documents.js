"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const db_1 = require("../services/db");
const auth_1 = require("../services/auth");
const authorization_1 = require("../services/authorization");
const documents_1 = require("../services/documents");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    storage: multer_1.default.memoryStorage(),
});
// GET /api/cases/:id/documents
router.get('/cases/:id/documents', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'DOCUMENT_READ', {
        type: 'DOCUMENT',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    const docs = await (0, db_1.query)(`
    SELECT d.id, d.case_id, d.title, d.category, d.file_name, d.mime_type,
           d.file_size_bytes, d.sha256_hash, d.version, d.classification, d.created_at,
           u.display_name as uploaded_by_name, o.name as owning_org_name
    FROM documents d
    JOIN users u ON d.uploaded_by_id = u.id
    JOIN organization_nodes o ON d.owning_organization_id = o.id
    WHERE d.case_id = $1 AND d.status = 'ACTIVE'
    ORDER BY d.created_at DESC;
  `, [caseId]);
    return res.json({ documents: docs.rows });
});
// POST /api/cases/:id/documents (Secure Upload)
router.post('/cases/:id/documents', auth_1.requireAuth, upload.single('file'), async (req, res) => {
    const user = req.userSession;
    const caseId = req.params.id;
    const { title, category, classification } = req.body;
    const file = req.file;
    if (!file || !title || !category) {
        return res.status(400).json({ error: 'Validation Error', message: 'File, title, and category are required' });
    }
    const caseRes = await (0, db_1.query)(`SELECT originating_organization_id FROM cases WHERE id = $1;`, [caseId]);
    if (caseRes.rows.length === 0)
        return res.status(404).json({ error: 'Not Found', message: 'Case not found' });
    const authz = await (0, authorization_1.authorize)(user, 'DOCUMENT_UPLOAD', {
        type: 'DOCUMENT',
        caseId,
        owningOrgId: caseRes.rows[0].originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    // Content-signature + AV validation BEFORE anything touches disk or the DB.
    const validation = await (0, documents_1.validateUpload)(file.buffer, file.originalname);
    if (!validation.ok) {
        return res.status(422).json({ error: 'Rejected Upload', message: validation.reason });
    }
    try {
        const doc = await (0, documents_1.storeDocument)(caseId, title, category, classification || 'CONFIDENTIAL', file.buffer, file.originalname, validation.detectedType || 'application/octet-stream', user, req.ip || '127.0.0.1', req.headers['user-agent'] || '');
        return res.status(201).json({ success: true, document: doc });
    }
    catch (err) {
        console.error('Document storage error:', err);
        return res.status(500).json({ error: 'Server Error', message: 'Failed to securely store document' });
    }
});
// GET /api/documents/:id/download (Authorized Streaming Download)
router.get('/:id/download', auth_1.requireAuth, async (req, res) => {
    const user = req.userSession;
    const documentId = req.params.id;
    const docData = await (0, documents_1.getDocumentStream)(documentId);
    if (!docData) {
        return res.status(404).json({ error: 'Not Found', message: 'Document not found or inaccessible' });
    }
    const { metadata, stream, integrityOk, actualHash } = docData;
    const authz = await (0, authorization_1.authorize)(user, 'DOCUMENT_DOWNLOAD', {
        type: 'DOCUMENT',
        id: documentId,
        caseId: metadata.case_id,
        owningOrgId: metadata.originating_organization_id,
    }, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!authz.allowed) {
        return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
    }
    // Integrity gate: refuse to serve a vault file whose on-disk bytes no longer
    // match the SHA-256 recorded at upload. The attempt is audited as FAILED.
    if (!integrityOk) {
        await (0, db_1.query)(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'DOCUMENT_INTEGRITY_FAILURE', 'DOCUMENT', $3, $4, 'FAILED', $5, $6, $7::jsonb);
    `, [user.userId, user.organizationId, documentId, metadata.case_id, req.ip, req.headers['user-agent'],
            JSON.stringify({ expected: metadata.sha256_hash, actual: actualHash })]);
        return res.status(409).json({
            error: 'Integrity Failure',
            message: 'Stored document failed hash verification and will not be served. Security audit has been notified.',
        });
    }
    // Audit download
    await (0, db_1.query)(`
    INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
    VALUES ($1, $2, 'DOCUMENT_DOWNLOADED', 'DOCUMENT', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
  `, [user.userId, user.organizationId, documentId, metadata.case_id, req.ip, req.headers['user-agent'], JSON.stringify({ sha256: metadata.sha256_hash })]);
    res.setHeader('Content-Type', metadata.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(metadata.file_name)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
});
exports.default = router;
