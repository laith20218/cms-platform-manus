# Deployment evidence — 2026-08-28

## Directly verified public deployments

| Surface | URL | Observed state | Evidence method |
|---|---|---|---|
| Student web | https://cms-platform-manus-student-web.vercel.app | Reachable; redirects to `/login`; Arabic student-login interface renders. | Direct browser visit at 2026-08-28 00:15 sandbox session time. |
| Admin web | https://cms-platform-manus-admin-web.vercel.app | Reachable; Arabic administrative-login interface renders. | Direct browser visit at 2026-08-28 00:15 sandbox session time. |

## Vercel account evidence

The authenticated Vercel integration lists two Git-connected projects for repository `laith20218/cms-platform-manus`:

- `cms-platform-manus-student-web` — project ID `prj_kNQITsgGqNkzxItqay8v4EbPyqDR`.
- `cms-platform-manus-admin-web` — project ID `prj_9VpClN59VenE4triif9b73gFdZ4T`.

Both projects are linked to GitHub repository `laith20218/cms-platform-manus`. The integration permits listing projects but returns `403 Forbidden` when requesting deployments, and `404 Not Found` when reading the student project directly. Therefore, the public URLs establish reachability but Vercel deployment status, commit SHA, build log, and custom domain bindings are not independently verifiable from this session.

## Source-of-truth qualification

`PROJECT_STATUS.md` states `PRODUCTION NO-GO — BLOCKERS REMAIN`, explaining that local Web/Backend integrity is proven but external staging/production evidence, TLS/DNS, actual R2, secret rotation, Browser E2E, monitoring, backups, and CI evidence remain blocked. It is more current than historical claims of production readiness.

## Preliminary hosting conclusion

Vercel is the only platform externally verified as currently serving this CMS project's public web applications. No live backend hosting provider, database service, Redis service, object-storage endpoint, or custom domain has been verified yet. Repository configuration contains historical/planned Railway and Cloudflare R2 references, as well as a preview fallback at Render; these references do not prove that any of those services are currently in use.

## Additional verified findings

