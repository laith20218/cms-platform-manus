# Phase 39 — Same Identity Audit and Phase 40 Gate Decision

**التاريخ:** 19 أغسطس 2026  
**النطاق المنفذ:** تدقيق وإصلاح **Phase 39 — Same Identity** فقط. لم يبدأ تنفيذ Phase 40 لأن بوابة الانتقال لم تتحقق بالكامل.  
**الحكم التنفيذي:** **PARTIAL — لا تبدأ Phase 40 بعد.**

> هذا التقرير يفرّق بين السلوك الذي أُثبت ببناء أو اختبار فعلي، وبين السلوك الذي فُحص في الكود فقط، وبين ما بقي غير متحقق. لا يعني نجاح البناء أو وجود endpoint أن السيناريو كامل.

## 1. Executive Summary

كان مسار الهوية في تطبيق الطالب يحتوي على عيوب متقاطعة بين الواجهة والـBackend. أخطرها كان إنشاء قيمة `device fingerprint` متغيرة بسبب إلحاق `Date.now()` بها في كل استدعاء، مع وجود مسارات API متباينة في `AuthProvider` و`authApi`، وفقدان حالة `user` في React بعد نجاح OTP. كذلك كان Backend يسمح لمسار OTP الغائب عن `installationId` بإنشاء قيمة `web-{Guid}` جديدة، وهي مخالفة مباشرة لمبدأ Same Identity.

تمت معالجة هذه العيوب مع اختبارات وإعادة بناء فعلية. أصبحت هوية التثبيت في الواجهة قيمة عشوائية ثابتة بصيغة `web-<32 hex>` في `localStorage`، وتُرسل عبر `X-Installation-Id` و`X-Device-Fingerprint`. أصبحت مسارات login وOTP وrefresh وlogout وcurrent user مركزية في `authApi`، بينما صار `AuthProvider` مسؤولاً عن حالة React فقط. كما أُضيف `GET /api/v1/auth/me` لاستعادة الهوية المعتمدة بعد إعادة تحميل الصفحة.

| مجال الدليل | النتيجة الفعلية | التصنيف |
|---|---:|---|
| Backend Release build | ناجح مع تحذيرين قديمين لـ`ISystemClock` ولا توجد أخطاء | VERIFIED |
| Backend suite مع PostgreSQL مؤقتة | **75/75 PASS**، بلا skipped tests | VERIFIED |
| Frontend Vitest | **9/9 PASS** | VERIFIED |
| Frontend production build | ناجح، مع `0` source maps و`0` مراجع `api-cache` في `dist` | VERIFIED |
| دورة signup → OTP → login كاملة عبر HTTP وواجهة متصفح حقيقية | لم تُشغّل end-to-end | UNVERIFIED |
| استمرارية الهوية عبر multiple tabs وإعادة فتح المتصفح | لم تُشغّل على متصفح فعلي | UNVERIFIED |

## 2. Phase 39 Status

**الحالة: PARTIAL.**

السلسلة الأساسية للهوية صارت متسقة في الكود ومثبتة جزئياً بالاختبارات. الـBackend يربط session بـ`UserId + InstallationId + SessionId`، ويحفظ refresh token كـSHA-256 hash، ويعيد التحقق من session والـinstallation عند كل طلب محمي. الواجهة تحفظ access/refresh tokens في `sessionStorage`، وتحفظ installation ID غير الحساس في `localStorage` حتى يبقى ثابتاً بين reloads. [SessionService:35–164](../../apps/api/src/CMS.Infrastructure/Security/SessionService.cs) [AuthProvider:31–82](../../apps/student-web/src/app/providers/AuthProvider.tsx)

مع ذلك، لا يمكن تحويل الحالة إلى PASS قبل إثبات عملية المستخدم الحقيقية من المتصفح إلى API إلى قاعدة البيانات ثم العودة إلى React state. اختبارات الوحدة وHTTP الحالية لا تغطي كل ذلك في رحلة واحدة، ولا يوجد دليل تشغيلي لحالات tabs المتعددة أو انقطاع الشبكة أو إعادة فتح التطبيق. ولذلك حُجبت Phase 40 امتثالاً لقاعدة البوابة.

## 3. تعريف Same Identity كما نُفذ فعلياً

