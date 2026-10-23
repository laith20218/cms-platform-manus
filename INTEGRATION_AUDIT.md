# تقرير تدقيق التكامل (Integration Audit) — student-web × admin-web

**المهمة:** INTEGRATION-AUDIT
**الفرع:** `feature/wave5c-missing-features`
**التاريخ:** 2026 — تحليل ثابت فقط (RESEARCH ONLY — لا تغييرات على الكود)
**النطاق:** `apps/student-web` × `apps/admin-web` مع مرجع `apps/api` للتحقق من العقود الخلفية.
**المنهج:** قراءة كل ملفات `*-api.ts` / `lib/api.ts` / `router.tsx` / `App.tsx` / `globals.css` / `vite.config.ts` / `providers/*` / `packages/types` / `packages/ui` ومطابقتها مع DTOs في `apps/api`.

---

## جدول الملخّص (Severity Counts)

| الخطورة | العدد | ملاحظة سريعة |
|---|---|---|
| 🔴 Critical | 4 | كسر استجابة تسجيل دخول admin، إسقاط `refreshToken`، تطابق `UserDto` لا يطابق `AdminUser`، استخدام `installationId` ثابت مشترك |
| 🟠 High | 6 | خطأ اسم حقل في `SettingsPage.tsx` (`oldPassword`)، شاشات admin ميّتة داخل student-web، `User` مكرر، `VITE_API_BASE_URL` يرجع إلى production افتراضياً، `notification.actionUrl` مفتوح لإعادة التوجيه، انعدام deep-linking في admin-web |
| 🟡 Medium | 7 | `Page/PageSize` مقابل `page/pageSize`، `PermissionProvider` غير مُركَّب، `@cms/ui` غير مستخدم، `--cms-sidebar-w` مختلف (280px مقابل 260px)، صيغة `installationId` غير متسقة عبر endpoints،`StudentProfile` لا يملأ `phone`، `/auth/me` يرفض توكن admin (403) |
| 🟢 Low | 5 | اختلافات ثانوية في tokens، `localStorage` مقابل `sessionStorage` للواجهة، اسم `VITE_OTP_ENABLED` غير موثّق في `.env.example`، أنواع `any` كثيرة في `admin-web`، `@cms/types` غير مستورد في admin-web إطلاقاً |
| ✅ OK | 9 | tokens اللون `--cms-*` متطابقة، الخطوط IBM Plex Sans Arabic + DM Mono موحّدة، نفس `axios` client للطلاب، صيغة JSON camelCase سائدة، استخدام `Authorization: Bearer` متّسق، إلخ |

**الخلاصة:** المنتجان ليسا جاهزين للـ batch deploy دون إصلاح الـ 4 Criticals و3 على الأقل من الـ Highs. الـ Criticals جميعها في admin-web، بينما student-web يحتوي على Highs خاصة به (SettingsPage، dead code).

---

## 1. تحليل عقد الـ API (API Contract Analysis)

### 1.1 ملخّص طبقة الطلبات في كل تطبيق

| الجانب | student-web | admin-web |
|---|---|---|
| المكتبة | `axios.create()` عبر `apps/student-web/src/services/api-client.ts` | `fetch()` أصلي عبر `apiRequest()` في `apps/admin-web/src/lib/api.ts` |
| `baseURL` | `import.meta.env.VITE_API_URL \|\| '/api/v1'` (نسبي، يعتمد على dev proxy) | `import.meta.env.VITE_API_BASE_URL ?? 'https://cms-api-preview.onrender.com'` (إنتاجي افتراضي ⚠️) |
| `Authorization` | يُحقن تلقائياً عبر interceptor | يُحقن يدوياً في كل `apiRequest()` call عبر الـ token الوارد |
| `401` handler | يُجدّد `accessToken` عبر `refreshToken` ثم يُعيد المحاولة، وفي الفشل يحوّل إلى `/login` | يستدعي `signOut()` بصمت داخل المكوّن المعني (لا توجد آلية عامة) |
| `Refresh Token` | موجود في `sessionStorage.cms-refresh-token` ولا يُستخدم في الـ body للطلبات الاعتيادية، فقط في `/auth/refresh` | لا يوجد إطلاقاً (يُسقَط من استجابة تسجيل الدخول) |
| `Installation-Id` header | يُحقن لكل طلب (`X-Installation-Id` + `X-Device-Fingerprint`) | غير موجود إطلاقاً |
| اللغة | `Accept-Language: ar` افتراضياً | غير مضبوط (browser default) |

### 1.2 جدول الـ Endpoints المتقابلة (Cross-App Endpoint Matrix)

