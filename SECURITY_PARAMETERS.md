# Security Parameters Checklist

Status of the controls from the Security & Blockchain Assessment Report.
`DONE` = implemented in this codebase · `PARTIAL` = baseline in place, hardening noted · `TODO` = roadmap.

## 2026-09-10 update

A large amount of unrelated feature work (passwordless OTP login, compulsory update
tickets, batch hierarchy import, admin levels/tags) landed on top of the Part A/C work
below and reverted several of the fixes in the process (rate limit back to 250/IP,
hardcoded DB password fallback, hardcoded creds in `Login.tsx`, `secure:false` /
`sameSite:'lax'` cookies, `origin:true` CORS, CSP disabled, `.env` dotenv path bug).
All of Part A/C has been **re-applied** against the current code, extended to cover the
new OTP/login routes, and additionally:

- **Fixed the reported `test:security` deadlock (40P01) at its root cause.**
  `index.ts` self-started a full server + schema-init DDL run as a side effect of being
  `import`-ed — every test file that imports `app` triggered a second, uncoordinated
  `initDatabase()` racing the importer's own queries on the shared pool. Now guarded with
  `if (require.main === module)`; test files that need the schema ready call
  `initDatabase()`/`seedDatabase()` explicitly first (matches how `milestone1`/
  `passwordless`/`batch` already worked, which is *why* they never hit this deadlock).
- Session token in the login/verify-otp JSON body: kept (needed by the existing test
  suites and any Bearer-auth API client) but the **browser SPA no longer stores or
  forwards it** (`frontend/src/lib/api.ts` dropped the `localStorage` + `Authorization`
  header path) — that was the actual XSS-exfiltration risk, not the field's presence.
- `devOtpPreview` (the raw OTP) is only ever returned by the server outside
  `NODE_ENV=production` — in prod the code travels exclusively via SMTP.
- Found and fixed two **functional** bugs while verifying: (1) a wrong password on
  `POST /auth/login` 500'd instead of returning 401, because
  `json_build_object('attempt', $6, ...)` in the failed-login audit insert couldn't infer
  `$6`'s type — this silently defeated the account-lockout counter; (2) CORS-rejected
  requests fell through to a generic 500 instead of 403.
- Reverted an over-strict "assigned role ⊆ actor's permissions" check after it broke a
  legitimate feature: this platform deliberately lets a body admin (e.g. `POLICE_ADMIN`)
  provision the reusable `NODE_ADMIN` role, which intentionally carries broader
  cross-domain permissions for delegated nodes. Cross-agency boundary + subtree scope +
  the `MASTER_ADMIN` provisioning block remain as the real anti-escalation gates.
- Added the missing `GET /api/evidence` collection route (EVD-001 from the testing
  report) and anchored evidence *creation* on the ledger (previously only transfers
  were anchored) — see the Part C section below.
- Verified end-to-end: `npm run build` (backend + frontend) clean, and
  `test:milestone1` (17/17), `test:passwordless` (15/15), `test:batch` (7/7),
  `test:ledger` (4/4) all pass. `test:security` still fails — cleanly, with a 401, no
  deadlock — because its fixtures (`investigator_patel`, `officer_sharma`, etc.) predate
  the current seed, which creates only `master_admin`. That's a pre-existing test-data
  mismatch, not a security regression; fixing it means rewriting its setup to provision
  those personas via the ticket flow, the way `milestone1.test.ts` does.

## Part A — confirmed findings

