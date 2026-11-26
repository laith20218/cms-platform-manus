# Phase 0 — Baseline & Gap Matrix (Admin Command Center Program)

> Base: `main @ c9547ac67b7e59ef37c7ec6aaf07ec9e851a3a96` (merge of PR #211, 2026-11-25T21:41Z)
> Evidence collection date: 2026-11-25 (operations environment). Read-only inspection; no files were
> modified in `main`. Companion doc: `docs/ops/credential-rotation.md` (Gate A).

## 1. Repository baseline

| Item | Value |
|---|---|
| Branch / HEAD | `main @ c9547ac67b7e59ef37c7ec6aaf07ec9e851a3a96` (verified against `origin/main`, in sync, clean tree) |
| Claimed checkpoint | `main @ c9547ac` — **verified identical** |
| PR #211 | **merged** 2026-11-25T21:41:16Z (`feat/admin-ui-command-center-p1`: row-action menus, real URL routing, Danger Zone + hard deletes) |
| Monorepo | pnpm 9 workspace + turbo; `apps/{admin-web,student-web,api,android}`, `packages/{ui,types,utils}` |
| Backend | ASP.NET Core 9 (`net9.0`), EF Core 9 + Npgsql, MediatR, 37 controllers, 41 migrations, 5 csproj |
| Admin web | React 19 + Vite 6 + Tailwind 4, react-router-dom 7 (BrowserRouter; hand-rolled view map), vitest 2 + RTL |
| Student web | React PWA (same stack), Playwright e2e (network-mocked) |
| Toolchain used for this baseline | .NET SDK 9.0.321, Node 24, pnpm 9.15.9, git 2.47.3 |
| Open PRs on main (pre-existing) | #43 (draft), #39, #37, #30, #16, #8 — none are part of this program; left untouched |

## 2. Deployment-safety verification (read-only, no deploys triggered)

| Surface | Evidence | State |
|---|---|---|
| Render `cms-api-preview` (srv-da3qp48ae00c7390ctcg) | deploy `dep-dc3lbvjrjlhs73eodd4g` | **live** @ `c9547ac` (= main HEAD), autoDeploy=yes from `main`, plan `free`, region frankfurt |
| Vercel `cms-platform-manus-admin-web` | deploy `dpl_GH8kWeNtxJNHbTRxK8LfeMA56fFK` | **READY** @ `c9547ac` (main) |
| Vercel `cms-platform-manus-student-web` | deploy `dpl_FMLmGA2LAbMPyvvwsZpMar9qqxbs` | **READY** @ `c9547ac` (main) |
| API `/health/live` | HTTP 200 `Healthy` | First hit 23.5s (free-tier cold start) |
| API `/health/ready` (Npgsql + Upstash Redis) | HTTP 200 | DB + cache paths healthy |
| Both Vercel frontends | HTTP 200 / 200 | Up |

Production equals `main` HEAD on all three surfaces. **Consequence:** any merge to `main` auto-deploys
to production (Render + Vercel). This is why every PR in this program requires a separate, explicit
merge/deploy approval, and why pushes to `main` are prohibited in this program.

## 3. Verified object storage provider

**Backblaze B2 via its S3-compatible API.** Evidence (code-level, decisive):

- `apps/api/src/CMS.Infrastructure/DependencyInjection/DependencyInjection.cs:60-70` —
  `S3StorageService` is the only registered `IFileStorageService`; comment documents PUSH 10.9 migration
  to Backblaze B2 (bucket `CMSmedia` @ `eu-central-003`), plus `B2PresignedUrlService` for question images.
- `render.yaml` `Storage__S3__*` set with the same comment; live Render env names verified configured.
- Both `vercel.json` CSPs whitelist `https://*.backblazeb2.com`.
- `.env.example` documents the B2 endpoint form `https://s3.eu-central-003.backblazeb2.com`.
- Cloudflare R2 appears **only in stale documentation** (`docs/DEPLOYMENT.md`, `deploy/runbooks/go-live-checklist.md`,
  `deploy/monitoring/monitoring-setup.tf`, `deploy/scripts/setup-dns-ssl.sh`, README) and is **not** wired anywhere.
- Upstash Blob storage is retired (`.env.example` marks the token names RETIRED); Upstash Redis REST remains the cache.

Known drift: committed defaults (`appsettings.json`/`render.yaml`: bucket `cms-files`, region `eu-central-1`)
contradict the documented live bucket/region; live values are dashboard-only. This is configuration drift,
not a leak, and PR-5/PR-10 address documentation alignment.

## 4. Quality baseline (run on this base, in this environment)

| Suite | Command | Result |
|---|---|---|
| Backend build | `dotnet build apps/api/CMS.sln -c Release` | **0 errors**, 37 warnings (nullable-reference warnings in tests) |
| Backend tests | `dotnet test apps/api/CMS.sln --no-build -c Release` | **898 passed / 0 failed / 36 skipped / 934 total** (2m36s). Skips = Postgres-Testcontainers integration tests (Docker unavailable here; CI runs them against a real Postgres service) |
| Shared UI | `pnpm --filter @cms/ui test` | **49/49 passed** (8 files) |
| Admin web unit/RTL | `pnpm --filter @cms/admin-web test` | **153/153 passed** (30 files) |
| Admin web lint | `pnpm --filter @cms/admin-web lint` | **FAILED — 2 pre-existing warnings** (`react-hooks/exhaustive-deps`: `QuestionImportModal.tsx:180`, `ReportsModeration.tsx:205`) |
| Admin web build | `pnpm --filter @cms/admin-web build` | **SUCCESS** (`tsc -b && vite build`, 11.1s; chunk-size warning only) |
| Student web tests | `pnpm --filter @cms/student-web test` | **835/835 passed** (81 files) |
| Student web build | `pnpm --filter @cms/student-web build` | **SUCCESS** (PWA + service worker generated) |
| Security scan (repo tree) | manual token-pattern scan + existing `verify-security-artifact.sh` patterns | **No committed secrets found** (only CI-local `cms_ci_only` fixture and one synthetic presigned-URL fixture). Full gitleaks-style history scan not performed — noted as a limitation |

Baseline defects to fix in later PRs (regression targets): the 2 admin lint warnings (PR-2),
`@cms/ui` tests not CI-gated and admin lint not CI-gated (PR-10).

## 5. Gap matrix

Legend — Evidence: verified on this tree. PR: proposed phase. Approval: gate that requires the owner.

| # | Area | Current evidence (main @ c9547ac) | Missing / defective | Risk | Phase | Approval |
|---|---|---|---|---|---|---|
| 1 | Credential hygiene | Tokens/test passwords pasted in chat & old reports; repo tree clean; provider keys currently valid | All exposed credentials need rotation; `MONITORING_*` names absent | **Critical** | PR-0 | Owner rotation confirmation (Gate A) |
| 2 | Hard-delete feature flag | `POST /admin/system/hard-delete` live for SuperAdmin (`SystemCommands.cs`); no flag anywhere | No backend feature flag; **enabled by default in production**; no environment restriction | **Critical** | PR-1 | Merge approval |
| 3 | Wipe safety | Dry-run with counts, typed `DELETE`/`حذف` confirm, password re-auth, single transaction, children-first ordering, academic-structure preservation (unit-tested, 17 tests) | Critical audit event written **post-commit only** (crash window = unaudited mass delete); wipe modules are whole-table (no academic-scope filter) | High | PR-1 | Merge approval |
| 4 | Object deletion | `DeleteLibraryFileCommand` soft-deletes the row but **immediately deletes the B2 blob** (best-effort) | No retention/quarantine stage; no restore; referenced "cleanup pass" does not exist | High | PR-1 (guard) / PR-5 (full retention) | Merge approval |
| 5 | Admin shell routing | 15 real URL routes, refresh/back/forward work (Vercel SPA rewrite), academic context URL-persisted | **No 404** (unknown paths silently render Overview); post-login redirect overrides deep links; **filters/search/pagination not in URL** | Medium | PR-2 | — |
| 6 | Command palette | Inline palette in `App.tsx`; RBAC + Arabic labels; Ctrl+K | No keyboard arrow navigation, no dialog semantics, no actions (nav only), not a shared component | Medium | PR-2 | — |
| 7 | 2FA at login | 2FA enable/disable + QR exists; login payload hardcodes `twoFactorCode: null` | **2FA-enabled admins cannot sign in from this UI** (no OTP field) | **Critical** (product) | PR-2 | — |
| 8 | Session resilience | Refresh only at boot; 401 handling scattered | Mid-session token expiry degrades to per-center error toasts; no global refresh/retry | Medium | PR-2 | — |
| 9 | Shared UI adoption | 16 files import `@cms/ui`; `ConfirmDialog`, `Drawer`, `RowActionsMenu`, `Pagination` in use | Questions/Exams keep hand-rolled dialogs (no focus trap); `AccessibleModal` duplicates `@cms/ui Dialog`; Admins/Codes/Audit rows lack `RowActionsMenu` | Medium | PR-2 | — |
| 10 | Localization | `src/lib/dictionary.ts` exists with `t()` but **zero importers**; ~1,700 inline `isArabic ?` ternaries across 35 components | Dictionary migration never landed; `<html lang>` never flips with locale; ~40 physical `text-right` classes break English layout | Medium | PR-3 | — |
| 11 | Question Bank | Filters (type/status/subject/search), bulk publish/archive (≤100, scope-checked), CSV import, preview, duplicate, matching editor, error-report triage | **No export endpoint** (policy constant exists, route doesn't); `Ordering/Clinical/ImageBased/Interactive` enum values unsupported; no shared universal preview component; filters not URL-persisted | Medium | PR-4 | — |
| 12 | Editorial grading | `AnswerQuestionCommand`: exact match after trim+whitespace-collapse+`ToUpperInvariant` | None (per Gate B: exact-string matching stays; documented as intentional limitation) | Info | PR-4 (tests only) | — |
| 13 | Exams | Full lifecycle incl. unpublish (revert to draft), student preview, stats, results | **No duplicate-to-draft**; results pager fixed at 100; questions-with-children validation present but dependency counts not shown pre-delete | Medium | PR-5 | — |
| 14 | Library / files | Upload (presign), metadata edit, virus-scan gating, Ghostscript pipeline, usage stats | "Convert to images" is a placeholder button (toasts "Wave 12"); no file restore; blob deletion immediate (row 4); LibraryCenter pager `pageSize=25` unreachable beyond page 1 | Medium/High | PR-5 | — |
| 15 | Students center | 7-tab drawer, ban/unban with reason, revoke sessions, manual create, avatar | **No admin-initiated password reset / force-change**; **no export**; hand-rolled pagination; no unified activity endpoint (assembled from 4 endpoints) | Medium | PR-6 | — |
| 16 | Security center | AuditCenter (severity filters), AuditLogViewer (server filters + pager + CSV), ActivityMonitor (super-admin sessions) | `SanitizeAuditText` does **not** strip CR/LF/control chars (DB audit path forgeable, unlike `LogSanitizer` for console); no 2FA-change event surfacing; redaction only by keyword regex | High | PR-6 | — |
| 17 | Settings / roles | SettingsCenter + typed categories; RolesCenter; permission matrix + UI-permission editors; `SUPER_ADMIN_PROTECTED` blocks modifying any super-admin | Settings untyped strings; **no settings history table**; reset endpoint trusts client-supplied default value; no "last effective SuperAdmin" count check (broader all-super-admins protection exists); feature flags not visible in UI | Medium | PR-7 | — |
| 18 | Servers dashboard | **Nothing**: no endpoints, no UI (only topbar API health pill) | Whole phase: read-only provider monitoring (Render/Vercel/Neon/GitHub), backend proxy, caching, honest unavailable states | Medium | PR-8 / PR-9 | Monitoring credentials + names (Gate A §5) |
| 19 | Rate limiting | Login/OTP/auth/question/exam partitions + `AdminLoginRateLimiter` | **Admin endpoints incl. wipe/hard-delete unthrottled**; `admin`/`static` limiter policies defined but attached to nothing; dead `AspNetCoreRateLimit`/legacy middleware | Medium | PR-1 (Danger Zone throttle) / PR-8 (rest) | — |
| 20 | Audit logging | `SecurityLog` (43 event types, severity, redaction, batcher, retention sweeper) + `AdminActivityLog` stream | Post-commit-only audit for destructive ops (row 3); DB path lacks newline stripping (row 16) | High | PR-1 / PR-6 | — |
| 21 | CI gates | security-gate (secret regex) → backend tests (+ Postgres service) → frontend tests/e2e → CodeQL + Trivy → lighthouse → docker build | Admin-web lint **not CI-gated and currently red**; `@cms/ui` tests not in CI; 18 Postgres-gated tests still skipped in CI (`CMS_PHASE34_TEST_POSTGRES` unset); **no deploy block on red CI** (push to main auto-deploys); regex-only secret scan, no history scan; admin-web production URL not in health-check.yml | Medium | PR-10 | — |
| 22 | Documentation drift | README/DEPLOYMENT.md/launch.yml/monitoring TF still claim R2/Railway/example.com | Stale provider claims contradict live B2/Render/Vercel/Neon | Low | PR-10 | — |
| 23 | Dead code / packages | `dictionary.ts` (0 importers), `AspNetCoreRateLimit`, Hangfire packages, `QuestionManagement` policy (unsatisfiable), axios/zustand/react-hook-form deps unused in admin-web | Cleanup + regression targets | Low | PR-2 / PR-10 | — |

Fixed decisions honored (Gate B, verified against code — no contradictions found):

- Wipe is module-by-module with dry-run/counts/confirm — already implemented, kept.
- Archive is the normal lifecycle for content deletes — partially true today (soft-delete default), exceptions are library blob (PR-1/PR-5) and no restore endpoints (PR-5).
- Hard delete behind backend-enforced flag defaulting OFF — **NOT implemented today** (top priority PR-1).
- Object deletion uses retention/quarantine — not implemented (PR-1 guard + PR-5).
- Storage provider is Backblaze B2 — verified; provider-neutral S3-compatible surface retained.
- Servers dashboard read-only + backend proxy — not yet built (PR-8/PR-9).
- Editorial grading stays exact-string — verified current behavior, kept.
- No new `QuestionGroup` entity — verified absent; existing `Tags`/`ParagraphTag` semantics retained.

## 6. Environment limitations recorded honestly

- Docker unavailable in this environment → 36 Postgres-gated integration tests skip locally (CI runs them).
- `api.neon.tech` does not resolve from this environment today (NODATA from public resolvers, method
  sanity-checked) → Neon API key validity could not be confirmed; production DB health verified indirectly
  via `/health/ready`. No credential was routed through a third-party relay to force this check.
- Playwright e2e (student-web) not run locally in this pass; CI runs them network-mocked.
- No production data was touched; no destructive endpoint was called; all provider calls were read-only.
