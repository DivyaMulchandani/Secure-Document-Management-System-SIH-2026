# PROJECT REALIGNMENT: Data-Driven Hierarchical Multi-Agency Identity & Organizational Architecture

**Document Version**: 2.0  
**Date**: September 2026  
**Status**: APPROVED ARCHITECTURAL BLUEPRINT (Milestone 1 Focus)

---

## 1. Current State Assessment

### What Currently Exists
- **Database Engine**: PostgreSQL 16 on port 5432 (`casevault`, schema `investigation`).
- **Data Model**: 24 tables covering organizations, users, roles, permissions, cases, evidence, forensics, courts, and audit logs.
- **Authentication**: Zero-client-trust session authentication via bcrypt password hashes, high-entropy random session tokens stored in `user_sessions`, and cookie-based validation.
- **Authorization Engine**: Mathematical 9-point rule evaluation ($\mathcal{D} = \mathbf{Authorize}(\mathcal{U}, \mathcal{R}, \mathcal{O}, \mathcal{S}, \mathcal{E}, \mathcal{C}, \mathcal{A}, \mathcal{G}, \mathcal{T})$) checking permissions, agency boundaries, vertical subtree scope, sibling station isolation, and audit logging.
- **Security Test Suite**: Automated verification scripts in `tests/security.test.ts`.
- **Frontend**: Vite + React 19 + Tailwind CSS single-page web console.

### What is Database-Backed vs. What Relied on Assumptions
- **Database-Backed**: All logins, session verification, user inserts, organization node traversals, and audit ledger entries run against PostgreSQL tables with zero mock JSON files.
- **Identified Flaws & Misalignments**:
  1. **Premature Workflow Mixing**: FIR registration, case diaries, physical evidence custody, ballistic submissions, and court proceedings were implemented concurrently before establishing the foundational identity and administrative lifecycle.
  2. **Tree Merging**: All three bodies (Police, Forensics, Judiciary) were rooted under a single artificial apex node (`root`) rather than three sovereign, independent organizational entity trees.
  3. **Abbreviated Trees**: The Gujarat Police, Judiciary, and FSL hierarchies were condensed to small demo subtrees rather than the full organizational architecture.
  4. **Premature User Seeding**: All demo personas were pre-seeded in the database simultaneously, bypassing the vital institutional governance requirement: **Master Admin provisions Body Admins $\rightarrow$ Body Admins provision Layer Admins & Personnel within their scope**.
  5. **Static UI Shortcuts**: The login page contained hard-coded demo persona quick-select buttons rather than reflecting purely database-authenticated personnel.

---

## 2. Target Architecture

```text
                         SYSTEM MASTER ADMIN
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
                ▼                 ▼                 ▼
          POLICE BODY       JUDICIARY BODY     FORENSIC BODY
                │                 │                 │
          POLICE TREE       JUDICIARY TREE     FSL TREE
                │                 │                 │
                ▼                 ▼                 ▼
          POLICE ADMINS     COURT ADMINS       FSL ADMINS
                │                 │                 │
                ▼                 ▼                 ▼
          POLICE USERS      COURT USERS        FSL USERS
                │                 │                 │
                └─────────────────┼─────────────────┘
                                  │
                                  │
                         CONTROLLED CASE ACCESS
                                  │
                                  ▼
                            FIR / CASE
                             WORKSPACE
```

### Core Architectural Principles
1. **Three Separate Sovereign Bodies**:
   - **POLICE**: Gujarat Police Department
   - **JUDICIARY**: Gujarat State Judiciary & Courts
   - **FORENSICS**: Forensic Science Services (DFSS / SFSL / RFSL)
2. **Strict Sibling & Cross-Body Isolation**:
   - An administrator or user in Body A has zero access to Body B or Body C.
   - Sibling peer nodes (e.g. Surat Commissionerate vs Ahmedabad Commissionerate, or Station A vs Station B) have zero visibility into each other's personnel, records, or administration without explicit delegation.
3. **Database-Driven Identity Lifecycle**:
   - Initial state contains **ONLY ONE** user: the **System Master Admin**.
   - Master Admin provisions the 3 Body Admins (**Police Admin**, **Court Admin**, **FSL Admin**).
   - Each Body Admin logs in independently and provisions Layer Admins and Personnel strictly within their descendant subtree.
