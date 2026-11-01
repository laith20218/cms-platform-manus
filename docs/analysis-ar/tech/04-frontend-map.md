# 04 — خريطة الطرف الأمامي

> الأدلة: تحليل ساكن لـ `apps/student-web/src` و `apps/admin-web/src` (‏React 19 + Vite 6 + TypeScript 5.6 لكليهما).
> شيفرة src في student-web:‏ 144 ملفاً / 28,706 سطراً. وشيفرة src في admin-web:‏ 45 ملفاً / 18,921 سطراً (معدودة).

---

## 1. ‏student-web

### 1.1 جرد الصفحات (المسارات)

الموجِّه: `src/app/router.tsx` ‏(React Router 7). **كل صفحة محمَّلة كسولاً عبر `lazy()`** ‏(router.tsx:9-35)؛ ويغلف `RouteBoundary` المسارات داخل ErrorBoundary مع Suspense لضمان الصمود أمام فشل تنزيل المقاطع (router.tsx:94-103).

**المسارات العامة** (router.tsx:45-53):

| المسار | الصفحة | الدليل |
|---|---|---|
| `/login` | ‏LoginPage | router.tsx:45 |
| `/register` | ‏RegisterPage | :46 |
| `/verify-otp` | ‏VerifyOtpPage — **المسار لا يُسجَّل إلا عند `VITE_OTP_ENABLED=true`** | :38, :47 |
| `/forgot-password`، و`/reset-password` | استرجاع كلمة المرور | :48-49 |
| `/terms`، و`/privacy` | صفحات قانونية عربية (صفحة الشروط 4 أقسام، وصفحة الخصوصية 5) | :52-53 |

**المسارات المحمية** (خلف `ProtectedRoute` ثم `AppShell`، router.tsx:56-84):

| المسار | الصفحة | الدليل |
|---|---|---|
| `/dashboard` | ‏DashboardPage | :57 |
| `/subjects`، و`/subjects/:subjectSlug`، و`/subjects/:subjectSlug/lectures/:lectureId` | المواد + المحاضرة | :58-60 |
| `/subjects/:subjectSlug/lectures/:lectureId/questions`، و`/subjects/:subjectSlug/questions/:questionId` | تمرين الأسئلة | :61-62 |
| `/favorites` | ‏FavoritesPage | :63 |
| `/my-studies` (مع `?tab=`) | مركز MyStudiesPage (تبويبات الدورات/الامتحانات/المكتبة) | :65 |
| `/my-studies/courses/:courseId` | ‏CoursePlayerPage (رصة مشغّل الإنتاج) | :66 |
| `/exams` ← تحويل إلى `/my-studies?tab=exams` | توافق قديم | :71 |
| `/exams/:examId`، و`/exams/:sessionId/review` | الامتحان + المراجعة | :72-73 |
| `/library` ← تحويل إلى `/my-studies?tab=library`؛ و`/subjects/:slug/library` | المكتبة | :74-75 |
| `/search` | ‏SearchPage | :76 |
| `/profile` | ‏ProfilePage (شاملاً تغيير كلمة المرور) | :77 |
| `/notifications` | ‏NotificationsPage | :78 |
| `/stats`، و`/leaderboard` | ‏StatsPage، وLeaderboardPage | :79-80 |
| `/activate-code` | ‏ActivateCodePage | :82 |
| `/settings` | ‏SettingsPage | :83 |
| `/` ← `/dashboard`؛ و`*` ← NotFoundPage | | :87-88 |

أُزيلت مسارات الإدارة **إزالةً تامة** من موجِّه تطبيق الطلاب (البند A من الموجة Wave 5D، وحُذف `features/admin/` الميت، بفارق −377 سطراً — EXECUTION_STATUS.md:162-167؛ وCMS_FINAL_FUNCTIONAL_STATUS.md:33).

### 1.2 جرد الميزات (20 مجلداً، معدودة)

