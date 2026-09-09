# DATABASE ARCHITECTURE & SCHEMA SPECIFICATION
## Secure Multi-Agency Investigation & Case Management Platform

---

### 1. Database Philosophy & Technology Stack
- **Engine**: PostgreSQL 16 (via Drizzle ORM). Fully compatible with native PostgreSQL daemons (`pg`) as well as local embedded zero-config WebAssembly PostgreSQL (`@electric-sql/pglite` on Linux filesystem).
- **Primary Keys**: UUIDv4 across all operational and domain entities to prevent enumeration and sequential ID scraping.
- **Auditing**: Explicit append-only `audit_logs` and `case_timeline` tables populated synchronously during transactions.
- **Referential Integrity**: Strict foreign key constraints with indexed lookup columns to ensure high-performance traversals.
- **State Preservation**: Soft deletion/archival statuses (`ACTIVE`, `ARCHIVED`, `DISABLED`, `VOIDED`, `SEALED`) rather than destructive `DELETE`.

---

### 2. Entity Relationship Overview

```
                      ┌───────────────────────┐
                      │  organization_types   │
                      └──────────┬────────────┘
                                 │
                                 ▼
                      ┌───────────────────────┐
                      │  organization_nodes   │◄─────────┐
                      └──────────┬────────────┘          │ (parent_id)
                                 │                       │
         ┌───────────────────────┼───────────────────────┴─────────┐
         │                       │                                 │
         ▼                       ▼                                 ▼
┌──────────────────┐   ┌──────────────────┐              ┌──────────────────┐
│      users       │   │      cases       │              │ delegated_access │
└────────┬─────────┘   └────────┬─────────┘              └──────────────────┘
         │                      │
         ├──────────────┐       ├─────────────────────────────────────────┐
         ▼              ▼       ▼                                         ▼
┌────────────────┐ ┌─────────┐ ┌─────────┐   ┌────────────┐   ┌─────────┐ ┌───────────┐
│user_org_scope  │ │user_role│ │  firs   │   │investigat'n│   │evidence │ │court_cases│
└────────────────┘ └────┬────┘ └─────────┘   └─────┬──────┘   └───┬─────┘ └─────┬─────┘
                        │                          │              │             │
                        ▼                          ├────────┐     ▼             ▼
                 ┌─────────────┐                   ▼        ▼   ┌───────┐ ┌───────────┐
                 │    roles    │               ┌───────┐┌───────┤custody│ │proceedings│
                 └──────┬──────┘               │panch- ││charge-│└───────┘ └─────┬─────┘
                        │                      │nama   ││sheet  │     │         │
                        ▼                      └───────┘└───────┘     ▼         ▼
                 ┌─────────────┐                        ┌──────────────┐  ┌───────────┐
                 │ permissions │                        │forensic_subm │  │orders &   │
                 └─────────────┘                        └───────┬──────┘  │judgements │
                                                                │         └───────────┘
                                                                ▼
                                                        ┌──────────────┐
                                                        │forensic_exam │
                                                        └───────┬──────┘
                                                                │
                                                                ▼
                                                        ┌──────────────┐
                                                        │forensic_rep't│
                                                        └──────────────┘
```

---

### 3. Detailed Schema Definitions

#### 3.1 Organization & Identity Domain

##### `organization_types`
- `id` (VARCHAR(64), PK) - E.g. `STATE_HEADQUARTERS`, `COMMISSIONERATE`, `DISTRICT_RANGE`, `POLICE_STATION`, `FORENSIC_DIRECTORATE`, `REGIONAL_FSL`, `HIGH_COURT`, `DISTRICT_COURT`.
- `agency_branch` (VARCHAR(32), NOT NULL) - Enum: `'POLICE'`, `'FORENSICS'`, `'JUDICIARY'`, `'MASTER'`.
- `name` (VARCHAR(128), NOT NULL)
- `description` (TEXT)
- `allowed_child_types` (TEXT[]) - Hierarchy constraint definitions.

