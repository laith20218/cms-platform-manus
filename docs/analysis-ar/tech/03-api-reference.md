# 03 — مرجع الواجهة البرمجية

> السطح الكامل لواجهة REST، محلَّل آلياً من `apps/api/src/CMS.Api/Controllers/*.cs` (تحليل ساكن بقراءة فقط؛ لم يُشغَّل أي خادم).
> **215 طريقة معالج / 216 سمة مسار** موزعة على **30 متحكماً** (الأفعال: 93 GET، و85 POST، و20 PUT، و15 DELETE، و2 PATCH).
> معالج واحد يحمل سمتَي مسار: `FavoritesController.DeleteQuestion` — ‏`DELETE {questionId}` و `DELETE questions/{questionId}` (FavoritesController.cs:125-126).
> كل المسارات مسبوقة بـ `api/v1/`. عمود المصادقة: "public" تعني `[AllowAnonymous]`؛ وقوائم الأدوار تعني `[Authorize(Roles=…)]`؛ و"auth ✓" تعني مصادقة بأي دور؛ و"*(class-level)*" تعني وراثة `[Authorize]` من المتحكم.

ملخص نموذج المصادقة (انظر [06-security.md](06-security.md)):‏ JWT Bearer ‏(رمز وصول 15 دقيقة / رمز تحديث 7 أيام) + تحقق من الجلسة في جهة الخادم (مطالب `sid` و `installation_id` و `tv`) + رموز استحقاق موقَّعة (`X-Entitlement` مع `X-Installation-Id`) على كل مسارات الوصول إلى الوسائط والمحتوى.

---

### المصادقة والحساب — الطالب (Auth & Account) — 10 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | public | `Controllers/AuthController.cs:15` → `Register` |
| `POST` | `/api/v1/auth/verify-otp` | public | `Controllers/AuthController.cs:51` → `VerifyOtp` |
| `POST` | `/api/v1/auth/resend-otp` | public | `Controllers/AuthController.cs:66` → `ResendOtp` |
| `GET` | `/api/v1/auth/me` | student | `Controllers/AuthController.cs:80` → `Me` |
| `POST` | `/api/v1/auth/login` | public | `Controllers/AuthController.cs:98` → `Login` |
| `POST` | `/api/v1/auth/refresh` | public | `Controllers/AuthController.cs:117` → `Refresh` |
| `POST` | `/api/v1/auth/logout` | auth ✓ | `Controllers/AuthController.cs:134` → `Logout` |
| `POST` | `/api/v1/auth/forgot-password` | public | `Controllers/AuthController.cs:149` → `ForgotPassword` |
| `POST` | `/api/v1/auth/reset-password` | public | `Controllers/AuthController.cs:163` → `ResetPassword` |
| `POST` | `/api/v1/auth/change-password` | auth ✓ | `Controllers/AuthController.cs:180` → `ChangePassword` |

### مصادقة المشرفين (Admin Auth) — 5 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `POST` | `/api/v1/auth/admin/login` | public | `Controllers/AdminAuthController.cs:16` → `Login` |
| `GET` | `/api/v1/auth/admin/me/permissions` | admin,super_admin | `Controllers/AdminAuthController.cs:65` → `GetMyPermissions` |
| `GET` | `/api/v1/auth/admin/me/ui-permissions` | admin,super_admin | `Controllers/AdminAuthController.cs:83` → `GetMyUiPermissions` |
| `POST` | `/api/v1/auth/admin/2fa/enable` | admin,super_admin | `Controllers/AdminAuthController.cs:99` → `Enable2FA` |
| `POST` | `/api/v1/auth/admin/2fa/disable` | admin,super_admin | `Controllers/AdminAuthController.cs:114` → `Disable2FA` |

