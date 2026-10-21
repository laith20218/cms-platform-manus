# BASELINE_REPORT.md — تقرير خط الأساس قبل أي تعديل

> **المرحلة A** — هذا التقرير يُجمَع قبل أي تعديل للكود أو migration أو نشر أو تغيير secrets. هدفه تثبيت نقطة مرجعية قابلة للمقارنة قبل/بعد.
>
> كل نتيجة مُصنّفة في إحدى الحالات: `Implemented and proven in source` / `Implemented but not externally verified` / `Partially implemented` / `Documented/planned only` / `Externally verified` / `Missing` / `Blocked` / `Unknown`. لا يُعوَّض غياب الدليل بالتخمين.

---

## 1. معرّف النسخة (commit SHA) وحالة الفرع

| البند | القيمة | الدليل |
|---|---|---|
| المستودع | `laith20218/cms-platform-manus` | `git remote -v` |
| الفرع | `main` | `git branch` |
| آخر التزام على `origin/main` | `af1c6361e51f3ab240380e1fa70a35cc88ccbb67` | `git log -1 origin/main` |
| التزام محلي مُحلَّل | `af1c6361e51f3ab240380e1fa70a35cc88ccbb67` (مطابق) | `git log -1` |
| تاريخ آخر التزام | 2026-08-28 17:53:03 UTC | `--date=iso` |
| موضوع آخر التزام | `docs(exams): include verification logs` | `git log` |
| عدد الالتزامات الكلي | 67 | `git rev-list --count HEAD` |
| هل local متأخر عن origin؟ | **لا** — `0` التزامات خلف | `git rev-list --count HEAD..origin/main` |
| حالة الشجرة المحلية | **نظيفة** — لا تعديلات غير ملتزمة | `git status --porcelain` فارغ |
| طريقة التحليل | `git fetch origin` + مقارنة + clone كامل | — |

**النتيجة**: المستودع لم يتغير منذ خط الأساس السابق (مراجعة 2026-10-20). `local == origin/main == af1c636`. أي تعديل لاحق سيبدأ من هذه النقطة.

---

## 2. حالة المنصات (فحص خارجي حي بتاريخ 2026-10-20 ~20:30 UTC)

| السطح | URL | HTTP | التحقق | ملاحظات |
|---|---|---|---|---|
| Student Web | `https://cms-platform-manus-student-web.vercel.app/` | **200** | **Externally verified** | استجابة 0.29s |
| Admin Web | `https://cms-platform-manus-admin-web.vercel.app/` | **200** | **Externally verified** | استجابة 0.47s |
| API `/health` (Render) | `https://cms-api-preview.onrender.com/health` | **200** `Healthy` | **Externally verified** | **الطلب الأول استغرق 24.8s (Render free plan cold start)**، الطلبات اللاحقة 0.25–0.7s |
| API root `/` | `https://cms-api-preview.onrender.com/` | **404** | Externally verified | متوقع (لا handler للجذر) |
| API `/api/v1/auth/admin/login` GET | — | **405** | Externally verified | المسار موجود ويتوقع POST |
| API `/api/v1/auth/admin/login` POST `{}` | — | **400** validation | Externally verified | رسالة عربية + RFC 9457 problem details + traceId |
| API `/api/v1/auth/admin/login` POST مزيف | — | **400** `AUTH_INVALID_CREDENTIALS` | Externally verified | دليل غير مباشر على وصول DB (الاستعلام نُفّذ دون خطأ اتصال) |
| CORS preflight من student-web origin | — | **204** + `access-control-allow-origin: https://cms-platform-manus-student-web.vercel.app` | Externally verified | CORS مُكوّن صحيح |
| CORS preflight من admin-web origin | — | **204** + `access-control-allow-origin: https://cms-platform-manus-admin-web.vercel.app` | Externally verified | CORS مُكوّن صحيح |
| CORS preflight من rogue origin (`evil.example.com`) | — | **204 بلا `access-control-allow-origin`** | Externally verified | المتصفح سيرفض (سلوك صحيح) |

### ملاحظات تشغيلية
- **Render free plan cold start**: أول طلب بعد خمول يستغرق ~25 ثانية. الطلبات اللاحقة سريعة. هذا قيد تشغيلي على free plan، يجب توثيقه كخطر P2 (تجربة مستخدم سيئة عند أول زيارة).
- **Deployment SHA غير قابل للربط المباشر**: لا أملك صلاحية قراءة Render Events/Logs أو Vercel deployments. آخر `Deploy live` موثَّق في `worklog/deployment-evidence-2026-08-28.md` كان للالتزام `2803595` (قبل `af1c636` بـ commit واحد). لا يمكن تأكيد أن الـ API الحي يتطابق مع `af1c636` أم `2803595` دون صلاحية قراءة سجلات Render.

---

