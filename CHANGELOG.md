# CHANGELOG.md

> جميع التغييرات الجوهرية في المشروع موثقة هنا.
> التنسيق: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [Unreleased]

### Phase 48 — Final Web/Backend Production Gate — 2026-08-20

#### Added
- أضيفت اختبارات integration حقيقية لأحداث الحماية (`/api/v1/security/events`) ولحساب إحصاءات seeded، وارتفع regression Backend إلى **138/138 PASS**.
- أضيفت عقود TypeScript صريحة للإحصاءات والمراجعة الأكاديمية/الامتحانات، وhelpers آمنة لتحويل أخطاء Axios من `unknown`.
- أضيفت contexts/hooks منفصلة لـAuth وTheme وPermission لمنع خلط component exports مع hooks.
- أضيف تقرير `docs/security/PHASE_48_FINAL_PRODUCTION_GATE_REPORT_2026-08-20.md` وسجلات أدلة Phase 48.

#### Changed
- أُصلحت Docker API/Web clean builds، `ReadyToRun` alpine RID، pnpm/PWA dependency resolution، وتكوين Nginx غير الجذري/`/api/v1` proxy.
- وُحد `VITE_API_URL` في القوالب وrunbooks، وشُدد CSP، ومنعت `.gitignore` إدراج شهادات TLS ومفاتيحها.
- أزيلت CI bypasses (`continue-on-error`) وأصبح lint يرفض التحذيرات عبر `--max-warnings=0`؛ وُحد Node CI على 22.
- أزيلت 38 تحذيراً فعلياً من Web lint، بما يشمل stale hook dependencies وcasts `any` غير المقيدة.

#### Verification
- backend full regression: **138/138 PASS**؛ Student Web tests: **11/11 PASS**؛ lint: **0 warnings**؛ production Web build: **PASS**.
- نجحت صور API/Web النظيفة وWeb runtime smoke المحدود ببديل حاويات محلي، ونجح Nginx syntax وCORS/readiness المحلية.
- الحكم الكلي يظل **`PRODUCTION NO-GO — BLOCKERS REMAIN`**: لا CI خارجي، ولا Docker Compose runtime كامل، ولا Staging/TLS/R2/Browser E2E/secret rotation/monitoring/backup evidence. لا يمثل هذا المدخل إصداراً production أو Release Candidate.

### Phase 47 — Web/Backend Production Integrity — 2026-08-20

#### Added
- إضافة `FavoritesController` لمسارات `GET/POST/DELETE /api/v1/favorites` مع تحقق entitlement وربط طالب/idempotency.
- إضافة `StudentSecurityEventsController` للمسار المقيد `POST /api/v1/security/events` وwhitelist لأحداث حماية الواجهة.
- إضافة migration `20260820135033_Phase47WebBackendIntegrity` لقيد favorite والفهارس الفريدة الجزئية.
- إضافة `FavoritesPage` و`AdminReportsPage` وربط routes الحقيقية.
- إضافة تقرير الدليل `docs/security/WEB_BACKEND_INTEGRATION_AUDIT_2026-08-20.md`، وتحديث `docs/API_REALITY_MATRIX.md` و`docs/WEB_ROUTE_RECONCILIATION.md`.

#### Changed
- اشتقاق subject scope في `QuestionsController` من lecture/exam على الخادم قبل تحقق entitlement.
- حساب `completedPercentage` في `StatsHandlers` من بيانات الأسئلة المنشورة بدلاً من قيمة ثابتة.
- ربط Dashboard وSidebar وNavbar وcontent-protection بعقود API الفعلية وإزالة روابط/بيانات ثابتة مضللة.
- توحيد `VITE_API_URL` وعقد proxy في Vite وcompose، ووضع tag `ready` لفحوص PostgreSQL وRedis.

#### Verification
- backend regression: **134/134 PASS**؛ student-web tests: **11/11 PASS**؛ route/method reconciliation: **0 unmatched**.
- الحكم الكلي يظل **`NO-GO` للإنتاج** إلى حين Docker/Nginx/R2/TLS/secrets/CI/Browser E2E evidence وإغلاق Phase 45 Android؛ لا يمثل هذا المدخل إصداراً production أو Release Candidate.


### Added — 2026-07-30

#### البنية التحتية للمشروع (Project Infrastructure)
- إنشاء `CONTEXT.md` — المصدر الوحيد للحقيقة (Single Source of Truth).
- إنشاء `PROJECT_TIMELINE.md` — خطة زمنية كاملة لـ 32 مرحلة و~150 مهمة تفصيلية.
- إنشاء `PROGRESS.md` — سجل التقدم اليومي مع مؤشرات الإنجاز والمخاطر.
- إنشاء `FILE_INDEX.md` — فهرس شامل لكل ملفات المشروع.
- إنشاء `DEPENDENCY_GRAPH.md` — رسم اعتماديات بين كل مكوّنات النظام.
- إنشاء `DECISIONS.md` — سجل رسمي لـ 11 قراراً معتمداً.
- إنشاء `ROADMAP.md` — خريطة طريق لـ 12 milestone كبرى.
- إنشاء `PROJECT_STATUS.md` — لوحة معلومات سريعة للحالة الراهنة.
- إنشاء `CHANGELOG.md` — هذا الملف.

#### Phase 1: Project Discovery (✅ Completed)
- إنشاء `docs/PROJECT_DISCOVERY.md` — تحليل شامل للمشروع يشمل: النبذة، الأهداف SMART، النطاق (In/Out of Scope)، أصحاب المصلحة (8 stakeholders + RACI matrix)، القيود، الافتراضات، المعايير التقنية، تحليل مخاطر أولي (10 مخاطر)، معايير النجاح.

#### Phase 2: Requirements Analysis (✅ Completed)
- إنشاء `docs/REQUIREMENTS.md` — توثيق كامل لـ:
  - 19 متطلباً وظيفياً (FR-1 إلى FR-19) بتفاصيل دقيقة ومعايير قبول قابلة للقياس
  - 10 متطلبات غير وظيفية (NFR-1 إلى NFR-10) قابلة للقياس
  - مصفوفة تتبع المتطلبات (Requirements Traceability Matrix)
  - تحليل 10 مخاطر تقنية وتجارية مع خطط تخفيف مفصّلة
  - قواعد قبول المتطلبات (Acceptance Criteria)

#### Phase 3: Brand Strategy (✅ Completed)
- إنشاء `docs/BRAND_GUIDELINES.md` يحتوي على:
  - إطار عمل هرم استراتيجية العلامة (Purpose, Mission, Vision, Values, Personality, Voice, Visual)
  - نموذج Aaker للشخصية (Competence + Sincerity مهيمنة)
  - الشخصية المركّبة: "المرشد الموثوق"
  - 5 صفات مركزية + 5 ثانوية + 5 مرفوضة
  - استعارة الشخصية: "المكتبة الطبية الرقمية بذكية أستاذ جامعي"
  - 4 Personas تفصيلية: أحمد (طالب طموح)، سارة (طالبة منظّمة)، د. خالد (مدير أكاديمي)، محمد (طالب محدود الإمكانيات)
  - خرائط تعاطف المستخدم (Empathy Maps)
  - فلسفة التصميم: "تصميم يخدم الطب، لا يصرف عنه"
  - 7 مبادئ تصميم + قائمة anti-patterns
  - 7 قيم بصرية (الثقة، الدقّة، الهدوء، الحماية، التقدّم، الحداثة، الهوية الطبية)
  - نبرة الصوت (6 مبادئ VP) + جداول السياقات + قوائم المفردات المعتمدة/المرفوضة
  - 7 اقتراحات لأسماء تجارية + توصية (ScholarMed)
  - وعد العلامة + الالتزامات تجاه المستخدم
  - البصمة العاطفية (رحلة العاطفة + النقاط الحرجة)

#### Phase 4: Moodboard (✅ Completed)
- إنشاء `docs/MOODBOARD.md` يحتوي على:
  - الإحساس العام: "غرفة عمليات هادئة فجراً"
  - أسلوب التصميم: Glassmorphism + Medical Precision + Modern Minimal
  - 23 مرجعاً بصرياً مصنّفاً في 6 فئات (طبية، تعليمية، SaaS، طبية تعليمية، dashboards، طبيعية)
  - الإضاءة: فلسفة + خصائص Light/Dark + طبقات + مصادر افتراضية + أضواء تحفيزية
  - الخامات: 5 خامات معتمدة (Frosted Glass, Crystal, Silk, Polished Metal, Medical Paper) + 6 مرفوضة
  - أسلوب الأيقونات: Lucide + مواصفات دقيقة + 8 أيقونات طبية مخصّصة
  - أسلوب الرسوم: 4 أنواع (Geometric Flat, Medical Line Art, Data Viz, Explainer Animation) + 6 مرفوضة
  - الحركة: 7 مبادئ + أنواع (microinteractions, transitions, celebration, warning) + Framer Motion + 5 easing functions
  - الإلهام اللوني: 5 ألوان أساسية + 5 تدرّجات + أمثلة طبيعية
  - الإلهام الطباعي: 3 خطوط + هرم طباعي كامل + أحجام متجاوبة

#### Phase 5: Visual Identity (✅ Completed)
- إنشاء `docs/VISUAL_IDENTITY.md` (~2,500 سطر) يحتوي على:
  - **لوحة الألوان الكاملة**: 7 ألوان (Primary, Accent, Success, Danger, Warning, Info, Neutral) × 10 تدرجات (50-900) + ألوان النظام (BG, Surface, Glass, Border, Text)
  - **نظام الخطوط**: Cairo (عربي، 9 أوزان) + Inter (إنجليزي، 6 أوزان) + JetBrains Mono (كود، 3 أوزان) + هرم طباعي كامل + أحجام متجاوبة (3 breakpoints) + قواعد Antialiasing
  - **نظام الأيقونات**: Lucide React + 7 أحجام + 3 أوزان stroke + 8 أيقونات طبية مخصّصة + قواعد الاستخدام
  - **8 تدرجات**: Primary, Dawn, Glass, Success, Celebration, Warning, Danger, Glow
  - **12 مستوى ظل**: XS, SM, MD, LG, XL, 2XL, Glass, Glow Primary/Accent/Success/Danger, Inner
  - **نظام مسافات**: 4px baseline + 17 مستوى (0-128px)
  - **نظام أحجام**: Touch targets, Buttons (5 أحجام), Inputs (3 أحجام), Cards (4 أحجام), Avatars (6 أحجام), Containers (8 أحجام)
  - **نظام حواف**: 9 مستويات (none, xs, sm, md, lg, xl, 2xl, 3xl, full)
  - **نظام z-index**: 11 طبقة (base, dropdown, sticky, banner, overlay, drawer, modal, popover, toast, tooltip, max)
  - **الوضع الليلي**: لوحة كاملة للوضع الداكن + آلية التبديل + قواعد
  - **CSS Variables**: ملف كامل جاهز للنسخ (~150 متغير)
  - **Tailwind config**: إطار عام للإعداد