### الشجرة الأكاديمية (Academic Tree) — 31 نقطة نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/universities` | public | `Controllers/AcademicController.cs:15` → `GetUniversities` |
| `GET` | `/api/v1/universities/{id:guid}` | public | `Controllers/AcademicController.cs:53` → `GetUniversity` |
| `POST` | `/api/v1/universities` | admin,super_admin | `Controllers/AcademicController.cs:58` → `CreateUniversity` |
| `PUT` | `/api/v1/universities/{id:guid}` | admin,super_admin | `Controllers/AcademicController.cs:67` → `UpdateUniversity` |
| `DELETE` | `/api/v1/universities/{id:guid}` | admin,super_admin | `Controllers/AcademicController.cs:75` → `DeleteUniversity` |
| `POST` | `/api/v1/academic/{entityType}/{id:guid}/archive` | admin,super_admin | `Controllers/AcademicController.cs:84` → `ArchiveAcademicEntity` |
| `POST` | `/api/v1/academic/{entityType}/{id:guid}/restore` | admin,super_admin | `Controllers/AcademicController.cs:94` → `RestoreAcademicEntity` |
| `GET` | `/api/v1/universities/{universityId:guid}/colleges` | public | `Controllers/AcademicController.cs:105` → `GetColleges` |
| `GET` | `/api/v1/colleges/{id:guid}` | public | `Controllers/AcademicController.cs:113` → `GetCollege` |
| `POST` | `/api/v1/colleges` | admin,super_admin | `Controllers/AcademicController.cs:118` → `CreateCollege` |
| `PUT` | `/api/v1/colleges/{id:guid}` | admin,super_admin | `Controllers/AcademicController.cs:127` → `UpdateCollege` |
| `DELETE` | `/api/v1/colleges/{id:guid}` | admin,super_admin | `Controllers/AcademicController.cs:135` → `DeleteCollege` |
| `GET` | `/api/v1/colleges/{collegeId:guid}/years` | public | `Controllers/AcademicController.cs:145` → `GetYears` |
| `GET` | `/api/v1/years/{id:guid}` | public | `Controllers/AcademicController.cs:153` → `GetYear` |
| `POST` | `/api/v1/years` | admin,super_admin | `Controllers/AcademicController.cs:158` → `CreateYear` |
| `PUT` | `/api/v1/years/{id:guid}` | admin,super_admin | `Controllers/AcademicController.cs:166` → `UpdateYear` |
| `GET` | `/api/v1/years/{yearId:guid}/semesters` | auth ✓ | `Controllers/AcademicController.cs:175` → `GetSemesters` |
| `GET` | `/api/v1/semesters/{id:guid}` | auth ✓ | `Controllers/AcademicController.cs:183` → `GetSemester` |
| `POST` | `/api/v1/semesters` | admin,super_admin | `Controllers/AcademicController.cs:188` → `CreateSemester` |
| `GET` | `/api/v1/semesters/{semesterId:guid}/subjects` | auth ✓ | `Controllers/AcademicController.cs:197` → `GetSubjects` |
| `GET` | `/api/v1/subjects/my-subjects` | student | `Controllers/AcademicController.cs:210` → `GetMySubjects` |
| `GET` | `/api/v1/subjects/{id:guid}` | auth ✓ | `Controllers/AcademicController.cs:219` → `GetSubject` |
| `GET` | `/api/v1/subjects/{slug}` | auth ✓ | `Controllers/AcademicController.cs:232` → `GetSubjectBySlug` |
| `POST` | `/api/v1/subjects` | admin,super_admin | `Controllers/AcademicController.cs:246` → `CreateSubject` |
| `PUT` | `/api/v1/subjects/{id:guid}` | admin,super_admin | `Controllers/AcademicController.cs:254` → `UpdateSubject` |
| `GET` | `/api/v1/subjects/{subjectId:guid}/lectures` | auth ✓ | `Controllers/AcademicController.cs:301` → `GetLectures` |
| `GET` | `/api/v1/lectures/{id:guid}` | auth ✓ | `Controllers/AcademicController.cs:312` → `GetLecture` |
| `POST` | `/api/v1/lectures/{id:guid}/complete` | auth ✓ | `Controllers/AcademicController.cs:324` → `CompleteLecture` |
| `POST` | `/api/v1/lectures` | admin,super_admin | `Controllers/AcademicController.cs:337` → `CreateLecture` |
| `PUT` | `/api/v1/lectures/{id:guid}` | admin,super_admin | `Controllers/AcademicController.cs:345` → `UpdateLecture` |
| `POST` | `/api/v1/lectures/{id:guid}/publish` | admin,super_admin | `Controllers/AcademicController.cs:353` → `PublishLecture` |

### المواد والمحاضرات والأسئلة — الطالب (Subjects / Lectures / Questions) — 10 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/questions` | auth ✓ | `Controllers/QuestionsController.cs:16` → `GetQuestions` |
| `GET` | `/api/v1/questions/{id:guid}` | auth ✓ | `Controllers/QuestionsController.cs:83` → `GetQuestion` |
| `POST` | `/api/v1/questions/{id:guid}/answer` | auth ✓ | `Controllers/QuestionsController.cs:101` → `AnswerQuestion` |
| `POST` | `/api/v1/questions/{id:guid}/report` | auth ✓ | `Controllers/QuestionsController.cs:120` → `ReportQuestion` |
| `POST` | `/api/v1/questions` | admin,super_admin | `Controllers/QuestionsController.cs:181` → `CreateQuestion` |
| `PUT` | `/api/v1/questions/{id:guid}` | admin,super_admin | `Controllers/QuestionsController.cs:199` → `UpdateQuestion` |
| `DELETE` | `/api/v1/questions/{id:guid}` | admin,super_admin | `Controllers/QuestionsController.cs:215` → `DeleteQuestion` |
| `POST` | `/api/v1/questions/{id:guid}/publish` | admin,super_admin | `Controllers/QuestionsController.cs:227` → `PublishQuestion` |
| `POST` | `/api/v1/questions/{id:guid}/archive` | admin,super_admin | `Controllers/QuestionsController.cs:239` → `ArchiveQuestion` |
| `POST` | `/api/v1/questions/import` | admin,super_admin | `Controllers/QuestionsController.cs:251` → `ImportQuestions` |

