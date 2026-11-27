# PR-10 Launch Closure — Verification Report

> **Verified from code at SHA `eebe68b06d99c244b501e08647576d0cb270882a`** (branch
> `feat/pr-10-final-quality-launch-closure`, verified 2026-11-27). Every claim below was
> re-verified against the working tree in this session (file:line citations included); anything
> not verifiable from code or from a live read-only request is explicitly marked **NOT VERIFIED**.
> Test counts are the real numbers from test runs executed in this session (commands + results in §7).
>
> This is an internal ops document: English body, Arabic labels where user-facing. **No secret
> values appear anywhere — environment-variable NAMES only.**

---

## 1. Program PR map (this launch wave)

| PR | Branch / commits | Scope (one line) | Status |
| --- | --- | --- | --- |
| **#218 (PR-6)** | `feat/pr-10-final-quality-launch-closure` working tree: `34400de8d84` (api) + `0ffab68b726` (admin-ui, student-web) | Student Center + Security Center: admin student drawer/detail/activity/password-reset (re-auth + session revocation), archive/restore tombstones, `GET /api/v1/security/summary`, students must-change-password flag + banner | Code complete in tree; PR pending |
| **#219 (PR-7)** | `3654b75731b` (api) + `6c396579229` (admin-ui) | Settings Studio + role/admin escalation safeguards: typed settings validation + server-side defaults registry + atomic history rows, feature-flags read-only inventory, admin effective-permissions view, last-super-admin backend guard | Code complete in tree; PR pending |
| **#220 (PR-8)** | `e3a9d8dfe44` (api) | Servers Dashboard read-only monitoring layer: `AdminServersController` + four provider monitors (render/vercel/neon/github) with SSRF discipline, cache, circuit breaker, honest missing-credentials | Code complete in tree; PR pending |
| **#221 (PR-9)** | `eebe68b06d99` (admin-ui) — **HEAD of this tree** | Servers Dashboard (read-only operational view) admin-web surface + dictionary + tests | Code complete in tree; PR pending |
| **PR-10 (this)** | working tree (uncommitted docs + CI work); own SHA pending | Final quality launch closure: CI gate closure (admin-web lint/build + `@cms/ui` tests + admin e2e smoke pinned into CI), coverage-matrix evidence (`docs/evidence/admin-coverage-matrix.md`), this launch-closure report | In progress |

Full SHAs (for rollback, §6): `34400de8d8454b695048509b63cdac039fd34d5d`, `0ffab68b726120de984682975a11b166295cce7`, `3654b75731be02201691fc0670b730ad020a2f3b`, `6c39657922913c03c96844f417c0b83b0f4a4c43`, `e3a9d8dfe44db4e87c4323df122274984e07a2c5`, `eebe68b06d99c244b501e08647576d0cb270882a`.

---

## 2. PR-5 migration + deployment status (predecessor, re-verified)

- **Migration exists**: `apps/api/src/CMS.Infrastructure/Persistence/Migrations/20261126234057_AddLibraryRetention.cs` — 4 additive NULL columns on `library_files` (`retention_state`, `quarantined_at`, `quarantined_by`, `quarantine_reason` capped 500 chars) + partial filtered index `ix_library_files_retention_state` (Up :24-56, Down :59-80). NULL = Active; legacy rows unaffected (header :8-19).
- **Startup auto-migrate**: `apps/api/src/CMS.Api/Program.cs:329` — `db.Database.Migrate()` inside the startup block (idempotent; preceded by best-effort `__EFMigrationsHistory` repair patches, :262-324, whose failures are logged but non-fatal).
- **Live Render deploy re-verified (read-only curl, this session)**:
  - `2026-11-27T04:35:02Z` — `GET https://cms-api-preview.onrender.com/health/live` → **HTTP 200** (first hit after idle: 28.43s — Render cold start; consistent with the free-tier service warming up, not an outage).
  - `2026-11-27T04:35:30Z` — `GET https://cms-api-preview.onrender.com/health/ready` → **HTTP 200** (0.885s).
  - `2026-11-27T04:35:35Z` (warm) — `/health/live` → **HTTP 200 in 0.248s**; `/health/ready` → **HTTP 200 in 0.243s**.
  - `GET /api/v1/system/version` → `{"version":"1.0.0"}` (200).
  - The live deployment is stated to run the PR-217 merge SHA `e4b17335db94d95cf5b893f6740dfee413651298`; the running build's commit identity is **NOT VERIFIED** from the API itself (no build-info endpoint) — the liveness/readiness probes above are the verified evidence.

