# CMS — Functional Audit

**إعداد:** Manus AI
**تاريخ التدقيق:** 2026-08-28
**المصدر المفحوص:** `laith20218/cms-platform-manus`، الفرع `main`، الالتزام `d6f5d85`
**المرجع الوظيفي:** `pasted_content.txt` المرفق من مالك المشروع

> هذا التقرير لا يعامل وجود `Component` أو `Route` أو `Controller` كدليل اكتمال. لا تُصنّف الوظيفة بأنها كاملة إلا عند توافر مسار واجهة المستخدم وطلب API ومعالجة خلفية وسلوك يمكن التحقق منه بالمستوى المناسب.

## 1. منهجية الإثبات وحدودها

اعتمد التدقيق على قراءة الشفرة، وخريطة المسارات، واستدعاءات API، وبناء الواجهتين محلياً، واختبارات واجهة الطالب، وفحص علني لواجهتي Vercel، وجرد read-only لقاعدة Neon. نجح بناء الإنتاج للواجهتين محلياً؛ اجتازت واجهة الطالب 11/11 اختبار Vitest، لكن فحص ESLint يفشل حالياً بتحذير Hook واحد مع قاعدة `--max-warnings=0`. لم يتسنَّ تشغيل بناء أو اختبارات .NET في هذه الجلسة لغياب `dotnet` من بيئة الفحص. لذلك لا يُستنتج من شيفرة الخادم وحدها أن كل مسار يعمل في الإنتاج.

| نوع الدليل | النتيجة | أثره على الحكم |
|---|---|---|
| قراءة الشفرة | متاح لجميع مسارات الواجهة والخادم الأساسية | يثبت وجود الربط المنطقي، لا يثبت عمله على البيئة المنشورة |
| بناء واجهة الطالب | نجح | يثبت سلامة TypeScript/Vite للبناء الحالي |
| بناء واجهة الإدارة | نجح | يثبت سلامة TypeScript/Vite للبناء الحالي |
| اختبارات الطالب | 11/11 ناجحة | تغطي مكونات محدودة، هوية التثبيت، وغلاف Offline؛ لا تغطي كل رحلات المستخدم |
| Lint الطالب | فاشل بتحذير واحد | يمنع بوابة الجودة الحالية من النجاح |
| اختبارات الخادم | غير مشغّلة في هذه الجلسة | جميع مزاعم backend runtime تبقى **UNVERIFIED** خارج الأدلة الساكنة |
| الواجهات المنشورة | صفحتا login تعملان | يثبت نشر الواجهتين فقط، لا يثبت مصادقة أو عمليات خلفية |
| قاعدة Neon | موجودة وبها مخطط CMS | تثبت وجود قاعدة فعلية، لا تثبت ربطها بالخدمة المنشورة |

## 2. البنية الفعلية المرصودة

المستودع monorepo يعمل بـ React/Vite/TypeScript لواجهتي الطالب والإدارة، وASP.NET Core مع PostgreSQL للخلفية. يحتوي الخادم على 19 متحكماً و177 نقطة API تقريباً، مع 31 جدولاً في مخطط Neon المطابق للكيانات. التفويض ليس role-only في التصميم: يوجد `PermissionHandler` يستدعي `IPermissionService`، و`ScopeHandler` للنطاق الأكاديمي.[1] [2]