| Endpoint | student-web sends | admin-web sends | Mismatch | Severity |
|---|---|---|---|---|
| `POST /auth/login` | `{ phone, password, deviceFingerprint, deviceName }` → `{ accessToken, refreshToken, tokenType, expiresIn, user: UserDto }` | — | student only | OK |
| `POST /auth/admin/login` | — | `{ email, password, twoFactorCode: null, installationId: 'cms-admin-web-production' }` → يُعلن النوع `{ accessToken, user: AdminUser }` (يسقط `refreshToken`, `tokenType`, `expiresIn`) | **التطبيق لا يلتقط `refreshToken` المُعاد من الخادم (AuthResponse يحويه)**، **`installationId` ثابت لكل المدراء → تعارض جلسات**، **`AdminUser.email` غير موجود في `UserDto` الخلفي (الخادم يعيد `phone` فقط)** | 🔴 Critical |
| `POST /auth/refresh` | `{ refreshToken }` (بدون `installationId` في الـ body، لكن الـ headers تحوي `X-Installation-Id`) | غير موجود | student only؛ admin لا يملك refresh إطلاقاً | 🔴 Critical (admin) |
| `POST /auth/logout` | موجود | غير موجود | admin logout مجرد `sessionStorage.removeItem` محلي فقط، لا يُبطل الجلسة على الخادم | 🟠 High |
| `GET /auth/me` | student only (`[Authorize(Roles="student")]` على الخادم) | غير مستخدم | admin لو حاول سيتلقى 403 | OK |
| `GET /auth/admin/me/permissions` | مستخدم داخل `PermissionProvider` (غير مُركَّب) | غير مستخدم (المكوّن غير موجود في admin-web رغم أن الـ endpoint موجود) | admin يعتمد على `user.role === 'super_admin'` فقط من غير التحقق من الصلاحيات الفعلية | 🟡 Medium |
| `POST /auth/register` | `{ phone, password, fullName, universityId, collegeId, academicYearId, acceptTerms, installationId }` | — | student only | OK |
| `POST /auth/verify-otp` | `{ phone, otpCode, installationId }` | — | student only | OK |
| `POST /auth/forgot-password` | `{ phone }` | — | student only | OK |
| `POST /auth/reset-password` | `{ phone, otpCode, newPassword }` | — | student only | OK |
| `POST /auth/change-password` | `authApi.changePassword`: `{ currentPassword, newPassword }` ✅؛ لكن `SettingsPage.tsx` يستدعي inline: `{ oldPassword, newPassword }` ❌ | — | **`SettingsPage` يكسر العقد:** `ChangePasswordRequest` الخلفي يطلب `CurrentPassword` وليس `OldPassword` → 400 Validation | 🔴 Critical |
| `GET /profile` | موجود، يعيد `StudentProfile` | — | student only | OK |
| `GET /notifications` | `{ unreadOnly, page, pageSize }` | — | student only (admin يستخدم `/unread-count` فقط) | OK |
| `GET /notifications/unread-count` | يعيد `number` | admin يستدعي نفس المسار لتعبئة شارة الجرس | **`NotificationsController.GetUnreadCount` ينفّذ `GetStudentId()`، أي يبحث عن إشعارات الطالب. توكن admin سيُعطي 0 دائماً (شارة صامتة خاطئة)** | 🟠 High |
| `POST /notifications/send` | — | `{ type, title, body, targetType, targetId, scheduledAt, expiresAt }` → `{ notificationId, recipientsCount, isScheduled }` | **لا يُرسل `actionUrl` ولا `actionLabel` ولا `icon`** بينما student-web ينتظرها في `Notification` interface | 🟠 High |
| `GET /subscriptions/redeem` | `POST /subscriptions/redeem` body `{ code }` | admin ينشئ الكود عبر `POST /admin/codes/generate` body `{ scopeType, scopeId, durationDays, quantity, prefix, codeExpiresAt, contentScope, isPublic }` | code مع `scopeType='subject'/'year'` و `contentScope` (5 قيم). student لا يتحقق من `contentScope` إطلاقاً | 🟡 Medium |
| `POST /admin/codes/generate` | غير مستخدم (يتيم ضمن `apps/student-web/src/features/admin/services/admin-api.ts` dead code) | يستخدمه فعلياً | student-web يملك نسخة طبق الأصل من admin endpoint لكنها لا تُستخدم | 🟠 High (dead code) |
| `POST /admin/students/:id/ban` | student-web dead code | admin-web يستدعيه بـ `{ reason, banUntil }` | المسار موجود في الاثنين لكن student-web لا يستدعيه | 🟠 High (dead code) |
| `POST /admin/students/:id/unban` | student-web dead code | admin-web | نفس ما سبق | 🟠 High (dead code) |
| `GET /admin/dashboard` | student-web dead code | admin-web يستدعيه | النوع `DashboardStats` مكرر في كلا التطبيقين بحقول متطابقة | 🟠 High (duplication) |
| `GET /admin/revenue?months=` | student-web dead code | admin-web `ReportsTabs.tsx` | نفس الحقول `RevenueData[]` | 🟠 High (duplication) |
| `GET /admin/student-growth?days=` | student-web dead code | admin-web | نفس `StudentGrowth[]` | 🟠 High (duplication) |
| `GET /admin/top-subjects?count=` | student-web dead code | admin-web | نفس `TopSubject[]` | 🟠 High (duplication) |
| `GET /admin/reports/summary` | student-web dead code | admin-web | نفس `ReportsSummary` | 🟠 High (duplication) |
| `GET /admin/admins?page=&pageSize=&search=&roleId=&isActive=` | غير مستخدم | admin-web `App.tsx` | admin only | OK |
| `POST /admin/admins` (create) | غير مستخدم | admin-web `App.tsx` body `{ fullName, email, password, phone, roleId, scopeUniversityId, scopeCollegeId, scopeYearId, scopeSubjectId }` | admin only | OK |
| `PUT /admin/admins/:id` | غير مستخدم | admin-web | admin only | OK |
| `POST /admin/admins/:id/status` | غير مستخدم | admin-web body `{ isActive }` | admin only | OK |
| `POST /admin/admins/:id/reset-password` | غير مستخدم | admin-web body `{ newPassword }` | admin only | OK |
| `DELETE /admin/admins/:id` | غير مستخدم | admin-web body `{ currentSuperAdminPassword }` | admin only | OK |
| `GET /admin/roles` | غير مستخدم | admin-web | admin only | OK |
| `POST /admin/roles` | غير مستخدم | admin-web body `{ name, nameAr, description }` | admin only | OK |
| `POST /admin/roles/:id/status` | غير مستخدم | admin-web body `{ isActive }` | admin only | OK |
| `DELETE /admin/roles/:id` | غير مستخدم | admin-web | admin only | OK |
| `GET /admin/roles/:id/permissions` | غير مستخدم | admin-web `PermissionMatrixEditor.tsx` → `Grant[]` | admin only | OK |
| `PUT /admin/roles/:id/permissions` | غير مستخدم | admin-web body `{ permissions: [{ resource, actions, scope }] }` | admin only | OK |
| `GET /admin/students?page=&pageSize=&search=&status=&universityId=` | غير مستخدم | admin-web `StudentsCenter.tsx` → `PagedResult<StudentRecord>` | admin only | OK |
| `PUT /admin/students/:id` | غير مستخدم | admin-web body `{ fullName, gender }` | admin only | OK |
| `POST /admin/students/:id/avatar` (FormData) | غير مستخدم | admin-web → `{ previewUrl }` | admin only | OK |
| `POST /admin/students/:id/revoke-sessions` | غير مستخدم | admin-web | admin only | OK |
| `GET /admin/codes?page=1&pageSize=100` | غير مستخدم | admin-web → `PagedResult<CodeItem>` | admin only | OK |
| `POST /admin/codes/:id/revoke` | غير مستخدم | admin-web body `{ reason }` → `{ revokedSubscriptions }` | admin only | OK |
| `GET /admin/content/files?page=&pageSize=&subjectId=&status=&search=` | غير مستخدم | admin-web `LibraryCenter.tsx` → `PagedResult<AdminLibraryFileListItem>` | admin only | OK |
| `POST /library/upload-url` | غير مستخدم | admin-web body `{ fileName, contentType, fileSize, subjectId, lectureId, type, title, description }` → `{ uploadUrl, fileKey, fileId }` | admin only | OK |
| `POST /library/complete-upload` | غير مستخدم | admin-web body `{ fileId, fileKey, actualFileSize, pagesCount, durationSeconds, youtubeVideoId }` | admin only | OK |
| `POST /library/:id/publish` | غير مستخدم | admin-web | admin only | OK |
| `POST /library/:id/archive` | غير مستخدام | admin-web | admin only | OK |
| `DELETE /library/:id` | غير مستخدم | admin-web | admin only | OK |
| `GET /library/subject/:subjectId?type=&page=&pageSize=` | student-web (`library-api.ts`) | غير مستخدم | student only | OK |
| `GET /library/lectures/:lectureId/text-files?page=&pageSize=` | student-web | غير مستخدم | student only | OK |
| `GET /library/:id` | student-web | غير مستخدم | student only | OK |
| `POST /library/:id/access` | student-web → `FileAccess` (يحوي `watermark`) | غير مستخدم | student only | OK |
| `POST /library/:id/view` | student-web body `{ durationSeconds, pagesViewed, completionPercentage }` | غير مستخدم | student only | OK |
| `POST /favorites` body `{ libraryFileId }` أو `{ questionId }` | student-web | غير مستخدم | student only | OK |
| `DELETE /favorites/files/:fileId` و `/favorites/questions/:questionId` | student-web | غير مستخدم | student only | OK |
| `GET /favorites` | student-web → `FavoriteItem[]` | غير مستخدم | student only | OK |
| `GET /questions?lectureId=` | student-web | غير مستخدم | student only | OK |
| `GET /questions/:id` | student-web | غير مستخدم | student only | OK |
| `POST /questions/:questionId/answer` | student-web body `{ selectedOptionId, answerText, durationSeconds, isOffline }` | غير مستخدم | student only | OK |
| `POST /questions/:questionId/report` | student-web body `{ reasonType, description }` | غير مستخدم | student only | OK |
| `GET /admin/questions?subjectId=&page=&pageSize=&search=&type=&status=` | غير مستخدم | admin-web `QuestionsCenter.tsx` → `PagedResult<QuestionSummary>` | admin only | OK |
| `GET /admin/questions/:id` | غير مستخدم | admin-web → `QuestionDetail` | admin only | OK |
| `POST /questions` (create) | غير مستخدم | admin-web body `{ text, type, subjectId, lectureId, difficulty, tags, options, correctOptionId, correctAnswer, explanation, reference, year }` | **admin-web يستخدم `POST /questions` (طالب endpoint) وليس `POST /admin/questions` لإنشاء الأسئلة** — تحقّق من الصلاحية الخلفية | 🟠 High |
| `PUT /questions/:id` | غير مستخدم | admin-web body (نفس ما سبق) | نفس الملاحظة: استدعاء طالب endpoint من admin | 🟠 High |
| `POST /questions/:id/publish` و `/archive` و `DELETE /questions/:id` | غير مستخدم | admin-web | نفس الملاحظة | 🟠 High |
| `GET /admin/exams?subjectId=&page=&pageSize=&search=&status=` | غير مستخدم | admin-web `ExamsCenter.tsx` | admin only | OK |
| `GET /admin/exams/:id` | غير مستخدم | admin-web → `ExamDetails` | admin only | OK |
| `POST /admin/exams` و `PUT /admin/exams/:id` | غير مستخدم | admin-web | admin only | OK |
| `PUT /admin/exams/:id/questions` body `{ questionIds }` | غير مستخدم | admin-web | admin only | OK |
| `GET /admin/exams/question-candidates?subjectId=&lectureId=&page=&pageSize=&search=` | غير مستخدم | admin-web | admin only | OK |
| `POST /admin/exams/:id/publish` و `/archive` و `DELETE /admin/exams/:id` | غير مستخدم | admin-web | admin only | OK |
| `GET /admin/exams/:id/results?page=&pageSize=` | غير مستخدم | admin-web → `Page<Result>` | admin only | OK |
| `GET /exams/by-subject/:subjectId` | student-web | غير مستخدم | student only | OK |
| `GET /exams/:id` | student-web | غير مستخدم | student only | OK |
| `POST /exams/:examId/start` body `{ mode: 'test', idempotencyKey }` + header `Idempotency-Key` | student-web → `ExamSession` | غير مستخدم | student only | OK |
| `GET /exams/sessions/:sessionId` | student-web | غير مستخدم | student only | OK |
| `PUT /exams/sessions/:sessionId/questions/:questionId/answer` body `{ questionId, answer, currentQuestionOrder, clearAnswer }` | student-web | غير مستخدم | student only | OK |
| `POST /exams/sessions/:sessionId/submit` و `/cancel` | student-web | غير مستخدم | student only | OK |
| `GET /exams/sessions/:sessionId/results` | student-web → `ExamResult` | غير مستخدم | student only | OK |
| `GET /exams/sessions/:sessionId/review` | student-web → `ExamReview` | غير مستخدم | student only | OK |
| `GET /subjects/my-subjects` | student-web `LibraryCatalogPage.tsx` + `ExamsCatalogPage.tsx` | غير مستخدم | **`academic-api.ts` لا يعرّفه، بل يُستدعى inline** | 🟡 Medium |
| `GET /subjects/:slug` | student-web | غير مستخدم | student only | OK |
| `GET /subjects/:subjectId/lectures` | student-web | admin يستخدم `/admin/content/academic/subjects/:id/lectures` | **نفس المصدر، مساران مختلفان** | 🟡 Medium |
| `GET /lectures/:lectureId` | student-web | غير مستخدم | student only | OK |
| `POST /lectures/:lectureId/complete` | student-web | غير مستخدم | student only | OK |
| `POST /lectures` (create) | غير مستخدم | admin-web body `{ subjectId, titleAr, titleEn, slug, lectureNumber, durationMinutes, description, instructorName, sourceReference }` | admin only | OK |
| `POST /lectures/:id/publish` | غير مستخدم | admin-web | admin only | OK |
| `POST /academic/:kind/:id/archive` و `/restore` | غير مستخدم | admin-web | admin only | OK |
| `GET /universities?Page=1&PageSize=100` (PascalCase) | student-web يستخدم `{ page, pageSize }` camelCase | admin-web يستخدم `?Page=1&PageSize=100` PascalCase في 7 مواضع | **لا اتساق داخلي في admin-web** (يخلط بين camelCase و PascalCase). الـ backend case-insensitive لكنه smell | 🟡 Medium |
| `GET /universities/:id/colleges?includeArchived=` | غير مستخدم | admin-web | admin only | OK |
| `GET /admin/content/academic/subjects/:id/lectures?includeArchived=` | غير مستخدم | admin-web | admin only | OK |
| `POST /universities` و `/colleges` و `/years` و `/semesters` و `/subjects` | غير مستخدم | admin-web | admin only | OK |
| `GET /stats/me?period=` و `/stats/leaderboard?scope=&scopeId=&period=&count=` و `/stats/global` | student-web | admin-web `ReportsTabs.tsx` يستدعي `/stats/global` فقط | student owns leaderboard, both share global | OK |
| `GET /admin/analytics/{students,academic,exams,questions,content,codes,operations}` | غير مستخدم | admin-web `ReportsTabs.tsx` → `any` | **كل الاستجابات `any` بدون typing** | 🟡 Medium |
| `GET /admin/revenue?months=` و `/admin/student-growth?days=` | غير مستخدم | admin-web | admin only | OK |
| `GET /admin/settings?category=` و `PUT /admin/settings/:key` و `POST /admin/settings/:key/reset` | غير مستخدم | admin-web `SettingsCenter.tsx` → `SystemSetting[]` | admin only | OK |
| `GET /admin/reports?page=&pageSize=&status=` | غير مستخدم | admin-web `ReportsModeration.tsx` | admin only | OK |
| `POST /admin/reports/:id/status` | غير مستخدم | admin-web | admin only | OK |
| `GET /security/audit-logs?` | غير مستخدم | admin-web | admin only | OK |
| `GET /security/alerts?count=100` | غير مستخدم | admin-web `AuditCenter.tsx` | admin only | OK |
| `GET /security/students/:id/logs?count=50` | غير مستخدم | admin-web | admin only | OK |
| `GET /security/students/:id/sessions` | غير مستخدم | admin-web | admin only | OK |
| `POST /security/students/:id/sessions/:sid/revoke` | غير مستخدم | admin-web | admin only | OK |
| `POST /security/students/:id/unbind-device` | غير مستخدم | admin-web | admin only | OK |
| `POST /security/events` | student-web (`useContentProtection.ts`) | غير مستخدم | student only | OK |
| `POST /search` body params `{ q }` | student-web `SearchPage.tsx` | غير مستخدم | student only | OK |
| `POST /entitlements/issue` | student-web → `{ token }` (JWT موقّع يحوي `expiresAt`) | غير مستخدم | student only | OK |
| `POST /offline/download` و `/offline/sync` و `GET /offline/packages` و `DELETE /offline/packages/:id` | student-web `offline-api.ts` | غير مستخدم | student only | OK |

