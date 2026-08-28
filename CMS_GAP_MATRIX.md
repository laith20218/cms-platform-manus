# CMS — Gap Matrix and Implementation Priorities

**تاريخ:** 2026-08-28
**المرجع الوظيفي:** `pasted_content.txt`
**قاعدة التصنيف:** لا يُرفع الحكم إلى `FULLY IMPLEMENTED` بدون دليل مناسب من الواجهة إلى البيانات والتشغيل.

## 1. أولويات القرار

المشروع ليس بحاجة إلى إعادة بناء شاملة؛ قاعدة البيانات ونواة الـ API وواجهات الطالب الأساسية موجودة. الأولوية الصحيحة هي أولاً إصلاح المعمارية التشغيلية ثم كشف القدرات الخلفية الموجودة داخل لوحة الإدارة، قبل بناء مسارات جديدة تماماً. تمنع هذه الأولوية مضاعفة منطق الصلاحيات أو إعادة تنفيذ وظائف لها server-side contracts جاهزة.

| الأولوية | النطاق | السبب | قرار الدفعة |
|---|---|---|---|
| P0 | توحيد API المنشور وإصلاح health checks/CI | الواجهتان تعملان لكنهما تستهدفان Render preview، و`api.cms.example.com` غير قابل للحل | خارج تعديل UI؛ يحتاج قرار ربط provider/domain وتهيئة متغيرات بيئة |
| P0 | مسارات admin في student-web | يوجد dashboard/reports إداريان تحت مصادقة فقط، ما يخالف فصل واجهة الإدارة | منع الوصول من واجهة الطالب الآن ونقل/إتاحة البديل في admin-web لاحقاً |
| P0 | إدارة الطلاب والأمان في admin-web | الخلفية تعمل من حيث العقود لكن لا واجهة تشغيلية لها | تنفيذ في الدفعة الأولى |
| P0 | إصلاح lint الطالب | بوابة الجودة تفشل رغم نجاح البناء | تنفيذ في الدفعة الأولى |
| P1 | تنقل الطالب وقائمة الاختبارات | صفحات موجودة لكنها غير قابلة للاكتشاف أو غير مستقلة | تنفيذ تحسين تنقل آمن في الدفعة الأولى؛ إنشاء Exam catalog لاحقاً |
| P1 | Roles + permission matrix + scope editor | مهم لمنع الصلاحيات المطلقة؛ API replacement موجود بلا قراءة grants | يتطلب إضافة GET contracts آمنة ثم UI |
| P1 | إدارة المحتوى: questions/exams/files | API CRUD موجود لكن لا admin UI | الدفعة الثانية بعد تثبيت الطلاب/الأمن |
| P1 | تقارير moderation وanalytics | summary/API موجود لكن لا workflow لمراجعة البلاغات ولا admin console صحيح | الدفعة الثالثة |
| P2 | المفضلات المسماة/الإعلانات/الإعدادات | وظائف ومنتجات جديدة تتطلب schema/API/UI | الدفعات اللاحقة |
| P2 | Native-grade offline وAndroid/Windows | لا يمكن مساواته بثقة Browser Offline | خارج نطاق واجهة الويب الحالية |

## 2. مصفوفة الفجوات التفصيلية