| طبقة | التنفيذ الموجود | الحالة |
|---|---|---|
| واجهة الطالب | `apps/student-web`، React Router، React Query، PWA وعميل Axios | **IMPLEMENTED — PARTIAL**: صفحات واسعة لكن قابلية الوصول والتنقل والحماية التشغيلية غير مكتملة |
| واجهة الإدارة المنفصلة | `apps/admin-web`، SPA واحدة مع مراكز أكاديمي/أكواد | **IMPLEMENTED — PARTIAL**: إدارة مديرين/أدوار وهيكل أكاديمي/أكواد فقط |
| API | ASP.NET Core + MediatR + EF Core | **IMPLEMENTED — PARTIAL**: قدرات كثيرة بلا واجهة أو بلا أدلة تشغيلية |
| قاعدة البيانات | Neon PostgreSQL: مشروع `cms-production`، 31 جدولاً | **IMPLEMENTED — PARTIAL**: المخطط موجود لكن المحتوى الأولي محدود جداً |
| التخزين/Redis | قوالب إعداد S3-compatible وUpstash REST | **UNVERIFIED**: لا دليل اتصال حي في هذه الجلسة |
| الحماية | JWT/refresh، session، entitlement موقّع، scope، audit/security logs | **IMPLEMENTED — PARTIAL**: منطق كبير موجود، لكن لا Browser E2E ولا تحقق إنتاجي |

## 3. جرد الواجهات والمسارات

### 3.1 واجهة الطالب

| المسار | الصفحة/المسؤول | الوظيفة الظاهرة | الحكم |
|---|---|---|---|
| `/login` | `LoginPage` | الدخول، تذكرني، رابط استعادة كلمة المرور | **IMPLEMENTED — PARTIAL**؛ الواجهة منشورة لكن الدخول الحقيقي لم يختبر على API المنشور |
| `/register` | `RegisterPage` | تسجيل حساب، اختيار جامعة/كلية/سنة، قبول الشروط | **IMPLEMENTED — PARTIAL**؛ روابط الشروط والخصوصية هي `#` وليست وثائق فعلية |
| `/verify-otp` | `VerifyOtpPage` | واجهة OTP | **UI ONLY / Deferred** وفق `Features:OtpEnabled=false` افتراضياً؛ لا ينبغي جعله شرطاً للإطلاق |
| `/forgot-password`, `/reset-password` | صفحات auth | استعادة كلمة المرور عبر OTP | **IMPLEMENTED — PARTIAL**؛ مرتبطة بالـ API لكن لم تُختبر على الإنتاج |
| `/dashboard` | `DashboardPage` | ملخص طالب/مواد/نشاط/تنبيهات | **IMPLEMENTED — PARTIAL** |
| `/subjects`, `/subjects/:slug` | صفحات المواد | تصفح الهيكل والمادة، حالة entitlement | **IMPLEMENTED — PARTIAL** |
| `/subjects/:slug/lectures/:id` | `LecturePage` | عرض محاضرة وإكمالها | **IMPLEMENTED — PARTIAL** |
| مسارات `questions` | `QuestionPage` | حل MCQ، تأكيد، تنقل، مفضلة، إبلاغ | **IMPLEMENTED — PARTIAL** |
| `/favorites` | `FavoritesPage` | مفضلة سؤال وملف | **IMPLEMENTED — PARTIAL**؛ لا توجد قوائم مفضلة متعددة بأسماء المستخدم |
| `/exams/:id`, `/exams/:sessionId/review` | صفحات الاختبارات | بدء/استئناف، مؤقت، إرسال، مراجعة | **IMPLEMENTED — PARTIAL**؛ لا توجد صفحة قائمة اختبارات مستقلة، ولا دليل E2E للانقطاع/التوقيت |
| `/subjects/:slug/library` | `LibraryPage` | تصفح/عرض ملف محمي | **IMPLEMENTED — PARTIAL**؛ الوصول مرتبط بالمادة فقط، ولا توجد مكتبة موحدة مستقلة |
| `/search` | `SearchPage` | بحث موحد بالمحتوى | **IMPLEMENTED — PARTIAL**؛ الواجهة موجودة وAPI موجود، لكن لا دليل تشغيل حي |
| `/notifications` | `NotificationsPage` | صندوق الإشعارات وتعليمها مقروءة | **IMPLEMENTED — PARTIAL** |
| `/profile` | `ProfilePage` | معلومات الحساب/الأكاديمي/الاشتراك وlogout | **IMPLEMENTED — PARTIAL**؛ ينقص تغيير كلمة المرور والجلسات والأجهزة |
| `/stats`, `/leaderboard` | صفحات الإحصاءات | تقدم الطالب/فلاتر فترة/لوحة صدارة | **IMPLEMENTED — PARTIAL** |
| `/admin/dashboard`, `/admin/reports` | صفحات admin داخل student-web | تحليلات إدارية وملخص البلاغات | **BROKEN BY DESIGN**: لا يوجد guard role في `ProtectedRoute`؛ الجدار الأمامي يطلب authentication فقط، رغم أن API قد يرفض token الطالب. يجب نقلها إلى admin-web أو إضافة role guard.[3] |

