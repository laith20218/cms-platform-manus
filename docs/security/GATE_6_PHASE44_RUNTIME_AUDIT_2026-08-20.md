# Gate 6 — Phase 44 Runtime Audit Verification

## Executive judgment

> **CLOSED for the internal runtime-audit scope.** Every required producer-matrix event has current-run evidence of a real business trigger, real audit producer, durable PostgreSQL persistence, and named assertions for actor, event, severity, timestamp, correlation ID, and safe description. This is not a substitute for external staging/monitoring evidence.

The implementation retains one audit decision point: `ISecurityAuditWriter` is implemented by `SecurityService`, which applies shared sensitive-value redaction and a request-scoped correlation value before immediate or batched persistence. No security event is inserted by a producer-matrix test directly into `security_logs`.

## Required matrix — current runtime evidence

| # | Required event | Project event / real trigger | PostgreSQL evidence |
|---:|---|---|---|
| 1 | Login | `LoginSuccess` via `LoginCommandHandler` and `SessionService.CreateAsync` | `AuthAuditPostgresIntegrationTests.Login_RealCommand…` |
| 2 | Login failed | `LoginFailed` via incorrect credential path in `LoginCommandHandler` | `AuthAuditPostgresIntegrationTests.LoginFailed_RealCommand…` |
| 3 | Session created | `SessionCreated` via successful login/session creation | `SessionAuditPostgresIntegrationTests.SessionLifecycle…` |
| 4 | Session revoked | `SessionRevoked` via `LogoutCommandHandler` | `SessionAuditPostgresIntegrationTests.SessionLifecycle…` |
| 5 | Refresh | `Refresh` via `RefreshTokenCommandHandler` rotation | `SessionAuditPostgresIntegrationTests.RefreshAndReuse…` |
| 6 | Refresh reuse | `RefreshReuse` via a second use of an already-consumed opaque token | `SessionAuditPostgresIntegrationTests.RefreshAndReuse…` |
| 7 | Logout | `Logout` via `LogoutCommandHandler` | `SessionAuditPostgresIntegrationTests.SessionLifecycle…` |
| 8 | Password changed | `PasswordChanged` via `ChangePasswordCommandHandler` | `PasswordAuditPostgresIntegrationTests.PasswordChanged…` |
| 9 | Password reset completed | Project taxonomy maps this to `PasswordChanged` with `credential_reset=completed` | `PasswordAuditPostgresIntegrationTests.PasswordResetCompleted…` |
| 10 | Password reset requested | `PasswordResetRequested` via `ForgotPasswordCommandHandler` | `PasswordAuditPostgresIntegrationTests.PasswordResetRequested…` |
| 11 | MFA enabled | `MfaEnabled` after the durable administrative `Enable2FACommandHandler` transition | `Phase44ProducerMatrixPostgresIntegrationTests.EnableAndFailedMfa…` |
| 12 | MFA failed | `MfaFailed` for invalid or replayed administrative TOTP challenge | `Phase44ProducerMatrixPostgresIntegrationTests.EnableAndFailedMfa…` |
| 13 | Permission change | `PermissionChange` via `ReplaceRolePermissionsCommand` | `Phase44ProducerMatrixPostgresIntegrationTests.RolePermissionAndSubscriptionChanges…` |
| 14 | Role change | `RoleChange` via `AssignAdminRoleCommand` | `Phase44ProducerMatrixPostgresIntegrationTests.RolePermissionAndSubscriptionChanges…` |
| 15 | Subscription activated | `SubscriptionActivated` via `RedeemSubscriptionCodeCommand` | `Phase44ProducerMatrixPostgresIntegrationTests.RolePermissionAndSubscriptionChanges…` |
| 16 | Subscription revoked | `SubscriptionRevoked` via `RevokeStudentSubscriptionCommand` | `Phase44ProducerMatrixPostgresIntegrationTests.RolePermissionAndSubscriptionChanges…` |
| 17 | Entitlement denied | `EntitlementDenied` via real `LibraryController.GetAccess` validation | `LibraryAuditPostgresIntegrationTests.TamperedEntitlement…` |
| 18 | File access | `FileAccess` via `LibraryController` → real MediatR `LibraryHandlers` → signed URL boundary | `LibraryAuditPostgresIntegrationTests.ValidEntitlement…` |
| 19 | File access denied | `FileAccessDenied` via the same controller’s denied branch | `LibraryAuditPostgresIntegrationTests.TamperedEntitlement…` |
| 20 | Offline package created | `OfflinePackageCreated` via `OfflineHandlers.DownloadOfflinePackageCommand` and lifecycle/crypto service | `OfflineAuditProducerPostgresIntegrationTests.OfflineIssueRevoke…` |
| 21 | Offline package revoked | `OfflinePackageRevoked` via `DeleteOfflinePackageCommand` | `OfflineAuditProducerPostgresIntegrationTests.OfflineIssueRevoke…` |
| 22 | Offline sync rejected | `OfflineSyncRejected` via sync attempt after durable revocation | `OfflineAuditProducerPostgresIntegrationTests.OfflineIssueRevoke…` |
| 23 | Administrative action | `AdminAction` via `BanStudentCommand` and `AdminManagementHandlers` | `Phase44ProducerMatrixPostgresIntegrationTests.RolePermissionAndSubscriptionChanges…` |
| 24 | Security alert | `SecurityAlert` via suspicious failed-login threshold | `Phase44ProducerMatrixPostgresIntegrationTests.SuspiciousActivityThreshold…` |

