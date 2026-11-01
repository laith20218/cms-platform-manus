# المعجم المصطلحي المعتمد

> هذا المعجم هو المرجع الملزم لكل ملفات `docs/analysis-ar/`. التزمت به التزاماً كاملاً في الترجمة.
>
> **قاعدة عامة:** المصطلح التقني يُكتب بالعربية أولاً ثم أصله الإنجليزي بين قوسين عند أول ظهور في كل تقرير، ثم يُستخدم الشكل العربي وحده في بقية التقرير. الاستشهادات بصيغة `file:line` والمسارات وأسماء الملفات والشيفرة وكتل Mermaid وأسماء المنتجات والاختصارات تبقى بصيغتها الإنجليزية حرفياً دون أي تغيير.

| المصطلح الإنجليزي | المقابل العربي المعتمد | ملاحظة |
|---|---|---|
| architecture | البنية المعمارية | تُستخدم للبرمجيات؛ «بنية المستودع» للمستودع |
| layer | طبقة | Domain = النطاق، Application = التطبيق، Infrastructure = البنية التحتية، Api = الواجهة البرمجية |
| backend / frontend | الطرف الخلفي / الطرف الأمامي | يجوز «الواجهة الخلفية/الأمامية» |
| controller | متحكم | لا يُكتب «متحكّم الـ controller» |
| endpoint | نقطة نهاية | |
| route | مسار | المسارات الحقيقية مثل `api/auth/login` تبقى بالإنجليزية |
| handler | معالج | |
| request / response | طلب / استجابة | |
| middleware | وسيط | |
| dependency injection (DI) | حقن التبعيات (DI) | الاختصار يبقى DI |
| authentication | المصادقة | تمييز الهوية |
| authorization | التخويل | منح الصلاحيات |
| entitlement | الاستحقاق | سياق الاشتراكات والوصول للمحتوى |
| policy | سياسة | |
| claim | مطالبة | سياق JWT |
| token | رمز | |
| session | جلسة | |
| refresh token | رمز التحديث | |
| database | قاعدة البيانات | |
| migration | ترحيل | ترحيلات قاعدة البيانات |
| index | فهرس | فهارس قاعدة البيانات |
| constraint | قيد | |
| foreign key (FK) | مفتاح أجنبي (FK) | |
| primary key | المفتاح الأساسي | |
| entity | كيان | |
| cascade delete | الحذف التتابعي | ON DELETE CASCADE تبقى كما هي |
| query / command (CQRS) | استعلام / أمر | نمط CQRS يبقى بالاختصار |
| event | حدث | |
| service | خدمة | |
| repository (نمط برمجي) | مستودع | سياق أنماط الشيفرة، لا مستودع git |
| caching / cache | التخزين المؤقت / الذاكرة المؤقتة | |
| bundle | حزمة | حزم الواجهة الأمامية |
| lazy loading | التحميل الكسول | |
| code splitting | تقسيم الشيفرة | |
| component | مكوّن | |
| state management | إدارة الحالة | |
| rendering / render | العرض / يعرض | |
| build | البناء | |
| deployment | النشر | |
| environment | بيئة | |
| pipeline (CI/CD) | خط أنابيب | خطوط أنابيب CI/CD |
| rollback | التراجع | |
| secret | سرّ | أسرار الإعداد مثل المفاتيح وكلمات المرور |
| audit log | سجل التدقيق | |
| logging | التسجيل | |
| monitoring | المراقبة | |
| test suite | حزمة الاختبارات | |
| unit / integration / e2e test | اختبار وحدة / تكامل / من طرف إلى طرف | e2e يبقى بالاختصار |
| coverage | التغطية | |
| tech debt | الدين التقني | |
| risk | خطر | |
| mitigation | معالجة | إجراء المعالجة |
| feature | ميزة | |
| capability | قدرة | |
| scaling / scale | التوسع / يتوسع | |
| vertical / horizontal scaling | التوسع الرأسي / الأفقي | |
| throughput / latency | الإنتاجية / زمن الاستجابة | |
| performance | الأداء | |
| security | الأمان | |
| vulnerability | ثغرة | |
| anti-scraping | مكافحة الاستخراج الآلي | |
| rate limiting | تحديد المعدل | |
| presigned URL | رابط موقّع مسبقاً | |
| object storage | التخزين الكائني | |
| streaming | البث | |
| transcoding | تحويل الترميز | |
| upload / download | الرفع / التنزيل | |
| watermark | علامة مائية | |
| encryption / hashing | التشفير / التجزئة | |
| password | كلمة المرور | |
| role / permission | دور / صلاحية | |
| admin | مشرف / لوحة الإدارة | حسب السياق؛ `admin-web` اسم تطبيق يبقى بالإنجليزية |
| student | طالب | |
| teacher / instructor | معلّم | |
| course | دورة | |
| lesson | درس | |
| exam / question | امتحان / سؤال | اختبار تُحفظ للـ test |
| library | المكتبة | مركز محتوى الوسائط |
| media | وسائط | |
| notification | إشعار | |
| report | تقرير | |
| analytics | التحليلات | |
| dashboard | لوحة المعلومات | |
| i18n | التدويل (i18n) | |
| RTL / LTR | من اليمين إلى اليسار / من اليسار إلى اليمين | الاختصاران يبقيان RTL/LTR |
| theming | السمات | نظام الألوان والسمات |
| dark mode | الوضع الداكن | |
| PWA | تطبيق ويب تقدمي (PWA) | |
| offline | دون اتصال | |
| sync | مزامنة | |
| branch (git) | فرع | أسماء الفروع مثل `docs/arabic-analysis` تبقى بالإنجليزية |
| commit / push | commit / push | مصطلحا git يبقيان بالإنجليزية لارتباطهما المباشر بالأمر |
| roadmap | خارطة الطريق | |
| milestone | معلم | |
| deliverable | تسليم | التسليمات |
| wave | موجة | موجات التسليم؛ أسماء مثل Wave 12.3 تبقى كما هي |
| verified / unverified | مُتحقَّق منه / غير مُتحقَّق منه | علامة UNVERIFIED تبقى كما هي لأنها مرجع ملف |
| evidence | دليل | |
| citation | استشهاد | |
| gap | فجوة | |
| blocker | عائق | |
| cold start | الإقلاع البارد | زمن إقلاع الخدمة من الصفر |
| worker / background job | عامل خلفي / مهمة خلفية | |
| queue | طابور | |
| search | البحث | |
| indexing (بحثي) | الفهرسة | فهرسة محتوى البحث |
| entitlement enforcement | إنفاذ الاستحقاق | نقاط فحص الوصول |
| scope | نطاق | |
| migration history | سجل الترحيلات | |
| seed / seeding | بيانات أولية / التهيئة بالبيانات | |
| fixture | عدة اختبار | fixtures تُستخدم حرفياً عند الحاجة |
| smoke test | اختبار دخان | فحص سريع لجاهزية التشغيل |
| WebSocket / signal | WebSocket / إشارة | WebSocket اسم تقنية يبقى |
| access code | رمز الوصول | رموز تفعيل الدورات |
| revenue | الإيرادات | |
| moat | خندق تنافسي | |
| traction | الجذب | مؤشرات التبني والنمو |
| market size (TAM/SAM/SOM) | حجم السوق (TAM/SAM/SOM) | الاختصارات تبقى |
| go-to-market | الدخول إلى السوق | |
| pricing | التسعير | |
| tier / plan | شريحة / خطة | شرائح الأسعار |
| uptime | زمن التشغيل | |
| observability | قابلية الرصد | |
| hardening | التحصين | تحصين الأمان |
| P0 / P1 / P2 | أولوية قصوى P0 / عالية P1 / متوسطة P2 | أحرف الأولوية تبقى كما هي |

---

**ملاحظات أسلوبية مُلزمة:**

1. الأرقام لاتينية (0-9) والتواريخ بصيغة YYYY-MM-DD.
2. لا خلط عشوائي بين العربية والإنجليزية داخل الجملة الواحدة؛ الأصل عربي، والمصطلح الأجنبي استثناء مقنّن.
3. جمل قصيرة مباشرة، بلا حشو ولا صفات تسويقية.
4. رسائل الأخطاء المقتبسة تُترجَم ثم يُذكر النص الأصلي بين قوسين.
5. أسماء مجموعات الميزات تُترجم مع إثبات المصطلح الإنجليزي بين قوسين عند أول ظهور.