### الامتحانات — الطالب (Exams) — 9 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/exams/by-subject/{subjectId:guid}` | auth ✓ | `Controllers/ExamsController.cs:15` → `GetExamsBySubject` |
| `GET` | `/api/v1/exams/{id:guid}` | *(class-level)* | `Controllers/ExamsController.cs:39` → `GetExam` |
| `POST` | `/api/v1/exams/{examId:guid}/start` | *(class-level)* | `Controllers/ExamsController.cs:50` → `StartExam` |
| `GET` | `/api/v1/exams/sessions/{sessionId:guid}` | *(class-level)* | `Controllers/ExamsController.cs:62` → `GetSession` |
| `PUT` | `/api/v1/exams/sessions/{sessionId:guid}/questions/{questionId:guid}/answer` | *(class-level)* | `Controllers/ExamsController.cs:73` → `SaveAnswer` |
| `POST` | `/api/v1/exams/sessions/{sessionId:guid}/submit` | *(class-level)* | `Controllers/ExamsController.cs:85` → `SubmitExam` |
| `POST` | `/api/v1/exams/sessions/{sessionId:guid}/cancel` | *(class-level)* | `Controllers/ExamsController.cs:96` → `CancelExam` |
| `GET` | `/api/v1/exams/sessions/{sessionId:guid}/results` | *(class-level)* | `Controllers/ExamsController.cs:108` → `GetResults` |
| `GET` | `/api/v1/exams/sessions/{sessionId:guid}/review` | *(class-level)* | `Controllers/ExamsController.cs:119` → `GetReview` |

### الدورات والحلقات — الطالب (Courses & Episodes) — 3 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/courses/subject/{subjectId:guid}` | auth ✓ | `Controllers/CoursesController.cs:18` → `GetSubjectCourses` |
| `GET` | `/api/v1/courses/{id:guid}` | auth ✓ | `Controllers/CoursesController.cs:52` → `GetCourse` |
| `POST` | `/api/v1/courses/episodes/{id:guid}/access` | auth ✓ | `Controllers/CoursesController.cs:70` → `GetEpisodeAccess` |

### المكتبة — الطالب (Library) — 14 نقطة نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/library/subject/{subjectId:guid}` | auth ✓ | `Controllers/LibraryController.cs:17` → `GetFiles` |
| `GET` | `/api/v1/library/lectures/{lectureId:guid}/text-files` | auth ✓ | `Controllers/LibraryController.cs:61` → `GetLectureTextFiles` |
| `GET` | `/api/v1/library/{id:guid}` | auth ✓ | `Controllers/LibraryController.cs:76` → `GetFile` |
| `POST` | `/api/v1/library/{id:guid}/access` | auth ✓ | `Controllers/LibraryController.cs:92` → `GetAccess` |
| `GET` | `/api/v1/library/{id:guid}/content` | auth ✓ | `Controllers/LibraryController.cs:121` → `GetContent` |
| `POST` | `/api/v1/library/{id:guid}/view` | auth ✓ | `Controllers/LibraryController.cs:158` → `RecordView` |
| `GET` | `/api/v1/library/{id:guid}/annotations` | auth ✓ | `Controllers/LibraryController.cs:176` → `GetAnnotations` |
| `POST` | `/api/v1/library/{id:guid}/annotations` | auth ✓ | `Controllers/LibraryController.cs:194` → `SaveAnnotations` |
| `POST` | `/api/v1/library/upload-url` | admin,super_admin | `Controllers/LibraryController.cs:253` → `RequestUploadUrl` |
| `POST` | `/api/v1/library/complete-upload` | admin,super_admin | `Controllers/LibraryController.cs:269` → `CompleteUpload` |
| `PUT` | `/api/v1/library/{id:guid}` | admin,super_admin | `Controllers/LibraryController.cs:289` → `UpdateFile` |
| `POST` | `/api/v1/library/{id:guid}/publish` | admin,super_admin | `Controllers/LibraryController.cs:302` → `PublishFile` |
| `POST` | `/api/v1/library/{id:guid}/archive` | admin,super_admin | `Controllers/LibraryController.cs:313` → `ArchiveFile` |
| `DELETE` | `/api/v1/library/{id:guid}` | admin,super_admin | `Controllers/LibraryController.cs:324` → `DeleteFile` |

