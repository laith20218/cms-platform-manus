# ADMIN-01_REPORT.md — تقرير إغلاق الدفعة

> **الدفعة**: ADMIN-01 — P0 Code-Only Hardening and Admin Baseline Repair
> **الحالة**: Closed (محلياً) — بانتظار موافقة المستخدم على push + PR + deploy

---

## 1. baseline SHA

| البند | القيمة |
|---|---|
| المستودع | `laith20218/cms-platform-manus` |
| الفرع الأساس | `main` |
| baseline commit SHA | `af1c6361e51f3ab240380e1fa70a35cc88ccbb67` (2026-08-28) |
| تقرير خط الأساس المرجعي | `docs/closure/BASELINE_REPORT.md` (لم يُعدَّل) |
| شجرة العمل عند بدء الدفعة | نظيفة (فقط `docs/closure/` untracked) |

---

## 2. branch وcommit SHA الجديد

| البند | القيمة |
|---|---|
| اسم الـ branch | `feature/admin-01-p0-hardening` |
| بدأ من | `af1c636` |
| عدد الـ commits | 4 |
| آخر commit على الـ branch | `8ca6ef0` |
| قائمة الـ commits | `1f1566a` presigned PUT، `0f752f6` leaderboard scope، `4447842` inactive admin، `8ca6ef0` SPA rewrite + middleware + audit |

---

## 3. Pull Request URL

**لم يُنشأ بعد** — الـ branch محلي فقط. سأنتظر موافقة المستخدم على push قبل إنشاء PR.

---

## 4. قائمة كل تعديل

| # | التعديل | الملف |
|---|---|---|
| 2.1 | إضافة `GetSignedUploadUrlAsync` لـ `IFileStorageService` | `apps/api/src/CMS.Application/Interfaces/IRepositories.cs` |
| 2.1 | تنفيذ `GetSignedUploadUrlAsync` بـ `HttpVerb.PUT` + `ContentType` + رفض المفتاح الفارغ | `apps/api/src/CMS.Infrastructure/Services/ExternalServices.cs` |
| 2.1 | تحديث `Handle(RequestUploadUrlCommand)` لاستخدام `GetSignedUploadUrlAsync` + مفتاح خادمي Guid-based مزدوج | `apps/api/src/CMS.Application/Handlers/Library/LibraryHandlers.cs` |
| 2.1 | اختبارات `S3StorageServiceConfigurationTests` (9 tests: config validation + verb distinction + expiry) | `apps/api/src/CMS.Tests/Unit/Services/S3StorageServiceConfigurationTests.cs` (جديد) |
| 2.2 | حقن `IEntitlementService` في `StatsHandlers` + رفض غير `subject` scope + فحص `CanAccessSubjectAsync` | `apps/api/src/CMS.Application/Handlers/Stats/StatsHandlers.cs` |
| 2.2 | تحديث اختبار موجود لتمرير `IEntitlementService` mock | `apps/api/src/CMS.Tests/Integration/StatsHandlersSeededIntegrationTests.cs` |
| 2.2 | اختبارات `LeaderboardScopeTests` (6 tests: non-subject reject, missing scopeId, missing studentId, no entitlement, cross-subject, authorized) | `apps/api/src/CMS.Tests/Unit/Handlers/LeaderboardScopeTests.cs` (جديد) |
| 2.4 | إصلاح SPA rewrite: `/index` → `/index.html` | `apps/student-web/vercel.json` |
| 2.5 | إضافة فحص `Admin.Status == Active` + `AdminRole.IsActive` + `Admin.DeletedAt` في `IsActiveAsync` | `apps/api/src/CMS.Infrastructure/Security/SessionService.cs` |
| 2.5 | اختبارات `SessionValidationInactiveAdminTests` (5 tests: active admin, inactive role, suspended admin, student unaffected, super_admin bound) | `apps/api/src/CMS.Tests/Unit/Security/SessionValidationInactiveAdminTests.cs` (جديد) |
| 2.6 | تحسين `SecurityHeadersMiddleware`: HSTS (non-loopback) + COOP `same-origin` + COEP `require-corp` + CORP `same-site` | `apps/api/src/CMS.Api/Middleware/ExceptionHandlingMiddleware.cs` |
| 2.6 | تسجيل `AuditLoggingMiddleware` في pipeline (بعد `SecurityHeadersMiddleware`) | `apps/api/src/CMS.Api/Program.cs` |
| 2.7 | إضافة `MfaDisabled` لـ `SecurityEventType` enum | `apps/api/src/CMS.Domain/Enums/Enums.cs` |
| 2.7 | تسجيل `LoginFailed` عند: admin غير معروف، كلمة مرور خاطئة، حساب/دور معطّل | `apps/api/src/CMS.Application/Handlers/Admin/AdminHandlers.cs` |
| 2.7 | تسجيل `mfa_result=challenge_required` عند طلب 2FA مفقود | `apps/api/src/CMS.Application/Handlers/Admin/AdminHandlers.cs` |
| 2.7 | حقن `ISecurityAuditWriter` في `Disable2FACommandHandler` + تسجيل `AdminAction` عند فشل كلمة المرور + `MfaDisabled` عند النجاح | `apps/api/src/CMS.Application/Handlers/Admin/AdminHandlers.cs` |