---

## 3. B2 retention + purge guard chain (PR-5, in force at this SHA)

Source: `apps/api/src/CMS.Application/Handlers/Library/LibraryRetentionHandlers.cs`.

**Lifecycle**: `Active → Archived | Tombstoned (soft delete, retention pending) → Quarantined | Restorable → Final Deletion (purge — the ONLY path that physically removes stored objects)` (header :15-30).

**Purge guard chain (in execution order, all backend-enforced)** — `Handle(PurgeLibraryFileCommand)` :98-209:

1. **Fail-closed kill switch FIRST** (:104-111): `SystemMaintenanceHandlers.IsHardDeleteEnabled(_configuration)` (`SystemCommands.cs:84-85` — `bool.TryParse(configuration?["Features:HardDeleteEnabled"]) && enabled`); flag off ⇒ rejects with `HARD_DELETE_DISABLED` *before* password verification, counts, storage access or any transaction, and writes a rejected-attempt Warning audit (:106-107).
2. **SuperAdmin-only actor** (:114-119): actor role must be `super_admin` (`FORBIDDEN_NOT_SUPER_ADMIN`).
3. **Actor password re-auth** (:122-123): Argon2 verification of the live session's password (`INVALID_CURRENT_PASSWORD`) — the session alone is never enough.
4. **Retention-state gate** (:131-134): an Active file cannot be purged directly (`PURGE_REQUIRES_RETENTION_STATE`) — final deletion is never a shortcut around retention.
5. **Retention window** (:136-143): `ResolveRetentionDays()` (:214-218) — `Library:RetentionDays`, **default 30**, clamped 0-3650; unparsable/missing value falls back to the safe default. Too-young tombstone/quarantine ⇒ `LIBRARY_RETENTION_ACTIVE`.
6. **Intent audit (Critical)** before any destructive step (:157-158).
7. **Physical object deletion FIRST, rows second** (:164 + comment :160-163): provider failure mid-flight leaves DB untouched and the operation retryable (S3/B2 delete semantics idempotent).
8. **Single transaction** for all dependent rows (views, annotations, bookmarks, favorites, media bookmarks, playback progress, the file row) with rollback on failure (:171-189).
9. **Executed audit (Critical, post-commit)** with exact per-table counts (:203-206).

**Ordinary CRUD delete is tombstone-only — verified**: `DeleteLibraryFileCommand` → `file.Tombstone(req.DeletedBy)`; the stored object is never touched, the log line says "object retained pending final-removal approval", and the audit row carries `retention=pending` (`LibraryHandlers.cs:606-631`, comment :611-623).

Backend test coverage: `Unit/Handlers/LibraryRetentionLifecycleHandlerTests.cs`, `LibraryAuditPostgresIntegrationTests.cs`, `Unit/Handlers/LibraryHandlersTests.cs`; admin-web UX lock: `src/test/library-retention.test.tsx`.

---

## 4. Feature flags + fail-closed defaults