### تشغيل الوسائط — الطالب (Media Playback) — 8 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `POST` | `/api/v1/media/{assetType}/{assetId:guid}/playback-url` | student | `Controllers/MediaController.cs:26` → `GetPlaybackUrl` |
| `GET` | `/api/v1/media/hls/{assetType}/{assetId:guid}/{*path}` | *(class-level)* | `Controllers/MediaController.cs:98` → `GetHlsObject` |
| `GET` | `/api/v1/media/{assetType}/{assetId:guid}/bookmarks` | *(class-level)* | `Controllers/MediaController.cs:120` → `ListBookmarks` |
| `POST` | `/api/v1/media/{assetType}/{assetId:guid}/bookmarks` | *(class-level)* | `Controllers/MediaController.cs:139` → `CreateBookmark` |
| `PATCH` | `/api/v1/media/bookmarks/{bookmarkId:guid}` | *(class-level)* | `Controllers/MediaController.cs:158` → `UpdateBookmark` |
| `DELETE` | `/api/v1/media/bookmarks/{bookmarkId:guid}` | *(class-level)* | `Controllers/MediaController.cs:169` → `DeleteBookmark` |
| `POST` | `/api/v1/media/{assetType}/{assetId:guid}/progress` | *(class-level)* | `Controllers/MediaController.cs:185` → `UpsertProgress` |
| `GET` | `/api/v1/media/{assetType}/{assetId:guid}/progress` | *(class-level)* | `Controllers/MediaController.cs:201` → `GetProgress` |

### المفضلة (Favorites) — 6 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/favorites` | student | `Controllers/FavoritesController.cs:22` → `List` |
| `POST` | `/api/v1/favorites/episodes/{episodeId:guid}` | *(class-level)* | `Controllers/FavoritesController.cs:66` → `CreateEpisodeFavorite` |
| `POST` | `/api/v1/favorites` | *(class-level)* | `Controllers/FavoritesController.cs:87` → `Create` |
| `DELETE` | `/api/v1/favorites/{targetType}/{targetId:guid}` | *(class-level)* | `Controllers/FavoritesController.cs:109` → `Delete` |
| `DELETE` | `/api/v1/favorites/questions/{questionId:guid}` | *(class-level)* | `Controllers/FavoritesController.cs:125` → `DeleteQuestion` |
| `DELETE` | `/api/v1/favorites/files/{fileId:guid}` | *(class-level)* | `Controllers/FavoritesController.cs:140` → `DeleteFile` |

### الاشتراكات والرموز — الطالب (Subscriptions & Codes) — نقطة نهاية واحدة

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `POST` | `/api/v1/subscriptions/redeem` | student | `Controllers/SubscriptionsController.cs:9` → `Redeem` |

### الاستحقاقات (Entitlements) — نقطتا نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `POST` | `/api/v1/entitlements/issue` | auth ✓ | `Controllers/EntitlementsController.cs:9` → `Issue` |
| `POST` | `/api/v1/entitlements/renew` | *(class-level)* | `Controllers/EntitlementsController.cs:24` → `Renew` |

### الإشعارات (Notifications) — 8 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | auth ✓ | `Controllers/NotificationsController.cs:14` → `GetNotifications` |
| `GET` | `/api/v1/notifications/unread-count` | auth ✓ | `Controllers/NotificationsController.cs:47` → `GetUnreadCount` |
| `PATCH` | `/api/v1/notifications/{id:guid}/read` | auth ✓ | `Controllers/NotificationsController.cs:58` → `MarkRead` |
| `POST` | `/api/v1/notifications/mark-all-read` | auth ✓ | `Controllers/NotificationsController.cs:69` → `MarkAllRead` |
| `POST` | `/api/v1/notifications/push-token` | auth ✓ | `Controllers/NotificationsController.cs:80` → `RegisterPushToken` |
| `POST` | `/api/v1/notifications/send` | admin,super_admin | `Controllers/NotificationsController.cs:113` → `SendNotification` |
| `GET` | `/api/v1/notifications/{id:guid}/stats` | admin,super_admin | `Controllers/NotificationsController.cs:144` → `GetStats` |
| `GET` | `/api/v1/notifications/sent` | admin,super_admin | `Controllers/NotificationsController.cs:161` → `GetSentNotifications` |

### الإحصاءات والبحث — الطالب (Stats & Search) — 4 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/stats/me` | auth ✓ | `Controllers/StatsController.cs:10` → `GetMyStats` |
| `GET` | `/api/v1/stats/leaderboard` | auth ✓ | `Controllers/StatsController.cs:34` → `GetLeaderboard` |
| `GET` | `/api/v1/stats/global` | admin,super_admin | `Controllers/StatsController.cs:50` → `GetGlobalStats` |
| `GET` | `/api/v1/search` | student | `Controllers/StudentSearchController.cs:10` → `Search` |