##### `organization_nodes`
- `id` (UUID, PK, default gen_random_uuid())
- `parent_id` (UUID, FK -> organization_nodes.id, NULL for apex nodes)
- `agency_branch` (VARCHAR(32), NOT NULL) - `'POLICE'`, `'FORENSICS'`, `'JUDICIARY'`, `'MASTER'`
- `type_id` (VARCHAR(64), FK -> organization_types.id, NOT NULL)
- `name` (VARCHAR(256), NOT NULL)
- `code` (VARCHAR(64), NOT NULL, UNIQUE) - E.g. `GUJ-POL-SURAT-Z1-STA`
- `hierarchy_path` (TEXT, NOT NULL) - Materialized dot-path for instant subtree indexing e.g. `root.surat.zone1.stna`
- `level` (INTEGER, NOT NULL)
- `jurisdiction_area` (TEXT)
- `status` (VARCHAR(32), default 'ACTIVE') - `'ACTIVE'`, `'INACTIVE'`, `'REORGANIZED'`
- `created_at` (TIMESTAMPTZ, default now())
- `updated_at` (TIMESTAMPTZ, default now())
- *Indexes*: `parent_id`, `code`, `hierarchy_path`, `agency_branch`.

##### `roles`
- `id` (VARCHAR(64), PK) - E.g. `MASTER_ADMIN`, `POLICE_ADMIN`, `INVESTIGATOR`, `FORENSIC_EXAMINER`, `COURT_CLERK`, `JUDGE`, `VIEWER`.
- `agency_branch` (VARCHAR(32), NOT NULL)
- `name` (VARCHAR(128), NOT NULL)
- `description` (TEXT)
- `is_system` (BOOLEAN, default false)

##### `permissions`
- `id` (VARCHAR(64), PK) - Granular permission keys:
  - `CASE_CREATE`, `CASE_READ`, `CASE_UPDATE`, `CASE_ASSIGN`, `CASE_CLOSE`
  - `FIR_CREATE`, `FIR_READ`, `FIR_UPDATE`
  - `INVESTIGATION_CREATE`, `INVESTIGATION_READ`, `INVESTIGATION_UPDATE`
  - `EVIDENCE_CREATE`, `EVIDENCE_READ`, `EVIDENCE_TRANSFER`, `EVIDENCE_RETURN`
  - `FORENSIC_CREATE`, `FORENSIC_EXAMINE`, `FORENSIC_REPORT`
  - `COURT_CREATE`, `COURT_HEARING_RECORD`, `COURT_ORDER_ISSUE`, `COURT_JUDGEMENT`
  - `DOCUMENT_UPLOAD`, `DOCUMENT_READ`, `DOCUMENT_DOWNLOAD`, `DOCUMENT_VOID`
  - `USER_CREATE`, `USER_READ`, `USER_UPDATE`, `USER_DEACTIVATE`
  - `ORG_CREATE`, `ORG_READ`, `ORG_UPDATE`
  - `AUDIT_READ`, `DELEGATION_MANAGE`
- `category` (VARCHAR(64), NOT NULL)
- `description` (TEXT)

##### `role_permissions`
- `role_id` (VARCHAR(64), FK -> roles.id)
- `permission_id` (VARCHAR(64), FK -> permissions.id)
- PK: `(role_id, permission_id)`

