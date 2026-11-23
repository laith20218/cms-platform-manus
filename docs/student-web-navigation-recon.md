# Student-Web Navigation Recon — خريطة التنقل الكاملة (Task 1)

> **Mission:** Night Task 1 — ANALYSIS ONLY. No product code changed.
> **Base SHA:** `1874184579f803a3b4a1890c77778d5546ba82c7`
> **Diagram:** [`docs/diagrams/student-web-navigation-graph.svg`](./diagrams/student-web-navigation-graph.svg) · [PNG (2x)](./diagrams/student-web-navigation-graph.png) · [Generator](../tools/nav-diagram/gen-diagram.mjs)
> **Methodology:** exhaustive static recon of `apps/student-web/src` — grep of every `<Link`, `to="`, `navigate(`, `useNavigate`, `href=`, `window.location`, `<Navigate`, route definitions and nav menu configs; full reads of `router.tsx`, `AppShell/Navbar/Sidebar/BottomNav/PathTrail`, and every page component's navigation triggers. Test harnesses (`src/test/`, `e2e/`) excluded from edge analysis.

---

## 1. Route Inventory (A) — كل المسارات

The ONLY production route table is `src/app/router.tsx` (`AppRoutes`), mounted via `<BrowserRouter>` in `src/app/App.tsx`. No `createBrowserRouter`/`useRoutes`/nested routers exist elsewhere (verified by grep).

### 1.1 Public routes

| # | Path | Component | Arabic label (English) | Classification |
|---|------|-----------|----------------------|----------------|
| 1 | `/login` | `LoginPage` | تسجيل الدخول (Login) | Primary auth entry |
| 2 | `/register` | `RegisterPage` | إنشاء حساب جديد (Register) | Primary auth |
| 3 | `/verify-otp` | `VerifyOtpPage` | التحقق من الرقم (Verify OTP) | **Flag-gated** — route exists only when `VITE_OTP_ENABLED=true` (router.tsx:50,59) |
| 4 | `/forgot-password` | `ForgotPasswordPage` | نسيت كلمة المرور؟ (Forgot password) | Nested-only (from login) |
| 5 | `/reset-password` | `ResetPasswordPage` | إعادة تعيين كلمة المرور (Reset password) | Nested-only (state-carrying from forgot) |
| 6 | `/terms` | `TermsPage` | الشروط والأحكام (Terms) | Legal, public |
| 7 | `/privacy` | `PrivacyPage` | سياسة الخصوصية (Privacy) | Legal, public |
| 8 | `/contact` | `ContactPage` | تواصل معنا (Contact) | Legal, public (W16.5, admin content) |

### 1.2 Protected routes (inside `ProtectedRoute → AppShell`)