| Flag (env name only) | Default | Read site | Fail-closed semantics |
| --- | --- | --- | --- |
| `Features:OtpEnabled` | **false** | `AuthHandlers.cs:15-18` (`OtpFeaturePolicy.IsEnabled`), enforced at :71, :125, :189, :360, :417 | `bool.TryParse(...) && enabled` — missing/malformed = disabled; OTP endpoints reject when off |
| `Features:OfflineEnabled` | **false** | `OfflineHandlers.cs:51` | same parse — missing/malformed = disabled |
| `Features:HardDeleteEnabled` | **false** | `SystemCommands.cs:84-85` (`IsHardDeleteEnabled`), enforced in `SystemCommands.cs:182-187` and `LibraryRetentionHandlers.cs:104` | fail-closed kill switch: wipe/hard-delete/purge all refuse when unset |
| `Security:PlayIntegrity:Enabled` | **false** | `FailClosedPlayIntegrityService.cs:16` | the service **rejects every request** even when "enabled" without a live provider (:24-31 — `provider_not_configured` / `not_configured`); never logs the opaque token |
| `Library:RetentionDays` | **30** | `LibraryRetentionHandlers.cs:214-218` (`ResolveRetentionDays`) | unparsable/missing ⇒ safe default 30; explicit values clamped 0-3650 |

The admin **feature-flags inventory** surface (`GET /api/v1/admin/settings/feature-flags`) is read-only by contract and super-admin-only (`SystemSettingsController.cs:284-291`); asserted by `SettingsStudioHttpTests.cs:201-265` (all five read-only entries, non-super 403).

---

## 5. New PR-6..PR-10 backend-enforced guarantees (verified in code)

1. **`SanitizeAuditText` hardening (log-forging)** — `CMS.Infrastructure/Services/SecurityService.cs:172-191`: (1) every control character U+0000-U+001F + U+007F flattened to a single space (`ControlCharacterPattern` :32), (2) THEN sensitive-keyword redaction (`SensitiveAuditValuePattern` :27, `[REDACTED]`), (3) truncation to the 512-char audit cap (:26). Step 1 runs before redaction/truncation so the persisted text can never contain a raw control character, and the redactor evaluates exactly the flattened text. Applied to description, user agent, and device fingerprint on every `LogSecurityEventAsync` (:135-137). Console path mirrored by `CMS.Api/Middleware/LogSanitizer.cs:18-37`. Tests: `Unit/Services/SecurityAuditSanitizationTests.cs`, `Unit/Services/SecurityServiceAuditTests.cs`.
2. **Student password reset contract** — `DashboardHandlers.cs:338-365` + `AdminStudentsController.cs:319-340`: `StudentEdit` policy + `IsInScopeAsync` scope check + `danger-zone` rate limit on the route → actor Argon2 re-auth (:343-344) → password policy → hash swap + optional `FlagMustChangePassword()` (:349-352) → **all student sessions revoked** (:355) → `credential_reset=student` audit (:357-363). Plaintext never logged/DTO'd. Tests: `StudentSecurityCenterHttpTests.cs:45-124` (401/403/404/400/204 paths), FE `students-center.test.tsx` (contract A).
3. **Student archive/restore tombstone lifecycle** — `DashboardHandlers.cs:372-420`: archive = `student.Archive()` + session revocation + Warning audit, idempotent; restore = `RestoreFromArchive()` + audit, idempotent. Never a hard delete. Tests: `StudentSecurityCenterHttpTests.cs:204-264` (full lifecycle), FE contract D cases.
4. **Last-super-admin guard** — exact method name verified: `EnsureTargetIsNotLastEffectiveSuperAdmin` (`AdminHandlers.cs:917-926`, static shared guard; instance wrapper :928-930). Enforced on update (:539), status (:568), password reset (:591), delete (:614), role-assign/demote (:386). Throws `LAST_SUPER_ADMIN` when zero *other ACTIVE* super admins remain; super-admin targets are audited Critical with `target_is_super_admin=true`. Tests: `Unit/Handlers/LastSuperAdminGuardTests.cs` (12 cases incl. suspended-second-super), `SettingsStudioHttpTests.cs:348-435` (HTTP-level).
5. **Settings typed validation + server-side defaults registry + atomic history rows** — `SystemSettingsController.cs:98-149`: `SystemSettingSchema.Validate(key, value)` before any mutation → 400 `SETTING_VALUE_INVALID` (:125-127); reset endpoint ignores client values entirely and restores the **registered server-side default** (:169-206); value change + `SystemSettingHistory` row are written in the SAME `SaveChanges` (atomic pair, :143-146); history is append-only with actor + reason `update|reset`. Migration `20261127021736_AddSystemSettingHistory.cs` (additive table, no FK by design). Tests: `SettingsStudioHttpTests.cs:44-201`, `Unit/Settings/SystemSettingSchemaTests.cs`.
6. **Servers monitoring SSRF discipline** — `CMS.Infrastructure/DependencyInjection/DependencyInjection.cs:43-93`: the four named clients pin `BaseAddress` to FIXED hosts (`https://api.render.com/`, `https://api.vercel.com/`, `https://api.neon.tech/`, `https://api.github.com/`) with `AllowAutoRedirect = false` on every handler; `ProviderMonitoringCore.cs:242-303` adds the circuit gate, 60s short cache (15s floor on rate-limit, capped 60s), the credentials gate with the honest Arabic missing-credentials state (`MissingCredentials = "بيانات الاعتماد غير مُهيّأة"`, :26), and bounded history. No connection material (tokens/headers) ever crosses the wire to the UI (`ServersCenter.tsx:14-17`). Tests: `Unit/Services/Monitoring/*` (5 suites), `Integration/ServersDashboardHttpTests.cs`, `Unit/Authorization/ServersViewPolicyTests.cs`.
7. **Student must-change-password flag** — migration `20261127012736_AddStudentMustChangePassword.cs` (bool NOT NULL DEFAULT false — legacy rows keep the safe default); set via `FlagMustChangePassword()` on admin reset, cleared by the student's own change/reset flows (`AuthHandlers.cs:436, 483`); surfaced in the login response (`AuthHandlers.cs:289`) and rendered by the student-web `MustChangePasswordBanner` (tested by `must-change-password-banner.test.tsx`, 4 tests, inside the 839 total).