| الميزة | الملفات | الأسطر | المحتويات |
|---|---|---|---|
| `media-player` | 47 | 15,256 | انظر §1.3 |
| `my-studies` | 9 | 1,843 | المركز مع CoursesCatalog، وLibraryHub، وPracticeCatalog، وLockedEmptyState، و`useMySubjects`، وcourses-api |
| `subjects` | 5 | 1,247 | ‏SubjectsPage، وSubjectDetailPage، وLecturePage، وacademic-api |
| `profile` | 4 | 1,112 | ‏ProfilePage (تغيير كلمة المرور — CMS_FINAL_FUNCTIONAL_STATUS.md:35) |
| `library` | 4 | 1,026 | ‏LibraryPage مع library-api |
| `favorites` | 9 | 976 | ‏FavoritesPage مع الخطافات |
| `auth` | 6 | 920 | الدخول/التسجيل/التحقق/النسيان/الاسترجاع مع auth-api |
| `questions` | 2 | 693 | ‏QuestionPage (تمرين الاختيار من متعدد) |
| `exams` | 4 | 453 | ‏ExamPage، وExamReviewPage، وexam-api |
| `offline` | 3 | 553 | ‏useOffline، وoffline-api، و**offline-db (قاعدة IndexedDB)** |
| `stats` | 3 | 335 | ‏StatsPage، وLeaderboardPage |
| `notifications` | 2 | 205 | صندوق الوارد |
| `security` | 2 | 115 | سطح إدارة الجلسات والأجهزة |
| `subscriptions` | 1 | 122 | ‏ActivateCodePage |
| `settings` | 1 | 101 | ‏SettingsPage |
| `entitlements` | 1 | 56 | ‏entitlement-api (إصدار الرمز وتجديده) |
| `search`، و`dashboard`، و`legal` | 1-2 لكل منها | 47-50 | صفحات رقيقة |
| **الإجمالي** | **نحو 107 ملفات في الميزات** | | |

عناصر ممتدة: `src/services/api-client.ts` (عميل axios المشترك)؛ ووحدات `services/*-api.ts` لكل ميزة (14 معدودة)؛ و`src/hooks/` (‏PermissionProvider، وusePermission، وusePerformance)؛ و`components/` (التخطيطات: AppShell/Navbar/Sidebar/BottomNav؛ والمشتركة: ErrorBoundary/ProtectedRoute؛ وواجهات الاستخدام: LoadingScreen/Overlays/Skeleton).

### 1.3 شجرة المكوّنات — مشغل الوسائط (الميزة الكبرى)

```
CoursePlayerPage / LibraryPage / subject library
└── PlayerShell.tsx (shell-context.ts: shared player context)
    ├── LazyPlayerMount.tsx (mount isolation)
    ├── protection/PlayerProtection.tsx
    │   └── usePlayerProtection.ts (contextmenu/selection/copy/cut/drag/shortcut deterrents,
    │       sanctioned selection allowlist for the highlighter; Arabic feedback toasts)
    ├── pdf/PdfPlayer.tsx
    │   ├── PdfControlsBar, PdfStatusBar, MobileActionBar, ThumbnailsRail
    │   ├── StudyToolsPanel + StudyListsPanel (study-lists.ts)
    │   ├── pdf-note-layer.tsx + usePdfAnnotations (persisted via /library/{id}/annotations)
    │   ├── pdf-search.ts + pdf-search-dom.ts (char-level hit boxes — Wave 12.1)
    │   ├── pdf-geometry.ts, pdf-text.ts, pdf-palette.ts, pdf-bookmarks.ts
    │   └── pdf-worker.ts (pdfjs-dist 6.4.299 worker; vendored assets public/pdfjs-dist)
    ├── video/VideoPlayer.tsx
    │   ├── ControlsBar, BookmarkDialog, EpisodeMetadata, time.ts
    │   └── hooks/useMediaLease.ts (presigned-URL lease engine:
    │       IDLE→FETCHING→SWAPPING→RESTORING lifecycle, swapId contract,
    │       deferred-intent queue, silent refresh at TTL−60s)
    └── audio/AudioPlayer.tsx (wavesurfer.js)
```