### Decisions
- **D-001**: اعتماد ملف `بنك الرثوية.html` كمرجع بصري أساسي
- **D-002**: اعتماد Glassmorphism كنمط تصميم أساسي
- **D-003**: خطوط Cairo + Inter + JetBrains Mono
- **D-004**: PWA فقط (لا Native App في المرحلة الأولى)
- **D-005**: فصل admin app عن student app (نطاقان منفصلان)
- **D-006**: ASP.NET Core 9 + PostgreSQL 16 (محدد من العميل)
- **D-007**: Cloudflare R2 للتخزين السحابي
- **D-008**: Redis للكاش + Rate Limiting + Background Jobs
- **D-009**: Firebase Cloud Messaging للإشعارات
- **D-010**: Clean Architecture + CQRS في Backend
- **D-011**: Monorepo مع pnpm workspaces + Turborepo

#### Phase 6: Design System (✅ Completed — Session #2)
- إنشاء `docs/DESIGN_SYSTEM.md` (~2,624 سطر) — نظام تصميم كامل يحتوي على:
  - 8 مبادئ للمكوّنات (Composition, Predictability, A11y by Default, Responsive, RTL, Themable, TypeScript-First, Testable)
  - API Conventions موحّدة + قواعد الـ className
  - نظام Buttons: 7 variants (primary, secondary, ghost, danger, success, glass, link) × 5 sizes (xs-sm-md-lg-xl) × 6 states + تطبيق CVA كامل
  - نظام Inputs: 14 نوع حقل (Text, Password, Email, Phone, Number, Search, Textarea, Select, Checkbox, Radio, Switch, DatePicker, FileUpload, Slider, CodeInput) + FormField pattern
  - نظام Cards: 4 أنواع (ContentCard, StatCard, GlassCard, ProfileCard) + بنية تركيبية
  - نظام Dialogs: 5 أنواع (Modal, Drawer, ConfirmDialog, AlertDialog, Toast) + تنفيذ Radix UI
  - نظام DataTables: sorting + filtering + pagination + selection + inline edit + row actions + empty/error/loading states + responsive (cards on mobile) — تنفيذ TanStack Table
  - نظام Navigation: AppShell + Navbar (glass) + Sidebar (collapsible) + Breadcrumbs + Tabs + Command Palette (Ctrl+K)
  - نظام Forms: Simple + Two-Column + Multi-Step Wizard + Inline + React Hook Form + Zod validation
  - نظام Typography: 10 مستويات (Display → Overline) × 3 breakpoints + تنفيذ CVA
  - نظام Grid/Stack/Container + Spacing Scale
  - 7 Breakpoints (xs, sm, md, lg, xl, 2xl, 3xl) + Mobile-First
  - نظام Animation: Framer Motion + 6 presets (fadeIn, slideUp, scaleIn, staggerContainer, staggerItem, pageTransition) + احترام prefers-reduced-motion
  - نظام Icons: Lucide React + 8 أيقونات طبية مخصّصة (MedicalShield, ECGPulse, Stethoscope, Syringe, Brain, Heart, Lungs, Bone, DNA)
  - نظام Badges: 7 variants × 3 sizes × 3 shapes + dot + icon
  - نظام Toasts: 5 types (success, error, warning, info, loading) × 6 positions — Sonner
  - Empty States: 5 أنواع (No Data, No Results, Error, Locked, Coming Soon)
  - Loading States: Skeleton (Card, Text, Table, Page) + Spinner + Progress Bar + FullScreenLoader
  - Error Pages: 404 (غير موجود), 500 (خطأ خادم), 403 (ممنوع), 503 (صيانة)
  - Semantic Token System: 3 طبقات (Reference → System → Component) + تبديل Light/Dark تلقائي
  - Accessibility مدمجة في كل مكوّن
  - Testing Strategy (Vitest + Storybook + axe-core)

- إنشاء `docs/UI_COMPONENTS.md` (~1,136 سطر) — فهرس 90+ مكوّن:
  - 6 Primitives (Box, Stack, Text, Icon, Container, Grid)
  - 14 Inputs
  - 5 Buttons
  - 6 Cards
  - 9 Overlays
  - 8 Navigation
  - 12 Data Display
  - 9 Feedback
  - 6 Forms
  - 5 Layouts
  - 10 Patterns
  - 30+ Icons (Lucide + medical + brand)
  - قواعد التسمية والاستيراد (Barrel Exports)
  - أولوية التنفيذ (P0/P1/P2/P3)

- إنشاء `docs/ACCESSIBILITY.md` (~1,279 سطر) — دليل WCAG 2.1 AA كامل:
  - مبادئ POUR الأربعة
  - 13 إرشاد WCAG 2.1 AA موثّقة
  - قواعد الترميز الدلالي (Semantic HTML)
  - دعم لوحة المفاتيح (Focus management, skip links, no keyboard trap)
  - قارئ الشاشة (ARIA basics, sr-only, live regions)
  - جداول التباين الكاملة لـ CMS (Light + Dark)
  - قواعد Alt Text + أنواع الصور
  - الوسائط (Subtitles, transcripts, audio descriptions)
  - النماذج (Labels, errors, grouping, error summary)
  - التنقّل (Breadcrumbs, pagination, multiple ways)
  - اللغة و RTL (logical properties, RTL icons, Tailwind logical props)
  - الحركة (prefers-reduced-motion)
  - الاختبار (axe DevTools, Lighthouse, اختبار يدوي بقارئ الشاشة)
  - CI/CD pipeline للوصولية
  - قائمة فحص شاملة قبل اعتماد أي مكوّن

- إنشاء `docs/RESPONSIVE_GUIDE.md` (~1,243 سطر) — دليل التجاوب الكامل:
  - الأجهزة المستهدفة (Mobile, Tablet, Desktop, Foldable)
  - 7 نقاط توقف معتمدة (xs, sm, md, lg, xl, 2xl, 3xl)
  - Mobile-First Approach مع أمثلة
  - نظام الشبكة (Grid System) + 5 patterns شائعة
  - التخطيطات حسب الجهاز (AppShell لكل حجم: Mobile / Tablet / Desktop)
  - التنقّل حسب الجهاز (Navbar, Sidebar, Bottom Nav)
  - الطباعة المتجاوبة (Type Scale × 4 breakpoints)
  - الصور المتجاوبة (`<picture>`, srcset, lazy loading, aspect ratios)
  - النماذج المتجاوبة (touch targets ≥ 44px, iOS 16px rule)
  - الجداول المتجاوبة (3 حلول: cards, scroll, hide columns)
  - الأداء على الأجهزة الضعيفة (code splitting, prefetching, bundle analysis)
  - PWA و Responsive (manifest, safe areas, viewport meta)
  - قائمة فحص التجاوب لكل breakpoint
  - 6 قواعد ذهبية

### Decisions (Session #2)
- اعتماد **Radix UI** للـ primitives (dialogs, dropdowns, tabs, popovers) — يدعم RTL و الوصولية بشكل كامل
- اعتماد **TanStack Table** للـ DataTable — يدعم RTL و responsive + ميزات متقدّمة
- اعتماد **Sonner** للـ Toasts — بسيط، يدعم RTL، أداء عالٍ
- اعتماد **Framer Motion** للحركة — يدعم prefers-reduced-motion
- اعتماد **CVA (class-variance-authority)** لإدارة الـ variants في TypeScript
- اعتماد **clsx + tailwind-merge** لدمج classes بأمان
- اعتماد **React Hook Form + Zod** لإدارة النماذج والتحقق
- اعتماد **Lucide React** للأيقونات العامة + أيقونات طبية مخصّصة بالـ SVG