التنقل المكتبي للطالب يعرض فقط Dashboard وSubjects وFavorites وSearch وLeaderboard، بينما تبقى الاختبارات والمكتبة والإشعارات والإحصاءات غير قابلة للاكتشاف من القائمة الأساسية.[4] التنقل المحمول أضيق أيضاً. هذا تعارض مباشر مع قائمة التنقل المطلوبة في المواصفات.

### 3.2 واجهة الإدارة المستقلة

| القسم الحالي | الوظائف المرتبطة فعلياً | الحكم |
|---|---|---|
| Login | تسجيل دخول مدير في `/api/v1/auth/admin/login` وتخزين access token في `sessionStorage` | **IMPLEMENTED — PARTIAL**؛ لا تحقق إنتاجي للجلسة، ولا refresh/logout API صريحان في هذه SPA |
| Overview | بطاقات تعريفية وحالة خدمة ثابتة وعداد إشعارات `0` | **UI ONLY**؛ لا تجلب dashboard metrics أو النشاط أو health فعلياً |
| Academic Center | استعراض وإنشاء University/College/Year/Semester/Subject/Lecture، أرشفة/استعادة، نشر محاضرة | **IMPLEMENTED — PARTIAL**؛ ينقص تعديل العناصر، النقل، الترتيب، وتعطيل/إلغاء نشر شامل |
| Codes Center | توليد أكواد مقيدة بنطاق، سجل أكواد، إلغاء رمز والاشتراكات الناتجة | **IMPLEMENTED — PARTIAL**؛ ينقص عرض تفصيل الرمز/المستخدم، النسخ، إعادة التفعيل، حذف وإدارة المجموعات |
| Administrators | قائمة، بحث وفلترة، إنشاء، تعديل، تغيير دور، تعطيل/تفعيل، إعادة تعيين كلمة مرور، حذف بتحقق super-admin | **IMPLEMENTED — PARTIAL**؛ ينقص محرر scope فعلي في النموذج، وعرض تفاصيل المدير والجلسات |
| Roles | قائمة، إنشاء، تفعيل/تعطيل، حذف role مخصص | **IMPLEMENTED — PARTIAL**؛ API يملك replace permissions لكن لا توجد واجهة permission matrix، ولا API مقروء لجلب grants التفصيلية |
| Students | لا يوجد قسم في admin-web | **BACKEND ONLY**؛ API يدعم القائمة/الفلترة/ban/unban/revoke-sessions.[5] |
| Security/Audit | لا يوجد قسم في admin-web | **BACKEND ONLY / PARTIAL**؛ توجد security logs وcritical alerts وunbind-device، لكن لا سجل تدقيق شامل قابل للتصفح.[6] |
| Questions/Exams/Files | لا يوجد قسم في admin-web | **BACKEND ONLY** بدرجات مختلفة؛ API CRUD موجود لكن الواجهة الإدارية غائبة |
| Reports/Analytics | لا يوجد قسم في admin-web المستقل | **BACKEND ONLY**؛ dashboard reports موجودة في student-web بالمكان الخطأ |
| Notifications | لا يوجد قسم في admin-web | **BACKEND ONLY** لإرسال الإشعارات وقائمة المرسلة/الإحصاءات |
| Settings | لا صفحة ولا endpoint تطبيقي مخصص | **MISSING** |

