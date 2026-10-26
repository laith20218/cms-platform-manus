# الوثيقة 01 — البنية التقنية والبنية التحتية

> **Wave 10 — تسليم الجلسة النهائي** · الفرع: `handover/wave10-final` (من `main` @ `17754a1`)
> وثيقة مرجعية كاملة للبنية: الحزم، المزوّدون، خريطة متغيرات البيئة، مسارات البيانات، ونقاط النهاية. كل مسار ملف حقيقي في المستودع.

---

## 1. الحزم التقنية لكل طبقة

### 1.1 الـ API — `apps/api` (‎.NET 9)

| العنصر | التقنية |
|---|---|
| الإطار | ASP.NET Core 9 (Minimal hosting عبر `Program.cs` top-level) |
| الأنماط | MediatR (CQRS خفيف) + طبقات `CMS.Domain` / `CMS.Application` / `CMS.Infrastructure` / `CMS.Api` |
| ORM | EF Core 9 (Npgsql → Neon Postgres) |
| التخزين | AWSSDK.S3 **3.7.421.10** (S3-compatible → Backblaze B2) |
| الكاش | Upstash Redis عبر REST (`UpstashRedisRestCacheService` — `CMS.Infrastructure/Services/ExternalServices.cs`) |
| المهام الخلفية | `BackgroundService` مُستضاف — خط أنابيب الترميز (`CMS.Application/BackgroundJobs/VideoTranscodingService.cs`) |
| الفيديو | FFmpeg/ffprobe (حزمة Alpine داخل `apps/api/Dockerfile` + متغيرات `FFMPEG_PATH`/`FFPROBE_PATH`/`FFMPEG_TIMEOUT_MINUTES`) |
| الاختبارات | xUnit — **440/440** (الأساس الحالي، مع `--filter "Category!=PostgresIntegration"`) |

### 1.2 واجهة الطالب — `apps/student-web` (Vite/React)

React 18 + React Router + Tailwind + Radix UI + framer-motion + **hls.js@1.7.3** (استثناء القفل الوحيد في 10.4) + axios + sonner + vitest (117) + Playwright e2e.
- المشغّل: `src/features/media-player/` — `video/VideoPlayer.tsx` (ثنائي المحرك HLS/MP4)، `PlayerShell.tsx`، `hooks/useMediaLease.ts`، `video/ControlsBar.tsx`، `video/BookmarkDialog.tsx`
- صفحة المشغّل الإنتاجية: `src/features/my-studies/pages/CoursePlayerPage.tsx`

### 1.3 واجهة المشرف — `apps/admin-web` (Vite/React)

React + Tailwind، بلا Radix (مودالات يدوية بديلة `AccessibleModal`)، axios + vitest (35).
- مركز الرفع: `src/components/CoursesCenter.tsx` (`SinglePutUploadPanel`) + `ProcessingTimeline.tsx` + `EpisodeMetadataFields.tsx` + `ProcessingErrorModal.tsx`

### 1.4 تطبيق أندرويد — `apps/android`

موجود في المستودع (UNVERIFIED — خارج نطاق Wave 10؛ لم يُمَس في هذه الموجة).

---

## 2. تكاملات المزوّدين

### 2.1 Backblaze B2 (التخزين النشط — منذ 10.9)