#### Phase 7: User Flows (✅ Completed — Session #3)
- إنشاء `docs/USER_FLOWS.md` (~2,225 سطر) — 12 تدفق مستخدم كامل:
  - **Flow 1**: تسجيل الدخول والتسجيل (15+ خطوة، 6 قرارات، 9 أخطاء، 5 edge cases)
    - OTP عبر واتساب، Device binding، استرجاع كلمة المرور
    - التحقق من الجهاز + تنبيه المدير عند محاولة دخول مشبوه
  - **Flow 2**: تفعيل كود الاشتراك (10+ خطوة، 6 قرارات، 5 edge cases)
    - CodeInput 12 خانة، auto-advance، paste support
    - فحص الصحة، النطاق، الاستبدال، التمديد
  - **Flow 3**: الدخول لمادة وحل اختبار (20+ خطوة، 6 قرارات، 5 edge cases)
    - وضع اختبار (مؤقت) + وضع مراجعة
    - تغذية راجعة بصرية + صوتية + اهتزاز
    - حفظ تلقائي + استئناف
  - **Flow 4**: الإبلاغ عن خطأ + المفضلة (12+ خطوة، 5 قرارات، 4 edge cases)
    - إنشاء قوائم مفضلة، إرفاق صور للبلاغات
  - **Flow 5**: مشاهدة ملف في المكتبة (12+ خطوة + حماية Watermark، 4 edge cases)
    - قارئات مدمجة (PDF, HTML, صور، فيديو)
    - Watermark ديناميكي، منع نسخ/تنزيل، كشف DevTools
  - **Flow 6**: مشاهدة فيديو يوتيوب مدمج (10+ خطوة، 3 edge cases)
    - إخفاء هوية يوتيوب، UI مخصّص، تتبّع نسبة المشاهدة
  - **Flow 7**: البحث الشامل (8+ خطوة + فلاتر، 4 edge cases)
    - بحث fuzzy، تطبيع عربي، highlight، autocomplete
  - **Flow 8**: دخول لوحة الإدارة (10+ خطوة + 2FA، 3 edge cases)
    - 2FA إلزامي، فلترة القائمة حسب النطاق
  - **Flow 9**: إنشاء كود اشتراك (12+ خطوة + توليد دفعات، 3 edge cases)
    - 5 أنواع نطاق، توليد حتى 1000 كود دفعة، تصدير CSV/PDF
  - **Flow 10**: رفع ملفات المكتبة (15+ خطوة + معالجة + فحص فيروسي، 4 edge cases)
    - drag & drop، رفع متوازي، resumable uploads
    - معالجة (ضغط، تحويل، تطهير) + فحص فيروسي
  - **Flow 11**: إرسال إشعارات (12+ خطوة + جدولة، 4 edge cases)
    - 7 جمهور مستهدف، 5 أنواع، جدولة فورية/مجدولة/متكرّرة
    - تتبّع التسليم (sent, delivered, read, clicked)
  - **Flow 12**: إدارة الأسئلة (15+ خطوة + استيراد/تصدير، 4 edge cases)
    - نموذج غني (LaTeX + صور)، استيراد Excel، تصدير
    - حذف مؤقت/دائم، مسودة/منشور
  
  - **خريطة تنقّل رئيسية** شاملة (Mermaid diagram)
  - **6 مبادئ** لتصميم التدفقات (البساطة، الوضوح، التسامح، الاستجابة، الاتساق، الوصولية)
  - **6 قواعد** إضافية (الحد الأقصى للخطوات، نقاط القرار، حالات الخطأ، حالات النجاح، Edge Cases، Analytics)
  - **قالب توثيق** للتدفقات المستقبلية
  - **13 مخطط Mermaid** (12 تدفق + خريطة رئيسية)
  - إجمالي: **151+ خطوة** + **58 نقطة قرار** + **61 حالة خطأ** + **36+ edge case**
  - اعتبارات الوصولية لكل تدفق (WCAG 2.1 AA)
  - نقاط Analytics لكل تدفق (قياس التحسين المستمر)

#### Phase 8: Information Architecture (✅ Completed — Session #4)
- إنشاء `docs/INFORMATION_ARCHITECTURE.md` (~2,153 سطر) — الهيكل المعماري للمعلومات الكامل:
  - **مقدمة + 7 مبادئ IA** (البساطة، التوقّع، الاتساق، التدرّج، التكرار المضبوط، قابلية التوسع، الوصولية)
  - **خريطة الموقع الكاملة** (Sitemap):
    - Student App: 8 أقسام رئيسية → 45 صفحة فرعية = 53 صفحة
    - Admin App: 8 أقسام رئيسية → 38 صفحة فرعية = 46 صفحة
    - Public Pages: 8 صفحات
    - **الإجمالي: 107 صفحة**
    - مخططان Mermaid شاملان (student + admin)
  - **هيكل التنقّل** (Navigation Structure):
    - 4 طبقات (Global, Local, Contextual, Supplementary)
    - Navbar مفصّل (Desktop + Mobile)
    - Sidebar مفصّل (Student + Admin)
    - Bottom Navigation (Mobile only)
    - 6 قواعد تنقّل (عمق، تراجع، رئيسية، كيبورد، حالة نشطة، تنقّل ذكي)
  - **تصنيف المحتوى** (Content Taxonomy):
    - 6 تصنيفات (Academic, Content, Type, Difficulty, Status, Tags)
    - 15 نوع محتوى (Question, Exam, Lecture, Subject, PDF, HTML, Image, Video, Summary, Comprehensive, Paragraph, Announcement, Notification, Achievement, User)
    - نظام وسوم كامل مع 40+ وسم طبي مقترح
    - بيانات وصفية تفصيلية لكل نوع محتوى
    - 4 قواعد تصنيف
  - **بنية URLs الكاملة** (URL Structure):
    - 6 مبادئ URLs (واضحة، RESTful، هرمية، SEO-friendly، ثابتة، قصيرة)
    - 6 نطاقات معتمدة (cms, admin, api, cdn, docs, status)
    - URL Structure كامل للـ Student App (الصفحات العامة، المصادقة، التطبيق، الموارد، الملف الشخصي، المساعدة، Offline)
    - URL Structure كامل للـ Admin App (المصادقة، اللوحة، الهيكل الأكاديمي، المحتوى، المستخدمون، الاشتراكات، التواصل، التقارير، النظام)
    - 50+ URL pattern موثّق
    - 8 query parameters قياسية
    - قواعد الـ Slugs + أمثلة
  - **علاقات الكيانات** (Entity Relationships):
    - مخطط ERD كامل (Mermaid) يغطي 28 جدول
    - تفاصيل كل جدول (حقول، أنواع، علاقات):
      - 7 جداول أكاديمية (universities → lectures)
      - 5 جداول أسئلة (questions, question_options, question_images, exams, exam_sessions)
      - 6 جداول مستخدمين (students, admins, admin_roles, admin_permissions, device_bindings, security_logs)
      - 4 جداول اشتراكات (subscription_codes, student_subscriptions, code_batches, attempt_logs)
      - 3 جداول مكتبة (library_files, library_views, error_reports)
      - 3 جداول تواصل (notifications, notification_deliveries, announcements)
      - 2 جداول مفضلة (favorites, favorite_lists)
      - 1 جدول إنجازات (achievements)
    - علاقات إضافية (Student → Subjects, Question → Tags, Admin → Scope)
  - **تسمية الصفحات** (Page Naming):
    - قواعد `<title>` و `<h1>` و Breadcrumbs
    - أمثلة للتسمية
    - Open Graph + Twitter Cards
  - **الـ Breadcrumbs**:
    - 4 قواعد (هرمية، آخر عنصر، فاصل، Aria-current)
    - أمثلة + تنفيذ React
  - **إدارة الحالات** (State Management):
    - 5 أنواع state (Server, Client, URL, Form, Persistent)
    - Zustand Stores (Auth, UI, Notifications)
    - React Query Patterns
  - **الـ Deep Linking**:
    - 3 أنواع (Web, Push Notification, Share)
    - 3 قواعد (المصادقة، الاشتراك، الأخطاء)
    - أمثلة
  - **الـ SEO والـ Meta Tags**:
    - استراتيجية SEO للمحتوى المحمي
    - Meta Tags القياسية
    - Structured Data (Schema.org)
    - sitemap.xml + robots.txt
  - **خريطة التحويل** (Conversion Map):
    - مسار التحويل الرئيسي (زائر → مسجّل → مشترك → نشط → وفّي)
    - 4 نقاط تحويل
    - Funnel Metrics مع أهداف
  - **قواعد إدارة المحتوى**:
    - دورة حياة المحتوى (5 حالات: draft → review → published → archived → deleted)
    - 4 قواعد (لا حذف نهائي، تحقق قبل النشر، سجل تغييرات، نسخ احتياطي)
  - **قائمة فحص IA** شاملة (Sitemap, Navigation, URL, Content, State, Accessibility, SEO, Deep Linking)
  - **3 مخططات Mermaid** (Student Sitemap + Admin Sitemap + ERD)

