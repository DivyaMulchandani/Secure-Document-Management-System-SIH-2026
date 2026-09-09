# CENTRAL AUTHORIZATION & ACCESS CONTROL SPECIFICATION
## Secure Multi-Agency Investigation & Case Management Platform

---

### 1. Mathematical Authorization Formula

Every request to any protected resource evaluates through the deterministic authorization function:

$$\mathcal{D} = \mathbf{Authorize}(\mathcal{U}, \mathcal{R}, \mathcal{O}, \mathcal{S}, \mathcal{E}, \mathcal{C}, \mathcal{A}, \mathcal{G}, \mathcal{T})$$

Where:
- $\mathcal{U}$: Authenticated User Identity (verified server-side from active session)
- $\mathcal{R}$: Assigned System Role (e.g. `POLICE_ADMIN`, `INVESTIGATOR`, `FORENSIC_EXAMINER`, `JUDGE`)
- $\mathcal{O}$: User Primary Organization Node (e.g. Surat Police Station A)
- $\mathcal{S}$: Effective Organizational Subtree Scope ($\{ n \in \mathcal{T}_{\text{org}} \mid n \text{ is descendant of } \mathcal{O} \lor n = \mathcal{O} \}$)
- $\mathcal{E}$: Target Resource Entity (e.g. `Case`, `InvestigationEntry`, `Evidence`, `ForensicReport`, `Document`)
- $\mathcal{C}$: Case Context (Originating Agency, Agency Participation Grants)
- $\mathcal{A}$: Requested Action (e.g. `READ`, `CREATE`, `UPDATE`, `TRANSFER`, `DOWNLOAD`)
- $\mathcal{G}$: Delegated Temporary Access Grants (active unexpired assignments to $\mathcal{U}$)
- $\mathcal{T}$: Temporal Validity ($t_{\text{current}} < t_{\text{expires}}$)

Outcome $\mathcal{D} \in \{\mathbf{ALLOW}, \mathbf{DENY}\}$. If $\mathbf{DENY}$, response is strictly **HTTP 403 Forbidden** and an immutable audit entry with `result = 'DENY'` is generated.

---

### 2. Vertical Subtree Inheritance & Sibling Isolation

#### 2.1 The Hierarchy Tree Model
Organizations are stored with a materialized path and adjacency list:
```
                                MASTER_NODE
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
    GUJ_POLICE_HQ             GUJ_SFSL_DIRECT             GUJ_HIGH_COURT
         │                           │                           │
   SURAT_COMMISSION            RFSL_SURAT                  DISTRICT_COURT_SURAT
         │                           │                           │
     ZONE_1                      BALLISTICS_DIV              SESSIONS_COURT_1
   ┌─────┴─────┐
   │           │
STATION_A   STATION_B
```

#### 2.2 Rules of Subtree Traversal
1. **Descendant Reach**: A user belonging to `SURAT_COMMISSION` has administrative and operational oversight over all nodes whose materialized path contains `SURAT_COMMISSION` (i.e. `ZONE_1`, `STATION_A`, `STATION_B`).
2. **Sibling Isolation**:
   - `STATION_A` and `STATION_B` are siblings under `ZONE_1`.
   - An officer at `STATION_A` cannot query, view, or mutate cases owned by `STATION_B` unless explicit case participation or temporary delegation has been established.
   - Any query specifying `organization_id = STATION_B` by a `STATION_A` officer is immediately evaluated as out-of-scope and rejected with **403 Forbidden**.
3. **Parent Protection**:
   - A child administrator (e.g. at `ZONE_1`) cannot modify records, users, or configuration belonging to `SURAT_COMMISSION` or `GUJ_POLICE_HQ`.
   - Child admins cannot grant permissions or roles outside their own permitted ceiling.

---

### 3. Horizontal Agency Boundaries (Case-Level Partitioning)

When a case involves multiple agencies, permissions are strictly partitioned by agency branch:

