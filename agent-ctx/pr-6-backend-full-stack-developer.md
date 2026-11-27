# PR-6 Backend — Student Center + Security Center (apps/api)

Task ID: `pr-6-backend` · Branch: `feat/pr-6-student-security-center` (base = origin/main @ e4b1733) · All changes left UNCOMMITTED in the working tree as instructed. Scope strictly confined to `apps/api`; the parallel frontend agent's `apps/admin-web` / `apps/student-web` changes visible in `git status` are NOT mine and were not touched.

## Final verification

- `dotnet build CMS.sln -c Release` → **0 errors**, zero warnings in CMS.Api / CMS.Application / CMS.Domain / CMS.Infrastructure. CMS.Tests carries 42 warnings (baseline 39; +3 are the exact same CS0618/CS8604 warnings every existing cloned `AuthenticationHandler`-based factory in the repo produces — the test project tolerates them by design).
- `dotnet test CMS.sln --no-build -c Release` → **1052 passed / 0 failed / 36 skipped** (baseline 995/0/36; +57 new tests, all PostgresFact skips stay expected — no Docker locally). Ran the full suite twice to rule out danger-zone rate-limit window flakiness; both runs identical.

## Files created

| File | Purpose |
| --- | --- |
| `apps/api/src/CMS.Infrastructure/Persistence/Migrations/20261127012736_AddStudentMustChangePassword.cs` (+ `.Designer.cs`) | Migration adding `students.must_change_password boolean NOT NULL DEFAULT false`. Generated via `dotnet ef migrations add AddStudentMustChangePassword --project src/CMS.Infrastructure --startup-project src/CMS.Api` (design-time connection via `CMS_EF_CONNECTION`); doc comment added by hand, generated files compile. |
| `apps/api/.config/dotnet-tools.json` | Local dotnet tool manifest (`dotnet-ef` 9.0.0) — required for `dotnet tool restore` / `dotnet ef` (none existed in the repo). |
| `apps/api/src/CMS.Tests/Unit/Services/SecurityAuditSanitizationTests.cs` | SanitizeAuditText hardening: LF-only, CRLF, tab, ESC/NUL/SOH/DEL/CR theory (5 cases), mixed, userAgent+deviceFingerprint flattening, 512-char truncation, truncation-applies-to-flattened-text, Arabic/Unicode preserved, password=[REDACTED] still applied, control-chars+keyword combo, batched path flattening (16 cases). |
| `apps/api/src/CMS.Tests/Unit/Handlers/StudentSecurityCenterHandlerTests.cs` | ResetStudentPassword (happy path incl. force flag + audit `credential_reset=student` + no plaintext leak; without force; wrong actor password → INVALID_CURRENT_PASSWORD; weak password → PASSWORD_POLICY_VIOLATION; unknown student; unknown actor), archive (tombstone + `student_archived` revocation + audit `action=student_archive`), archive idempotency, archive+restore round trip (`action=student_restore`), restore idempotency, GetStudentsQuery `status=archived` (+case-insensitive, default hides archived, "Active" hides archived), GetStudentDetail full field population (academic/subscriptions/device), archived+locked-out detail, detail 404 (18 tests). |
| `apps/api/src/CMS.Tests/Integration/StudentSecurityCenterHttpTests.cs` | WebApplicationFactory suite (23 tests): password-reset 401/403/404/400-INVALID_CURRENT_PASSWORD/204-happy (hash swapped via real Argon2 verify, sessions revoked, audit verified, `mustChangePassword` surfaced on detail), detail 401/403/404/200-exact-shape, archive full lifecycle (visible → 204 → hidden from default list → visible under `status=archived` → detail `archived:true` → idempotent second archive → restore → visible again), archive/restore 404 + 403, activity 401/403/pagination/type+severity+date filters/invalid-enum-ignored/actor shape (`adminName` + `actorType`), summary 401/403/real counters incl. top-5 failed-login IPs. Includes its own `StudentSecurityCenterHttpFactory` + `StudentCenterTestAuthHandler` (super admin with real Argon2 hash, permission-less admin, seeded SecurityLogs with controlled CreatedAt). |

## Files modified