#### Phase 9: Wireframes (✅ Completed — Session #5)
- إنشاء `docs/WIREFRAMES.md` (~2,128 سطر) — 41 شاشة Wireframe كاملة:
  - **مقدمة + 8 مبادئ** للـ Wireframes (التركيز على الوظيفة، التسلسل الهرمي، الاتساق، Mobile-First، لا تفاصيل بصرية، التسمية الواضحة، الحالات الكاملة، قابلية الاستخدام)
  - **3 أنواع Grid**:
    - Desktop (≥ 1024px): Navbar 64px + Sidebar 280px + Content max-width 1280px
    - Tablet (768-1023px): Navbar 64px + Sidebar 240px (قابل للطي) + Content
    - Mobile (< 768px): Navbar 56px + Content full width + Bottom Nav 56px
  - **Public Pages (5 شاشات)**:
    - WF-P1: Landing Page (Desktop + Mobile) — Hero + Features + Stats + Testimonials + CTA
    - WF-P2: Features Page — 7 ميزات مع تفاصيل
    - WF-P3: Pricing Page — 3 خطط + كيف تحصل على كود
    - WF-P4: FAQ Page — Accordion مع 12 سؤال
    - WF-P5: Contact Page — معلومات + نموذج
  - **Auth Pages (4 شاشات)**:
    - WF-A1: Login Page (Desktop + Mobile) — رقم هاتف + كلمة مرور + تذكّرني + روابط
    - WF-A2: Register Page — نموذج 7 حقول + مؤشر قوة كلمة المرور
    - WF-A3: Verify OTP Page — 4 خانات + مؤقت + إعادة إرسال
    - WF-A4: Activate Code Page — CodeInput 12 خانة + قائمة الاشتراكات الحالية
  - **Student App Desktop (14 شاشة)**:
    - WF-S1: Dashboard — ترحيب + 6 stat cards + متابعة الدراسة + شبكة المواد + الإنجازات
    - WF-S2: Subject Page — header مادة + 4 tabs + قائمة محاضرات مع تقدّم
    - WF-S3: Lecture Page — بطاقة سؤال + خيارات + إجراءات + إحصائيات
    - WF-S4: Question Detail — نص + خيارات + شرح + صورة + مرجع
    - WF-S5: Exam Mode — مؤقت + خريطة أسئلة (100 سؤال) + بدون شرح فوري
    - WF-S6: Exam Results — نتيجة + مقارنة + توزيع + مواضيع أضعف
    - WF-S7: Library Page — فلترة + بطاقات ملفات بكل الأنواع
    - WF-S8: PDF Reader — مع Watermark + بدون تنزيل + toolbar
    - WF-S9: Search Page — tabs + فلاتر + نتائج مع highlight
    - WF-S10: Profile Page — 5 tabs + بيانات + نشاط
    - WF-S11: Favorites Page — قوائم + آخر المضاف
    - WF-S12: Leaderboard Page — Top 100 + موضعك
    - WF-S13: Notifications Page — قائمة + إجراءات
    - WF-S14: Settings Page — 5 tabs + خيارات
  - **Student App Mobile (3 شاشات)**:
    - WF-M1: Mobile Dashboard — بطاقات بعرض كامل + Bottom Nav
    - WF-M2: Mobile Question View — نص كامل + خيارات عمودية
    - WF-M3: Mobile Bottom Nav — 5 عناصر
  - **Admin App Desktop (9 شاشات)**:
    - WF-AD1: Admin Dashboard — 6 stat cards + رسم بياني + بلاغات + نشاطات
    - WF-AD2: Questions Management — DataTable + bulk actions + فلاتر
    - WF-AD3: Question Editor — محرّر غني + خيارات ديناميكية + تصنيف
    - WF-AD4: Codes Management — DataTable + tabs حالة
    - WF-AD5: Code Creation Dialog — 5 خطوات + معاينة
    - WF-AD6: Students Management — DataTable + فلاتر
    - WF-AD7: Library Management — DataTable + tabs نوع
    - WF-AD8: File Upload — drag & drop + قائمة رفع + بيانات وصفية
    - WF-AD9: Reports Page — فترات + رسوم بيانية + تصدير
  - **Special States (5 شاشات)**:
    - WF-SS1: Empty State — أيقونة + رسالة + CTA
    - WF-SS2: Loading State (Skeleton) — هيكل عظمي متحرّك
    - WF-SS3: Error State — أيقونة + رسالة + إعادة محاولة
    - WF-SS4: 404 Page — رقم كبير + رسالة + رابط رئيسية
    - WF-SS5: Offline Page — أيقونة + رسالة + اختبارات Offline
  - **Tablet (1 شاشة)**:
    - WF-T1: Tablet Dashboard — Sidebar أضيق + بطاقات في صفّين
  - **كل Wireframe يحتوي على**:
    - ASCII art layout كامل
    - قائمة العناصر مع وظائفها
    - التنقّل (من أين، إلى أين)
    - حالات خاصة (Empty, Loading, Error, Success)
    - ملاحظات للتصميم في Phase 10
  - **قائمة فحص شاملة** للـ Wireframes (10 عناصر + اختبار شامل)
  - **دليل الانتقال إلى High Fidelity** (Phase 10)
  - **إحصائيات الـ Wireframes**:
    - إجمالي: 41 شاشة
    - تغطية Sitemap: 38% (الشاشات الأهم)
    - تغطية User Flows: 100% (12/12)
    - Responsive: Desktop + Mobile + Tablet

#### Phase 10: High Fidelity Design (✅ Completed — Session #6)
- إنشاء `docs/HIGH_FIDELITY.md` (~974 سطر) — مواصفات التصميم النهائي:
  - مقدمة + الفرق عن Wireframes
  - قائمة 4 نماذج HTML/CSS منشأة
  - مواصفات تفصيلية لكل شاشة
  - تطبيق الهوية البصرية (150+ CSS Variables)
  - Microinteractions (hover, focus, active, loading, error)
  - 5 animations (fadeIn, shake, spin, pulse, slideUp)
  - Light vs Dark Mode (الاختلافات + آلية التبديل)
  - Responsive Behavior (Mobile + Tablet + Desktop)
  - Asset Specifications (Logo, Favicons, Images)
  - Typography in Practice (الهرم المطبّق)
  - Color Application + Spacing Application + Icons Usage
  - دليل الانتقال إلى التطوير (Sprint 1-4)
  - قائمة فحص High Fidelity شاملة

- إنشاء 4 نماذج HTML/CSS حقيقية في `design/high-fidelity/`:
  - **01-login.html** (~487 سطر):
    - Login form كامل (phone + password + remember + forgot)
    - Glassmorphism card مع backdrop-filter
    - 3 background orbs (gradient + blur)
    - Error alert state + Loading spinner state
    - Password toggle (eye icon)
    - Mobile responsive (height 52px for inputs)
    - FadeIn animations (staggered)
    - Cairo + Inter fonts + RTL support
    - ARIA labels + keyboard nav
  - **02-dashboard.html** (~957 سطر):
    - Student Dashboard (Light Mode)
    - Navbar كامل + Sidebar كامل (مع mini stats)
    - Breadcrumbs + Hero welcome card
    - 4 Stat cards (icons + trends + values)
    - Continue learning card (gradient primary + progress)
    - 3 Subject cards + 3 Achievement cards
    - Responsive (Mobile + Tablet + Desktop)
    - Staggered fadeIn animations
    - Hover effects (translateY + shadow)
  - **03-question-states.html** (~647 سطر):
    - بطاقة السؤال بـ 3 حالات كاملة:
      1. Default (selected option + glow ring)
      2. Correct (خيار أخضر ✓ + explanation panel + reference)
      3. Wrong (خيار أحمر ✗ + الإجابة الصحيحة بالأخضر + shake animation + explanation)
    - Card header مع question number + tags + status badge
    - Progress bar (4px height)
    - Question text + image placeholder
    - 4 options (A, B, C, D) مع letter boxes
    - Action buttons (favorite, report, share) + stats
    - Responsive
  - **04-dashboard-dark.html** (~459 سطر):
    - Student Dashboard (Dark Mode)
    - نفس محتوى 02-dashboard.html لكن بـ Dark Mode
    - الألوان:
      - Background: #0B1220
      - Surface: #1A2438
      - Glass: rgba(30,41,59,.65)
      - Text: #F1F5F9
      - Primary: #42A5F5 (أفتح للتباين)
      - Success: #00E676
      - Danger: #FF8A80
    - Shadows أعمق (rgba(0,0,0,.50))
    - تحقّق من تباين WCAG AA في Dark Mode

- **إجمالي نماذج High Fidelity**:
  - 4 نماذج HTML/CSS
  - ~2,550 سطر HTML/CSS
  - تغطية: Login + Dashboard (Light + Dark) + Question (3 states)
  - 150+ CSS Variables مطبّقة
  - 30+ أيقونة Lucide مستخدمة
  - 5 animations
  - Responsive كامل + RTL + Accessibility

#### Phase 11: Design Review (✅ Completed — Session #7)
- إنشاء `docs/DESIGN_REVIEW.md` (~1,040 سطر) — تقرير المراجعة الشاملة:
  - **ملخص تنفيذي**: نطاق المراجعة (13 ملف + 4 نماذج) + النتيجة الإجمالية (9.05/10)
  - **10 أبعاد مراجَعة تفصيلية**:
    1. **Visual Hierarchy (9.5/10)**: هرم طباعي واضح + مساحات بيضاء فعّالة + ألوان توجّه الانتباه
    2. **Accessibility (9.0/10)**: WCAG 2.1 AA كامل + Semantic HTML + دعم RTL + keyboard + ARIA + reduced motion
    3. **Contrast (9.5/10)**: جداول تباين كاملة لـ Light + Dark Mode (معظمها AAA)
    4. **Typography (9.0/10)**: Cairo + Inter + JetBrains Mono + هرم 10 مستويات + Antialiasing
    5. **Spacing (9.5/10)**: نظام 4px baseline صارم + 17 مستوى + Grid system
    6. **Consistency (9.0/10)**: 90+ مكوّن موحّد + Semantic Token System + قواعد تسمية
    7. **Responsiveness (9.0/10)**: Mobile-First + 7 breakpoints + touch targets + iOS 16px rule
    8. **Medical Identity (8.5/10)**: ألوان طبية + 18 أيقونة مخصّصة + مصطلحات دقيقة + Personas
    9. **Originality (8.0/10)**: ليس قالباً جاهزاً + شخصية مميّزة + Microinteractions مخصّصة
    10. **Modern UI (9.5/10)**: React 19 + Tailwind 4 + Glassmorphism + PWA + Framer Motion
  - **20 تحسيناً مطلوباً** مصنّفاً:
    - 5 عالية الأولوية (~3 ساعات)
    - 7 متوسطة الأولوية (~8 ساعات)
    - 8 منخفضة الأولوية (~5.5 ساعة + Phase 16)
  - **3 تحسينات عالية الأولوية مُطبّقة على النماذج**:
    - ✅ إضافة `role="alert"` + `aria-live="assertive"` على Error Alert في Login
    - ✅ إضافة `role="img"` + `aria-label` على صور السؤال (3 حالات)
    - ✅ إضافة لمسة طبية في خلفية Dashboard (خط ECG خفيف opacity 0.025)
  - **خطة تنفيذ التحسينات** (3 مراحل)
  - **التوصية النهائية**: ✅ Approved for Design Approval

- تحديث 3 نماذج HTML بتحسينات Design Review:
  - `design/high-fidelity/01-login.html`: + ARIA على Error Alert
  - `design/high-fidelity/02-dashboard.html`: + ECG pattern في الخلفية
  - `design/high-fidelity/03-question-states.html`: + ARIA على الصور (3 حالات)

#### Phase 12: Design Approval (✅ Completed — Session #8)
- **🎉 اعتماد رسمي للتصميم** — مرحلة التصميم مكتملة بالكامل (Phase 1-12)
- تطبيق التحسينات عالية الأولوية المتبقية:
  - ✅ إضافة `lang="en"` على "Ctrl K" في `02-dashboard.html`
  - ✅ إضافة `lang="en"` على "Ctrl K" في `04-dashboard-dark.html`
  - ✅ إضافة `lang="en"` على "College Medical System" في `01-login.html`
- إنشاء `README.md` (~250 سطر) — نظرة عامة احترافية على المشروع:
  - شارات (badges) للحالة والمرحلة ودرجة المراجعة
  - نظرة عامة + الميزات + التقنيات + الهيكل
  - إحصائيات + الهوية البصرية + Personas
  - البدء السريع + البروتوكول + خريطة الطريق
  - روابط سريعة لكل الملفات المهمة