| # | Path | Component | Arabic label (English) | Classification |
|---|------|-----------|----------------------|----------------|
| 9 | `/dashboard` | `DashboardPage` | الرئيسية / «أهلاً، {name}» (Dashboard) | **Primary** (sidebar+bottomnav+logo) |
| 10 | `/study` | `StudyPage` | دراستي (My Studies hub, 5 tabs) | **Primary** (sidebar+bottomnav) |
| 11 | `/subjects` | `SubjectsPage` | المواد والخطط الدراسية (Subjects) | **Primary** (sidebar+bottomnav) |
| 12 | `/subjects/:subjectSlug` | `SubjectDetailPage` | صفحة المادة — nameAr (Subject detail) | Nested-only |
| 13 | `/subjects/:subjectSlug/lectures/:lectureId` | `LecturePage` | المحاضرة {n} (Lecture) | Nested-only |
| 14 | `/subjects/:subjectSlug/lectures/:lectureId/questions` | `QuestionPage` (+SecurityWrapper) | أسئلة المحاضرة (Lecture questions) | Nested-only |
| 15 | `/subjects/:subjectSlug/questions/:questionId` | `QuestionPage` (+SecurityWrapper) | سؤال مفرد (Standalone question) | Nested-only |
| 16 | `/favorites` | `FavoritesPage` | المفضلة (Favorites) | **Primary** (sidebar+bottomnav) |
| 17 | `/my-studies` | `MyStudiesRedirect` | — (redirect-only) | **RED — legacy** |
| 18 | `/my-studies/courses/:courseId` | `CoursePlayerPage` | مشغّل الكورس — course.title (Course player) | Nested-only (kept deliberately, W15.4.4a) |
| 19 | `/exams` | `ExamsPage` | الاختبارات (Exams + practice subtabs) | **Primary** (sidebar+bottomnav) |
| 20 | `/exams/:examId` | `ExamPage` (+SecurityWrapper) | تنفيذ الاختبار — examTitle (Exam run) | Nested-only |
| 21 | `/exams/:sessionId/review` | `ExamReviewPage` (+SecurityWrapper) | مراجعة أسئلة الاختبار (Exam review) | Nested-only |
| 22 | `/library` | `Navigate → /study?tab=library` | — (redirect-only) | **RED — legacy** |
| 23 | `/subjects/:subjectSlug/library` | `LibraryPage` → `LibraryHub` | المكتبة الرقمية (Subject library) | Nested-only |
| 24 | `/search` | `SearchPage` | ابحث في محتواك الأكاديمي (Search) | **Chrome-only** (Navbar search; no sidebar/bottomnav entry) |
| 25 | `/profile` | `ProfilePage` | حسابي / fullName (Profile) | **Primary** (sidebar+bottomnav+navbar avatar) |
| 26 | `/notifications` | `NotificationsPage` | الإشعارات (Notifications) | **Chrome-only** (Navbar bell; no sidebar/bottomnav entry) |
| 27 | `/stats` | `StatsPage` | إحصائياتي (My stats) | **Orphan** — sole incoming link is the breadcrumb «الإحصائيات» from `/leaderboard` |
| 28 | `/leaderboard` | `LeaderboardPage` | لوحة المتصدرين (Leaderboard) | **Primary** (sidebar) |
| 29 | `/activate-code` | `ActivateCodePage` | تفعيل كود الاشتراك (Activate code) | Nested-only — the most-linked CTA in the app (14+ incoming edges) |
| 30 | `/settings` | `SettingsPage` | الإعدادات (Settings) | Nested-only (from profile) |
| 31 | `/exam-courses` | `ExamCoursesRedirect` | — (redirect-only) | **RED — legacy** |
| 32 | `/exam-courses/:courseId` | `ExamCoursesRedirect` | — (redirect-only) | **RED — legacy** |
| 33 | `/practice` | `Navigate → /exams?subtab=practice` | — (redirect-only) | **RED — legacy** |
| 34 | `/practice/exam/:examModelId` | `PracticePage` | جلسة تدريب (Practice run — exam model) | Nested-only |
| 35 | `/practice/categorized/:subjectId` | `PracticePage` | جلسة تدريب (Practice run — categorized) | Nested-only |

### 1.3 Root & wildcard

| # | Path | Element | Classification |
|---|------|---------|----------------|
| 36 | `/` | `Navigate → /dashboard` (replace) | **RED — redirect-only**; its ONLY in-app incoming edge is the legal pages' «العودة للرئيسية» button (double redirect: `/` → `/dashboard`, and for guests a second bounce to `/login`) |
| 37 | `*` | `NotFoundPage` | 404 — button «العودة للوحدة التحكم» → `/dashboard` |

### 1.4 In-page surfaces (no route of their own — shown in diagram for completeness)