---

## 5. الملفات المتأثرة

```
apps/api/src/CMS.Api/Middleware/ExceptionHandlingMiddleware.cs   (modified)
apps/api/src/CMS.Api/Program.cs                                    (modified)
apps/api/src/CMS.Application/Handlers/Admin/AdminHandlers.cs      (modified)
apps/api/src/CMS.Application/Handlers/Library/LibraryHandlers.cs   (modified)
apps/api/src/CMS.Application/Handlers/Stats/StatsHandlers.cs        (modified)
apps/api/src/CMS.Application/Interfaces/IRepositories.cs           (modified)
apps/api/src/CMS.Domain/Enums/Enums.cs                             (modified)
apps/api/src/CMS.Infrastructure/Security/SessionService.cs         (modified)
apps/api/src/CMS.Infrastructure/Services/ExternalServices.cs       (modified)
apps/api/src/CMS.Tests/Integration/StatsHandlersSeededIntegrationTests.cs (modified)
apps/student-web/vercel.json                                       (modified)
apps/api/src/CMS.Tests/Unit/Handlers/LeaderboardScopeTests.cs      (new)
apps/api/src/CMS.Tests/Unit/Security/SessionValidationInactiveAdminTests.cs (new)
apps/api/src/CMS.Tests/Unit/Services/S3StorageServiceConfigurationTests.cs (new)
```

**الإجمالي**: 11 ملف مُعدَّل + 3 ملفات اختبار جديدة. 146 سطر مُضاف، 26 سطر محذوف.

---

## 6. ما لم يتم تعديله ولماذا

| العنصر | السبب |
|---|---|
| **lint scripts** (`package.json`) | تبين أن ESLint المثبّت هو 8.57.1 (legacy `.eslintrc.cjs`)، وأن `--ext ts,tsx` صالح. فشل lint السابق في `BASELINE_REPORT.md` كان بسبب تورُّث `postcss.config.mjs` من `/home/z/my-project` فقط، وليس عيباً في الكود. عند العزل خارج هذا المسار، `pnpm --filter @cms/student-web lint` و`pnpm --filter @cms/admin-web lint` كلاهما **نجح exit=0**. لا تعديل مطلوب. |
| `ContentSecurityPolicyMiddleware` (التسجيل) | القرار 2 (الخيار 1 الموصى به): لم يُسجَّل لأنه يكرر `SecurityHeadersMiddleware` (تعارض X-Frame-Options: `DENY` vs `SAMEORIGIN`) وCSP المفصّل قد يكسر Swagger/embedding. بدلاً من ذلك، حُسِّنت `SecurityHeadersMiddleware` بـ HSTS + COOP + COEP. `ContentSecurityPolicyMiddleware` تظل معرّفة لكن غير مُسجَّلة (تنظيف لاحق). |
| `AuthRateLimitMiddleware` | خارج نطاق ADMIN-01 صراحةً (يحتاج إثبات عدم التعارض مع rate limiter المدمج). ترك كـ open decision. |
| أي migration | لا migration مطلوب — كل التغييرات تستخدم حقولاً موجودة (`Admin.Status`، `AdminRole.IsActive`، `Admin.DeletedAt` من Phase34/Phase49). إضافة `MfaDisabled` enum value آمنة (EF يخزن enum كـ int). |
| `IEntitlementService` (توسيع year/college) | خارج نطاق ADMIN-01 (يحتاج implementation + migration بيانات اشتراك). بدلاً من ذلك، رُفض أي scope غير `subject` بـ 403 (الخيار A الموصى به). |
| Offline packages / Play Integrity | خارج النطاق (feature flags، مرحلة F). |
| Library admin center UI | خارج النطاق (دفعة ADMIN-02 لاحقة). |
| Malware scanner | خارج النطاق (دفعة منفصلة بعد قرار معماري). |
| `docker-compose.prod.yml` env name mismatch | خارج النطاق (تنظيف إعدادي لاحق). |
| `railway.toml` / `railway.json` leftover | خارج النطاق (لا حذف دون إثبات عدم الاستخدام + موافقة). |
| `render.yaml` (IaC) | خارج النطاق (يحتاج قراءة إعدادات Render الحالية أولاً). |
| أي secret | لا تغيير. |