محرك `useMediaLease` هو أكثر وحدات الطرف الأمامي اختباراً: 4 ملفات اختبار منها اختبارات خصائص مزروعة البذرة بـ 1,000 تكرار (`hooks/__tests__/useMediaLease.p3-queue-property.test.ts`، بالبذور 42-46 — ‏W-MATRIX.md:100-106) ومصفوفة انحدار نوافذ التسابق W1-W10 ‏(W-MATRIX.md:26-37).

### 1.4 إدارة الحالة

| المسألة | الآلية | الدليل |
|---|---|---|
| المصادقة/الجلسة | سياق React ‏(`AuthProvider`) مع `cms-access-token` / `cms-refresh-token` في sessionStorage؛ واستدعاء `refreshToken()` صريحاً على مسارات الخطأ 401 | AuthProvider.tsx:11-70 |
| السمة | سياق ThemeProvider (فاتح/داكن) | app/providers/ThemeProvider.tsx |
| حالة الخادم | ‏TanStack Query 5 | package.json:21 |
| حالة المشغّل | خطاف `useMediaLease` (آلة حالات محلية، ومراجع، وأحداث دورة الحياة) | useMediaLease.ts:15-43 |
| الصلاحيات | سياق `PermissionProvider` مع `usePermission` | src/hooks/ |
| العمل دون اتصال | ‏IndexedDB عبر `offline/services/offline-db.ts` مع `useOffline` | |
| حالة URL | ‏React Router (التبويبات عبر `?tab=`) | router.tsx:65, 71 |

### 1.5 التدويل وRTL والسمات

- **العربية أولاً**: نصوص الواجهة عربية مضمَّنة في الشيفرة (مثال ذلك نصوص تنبيهات المشغّل، usePlayerProtection.ts:128-135)؛ وبيان PWA يصرِّح بـ `lang: 'ar', dir: 'rtl'` ‏(بيان vite.config.ts)؛ والخطوط جاهزة للاتجاه من اليمين إلى اليسار.
- **السمات**: فاتح/داكن عبر ThemeProvider (قائمة ميزات README ‏«وضع ليلي»).
- لا إطار تدويل — الإنجليزية غائبة عن واجهة الطالب. (التدويل = PLANNED، في ROADMAP الإصدار v2.0.0.)

## 2. ‏admin-web

### 2.1 البنية

تطبيق صفحة واحدة بغلاف مفرد — **بلا مكتبة موجِّهات**. يحمل `src/App.tsx` ‏(1,045 سطراً) اتحاد `View` من 13 قسماً (App.tsx:61) مع تنقّل عبر `useState<View>` ‏(App.tsx:100)، ولوحة أوامر (⌘K، App.tsx:105-106)، وعناوين ثنائية اللغة واعية بالاتجاه (App.tsx:498-524):

`overview · academic · questions · exams · library · students · codes · reports* · admins* · roles* · audit* · settings*` ‏(* = `superOnly`، App.tsx:520-524؛ وينزل super_admin على `admins`، وغيره على `overview` — ‏App.tsx:273).

### 2.2 جرد المكوّنات (26 مكوّن «مركز»/نافذة، معدودة)

| المجال | المكوّنات |
|---|---|
| الشؤون الأكاديمية | ‏AcademicCenter، وScopePicker |
| الدورات/المحتوى | ‏CoursesCenter، وEpisodeEditModal، وEpisodeMetadataFields، وProcessingTimeline، وProcessingErrorModal |
| بنك الأسئلة | ‏QuestionsCenter |
| الامتحانات | ‏ExamsCenter |
| المكتبة | ‏LibraryCenter |
| الطلاب | ‏StudentsCenter (عرض/بحث/تصفية/حظر؛ وإنهاء الجلسات وإبطال الأجهزة مع تأكيد وسجل أمان لكل طالب — CMS_FINAL_FUNCTIONAL_STATUS.md:31-32) |
| الرموز | ‏CodesCenter (المولِّد، والسجل، والإبطال) |
| التقارير | ‏ReportsCenter (قوالب نطاقات زمنية جاهزة 7 أيام/30/90/6 أشهر/12 شهراً، وتصدير CSV ‏×3 مع PDF جاهز للطباعة، و«القيمة التقديرية» = رموز مبيعة × 25,000 — EXECUTION_STATUS.md:21-35)، وReportsTabs، وReportsModeration |
| المشرفون/التحكم بالوصول | ‏AdminsCenter (مع DialogLayer)، وRolesCenter، وPermissionMatrixEditor، وUiPermissionsEditor |
| التدقيق/الأمان | ‏AuditCenter، وAuditLogViewer، وActivityMonitor |
| الإشعارات | ‏NotificationCompose (نطاق الجمهور) |
| النظام | ‏SettingsCenter، وAccessibleModal، وErrorBoundary |