##### `users`
- `id` (UUID, PK, default gen_random_uuid())
- `username` (VARCHAR(64), NOT NULL, UNIQUE)
- `email` (VARCHAR(256), NOT NULL, UNIQUE)
- `display_name` (VARCHAR(128), NOT NULL)
- `badge_number` (VARCHAR(64))
- `password_hash` (TEXT, NOT NULL) - Argon2id / scrypt cryptographic hash
- `status` (VARCHAR(32), default 'ACTIVE') - `'ACTIVE'`, `'LOCKED'`, `'SUSPENDED'`
- `primary_role_id` (VARCHAR(64), FK -> roles.id, NOT NULL)
- `primary_organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `failed_login_count` (INTEGER, default 0)
- `locked_until` (TIMESTAMPTZ)
- `last_login_at` (TIMESTAMPTZ)
- `password_changed_at` (TIMESTAMPTZ, default now())
- `created_at` (TIMESTAMPTZ, default now())
- `updated_at` (TIMESTAMPTZ, default now())
- *Indexes*: `username`, `email`, `primary_organization_id`.

##### `user_sessions`
- `id` (VARCHAR(128), PK) - High-entropy session token hash
- `user_id` (UUID, FK -> users.id, NOT NULL)
- `ip_address` (VARCHAR(45))
- `user_agent` (TEXT)
- `expires_at` (TIMESTAMPTZ, NOT NULL)
- `created_at` (TIMESTAMPTZ, default now())
- *Indexes*: `user_id`, `expires_at`.

##### `delegated_access`
- `id` (UUID, PK, default gen_random_uuid())
- `case_id` (UUID, FK -> cases.id, NOT NULL)
- `granted_by_user_id` (UUID, FK -> users.id, NOT NULL)
- `granted_to_user_id` (UUID, FK -> users.id, NOT NULL)
- `permissions` (TEXT[], NOT NULL) - Subset of granter's permissions
- `reason` (TEXT, NOT NULL)
- `starts_at` (TIMESTAMPTZ, NOT NULL)
- `expires_at` (TIMESTAMPTZ, NOT NULL)
- `status` (VARCHAR(32), default 'ACTIVE') - `'ACTIVE'`, `'REVOKED'`, `'EXPIRED'`
- *Indexes*: `case_id`, `granted_to_user_id`, `expires_at`.

---

#### 3.2 Case & FIR Domain

##### `cases`
- `id` (UUID, PK, default gen_random_uuid()) - **INTERNAL IMMUTABLE UUID**
- `case_type` (VARCHAR(32), NOT NULL) - `'NEW_FIR'`, `'LEGACY_FIR'`, `'PRELIMINARY_INQUIRY'`
- `fir_number` (VARCHAR(128), NOT NULL) - Human-facing identifier (e.g. `FIR-0124/2026/SURAT-A`)
- `legacy_fir_number` (VARCHAR(128)) - Original historical identifier if legacy
- `year` (INTEGER, NOT NULL)
- `originating_organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `lead_investigator_id` (UUID, FK -> users.id)
- `title` (VARCHAR(512), NOT NULL)
- `description` (TEXT)
- `incident_date` (TIMESTAMPTZ)
- `incident_location` (TEXT)
- `status` (VARCHAR(32), default 'UNDER_INVESTIGATION') - `'REGISTERED'`, `'UNDER_INVESTIGATION'`, `'CHARGESHEETED'`, `'TRIAL_IN_PROGRESS'`, `'DISPOSED'`, `'CLOSED'`
- `is_legacy` (BOOLEAN, default false)
- `duplicate_warning_flag` (BOOLEAN, default false)
- `created_by` (UUID, FK -> users.id, NOT NULL)
- `created_at` (TIMESTAMPTZ, default now())
- `updated_at` (TIMESTAMPTZ, default now())
- *Constraints*: UNIQUE `(originating_organization_id, year, fir_number)`
- *Indexes*: `fir_number`, `originating_organization_id`, `lead_investigator_id`, `status`.

##### `case_agency_participation`
- `id` (UUID, PK, default gen_random_uuid())
- `case_id` (UUID, FK -> cases.id, NOT NULL)
- `organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `agency_branch` (VARCHAR(32), NOT NULL) - `'POLICE'`, `'FORENSICS'`, `'JUDICIARY'`
- `access_role` (VARCHAR(64), NOT NULL) - `'ORIGINATING_AGENCY'`, `'FORENSIC_EXAMINER_LAB'`, `'TRIAL_COURT'`
- `granted_at` (TIMESTAMPTZ, default now())
- *Constraints*: UNIQUE `(case_id, organization_id)`

##### `firs`
- `id` (UUID, PK, default gen_random_uuid())
- `case_id` (UUID, FK -> cases.id, UNIQUE, NOT NULL)
- `registration_date` (TIMESTAMPTZ, NOT NULL)
- `complainant_name` (VARCHAR(256), NOT NULL)
- `complainant_contact` (VARCHAR(128))
- `acts_and_sections` (JSONB, NOT NULL) - E.g. `[{"act": "BNS 2023", "sections": ["103(1)", "308"]}]`
- `occurrence_from` (TIMESTAMPTZ)
- `occurrence_to` (TIMESTAMPTZ)
- `general_diary_reference` (VARCHAR(128))
- `fir_content` (TEXT, NOT NULL)
- `dispatch_to_court_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ, default now())

##### `persons` & `case_persons`
- `persons`: `id` (UUID, PK), `full_name`, `alias`, `id_proof_type`, `id_proof_number`, `gender`, `dob`, `address`, `phone`.
- `case_persons`: `id` (UUID, PK), `case_id`, `person_id`, `role_in_case` (`'COMPLAINANT'`, `'VICTIM'`, `'ACCUSED'`, `'WITNESS'`, `'SUSPECT'`), `arrest_date`, `custody_status`.

---

#### 3.3 Investigation, Evidence & Forensic Domain