| Surface | Component | Mounted at | Arabic label |
|---------|-----------|------------|--------------|
| Subject options sheet | `SubjectModal` (global, App.tsx) | bottom sheet over any page | خيارات المادة |
| Training builder modal | `TrainingBuilderModal` | `/study?tab=bank` | بناء اختبار تدريبي |
| Exam-course bundle detail | `ExamCourseDetailPage` | `/study?tab=bank&courseId=…` (same route, param-swapped) | تفاصيل حزمة امتحانية |
| Exams catalog | `ExamsCatalogPage` | `/exams` (subtab exams) | فهرس الاختبارات |
| Practice catalog | `PracticeCatalog` | `/exams?subtab=practice` | فهرس التدريب |
| Exam-courses storefront | `ExamCoursesCatalog` | embedded in `/study?tab=bank` | الأسئلة الامتحانية |
| DocumentViewer | `DocumentViewer` | in-page (library tab, lecture files, search, favorites) | عارض الملفات |

---

## 2. Classification Summary (B)

| Class | Meaning | Members |
|-------|---------|---------|
| **Primary nav** | Reachable from Sidebar and/or BottomNav | `/dashboard`, `/study`, `/subjects`, `/exams`, `/leaderboard`, `/favorites`, `/profile` |
| **Chrome-only** | Reachable only from Navbar (bell/search/avatar) | `/notifications`, `/search` (avatar → `/profile` already Primary) |
| **Nested-only** | Reachable only via in-app buttons/links | subject detail, lecture, questions, standalone question, subject library, course player, exam run, exam review, practice runs, `/activate-code`, `/settings`, legal pages, forgot/reset password |
| **Orphan** | No nav chrome presence AND a single incoming edge | `/stats` (only from leaderboard breadcrumb «الإحصائيات») |
| **Flag-gated** | Existence depends on env flag | `/verify-otp` (`VITE_OTP_ENABLED`) |
| **Legacy / redirect-only (RED)** | No in-app edges point to them; exist only for old links/notifications/bookmarks | `/`, `/library`, `/practice`, `/my-studies`, `/exam-courses(/:id)` |
| **Deprecated (documented in code)** | Removed surfaces | `/player-test` (deleted Push 10.8); hub tab `?tab=overview` → redirects to `progress`; `?tab=exams` → `/exams`; `?tab=leaderboard` → `/leaderboard` (StudyPage.tsx:74-81) |

### 2.1 Nav chrome composition

- **Navbar** (all viewports): logo → `/dashboard`; search input (md+) → `/search?q=…`; mobile search icon → `/search`; theme toggle (no nav); bell → `/notifications`; avatar → `/profile`.
- **Sidebar** (`hidden md:flex`): الرئيسية، دراستي، المواد، الاختبارات، لوحة الصدارة، المفضلة، حسابي + موارد group: المكتبة (`/study?tab=library`)، الكورسات (`/study?tab=courses`)، بنك الأسئلة (`/study?tab=bank`). Historical note: «الدورات الامتحانية» entry REMOVED (W15.1); «المزيد» group dissolved (W16.1a); تفعيل كود/الإعدادات moved to Profile.
- **BottomNav** (`lg:hidden`): الرئيسية، المواد، دراستي، المفضلة، حسابي.
- **PathTrail** (global breadcrumb): renders «الرئيسية» link → `/dashboard` on every protected page (edges elided from the diagram as one uniform pattern).

---

## 3. Every Transition Edge (D) — كل حافة (من ← إلى، الزناد)

Legend: 🟦 chrome edge · ⬛ normal in-app · 🟩 primary flow · 🟦→ teal = same-route URL state · 🟧 conditional/guard · 🟥 legacy/dead · 🟪 hard full reload (`window.location`)

### 3.1 Global chrome & guards

