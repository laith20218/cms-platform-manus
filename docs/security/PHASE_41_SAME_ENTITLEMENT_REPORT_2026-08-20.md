# Phase 41 — Same Entitlement Closure Report

**Prepared by:** Manus AI  
**Evidence date:** 2026-08-20  
**Scope:** Questions, Exams, Lectures, Library files, signed file access URLs, and Offline-package request headers.  
**OTP policy:** Unchanged. `Features:OtpEnabled=false` remains the intentional default.

## Executive decision

**Phase 41 is CLOSED for the repository-level entitlement control.** The implementation now uses one server-side decision contract, `IEntitlementService`, to resolve academic access from the requested resource and the student's active subscription. Short-lived `X-Entitlement` tokens remain a transport-level proof that is validated before the protected HTTP handlers are invoked; they are not the authority that grants subscription access. The handlers independently re-evaluate the live server-side grant and fail closed.

The current workspace also has a separate **external environment blocker** for the two PostgreSQL session-regression tests: `CMS_PHASE34_TEST_POSTGRES` is not configured, and the locally reachable PostgreSQL service requires credentials not available in this run. This does **not** invalidate the Phase 41 targeted HTTP and service evidence, but it prevents a claim that the unfiltered full backend suite passed in the current environment.

| Decision area | Result | Evidence |
|---|---|---|
| Signed entitlement gate before protected Exam handler | **PASS** | 15 HTTP pipeline tests; rejected requests leave `ISender` with zero invocations. |
| Signed entitlement gate before protected Lecture handler | **PASS** | Missing and out-of-scope Lecture tokens return 401/403 before `ISender`. |
| Server-side live entitlement for Exam and Lecture | **PASS** | `EntitlementServiceIntegrationTests` prove active scope grant, expired subscription denial, and wrong subject denial. |
| Exam result/review BOLA prevention | **PASS** | HTTP test requests a second student's session, receives 404, invokes no handler, and returns no target session identifier. CQRS queries also require `StudentId`. |
| Library and signed URL live entitlement | **IMPLEMENTED — regression-covered by existing architecture, build verified** | Library handlers enforce `CanAccessSubjectAsync`; targeted HTTP suite did not add a new Library scenario in this run. |
| Offline package token header from web client | **IMPLEMENTED — build verified** | Download client calls `entitlementRequestConfig()` and adds an idempotency key. Offline HTTP proofs remain recorded in Phase 36. |
| Unfiltered backend suite in current workspace | **BLOCKED** | Two PostgreSQL tests require `CMS_PHASE34_TEST_POSTGRES`; all 89 non-PostgreSQL tests passed. |

## Remediation implemented

The following changes preserve a single entitlement decision path rather than creating controller-specific authorization rules.

| Area | Remediation |
|---|---|
| Central interface | Added `CanAccessExamAsync` and `CanAccessLectureAsync` to `IEntitlementService`. |
| Central implementation | `EntitlementService` resolves Exam and active Lecture resources to their Subject, then evaluates student identity, academic hierarchy, active/non-revoked subscription dates, and subscription scope. Unknown or inactive resources fail closed. |
| Exams HTTP | `ExamsController` validates `X-Entitlement`, installation binding, expiry, signature, and requested subject before dispatch for list, details, start, submit, results, and review endpoints. |
| Exams CQRS | Exam query/session handlers re-check active server-side entitlement. Result and review queries now carry `StudentId` and fetch sessions with `SessionId AND StudentId`, closing the prior BOLA/IDOR condition. |
| Lectures HTTP/CQRS | `AcademicController` gates list and detail routes with signed entitlement. `AcademicQueryHandlers` require a non-null student identity and fresh subject entitlement before returning Lecture data. |
| Library | Detail and view recording now require published/non-deleted files. View recording has a fresh server-side subject entitlement check. Existing file-list and signed-URL issuance checks remain in place. |
| Student web client | A shared `entitlement-api.ts` caches only a valid short-lived token in `sessionStorage`, renews it when near expiry, and clears it on logout/hydration failure. Questions, Exams, Lectures, Library, and Offline download clients attach `X-Entitlement`; Offline download additionally sends a generated `X-Idempotency-Key`. |

## HTTP evidence matrix

