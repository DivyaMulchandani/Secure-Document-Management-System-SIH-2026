# REST API ARCHITECTURE & ENDPOINT SPECIFICATION
## Secure Multi-Agency Investigation & Case Management Platform

---

### 1. Global API Standards
- **Base URL**: `/api`
- **Content Type**: `application/json` (except document multipart uploads and file downloads)
- **Authentication**: Session cookie (`session_token`) validated on all non-public endpoints
- **Standard Status Codes**:
  - `200 OK`: Successful retrieval or synchronous operation
  - `201 Created`: Entity successfully created
  - `400 Bad Request`: Input validation failed (Zod schema rejection)
  - `401 Unauthorized`: Session missing, invalid, or expired
  - `403 Forbidden`: Authenticated user lacks permission or organizational scope
  - `404 Not Found`: Resource does not exist or requester has no permission to know of its existence
  - `409 Conflict`: Unique constraint violation (e.g. duplicate FIR number or legacy warning)
  - `422 Unprocessable Entity`: Semantic business logic violation
  - `429 Too Many Requests`: Rate limiter triggered
  - `500 Internal Server Error`: Masked generic error without stack traces or internal details

---

### 2. Authentication & Identity Endpoints

#### `POST /api/auth/login`
- **Public**: Yes (Rate limited)
- **Request Body**:
  ```json
  {
    "username": "investigator_patel",
    "password": "StrongPassword123!"
  }
  ```
- **Response (200 OK)**: Sets HTTP-Only `session_token` cookie.
  ```json
  {
    "success": true,
    "user": {
      "id": "c1f72e9a-...",
      "username": "investigator_patel",
      "displayName": "Vikram Patel",
      "badgeNumber": "GP-5491",
      "role": { "id": "INVESTIGATOR", "name": "Police Investigator", "agencyBranch": "POLICE" },
      "organization": { "id": "b3e81a1f-...", "name": "Surat City Police Station A", "code": "GUJ-POL-SURAT-STA" },
      "permissions": ["CASE_READ", "CASE_UPDATE", "FIR_READ", "INVESTIGATION_CREATE", "..."]
    }
  }
  ```

#### `POST /api/auth/logout`
- **Headers**: Session cookie
- **Action**: Invalidates session record in database, clears cookie, logs audit event.
- **Response (200 OK)**: `{ "success": true }`

#### `GET /api/auth/me`
- **Headers**: Session cookie
- **Action**: Re-evaluates user session, active permissions, organizational node, and returns effective profile.

---

### 3. Organization Hierarchy Endpoints

#### `GET /api/organizations`
- **Query Params**: `agencyBranch` (optional), `parentId` (optional)
- **Action**: Returns organizational nodes within the requester's effective subtree scope. Sibling nodes outside the subtree are automatically filtered out.

#### `GET /api/organizations/tree`
- **Action**: Returns full nested tree structure rooted at the user's primary organization (or apex if Master Admin).

#### `POST /api/organizations`
- **Required Permission**: `ORG_CREATE`
- **Validation**: Enforces parent must belong to requester's descendant scope.
- **Request Body**:
  ```json
  {
    "parentId": "b3e81a1f-...",
    "typeId": "POLICE_STATION",
    "name": "Surat Chowki 4",
    "code": "GUJ-POL-SURAT-CHK4",
    "jurisdictionArea": "Sector 4 North"
  }
  ```

---

### 4. User Administration Endpoints

#### `GET /api/users`
- **Required Permission**: `USER_READ`
- **Scope**: Returns users belonging only to organizations within requester's subtree scope.

#### `POST /api/users`
- **Required Permission**: `USER_CREATE`
- **Validation**: Target organization must be in requester's subtree; assigned role cannot exceed requester's permissions.

#### `PUT /api/users/:id/status`
- **Required Permission**: `USER_DEACTIVATE`
- **Request Body**: `{ "status": "LOCKED" | "SUSPENDED" | "ACTIVE" }`

---

### 5. Case & FIR Workspace Endpoints

#### `GET /api/cases`
- **Query Params**: `status`, `year`, `search`, `page`, `limit`
- **Authorization**: Scoped to cases where the originating organization is in requester's subtree OR agency has participation grant OR active delegation exists.

#### `POST /api/cases`
- **Required Permission**: `CASE_CREATE`
- **Request Body**:
  ```json
  {
    "caseType": "NEW_FIR", // or "LEGACY_FIR"
    "title": "Robbery and Aggravated Assault at Ring Road Commercial Complex",
    "description": "...",
    "incidentDate": "2026-09-08T14:30:00Z",
    "incidentLocation": "Ring Road, Surat",
    "originatingOrganizationId": "b3e81a1f-...",
    "leadInvestigatorId": "c1f72e9a-...",
    "legacyFirNumber": "142/2019", // Required only if LEGACY_FIR
    "firData": {
      "complainantName": "Rajesh Shah",
      "complainantContact": "+91-9825000000",
      "actsAndSections": [
        { "act": "Bharatiya Nyaya Sanhita 2023", "sections": ["309(4)", "311"] }
      ],
      "firContent": "Detailed report of the incident..."
    }
  }
  ```
- **Response (201 Created)**: Returns generated internal UUID and human-facing FIR number (`fir_number`).
- **Duplicate Detection**: For legacy FIRs, if `(originatingOrganizationId, year, legacyFirNumber)` already exists, triggers `409 Conflict` or review confirmation payload.

#### `GET /api/cases/:id`
- **Authorization**: Validates requester's right to inspect case. Emits `CASE_READ` audit event.
- **Returns**: Core metadata, FIR details, originating agency info, participating agencies, and authorized tab access flags.