| البند | القيمة |
|---|---|
| الدلو | `CMSmedia` (اسم بحالة مختلطة ⇒ **path-style إلزامي**: `ForcePathStyle=true` — DNS غير حساس للحالة) |
| المنطقة | `eu-central-003` — النقطة: `https://s3.eu-central-003.backblazeb2.com` |
| المفاتيح | keyID/ applicationKey عبر `Storage:S3:AccessKey/SecretKey`. المفتاح الحالي في Render: **المفتاح الرئيسي (يجب التدوير!)**؛ أنشأ المشرف `cms-api-key-01` (Read & Write) للتبديل |
| العميل | `S3StorageService` (`apps/api/src/CMS.Infrastructure/Services/ExternalServices.cs`) — التسجيل الوحيد `IFileStorageService` (singleton) في `CMS.Infrastructure/DependencyInjection/DependencyInjection.cs` |
| إعدادات التوافق | `RequestChecksumCalculation/ResponseChecksumValidation = WHEN_REQUIRED` (10.8d) · `DisablePayloadSigning=true` عند كل PutObject (10.8e، `BuildPutObjectRequest`) · كل القيم الخمس fail-closed عند الإقلاع |
| **CORS الدلو** | **يُطبَّق برمجيًا عند إقلاع الـ API** (10.10): `S3StorageService.SetBucketCorsAsync()` → `PutCORSConfigurationAsync` بقاعدة واحدة: Methods `GET/PUT/HEAD/POST/DELETE` · Origins `"*"` · Headers `"*"` · Expose `ETag, Content-Range, Accept-Ranges, Content-Length, Content-Type` · MaxAge 3600. الاستدعاء في `Program.cs` بعد `builder.Build()` داخل try-catch (لا يُسقط الـ API عند الفشل؛ يتخطى بيئة `Testing`) — **idempotent**: كل إعادة نشر تُعيد التطبيق ذاتيًا |
| سلوك مهم | **B2 يُرجع 401 (لا 404) للكائنات المفقودة في دلو خاص** — وهذا وراء حادثة 401 الحالية (وثيقة 04) |

### 2.2 Upstash Redis (كاش فقط)

- `UpstashRedisRestCacheService` — HTTPS REST (متوافق مع بيئة serverless). الغرض: **كاش مؤقت حصرًا** (جلسات/بيانات قابلة لإعادة البناء).
- **Upstash Blob (تخزين الملفات) تقاعد في 10.9**: الحساب حرّ تجاوز 1GB فأصبح قراءة-فقط. فئتا `UpstashBlobStorageService`/`UpstashS3ClientFactory` ما زالتا مُصرَّفتين (يُرجعها اختبار وحدة + catch قديم في `AdminCoursesController`) لكن **غير قابلتين للتفعيل** — DI لم يعد يسجّلهما ومتغيراتهما (`UPSTASH__BLOB__TOKEN/S3ENDPOINT`) حُذفت من Render. الحذف الكامل مُؤجَّل لدفعة تنظيف.

### 2.3 Neon Postgres

- قاعدة الإنتاج. **الهجرات تُطبَّق يدويًا بـ SQL** (لا يُستخدم `dotnet ef database update` — النمط المتبع في وثيقة 06 §5).
- هجرتان من Wave 10 (في `apps/api/src/CMS.Infrastructure/Persistence/Migrations/`):
  - `20261025194934_AddMediaBookmarksAndPlaybackProgress` — جدولا `MediaBookmarks`/`PlaybackProgress` (+ فهارس)
  - `20261025211326_AddMediaMetadata` — 7 أعمدة إضافية (`Description`/`Difficulty`/`ProcessingStatus`/`HlsKey`/`TargetQuality` على `CourseEpisode`+`LibraryFile`) + فهرسان جزئيان `WHERE processing_status IS NOT NULL`
- الوصول: عبر لوحة Neon (URL/اسم المشروع لدى المشرف — **UNVERIFIED** هنا؛ راجع الوثيقة 06 §4).

### 2.4 Render (مضيف الـ API)

| البند | القيمة |
|---|---|
| الخدمة | `cms-api-preview.onrender.com` |
| النشر | **auto-deploy من فرع `main`** — كل دفعة إلى main ⇒ نشر تلقائي |
| الصورة | `apps/api/Dockerfile` — مرحلة runtime تثبّت `ffmpeg` (Alpine) |
| البيئة | متغيرات `Storage__S3__*` (٥ قيم) + `UPSTASH__REDIS__RESTURL/TOKEN` + JWT + Postgres + CORS + WhatsApp/Firebase… (الخريطة الكاملة §3) |