| From | To | Trigger (control) | Type |
|------|----|--------------------|------|
| Navbar logo | `/dashboard` | logo/wordmark click (aria: العودة إلى لوحة التحكم) | 🟦 |
| Navbar search | `/search?q=…` | Enter/بحث button (md+) | 🟦 |
| Navbar search icon | `/search` | mobile icon (md:hidden) | 🟦 |
| Navbar bell | `/notifications` | bell click (testid navbar-bell) | 🟦 |
| Navbar avatar | `/profile` | avatar click | 🟦 |
| Sidebar | 7 primary + 3 hub-tab targets | nav item clicks (§2.1) | 🟦 |
| BottomNav | 5 primary targets | tab clicks | 🟦 |
| PathTrail | trail ancestors / logical parent | breadcrumb links + Back button | ⬛ (uniform, all pages) |
| ProtectedRoute | `/login?next=<path+search>` | unauthenticated visit (replace) | 🟧 |
| AuthProvider.logout | `/login` | «تسجيل الخروج» (profile) / refresh failure — `window.location.assign` | 🟪 |
| api-client 401 retry-fail | `/login` | token refresh failure — `window.location.assign` (guarded: not on /login) | 🟪 |

### 3.2 Auth pages

| From | To | Trigger | Type |
|------|----|---------|------|
| LoginPage | `?next` path or `/dashboard` | successful login (`safeNextPath`) | 🟩 |
| LoginPage | `/forgot-password` | link «نسيت كلمة المرور؟» | ⬛ |
| LoginPage | `/register` | link «ليس لديك حساب؟ أنشئ حساباً جديداً» | ⬛ |
| LoginPage | `/terms` `/privacy` `/contact` | footer links | ⬛ |
| RegisterPage | `/verify-otp` (state: phone) | after registration — **only if `otpRequired && otpRouteEnabled`** | 🟧 |
| RegisterPage | `/login` | after registration (else branch) | ⬛ |
| RegisterPage | `/terms` `/privacy` | plain `<a href>` anchors in «أوافق على الشروط…» — **full page reload, not SPA** | 🟥 (legacy pattern) |
| RegisterPage | `/login` | link «لديك حساب؟ سجّل دخولك» | ⬛ |
| RegisterPage | `/contact` | link «تواصل معنا» | ⬛ |
| ForgotPasswordPage | `/login` | link «العودة لتسجيل الدخول» (also stub UI when OTP off) | ⬛ |
| ForgotPasswordPage | `/reset-password` (state: phone) | button «إعادة تعيين كلمة المرور» after code sent | ⬛ |
| ResetPasswordPage | `/forgot-password` | effect redirect when no `state.phone` | 🟧 |
| ResetPasswordPage | `/login` | after successful reset | ⬛ |
| VerifyOtpPage | `/dashboard` | after successful verification | 🟩 |
| VerifyOtpPage | `/register` | effect redirect (no state) / link «تغيير الرقم» | 🟧 |

### 3.3 Dashboard

| From | To | Trigger | Type |
|------|----|---------|------|
| DashboardPage hero | `/favorites` | chip «المفضلة: n» | ⬛ |
| MySubjectsSection | `/subjects` | header link «تصفح المواد» / empty-state button (my-subjects-browse) | ⬛ |
| MySubjectsSection | `/activate-code` | empty-state button «تفعيل كود» | ⬛ |
| MySubjectsSection | `/subjects` | link «تصفح المواد المتاحة للتفعيل» | ⬛ |
| ContinueCard | SubjectModal | CTA «أكمل الدراسة» / «ابدأ الآن» | ⬛ (sheet) |
| QuickAccessSection | `/study?tab=library|courses|bank` (+`&subjectId=`) | tiles المكتبة/الكورسات/بنك الأسئلة (section hidden when 0 entitled subjects) | 🟦→ |
| SubjectModal | `/subjects/:slug` | «المحتوى» (always) | ⬛ |
| SubjectModal | `/study?subjectId=&tab=bank` | «بنك الأسئلة» (scope exams) | ⬛ |
| SubjectModal | `/study?subjectId=&tab=library` | «المكتبة» (scope library) | ⬛ |
| SubjectModal | `/study?subjectId=&tab=courses` | «الكورسات» (scope courses) | ⬛ |

### 3.4 Subjects tree