| File | Change |
| --- | --- |
| `CMS.Infrastructure/Services/SecurityService.cs` | `SanitizeAuditText` hardened: control chars (`\u0000-\u001F`, `\u007F`) → single space BEFORE `SensitiveAuditValuePattern` redaction BEFORE 512-truncation; new compiled `ControlCharacterPattern`; class doc comment updated. |
| `CMS.Domain/Entities/UserEntities.cs` (Student) | `MustChangePassword` (+ `FlagMustChangePassword` / `ClearMustChangePassword`), `Archive()` / `RestoreFromArchive()` tombstone lifecycle (both keep UpdatedAt refresh; idempotent). |
| `CMS.Application/Commands/Dashboard/DashboardCommands.cs` | `ResetStudentPasswordCommand`, `ArchiveStudentCommand`, `RestoreStudentCommand`, `GetStudentDetailQuery` + `StudentDetailDto` (+ `StudentAcademicInfoDto`, `StudentSubscriptionSummaryDto`, `StudentSubscriptionBriefDto`, `StudentActiveDeviceDto`); documented the `status=archived` semantics on `GetStudentsQuery`. |
| `CMS.Application/Handlers/Dashboard/DashboardHandlers.cs` | `AdminManagementHandlers` implements the 4 new requests (constructor gains `IPasswordHasher`, `IPasswordPolicy`, `ISessionService`); `GetStudentsQuery` special-cases `status == "archived"` (case-insensitive) → only `DeletedAt != null`, drops the normal status filter. Reset = actor re-auth → policy → hash swap → optional force flag → SaveChanges → `RevokeAllForUserAsync("admin_password_reset")` → audit `credential_reset=student; target_student_id=…; force_change=…`. |
| `CMS.Api/Controllers/AdminStudentsController.cs` | New endpoints: `GET {studentId}` (StudentView policy + scope + 404 → StudentDetailDto), `POST {studentId}/password-reset` (StudentEdit policy + danger-zone rate limit + scope + 404 + `ResetStudentPasswordRequest` → 204), `POST {studentId}/archive` and `POST {studentId}/restore` (StudentEdit + scope + 404 → 204, idempotent), `GET {studentId}/activity` (LogView policy + scope + page/pageSize clamp 1..100 + type/severity parse-ignore + date range + exact `{items,total,page,pageSize,totalPages}` shape with `adminName`/`actorType`). Controller gains `ISender`. |
| `CMS.Api/Controllers/SecurityController.cs` | `GET /api/v1/security/summary` — Logs.View gate (Arabic 403 ProblemDetails), real counters from SecurityLogs + Students (24h/7d failed logins, active lockouts, refresh reuse, MFA enable/disable/fail, critical, suspicious alerts, password resets) and top-5 failed-login IPs (bounded 2000-row materialization, grouped in memory, non-null `ipAddress` projection). |
| `CMS.Application/DTOs/Auth/AuthDtos.cs` | `AuthResponse` gains optional `bool MustChangePassword = false`. |
| `CMS.Application/Handlers/Auth/AuthHandlers.cs` | `LoginCommandHandler` sets `MustChangePassword` on the response; `ChangePasswordCommandHandler` + `ResetPasswordCommandHandler` call `student.ClearMustChangePassword()`. |
| `CMS.Api/Controllers/StudentProfileController.cs` | `GET /api/v1/profile` payload gains `mustChangePassword` (`StudentProfileDto` optional param + projection). |
| `CMS.Tests/Unit/Handlers/ActivityMonitorHandlerTests.cs`, `CMS.Tests/Integration/PermissionServiceIntegrationTests.cs`, `CMS.Tests/Integration/Phase44ProducerMatrixPostgresIntegrationTests.cs` | Updated the 3 existing `AdminManagementHandlers` constructor call sites for the 3 new DI params (inert mocks). |

## Deviations from the spec (deliberate, with reasons)

1. **Activity endpoint actor resolution**: the spec sketched "batch-fetch Students + Admins dictionaries", but the mandated response shape only contains `adminName` (no student name). Fetching only the Admins dictionary avoids dead code under `TreatWarningsAsErrors`; response shape matches the contract exactly.
2. **No handler-side permission checks for the new commands**: the spec states "Mock IPermissionService NOT needed in handler (authz is at controller)" for the reset handler; applied the same controller-side-authorization model to archive/restore/detail for consistency with the existing AdminStudentsController drawer endpoints (Ban/Unban keep their handler-side checks — unchanged legacy behavior).
3. **`dotnet new tool-manifest`** was required before `dotnet tool restore` could work (repo had no manifest); pinned `dotnet-ef` 9.0.0 to match EF Core 9.0.0.
4. **Summary top-IP grouping done in memory** (bounded 2000 rows) — the spec explicitly allowed this when inet translation is risky; tests stay provider-neutral.
5. Weak-password HTTP test omitted (covered at unit level) to keep the danger-zone partition comfortably below 5/min; wrong-actor-password is covered both at unit and HTTP level.

## Risks / notes for the next agent

- The 4 new endpoints were validated on EF InMemory only (no Docker → PostgresFact skips); `StudentDetailDto` is built from `Include`-based navigation loads (standard translatable LINQ), and the summary uses only `CountAsync` + a bounded projection — low translation risk, but a staging smoke test is advisable (repo's documented "Critical Testing Gap" applies).
- `Student.Archive/RestoreFromArchive` rely on there being NO global soft-delete query filter (verified: `GetStudentsQuery` filters `DeletedAt` manually in LINQ). Anyone adding a global filter later will change restore semantics.
- Danger-zone rate limit (5/min) covers the password-reset route; frontend should surface 429s gracefully.
- `Git` working tree also contains the parallel frontend agent's changes (admin-web/student-web) — do not confuse them with this backend change set; nothing was committed or pushed.