## 3. حالة الخدمات الخارجية

### Neon PostgreSQL
| البند | الحالة | الدليل |
|---|---|---|
| Provider مُستخدم فعلاً | **Externally verified** (2026-08-28) | وثيقة `deployment-evidence-2026-08-28.md`: project `cms-production` (`patient-dew-46888054`)، 31 جدولاً مطابقاً لنموذج البيانات |
| وصول الـ API إلى Neon | **Externally verified (غير مباشر)** | رفض بيانات اعتماد مزيفة في `/auth/admin/login` بـ `AUTH_INVALID_CREDENTIALS` (لا 500) |
| الترحيلات مطبَّقة | **Externally verified** (2026-08-28) | EF Core drift check على فرع Neon مؤقت `br-misty-fire-b1lwifh8`: `No changes since last migration` |
| بيانات عدّية | 1 مدير، 2 طالب، 1 جامعة، 3 مواد، 2 محاضرات، 0 أسئلة، 0 اختبارات، **0 ملفات مكتبة**، 0 إشعارات، 84 سجل أمني | وثيقة evidence 2026-08-28 |
| Connection string في المصدر | **absent** | `appsettings.json: ConnectionStrings:PostgreSQL=""` |

### Upstash Redis
| البند | الحالة | الدليل |
|---|---|---|
| `UpstashRedisRestCacheService` مُنفّذ | **Implemented and proven in source** | `ExternalServices.cs` — HTTPS REST، يرمي `InvalidOperationException` عند غياب المتغيرات |
| مسجَّل في DI | **Implemented and proven in source** | `DependencyInjection.cs:55` |
| اتصال إنتاجي على Render مُثبت | **Unknown / not externally verified** | وثيقة evidence: *"No Upstash connection is configured in this session"* |
| `UPSTASH__REDIS__RESTURL` | **unknown** (يتطلب صلاحية قراءة Render env names) | — |
| `UPSTASH__REDIS__RESTTOKEN` | **unknown** (يتطلب صلاحية قراءة Render env names) | — |

### Cloudflare R2
| البند | الحالة | الدليل |
|---|---|---|
| `S3StorageService` مُنفّذ | **Implemented and proven in source** | `ExternalServices.cs` — PutObject/GetPreSignedURL/DeleteObject/GetObjectMetadata |
| مسجَّل في DI | **Implemented and proven in source** | `DependencyInjection.cs:56` |
| R2 endpoint configured | **Unknown** | `appsettings.json: Storage:S3:Endpoint=""` (فارغ)؛ تعليق الكود عام: *"Supports Supabase Storage and other S3-compatible providers"* |
| `STORAGE_S3_ENDPOINT` | **unknown** (يتطلب صلاحية قراءة Render env names) | — |
| `STORAGE_S3_BUCKET_NAME` | **unknown** | — |
| `STORAGE_S3_ACCESS_KEY` | **unknown** | — |
| `STORAGE_S3_SECRET_KEY` | **unknown** | — |
| Bucket exists | **External verification blocked** | يتطلب صلاحية قراءة Cloudflare R2 |
| Real upload | **Not executed** + **Implementation defect** | `GetSignedUrlAsync` يُعيد `HttpVerb.GET` دائماً (لا يوجد presigned PUT منفصل) — `ExternalServices.cs` |
| Real signed GET | **Not executed** | لا دليل |
| Anonymous denial | **Not executed** | لا دليل |
| Production file objects | **Missing** | Neon = 0 ملف مكتبة |
| استنتاج R2 الإجمالي | **EXTERNAL VERIFICATION REQUIRED** | وثائق المستودع نفسه (`GATE_2`, `EXTERNAL_R2_SCANNER_SECRETS_VERIFICATION_2026-08-20`) |

### JWT
| البند | الحالة |
|---|---|
| `JWT_SECRET` | **unknown** (يتطلب صلاحية قراءة Render env names) |

---

## 4. Deployment SHA من Vercel وRender

| المنصة | آخر deployment SHA موثَّق | المصدر | الحالة |
|---|---|---|---|
| Render (cms-api-preview) | `2803595` — `Deploy live` + `/health/live` HTTP 200 | وثيقة `deployment-evidence-2026-08-28.md` | **Externally verified (2026-08-28)** |
| Vercel student-web | `3224057` — `Ready` بعد دمج PR #2 | وثيقة `deployment-evidence-2026-08-28.md` | **Externally verified (2026-08-28)** |
| Vercel admin-web | مرتبط بـ main (بطاقة النجاح)، تفاصيل غير قابلة للقراءة (Vercel API 403) | وثيقة evidence | **Partially verified** |
| ربط الـ API الحي بـ `af1c636` (آخر الكود) | **Unknown** | يتطلب صلاحية قراءة Render Events/Logs | **Blocked** |
| ربط Vercel الحالي بـ commit | **Blocked** | Vercel API رجع 403 لقراءة deployments | **Blocked** |