| # | Finding | Status | Where |
|---|---------|--------|-------|
| A1 | Brute-force limiter was 250/IP/15min | **DONE** — 15 attempts keyed by **IP + username**, `express-rate-limit` | `routes/auth.ts` |
| A2 | Global rate limiting absent | **DONE** — 300 req/min on `/api`, stricter on `/api/auth` | `index.ts` |
| A3 | Hardcoded DB password fallback | **DONE** — backend refuses to start without `DB_PASSWORD` | `services/db.ts` |
| A4 | Hardcoded login creds in `Login.tsx` | **DONE** — pre-fill + "Fill Master Admin" removed | `pages/Login.tsx` |
| A5 | `.env` committed, no `.gitignore` | **DONE** — `.gitignore` added, `.env` untracked (`git rm --cached`) — **rotate the DB password + session secret that were in history** | `.gitignore` |
| A6 | Second-order SQLi via `hierarchy_path` in `/hierarchy-summary` | **DONE** — parameterised | `routes/users.ts` |
| A6b | Same string-interpolation pattern in `/system/stats` | **DONE** — strict `[A-Za-z0-9_.-]` guard on the session path before use | `routes/system.ts` |
| A6c | Root cause: org `code` only whitespace-stripped | **DONE** — strict `^[A-Z0-9-]{2,64}$` whitelist at node creation | `routes/organizations.ts` |
| A7 | Cookie `secure:false`, `sameSite:'lax'` | **DONE** — `secure` in production, `sameSite:'strict'` | `routes/auth.ts` |
| A8 | Session token also returned in JSON body | **DONE** — cookie only | `routes/auth.ts` |
| A9 | CSP disabled | **DONE** — real baseline (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, HSTS in prod, `Referrer-Policy: no-referrer`) | `index.ts` |
| A10 | `cors({ origin: true })` with credentials | **DONE** — explicit allow-list via `FRONTEND_ORIGIN` | `index.ts` |
| A11 | Upload MIME whitelist not enforced | **DONE** — magic-byte signature check (PDF/PNG/JPEG/TIFF/MP4) + extension/type match; stored MIME is the detected type, not the client's | `services/documents.ts` |
| A12 | No AV scan on uploads | **PARTIAL** — `scanForMalware()` hook wired into the pipeline as a labelled stub; wire clamd for prod | `services/documents.ts` |
| A13 | Role provisioning missing "assigned role ⊆ actor" check | **DONE** — target role permission set must be a subset of the creator's | `routes/users.ts` |
| A14 | Multi-step writes not transactional | **DONE** — `withTransaction()` wraps case-create, evidence create/transfer, document store, user + body-admin provisioning; each also anchors a ledger block atomically | `services/db.ts` + routes |
| A15 | Login catch returned `err.message`/`err.stack` | **DONE** — generic message only | `routes/auth.ts` |
| A16 | Audit log not tamper-evident | **DONE (crypto route)** — every authorization decision is anchored on the hash-chained ledger; `audit_logs` immutability in prod still wants a least-privilege role (below) | `services/authorization.ts`, `services/ledger.ts` |
| — | bcrypt cost | **DONE** — raised 10 → 12 on all new hashes | `routes/users.ts` |
| — | Document integrity on read | **DONE** — download recomputes SHA-256, refuses + audits `DOCUMENT_INTEGRITY_FAILURE` on mismatch, `Cache-Control: no-store` | `routes/documents.ts` |

## Part C — hash-chained ledger (blockchain track)

| Item | Status | Where |
|------|--------|-------|
| `ledger_blocks` table, monotonic `seq`, `prev_hash` linkage | **DONE** | `services/db.ts` |
| `block_hash = SHA256(prev_hash \| payload_hash \| seq)` | **DONE** | `services/ledger.ts` |
| Per-sovereign-body Ed25519 signing keys (auto-generated to `data/keys/`, gitignored) | **DONE** — swap for a KMS/HSM in production | `services/ledger.ts` |
| Append-only DB trigger on `ledger_blocks` (rejects UPDATE/DELETE) | **DONE** | `services/db.ts` |
| Anchor points: auth decisions, case create, evidence create + custody transfer, document hash | **DONE** | `authorization.ts`, `cases.ts`, `evidence.ts`, `documents.ts` |
| `GET /api/ledger/verify` — walk + recompute + signature check | **DONE** | `routes/ledger.ts` |
| `GET /api/ledger` — scoped block list | **DONE** | `routes/ledger.ts` |
| Chain-verified indicator on evidence custody view | **DONE** | `routes/evidence.ts` → `integrity` block |
| Ledger integrity panel in the Audit UI | **DONE** | `pages/Audit.tsx` |
| Tamper-detection tests | **DONE** — `npm run test:ledger` | `tests/ledger.test.ts` |
| Deep verify (re-derive `payload_hash` from source rows) | **TODO** — current verify covers chain-internal integrity + signatures + append-only |
| Option B: full permissioned chain (Fabric / private EVM) | **TODO** — documented production roadmap |

## Least-privilege runtime DB role (production)

The app currently connects with one role. For `audit_logs` immutability independent of
the ledger, run once as the DB owner:

```sql
CREATE ROLE casevault_app LOGIN PASSWORD '<from-secrets-manager>';
GRANT USAGE ON SCHEMA investigation TO casevault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA investigation TO casevault_app;
-- audit trail: append + read only
REVOKE UPDATE, DELETE ON investigation.audit_logs FROM casevault_app;
REVOKE UPDATE, DELETE ON investigation.ledger_blocks FROM casevault_app;
```

Then point `DB_USER`/`DB_PASSWORD` at `casevault_app` and keep the owner role for migrations only.

## Roadmap not yet started (Report Part B)

MFA / step-up auth for admin tiers · session idle-timeout + rotation · secure invitation
workflow + account lifecycle states · classification (`clearance_level`) enforced as a gate ·
field-level PII encryption + masking · document encryption at rest (AES-256-GCM) · digital
signatures on legal records · PostgreSQL Row-Level Security · security dashboard + threshold
alerting · `npm audit` / dependency scanning in CI.