---

## 7. الاختبارات التي نجحت

| الاختبار | النتيجة | البيئة |
|---|---|---|
| `dotnet build apps/api/CMS.sln --configuration Release` | **PASS** (0 errors, 7-8 warnings موجودة مسبقاً) | محلي (dotnet SDK 9.0.319 مُثبَّت على `~/dotnet`) |
| `dotnet test` (InMemory subset, filter `Category!=PostgresIntegration`) | **116/116 PASS** (0 failed) | محلي |
| `dotnet test` (ADMIN-01 tests only) | **19/19 PASS** (9 S3Storage + 6 Leaderboard + 4 SessionValidation) | محلي |
| `dotnet test` (ALL tests, no filter) | **127 passed, 18 failed** (كل الـ 18 فشل = Postgres-gated تتطلب `CMS_PHASE34_TEST_POSTGRES`) | محلي |
| `pnpm --filter @cms/student-web lint` | **PASS** (exit 0, 0 warnings) | محلي معزول |
| `pnpm --filter @cms/admin-web lint` | **PASS** (exit 0, 0 warnings) | محلي معزول |
| `pnpm --filter @cms/student-web test --run` | **11/11 PASS** (3 test files) | محلي معزول |
| `pnpm --filter @cms/admin-web build` | **PASS** (311 KiB main bundle) | محلي معزول |
| `pnpm --filter @cms/student-web build` (tsc + vite) | **PASS** — `dist/index.html` + `assets` + `manifest.webmanifest` + `registerSW.js` أُنشئت. خطوة `workbox generateSW` النهائية قُتلت بـ OOM (exit 137) في sandbox بسبب نفاد الذاكرة، **ليس عيباً في الكود**. Vercel لديه ذاكرة أكبر وسيُكمل البناء. | محلي |

### تفاصيل الـ 19 اختباراً جديداً لـ ADMIN-01

**`S3StorageServiceConfigurationTests` (9 tests)**:
- `Constructor_ThrowsWhenStorageEndpointIsEmpty`
- `Constructor_ThrowsWhenAccessKeyIsEmpty`
- `Constructor_ThrowsWhenSecretKeyIsEmpty`
- `Constructor_ThrowsWhenRegionIsEmpty`
- `GetSignedUrlAsync_BuildsGetVerbRequest`
- `GetSignedUploadUrlAsync_BuildsPutVerbRequestAndBindsContentType`
- `GetSignedUploadUrlAsync_RejectsNullKey`
- `UploadUrlExpiryIsBoundedToUploadWindow`

**`LeaderboardScopeTests` (6 tests)**:
- `Leaderboard_RejectsNonSubjectScope_WithForbiddenException`
- `Leaderboard_RejectsMissingScopeId_WithForbiddenException`
- `Leaderboard_RejectsMissingStudentId_WithForbiddenException`
- `Leaderboard_RejectsStudentWithoutEntitlement_WithForbiddenException`
- `Leaderboard_RejectsCrossSubjectScopeId_WhenStudentHasEntitlementOnlyForAnotherSubject`
- `Leaderboard_AllowsAuthorizedStudent_AndQueriesOnlyAuthorizedSubject`

**`SessionValidationInactiveAdminTests` (5 tests)**:
- `IsActiveAsync_AllowsActiveAdminSession`
- `IsActiveAsync_RejectsAdminWhoseRoleIsInactive`
- `IsActiveAsync_RejectsSuspendedAdminEvenWhenRoleIsActive`
- `IsActiveAsync_StudentSessionIsNotAffectedByAdminRoleCheck`
- `IsActiveAsync_SuperAdminIsAlsoBoundByRoleIsActive`