| From | To | Trigger | Type |
|------|----|---------|------|
| SubjectsPage (entitled strip) | `/subjects/:slug` | chip in «موادي المفعّلة» | ⬛ |
| SubjectsPage (empty semester) | `/activate-code` | button «تفعيل كود» (Sparkles) | ⬛ |
| SubjectCard | `/study?subjectId=&tab=<preferred>` | card header (entitled only; preferred = bank/courses) | ⬛ |
| SubjectCard | SubjectModal | «فتح» button (entitled only) | ⬛ (sheet) |
| SubjectCard | ActivationCodeModal | «تفعيل كود» (unentitled only) | ⬛ (modal) |
| MuwadiTab | `/subjects` | empty-state «تصفح الهيكل الأكاديمي…» | ⬛ |
| MuwadiCard | SubjectModal | whole card | ⬛ (sheet) |
| ActivationCodeModal | `/subjects/:id` (GUID ok) | after successful redemption (900 ms) | 🟩 |
| ActivationCodeModal | `/activate-code` | footer link «الذهاب لتفعيل كود» | ⬛ |
| SubjectDetailPage | `/subjects` | «تصفّح المواد المتاحة» (403) / «العودة إلى المواد» (404) | 🟧 |
| SubjectDetailPage | `/subjects/:slug/lectures/:id` | lecture card (scope canLectures) | ⬛ |
| SubjectDetailPage | `/subjects/:slug/library` | tab «المكتبة» (scope library) | ⬛ |
| SubjectDetailPage | `/study?subjectId=&tab=courses` | tab «الكورسات» (scope VideoAudio) | ⬛ |
| SubjectDetailPage | `/study?subjectId=&tab=bank` | tab «بنك الأسئلة» (scope exams) | ⬛ |
| SubjectDetailPage | `/activate-code` | link «تفعيل كود» (lectures locked) | 🟧 |
| LecturePage | `/dashboard` / `/subjects/:slug` | inline breadcrumb «الرئيسية»/«المادة» | ⬛ |
| LecturePage | back (`navigate(-1)`) | buttons «عودة» (×3) | 🟥 (history-dependent) |
| LecturePage | `…/lectures/:id/questions` | button «بدء الأسئلة (n)» (n>0) | ⬛ |
| LecturePage | `/activate-code` | link «تفعيل كود» (files 403) | 🟧 |
| LectureCard | lecture route | whole card link (from SubjectDetailPage & ContentTab) | ⬛ |

### 3.5 Study hub (`/study`)