| طبقة النظام | المعرّف | مكان الإنشاء أو التخزين | كيفية التحقق | الدليل |
|---|---|---|---|---|
| Web installation | `web-<32 hex>` | `localStorage['cms-device-fingerprint']` | يعاد استعماله لكل طلب ولا يقبل إلا الصيغة الحالية في الواجهة | `src/utils/index.ts` واختبار `identity-installation.test.ts` |
| هوية المستخدم | `Student.Id` | قاعدة البيانات وclaims (`sub`) | `GET /api/v1/auth/me` يستخرج `sub` ويعيد `UserDto` | `AuthController.Me` واختبار HTTP |
| الجلسة | `UserSession.Id` / claim `sid` | `user_sessions` | `SessionValidationMiddleware` يستدعي `SessionService.IsActiveAsync` | `SessionService.IsActiveAsync` |
| ربط التثبيت | `InstallationId` | `user_installations` و`device_bindings` | مطابقة constant-time مع session والتحقق من binding فعال | `SessionService.RotateAsync` و`IsActiveAsync` |
| refresh token | قيمة opaque | العميل فقط؛ hash في DB | rotation أحادي الاستخدام وإبطال family عند reuse | `SessionService.RotateAsync` |

## 4. المشاكل المكتشفة والإصلاحات وإعادة التحقق

| # | المشكلة والجذر | الملفات المتأثرة | الإصلاح المنفذ | إعادة التحقق |
|---:|---|---|---|---|
| 1 | `generateDeviceFingerprint()` كان يضيف `Date.now()`، فينشئ هوية جديدة في كل login. | `student-web/src/utils/index.ts` | استبدالها بـ`getOrCreateInstallationId()`؛ توليد Web Crypto عشوائي ثابت وتخزينه محلياً. | Vitest: اختباران يثبتان الإنشاء والاسترجاع واستبدال القيمة غير الصالحة. |
| 2 | `AuthProvider` استخدم `/api/v1/...` فوق `baseURL=/api/v1`، مع استدعاء `/students/me` غير الموجود. | `AuthProvider.tsx`, `api-client.ts` | توحيد routes في `authApi` وإضافة `authApi.me()` و`GET /api/v1/auth/me`. | Backend HTTP test `CurrentIdentityHttpIntegrationTests` ضمن 75/75؛ frontend build PASS. |
| 3 | OTP كان ينشئ installation fallback عشوائياً عند غياب الطلب. | `AuthDtos.cs`, `AuthCommands.cs`, `AuthHandlers.cs`, `AuthValidators.cs` | `InstallationId` أصبح إلزامياً، وvalidator يفرض 16–200 حرف، وأزيل fallback `web-{Guid}`. | اختبار `VerifyOtpIdentityTests` يثبت تمرير installation نفسه إلى `ISessionService.CreateAsync`. |
| 4 | OTP وضع tokens مباشرة في `sessionStorage` دون تحديث `AuthProvider.user`، فتفشل `ProtectedRoute` في الانتقال. | `VerifyOtpPage.tsx`, `AuthProvider.tsx` | إضافة `completeAuthentication()` مركزية تستخدمها login وOTP لتحديث token وuser state معاً. | TypeScript/Vite build PASS؛ React end-to-end ما زال UNVERIFIED. |
| 5 | `usePermission` فحص access token في `localStorage` رغم انتقال المصادقة إلى `sessionStorage`. | `usePermission.tsx` | توحيد القراءة على `sessionStorage`. | Frontend build وVitest PASS. |
| 6 | التسجيل أرسل GUIDs صفرية hardcoded كبيانات أكاديمية مزيفة. | `RegisterPage.tsx` | إزالة القيم الوهمية وإضافة selectors تعتمد على `academicApi`. | Frontend build PASS؛ اختيار القيم من API في متصفح فعلي UNVERIFIED. |
| 7 | hierarchy الأكاديمية المطلوبة قبل login كانت تتطلب authorization، فلا يمكن تعبئة التسجيل الحقيقي. | `AcademicController.cs` | إتاحة read-only endpoints للجامعات والكليات والسنوات بـ`AllowAnonymous` فقط؛ بقيت create/update/delete محمية. | Backend build PASS؛ HTTP integration مستقل لهذه القراءة UNVERIFIED. |
| 8 | source maps وAPI runtime cache ظهرا مجدداً في Vite، بما يعرّض كوداً أو response cache للتسريب. | `vite.config.ts` | `sourcemap: false` وإزالة runtime cache الخاص بالـAPI. | production build: `SOURCE_MAPS=0` و`API_CACHE_REFERENCES=0`. |
| 9 | PostgreSQL integration كان ينفذ `return` عند غياب connection string ويظهر كـPASS زائف. | `SessionServicePostgresIntegrationTests.cs` | تحويله إلى `BLOCKED` صريح عند الغياب، ثم تشغيله فعلياً على PostgreSQL مؤقتة معزولة. | full Backend suite: 75/75 PASS على DB مؤقتة؛ cleanup نجح. |