### 2.5 Vercel (الواجهتان)

| المشروع | الأصل | CSP |
|---|---|---|
| student-web | `apps/student-web` | في `vercel.json` — ترويسة `Content-Security-Policy` على `/(.*)` (+ بقية الترويسات الأمنية) |
| admin-web | `apps/admin-web` | أُضيفت كتلة الترويسات نفسها في 10.12 (كانت معدومة قبلها) |

**سلسلة CSP الحالية (متطابقة بايت-ببايت بين التطبيقين، بعد 10.13):**
```
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https: https://*.backblazeb2.com;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self' https://api.cms.example.com https://cms-api-preview.onrender.com https://*.backblazeb2.com;
frame-src https://www.youtube.com https://*.backblazeb2.com;
media-src 'self' blob: https: https://*.backblazeb2.com
```
لماذا هذه القيم: `connect-src` يسمح لـ hls.js بجلب `.m3u8/.ts` عبر XHR (إصلاح 10.12 لـ `blocked:csp`)؛ `style-src` يسمح باستيراد CSS الخطوط من `fonts.googleapis.com` (إصلاح 10.13) بينما `font-src` يسمح بالثنائيات من `fonts.gstatic.com`؛ نطاق R2 القديم حُذف في 10.12.

---

## 3. خريطة متغيرات البيئة (Render → الكود → الوظيفة)

| متغير Render | يقرؤه | يتحكم في |
|---|---|---|
| `Storage__S3__Endpoint` | `S3StorageService` ctor (`configuration["Storage:S3:Endpoint"]`) | نقطة B2 — `AmazonS3Config.ServiceURL` |
| `Storage__S3__Region` | نفس الموقع | `AuthenticationRegion` = `eu-central-003` |
| `Storage__S3__BucketName` | نفس الموقع | الدلو المستهدف `CMSmedia` (fail-closed منذ 10.9 — كان يسقط لـ`cms-files` silently) |
| `Storage__S3__AccessKey` / `Storage__S3__SecretKey` | نفس الموقع | مفاتيح تطبيق B2 (توقيع كل عمليات S3 + presign) |
| `UPSTASH__REDIS__RESTURL` / `UPSTASH__REDIS__RESTTOKEN` | `UpstashRedisRestCacheService` | الكاش فقط |
| ~~`UPSTASH__BLOB__TOKEN`~~ / ~~`UPSTASH__BLOB__S3ENDPOINT`~~ | — | **محذوفان من Render (10.9)** — إعدادهما بلا أثر |
| `FFMPEG_PATH` / `FFPROBE_PATH` / `FFMPEG_TIMEOUT_MINUTES` | `VideoTranscodingService` (`ResolveFfmpegPath` …) | موقع/مهلة ثنائيي ffmpeg داخل الحاوية |
| `JWT_SECRET` / `JWT_ISSUER` / `JWT_AUDIENCE` / صلاحيات التوكن | خدمات المصادقة | الجلسات والأدوار |
| `CORS_STUDENT_APP` / `CORS_ADMIN_APP` | `Program.cs` (سياسة CORS للـ API) | أصول الواجهتين المسموحة للـ API |
| Postgres (سلسلة الاتصال/قيم `POSTGRES_*`) | `ApplicationDbContext` | Neon |
| `WHATSAPP_*` / `FIREBASE_*` / `SENTRY_*` / `RATE_LIMIT_*` / `FEATURE_*` | خدماتها | خيارات من موجات سابقة (غير مُجدَّدة في Wave 10) |

> القاعدة: ‎.NET يحوّل الشرطات المزدوجة `__` إلى تسلسل هرمي — `Storage__S3__Endpoint` ⇔ `Storage:S3:Endpoint`. جميع القيم الخمس لـ S3 **إلزامية** — غياب أيها يرمي `InvalidOperationException` عند الإقلاع (fail-closed).

---

## 4. مسارات البيانات (مخططات نصية)