---

## 6. Security review checklist (each verified in code this session)

| Area | Verdict | Evidence |
| --- | --- | --- |
| SSRF — provider monitoring | **VERIFIED** | fixed `BaseAddress` per named client + `AllowAutoRedirect=false` (`DependencyInjection.cs:48-93`); only fixed GETs, circuit gate, cache, honest missing-credentials (`ProviderMonitoringCore.cs:242-303`) |
| SSRF — storage/cache egress | **VERIFIED** | Upstash Blob REST client is a fixed named client (`UpstashRedis`, `DependencyInjection.cs:36-42`); S3 access via `UpstashS3ClientFactory` exchanging the token for short-lived credentials against the configured R2 endpoint (`UpstashS3ClientFactory.cs:31-106` — endpoint override is ops-controlled, non-R2 endpoints warn and fail closed at call time) |
| IDOR — student-side | **VERIFIED** | student surfaces key identity strictly off the validated `sub` claim (e.g. `StudentSecurityController.cs`, `CurrentIdentityHttpIntegrationTests.cs`); no student-supplied id trust paths found in the reviewed student controllers |
| IDOR — admin-side | **VERIFIED** | `IsInScopeAsync` scope checks on every admin student target (`AdminStudentsController.cs:296, 325, 352, 376`; `PermissionService.cs:86-131` walking `ResolveScopePathAsync` :133) |
| Academic scope | **VERIFIED** | `PermissionService.ResolveScopePathAsync` (`PermissionService.cs:133`) resolves university→subject paths for scope decisions; integration-pinned by `PermissionServiceIntegrationTests.cs` |
| XSS | **VERIFIED** | `dangerouslySetInnerHTML` occurrences in `apps/admin-web/src` + `apps/student-web/src` + `packages/`: **0** (grep this session); React default escaping applies; raw HTML surfaces go through `HtmlSanitizerService`/`HtmlCspInjectorService` backend-side (`Unit/Security/HtmlSanitizerServiceTests.cs`, `HtmlCspInjectorServiceTests.cs`, `HtmlViewHttpIntegrationTests.cs`) |
| Upload safety — avatar | **VERIFIED** | 3MB cap + jpeg/png/webp allowlist + `[RequestSizeLimit]`/`[RequestFormLimits]` (`AdminStudentsController.cs:33-37, 116-143`; student side `StudentProfileController.cs:361` with the same constraints) |
| Upload safety — library | **VERIFIED (with an honest note)** | presign flow (`/api/v1/library/upload-url` + `complete-upload`, roles admin,super_admin), publish gate requires `VirusScanStatus == Clean` (`LibraryHandlers.cs:195`); the active `IFileScanner` implementation is `TrustedFileScanner` — a **trust-based scanner that performs NO real malware detection** (documented in its header, `TrustedFileScanner.cs:6-23`; operators upload only reviewed content; `FailClosedFileScanner` exists as the fail-closed alternative). NOT a gap introduced by PR-6..10 — recorded here deliberately as a known accepted posture |
| Upload safety — PDF pipeline | **VERIFIED** | Ghostscript pre-processing pipeline with pinned args + process wrapper (`CMS.Application/BackgroundJobs/PdfProcessingService.cs` — `GhostscriptArgs` :85, `ProcessGhostscriptRunner` :107-126); tests `GhostscriptDiagnosticsTests.cs`, `PdfProcessingServiceTests.cs` |
| CSRF/CORS | **VERIFIED** | bearer-token auth in the `Authorization` header (no cookie auth ⇒ classic CSRF not applicable); CORS `CmsCorsOrigins.IsAllowed` exact-host allowlist + project-prefixed vercel preview hosts parsed by `Uri` host (no suffix-string spoofing) — `Program.cs:141-168`, `CmsCorsOrigins.cs:5-26`; pinned by `CorsPreflightHttpIntegrationTests.cs` |
| Rate limits | **VERIFIED** | `danger-zone` 5/min (`Program.cs:205`); admin-login dual partition 5/min per IP + 20/5min per e-mail with 429+Retry-After (`Program.cs:208-214`, `AdminLoginRateLimiter`); per-endpoint partitions: login 5/5min, otp 3/5min, password-reset 3/15min, auth 8/5min, questions 60/min, exam-session 120/min, search 30/min, health 600/min, static 600/min, admin 15/min, offline-package 5/15min, media-offline 60/5min, favorites 30/min, security-events 6/min (`Program.cs:180-200`) |
| Audit redaction | **VERIFIED** | `SanitizeAuditText` (`SecurityService.cs:180-191`) + `LogSanitizer` console path (`CMS.Api/Middleware/LogSanitizer.cs`); tests `SecurityAuditSanitizationTests.cs`, `SecurityAuditPostgresIntegrationTests.cs` (redaction round-trip through Postgres) |
| Log-forging | **VERIFIED** | control-char flattening before redaction/truncation in BOTH the DB path (`SecurityService.cs:185`) and the console path (`LogSanitizer.cs:26-37`) |
| Dependency vulnerabilities | **VERIFIED (gate exists)** | `pnpm audit --prod --audit-level high` runs in CI (`ci.yml` "Audit production dependencies" step); local audit run **NOT VERIFIED in this session** (CI executes it) |
| Secrets | **VERIFIED** | `scripts/ci/verify-security-artifact.sh` in the security-gate job (`ci.yml:39-50`) + tree-wide secret regex scan; pre-commit hook `.githooks/pre-commit` runs the same artifact gate (fails closed); the admin dictionary carries a no-secrets invariant test (`admin-web/src/test/dictionary.test.ts:129-141` — secret-shaped patterns asserted absent from every entry) |