## 4. مطابقة الوظائف الرئيسية مع السلسلة الكاملة

| الوظيفة | الواجهة المنشورة | Frontend | API والخادم | اختبار مناسب | الحالة النهائية |
|---|---:|---:|---:|---:|---|
| مصادقة الطالب | نعم: login فقط | نعم | نعم | جزئي فقط | **IMPLEMENTED — PARTIAL** |
| OTP المؤجل | واجهة موجودة | نعم | نعم مع flag افتراضي false | اختبارات handler سابقة | **UI ONLY / Deferred** |
| Dashboard الطالب | يتطلب دخولاً | نعم | نعم | لا E2E | **IMPLEMENTED — PARTIAL** |
| المحتوى الأكاديمي للطالب | يتطلب دخولاً | نعم | نعم، مع entitlement | لا E2E | **IMPLEMENTED — PARTIAL** |
| حل الأسئلة والإجابة والإبلاغ | يتطلب دخولاً | نعم | نعم، مع entitlement موقّع | لا E2E | **IMPLEMENTED — PARTIAL** |
| مفضلة سؤال/ملف | يتطلب دخولاً | نعم | نعم | لا E2E | **IMPLEMENTED — PARTIAL** |
| قوائم مفضلة متعددة | لا | لا | لا توجد كيانات/مسارات للـ lists | لا | **MISSING** |
| الامتحانات والاستئناف والنتائج | يتطلب دخولاً | نعم | نعم: start يعيد/يستأنف session وsubmit/review | لا E2E | **IMPLEMENTED — PARTIAL** |
| قائمة اختبارات مستقلة للطالب | لا | لا route مستقل | API حسب subject فقط | لا | **MISSING** |
| المكتبة والعارض المحمي | يتطلب دخولاً | نعم | نعم: access/view مع entitlement | لا E2E | **IMPLEMENTED — PARTIAL** |
| بحث موحد | يتطلب دخولاً | نعم | نعم | لا E2E | **IMPLEMENTED — PARTIAL** |
| إحصاءات وتقدم الطالب | يتطلب دخولاً | نعم | نعم | لا E2E | **IMPLEMENTED — PARTIAL** |
| ملف الطالب والأمان الشخصي | يتطلب دخولاً | معلومات + logout | change-password موجود | لا E2E | **IMPLEMENTED — PARTIAL**؛ تنقص UI sessions/devices/change-password |
| إشعارات الطالب | يتطلب دخولاً | inbox/read | API موجود | لا E2E | **IMPLEMENTED — PARTIAL** |
| Offline web | PWA موجودة | خدمات offline موجودة | package/sync موجودة | اختبارات محدودة | **UNVERIFIED**؛ لا يساوي Native trusted offline |
| Dashboard المدير العام | واجهة منفصلة موجودة | overview ثابت؛ بديل داخل student-web | endpoints metrics موجودة | لا E2E | **IMPLEMENTED — PARTIAL** |
| إدارة الهيكل الأكاديمي | جزئياً بعد login | إنشاء/أرشفة/محاضرات | create/update موجودة | لا E2E | **IMPLEMENTED — PARTIAL** |
| إدارة الطلاب | لا | لا | list/ban/unban/revoke موجود | handler قائم | **BACKEND ONLY** |
| إدارة المديرين | نعم بعد login | نعم | نعم | لا E2E | **IMPLEMENTED — PARTIAL** |
| Roles/Permissions/Scope | جزئي | roles list/lifecycle فقط | permission/scope موجودان | لا E2E | **IMPLEMENTED — PARTIAL** |
| إدارة الأسئلة | لا | لا | CRUD/import/publish/archive | لا E2E | **BACKEND ONLY** |
| إدارة الاختبارات | لا | لا | CRUD/publish/archive | لا E2E | **BACKEND ONLY**؛ إنشاء API لا يحمل نافذة الإتاحة أو max attempts |
| إدارة الملفات | لا | لا | upload URL/complete/edit/publish/archive/delete | لا E2E | **BACKEND ONLY** |
| الأكواد وEntitlements | نعم جزئياً | generator/ledger | generate/redeem/revoke/issue/renew | لا E2E | **IMPLEMENTED — PARTIAL** |
| تقارير محتوى (moderation) | جزئي في student-web | ملخص read-only | summary فقط إدارياً | لا E2E | **IMPLEMENTED — PARTIAL**؛ تنقص إجراءات معالجة/رفض/إغلاق |
| Analytics متقدم | لا في admin-web | dashboard محدود بمكان خاطئ | stats/revenue/growth/top subjects | لا E2E | **BACKEND ONLY** |
| Announcements/Notifications إدارة | لا | لا | send/sent/stats | لا E2E | **BACKEND ONLY** |
| Security events | لا | الطالب يرسل event فقط | logs/alerts/optional unbind | اختبارات ذات صلة موجودة | **BACKEND ONLY / PARTIAL** |
| Audit Logs قابل للتصفح | لا | لا | الكتابة موجودة ضمن خدمات متعددة | لا endpoint عام للفهرسة | **MISSING** |
| System settings | لا | لا | policy constants فقط | لا | **MISSING** |

