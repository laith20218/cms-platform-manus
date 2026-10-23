# EXECUTION STATUS — Wave 2: Quick Wins & Testing

> **Branch**: `feature/wave2-quick-wins-testing`
> **Base**: `34e2d54` (main after P1-10)
> **Started**: 2026-10-22
> **Last updated**: 2026-10-22

---

## Wave 2 Progress

| # | Task | Status | Commit | Notes |
|---|---|---|---|---|
| 1 | **ADMIN-04 Quick Wins** | ✅ DONE | `42a7688` | Date range picker + CSV/PDF export + consume unused fields |
| 2 | **Student Web Quick Wins** | ✅ DONE | `21ace7e` | /exams + /library + real footer links + hide OTP |
| 3 | **Testing Foundation** | ✅ DONE | `b6bf8ba` | Vitest in admin-web, 12 tests passing |
| — | **Wave 2 COMPLETE** | ✅ | — | See summary below |

---

## 1. ADMIN-04 Quick Wins (`42a7688`)

### What was delivered
- **Date range picker**: 5 presets (7d/30d/90d/6m/12m) — changes revenue + growth API queries dynamically
- **Last updated timestamp**: Shows when data was last fetched + selected range label
- **CSV export**: 3 separate buttons (revenue, growth, top subjects) — downloads UTF-8 BOM CSV files
- **PDF export**: Opens print-ready HTML with all sections (revenue, growth, top subjects)
- **Revenue label**: Already "Estimated Value" (done in batch 2) — note explains: codesSold × 25,000 fixed price
- **Unused fields consumed**:
  - `codesSold` + `newSubscriptions`: stat tiles below revenue chart (totals)
  - `averageAccuracy` + `activeStudents`: detail list below top subjects chart

### Files changed
- `apps/admin-web/src/components/ReportsCenter.tsx` — major rewrite (+182/-35 lines)

---

## 2. Student Web Quick Wins (`21ace7e`)

### What was delivered

**P2-27: ExamsCatalogPage** (new component)
- Aggregates all published exams from subscribed subjects
- Expandable subject sections with exam count badges
- Exam type badges (Final/Midterm/Quiz/Practice)
- Links to `/exams/:examId` for each exam

**P2-28: LibraryCatalogPage** (new component)
- Aggregates all library files across subscribed subjects
- Type filter (PDF/HTML/Image/Video/Audio/Summary/Comprehensive/Paragraph)
- File cards with type icon + subject name + views count
- Links to subject library page

**P2-30: Real footer links** (replaces `href="#"`)
- `/terms` → TermsPage (Arabic terms of use, 4 sections)
- `/privacy` → PrivacyPage (Arabic privacy policy, 5 sections)
- Both are public routes (no auth required)
- RegisterPage: `href="#"` → `href="/terms"` + `href="/privacy"`

**P2-31: OTP route hidden when OtpEnabled=false**
- Conditional Route registration: `{otpEnabled && <Route path="/verify-otp" .../>}`
- `otpEnabled` reads `VITE_OTP_ENABLED` env var
- Route simply not registered when disabled (clean approach)

**Sidebar enhancement**
- Added `/exams` (ClipboardCheck icon) + `/library` (FileText icon) nav items

### Files changed (new: 4, modified: 3)
- New: `ExamsCatalogPage.tsx`, `LibraryCatalogPage.tsx`, `TermsPage.tsx`, `PrivacyPage.tsx`
- Modified: `router.tsx`, `Sidebar.tsx`, `RegisterPage.tsx`

---

## 3. Testing Foundation (`b6bf8ba`)

### What was delivered