**التعارض المُسجَّل**: آخر التزام في الكود هو `af1c636` (docs فقط: "include verification logs")، لكن آخر deployment موثَّق على Render كان للالتزام `2803595` (قبل docs commit). هذا يعني أن الـ API الحي قد يكون running على كود `2803595` أو أحدث — لا يمكن الجزم دون قراءة سجلات Render. الفحص الحي بتاريخ 2026-10-20 يؤكد أن الـ API **يعمل** لكن لا يحدد الإصدار.

---

## 5. الترحيلات (Migrations)

### قائمة الـ 14 ترحيلاً الموجودة في المصدر (مرتّبة زمنياً)
1. `20260818172242_Phase34SecuritySessionsAndEntitlements`
2. `20260818175606_Phase35AuthenticationDeviceHardening`
3. `20260819082719_Phase36OfflinePackageLifecycle`
4. `20260819082951_Phase36OfflineKeyReleaseToken`
5. `20260819085707_Phase36OfflineKeyReleaseLog`
6. `20260820101804_Phase44AuditCorrelationAndRetention`
7. `20260820112552_Phase45OfflineDevicePublicKey`
8. `20260820135033_Phase47WebBackendIntegrity`
9. `20260821220000_Phase49AdminRoleActivation`
10. `20260821230000_Phase50LectureMetadata`
11. `20260821233000_Phase51AccessCodeScopes`
12. `20260822150000_Phase52LectureCompletion`
13. `20260828014952_Phase53ExamManagementLifecycle`
14. `20260828020401_Phase53ExamAnalyticsTracking`

### الحالة
| البند | الحالة | الدليل |
|---|---|---|
| `ApplicationDbContextModelSnapshot.cs` موجود | **Implemented and proven in source** | `Migrations/ApplicationDbContextModelSnapshot.cs` |
| Drift بين النموذج والترحيلات | **None** — `No changes since last migration` | وثيقة evidence 2026-08-28 (EF drift check على فرع Neon مؤقت) |
| الترحيلات مطبَّقة على Neon الإنتاجي | **Externally verified (2026-08-28)** | Neon يحوي 31 جدولاً مطابقاً |
| ترحيلات معلّقة (pending) | **Unknown** | يتطلب قراءة `__EFMigrationsHistory` على Neon (صلاحية) |

---

## 6. نتيجة build / lint / unit tests / integration tests

> **قيد بيئي مهم**: `dotnet SDK` **غير مثبّت** ولا أملك صلاحية sudo لتثبيته. لذلك **لا يمكنني تشغيل build/tests للـ API محلياً**. الحكم على اختبارات الـ API محلياً = **Blocked (dotnet SDK unavailable)**. الأرقام المذكورة للـ API أدناه هي **عدّ مصدري** وليست نتيجة تشغيل.

### Student Web (`@cms/student-web`)
| العملية | النتيجة | التفاصيل |
|---|---|---|
| `pnpm install` | **PASS** | 601 حزمة، 6.1s |
| `pnpm build` | **PASS** | tsc + vite build ناجح، PWA generateSW، 34 precache entries (692 KiB) |
| `pnpm lint` | **FAIL** | `eslint . --ext ts,tsx --max-warnings=0` — الـ flag `--ext` **مُهجَر في ESLint 9**؛ الـ script نفسه معطوب ويحتاج إصلاح |
| `pnpm test --run` | **PASS** | 11/11 tests (3 test files): `component.test.tsx` (7)، `offline-envelope.test.ts` (2)، `identity-installation.test.ts` (2) |

### Admin Web (`@cms/admin-web`)
| العملية | النتيجة | التفاصيل |
|---|---|---|
| `pnpm install` | **PASS** | (مشترك workspace) |
| `pnpm build` | **PASS** | tsc + vite build ناجح، 311 KiB main bundle (89 KiB gzip) |
| `pnpm lint` | **FAIL** | نفس عيب `eslint . --ext` المُهجَر |
| `pnpm test` | **Missing** | **لا يوجد `test` script في package.json** ولا إطار اختبار (لا Vitest ولا Playwright في devDeps). **admin-web بلا أي اختبارات** |