### 1.3 الحقول المتنافرة (Field Name Mismatches)

| الحقل | student-web يرسل | admin-web يرسل | الخادم يتوقع | الحكم |
|---|---|---|---|---|
| Login identifier | `phone` (طالب) | `email` (مدير) | كل من `LoginRequest.Phone` و `AdminLoginRequest.Email` | OK — منفصلان |
| `installationId` للطالب | داخل الـ body في `register`/`verify-otp`/`resend-otp` + الـ headers في الطلبات الاعتيادية | ثابت `'cms-admin-web-production'` في الـ body فقط | `RegisterRequest.InstallationId` إلزامي | 🔴 admin يشارك نفس `installationId` لكل المدراء → كسر device-binding على الخادم |
| كلمة مرور قديمة | `authApi.changePassword`: `currentPassword` ✅؛ `SettingsPage.tsx` inline: `oldPassword` ❌ | — | `ChangePasswordRequest.CurrentPassword` | 🔴 |
| `deviceFingerprint` (login) | داخل body | غير موجود | `LoginRequest.DeviceFingerprint` إلزامي | OK (student only) |
| `targetType` (notification) | لا يرسل (student) | `'All' / 'University' / 'College' / 'Year' / 'Semester' / 'Subject' / 'Student'` | لم أتحقق من DTO لكن المتوقع enum | OK |
| `contentScope` (code) | لا يرسل | `'questions_exams' / 'lectures_text' / 'video_audio' / 'full_subject' / 'full_year'` | نفس | OK |
| Pagination key | `page`, `pageSize` (camelCase) | `page` و `pageSize` للأغلب + `Page` و `PageSize` لـ `/universities` و `/colleges` و `/years` و `/semesters` و `/subjects` و `/lectures` | متغير (case-insensitive على الخادم) | 🟡 medium — تباين داخلي |

---

## 2. محاذاة أنواع TypeScript (TypeScript Type Alignment)

### 2.1 حزمة `packages/types` المشتركة

`packages/types/src/index.ts` تُصدّر:
- `User { id, phone, fullName, role: 'student' | 'admin' | 'super_admin', avatarUrl?, university?, college? }`
- `Question`, `QuestionOption`, `Subject`, `ApiResponse<T>`, `ApiError`

كلا التطبيقين يضبط alias `@cms/types` في `vite.config.ts` إلى نفس المصدر. لكن:

| التطبيق | يستورد `@cms/types`؟ |
|---|---|
| student-web | ✅ في ملف واحد فقط: `apps/student-web/src/features/auth/services/auth-api.ts` (يستورد `User`) |
| admin-web | ❌ إطلاقاً. كل الأنواع محلية في `apps/admin-web/src/lib/api.ts` |

### 2.2 مقارنة الأنواع الرئيسية حقل بحقل

#### `User` (student) مقابل `AdminUser` (admin)

| الحقل | `packages/types` User | `student-web/auth-context.ts` User (محلي مكرر) | `admin-web/lib/api.ts` AdminUser | `apps/api UserDto` |
|---|---|---|---|---|
| `id` | string | string | string | Guid |
| `phone` | ✅ | ✅ | ❌ غير موجود | ✅ |
| `email` | ❌ | ❌ | ✅ | ❌ غير موجود في UserDto |
| `fullName` | ✅ | ✅ | ✅ | ✅ |
| `role` | `'student' \| 'admin' \| 'super_admin'` | نفس | `string` (غير مقيد) | `string` |
| `avatarUrl` | `string \| null` | `string \| null \| undefined` | `string \| null \| undefined` | `string?` |
| `university` | `{ id, nameAr }?` | `{ id, nameAr }?` | ❌ | `UniversityDto?` |
| `college` | `{ id, nameAr }?` | `{ id, nameAr }?` | ❌ | `CollegeDto?` |

**النتيجة:**
- 🔴 **`User` معرّف مرتين في student-web نفسه**: مرة في `packages/types/src/index.ts` ومرة محلياً في `apps/student-web/src/app/providers/auth-context.ts`. نفس الشكل اليوم، لكنهما عرضة للانحراف المستقبلي. الـ `AuthProvider` يستورد من `./auth-context` وليس من `@cms/types`.
- 🔴 **`AdminUser` يتوقع `email` لكن `UserDto` الخلفي لا يحويه**. هذا يعني أن login المدير سيستقبل `user.email === undefined`، فيُعرض المدير في الشريط الجانبي بدون بريد إلكتروني، وكل المنطق الذي يعتمد على `user.email` (مثل تعديل المدير) سيفشل بصمت.
- 🟠 **`AdminUser.role` هو `string` هشّ**، بينما `User.role` union مقيد، رغم أن admin-web يتحقق من `user.role === 'super_admin'`.

#### `Question` (shared) مقابل `ExamQuestion` (student-web)

| الحقل | `packages/types Question` | `student-web exam-api.ts ExamQuestion` |
|---|---|---|
| `id` | string | string |
| `text` | string | string |
| `type` | `'mcq' \| 'true_false' \| 'multiple_select'` (snake_case) | `'Mcq' \| 'TrueFalse' \| 'MultipleSelect' \| string` (PascalCase) |
| `difficulty` | `'easy' \| 'medium' \| 'hard'` | غير موجود |
| `options` | `QuestionOption[]` (بـ `isCorrect`) | `ExamOption[]` (بـ `letter, text, textHtml, imageUrl`) — شكل مختلف |
| `correctAnswer`, `explanation`, `isFavorite` | موجود | غير موجود |

**النتيجة:** 🟠 الأنواع ليست موحّدة عبر السياقات (question standalone vs exam question). الأسماء متناقضة (`mcq` vs `Mcq`).

#### `Notification` (student-web محلي)