### ملف الطالب (Student Profile) — 3 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/profile` | student | `Controllers/StudentProfileController.cs:13` → `Get` |
| `PUT` | `/api/v1/profile` | *(class-level)* | `Controllers/StudentProfileController.cs:158` → `UpdateProfile` |
| `POST` | `/api/v1/profile/avatar` | *(class-level)* | `Controllers/StudentProfileController.cs:343` → `UploadAvatar` |

### العمل دون اتصال — أندرويد (Offline) — 5 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `POST` | `/api/v1/offline/download` | auth ✓ | `Controllers/OfflineController.cs:15` → `DownloadPackage` |
| `POST` | `/api/v1/offline/sync` | *(class-level)* | `Controllers/OfflineController.cs:70` → `SyncAnswers` |
| `GET` | `/api/v1/offline/packages` | *(class-level)* | `Controllers/OfflineController.cs:83` → `GetPackages` |
| `GET` | `/api/v1/offline/packages/{packageId:guid}/status` | *(class-level)* | `Controllers/OfflineController.cs:91` → `GetPackageStatus` |
| `DELETE` | `/api/v1/offline/packages/{packageId:guid}` | *(class-level)* | `Controllers/OfflineController.cs:104` → `DeletePackage` |

### الأمان — الطالب والمشرف (Security) — 11 نقطة نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `POST` | `/api/v1/security/play-integrity/verify` | student | `Controllers/PlayIntegrityController.cs:8` → `Verify` |
| `GET` | `/api/v1/security/students/{studentId:guid}/logs` | admin,super_admin | `Controllers/SecurityController.cs:17` → `GetStudentLogs` |
| `GET` | `/api/v1/security/alerts` | *(class-level)* | `Controllers/SecurityController.cs:77` → `GetCriticalAlerts` |
| `GET` | `/api/v1/security/audit-logs` | *(class-level)* | `Controllers/SecurityController.cs:109` → `GetAuditLogs` |
| `POST` | `/api/v1/security/students/{studentId:guid}/unbind-device` | *(class-level)* | `Controllers/SecurityController.cs:177` → `UnbindDevice` |
| `GET` | `/api/v1/security/students/{studentId:guid}/sessions` | *(class-level)* | `Controllers/SecurityController.cs:192` → `GetStudentSessions` |
| `POST` | `/api/v1/security/students/{studentId:guid}/sessions/{sessionId:guid}/revoke` | *(class-level)* | `Controllers/SecurityController.cs:236` → `RevokeSession` |
| `GET` | `/api/v1/security/my-sessions` | student | `Controllers/StudentSecurityController.cs:24` → `GetMySessions` |
| `POST` | `/api/v1/security/my-sessions/{sessionId:guid}/revoke` | *(class-level)* | `Controllers/StudentSecurityController.cs:97` → `RevokeMySession` |
| `POST` | `/api/v1/security/my-sessions/revoke-others` | *(class-level)* | `Controllers/StudentSecurityController.cs:129` → `RevokeOtherSessions` |
| `POST` | `/api/v1/security/events` | student | `Controllers/StudentSecurityEventsController.cs:16` → `Report` |

