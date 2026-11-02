# WIP_STATUS — feat/12.4b-courses-fix (R62: Courses 403 — CORS preflight, error taxonomy, entitlement self-heal)

## ─── R62 — CURRENT STATE (this branch) ────────────────

Base: main @ c9ea072 (R61 merge). Waves 13.2–13.7 CLOSED. R56/R61 verified and
recorded in the Wave 13 reports; the stale R56/12.3 status that previously lived in
this file is superseded by this section.

NOT pushed — awaiting supervisor PAT (§2 stop gate). 4 commits on the branch:

1. `bdd6b89` fix(api): deterministic CORS preflight contract — explicit header
   allowlist + rejected-preflight completion (R62 §2.A)
2. `9358a1e` feat(student-web): 403 error taxonomy — entitlement-denial UI +
   self-healing entitlement cache (R62 §2.B.1/2.B.2/§2.C)
3. `f7d61be` fix(student-web): service worker must never cache API responses —
   NetworkFirst → NetworkOnly (R62 §2.B.3)
4. (this commit) docs: WIP_STATUS refresh.

### Deliverable map (R62 workorder → commits)
- §2.A.2 explicit headers → commit 1 (`Program.cs` WithHeaders: Authorization,
  Content-Type, Accept, Accept-Language, X-Entitlement, X-Installation-Id,
  X-Device-Fingerprint, X-Correlation-Id).
- §2.A.3 OPTIONS-blocking filter check → VERIFIED NONE exist (no IActionFilter /
  IAuthorizationFilter / method gates anywhere in CMS.Api; SecurityHeadersMiddleware
  only mutates response headers). Compensating control: CorsPreflightCompletion-
  Middleware (after UseCors) completes origin-rejected preflights with 204 and no
  ACAO so auth layers can never answer them 401/403.
- §2.A.4 preflight integration tests → `CorsPreflightHttpIntegrationTests.cs`
  (allowed-origin 204+ACAO+ACAH on courses/subject; my-subjects regression guard;
  rejected-origin 204-without-ACAO).
- §2.B.1 403 taxonomy → `cms-entitlement-error` CustomEvent from the api-client
  response interceptor (url + ProblemDetails reason).
- §2.B.2 denial UI → `EntitlementErrorCard` in CoursesCatalog (exact workorder
  copy, تسجيل الدخول link, role=alert, ≥44px focus-visible targets).
- §2.B.3 SW → api-cache route NetworkFirst → NetworkOnly (never caches; preflights
  are browser-controlled and were never SW-routable — noted in code comments).
- §2.C H1 mitigation → eviction listener in entitlement-api + bounded force-reissue
  + single retry inside the catalog query; denial card only when a load yields zero
  data (Push-8 partial semantics preserved for mixed-scope students).

### Verification status (§11 — honest ledger)
- Backend build + CorsPreflightHttpIntegrationTests: UNVERIFIED IN SANDBOX
  (.NET 9 SDK installation attempted at report time; CI ladder will execute on push).
- Frontend vitest suites (new + regression): executed locally; see R62 report.
- Visual evidence (error UI screenshots): captured against a local mock API via
  headless browser; see R62 report attachments.

### Known constraints honored
- my-subjects endpoint untouched by backend changes (preflight regression test
  added as the guard).
- No pushes, no deployments, no prod DB touches, no lockfile changes.
- PAT hygiene: no credentials in any commit; remote URLs clean (fetch+push).

RESUME_FROM:
WIP_STATUS.md — Wave 12.4 R62 IMPLEMENT complete (4 commits on
feat/12.4b-courses-fix; NOT pushed).
NEXT: Supervisor review of SHAs c159ff4 / 802aa27 / 97d31f5 (+ docs) → PAT → push →
CI 5-rerun ladder → PR → merge gate. Residual DIAG 12.4 items (video control bar
timing B, mobile layout C, portal error-swallowing sweep D3) remain OPEN for the
next workorder.
═══════════════════════════════════════════════════════════════