### Backend API (`apps/api` — ASP.NET Core 9)
| العملية | النتيجة | التفاصيل |
|---|---|---|
| `dotnet build` | **Blocked** | dotnet SDK غير مثبّت |
| `dotnet test` | **Blocked** | dotnet SDK غير مثبّت |
| عدّ مصدري للاختبارات | 149 test case | 145 `[Fact]` + 1 `[Theory]` بـ 4 `[InlineData]` = 149 (مطابق لادعاء المستندات) عبر 36 ملفاً في `CMS.Tests` |
| اختبارات HTTP حقيقية مع JWT | **Partially implemented** | 18 اختبار entitlement/BOLA في `SignedEntitlementHttpIntegrationTests.cs` لكنها تستخدم `Phase35TestAuthenticationHandler` **يتجاوز التحقق الحقيقي من توقيع JWT** |
| اختبارات PostgreSQL حقيقية | 18 فقط من 149 تفتح اتصال Npgsql (gated على `CMS_PHASE34_TEST_POSTGRES`)؛ 131 تستخدم EF InMemory | — |
| آخر نتيجة موثَّقة | 149/149 PASS على فرع Neon مؤقت `br-misty-fire-b1lwifh8` (2026-08-28) | وثيقة `docs/evidence/phase_exam_management/FINAL_REVIEW.md` — **لكنها markdown بشري، لا تقرير TRX/JUnit آلي مُودَع** |

### Playwright E2E (`apps/student-web/e2e/`)
| البند | الحالة |
|---|---|
| ملفات e2e | `phase39-otp-deferred.spec.ts` + `phase39-identity.spec.ts` |
| عدد tests داخلية | ~4 + ~23 = ~27 test case (عدّ من المصدر) |
| الإطار | `@playwright/test 1.58.2`، config كروميوم فقط |
| تنفيذ ضد backend منشور | **Not executed** — وثيقة `PHASE_48_FINAL_PRODUCTION_GATE_REPORT_2026-08-20.md` تؤكد لم تُنفَّذ ضد منشور |

---

## 7. قائمة endpoints الفعلية (من المصدر)

### 7.1 Admin endpoints (5 controllers)
| Controller | Endpoints |
|---|---|
| `AdminAuthController` | `POST login`، `GET me/permissions`، `POST 2fa/enable`، `POST 2fa/disable` (4) |
| `AdminExamsController` | `GET`، `GET {id}`، `GET question-candidates`، `POST`، `PUT {id}`، `PUT {id}/questions`، `POST {id}/publish`، `POST {id}/archive`، `DELETE {id}`، `GET {id}/results` (10) |
| `AdminQuestionsController` | `GET`، `GET {id}` (2 — **list/get فقط**؛ الإنشاء/التعديل/الحذف في `QuestionsController` العام) |
| `AdminContentController` | `GET questions`، `GET exams`، `GET files`، `GET academic/subjects/{subjectId}/lectures` (4 — للوحة المحتوى) |
| `AdminDashboardController` | `GET dashboard`، `GET recent-activity`، `GET revenue`، `GET student-growth`، `GET top-subjects`، `GET reports/summary`، `GET students`، `POST students/{id}/ban`، `POST students/{id}/unban`، `POST students/{id}/revoke-sessions`، `GET admins`، `GET admins/{id}`، `POST admins`، `PUT admins/{id}`، `POST admins/{id}/status`، `POST admins/{id}/reset-password`، `DELETE admins/{id}`، `PUT roles/{id}/permissions`، `GET roles`، `POST roles` (20+) |

### 7.2 Questions admin endpoints (في `QuestionsController` العام، محمية بـ `[Authorize(Roles="admin,super_admin")]` + `CanManageAsync`)
| Endpoint | الحماية |
|---|---|
| `POST /api/v1/questions` (create) | `[Authorize(Roles="admin,super_admin")]` + `HasPermissionAsync(Resources.Questions, Create)` + `IsInScopeAsync(subject)` |
| `PUT /api/v1/questions/{id}` (update) | نفس الثلاثية |
| `DELETE /api/v1/questions/{id}` (soft delete) | نفس الثلاثية |
| `POST /api/v1/questions/{id}/publish` | نفس الثلاثية |
| `POST /api/v1/questions/{id}/archive` | نفس الثلاثية |
| `POST /api/v1/questions/import` (bulk) | نفس الثلاثية |

### 7.3 Library endpoints (في `LibraryController`)
| Endpoint | الدور المطلوب |
|---|---|
| `GET subject/{subjectId}` | `[Authorize]` (student + entitlement) |
| `GET lectures/{lectureId}/text-files` | `[Authorize]` |
| `GET {id}` | `[Authorize]` |
| `POST {id}/access` | `[Authorize]` + `X-Entitlement` + `X-Installation-Id` |
| `POST {id}/view` | `[Authorize]` |
| `POST upload-url` | `[Authorize(Roles="admin,super_admin")]` + `HasPermissionAsync(Resources.Library)` |
| `POST complete-upload` | admin |
| `PUT {id}` | admin |
| `POST {id}/publish` | admin |
| `POST {id}/archive` | admin |
| `DELETE {id}` | admin |

