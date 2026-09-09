# SECURITY & HARDENING SPECIFICATION
## Secure Multi-Agency Investigation & Case Management Platform

---

### 1. Fundamental Security Mandate: Zero Client Trust

**The client is considered completely untrusted.** 
- Any client can forge headers, spoof query parameters, tamper with JSON payloads, alter hidden form fields, and modify frontend state.
- **Rule 1**: Frontend UI state (hiding tabs, buttons, links) is purely a convenience mechanism, never an authorization control.
- **Rule 2**: The backend API independently parses identity from the validated server-side session token, looks up the user's role and organization from the database, and enforces authorization at every endpoint.
- **Rule 3**: Any attempt to manipulate `user_id`, `role_id`, `organization_id`, or `case_id` to access records outside one's permitted scope is intercepted by the Central Authorization Engine and logged as an adversarial security event (`AUTHZ_DENY`).

---

### 2. Authentication & Session Architecture

```
[User Browser]
      │
      │ 1. POST /api/auth/login { username, password }
      ▼
[Rate Limiting Guard] (Max 5 attempts / 15 min per IP/Username)
      │
      ▼
[Authentication Controller]
      │ 2. Query user by username
      │ 3. Check account status: locked_until > now() ? Reject 423 Locked
      │ 4. Verify password hash using timing-safe cryptographic comparison
      │
      ├── Failed: Increment failed_login_count. If >= 5, set locked_until = now() + 30m.
      │           Log LOGIN_FAILURE in audit_logs. Return 401.
      │
      └── Succeeded: Reset failed_login_count to 0. Update last_login_at.
                     Generate 256-bit cryptographically secure session ID.
                     Store session hash in user_sessions table with TTL (8 hours).
                     Issue HTTP-Only, Secure, SameSite=Strict cookie.
                     Log LOGIN in audit_logs. Return user profile.
```

#### Session Security Parameters
- **Cookie Flags**: `HttpOnly = true`, `Secure = true` (in production/HTTPS), `SameSite = Strict`, `Path = /`.
- **Session Revocation**: Logging out destroys the server-side session record immediately.
- **Inactivity Timeout**: Sessions expire after 8 hours of inactivity or immediate password reset.

---

### 3. Protection Against Critical Vulnerability Classes

#### 3.1 Insecure Direct Object References (IDOR)
- **Threat**: User alters `/api/cases/UUID-A` to `/api/cases/UUID-B` or `/api/documents/DOC-123` to access an unassigned case.
- **Mitigation**: Every entity lookup executes through `authorize()`. The system queries the entity's `owning_organization_id` and checks whether it exists in the requester's calculated organizational subtree or active case participation list. If unauthorized, an immediate `403 Forbidden` is returned.

#### 3.2 Vertical & Horizontal Privilege Escalation
- **Threat**: A Police Station Officer attempts to create another user with `MASTER_ADMIN` or `POLICE_ADMIN` role, or attempts to assign a user to a parent commissionerate.
- **Mitigation**: The `USER_CREATE` and `USER_UPDATE` handlers enforce:
  1. The target organization must be within the actor's own descendant subtree.
  2. The assigned role's permission set must be a strict subset of the actor's permissions.
  3. Master roles can only be provisioned by Master Admins.

#### 3.3 Sibling Branch Tampering
- **Threat**: Officer at Ahmedabad Crime Branch attempts to inspect or mutate records belonging to Ahmedabad Traffic Branch.
- **Mitigation**: Sibling isolation check verifies that the target node is an ancestor or descendant. If two nodes share a common parent but neither is a descendant of the other, access is denied by default.

---

### 4. Secure Document Vault & Anti-Path-Traversal

Documents associated with FIRs, Panchnamas, Forensic Examinations, and Court Records contain classified justice information and must be protected against filesystem attacks.

```
[Document Upload Flow]
1. Multi-part upload stream received.
2. File buffer analyzed:
   - MIME validation against allowed list (PDF, PNG, JPEG, TIFF, MP4).
   - Filename sanitized using regex ^[a-zA-Z0-9_.-]+$.
   - SHA-256 hash calculated over the content stream.
   - Size limit strictly capped (e.g. 50MB).
3. Physical storage disassociation:
   - A new random UUIDv4 is generated for storage (`storage_uuid`).
   - The file is saved on disk as:
     `${STORAGE_VAULT_ROOT}/${storage_uuid}.dat`
   - Original filename, MIME type, size, and hash are stored exclusively in documents table.
   - Any path traversal payload (e.g. `../../../../etc/passwd`) is neutralized because
     the on-disk filename is pure UUID.
```

```
[Document Download Flow]
1. GET /api/documents/:id
2. Central Auth Engine validates:
   - Requester has DOCUMENT_DOWNLOAD permission.
   - Requester has case-level access to the case associated with the document.
3. If authorized:
   - Stream `${STORAGE_VAULT_ROOT}/${storage_uuid}.dat` with headers:
     Content-Type: <db_mime_type>
     Content-Disposition: attachment; filename="<sanitized_db_filename>"
     X-Content-Type-Options: nosniff
   - Record DOCUMENT_DOWNLOAD in audit_logs.
4. If unauthorized: Return 403 Forbidden and record AUTHZ_DENY in audit_logs.
```

---

### 5. Append-Only Audit Trail Integrity
- All critical actions emit an audit entry:
  - `LOGIN`, `LOGIN_FAILURE`, `LOGOUT`
  - `CASE_CREATED`, `CASE_UPDATED`, `CASE_STATUS_CHANGED`
  - `FIR_REGISTERED`, `CHARGESHEET_SUBMITTED`
  - `EVIDENCE_COLLECTED`, `EVIDENCE_TRANSFERRED`, `EVIDENCE_CUSTODY_UPDATED`
  - `FORENSIC_REQUESTED`, `FORENSIC_REPORT_ISSUED`
  - `COURT_HEARING_RECORDED`, `COURT_ORDER_ISSUED`, `JUDGEMENT_PRONOUNCED`
  - `DOCUMENT_UPLOADED`, `DOCUMENT_DOWNLOADED`
  - `USER_PROVISIONED`, `USER_LOCKED`, `ROLE_MODIFIED`
  - `DELEGATION_GRANTED`, `DELEGATION_REVOKED`
  - `SECURITY_VIOLATION_DENIED`
- Application database connection has `INSERT` and `SELECT` rights on `audit_logs`, but **no `UPDATE` or `DELETE`** permissions, guaranteeing tamper-evident audit history.

