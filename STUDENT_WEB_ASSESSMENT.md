# STUDENT WEB — Deep Assessment Report

> **Branch**: `feature/wave4-testing-security` (assessment only, no code changes)
> **Date**: 2026-10-22
> **Assessor**: Automated deep audit (ASSESS-STUDENT-WEB agent)

---

## Executive Summary

**الحكم**: واجهة الطالب **وظيفية لكنها متباعدة تصميمياً** عن واجهة الإدارة. التطبيقان لم يعودا ينتميان لنفس المنتج بصرياً. واجهة الإدارة صُممت بمعايير 2024+ (Linear/Stripe era) بينما واجهة الطالب ما زالت في حقبة Material Design 2 (2018-2021).

| البعد | الوضع |
|---|---|
| **التوافق البصري** | ❌ متباعد — أنظمة tokens مختلفة كلياً |
| **الفجوة في الميزات** | ⚠️ 6 ميزات Backend غير مستهلكة |
| **التوافق مع الـ Wireframes** | ⚠️ 5 شاشات مفقودة من أصل 14 موثّقة |
| **جودة الكود** | ✅ TypeScript صارم (0 `any`) — أفضل من admin-web |
| **PWA + Offline** | ❌ مشاكل P0 (أيقونات مفقودة، لا runtime caching) |

---

## 1. مقارنة نظام التصميم (Design Tokens)

### الجدول المقارن

| الجانب | student-web (`--c-*`) | admin-web (`--cms-*`) |
|---|---|---|
| **نظام الألوان** | Medical Blue `#1976D2` + Cyan `#00BCD4` | Ink navy `#0b2235` + Teal `#1a9b90` + Ivory `#f7f4ec` |
| **الخطوط** | Cairo + Inter + JetBrains Mono | IBM Plex Sans Arabic + DM Mono |
| **الظلال** | 7 مستويات + **4 ظلال توهج** (glow) | 5 مستويات — **صفر توهجات** (قاعدة صريحة) |
| **الزوايا** | 8 مستويات حتى 36px (`--r-3xl`) | 5 مستويات، حد أقصى 20px |
| **التدرجات** | 8 تدرّجات | 2 فقط (alias) |
| **مقاييس النص** | Tailwind عشوائي (`text-[15px]`) | Tokens صريحة (`--cms-text-2xs` إلى `--cms-text-3xl`) |
| **Dark mode** | ✅ `[data-theme="dark"]` | ✅ `[data-theme="dark"]` |
| **خلفية الجسم** | نمط ECG طبي بشفافية 0.02 | لا شيء |
| **Tokens تخطيطية** | لا توجد | sidebar-w, topbar-h, content-max, breakpoints |

### الحكم البصري الصريح

- **الأزرار**: student-web يستخدم تدرّج أزرق→سماوي + ظل + رفع عند hover (Material Design 2). admin-web يستخدم لون صلب teal-700 + ظل خفيف + تغيير لون الحدود (Linear/Stripe).
- **البطاقات**: student-web زوايا 16-24px + رفع عند hover. admin-web زوايا 10-14px + تغيير لون الحدود فقط.
- **الظلال**: student-web ظلال توهج زرقاء/سماوية/خضراء/حمراء. admin-web **قاعدة صريحة: "لا توهجات، لا زجاجية مفرطة، لا نيون"**.
- **الشريط الجانبي**: student-web زجاجي بـ 280px، غير قابل للطي، قائمة مسطحة. admin-web navy صلب بـ 260px، **قابل للطي إلى 64px**، 4 مجموعات هرمية.

---

## 2. فجوة الميزات (Feature Gap)

### ميزات Backend غير مستهلكة في student-web

| # | الميزة | Backend endpoint | الحالة في student-web |
|---|---|---|---|
| 1 | **رفع الصورة الشخصية (Avatar)** | `POST /admin/students/{id}/avatar` | ❌ Admin-only، لا يوجد endpoint للطالب نفسه |
| 2 | **إدارة الجلسات والأجهزة** | `GET /security/students/{id}/sessions` | ❌ Admin-only، ProfilePage يعترف بالفجوة |
| 3 | **عرض السجل الأمني** | `GET /security/students/{id}/logs` | ❌ Admin-only |
| 4 | **تسجيل Push Token** | `POST /notifications/push-token` | ❌ الكود موجود في `notificationApi` لكن لا يُستدعى من أي مكون |
| 5 | **تفعيل كود الاشتراك (Flow 2)** | موثّق في USER_FLOWS.md | ❌ لا يوجد مسار `/activate-code` |
| 6 | **إعدادات الحساب (Settings Page)** | WF-S14 في WIREFRAMES.md | ❌ صفحة غير موجودة |

### ميزات ناقصة في student-web