### 7.4 باقي الـ Controllers (موجودة في المصدر، 21 controller إجمالاً)
`AuthController`, `AcademicController`, `EntitlementsController`, `PlayIntegrityController`, `OfflineController`, `FavoritesController`, `StatsController`, `NotificationsController`, `SubscriptionsController`, `SecurityController`, `StudentSecurityEventsController`, `StudentProfileController`, `StudentSearchController`, `ExamsController` (student).

### 7.5 Health endpoints (موثَّقة حياً)
| Endpoint | النتيجة |
|---|---|
| `GET /health` | **200 `Healthy`** (Externally verified 2026-10-20) |
| `GET /health/live` | **200** (موثَّق 2026-08-28) |
| `GET /` | 404 (متوقع) |

---

## 8. قائمة الوظائف المنفذة / الجزئية / المفقودة

### 8.1 المنفذة والمُثبتة في المصدر (Implemented and proven in source)
- Clean Architecture (Domain/Application/Infrastructure/Api/Tests).
- 21 Controller + 14 migration + ApplicationDbContext snapshot.
- JWT (HS256, zero skew, ≥32 byte fail-fast) + refresh family rotation + reuse detection.
- Argon2id كلمات المرور (m=65536,t=3,p=2) + BCrypt legacy upgrade.
- `SessionValidationMiddleware` (re-check per request).
- Signed entitlements (HMAC-SHA256, fixed-time compare, scope re-check).
- BOLA per-object (identity من JWT sub).
- RBAC + ABAC (`PermissionHandler`, `ScopeHandler`, 12 entity types).
- Audit/security logs (`SecurityLog` 40 events × 3 severities, batching BackgroundService, redaction, retention 365d).
- Correlation IDs (`CorrelationIdMiddleware` + `x-correlation-id` header verified live).
- Rate limiting (partitioned: login 5/5min, otp 3/5min, admin 15/min, etc.).
- Security headers (`SecurityHeadersMiddleware` + verified in `/health` response: CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy).
- Exams (server-authoritative, snapshots, resume/idempotency) — Phase53.
- Student Web (React 19 + Vite + PWA, 11 unit tests passing).
- Admin Web (React 19 + Vite, build passing).

### 8.2 المُنفذة لكن غير مُثبتة خارجياً (Implemented but not externally verified)
- Upstash Redis connection production (implementation موجود، لا دليل على ضبط المتغيرات على Render).
- Offline packages (Android) — `Features.OfflineEnabled=false`، `FailClosedPlayIntegrityService` يعيد false.
- Firebase push notifications — `FirebaseAdmin` في csproj لكن `PlayIntegrity.Enabled=false`.
- 149/149 backend tests — عددياً صحيح لكن 131/149 على InMemory + JWT bypassed، ولا تقرير آلي مُودَع.
- Browser E2E (Playwright) — 27 test case مكتوبة، لم تُنفَّذ ضد منشور.

### 8.3 المُنفذة جزئياً (Partially implemented)
- مسار المكتبة الكامل: endpoints موجودة لكن **مركز UI لإدارة المكتبة غير موجود إطلاقاً في admin-web** (`type View` لا يشمل `library`/`files`).
- CI/CD: workflows موجودة (5 ملفات في `.github/workflows/`) لكن `health-check.yml` run #261 فشل billing، و`ci.yml` deploy jobs تستهدف Railway (لا Render).
- `docker-compose.prod.yml`: موجود لكن يستخدم أسماء متغيرات (`Cloudflare__R2__*`, `ConnectionStrings__Redis`) **لا تطابق** ما يقرأه الـ API (`Storage:S3`, `Upstash:Redis`).
- StatsController scope filtering: معظم endpoints محمية، لكن `GetLeaderboard` يقبل `scope`/`scopeId` عشوائي **بلا فحص استحقاق** (cross-cohort leak).

### 8.4 الموثقة/المخططة فقط (Documented/planned only)
- Cloudflare R2 كمزود تخزين إنتاجي (`DECISIONS.md` قرار، CSP في `vercel.json` تسمح بـ `*.r2.cloudflarestorage.com`، لكن endpoint فارغ).
- Watermark server-side للـ PDF (DTO موجود، لا توليد).
- HTML sanitization server-side (لا مكتبة).
- Custom domain `api.cms.example.com` / `app.cms.example.com` (لا يُحل publicly).
- `render.yaml` (غير موجود — إعداد Render يدوي).