## 5. API Audit — Identity and Session Surface

| Endpoint | Method | Frontend caller | Backend | Contract | Auth | اختبار فعلي | الحالة |
|---|---|---|---|---|---|---|---|
| `/api/v1/auth/register` | POST | `authApi.register` | `AuthController.Register` → `RegisterCommand` | أسماء الحقول متطابقة؛ IDs أكاديمية من selectors بدل mock | Anonymous | handler موجود ضمن suite؛ لا HTTP E2E | PARTIALLY VERIFIED |
| `/api/v1/auth/verify-otp` | POST | `authApi.verifyOtp` | `VerifyOtpCommandHandler` | `phone`, `otpCode`, `installationId` إلزامية ومتطابقة | Anonymous | unit test للـinstallation ضمن 75/75 | PARTIALLY VERIFIED |
| `/api/v1/auth/login` | POST | `authApi.login` | `LoginCommandHandler` | `deviceFingerprint` صار stable installation ID | Anonymous | handler/session paths مثبتة، لا HTTP login كامل | PARTIALLY VERIFIED |
| `/api/v1/auth/me` | GET | `authApi.me` عند hydration | `AuthController.Me` | `UserDto` متوافق مع state الواجهة | Student JWT | HTTP integration PASS | VERIFIED |
| `/api/v1/auth/refresh` | POST | `authApi.refresh` وaxios interceptor | `RefreshTokenCommandHandler` | body `refreshToken`، headers installation | Anonymous مع opaque refresh token | PostgreSQL rotation/reuse PASS | PARTIALLY VERIFIED |
| `/api/v1/auth/logout` | POST | `authApi.logout` | `LogoutCommandHandler` | يعتمد `sid` في JWT | JWT | PostgreSQL explicit revoke PASS | PARTIALLY VERIFIED |
| `/api/v1/universities` وما يتبعها | GET | `academicApi` | `AcademicController` | `items`, ثم arrays للكليات والسنوات | Anonymous، read-only | build فقط في هذه الجولة | UNVERIFIED |

## 6. Logical Consistency Scenarios

| السيناريو | النتيجة | الأساس |
|---|---|---|
| مستخدم جديد ينشئ installation ID | VERIFIED | اختبار Vitest للاستقرار والصيغة. |
| user يعيد تحميل الصفحة مع access token | PARTIALLY VERIFIED | `authApi.me()` يعيد hydration code؛ endpoint HTTP PASS؛ لا browser E2E. |
| access token منتهٍ وrefresh صالح | PARTIALLY VERIFIED | interceptor + rotation code وPostgreSQL session lifecycle PASS؛ لا HTTP/browser refresh test. |
| refresh token reused | VERIFIED | PostgreSQL integration يثبت family revocation. |
| logout ثم استخدام session القديمة | VERIFIED على service layer | PostgreSQL integration يثبت `IsActiveAsync == false` بعد revocation. |
| identity موجودة دون session | PARTIALLY VERIFIED | الواجهة لا تعيد user بدون token؛ لم يُشغّل browser case. |
| session مع installation مختلفة | VERIFIED على service layer | `RotateAsync` و`IsActiveAsync` يتحققان من installation؛ lifecycle DB test. |
| مستخدمان يشتركان في installation ID | PARTIALLY VERIFIED | binding/session مقيدان بـuser ID في DB؛ لا multi-account HTTP test. |
| tabs متعددة | UNVERIFIED | tokens في `sessionStorage` لكل tab، لكن لم يُشغّل scenario متصفح حقيقي. |
| API unavailable أو response ناقص | PARTIALLY VERIFIED | interceptor logout على refresh failure موجود؛ لا integration test للشبكة. |
| طلبا refresh متزامنان | VERIFIED على PostgreSQL service layer | atomic consume وfamily revoke مثبتان في lifecycle test. |

## 7. Testing Results

| الأمر أو الدليل | النتيجة |
|---|---|
| `dotnet build apps/api/CMS.sln -c Release --no-restore` | PASS؛ تحذيران CS0618 قديمان فقط. |
| `dotnet test ...` مع PostgreSQL مؤقتة معزولة | **75 passed, 0 failed, 0 skipped**. |
| `pnpm exec vitest run` داخل `apps/student-web` | **9 passed, 0 failed**. |
| `pnpm build` داخل `apps/student-web` | PASS. |
| فحص `dist` بعد build | `0` ملفات `.map`، و`0` مراجع API cache. |
| HTTP test لـ`GET /api/v1/auth/me` | PASS ضمن Backend suite. |
| PostgreSQL session rotation/replay/revocation | PASS ضمن Backend suite. |