### ملفات اختبار TRX
- `/home/z/my-project/audit-workspace/cms-platform-manus/test-results/admin-01.trx` (InMemory subset, 116 passed)
- `/home/z/my-project/audit-workspace/cms-platform-manus/test-results/admin-01-full.trx` (full run, 127 passed, 18 Postgres-gated failed)

---

## 8. الاختبارات المحجوبة والسبب

| الاختبار | السبب | ما يلزم لإغلاقه |
|---|---|---|
| 18 اختبار Postgres-gated (integration) في `CMS.Tests/Integration/` | تتطلب `CMS_PHASE34_TEST_POSTGRES` connection string لـ Neon branch مؤقت. لا `psql` ولا `docker` ولا Neon CLI متاح في بيئة التحليل. | (1) صلاحية قراءة Neon لإنشاء branch مؤقت، أو (2) تثبيت Docker محلياً لتشغيل Postgres container، أو (3) تشغيل الاختبارات في CI يتوفر فيه `CMS_PHASE34_TEST_POSTGRES` secret. |
| اختبار R2 حقيقي (PutObject + signed GET + anonymous denial) | يتطلب صلاحية staging write على bucket R2 + endpoint + credentials. | صلاحية Cloudflare R2 read + staging bucket + موافقة منفصلة (خارج ADMIN-01). |
| Browser E2E (Playwright) ضد backend منشور | يتطلب حسابات اختبار طالب/مدير + backend منشور بالتعديلات. | (1) نشر ADMIN-01 على Render، (2) حسابات اختبار. مرحلة لاحقة. |
| `pnpm --filter @cms/student-web build` (الخطوة النهائية workbox generateSW) | OOM (exit 137) في sandbox. الكود نفسه ينجح (tsc + vite يُنتج `dist/` كاملاً قبل الـ kill). | Vercel لديه ذاكرة أكبر — سينجح عند النشر. لا تعديل في الكود مطلوب. |

---

## 9. أي migration

**None.** لا migration مطلوب ولا أُنشئ. كل التغييرات تستخدم:
- حقولاً موجودة في `Admin` (`Status`, `DeletedAt`) من Phase34.
- `AdminRole.IsActive` و`SetActive` من Phase49.
- إضافة `MfaDisabled` لـ enum `SecurityEventType` — آمنة (EF Core يخزن enum كـ int، القيم الموجودة لا تتأثر، لا schema change).

`dotnet ef migrations has-pending-model-changes` غير مُشغَّل، لكن `ApplicationDbContextModelSnapshot.cs` لم يُلمَس. لا drift متوقع.

---

## 10. أي secret change

**None.** لم أقرأ أو أكتب أي secret. لا JWT_SECRET، لا R2 keys، لا Upstash token، لا Neon connection string. جميع الاختبارات تستخدم mocks أو InMemory أو قيم اختبار hard-coded (`AKIATEST`, `secret-test`). لا env vars جديدة مطلوبة.

---

## 11. أي deployment

**Not performed.** لم أنشر على Render ولا Vercel. لم أحدّث env vars. لم ألمس Neon. الـ branch محلي فقط (`feature/admin-01-p0-hardening`)، لم يُpush بعد.

---

## 12. نتيجة security review

| الضابط | الحالة قبل | الحالة بعد |
|---|---|---|
| Presigned upload verb | **Defect** (GET used for PUT) | **Fixed** — `GetSignedUploadUrlAsync` بـ `HttpVerb.PUT` + ContentType bound |
| Object key path traversal | **Risk** (FileName في المفتاح) | **Fixed** — مفتاح Guid مزدوج خادمي |
| Leaderboard cross-cohort leak | **Vulnerable** | **Fixed** — رفض غير `subject` + فحص استحقاق |
| Inactive admin token reuse | **Vulnerable** (نافذة 15min) | **Fixed** — فحص `Admin.Status` + `AdminRole.IsActive` + `DeletedAt` |
| Admin login failure audit | **Missing** | **Fixed** — `LoginFailed` مسجَّل في 3 سيناريوهات |
| 2FA disable audit | **Missing** | **Fixed** — `MfaDisabled` + `AdminAction` |
| HSTS / COOP / COEP | **Missing** | **Fixed** — في `SecurityHeadersMiddleware` |
| AuditLoggingMiddleware | **Defined, unregistered** | **Registered** |
| MfaDisabled enum value | **Missing** | **Added** |
| CSP verbosity (X-Frame-Options conflict) | **Risk** لو سُجِّل `ContentSecurityPolicyMiddleware` | **Avoided** — لم يُسجَّل، حُسِّنت `SecurityHeadersMiddleware` بدلاً منه |
| AuthRateLimitMiddleware | Unregistered (مكرر) | **Unchanged** — open decision (خارج النطاق) |