| المتطلب | التنفيذ الحالي | الجزء الناقص | الشدة | التعديل المطلوب | التبعيات | طريقة التحقق |
|---|---|---|---|---|---|---|
| دخول الطالب وتسجيله | صفحة وعميل API ومسارات backend موجودة | لا يوجد إثبات دخول حقيقي على API المنشور | عالية | إجراء E2E على staging بعد ربط API | API live + test account | تسجيل/دخول/refresh/logout حقيقي |
| OTP مؤجل | Flag الافتراضي false والواجهة موجودة | حالة الإعداد غير معروضة للمستخدم، واختبارات الإطلاق قد تضلل | متوسطة | توثيق أنه disabled وعدم إجباره | environment config | تسجيل طالب مع OTP disabled |
| Dashboard الطالب | صفحة وخدمات موجودة | لا دليل data loading على production | عالية | E2E لاحقاً | API | Snapshot authenticated + network assertions |
| تنقل الطالب | Sidebar/BottomNav لا يعرضان كل الوجهات المطلوبة | Exams/Files/Progress/Notifications غير قابلة للاكتشاف كواجهة رئيسية | متوسطة | تحسين روابط التنقل دون اختراع صلاحيات | routes القائمة | اختبار links على سطح المكتب والجوال |
| قائمة اختبارات مستقلة | API مقيد بـ by-subject | لا route/page catalog للاختبارات | متوسطة | API aggregate scoped + صفحة `/exams` | entitlement + exam list query | Subject filters/attempt state/E2E |
| مكتبة موحدة | Library في سياق مادة فقط | لا صفحة `Files` موحدة قابلة للتصفية بالاستحقاق | متوسطة | query aggregate scoped + صفحة library | signed entitlement | تحميل/عرض لكل content type |
| مفضلات متعددة القوائم | favorite مفرد لسؤال أو ملف | لا schema أو APIs لقوائم مستخدم مسماة | متوسطة | migrations/entities/API/UI | DB migration | CRUD lists + authorization tests |
| ملف الطالب والأمان | profile/logout موجودان، API change-password موجود | لا UI لتغيير كلمة المرور أو sessions/devices | عالية | إضافة Account Security panel | API session listing/revoke غير موجود للطالب | تغيير كلمة مرور وإبطال الجلسات |
| فصل Dashboard المدير | Admin insights داخل student-web | route client guard مفقود والواجهة في التطبيق الخطأ | حرجة | إخفاء/حذف admin routes من student-web أو role guard؛ نقلها لـ admin-web | تصميم admin console | محاولة طالب/مدير على المسارات |
| Dashboard المدير العام | admin-web overview شكلي؛ API metrics موجود | لا metrics حقيقية ولا activity/health | عالية | ربط dashboard admin بالـ API مع role checks | admin API + provider health | authenticated SuperAdmin E2E |
| Students | API list/search/filter/status، ban/unban/revoke موجود | لا admin-web UI، لا detail security tools | حرجة | إنشاء Students Center مع تفاصيل حساسة وإجراءات مؤكدّة | contracts القائمة + security API | SuperAdmin/StudentAdmin UI + scope tests |
| أمن الطالب والأجهزة | API logs/alerts/unbind موجود | لا واجهة لعرضها | عالية | إظهار logs لكل طالب وunbind device بإجراء مؤكد | security endpoints | audit event + UI state refresh |
| مديرون وأدوار | CRUD/admin lifecycle متاح | scope دائماً null في النموذج، لا permission matrix | حرجة | scope picker وrole grants read/write | API GET permission grants مطلوب | cross-scope authorization tests |
| إدارة الأكاديمي | admin web ينشئ/يؤرشف وينشر lecture؛ API update أجزاء عديدة | لا تعديل/نقل/ترتيب/إلغاء نشر شامل في UI | متوسطة | تحرير شجري ومنظم لاحقاً | update/reorder contracts | CRUD and scope tests |
| أسئلة | backend CRUD/import/publish/archive | لا admin UI، وقراءة admin list منفصلة لكن غير مستخدمة | عالية | Question Management Center | API details/list | create/edit/import/publish with role scope |
| اختبارات | API CRUD/publish/archive | عقد create لا يتضمن availability window/max attempts؛ لا UI | عالية | توسعة DTO/entity عند الحاجة ثم Exams Center | DB migration likely | policy and exam E2E |
| ملفات | API upload/publish/archive/delete | لا admin UI ولا metadata wizard مطابق المواصفات | عالية | Library Management Center | object storage real | presign/upload/access/publish E2E |
| الأكواد والاستحقاق | generator/list/revoke موجود | لا view/copy/reactivate/delete/user detail أو code groups | متوسطة | توسيع UI/API lifecycle | subscription model | single-use/public code tests |
| Notifications/announcements | API send/sent/stats؛ inbox الطالب موجود | لا admin compose/audience scope UI | متوسطة | Notification Center | target-selection API | audience targeting E2E |
| Reports moderation | summary صفحة read-only في student-web | لا open/review/resolve/reject/close workflows | عالية | report moderation APIs + UI | stateful report contract | lifecycle tests |
| Audit logs | logs يكتبها backend services | لا global query/controller/admin UI | عالية | audit query API مع redaction + viewer | index/retention policy | no secret leakage + filters |
| Security console | alerts/logs فردية موجودة | لا global security events/filters/health operations UI | عالية | Security Center | API aggregation | alert, scope, and audit tests |
| Settings | Policy constants موجودة | لا storage, API, role UI أو settings screen | متوسطة | constrained settings aggregate | DB/API/approval decisions | permissions + config persistence |
| CI/health | workflow موجود لكن يتوقف قبل job بسبب GitHub account gate؛ targets domains غير منشورة | لا monitoring حقيقي | حرجة | إصلاح account gate ثم update domains or deployment | GitHub Actions billing/spending and provider setup | workflow run + HTTP 200 |
| Database seed | Neon schema حقيقي | لا أسئلة/اختبارات/ملفات وإشعارات؛ المحتوى غير كافٍ لإثبات journeys | عالية | content-seed strategy وآليات admin UI | content owner input + storage | data counts + functional E2E |