`apps/student-web/src/features/notifications/services/notification-api.ts`:
```ts
interface Notification {
  id: string; type: string; title: string; body: string;
  icon?: string; actionUrl?: string; actionLabel?: string;
  createdAt: string; isRead: boolean;
}
```
`apps/admin-web/src/components/NotificationCompose.tsx`:
- لا يرسل `actionUrl` ولا `actionLabel` ولا `icon`.
- النوع المتوقع للاستجابة: `{ notificationId, recipientsCount, isScheduled }`.
- **النتيجة:** 🟠 student-web يستهلك حقولاً لا يرسلها admin-web إطلاقاً. إن كان الخادم لا يضيفها افتراضياً، فإن `notif.actionUrl` سيكون `undefined` دائماً و زر `actionLabel` لن يظهر أبداً.

#### `DashboardStats` (مكرر في كلا التطبيقين)

`apps/student-web/src/features/admin/services/admin-api.ts` و `apps/admin-web/src/App.tsx:69-80` يعرفان نفس الشكل:
```ts
{ totalStudents, activeStudentsToday, totalQuestions, totalActiveCodes,
  totalActiveSubscriptions, totalLibraryFiles, totalExams, pendingReports,
  monthlyRevenue, revenueChangePercent }
```
🟠 **نسخة طبق الأصل من النوع في كلا التطبيقين** دون استيراد من `@cms/types`. عرضة للانحراف.

#### `PagedResult<T>`

| المصدر | التعريف |
|---|---|
| `packages/types ApiResponse<T>` | `{ data: T, meta?: { page, pageSize, total, totalPages, hasNext, hasPrev } }` |
| `student-web library-api.ts PagedLibraryFiles` | `{ items: T[], total, page, pageSize, totalPages }` |
| `student-web academic-api.ts AcademicPage<T>` | `{ items: T[] }` فقط (لا paging meta) |
| `admin-web lib/api.ts PagedResult<T>` | `{ items: T[], total, page, pageSize, totalPages }` |

🟡 **لا يوجد نوع paged موحّد.** `ApiResponse<T>` من `packages/types` غير مستخدم إطلاقاً. كلا التطبيقين يستخدمان شكلاً مختلفاً (`items` مسطّحة بدون wrapper) عن `ApiResponse` المعرّف.

### 2.3 ملخص تكرار الأنواع (Type Duplication)

| النوع | موقع التعريف | هل يُستخدم من `@cms/types`؟ |
|---|---|---|
| `User` | `packages/types` + `student-web/auth-context.ts` | ❌ مكرر |
| `Question` | `packages/types` + `student-web/exam-api.ts` و `question-api.ts` (محلياً) | ❌ مكرر |
| `Subject` | `packages/types` + `student-web/academic-api.ts` (`SubjectSummary`, `SubjectDetail`) | ❌ مكرر |
| `DashboardStats`, `RecentActivity`, `RevenueData`, `StudentGrowth`, `TopSubject`, `ReportsSummary` | `student-web/admin-api.ts` + `admin-web/App.tsx` و `ReportsTabs.tsx` | ❌ مكرر |
| `AdminUser`, `AdminRecord`, `RoleRecord`, `PagedResult` | `admin-web/lib/api.ts` فقط | ❌ غير مشارك |
| `Notification` | `student-web/notification-api.ts` فقط | ❌ غير مشارك |
| `ExamSession`, `ExamResult`, `ExamReview` | `student-web/exam-api.ts` فقط | ❌ غير مشارك |
| `LibraryFile`, `FileAccess` | `student-web/library-api.ts` فقط + `AdminLibraryFileListItem` و `LibraryFileDetail` و `UploadUrlResponse` في `admin-web/lib/api.ts` | ❌ مكرر بأسماء مختلفة |

🔴 **الحكم العام:** لا توجد أي أنواع مشتركة فعلية بين التطبيقين باستثناء استيراد معزول لـ `User` من `@cms/types` في `student-web/auth-api.ts`. الأنواع مكررة يدوياً في كل تطبيق → خطورة عالية على المدى الطويل.

---

## 3. تحليل المصادقة (Auth Analysis)

### 3.1 جدول مقارنة Auth

| الجانب | student-web | admin-web |
|---|---|---|
| **مكتبة HTTP** | `axios` عبر `apps/student-web/src/services/api-client.ts` | `fetch` أصلي عبر `apps/admin-web/src/lib/api.ts:apiRequest()` |
| **مسار login** | `POST /api/v1/auth/login` (مع `/api/v1` من `baseURL`) | `POST ${API_BASE_URL}/api/v1/auth/admin/login` (مع `/api/v1` في path صريحاً) |
| **Payload login** | `{ phone, password, deviceFingerprint, deviceName }` | `{ email, password, twoFactorCode: null, installationId: 'cms-admin-web-production' }` |
| **Response login** | `AuthResponse = { accessToken, refreshToken, tokenType, expiresIn, user }` | يُعلن `{ accessToken, user }` فقط — **`refreshToken` مُسقَط رغم إرساله من الخادم** 🔴 |
| **تخزين token** | `sessionStorage.cms-access-token`, `sessionStorage.cms-refresh-token`, `sessionStorage.cms-signed-entitlement` | `sessionStorage.cms-admin-token`, `sessionStorage.cms-admin-user` |
| **تخزين user** | في React state داخل `AuthProvider` فقط (لا يُخزَّن كـ JSON) | `sessionStorage.cms-admin-user` (JSON serialized) — **يُستعاد عند F5** |
| **Refresh flow** | `apiClient.interceptors.response.use` — عند 401 يستدعي `POST /auth/refresh` بـ `{ refreshToken }` ويُحدّث الـ token، ثم يُعيد المحاولة. استخدام `refreshInFlight` لتفادي السباق | **لا يوجد.** عند 401: كل مكوّن يستدعي `signOut()` بصمت (مثلاً `App.tsx:222` و `StudentsCenter.tsx:184`) |
| **`installationId`** | `getOrCreateInstallationId()` من `@/utils` — UUID ثابت لكل متصفح، يُولّد مرة ويُخزَّن في `localStorage` | ثابت حرفياً `'cms-admin-web-production'` لكل المدراء على كل المتصفحات 🔴 |
| **`X-Installation-Id` header** | يُحقن لكل طلب عبر interceptor | غير موجود |
| **`X-Device-Fingerprint` header** | يُحقن لكل طلب (للتوافق مع الـ backend أثناء الانتقال) | غير موجود |
| **Headers افتراضية** | `Content-Type: application/json`, `Accept-Language: ar` | `Content-Type: application/json` فقط لغير FormData |
| **logout** | `POST /auth/logout` (يُبطل الجلسة على الخادم) ثم تنظيف محلي | تنظيف محلي فقط (`sessionStorage.removeItem` + `setUser(null)`)، **لا استدعاء خادم إطلاقاً** 🟠 |
| **إدارة 401/403** | 401 → refresh أو إعادة توجيه إلى `/login`؛ 403 → خطأ API يُمرَّر للمكوّن | 401 → `signOut()` محلي؛ 403 → رسالة "لا تملك صلاحية" داخل المكوّن (`StudentsCenter:184`) |
| **انتهاء الجلسة (expiry)** | implicit: refresh عند 401 | غير موجود: بعد 15 دقيقة (`JWT_ACCESS_TOKEN_EXPIRY_MINUTES=15`) يبدأ كل طلب بالفشل |
| **OTP / 2FA** | `POST /auth/verify-otp` بعد التسجيل، gated بـ `VITE_OTP_ENABLED` | `twoFactorCode: null` دائماً في الإرسال؛ لا توجد شاشة 2FA رغم وجود `/api/v1/auth/admin/2fa/enable` على الخادم |
| **JWT roles/claims** | الـ role يأتي من `user.role` (string من JWT) | نفس JWT، نفس `sub`, `role` claim |
| **Route guards** | `ProtectedRoute` (يتحقق من `isAuthenticated`) يحمي كل المسارات المحمية في `router.tsx`. `PermissionRoute` و `AdminRoute` موجودان لكن غير مستخدمين في الـ router | `if (!user) return <LoginPage />` في `App.tsx`. لا يوجد router أصلاً. `isSuperAdmin` يخفي عناصر الـ nav فقط (لا حماية فعلية للوحة) |
| **Session storage provider** | React Context (`AuthProvider` + `useAuth` hook) | `useState` محلي داخل `App.tsx`، يمرّر `token` يدوياً لكل مكوّن |

### 3.2 مشاكل حرجة في Auth