| الميزة | التفاصيل |
|---|---|
| **زر المشاركة (Share)** | في QuestionPage — زر ميت بدون onClick handler |
| **Pagination للإشعارات** | لا توجد، كل الإشعارات تُحمّل دفعة واحدة |
| **Skeleton loaders** | غير موجودة — يستخدم `Loader2` spinner فقط (admin-web لديها `.skeleton` + shimmer) |
| **صفحة 404** | غير موجودة — wildcard redirect إلى `/dashboard` |
| **صفحة Offline** | غير موجودة (WF-SS5 موثّقة) |
| **Anti-cheat في الاختبارات** | لا fullscreen lock، لا tab-switch detection |

---

## 3. التوافق مع Wireframes الأصلية

| Wireframe | المسار | الحالة |
|---|---|---|
| WF-P1..P5 (Landing/Features/Pricing/FAQ/Contact) | n/a | ❌ **كلها مفقودة** — `/` redirect إلى `/dashboard` |
| WF-A1 Login | `/login` | ✅ |
| WF-A2 Register | `/register` | ✅ |
| WF-A3 Verify OTP | `/verify-otp` | ✅ (مشروط بـ `VITE_OTP_ENABLED`) |
| WF-A4 Activate Code | n/a | ❌ **مفقود** (Flow 2 موثّق لكن لا UI) |
| WF-S1..S13 (شاشات الطالب) | مختلفة | ✅ معظمها منفّذ؛ S10 Profile **جزئي**؛ S13 Notifications يفتقد type filter + pagination |
| WF-S14 Settings Page | n/a | ❌ **مفقود** |
| WF-SS2 Skeleton Loading | — | ❌ **مفقود** |
| WF-SS4 404 Page | — | ❌ Wildcard redirect بدلاً من صفحة 404 |
| WF-SS5 Offline Page | — | ❌ **مفقود** |
| WF-T1 Tablet Dashboard | — | ❌ **مفقود** |

---

## 4. تدقيق UX (UX Audit)

### الإيجابيات
- ✅ **RTL كامل**: `dir="rtl" lang="ar"` على `<html>`
- ✅ **حالات الخطأ**: بطاقات حمراء مع retry buttons
- ✅ **حالات الفراغ**: لوحات بحدود متقطعة + أيقونة + نص عربي
- ✅ **دورة الاختبار الكاملة**: start → session → save → submit → results → review
- ✅ **Mobile-first**: BottomNav على الجوال، Sidebar على lg+
- ✅ **Reduced-motion** + **tabular-nums** + **focus-visible**

### المشاكل
- ⚠️ **hard-coded `right:`/`left:`** في LoginPage orbs و LibraryPage watermark overlay — لن تُقلب في LTR
- ⚠️ **زر "مشاركة" ميت** في QuestionPage (لا onClick)
- ⚠️ **`window.confirm`** في ExamPage للإلغاء — غير متناسق مع modal المصمم للتسليم
- ⚠️ **شريط جانبي مسطّح** (9 عناصر في قائمة واحدة) — admin-web لديه 4 مجموعات هرمية
- ⚠️ **لا badge عدد غير مقروء** على جرس الإشعارات (admin-web لديه)

### ملاحظات TODO في الكود
| الملف | السطر | المشكلة |
|---|---|---|
| `ProfilePage.tsx` | 71 | sessions/devices placeholder note |
| `QuestionPage.tsx` | 392 | dead Share button |
| `useOffline.ts` | 103 | `saveOfflineAnswer` is a stub that throws |
| `NotificationsPage.tsx` | 165 | `useState` imported after usage |

---

## 5. PWA + Offline Mode

### P0 — مشاكل حرجة
1. **`public/` folder لا يوجد** — `includeAssets` يشير إلى `favicon.ico` + `icons/icon-192.png` + `icons/icon-512.png` لكنها غير موجودة. Build ينجح بصمت لكن PWA install لا يعرض أيقونات.
2. **Vercel config dead redirect** — `/login → /auth/login` لكن router لديه `/login` فقط.
3. **لا runtime caching لـ `/api/*`** — فقط Google Fonts مُخزَّن. App shell يعمل offline لكن كل API call يفشل.
4. **لا `navigateFallback`** — offline navigation إلى route غير مُخزَّن يعطي صفحة بيضاء.

### Offline features (موجودة لكن معطّلة)
- IndexedDB wrapper مع `packages` + `answers` stores ✅
- Security-by-design (envelopes مشفّرة، لا plaintext، لا raw AES keys) ✅
- `saveOfflineAnswer` stub يرمي استثناء — ينتظر Android trusted-runtime integration
- Feature flag معطّل في الإنتاج

---

## 6. جودة الكود