## 5. جرد استدعاءات API في الواجهة

| مجال | استدعاءات الواجهة الحالية |
|---|---|
| Auth | `register`, `verify-otp`, `resend-otp`, `login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `change-password`, `me` |
| Academic | `universities`, `colleges`, `years`, `semesters`, `subjects`, `lectures`, `complete` |
| Questions/Favorites | listing/detail/answer/report، إضافة/حذف مفضلة سؤال وملف |
| Exams | by-subject/detail/start/submit/results/review |
| Library | by-subject/detail/access/view وتبديل مفضلة ملف |
| Search | `GET /search?q=` |
| Notifications | list/unread-count/read/mark-all-read/push-token |
| Stats | personal stats/leaderboard/global |
| Offline | download/sync/packages/status/delete |
| الإدارة داخل student-web | dashboard/recent-activity/revenue/student-growth/top-subjects/reports-summary، وحفنة mutations غير معروضة بشكل كامل |
| الإدارة المنفصلة | admin login، academic lifecycle، codes generate/revoke/list، admins lifecycle، roles lifecycle فقط |

لا تستخدم `admin-web` مسارات أسئلة أو اختبارات أو مكتبة أو طلاب أو أمن أو إشعارات، رغم وجود أجزاء منها في API. كما أن `admin-web` يقوم دائماً بتمرير `scope* = null` عند إنشاء/تعديل مدير؛ لهذا فهو لا يحقق مطلب تحديد Scope من الواجهة.[7]

## 6. فروقات وتعارضات حاسمة

| التعارض | الدليل | الأثر |
|---|---|---|
| الفصل بين واجهة الطالب والإدارة | مواصفاتك تشترط Dashboard مدير مستقلاً، لكن `/admin/dashboard` و`/admin/reports` يقعان داخل `student-web` وتحت ProtectedRoute مصادقة فقط | مخاطرة وصول وتجربة غير صحيحة؛ يجب نقل الوظائف أو حماية المسارات بدور admin |
| API المنشور | الحزمتان المنشورتان على Vercel تضمان `cms-api-preview.onrender.com`، بينما القوالب وworkflow تستهدف `api.cms.example.com` | لا يمكن اعتبار نطاق API الإنتاجي منشوراً؛ مراقبة الصحة الحالية ستفشل حتى بعد عودة Actions |
| حالة النشر | `PROJECT_STATUS.md` يحدد `PRODUCTION NO-GO` صراحةً | يمنع تصنيف النظام بأنه Production Ready |
| إدارة النطاق | API يدعم scope، لكن نموذج admin-web لا يختاره بل يصفره | قد يؤدي إلى تعيين مدير مقيّد بلا scope، أو إدارة لا تطابق سياسة المنتج |
| اختبار المزايا | اختبار الطالب ناجح لكنه لا يغطي login حقيقياً أو entitlement أو exam E2E أو admin workflows | معظم المزايا تبقى partial/unverified، لا fully implemented |
| الاختبارات والامتحانات | API إنشاء اختبار لا يتضمن availability window أو max attempts صراحةً | متطلبات المواصفات غير ممثلة بالكامل في عقد الإنشاء الحالي |
| التقارير | summary read-only فقط | لا يوجد lifecycle لمعالجة بلاغات السؤال/الملف/الوصول والتقنية |
| المفضلة | الكيان الحالي favorite مفرد على سؤال أو ملف | مطلب القوائم المسمّاة المتعددة غير منفذ |

## 7. الحكم الموحد قبل التعديل

**المكتمل بدرجة معقولة في الشفرة:** الهيكل الأكاديمي الأساسي، تسجيل الطالب ومدخلات الهوية الأكاديمية، تدفق سؤال MCQ، جزء كبير من دورة exam-session، entitlement عند قراءة المحتوى، المفضلة المفردة، بحث موحد، notifications الطالب، الإحصاءات، وتوليد الأكواد المقيدة.

**المكتمل جزئياً:** كل ما سبق لا يملك دليلاً E2E على البنية المنشورة؛ كما أن إدارة الأكاديمي والمديرين والأدوار والأكواد لا تغطي جميع controls المطلوبة.

**المكسور أو غير الصحيح معماريّاً:** عنوان API المنشور لا يطابق نطاق الإنتاج المفترض، health monitoring متوقف قبل التنفيذ بسبب قيد GitHub Actions، ومسارا admin الموجودان داخل student-web محميان بالمصادقة فقط في الواجهة.

**الناقص بوضوح:** واجهة Students؛ إدارة أسئلة/اختبارات/ملفات؛ محرر permissions وscope؛ analytics/reports داخل لوحة الإدارة الصحيحة؛ إجراءات معالجة التقارير؛ audit-log viewer؛ security console؛ announcements؛ system settings؛ صفحة قائمة اختبارات؛ قوائم مفضلة متعددة؛ account security UI للطالب؛ وروابط قانونية حقيقية.

## المراجع

[1]: https://github.com/laith20218/cms-platform-manus/blob/d6f5d85af74fd78572503ff98671f8fc8710b93d/apps/api/src/CMS.Api/Authorization/PermissionAuthorization.cs "Permission and scope authorization"
[2]: https://github.com/laith20218/cms-platform-manus/blob/d6f5d85af74fd78572503ff98671f8fc8710b93d/apps/api/src/CMS.Infrastructure/Persistence/ApplicationDbContext.cs "CMS database model"
[3]: https://github.com/laith20218/cms-platform-manus/blob/d6f5d85af74fd78572503ff98671f8fc8710b93d/apps/student-web/src/app/router.tsx "Student routes"
[4]: https://github.com/laith20218/cms-platform-manus/blob/d6f5d85af74fd78572503ff98671f8fc8710b93d/apps/student-web/src/components/layouts/Sidebar.tsx "Student desktop navigation"
[5]: https://github.com/laith20218/cms-platform-manus/blob/d6f5d85af74fd78572503ff98671f8fc8710b93d/apps/api/src/CMS.Api/Controllers/AdminDashboardController.cs "Admin dashboard and student-management endpoints"
[6]: https://github.com/laith20218/cms-platform-manus/blob/d6f5d85af74fd78572503ff98671f8fc8710b93d/apps/api/src/CMS.Api/Controllers/SecurityController.cs "Security endpoints"
[7]: https://github.com/laith20218/cms-platform-manus/blob/d6f5d85af74fd78572503ff98671f8fc8710b93d/apps/admin-web/src/App.tsx "Admin SPA implementation"
