# ROADMAP.md — خريطة الطريق

> **خريطة مبسطة للمعالم الكبرى**. للتفاصيل الكاملة راجع `PROJECT_TIMELINE.md`.

**آخر تحديث**: 2026-07-30

---

## المعالم الكبرى (Milestones)

### Milestone 1: Discovery & Planning ✅
**التاريخ**: 2026-07-30
**النطاق**:
- Phase 1: Project Discovery
- Phase 2: Requirements Analysis

**المخرجات**:
- `CONTEXT.md` — المصدر الوحيد للحقيقة
- `docs/PROJECT_DISCOVERY.md` — تحليل المشروع
- `docs/REQUIREMENTS.md` — المتطلبات الكاملة
- بنية تحتية للتوثيق (7 ملفات إدارية)

**الحالة**: ✅ مكتمل

---

### Milestone 2: Brand & Visual Identity 🔄
**التاريخ المتوقع**: 2026-07-30 → 2026-08-06
**النطاق**:
- Phase 3: Brand Strategy
- Phase 4: Moodboard
- Phase 5: Visual Identity

**المخرجات المتوقعة**:
- `docs/BRAND_GUIDELINES.md` — شخصية المنصة + Personas + فلسفة + نبرة
- `docs/MOODBOARD.md` — مراجع بصرية + إضاءة + حركة
- `docs/VISUAL_IDENTITY.md` — ألوان + خطوط + أيقونات + تدرجات

**الحالة**: 🔄 في التقدم

---

### Milestone 3: Design System & User Experience
**التاريخ المتوقع**: 2026-08-07 → 2026-08-18
**النطاق**:
- Phase 6: Design System
- Phase 7: User Flows
- Phase 8: Information Architecture

**المخرجات المتوقعة**:
- `docs/DESIGN_SYSTEM.md` — نظام تصميم كامل
- `docs/UI_COMPONENTS.md` — فهرس المكونات
- `docs/USER_FLOWS.md` — 12+ user flow
- `docs/INFORMATION_ARCHITECTURE.md` — sitemap + navigation

---

### Milestone 4: Wireframes & High-Fidelity Design
**التاريخ المتوقع**: 2026-08-19 → 2026-09-04
**النطاق**:
- Phase 9: Wireframes (50+ شاشة)
- Phase 10: High Fidelity Design (Light + Dark)

**المخرجات المتوقعة**:
- `docs/WIREFRAMES.md` + ملفات Figma
- تصاميم نهائية لكل شاشة

---

### Milestone 5: Design Review & Approval
**التاريخ المتوقع**: 2026-09-05 → 2026-09-07
**النطاق**:
- Phase 11: Design Review
- Phase 12: Design Approval

**المخرجات المتوقعة**:
- `docs/DESIGN_REVIEW.md`
- `docs/ACCESSIBILITY.md`
- `docs/RESPONSIVE_GUIDE.md`
- اعتماد رسمي للتصميم في `PROJECT_STATUS.md`

---

### Milestone 6: Architecture & Database
**التاريخ المتوقع**: 2026-09-08 → 2026-09-22
**النطاق**:
- Phase 13: System Architecture
- Phase 14: Database Design

**المخرجات المتوقعة**:
- `docs/ARCHITECTURE.md`
- `docs/DATABASE_SCHEMA.md`
- ERD diagrams
- SQL migrations initial

---

### Milestone 7: Backend Foundation
**التاريخ المتوقع**: 2026-09-23 → 2026-10-08
**النطاق**:
- Phase 15: Backend Foundation
- Phase 17: Authentication & Authorization

**المخرجات المتوقعة**:
- ASP.NET Core 9 API شغّال
- JWT Authentication
- Swagger docs
- `docs/API_SPECIFICATION.md`

---

### Milestone 8: Frontend Foundation
**التاريخ المتوقع**: 2026-10-09 → 2026-10-22
**النطاق**:
- Phase 16: Frontend Foundation
- Phase 18: Role & Permission System

**المخرجات المتوقعة**:
- React 19 app شغّال (student + admin)
- Design System مطبّق
- Auth flow كامل
- RBAC مطبّق

---

### Milestone 9: Core Features
**التاريخ المتوقع**: 2026-10-23 → 2026-12-05
**النطاق**:
- Phase 19: University Management
- Phase 20: Question Bank
- Phase 21: Interactive Exams
- Phase 22: Offline Engine
- Phase 23: Digital Library

**المخرجات المتوقعة**:
- بنك أسئلة كامل الشامل
- اختبارات تفاعلية
- مكتبة رقمية محمية
- وضع Offline

---

### Milestone 10: Admin & Operations
**التاريخ المتوقع**: 2026-12-06 → 2027-01-05
**النطاق**:
- Phase 24: Admin Dashboard
- Phase 25: Notifications
- Phase 26: Statistics
- Phase 27: Leaderboard

**المخرجات المتوقعة**:
- لوحة إدارة كاملة
- نظام إشعارات متعدد القنوات
- إحصائيات تفصيلية
- لوحة المتصدرين

---

### Milestone 11: Hardening & Quality
**التاريخ المتوقع**: 2027-01-06 → 2027-02-10
**النطاق**:
- Phase 28: Security Hardening
- Phase 29: Performance Optimization
- Phase 30: Testing & QA

**المخرجات المتوقعة**:
- اختبار اختراق (PenTest)
- تغطية اختبارات ≥ 80%
- Lighthouse score ≥ 90
- `docs/SECURITY.md`

---

### Milestone 12: Launch
**التاريخ المتوقع**: 2027-02-11 → 2027-02-20
**النطاق**:
- Phase 31: Deployment & CI/CD
- Phase 32: Production Release

**المخرجات المتوقعة**:
- CI/CD pipeline كامل
- بيئة إنتاج شغّالة
- مراقبة 24/7
- `docs/DEPLOYMENT.md`
- Launch announcement 🎉

---

## خط زمني بصري

```
2026 Q3                    Q4                     2027 Q1              Q2
  │                         │                       │                   │
  ├─ Discovery ✅           │                       │                   │
  ├─ Brand & Visual 🔄      │                       │                   │
  ├─ Design System          │                       │                   │
  ├─ Wireframes & HiFi      │                       │                   │
  ├─ Design Approval        │                       │                   │
  │                         ├─ Architecture         │                   │
  │                         ├─ Backend Foundation   │                   │
  │                         ├─ Frontend Foundation  │                   │
  │                         ├─ Core Features (Q1)   │                   │
  │                         │                       ├─ Admin & Ops      │
  │                         │                       ├─ Hardening        │
  │                         │                       ├─ QA               │
  │                         │                       └─ LAUNCH 🚀        │
```

---

## الإصدارات المخططة (Releases)

### v1.0.0 — Initial Launch
- كل الميزات الأساسية
- جامعة حمص - كلية الطب البشري
- اشتراكات بالأكواد

### v1.1.0 — Post-Launch Polish
- تحسينات بناءً على feedback
- إصلاح bugs
- تحسينات أداء

### v1.2.0 — Multi-University
- إضافة جامعات أخرى
- تحسينات RBAC للنطاقات المتعددة

### v2.0.0 — Major Update
- Native Mobile App (إن لزم)
- نظام دفع الكتروني
- دعم اللغة الإنجليزية
- حالات سريرية تفاعلية

---

**نهاية ملف ROADMAP.md**