The HTTP suite uses `WebApplicationFactory`, the configured controller/middleware pipeline, in-memory EF data, the production signed-entitlement service, authenticated test identity, installation headers, and a strict `ISender` mock. The mock is not used to create a positive result: its empty invocation list proves rejected requests never reached the command/query handler.

| Scenario | Route class | Expected result | Observed result | Handler reached? |
|---|---|---:|---:|---:|
| Missing entitlement | Protected Question | 401 | 401 | No |
| Expired entitlement | Protected Question | 403 | 403 | No |
| Tampered entitlement | Protected Question | 403 | 403 | No |
| Different installation | Protected Question | 403 | 403 | No |
| Wrong subject scope | Protected Question | 403 | 403 | No |
| Missing entitlement | Exam detail | 401 | 401 | No |
| Expired entitlement | Exam detail | 403 | 403 | No |
| Tampered entitlement | Exam detail | 403 | 403 | No |
| Different installation | Exam detail | 403 | 403 | No |
| Wrong subject scope | Exam detail | 403 | 403 | No |
| Missing entitlement | Lecture detail | 401 | 401 | No |
| Wrong subject scope | Lecture detail | 403 | 403 | No |
| Student A requests Student B's Exam result | Exam result | 404 and no data | 404 and no session identifier in body | No |

## Live server-side decision evidence

The dedicated `EntitlementServiceIntegrationTests` establish that content access does not depend only on the signed client token.

| Scenario | Resource | Expected | Observed |
|---|---|---:|---:|
| Active subject subscription | Published Exam inside subject scope | Allow | Allow |
| Active subject subscription | Active Lecture inside subject scope | Allow | Allow |
| Expired subscription | Existing published Exam | Deny | Deny |
| Subscription for Subject A | Published Exam in Subject B | Deny | Deny |

## Commands and results

| Command | Result | Artifact |
|---|---|---|
| `DOTNET_ROLL_FORWARD=Major dotnet build CMS.sln -c Release --no-restore` | **PASS** — 0 warnings, 0 errors | `docs/security/phase41_backend_final_build_2026-08-20.log` |
| `DOTNET_ROLL_FORWARD=Major dotnet test src/CMS.Tests/CMS.Tests.csproj -c Release --filter "FullyQualifiedName~EntitlementServiceIntegrationTests|FullyQualifiedName~SignedEntitlementHttpIntegrationTests" --verbosity minimal` | **PASS** — 19/19 | `docs/security/phase41_targeted_evidence_2026-08-20.log` |
| `DOTNET_ROLL_FORWARD=Major dotnet test CMS.sln -c Release --no-build --filter 'Category!=PostgresIntegration' --verbosity minimal` | **PASS** — 89/89 | `docs/security/phase41_backend_final_tests_2026-08-20.log` |
| `pnpm build` | **PASS** — TypeScript build and Vite production build | `docs/security/phase41_frontend_final_build_2026-08-20.log` |
| `pnpm exec vitest run` | **PASS** — 9/9 | `docs/security/phase41_frontend_final_tests_2026-08-20.log` |
| `DOTNET_ROLL_FORWARD=Major dotnet test CMS.sln -c Release --no-build --verbosity minimal` | **BLOCKED** — 86 passed, 2 PostgreSQL tests stop because `CMS_PHASE34_TEST_POSTGRES` is unset | `docs/security/phase41_backend_full_tests_2026-08-20.log` |

## External blocker and closure condition

| Item | Classification | Required owner action | Closure evidence |
|---|---|---|---|
| PostgreSQL session-regression tests | **EXTERNAL BLOCKER** | Deployment/test-environment owner must provide a disposable PostgreSQL test connection through `CMS_PHASE34_TEST_POSTGRES`, without sharing its secret in chat. | Re-run `dotnet test CMS.sln -c Release --no-build --verbosity minimal`; preserve successful output for all tests. |

No production flag was enabled, no OTP behavior changed, no raw encryption key was introduced, and no secret value is recorded in this report.

## Phase transition

Phase 41 implementation and its targeted acceptance evidence are complete. The next ordered phase is **Phase 42 — Same Permissions**, which must audit every administrative resource and bulk operation for deny-by-default RBAC plus concrete university/college/subject/student scope validation.
