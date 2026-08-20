# تقرير الإغلاق الأمني — Phase 34

**المشروع:** CMS — College Medical System  
**النطاق:** Security Architecture & Hardening  
**المرجع:** تدقيق Phase 33 الذي صنّف المشروع `CRITICAL` بدرجة 27/100  
**تاريخ التحقق المحلي:** 2026-08-18  
**المطور المرجعي:** الليث النقري

> **قرار الحالة:** اكتمل التنفيذ والتحقق المحليان لأعمال Phase 34، لكن لا يجوز إعلان الإغلاق الإنتاجي النهائي. تظل بوابة الإنتاج **BLOCKED** إلى أن ينفذ مالك البيئة تدوير الأسرار الخارجية ويثبت نشر الإعدادات الجديدة وتشغيل بوابات CI البعيدة.

## الملخص التنفيذي

عالجت Phase 34 طبقات الأسرار، الجلسات، التفويض، الاستحقاق، الملفات، 2FA، rate limiting، واجهة الويب، سلسلة التوريد، وصور الحاويات. أصبح الخادم يبني بنجاح بوضع `Release`، ونجحت 39 اختباراً خلفياً، منها اختبار تكامل فعلي للجلسات على PostgreSQL 16 يثبت إنشاء الجلسة ودوران refresh token وكشف إعادة الاستخدام وإبطال العائلة والإبطال الصريح. كما ولّد EF Core ترحيلاً فعلياً وطُبّق على قاعدة PostgreSQL محلية معزولة، وتأكد وجود الجداول والفهارس والقيود الجديدة.

تجتاز واجهة الطالب البناء واختبارات Vitest، وتجتاز بوابة artifacts للأسرار وتدقيق `pnpm` للإنتاج. لا تظهر حزم .NET معرّضة للخطر في تدقيق NuGet بعد تثبيت الإصدار المعالج من `System.Text.Encodings.Web`، ولا يظهر فحص Trivy أي نتائج `HIGH` أو `CRITICAL` للثغرات أو الأسرار أو سوء الإعدادات. أُغلقت أيضاً نتيجة تشغيل صور Docker كمستخدم root بإضافة مستخدم `cms` غير جذري في Dockerfiles المعنية؛ لم يمكن بناء الصور محلياً لعدم توفر Docker daemon.

## التغييرات الأمنية المنفذة

| المجال | التنفيذ المحقق |
|---|---|
| الأسرار | قوالب بيئة آمنة، بوابة CI تمنع الأسرار وملفات البيئة المحظورة، وإعدادات خالية من بيانات اعتماد ثابتة. |
| JWT والجلسات | حد أدنى 32 بايت لمفتاح JWT، allowlist لـHS256 و`kid`، جلسات خادمية وrefresh opaque مخزن كـSHA-256 فقط. |
| دوران refresh | استهلاك ذري للرمز السابق وإنشاء successor داخل معاملة PostgreSQL؛ إعادة الاستخدام تبطل family كاملة. |
| الإبطال | Middleware يتحقق من session ID وtoken version وinstallation؛ logout وتغيير/إعادة تعيين كلمة المرور يبطلان الجلسات. |
| التفويض | تسجيل `PermissionHandler` و`ScopeHandler` والسياسات؛ default deny للموارد غير المعرفة وscope في إدارة الطلاب والأكواد. |
| الاستحقاق | `EntitlementService` يربط الطالب بالتسلسل الأكاديمي وبمنح اشتراك خادم-جانبية قبل الأسئلة والمكتبة. |
| الملفات وoffline | منع نشر ملف غير ممسوح، entitlement قبل الرابط الموقّع، وتعطيل offline افتراضياً حتى اعتماد تشفير حزمة غير متصل. |
| 2FA وrate limit | TOTP HMAC-SHA1 مع منع replay عبر cache؛ policy `auth` على endpoints المصادقة. |
| الواجهة | CSP ورؤوس HTTP في Vercel، إزالة الإدخال HTML الخطر، sessionStorage بدلاً من localStorage للتوكنات، وlogout خادمي. |
| سلسلة التوريد | lockfile وSBOM CycloneDX، تدقيق pnpm وNuGet، Trivy، وتثبيت نسخ الحزم الحساسة. |
| الحاويات | تشغيل Dockerfiles المحددة بمستخدم `cms` غير جذري؛ إصلاح ثلاث نتائج Trivy عالية. |

## أدلة التحقق المحلية