4. **Separation of Identity vs Case Access**:
   - Creating a user or administrator is an administrative operation.
   - Case access is a completely separate, explicit resource-grant operation owned and controlled by Police.

---

## 3. The Three Complete Organizational Trees

### Body 1: Gujarat Police Hierarchy
```text
GUJARAT POLICE (Root)
├── STATE HEAD QUARTER
│   ├── EXECUTIVE LEADERSHIP (DGP, Special DGs, ADGPs)
│   └── POLICE WINGS
│       ├── Anti-Terrorism Squad (ATS)
│       ├── CID Crime and Railways
│       ├── Gujarat Intelligence Force (State IB)
│       ├── Special Action Force (SAF)
│       ├── Special Operations Group (SOG)
│       ├── Cybercrime Wing & State Cyber Cell
│       ├── Economic Offences Wing (EOW)
│       ├── Protection & Security Wing
│       ├── Coastal Security Wing
│       ├── State Crime Record Bureau (SCRB)
│       ├── Police Training Wing & Academies
│       ├── Technical Services & Telecommunications
│       └── Legal Cell
├── COMMISSIONERATES
│   ├── Ahmedabad City Police Commissionerate (Sectors, Zones, Divisions, Stations)
│   ├── Surat City Police Commissionerate (Sectors, Zones, Divisions, Stations A & B)
│   ├── Vadodara City Police Commissionerate
│   └── Rajkot City Police Commissionerate
├── DISTRICT RANGES
│   ├── Gandhinagar Range, Border Range, Vadodara Range, Rajkot Range
│   └── Surat Range, Bhavnagar Range, Junagadh Range, Panchmahal Range
├── SPECIALIZED STATE UNITS
│   ├── State Reserve Police Force (SRPF Groups)
│   ├── Government Railway Police (GRP)
│   └── Marine Police Units
└── SHARED POLICE SERVICES
```

### Body 2: Gujarat State Judiciary Hierarchy
```text
GUJARAT JUDICIARY (Root)
├── STATE APEX JUDICIARY
│   ├── High Court of Gujarat
│   ├── Registrar General & Judicial Administrative Wing
│   ├── IT & eCourts Administrative Wing
│   ├── Judicial Officers Protocol & Recruitment Branch
│   └── High Court Benches (Division Benches & Single Benches)
├── DISTRICT JUDICIARY
│   ├── Principal District & Sessions Court Establishment, Ahmedabad
│   ├── Principal District & Sessions Court Establishment, Surat (Additional Sessions Courts)
│   ├── Principal District & Sessions Court Establishment, Vadodara
│   └── Principal District & Sessions Court Establishment, Rajkot
├── SPECIALIZED COURTS
│   ├── Special CBI Courts
│   ├── Special Anti-Corruption Bureau (ACB) Courts
│   └── Commercial Courts & Commercial Appellate Division
├── SUBJECT MATTER COURTS
│   ├── Special POCSO Courts
│   ├── Special NDPS Courts
│   └── Motor Accident Claims Tribunals (MACT)
├── SUBDIVISIONAL / TALUKA JUDICIARY
│   ├── Chief Judicial Magistrate (CJM) Courts
│   └── Judicial Magistrate First Class (JMFC) Courts
├── EXECUTIVE MAGISTRACY
│   ├── District Magistrate (DM) / Collectorate Courts
│   └── Sub-Divisional Magistrate (SDM) Courts
└── SHARED JUDICIAL SERVICES
```