### 4.1 مسار الرفع (Single PUT — منذ 10.8f، يعمل على B2)

```
[Admin UI: SinglePutUploadPanel]
  1) POST /api/v1/admin/courses/{courseId}/episodes/initiate-upload
        └─ CourseHandlers: يبني fileKey = episodes/{guid}{ext}
           → GetSignedUploadUrlAsync(key, contentType, 10min, fileSize)   [توقيع content-type + الحجم]
           → يخزّن UploadId = "single-put" (sentinel، بلا تغيير schema)
  2) XHR PUT واحد للـ uploadUrl من المتصفح مباشرة إلى B2
        (Content-Type + Content-Length موقّعان في الرابط؛ CORS الدلو يسمح — PUT/HEAD/`*` headers)
  3) POST .../complete-upload  (بلا parts)
        └─ HEAD للكائن (GetObjectSizeAsync) إثباتًا للوصول + تحقق الحجم
           → ProcessingStatus=Pending (فيديو) → إدراج طابور الترميز بعد الـ commit
  [إلغاء] POST .../abort-upload → حذف الكائن best-effort + تحرير الحلقة
```
قيد مؤكد: **عمر الرابط 600 ثانية** — الملف كله يجب أن يصل خلالها (2.5GB يحتاج ‎~34Mbps). لا استئناف نقطي في Single PUT.

### 4.2 مسار الترميز (FFmpeg — يعمل)

```
VideoTranscodingService (BackgroundService، مستهلك واحد، طابور bounded 200)
  dequeue → [سجل 10.13: "Transcoding job started: {type} {id}"]
  → skip-check: الحلقة موجودة + status=Pending + FileKey غير فارغ (وإلا: سجل تحذير تخطٍّ)
  → DownloadAsync(sourceKey) من B2 → ffprobe (الأبعاد/المدة/الصوت)
  → BuildHlsLadderArgs: سلّم حتى 3 درجات (360p/800k · 720p/2800k · 1080p/5000k؛ درجات أعلى من المصدر تُحذف — لا upscale)
  → أمر ffmpeg واحد بـ var_stream_map → شجرة {key}/hls/{master.m3u8, *.m3u8, *.ts}
  → رفع الشجرة PutAsync لكل ملف (m3u8: application/vnd.apple.mpegurl · ts: video/mp2t)
  → HlsKey = {sourceKey}/hls/master.m3u8 + status=Ready
     [سجل 10.13: "Transcoding job completed: … status=Ready HlsKey=…"]
  فشل في أي مرحلة → status=Failed (سجل ثنائي اللغة عربي/إنجليزي) — إعادة المحاولة يدوية (abort + رفع جديد)
  إيقاف المضيف → إعادة الحالة Pending لإعادة الالتقاط عند الإقلاع (sweep استرداد)
```

### 4.3 مسار التشغيل (HLS — **مكسور في المتصفح؛ انظر وثيقة 04 §1**)

```
[Student: CoursePlayerPage] processingStatus ≠ Ready → بطاقة مقفلة (لا مشغّل)
  Ready → VideoPlayer → POST /api/v1/media/{assetType}/{assetId}/playback-url
           └─ MediaHandlers: بوابة الاستحقاق (X-Entitlement) ثم ResolveHlsKeyForPlayback:
              Ready+HlsKey → GetSignedUrlAsync(hlsKey, 540s)  [سجل 10.13: "Presigned GET issued: …"]
              Pending/Transcoding_* → 409 · Failed → 422 (رسالتان)
  VideoPlayer (hls.js): يجلب master.m3u8 من الرابط الموقّع
           ⚠ ثم يحلّ الروابط النسبية للمقاطع index-*.m3u8 و seg-*.ts
             ⚠ هذه الطلبات **بلا توقيع** → B2 يرد 401 → حلقة تجديد الرابط اللانهائية («تجديد الرابط…»)
  (MP4 المباشر/الصوت: نفس المسار يعمل — كائن واحد = توقيع واحد صالح)
```