##### `investigations` (Case Diary & Action Log)
- `id` (UUID, PK)
- `case_id` (UUID, FK -> cases.id, NOT NULL)
- `diary_entry_number` (INTEGER, NOT NULL)
- `entry_date` (TIMESTAMPTZ, NOT NULL)
- `location_visited` (TEXT)
- `investigation_details` (TEXT, NOT NULL)
- `officer_id` (UUID, FK -> users.id, NOT NULL)
- *Constraints*: UNIQUE `(case_id, diary_entry_number)`

##### `witnesses` & `panchnamas`
- `witness_statements`: `id`, `case_id`, `witness_person_id`, `recorded_by_id`, `statement_date`, `statement_text`, `audio_video_ref`.
- `panchnamas`: `id`, `case_id`, `panchnama_type` (`'CRIME_SCENE'`, `'RECOVERY'`, `'INQUEST'`), `location`, `panch_witnesses` (JSONB), `findings_summary`, `conducted_at`.

##### `chargesheets`
- `id` (UUID, PK)
- `case_id` (UUID, FK -> cases.id, UNIQUE, NOT NULL)
- `chargesheet_number` (VARCHAR(128), NOT NULL)
- `submission_date` (TIMESTAMPTZ, NOT NULL)
- `submitting_officer_id` (UUID, FK -> users.id, NOT NULL)
- `target_court_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `accused_charges` (JSONB, NOT NULL)
- `status` (VARCHAR(32), default 'SUBMITTED')

##### `evidence`
- `id` (UUID, PK)
- `case_id` (UUID, FK -> cases.id, NOT NULL)
- `evidence_tag` (VARCHAR(64), NOT NULL) - E.g. `EV-2026-0012`
- `category` (VARCHAR(64), NOT NULL) - `'BALLISTICS'`, `'BIOLOGICAL'`, `'DIGITAL'`, `'CHEMICAL'`, `'DOCUMENTARY'`, `'PHYSICAL'`
- `description` (TEXT, NOT NULL)
- `collected_at` (TIMESTAMPTZ, NOT NULL)
- `collected_by_id` (UUID, FK -> users.id, NOT NULL)
- `collection_location` (TEXT, NOT NULL)
- `current_custodian_id` (UUID, FK -> users.id, NOT NULL)
- `current_organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `storage_location` (VARCHAR(256), NOT NULL)
- `status` (VARCHAR(32), default 'IN_POLICE_CUSTODY') - `'IN_POLICE_CUSTODY'`, `'TRANSFERRED'`, `'IN_FORENSIC_LAB'`, `'PRESENTED_IN_COURT'`, `'RETURNED'`
- *Constraints*: UNIQUE `(case_id, evidence_tag)`

##### `evidence_custody_events` (Chain-of-Custody Ledger)
- `id` (UUID, PK)
- `evidence_id` (UUID, FK -> evidence.id, NOT NULL)
- `timestamp` (TIMESTAMPTZ, default now())
- `from_user_id` (UUID, FK -> users.id, NOT NULL)
- `from_organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `to_user_id` (UUID, FK -> users.id, NOT NULL)
- `to_organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `action_type` (VARCHAR(64), NOT NULL) - `'COLLECTION'`, `'INTERNAL_TRANSFER'`, `'FORENSIC_DISPATCH'`, `'LAB_RECEIPT'`, `'COURT_EXHIBIT'`, `'RETURN'`
- `reason` (TEXT, NOT NULL)
- `seal_condition` (VARCHAR(64), NOT NULL) - `'INTACT_AND_VERIFIED'`, `'DAMAGED'`, `'RESPOOLED'`
- `signature_token` (TEXT)

##### `forensic_submissions`
- `id` (UUID, PK)
- `case_id` (UUID, FK -> cases.id, NOT NULL)
- `requesting_organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `target_forensic_org_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `submission_memo_number` (VARCHAR(128), NOT NULL)
- `examination_requested` (TEXT, NOT NULL)
- `scientific_division` (VARCHAR(64), NOT NULL) - E.g. `'BALLISTICS'`, `'DNA'`, `'CYBER'`, `'TOXICOLOGY'`
- `status` (VARCHAR(32), default 'SUBMITTED') - `'SUBMITTED'`, `'ACCEPTED'`, `'UNDER_EXAMINATION'`, `'REPORT_ISSUED'`
- `submitted_at` (TIMESTAMPTZ, default now())

##### `forensic_examinations` & `forensic_reports`
- `forensic_examinations`: `id`, `submission_id`, `examiner_id`, `started_at`, `methodology`, `preliminary_notes`.
- `forensic_reports`: `id`, `submission_id`, `report_number` (UNIQUE), `lead_examiner_id`, `summary_of_analysis`, `formal_conclusion`, `signed_at`, `status` (`'DRAFT'`, `'FINAL_SEALED'`).