---

## 7. Rollback review (exact revert commands)

Revert targets (full SHAs; two-commit PRs revert in reverse order — newest first):

```bash
# PR-9 (#221): servers dashboard UI
git revert eebe68b06d99c244b501e08647576d0cb270882a

# PR-8 (#220): servers dashboard backend
git revert e3a9d8dfe44db4e87c4323df122274984e07a2c5

# PR-7 (#219): settings studio + safeguards (frontend then backend)
git revert 6c39657922913c03c96844f417c0b83b0f4a4c43
git revert 3654b75731be02201691fc0670b730ad020a2f3b

# PR-6 (#218): student center + security center (frontend then backend)
git revert 0ffab68b726120de984682975a11b166295cce7e
git revert 34400de8d8454b695048509b63cdac039fd34d5

# PR-10 (this closure): SHA pending — revert the CI-gate + docs commit once landed
```

**Migration `Down()` safety notes**:

- `20261127012736_AddStudentMustChangePassword` (PR-6): `Up` = single `bool NOT NULL DEFAULT false` column on `students`; `Down` = plain `DropColumn` (:27-32). Additive; legacy rows default to "no forced change". Rolling back PR-6 code while leaving the column is harmless (nothing reads a dropped concern); reverting the migration drops only the flag column.
- `20261127021736_AddSystemSettingHistory` (PR-7): `Up` = new standalone table `system_setting_history` (+ index, intentionally NO FK); `Down` = `DropTable` (:47-51). Additive and isolated — dropping it never touches `system_settings` rows. **Caution: Down() destroys the settings audit trail — prefer reverting code and keeping the table/history.**
- `20261126234057_AddLibraryRetention` (PR-5): 4 nullable columns + filtered index on `library_files`; `Down` drops them (:59-80). Nullable ⇒ safe for legacy rows; reverting the code while keeping columns is harmless (retention state simply stops being consulted).
- PR-8 / PR-9 ship **no migrations** (pure code) — reverts are code-only.
- Startup auto-migrate (`Program.cs:329`) replays pending migrations; it does NOT auto-down. A migration rollback must be run deliberately (`dotnet ef database update <previous>`).