---

## 5. ملخص نقاط النهاية المضافة في Wave 10

| نقطة النهاية | المتحكم | المصادقة | الوظيفة |
|---|---|---|---|
| `POST /api/v1/media/{assetType}/{assetId}/playback-url` | `MediaController` | طالب + `X-Entitlement` + `X-Installation-Id` | رابط تشغيل موقّع (HLS عند Ready / MP4 غير ذلك)؛ 409 أثناء المعالجة، 422 عند الفشل |
| `POST /api/v1/media/{assetType}/{assetId}/bookmarks` | `MediaController` | نفسها | إنشاء علامة (نافذة ≤ ساعة)؛ ترويسة `X-Duration-Warning` |
| `GET /api/v1/media/{assetType}/{assetId}/bookmarks` | `MediaController` | نفسها | قائمة العلامات |
| `PATCH /api/v1/media/bookmarks/{bookmarkId}` | `MediaController` | مالك العلامة | تعديل العنوان/الملاحظة |
| `DELETE /api/v1/media/bookmarks/{bookmarkId}` | `MediaController` | مالك العلامة | حذف |
| `POST /api/v1/media/{assetType}/{assetId}/progress` | `MediaController` | نفسها | Upsert موضع التشغيل (الاكتمال مشتق خادميًا — قاعدة 95%) |
| `GET /api/v1/media/{assetType}/{assetId}/progress` | `MediaController` | نفسها | استئناف الموضع (204 عند لا سجل) |
| `POST /api/v1/admin/courses/{courseId}/episodes/initiate-upload` | `AdminCoursesController` | مشرف (`btn:…upload`) | إصدار رابط PUT موقّع + fileKey |
| `POST /api/v1/admin/courses/episodes/{id}/complete-upload` | `AdminCoursesController` | مشرف | إثبات HEAD + بيانات وصفية اختيارية + إدراج الترميز |
| `POST /api/v1/admin/courses/episodes/{id}/abort-processing` | `AdminCoursesController` | مشرف | Failed + قتل ffmpeg الجاري (10.8) |
| `POST /api/v1/admin/courses/episodes/{id}/abort-upload` | `AdminCoursesController` | مشرف | إلغاء رفع جارٍ + تنظيف |
| `GET /api/v1/admin/courses/episodes/{id}/multipart-status` | `AdminCoursesController` | مشرف | (legacy) صفوف multipart القديمة فقط |
| `POST /api/v1/courses/episodes/{id}/access` | `CoursesController` | طالب + استحقاق | مغلف وصول قديم (يوتيوب/صوت + العدّاد + الرمز المائي) |

`assetType` ∈ `library-file` | `course-episode`.

---

## 6. الحقائق الحرجة للجلسة القادمة (cheat-sheet)

1. **كل التخزين عبر `S3StorageService`** — لا تلمس `UpstashBlobStorageService` (كود ميت).
2. **CORS الدلو تُدار من الكود** (10.10) — لا تُعدّلها من واجهة B2 (لا تدعم wildcard headers/ExposeHeaders).
3. **CSP تُدار من `vercel.json` في التطبيقين** — أي نطاق تخزين جديد يتطلب تحديث `connect-src`+`media-src` معًا (الدرس من 10.12).
4. **كل دفعة إلى `main` = نشر تلقائي في Render+Vercel** — لا تندمج قبل اختبار على فرع `wip/*` ودفع موقوف على قرار المشرف.
5. `MediaPolicy.cs` هو **المصدر الوحيد لأعمار الروابط** (540/600/300/600 — كلها ≤ حد B2/Upstash 600s).
6. السجلات التشخيصية الحالية (من 10.13): `Presigned GET issued` / `Transcoding job started|skipped|completed` — مؤقتة وتُزال بعد الحادثة.

*التاريخ الكامل للدفعات والإصلاحات: وثيقتا 02 و03. المشاكل المفتوحة: وثيقة 04.*