| المقياس | student-web | admin-web |
|---|---|---|
| **LOC (src)** | 5,808 | 11,979 |
| **الملفات** | 65 (40 .tsx + 25 .ts) | ~25 |
| **TypeScript `any`** | **0** ✅ | 25+ في ReportsTabs.tsx |
| **تبعيات ميتة** | 5 (zustand, react-hook-form, zod, cva, @hookform/resolvers) — ~250KB | 0 |
| **بنية الملفات** | Feature-folders (قابل للتوسع) | Monolithic App.tsx (945 سطر) |
| **packages/ui** | مستورد لنوع واحد فقط | غير مستخدم |
| **نمط الأنماط** | Inline Tailwind (200+ char className) + inline `style={{}}` | نفس النمط |

### ما هو ممتاز بالفعل
- ✅ TypeScript صارم (صفر `any`) — أفضل من admin-web
- ✅ Toolchain حديث (Vite 6 + React 19 + Tailwind 4 + TanStack Query 5)
- ✅ مسارات lazy-loaded + manual chunks
- ✅ تصميم أمني للـ offline (مظاريف مشفّرة)
- ✅ دورة اختبار كاملة مع نتائج متحركة + مراجعة
- ✅ مكتبة ملفات بـ 7 أنواع مع sandboxed iframes

---

## الخطة المقترحة — Wave 5: Student Web Redesign

### المبدأ: P0 أولاً، ثم إعادة تصميم كاملة

### المرحلة 5A — ترميم سريع (P0 Hardening) — 1-2 يوم
لا يحتاج إعادة تصميم، فقط إصلاحات:

| # | المهمة | الملفات |
|---|---|---|
| 1 | إنشاء `public/` + أيقونات PWA (192/512/maskable) | `public/icons/` |
| 2 | إصلاح dead redirect في vercel.json | `vercel.json` |
| 3 | حذف 5 تبعيات ميتة | `package.json` |
| 4 | تنفيذ/حذف زر Share في QuestionPage | `QuestionPage.tsx` |
| 5 | إصلاح `useState` import في NotificationsPage | `NotificationsPage.tsx` |
| 6 | إضافة runtime caching لـ `/api/*` في vite config | `vite.config.ts` |
| 7 | إضافة navigateFallback للـ SW | `vite.config.ts` |
| 8 | إضافة skeleton loaders على Dashboard + Library | مكونات جديدة |

### المرحلة 5B — STUDENT-DESIGN-01: ترحيل نظام التصميم — 2-3 يوم
| # | المهمة |
|---|---|
| 1 | ترحيل `--c-*` → `--cms-*` tokens (ink/ivory/teal palette) |
| 2 | ترحيل الخطوط: Cairo → IBM Plex Sans Arabic، Inter → DM Mono |
| 4 | إزالة ظلال التوهج + نمط ECG من body |
| 5 | تحديث الأزرار: تدرّج → لون صلب teal-700 |
| 6 | تحديث البطاقات: زوايا 24px → 14px، إزالة hover lift |
| 7 | تحديث الظلال: 7+glows → 5 بدون توهجات |
| 8 | إضافة API health pill + operator dropdown للـ Navbar |
| 9 | إضافة unread-count badge على جرس الإشعارات |

### المرحلة 5C — STUDENT-DESIGN-02: ميزات مفقودة — 2-3 يوم
| # | المهمة |
|---|---|
| 1 | صفحة تفعيل كود الاشتراك (`/activate-code`) |
| 2 | صفحة إعدادات الحساب (`/settings`) — WF-S14 |
| 3 | صفحة 404 مُصمّمة (WF-SS4) |
| 4 | wiring Push notification registration |
| 5 | Pagination للإشعارات + type filter |
| 6 | استبدال `window.confirm` في ExamPage بـ styled modal |
| 7 | تصدير `actionUrl` → SPA `navigate()` بدل full reload |

### المرحلة 5D — (اختياري) صفحات عامة — 1-2 يوم
| # | المهمة |
|---|---|
| 1 | Landing page (WF-P1..P5) |
| 2 | Tablet-specific layouts (WF-T1) |
| 3 | Offline page (WF-SS5) |

### الجدول الزمني المقترح

| المرحلة | المدة | يعتمد على |
|---|---|---|
| 5A — P0 Hardening | 1-2 يوم | لا شيء (مستقل) |
| 5B — Design Migration | 2-3 يوم | 5A مكتملة |
| 5C — Missing Features | 2-3 يوم | 5B مكتملة (للتوافق البصري) |
| 5D — Public Pages | 1-2 يوم | اختياري |
| **الإجمالي** | **6-10 أيام** | |

### الأولوية: 5A يمكن تنفيذها فوراً (لا تعارض مع أي شيء)