- تحديث `CONTEXT.md` (v1.0.0 → v1.1.0):
  - الحالة: "Active — Design Phase" → "✅ Design Approved — Ready for Development"
  - إضافة D-010 (اعتماد التصميم الرسمي) إلى سجل القرارات
  - إضافة قسم 14A (ملخص مرحلة التصميم — 12 مرحلة + إحصائيات)
  - إضافة ملفات التوثيق المرجعية في قسم 15
- تحديث `PROJECT_STATUS.md`:
  - إعلان رسمي بالاعتماد (30 يوليو 2026)
  - Phase 12 marked as ✅ Done
  - Phase 13 marked as ⏳ Pending (Next — System Architecture)
  - جدول التحسينات المُطبّقة في Phase 12
- تحديث `PROGRESS.md` + `FILE_INDEX.md` + `CHANGELOG.md`

### Decisions (Session #8)
- **D-010**: **اعتماد التصميم الرسمي** (Design Approval) — 2026-07-30 ✅ Approved
  - السبب: إكمال مرحلة التصميم (Phase 1-11) بدرجة 9.05/10 + تطبيق التحسينات عالية الأولوية.
  - التأثير: فتح مرحلة التطوير البرمجي (Phase 13+).

#### Phase 13: System Architecture (✅ Completed — Session #9)
- إنشاء `docs/ARCHITECTURE.md` (~1,985 سطر) — بنية نظام CMS الكاملة:
  - **8 مبادئ معمارية** (Separation of Concerns, Dependency Inversion, Stateless, API-First, Defense in Depth, Design for Failure, Observability, Cost-Effective)
  - **مخطط بنية النظام** (Mermaid) — Users → CDN → Frontend → API → Data (7 طبقات)
  - **بنية الـ Backend (Clean Architecture + CQRS)**:
    - 4 طبقات: CMS.Api, CMS.Application, CMS.Domain, CMS.Infrastructure
    - قاعدة الاعتماد (Dependency Rule)
    - أمثلة كود C# كاملة (15+ ملف):
      - Entities (Question, Value Objects, Domain Events)
      - Commands + Queries + Handlers (CreateQuestionCommand, GetQuestionByIdQuery)
      - Validators (FluentValidation)
      - Pipeline Behaviors (Validation, Logging, Performance)
      - Repositories (QuestionRepository)
      - Cache Service (Redis)
      - Storage Service (R2)
      - Controllers + Middleware (Exception Handling)
      - Program.cs (Startup configuration)
    - CQRS Pattern (Commands vs Queries مع Mermaid diagram)
  - **بنية الـ Frontend (React 19 + Vite)**:
    - Feature-based folder structure (student-web + admin-web)
    - إدارة الحالة (5 أنواع: Server + Client + URL + Form + Persistent)
    - React Query Strategy مع optimistic updates
    - PWA Architecture (Service Worker + IndexedDB + Cache API + 4 استراتيجيات)
  - **بنية قاعدة البيانات (PostgreSQL 16 + Redis 7)**:
    - PostgreSQL Configuration (shared_buffers, effective_cache_size, extensions)
    - استراتيجية الفهرسة (B-tree + GIN + trigram + JSON + composite)
    - Read Replicas (مستقبلاً في Phase 28)
    - Redis Cache-Aside Pattern + Cache Keys strategy
  - **بنية البنية التحتية (Cloudflare + Vercel + Railway)**:
    - Cloudflare (CDN + WAF + DNS + SSL + Page Rules)
    - Vercel Configuration (vercel.json)
    - Railway Configuration (railway.yml)
  - **بنية الأمان (7 طبقات - Defense in Depth)**:
    - Layer 1: Network (Cloudflare WAF + DDoS + Geo-block)
    - Layer 2: Transport (TLS 1.3 + HSTS)
    - Layer 3: Application (Rate Limiting + CORS + CSP + Input Validation)
    - Layer 4: Authentication (JWT + OTP + Device Binding + 2FA)
    - Layer 5: Authorization (RBAC + ABAC + Scopes)
    - Layer 6: Data (AES-256 + bcrypt + Watermark + Signed URLs)
    - Layer 7: Monitoring (Audit Logs + Security Alerts + Anomaly Detection)
    - JWT Strategy (Access 15min + Refresh 7days + Device 30days)
    - Content Protection Strategy (Mermaid diagram)
  - **تدفقات البيانات (3 sequence diagrams)**:
    - تسجيل الدخول (User → Frontend → API → DB → Redis → WhatsApp)
    - حل سؤال (Student → Frontend → API → DB → Redis → Event Handler)
    - رفع ملف (Admin → Frontend → API → R2 → DB → Virus Scanner)
  - **مبادئ تصميم الـ API**:
    - RESTful conventions
    - Problem Details (RFC 7807) — response format
    - Pagination strategy
    - Rate Limiting (5 req/min for auth, 100 req/min for authenticated)
  - **بنية الـ Monorepo (pnpm workspaces + Turborepo)**:
    - apps/ (student-web + admin-web + api)
    - packages/ (ui + types + utils + config)
    - turbo.json (pipeline configuration)
  - **بنية النشر (3 بيئات)**:
    - Development (Local Docker)
    - Staging (Railway staging)
    - Production (Vercel + Railway + R2 + FCM + Sentry + Better Stack)
    - CI/CD Pipeline (GitHub Actions: lint + test + security + deploy)
  - **المراقبة والرصد**:
    - Logging: Serilog → Seq (Dev) + Better Stack (Prod)
    - Metrics: App Metrics → Prometheus → Grafana
    - Tracing: OpenTelemetry → Jaeger
    - Errors: Sentry
    - Uptime: Better Stack
    - Health Checks endpoints (/health, /health/ready, /health/live)
    - Key Metrics (Performance, Availability, Errors, Business, Security)
  - **استراتيجية التوسّع**:
    - Horizontal Scaling (multiple API instances + Load Balancer)
    - Scaling Triggers (CPU, Memory, Connections, Storage)
    - 5-level Caching Strategy (Browser → SW → CDN → Redis → PostgreSQL)
  - **التعافي من الكوارث**:
    - Backup Strategy (PostgreSQL hourly + Redis 6h + R2 built-in + Code on GitHub)
    - Recovery Procedures (RTO + RPO for each scenario)
    - Disaster Recovery Plan (restore steps)
  - **7 قرارات معمارية جديدة**:
    - D-012: Modular Monolith (بدلاً من Microservices)
    - D-013: CQRS مع MediatR
    - D-014: Server-Side Caching مع Redis
    - D-015: Direct-to-R2 Uploads (Signed URLs)
    - D-016: PWA مع Service Worker
    - D-017: Feature-based Folder Structure (Frontend)
    - D-018: Database-First Design مع EF Core Migrations
  - **8 مخططات Mermaid** (System Architecture + Layers + CQRS + State Management + PWA + Security + Deployment + Scalability)

### Decisions (Session #9)
- **D-012**: Modular Monolith (بدلاً من Microservices) — 2026-07-30 ✅
- **D-013**: CQRS مع MediatR — 2026-07-30 ✅
- **D-014**: Server-Side Caching مع Redis — 2026-07-30 ✅
- **D-015**: Direct-to-R2 Uploads (Signed URLs) — 2026-07-30 ✅
- **D-016**: PWA مع Service Worker — 2026-07-30 ✅
- **D-017**: Feature-based Folder Structure (Frontend) — 2026-07-30 ✅
- **D-018**: Database-First Design مع EF Core Migrations — 2026-07-30 ✅

### Pending Decisions
- **P-001**: اسم العلامة التجارية النهائي (المقترح: ScholarMed)
- **P-002**: نظام الدفع للاشتراكات (مؤجّل للمرحلة 2)
- **P-003**: دعم اللغة الإنجليزية (مؤجّل للمرحلة 2)

---

## [1.8.0] — 2026-07-31

### 🧪 Major Milestone: Testing & QA Completed

- **Phase 30 مكتملة** — اختبارات وضمان جودة
- Backend: 20+ unit tests (xUnit + Moq + FluentAssertions + InMemory DB)
- Frontend: Vitest setup + component tests + CI/CD pipeline (6 jobs)
- **94% من المشروع مكتمل** (30/32 مرحلة)

#### Phase 30: Testing & QA (✅ Completed — Session #25)
- **Backend Tests** (3 ملفات):
  - `TestDbHelper.cs` — In-memory DB + seed data (university → exam)
  - `EntityTests.cs` — 15 tests (Question 8 + Student 7: create, validate, publish, answer, ban, OTP)
  - `HandlerTests.cs` — 11 tests (Auth 5 + Academic 3 + Questions 3)
- **Frontend Tests** (3 ملفات):
  - `component.test.tsx` — LoginPage + UI components + utility tests
  - `test-setup.ts` — Testing library setup
  - `vitest.config.ts` (×2) — Vitest config for student-web + packages/ui
- **CI/CD Pipeline** (1 ملف):
  - `ci.yml` — 6 GitHub Actions jobs (backend-test + frontend-test + security-scan + lighthouse + deploy-staging + deploy-production)

## [1.7.0] — 2026-07-31

### ⚡ Major Milestone: Performance Optimization Completed

- **Phase 29 مكتملة** — تحسين أداء شامل
- Backend: 3 Performance Middleware (Caching + Compression + Timeout) + Cache Warm-up + Invalidation
- Frontend: 6+1 performance hooks (lazy image + prefetch + debounce + virtual list + Web Vitals + memory + network) + Vite build optimization (6 features)
- **91% من المشروع مكتمل** (29/32 مرحلة)

#### Phase 29: Performance Optimization (✅ Completed — Session #24)
- **Backend** (2 ملفات):
  - `PerformanceMiddleware.cs` — 3 middleware (ResponseCacheMiddleware with per-endpoint TTL + Gzip compression ~70% + RequestTimeout 30s)
  - `PerformanceService.cs` — Cache warm-up (universities + hierarchy + question counts) + Automatic invalidation + DB stats + Slow query analysis
