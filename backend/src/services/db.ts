import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'casevault',
  user: process.env.DB_USER || 'casevault',
  password: process.env.DB_PASSWORD || 't0rr3rdbmz7!P9xw',
  max: 25,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO investigation, public;');
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS investigation;
      SET search_path TO investigation, public;

      -- 0. Sovereign Organization Bodies
      CREATE TABLE IF NOT EXISTS organization_bodies (
        id VARCHAR(32) PRIMARY KEY, -- 'POLICE', 'JUDICIARY', 'FORENSICS', 'MASTER'
        name VARCHAR(128) NOT NULL,
        code VARCHAR(32) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 1. Organization Types & Node Types
      CREATE TABLE IF NOT EXISTS organization_types (
        id VARCHAR(64) PRIMARY KEY,
        agency_branch VARCHAR(32) NOT NULL, -- 'POLICE', 'FORENSICS', 'JUDICIARY', 'MASTER'
        name VARCHAR(128) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS organization_node_types (
        id VARCHAR(64) PRIMARY KEY,
        code VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        body_id VARCHAR(32) REFERENCES organization_bodies(id),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 2. Organization Nodes (Hierarchical)
      CREATE TABLE IF NOT EXISTS organization_nodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        body_id VARCHAR(32) REFERENCES organization_bodies(id),
        agency_branch VARCHAR(32) NOT NULL,
        type_id VARCHAR(64) REFERENCES organization_types(id) ON DELETE RESTRICT,
        node_type_id VARCHAR(64),
        name VARCHAR(256) NOT NULL,
        code VARCHAR(64) UNIQUE NOT NULL,
        hierarchy_path TEXT NOT NULL, -- materialized path for instant subtree traversal e.g. POLICE.HQ.COMM_SURAT.STA
        level INTEGER NOT NULL DEFAULT 1,
        jurisdiction_area TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE organization_nodes ADD COLUMN IF NOT EXISTS body_id VARCHAR(32) REFERENCES organization_bodies(id);
      ALTER TABLE organization_nodes ADD COLUMN IF NOT EXISTS node_type_id VARCHAR(64);
      ALTER TABLE organization_nodes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

      CREATE INDEX IF NOT EXISTS idx_org_nodes_parent ON organization_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_org_nodes_body ON organization_nodes(body_id);
      CREATE INDEX IF NOT EXISTS idx_org_nodes_branch ON organization_nodes(agency_branch);
      CREATE INDEX IF NOT EXISTS idx_org_nodes_path ON organization_nodes(hierarchy_path);

      -- 3. Roles
      CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(64) PRIMARY KEY,
        agency_branch VARCHAR(32) NOT NULL,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 4. Permissions
      CREATE TABLE IF NOT EXISTS permissions (
        id VARCHAR(64) PRIMARY KEY,
        category VARCHAR(64) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 5. Role Permissions
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id VARCHAR(64) REFERENCES roles(id) ON DELETE CASCADE,
        permission_id VARCHAR(64) REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      -- 6. Users
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(64) UNIQUE NOT NULL,
        email VARCHAR(256) UNIQUE NOT NULL,
        display_name VARCHAR(128) NOT NULL,
        badge_number VARCHAR(64),
        phone_number VARCHAR(32),
        designation VARCHAR(128),
        department_wing VARCHAR(128),
        clearance_level VARCHAR(32) NOT NULL DEFAULT 'CONFIDENTIAL',
        is_layer_admin BOOLEAN NOT NULL DEFAULT FALSE,
        password_hash TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'LOCKED', 'SUSPENDED'
        primary_role_id VARCHAR(64) REFERENCES roles(id) ON DELETE RESTRICT,
        primary_organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        failed_login_count INTEGER DEFAULT 0,
        locked_until TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        password_changed_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(128);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS department_wing VARCHAR(128);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS clearance_level VARCHAR(32) DEFAULT 'CONFIDENTIAL';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_layer_admin BOOLEAN DEFAULT FALSE;

      CREATE INDEX IF NOT EXISTS idx_users_org ON users(primary_organization_id);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(primary_role_id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_layer_admin ON users(is_layer_admin);

      -- 6b. User Roles (Reusable Role Assignment)
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        role_id VARCHAR(64) REFERENCES roles(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, role_id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

      -- 6c. Administrative Scopes (Which Subtree / Area an Admin Can Manage)
      CREATE TABLE IF NOT EXISTS admin_scopes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        organization_node_id UUID REFERENCES organization_nodes(id) ON DELETE CASCADE,
        scope_type VARCHAR(32) NOT NULL DEFAULT 'SUBTREE', -- 'NODE_ONLY', 'SUBTREE', 'CUSTOM'
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_admin_scopes_user ON admin_scopes(user_id);
      CREATE INDEX IF NOT EXISTS idx_admin_scopes_org ON admin_scopes(organization_node_id);

      -- 7. User Sessions
      CREATE TABLE IF NOT EXISTS user_sessions (
        id VARCHAR(128) PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

      -- 8. Cases (Central Workspace Root)
      CREATE TABLE IF NOT EXISTS cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- IMMUTABLE INTERNAL UUID
        fir_number VARCHAR(128) NOT NULL, -- OFFICIAL HUMAN-FACING FIR IDENTIFIER
        case_type VARCHAR(32) NOT NULL DEFAULT 'NEW_FIR', -- 'NEW_FIR', 'LEGACY_FIR', 'PRELIMINARY_INQUIRY'
        legacy_fir_number VARCHAR(128),
        year INTEGER NOT NULL,
        originating_organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        lead_investigator_id UUID REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(512) NOT NULL,
        description TEXT,
        incident_date TIMESTAMPTZ,
        incident_location TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'UNDER_INVESTIGATION', -- 'REGISTERED', 'UNDER_INVESTIGATION', 'CHARGESHEETED', 'TRIAL_IN_PROGRESS', 'DISPOSED', 'CLOSED'
        is_legacy BOOLEAN DEFAULT FALSE,
        duplicate_warning_flag BOOLEAN DEFAULT FALSE,
        created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_cases_org_year_fir UNIQUE (originating_organization_id, year, fir_number)
      );

      CREATE INDEX IF NOT EXISTS idx_cases_fir ON cases(fir_number);
      CREATE INDEX IF NOT EXISTS idx_cases_org ON cases(originating_organization_id);
      CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
      CREATE INDEX IF NOT EXISTS idx_cases_year ON cases(year);

      -- 9. Case Agency Participation (Cross-Agency Bridge)
      CREATE TABLE IF NOT EXISTS case_agency_participation (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        agency_branch VARCHAR(32) NOT NULL, -- 'POLICE', 'FORENSICS', 'JUDICIARY'
        access_role VARCHAR(64) NOT NULL, -- 'ORIGINATING_AGENCY', 'FORENSIC_EXAMINER_LAB', 'TRIAL_COURT', 'SUPERVISORY_WINGS'
        granted_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_case_agency UNIQUE (case_id, organization_id)
      );

      CREATE INDEX IF NOT EXISTS idx_case_agency_case ON case_agency_participation(case_id);
      CREATE INDEX IF NOT EXISTS idx_case_agency_org ON case_agency_participation(organization_id);

      -- 10. FIRs (First Information Report Details)
      CREATE TABLE IF NOT EXISTS firs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
        registration_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        complainant_name VARCHAR(256) NOT NULL,
        complainant_contact VARCHAR(128),
        complainant_address TEXT,
        acts_and_sections JSONB NOT NULL DEFAULT '[]', -- E.g. [{"act": "BNS 2023", "sections": ["309(4)", "311"]}]
        occurrence_from TIMESTAMPTZ,
        occurrence_to TIMESTAMPTZ,
        general_diary_reference VARCHAR(128),
        fir_content TEXT NOT NULL,
        dispatch_to_court_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 11. Persons & Case Persons
      CREATE TABLE IF NOT EXISTS persons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name VARCHAR(256) NOT NULL,
        alias VARCHAR(128),
        id_proof_type VARCHAR(64),
        id_proof_number VARCHAR(128),
        gender VARCHAR(32),
        dob DATE,
        address TEXT,
        phone VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS case_persons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        person_id UUID REFERENCES persons(id) ON DELETE RESTRICT,
        role_in_case VARCHAR(64) NOT NULL, -- 'COMPLAINANT', 'VICTIM', 'ACCUSED', 'WITNESS', 'SUSPECT'
        custody_status VARCHAR(64) DEFAULT 'NONE', -- 'NONE', 'POLICE_CUSTODY', 'JUDICIAL_CUSTODY', 'ON_BAIL', 'ABSCONDING'
        arrest_date TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_case_persons_case ON case_persons(case_id);
      CREATE INDEX IF NOT EXISTS idx_case_persons_person ON case_persons(person_id);

      -- 12. Investigations (Case Diary Entries)
      CREATE TABLE IF NOT EXISTS investigations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        diary_entry_number INTEGER NOT NULL,
        entry_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        location_visited TEXT,
        investigation_details TEXT NOT NULL,
        officer_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_case_diary_entry UNIQUE (case_id, diary_entry_number)
      );

      CREATE INDEX IF NOT EXISTS idx_investigations_case ON investigations(case_id);

      -- 13. Witness Statements
      CREATE TABLE IF NOT EXISTS witness_statements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        witness_person_id UUID REFERENCES persons(id) ON DELETE RESTRICT,
        statement_text TEXT NOT NULL,
        statement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        recorded_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 14. Panchnamas
      CREATE TABLE IF NOT EXISTS panchnamas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        panchnama_type VARCHAR(64) NOT NULL, -- 'CRIME_SCENE', 'RECOVERY', 'INQUEST', 'ARREST'
        location TEXT NOT NULL,
        panch_witnesses JSONB NOT NULL DEFAULT '[]',
        findings_summary TEXT NOT NULL,
        conducted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        conducted_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 15. Chargesheets
      CREATE TABLE IF NOT EXISTS chargesheets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
        chargesheet_number VARCHAR(128) NOT NULL,
        submission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        submitting_officer_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        target_court_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        accused_charges JSONB NOT NULL DEFAULT '[]',
        prosecution_witness_list JSONB NOT NULL DEFAULT '[]',
        brief_facts TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 16. Evidence Registry
      CREATE TABLE IF NOT EXISTS evidence (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        evidence_tag VARCHAR(64) NOT NULL,
        category VARCHAR(64) NOT NULL, -- 'BALLISTICS', 'BIOLOGICAL', 'DIGITAL', 'CHEMICAL', 'DOCUMENTARY', 'PHYSICAL'
        description TEXT NOT NULL,
        collected_at TIMESTAMPTZ NOT NULL,
        collected_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        collection_location TEXT NOT NULL,
        current_custodian_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        current_organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        storage_location VARCHAR(256) NOT NULL,
        seal_status VARCHAR(64) NOT NULL DEFAULT 'INTACT_AND_VERIFIED',
        status VARCHAR(32) NOT NULL DEFAULT 'IN_POLICE_CUSTODY', -- 'IN_POLICE_CUSTODY', 'TRANSFERRED', 'IN_FORENSIC_LAB', 'PRESENTED_IN_COURT', 'RETURNED'
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_case_evidence_tag UNIQUE (case_id, evidence_tag)
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_org ON evidence(current_organization_id);

      -- 17. Evidence Custody Events (Chain-of-Custody Ledger)
      CREATE TABLE IF NOT EXISTS evidence_custody_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        evidence_id UUID REFERENCES evidence(id) ON DELETE CASCADE,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        from_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        from_organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        to_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        to_organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        action_type VARCHAR(64) NOT NULL, -- 'COLLECTION', 'INTERNAL_TRANSFER', 'FORENSIC_DISPATCH', 'LAB_RECEIPT', 'COURT_EXHIBIT', 'RETURN'
        reason TEXT NOT NULL,
        seal_condition VARCHAR(64) NOT NULL DEFAULT 'INTACT_AND_VERIFIED',
        signature_token TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_custody_evidence ON evidence_custody_events(evidence_id);

      -- 18. Forensic Submissions
      CREATE TABLE IF NOT EXISTS forensic_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        requesting_organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        target_forensic_org_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        submission_memo_number VARCHAR(128) NOT NULL,
        examination_requested TEXT NOT NULL,
        scientific_division VARCHAR(64) NOT NULL, -- 'BALLISTICS', 'DNA', 'CYBER', 'CHEMISTRY', 'TOXICOLOGY', 'DOCUMENTS'
        status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED', -- 'SUBMITTED', 'ACCEPTED', 'UNDER_EXAMINATION', 'REPORT_ISSUED'
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_forensic_sub_case ON forensic_submissions(case_id);
      CREATE INDEX IF NOT EXISTS idx_forensic_sub_target ON forensic_submissions(target_forensic_org_id);

      -- 19. Forensic Examinations & Reports
      CREATE TABLE IF NOT EXISTS forensic_examinations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id UUID REFERENCES forensic_submissions(id) ON DELETE CASCADE,
        examiner_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        methodology TEXT NOT NULL,
        findings_preliminary TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS forensic_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id UUID REFERENCES forensic_submissions(id) ON DELETE CASCADE,
        report_number VARCHAR(128) UNIQUE NOT NULL,
        lead_examiner_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        summary_of_analysis TEXT NOT NULL,
        formal_conclusion TEXT NOT NULL,
        signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status VARCHAR(32) NOT NULL DEFAULT 'FINAL_SEALED', -- 'DRAFT', 'FINAL_SEALED'
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 20. Court Cases & Adjudication
      CREATE TABLE IF NOT EXISTS court_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        court_organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        cnr_number VARCHAR(64) UNIQUE NOT NULL,
        court_case_type VARCHAR(64) NOT NULL, -- 'SESSIONS_CASE', 'SPECIAL_POCSO', 'CRIMINAL_CASE'
        court_case_number VARCHAR(64) NOT NULL,
        filing_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        presiding_judge_name VARCHAR(128),
        current_stage VARCHAR(64) NOT NULL DEFAULT 'FRAMING_OF_CHARGES', -- 'COGNIZANCE', 'FRAMING_OF_CHARGES', 'PROSECUTION_EVIDENCE', 'DEFENCE_EVIDENCE', 'FINAL_ARGUMENTS', 'JUDGEMENT'
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'DISPOSED', 'APPEALED'
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_court_cases_case ON court_cases(case_id);
      CREATE INDEX IF NOT EXISTS idx_court_cases_court ON court_cases(court_organization_id);

      CREATE TABLE IF NOT EXISTS court_proceedings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        court_case_id UUID REFERENCES court_cases(id) ON DELETE CASCADE,
        hearing_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        business_conducted TEXT NOT NULL,
        next_date TIMESTAMPTZ,
        purpose_of_next_hearing VARCHAR(256),
        recorded_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS court_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        court_case_id UUID REFERENCES court_cases(id) ON DELETE CASCADE,
        order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        order_type VARCHAR(64) NOT NULL, -- 'BAIL_GRANTED', 'BAIL_REJECTED', 'SUMMONS', 'WARRANT', 'EVIDENCE_DIRECTION', 'INTERIM_STAY'
        summary TEXT NOT NULL,
        issued_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS court_judgements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        court_case_id UUID REFERENCES court_cases(id) ON DELETE CASCADE,
        judgement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        verdict VARCHAR(64) NOT NULL, -- 'CONVICTION', 'ACQUITTAL', 'DISCHARGED'
        sentences_awarded JSONB NOT NULL DEFAULT '[]',
        judgement_summary TEXT NOT NULL,
        pronounced_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 21. Delegated Access (Temporary Multi-Agency or Taskforce Grants)
      CREATE TABLE IF NOT EXISTS delegated_access (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        granted_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        granted_to_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        permissions TEXT[] NOT NULL,
        reason TEXT NOT NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'REVOKED', 'EXPIRED'
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_delegation_grantee ON delegated_access(granted_to_user_id);
      CREATE INDEX IF NOT EXISTS idx_delegation_case ON delegated_access(case_id);

      -- 22. Secure Document Vault
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        title VARCHAR(256) NOT NULL,
        category VARCHAR(64) NOT NULL, -- 'FIR_SCAN', 'PANCHNAMA', 'FORENSIC_REPORT', 'COURT_ORDER', 'EVIDENCE_PHOTO', 'CASE_DIARY'
        storage_uuid UUID NOT NULL, -- disassociated physical file handle
        file_name VARCHAR(256) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        file_size_bytes BIGINT NOT NULL,
        sha256_hash CHAR(64) NOT NULL,
        version INTEGER DEFAULT 1,
        classification VARCHAR(32) NOT NULL DEFAULT 'CONFIDENTIAL',
        uploaded_by_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        owning_organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'VOIDED', 'SEALED'
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_docs_case ON documents(case_id);
      CREATE INDEX IF NOT EXISTS idx_docs_org ON documents(owning_organization_id);

      -- 23. Unified Real-Time Case Timeline Ledger
      CREATE TABLE IF NOT EXISTS case_timeline (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
        event_type VARCHAR(64) NOT NULL,
        title VARCHAR(256) NOT NULL,
        description TEXT,
        actor_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        organization_id UUID REFERENCES organization_nodes(id) ON DELETE RESTRICT,
        entity_type VARCHAR(64),
        entity_id UUID,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_timeline_case ON case_timeline(case_id);
      CREATE INDEX IF NOT EXISTS idx_timeline_time ON case_timeline(occurred_at DESC);

      -- 24. Append-Only Enterprise Audit Vault
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        organization_id UUID REFERENCES organization_nodes(id) ON DELETE SET NULL,
        action VARCHAR(64) NOT NULL,
        resource_type VARCHAR(64) NOT NULL,
        resource_id VARCHAR(128),
        case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
        result VARCHAR(16) NOT NULL, -- 'ALLOW', 'DENY', 'SUCCESS', 'FAILED'
        before_value JSONB,
        after_value JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT
      );

      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS organization_node_id UUID REFERENCES organization_nodes(id) ON DELETE SET NULL;
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS body_id VARCHAR(32) REFERENCES organization_bodies(id);
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_logs(case_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_result ON audit_logs(result);

      -- 25. System Settings
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(128) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      INSERT INTO system_settings (key, value)
      VALUES 
        ('platform_name', 'SECURE MULTI-AGENCY INVESTIGATION & CASE MANAGEMENT PLATFORM'),
        ('jurisdiction', 'State of Gujarat / India'),
        ('active_penal_code', 'Bharatiya Nyaya Sanhita, 2023 (BNS)')
      ON CONFLICT (key) DO NOTHING;
    `);
  } finally {
    client.release();
  }
}