| From | To | Trigger | Type |
|------|----|---------|------|
| StudyPage tabs | `/study?tab=progress\|content\|library\|bank\|courses` | tab buttons (setSearchParams, replace) — **URL state, no route change** | 🟦→ |
| StudyPage (retired) | `/study?tab=progress` · `/exams` · `/leaderboard` | effect redirects for `?tab=overview|exams|leaderboard` (params preserved) | 🟥 |
| SubjectScopeBar / chips | `?subjectId=` edit/clear | URL state | 🟦→ |
| ContentTab | `/subjects/:slug` | button «صفحة المادة» (LecturesText scope) | ⬛ |
| ContentTab | lecture route | LectureCard | ⬛ |
| ContentTab (locked) | `/activate-code` | LockedEmptyState CTA | 🟧 |
| LibraryTab/LibraryHub | — (no route nav) | file cards open in-page DocumentViewer; `?openFile=` deep-link auto-opens then clears | — |
| CoursesTab/CoursesCatalog | `/my-studies/courses/:courseId` | course card (VideoAudio scope) | ⬛ |
| CoursesCatalog (empty) | `/subjects` | button «تصفّح المواد» | ⬛ |
| CoursesCatalog (denied, device) | `/login` | «تسجيل الدخول» | 🟧 |
| CoursesCatalog (denied, no grants) | `/activate-code` | «تفعيل كود» | 🟧 |
| QuestionBankTab | TrainingBuilderModal | «بناء اختبار تدريبي» (inactive subject → disabled) | ⬛ (modal) |
| QuestionBankTab (locked) | `/activate-code` | LockedEmptyState | 🟧 |
| QuestionBankTab cascade | `?universityId&collegeId&yearId&semesterId&subjectId` | URL state | 🟦→ |
| TrainingBuilderModal | `/practice/categorized/:subjectId?questionIds=…` | submit «ابدأ التدريب» after successful draw | ⬛ |
| TrainingBuilderModal (denied) | `/activate-code` | link | 🟧 |
| ExamCoursesCatalog lenses | `?examTab=years|categorized` | tabs «أسئلة السنوات»/«أسئلة مصنّفة» — URL state | 🟦→ |
| ExamCoursesCatalog (years) | `/study?tab=bank&courseId=:id` | bundle card (same-route param swap → ExamCourseDetailPage) | 🟦→ |
| ExamCoursesCatalog (categorized) | `/practice/categorized/:subjectId?lectureId=…[&untaggedLecture][&paragraphTag][&untaggedTag]` | group button «ابدأ التدريب» | ⬛ |
| ExamCoursesCatalog (denied) | `/login` / `/activate-code` | CatalogEntitlementErrorCard variants | 🟧 |
| ExamCourseDetailPage | `/study?tab=bank` | back «العودة إلى بنك الأسئلة» | ⬛ |
| ExamCourseDetailPage | `/practice/exam/:examId` | button «تدريب» per published exam | ⬛ |
| ExamCourseDetailPage | `/exams/:examId` | button «اختبار» per published exam | ⬛ |
| CoursePlayerPage | `/study?tab=courses` | error card / breadcrumb «دراستي» | ⬛ |
| CoursePlayerPage episodes | in-page state only | `?episode=` read once on mount | — |

### 3.6 Exams & practice

| From | To | Trigger | Type |
|------|----|---------|------|
| ExamsPage subtabs | `?subtab=exams|practice` | tab buttons (URL state; exams default deletes param) | 🟦→ |
| ExamsCatalogPage | `/exams/:examId` | exam row (whole Link) | ⬛ |
| ExamsCatalogPage (empty) | `/study?tab=bank` | CTA «انتقل إلى بنك الأسئلة» | ⬛ |
| ExamsCatalogPage (denied/locked) | `/login` / `/activate-code` | error cards / LockedEmptyState | 🟧 |
| ExamPage | back | status Cancelled on load; «إلغاء المحاولة» confirm; error card «العودة للمادة»; results «العودة للمادة»; last-question finish | 🟥 (history) |
| ExamPage | `/exams/:sessionId/review` | results buttons «مراجعة الأسئلة»/«مراجعة الاختبار» (canReview) | ⬛ |
| ExamPage | same route (fresh attempt) | «إعادة المحاولة (n)» (remainingAttempts>0) | — |
| ExamReviewPage | back | «العودة للنتائج» (×2) | 🟥 (history) |
| PracticeCatalog | `…/lectures/:id/questions` | practice lecture card | ⬛ |
| PracticeCatalog (denied/locked) | `/login` / `/activate-code` | cards | 🟧 |
| PracticePage | back | error «العودة» | 🟥 (history) |
| PracticePage | `/study?tab=bank&examTab=categorized` | «العودة إلى التصنيفات» (empty session) | ⬛ |

### 3.7 Questions

| From | To | Trigger | Type |
|------|----|---------|------|
| QuestionPage | back | last-question finish; 404 card «رجوع»; empty-state «رجوع»; header «العودة» | 🟥 (history) |
| QuestionPage | `/activate-code` | inline link «فعّل كوداً» (options 403); LockedEmptyState «أسئلة هذه المحاضرة مُقفلة» | 🟧 |

### 3.8 Search, favorites, stats