### 8.5 المفقودة (Missing)
- **مزود فحص فيروسي إنتاجي** — `FailClosedFileScanner` فقط يعيد `not_configured`. لا ClamAV ولا أي مزود. النتيجة: مسار المكتبة مُقفل fail-closed، **لا ملف يمكن أن يصل لحالة `Published`**.
- **Presigned PUT صحيح** — `GetSignedUrlAsync` يُعيد GET verb دائماً (عيب implementation).
- **مركز إدارة المكتبة في admin-web** — لا UI للرفع/الفحص/النشر/الأرشفة.
- **اختبارات admin-web** — صفر.
- **اختبارات HTTP حقيقية بـ JWT حقيقي** — تتجاوز التحقق من التوقيع.
- **تقرير اختبار آلي مُودَع** (TRX/JUnit) — الدليل markdown بشري فقط.
- **`render.yaml`** — لا IaC لـ Render.
- **HSTS / COOP / COEP في production** — `ContentSecurityPolicyMiddleware` معرّف لكن **غير مُسجَّل** في `Program.cs`.
- **`AuditLoggingMiddleware`** — معرّف لكن **غير مُسجَّل**.
- **فحص `Admin.Role.IsActive` في `SessionValidationMiddleware`** — مسؤول موقوف يبقى صالحاً ≤15 دقيقة.
- **تسجيل admin wrong-password login و2FA-disable في `SecurityLogs`**.
- **`OfflineController.SyncAnswers` entitlement guard**.
- **OTP constant-time comparison** (يستخدم `string !=`).
- **`ScopeHandler`** — stub معرّف لكن غير مستخدم بأي policy (dead code).

### 8.6 محظورة (Blocked)
- ربط الـ API الحي بـ commit `af1c636` — يتطلب صلاحية قراءة Render Events/Logs.
- ربط Vercel deployments الحالية بـ commit — Vercel API رجع 403.
- تشغيل build/tests للـ API محلياً — `dotnet SDK` غير مثبّت ولا أملك sudo.
- قراءة Render environment variable names — يتطلب صلاحية قراءة.
- قراءة Cloudflare R2 buckets metadata — يتطلب صلاحية قراءة.
- تنفيذ staging R2 test (PutObject + signed GET + Delete) — يتطلب صلاحية staging write.
- Browser E2E بحساب طالب/مدير حقيقي — يتطلب حسابات اختبار.

---

## 9. المخاطر حسب الأولوية (P0/P1/P2)

### P0 — حواجب إنتاجية (blockers)
1. **لا مزود فحص فيروسي إنتاجي** → مسار المكتبة مُقفل تماماً. لا ملف يصل `Published`.
2. **`GetSignedUrlAsync` يُعيد GET verb للرفع** → الرفع المباشر إلى التخزين معيب برمجياً ولن يعمل مع أي مزود S3-compatible.
3. **Cloudflare R2 غير مُثبت الاستخدام** → endpoint فارغ، 0 ملف في Neon، `EXTERNAL VERIFICATION REQUIRED`.
4. **مركز إدارة المكتبة في admin-web مفقود إطلاقاً** → حتى لو أُصلح R2+scanner، لا يستطيع المدير رفع/نشر ملف من الواجهة.
5. **`StatsController.GetLeaderboard` بلا فحص استحقاق على scope/scopeId** → تسريب ترتيب عبر المواد/المجموعات.
6. **3 middleware معرّفة لكن غير مُسجَّلة** (`ContentSecurityPolicyMiddleware`, `AuditLoggingMiddleware`, `AuthRateLimitMiddleware`) → أمان أضعف مما يوحي الكود.
7. **`Admin.Role.IsActive` لا يُفحَص في `SessionValidationMiddleware`** → مسؤول موقوف يبقى صالحاً ≤15 دقيقة.

### P1 — مخاطر أمنية/هندسية مهمة
8. **admin-web بلا أي اختبارات** + lint script معطوب (`--ext` مُهجَر).
9. **lint script معطوب في student-web أيضاً** (نفس العيب).
10. **Admin wrong-password login و2FA-disable غير مُسجَّلَين في `SecurityLogs`** → فجوة في تتبّع أعلى ممثل امتيازاً.
11. **`OfflineController.SyncAnswers` يفتقد `RequireEntitlementAsync`** الذي لدى `DownloadPackage`.
12. **OTP comparison غير constant-time**.
13. **لا HTML sanitization على الخادم** (XSS surface).
14. **لا watermark server-side** (overlay client-side فقط).
15. **`docker-compose.prod.yml` أسماء متغيرات لا تطابق الـ API**.
16. **131/149 اختباراً على EF InMemory + JWT bypassed في HTTP tests** → ثقة مفرطة.
17. **لا تقرير اختبار آلي مُودَع**.
18. **Render free plan cold start ~25s** (تجربة مستخدم سيئة عند أول زيارة).