- **Frontend** (1 ملف + 1 محدّث):
  - `usePerformance.ts` — 6+1 hooks (useLazyImage + usePrefetchOnHover + useDebounce + useVirtualList + usePerformanceMonitor + useMemoryUsage + useNetworkStatus)
  - `vite.config.ts` — 6 build optimizations (manual chunks: 4 + terser minification + CSS split + asset inline 4KB + deps pre-bundle + chunk size limit)

## [1.6.0] — 2026-07-31

### 🔒 Major Milestone: Security Hardening Completed

- **Phase 28 مكتملة** — تحسين أمان شامل
- Backend: SecurityService (device binding + logging + suspicious detection) + 3 Middleware (CSP + Audit + Rate Limit) + 3 admin endpoints
- Frontend: 5 security hooks (anti-copy + DevTools detection + watermark + screenshot + combined) + SecurityWrapper
- 10+ security headers (CSP, HSTS, X-Frame-Options, etc.)
- **88% من المشروع مكتمل** (28/32 مرحلة)

#### Phase 28: Security Hardening (✅ Completed — Session #23)
- **Backend** (3 ملفات):
  - `SecurityService.cs` — 6 methods (device binding verify + security event logging + suspicious activity detection + student logs + critical alerts + device unbind)
  - `SecurityMiddleware.cs` — 3 middleware (ContentSecurityPolicy + AuditLogging + AuthRateLimit)
  - `SecurityController.cs` — 3 admin endpoints
- **Frontend** (2 ملفات):
  - `useContentProtection.ts` — 5 hooks (useAntiCopy + useDevToolsDetection + useWatermark + useScreenshotDetection + useContentProtection + useSecurityReporting)
  - `SecurityWrapper.tsx` — React component wrapper for protected pages

## [1.5.0] — 2026-07-31

### 📊 Major Milestone: Statistics & Leaderboard Completed

- **Phase 26+27 مكتملة** — إحصائيات + لوحة متصدرين (مدمجة)
- 3 API endpoints (student stats + leaderboard + global stats)
- Frontend: StatsPage (8 cards + subject/difficulty breakdown) + LeaderboardPage (podium + top 100 + your rank)
- **84% من المشروع مكتمل** (27/32 مرحلة)

#### Phase 26+27: Statistics & Leaderboard (✅ Completed — Session #22)
- **Backend** (4 ملفات):
  - `StatsDtos.cs` — 10 DTOs (StudentStats, SubjectStats, DifficultyStats, Leaderboard, LeaderboardEntry, GlobalStats, SubjectActivity, FileViewStats, HourlyActivity)
  - `StatsCommands.cs` — 3 Queries
  - `StatsHandlers.cs` — 3 Handlers (student stats + leaderboard first-attempt + global platform stats + caching)
  - `StatsController.cs` — 3 endpoints
- **Frontend** (3 ملفات + 1 محدّث):
  - `stats-api.ts` — 3 API methods
  - `StatsPage.tsx` — 8 stat cards + period filter + subject performance (progress bars) + difficulty breakdown (easy/medium/hard) + leaderboard link
  - `LeaderboardPage.tsx` — podium (gold/silver/bronze) + top 100 list + your rank (even if outside top 100) + period filter + Framer Motion
  - `router.tsx` — إضافة routes للإحصائيات + المتصدرين

## [1.4.0] — 2026-07-31

### 🔔 Major Milestone: Notifications System Completed

- **Phase 25 مكتملة** — نظام إشعارات متكامل
- 8 API endpoints (list + unread-count + mark-read + mark-all-read + push-token + send + stats + sent-list)
- Targeted delivery (7 audiences) + push token registration + delivery stats
- Frontend: NotificationsPage (filter + unread badge + mark read + 6 type icons)
- **78% من المشروع مكتمل** (25/32 مرحلة)

#### Phase 25: Notifications System (✅ Completed — Session #21)
- **Backend** (4 ملفات):
  - `NotificationDtos.cs` — 6 DTOs
  - `NotificationCommands.cs` — 8 Commands/Queries
  - `NotificationHandlers.cs` — 8 Handlers (targeted delivery + cached unread count + push token + delivery stats)
  - `NotificationsController.cs` — 8 endpoints
- **Frontend** (2 ملفات + 1 محدّث):
  - `notification-api.ts` — 5 API methods
  - `NotificationsPage.tsx` — list + filter (all/unread) + auto-refresh 30s + mark read + 6 type icons + relative time + action links + Framer Motion
  - `router.tsx` — إضافة routes للإشعارات + لوحة الإدارة

## [1.3.0] — 2026-07-31

### 📊 Major Milestone: Admin Dashboard Completed

- **Phase 24 مكتملة** — لوحة إدارة كاملة
- 11 API endpoints (stats + activity + revenue + growth + top subjects + reports + students + codes)
- Frontend: AdminDashboardPage (8 stat cards + revenue chart + activity feed + top subjects + reports summary)
- Student management (search + filter + ban/unban)
- Code management (list + filter + generate batch with anti-confusion chars)
- **75% من المشروع مكتمل** (24/32 مرحلة)

#### Phase 24: Admin Dashboard (✅ Completed — Session #20)
- **Backend** (4 ملفات):
  - `DashboardDtos.cs` — 10 DTOs (Stats, Activity, Revenue, Growth, TopSubject, Reports, StudentMgmt, CodeMgmt, GenerateResult)
  - `DashboardCommands.cs` — 11 Commands/Queries
  - `DashboardHandlers.cs` — 11 Handlers (6 dashboard queries + 5 management: ban/unban/generate codes)
  - `AdminDashboardController.cs` — 11 endpoints
- **Frontend** (2 ملفات):
  - `admin-api.ts` — 9 API methods
  - `AdminDashboardPage.tsx` — 8 stat cards + animated revenue bar chart + activity feed + top subjects with accuracy bars + reports summary (4 stats + recent reports)

## [1.2.0] — 2026-07-31

### 📁 Major Milestone: Digital Library Completed

- **Phase 23 مكتملة** — مكتبة رقمية محمية
- 8 API endpoints (list + get + access + view + upload + complete + update + delete)
- Frontend: LibraryPage مع عارض ملفات متعدد (PDF + HTML + Video + Image) + Watermark + Signed URLs
- **72% من المشروع مكتمل** (23/32 مرحلة)

#### Phase 23: Digital Library (✅ Completed — Session #19)
- **Backend** (4 ملفات):
  - `LibraryDtos.cs` — 10 DTOs (File, ListItem, Access, Watermark, View, Upload, Complete, Update)
  - `LibraryCommands.cs` — 8 Commands/Queries
  - `LibraryHandlers.cs` — 8 Handlers (signed URLs + watermark + direct-to-R2 upload + view tracking + YouTube embed)
  - `LibraryController.cs` — 8 endpoints
- **Frontend** (2 ملفات):
  - `library-api.ts` — 4 API methods
  - `LibraryPage.tsx` — grid + 7 type filters + multi-format viewer modal (PDF iframe + HTML sandbox + YouTube embed + image) + dynamic watermark overlay + download disabled + view tracking

## [1.1.0] — 2026-07-31

### 📴 Major Milestone: Offline Engine Completed

- **Phase 22 مكتملة** — محرك العمل دون اتصال
- 4 API endpoints (download + sync + list + delete)
- AES-256 encryption per package + server-side answer verification
- IndexedDB storage + auto-sync on reconnect + useOffline hook
- **69% من المشروع مكتمل** (22/32 مرحلة)

#### Phase 22: Offline Engine (✅ Completed — Session #18)
- **Backend** (4 ملفات):
  - `OfflineDtos.cs` — 8 DTOs (Package, Question, Answer, Sync, Result)
  - `OfflineCommands.cs` — 4 Commands (Download, Sync, GetPackages, Delete)
  - `OfflineHandlers.cs` — 4 Handlers (AES-256 key generation + Redis cache 7 days + server-side verification + duplicate prevention + tamper detection)
  - `OfflineController.cs` — 4 endpoints
- **Frontend** (3 ملفات):
  - `offline-api.ts` — 4 API methods
  - `offline-db.ts` — IndexedDB wrapper (2 stores: packages + answers, 8 operations: save, get, getAll, delete, getUnsynced, markSynced, clearSynced, cleanupExpired)
  - `useOffline.ts` — Hook (online/offline detection + download + save answer + auto-sync + manual sync + unsynced count + package management + toast notifications)

## [1.0.0] — 2026-07-31

### 🎯 Major Milestone: Interactive Exams Completed — v1.0.0

- **Phase 21 مكتملة** — اختبارات تفاعلية كاملة
- 7+ API endpoints (start + submit + results + review + create + publish)
- Frontend: ExamPage (مؤقت + شبكة أسئلة + نتائج تفاعلية) + ExamReviewPage (مراجعة)
- **66% من المشروع مكتمل** (21/32 مرحلة) — **وصلنا للإصدار 1.0.0!**

#### Phase 21: Interactive Exams (✅ Completed — Session #17)
- **Backend** (4 ملفات):
  - `ExamDtos.cs` — 15+ DTOs (Exam, Session, Result, Review, Comparison, WeakTopic)
  - `ExamCommands.cs` — 7 Commands/Queries
  - `ExamHandlers.cs` — 8 handlers (start, submit, results, review, create, publish + weak topics analysis + score comparison)
  - `ExamsController.cs` — 7+ endpoints
- **Frontend** (3 ملفات):
  - `exam-api.ts` — 6 API methods
  - `ExamPage.tsx` — صفحة كاملة: مؤقت تنازلي + شبكة أسئلة للتنقّل + تأكيد تسليم + نتائج تفاعلية (دائرة متحركة + إحصائيات + مقارنة + مواضيع أضعف) + Vibration API + auto-submit
  - `ExamReviewPage.tsx` — مراجعة: تمييز صحيح/خاطئ + شرح

## [0.9.0] — 2026-07-31

### ❓ Major Milestone: Question Bank Completed

- **Phase 20 مكتملة** — بنك أسئلة كامل
- 10+ API endpoints (CRUD + Answer + Report + Import)
- Frontend: صفحة أسئلة تفاعلية كاملة (اختيار + تأكيد + تغذية راجعة + شرح + مفضلة + إبلاغ + Vibration)
- **63% من المشروع مكتمل** (20/32 مرحلة)