- The latest scheduled GitHub Actions `Health Check` run (#261; 2026-08-27; commit `d6f5d85`) failed **before its job started**. GitHub’s annotation states that recent account payments failed or the spending limit needs to be increased. This is a GitHub Actions account-billing/spending-limit gate, not an application health response.
- The currently served JavaScript bundles embed `https://cms-api-preview.onrender.com/api/v1` for the student app and `https://cms-api-preview.onrender.com` for the admin app. This was extracted directly from each public Vercel bundle on 2026-08-28.
- `https://api.cms.example.com/health/live` does not resolve publicly. The configured Render preview root health endpoint timed out; `/api/v1/health/live` returns HTTP 404. This supports the repository's current `NO-GO` status and demonstrates that the advertised `api.cms.example.com` custom-domain endpoint is not deployed.
- The connected Neon account contains an active, free-plan project named `cms-production` (`patient-dew-46888054`) in `aws-eu-central-1`; its 31 tables match the CMS data model. Aggregate live-data inspection found 1 administrator, 2 students, 1 university, 3 subjects, 2 lectures, 0 questions, 0 exams, 0 library files, 0 notifications, and 84 security-log records. This confirms Neon is genuinely being used for this platform database, but does not by itself prove which backend process has the current connection string.
- No Upstash connection is configured in this session, so Upstash usage cannot be independently verified here. It remains a configured/planned Redis adapter in the repository's environment template.

## متابعة التحقق — 2026-08-28

- تم فتح لوحة Render باستخدام جلسة المستخدم في المتصفح، وظهرت مساحة العمل وبداخلها مشروع باسم `CMS API Preview`.
- هذا دليل مباشر على أن مزود الخلفية المستخدم حالياً هو Render، وليس Railway أو Google Cloud.
- لم تُنفذ أي عملية نشر أو تعديل أو إعادة تشغيل في Render خلال هذا الفحص.

- لوحة Render تعرض مشروع `CMS API Preview` بحالة `Needs attention` على مستوى المشروع. عند فتحه كانت تفاصيل الخدمات ما زالت في حالة تحميل، ولم تُنفذ أي عملية تعديل أو نشر.

- اكتمل تحميل مشروع Render: توجد خدمة واحدة باسم `cms-api-preview` بنمط Docker وفي منطقة Frankfurt، وآخر تحديث لها منذ خمسة أيام وحالتها `Failed deploy`.
- تم فتح صفحة الخدمة للقراءة فقط؛ تعرض أقسام Events وSettings وLogs وEnvironment، وهو ما يتيح تشخيص إعداد النشر قبل أي عملية إصدار.

- خدمة `cms-api-preview` مرتبطة مباشرةً بمستودع `laith20218/cms-platform-manus` والفرع `main`، وتعتمد نمط Docker والخطة المجانية. الإصدارات التلقائية تُطلق عند وصول التغييرات إلى `main`.
- تفيد واجهة Render بأن آخر فشل كان أثناء بناء الالتزام `d6f5d85` مع خروج status 1، وتطلب مراجعة deploy logs لتحديد السبب الدقيق. لا يمكن نشر التعديلات بأمان قبل قراءة ذلك السجل وإصلاحه.

- بعد إصلاح ثلاثة أخطاء EF-expression ومواضع nullability في بحث الطالب، نجح بناء `CMS.Api` محلياً بوضع Release وللهدف `linux-musl-x64` المطابق لبناء Render.
- أنشئ فرع Neon مؤقت باسم `manus-backend-tests-20260828` ومعرّف `br-misty-fire-b1lwifh8` من قاعدة CMS. بعد ضبط صيغة اتصال Npgsql داخل جلسة الاختبار فقط، نجحت 140/140 من اختبارات الخادم؛ لم تُطبق أي ترحيلات على فرع Neon الإنتاجي.

- بعد دمج طلب GitHub رقم 1 إلى `main`، رصدت لوحة Render بدء نشر تلقائي جديد للالتزام `2803595` بعنوان دمج دفعة إصلاح API وإدارة الطلاب. لم يتم استخدام Manual Deploy أو تغيير إعدادات الخدمة.

- بقي نشر Render التلقائي للالتزام `2803595` في حالة التنفيذ عند آخر فحص. لا توجد نتيجة نجاح أو فشل بعد، لذا لم يُعلن توفر الخلفية خارجياً ولم تُنفذ أي عملية نشر يدوي.

- لوحة Vercel المتصلة بحساب المستخدم تُظهر أن مشروعي `cms-platform-manus-student-web` و`cms-platform-manus-admin-web` التقطا الالتزام الناتج عن دمج طلب GitHub رقم 1 منذ دقائق. سيتم التحقق من حالة كل إصدار من صفحات المشروع قبل اعتبار الواجهتين متاحتين خارجياً.
- أكدت لوحة Render أن النشر التلقائي للالتزام `2803595` وصل إلى `Deploy live`، وأعاد فحص `https://cms-api-preview.onrender.com/health/live` استجابة HTTP 200.

- أظهرت لوحة Vercel أن كِلا مشروعي الطالب والإدارة مرتبطان بآخر التزام ناتج عن طلب GitHub رقم 1. تعرّض بطاقات المشروع علامة النجاح؛ سيجري فحص تفاصيل كل مشروع والنطاق العام قبل توثيق النشر النهائي.

- أكد Render أن الإصدار التلقائي للالتزام `2803595` أصبح `Deploy live`، كما أعاد health endpoint الاستجابة HTTP 200. تُعد الخلفية متاحة على `https://cms-api-preview.onrender.com`.
- رصدت لوحة Vercel تحديث المشروعين من الالتزام المدموج وعلامة النجاح على البطاقات. تعذر فتح صفحة التفاصيل في التحقق التالي بسبب انتهاء مهلة استجابة إضافة المتصفح؛ لذلك توثّق حالة Vercel من بطاقة المشروع ونجاح build المحلي، لا من سجل نشر تفصيلي.

- فحص CORS الخارجي لمسار الدخول أعاد HTTP 204 لكل من نطاق الطالب ونطاق الإدارة، مع `Access-Control-Allow-Origin` المطابق و`Access-Control-Allow-Credentials: true`.
- فحص EF Core مقابل فرع Neon المؤقت أعاد: `No changes have been made to the model since the last migration.` لذلك دفعة إصلاح الخلفية وإدارة الطلاب لا تتطلب ترحيل SQL أو تطبيقاً على قاعدة Neon الإنتاجية.

- بعد إضافة السؤال التحريري والإجابة النموذجية وواجهة إدارة الأسئلة، نجح build واجهتي الإدارة والطالب محلياً. كما نجحت 142/142 من اختبارات الخلفية على فرع Neon المؤقت `br-misty-fire-b1lwifh8`، بما فيها اختبارات PostgreSQL؛ لم يُطبق أي SQL على فرع الإنتاج في هذه المرحلة.

- بعد دمج دفعة الأسئلة، كانت نقطة الصحة في Render تعمل لكن مسار الإدارة الجديد أعاد 404 في الفحص المبكر؛ هذا يدل على أن الإصدار الجديد لم يصبح حياً بعد، وليس دليلاً على صلاحية المسار. جلسة Render في المتصفح أصبحت غير مسجلة الدخول، لذا يستمر التحقق عبر نقاط HTTP العامة إلى أن يلتقط النشر التلقائي الالتزام الجديد.

- تعرض لوحة Vercel أن نشر واجهة الطالب الإنتاجي أصبح `Ready` بعد 3 دقائق من دمج طلب رقم 2 ومنسوب إلى `main` وإلى التزام الدمج `322405…`. اختلاف اسم الحزمة في فحص curl السابق يرجّح طبقة cache على النطاق العام، لذلك سيعاد الفحص بطلب عدم التخزين المؤقت.

- أكدت لوحة Vercel أن نشر الطالب `cms-platform-manus-student-6trlrtwoz-laith10.vercel.app` في حالة `Ready`، ومربوط بالنطاق العام وبالتزام دمج طلب رقم 2 `3224057`. سيستخدم عنوان النشر الفريد للتحقق من الحزمة دون أي أثر لذاكرة CDN على النطاق العام.