---

## 8. Test inventory at this SHA — EXACT numbers from this session's runs

| Suite | Command | Result (this session) |
| --- | --- | --- |
| Backend (`CMS.Tests`) | `export PATH="/home/z/.dotnet:$PATH"; cd apps/api && dotnet test CMS.sln -c Release --verbosity minimal` | **Passed 1206 / Failed 0 / Skipped 36 — Total 1242** (2m 52s). The 36 skipped are the Postgres integration tests gated on `CMS_PHASE34_TEST_POSTGRES`/Docker (`PostgresFixture.cs:92-107`); CI runs them in the `backend-integration-test` job against a real Postgres 16 service |
| Admin-web | `pnpm --filter @cms/admin-web test` | **Test files 46 passed (46), Tests 339 passed (339)** — 0 failed, 73.91s |
| Admin-web lint | `pnpm --filter @cms/admin-web lint` (`eslint --max-warnings=0`) | **exit 0 — zero warnings** |
| `@cms/ui` shared package | `pnpm --filter @cms/ui test` | **Test files 12 passed (12), Tests 61 passed (61)** |
| Student-web | `pnpm --filter @cms/student-web test` | **Test files 82 passed (82), Tests 839 passed (839)** — includes `must-change-password-banner.test.tsx` (4 tests) — 0 failed, 102.27s |

All numbers above were produced by the commands listed, executed in this session at this SHA.

---

## 9. CI gates status (workflow: `.github/workflows/ci.yml`)