### الإدارة — لوحة المعلومات والتحليلات (Dashboard & Analytics) — 38 نقطة نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/admin/analytics/students` | Policy = "SuperAdmin" | `Controllers/AdminAnalyticsController.cs:16` → `GetStudentsAnalytics` |
| `GET` | `/api/v1/admin/analytics/academic` | *(class-level)* | `Controllers/AdminAnalyticsController.cs:83` → `GetAcademicPerformance` |
| `GET` | `/api/v1/admin/analytics/exams` | *(class-level)* | `Controllers/AdminAnalyticsController.cs:145` → `GetExamsAnalytics` |
| `GET` | `/api/v1/admin/analytics/questions` | *(class-level)* | `Controllers/AdminAnalyticsController.cs:195` → `GetQuestionsAnalytics` |
| `GET` | `/api/v1/admin/analytics/content` | *(class-level)* | `Controllers/AdminAnalyticsController.cs:262` → `GetContentAnalytics` |
| `GET` | `/api/v1/admin/analytics/codes` | *(class-level)* | `Controllers/AdminAnalyticsController.cs:304` → `GetCodesAnalytics` |
| `GET` | `/api/v1/admin/analytics/operations` | *(class-level)* | `Controllers/AdminAnalyticsController.cs:351` → `GetOperationsAnalytics` |
| `GET` | `/api/v1/admin/dashboard` | admin,super_admin | `Controllers/AdminDashboardController.cs:22` → `GetStats` |
| `GET` | `/api/v1/admin/recent-activity` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:67` → `GetRecentActivity` |
| `GET` | `/api/v1/admin/revenue` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:75` → `GetRevenue` |
| `GET` | `/api/v1/admin/student-growth` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:83` → `GetStudentGrowth` |
| `GET` | `/api/v1/admin/top-subjects` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:91` → `GetTopSubjects` |
| `GET` | `/api/v1/admin/reports/summary` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:99` → `GetReportsSummary` |
| `GET` | `/api/v1/admin/students` | Policy = Policies.StudentView | `Controllers/AdminDashboardController.cs:109` → `GetStudents` |
| `POST` | `/api/v1/admin/students/{id:guid}/ban` | Policy = Policies.StudentEdit | `Controllers/AdminDashboardController.cs:123` → `BanStudent` |
| `POST` | `/api/v1/admin/students/{id:guid}/unban` | Policy = Policies.StudentEdit | `Controllers/AdminDashboardController.cs:136` → `UnbanStudent` |
| `POST` | `/api/v1/admin/students/{id:guid}/revoke-sessions` | Policy = Policies.StudentEdit | `Controllers/AdminDashboardController.cs:149` → `RevokeStudentSessions` |
| `GET` | `/api/v1/admin/admins` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:163` → `GetAdmins` |
| `GET` | `/api/v1/admin/admins/{id:guid}` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:177` → `GetAdmin` |
| `POST` | `/api/v1/admin/admins` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:185` → `CreateAdmin` |
| `PUT` | `/api/v1/admin/admins/{id:guid}` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:198` → `UpdateAdmin` |
| `POST` | `/api/v1/admin/admins/{id:guid}/status` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:208` → `SetAdminStatus` |
| `POST` | `/api/v1/admin/admins/{id:guid}/reset-password` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:219` → `ResetAdminPassword` |
| `DELETE` | `/api/v1/admin/admins/{id:guid}` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:230` → `DeleteAdmin` |
| `PUT` | `/api/v1/admin/roles/{id:guid}/permissions` | Policy = Policies.RoleEdit | `Controllers/AdminDashboardController.cs:241` → `ReplaceRolePermissions` |
| `GET` | `/api/v1/admin/roles/{id:guid}/permissions` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:254` → `GetRolePermissions` |
| `GET` | `/api/v1/admin/roles` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:264` → `GetRoles` |
| `POST` | `/api/v1/admin/roles` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:272` → `CreateRole` |
| `POST` | `/api/v1/admin/roles/{id:guid}/status` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:283` → `SetRoleStatus` |
| `DELETE` | `/api/v1/admin/roles/{id:guid}` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:294` → `DeleteRole` |
| `GET` | `/api/v1/admin/roles/{id:guid}/ui-permissions` | Policy = "SuperAdmin" | `Controllers/AdminDashboardController.cs:308` → `GetRoleUiPermissions` |
| `PUT` | `/api/v1/admin/roles/{id:guid}/ui-permissions` | Policy = Policies.RoleEdit | `Controllers/AdminDashboardController.cs:317` → `ReplaceRoleUiPermissions` |
| `DELETE` | `/api/v1/admin/roles/{id:guid}/ui-permissions` | Policy = Policies.RoleEdit | `Controllers/AdminDashboardController.cs:328` → `ClearRoleUiPermissions` |
| `POST` | `/api/v1/admin/subscriptions/{id:guid}/revoke` | Policy = Policies.CodeEdit | `Controllers/AdminDashboardController.cs:339` → `RevokeSubscription` |
| `POST` | `/api/v1/admin/codes/{id:guid}/revoke` | Policy = Policies.CodeEdit | `Controllers/AdminDashboardController.cs:348` → `RevokeCode` |
| `GET` | `/api/v1/admin/codes` | Policy = Policies.CodeView | `Controllers/AdminDashboardController.cs:361` → `GetCodes` |
| `POST` | `/api/v1/admin/codes/generate` | Policy = Policies.CodeCreate | `Controllers/AdminDashboardController.cs:376` → `GenerateCodes` |
| `POST` | `/api/v1/admin/codes/{codeId:guid}/activate` | Policy = Policies.CodeEdit | `Controllers/AdminDashboardController.cs:392` → `ActivateCodeForStudent` |

### الإدارة — الدورات والمحتوى (Courses & Content) — 19 نقطة نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/admin/content/questions` | admin,super_admin | `Controllers/AdminContentController.cs:14` → `GetQuestions` |
| `GET` | `/api/v1/admin/content/exams` | *(class-level)* | `Controllers/AdminContentController.cs:60` → `GetExams` |
| `GET` | `/api/v1/admin/content/files` | *(class-level)* | `Controllers/AdminContentController.cs:79` → `GetFiles` |
| `GET` | `/api/v1/admin/content/academic/subjects/{subjectId:guid}/lectures` | *(class-level)* | `Controllers/AdminContentController.cs:116` → `GetSubjectLectures` |
| `GET` | `/api/v1/admin/courses` | admin,super_admin | `Controllers/AdminCoursesController.cs:24` → `GetCourses` |
| `GET` | `/api/v1/admin/courses/{id:guid}` | *(class-level)* | `Controllers/AdminCoursesController.cs:122` → `GetCourse` |
| `POST` | `/api/v1/admin/courses` | *(class-level)* | `Controllers/AdminCoursesController.cs:135` → `Create` |
| `PUT` | `/api/v1/admin/courses/{id:guid}` | *(class-level)* | `Controllers/AdminCoursesController.cs:144` → `Update` |
| `POST` | `/api/v1/admin/courses/{id:guid}/publish` | *(class-level)* | `Controllers/AdminCoursesController.cs:153` → `Publish` |
| `POST` | `/api/v1/admin/courses/{id:guid}/archive` | *(class-level)* | `Controllers/AdminCoursesController.cs:162` → `Archive` |
| `DELETE` | `/api/v1/admin/courses/{id:guid}` | *(class-level)* | `Controllers/AdminCoursesController.cs:171` → `Delete` |
| `POST` | `/api/v1/admin/courses/{courseId:guid}/episodes/youtube` | *(class-level)* | `Controllers/AdminCoursesController.cs:184` → `AddYouTubeEpisode` |
| `PUT` | `/api/v1/admin/courses/episodes/{id:guid}` | *(class-level)* | `Controllers/AdminCoursesController.cs:194` → `UpdateEpisode` |
| `DELETE` | `/api/v1/admin/courses/episodes/{id:guid}` | *(class-level)* | `Controllers/AdminCoursesController.cs:204` → `DeleteEpisode` |
| `POST` | `/api/v1/admin/courses/{courseId:guid}/episodes/initiate-upload` | *(class-level)* | `Controllers/AdminCoursesController.cs:222` → `InitiateUpload` |
| `GET` | `/api/v1/admin/courses/episodes/{episodeId:guid}/multipart-status` | *(class-level)* | `Controllers/AdminCoursesController.cs:281` → `MultipartStatus` |
| `POST` | `/api/v1/admin/courses/episodes/{episodeId:guid}/complete-upload` | *(class-level)* | `Controllers/AdminCoursesController.cs:296` → `CompleteUpload` |
| `POST` | `/api/v1/admin/courses/episodes/{episodeId:guid}/abort-processing` | *(class-level)* | `Controllers/AdminCoursesController.cs:316` → `AbortProcessing` |
| `POST` | `/api/v1/admin/courses/episodes/{episodeId:guid}/abort-upload` | *(class-level)* | `Controllers/AdminCoursesController.cs:326` → `AbortUpload` |