1. 🔴 **admin-web لا يلتقط `refreshToken`** رغم أن `AuthResponse` الخلفي يعيده (سطر `apps/admin-web/src/lib/api.ts:87-95`). النتيجة: بعد 15 دقيقة من النشاط يبدأ كل طلب بالفشل بـ 401، ويُستدعى `signOut()` بصمت → المدير يطرد من اللوحة دون توضيح.
2. 🔴 **`installationId: 'cms-admin-web-production'` ثابت**: يُرسَل نفس المعرّف لكل المدير في كل متصفح. إن كان الـ backend يفرض "single active installation per admin" (كما يفعل للطالب عبر `device_binding`)، فإن تسجيل دخول مدير ثانٍ سيُسقط جلسة الأول. حتى لو لم يفرضها، فهذا يكسر سلسلة التدقيق الأمني (audit trail) لأن كل عمليات المدراء تُسجَّل تحت نفس `installationId`.
3. 🔴 **`AdminUser.email` غير متوفر**: كما في القسم 2.2، `UserDto` الخلفي لا يحوي `email`. كل المنطق الذي يعرض البريد أو يحقق uniqueness سيخفق بصمت.
4. 🟠 **admin logout لا يُبطل الجلسة على الخادم**: مجرد `sessionStorage.removeItem`. الـ refresh token (لو كان موجوداً) يبقى صالحاً على الخادم حتى انتهائه.
5. 🟠 **`/auth/admin/me/permissions` غير مستخدم في admin-web** رغم وجوده على الخادم (`AdminAuthController.cs:40-50`). كل قرارات العرض تعتمد على `user.role === 'super_admin'` فقط. أي مدير بدور مخصص (custom role) لن يرى لوحاته بصورة صحيحة.
6. 🟡 **`PermissionProvider` في student-web غير مُركَّب** في `App.tsx`. لو حاول أي مسار استخدام `<PermissionRoute>` سيتلقى `usePermission must be used within a PermissionProvider`. لكن `router.tsx` لا يستخدمه إطلاقاً → الكود ميّت.
7. 🟡 **`AdminRoute` و `PermissionRoute`** في `apps/student-web/src/components/common/PermissionRoute.tsx` ميّتة لأن `router.tsx` لا يحمي أي مسار بها.
8. 🟡 **`Accept-Language` غير مضبوط في admin-web**: النصوص العربية تُعرض لكن رسائل الأخطاء القادمة من الـ backend قد تأتي بالإنجليزية إذا كان الـ backend يعتمد على الـ header.

---

## 4. تكافؤ نظام التصميم (Design System Parity)

### 4.1 مقارنة CSS Variables (`globals.css`)

`apps/student-web/src/styles/globals.css` (418 سطر) و `apps/admin-web/src/styles/globals.css` (868 سطر — يحوي الـ shell + components).

| الفئة | student-web | admin-web | الحكم |
|---|---|---|---|
| `@import IBM Plex Sans Arabic + DM Mono` من Google Fonts | ✅ | ✅ | متطابق |
| `@import "tailwindcss"` | ✅ | ✅ | متطابق |
| `--cms-ink-*` (5 درجات navy) | ✅ | ✅ | متطابق (نفس hex) |
| `--cms-ivory-*` (4 درجات) | ✅ | ✅ | متطابق |
| `--cms-teal-*` (6 درجات) | ✅ | ✅ | متطابق |
| `--cms-success/warning/danger/info` و `-50` | ✅ | ✅ | متطابق |
| `--cms-line`, `--cms-line-strong`, `--cms-text*`, `--cms-surface*` | ✅ | ✅ | متطابق |
| `--cms-space-0..16` (4px base) | ✅ | ✅ | متطابق |
| `--cms-radius-sm/md/lg/xl/full` | ✅ | ✅ | متطابق |
| `--cms-shadow-xs/sm/md/lg/xl/focus` | ✅ | ✅ | متطابق |
| `--cms-z-*` | ✅ | ✅ | متطابق |
| `--cms-text-2xs..3xl` | ✅ | ✅ | متطابق |
| `--cms-duration-fast/normal/slow` + `--cms-ease*` | ✅ | ✅ | متطابق |
| `--cms-font-sans`, `--cms-font-mono` | ✅ | ✅ | متطابق |
| `--cms-sidebar-w` | `280px` | `260px` 🟡 | اختلاف بصري |
| `--cms-sidebar-collapsed-w` | غير موجود | `64px` | student-web لا يدعم الطيّ |
| `--cms-topbar-h` | `4rem` (64px) | `60px` 🟡 | اختلاف طفيف |
| `--cms-content-max` | `1280px` | `1440px` 🟡 | اختلاف عرض المحتوى |
| `--cms-breakpoint-sm/md/lg/xl` | غير موجود | ✅ | student-web يفتقدها |
| `--cms-leading-tight/normal/relaxed` | غير موجود | ✅ | student-web يفتقدها |
| `--cms-focus-ring` | غير موجود | ✅ | student-web يعتمد على `*:focus-visible` |
| `--cms-disabled-opacity`, `--cms-disabled-cursor` | غير موجود | ✅ | student-web يفتقدها |
| Dark mode `[data-theme="dark"]` | ✅ (نفس palette) | ✅ (نفس palette + متغيرات إضافية) | متطابق |
| Compat aliases (`--c-*` للحقن القديم) | ✅ (شامل: --c-primary-*, --c-grad-*, --shadow-*, --r-*) | ✅ (مختصر: --c-bg, --c-surface, --c-text, --c-primary-700/500, --c-grad-primary, --shadow-sm/md/lg, --radius-sm/md/lg) | student-web يحوي طبقة compat أوسع بكثير لأنه يحتفظ بكود قديم يستخدم `--c-*` |
| `--grad-*` (نفس القيم flat بدون gradient) | ✅ (10 متغيرات: --grad-primary=teal-700, --grad-dawn=ink-900, إلخ) | ❌ غير موجود — admin-web يستخدم `--c-grad-primary: linear-gradient(...)` | 🟡 student-web يحوّل كل gradients إلى flat، admin-web يبقي gradient في `--c-grad-primary` |
| `--cms-text-2xs` للـ badge font | ✅ | ✅ | متطابق |
| ECG body overlay | ❌ مُزال صراحةً (سطر 417) | غير موجود | متطابق (لا overlay) |

### 4.2 مكوّنات `packages/ui`

`packages/ui/src/index.ts` يُصدّر: `cn`, `Box`, `Stack`, `Text`, `Container`, `Grid`, `Button`, `Input`, `Card`, `Badge`, `Spinner`, `Skeleton`.

| التطبيق | يستخدم `@cms/ui`؟ | أين؟ |
|---|---|---|
| student-web | ❌ في الكود الإنتاجي | فقط في `apps/student-web/src/test/component.test.tsx` (اختبار استيراد) |
| admin-web | ❌ إطلاقاً | — |

🟠 **الحكم:** الحزمة موجودة لكنها غير مستهلكة. كل تطبيق يبني مكوّناته بنفسه (مثلاً `apps/student-web/src/components/ui/Skeleton.tsx` و `LoadingScreen.tsx` بدلاً من استيراد `Skeleton` من `@cms/ui`). هذا يُفقد فائدة الـ monorepo. إما أن تُدمج المكوّنات أو تُحذف الحزمة.

### 4.3 الخطوط

| الخط | student-web | admin-web |
|---|---|---|
| النص العربي | `IBM Plex Sans Arabic` | `IBM Plex Sans Arabic` |
| Mono | `DM Mono` | `DM Mono` |
| طريقة التحميل | `@import url('https://fonts.googleapis.com/css2?...')` في أعلى `globals.css` | نفس |

✅ متطابق. كلاهما يعتمد على شبكة Google Fonts CDN (لا self-hosting).

---

## 5. المسارات والروابط العميقة (Routing & Deep Links)

### 5.1 مسارات student-web (مستخرجة من `apps/student-web/src/app/router.tsx`)

| المسار | المكون | حماية |
|---|---|---|
| `/login` | `LoginPage` | عام |
| `/register` | `RegisterPage` | عام |
| `/verify-otp` | `VerifyOtpPage` | عام، gated بـ `VITE_OTP_ENABLED === 'true'` |
| `/forgot-password` | `ForgotPasswordPage` | عام |
| `/reset-password` | `ResetPasswordPage` | عام |
| `/terms` | `TermsPage` | عام |
| `/privacy` | `PrivacyPage` | عام |
| `/dashboard` | `DashboardPage` | محمي |
| `/subjects` | `SubjectsPage` | محمي |
| `/subjects/:subjectSlug` | `SubjectDetailPage` | محمي |
| `/subjects/:subjectSlug/lectures/:lectureId` | `LecturePage` | محمي |
| `/subjects/:subjectSlug/lectures/:lectureId/questions` | `QuestionPage` | محمي |
| `/subjects/:subjectSlug/questions/:questionId` | `QuestionPage` | محمي |
| `/favorites` | `FavoritesPage` | محمي |
| `/exams` | `ExamsCatalogPage` | محمي |
| `/exams/:examId` | `ExamPage` | محمي |
| `/exams/:sessionId/review` | `ExamReviewPage` | محمي |
| `/library` | `LibraryCatalogPage` | محمي |
| `/subjects/:subjectSlug/library` | `LibraryPage` | محمي |
| `/search` | `SearchPage` | محمي |
| `/profile` | `ProfilePage` | محمي |
| `/notifications` | `NotificationsPage` | محمي |
| `/stats` | `StatsPage` | محمي |
| `/leaderboard` | `LeaderboardPage` | محمي |
| `/activate-code` | `ActivateCodePage` | محمي |
| `/settings` | `SettingsPage` | محمي |
| `/` | `<Navigate to="/dashboard">` | — |
| `*` | `NotFoundPage` | عام |

### 5.2 مسارات admin-web