### Body 3: Forensic Science Services Hierarchy
```text
FORENSIC SCIENCE SERVICES (Root)
├── CENTRAL FORENSIC ARCHITECTURE
│   └── Directorate of Forensic Science Services (DFSS Apex)
├── CENTRAL SPECIALIZED FORENSIC LAB
├── STATE FORENSIC SCIENCE LABORATORIES
│   └── Gujarat State Forensic Science Laboratory (SFSL Gandhinagar)
│       ├── Ballistics & Physical Sciences Division
│       ├── Biology, Serology & DNA Profiling Division
│       ├── Chemistry & Toxicology Division
│       ├── Cyber Forensics & Digital Investigation Division
│       ├── Questioned Documents & Handwriting Analysis
│       ├── Fingerprint Bureau & Biometrics Division
│       ├── Forensic Psychology, Lie Detection & Narco-Analysis
│       └── Narcotics, Explosives & Chemical Warfare Division
├── REGIONAL FORENSIC SCIENCE LABORATORIES (RFSL)
│   ├── Regional FSL Ahmedabad
│   ├── Regional FSL Surat (Ballistics, Chemistry, Cyber Units)
│   ├── Regional FSL Vadodara
│   └── Regional FSL Rajkot
├── DISTRICT MOBILE FORENSIC UNITS (DFSU / Mobile Crime Scene Vans)
└── ACADEMIC & RESEARCH NODES
    └── National Forensic Sciences University (NFSU Gandhinagar)
```

---

## 4. Migration & Implementation Plan

We execute in strict sequential milestones:

### MILESTONE 1: Foundation (Organizations, Identity, Hierarchical Scope & RBAC)
*No FIRs, no evidence submissions, no court cases will be built or seeded in Milestone 1.*

1. **Database Schema Enhancements**:
   - Add table `organization_bodies`:
     - `id VARCHAR(32) PRIMARY KEY` (`POLICE`, `JUDICIARY`, `FORENSICS`, `MASTER`)
     - `name VARCHAR(128) NOT NULL`
     - `code VARCHAR(32) UNIQUE NOT NULL`
     - `description TEXT`
   - Update `organization_nodes`:
     - Add `body_id VARCHAR(32) REFERENCES organization_bodies(id)`
     - Materialized path structure (`POLICE.HQ.COMM_SURAT.STA`)
2. **Complete Seed of the 3 Full Hierarchies**:
   - Seed the complete Gujarat Police, Judiciary, and FSL trees.
   - Clean out premature demo case/evidence records.
   - Seed **ONLY ONE** initial credential: `master_admin` (`Gov@Secure2026!`).
3. **Master Admin Dashboard & Body Admin Provisioning**:
   - Master Admin dashboard with dedicated 3-body inspection tabs:
     - 🛡️ Police Body Tree & Admins
     - ⚖️ Judiciary Body Tree & Admins
     - 🔬 Forensics Body Tree & Admins
   - Action: **"Create Body Administrator"** (provisions Police Admin, Court Admin, or FSL Admin).
4. **Body Admin Dynamic Dashboards & Layer Provisioning**:
   - Police Admin logs in with own credentials $\rightarrow$ sees Police Dashboard only.
   - Judiciary Admin logs in with own credentials $\rightarrow$ sees Judiciary Dashboard only.
   - Forensic Admin logs in with own credentials $\rightarrow$ sees Forensics Dashboard only.
   - Body Admins can provision subordinate Layer Admins and Officers strictly within their descendant subtree.
   - Strict rejection (403) on cross-body provisioning and sibling node tampering.
5. **Milestone 1 Acceptance Test Suite**:
   - Build automated suite in `tests/milestone1.test.ts` verifying all 10 acceptance criteria specified in the realignment prompt.

---

### MILESTONE 2: Controlled Case & Ticket Concept
*(Executed only after Milestone 1 passes 100%)*
1. **Case Request Ticket Concept**:
   - Police Officer initiates `CREATE CASE/FIR REQUEST` ticket.
   - Traceability: `ticket_id`, `requester_user_id`, `organization_node_id`, `status`.
   - Authorized ticket transition $\rightarrow$ System generates internal UUID & official FIR number.
2. **Case Workspace & Access Control Matrix**:
   - Case workspace is isolated by default.
   - Case owner controls resource-level access grants (`FSL`, `Court`, `User`, `Permission`, `Time`).
3. **FSL Examination Request & Report Locking**:
   - Police creates examination request for specific division & FSL lab.
   - FSL scientist conducts examination and locks report (`LOCKED`).
   - Police explicitly authorizes release before report is readable.
4. **Court Docket Access**:
   - Explicit court referral by Police.
   - Court receives read-only access to released prosecution records; Court maintains separate judicial hearings/orders.
5. **Full Synchronous Audit**:
   - Immutable audit logging for every authentication, administrative, and access grant event.

