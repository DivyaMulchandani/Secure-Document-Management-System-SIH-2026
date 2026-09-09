import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query, withTransaction } from './db';
import { appendLedgerBlock } from './ledger';
import { UserSessionPayload } from './auth';

const STORAGE_VAULT_DIR = path.resolve(__dirname, '../../../data/documents/vault');

// Ensure vault directory exists
if (!fs.existsSync(STORAGE_VAULT_DIR)) {
  fs.mkdirSync(STORAGE_VAULT_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Upload validation: content-signature (magic-byte) whitelist + AV scan hook.
// The client-supplied MIME type is advisory only and never trusted.
// ---------------------------------------------------------------------------

export interface UploadValidationResult {
  ok: boolean;
  detectedType?: string;
  reason?: string;
}

const MAGIC_SIGNATURES: Array<{ type: string; test: (b: Buffer) => boolean }> = [
  { type: 'application/pdf', test: (b) => b.slice(0, 5).toString('latin1') === '%PDF-' },
  { type: 'image/png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/tiff', test: (b) => {
      const s = b.slice(0, 4);
      return s.equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || s.equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
    } },
  { type: 'video/mp4', test: (b) => b.length > 12 && b.slice(4, 8).toString('latin1') === 'ftyp' },
];

// Allowed types and the file extensions we accept for each detected type.
const ALLOWED_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/tiff': ['tif', 'tiff'],
  'video/mp4': ['mp4', 'm4v'],
};

function detectType(buffer: Buffer): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    try {
      if (sig.test(buffer)) return sig.type;
    } catch {
      /* short buffer -- ignore */
    }
  }
  return null;
}

/**
 * Antivirus scan hook. Wired as a documented stub: in a real deployment this
 * streams the buffer to ClamAV (clamd INSTREAM) and rejects on a hit. Kept as
 * a clearly-labelled no-op so the upload pipeline shape is correct for the demo.
 */
export async function scanForMalware(_buffer: Buffer): Promise<{ clean: boolean; signature?: string }> {
  // TODO: integrate clamd (e.g. `clamscan`/`node-clam`) -- INSTREAM scan here.
  return { clean: true };
}

export async function validateUpload(
  buffer: Buffer,
  originalFilename: string
): Promise<UploadValidationResult> {
  if (!buffer || buffer.length === 0) return { ok: false, reason: 'Empty file' };

  const detected = detectType(buffer);
  if (!detected || !ALLOWED_TYPES[detected]) {
    return { ok: false, reason: 'File content is not an allowed type (PDF, PNG, JPEG, TIFF, MP4)' };
  }

  const ext = path.extname(originalFilename).toLowerCase().replace('.', '');
  if (ext && !ALLOWED_TYPES[detected].includes(ext)) {
    return { ok: false, detectedType: detected, reason: `Extension .${ext} does not match detected type ${detected}` };
  }

  const scan = await scanForMalware(buffer);
  if (!scan.clean) {
    return { ok: false, detectedType: detected, reason: `Malware detected: ${scan.signature || 'unknown signature'}` };
  }

  return { ok: true, detectedType: detected };
}

// ---------------------------------------------------------------------------

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

  try {
    // 4-7. Metadata + timeline + audit + ledger anchor commit atomically.
    return await withTransaction(async (tx) => {
      const docRes = await tx.query(`
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

      await tx.query(`
        INSERT INTO case_timeline (case_id, event_type, title, description, actor_id, organization_id, entity_type, entity_id)
        VALUES ($1, 'DOCUMENT_UPLOADED', 'New Document Deposited in Vault', $2, $3, $4, 'DOCUMENT', $5);
      `, [caseId, `Document '${title}' (${category}) uploaded by ${user.displayName}`, user.userId, user.organizationId, doc.id]);

      await tx.query(`
        INSERT INTO audit_logs (user_id, organization_id, action, resource_type, resource_id, case_id, result, ip_address, user_agent, after_value)
        VALUES ($1, $2, 'DOCUMENT_UPLOADED', 'DOCUMENT', $3, $4, 'ALLOW', $5, $6, $7::jsonb);
      `, [user.userId, user.organizationId, doc.id, caseId, ip, userAgent, JSON.stringify({ filename: originalFilename, size: fileBuffer.length, sha256: hash })]);

      // Anchor the document's content hash on the integrity ledger: proves this
      // exact file existed, unaltered, at this time -- verifiable by any agency.
      await appendLedgerBlock(tx, {
        eventType: 'DOCUMENT_ANCHOR',
        refTable: 'documents',
        refId: doc.id,
        caseId,
        orgId: user.organizationId,
        bodyId: user.bodyId || user.agencyBranch,
        payload: {
          documentId: doc.id,
          sha256: hash,
          sizeBytes: fileBuffer.length,
          category,
          classification,
          uploadedBy: user.userId,
        },
      });

      return doc;
    });
  } catch (err) {
    // Roll back the orphaned physical file if the DB transaction failed.
    try { fs.unlinkSync(physicalPath); } catch { /* ignore */ }
    throw err;
  }
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

  // Integrity check on read: recompute the stored file's hash and compare to
  // the value recorded at upload time. A mismatch means the vault file was
  // altered on disk out-of-band.
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(physicalPath)).digest('hex');
  const integrityOk = actualHash === doc.sha256_hash;

  return {
    metadata: doc,
    filePath: physicalPath,
    integrityOk,
    actualHash,
    stream: fs.createReadStream(physicalPath),
  };
}