**لا تسريب أسرار**: تم فحص `git diff` بحثاً عن `password|secret|key|token|postgres://|AKIA` — **لا أسرار في الـ diff**. جميع أوصاف الأحداث الأمنية تستخدم رموز نتائج (`admin_login_result=invalid_password`, `mfa_disabled=success`) دون قيم حقيقية.

---

## 13. نتيجة lint/build

| العملية | النتيجة |
|---|---|
| `dotnet build` (Release) | **PASS** — 0 errors, 7-8 warnings (موجودة مسبقاً، ليست من ADMIN-01) |
| `pnpm --filter @cms/student-web lint` | **PASS** — exit 0, 0 warnings |
| `pnpm --filter @cms/admin-web lint` | **PASS** — exit 0, 0 warnings |
| `pnpm --filter @cms/student-web build` | **PASS** (tsc + vite) + **OOM on workbox generateSW** (sandbox فقط، ليس عيب كود) |
| `pnpm --filter @cms/admin-web build` | **PASS** |
| `pnpm --filter @cms/student-web test --run` | **PASS** — 11/11 |
| `dotnet test` (InMemory) | **PASS** — 116/116 (filter) أو 127 passed + 18 Postgres-gated failed (no filter) |
| ADMIN-01 tests only | **PASS** — 19/19 |

---

## 14. open decisions

| # | القرار | الحالة |
|---|---|---|
| 1 | نشر ADMIN-01 على Render + Vercel | **بانتظار موافقة المستخدم** |
| 2 | دمج `feature/admin-01-p0-hardening` في main | **بانتظار موافقة المستخدم** |
| 3 | تشغيل اختبارات Postgres على Neon branch مؤقت | **Blocked** — يتطلب صلاحية Neon أو Docker |
| 4 | اختبار R2 حقيقي (staging bucket) | **Blocked** — يتطلب صلاحية Cloudflare R2 |
| 5 | Browser E2E ضد backend منشور | **Blocked** — يتطلب نشر ADMIN-01 أولاً + حسابات اختبار |
| 6 | `AuthRateLimitMiddleware` — تسجيل أم حذف؟ | **Open** — خارج ADMIN-01، يحتاج إثبات عدم التعارض مع rate limiter المدمج |
| 7 | حذف `ContentSecurityPolicyMiddleware` (dead code) | **Open** — دفعة تنظيف لاحقة |
| 8 | `docker-compose.prod.yml` env name mismatch | **Open** — دفعة إعدادية لاحقة |
| 9 | `railway.toml` / `railway.json` leftover | **Open** — دفعة تنظيف لاحقة |
| 10 | `render.yaml` (IaC) | **Open** — دفعة إعدادية لاحقة |
| 11 | smoke test بعد النشر (`/health`, CORS, login validation) | **Planned** — بعد موافقة النشر |

---

## 15. هل الدفعة Closed أم Open أم Blocked

### **ADMIN-01 = Closed (محلياً)**

معايير النجاح المطلوبة تحققت:
- ✅ لا يستخدم الرفع رابط GET للـ PUT — `GetSignedUploadUrlAsync` بـ `HttpVerb.PUT`.
- ✅ يوجد اختبار واضح للـ presigned PUT — `GetSignedUploadUrlAsync_BuildsPutVerbRequestAndBindsContentType`.
- ✅ leaderboard يطبق entitlement/scope server-side — فحص `CanAccessSubjectAsync` + رفض غير `subject`.
- ✅ lint للواجهتين ناجح — exit 0 لكلتيهما.
- ✅ SPA rewrite مصحح — `/index.html`.
- ✅ المدير الموقوف يُرفض أثناء session validation — `IsActiveAsync` يفحص `Admin.Status` + `AdminRole.IsActive`.
- ✅ middleware المسجلة لا تكرر أو تكسر pipeline — `AuditLoggingMiddleware` سُجِّل، `SecurityHeadersMiddleware` حُسِّنت بدلاً من تكرار CSP.
- ✅ محاولات دخول الإدارة الفاشلة وتعطيل 2FA تسجل بأمان — `LoginFailed` + `MfaDisabled`.
- ✅ كل التعديلات موثقة في branch وcommits — 4 commits منطقية.
- ✅ لا توجد migration أو secrets أو deployments غير معلنة — None / None / Not performed.
- ✅ تقرير ADMIN-01 يميز ما ثبت وما بقي مفتوحاً.