🟠 **admin-web لا يستخدم `react-router-dom` إطلاقاً.** كل التنقل داخلي عبر `useState<View>` في `App.tsx:97`. القيم الممكنة:

`'overview' | 'admins' | 'roles' | 'audit' | 'academic' | 'codes' | 'students' | 'questions' | 'exams' | 'library' | 'reports' | 'settings'`

النتائج:
- لا يوجد URL يتغير عند الانتقال بين اللوحات.
- لا يمكن deep-linking إلى لوحة محددة (مثلاً مشاركة `https://admin.example.com/#/students` مستحيل).
- عمل `F5` بعد التنقل يعيد المستخدم إلى `overview` (أو إلى `admins` لو كان super_admin، سطر `App.tsx:248`).
- لا يمكن للمتصفح حفظ سجل التنقل (history back/forward معطّل).

### 5.3 الروابط المتقاطعة بين التطبيقين (Cross-App Links)

| المصدر | الهدف | الآلية | الحكم |
|---|---|---|---|
| admin-web `NotificationCompose.tsx` | student-web عبر `notification.actionUrl` | admin يرسل الإشعار → student يقرأه في `NotificationsPage.tsx:60-62` ويستدعي `window.location.href = notif.actionUrl` | 🟠 **مفتوح لإعادة التوجيه (open redirect)**: admin يمكنه إرسال `actionUrl='https://evil.com'`، student سيُنقَل إليه. **لكن:** admin-web `NotificationCompose` لا يُرسل `actionUrl` أصلاً، فالقناة معطّلة حالياً. لو أضيف لاحقاً يجب تقييده بقائمة مسارات داخلية. |
| student-web `NotificationsPage.tsx:70` | رابط إلى `/dashboard` | `Link to="/dashboard"` داخلي | OK |
| student-web `ActivateCodePage.tsx:117` | رابط إلى `/dashboard` | `Link to="/dashboard"` داخلي | OK |
| admin-web `App.tsx:153` | `fetch(${API_BASE_URL}/health)` | استدعاء مباشر بدون `/api/v1` | 🟡 لا شيء يحمي من فشل CORS على health endpoint |
| admin-web `App.tsx:248` | توجيه المدير بعد الدخول إلى `view=admins` (super) أو `view=overview` | `setView(...)` داخلي، لا URL | OK كمنطق |
| admin-web `App.tsx:627` | `onNavigate={setView}` من `Overview` | تغيير state داخلي | OK |

### 5.4 توحيد مسارات الـ Auth و 404

| المسار | student-web | admin-web |
|---|---|---|
| `/login` | ✅ صفحة مستقلة (`/login`) | ❌ لا router. login هو `if (!user) return <LoginPage />` في `App.tsx:415` |
| `/404` | ✅ `<Route path="*" element={<NotFoundPage />}>` | ❌ لا توجد صفحة 404. URLs غير صالحة لا معنى لها (لا router) |
| `/register` | ✅ | ❌ لا يمكن للمدير التسجيل الذاتي |
| `/forgot-password` | ✅ | ❌ لا توجد صفحة استعادة كلمة مرور للمدير |
| `/reset-password` | ✅ | ❌ لا توجد |

🟠 admin-web يفترض أن المدير يحصل على كلمة المرور الأولية من super_admin (انظر `App.tsx:304` إنشاء مدير بكلمة مرور). لا توجد آلية self-service لاستعادة كلمة المرور المدير.

---

## 6. توافق متغيرات البيئة (Env Compatibility)

### 6.1 المتغيرات المُعلنة في `vite-env.d.ts`

| التطبيق | `ImportMetaEnv` معرّف؟ |
|---|---|
| student-web | ✅ `apps/student-web/src/vite-env.d.ts` يُعلن: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_APP_VERSION` |
| admin-web | ❌ يحوي `/// <reference types="vite/client" />` فقط — لا `ImportMetaEnv` معرّف |

🟡 admin-web يستخدم `import.meta.env.VITE_API_BASE_URL` (في `lib/api.ts:2`) و `VITE_DEV_API_PROXY_TARGET` (في `vite.config.ts:23`) دون تعريف الأنواع → لا TypeScript autocomplete ولا فحص.

### 6.2 المتغيرات المستخدمة فعلياً في الكود

| المتغير | student-web | admin-web | موجود في `.env.example`؟ |
|---|---|---|---|
| `VITE_API_URL` | ✅ (`api-client.ts:4`) | ❌ | ✅ (سطر `VITE_API_URL=http://localhost:8080/api/v1`) |
| `VITE_API_BASE_URL` | ❌ | ✅ (`lib/api.ts:2`) | ❌ غير موثّق |
| `VITE_APP_ENV` | ✅ معرّف لكن غير مستخدم فعلياً | ❌ | ✅ |
| `VITE_APP_VERSION` | ✅ معرّف لكن غير مستخدم فعلياً | ❌ | ✅ |
| `VITE_OTP_ENABLED` | ✅ (`router.tsx:36`, `ForgotPasswordPage.tsx:13`) | ❌ | ❌ غير موثّق |
| `VITE_OFFLINE_ENABLED` | ✅ (`useOffline.ts:15`) | ❌ | ❌ غير موثّق |
| `VITE_DEV_API_PROXY_TARGET` | ✅ (في `vite.config.ts:53`) | ✅ (في `vite.config.ts:23`) | ❌ غير موثّق |

### 6.3 القيم الافتراضية عند غياب المتغير

| المتغير | student-web default | admin-web default | الخطر |
|---|---|---|---|
| `VITE_API_URL` | `'/api/v1'` (نسبي — يعتمد على dev proxy أو production nginx) | — | OK في التطوير (proxy يعمل)، OK في الإنتاج (nginx يربط `/api` بالـ backend) |
| `VITE_API_BASE_URL` | — | `'https://cms-api-preview.onrender.com'` 🔴 | **لو نسي المنشئ ضبط `VITE_API_BASE_URL` في الإنتاج، فإن admin-web سيتصل بـ production backend تلقائياً. كارثة لو طُوِّر من بيئة staging** |
| `VITE_OTP_ENABLED` | `undefined` → يُعامَل كـ `false` (طريق verify-otp يُخفى) | — | OK، لكن غير موثّق |
| `VITE_OFFLINE_ENABLED` | `undefined` → يُعامَل كـ `false` (offline مُعطّل) | — | OK، لكن غير موثّق |

### 6.4 توصيات الـ Env

1. 🔴 إضافة `VITE_API_BASE_URL=` إلى `.env.example` مع تحذير من تركه فارغاً في الإنتاج.
2. 🟠 إضافة `ImportMetaEnv` معرّف في `apps/admin-web/src/vite-env.d.ts` يشمل `VITE_API_BASE_URL` و `VITE_DEV_API_PROXY_TARGET`.
3. 🟡 توثيق `VITE_OTP_ENABLED` و `VITE_OFFLINE_ENABLED` في `.env.example` مع القيم الافتراضية.
4. 🟡 توحيد اسم المتغير: `VITE_API_URL` (student) مقابل `VITE_API_BASE_URL` (admin). لو اعتُمد `VITE_API_URL` في كليهما مع `baseURL` يخلو من `/api/v1` و admin يضيفها في path، يصبح التطبيقان متّسقين.

### 6.5 Dev Server Proxy

كلا التطبيقين يستخدم proxy متطابقاً:

```ts
proxy: { '/api': { target: env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:8080', changeOrigin: true } }
```

- student-web على المنفذ `5173`.
- admin-web على المنفذ `5174`.

✅ متطابق. `.env.example` يصرّح `CORS_STUDENT_APP=http://localhost:5173` و `CORS_ADMIN_APP=http://localhost:5174` للخادم.

---

## 7. تتبّع التدفقات الحرجة (Critical Flow Cross-Reference)

### S1: إنشاء كود تفعيل (Admin) ← تفعيله (Student)

**admin-web (`CodesCenter.tsx`):**
1. المدير يختار التسلسل الأكاديمي: `universityId → collegeId → yearId → semesterId → subjectId` (أو يتوقف عند `yearId` لكود `full_year`).
2. يملأ النموذج: `contentScope`, `isPublic`, `quantity`, `durationDays`, `prefix`, `codeExpiresAt`.
3. `POST /api/v1/admin/codes/generate` body:
   ```json
   {
     "scopeType": "subject" | "year",
     "scopeId": "<uuid>",
     "durationDays": <number>,
     "quantity": <number>,
     "prefix": "<string|null>",
     "codeExpiresAt": "<iso|null>",
     "contentScope": "questions_exams" | "lectures_text" | "video_audio" | "full_subject" | "full_year",
     "isPublic": <bool>
   }
   ```
   الاستجابة: `{ codes: string[] }`.
4. عرض الكود في ledger. يمكن `POST /api/v1/admin/codes/:id/revoke` بـ `{ reason }`.

**student-web (`ActivateCodePage.tsx`):**
1. الطالب يُدخل الكود بصيغة `XXXX-XXXX-XXXX-XXXX` (16 حرف/رقم).
2. `POST /api/v1/subscriptions/redeem` body:
   ```json
   { "code": "XXXX-XXXX-XXXX-XXXX" }
   ```
   الاستجابة: غير معرّفة في الكود (`res.data` يُعامَل كـ `any`).
