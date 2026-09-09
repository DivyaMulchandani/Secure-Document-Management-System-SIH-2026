# SYSTEM ARCHITECTURE
## Secure Multi-Agency Investigation & Case Management Platform

---

### 1. Executive Summary & Core Mission
The **Secure Multi-Agency Investigation & Case Management Platform** is a multi-tenant, institutional-grade, cross-agency justice-sector management platform. It coordinates four foundational branches of the criminal justice ecosystem:
1. **Police Organizations** (State HQ, Specialized Wings like ATS/CID/Cybercrime, Commissionerates, District Ranges, Police Stations, Chowkis, Beats).
2. **Investigation Units** (IOs, SITs, SDPO/DSP/ACP Supervisory Officers, Case Diarists, Reviewing Authorities).
3. **Forensic Science Organizations** (Central DFSS, CFSLs, Gujarat State FSL Gandhinagar, Regional FSLs, Mobile District Units, NFSU).
4. **Judiciary Establishments** (High Court of Gujarat, District Courts, Specialized Sessions Courts, CJM/JMFC Courts, Executive Magistracy, Registry & Benches).

The platform models the lifecycle of criminal cases from incident reporting and FIR registration, through field investigation, chain-of-custody forensic examination, formal chargesheeting, and judicial trial adjudication.

---

### 2. The Three Architectural Dimensions

The entire platform is structured across three orthogonal dimensions:

```
                          DIMENSION 1: VERTICAL HIERARCHY
                         (Who belongs where & administers whom)
                                     │
                                     ▼
                ┌──────────────────────────────────────────────┐
                │ MASTER / APEX LEVEL                          │
                │ ├── POLICE HIERARCHY (HQ -> Comm'te -> Stn)  │
                │ ├── FORENSIC HIERARCHY (DFSS -> SFSL -> RFSL)│
                │ └── JUDICIARY HIERARCHY (High Court -> Dist) │
                └──────────────────────────────────────────────┘
                                     │
                                     │
                                     ▼
                     DIMENSION 2: HORIZONTAL CASE LAYERS
                          (What information exists)
  ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
  │  POLICE   │ ──> │ INVESTIG. │ ──> │ FORENSIC  │ ──> │   COURT   │
  │  MODULE   │     │  MODULE   │     │  MODULE   │     │  MODULE   │
  └─────┬─────┘     └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
        │                 │                 │                 │
        └─────────────────┴────────┬────────┴─────────────────┘
                                   │
                                   ▼
                    CENTRAL CASE / FIR WORKSPACE
            (Dual ID: UUID + Human FIR, Documents, Timeline, Audit)
                                   │
                                   ▼
                      DIMENSION 3: AUTHORIZATION
                           (Who can do what)
 [User + Role + Org + Org Scope + Resource + Case + Action + Delegation + Time]
```

#### Dimension 1: Vertical Organizational Hierarchy
- Defines institutional reporting, administrative boundaries, and managerial oversight.
- Evaluated via strict subtree inheritance: an administrator or supervisor at level $N$ has visibility into nodes in their own subtree (descendants), but has **zero access** to sibling nodes or ancestor management.
- Sibling isolation is mathematically and programmatically enforced.

#### Dimension 2: Horizontal Case / Information Layers
- Defines the data artifacts and operational workflows comprising an investigation.
- Slices across:
  - **FIR & Incident Initiation** (Complainant, incident timeline, penal codes / acts).
  - **Persons & Entities** (Victims, accused, witnesses, suspect profiles).
  - **Investigation Operations** (Case diary entries, panchnama, statements under CrPC/BNSS, chargesheet).
  - **Physical & Digital Evidence** (Evidence catalog, barcoding/tagging, chain of custody logs).
  - **Forensic Submissions & Reports** (Memos, lab receiving, scientific division analysis, sealed reports).
  - **Judicial Trial Data** (Court case registration, CNR number, bail hearings, order sheets, verdicts).
  - **Documents & Evidence Vault** (Tamper-evident document repository with versioning).

#### Dimension 3: Authorization & Security Envelope
- Enforces contextual policy gates:
  $$\text{Access} = f(\text{Subject}, \text{Role}, \text{Organization}, \text{Subtree Scope}, \text{Case}, \text{Resource}, \text{Action}, \text{Delegation}, \text{Time})$$
- Guarantees that participating agencies see only their mandated resources within any given shared case workspace.

---

### 3. System Architecture Diagram