| الدليل | الأمر أو الاختبار | النتيجة |
|---|---|---|
| بناء الخادم | `dotnet build apps/api/CMS.sln -c Release --no-restore` | PASS |
| اختبارات الخادم | `DOTNET_ROLL_FORWARD=Major dotnet test ...CMS.Tests...` | PASS — 39/39 |
| تكامل الجلسات | اختبار `Category=PostgresIntegration` على PostgreSQL 16 | PASS — 1/1 |
| نموذج EF | `dotnet-ef migrations has-pending-model-changes` | PASS — لا تغييرات معلقة |
| تطبيق الترحيل | `dotnet-ef database update` على `cms_phase34_test` | PASS |
| تكامل الخدمة | `GET /health` بعد PostgreSQL وRedis محليين | PASS — HTTP 200 / `Healthy` |
| بوابة artifacts | `bash scripts/ci/verify-security-artifact.sh` | PASS |
| بناء الواجهة | `pnpm --filter @cms/student-web build` | PASS |
| اختبارات الواجهة | `pnpm --filter @cms/student-web exec vitest run` | PASS — 7/7 |
| تدقيق pnpm | `pnpm audit --prod --audit-level high` | PASS — 0 معروفة |
| تدقيق NuGet | `dotnet list ... package --vulnerable --include-transitive` | PASS — 0 vulnerable |
| Trivy | `trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL` | PASS — 0 HIGH/CRITICAL |

تفاصيل الأدلة قابلة للمراجعة في `artifacts/security/trivy-phase34.json` و`artifacts/security/trivy-phase34-summary.json` و`artifacts/migrations/phase34-idempotent.sql`، وفي الترحيل `20260818172242_Phase34SecuritySessionsAndEntitlements`.

## الترحيل وقاعدة البيانات

الترحيل المولّد هو baseline مخطط المشروع الحالي لعدم وجود ترحيلات سابقة في المصدر المستلم. ينشئ الكيانات الجديدة `user_sessions` و`user_installations` و`student_subscriptions` و`subscription_codes` و`code_batches` ضمن المخطط مع فهارس استعلام وقيود فريدة مهمة. تشمل القيود: hash refresh فريد، `(user_id, installation_id)` فريد، code فريد، و`subscription_code_id` فريد لمنع إعادة استخدام رمز اشتراك.

تم تطبيق الترحيل فعلياً على PostgreSQL 16 محلي معزول، وسجل جدول `__EFMigrationsHistory` الترحيل بنجاح. لا يمثل ذلك تطبيقاً على بيئة staging أو production ولا يجب اعتباره بديلاً عن change management الخاص بالمالك.

## الحواجز الخارجية الإلزامية

| الحاجز | سبب الحظر | المالك المطلوب | شرط رفع الحظر |
|---|---|---|---|
| تدوير الأسرار | لا يملك هذا التشغيل صلاحية تدوير JWT وPostgreSQL وRedis وR2 وFCM وموفري النشر. | مالك البنية/الأسرار | تدوير كل السرية المتأثرة، تحديث secret manager، وإبطال القيم القديمة. |
| تحقق النشر | لا توجد صلاحية نشر إلى Railway أو Vercel أو بيئة staging. | مالك النشر | نشر image/artifact المعتمد، تشغيل migration في staging، وفحص health وauth وauthorization. |
| CodeQL/SARIF البعيد | لا يتوفر تشغيل GitHub Actions أو GitHub Security في البيئة المحلية. | مالك المستودع | نجاح job `security-scan` ورفع SARIF دون نتائج مانعة. |
| بناء صور Docker | Docker daemon غير متوفر محلياً. | CI أو مالك البيئة | نجاح بناء صور API والويب واختبار `USER cms` داخل كل image. |
| توافق runtime 9 | التنفيذ المحلي استخدم SDK 10 مع `DOTNET_ROLL_FORWARD=Major` لتشغيل اختبارات target `net9.0`. | CI | نجاح CI الرسمي على .NET 9 كما يحدده workflow. |

## القرار

**LOCAL SECURITY REMEDIATION: PASS.**  
**PRODUCTION SECURITY GATE: BLOCKED.**

لا توجد نتيجة محلية معروفة عالية أو حرجة متبقية في المسح، ولا توجد فشلات build أو test أو migration محلية. يظل قرار الإنتاج موقوفاً حصراً على الحواجز الخارجية المسجلة أعلاه، وعلى وجه الخصوص تدوير الأسرار وإثبات النشر وCI البعيد. لا تُعد أي قيمة مؤقتة استُخدمت حصراً لتصميم EF أو اختبار PostgreSQL سراً إنتاجياً أو عملية تدوير.