---

#### 3.4 Judiciary Domain

##### `court_cases`
- `id` (UUID, PK)
- `case_id` (UUID, FK -> cases.id, NOT NULL)
- `court_organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `cnr_number` (VARCHAR(64), UNIQUE, NOT NULL) - National Judicial CNR format
- `court_case_type` (VARCHAR(64), NOT NULL) - `'SESSIONS_CASE'`, `'SPECIAL_POCSO'`, `'CRIMINAL_CASE'`
- `court_case_number` (VARCHAR(64), NOT NULL)
- `filing_date` (TIMESTAMPTZ, NOT NULL)
- `presiding_judge_name` (VARCHAR(128))
- `current_stage` (VARCHAR(64), default 'FRAMING_OF_CHARGES')
- `status` (VARCHAR(32), default 'PENDING')

##### `court_proceedings`, `court_orders` & `court_judgements`
- `court_proceedings`: `id`, `court_case_id`, `hearing_date`, `business_conducted`, `next_date`, `purpose_of_next_hearing`.
- `court_orders`: `id`, `court_case_id`, `order_date`, `order_type` (`'BAIL'`, `'SUMMONS'`, `'WARRANT'`, `'EVIDENCE_DIRECTION'`), `summary`, `document_ref`.
- `court_judgements`: `id`, `court_case_id`, `judgement_date`, `verdict` (`'CONVICTION'`, `'ACQUITTAL'`, `'DISCHARGED'`), `sentences_awarded` (JSONB), `judgement_summary`.

---

#### 3.5 Document Vault & Immutability

##### `documents`
- `id` (UUID, PK)
- `case_id` (UUID, FK -> cases.id, NOT NULL)
- `title` (VARCHAR(256), NOT NULL)
- `category` (VARCHAR(64), NOT NULL) - `'FIR_SCAN'`, `'PANCHNAMA'`, `'FORENSIC_REPORT'`, `'COURT_ORDER'`, `'EVIDENCE_PHOTO'`, `'CASE_DIARY'`
- `storage_uuid` (UUID, NOT NULL) - Disassociated physical file handle
- `file_name` (VARCHAR(256), NOT NULL)
- `mime_type` (VARCHAR(128), NOT NULL)
- `file_size_bytes` (BIGINT, NOT NULL)
- `sha256_hash` (CHAR(64), NOT NULL)
- `version` (INTEGER, default 1)
- `classification` (VARCHAR(32), default 'CONFIDENTIAL')
- `uploaded_by_id` (UUID, FK -> users.id, NOT NULL)
- `owning_organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `created_at` (TIMESTAMPTZ, default now())

##### `case_timeline` (Unified Real-Time Operational Ledger)
- `id` (UUID, PK)
- `case_id` (UUID, FK -> cases.id, NOT NULL)
- `event_type` (VARCHAR(64), NOT NULL)
- `title` (VARCHAR(256), NOT NULL)
- `description` (TEXT)
- `actor_id` (UUID, FK -> users.id, NOT NULL)
- `organization_id` (UUID, FK -> organization_nodes.id, NOT NULL)
- `entity_type` (VARCHAR(64))
- `entity_id` (UUID)
- `occurred_at` (TIMESTAMPTZ, default now())
- *Indexes*: `case_id`, `occurred_at`.

##### `audit_logs` (Append-Only Enterprise Audit Vault)
- `id` (UUID, PK, default gen_random_uuid())
- `timestamp` (TIMESTAMPTZ, default now(), NOT NULL)
- `user_id` (UUID)
- `organization_id` (UUID)
- `action` (VARCHAR(64), NOT NULL) - E.g. `LOGIN`, `LOGIN_FAILURE`, `AUTHZ_DENY`, `CASE_READ`, `CASE_CREATE`, `EVIDENCE_TRANSFER`, `DOC_DOWNLOAD`
- `resource_type` (VARCHAR(64), NOT NULL)
- `resource_id` (VARCHAR(128))
- `case_id` (UUID)
- `result` (VARCHAR(16), NOT NULL) - `'ALLOW'`, `'DENY'`, `'SUCCESS'`, `'FAILED'`
- `before_value` (JSONB)
- `after_value` (JSONB)
- `ip_address` (VARCHAR(45))
- `user_agent` (TEXT)
- *Indexes*: `timestamp`, `user_id`, `case_id`, `action`, `result`.