### 2.3 إدارة الحالة والواجهة البرمجية

- `src/lib/api.ts` — عميل مصنوع يدوياً: `apiRequest` مع ترويسة Authorization، وأنواع محتوى JSON مقابل FormData، ومعالجة 204، و`ApiError` حاملة رمز الحالة (مختبر عبر `test/api.test.ts`، بسبع حالات — EXECUTION_STATUS.md:89)؛ و`login`/`refreshAccessToken` ‏(App.tsx:38).
- ‏zustand 5 لحالة العميل، وreact-hook-form مع @hookform/resolvers للنماذج، وrecharts 3 لمخططات التحليلات (package.json:18-31).
- حزمة صلاحيات الواجهة: `hooks/useUiPermissions.ts` مع `lib/uiPermissions.ts` (`createCanFunction`) تبوِّب علامات التبويب عبر `can('tab:overview.metrics')` ‏(App.tsx:936-941)؛ وتعكس الواجهةُ البرمجية ذلك بترحيل Push3 ‏`Push3UiPermissions` و`UiPermissionsUnavailableException`← الخطأ 503 بفشل مغلق (ExceptionHandlingMiddleware.cs:44-49).

### 2.4 التدويل وRTL والسمات

- ثنائية اللغة عبر `isArabic = locale === 'ar'` وكائنات `copy` مضمنة (App.tsx:123-132, 221-226)؛ ويتبدل `dir` بين rtl/ltr لكل حاوية (App.tsx:937).
- التنسيق: ‏Tailwind CSS 4 بلغة تصميم «مساحة عاجية، وسلطة كحلية، وأزرق مخضر طبي» (تعليق ترويسة vite.config.ts)؛ وانتقالات framer-motion؛ وأيقونات lucide.

## 3. الحزم المشتركة

| الحزمة | الملفات | الأسطر | المحتويات |
|---|---|---|---|
| `packages/ui` | 16 | 417 | عناصر واجهة مشتركة |
| `packages/types` | 2 | 78 | عقود TypeScript مشتركة |
| `packages/utils` | 2 | 20 | مساعدات |

الحزم الثلاث مربوطة كمساحات عمل في التطبيقين (تبعيات `@cms/*` في ملفي package.json؛ والاسم المستعار في vite.config.ts لكليهما). تغطية الاختبار للحزمة packages/ui: لا شيء بعد — مدرجة ضمن الأعمال المتبقية (EXECUTION_STATUS.md:116).

## 4. البناء والتسليم

| الجانب | student-web | admin-web |
|---|---|---|
| الحازم | ‏Vite 6، مع `tsc -b` قبل البناء | ‏Vite 6، مع `tsc -b` |
| المقاطع اليدوية | `react-vendor`، و`query-vendor`، و`ui-vendor`، و**`pdfjs`** (معزول) | لا شيء (استراتيجية مقطع تطبيق واحد) |
| ‏PWA | ‏vite-plugin-pwa، وautoUpdate، وتخزين مسبق workbox مع تخزين مؤقت زمن التشغيل (الخطوط CacheFirst لسنة؛ و`*.onrender.com/api`‏ NetworkFirst ‏10 ثوانٍ/5 دقائق) | لا PWA |
| التصغير | ‏terser مع `drop_console`/`drop_debugger` | terser بالمثل |
| وكيل التطوير | `/api` ← `VITE_DEV_API_PROXY_TARGET || localhost:8080` | بالمثل، على المنفذ 5174 |

الأدلة: `apps/student-web/vite.config.ts`، و`apps/admin-web/vite.config.ts`.

---

*ذو صلة: [01-architecture.md](01-architecture.md) · [05-performance.md](05-performance.md)*