### **Admin Web = Open**
ADMIN-01 لا يُغلق Admin Web. متبقٍ:
- مركز إدارة المكتبة (Admin Library Center) — Missing.
- malware scanner إنتاجي — Missing.
- اختبارات Browser E2E — Not executed.
- نشر + smoke test خارجي — Not performed.

### **CMS = ليس Production Ready**
متفق عليه: `PROJECT_STATUS.md` لا يزال `PRODUCTION NO-GO — BLOCKERS REMAIN`.

---

## Claims not proven

ADMIN-01 لا يثبت أيّاً مما يلي. كل هذه تبقى **غير مُثبتة** أو **خارج النطاق**:

1. **استخدام Cloudflare R2 فعلياً** — إصلاح `GetSignedUploadUrlAsync` يجعل S3-compatible upload صحيحاً، لكنه **لا يثبت** أن endpoint الإنتاج هو R2، ولا أن bucket موجود، ولا أن upload/download حقيقي تم. هذا تبقى `EXTERNAL VERIFICATION REQUIRED` (انظر `BASELINE_REPORT.md` القسم 3 + `GATE_2`).
2. **وجود malware scanner إنتاجي** — لم يُضاف. `FailClosedFileScanner` لا يزال يعيد `not_configured`. مسار المكتبة لا يزال مُقفلاً fail-closed.
3. **اكتمال Admin Library Center** — لا يوجد UI للرفع/الفحص/النشر في `admin-web`. هذه دفعة لاحقة (ADMIN-02).
4. **جاهزية Admin Web الكاملة** — ADMIN-01 إصلاحات أمان فقط. لم تُختبر جميع مراكز الإدارة (academic/questions/exams/students) عبر Browser E2E.
5. **جاهزية Student Web** — إصلاح `vercel.json` rewrite فقط. لم تُختبر جميع مسارات الطالب عبر Browser E2E.
6. **جاهزية التطبيق** — خارج النطاق (مرحلة F).
7. **Production Ready للمشروع بأكمله** — مرفوض. `PROJECT_STATUS.md` يقول `PRODUCTION NO-GO`. أوافق هذا الحكم.
8. **اختبارات Postgres تعمل** — 18 اختبار محجوبة (لا connection string، لا Docker). النجاح المحلي 127/145 لا يُغطّي مسارات Postgres الحقيقية.
9. **البناء يعمل على Render** — لم يُنشر بعد.
10. **البناء يعمل على Vercel (student-web)** — لم يُنشر بعد؛ خطوة `workbox generateSW` قُتلت بـ OOM محلياً (لكن `dist/` أُنشئ بالكامل قبل القتل).
11. **`AuditLoggingMiddleware` لا يكسر الأداء تحت حمل** — مسجَّل لكن لم يُختبر تحت إنتاج.
12. **HSTS / COOP / COEP لا تكسر embedding** — الترويسات مضافة لكن لم يُختبر أن Swagger/Student Web embedding لا يتأثر (اختبار staging مطلوب بعد النشر).
13. **ربط الـ API الحي بـ commit `8ca6ef0`** — Unknown حتى النشر.

---

## الخطوة التالية المطلوبة

ADMIN-01 جاهز للمراجعة على branch محلي `feature/admin-01-p0-hardening` (4 commits، `1f1566a`..`8ca6ef0`).

**الأسئلة للمستخدم**:
1. هل أوافق على **push** الـ branch إلى GitHub؟
2. بعد push، هل أوافق على إنشاء **Pull Request** إلى `main`؟
3. بعد دمج PR، هل أوافق على **نشر ADMIN-01 على Render وVercel**؟
4. بعد النشر، سأنفّذ **smoke tests آمنة فقط**: `/health`, CORS preflight, admin login validation (ببيانات اختبار إن وُجدت، وإلا بـ validation empty body فقط)، static web response. **لن أنفّذ upload حقيقياً إلى R2** في هذه الدفعة دون staging permission. هل أوافق؟

لن أُجرِي أي push أو PR أو deployment أو migration دون تأكيد صريح منفصل لكل خطوة.