Each named test queries `security_logs` after the action. The assertions include the relevant student or administrator actor, target identifier where applicable, expected severity, a recent timestamp, and the single correlation value assigned to its operation. Sensitive descriptions are checked against passwords, OTP values, refresh tokens, signatures, secrets, keys, and encrypted package material where they are test inputs.

## Correlation, retention, and privacy controls

| Control | Status | Current evidence |
|---|---|---|
| Correlation propagation and persistence | **PASS** | Session lifecycle, auth, password, library, Offline, MFA, and producer-matrix tests query a non-empty test correlation ID from PostgreSQL. Related session events share the same ID. |
| Retention mechanism | **PASS** | `SecurityAuditRetentionPostgresIntegrationTests` persists an old and recent record, runs the retention service, then proves the old event is removed and the recent event remains under the configured 365-day policy. |
| Immediate and batched writes | **PASS** | Warning/critical events persist immediately; information events are explicitly flushed in runtime tests before the PostgreSQL query. |
| Privacy redaction | **PASS** | `SecurityAuditPostgresIntegrationTests` proves refresh-token redaction in the durable record. Producer tests additionally reject sensitive test inputs from their own descriptions. |

## Commands and results

```bash
cd apps/api
DOTNET_ROLL_FORWARD=Major dotnet build CMS.sln -c Release --no-restore
CMS_PHASE34_TEST_POSTGRES='Host=/var/run/postgresql;Database=cms_phase34_test;Username=ubuntu' \
  DOTNET_ROLL_FORWARD=Major dotnet test src/CMS.Tests/CMS.Tests.csproj -c Release --no-build \
  --filter 'FullyQualifiedName~AuthAuditPostgresIntegrationTests|…' --verbosity minimal
CMS_PHASE34_TEST_POSTGRES='Host=/var/run/postgresql;Database=cms_phase34_test;Username=ubuntu' \
  DOTNET_ROLL_FORWARD=Major dotnet test CMS.sln -c Release --no-build --verbosity minimal
```

| Run | Result | Evidence artifact |
|---|---:|---|
| Producer-matrix selection | **15 passed, 0 failed, 0 skipped** | [`phase44_full_producer_matrix_runtime_2026-08-20.log`](phase44_full_producer_matrix_runtime_2026-08-20.log) |
| Final Release build | **0 errors** | [`phase44_matrix_build_2026-08-20.log`](phase44_matrix_build_2026-08-20.log) |
| Final full backend suite on PostgreSQL | **124 passed, 0 failed, 0 skipped** | [`phase44_final_full_postgres_2026-08-20.log`](phase44_final_full_postgres_2026-08-20.log) |

## Scope and external boundary

The additional MFA audit producers concern the already-present **administrative** 2FA business triggers only. Student OTP production configuration remains disabled; its test-only enablement is confined to password-reset fixture configuration and does not modify `appsettings.json`. No Phase 39–43 authentication, session, entitlement, permission, or content architecture was refactored.

Staging/deployment-side observability, retention-job monitoring, log-access controls, and operational ownership remain external release gates. They do not invalidate this internal Phase 44 closure, but they continue to constrain any wider Production Candidate decision.

## Gate decision

**Phase 44 internal closure: PASS.** The next blocking layer is Phase 45 trusted client and platform runtime acceptance. Phase 46 remains prohibited until that gate is independently closed.
