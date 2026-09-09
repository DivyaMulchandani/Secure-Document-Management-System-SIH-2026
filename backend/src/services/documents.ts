import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query } from './db';
import { UserSessionPayload } from './auth';

const STORAGE_VAULT_DIR = path.resolve(__dirname, '../../../data/documents/vault');

// Ensure vault directory exists
if (!fs.existsSync(STORAGE_VAULT_DIR)) {
  fs.mkdirSync(STORAGE_VAULT_DIR, { recursive: true });
}

export async function storeDocument(
  caseId: string | any,
  title: string,
  category: string,
  classification: string,
  fileBuffer: Buffer,
  originalFilename: string,
  mimeType: string,
  user: UserSessionPayload,
  ip: string,
  userAgent: string
) {
  // 1. Calculate SHA-256 Hash
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 2. Generate random storage UUID (completely disassociates physical path from filename)
  const storageUuid = crypto.randomUUID();
  const physicalPath = path.join(STORAGE_VAULT_DIR, `${storageUuid}.dat`);

  // 3. Write physical file
  fs.writeFileSync(physicalPath, fileBuffer);

  // 4. Record metadata in documents table
  const docRes = await query(`
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
  await query(`
    INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
    VALUES ($1, 'DOCUMENT_UPLOADED', 'New Document Deposited in Vault', $2, $3, $4, 'DOCUMENT', $5);
  `, [caseId, `Document '${title}' (${category}) uploaded by ${user.displayName}`, user.userId, user.organizationId, doc.id]);

  // 6. Record Audit Log
  await query(`
      INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
      VALUES ($1, $2, 'DOCUMENT_UPLOADED', 'DOCUMENT', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
    `, [user.userId, user.organizationId, doc.id, caseId, ip, userAgent, JSON.stringify({ filename: originalFilename, size: fileBuffer.length, sha256: hash })]);

  return doc;
}

export async function getDocumentStream(documentId: string | any) {
  const docRes = await query(`
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
  const physicalPath = path.join(STORAGE_VAULT_DIR, `${doc.storage_uuid}.dat`);

  if (!fs.existsSync(physicalPath)) {
    return null;
  }

  return {
    metadata: doc,
    filePath: physicalPath,
    stream: fs.createReadStream(physicalPath),
  };
}