3. على النجاح: `toast.success` + `invalidateQueries(['subscriptions'])` + `invalidateQueries(['stats'])` + `navigate('/dashboard')`.

**التقييم:**
- ✅ المساران متوافقان على مستوى الـ backend (`SubscriptionsController.cs` و `AdminStudentsController` / `AdminCodesController`).
- 🟡 student-web لا يتحقق من `contentScope` للكود ولا يطابق صلاحية الكود مع استحقاقات الطالب (مثلاً كود `lectures_text` لطالب ليست له مادة). يكتفي بالـ redeem.
- 🟡 صيغة الكود `XXXX-XXXX-XXXX-XXXX` (16 حرفاً) — لا يوجد تحقق من طول الإدخال قبل الإرسال إلا عبر `code.length < 16` (سطر `ActivateCodePage.tsx:55`). الأحرف المسموحة `[A-Z0-9]` فقط.
- 🟡 `dashboardPage` بعد التفعيل يستدعي `invalidateQueries(['subscriptions'])` لكن لا توجد query key باسم `'subscriptions'` مُسجّلة في `profile-api.ts` أو غيره — قد تكون `queryKey` ميّتة.
- ✅ العقد متوافق. لا critical.

### S2: رفع ملف مكتبة (Admin) ← عرضه (Student)

**admin-web (`LibraryCenter.tsx:289-350`):**
1. اختيار التسلسل الأكاديمي ثم `subjectId` + اختيار `lectureId` (اختياري).
2. اختيار ملف محلي (`File`).
3. `POST /api/v1/library/upload-url` body:
   ```json
   {
     "fileName": "<string>",
     "contentType": "<mime>",
     "fileSize": <number>,
     "subjectId": "<uuid>",
     "lectureId": "<uuid|null>",
     "type": "Pdf" | "Html" | "Image" | "Video" | "Audio" | "Summary" | "Comprehensive" | "Paragraph",
     "title": "<string>",
     "description": "<string|null>"
   }
   ```
   الاستجابة: `{ uploadUrl, fileKey, fileId }`.
4. PUT مباشر إلى `uploadUrl` (presigned) عبر `XMLHttpRequest` مع تتبّع `upload.progress`.
5. `POST /api/v1/library/complete-upload` body:
   ```json
   {
     "fileId": "<uuid>",
     "fileKey": "<string>",
     "actualFileSize": <number>,
     "pagesCount": null,
     "durationSeconds": null,
     "youtubeVideoId": null
   }
   ```
6. admin يمكن لاحقاً: `POST /library/:id/publish` أو `POST /library/:id/archive` أو `DELETE /library/:id`.

**student-web (`library-api.ts`):**
1. `GET /api/v1/library/subject/:subjectId?type=&page=&pageSize=` → `PagedLibraryFiles`.
2. `GET /api/v1/library/lectures/:lectureId/text-files?page=&pageSize=` → `PagedLibraryFiles`.
3. `GET /api/v1/library/:id` → تفاصيل الملف.
4. `POST /api/v1/library/:id/access` (مع header `X-Entitlement`) → `FileAccess { accessUrl, expiresAt, watermark: { studentName, studentPhone, timestamp, siteName } }`.
5. `POST /api/v1/library/:id/view` body `{ durationSeconds, pagesViewed, completionPercentage }`.
6. المفضلة: `POST /api/v1/favorites` body `{ libraryFileId }` أو `DELETE /api/v1/favorites/files/:fileId`.

**التقييم:**
- ✅ العقد متوافق تماماً. admin ينشئ، student يستهلك.
- 🟡 نوع `LibraryFile` في student-web يحوي `isFavorite: boolean` لكن `AdminLibraryFileListItem` و `LibraryFileDetail` (admin) لا يحويان `isFavorite` (لا معنى له جانب admin).
- 🟡 student-web `LibraryCatalogPage.tsx:28` يستدعي `/subjects/my-subjects` — هذا المسار غير معرّف في `academic-api.ts` (يستدعيه inline). لو لم يكن موجوداً على الخادم، فإن `Promise.all` يقذف خطأ لكل مادة (silent catch). يحتاج التحقق من الخادم.
- ✅ التدفق سليم. لا critical.

### S3: إنشاء اختبار (Admin) ← أداؤه (Student) ← رؤية النتائج (Admin)

**admin-web (`ExamsCenter.tsx:304-373`):**
1. `POST /api/v1/admin/exams` أو `PUT /api/v1/admin/exams/:id` body `{ subjectId, lectureId, titleAr, slug, titleEn, description, availableFrom, availableUntil, maxAttempts, year, durationMinutes, passingScore, sortOrder, ... }`.
2. `PUT /api/v1/admin/exams/:id/questions` body `{ questionIds: string[] }`.
3. `POST /api/v1/admin/exams/:id/publish` (أو `/archive` أو `DELETE`).
4. `GET /api/v1/admin/exams/:id/results?page=&pageSize=` → `Page<Result>`.

**student-web (`exam-api.ts`):**
1. `GET /api/v1/exams/by-subject/:subjectId` → قائمة الاختبارات المتاحة للطالب.
2. `POST /api/v1/exams/:examId/start` body `{ mode: 'test', idempotencyKey: <uuid> }` + header `Idempotency-Key: <uuid>` → `ExamSession`.
3. `GET /api/v1/exams/sessions/:sessionId` → حالة الجلسة.
4. `PUT /api/v1/exams/sessions/:sessionId/questions/:questionId/answer` body `{ questionId, answer, currentQuestionOrder, clearAnswer }`.
5. `POST /api/v1/exams/sessions/:sessionId/submit` → `ExamResult`.
6. `GET /api/v1/exams/sessions/:sessionId/results` → `ExamResult`.
7. `GET /api/v1/exams/sessions/:sessionId/review` → `ExamReview`.

**`ExamResult` (student):**
```ts
{ sessionId, status, isResultVisible, score?, passed?,
  totalQuestions, answeredQuestions, correctAnswers,
  unansweredQuestions, durationSeconds, canReview,
  weakestTopics: { tag, accuracy }[],
  comparison?: { yourScore, averageScore, topScore } | null }
```

**التقييم:**
- ✅ العقد متوافق.
- 🟡 `admin-web` `Page<Result>` غير معرّف صراحة في `lib/api.ts` — يُستخدم inline كـ `any` تقريباً (لم أجد تعريف `Result` type في admin-web). كل الـ analytics في `ReportsTabs.tsx` تستخدم `any` (مثلاً `apiRequest<any>(`/api/v1/admin/analytics/exams?...`)`). ضعف typing.
- ✅ التدفق سليم. لا critical.
- 🟡 `exam-api.ts` لا يتحقق من `status: 'Published'` قبل عرض زر "ابدأ الاختبار" — يعتمد على الـ backend لرفض الجلسة. مقبول.
- 🟡 `Idempotency-Key` يُرسل مرتين: في الـ body (`idempotencyKey`) و في الـ header. لو اختلفا سيُربك الـ backend. الكود الحالي يستخدم نفس `key` لكليهما (سطر `exam-api.ts:63-67`) ✅.

### S4: إرسال إشعار (Admin) ← استلامه (Student)

**admin-web (`NotificationCompose.tsx:82-107`):**
1. `POST /api/v1/notifications/send` body:
   ```json
   {
     "type": "announcement" | "subscription_alert" | "new_content" | "security" | "message" | "achievement",
     "title": "<string>",
     "body": "<string>",
     "targetType": "All" | "University" | "College" | "Year" | "Semester" | "Subject" | "Student",
     "targetId": "<uuid|null>",
     "scheduledAt": "<iso|null>",
     "expiresAt": "<iso|null>"
   }
   ```
   الاستجابة: `{ notificationId, recipientsCount, isScheduled }`.
2. admin لا يُرسل `actionUrl`, `actionLabel`, `icon`.

**student-web (`NotificationsPage.tsx` + `notification-api.ts`):**
1. `GET /api/v1/notifications?unreadOnly=&page=&pageSize=` → `PagedResult<Notification>`.
2. `Notification` type يحوي: `id, type, title, body, icon?, actionUrl?, actionLabel?, createdAt, isRead`.
3. `markRead(id)` عبر `PATCH /api/v1/notifications/:id/read`.
4. `markAllRead()` عبر `POST /api/v1/notifications/mark-all-read`.
5. `registerPushToken(token, platform)` عبر `POST /api/v1/notifications/push-token`.
6. عند الضغط على إشعار: `window.location.href = notif.actionUrl` (إن وُجد).

