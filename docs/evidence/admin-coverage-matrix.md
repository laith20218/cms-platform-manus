# Admin Web/API Coverage Matrix — PR-10 evidence

> **Verified from code at SHA `eebe68b06d99c244b501e08647576d0cb270882a`** (short `eebe68b`, branch
> `feat/pr-10-final-quality-launch-closure`, verified 2026-11-27). This matrix was built by reading
> the working tree directly: `apps/admin-web/src/App.tsx` (view registry + render gates), every
> component in `apps/admin-web/src/components/*.tsx` (each header contract re-verified against its
> actual `apiRequest`/`request` call sites), every controller in `apps/api/src/CMS.Api/Controllers/*.cs`
> (route + `[Authorize]` attributes), `apps/api/src/CMS.Api/Authorization/PermissionAuthorization.cs`
> (policy → resource/action mapping), and both the admin-web (`apps/admin-web/src/test/*.test.tsx`)
> and backend (`apps/api/src/CMS.Tests/**`) test suites.
>
> The working tree at this SHA contains the merged-but-unmerged-PR work for PR-6..PR-9
> (Student Center, Security Center, Settings Studio, role safeguards, Servers Dashboard)
> plus the PR-10 closure work; HEAD itself is the PR-9 admin-ui commit.

---

## Legend

| Column | Meaning |
| --- | --- |
| **Action** | User-visible action, bilingual (Arabic label / English label) as rendered by the UI dictionary. |
| **Frontend trigger** | Component + file:line where the user gesture fires the call. |
| **Backend endpoint** | HTTP verb + route as declared in the controller (route templates quoted verbatim). |
| **Backend authorization** | The *server-side* gate actually enforced. `Roles="…"` = role claim check; `Policy=X` = permission policy resolved by `PermissionHandler` → `IPermissionService.HasPermissionAsync` (resource+action+scope, admin tokens only — student tokens rejected early in `PermissionAuthorization.cs:54-63`); `HasPermissionAsync(...)` inline = same check done in-controller; `SuperAdmin` policy = role requirement pinned to super_admin. |
| **Test coverage** | Frontend suite(s) in `apps/admin-web/src/test/` + backend suite(s) in `apps/api/src/CMS.Tests/`. |
| **Backend-enforced?** | ✅ = the gate runs on the server, not merely a UI hide. Every row in this matrix is backend-enforced unless explicitly marked otherwise. |

Authorization layer facts (from code, cited):

- Policy registry: `apps/api/src/CMS.Api/Authorization/PermissionAuthorization.cs:89-235` — every policy resolves to `PermissionRequirement(resource, action)`; the handler rejects student-role tokens before consulting grants (lines 54-63), then delegates to `IPermissionService.HasPermissionAsync` (line 66-70).
- SuperAdmin policy: `apps/api/src/CMS.Api/Program.cs:111` — `options.AddPolicy("SuperAdmin", policy => …)` pins the super_admin role.
- Scope/IDOR layer: `PermissionService.IsInScopeAsync` walks the admin's persisted scope against the target's academic path (`apps/api/src/CMS.Infrastructure/Services/PermissionService.cs:86-131`, `ResolveScopePathAsync` at line 133).
- Cosmetics vs. enforcement: admin-web `can()`/`superOnly` gates are UX-only and *fail open on load/error* by design (`apps/admin-web/src/App.tsx:218-223`, `apps/admin-web/src/lib/uiPermissions.ts`); the backend RBAC above is the real boundary in every row.

Academic cascade read endpoints used by many views (cited once here, referenced below as **cascade**):
`GET /api/v1/universities` (`AcademicController.cs:51`, anonymous read), `GET /api/v1/universities/{id}/colleges` (:111), `GET /api/v1/colleges/{id}/years` (:151), `GET /api/v1/years/{id}/semesters` (:181, `[Authorize]`), `GET /api/v1/semesters/{id}/subjects` (:203, `[Authorize]`), `GET /api/v1/admin/content/academic/subjects/{subjectId}/lectures` (`AdminContentController.cs:145`, roles admin,super_admin). Frontend suites: `academicContext.test.tsx`, `scope-picker.test.tsx`.

---

## 0. Login / 2FA (pre-auth surface)

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Sign in «تسجيل الدخول» | `App.tsx:387-426` (`signIn` → `login()` `lib/api.ts:173-197`) | `POST /api/v1/auth/admin/login` (`AdminAuthController.cs:32`) | `[AllowAnonymous]` + `AdminLoginRateLimiter` 5/min per IP + 20/5min per normalized e-mail, 429 + `Retry-After` (`AdminAuthController.cs:34-50`, `Program.cs:208-214`) | FE: `login-two-factor.test.tsx`, `app-boot.test.tsx` · BE: `AuthAuditPostgresIntegrationTests.cs`, `Unit/Security/AdminLoginRateLimiterTests.cs` | ✅ (rate limit + credential verification server-side) |
| 2FA challenge step «الرمز التحقق» | `App.tsx:414-419` (`TWO_FACTOR_REQUIRED` → OTP field, `App.tsx:651-676`) | same endpoint, body carries `otp` | Backend-driven: `AdminHandlers.HandleLoginAsync` answers `TWO_FACTOR_REQUIRED` only after the password verifies — the step never weakens 2FA (`App.tsx:163-167` comment, contract asserted in FE suite) | FE: `login-two-factor.test.tsx` · BE: `AuthAuditPostgresIntegrationTests.cs` | ✅ (challenge decided server-side) |
| Leave 2FA step «عُد للبيانات» | `App.tsx:429-433` (`backToCredentials`) | — (client state only; re-submit goes through the same gated endpoint) | n/a | FE: `login-two-factor.test.tsx` | n/a (navigation only) |
| Refresh session token | `App.tsx:256-263` (`refreshAccessToken` `lib/api.ts:199-210`) | `POST /api/v1/auth/refresh` (`AuthController.cs:117`) | Valid refresh-token grant + reused/rotated token audit | BE: `SessionAuditPostgresIntegrationTests.cs` (Postgres-gated), `SessionServicePostgresIntegrationTests.cs` | ✅ |
| Session restore (reload) | `App.tsx:240-264` (sessionStorage read — credentials never persisted across sessions) | — | n/a | FE: `app-boot.test.tsx` | n/a |
| API health probe pill | `App.tsx:267-273` (`fetch /health`) | `GET /health` (`Program.cs:419`, rate-limit `health` 600/min) | Public + rate limited | BE: `Integration/Health/*` (`HealthEndpointTests`) | ✅ |
| Enable 2FA «تفعيل التحقق» | `TwoFactorCard.tsx:77` | `POST /api/v1/auth/admin/2fa/enable` (`AdminAuthController.cs:99-100`) | `[Authorize(Roles="admin,super_admin")]` | FE: `two-factor-card.test.tsx` | ✅ |
| Disable 2FA «إيقاف التحقق» | `TwoFactorCard.tsx:91-95` (password body) | `POST /api/v1/auth/admin/2fa/disable` (`AdminAuthController.cs:114-115`) | roles admin,super_admin + password re-verification | FE: `two-factor-card.test.tsx` | ✅ |
| Unread notification badge | `App.tsx:329-333` | `GET /api/v1/notifications/unread-count` (`NotificationsController.cs:47-48`) | `[Authorize]` (any authenticated principal; per-account data) | FE: (shell smoke in `app-boot.test.tsx`) | ✅ |
| Sign out | `App.tsx:446-456` (`signOut`) | — (client-side session discard; server sessions expire/rotate) | n/a | FE: `app-boot.test.tsx` | n/a |

---

## 1. Overview `/` («لوحة القيادة / Overview»)