| From | To | Trigger | Type |
|------|----|---------|------|
| SearchPage | `/subjects/:slug/lectures/:id` | lecture result card | ⬛ |
| SearchPage | `…/lectures/:id/questions?focus=:qid` | question result (with lectureId) | ⬛ |
| SearchPage | `/subjects/:slug/questions/:qid` | question result (no lectureId) | ⬛ |
| SearchPage | `/subjects/:slug` | subject result card | ⬛ |
| SearchPage (file/video/audio/summary) | — | in-page DocumentViewer button | — |
| FavoriteCard (episode) | `/my-studies/courses/:courseId?episode=:targetId` | «متابعة» / «فتح الحلقة» | ⬛ |
| FavoriteCard (question) | `/subjects/:subjectId/questions/:targetId` | «عرض السؤال» | ⬛ |
| FavoriteCard (file) | `/subjects/:subjectId/library?openFile=:targetId` | «فتح الملف» | ⬛ |
| ListReadingSheet | `/subjects/:subjectId/questions/:targetId` | row «عرض» | ⬛ |
| FavoritesEmptyState | `/subjects` · `/study?tab=bank|library|courses` | CTAs «تصفح المواد/بنك الأسئلة/المكتبة/الكورسات» | ⬛ |
| StatsPage | `/dashboard` | breadcrumb «الرئيسية» | ⬛ |
| StatsPage | `/leaderboard` | banner «🏆 لوحة المتصدرين…» | ⬛ |
| LeaderboardPage | `/dashboard` / `/stats` | breadcrumbs «الرئيسية» / «الإحصائيات» — **the ONLY edge into /stats** | ⬛ |
| LeaderboardSubjectPicker | `?subjectId=` set/delete | URL state | 🟦→ |

### 3.9 Profile, settings, notifications, legal

| From | To | Trigger | Type |
|------|----|---------|------|
| ProfilePage | `/activate-code` | quick-link card «تفعيل كود» | ⬛ |
| ProfilePage | `/settings` | quick-link card «الإعدادات» | ⬛ |
| ProfilePage | `/login` | «تسجيل الخروج» → logout() → `window.location.assign` | 🟪 |
| SettingsPage | `/terms` `/privacy` `/contact` | legal rows الشروط/الخصوصية/تواصل | ⬛ |
| NotificationsPage | sanitized `actionUrl` targets | notification row click — `window.location.href` (same-origin + 20-prefix whitelist: `/`, `/dashboard`, `/subjects`, `/exams`, `/library`, `/favorites`, `/search`, `/profile`, `/notifications`, `/stats`, `/leaderboard`, `/activate-code`, `/settings`, `/terms`, `/privacy`, `/contact`, `/my-studies`, `/exam-courses`, `/practice`, `/study`) | 🟪 |
| NotificationsPage | `/dashboard` | breadcrumb «الرئيسية» | ⬛ |
| ActivateCodePage | `/dashboard` | auto-redirect 1500 ms after success + link «العودة للوحة التحكم» | 🟩 |
| ContentPageView (terms/privacy/contact) | `/` | button «العودة للرئيسية» — **legacy target: double redirect `/`→`/dashboard` (and for guests a second bounce to /login)** | 🟥 |
| NotFoundPage | `/dashboard` | button «العودة للوحة التحكم» | ⬛ |

### 3.10 Legacy redirect edges (RED)

| From | To | Mapping | In-app edges pointing at From |
|------|----|---------|-------------------------------|
| `/` | `/dashboard` | Navigate replace | only ContentPageView «العودة للرئيسية» |
| `/library` | `/study?tab=library` | Navigate replace | **NONE** |
| `/practice` | `/exams?subtab=practice` | Navigate replace | **NONE** |
| `/my-studies` | tab-mapped (practice→exams&subtab=practice; exam-courses→study?tab=bank; library/courses/exams→mapped; else→/study) | MyStudiesRedirect | **NONE** |
| `/exam-courses(/:id)` | `/study?<all params>&tab=bank[&courseId=]` | ExamCoursesRedirect (copies every query param) | **NONE** |

---