### الإدارة — الامتحانات والأسئلة (Exams & Questions) — 12 نقطة نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/admin/exams` | Authorize; Policy = Policies.ExamView | `Controllers/AdminExamsController.cs:15` → `List` |
| `GET` | `/api/v1/admin/exams/{id:guid}` | Policy = Policies.ExamView | `Controllers/AdminExamsController.cs:44` → `Get` |
| `GET` | `/api/v1/admin/exams/question-candidates` | Policy = Policies.ExamManageQuestions | `Controllers/AdminExamsController.cs:54` → `QuestionCandidates` |
| `POST` | `/api/v1/admin/exams` | Policy = Policies.ExamCreate | `Controllers/AdminExamsController.cs:70` → `Create` |
| `PUT` | `/api/v1/admin/exams/{id:guid}` | Policy = Policies.ExamEdit | `Controllers/AdminExamsController.cs:81` → `Update` |
| `PUT` | `/api/v1/admin/exams/{id:guid}/questions` | Policy = Policies.ExamManageQuestions | `Controllers/AdminExamsController.cs:91` → `ReplaceQuestions` |
| `POST` | `/api/v1/admin/exams/{id:guid}/publish` | Policy = Policies.ExamPublish | `Controllers/AdminExamsController.cs:101` → `Publish` |
| `POST` | `/api/v1/admin/exams/{id:guid}/archive` | Policy = Policies.ExamArchive | `Controllers/AdminExamsController.cs:112` → `Archive` |
| `DELETE` | `/api/v1/admin/exams/{id:guid}` | Policy = Policies.ExamDelete | `Controllers/AdminExamsController.cs:123` → `Delete` |
| `GET` | `/api/v1/admin/exams/{id:guid}/results` | Policy = Policies.ExamReadResults | `Controllers/AdminExamsController.cs:134` → `Results` |
| `GET` | `/api/v1/admin/questions` | admin,super_admin | `Controllers/AdminQuestionsController.cs:18` → `List` |
| `GET` | `/api/v1/admin/questions/{id:guid}` | Policy = Policies.QuestionView | `Controllers/AdminQuestionsController.cs:99` → `Get` |