Render gate: `can('view:overview')` (`App.tsx:950`); nav item non-superOnly (`App.tsx:709`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| KPI stat tiles | `App.tsx:1234` (Overview fetch) | `GET /api/v1/admin/dashboard` (`AdminDashboardController.cs:59-60`) | `[Authorize(Policy="SuperAdmin")]` (class base is roles admin,super_admin at :24) | FE: `app-boot.test.tsx` (boot smoke) · BE: **no dedicated suite found — NOT VERIFIED at backend-suite level** (handler smoke only via sibling `DashboardHandlers` tests) | ✅ |
| Recent activity feed | `DashboardFeeds.tsx:77` | `GET /api/v1/admin/dashboard/recent-activity?count=6` (`AdminDashboardController.cs:67-68`) | Policy `SuperAdmin` | FE: `dashboard-feeds.test.tsx` · BE: `Unit/Handlers/ActivityMonitorHandlerTests.cs` (adjacent handler family) — **endpoint-level HTTP suite NOT FOUND** | ✅ |
| Top subjects feed | `DashboardFeeds.tsx:80` | `GET /api/v1/admin/dashboard/top-subjects?count=5` (`AdminDashboardController.cs:91-92`) | Policy `SuperAdmin` | FE: `dashboard-feeds.test.tsx` · BE: endpoint-level suite NOT FOUND | ✅ |
| Reports summary card | `DashboardFeeds.tsx:83` | `GET /api/v1/admin/dashboard/reports/summary` (`AdminDashboardController.cs:99-100`) | Policy `SuperAdmin` | FE: `dashboard-feeds.test.tsx` · BE: endpoint-level suite NOT FOUND | ✅ |
| 2FA self-service card | `TwoFactorCard.tsx` (see §0) | see §0 | see §0 | `two-factor-card.test.tsx` | ✅ |
| Cross-view quick nav | `Overview` `onNavigate={setView}` (`App.tsx:953`) | — (client routing; target views re-gate) | n/a | FE: `app-routing.test.tsx`, `command-palette.test.tsx` | n/a |

---

## 2. Admins `/admins` («المديرون / Admins»)

Render gate: `isSuperAdmin && can('view:admins')` (`App.tsx:984`); nav superOnly (`App.tsx:733`). Data fetched only for super admins (`fetchManagementData`, `App.tsx:355-376`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| List + filters (?q&role&status URL state) | `App.tsx:363-366` | `GET /api/v1/admin/admins?{page,pageSize,search,roleId,isActive}` (`AdminDashboardController.cs:163-164`) | Policy `SuperAdmin` + handler `RequireSuperAdminAsync` (`AdminHandlers.cs:627-629`) | FE: `query-state.test.tsx`, `admins-center.test.tsx` · BE: `SettingsStudioHttpTests.cs` (authz matrix via effective-permissions paths) | ✅ |
| Roles reference list | `App.tsx:365` | `GET /api/v1/admin/roles` (`AdminDashboardController.cs:275-276`) | Policy `SuperAdmin` | FE: `admins-center.test.tsx` · BE: `UiPermissionsHttpIntegrationTests.cs` | ✅ |
| Create admin «إضافة مدير» | `App.tsx:493` (`submitAdmin`) | `POST /api/v1/admin/admins` (`AdminDashboardController.cs:196-197`) | Policy `SuperAdmin`; handler re-checks actor super_admin, e-mail uniqueness, password policy, role active + scope validation (`AdminHandlers.cs:510-528`) | FE: `admins-center.test.tsx` · BE: `Unit/Handlers/LastSuperAdminGuardTests.cs` (adjacent lifecycle), `SettingsStudioHttpTests.cs` | ✅ |
| Edit admin «تعديل» | `App.tsx:496` | `PUT /api/v1/admin/admins/{id}` (`AdminDashboardController.cs:209-210`) | Policy `SuperAdmin`; `UpdateAdminCommand` → super-check + **`EnsureTargetIsNotLastEffectiveSuperAdmin`** (`AdminHandlers.cs:531-557`, guard at :539) | FE: `admins-center.test.tsx` · BE: `SettingsStudioHttpTests.cs:379-401` (demote path), `Unit/Handlers/LastSuperAdminGuardTests.cs` | ✅ |
| Enable/disable admin «تعطيل/تنشيط» | `App.tsx:508-521` (`setAccountStatus`, ConfirmDialog gated) | `POST /api/v1/admin/admins/{id}/status` (`AdminDashboardController.cs:219-220`) | Policy `SuperAdmin`; disabling revokes target sessions + last-super-admin guard (`AdminHandlers.cs:560-581`) | FE: `admins-center.test.tsx` · BE: `SettingsStudioHttpTests.cs:348-362`, `Unit/Handlers/LastSuperAdminGuardTests.cs:168-184` | ✅ |
| Reset admin password «إعادة تعيين كلمة المرور» | `App.tsx:523-538` (`submitResetPassword`) | `POST /api/v1/admin/admins/{id}/reset-password` (`AdminDashboardController.cs:230-231`) | Policy `SuperAdmin`; policy-checked password, hash swap, **all target sessions revoked**, last-super-admin guard (`AdminHandlers.cs:583-601`) | FE: `admins-center.test.tsx` · BE: `SettingsStudioHttpTests.cs:402+`, `Unit/Handlers/LastSuperAdminGuardTests.cs:184-198` | ✅ |
| Delete admin «حذف» | `App.tsx:540-556` (`submitDeleteAdmin`, password re-entry required in UI) | `DELETE /api/v1/admin/admins/{id}` (`AdminDashboardController.cs:241-242`) | Policy `SuperAdmin` + **actor password Argon2 re-auth** (`AdminHandlers.cs:606-607`) + last-super-admin guard (:614) + session revocation + Critical audit (:622-623) | FE: `admins-center.test.tsx` · BE: `SettingsStudioHttpTests.cs:365-379`, `Unit/Handlers/LastSuperAdminGuardTests.cs:198-212` | ✅ |
| Effective-access drawer «الوصول الفعّال» | `AdminsCenter` drawer → `fetchAdminEffectivePermissions` (`lib/api.ts:745-747`) | `GET /api/v1/admin/admins/{id}/effective-permissions` (`AdminDashboardController.cs:188-189`) | Policy `SuperAdmin` | FE: `admins-center.test.tsx` · BE: `SettingsStudioHttpTests.cs:265-347`, `Unit/Handlers/AdminEffectivePermissionsHandlerTests.cs` | ✅ |
| Scope cascade pickers | `ScopePicker.tsx:71-114` | cascade (see Legend) | read endpoints as listed | FE: `scope-picker.test.tsx` | ✅ |

---

## 3. Roles `/roles` («الأدوار / Roles»)

Render gate: `isSuperAdmin && can('view:roles')` (`App.tsx:1011`); nav superOnly (`App.tsx:734`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Roles list + skeleton | `App.tsx:365` (shared fetch) | `GET /api/v1/admin/roles` (`AdminDashboardController.cs:275-276`) | Policy `SuperAdmin` | FE: `roles-center.test.tsx` · BE: `UiPermissionsHttpIntegrationTests.cs`, `UiPermissionsPostgresIntegrationTests.cs` (Postgres-gated) | ✅ |
| Create role «دور جديد» | `App.tsx:558-573` (`submitRole`) | `POST /api/v1/admin/roles` (`AdminDashboardController.cs:283-284`) | Policy `SuperAdmin`; handler validates name/normalization, forbids reserved system role names (`AdminHandlers.cs:939-944`) | FE: `roles-center.test.tsx` · BE: `SettingsStudioHttpTests.cs` (role-adjacent authz) | ✅ |
| Role status toggle | `App.tsx:575-588` (`setRoleStatus`, ConfirmDialog gated) | `POST /api/v1/admin/roles/{id}/status` (`AdminDashboardController.cs:294-295`) | Policy `SuperAdmin` | FE: `roles-center.test.tsx` · BE: role-status path covered indirectly via `UiPermissionsHttpIntegrationTests.cs` | ✅ |
| Delete role «حذف» + conflict banner | `App.tsx:590-610` (`deleteRole`) | `DELETE /api/v1/admin/roles/{id}` (`AdminDashboardController.cs:305-306`) | Policy `SuperAdmin`; backend refuses with `ROLE_HAS_ADMINS` (live admin count), `SYSTEM_ROLE_DELETE_FORBIDDEN` for system roles — inline banner renders the mapped codes (`App.tsx:600-606`) | FE: `roles-center.test.tsx` (RoleDeleteConflictBanner) | ✅ |
| Permission matrix view | `PermissionMatrixEditor.tsx:86` | `GET /api/v1/admin/roles/{id}/permissions` (`AdminDashboardController.cs:265-266`) | Policy `SuperAdmin` | FE: `ui-permissions.test.ts` (registry) · BE: `PermissionServiceIntegrationTests.cs` | ✅ |
| Permission matrix save | `PermissionMatrixEditor.tsx:139` (PUT) | `PUT /api/v1/admin/roles/{id}/permissions` (`AdminDashboardController.cs:252-253`) | Policy `RoleEdit` (`PermissionAuthorization.cs:217`) + handler super-check, strict resource/action/scope validation (`AdminHandlers.cs:402-433`), access cache invalidation for every assigned admin | FE: `roles-center.test.tsx` · BE: `PermissionServiceIntegrationTests.cs` | ✅ |
| UI-permission registry view/save/clear | `UiPermissionsEditor.tsx` → `lib/api.ts:314-329` | `GET /api/v1/admin/roles/{id}/ui-permissions` (`AdminDashboardController.cs:319-320`, SuperAdmin) · `PUT …/ui-permissions` (:328-329, RoleEdit) · `DELETE …/ui-permissions` (:339-340, RoleEdit) | as listed per row | FE: `ui-permissions.test.ts` · BE: `UiPermissionsHttpIntegrationTests.cs`, `UiPermissionsPostgresIntegrationTests.cs`, `Unit/Handlers/UiPermissionHandlerTests.cs` | ✅ |

---

## 4. Audit `/audit` («سجل التدقيق / Audit log»)

Render gate: `isSuperAdmin && can('view:audit')` (`App.tsx:1028`); nav superOnly (`App.tsx:735`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Critical-alerts table | `AuditCenter.tsx:168` | `GET /api/v1/security/alerts?count=100` (`SecurityController.cs:77`) | Controller `[Authorize(Roles="admin,super_admin")]` (`SecurityController.cs:19`) | FE: `audit-log-viewer.test.tsx` · BE: `SecurityAuditPostgresIntegrationTests.cs` | ✅ |
| Audit-log table (server filters + pagination) | `AuditLogViewer.tsx:181` (template query) | `GET /api/v1/security/audit-logs?{page,pageSize,studentId,eventType,severity,from,to,search}` (`SecurityController.cs:109`) | roles admin,super_admin (class) | FE: `audit-log-viewer.test.tsx` · BE: `SecurityAuditPostgresIntegrationTests.cs`, `AdminEndpointsIntegrationTests.cs:253-261` | ✅ |
| Severity count chips | `AuditCenter.tsx:186-194` | same endpoint, `severity=` + `pageSize=1` probes | roles admin,super_admin | FE: `audit-log-viewer.test.tsx` | ✅ |
| Row detail drawer (redaction notice) | `AuditCenter` row → local rendering only | — (data already fetched; fixed redaction notice) | n/a | FE: `audit-log-viewer.test.tsx` | n/a |

---

## 5. Security `/security` («الأمن / Security») — PR-6

Render gate: `isSuperAdmin && can('view:audit')` — rides the audit view key, no new registry key (`App.tsx:1036-1038`, nav `App.tsx:738`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Metric strip + indicators «ملخص الأمن» | `SecurityCenter.tsx` → `fetchSecuritySummary` (`lib/api.ts:629-631`) | `GET /api/v1/security/summary` (`SecurityController.cs:181`) | roles admin,super_admin (class) **+ inline `HasPermissionAsync(Logs.View)`** (`SecurityController.cs:186-190`) | FE: `security-center.test.tsx` · BE: `SecurityAuditPostgresIntegrationTests.cs` (writer side), `Unit/Services/SecurityServiceAuditTests.cs` | ✅ |
| Full event table (contract G) | `SecurityCenter.tsx` → `fetchSecurityEvents` (`lib/api.ts:634-646`) | `GET /api/v1/security/audit-logs?…` (shared with §4) + server-side filters | roles admin,super_admin | FE: `security-center.test.tsx`, `audit-log-viewer.test.tsx` · BE: `SecurityAuditPostgresIntegrationTests.cs` | ✅ |
| Per-student pre-filter deep link `?student=<id>` | Students drawer link → `useQueryState` (`SecurityCenter.tsx:27`) | same endpoint with `studentId=` filter | roles admin,super_admin | FE: `security-center.test.tsx` (deep-link case), `students-center.test.tsx` | ✅ |
| Event-type vocabulary dropdown | `SecurityCenter.tsx` (local glossary `lib/securityEventLabels.ts`) | — (rendering only) | n/a | FE: `security-center.test.tsx` | n/a |

---

## 6. Servers `/servers` («الخوادم / Servers») — PR-9, read-only

Render gate: `isSuperAdmin && can('view:audit')` (`App.tsx:1042-1044`, nav `App.tsx:741`). Backend: `AdminServersController.cs:35-37` stacks **two** `[Authorize]` attributes — `Policies.ServersView` AND `Policy="SuperAdmin"` (AND semantics; rationale in `PermissionAuthorization.cs:156-163`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Summary (overall + 4 provider heads) | `ServersCenter.tsx` → `fetchServersSummary` (`lib/api.ts:924-927`) | `GET /api/v1/admin/servers/summary[?fresh=true]` (`AdminServersController.cs:56`) | `ServersView` + `SuperAdmin` (both, controller-level) | FE: `servers-center.test.tsx` · BE: `ServersDashboardHttpTests.cs:53-146`, `Unit/Services/Monitoring/ServersMonitorServiceTests.cs` | ✅ |
| Render provider panel | `fetchServersProvider('render')` (`lib/api.ts:934-941`) | `GET /api/v1/admin/servers/render` (`AdminServersController.cs:62`) | same stacked policies | FE: `servers-center.test.tsx` · BE: `ServersDashboardHttpTests.cs:119-134`, `Unit/Services/Monitoring/RenderMonitorTests.cs` | ✅ |
| Vercel provider panel | `fetchServersProvider('vercel')` | `GET /api/v1/admin/servers/vercel` (:68) | same | FE: `servers-center.test.tsx` · BE: `ServersDashboardHttpTests.cs` (mocked envelopes :289+), `Unit/Services/Monitoring/VercelMonitorTests.cs` | ✅ |
| Neon provider panel | `fetchServersProvider('neon')` | `GET /api/v1/admin/servers/neon` (:74) | same | FE: `servers-center.test.tsx` · BE: `ServersDashboardHttpTests.cs` (no-connection-material case :309+), `Unit/Services/Monitoring/NeonMonitorTests.cs` | ✅ |
| GitHub provider panel | `fetchServersProvider('github')` | `GET /api/v1/admin/servers/github` (:80) | same | FE: `servers-center.test.tsx` · BE: `ServersDashboardHttpTests.cs` (workflows wire shape :310+), `Unit/Services/Monitoring/GithubMonitorTests.cs` | ✅ |
| Check history (expand) | `fetchServersHistory` (`lib/api.ts:944-946`) | `GET /api/v1/admin/servers/{provider}/history` (:90) | same stacked policies; unknown provider → 404 ProblemDetails | FE: `servers-center.test.tsx` · BE: `ServersDashboardHttpTests.cs:146-189` | ✅ |
| Manual refresh (fresh=true) | `ServersCenter.tsx` refresh control | same endpoints + `?fresh=true` (bypasses the 60s cache read) | same | FE: `servers-center.test.tsx` · BE: `ServersDashboardHttpTests.cs:135-146` | ✅ |
| External link (commit / repo) | `ServersCenter.tsx` (rendered `ExternalLink` anchors) | — (browser navigation; no API surface) | n/a | FE: `servers-center.test.tsx` | n/a |

No deploy/restart/env-var/billing/SQL control exists anywhere in the component — read-only by design (`ServersCenter.tsx:14-17`).

---

## 7. Academic `/academic` («البنية الأكاديمية / Academic structure») — includes the Courses tab

Render gate: `can('view:academic')` (`App.tsx:962`); nav non-superOnly (`App.tsx:715`).

Read rows (all anonymous unless noted; write rows below are `[Authorize(Roles="admin,super_admin")]` — `AcademicController.cs:65…`, with admin-side lecture list under roles admin,super_admin `AdminContentController.cs:16`):

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Browse tree (includeArchived toggle) | `AcademicCenter.tsx:115-135` | cascade reads + `GET /api/v1/admin/content/academic/subjects/{id}/lectures?includeArchived=` | read endpoints as per Legend | FE: `academicContext.test.tsx` | ✅ |
| Create university/college/year/semester/subject/lecture «إضافة» | `AcademicCenter.tsx:223-256` | `POST /api/v1/universities` (:64-65) · `POST /api/v1/colleges` (:124-125) · `POST /api/v1/years` (:164-165) · `POST /api/v1/semesters` (:194-195) · `POST /api/v1/subjects` (:252-253) · `POST /api/v1/lectures` (:347-348) | `[Authorize(Roles="admin,super_admin")]` each | FE: `academicContext.test.tsx` · BE: `CoursesPostgresIntegrationTests.cs` (related admin content), `Unit/Handlers/CourseHandlersTests.cs` | ✅ |
| Archive/restore node «أرشفة/استعادة» | `AcademicCenter.tsx:189` | `POST /api/v1/academic/{entityType}/{id}/archive` / `…/restore` (:90-101) | roles admin,super_admin | FE: `academicContext.test.tsx` · BE: `Unit/Handlers/CourseLifecycleAdminHandlerTests.cs` (course archive family) | ✅ |
| Publish lecture «نشر» | `AcademicCenter.tsx:204` | `POST /api/v1/lectures/{id}/publish` (:363-364) | roles admin,super_admin | FE: `academicContext.test.tsx` | ✅ |
| Courses tab — full course + episode management | `CoursesCenter.tsx` (list :170, create :193, edit :216, lifecycle :236, delete :256, detail :824, YouTube episode :844, episode delete :867, multipart initiate/complete/abort :1278/:1215/:1331, abort-processing :1413) | `GET/POST/PUT/DELETE /api/v1/admin/courses…`, `POST /api/v1/admin/courses/{id}/{publish|archive|unpublish|duplicate|restore}`, `GET /{id}/usage`, `POST {courseId}/episodes/youtube`, `PUT/DELETE episodes/{id}`, `POST {courseId}/episodes/initiate-upload`, `GET episodes/{id}/multipart-status`, `POST episodes/{id}/complete-upload`, `POST episodes/{id}/abort-upload`, `POST episodes/{id}/abort-processing` (`AdminCoursesController.cs:25-374`, class roles admin,super_admin :26) | roles admin,super_admin (class) | FE: `courses-center.test.tsx`, `courses-center-confirm.test.tsx`, `courses-lifecycle-admin.test.tsx`, `mediaProcessing.test.ts`, `mediaType.test.ts` · BE: `CoursesPostgresIntegrationTests.cs`, `Unit/Handlers/CourseHandlersTests.cs`, `Unit/Handlers/CourseLifecycleAdminHandlerTests.cs`, `Unit/Constants/MediaPolicyTests.cs` | ✅ |
| Episode edit modal | `EpisodeEditModal.tsx:68` | `PUT /api/v1/admin/courses/episodes/{id}` (`AdminCoursesController.cs:242`) | roles admin,super_admin | FE: `courses-center.test.tsx` | ✅ |
| Processing timeline / error modal | `ProcessingTimeline.tsx`, `ProcessingErrorModal.tsx` (poll status from course detail) | course detail endpoints (above) | roles admin,super_admin | FE: `mediaProcessing.test.ts` | ✅ |

---

## 8. Codes `/codes` («رموز التفعيل / Activation codes»)

Render gate: `can('view:codes')` (`App.tsx:977`); nav non-superOnly (`App.tsx:726`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Codes list + filters | `CodesCenter.tsx:145` | `GET /api/v1/admin/codes?{params}` (`AdminDashboardController.cs:372-373`) | Policy `CodeView` | FE: `codes-center-bulk-revoke.test.tsx` · BE: `NightTask5ActivationCodesTests.cs` | ✅ |
| Cascade filters | `CodesCenter.tsx:151-200` | cascade | as per Legend | FE: `codes-center-bulk-revoke.test.tsx` | ✅ |
| Generate codes «توليد» | `CodesCenter.tsx:218` | `POST /api/v1/admin/codes/generate` (`AdminDashboardController.cs:387-388`) | Policy `CodeCreate` | FE: `codes-center-bulk-revoke.test.tsx` · BE: `NightTask5ActivationCodesTests.cs` | ✅ |
| Revoke single code «إبطال» | `CodesCenter.tsx:229` | `POST /api/v1/admin/codes/{id}/revoke` (:359-360) | Policy `CodeEdit` (reason required) | FE: `codes-center-bulk-revoke.test.tsx` · BE: `NightTask5ActivationCodesTests.cs` | ✅ |
| Bulk revoke (explicit danger confirm) | `CodesCenter.tsx:265` | same revoke endpoint per code | Policy `CodeEdit` | FE: `codes-center-bulk-revoke.test.tsx` | ✅ |
| Activate code for student «تفعيل يدوي» | `CodesCenter.tsx:298` | `POST /api/v1/admin/codes/{codeId}/activate` (:406-407) | Policy `CodeEdit` | FE: `codes-center-bulk-revoke.test.tsx` · BE: `NightTask5ActivationCodesTests.cs` | ✅ |
| Redemptions ledger «سجل الاستبدال» | `CodesCenter.tsx:312` | `GET /api/v1/admin/codes/{codeId}/redemptions` (:517-518) | Policy `CodeView` | FE: `codes-center-bulk-revoke.test.tsx` | ✅ |
| Student quick search (activation target) | `CodesCenter.tsx:289` | `GET /api/v1/admin/students?page=1&pageSize=10&search=…` (`AdminDashboardController.cs:109-110`) | Policy `StudentView` | FE: `codes-center-bulk-revoke.test.tsx` | ✅ |

---

## 9. Students `/students` («الطلاب / Students») — PR-6 Student Center

Render gate: `can('view:students')` (`App.tsx:959`); nav non-superOnly (`App.tsx:725`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| List + filters + pagination | `StudentsCenter.tsx:348` | `GET /api/v1/admin/students?{params}` (`AdminDashboardController.cs:109-110`) | Policy `StudentView` | FE: `students-center.test.tsx` · BE: `StudentSecurityCenterHttpTests.cs` (drawer family) | ✅ |
| Create student «إضافة طالب» | `StudentsCenter.tsx:842` | `POST /api/v1/admin/students` (`AdminStudentsController.cs:224-225`) | class roles admin,super_admin (:23) + inline `HasPermissionAsync(Students,Create)` (:228) + university scope check (:250) | FE: `students-center.test.tsx` | ✅ |
| Edit profile «تعديل» | `StudentsCenter.tsx:745` | `PUT /api/v1/admin/students/{id}` (`AdminStudentsController.cs:67-72`) | roles admin,super_admin + `HasPermissionAsync(Students,Edit)` **+ `IsInScopeAsync`** | FE: `students-center.test.tsx` · BE: `AdminEndpointsIntegrationTests.cs:91-100` | ✅ |
| Upload avatar «صورة» | `StudentsCenter.tsx:768` | `POST /api/v1/admin/students/{id}/avatar` (:116-124) | Students.Edit + scope; **3MB cap + jpeg/png/webp allowlist** (:33-37, :129-143) | FE: `students-center.test.tsx` | ✅ |
| Reset password «إعادة تعيين كلمة المرور» (typed phone confirm + actor password) | `StudentsCenter.tsx:2616-2736` dialog → `resetStudentPassword` (`lib/api.ts:598-600`) | `POST /api/v1/admin/students/{id}/password-reset` (:319-322) | `Policies.StudentEdit` + `IsInScopeAsync` (:325) + **`[EnableRateLimiting("danger-zone")]`** (:321) + handler **actor Argon2 re-auth** (`DashboardHandlers.cs:343-344`) + password policy + hash swap + must-change flag (:349-352) + **all student sessions revoked** (:355) + audit (:357-363) | FE: `students-center.test.tsx` (contract A cases) · BE: `StudentSecurityCenterHttpTests.cs:45-124` | ✅ |
| Archive «أرشفة» / Restore «استعادة» | `StudentsCenter.tsx` row actions → `archiveStudent`/`restoreStudent` (`lib/api.ts:606-612`) | `POST /api/v1/admin/students/{id}/archive` (:347-348) · `POST /{id}/restore` (:371-372) | `Policies.StudentEdit` + `IsInScopeAsync`; archive = tombstone (`student.Archive()`, sessions revoked) + Warning audit; restore idempotent (`DashboardHandlers.cs:372-420`) | FE: `students-center.test.tsx` (contract D cases) · BE: `StudentSecurityCenterHttpTests.cs:204-264` (full lifecycle) | ✅ |
| Ban «حظر» (reason + expiry) | `StudentsCenter.tsx:674` | `POST /api/v1/admin/students/{id}/ban` (`AdminDashboardController.cs:123-124`) | Policy `StudentEdit` + scoped permission (`DashboardHandlers.cs:304-315`) | FE: `students-center.test.tsx` · BE: `StudentSecurityCenterHttpTests.cs` | ✅ |
| Unban «رفع الحظر» | `StudentsCenter.tsx:705` | `POST /api/v1/admin/students/{id}/unban` (:136-137) | Policy `StudentEdit` + scope | FE: `students-center.test.tsx` | ✅ |
| Revoke all sessions «إنهاء الجلسات» | `StudentsCenter.tsx:684` | `POST /api/v1/admin/students/{id}/revoke-sessions` (:149-150) | Policy `StudentEdit` + scope | FE: `students-center.test.tsx` · BE: `Unit/Handlers/SessionRevocationHandlerTests.cs` | ✅ |
| Unbind device «فك ارتباط الجهاز» | `StudentsCenter.tsx:688` | `POST /api/v1/security/students/{id}/unbind-device` (`SecurityController.cs:262`) | roles admin,super_admin (class) | FE: `students-center.test.tsx` | ✅ |
| Drawer — overview detail (contract B) | `fetchStudentDetail` (`lib/api.ts:593-595`) | `GET /api/v1/admin/students/{id}` (`AdminStudentsController.cs:291-297`) | `Policies.StudentView` + `IsInScopeAsync` (:296) | FE: `students-center.test.tsx` · BE: `StudentSecurityCenterHttpTests.cs:124-204` | ✅ |
| Drawer — activity feed | `fetchStudentActivity` (`lib/api.ts:616-625`) | `GET /api/v1/admin/students/{id}/activity` (:397-398) | `Policies.LogView` | FE: `students-center.test.tsx` · BE: `StudentSecurityCenterHttpTests.cs:272-346` | ✅ |
| Drawer — security log «كل الأحداث الأمنية للطالب» | `StudentsCenter.tsx:412` | `GET /api/v1/security/students/{id}/logs?count=50` (`SecurityController.cs:38`) | roles admin,super_admin (class) | FE: `students-center.test.tsx` · BE: `SecurityAuditPostgresIntegrationTests.cs` | ✅ |
| Drawer — sessions tab + revoke single | `StudentsCenter.tsx:422, 454` | `GET /api/v1/security/students/{id}/sessions` (:277) · `POST /api/v1/security/students/{id}/sessions/{sessionId}/revoke` (:321) | roles admin,super_admin (class) | FE: `students-center.test.tsx` | ✅ |
| Drawer — exam sessions / subscriptions / reports / progress tabs | `StudentsCenter.tsx:427-442` | `GET /api/v1/admin/students/{id}/exam-sessions` (:488) · `GET …/subscriptions` (:521) · `GET …/reports` (:551) · `GET …/progress` (:581) | class roles admin,super_admin (`AdminStudentsController.cs:23`) | FE: `students-center.test.tsx` | ✅ |
| Revoke subscription «إبطال الاشتراك» | `StudentsCenter.tsx:641` | `POST /api/v1/admin/subscriptions/{id}/revoke` (`AdminDashboardController.cs:350-351`) | Policy `CodeEdit` | FE: `students-center.test.tsx` | ✅ |
| Deep link `?student=<id>` opens drawer | `StudentsCenter.tsx` (URL state) | same detail endpoint | as above | FE: `students-center.test.tsx` (deep-link case) | ✅ |
| Link to Security Center filtered | drawer link → `navigate('/security?student=…')` | client navigation (target view re-gates) | n/a | FE: `students-center.test.tsx` | n/a |

---

## 10. Questions `/questions` («بنك الأسئلة / Question bank»)

Render gate: `can('view:questions')` (`App.tsx:965`); nav non-superOnly (`App.tsx:716`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| List + URL-persisted filters + real pages | `QuestionsCenter.tsx:445` | `GET /api/v1/admin/questions?{params}` (`AdminQuestionsController.cs:93` policy `QuestionView`, class roles :80) | `Policies.QuestionView` | FE: `questions-center-pr4.test.tsx`, `questions-center-pager.test.tsx` · BE: `AdminQuestionsBankPR4Tests.cs` | ✅ |
| Facet directory (authors/tags) | `QuestionsCenter.tsx:405, 831` | `GET /api/v1/admin/questions/facets?subjectId=` (:210-211) | `Policies.QuestionView` | FE: `questions-center-pr4.test.tsx` · BE: `AdminQuestionsBankPR4Tests.cs` | ✅ |
| Question detail | `QuestionsCenter.tsx:573` | `GET /api/v1/admin/questions/{id}` (:360-361) | `Policies.QuestionView` | FE: `questions-center-pr4.test.tsx` · BE: `AdminQuestionsBankPR4Tests.cs` | ✅ |
| Create / edit (all types incl. Matching) | `QuestionsCenter.tsx:689-693` | `POST /api/v1/questions` (`QuestionsController.cs:291-292`) · `PUT /api/v1/questions/{id}` (:237-238) | roles admin,super_admin | FE: `questions-center-matching.test.tsx`, `matching-editor.test.ts`, `matching-rules-night7.test.ts` · BE: `Unit/Handlers/MatchingW205Tests.cs`, `Unit/Handlers/QuestionBankW162Tests.cs` | ✅ |
| Publish / unpublish / archive «نشر/إلغاء/أرشفة» | `QuestionsCenter.tsx:718-721` | `POST /api/v1/questions/{id}/publish` (:267-268) · `POST /api/v1/admin/questions/{id}/unpublish` (`AdminQuestionsController.cs:537-538`) · `POST /api/v1/questions/{id}/archive` (:279-280) | roles admin,super_admin (QuestionsController) / `Policies.QuestionEdit` (AdminQuestionsController unpublish) | FE: `questions-center-pr4.test.tsx` · BE: `Unit/Handlers/QuestionBankW162Tests.cs` | ✅ |
| Delete (soft) «حذف» | `QuestionsCenter.tsx:735` | `DELETE /api/v1/questions/{id}` (:255-256) | roles admin,super_admin | FE: `questions-center-pr4.test.tsx` | ✅ |
| Duplicate «تكرار» | `QuestionsCenter.tsx:765` | `POST /api/v1/admin/questions/{id}/duplicate` (`AdminQuestionsController.cs:494-495`) | `Policies.QuestionCreate` | FE: `questions-center-pr4.test.tsx` | ✅ |
| Universal student-view preview «معاينة الطالب» | `QuestionsCenter.tsx:755` → `preview/UniversalPreviewDialog` | `GET /api/v1/admin/questions/{id}/preview` (:558-559) | `Policies.QuestionView` | FE: `universal-preview.test.tsx`, `questions-center-pr4.test.tsx` · BE: `AdminQuestionsBankPR4Tests.cs` | ✅ |
| Import CSV «استيراد» | `QuestionImportModal.tsx:284` | `POST /api/v1/questions/import` (`QuestionsController.cs:291-292`) | roles admin,super_admin | FE: `question-import-modal.test.tsx` · BE: `Unit/Handlers/QuestionImportW223Tests.cs` | ✅ |
| Bulk publish / bulk archive / bulk tag | `QuestionsCenter.tsx:786, 818` | `POST /api/v1/admin/questions/bulk-publish` (:612-613) · `POST …/bulk-archive` (:637-638) · `POST …/bulk-tag` (:323-324) | `Policies.QuestionEdit` | FE: `questions-center-pr4.test.tsx` · BE: `AdminQuestionsBankPR4Tests.cs` | ✅ |
| Export «تصدير» | export control in center | `GET /api/v1/admin/questions/export` (:256-257) | `Policies.QuestionExport` | FE: `questions-center-pr4.test.tsx` · BE: `Unit/QuestionCsvWriterPR4Tests.cs` | ✅ |
| Question reports moderation | `ExamsCenter.tsx:643-654` (also surfaces here via bank) | `GET /api/v1/admin/questions/reports` (:380-381) · `PUT /api/v1/admin/questions/reports/{id}/{resolve|reject}` (:443-459) | `Policies.QuestionView` (list) / `Policies.QuestionEdit` (resolve/reject) | FE: `questions-center-pr4.test.tsx` · BE: `Unit/Handlers/QuestionReportW14Tests.cs` | ✅ |
| Image upload for question | `QuestionsCenter.tsx:912-928` | `POST /api/v1/library/upload-url` + `POST /api/v1/library/complete-upload` (`LibraryController.cs:430-450`) | roles admin,super_admin | FE: `questions-center-pr4.test.tsx` | ✅ |
| Hard delete «حذف نهائي» (dialog) | `HardDeleteDialog` from `QuestionsCenter.tsx:2555` | `POST /api/v1/admin/system/hard-delete` (`AdminSystemController.cs:57`) | Policy `SuperAdmin` + danger-zone rate limit + actor re-auth + `Features:HardDeleteEnabled` fail-closed flag | FE: `danger-zone-hard-delete.test.tsx` · BE: `Unit/Handlers/SystemMaintenanceHandlersTests.cs`, `Unit/Controllers/AdminSystemControllerContractTests.cs` | ✅ |

---

## 11. Exams `/exams` («الاختبارات / Exams»)

Render gate: `can('view:exams')` (`App.tsx:968`); nav non-superOnly (`App.tsx:717`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| List + cascade filters | `ExamsCenter.tsx:452` | `GET /api/v1/admin/exams?{params}` (`AdminExamsController.cs:38, 52-53`) | class roles admin,super_admin (:23) + `Policies.ExamView` | FE: `exams-center-results-pager.test.tsx`, `exams-question-labels.test.tsx` · BE: `Unit/Handlers/ExamLifecycleAdminHandlerTests.cs` | ✅ |
| Question candidates picker | `ExamsCenter.tsx:467` | `GET /api/v1/admin/exams/question-candidates?{params}` (:62-63) | `Policies.ExamManageQuestions` | FE: `exams-question-labels.test.tsx` | ✅ |
| Exam detail | `ExamsCenter.tsx:491` | `GET /api/v1/admin/exams/{id}` (:52-53) | `Policies.ExamView` | FE: `exams-lifecycle-admin.test.tsx` | ✅ |
| Create / edit | `ExamsCenter.tsx:548-549` | `POST /api/v1/admin/exams` (:79) · `PUT /api/v1/admin/exams/{id}` (:89-90) | `Policies.ExamCreate` / `Policies.ExamEdit` | FE: `exams-lifecycle-admin.test.tsx` · BE: `Unit/Handlers/ExamLifecycleAdminHandlerTests.cs` | ✅ |
| Attach question set | `ExamsCenter.tsx:552` | `PUT /api/v1/admin/exams/{id}/questions` (:99-100) | `Policies.ExamManageQuestions` | FE: `exams-lifecycle-admin.test.tsx` | ✅ |
| Publish / unpublish / archive / duplicate / restore | `ExamsCenter.tsx:582, 601` | `POST /api/v1/admin/exams/{id}/{publish|unpublish|archive|duplicate|restore}` (:109-185) | `ExamPublish` / `ExamEdit` / `ExamArchive` / `ExamCreate` / `ExamEdit` policies respectively | FE: `exams-lifecycle-admin.test.tsx`, `exams-preview-unpublish.test.tsx` · BE: `Unit/Handlers/ExamLifecycleAdminHandlerTests.cs` | ✅ |
| Delete (lifecycle) | `ExamsCenter.tsx:601` (DELETE path) | `DELETE /api/v1/admin/exams/{id}` (:131-132) | `Policies.ExamDelete` | FE: `exams-lifecycle-admin.test.tsx` | ✅ |
| Results pager + statuses | `ExamsCenter.tsx:612` | `GET /api/v1/admin/exams/{id}/results` (:142-143) | `Policies.ExamReadResults` | FE: `exams-center-results-pager.test.tsx` · BE: `Unit/Handlers/ExamResultsV2W144Tests.cs` | ✅ |
| Stats + question stats | `ExamsCenter.tsx:625-626` | `GET /{id}/stats` (:281-282) · `GET /{id}/question-stats` (:291-292) | `Policies.ExamReadResults` | FE: `exams-center-results-pager.test.tsx` | ✅ |
| Pre-flight composition validation | `ExamsCenter.tsx:571` | `GET /api/v1/admin/exams/{id}/composition-validation` (:197-198) | `Policies.ExamView` | FE: `exams-lifecycle-admin.test.tsx` | ✅ |
| Student-view preview «معاينة» | `ExamsCenter.tsx:332` | `GET /api/v1/admin/exams/{id}/preview` (:219-220) | `Policies.ExamView` | FE: `exams-preview-unpublish.test.tsx`, `universal-preview.test.tsx` | ✅ |
| Question reorder | `ExamsCenter.tsx` (order controls) | `PUT /api/v1/admin/exams/{id}/reorder` (:208-209) | `Policies.ExamManageQuestions` | FE: `exams-lifecycle-admin.test.tsx` | ✅ |
| Hard delete «حذف نهائي» | `HardDeleteDialog` from `ExamsCenter.tsx:2385` | `POST /api/v1/admin/system/hard-delete` (`AdminSystemController.cs:57`) | as §10 hard-delete row | FE: `danger-zone-hard-delete.test.tsx` · BE: `Unit/Handlers/SystemMaintenanceHandlersTests.cs` | ✅ |

---

## 12. Exam-courses `/exam-courses` («مساقات الاختبارات / Exam courses»)

Render gate: `can('view:exams')` — rides the exams registry key via `gateKey` (`App.tsx:971`, nav `App.tsx:718`); backend reuses exam verbs (`AdminExamCoursesController.cs:18-19`, `PermissionAuthorization.cs:112-117`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Bundles list by subject | `ExamCoursesCenter.tsx:277` | `GET /api/v1/admin/exam-courses?subjectId=` (`AdminExamCoursesController.cs:49`) | class roles admin,super_admin (:19) + `Policies.ExamCourseView` | FE: `exams-lifecycle-admin.test.tsx` (lifecycle family) · BE: `Unit/Handlers/ExamCourseHandlersTests.cs` | ✅ |
| Bundle detail / preview | `:368, :379` | `GET /api/v1/admin/exam-courses/{id}` (:65-66) | `Policies.ExamCourseView` | FE: `universal-preview.test.tsx` · BE: `Unit/Handlers/ExamCourseHandlersTests.cs` | ✅ |
| Create / edit | `:323, :311` | `POST /api/v1/admin/exam-courses` (:34) · `PUT /{id}` (:74-75) | `Policies.ExamCourseCreate` / `ExamCourseEdit` | FE: `exams-lifecycle-admin.test.tsx` · BE: `Unit/Handlers/ExamCourseHandlersTests.cs` | ✅ |
| Publish / archive | `:344` | `POST /{id}/publish` (:86-87) · `POST /{id}/archive` (:95-96) | `Policies.ExamCourseEdit` | FE: `exams-lifecycle-admin.test.tsx` | ✅ |
| Delete | `:357` | `DELETE /api/v1/admin/exam-courses/{id}` (:104-105) | `Policies.ExamCourseDelete` | FE: `exams-lifecycle-admin.test.tsx` | ✅ |
| Attach / remove exams in bundle | `:390, :406` | `POST /{id}/exams` (:113-114) · `DELETE /{id}/exams/{examId}` (:121-122) | `Policies.ExamCourseEdit` | FE: `exams-lifecycle-admin.test.tsx` · BE: `Unit/Handlers/ExamCourseHandlersTests.cs` | ✅ |
| Reorder exams in bundle | `:424` | `PUT /{id}/reorder` (:130-131) | `Policies.ExamCourseEdit` | FE: `exams-lifecycle-admin.test.tsx` | ✅ |
| Cover upload | `:448-459` | `POST /api/v1/library/upload-url` + `POST /api/v1/library/complete-upload` | roles admin,super_admin | FE: `library-center-lifecycle.test.tsx` (shared upload contract) | ✅ |
| Hard delete «حذف نهائي» | `HardDeleteDialog` | `POST /api/v1/admin/system/hard-delete` (module `exam-course`) | as §10 | FE: `danger-zone-hard-delete.test.tsx` · BE: `Unit/Handlers/SystemMaintenanceHandlersTests.cs` | ✅ |

---

## 13. Library `/library` («المكتبة / Library»)

Render gate: `can('view:library')` (`App.tsx:974`); nav non-superOnly (`App.tsx:719`). Retention lifecycle = PR-5 B2.

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Files list (admin view, filters+pager) | `LibraryCenter.tsx:453` | `GET /api/v1/admin/content/files?{params}` (`AdminContentController.cs:79`, class roles admin,super_admin :16) | roles admin,super_admin | FE: `library-center-lifecycle.test.tsx`, `library-retention.test.tsx` · BE: `LibraryAuditPostgresIntegrationTests.cs` | ✅ |
| Cascade + lectures | `:386-432` | cascade + `GET /api/v1/admin/content/academic/subjects/{subjectId}/lectures` | as per Legend | FE: `library-center-lifecycle.test.tsx` | ✅ |
| Upload (presign → PUT object → complete) | `:621-653` | `POST /api/v1/library/upload-url` (`LibraryController.cs:430-431`) · `POST /api/v1/library/complete-upload` (:449-450) | roles admin,super_admin | FE: `library-center-lifecycle.test.tsx` · BE: `Unit/Services/B2PresignedUrlServiceTests.cs`, `Unit/Services/UpstashBlobStorageServiceTests.cs`, `Integration/FileScannerSafetyTests.cs` | ✅ |
| Edit metadata «تعديل البيانات» | `:746` | `PUT /api/v1/library/{id}` (:472-473) | roles admin,super_admin | FE: `library-edit-metadata.test.tsx` | ✅ |
| Publish «نشر» | `:704` | `POST /api/v1/library/{id}/publish` (:485-486) | roles admin,super_admin + publish gate `VirusScanStatus == Clean` (`LibraryHandlers.cs:195`) | FE: `library-center-lifecycle.test.tsx` · BE: `LibraryAuditPostgresIntegrationTests.cs` | ✅ |
| Archive «أرشفة» | `:718` | `POST /api/v1/library/{id}/archive` (:496-497) | roles admin,super_admin | FE: `library-retention.test.tsx` | ✅ |
| Delete (tombstone only) «حذف» | `:771` | `DELETE /api/v1/library/{id}` (:507-508) | roles admin,super_admin; **`DeleteLibraryFileCommand` = `file.Tombstone()` — object never touched** (`LibraryHandlers.cs:606-631`) | FE: `library-retention.test.tsx` · BE: `Unit/Handlers/LibraryRetentionLifecycleHandlerTests.cs`, `LibraryAuditPostgresIntegrationTests.cs` | ✅ |
| Quarantine «عزل» | `:796` | `POST /api/v1/library/{id}/quarantine` (:524-525) | roles admin,super_admin | FE: `library-retention.test.tsx` · BE: `Unit/Handlers/LibraryRetentionLifecycleHandlerTests.cs` | ✅ |
| Restore (tombstone/quarantine lift) «استعادة» | `:817` | `POST /api/v1/library/{id}/restore` (:538-539) | roles admin,super_admin | FE: `library-retention.test.tsx` · BE: `Unit/Handlers/LibraryRetentionLifecycleHandlerTests.cs` | ✅ |
| Purge — final physical deletion «حذف نهائي» | `:839` | `POST /api/v1/library/{id}/purge` (:553-554) | **`[Authorize(Roles="super_admin")]`** + handler chain: `Features:HardDeleteEnabled` fail-closed → SuperAdmin actor → **actor password re-auth** → retention-state gate → retention window → intent + executed Critical audits → one transaction (`LibraryRetentionHandlers.cs:98-209`) | FE: `library-retention.test.tsx` · BE: `Unit/Handlers/LibraryRetentionLifecycleHandlerTests.cs` | ✅ |
| Hard delete (module `library-file`) | `HardDeleteDialog` from `LibraryCenter.tsx:2245` | `POST /api/v1/admin/system/hard-delete` | as §10 | FE: `danger-zone-hard-delete.test.tsx` · BE: `Unit/Handlers/SystemMaintenanceHandlersTests.cs` | ✅ |
| Courses tab (video courses) | `LibraryCenter.tsx:1376` renders `CoursesCenter` | see §7 courses rows | see §7 | FE: `courses-center*.test.tsx` | ✅ |

---

## 14. Reports `/reports` («التقارير / Reports»)

Render gate: `isSuperAdmin && can('view:reports')` (`App.tsx:1045`); nav superOnly (`App.tsx:732`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Overview tab (global stats, revenue, growth) | `ReportsTabs.tsx:187-189` | `GET /api/v1/stats/global?{params}` (`StatsController.cs:50-51`) · `GET /api/v1/admin/revenue?months=6` (`AdminDashboardController.cs:75-76`) · `GET /api/v1/admin/student-growth?days=30` (:83-84) | stats/global roles admin,super_admin; revenue/growth Policy `SuperAdmin` | FE: `reports-assign.test.tsx` (surface family) · BE: `AdminEndpointsIntegrationTests.cs:129-177` (all analytics tabs) | ✅ |
| Students / Academic / Exams / Questions / Content / Codes / Operations analytics tabs | `ReportsTabs.tsx:248-566` | `GET /api/v1/admin/analytics/{students|academic|exams|questions|content|codes|operations}` (`AdminAnalyticsController.cs:41-353`) | Policy `SuperAdmin` (class, :18) | FE: surface renders in `ReportsTabs` used by `reports-assign.test.tsx` · BE: `AdminEndpointsIntegrationTests.cs:129-247` (per-tab + response shapes) | ✅ |
| Reports moderation list + status filter | `ReportsModeration.tsx:138` | `GET /api/v1/admin/reports?{params}` (`AdminReportsController.cs:133`, class roles :18) | roles admin,super_admin | FE: `reports-assign.test.tsx` · BE: `AdminEndpointsIntegrationTests.cs:111-119` | ✅ |
| Resolve / reject / transition report | `:154` | `PUT /api/v1/admin/reports/{id}/status` (:133) | roles admin,super_admin | FE: `reports-assign.test.tsx` | ✅ |
| Assign to administrator «إسناد» | `:188` | `PUT /api/v1/admin/reports/{id}/assign` (:225) | roles admin,super_admin | FE: `reports-assign.test.tsx` · BE: `AdminEndpointsIntegrationTests.cs` | ✅ |
| Assignable admins list | `:178` | `GET /api/v1/admin/admins?page=1&pageSize=100` (`AdminDashboardController.cs:163-164`) | Policy `SuperAdmin` | FE: `reports-assign.test.tsx` | ✅ |

---

## 15. Settings `/settings` («الإعدادات / Settings») — PR-7 Settings Studio + Danger Zone

Render gate: `isSuperAdmin && can('view:settings')` (`App.tsx:1048`); nav superOnly (`App.tsx:744`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Settings list (category filter) | `SettingsCenter.tsx:157` | `GET /api/v1/admin/settings?category=` (`SystemSettingsController.cs:57-70`; class roles admin,super_admin :30) | inline `HasPermissionAsync(Settings,View)` | FE: `settings-center.test.tsx` · BE: `SettingsStudioHttpTests.cs:98-117`, `AdminEndpointsIntegrationTests.cs:40-58` | ✅ |
| Get one setting | read path | `GET /api/v1/admin/settings/{key}` (:76-80) | `Settings.View` | BE: `AdminEndpointsIntegrationTests.cs:58-81` | ✅ |
| Typed inline edit «تحرير» (bool/int/enum/string by server `valueType` registry) | `SettingsCenter.tsx:256` | `PUT /api/v1/admin/settings/{key}` (:98-146) | `Settings.Edit` + **security-category keys additionally require super_admin** (:113-120) + `SystemSettingSchema.Validate` typed validation → 400 `SETTING_VALUE_INVALID` (:127) + **history row appended in the same SaveChanges (atomic)** (:143-146) | FE: `settings-center.test.tsx` · BE: `SettingsStudioHttpTests.cs:44-117` | ✅ |
| Reset to registered default «إعادة التعيين» | `SettingsCenter.tsx:278` | `POST /api/v1/admin/settings/{key}/reset` (:169-181) | `Settings.Edit` + super_admin for security category; **client never supplies the value — the server-side registry is the source** | FE: `settings-center.test.tsx`, `settings-center-reset-confirm.test.tsx` · BE: `SettingsStudioHttpTests.cs:118-158` | ✅ |
| Change-history drawer «سجل التغييرات» | `fetchSettingHistory` (`lib/api.ts:687-695`) | `GET /api/v1/admin/settings/{key}/history` (:229) | roles admin,super_admin (class) + history is append-only | FE: `settings-center.test.tsx` · BE: `SettingsStudioHttpTests.cs:158-201` | ✅ |
| Feature-flags inventory (read-only, never a toggle) «مؤشرات الميزات» | `fetchFeatureFlags` (`lib/api.ts:711-712`) | `GET /api/v1/admin/settings/feature-flags` (:284-291) | roles admin,super_admin + **inline super_admin-only check** (:291) | FE: `settings-center.test.tsx` · BE: `SettingsStudioHttpTests.cs:201-265` (all five read-only entries) | ✅ |
| Danger Zone — wipe preview «معاينة المحو» | `DangerZone.tsx` (dryRun first) → `adminWipe` (`lib/api.ts:447-449`) | `POST /api/v1/admin/system/wipe` (dryRun) (`AdminSystemController.cs:50`) | Policy `SuperAdmin` + `[EnableRateLimiting("danger-zone")]` (:37) + handler re-auth/confirm gates | FE: `danger-zone-hard-delete.test.tsx` · BE: `Unit/Handlers/SystemMaintenanceHandlersTests.cs`, `Unit/Controllers/AdminSystemControllerContractTests.cs` | ✅ |
| Danger Zone — wipe execute (type DELETE/حذف + actor password) | `DangerZone.tsx` (confirm step) | `POST /api/v1/admin/system/wipe` (real run) | as above + typed confirmation + **actor password Argon2 re-auth** + one FK-safe transaction + Critical audits (`SystemCommands.cs`) | FE: `danger-zone-hard-delete.test.tsx` · BE: `Unit/Handlers/SystemMaintenanceHandlersTests.cs` | ✅ |
| Hard-delete flag mirror (honest disabled notice) | `HardDeleteDialog.tsx` → `adminHardDeleteStatus` (`lib/api.ts:469-470`) | `GET /api/v1/admin/system/hard-delete/status` (`AdminSystemController.cs:69-72`) | Policy `SuperAdmin` + danger-zone rate limit | FE: `danger-zone-hard-delete.test.tsx` · BE: `Unit/Controllers/AdminSystemControllerContractTests.cs` | ✅ |
| Hard-delete execute «حذف نهائي» | `HardDeleteDialog` (from the centers) | `POST /api/v1/admin/system/hard-delete` (:57-61) | Policy `SuperAdmin` + danger-zone limit + actor password + cascade refusal (`HARD_DELETE_HAS_CHILDREN`) + `Features:HardDeleteEnabled` fail-closed (`SystemCommands.cs:182-187`) | FE: `danger-zone-hard-delete.test.tsx` · BE: `Unit/Handlers/SystemMaintenanceHandlersTests.cs` | ✅ |

---

## 16. Content `/content` («صفحات المحتوى / Site content»)

Render gate: `isSuperAdmin` only — no registry key; the API enforces the role (`App.tsx:1051-1055`); nav superOnly (`App.tsx:745`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| List content pages | `ContentCenter.tsx:71` | `GET /api/v1/admin/content` (`ContentCenter` uses the admin content pages read; controller surface `AdminContentPagesController.cs` class `[Authorize(Roles="super_admin")]` :18; list rides the admin content surface) | super_admin | FE: (settings-adjacent suites) — **dedicated FE suite for ContentCenter NOT FOUND** | ✅ |
| Edit page (Terms / Privacy / Contact) «تحرير الصفحة» | `ContentCenter.tsx:102` | `PUT /api/v1/admin/content/{slug}` (`AdminContentPagesController.cs:37`) | super_admin | BE: `Unit/Handlers/ContentPageHandlersTests.cs` | ✅ |

---

## 17. Offline `/offline` («الحزم دون اتصال / Offline packages»)

Render gate: `isSuperAdmin && can('view:audit')` (`App.tsx:1031`); nav superOnly (`App.tsx:743`).

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| Packages ledger (status chips) | `OfflineCenter.tsx:60` | `GET /api/v1/admin/offline/packages?{params}` (`AdminOfflineController.cs:45`, class Policy `SuperAdmin` :22) | Policy `SuperAdmin` | FE: `offline-center.test.tsx` · BE: `OfflineHttpIntegrationTests.cs`, `OfflineAuditProducerPostgresIntegrationTests.cs` | ✅ |
| Revoke package «إبطال» | `OfflineCenter.tsx:80` | `POST /api/v1/admin/offline/packages/{packageId}/revoke` (:89) | Policy `SuperAdmin` | FE: `offline-center.test.tsx` · BE: `OfflineHttpIntegrationTests.cs`, `Unit/Handlers/OfflineHandlerSecurityTests.cs` | ✅ |

Issuance happens from the student app; this center only watches and revokes (`OfflineCenter.tsx:14-16`) — lifecycle fields only, no envelope material.

---

## 18. NotFound + shell surfaces

| Action | Frontend trigger | Backend endpoint | Backend authorization | Test coverage | Backend-enforced? |
| --- | --- | --- | --- | --- | --- |
| 404 view «الصفحة غير موجودة» | `NotFoundView` (`App.tsx:1057-1063`) | — (client routing; unknown paths never resolve to overview) | n/a | FE: `app-routing.test.tsx` | n/a |
| Command palette (Ctrl/Cmd+K) | `CommandPalette` — filtered by `can()` + superOnly (`App.tsx:752-754`) | — (navigation only; targets re-gate) | n/a | FE: `command-palette.test.tsx` | n/a |
| Compose notification «إرسال إشعار» | `NotificationCompose.tsx:147` | `POST /api/v1/notifications/send` (`NotificationsController.cs:113-114`) | `[Authorize(Roles="admin,super_admin")]` | FE: `notification-compose-cascade.test.tsx` | ✅ |
| Audience cascade | `NotificationCompose.tsx:90-127` | cascade + `GET /api/v1/admin/students?page=1&pageSize=100` | `StudentView` policy (students read) | FE: `notification-compose-cascade.test.tsx` | ✅ |
| Sent notifications ledger + stats «الإشعارات المرسلة» | `SentNotificationsDialog.tsx:61, 84` | `GET /api/v1/notifications/sent` (:161-162) · `GET /api/v1/notifications/{id}/stats` (:144-145) | roles admin,super_admin | FE: `sent-notifications.test.tsx` · BE: `AdminEndpointsIntegrationTests.cs:270+` | ✅ |
| Dictionary / shell copy (bilingual) | `lib/dictionary/*` | — | n/a | FE: `shell-copy.test.ts`, `dictionary.test.ts` (incl. the no-secrets invariant) | n/a |

---

## 19. DEAD BUTTON / ROUTE AUDIT

**Result: no dead buttons, dead routes, or placeholder actions found.** Method: full sweep of
`apps/admin-web/src/components/*.tsx` for `TODO|FIXME|placeholder|coming soon|not implemented|stub|no-op`
plus a review of every `disabled=` site; every `disabled` attribute in the tree is a legitimate
busy/state guard (e.g. `disabled={busy}`, `disabled={saving}`, `disabled={page <= 1}`, `disabled={isSystemRole…}` for
system-role protection), not a permanently dead control. No `onClick={() => {}}` empty handlers and
no `href="#"` dead links exist in the components.

Honest notes (not defects, recorded for the reviewer):

1. **`GET /api/v1/admin/dashboard` (+ recent-activity / top-subjects / reports/summary)** — backend-enforced and live, but **no dedicated backend HTTP test suite was found for these four endpoints** (searched `CMS.Tests` for `GetDashboardStatsQuery` / `admin/dashboard`: zero references). Frontend `dashboard-feeds.test.tsx` + `app-boot.test.tsx` cover the UI contract. **NOT VERIFIED at backend-suite level.**
2. **`ContentCenter`** has no dedicated frontend test file (covered indirectly; backend `ContentPageHandlersTests.cs` covers the handler). The view is live and backend-gated (super_admin).
3. **`TwoFactorCard`** intentionally cannot display the *current* 2FA-enabled state — the API exposes no `2FA status` endpoint (documented deviation in `TwoFactorCard.tsx:6-10`); both flows surface the backend's own verdicts honestly. This is an API-shape limitation, not a dead button.
4. **`ServersCenter`** is read-only by design — zero control buttons to audit (`ServersCenter.tsx:14-17`).
5. The known pre-PR-10 gaps (`admin-web lint not CI-gated`, `@cms/ui tests not CI-gated`, admin e2e smoke absent) were closed in the PR-10 CI work (`ci.yml:165-181, 300-346`) — they were CI-gate gaps, not dead UI.

---

## 20. DANGEROUS ACTIONS — guard chains

Every destructive surface below is **backend-enforced**; the chain is quoted from the handler code.

| # | Surface | Frontend trigger | Guard chain (backend, in order) | File references |
| --- | --- | --- | --- | --- |
| 1 | **System wipe** (per module: questions/students/exams/library/courses/subscriptions/offline/academic) | `DangerZone.tsx` — dryRun preview → typed confirmation `DELETE`/`حذف` + actor password | `[Authorize(Policy="SuperAdmin")]` → `danger-zone` rate limit (5/min) → typed confirm text → **actor password Argon2 re-auth** → intent + executed **Critical** audits → one FK-safe transaction | `AdminSystemController.cs:34-61`, `SystemCommands.cs` (`WipeDataCommand` handler), FE `danger-zone-hard-delete.test.tsx` |
| 2 | **Hard delete** (exam/question/course/episode/subject/lecture/exam-course/library-file) | `HardDeleteDialog.tsx` — flag mirror on open, actor password + cascade checkbox | `SuperAdmin` policy → `danger-zone` rate limit → **`Features:HardDeleteEnabled` fail-closed** (`SystemCommands.cs:84-85, 182-187`) → actor password re-auth → `HARD_DELETE_HAS_CHILDREN` loud refusal without cascade → Critical audits → transaction | `AdminSystemController.cs:57-72`, `SystemCommands.cs`, BE `Unit/Handlers/SystemMaintenanceHandlersTests.cs` |
| 3 | **Library purge** (only physical object deletion in the platform) | `LibraryCenter.tsx:839` — confirm dialog with actor password | `Roles="super_admin"` (`LibraryController.cs:553-554`) → **fail-closed `Features:HardDeleteEnabled` first** (`LibraryRetentionHandlers.cs:104-111`) → SuperAdmin actor check (:118-119) → **actor password re-auth** (:122-123) → retention-state gate (must be tombstoned/quarantined, :131-134) → retention window `Library:RetentionDays` (default 30, clamp 0-3650, :138-143, 214-218) → intent **Critical** audit (:157-158) → physical object delete → single transaction row removal (:171-189) → executed **Critical** audit (:203-206) | `LibraryRetentionHandlers.cs:98-209` |
| 4 | **Ordinary library delete** | `LibraryCenter.tsx:771` | roles admin,super_admin → **tombstone only** (`file.Tombstone(req.DeletedBy)`), stored object never touched, Warning audit `retention=pending` | `LibraryHandlers.cs:606-631` |
| 5 | **Admin password reset** | `App.tsx:523-538` | `SuperAdmin` policy → `RequireSuperAdminAsync` → **last-super-admin guard** → password policy → hash swap → **all target sessions revoked** + permission cache invalidated → Warning audit `credential_reset=admin` | `AdminHandlers.cs:583-601` |
| 6 | **Admin delete** | `App.tsx:540-556` (password re-entry in UI) | `SuperAdmin` policy → **actor password Argon2 re-auth** (:606-607) → last-super-admin guard (:614) → target sessions revoked → row removal → **Critical** audit (with `target_is_super_admin=true` marker when applicable) | `AdminHandlers.cs:603-625` |
| 7 | **Admin disable / demote (update/status/role-assign)** | `App.tsx:508-521, 475-506` | `SuperAdmin` policy → `RequireSuperAdminAsync` → last-super-admin guard → mutation → sessions revoked on disable → cache invalidation → Warning/**Critical** audit (Critical when target is super admin) | `AdminHandlers.cs:531-581, 377-400` |
| 8 | **Student password reset** | `StudentsCenter.tsx` dialog (typed phone confirm + actor password) | `Policies.StudentEdit` + `IsInScopeAsync` (`AdminStudentsController.cs:319-326`) → **`danger-zone` rate limit** (:321) → **actor Argon2 re-auth** (`DashboardHandlers.cs:343-344`) → password policy → hash swap + optional must-change flag (:349-352) → **all student sessions revoked** (:355) → Warning audit `credential_reset=student` | `DashboardHandlers.cs:338-365` |
| 9 | **Student archive / restore** | `StudentsCenter.tsx` row actions | `StudentEdit` policy + scope → tombstone (`student.Archive()`) → **all sessions revoked** → Warning audit; restore is idempotent + audited | `DashboardHandlers.cs:372-420`, `AdminStudentsController.cs:347-389` |
| 10 | **Student ban / unban** | `StudentsCenter.tsx` protected-action dialog (reason + expiry) | `StudentEdit` policy + scoped permission (`EnsureScopedPermissionAsync`) → `student.Ban(reason, until)` → Warning audit | `DashboardHandlers.cs:304-328` |
| 11 | **Session revocation** (admin disable/reset/delete targets, student all/single sessions, student self revoke-others) | multiple triggers | handler-side `RevokeAllForUserAsync(…)` inside the respective guard chains; single-session revoke via `SecurityController.cs:321` (roles admin,super_admin) | `AdminHandlers.cs:574, 596, 617`, `DashboardHandlers.cs:355, 381`, `SecurityController.cs:321`, `StudentSecurityController.cs:97, 129` |
| 12 | **Role / permission mutation** (create/status/delete/permission-matrix/ui-permissions) | `RolesCenter`, `PermissionMatrixEditor`, `UiPermissionsEditor` | `SuperAdmin`/`RoleEdit` policies → `RequireSuperAdminAsync` → strict resource/action/scope validation (`INVALID_ROLE_PERMISSIONS`) → **access cache invalidation for every assigned admin** → audit (PermissionChange) | `AdminHandlers.cs:377-456` |
| 13 | **Setting mutation / reset** | `SettingsCenter.tsx` | `Settings.Edit` + **super_admin for security category** → typed schema validation → **atomic value+history row in one transaction** → audit | `SystemSettingsController.cs:98-149, 169-206` |
| 14 | **Code revoke / bulk revoke / subscription revoke / offline-package revoke** | `CodesCenter`, `StudentsCenter`, `OfflineCenter` | `CodeEdit` policy (codes/subscriptions) / `SuperAdmin` (offline) → reason-carrying audit rows | `AdminDashboardController.cs:350-406`, `AdminOfflineController.cs:89` |
| 15 | **Academic archive/restore + lecture/course/exam lifecycle archive** | `AcademicCenter`, `CoursesCenter`, `ExamsCenter` | roles admin,super_admin / lifecycle policies (`ExamArchive` etc.) → audits on transitions | `AcademicController.cs:90-101`, `AdminCoursesController.cs:153-210`, `AdminExamsController.cs:120-185` |

---

## 21. Coverage totals (this document)

- **Matrix action rows**: 151 across 18 view sections + login/2FA + shell surfaces — **140 backend-enforced (✅)** and 11 client-only rows (`n/a`: navigation/rendering/local-state rows with no backend contract to enforce).
- **Backend-enforced rows**: every row with a backend contract is server-gated (policy / role / scope / rate-limit / re-auth, per the row); none rely on UI hiding alone. The cosmetic `can()`/`superOnly` layer fails open by design — the backend RBAC is the boundary.
- **Dangerous-action surfaces**: 15 (guard chains quoted in §20).
- **Dead buttons / dead routes**: none found (see §19).
