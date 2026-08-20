# تقرير Phase 35 الشامل — HTTP Integration Closure

| الحقل | القيمة |
|---|---|
| المشروع | CMS — College Medical System |
| النطاق | إغلاق دليل HTTP للاستحقاق الموقّع HMAC-SHA256 |
| تاريخ التحقق | 19 أغسطس 2026 |
| بيئة الاختبار | .NET SDK 10.0.111 مع `DOTNET_ROLL_FORWARD=Major`، ASP.NET Core 9، PostgreSQL 16 محلياً |
| قرار Phase 35 | **GO** |

## الحكم التنفيذي

أُغلق مانع Phase 35 الأخير. أضيفت مجموعة `WebApplicationFactory` حقيقية داخل `CMS.Tests` وشغّلت التطبيق والـmiddleware والـcontrollers ونقاط إصدار/تجديد الاستحقاق داخل HTTP pipeline. استخدمت الـfixture قاعدة EF InMemory مع موفر EF داخلي معزول عن Npgsql المسجل في Composition Root، وبيانات طالب/اشتراك/مادة/ربط جهاز فعلية للاختبار. استخدم الاختبار authentication handler داخلياً deterministic لتثبيت هوية الطالب؛ أما منطق إصدار الاستحقاق، والتحقق من HMAC، وانتهاء الصلاحية، وتطابق الجهاز والنطاق، وترتيب الرفض قبل MediatR، فجميعها هي منطق التطبيق الفعلي.

> **قرار البوابة: GO لمرحلة Phase 35.** أثبتت الأدلة HTTP السبعة أن الإصدار والتجديد ينجحان وأن الاستحقاق المفقود أو المنتهي أو المحرف أو الصادر لجهاز مختلف أو الخارج عن نطاق المادة يُرفض قبل استدعاء handler المحتوى. بقي Offline معطلاً افتراضياً.

## ملفات التنفيذ والتحقق

| الملف | التغيير |
|---|---|
| `apps/api/src/CMS.Tests/Integration/SignedEntitlementHttpIntegrationTests.cs` | fixture HTTP، بيانات اشتراك/جهاز، سبعة سيناريوهات P0، ومراقبة `ISender.Invocations` لإثبات الرفض قبل handler. |
| `apps/api/src/CMS.Api/Program.Testing.cs` | تعريف partial `Program` المطلوب لـ`WebApplicationFactory`، بلا سلوك إنتاجي. |
| `apps/api/src/CMS.Tests/CMS.Tests.csproj` | إضافة `Microsoft.AspNetCore.Mvc.Testing` 9.0.11 ومرجع مشروع API. |
| `apps/api/src/CMS.Api/Controllers/QuestionsController.cs` | التحقق الإلزامي من `X-Entitlement` وsubject المستخرج خادمياً قبل قائمة السؤال والتفاصيل والإجابة. |
| `apps/api/src/CMS.Api/Controllers/LibraryController.cs` | التحقق الإلزامي قبل metadata والوصول إلى signed URL وتسجيل مشاهدة الملف. |

## نتائج سيناريوهات HTTP P0

| # | السيناريو | الطلب | النتيجة الفعلية | إثبات ترتيب الرفض |
|---:|---|---|---|---|
| 1 | إصدار ناجح | `POST /api/v1/entitlements/issue` مع هوية طالب، `X-Installation-Id`، واشتراك فعال | **PASS — HTTP 200**؛ body يحوي token موقعاً صالحاً | إصدار الاستحقاق الفعلي نجح داخل التطبيق المستضاف. |
| 2 | تجديد ناجح | `POST /api/v1/entitlements/renew` مع هوية طالب وربط جهاز فعال | **PASS — HTTP 200**؛ body يحوي token موقعاً صالحاً | مسار renew الفعلي نجح داخل نفس HTTP pipeline. |
| 3 | missing | `GET /api/v1/questions?subjectId={subject}` بلا `X-Entitlement` | **PASS — HTTP 401** | `ISender.Invocations` بقيت فارغة؛ لم يصل الطلب إلى handler. |
| 4 | expired | `GET /api/v1/questions` باستحقاق `expiresAt` منتهٍ | **PASS — HTTP 403** | `ISender.Invocations` بقيت فارغة؛ الرفض صادر من entitlement gate. |
| 5 | tampered | `GET /api/v1/questions` بتعديل جزء من token والتوقيع غير المطابق | **PASS — HTTP 403** | `ISender.Invocations` بقيت فارغة؛ لم ينفذ handler المحتوى. |
| 6 | different-device | token صادر لـ`phase35-http-installation-a` والطلب يعلن installation B | **PASS — HTTP 403** | `ISender.Invocations` بقيت فارغة؛ تحقق device binding رفض قبل handler. |
| 7 | out-of-scope | token يتضمن subject مختلفاً عن subject المطلوب | **PASS — HTTP 403** | `ISender.Invocations` بقيت فارغة؛ تحقق subject scope رفض قبل handler. |