## 4. Dead / Orphan / Confusing — النتائج الحمراء

1. **No in-app link targets `/library`, `/practice`, `/my-studies`, `/exam-courses`** — these are redirect-only shells reachable solely by external links, old notifications (actionUrl whitelist still contains them), or typed URLs.
2. **Legal pages' «العودة للرئيسية» targets `/`** (ContentPageView.tsx:38) — a legacy double-redirect instead of linking `/dashboard` directly.
3. **`navigate(-1)` back buttons in 5 deep pages** (QuestionPage, ExamPage, ExamReviewPage, PracticePage, LecturePage) — on direct URL entry these can exit the app (browser default back behavior).
4. **`/stats` is an orphan** — absent from all nav chrome; its single entrance is the leaderboard breadcrumb «الإحصائيات». StatsPage itself links to `/leaderboard`, forming a small island pair.
5. **Bell opens a full notifications page** — no dropdown/panel exists anywhere (relevant to Night Task 4).
6. **Retired hub tabs still redirect** (`?tab=overview|exams|leaderboard`) — safe, but evidence of migrated surfaces.
7. **`RegisterPage` terms/privacy anchors are raw `<a href>`** (RegisterPage.tsx:297) — full page reloads, inconsistent with SPA navigation elsewhere.
8. **`/verify-otp` depends on `VITE_OTP_ENABLED`** — route absent when flag off; typing the URL then yields 404 (by design, P2-31).

---

## 5. Completeness Statement (E)

**Methodology:** every file under `apps/student-web/src` was scanned for the patterns `<Link`, `to="`, `to={`, `navigate(`, `useNavigate`, `href=`, `window.location`, `<Navigate`, `createBrowserRouter`, `useRoutes`; all matches were read in context and resolved to route patterns; the router, nav chrome (Navbar/Sidebar/BottomNav/PathTrail), and all 25+ page components were read in full. The diagram generator (`tools/nav-diagram/gen-diagram.mjs`) encodes the same inventory and is validated geometrically (`tools/nav-diagram/validate.mjs` — checks label/node collisions and that every drawn edge endpoint touches a node).

**Coverage decisions (documented, not omissions):**
- PathTrail «الرئيسية» edges exist on every protected page → represented in the report (§3.1) but elided from the diagram as one uniform pattern (noted in diagram legend).
- `/activate-code` has 14+ incoming edges; the diagram draws representative ones (dashboard empty-state, subject-detail lock, profile, catalog denial cards, question/lecture locks) and marks the node with a «+14 سطح» badge — §3 lists every one.
- Chrome fan-out edges are drawn unlabeled (legend explains blue = chrome); each target/label pair is fully enumerated in §2.1.
- Same-route URL-state transitions (`?tab=`, `?subtab=`, `?subjectId=`, `?examTab=`, cascade params, `?openFile=`, `?episode=`, `?focus=`) are drawn teal with explicit «URL state» semantics; listed per-surface in §3.
- `e2e/` specs and `src/test/` harnesses define extra test-only routes — intentionally out of scope for production navigation.

**UNVERIFIED (would need runtime/human confirmation):**
- The runtime value of `VITE_OTP_ENABLED` per environment (affects `/verify-otp` existence and register/forgot flows).
- Server-driven `actionUrl` payloads in real notifications (the 20-prefix whitelist in `utils/sanitizeActionUrl.ts:40-61` constrains them; actual payloads unobserved).
- Whether any external surface (Android app WebView, marketing links, emails) still points at the four RED legacy routes — outside this repo's static reach.

---

## 6. Diagram Regeneration

```bash
cd tools/nav-diagram
node gen-diagram.mjs     # writes docs/diagrams/student-web-navigation-graph.svg + geometry.json
node validate.mjs        # geometric QA (label/node/edge collisions) — must print ALL CLEAN
node render-png.mjs      # 2x PNG via headless Chromium (requires Noto Sans Arabic installed)
```