## 3. الدفعة الأولى المعتمدة للتنفيذ الآن

تستهدف هذه الدفعة إزالة الفجوة الأكبر بين ما يملكه الخادم وبين ما يستطيع مسؤول المنصة تشغيله بالفعل. لا تغيّر نماذج البيانات ولا تحاول حل مشكلة مزود الـ API من خلال زر واجهة مضلل.

| عنصر التنفيذ | النتيجة العملية | سبب اختيارها الآن |
|---|---|---|
| `Students Center` في `admin-web` | قائمة/بحث/فلترة، عرض بيانات الطالب، ban/unban، إنهاء الجلسات، عرض سجل الأمن، إلغاء ربط جهاز | APIs قائمة؛ يعالج متطلباً P0 بدون migration |
| حماية إجراءات الأمن | confirmation dialog وإظهار سبب الحظر؛ لا عمليات صامتة مدمرة | يتوافق مع audit/safeguards |
| إصلاح مسارات الإدارة داخل student-web | منع ظهور/تحميل `/admin/*` للطالب وإعادة توجيهها إلى dashboard | يعالج تعارضاً أمنياً واضحاً دون نسخ dashboard |
| تنقل الطالب | إضافة روابط الإحصاءات والإشعارات وواجهة الاختبارات من نقاط اكتشاف مناسبة دون اختراع catalog غير موجود | يحسن قابلية الاستخدام ضمن routes الفعلية |
| إصلاح `QuestionPage` lint | ضبط dependency ثابتة في `useEffect` | يعيد نجاح بوابة lint الحالية |
| اختبارات مكونات منفصلة | تغطية حالة قائمة الطلاب والإجراءات الخطرِة حيث يمكن دون API live | يرفع ثقة التعديل |

## 4. الدفعات التالية بعد الدفعة الأولى

| الدفعة | النطاق | ما يحتاجه قبل البدء |
|---|---|---|
| الثانية | Question/Exam/Library Management، role scopes وpermission matrix | مراجعة عقود list/detail، وإضافة API لقراءة grants وحقول امتحان غير ممثلة |
| الثالثة | Admin analytics، report moderation، notifications/announcements | تصميم lifecycle للبلاغات والجمهور والنطاق، وقرارات retention |
| الرابعة | Audit Logs وSecurity Console وSettings | تعريف access policy، redaction، retention، وsettings allowed-list |
| الخامسة | Exam catalog، unified library، favourite lists، account sessions | migrations مدروسة وواجهة API scoped |
| الإطلاق | API provider/domain، CI، storage Redis، backups، E2E | تهيئة Vercel/Render أو مزود API مجاني بديل، ولا يتم قبل اختبارات staging |

## 5. أساس التحقق بعد التنفيذ

لا تُعتمد الدفعة الأولى بإكمال بناء TypeScript وحده. يلزم نجاح build + lint + student tests، ثم اختبار UI محلي/منشور باستعمال مدير يملك `StudentView` و`StudentEdit` ضمن نطاقه، والتحقق من الرفض عند اختلاف scope. يجب أيضاً إبقاء أسماء الطلاب وأرقامهم ومعلومات الأجهزة خارج أي logs أو screenshots في التقرير.

## المراجع

[1]: ./CMS_FUNCTIONAL_AUDIT.md "Functional audit supporting evidence"
[2]: ./worklog/deployment-evidence-2026-08-28.md "Verified deployment evidence"
[3]: https://github.com/laith20218/cms-platform-manus/blob/d6f5d85af74fd78572503ff98671f8fc8710b93d/apps/api/src/CMS.Api/Controllers/AdminDashboardController.cs "Student-management API"
[4]: https://github.com/laith20218/cms-platform-manus/blob/d6f5d85af74fd78572503ff98671f8fc8710b93d/apps/api/src/CMS.Api/Controllers/SecurityController.cs "Security API"