| Gate | Runs in CI? | Where | Notes |
| --- | --- | --- | --- |
| Security artifact gate + secret scan | ✅ | `security-gate` job (`ci.yml:39-50`) — `scripts/ci/verify-security-artifact.sh` + tree-wide regex scan | Fails closed; mirrored locally by `.githooks/pre-commit` |
| Backend unit tests | ✅ | `backend-test` job (`ci.yml:55-78`) | `dotnet test` full suite |
| Backend Postgres integration | ✅ | `backend-integration-test` job (`ci.yml:88+`, Postgres 16 service + `dotnet ef database update` + `dotnet test`) | the 36 locally-skipped tests run here |
| Admin-web tests | ✅ | frontend job (`ci.yml:162-163`) | **gated in CI since PR-10 wave (Push 11.5 `wip/**` trust comment, :9)** |
| Admin-web lint (zero warnings) | ✅ | `ci.yml:169-172` | **PR-10 gap-matrix row 21 closure** — previously not CI-gated/red |
| Admin-web production build (tsc typecheck + vite) | ✅ | `ci.yml:174-177` | **PR-10** — the build IS the typecheck gate |
| `@cms/ui` package tests | ✅ | `ci.yml:179-181` | **NEW in PR-10** — 61 tests were never CI-gated before |
| Student e2e (Playwright, vite dev + mocked API) | ✅ | `ci.yml:188-275` | pre-existing |
| Admin e2e smoke (all views, mocked API, axe-core) | ✅ | `ci.yml:300-346` | **NEW in PR-10** — visual smoke evidence uploaded as artifacts |
| Student-web lint/tests/audit/build | ✅ | `ci.yml:353-366` | `pnpm audit --prod --audit-level high` included |
| CodeQL | ✅ runs on PR CI | `security-scan` job (`ci.yml:434-478`) | **runs on PR CI — conclusion recorded in PR #222 body** (placeholder row per program instruction) |
| Trivy | ✅ runs on PR CI | `security-scan` job (`ci.yml:463-478`, results uploaded to GitHub Security) | **runs on PR CI — conclusion recorded in PR #222 body** |
| Lighthouse CI | ✅ runs on PR CI (not a blocking perf gate by design) | `lighthouse` job (`ci.yml:479-530`) | reports uploaded; perf is not a merge gate by design |
| SBOM (CycloneDX) | ✅ | frontend job (`ci.yml:368-383`) — `scripts/ci/generate-cyclonedx-from-pnpm.js` | uploaded as `frontend-sbom` artifact |

---

## 10. Known limitations + honest "not verified here" list

1. **CodeQL / Trivy conclusions** — the scans run in CI on the PR; their verdicts are NOT VERIFIED here (no CI run observed from this sandbox). Per program instruction: *"runs on PR CI — conclusion recorded in PR #222 body."*
2. **Lighthouse performance** — informational CI job, deliberately not a merge gate; no perf numbers verified here.
3. **Monitoring credentials** — the four provider monitors currently report the honest `missing_credentials` state until the owner enters the provider env vars (`ServersDashboardHttpTests.cs:93-118` asserts exactly this posture; `ProviderMonitoringCore.cs:273-277`). Expected at launch; not a code defect.
4. **`GET /api/v1/admin/dashboard` family (4 endpoints)** — backend-enforced and live, but **no dedicated backend HTTP test suite found** (see coverage-matrix §19). Marked NOT VERIFIED at backend-suite level.
5. **`ContentCenter`** — no dedicated frontend test file; backend handler covered by `ContentPageHandlersTests.cs`.
6. **Virus scanning posture** — `TrustedFileScanner` performs no real malware detection (trust-based, documented; see §6 upload-safety row). Accepted operator decision; swap point documented for a real scanner.
7. **Live build identity** — the Render deployment's exact commit SHA is asserted (PR-217 merge SHA `e4b17335db94d95cf5b893f6740dfee413651298`) but NOT VERIFIED from the API surface (no build-info endpoint); liveness/readiness 200s are the verified evidence.
8. **PR-10's own SHA** — pending (this closure work is uncommitted by instruction; do not commit).
9. **`pnpm audit` local run** — not executed in this session (CI runs it); recorded as gate-exists.
10. **Admin-web first-run flake** — one early run of `pnpm --filter @cms/admin-web test` terminated with SIGTERM mid-suite (environment resource contention); the re-run completed cleanly 46/46 files, 339/339 tests, exit 0. No product defect; noted for honesty.

---

*Companion evidence: `docs/evidence/admin-coverage-matrix.md` (139-row admin Web/API coverage matrix, dead-button audit, dangerous-actions guard chains).*
