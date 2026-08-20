# CONTEXT.md — Single Source of Truth

> **تحذير**: هذا الملف هو المرجع الوحيد للحقيقة للمشروع. في بداية كل جلسة، يجب قراءة هذا الملف بالكامل قبل تنفيذ أي مهمة. لا تعتمد إطلاقاً على ذاكرة المحادثة.

**آخر تحديث**: 2026-07-31 (Session #25)
**إصدار الوثيقة**: 2.8.0
**الحالة**: 🔄 Development Phase — Phase 30 (Testing & QA) Done — 94% Complete

---

## 1. وصف المشروع

### 1.1 الاسم
- **الاسم الرسمي**: CMS — College Medical System
- **الاسم التجاري المقترح**: سيتم اعتماده في Phase 3 (Brand Strategy)
- **الاسم المختصر**: CMS

### 1.2 النبذة
CMS هو تطبيق ويب احترافي (Progressive Web App — PWA) مخصص لإدارة بنك أسئلة ودورات امتحانية ومكتبة تعليمية لطلاب الجامعات. يستهدف في مرحلته الأولى كليات الطب البشري في الجامعات السورية (مرحلة أولى: جامعة حمص)، مع تصميم مرن قابل للتوسع لأي جامعة أو كلية أو تخصص مستقبلاً دون الحاجة إلى تعديل الكود البرمجي.

### 1.3 طبيعة المنصة
المنصة ليست موقعاً لعرض الملفات أو الاختبارات فحسب، بل هي **نظام تعليمي متكامل** يجمع بين:
- إدارة المحتوى الأكاديمي
- إدارة المستخدمين والصلاحيات
- الاختبارات التفاعلية
- المكتبة الرقمية المحمية
- نظام الاشتراكات بالأكواد
- لوحة التحكم الإدارية
- الإحصائيات التفصيلية ولوحة المتصدرين
- الإشعارات متعددة القنوات
- حماية المحتوى متعددة الطبقات

### 1.4 المرجع البصري الأساسي
المرجع البصري المعتمد هو ملف `upload/بنك الرثوية.html` الذي يعكس نمط التصميم المطلوب (Glassmorphism + Medical Blue + Cairo Font + RTL). يجب الالتزام بنفس الهوية البصرية مع رفعها لمستوى منتج تجاري عالمي.

---

## 2. المتطلبات الوظيفية (Functional Requirements)

### FR-1: إدارة الهيكل الأكاديمي
- FR-1.1: دعم عدد غير محدود من الجامعات.
- FR-1.2: دعم عدد غير محدود من الكليات لكل جامعة.
- FR-1.3: دعم عدد غير محدود من السنوات لكل كلية.
- FR-1.4: دعم عدد غير محدود من الفصول لكل سنة.
- FR-1.5: دعم عدد غير محدود من المواد لكل فصل.
- FR-1.6: دعم عدد غير محدود من المحاضرات لكل مادة.
- FR-1.7: هرمياً: جامعة ← كلية ← سنة ← فصل ← مادة ← محاضرات ← اختبارات ← أسئلة.
- FR-1.8: لا توجد قيم ثابتة في الكود — كل البيانات تأتي من قاعدة البيانات.

### FR-2: نظام المستخدمين
- FR-2.1: نوعان من الحسابات: طالب ومدير.
- FR-2.2: الطالب يسجل برقم الهاتف (واتساب) + كلمة مرور.
- FR-2.3: عدد غير محدود من المدراء بصلاحيات متدرجة.
- FR-2.4: المدير يُحدد له نطاق: جامعة / كلية / سنة / مادة.
- FR-2.5: المدير لا يرى إلا الجزء المخول له فقط.
- FR-2.6: ربط الحساب بجهاز واحد (Device Binding).

### FR-3: نظام الاشتراكات
- FR-3.1: الاشتراك يعتمد على أكواد تفعيل ينشئها المدير.
- FR-3.2: كل كود يحتوي على: تاريخ بداية، تاريخ انتهاء، حالة التفعيل، نوع الاشتراك، الجامعة، الكلية، السنة، المادة.
- FR-3.3: مرونة النطاق: من مادة واحدة إلى كل كلية الطب.
- FR-3.4: الكود يُستهلك بمجرد تفعيله ولا يمكن إعادة استخدامه.

### FR-4: الصفحة الرئيسية للطالب
- FR-4.1: عرض الجامعات ← الكليات ← السنوات ← الفصول ← المواد بحسب صلاحيات الطالب.
- FR-4.2: عرض تقدم الطالب في كل مادة.
- FR-4.3: وصول سريع للمفضلة والإحصائيات.

### FR-5: داخل المادة
- FR-5.1: تنقسم المادة إلى قسمين: التصنيفات (محاضرات) + الدورات الكاملة.
- FR-5.2: التصنيفات: كل محاضرة مستقلة بأسئلتها.
- FR-5.3: الدورات الكاملة: امتحانات مجمعة تضم جميع أسئلة دورة معينة.

### FR-6: نظام الأسئلة
- FR-6.1: يدعم حالياً اختيار من متعدد (MCQ).
- FR-6.2: قابل للتوسعة مستقبلاً: صح/خطأ، ترتيب، توصيل، حالات سريرية، صور، تفاعلية.
- FR-6.3: كل سؤال يحتوي على: نص السؤال، الخيارات، الإجابة الصحيحة، الشرح، الوسوم، اسم المحاضرة، سنة الدورة، الصور إن وجدت.

### FR-7: تجربة حل السؤال
- FR-7.1: عند الصواب: خيار أخضر + صوت نجاح + تحديث السجل.
- FR-7.2: عند الخطأ: خيار أحمر + عرض الإجابة الصحيحة + اهتزاز الجهاز + عرض الشرح.
- FR-7.3: لكل سؤال: إضافة للمفضلة، إنشاء قائمة مفضلة، الإبلاغ عن خطأ، مشاركة الرابط الداخلي.

### FR-8: المكتبة الرقمية
- FR-8.1: لكل مادة مكتبة مستقلة.
- FR-8.2: الأنواع المدعومة: PDF، HTML، صور، فيديوهات يوتيوب، ملفات الشامل، الملخصات، الفقرات.
- FR-8.3: العرض داخل قارئات مدمجة (لا يمكن التنزيل).
- FR-8.4: ملفات HTML تُعرض كما هي داخل قالب المنصة.

### FR-9: الفيديوهات
- FR-9.1: الاعتماد على يوتيوب كمصدر.
- FR-9.2: الفيديو يظهر داخل مشغل مدمج (لا يرى المستخدم يوتيوب).
- FR-9.3: جلب الفيديو من قوائم تشغيل خاصة.

### FR-10: البحث
- FR-10.1: محرك بحث شامل.
- FR-10.2: اختيار نطاق البحث: الأسئلة / الملفات / المحاضرات.

### FR-11: الإحصائيات
- FR-11.1: تسجيل أول نتيجة فقط (First Attempt).
- FR-11.2: نسبة النجاح.
- FR-11.3: أكثر مادة استخداماً.
- FR-11.4: أكثر ملف مشاهدة.
- FR-11.5: أصعب مادة.
- FR-11.6: أكثر طالب نشاطاً.
- FR-11.7: ترتيب الطلاب.

### FR-12: لوحة المتصدرين (Leaderboard)
- FR-12.1: أفضل الطلاب بحسب: المادة / السنة / الكلية.
- FR-12.2: الاعتماد على أول محاولة فقط.

### FR-13: الملف الشخصي
- FR-13.1: عرض البيانات الشخصية، الاشتراك، المواد المفعلة، الإحصائيات، نتائج الاختبارات، المفضلات.

### FR-14: الإشعارات
- FR-14.1: Push Notifications (FCM).
- FR-14.2: إشعارات داخل التطبيق.
- FR-14.3: إشعارات منبثقة.
- FR-14.4: الاستهداف: طالب / مادة / فصل / سنة / كلية / جامعة.

### FR-15: الوضع الليلي
- FR-15.1: وضع فاتح + وضع داكن.
- FR-15.2: تذكر اختيار المستخدم.

### FR-16: العمل دون اتصال (Offline)
- FR-16.1: تنزيل اختبارات المادة كبيانات مشفرة.
- FR-16.2: لا يمكن استخراجها كملفات.

### FR-17: نظام الحماية (Security)
- FR-17.1: ربط الحساب بجهاز واحد ورفض الدخول من جهاز آخر.
- FR-17.2: منع الحسابات المتعددة.
- FR-17.3: منع استخراج الملفات وتنزيل PDF.
- FR-17.4: منع نسخ النصوص وتحديدها.
- FR-17.5: منع حفظ الصور.
- FR-17.6: حماية الروابط.
- FR-17.7: تشفير البيانات المحلية.
- FR-17.8: Watermark باسم الموقع واسم الطالب ورقمه.
- FR-17.9: تسجيل محاولات تغيير الجهاز وتسجيل الشاشة.
- FR-17.10: إرسال تنبيه للمدير عند اكتشاف مخالفة.
- FR-17.11: ملاحظة تقنية: منع تصوير الشاشة بنسبة 100% غير ممكن في متصفحات الويب، يُقلل المخاطر فقط.

### FR-18: لوحة التحكم الإدارية
- FR-18.1: مستقلة تماماً عن موقع الطلاب.
- FR-18.2: إدارة كاملة بلا كود لكل الكيانات: جامعات، كليات، سنوات، فصول، مواد، محاضرات، أسئلة، ملفات، فيديوهات، أكواد، مستخدمين، مدراء، صلاحيات، إعلانات، إشعارات، إحصائيات.

### FR-19: رفع المحتوى
- FR-19.1: رفع PDF / HTML / صور / ملفات أخرى.
- FR-19.2: ملفات HTML تُعرض كما هي لأنها مبنية بنفس قالب الاختبارات.

---

## 3. المتطلبات غير الوظيفية (Non-Functional Requirements)

### NFR-1: الأداء (Performance)
- NFR-1.1: زمن استجابة API < 200ms للطلبات العادية (P95).
- NFR-1.2: زمن تحميل الصفحة الأولى < 2.5s على شبكة 4G.
- NFR-1.3: دعم 10,000 مستخدم نشط متزامن.
- NFR-1.4: دعم 1,000 طلب/ثانية في الذروة.
- NFR-1.5: استخدام Redis كطبقة كاش لكل الاستعلامات المتكررة.

### NFR-2: التوفر (Availability)
- NFR-2.1: توفر 99.9% (SLA).
- NFR-2.2: Recovery Time Objective (RTO) < 1 ساعة.
- NFR-2.3: Recovery Point Objective (RPO) < 15 دقيقة.

### NFR-3: الأمان (Security)
- NFR-3.1: تشفير البيانات أثناء النقل (TLS 1.3).
- NFR-3.2: تشفير البيانات في الراحة (AES-256).
- NFR-3.3: JWT للجلسات مع refresh tokens.
- NFR-3.4: Rate limiting على APIs الحساسة.
- NFR-3.5: CORS محدود على النطاقات المعتمدة فقط.
- NFR-3.6: WAF (Web Application Firewall) عبر Cloudflare.

### NFR-4: قابلية التوسع (Scalability)
- NFR-4.1: بنية قابلة للتوسع الأفقي (Horizontal Scaling).
- NFR-4.2: Stateless Backend.
- NFR-4.3: Read Replicas لقاعدة البيانات.

### NFR-5: إمكانية الوصول (Accessibility)
- NFR-5.1: WCAG 2.1 Level AA كحد أدنى.
- NFR-5.2: دعم قارئ الشاشة.
- NFR-5.3: تباين ألوان ≥ 4.5:1 للنصوص.
- NFR-5.4: تنقل كامل بلوحة المفاتيح.

### NFR-6: التجاوب (Responsiveness)
- NFR-6.1: Mobile-first design.
- NFR-6.2: نقاط التوقف: 360px / 768px / 1024px / 1440px / 1920px.
- NFR-6.3: دعم RTL كامل.

### NFR-7: التوافق (Compatibility)
- NFR-7.1: أحدث إصدارين من Chrome / Firefox / Safari / Edge.
- NFR-7.2: iOS 15+ و Android 10+.
- NFR-7.3: PWA قابل للتثبيت على جميع المنصات.

### NFR-8: التدويل (i18n)
- NFR-8.1: اللغة الافتراضية: العربية (ar-SY).
- NFR-8.2: جاهزية لإضافة الإنجليزية مستقبلاً.
- NFR-8.3: دعم RTL و LTR.

### NFR-9: قابلية الصيانة (Maintainability)
- NFR-9.1: تغطية اختبارات ≥ 80%.
- NFR-9.2: توثيق API عبر OpenAPI/Swagger.
- NFR-9.3: ESLint + Prettier للـ Frontend.
- NFR-9.4: EditorConfig موحد.

### NFR-10: قابلية المراقبة (Observability)
- NFR-10.1: Structured logging.
- NFR-10.2: APM (Application Performance Monitoring).
- NFR-10.3: Health checks على كل الخدمات.
- NFR-10.4: تنبيهات تلقائية عند الأعطال.

---

## 4. التقنيات المعتمدة

### 4.1 Frontend
| التقنية | الإصدار | الغرض |
|---------|---------|------|
| React | 19.x | مكتبة الواجهة |
| TypeScript | 5.x | لغة البرمجة |
| Tailwind CSS | 4.x | إطار التنسيق |
| Vite | 6.x | أداة البناء |
| PWA | — | Progressive Web App |
| React Router | 7.x | التنقل |
| TanStack Query | 5.x | إدارة حالة الخادم |
| Zustand | 5.x | إدارة الحالة المحلية |
| React Hook Form | 7.x | إدارة النماذج |
| Zod | 3.x | التحقق من البيانات |
| Vitest | 2.x | اختبارات الوحدة |
| Playwright | 1.x | اختبارات E2E |

### 4.2 Backend
| التقنية | الإصدار | الغرض |
|---------|---------|------|
| ASP.NET Core | 9.x | إطار العمل |
| C# | 13.x | لغة البرمجة |
| Entity Framework Core | 9.x | ORM |
| FluentValidation | 11.x | التحقق من المدخلات |
| MediatR | 12.x | CQRS pattern |
| AutoMapper | 13.x | mapping الكائنات |
| Serilog | 4.x | التسجيل المنظم |
| Swagger / OpenAPI | — | توثيق API |
| xUnit | 2.x | اختبارات الوحدة |

### 4.3 البنية التحتية
| التقنية | الغرض |
|---------|------|
| PostgreSQL 16 | قاعدة البيانات الرئيسية |
| Redis 7 | الكاش + Queues |
| Cloudflare R2 | تخزين الملفات (S3-compatible) |
| Cloudflare CDN | شبكة توصيل المحتوى |
| Cloudflare WAF | جدار الحماية |
| Firebase Cloud Messaging | Push notifications |

### 4.4 الاستضافة
| المكوّن | المزود |
|---------|--------|
| Frontend | Vercel |
| Backend | Railway |
| Database | Railway (PostgreSQL managed) |
| Storage | Cloudflare R2 |
| Cache | Railway (Redis managed) |

### 4.5 DevOps & Tooling
| الأداة | الغرض |
|--------|------|
| GitHub | مستودع الكود |
| GitHub Actions | CI/CD |
| Docker | الحاويات |
| Sentry | تتبع الأخطاء |
| PostHog | تحليلات المنتج |
| Better Stack | مراقبة التواجد |

---

## 5. قرارات التصميم

### D-001: التزامن مع المرجع البصري "بنك الرثوية"
- **القرار**: اعتماد ملف `بنك الرثوية.html` كمرجع بصري أساسي للهوية.
- **السبب**: يعكس ذوق العميل المسبق ويضمن قبول التصميم النهائي.
- **التطبيق**: استخدام نفس لوحة الألوان (#1976D2, #00BCD4) ونظام Glassmorphism وخط Cairo.

### D-002: اعتماد Glassmorphism كنمط أساسي
- **القرار**: استخدام Glassmorphism للبطاقات والحوارات والقوائم.
- **السبب**: يعكس الحداثة التقنية + يوفر عمقاً بصرياً + مناسب للوضع الليلي والنهاري.
- **الاستثناءات**: الجداول والأشكال البيانية تستخدم سطحاً صلباً للوضوح.

### D-003: خط Cairo كخط أساسي
- **القرار**: استخدام Cairo للعربية، و Inter للإنجليزية، و JetBrains Mono للكود.
- **السبب**: Cairo حديث وواضح + متوافق مع Web + يدعم الأوزان المتعددة.

### D-004: PWA بدلاً من Native App
- **القرار**: بناء PWA فقط في المرحلة الأولى.
- **السبب**: تقليل التكلفة + إصدار أسرع + دعم Offline.
- **المخاطر**: قيود في منع تسجيل الشاشة — موثقة في FR-17.11.

### D-005: فصل لوحة الإدارة عن موقع الطلاب
- **القرار**: نطاقان منفصلان (app.domain.com + admin.domain.com).
- **السبب**: أمان أعلى + تجربة مستخدم محسّنة + صيانة أسهل.

---

## 6. بنية المشروع (Project Architecture)

```
cms-platform/
├── apps/
│   ├── student-web/          # تطبيق الطالب (React 19 + Vite)
│   │   ├── src/
│   │   │   ├── components/   # المكونات القابلة لإعادة الاستخدام
│   │   │   ├── features/     # الميزات (auth, questions, library...)
│   │   │   ├── pages/        # الصفحات
│   │   │   ├── hooks/        # React hooks
│   │   │   ├── stores/       # Zustand stores
│   │   │   ├── services/     # API services
│   │   │   ├── types/        # TypeScript types
│   │   │   ├── utils/        # أدوات مساعدة
│   │   │   └── styles/       # أنماط Tailwind
│   │   ├── public/
│   │   └── vite.config.ts
│   │
│   ├── admin-web/            # لوحة الإدارة (React 19 + Vite)
│   │   └── (نفس هيكل student-web)
│   │
│   └── api/                  # الـ Backend (ASP.NET Core 9)
│       ├── src/
│       │   ├── CMS.Api/              # طبقة العرض (Controllers, Middleware)
│       │   ├── CMS.Application/      # طبقة التطبيق (Handlers, Validators)
│       │   ├── CMS.Domain/           # طبقة النطاق (Entities, Value Objects)
│       │   ├── CMS.Infrastructure/   # طبقة البنية (EF Core, Redis, R2)
│       │   └── CMS.Tests/            # الاختبارات
│       └── tests/
│
├── packages/                 # الحزم المشتركة (Monorepo)
│   ├── ui/                   # مكتبة المكونات المشتركة
│   ├── types/                # أنواع TypeScript مشتركة
│   ├── config/               # إعدادات مشتركة
│   └── utils/                # أدوات مشتركة
│
├── docs/                     # التوثيق (هذا المجلد)
├── design/                   # أصول التصميم (Figma exports, icons)
├── scripts/                  # سكريبتات الأتمتة
├── .github/                  # CI/CD workflows
└── README.md
```

---

## 7. قواعد البرمجة (Coding Standards)

### 7.1 قواعد تسمية الملفات
- **Components**: `PascalCase.tsx` (مثال: `QuestionCard.tsx`)
- **Hooks**: `camelCase` يبدأ بـ `use` (مثال: `useAuth.ts`)
- **Utils**: `camelCase.ts` (مثال: `formatDate.ts`)
- **Types**: `PascalCase.types.ts` (مثال: `Question.types.ts`)
- **Constants**: `kebab-case.constants.ts` (مثال: `api-routes.constants.ts`)
- **Tests**: `<file>.test.ts` أو `<file>.spec.ts`
- **C# files**: `PascalCase.cs` (مثال: `QuestionService.cs`)

### 7.2 قواعد تسمية الكلاسات والمكونات
- **React Components**: PascalCase (`QuestionCard`, `LibraryReader`)
- **Functions**: camelCase (`fetchQuestions`, `formatDuration`)
- **Variables**: camelCase (`questionCount`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`, `MAX_RETRIES`)
- **Types/Interfaces**: PascalCase + اسم وصفي (`Question`, `StudentProfile`)
- **C# Classes**: PascalCase (`QuestionService`, `StudentController`)
- **C# Methods**: PascalCase (`GetQuestions`, `ValidateCode`)
- **C# Private fields**: `_camelCase` (`_logger`, `_context`)

### 7.3 قواعد تسمية الـ API
- **Base URL**: `/api/v1`
- **Resource naming**: جمع، صغير (مثال: `/api/v1/questions`, `/api/v1/students`)
- **RESTful conventions**:
  - `GET /api/v1/questions` — قائمة
  - `GET /api/v1/questions/{id}` — عنصر واحد
  - `POST /api/v1/questions` — إنشاء
  - `PUT /api/v1/questions/{id}` — تحديث كامل
  - `PATCH /api/v1/questions/{id}` — تحديث جزئي
  - `DELETE /api/v1/questions/{id}` — حذف
- **Actions مخصصة**: `POST /api/v1/questions/{id}/report` (verb كـ suffix)
- **Query params**: camelCase (`?page=1&pageSize=20&sortBy=createdAt`)

### 7.4 قواعد كتابة الكود
- **Frontend**:
  - TypeScript strict mode
  - لا `any` بدون تعليق مبرر
  - Functional components فقط (no class components)
  - Custom hooks للمنطق القابل لإعادة الاستخدام
  - مكونات صغيرة (< 200 سطر) ومركّبة
- **Backend**:
  - Clean Architecture (Api → Application → Domain → Infrastructure)
  - CQRS مع MediatR
  - Async/await في كل مكان (لا `.Result` أو `.Wait()`)
  - Dependency Injection في كل مكان
  - Nullable reference types مفعّلة

### 7.5 قواعد Git
- **Branches**: `feature/`, `bugfix/`, `hotfix/`, `release/`
- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`)
- **PRs**: مراجعة إلزامية + CI يمر + اختبارات تمر

---

## 8. معايير الأمان (Security Standards)

### 8.1 المصادقة (Authentication)
- JWT مع Access Token (15 دقيقة) + Refresh Token (7 أيام).
- تشفير bcrypt لكلمات المرور (cost factor 12).
- قفل الحساب بعد 5 محاولات فاشلة (15 دقيقة).
- 2FA اختياري للمدراء.

### 8.2 الصلاحيات (Authorization)
- RBAC (Role-Based Access Control).
- ABAC (Attribute-Based) للنطاقات الأكاديمية.
- Policy-based authorization في ASP.NET Core.

### 8.3 حماية المحتوى
- توقيع روابط R2 بـ Signed URLs (صلاحية 5 دقائق).
- Watermark ديناميكي على PDF (اسم الطالب + التاريخ + IP).
- Service Worker لمنع التنزيل.
- Content-Security-Policy صارمة.

### 8.4 تشفير البيانات
- في الراحة: AES-256-GCM للبيانات الحساسة.
- في النقل: TLS 1.3 إلزامي.
- أسرار التطبيق: في متغيرات البيئة فقط (لا في الكود).

---

## 9. هيكل قاعدة البيانات (Database Schema Overview)

> التفاصيل الكاملة في Phase 3: Database Design

### الجداول الرئيسية
1. **universities** — الجامعات
2. **colleges** — الكليات (FK → university)
3. **academic_years** — السنوات (FK → college)
4. **semesters** — الفصول (FK → academic_year)
5. **subjects** — المواد (FK → semester)
6. **lectures** — المحاضرات (FK → subject)
7. **exams** — الاختبارات (FK → subject / lecture)
8. **questions** — الأسئلة (FK → exam / lecture)
9. **question_options** — خيارات السؤال
10. **students** — الطلاب
11. **admins** — المدراء
12. **admin_roles** — أدوار المدراء
13. **admin_permissions** — صلاحيات المدراء
14. **subscription_codes** — أكواد الاشتراك
15. **student_subscriptions** — اشتراكات الطلاب الفعلية
16. **attempt_logs** — سجل المحاولات
17. **favorites** — المفضلة
18. **favorite_lists** — قوائم المفضلة
19. **library_files** — ملفات المكتبة
20. **notifications** — الإشعارات
21. **device_bindings** — ربط الأجهزة
22. **security_logs** — سجلات الأمان
23. **leaderboards** — لوحة المتصدرين (materialized view)

---

## 10. هيكل Frontend

### 10.1 الصفحات الرئيسية (Student App)
```
/                       → Splash + Redirect
/login                  → تسجيل الدخول
/register               → التسجيل
/activate               → تفعيل الكود
/dashboard              → الرئيسية
/universities           → الجامعات
/universities/:id       → الكليات
/colleges/:id           → السنوات
/years/:id              → الفصول
/semesters/:id          → المواد
/subjects/:id           → المادة (تصنيفات + دورات)
/lectures/:id           → محاضرة + أسئلة
/exams/:id              → اختبار كامل
/questions/:id          → سؤال مفرد
/library/:subjectId     → المكتبة
/library/file/:id       → قارئ ملف
/search                 → البحث
/profile                → الملف الشخصي
/favorites              → المفضلة
/leaderboard            → المتصدرين
/notifications          → الإشعارات
/settings               → الإعدادات
```

### 10.2 الصفحات الرئيسية (Admin App)
```
/admin/login            → تسجيل دخول المدير
/admin/dashboard        → لوحة التحكم
/admin/universities     → إدارة الجامعات
/admin/colleges         → إدارة الكليات
/admin/years            → إدارة السنوات
/admin/semesters        → إدارة الفصول
/admin/subjects         → إدارة المواد
/admin/lectures         → إدارة المحاضرات
/admin/questions        → بنك الأسئلة
/admin/exams            → الدورات
/admin/library          → المكتبة
/admin/codes            → أكواد الاشتراك
/admin/students         → الطلاب
/admin/admins           → المدراء
/admin/roles            → الأدوار والصلاحيات
/admin/notifications    → الإشعارات
/admin/reports          → التقارير والإحصائيات
/admin/settings         → الإعدادات
```

---

## 11. هيكل Backend

### 11.1 Clean Architecture Layers
```
CMS.Api                  → Controllers, Middleware, Swagger
CMS.Application          → CQRS Handlers, Validators, DTOs, Mappings
CMS.Domain               → Entities, Value Objects, Domain Events
CMS.Infrastructure       → EF Core, Redis, R2, Email, SMS, FCM
CMS.Tests                → Unit + Integration Tests
```

### 11.2 API Endpoints الرئيسية
```
/api/v1/auth/{login,register,refresh,logout}
/api/v1/students/{me,subscriptions,progress,stats}
/api/v1/admins/{me,permissions}
/api/v1/universities
/api/v1/colleges
/api/v1/academic-years
/api/v1/semesters
/api/v1/subjects
/api/v1/lectures
/api/v1/exams
/api/v1/questions
/api/v1/library
/api/v1/codes
/api/v1/notifications
/api/v1/leaderboard
/api/v1/search
/api/v1/favorites
/api/v1/reports
/api/v1/security/logs
```

---

## 12. الاتفاقيات البرمجية (Conventions)

### 12.1 معالجة الأخطاء
- **Frontend**: React Error Boundaries + Toast notifications.
- **Backend**: Global exception middleware + ProblemDetails (RFC 7807).
- **API**: رموز حالة HTTP قياسية + رسالة عربية + كود خطأ داخلي.

### 12.2 التسجيل (Logging)
- مستويات: `Trace`, `Debug`, `Info`, `Warning`, `Error`, `Critical`.
- لا تسجيل بيانات حساسة (كلمات مرور، tokens).
- معرف الطلب (CorrelationId) في كل سجل.

### 12.3 الترجمة
- ملفات JSON منفصلة: `ar.json`, `en.json`.
- مفاتيح الترجمة: `namespace.key` (مثال: `errors.required_field`).

### 12.4 التواريخ
- التخزين: UTC في قاعدة البيانات.
- العرض: حسب توقيت المستخدم (Asia/Damascus افتراضياً).
- التنسيق: ISO 8601 في API.

---

## 13. قواعد إدارة التغييرات

### 13.1 عند اكتشاف حاجة لتعديل قرار سابق
1. سجل المشكلة في `DECISIONS.md`.
2. اشرح سبب التعديل.
3. وضح تأثيره على المشروع.
4. حدد الملفات التي ستتغير.
5. حدّث `DECISIONS.md`.
6. حدّث جميع الملفات المتأثرة (CONTEXT.md, FILE_INDEX.md, DEPENDENCY_GRAPH.md...).

### 13.2 لا تعديل مباشر
يُمنع تعديل أي قرار معماري أو تصميمي دون المرور بهذا البروتوكول.

---

## 14. سجل القرارات المعتمدة

| ID | القرار | التاريخ | الحالة |
|----|--------|---------|--------|
| D-001 | اعتماد بنك الرثوية كمرجع بصري | 2026-07-30 | Approved |
| D-002 | اعتماد Glassmorphism كنمط أساسي | 2026-07-30 | Approved |
| D-003 | خط Cairo + Inter + JetBrains Mono | 2026-07-30 | Approved |
| D-004 | PWA فقط (لا Native في المرحلة 1) | 2026-07-30 | Approved |
| D-005 | فصل admin عن student app | 2026-07-30 | Approved |
| D-006 | اعتماد Radix UI للـ primitives | 2026-07-30 | Approved |
| D-007 | اعتماد TanStack Table للـ DataTable | 2026-07-30 | Approved |
| D-008 | اعتماد Framer Motion للحركة | 2026-07-30 | Approved |
| D-009 | اعتماد CVA + React Hook Form + Zod | 2026-07-30 | Approved |
| D-010 | **اعتماد التصميم الرسمي** (Design Approval) | 2026-07-30 | ✅ Approved |
| D-011 | اعتماد Lucide React للأيقونات | 2026-07-30 | Approved |
| D-012 | Modular Monolith (بدلاً من Microservices) | 2026-07-30 | Approved |
| D-013 | CQRS مع MediatR | 2026-07-30 | Approved |
| D-014 | Server-Side Caching مع Redis | 2026-07-30 | Approved |
| D-015 | Direct-to-R2 Uploads (Signed URLs) | 2026-07-30 | Approved |
| D-016 | PWA مع Service Worker | 2026-07-30 | Approved |
| D-017 | Feature-based Folder Structure (Frontend) | 2026-07-30 | Approved |
| D-018 | Database-First Design مع EF Core Migrations | 2026-07-30 | Approved |

---

## 14A. ملخص مرحلة التصميم (Design Phase Summary)

### المراحل المكتملة (11 مرحلة)

| # | المرحلة | المخرج الرئيسي |
|---|---------|---------------|
| 1 | Project Discovery | تحليل النطاق + 8 أصحاب مصلحة + RACI |
| 2 | Requirements Analysis | 19 FR + 10 NFR + مصفوفة تتبع + 10 مخاطر |
| 3 | Brand Strategy | شخصية "المرشد الموثوق" + 4 Personas + 7 قيم |
| 4 | Moodboard | 23 مرجع بصري + فلسفة الإضاءة والحركة |
| 5 | Visual Identity | 70+ لون + 3 خطوط + 8 تدرّجات + 150+ CSS Variables |
| 6 | Design System | 90+ مكوّن React + WCAG 2.1 AA + دليل تجاوب |
| 7 | User Flows | 12 تدفق مستخدم + 13 مخطط Mermaid + 151+ خطوة |
| 8 | Information Architecture | 107 صفحة + 28 جدول DB + 50+ URL pattern |
| 9 | Wireframes | 41 شاشة Wireframe (Desktop + Mobile + Tablet) |
| 10 | High Fidelity Design | 4 نماذج HTML/CSS تفاعلية (~2,570 سطر) |
| 11 | Design Review | تقرير مراجعة عبر 10 أبعاد — الدرجة 9.05/10 |
| **12** | **Design Approval** | **✅ معتمد رسمياً — جاهز للتطوير** |

### إحصائيات مرحلة التصميم

| المؤشر | القيمة |
|--------|--------|
| الملفات المنشأة | 27 ملف |
| أسطر التوثيق | ~26,870 سطر |
| نماذج HTML/CSS | 4 نماذج (~2,570 سطر) |
| الجلسات | 8 جلسات (كلها في 2026-07-30) |
| درجة Design Review | 9.05/10 ✅ |
| التحسينات المطلوبة | 20 (5 مُطبّقة + 15 في Phase 16) |

### الخطوة التالية: التطوير البرمجي

بعد اعتماد التصميم رسمياً، يبدأ التطوير البرمجي:

- **Phase 13**: System Architecture (بنية النظام) ✅ **Done** — `docs/ARCHITECTURE.md`
- **Phase 14**: Database Design (تصميم قاعدة البيانات) ✅ **Done** — `docs/DATABASE_SCHEMA.md`
- **Phase 15**: Backend Foundation (ASP.NET Core 9) ✅ **Done** — `docs/API_SPECIFICATION.md` + `apps/api/`
- **Phase 16**: Frontend Foundation (React 19 + Tailwind 4) ✅ **Done** — `apps/student-web/` + `packages/ui/`
- **Phase 17**: Authentication & Authorization ✅ **Done** — 8 Auth endpoints + 5 Frontend pages
- **Phase 18**: Role & Permission System ✅ **Done** — RBAC + ABAC + 25 policies + 2FA
- **Phase 19**: University Management ✅ **Done** — 30+ endpoints + SubjectsPage + SubjectDetailPage
- **Phase 20**: Question Bank ✅ **Done** — 10+ endpoints + QuestionPage (answer + feedback + favorites + report)
- **Phase 21**: Interactive Exams ✅ **Done** — 7+ endpoints + ExamPage (timer + grid + results) + ExamReviewPage
- **Phase 22**: Offline Engine ✅ **Done** — 4 endpoints + IndexedDB + useOffline hook + auto-sync
- **Phase 23**: Digital Library ✅ **Done** — 8 endpoints + LibraryPage (PDF/HTML/Video/Image viewer + Watermark + Signed URLs)
- **Phase 24**: Admin Dashboard ✅ **Done** — 11 endpoints + AdminDashboardPage (stats + revenue + activity + reports + student/code management)
- **Phase 25**: Notifications System ✅ **Done** — 8 endpoints + NotificationsPage (targeted delivery + push tokens + delivery stats)
- **Phase 26+27**: Statistics & Leaderboard ✅ **Done** — 3 endpoints + StatsPage + LeaderboardPage (podium + first-attempt only + cached)
- **Phase 28**: Security Hardening ✅ **Done** — SecurityService + 3 Middleware + 5 security hooks (anti-copy + DevTools + watermark + device binding + rate limiting)
- **Phase 29**: Performance Optimization ✅ **Done** — 3 Performance Middleware + PerformanceService + 6 performance hooks + Vite build optimization
- **Phase 30**: Testing & QA ✅ **Done** — 20+ backend unit tests + 8+ frontend tests + CI/CD pipeline (6 jobs)
- **Phase 31**: Deployment
- ... (حتى Phase 32: Production Release)

### ملخص Phase 13: System Architecture

تم إكمال بنية النظام الكاملة في `docs/ARCHITECTURE.md` (~1,985 سطر):

- **8 مبادئ معمارية** معتمدة.
- **Clean Architecture + CQRS** للـ Backend (4 طبقات).
- **Feature-based structure** للـ Frontend (React 19 + Vite + PWA).
- **PostgreSQL 16 + Redis 7** لقاعدة البيانات والكاش.
- **Cloudflare + Vercel + Railway** للبنية التحتية.
- **7 طبقات أمان** (Defense in Depth).
- **3 Data Flow Diagrams** (تسجيل الدخول + حل سؤال + رفع ملف).
- **7 قرارات معمارية جديدة** (D-012 → D-018).

### ملخص Phase 14: Database Design

تم إكمال تصميم قاعدة البيانات في `docs/DATABASE_SCHEMA.md` (~2,065 سطر):

- **30 جدول** كامل بـ SQL Schema + EF Core.
- **~95 فهرس** (B-tree + GIN + BRIN + Partial + Composite).
- **3 جداول مقسّمة** شهرياً (attempt_logs, security_logs, audit_logs).
- **Full-Text Search عربي** (arabic_unaccent configuration).
- **EF Core**: BaseEntity + Entities + Configurations + ApplicationDbContext.
- **Seed Data**: admin_roles + permissions + academic structure + super admin.
- **Data Retention Policies**: 10 أنواع + Hangfire cleanup jobs.
- **ERD Diagram** كامل (Mermaid).

### ملخص Phase 15: Backend Foundation

تم إكمال بنية الـ Backend في `apps/api/` (27 ملف، ~2,678 سطر C#):

- **4 طبقات Clean Architecture**: CMS.Api + CMS.Application + CMS.Domain + CMS.Infrastructure.
- **14 Entity** منشأة (Academic + Questions + Users) مع factory methods + business logic.
- **20+ Enum** معرّف.
- **ApplicationDbContext** مع 30 DbSet + snake_case convention.
- **CQRS** مع MediatR (Commands/Queries + 3 Pipeline Behaviors).
- **JWT Authentication** (Access 15min + Refresh 7days).
- **BCrypt** Password Hashing.
- **Redis** Cache Service + **Cloudflare R2** Storage Service.
- **Exception Handling** Middleware (RFC 7807 Problem Details).
- **89 API endpoints** موثّقة في `docs/API_SPECIFICATION.md`.
- **Docker** multi-stage build.
- **Swagger/OpenAPI** + Health Checks + Serilog.

### ملخص Phase 16: Frontend Foundation

تم إكمال بنية الـ Frontend في `apps/student-web/` + `packages/ui/` (46 ملف، ~2,149 سطر):

- **Monorepo**: pnpm workspaces + Turborepo.
- **React 19 + Vite 6 + TypeScript 5 + Tailwind CSS 4**.
- **150+ CSS Variables** (Design Tokens كاملة).
- **ThemeProvider** (Light/Dark + localStorage + system preference).
- **AuthProvider** (JWT + device fingerprint + auto refresh).
- **React Router 7** (lazy loading + protected routes).
- **React Query 5** + Axios API Client.
- **AppShell** (Navbar + Sidebar + BottomNav).
- **DashboardPage** + **LoginPage** كاملين.
- **PWA** (manifest + service worker + offline caching).
- **packages/ui/**: 15+ مكوّن (Button + Input + Card + Badge + Text + Stack + Container + Grid + Box + Spinner + Skeleton).

---

## 15. المراجع

- **المرجع البصري**: `upload/بنك الرثوية.html`
- **الجامعة المستهدفة الأولى**: جامعة حمص - كلية الطب البشري
- **المطور المرجعي**: الليث النقري (الفريق العلمي - جامعة حمص)

### ملفات التوثيق المرجعية

| الملف | الغرض |
|------|------|
| `README.md` | نظرة عامة على المشروع |
| `docs/ARCHITECTURE.md` | بنية النظام الكاملة (Phase 13) |
| `docs/DATABASE_SCHEMA.md` | تصميم قاعدة البيانات (Phase 14) |
| `docs/API_SPECIFICATION.md` | توثيق API — 89 endpoint (Phase 15) |
| `docs/DESIGN_REVIEW.md` | تقرير المراجعة (9.05/10) |
| `docs/DESIGN_SYSTEM.md` | نظام التصميم (90+ مكوّن) |
| `docs/HIGH_FIDELITY.md` | مواصفات التصميم النهائي |
| `apps/api/` | كود الـ Backend — ASP.NET Core 9 (Phase 15) |
| `apps/student-web/` | كود الـ Frontend — React 19 + Vite (Phase 16) |
| `packages/ui/` | Design System — React Components (Phase 16) |
| `design/high-fidelity/*.html` | النماذج التفاعلية (4 نماذج) |

---

**نهاية ملف CONTEXT.md**