#### `GET /api/cases/:id/timeline`
- **Action**: Returns unified chronological ledger of all actions taken on this case.

---

### 6. Investigation & Chargesheet Endpoints

#### `GET /api/cases/:id/investigation`
- **Required Permission**: `INVESTIGATION_READ`
- **Returns**: Diary entries, panchnamas, witness statements.

#### `POST /api/cases/:id/investigation/diary`
- **Required Permission**: `INVESTIGATION_CREATE`
- **Request Body**:
  ```json
  {
    "entryDate": "2026-09-09T09:00:00Z",
    "locationVisited": "Scene of Crime, Ring Road",
    "investigationDetails": "Inspected CCTV cameras; retrieved backup storage."
  }
  ```

#### `POST /api/cases/:id/chargesheet`
- **Required Permission**: `INVESTIGATION_UPDATE`
- **Request Body**:
  ```json
  {
    "chargesheetNumber": "CS-04/2026",
    "targetCourtId": "d4a92b...",
    "submissionDate": "2026-09-09T16:00:00Z",
    "accusedCharges": [
      { "personId": "...", "charges": ["BNS 309(4)"], "status": "IN_JUDICIAL_CUSTODY" }
    ]
  }
  ```

---

### 7. Evidence & Chain of Custody Endpoints

#### `GET /api/cases/:id/evidence`
- **Required Permission**: `EVIDENCE_READ`

#### `POST /api/cases/:id/evidence`
- **Required Permission**: `EVIDENCE_CREATE`
- **Request Body**:
  ```json
  {
    "evidenceTag": "EV-2026-0041",
    "category": "BALLISTICS",
    "description": "7.65mm fired cartridge casing recovered from parking bay 3",
    "collectionLocation": "Ring Road Basement Parking",
    "collectedAt": "2026-09-08T15:45:00Z",
    "storageLocation": "Malkhana Locker B-14"
  }
  ```

#### `POST /api/evidence/:id/transfer`
- **Required Permission**: `EVIDENCE_TRANSFER`
- **Request Body**:
  ```json
  {
    "toUserId": "e5b83c...",
    "toOrganizationId": "f6c94d...", // E.g. RFSL Surat
    "actionType": "FORENSIC_DISPATCH",
    "reason": "Forwarded for ballistic striation and firing pin analysis",
    "sealCondition": "INTACT_AND_VERIFIED"
  }
  ```

---

### 8. Forensic Science Laboratory Endpoints

#### `POST /api/cases/:id/forensics/submit`
- **Required Permission**: `FORENSIC_CREATE`
- **Action**: Police unit submits evidence to a designated forensic laboratory node. Creates `forensic_submission` and grants case participation to that forensic lab.

#### `GET /api/forensics/submissions`
- **Required Permission**: `FORENSIC_EXAMINE`
- **Action**: Forensic examiners view submissions directed to their lab division.

#### `POST /api/forensics/submissions/:id/reports`
- **Required Permission**: `FORENSIC_REPORT`
- **Request Body**:
  ```json
  {
    "reportNumber": "RFSL-SRT-BAL-2026-089",
    "summaryOfAnalysis": "Microscopic comparison of breech face marks and striations.",
    "formalConclusion": "The recovered cartridge casing was fired from Country-made Pistol Ex. 1.",
    "status": "FINAL_SEALED"
  }
  ```

---

### 9. Judiciary & Court Endpoints

#### `POST /api/court/cases`
- **Required Permission**: `COURT_CREATE`
- **Request Body**:
  ```json
  {
    "caseId": "...",
    "courtOrganizationId": "...",
    "cnrNumber": "GJSR010023452026",
    "courtCaseType": "SESSIONS_CASE",
    "courtCaseNumber": "SC/89/2026",
    "filingDate": "2026-09-09T11:00:00Z",
    "presidingJudgeName": "Hon. Justice D. R. Mehta"
  }
  ```

#### `POST /api/court/cases/:id/hearings`
- **Required Permission**: `COURT_HEARING_RECORD`

#### `POST /api/court/cases/:id/orders`
- **Required Permission**: `COURT_ORDER_ISSUE`

---

### 10. Document Vault Endpoints

#### `POST /api/cases/:id/documents`
- **Content-Type**: `multipart/form-data`
- **Required Permission**: `DOCUMENT_UPLOAD`
- **Action**: Streams file, generates SHA-256, assigns UUID storage handle, stores metadata, emits audit log.

#### `GET /api/documents/:id/download`
- **Required Permission**: `DOCUMENT_DOWNLOAD`
- **Action**: Verifies case access, streams file with sanitized attachment headers, emits `DOCUMENT_DOWNLOAD` audit log.

---

### 11. Delegated Temporary Access Endpoints

#### `POST /api/delegations`
- **Required Permission**: `DELEGATION_MANAGE`
- **Request Body**:
  ```json
  {
    "caseId": "...",
    "grantedToUserId": "...",
    "permissions": ["CASE_READ", "EVIDENCE_READ", "DOCUMENT_DOWNLOAD"],
    "reason": "Special Public Prosecutor Briefing",
    "startsAt": "2026-09-09T00:00:00Z",
    "expiresAt": "2026-09-16T23:59:59Z"
  }
  ```

---

### 12. Global Authorization-Filtered Search & Audit

#### `GET /api/search?q=XYZ`
- **Authorization**: Pre-filters via SQL JOINs against the requester's calculated organizational subtree and active case grants. Unauthorised records are never queried or leaked.

#### `GET /api/audit`
- **Required Permission**: `AUDIT_READ`
- **Query Params**: `userId`, `caseId`, `action`, `from`, `to`, `page`, `limit`