#### Phase 20: Question Bank (✅ Completed — Session #16)
- **Backend** (4 ملفات):
  - `QuestionDtos.cs` — 20+ DTOs
  - `QuestionCommands.cs` — 10 Commands/Queries
  - `QuestionHandlers.cs` — 11 handlers (3 query + 8 command including Answer + Import)
  - `QuestionsController.cs` — 10+ endpoints
- **Frontend** (2 ملفات):
  - `question-api.ts` — 5 API methods
  - `QuestionPage.tsx` — صفحة كاملة: اختيار + تأكيد + تغذية راجعة بصرية (أخضر/أحمر) + شرح + مرجع + مفضلة + إبلاغ (modal) + تنقّل + إحصائيات محدّثة + Vibration API + Toast + Framer Motion + React Query

## [0.8.0] — 2026-07-31

### 🎓 Major Milestone: University Management Completed

- **Phase 19 مكتملة** — إدارة الهيكل الأكاديمي الكاملة
- 30+ API endpoints لـ 6 كيانات (University → Lecture)
- Frontend: صفحة تصفّح هرمي + تفاصيل المادة مع المحاضرات
- **59% من المشروع مكتمل** (19/32 مرحلة)

#### Phase 19: University Management (✅ Completed — Session #15)
- **Backend** (4 ملفات):
  - `AcademicDtos.cs` — 15+ DTOs
  - `AcademicCommands.cs` — 25+ Commands/Queries
  - `AcademicHandlers.cs` — 25 handlers (12 query + 13 command)
  - `AcademicController.cs` — 30+ endpoints
- **Frontend** (3 ملفات):
  - `academic-api.ts` — 8 API methods
  - `SubjectsPage.tsx` — تصفّح هرمي (5 مستويات) مع React Query
  - `SubjectDetailPage.tsx` — تفاصيل + محاضرات + تقدّم

## [0.7.0] — 2026-07-31

### 🛡️ Major Milestone: Role & Permission System Completed

- **Phase 18 مكتملة** — نظام صلاحيات متدرّج (RBAC + ABAC)
- 25 Authorization Policies + Permission Service + Admin 2FA
- Frontend: Permission Provider + Route Guards
- **56% من المشروع مكتمل** (18/32 مرحلة)

#### Phase 18: Role & Permission System (✅ Completed — Session #14)
- **Backend** (6 ملفات):
  - `IPermissionService.cs` — Interface + AdminScope + Resources/Actions/Roles constants
  - `PermissionService.cs` — RBAC + ABAC + caching + entity-level scope checking
  - `PermissionAuthorization.cs` — 25 policies + PermissionHandler + ScopeHandler
  - `AdminCommands.cs` — 5 CQRS Commands (login, enable2FA, disable2FA, getPermissions)
  - `AdminHandlers.cs` — 4 Handlers (admin login + 2FA + permissions + TOTP)
  - `AdminAuthController.cs` — 4 endpoints
- **Frontend** (2 ملفات):
  - `usePermission.tsx` — PermissionProvider + 6 hooks
  - `PermissionRoute.tsx` — PermissionRoute + AdminRoute guards

## [0.6.0] — 2026-07-31

### 🔐 Major Milestone: Authentication System Completed

- **Phase 17 مكتملة** — نظام مصادقة كامل (Backend + Frontend)
- 8 Auth endpoints + 8 CQRS Handlers + 6 Validators
- 5 Frontend Auth Pages (Register, OTP, Login, Forgot, Reset)
- JWT + OTP + BCrypt + Device Fingerprint + Token Blacklisting
- **53% من المشروع مكتمل** (17/32 مرحلة)

#### Phase 17: Authentication & Authorization (✅ Completed — Session #13)
- **Backend** (5 ملفات):
  - `AuthDtos.cs` — 8 Request/Response DTOs
  - `AuthCommands.cs` — 8 CQRS Commands
  - `AuthHandlers.cs` — 8 Handlers (Register, VerifyOtp, Login, Refresh, Logout, ForgotPassword, ResetPassword, ChangePassword)
  - `AuthValidators.cs` — 6 FluentValidation validators
  - `AuthController.cs` — 8 REST endpoints with Swagger docs
- **Frontend** (6 ملفات):
  - `auth-api.ts` — Auth API service
  - `RegisterPage.tsx` — نموذج تسجيل كامل + قوة كلمة المرور
  - `VerifyOtpPage.tsx` — OTP تفاعلي (auto-advance + paste + countdown)
  - `ForgotPasswordPage.tsx` — طلب إعادة تعيين
  - `ResetPasswordPage.tsx` — OTP + كلمة مرور جديدة
  - `router.tsx` — 3 routes جديدة

## [0.5.0] — 2026-07-31

### 🎨 Major Milestone: Frontend Foundation Completed

- **Phase 16 مكتملة** — بنية الـ Frontend الكاملة منشأة
- 46 ملف كود + ~2,149 سطر TypeScript/CSS
- Monorepo (pnpm + Turborepo) + React 19 + Vite 6 + Tailwind CSS 4
- Design System (packages/ui/) بـ 15+ مكوّن
- Dashboard Page + Login Page كاملين
- PWA + Theme Provider + Auth Provider + React Query
- **50% من المشروع مكتمل** (16/32 مرحلة)