| Case Resource / Action | Police Wing | Forensic Science Lab | Judiciary / Court | Master Admin |
| :--- | :---: | :---: | :---: | :---: |
| **Create New FIR** | ALLOW | DENY | DENY | ALLOW (Emergency) |
| **Edit Police Case Diary** | ALLOW (Assigned IO) | DENY | DENY | DENY |
| **Record Panchnama** | ALLOW | DENY | DENY | DENY |
| **File Chargesheet** | ALLOW (Police Admin/IO) | DENY | DENY | DENY |
| **Register Physical Evidence** | ALLOW | DENY | DENY | DENY |
| **Initiate Chain-of-Custody** | ALLOW | ALLOW (Lab Receipt) | ALLOW (Exhibits) | DENY |
| **Submit Forensic Request** | ALLOW | DENY | DENY | DENY |
| **Conduct Lab Examination** | DENY | ALLOW (Assigned Examiner) | DENY | DENY |
| **Issue Forensic Report** | DENY | ALLOW (Lead Examiner) | DENY | DENY |
| **Create Court Case / CNR** | DENY | DENY | ALLOW (Court Clerk) | DENY |
| **Record Hearing & Order** | DENY | DENY | ALLOW (Judge / Clerk) | DENY |
| **Pronounce Judgement** | DENY | DENY | ALLOW (Presiding Judge) | DENY |
| **Download Case Documents** | ALLOW (Case Scope) | ALLOW (Exam Scope) | ALLOW (Trial Scope) | ALLOW |

---

### 4. Temporary Delegated Access Protocol

Temporary access accommodates inter-agency joint task forces, independent oversight, and special public prosecutors:

```
[Delegation Request]
   - Granter: User A (Must possess the requested permissions within their scope)
   - Grantee: User B (Target officer)
   - Scope: Target Case UUID
   - Action Set: E.g. [CASE_READ, EVIDENCE_READ, DOCUMENT_DOWNLOAD]
   - Time Window: [starts_at, expires_at]
         │
         ▼
[Central Auth Engine Evaluation]
   1. Granter Authority Verification: granter_permissions ⊇ requested_permissions?
   2. Temporal Boundary Check: now() >= starts_at AND now() <= expires_at?
   3. Revocation Check: status == 'ACTIVE'?
         │
         ├── NO ──> HTTP 403 (Unauthorized / Delegation Expired)
         └── YES ──> Allow Action + Record in Audit Trail with delegation_id
```

---

### 5. Central Authorization Engine Architecture

```typescript
// Core Engine Signature
export interface AuthContext {
  userId: string;
  roleId: string;
  organizationId: string;
  descendantOrgIds: Set<string>;
  permissions: Set<string>;
  delegations: ActiveDelegation[];
}

export interface ResourceContext {
  resourceType: 'CASE' | 'FIR' | 'INVESTIGATION' | 'EVIDENCE' | 'FORENSIC' | 'COURT' | 'DOCUMENT' | 'USER' | 'ORG';
  resourceId?: string;
  owningOrgId?: string;
  caseId?: string;
}

export async function authorize(
  ctx: AuthContext,
  action: PermissionKey,
  resource: ResourceContext
): Promise<AuthzDecision>
```

#### Verification Steps:
1. **Authentication Check**: Reject if `ctx` is null or session is expired (`401 Unauthorized`).
2. **Master Exemption**: `MASTER_ADMIN` possesses global institutional audit and configuration capabilities, but operational investigative updates still adhere to audit invariants.
3. **Permission Check**: Does `ctx.permissions` contain `action`? If not, check active unexpired `delegations`. If neither matches, return `403 Forbidden`.
4. **Subtree Organizational Scope Check**:
   - If the resource has an `owningOrgId`, is `owningOrgId` in `ctx.descendantOrgIds`?
   - If yes, pass scope check.
5. **Cross-Agency Case Participation Check**:
   - If `owningOrgId` is outside the user's subtree, check if the user's agency has an active grant in `case_agency_participation` for `resource.caseId`.
   - If so, verify that the requested `action` matches the authorized role for that agency branch (e.g. `FORENSIC_EXAMINER` on a forensic submission).
6. **Delegation Fallback**:
   - If organizational checks fail, check if there is an active `delegated_access` record granting `action` to `ctx.userId` on `resource.caseId`.
7. **Audit Dispatch**:
   - Every invocation of `authorize()` logs synchronously to `audit_logs` if the action is state-modifying or rejected.