**التقييم:**
- 🔴 **`notif.actionUrl` سيكون `undefined` دائماً** لأن admin لا يُرسله. لو كان الـ backend يضيفه تلقائياً (مثلاً من نوع الإشعار)، فلن يكون مُوثّقاً. حالياً student-web يعرض زر "الانتقال" فقط لو وُجد `actionLabel && actionUrl` (سطر 148) — هذا لن يتحقق أبداً → الميزة ميّتة.
- 🔴 **خطر open redirect**: إن أُضيف لاحقاً حقل `actionUrl` في `NotificationCompose`، فإن student-web سيُنفّذ `window.location.href = actionUrl` دون التحقق من أن الـ URL داخلي. يجب تقييده بقائمة (مثلاً يبدأ بـ `/`).
- 🟡 admin-web `App.tsx:184` يستدعي `/api/v1/notifications/unread-count` لتعبئة شارة الجرس. لكن `NotificationsController.GetUnreadCount` يستخدم `GetStudentId()` (سطر 27). توكن admin سيُمرَّر إلى `GetUnreadCountQuery(adminIdGuid)` الذي يبحث عن إشعارات طالب بـ ID مساوٍ لـ admin ID — يعيد 0 دائماً. **الشارة في admin ستعرض 0 دائماً بصمت**.
- ✅ الأنواع والصيغة متوافقة على مستوى `title/body/type/createdAt/isRead`.

### S5: حظر طالب (Admin) ← منع دخوله (Student)

**admin-web (`StudentsCenter.tsx:275-300`):**
1. admin يفتح drawer الطالب، يختار "حظر"، يملأ `reason` (إلزامي) و `banUntil` (اختياري بصيغة `YYYY-MM-DD`).
2. `POST /api/v1/admin/students/:id/ban` body:
   ```json
   {
     "reason": "<string>",
     "banUntil": "<iso|null>"
   }
   ```
   (`banUntil` يُحوَّل إلى ISO عبر `new Date(\`${banUntil}T23:59:59\`).toISOString()`).
3. بعد النجاح: `loadStudents(page)` + `openStudent(studentRef)` لتحديث الـ drawer.
4. admin-web يوفّر أيضاً:
   - `POST /admin/students/:id/unban` (إلغاء الحظر).
   - `POST /admin/students/:id/revoke-sessions` (إنهاء كل الجلسات النشطة).
   - `POST /security/students/:id/unbind-device` (إلغاء ربط الجهاز).
   - `POST /security/students/:id/sessions/:sid/revoke` (إنهاء جلسة واحدة).

**student-web (login flow):**
1. الطالب يحاول الدخول: `POST /api/v1/auth/login` body `{ phone, password, deviceFingerprint, deviceName }`.
2. الـ backend `AuthController.Login` يستدعي `LoginCommand` الذي يفترض أن يتحقق من حالة الطالب (active/banned) ويرفض login بـ 403 لو كان محظوراً (`AuthController.cs:104` يُصرّح `StatusCodes.Status403Forbidden`).
3. لو كان الطالب مسجّلاً مسبقاً وله token صالح وتم حظره أثناء جلسة نشطة:
   - الطلب التالي سيتلقى 403 (لو الـ backend يفحص status في كل طلب).
   - student-web `api-client.ts:65-88` يعترض 401 فقط (لا 403). 403 سيظهر للمكوّن كـ ApiError ويعرض رسالة (مثلاً في `StudentsCenter:184` لكن student-web لا يعالج 403 بـ logout قسري).
4. **نتيجة:** طالب محظور أثناء جلسة نشطة قد يستمر في استخدام التطبيق حتى ينتهي الـ access token (15 دقيقة). بعدها يبدأ الـ refresh بـ 403 (لو الـ backend يرفض refresh للمحظور) → `refreshAccessToken` يرمي خطأ → `sessionStorage.removeItem` + `window.location.assign('/login')`.
5. عند محاولة login ثانية: 403 → student-web `LoginPage.tsx:27` يلتقط الخطأ ويعرضه.

**التقييم:**
- ✅ العقد متوافق على مستوى الـ endpoints.
- 🟠 **student-web لا يعترض 403 كـ logout قسري**: قد يستمر طالب محظور في استخدام التطبيق حتى انتهاء الـ token. لو أن الـ backend يعتمد على session middleware (مثل `SessionValidationMiddleware.cs`) لرفض كل طلب بـ 403 للطالب المحظور، فإن المكوّنات ستعاني من أخطاء متفرقة بدلاً من redirect نظيف.
- 🟡 `banUntil` يُرسَل كـ ISO لكن بنهاية اليوم `T23:59:59` دون timezone محدد → يُفسَّر كـ UTC. قد يختلف عن توقيت المدير المحلي.
- ✅ لا critical على مستوى العقد، لكن 🟠 medium على مستوى UX للحظر الفوري.

---

## 8. ملخّص تنفيذي (Executive Summary)

**هل التطبيقان جاهزان للـ batch deploy؟**
**لا** — هناك 4 مشاكل حرجة (Critical) في admin-web وحده يجب إصلاحها قبل أي release مشترك، و3-4 مشاكل عالية (High) في كلا التطبيقين تُضعف تكاملهما.

**أهم 3 إصلاحات مطلوبة فوراً:**

1. 🔴 **إصلاح استجابة login في admin-web (`apps/admin-web/src/lib/api.ts:87-95`):** الـ backend يعيد `AuthResponse { accessToken, refreshToken, tokenType, expiresIn, user }` لكن `login()` تُعلن فقط `{ accessToken, user: AdminUser }`. يجب التقاط `refreshToken` وتخزينه، ثم بناء آلية refresh في `apiRequest()` مشابهة لـ `apps/student-web/src/services/api-client.ts` (interceptor 401 → refresh → retry). بدون ذلك، المدير يُطرد كل 15 دقيقة بصمت.

2. 🔴 **إصلاح تطابق `AdminUser` مع `UserDto` الخلفي (`apps/admin-web/src/lib/api.ts:4-10` مقابل `apps/api/src/CMS.Application/DTOs/Auth/AuthDtos.cs:79-87`):** الـ backend يُعيد `UserDto { id, phone, fullName, role, avatarUrl, university, college }` — لا يوجد `email`. إما أن يُعدَّل الـ backend ليعيد `AdminUserDto { id, email, fullName, role, avatarUrl }` (المسار الأصح)، أو أن يُعدَّل `AdminUser` ليسحب `email` من حقل آخر. حالياً admin-web يرى `user.email === undefined` في كل مكان.

3. 🔴 **إصلاح `installationId` الثابت في admin-web (`apps/admin-web/src/lib/api.ts:91`):** استبدال `'cms-admin-web-production'` بـ UUID يُولَّد مرة لكل متصفح (مثل `getOrCreateInstallationId()` في student-web) ويُخزَّن في `localStorage.cms-admin-installation-id`. يُحقن كـ `X-Installation-Id` header لكل طلب (تماماً مثل student-web). هذا ضروري لـ audit trail صحيح ولتجنب تعارض الجلسات على الـ backend.

**إصلاحات High الموصى بها في الجولة التالية:**

4. 🟠 **إصلاح `SettingsPage.tsx:26` في student-web:** تغيير `oldPassword` إلى `currentPassword` ليتطابق مع `ChangePasswordRequest` الخلفي. الأفضل: استبدال الاستدعاء inline بـ `authApi.changePassword(oldPassword, newPassword)` الموجودة في `auth-api.ts` (والذي يستخدم الحقل الصحيح).

5. 🟠 **حذف الكود الميّت في student-web:** `apps/student-web/src/features/admin/` (الصفحات + `admin-api.ts`)، `apps/student-web/src/components/common/PermissionRoute.tsx` (و`AdminRoute`)، `apps/student-web/src/hooks/PermissionProvider.tsx` و `permission-context.ts` و `usePermission.tsx`. الـ router لا يستخدمها إطلاقاً، ولو حاول أحد تفعيل `PermissionRoute` سيتلقى خطأ React Context. حذفها يُبسّط الصيانة.

6. 🟠 **توحيد الأنواع في `packages/types`:** نقل `DashboardStats`, `RecentActivity`, `RevenueData`, `StudentGrowth`, `TopSubject`, `ReportsSummary`, `Notification`, `ExamSession`, `ExamResult`, `PagedResult<T>` إلى `@cms/types` واستيرادها في كلا التطبيقين. حالياً كل نوع مُكرّر يدوياً في ملفه → عرضة للانحراف. كذلك توحيد `AdminUser` و `User` عبر إضافة `email?` اختياري للحالة المدير، أو إنشاء `AdminUserDto` مستقل في الخادم.

7. 🟠 **تقييد `actionUrl` في student-web `NotificationsPage.tsx:61`:** استبدال `window.location.href = notif.actionUrl` بفحص يبدأ بـ `/` (أو نطاقات مدراء معتمدة) لمنع open redirect. حتى لو لم يُرسله admin-web حالياً، يجب تقييده استباقياً.

8. 🟠 **توثيق متغيرات الـ env في `.env.example`:** إضافة `VITE_API_BASE_URL`, `VITE_OTP_ENABLED`, `VITE_OFFLINE_ENABLED`, `VITE_DEV_API_PROXY_TARGET` مع القيم الافتراضية وتعليقات تحذيرية (خاصة `VITE_API_BASE_URL` الذي يرجع إلى production افتراضياً).

**الخلاصة النهائية:** العقد الـ backend متين ومُصمَّم جيداً، والتطبيقان يلتزمان به على مستوى المسارات والأفعال. لكن student-web يحتوي على كود ميّت يعكس محاولة سابقة لدمج admin داخل student (ربما من فترة monolith)، وadmin-web ناقص النضج على مستوى الـ auth (لا refresh، installationId ثابت، AdminUser type خاطئ). يجب إصلاح admin-web أولاً قبل أي deploy مشترك.