#### Phase 16: Frontend Foundation (✅ Completed — Session #12)
- **Monorepo**: pnpm-workspace.yaml + turbo.json + root package.json
- **apps/student-web/** (28 ملف):
  - Vite 6 + React 19 + TypeScript 5 + Tailwind CSS 4
  - 150+ CSS Variables (Design Tokens كاملة من VISUAL_IDENTITY.md)
  - ThemeProvider (Light/Dark + localStorage + system preference)
  - AuthProvider (JWT + device fingerprint + auto refresh)
  - React Router 7 (lazy loading + protected routes)
  - React Query 5 (staleTime 5min + gcTime 30min)
  - Axios API Client (interceptors + auto token refresh)
  - AppShell (Navbar + Sidebar + BottomNav)
  - DashboardPage (Hero + 4 stat cards + Continue Learning + 3 subject cards)
  - LoginPage (Glassmorphism + animations + error handling)
  - 7 صفحات stub
  - PWA (manifest + service worker + offline caching strategies)
  - utils (cn, debounce, formatDate, formatNumber, generateDeviceFingerprint)
- **packages/ui/** (13 ملف): Button + Input + Card + Badge + Text + Stack + Container + Grid + Box + Spinner + Skeleton
- **packages/types/**: shared TypeScript types (User, Question, Subject, ApiResponse)
- **packages/utils/**: shared utilities

## [0.4.0] — 2026-07-31

### 🚀 Major Milestone: Backend Foundation Completed

- **Phase 15 مكتملة** — بنية الـ Backend الكاملة منشأة
- 27 ملف كود + ~2,678 سطر C#
- 4 طبقات Clean Architecture (Api + Application + Domain + Infrastructure)
- 14 Entity + 20+ Enum + 30 DbSet
- JWT Auth + BCrypt + Redis + R2 + MediatR CQRS
- 89 API endpoint موثّق في `docs/API_SPECIFICATION.md`
- جاهز لكتابة الـ Frontend (Phase 16)

#### Phase 15: Backend Foundation (✅ Completed — Session #11)
- إنشاء `docs/API_SPECIFICATION.md` (~2,660 سطر) — 89 endpoints
- إنشاء `apps/api/` (27 ملف):
  - **Solution**: CMS.sln + 5 .csproj + Dockerfile + .gitignore
  - **CMS.Domain**: BaseEntity + 20+ Enums + 5 Exceptions + 14 Entities (6 Academic + 4 Questions + 4 Users) with factory methods + business logic
  - **CMS.Application**: DI + 7 Interfaces (IRepository, IQuestionRepository, IStudentRepository, ISubscriptionCodeRepository, IUnitOfWork, ICacheService, IFileStorageService, ITokenService, IPasswordHasher) + 3 Pipeline Behaviors (Validation, Logging, Performance)
  - **CMS.Infrastructure**: DI + ApplicationDbContext (30 DbSets + snake_case) + Repositories (Generic, Question, Student, UnitOfWork) + Security (PasswordHasher BCrypt, JwtTokenService) + Services (RedisCacheService, R2StorageService, CacheKeys)
  - **CMS.Api**: Program.cs (DI + Auth + CORS + Rate Limiting + Swagger + Health Checks + Serilog) + ExceptionHandlingMiddleware (RFC 7807) + SecurityHeadersMiddleware + appsettings.json

## [0.3.0] — 2026-07-31

### 🗄️ Major Milestone: Database Design Completed

- **Phase 14 مكتملة** — تصميم قاعدة البيانات الكامل
- 30 جدول + ~350 عمود + ~95 فهرس
- SQL Schema كامل + EF Core Entities + Configurations
- Partitioning للجداول الكبيرة + Full-Text Search عربي
- Seed Data + Data Retention Policies + Performance Strategy
- جاهز لكتابة الـ Backend (Phase 15)

#### Phase 14: Database Design (✅ Completed — Session #10)
- إنشاء `docs/DATABASE_SCHEMA.md` (~2,065 سطر):
  - **نظرة عامة**: 30 جدول، ~350 عمود، ~95 فهرس، PostgreSQL 16
  - **ERD Diagram** كامل (Mermaid) يغطي كل الجداول والعلاقات
  - **اتفاقيات التسمية**: snake_case + FK naming + index naming + constraint naming
  - **5 أنماط مشتركة**: BaseEntity, Soft Delete, Audit Columns, Status Enum, JSON Columns
  - **30 جدول كامل** بـ SQL CREATE TABLE + Indexes + Constraints:
    - **أكاديمية (6)**: universities, colleges, academic_years, semesters, subjects, lectures
    - **أسئلة (4)**: questions (مع full-text search + trigram + JSON tags), question_options, question_images, exams
    - **مستخدمين (4)**: students (مع preferences JSON + denormalized stats), admins (مع 2FA + scope), admin_roles, admin_permissions
    - **اشتراكات (3)**: subscription_codes, student_subscriptions, code_batches
    - **نشاط (2)**: attempt_logs (partitioned), exam_sessions
    - **مكتبة (2)**: library_files (مع virus scan), library_views
    - **مفضلة (2)**: favorites, favorite_lists
    - **إشعارات (3)**: notifications, notification_deliveries, announcements
    - **أمان (3)**: device_bindings, security_logs (partitioned), error_reports
    - **إضافية (3)**: achievements, refresh_tokens, audit_logs (partitioned)
  - **استراتيجية الفهرسة الكاملة**: ~95 index
    - B-tree (60): للمفاتيح الأجنبية والبحث الدقيق
    - GIN (8): للبحث النصي + JSON + trigram
    - BRIN (3): للجداول الكبيرة
    - Partial (10): للفلترة الشائعة (WHERE deleted_at IS NULL)
    - Composite (12): للاستعلامات المتعدّدة الأعمدة
  - **Partitioning**: 3 جداول مقسّمة شهرياً (attempt_logs, security_logs, audit_logs)
  - **Full-Text Search**: arabic_unaccent configuration (unaccent + arabic_stem)
  - **EF Core Configuration**:
    - BaseEntity + AuditableEntity classes
    - Question Entity (full C# with factory method + business logic + enums)
    - QuestionConfiguration (IEntityTypeConfiguration with all mappings)
    - ApplicationDbContext (snake_case convention + auto UpdatedAt + soft delete query filter)
  - **Migrations Strategy**: naming convention + best practices + sample InitialCreate migration
  - **Seed Data Strategy**:
    - RoleSeeder (5 system roles: super_admin → subject_admin)
    - PermissionSeeder (super admin with all permissions)
    - AcademicSeeder (university → college → 6 years → 12 semesters)
    - AdminSeeder (super admin account)
  - **Data Retention Policies**: 10 أنواع بيانات + مدة الاحتفاظ + CleanupService + Hangfire jobs
  - **Performance Considerations**: query optimization tips + connection pooling + read replicas + estimated table sizes
  - ERD Diagram (Mermaid) + 8+ أمثلة كود C# + 30+ أمثلة SQL

## [0.2.0] — 2026-07-30

### 🏗️ Major Milestone: System Architecture Designed

- **Phase 13 مكتملة** — بنية النظام الكاملة موثّقة
- 8 مبادئ معمارية + 4 طبقات Clean Architecture + CQRS
- 7 طبقات أمان (Defense in Depth)
- 3 Data Flow Diagrams (sequence diagrams)
- 7 قرارات معمارية جديدة (D-012 → D-018)
- 8 مخططات Mermaid
- جاهز لتصميم قاعدة البيانات (Phase 14)

## [0.1.0] — 2026-07-30

### 🎉 Major Milestone: Design Approved

- **مرحلة التصميم مكتملة بالكامل** (Phase 1-12)
- درجة Design Review: **9.05/10** ✅ ممتاز
- 28 ملف، ~27,440 سطر توثيق + نماذج HTML/CSS
- التطوير البرمجي مفتوح رسمياً (D-010)

### Notes
- الإصدار الأولي للمشروع
- إنشاء البنية التحتية للتوثيق
- إكمال المراحل 1-5 (Discovery → Visual Identity) في Session #1
- إكمال Phase 6 (Design System) في Session #2
- إكمال Phase 7 (User Flows) في Session #3
- إكمال Phase 8 (Information Architecture) في Session #4
- إكمال Phase 9 (Wireframes) في Session #5
- إكمال Phase 10 (High Fidelity Design) في Session #6 — مع 4 نماذج HTML/CSS حقيقية
- إكمال Phase 11 (Design Review) في Session #7 — درجة 9.05/10 + 3 تحسينات مُطبّقة
- إكمال Phase 12 (Design Approval) في Session #8 — اعتماد رسمي + README.md + تحديث CONTEXT.md (v1.1.0)
- لا يوجد كود برمجي إنتاجي بعد (التطوير يبدأ في Phase 13)

---

## قواعد الكتابة

### أنواع التغييرات
- **Added**: ميزات أو ملفات جديدة
- **Changed**: تعديلات على الموجود
- **Deprecated**: ميزات ستُزال قريباً
- **Removed**: ميزات أُزيلت
- **Fixed**: إصلاحات bugs
- **Security**: تحديثات أمنية
- **Decisions**: قرارات معمارية أو تصميمية

### التنسيق
```
### Added — YYYY-MM-DD
#### <قسم>
- وصف التغيير
```

---

**نهاية ملف CHANGELOG.md**

---

## [Unreleased] — 2026-08-18 — Phase 33 Security Audit

### Added

- أضيفت حزمة توثيق أمنية تحت `docs/security/` تشمل تقرير التدقيق، سجل النتائج، المصفوفة، تقييم Android وWindows، ومقترح البنية للمرحلة التالية.
- أضيف 18 معرف نتيجة ثابتاً من `SEC-001` إلى `SEC-018` مع تصنيف الشدة والدليل وخطة المعالجة.

### Changed

- تم تحديث حالة المشروع: الإطلاق للإنتاج أصبح **معلقاً** إلى حين إغلاق النتائج الحرجة.

### Security

- الدرجة الحالية: **27/100**؛ النضج: **CRITICAL**.
- لم تتغير أي شيفرة أو أسرار أو إعدادات تشغيل في هذه المرحلة؛ المخرجات تحليلية وتوثيقية فقط.


### Security — 2026-08-18 (Phase 34 local hardening; not production-approved)

- أضيفت بوابة `scripts/ci/verify-security-artifact.sh` لمنع ملفات البيئة الحساسة وأنماط الأسرار المعروفة وreferences الإجراءات المتحركة في CI.
- أزيلت ملفات بيئة الإنتاج من artifact المحلي وأضيف `.env.production.example` و`docs/security/SECRETS_POLICY.md` و`docs/security/SECRET_ROTATION.md`.
- أضيفت نواة جلسات server-side لرموز refresh opaque، تشمل hashing ودوراناً وإبطالاً عند reuse والتحقق من الجلسة بعد JWT.
- أضيفت كيانات واستعلامات entitlement أولية، وربط وصول الأسئلة والمكتبة بالاشتراك والنطاق الأكاديمي على الخادم.
- أضيفت سياسات صلاحيات إدارية وتحقق TOTP محلي ومنع إعادة استخدام الرمز عبر cache.
- مُنع النشر المباشر لملف مكتبة لم يمر بفحص Clean، وأضيف فحص entitlement قبل إصدار signed URL.
- أضيف CSP لإنتاج الواجهة، وربط rate limiting لمسارات auth، وأزيل استخدام `dangerouslySetInnerHTML` من قارئ المكتبة.
- أضيف `pnpm-lock.yaml` وأصلحت إعدادات TypeScript الخاصة بمشروع Vite المرجعي وإضافة `@types/node`.

### Known limitations — 2026-08-18

- **لا يزال الإنتاج محجوباً.** لم ينفذ `dotnet build/test` أو migrations بسبب عدم توفر SDK بعد تعذر التنزيل الشبكي.
- فشل build الواجهة حالياً بـ43 خطأ TypeScript متبقياً؛ لا يعد هذا الإصدار صالحاً للنشر.
- لا يمثل تنظيف artifact تدويراً لأسرار الخدمات الخارجية؛ التدوير والتحقق التشغيلي ما زالا مطلوبين.
- المرجع التنفيذي: `docs/security/PHASE_34_IMPLEMENTATION_STATUS.md`.


---

## [Unreleased] — Phase 34 Security Architecture & Hardening — 2026-08-18

### Added

- جلسات `UserSession` وتثبيتات `UserInstallation` وrefresh tokens opaque مخزنة كـSHA-256 فقط.
- دوران refresh ذري داخل معاملة PostgreSQL، مع إبطال family عند كشف إعادة الاستخدام.
- `SessionValidationMiddleware` لإعمال logout وpassword reset وdevice/session revoke بعد تحقق JWT.
- `EntitlementService` لمنح المحتوى وفق هوية الطالب والتسلسل الأكاديمي والاشتراكات الخادمية.
- ترحيل EF Core `Phase34SecuritySessionsAndEntitlements` مع فهارس وقيود فريدة للجلسات والتثبيتات والأكواد والاشتراكات.
- اختبارات entitlement وIDOR وlogout/password-reset revocation واختبار تكامل PostgreSQL لدورة الجلسة.
- وثائق Phase 34: التقرير النهائي ومصفوفات التحقق والمعالجة وthreat model وإدارة المفاتيح وضوابط offline/online وبوابة الإنتاج.
- تقارير Trivy وSQL migration idempotent ضمن `artifacts`.

### Changed

- تقوية JWT بطول سر أدنى 32 بايت وHS256 allowlist و`kid`.
- تسجيل `IApplicationDbContext` وعقد وحدة عمل موحدين في DI وإزالة عقود محلية متعارضة.
- تحديث AutoMapper وإضافة `System.Text.Encodings.Web` 9.0.11 لإغلاق نتائج NuGet vulnerable.
- تشغيل API dev وواجهة الطالب production/dev كمستخدم `cms` غير جذري.
- تحديث اختبارات المعالجات للتوقيعات الحالية للمستودعات و`ISessionService`.

### Verified

- Backend Release build و39/39 tests، frontend build و7/7 Vitest tests.
- EF model clean وmigration applied على PostgreSQL 16 محلي.
- health API HTTP 200 مع PostgreSQL وRedis محليين.
- artifact gate، pnpm audit، NuGet audit وTrivy دون نتائج HIGH/CRITICAL.

### External blockers

- تدوير أسرار الإنتاج وإبطال القيم السابقة.
- CodeQL/SARIF وCI تحت .NET 9 وبناء Docker images.
- deploy وmigration وsmoke في staging ثم production.

راجع `docs/security/PRODUCTION_SECURITY_GATE.md`؛ لا تمثل هذه النسخة إقراراً بالنشر الإنتاجي النهائي.