**Vitest setup in admin-web** (first test framework in this app — was 0 tests before)
- Installed: `vitest@2` + `@testing-library/react@16` + `@testing-library/jest-dom@6` + `@testing-library/user-event@14` + `jsdom@25`
- `vitest.config.ts`: jsdom environment, globals, css:false, postcss:false override
- `postcss.config.mjs`: empty local config (overrides parent project's incompatible Tailwind CSS 4 PostCSS plugin)
- `src/test/setup.ts`: jest-dom matchers + matchMedia/IntersectionObserver/ResizeObserver mocks
- `package.json`: `+test` + `test:watch` scripts

**12 tests across 3 files** (all passing):

| File | Tests | What's tested |
|---|---|---|
| `api.test.ts` | 7 | Authorization header, Content-Type for JSON vs FormData, 204 handling, ApiError throw + status, non-JSON error |
| `audit-log-viewer.test.tsx` | 3 | English title, Arabic title, empty state |
| `settings-center.test.tsx` | 2 | English title, Arabic title |

### Result: 3 files, 12 tests, 0 failures ✅

---

## Verification

| Gate | Result |
|---|---|
| admin-web tsc | ✅ 0 errors |
| admin-web vite build | ✅ 0 errors |
| admin-web vitest | ✅ 12/12 pass |
| student-web tsc | ✅ 0 errors |
| student-web vite build | ✅ success (PWA + workbox) |
| Backend unchanged | ✅ no backend changes in this wave |

---

## What remains (from the original 93-item plan)
- P0 items (8): all BLOCKED_EXTERNAL — require credentials/decisions from project owner
- P1-12: Live monitoring evidence (BLOCKED_EXTERNAL — Sentry/Better Stack account)
- P1-13: Content seed strategy (BLOCKED_EXTERNAL — content)
- P2/P3 remaining: ~65 items
  - Backend integration tests for 12 missing controllers (next priority)
  - packages/ui tests (needs vitest setup similar to admin-web)
  - Content security (watermark, HTML sanitizer)
  - Security tests (IDOR/BOLA, JWT pipeline, penetration)
  - Performance (Lighthouse, Web Vitals)
  - Accessibility (axe-core, screen reader, keyboard nav)
  - Documentation (6 new admin docs)

---

## Commits on branch
```
b6bf8ba feat(testing): Vitest in admin-web — 12 tests passing across 3 files
21ace7e feat(student-web): /exams + /library catalog pages + real footer links + hide OTP
42a7688 feat(admin-04): date range picker + CSV/PDF export + consume unused fields
```

---

## Wave 4 — Testing + Security (local only, not yet deployed)

### What was delivered

**1. Backend Integration Tests (19 tests, all passing)**
- `AdminEndpointsIntegrationTests.cs` — tests 6 controllers:
  - SystemSettings: 5 tests (GET all, GET by key, PUT update, GET 404, unauth 401)
  - AdminStudents: 2 tests (PUT update profile, PUT 404)
  - AdminReports: 2 tests (GET list, GET with status filter)
  - AdminAnalytics: 7 tests (students, academic, exams, questions, content, codes, operations)
  - SecurityController: 2 tests (audit-logs GET, unauth 401)
  - Notifications: 1 test (GET sent)
- `AdminEndpointFactory`: WebApplicationFactory with super_admin auth + seeded data + mocked services
- Backend tests: **180/180 InMemory pass** (161 existing + 19 new)

**2. HTML Sanitizer (content security)**
- Ganss.XSS package installed
- HtmlSanitizerService: strips scripts, event handlers, dangerous attributes
- Wired into library upload flow

### Not deployed yet
All changes are local on `feature/wave4-testing-security` branch. Will be deployed in batch when Vercel limit resets.

---

## Wave 5D — Cleanup Items + Production Deploy (2026-10-22)

### Items Completed (local, committed)
1. **Item A** (`1331963`): Removed dead admin code from student-web
   - 4 files deleted (−377 lines): `features/admin/` (3 files) + `components/common/PermissionRoute.tsx`
   - Zero external references; not in router.tsx; no build chunk
2. **Item B** (`a00eda4`): Sanitized notification actionUrl (XSS / open-redirect fix)
   - New `utils/sanitizeActionUrl.ts` — strict whitelist (protocol + origin + path)
   - Wired into `NotificationsPage.tsx`
   - 59 new Vitest cases (70/70 total pass)

### Production Deploy
- **Merge commit** `7e91f1f` (2026-10-22): `git merge --no-ff fix/critical-auth-resilience` into main
- **Lockfile fix** `254f278` (2026-10-22): `pnpm install --lockfile-only` (see Lessons Learned)
- **Deployed to production**:
  - Vercel admin-web: READY on `254f278` → https://cms-platform-manus-admin-web.vercel.app
  - Vercel student-web: READY on `254f278` → https://cms-platform-manus-student-web.vercel.app
  - Render API: LIVE on `254f278` → https://cms-api-preview.onrender.com

### Lessons Learned

**Incident**: First production push (`7e91f1f`) failed on Vercel with
`ERR_PNPM_OUTDATED_LOCKFILE`. Wave 5a/5b/5c removed 5 unused dependencies from
`apps/student-web/package.json` but `pnpm-lock.yaml` was never regenerated.
Vercel runs `pnpm install --frozen-lockfile` (strict mode), which rejects a
lockfile that doesn't match `package.json`.

**Root cause**: Local build verification (`tsc --noEmit` + `vite build` + `vitest`)
succeeded because `node_modules` already existed from a prior install — so the
lockfile mismatch was invisible. The CI environment (Vercel) starts from scratch
and relies entirely on the lockfile.

**Lesson**: **Changing `package.json` (add/remove/upgrade deps) ALWAYS requires
regenerating `pnpm-lock.yaml` before pushing to main.** Local builds are not a
sufficient pre-deploy check when dependency manifests have changed.

**Preventive measure**: Added `scripts/pre-deploy-check.sh` — a pre-push gate
that runs `pnpm install --frozen-lockfile` (the exact CI command) plus full
build + test suite, BEFORE any push to main. This script must pass locally
before pushing.

### Known Issues (post-deploy smoke tests)

- ~~**2 of 7 analytics endpoints return HTTP 500**~~ — **RESOLVED in Wave 5D fix
  (commit `cac5052`)**. Root cause: `DateTime.ToString("yyyy-MM-dd")` inside LINQ GroupBy
  projection is not translatable by Npgsql EF Core 9. Fix: split server-side query
  (raw `Date`) from client-side formatting (post-`ToListAsync`). Both endpoints now
  return 200 with correct `dailyBreakdown` / `dailyActivation` arrays.

---

## Wave 5D Closed — All Known Issues Resolved (2026-10-22)

**Status**: ✅ All known issues resolved. Production is fully operational.

| Environment | SHA | Status | Verified |
|---|---|---|---|
| Vercel admin-web | `cac5052` | READY | ✅ all routes 200 |
| Vercel student-web | `cac5052` | READY | ✅ all routes 200 |
| Render API | `cac5052` | LIVE | ✅ /health/live=200, 7/7 analytics endpoints 200 |
| Neon DB | — | ✅ | Phase 54-57 migrations applied |

**Post-fix smoke test results**:
- `/api/v1/admin/analytics/students` → 200 (6 students, 2 registrations, dailyBreakdown ✓)
- `/api/v1/admin/analytics/codes` → 38 issued, 2 revoked, 0 activated
- All 7 analytics endpoints: 7/7 → HTTP 200

**Ready for Playwright E2E testing (final pre-launch gate).**

---

## Critical Testing Gap (Discovered 2026-10-22)

### The Problem
The 19 integration tests from Wave 4 (`AdminEndpointsIntegrationTests.cs`) used
`UseInMemoryDatabase`, which does NOT translate LINQ to SQL. It executes the query
expression tree directly on in-memory objects. As a result, `DateTime.ToString("yyyy-MM-dd")`
works fine in InMemory but throws `InvalidOperationException` ("LINQ expression could
not be translated") on Npgsql (PostgreSQL) in production.

### The Evidence
- **19/19 tests passed locally** (InMemory) before the deploy of `7e91f1f`.
- **2 endpoints returned HTTP 500** on Render (real PostgreSQL) after deploy.
- The failing code path (`ToString` with format string inside `GroupBy.Select`) was
  invisible to the test suite because InMemory doesn't enforce translation.

### Root Cause Analysis
EF Core (since v3.0) does NOT fall back to client-side evaluation when a LINQ
expression cannot be translated. Instead it throws at runtime. InMemory provider
bypasses translation entirely, so these errors only surface against a real database
provider (Npgsql/SQL Server/etc.).

### Immediate Actions Taken (Wave 5D)
1. **Manual fix** for `/students` and `/codes` endpoints: split server-side query
   from client-side formatting (see `AdminAnalyticsController.cs` lines 52-65 + 323-333).
2. **2 new response-shape tests** added to `AdminEndpointsIntegrationTests.cs` with
   an explicit `⚠️ WARNING — CRITICAL TESTING GAP` comment block explaining the
   InMemory limitation. These tests verify the response SHAPE (arrays exist + dates
   are `yyyy-MM-dd` formatted) but cannot catch translation errors.
3. **`pre-deploy-check.sh` updated** with a "Manual Endpoint Smoke Checklist" that
   prints a pre-push reminder for contributors.

### Deferred Actions (Wave 6 — Post-Launch)
1. **Adopt Testcontainers + real PostgreSQL** in the integration test suite so EF
   Core translation errors are caught at test time, not in production.
2. **Migrate critical query-path tests** from InMemory to Testcontainers (focus on
   endpoints that use `GroupBy`, `ToString`, custom projections, or raw SQL fragments).
3. **Run the full test suite against a staging environment** before pushing to main.

---

## Wave 5D Fix — Analytics Endpoints Translation Error (2026-10-22)

### Commit
- `fix(api): split EF Core query from client-side ToString formatting`

### Root Cause
`DateTime.ToString(string format)` is not translatable by Npgsql EF Core 9.0.2.
EF Core 9 does not fall back to client evaluation → throws `InvalidOperationException`
→ ASP.NET Core returns HTTP 500.

### Fix
For both `/students` and `/codes` endpoints, the LINQ `GroupBy(...).Select(g => new { date = g.Key.ToString("yyyy-MM-dd"), ... })`
was split into:
1. **Server-side** (translatable): `.Select(g => new { date = g.Key, ... })` → materializes
   raw `DateTime` via `ToListAsync(ct)`.
2. **Client-side** (formatting): `.Select(x => new { date = x.date.ToString("yyyy-MM-dd"), ... })`
   on the materialized list.

### Tests
- 2 new response-shape tests in `AdminEndpointsIntegrationTests.cs` (with InMemory
  warning comment).
- Full suite: **182 passed** (180 original + 2 new), 18 blocked (Postgres-gated,
  require `CMS_PHASE34_TEST_POSTGRES` env var — unchanged baseline).