## 8. File Integrity and Changes

**ملفات معدلة:**

- `apps/student-web/src/utils/index.ts`
- `apps/student-web/src/services/api-client.ts`
- `apps/student-web/src/app/providers/AuthProvider.tsx`
- `apps/student-web/src/features/auth/services/auth-api.ts`
- `apps/student-web/src/features/auth/pages/LoginPage.tsx`
- `apps/student-web/src/features/auth/pages/VerifyOtpPage.tsx`
- `apps/student-web/src/features/auth/pages/RegisterPage.tsx`
- `apps/student-web/src/hooks/usePermission.tsx`
- `apps/student-web/vite.config.ts`
- `apps/api/src/CMS.Api/Controllers/AuthController.cs`
- `apps/api/src/CMS.Api/Controllers/AcademicController.cs`
- `apps/api/src/CMS.Application/DTOs/Auth/AuthDtos.cs`
- `apps/api/src/CMS.Application/Commands/Auth/AuthCommands.cs`
- `apps/api/src/CMS.Application/Handlers/Auth/AuthHandlers.cs`
- `apps/api/src/CMS.Application/Validators/Auth/AuthValidators.cs`
- `apps/api/src/CMS.Tests/Integration/SessionServicePostgresIntegrationTests.cs`

**ملفات جديدة:**

- `apps/student-web/src/test/identity-installation.test.ts`
- `apps/api/src/CMS.Tests/Integration/CurrentIdentityHttpIntegrationTests.cs`
- `apps/api/src/CMS.Tests/Unit/Handlers/VerifyOtpIdentityTests.cs`

لم يُحذف أي ملف. لم تُسجل ملفات mock أو test ضمن imports الإنتاجية. لا تزال تحذيرات `ISystemClock` obsolete موجودة في test fixture فقط؛ هي ليست فشل بناء، لكنها دين تقني مسجل.

## 9. Remaining Problems and Unverified Items

| الأولوية | البند | الحالة ولماذا يمنع PASS |
|---:|---|---|
| P0 | رحلة HTTP/browser كاملة: registration → OTP → protected route → reload → refresh → logout | UNVERIFIED؛ لا يوجد test يشغّل كل الطبقات معاً. |
| P0 | سلوك multi-tab وbrowser restart | UNVERIFIED؛ لم يُشغّل بمتصفح حقيقي. |
| P1 | HTTP integration للـanonymous academic hierarchy في مسار التسجيل | UNVERIFIED؛ التعديل مبني ومراجع في الكود لكن لم يجر request فعلياً. |
| P1 | حالات API unavailable/partial response في React | PARTIALLY VERIFIED؛ توجد catch paths، لا اختبار network fault. |
| P2 | تحديث fixture الذي يستخدم `ISystemClock` إلى `TimeProvider` | غير مانع لكنه يزيل تحذيرين في build. |

## 10. Phase 40 Decision

**لم يبدأ تنفيذ Phase 40.**

قرار الإيقاف مقصود وليس نقصاً في التنفيذ: البرومبت يمنع البدء في Same Sessions قبل تصنيف Phase 39. بما أن ثلاث فئات P0 من سلوك الهوية لم تُثبت تشغيلياً، فإن البدء في تغيير session architecture الآن سيزيد خطر بناء وظائف فوق عقد غير مثبت من المتصفح إلى Backend.

الخطوة التالية المنطقية هي إنشاء وتشغيل test harness حقيقي لـAPI والمتصفح، يغطي التسجيل وOTP وlogin وhydration وrefresh وlogout وtwo-tab state. بعد أن تصبح تلك الحالات PASS، يبدأ Phase 40 على session behavior القائم بدلاً من إعادة تصميمه.

## 11. Final Verdict

**NOT READY.**

Phase 39 تحسنت ماديًا، وتمت إزالة عيوب جوهرية مع نتائج build/test فعلية. لكن لا توجد أدلة تشغيلية كافية بعد لاعتبار الهوية مكتملة أو لإعطاء إذن بدء Phase 40. الحكم المحافظ المطلوب هو **PARTIAL / NOT READY** حتى إكمال اختبارات المتصفح والـHTTP end-to-end المذكورة أعلاه.