جميع الحالات السبع نفذت عبر HTTP client صادر من `WebApplicationFactory<Program>`. لم تُستدعَ handlers المحتوى في حالات الرفض؛ استخدم الاختبار `MockBehavior.Strict` ويمسح invocations قبل كل حالة، ثم يتحقق من بقاء سجل الاستدعاءات فارغاً.

## أدلة التشغيل الأخيرة

| الأمر | النتيجة |
|---|---|
| `dotnet build apps/api/CMS.sln -c Release --no-restore --verbosity minimal` | **PASS** — جميع المشاريع، من ضمنها API وTests، بُنيت بنجاح في 1.4 ثانية. |
| `DOTNET_ROLL_FORWARD=Major dotnet test apps/api/src/CMS.Tests/CMS.Tests.csproj -c Release --filter 'FullyQualifiedName~SignedEntitlementHttpIntegrationTests' --verbosity minimal` | **PASS — 7/7**، صفر فشل، صفر skipped، مدة 2.1 ثانية. |
| `DOTNET_ROLL_FORWARD=Major dotnet test apps/api/src/CMS.Tests/CMS.Tests.csproj -c Release --no-build --verbosity minimal` | **PASS — 63/63**، صفر فشل، صفر skipped، مدة 5.5 ثانية. العدد السابق 56؛ أضيفت 7 اختبارات HTTP. |
| `DOTNET_ROLL_FORWARD=Major dotnet test apps/api/src/CMS.Tests/CMS.Tests.csproj -c Release --no-build --filter 'Category=PostgresIntegration' --verbosity minimal` | **PASS — 1/1**، صفر فشل، مدة 1.9 ثانية. |
| `dotnet-ef` migration/model check | **PASS سابقاً** — لا تغييرات EF معلقة؛ ترحيل lockout مطبق على قاعدة الاختبار. |
| فحوصات `dotnet list package --vulnerable` وTrivy و`pnpm audit` | **PASS سابقاً** — لا نتائج عالية/حرجة أو أسرار ضمن نطاقات الفحص الموثقة. |

## الضوابط التي بقيت محفوظة

ظل Argon2id مستخدماً للـhashes الجديدة مع توافق BCrypt القديم وترقية تدريجية، وظلت سياسة كلمة المرور مطبقة على التسجيل وإعادة التعيين والتغيير. كما بقي login lockout وOTP الآمن وربط الجهاز وسياسات rate limiting المتمايزة وصف audit batch مفعلة، ولم يُفتح Offline؛ القيمة الافتراضية لـOffline ما زالت disabled.

## الملاحظات غير المانعة

يصدر build اختبارات HTTP تحذيرين متعلقين بـ`ISystemClock` القديم داخل authentication handler الاختباري، ولا يؤثران على نجاح أو دلالة اختبارات HTTP. يمكن ترقية handler إلى `TimeProvider` في صيانة لاحقة، لكنه ليس تغييراً في منطق الإنتاج ولا حاجزاً أمنياً لقرار Phase 35 الحالي.

تظل الموافقة التشغيلية المنفصلة على أسرار الإنتاج والنشر والـrollback مسؤولية مالك البيئة ولا تُستنتج من اختبار محلي. هذا لا يحجب قرار إغلاق Phase 35 البرمجي وفق نطاق المهمة الحالية؛ لا يتضمن التقرير أي سر فعلي أو ادعاء نشر إنتاجي.

## القرار النهائي

**GO — Phase 35 مغلقة من منظور Backend Security وHTTP Signed Entitlement Integration.**

شرط التحويل من NO-GO إلى GO تحقق: توجد الآن أدلة HTTP قابلة لإعادة التشغيل للإصدار والتجديد وحالات الرفض الخمس، مع إثبات أن الرفض يسبق تنفيذ handlers المحتوى. يجب عند أي نشر لاحق إعادة تشغيل نفس الأوامر في بيئة النشر وتسجيل موافقة مالك البيئة، مع إبقاء Offline معطلاً حتى Phase 36.
