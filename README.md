# CMS — College Medical System

> **منصة تعليمية طبية متكاملة** لإدارة بنك أسئلة، دورات امتحانية، ومكتبة رقمية لطلاب كليات الطب.

[![Design Status](https://img.shields.io/badge/Design-Approved%20%E2%9C%85-1976D2?style=flat-square)](PROJECT_STATUS.md)
[![Phase](https://img.shields.io/badge/Phase-12%20Design%20Approved-00BCD4?style=flat-square)](PROJECT_TIMELINE.md)
[![Review Score](https://img.shields.io/badge/Design%20Review-9.05%2F10-00C853?style=flat-square)](docs/DESIGN_REVIEW.md)
[![WCAG](https://img.shields.io/badge/WCAG-2.1%20AA-FFB300?style=flat-square)](docs/ACCESSIBILITY.md)
[![License](https://img.shields.io/badge/License-Proprietary-0F172A?style=flat-square)](#)

---

## 📋 نظرة عامة

CMS هو تطبيق ويب احترافي (Progressive Web App - PWA) مخصص لإدارة بنك أسئلة ودورات امتحانية ومكتبة تعليمية لطلاب الجامعات. يستهدف في مرحلته الأولى **كليات الطب البشري في الجامعات السورية** (بدءاً بجامعة حمص)، مع تصميم مرن يسمح بإضافة أي جامعة أو كلية أو تخصص مستقبلاً دون الحاجة إلى تعديل الكود البرمجي.

## ✨ الميزات الرئيسية

- 📚 **بنك أسئلة تفاعلي** — آلاف الأسئلة مصنّفة حسب المواد والمحاضرات
- 🎯 **اختبارات محاكاة** — وضع المراجعة + وضع اختبار حقيقي مع مؤقت
- 📁 **مكتبة رقمية محمية** — PDF، HTML، صور، فيديوهات يوتيوب مدمجة
- 🔒 **حماية متعدّدة الطبقات** — Watermark، Device Binding، منع النسخ
- 📊 **إحصائيات ذكية** — تتبّع الأداء + لوحة المتصدرين
- 🔍 **بحث شامل** — في الأسئلة والملفات والمحاضرات
- 🌙 **وضع ليلي** — Light + Dark Mode
- 📱 **PWA** — قابل للتثبيت + يعمل Offline
- 🔔 **إشعارات متعدّدة** — Push + In-app + Toasts
- 👥 **إدارة متعدّدة المستويات** — Super Admin → Subject Admin

## 🛠️ التقنيات المعتمدة

### Frontend
- **React 19** + TypeScript 5
- **Tailwind CSS 4** + Vite 6
- **Radix UI** (primitives) + **CVA** (variants)
- **Framer Motion** (animations)
- **TanStack Query** (server state) + **Zustand** (client state)
- **React Hook Form** + **Zod** (forms & validation)
- **Lucide React** (icons)

### Backend
- **ASP.NET Core 9** (C# 13)
- **Entity Framework Core 9** + PostgreSQL 16
- **MediatR** (CQRS) + **AutoMapper**
- **Serilog** (logging) + **FluentValidation**

### Infrastructure
- **Cloudflare R2** (file storage) + **Cloudflare CDN**
- **Redis 7** (cache + rate limiting)
- **Firebase Cloud Messaging** (push notifications)
- **Vercel** (frontend hosting) + **Railway** (backend)

## 📁 هيكل المشروع

```
cms-platform/
├── 📁 docs/                          # التوثيق (14 ملف)
│   ├── PROJECT_DISCOVERY.md          # Phase 1: تحليل المشروع
│   ├── REQUIREMENTS.md               # Phase 2: المتطلبات (19 FR + 10 NFR)
│   ├── BRAND_GUIDELINES.md           # Phase 3: شخصية المنصة + 4 Personas
│   ├── MOODBOARD.md                  # Phase 4: 23 مرجع بصري
│   ├── VISUAL_IDENTITY.md            # Phase 5: نظام بصري كامل
│   ├── DESIGN_SYSTEM.md              # Phase 6: نظام تصميم (90+ مكوّن)
│   ├── UI_COMPONENTS.md              # Phase 6: فهرس المكوّنات
│   ├── ACCESSIBILITY.md              # Phase 6: دليل WCAG 2.1 AA
│   ├── RESPONSIVE_GUIDE.md           # Phase 6: دليل التجاوب
│   ├── USER_FLOWS.md                 # Phase 7: 12 تدفق مستخدم
│   ├── INFORMATION_ARCHITECTURE.md   # Phase 8: IA + 28 جدول DB
│   ├── WIREFRAMES.md                 # Phase 9: 41 شاشة Wireframe
│   ├── HIGH_FIDELITY.md              # Phase 10: مواصفات التصميم النهائي
│   └── DESIGN_REVIEW.md              # Phase 11: تقرير المراجعة (9.05/10)
│
├── 📁 design/high-fidelity/          # النماذج التفاعلية (4 نماذج)
│   ├── 01-login.html                 # صفحة تسجيل الدخول
│   ├── 02-dashboard.html             # لوحة الطالب (Light)
│   ├── 03-question-states.html       # بطاقة السؤال (3 حالات)
│   └── 04-dashboard-dark.html        # لوحة الطالب (Dark)
│
├── 📄 CONTEXT.md                     # المصدر الوحيد للحقيقة
├── 📄 PROJECT_TIMELINE.md            # الخطة الزمنية (32 مرحلة)
├── 📄 PROGRESS.md                    # سجل التقدم اليومي
├── 📄 PROJECT_STATUS.md              # الحالة الراهنة
├── 📄 FILE_INDEX.md                  # فهرس الملفات (27 ملف)
├── 📄 DEPENDENCY_GRAPH.md            # رسم الاعتماديات
├── 📄 DECISIONS.md                   # سجل القرارات (11 قرار)
├── 📄 ROADMAP.md                     # خريطة الطريق (12 milestone)
├── 📄 CHANGELOG.md                   # سجل التغييرات
└── 📄 README.md                      # هذا الملف
```

## 📊 إحصائيات المشروع

| المؤشر | القيمة |
|--------|--------|
| **المراحل المكتملة** | 11 / 32 (مرحلة التصميم مكتملة) |
| **الملفات** | 27 ملف |
| **أسطر التوثيق** | ~26,870 سطر |
| **نماذج HTML/CSS** | 4 نماذج (~2,570 سطر) |
| **مكوّنات UI مخطّطة** | 90+ مكوّن React |
| **صفحات مخطّطة** | 107 صفحة (53 student + 46 admin + 8 public) |
| **جداول DB** | 28 جدول |
| **User Flows** | 12 تدفق (151+ خطوة) |
| **Wireframes** | 41 شاشة |
| **ألوان معتمدة** | 70+ (7 ألوان × 10 تدرجات) |
| **أيقونات** | 70+ (Lucide + medical + brand) |
| **درجة Design Review** | 9.05/10 ✅ |

## 🎨 الهوية البصرية

- **اللون الأساسي**: `#1976D2` (Medical Blue)
- **اللون المميِّز**: `#00BCD4` (Cyan)
- **الخط العربي**: Cairo (9 أوزان)
- **الخط الإنجليزي**: Inter (variable font)
- **النمط**: Glassmorphism + Medical Precision

## 📚 الـ Personas

1. **أحمد** — طالب طب سنة 3، طموح، يستخدم Samsung A52
2. **سارة** — طالبة طب سنة 5، منظّمة، تستخدم iPhone 12
3. **د. خالد** — مدير أكاديمي، MacBook Pro + iPhone 14
4. **محمد** — طالب محدود الإمكانيات، هاتف قديم + إنترنت محدود

## 🚀 البدء السريع

### عرض النماذج التفاعلية

```bash
# فتح النماذج في المتصفح
open design/high-fidelity/01-login.html
open design/high-fidelity/02-dashboard.html
open design/high-fidelity/03-question-states.html
open design/high-fidelity/04-dashboard-dark.html

# أو من خلال خادم محلي
cd design/high-fidelity
python3 -m http.server 8080
# ثم افتح http://localhost:8080
```

### قراءة التوثيق

```bash
# ابدأ بـ CONTEXT.md (المصدر الوحيد للحقيقة)
cat CONTEXT.md

# ثم PROJECT_STATUS.md (الحالة الراهنة)
cat PROJECT_STATUS.md

# ثم PROJECT_TIMELINE.md (الخطة الكاملة)
cat PROJECT_TIMELINE.md
```

## 📋 البروتوكول المتبع

هذا المشروع يتبع **بروتوكول إدارة مشاريع احترافي** يشمل:

1. ✅ **التوثيق الكامل** قبل أي كود
2. ✅ **مرحلة التصميم الكاملة** قبل التطوير
3. ✅ **مراجعة الجودة** بعد كل مرحلة
4. ✅ **سجل القرارات** لكل قرار معماري
5. ✅ **تحديث مستمر** لملفات التتبّع
6. ✅ **عدم الانتقال للمرحلة التالية** قبل اكتمال السابقة

## 🗓️ خريطة الطريق

### ✅ مكتملة — مرحلة التصميم (Phase 1-11)
- Project Discovery → Requirements → Brand → Moodboard → Visual Identity
- Design System → User Flows → Information Architecture
- Wireframes → High Fidelity → Design Review

### 🎯 المرحلة الحالية — Phase 12: Design Approval
- الاعتماد الرسمي للتصميم
- فتح مرحلة التطوير البرمجي

### 🚧 قادمة — مرحلة التطوير (Phase 13-32)
- Phase 13: System Architecture
- Phase 14: Database Design
- Phase 15: Backend Foundation (ASP.NET Core 9)
- Phase 16: Frontend Foundation (React 19)
- Phase 17: Authentication & Authorization
- Phase 18: Role & Permission System
- Phase 19-23: Core Features (Universities, Questions, Exams, Library, Offline)
- Phase 24: Admin Dashboard
- Phase 25-27: Notifications, Statistics, Leaderboard
- Phase 28: Security Hardening
- Phase 29-32: Performance, Testing, Deployment, Production Release

## 📞 التواصل

- **الفريق العلمي**: جامعة حمص - كلية الطب البشري
- **المطور المرجعي**: الليث النقري

## 📄 الترخيص

هذا المشروع **خاص (Proprietary)** — جميع الحقوق محفوظة.

---

## 📖 روابط سريعة

| الرابط | الوصف |
|--------|------|
| [CONTEXT.md](CONTEXT.md) | المصدر الوحيد للحقيقة |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | الحالة الراهنة |
| [PROJECT_TIMELINE.md](PROJECT_TIMELINE.md) | الخطة الزمنية الكاملة |
| [PROGRESS.md](PROGRESS.md) | سجل التقدم اليومي |
| [DECISIONS.md](DECISIONS.md) | سجل القرارات (11 قرار) |
| [docs/DESIGN_REVIEW.md](docs/DESIGN_REVIEW.md) | تقرير المراجعة (9.05/10) |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | نظام التصميم (90+ مكوّن) |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md) | 12 تدفق مستخدم |
| [docs/INFORMATION_ARCHITECTURE.md](docs/INFORMATION_ARCHITECTURE.md) | IA + 28 جدول DB |
| [CHANGELOG.md](CHANGELOG.md) | سجل التغييرات |

---

**آخر تحديث**: 2026-07-30 (Session #8 — Phase 12: Design Approval)
**الحالة**: ✅ Design Approved — Ready for Development

---

> **"تصميم CMS ليس مجرد واجهة جميلة، بل هوية طبية متكاملة تعكس الاحترافية والثقة."**