### P2 — نضج هندسي / تنظيف
19. **`render.yaml` مفقود** → لا IaC لـ Render (إعداد يدوي غير قابل لإعادة الإنتاج).
20. **CI GitHub Actions معطّل** (billing/spending limit).
21. **`railway.toml` + `apps/api/railway.json` leftover** (Railway ليس المضيف).
22. **`api.cms.example.com` غير مُحلّ** (الرابط الإنتاجي الوحيد هو `cms-api-preview.onrender.com` على free plan).
23. **Dead code**: `ScopeHandler` stub، `apps/api/entrypoint.sh` orphaned، `scripts/ci/summarize-trivy.mjs` orphaned.
24. **`launch.yml` يستهدف `api.cms.example.com`/`app.cms.example.com` غير المُحلَّة**.
25. **`student-web/vercel.json` typo**: SPA rewrite `"destination": "/index"` (يجب `/index.html`).
26. **`admin-web/vercel.json` مينيمالي** (لا CSP، لا cache rules) — أضعف من student-web.
27. **12 من 21 controller بلا HTTP test**.
28. **`PROJECT_STATUS.md` يسجل `PRODUCTION NO-GO — BLOCKERS REMAIN`** (يتوافق مع تقييمي).

---

## 10. الصلاحيات المطلوبة للمرحلة التالية (B)

كل صلاحية **للقراءة فقط** ما لم يُذكر خلاف ذلك. لا أطلب كلمات مرور أو قيماً سرية عبر المحادثة.

| الفجوة | الصلاحية المطلوبة | الغرض | الكتابة؟ |
|---|---|---|---|
| ربط الـ API الحي بـ commit | قراءة Render Events + Logs (read-only) | تأكيد آخر deploy SHA | لا |
| ربط Vercel deployments بـ commit | قراءة Vercel deployments + build logs | ربط URL بـ commit | لا |
| قراءة Render env names | قراءة Render Environment variable **names only** (دون values) | تأكيد وجود `STORAGE_S3_*` و`UPSTASH__REDIS__*` و`JWT_SECRET` | لا |
| R2 bucket exists؟ | قراءة Cloudflare R2 buckets + object metadata (read-only) | تأكيد وجود bucket وسياسة الوصول | لا |
| R2 staging test | إنشاء object اختبار قصير العمر في **bucket staging غير إنتاجي** (PutObject + GetMetadata + signed GET + Delete، بملف `audit-probe-<ts>.txt`) | تنفيذ Owner closure procedure من `GATE_2` | **نعم — staging write فقط** (لا production، لا bucket policy change) |
| Neon migrations مطبَّقة؟ | قراءة Neon `__EFMigrationsHistory` + schema (read-only، دون connection string) | تأكید الترحيلات | لا |
| Upstash مُفعّل؟ | قراءة Upstash database metadata + health/usage (read-only، دون REST token) | تأكيد PING | لا |
| Browser E2E | حسابات اختبار طالب + مدير غير حقيقية | تنفيذ golden path عبر الإدارة | لا (لكن يستهلك بيانات اختبار) |
| GitHub push + PR | GitHub write للمستودع والـ branches | رفع دفعات الإصلاح | **نعم — بعد موافقة منفصلة لكل دفعة** |
| Vercel deploy | Vercel write (deploy) | نشر admin-web المُحدَّث | **نعم — بعد موافقة منفصلة** |
| Render deploy | Render write (deploy + env vars) | نشر API المُحدَّث + ضبط env vars | **نعم — بعد موافقة منفصلة** |
| Neon migration production | Neon write على branch الإنتاج | تطبيق ترحيل SQL | **نعم — بعد عرض SQL + الأثر + rollback plan + موافقة صريحة** |
| dotnet SDK محلياً | تثبيت dotnet SDK 9 على بيئة التحليل | تشغيل build/tests للـ API محلياً | **نعم — يحتاج sudo (لا أملكه حالياً)** |

### بيان الأسرار (لن تُطبع القيم أبداً)
```
R2_ENDPOINT:       unknown (يتطلب قراءة Render env)
R2_BUCKET:         unknown
R2_ACCESS_KEY:     unknown
R2_SECRET_KEY:     unknown
UPSTASH_REST_URL:  unknown
UPSTASH_REST_TOKEN: unknown
NEON_CONNECTION:   unknown
JWT_SECRET:         unknown
```
من المصدر وحده: **جميعها `absent`** في `appsettings.json` و`<set-in-secret-manager>` في `.env.*.example`.

---

## 11. الملفات التي يُمنع تعديلها قبل قرار المستخدم

هذه الملفات **محمية** ولا تُعدَّل إلا بعد موافقة صريحة مع عرض الأثر الكامل:

### ملفات الإنتاج والإعدادات الحرجة
- `prisma/` أو أي schema (لا يوجد prisma هنا، لكن `apps/api/src/CMS.Infrastructure/Persistence/Migrations/*.cs` — **أي ترحيل جديد أو تعديل**).
- `apps/api/src/CMS.Api/appsettings.json` و`appsettings.Production.json` (إن وُجد).
- `apps/api/src/CMS.Api/Program.cs` (تسجيل middleware، policies، CORS origins).
- `apps/api/src/CMS.Infrastructure/DependencyInjection/DependencyInjection.cs` (تسجيل services).
- `docker-compose.yml` و`docker-compose.prod.yml`.
- `railway.toml` و`apps/api/railway.json` (leftover — لا تُحذف حتى إثبات عدم الاستخدام).
- `apps/api/Dockerfile` (يستخدمه Render فعلاً).
- `apps/student-web/vercel.json` و`apps/admin-web/vercel.json`.
- `apps/api/src/CMS.Infrastructure/Services/ExternalServices.cs` (S3StorageService + Upstash — تعديلها ي afecte النشر).
- `apps/api/src/CMS.Infrastructure/Services/FailClosedFileScanner.cs` (استبدالها بـ scanner حقيقي قرار معماري).
- `.github/workflows/*.yml`.
- أي ملف في `docs/security/` (وثائق قرارات أمنية).
- أي ملف في `worklog/` أو `docs/evidence/` (أدلة تاريخية).
- `PROJECT_STATUS.md` و`DECISIONS.md` و`CHANGELOG.md` (وثائق قرارات).

### بيانات الإنتاج
- **أي secret** (JWT_SECRET، R2 keys، Upstash token، Neon connection string) — لا تُعدَّل إلا بـ secret rotation plan معتمد.
- **Neon الإنتاجي** — لا migration إلا بعد backup + rollback plan + موافقة.
- **Cloudflare R2 bucket policy** — لا تغيير دون موافقة منفصلة.
- **Render environment variables** — لا تعديل دون عرض أسماء المتغيرات والتأثير.
- **Vercel environment variables** — لا تعديل دون عرض القيم العامة فقط.

### Feature flags (لا تُفعَّل/تُعطَّل دون قرار)
- `Features.OtpEnabled`
- `Features.OfflineEnabled` / `OfflineAesGcmImplemented` / `OfflineManifestImplemented` / `OfflineKeyReleaseImplemented` / `OfflinePackageIssuanceImplemented` / `OfflineTrustedClientImplemented`
- `Security.PlayIntegrity.Enabled`

### ملفات تاريخية (لا تُحذف حتى إثبات عدم الاستخدام)
- `railway.toml`, `apps/api/railway.json`, `apps/api/Procfile`, `apps/api/entrypoint.sh`
- `scripts/ci/summarize-trivy.mjs`
- `apps/android/` (تطبيق الهاتف — مرحلة F لاحقاً)

---

## خلاصة خط الأساس

| المؤشر | القيمة |
|---|---|
| commit SHA المُحلَّل | `af1c6361e51f3ab240380e1fa70a35cc88ccbb67` (2026-08-28) |
| local vs origin | **متطابقان** (نظيف، 0 خلف) |
| Student Web | **Externally verified** (200) + build PASS + lint FAIL + tests 11/11 PASS |
| Admin Web | **Externally verified** (200) + build PASS + lint FAIL + **tests Missing** |
| API on Render | **Externally verified** (200 `Healthy`) + cold start ~25s على free plan |
| Neon | **Externally verified** (31 جدولاً، 0 ملف مكتبة، 84 سجل أمني) |
| Upstash | **Implemented in source, production connection Unknown** |
| R2 | **EXTERNAL VERIFICATION REQUIRED** (endpoint فارغ، 0 ملف) |
| Presigned PUT | **Defect** (يُعيد GET verb) |
| Malware scanner | **Missing** (FailClosedFileScanner = not_configured) |
| Admin Library UI Center | **Missing** (لا `library`/`files` في `type View`) |
| Backend tests | 149 test case (عدّ مصدري)، **Blocked محلياً** (dotnet SDK غير متوفر) |
| Playwright E2E | ~27 test case مكتوبة، **Not executed** ضد منشور |
| CI/CD | **Partially implemented / Failing** (billing-blocked) |
| `render.yaml` | **Missing** |
| `PROJECT_STATUS.md` | `PRODUCTION NO-GO — BLOCKERS REMAIN` |
| **حكم خط الأساس** | **NO-GO** — يوافق حكم المستودع نفسه |

---

## الخطوة التالية المطلوبة

هذا التقرير يُغلق المرحلة A. **لم أُجرِ أي تعديل على الكود أو migration أو نشر أو تغيير secrets أو حذف ملفات**.

المرحلة التالية (B1) تتطلب موافقة المستخدم على أول دفعة إصلاح. سأعرض في الرسالة التالية:
- ما الذي سيُصلَح في الدفعة الأولى.
- لماذا هو أولويته.
- الملفات والمنصات المتأثرة.
- الصلاحيات المطلوبة.
- الاختبارات التي ستُنفَّذ.
- هل تحتاج GitHub push / Render deploy / Vercel deploy / Neon migration.

**بانتظار تأكيد المستخدم للانتقال إلى المرحلة B.**