```
+───────────────────────────────────────────────────────────────────────────────+
|                                CLIENT LAYER                                   |
|   Responsive Modern Institutional Web Application (Next.js App Router / React)|
|   - Institutional Color Palette, High Information Density, Fast Keyboard Nav  |
|   - Hierarchy Explorer, Dynamic Case Workspace, Real-time Timeline, Audit     |
+───────────────────────────────────────┬───────────────────────────────────────+
                                        │ HTTPS / WSS / REST API
                                        ▼
+───────────────────────────────────────────────────────────────────────────────+
|                             API GATEWAY & GUARDS                              |
|   - Global Rate Limiting & Brute-Force Throttling                             |
|   - Security Headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)    |
|   - Secure HTTP-Only Cookie Session Validation                                |
|   - Input Sanitization & Zod Schema Validation                                |
+───────────────────────────────────────┬───────────────────────────────────────+
                                        │
                                        ▼
+───────────────────────────────────────────────────────────────────────────────+
|                         CENTRAL AUTHORIZATION ENGINE                          |
|   - Subtree Hierarchy Resolution (CTE / Materialized Ancestor Paths)          |
|   - Sibling Isolation Validator                                               |
|   - Role-Based Action Matrix (RBAC)                                           |
|   - Case Participation & Delegated Access Validator                           |
|   - Append-Only Synchronous Audit Dispatcher                                  |
+───────────────────────────────────────┬───────────────────────────────────────+
                                        │
                   ┌────────────────────┴────────────────────┐
                   ▼                                         ▼
+───────────────────────────────────────+ +─────────────────────────────────────+
|           BUSINESS DOMAINS            | |         DOCUMENT VAULT              |
|  - Auth & Identity Service            | |  - Metadata Registry                |
|  - Organization Tree Service          | |  - Secure Storage Engine            |
|  - Case & FIR Registry                | |  - SHA-256 Checksum Verifier        |
|  - Investigation & Panchnama Service  | |  - Anti-Path-Traversal Jail         |
|  - Evidence & Chain-of-Custody        | |  - Streaming Authorization Filter   |
|  - Forensic Workflow & Reporting      | +─────────────────────────────────────+
|  - Court Proceedings & Orders         |
|  - Global Scoped Search Engine        |
+──────────────────┬────────────────────+
                   │
                   ▼
+───────────────────────────────────────────────────────────────────────────────+
|                             PERSISTENCE LAYER                                 |
|   PostgreSQL Engine (Drizzle ORM)                                             |
|   - Native PostgreSQL on Linux (Embedded PGlite for Zero-Config Local Dev     |
|     and Standalone Enterprise PostgreSQL for Staging/Production)              |
|   - ACID Transactions, Foreign Key Constraints, Indexed B-Trees, JSONB        |
|   - Append-Only Audit Logs & Case Event Timeline                              |
+───────────────────────────────────────────────────────────────────────────────+
```

---

### 4. Cross-Agency Bridge: Case Participation Model

A case is **not** an open public board, nor is it duplicated across disparate databases. It lives in a single normalized schema where access is bridged through explicit agency participation:

```
                                  [ CASE WORKSPACE ]
                                 ID: CASE-2026-000492
                              Originating Org: Surat PS A
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  │                       │                       │
                  ▼                       ▼                       ▼
           [ POLICE WING ]       [ FORENSIC SCIENCE ]       [ JUDICIARY ]
          Surat PS A / IO        RFSL Surat / Ballistics   District Court Surat
                  │                       │                       │
      - Full FIR & Diary       - Evidence Submission     - Court Registration
      - Witness Statements     - Division Assignment     - Bail Proceedings
      - Panchnama              - Examination Findings    - Witness Summons
      - Chargesheet Creation   - Formal Ballistic Report - Final Judgement
```

1. **Originating Organization Ownership**: The police unit that registers the FIR retains primary administrative custody of the case record.
2. **Forensic Request Handoff**: When evidence is referred to a forensic lab (e.g. RFSL Surat), an official `forensic_submission` record is created. This grants the designated forensic organization read-access to the submitted evidence items and write-access to examination records and reports. It does **not** grant the forensic examiner permission to modify the police case diary or change court orders.
3. **Judicial Presentation**: Upon filing of the Chargesheet, the case is assigned a Court Case / CNR number. The Judiciary establishment receives formal custody over trial proceedings, orders, and judgements, while police and prosecution receive visibility into court dates and directives.

---

### 5. Architectural Integrity Guarantees
- **No Mock APIs**: Every route executes against real database tables through the authorization engine.
- **Zero Client Trust**: All user identifiers, scopes, permissions, and entity IDs sent from the browser are treated as untrusted and verified server-side.
- **Append-Only Auditing**: Every authorization decision (ALLOW or DENY), state mutation, and document download emits an immutable audit event recording subject, timestamp, IP, user-agent, prior state, and new state.

