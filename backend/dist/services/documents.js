"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeDocument = storeDocument;
exports.getDocumentStream = getDocumentStream;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("./db");
const STORAGE_VAULT_DIR = path_1.default.resolve(__dirname, '../../../data/documents/vault');
// Ensure vault directory exists
if (!fs_1.default.existsSync(STORAGE_VAULT_DIR)) {
    fs_1.default.mkdirSync(STORAGE_VAULT_DIR, { recursive: true });
}
async function storeDocument(caseId, title, category, classification, fileBuffer, originalFilename, mimeType, user, ip, userAgent) {
    // 1. Calculate SHA-256 Hash
    const hash = crypto_1.default.createHash('sha256').update(fileBuffer).digest('hex');
    // 2. Generate random storage UUID (completely disassociates physical path from filename)
    const storageUuid = crypto_1.default.randomUUID();
    const physicalPath = path_1.default.join(STORAGE_VAULT_DIR, `${storageUuid}.dat`);
    // 3. Write physical file
    fs_1.default.writeFileSync(physicalPath, fileBuffer);
    // 4. Record metadata in documents table
    const docRes = await (0, db_1.query)(`
    INSERT INTO documents (
      case_id, title, category, storage_uuid, file_name, mime_type,
      file_size_bytes, sha256_hash, classification, uploaded_by_id, owning_organization_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    ) RETURNING id, case_id, title, category, file_name, mime_type, file_size_bytes, sha256_hash, created_at;
  `, [
        caseId, title, category, storageUuid, originalFilename, mimeType,
        fileBuffer.length, hash, classification, user.userId, user.organizationId
    ]);
    const doc = docRes.rows[0];
    // 5. Record timeline event
    await (0, db_1.query)(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'DOCUMENT_UPLOADED', 'New Document Deposited in Vault', $2, $3, $4, 'DOCUMENT', $5);
  `, [caseId, `Document '${title}' (${category}) uploaded by ${user.displayName}`, user.userId, user.organizationId, doc.id]);
    // 6. Record Audit Log
    await (0, db_1.query)(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'DOCUMENT_UPLOADED', 'DOCUMENT', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
    `, [user.userId, user.organizationId, doc.id, caseId, ip, userAgent, JSON.stringify({ filename: originalFilename, size: fileBuffer.length, sha256: hash })]);
    return doc;
}
async function getDocumentStream(documentId) {
    const docRes = await (0, db_1.query)(`
    SELECT d.id, d.case_id, d.title, d.file_name, d.mime_type, d.storage_uuid, d.sha256_hash, d.owning_organization_id,
           c.originating_organization_id
    FROM documents d
    JOIN cases c ON d.case_id = c.id
    WHERE d.id = $1 AND d.status = 'ACTIVE';
  `, [documentId]);
    if (docRes.rows.length === 0) {
        return null;
    }
    const doc = docRes.rows[0];
    const physicalPath = path_1.default.join(STORAGE_VAULT_DIR, `${doc.storage_uuid}.dat`);
    if (!fs_1.default.existsSync(physicalPath)) {
        return null;
    }
    return {
        metadata: doc,
        filePath: physicalPath,
        stream: fs_1.default.createReadStream(physicalPath),
    };
}
