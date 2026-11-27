# PR-10 — Launch Closure Runbook (deployment, rollback, flags, retention, providers, destructive capabilities)

> Verified from code at `feat/pr-10-final-quality-launch-closure` (stacked on PR-6..PR-9).
> Companion evidence: `docs/evidence/admin-coverage-matrix.md` (action→contract map) and
> `docs/evidence/pr10-launch-closure.md` (verification report). Secret VALUES never appear
> here — environment NAMES only; the owner enters values in each provider's secure UI.

## 1. Deployment path (approved production path — nothing else)

| Surface | Provider | Mechanism | Trigger |
|---|---|---|---|
| API | Render service `cms-api-preview` (srv-da3qp48ae00c7390ctcg) | auto-deploy, branch `main`, health `/health/live` | **merge to `main`** (owner approval) |
| Admin Web | Vercel project `cms-platform-manus-admin-web` | auto-deploy from `main` | **merge to `main`** |
| Student Web | Vercel project `cms-platform-manus-student-web` | auto-deploy from `main` | **merge to `main`** |
| Database (Neon PostgreSQL) | migrations applied by the API at startup | `db.Database.Migrate()` in `Program.cs` | deploy of the API that carries the migration |

Rules enforced through the whole program (PR-6..PR-10):

- Every phase landed on a **dedicated branch + Pull Request**; nothing merged silently.
- CI must be green on the PR before any merge (security-gate → backend → Postgres
  integration → frontend + e2e → CodeQL/Trivy → Lighthouse artifacts).
- Preview verification used **Vercel Preview deployments** only; Render production
  deploys happened only through merge-to-main by the owner.

## 2. Rollback

### Code
`git revert <sha>` on the affected commits, then merge the revert through the same
approved path (a revert PR, CI green, owner merge). Per-phase SHAs:

| Phase | Commits (newest→oldest) |
|---|---|
| PR-6 (#218) | `0ffab68` (admin-ui/student-web), `34400de` (api) |
| PR-7 (#219) | `6c39657` (admin-ui), `3654b75` (api) |
| PR-8 (#220) | `e3a9d8d` (api, monitoring layer) |
| PR-9 (#221) | `eebe68b` (admin-ui servers view) |
| PR-10 (#222) | see PR body for exact SHAs (CI closure + docs + a11y fixes) |

### Migrations (all additive, Down() safe)
| Migration | Phase | Down() effect | Data safety |
|---|---|---|---|
| `AddLibraryRetention` (20261126234057) | PR-5 (merged) | drops retention/quarantine columns + partial index | tombstone/quarantine metadata lost; blobs unaffected (never deleted by CRUD) |
| `AddStudentMustChangePassword` (20261127012736) | PR-6 | drops `students.must_change_password` | flag defaults false — no data loss |
| `AddSystemSettingHistory` (20261127021736) | PR-7 | drops `system_setting_history` table | history trail lost; current settings values unaffected |

Rolling back code that ADDED a migration while the migration is already applied:
revert the code, then apply the `Down()` via the `.github/workflows/migrate.yml`
manual workflow (action: `rollback`, target migration) with owner approval — or leave
the schema ahead of the code (all three migrations are nullable/optional at runtime).

### Retention / B2 objects
Rolling back PR-5's retention behavior would re-expose the old immediate-blob-delete
path — **do not**. The purge guard (`Features:HardDeleteEnabled` fail-closed) is the
safety net; see §4.

## 3. Feature flags — names, safe values, semantics (all fail-closed)

| Flag (config path) | Env name | Safe value | Semantics when missing/malformed/false |
|---|---|---|---|
| `Features:OtpEnabled` | `Features__OtpEnabled` | `false` | OTP flows refuse (`OtpFeaturePolicy.EnsureEnabled` throws) |
| `Features:OfflineEnabled` | `Features__OfflineEnabled` | `false` | offline endpoints fail-closed |
| `Features:HardDeleteEnabled` | `Features__HardDeleteEnabled` | `false` (PRODUCTION) | hard-delete + library purge refuse; audited `phase=rejected; reason=HARD_DELETE_DISABLED` |
| `Security:PlayIntegrity:Enabled` | `Security__PlayIntegrity__Enabled` | `false` | integrity verification fails closed |
| `Library:RetentionDays` | `Library__RetentionDays` | `30` (default; clamp 0–3650) | retention window before any purge; `0` disables the min-age gate (deliberate) |

Changing any flag = environment change on the provider (Render env UI for the API).
The Admin Web **Settings → feature flags** surface is DISPLAY-ONLY (PR-7); no UI path
can enable anything.

## 4. Retention & purge lifecycle (Backblaze B2)

Normal delete = tombstone only (row soft-delete; **blob untouched** — PR-5 removed the
immediate physical delete from ordinary CRUD handlers). Physical deletion exists in
exactly ONE path — the gated purge — with this chain (all backend-enforced):

`Features:HardDeleteEnabled` (fail-closed) → SuperAdmin role → actor password re-auth
(Argon2 verify) → file must be tombstoned/quarantined → retention window elapsed
(`Library:RetentionDays` since `DeletedAt ?? QuarantinedAt`) → intent audit (Critical)
→ prefix delete in object storage → row delete → executed audit (Critical) → single
transaction.

Quarantine (`{id}/quarantine`) and restore (`{id}/restore`) are reversible lifecycle
states; the purge endpoint is the only irreversible action in the product and is OFF
by default in production.

## 5. Provider monitoring (Servers Dashboard) — capabilities + unavailable metrics

Read-only, backend-proxied (fixed allowlisted hosts; no URL proxy; SSRF-safe). Credential
NAMES the owner sets as Render secret env values (never in chat/Git):

`MONITORING_RENDER_API_KEY`, `MONITORING_RENDER_SERVICE_ID`,
`MONITORING_VERCEL_ACCESS_TOKEN`, `MONITORING_VERCEL_ADMIN_PROJECT_ID`,
`MONITORING_VERCEL_STUDENT_PROJECT_ID`, `MONITORING_NEON_API_KEY`,
`MONITORING_NEON_PROJECT_ID`, `MONITORING_NEON_BRANCH_ID` (optional),
`MONITORING_GITHUB_TOKEN`, `MONITORING_GITHUB_OWNER`, `MONITORING_GITHUB_REPOSITORY`.

Honest limitations surfaced in the dashboard itself:

| Provider | Available | Unavailable (honest «غير متاح») |
|---|---|---|
| Render | service state, suspension, plan, latest deploy (status/commit/times) | **metrics** — not exposed on the free plan |
| Vercel | both projects' latest production/preview deployments (state/commit/times) | none (scoped read token) |
| Neon | project + branch facts | **consumption metrics** — not exposed by the scoped key/plan; connection strings are never read or displayed |
| GitHub | repo metadata, visibility, pushedAt, recent Actions runs | none for the read scope granted |

Until the owner enters the `MONITORING_*` values, every provider honestly reports
`missing_credentials` — never a fabricated "up".

## 6. Destructive capabilities registry (all remain disabled/guarded)

| Capability | State | Guard chain |
|---|---|---|
| Wipe (per module) | available, Dry-Run-first | SuperAdmin + typed `DELETE`/`حذف` + actor password + per-module dry-run counts + Critical audits + single transaction |
| Hard Delete | **disabled in production** | `Features:HardDeleteEnabled` = false → every attempt rejected + audited |
| Library purge (physical B2 delete) | **disabled in production** | same flag + retention window + quarantine state + password re-auth |
| Student admin actions | live, reversible | archive = tombstone + session revocation (restorable); ban = reason + expiry; password reset = actor re-auth + session revocation + audit |
| Last SuperAdmin | protected in backend code | disable/delete/demote/reset of the last ACTIVE super admin → `LAST_SUPER_ADMIN` rejection |
| Provider mutations via dashboard | **do not exist** | Servers Dashboard is GET-only; no restart/deploy/env/domain/billing endpoints exist |

## 7. CI gates after PR-10 (closes gap-matrix row 21)

security-gate (secret scan + artifact verification) → backend build+unit → backend
Postgres integration → frontend job now including: student-web tests/e2e/lint/audit/
build/SBOM, **admin-web tests + lint (0 warnings) + production build (tsc)**,
**@cms/ui tests**, **admin e2e smoke (all views × 3 widths + axe 0 critical/serious +
screenshots artifact)** → CodeQL + Trivy → Lighthouse artifacts → docker build (main
only). Health-check cron now covers the API + student web + **admin web**.