### الإدارة — الطلاب (Students) — 7 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `PUT` | `/api/v1/admin/students/{studentId:guid}` | admin,super_admin | `Controllers/AdminStudentsController.cs:16` → `UpdateProfile` |
| `POST` | `/api/v1/admin/students/{studentId:guid}/avatar` | *(class-level)* | `Controllers/AdminStudentsController.cs:108` → `UploadAvatar` |
| `POST` | `/api/v1/admin/students` | *(class-level)* | `Controllers/AdminStudentsController.cs:216` → `CreateStudent` |
| `GET` | `/api/v1/admin/students/{studentId:guid}/exam-sessions` | *(class-level)* | `Controllers/AdminStudentsController.cs:297` → `GetStudentExamSessions` |
| `GET` | `/api/v1/admin/students/{studentId:guid}/subscriptions` | *(class-level)* | `Controllers/AdminStudentsController.cs:330` → `GetStudentSubscriptions` |
| `GET` | `/api/v1/admin/students/{studentId:guid}/reports` | *(class-level)* | `Controllers/AdminStudentsController.cs:360` → `GetStudentReports` |
| `GET` | `/api/v1/admin/students/{studentId:guid}/progress` | *(class-level)* | `Controllers/AdminStudentsController.cs:390` → `GetStudentProgress` |

### الإدارة — التقارير والإشراف (Reports & Moderation) — 3 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/admin/reports` | admin,super_admin | `Controllers/AdminReportsController.cs:16` → `List` |
| `PUT` | `/api/v1/admin/reports/{reportId:guid}/status` | *(class-level)* | `Controllers/AdminReportsController.cs:131` → `TransitionStatus` |
| `PUT` | `/api/v1/admin/reports/{reportId:guid}/assign` | *(class-level)* | `Controllers/AdminReportsController.cs:223` → `Assign` |

### الإدارة — إعدادات النظام والنشاط (System Settings & Activity) — 6 نقاط نهاية

| الطريقة | المسار | المصادقة | المعالج (file:line) |
|---|---|---|---|
| `GET` | `/api/v1/admin/activity/sessions` | super_admin | `Controllers/AdminActivityController.cs:14` → `GetSessions` |
| `GET` | `/api/v1/admin/activity/logs` | *(class-level)* | `Controllers/AdminActivityController.cs:38` → `GetLogs` |
| `GET` | `/api/v1/admin/settings` | admin,super_admin | `Controllers/SystemSettingsController.cs:17` → `List` |
| `GET` | `/api/v1/admin/settings/{key}` | *(class-level)* | `Controllers/SystemSettingsController.cs:59` → `Get` |
| `PUT` | `/api/v1/admin/settings/{key}` | *(class-level)* | `Controllers/SystemSettingsController.cs:79` → `Update` |
| `POST` | `/api/v1/admin/settings/{key}/reset` | *(class-level)* | `Controllers/SystemSettingsController.cs:138` → `Reset` |

---

## الاصطلاحات الملحوظة

- **أشكال الاستجابات**:‏ JSON بصيغة camelCase، والتعدادات نصوصاً (`Program.cs:100-105`)؛ والأخطاء بصيغة RFC 7807 `ProblemDetails` ‏(ExceptionHandlingMiddleware).
- **رموز الحالة**: موثقة لكل نقطة نهاية عبر `[ProducesResponseType]` (مثال: AuthController.cs:33-35).
- **ترقيم الصفحات**: نمط `[FromQuery] page/pageSize` (مثال: LibraryController.cs:63).
- **الملكية**: تستنبط عمليات الطالب المتغيِّرة هويةَ المستدعي من مطالبة `sub` وتقيّد كل استعلام بـ `studentId` (مثال: MediaController.cs:40, 160-177).
- **تحديد المعدل**: سياسات مسماة مطبَّقة عبر `[EnableRateLimiting]` على المسارات الحساسة (login/otp/password-reset/auth — ‏AuthController.cs:52, 99, 118, 150, 164).
- **سطحا مصادقة منفصلان**: ‏`api/v1/auth/*` (الطالب) مقابل `api/v1/auth/admin/*` (المشغل) بخنق مستقل لكل منهما (Program.cs:145-151).

*ذو صلة: [01-architecture.md](01-architecture.md) · [06-security.md](06-security.md)*
