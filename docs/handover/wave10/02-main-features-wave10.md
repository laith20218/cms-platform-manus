# الوثيقة 02 — الميزات الرئيسية: موجات 10.0 → 10.8

> **Wave 10 — تسليم الجلسة النهائي** · الفرع: `handover/wave10-final` (من `main` @ `17754a1`)
> لكل موجة: الهدف، الملفات، القرارات التقنية ومبرراتها، نتائج الاختبارات، وما أُجِّل. الأرقام من `WIP_STATUS.md`/`worklog.md` في المستودع (المصدر الأوثق).

---

## Push 10.0 — الأساس الخلفي: بثّ + علامات + تقدّم (commits: `e73f217`, `82d438f`, `8c61ee1`، ثم 10.0b `b90b399`/`6c61a77` و10.0c `f79140b`)

**الهدف**: أساس الوسائط للطالب — روابط تشغيل موقّعة قصيرة العمر، علامات مرجعية زمنية، وتتبّع تقدم مع اكتمال مشتق خادميًا.

**الملفات الأساسية**:
- `CMS.Domain/Constants/MediaPolicy.cs` — المصدر الوحيد لأعمار الروابط (540/600/300/600s + سقف 600)
- `CMS.Domain/Entities/MediaEntities.cs` — `MediaBookmark` + `PlaybackProgress` (+ فهرسة inline في `ApplicationDbContext`)
- `CMS.Application/{Commands,DTOs,Handlers}/Media/*` — 7 معالجات MediatR
- `CMS.Api/Controllers/MediaController.cs` — النقاط + بوابة `X-Entitlement`/`X-Installation-Id`
- الهجرة `20261025194934_AddMediaBookmarksAndPlaybackProgress` (مولّدة؛ التطبيق يدوي لاحقًا)

**قرارات مفتاحية**:
- **TTL في ملف واحد** (`MediaPolicy`) بعد أن كانت مبعثرة في 3 مواقع — تعديل واحد يحكم الجميع.
- **الاكتمال يُشتق خادميًا دومًا** (قاعدة 95%): العميل لا يرسل نسبة يختارها بنفسه — يمنع التلاعب بإتمام المشاهدة.
- **10.0c (أمني)**: تحويل `playback-url` ومسار `/access` من «اعتماد بيانات جلسة موسّعة النطاق» (كان يضمّن `X-Amz-Security-Token` في كل رابط — منحة قراءة/كتابة للدلو كامل!) إلى **presign كائن-محدد** عبر `GetSignedUrlAsync` + اختبار انحدار `Times.Never` على المسار القديم.
- التحقق الحي للمشرف على Range: **PASS** (206 Partial Content) — أساس صحة البث لاحقًا.

**الاختبارات**: 44/44 وسائط (InMemory) + 293/293 انحدار وحدات. (ملاحظة تاريخية: أعيد بناء 10.0 بعد إعادة ضبط الـ sandbox — SHAs الأصلية مفقودة، الموثّقة هنا هي SHAs إعادة البناء.)

**المؤجَّل**: تطبيق الهجرة على Neon (فعلها المشرف يدويًا لاحقًا)؛ مستند `docs/ops/r2-cors.md` للسياسة.

---

## Push 10.1 — هيكل المشغّل والنافذة الملء (`3c4f3c4`, `d4c8bbd`)

**الهدف**: غلاف Modal سينمائي للمشغّل + حماية المحتوى + تحميل كسول.

**الملفات**: `apps/student-web/src/features/media-player/` — `PlayerShell.tsx` (Radix Dialog + Fullscreen على المسرح لا العنصر — عناصر التحكم تبقى ظاهرة)، `protection/usePlayerProtection.ts` (رادعات نسخ/سياق على مستوى المشغّل فقط)، `LazyPlayerMount.tsx` (lazy + IntersectionObserver).

**قرارات مفتاحية**:
- الحماية **نطاقها المشغّل** (capture-phase) — لا تفسد كتابة الحقول في باقي الصفحة.
- **إصلاح سباق attach** (اكتشفه e2e): البوابات (Radix/AnimatePresence) تركّب المسرح commit بعد `open` — مرآة الحاوية إلى state عبر callback ref بدل ref وحده.
- الاقتصاد على الموارد: Chromium واحد في e2e بحد ذاكرة — ذروة RSS **861MB**.

**الاختبارات**: e2e `player-shell` **16/16**، صفر أخطاء console؛ vitest 117/117.

**المؤجَّل**: صفحة اختبار مؤقتة (حُذفت لاحقًا في 10.8)؛ `PlayerShell` صار بلا مستخدم إنتاجي بعد 10.8 (احتُفظ به لمشغّلات مستقبلية — tree-shaken).

---

## Push 10.2 — مشغّل الفيديو الحقيقي (`1e45933`, `4554e5f`)

**الهدف**: `VideoPlayer` إنتاجي متكامل على API الحقيقي — تحكم مخصص، تحديث صامت للرابط، استئناف، تقدّم، علامات.

**الملفات**: `video/VideoPlayer.tsx`، `hooks/useMediaLease.ts` (مؤقت `ttl−60s` + backoff ×3)، `video/ControlsBar.tsx` (Radix-Slider مع مؤشر buffer، سرعة، صوت، ملء شاشة)، `video/BookmarkDialog.tsx`، `services/media-api.ts` (بما فيه حفظ keepalive عند الإغلاق عبر `fetch`+keepalive بترويسات مُطابقة يدويًا للمُعترضات)، عناصر تحكم لوحة مفاتيح كاملة (Space/K/J/L/M/F).

**قرارات مفتاحية**:
- **لا hls.js بعد** — الروابط كانت MP4 كائنًا واحدًا (Range مُتحقَّق)؛ الوسم `<video>` الأصلي كافٍ، القفل لم يُفتح (قرار تبعيّ نظيف).
- الحفظ الأخير **keepalive** لأن axios لا يُنتظر عند teardown الصفحة.
- **3 علل إنتاجية اصطادها الـ e2e**: حالة الصوت/الكتم لم تكن تصل للعنصر؛ حوار العلامة كان يعيد تهيئة الحقول 4×/ثانية يمحو الكتابة؛ تدرّج شريط التحكم يبتلع نقرات زر التشغيل على الشاشات القصيرة.

**الاختبارات**: e2e `player-video` **16/16** ضد MP4 حقيقي ولّده ffmpeg محليًا (بما فيه مبادلة رابط سلسة مع حفظ الموضع)؛ ذروة RSS 1.01GB؛ vitest 117/117.

**المؤجَّل**: دعم HLS (جاء في 10.4)؛ مشغّل الصوت المخصص (بقي مسارًا أبسط).

---

## Push 10.3 — خط أنابيب FFmpeg + المخطط (`629ec9c`, `81e763e`)

**الهدف**: تحويل الفيديو المرفوع إلى سلّم HLS على الخادم + أعمدة البيانات الوصفية وحالة المعالجة.

**الملفات**: `CMS.Application/BackgroundJobs/VideoTranscodingService.cs` (الطابور bounded 200 + مستهلك `BackgroundService`)، `BackgroundJobs/FfmpegLadder.cs` (بناء أوامر السلّم)، `CMS.Domain/Enums/MediaEnums.cs` (`ProcessingStatus`)، أعمدة الكيانات، الهجرة `20261025211326_AddMediaMetadata`، `Exceptions/MediaProcessingException.cs` → خريطة الوسيط إلى **422** برسالتين (عربي/إنجليزي)، `Dockerfile` (تثبيت ffmpeg).

**قرارات مفتاحية**:
- **أمر ffmpeg واحد** بـ `var_stream_map` (وليس عملية لكل درجة) — معيار الصناعة؛ الدرجات تتقدم lockstep فحالات Rung = أطوار التقدم (`-progress pipe:1`).
- **لا upscale أبدًا**: درجات أعلى من ارتفاع المصدر تُسقط (360p أرضية) — قرار أعاد التأكيد في 10.6-2.
- **التحقق الحي للأمر**: مصادر حقيقية 1080p+صوت و480p بلا صوت — اكتشف تعليقًا حقيقيًا (**`-nostdin`** كان مفقودًا → وضع stdin التفاعلي!) قبل الإنتاج.
- رسالة الفشل ثنائية اللغة في ProblemDetails (extensions humanMessage/technicalDetails).

**الاختبارات**: بناء أخضر؛ وحدات **294/294** (تعديل 4 مواقع ctor).

**المؤجَّل**: التشغيل يوقّع `FileKey` (MP4) — التحويل إلى HlsKey جاء في 10.5؛ عمود `ProcessingError` (الفشل يسجل في اللوجات فقط)؛ الطابور في الذاكرة (إعادة التشغيل تُسقط الطابور — sweep الاسترداد جاء لاحقًا).

---

## Push 10.4 — واجهتا الرفع والتشغيل (hls.js) (`b0f9d7a`, `c9bbe82`, `339b50a`, `435c6a9`)

**الهدف**: لوحة مشرف كاملة للبيانات الوصفية وآلة حالات المعالجة + مشغّل طالب ثنائي المحرك HLS/MP4.

**الملفات** (طرف الطالب): `video/VideoPlayer.tsx` (hls.js@1.7.3 — الاستثناء الوحيد للقفل، +8 أسطر) — شمّ رابط m3u8 من **pathname** كي لا تكسر سلاسل الاستعلام التوقيع؛ تحديث صامت للـ HLS عبر `hls.loadSource(newUrl)` + `startLoad(playhead)`. (طرف المشرف): `EpisodeMetadataFields.tsx`، `ProcessingTimeline.tsx` (جُمل عربية حرفية للمراحل)، `ProcessingErrorModal.tsx` ثنائي اللغة مع نسخ الخطأ التقني، `lib/mediaProcessing.ts`، `AccessibleModal.tsx` (مودال يدوي بديل Radix — لا حزم Radix هناك والاستثناء hls.js فقط).

**قرارات مفتاكية**:
- **تدهور أمين**: حين كان الـ API لا يُرجع `processingStatus` بعد → المُصعّد يُحسب Ready (المصدر MP4 قابل للعب فورًا) — لا سبينر لا نهائي، والسلّم يشتغل لحظة وصول الحقل بلا تغيير واجهة.
- استطلاع poll واحد كل 3s لكل drawer (لا لكل حلقة) — اقتصاد شبكة.
- قيم الصعوبة رقمية 0|1|2 مع تطبيع القارئ لسلاسل enum مستقبلية — توافق الجهتين.

**الاختبارات**: e2e admin-upload **20/20** (سلّم مُوقّع الخطوات 8%→32%→58%→84%→100%، مودال الفشل، النسخ، إعادة المحاولة)؛ e2e player-hls **19/19** ضد **سلّم 360p+720p حقيقي** ولّده ffmpeg محليًا (بما فيه مبادلة رابط ≥2 مع بقاء الموضع)؛ player-video انحدار 16/16. ذروة RSS: 961MB/1034MB. vitest: طالب 117/117 · مشرف 34/34.

**المؤجَّل**: توصيل الـ DTOs الخلفي (جاء 10.5)؛ endpoint إعادة الإدراج الحقيقي (زر Retry كان يعيد الاستطلاع فقط).

---

## Push 10.5 — تكامل الـ API وكشف البيانات الوصفية (`7a64b57`)

**الهدف**: الواجهات (المجّهزة منذ 10.4) تجد بياناتها: أعمدة وصفية + `processingStatus`/`processingError`/`hlsKey` في الـ DTOs + تحويل playback-url إلى HLS عند الجاهزية + كتابة البيانات الوصفية عند الإتمام/التعديل.

**الملفات**: `DTOs/Courses/CourseDtos.cs` + `DTOs/Library/*` (مفاتيح additive اختيارية — توافق مصدري كامل)، `Handlers/Courses/CourseHandlers.cs` (`MapToEpisodeDto`)، `Handlers/Media/MediaHandlers.cs` (`ResolveHlsKeyForPlayback` — بعد بوابة الاستحقاق حصرًا)، `Handlers/Library/LibraryHandlers.cs`، DTOs الطلبات في المتحكمات.

**قرارات مفتاحية**:
- **`ResolveHlsKeyForPlayback`** آلة قرارات صريحة: null⇒مسار المصدر (تدهور أمين) · Pending/Transcoding⇒**409** برسالة ثنائية · Failed⇒**422** ProblemDetails · Ready+key⇒presign لـ `master.m3u8` بنوع `application/vnd.apple.mpegurl` (شمّ pathname في الواجهة يشغّل hls.js تلقائيًا) · Ready بلا key⇒مسار المصدر.
- `ProcessingError` في الـ DTO **سلسلة مُصنَّعة** من `MediaProcessingFailure.TechnicalDetails` (لا عمود في القاعدة — لا هجرة مُصرَّح بها آنذاك) — مطابقة لعقد الواجهة المنشورة (string).
- كشف حالة المعالجة **بعد** بوابة الاستحقاق — لا تسريب حالة لغير المستحقين.

**الاختبارات**: تركيز `Media|Course|Library` handlers → **110/110** (منها 20 حالة جديدة). كاملة: 400 passed / 27 failed (فئة PostgresIntegration عند حارس البيئة — دَين CI معروف، ليس انحدارًا).

**المؤجَّل**: التطبيق الفعلي لهجرة `AddMediaMetadata` على Neon (يدويًا لاحقًا)؛ endpoint إعادة إدراج؛ مشغّل الصوت (توقف عند بوابة موافقة المشرف).

---

## Push 10.6 + 10.6-2 — مرونة رفع + صحة السلّم (`9412dee`, `ee6e3a1`)

**الهدف (10.6)**: صمود الرفع أمام فشل CORS المؤقت (إعادة محاولة/مزامنة حالة)؛ **(10.6-2)**: إصلاحان حقيقيان: منع الـ upscale فعليًا في السلّم + حماية OOM على Render.

**القرارات المفتاكية (10.6-2)**:
- الدرجات فوق ارتفاع المصدر تُسقط **قبل** بناء الأمر (كانت تُبني وتُهدر) — سلّم 480p = `360p` فقط.
- **حارس ذاكرة**: مهلة 60 دقيقة + قتل شجرة العمليات كاملة + مساحة عمل `/tmp/cms-transcode` تُمسح في `finally` — حماية عامل Render من مفاجآت ffmpeg.

**الاختبارات**: أساس الوحدات في حينه (336/336 في 10.8 اللاحقة تشمل هذا) + اختبارات حية للسلّم (`VideoTranscodingTargetQualityLiveTests` لاحقًا: مصدر 720p حقيقي → P360=`[360p]` · Auto=`[360p,720p]`).

**المؤجَّل/ملاحظة**: 10.6 كانت آخر موجة «ميزات» قبل سلسلة الإصلاحات العاجلة 10.8c–10.8f التي سببها مزوّد Upstash في الإنتاج (وثيقة 03).

---

## Push 10.7 — اختيار الجودة اليدوي (`b093d1a`)

**الهدف**: يختار المشرف جودة الهدف (`TargetQuality`: Auto/P360/P720/P1080) لكل حلقة — درجة واحدة أم سلّم مصدري.

**الملفات**: عمود `TargetQuality` (الهجرة نفسها `AddMediaMetadata`)، `CourseCommands/Handlers` (initiate يستقبل الهدف ويخزّنه)، `FfmpegLadder.BuildHlsLadderArgs(..., targetQuality)` — هدف محدد ⇒ درجة واحدة؛ `CoursesCenter.tsx` قائمة منسدلة للتقدير + تمرير الهدف في جسم complete-upload.

**قرارات مفتاحية**: الهدف يُخزَّن **على الحلقة** (يُغذي مودال التحرير لاحقًا في 10.8) وينتقل حرفيًا إلى بنّاء الأوامر — دليل الاتصال هو سجل `Starting job: ID, Target, SourceHeight, Rungs`.

**الاختبارات**: وحدات TargetQuality ×2 + شواهد حية (ffmpeg حقيقي 7.1.5).

**المؤجَّل**: لا شيء جوهريًا لهذه الموجة — اكتملت.

---

## Push 10.8 — ربط الجودة + إلغاء المعالجة + المشغّل الإنتاجي (`63cdb09`)

**الهدف**: أربع حدود HTTP: ربط TargetQuality عبر initiate→encoder مع دليل حي؛ SD/HD/FHD + خط زمني ديناميكي؛ **abort-processing** (قتل ffmpeg جارٍ)؛ توريد المشغّل المخصص في صفحة الكورس مع بطاقة البيانات الوصفية والحالات المقفلة.

**الملفات**: `CourseHandlers.cs` (استقبال الهدف + `ITranscodingJobRegistry.TryCancel`)، `VideoTranscodingService.cs` (CTS مرتبط بالمهمة يسجَّل **قبل** فحص التخطي — سباق الإلغاء مع الالتقاط)، `CoursesCenter.tsx` + `ProcessingTimeline.tsx` (`processingPhasesFor(target)` — P360=`[Pending,rung,Ready]`؛ Auto=خمس خطوات؛ حالة legacy خارج المجموعة توسّع أمينًا)، `CoursePlayerPage.tsx` (مشغّل مخصص داخل غلاف سينمائي + `EpisodeMetadata` + بوابة 2.C)، حذف صفحة الاختبار المؤقتة.

**قرارات مفتاكية**:
- الإلغاء: الحالة تُكتب **Failed أولًا** ثم يُلغى التوكن (الإجهاض المتسابق مع الالتقاط يقرأ Failed فيتخطى — العقد: لا يُستأنف أبدًا بعد إجهاض إداري).
- SQL إنقاذية للحلقة العالقة 58% (Neon): `UPDATE course_episodes SET processing_status = 5 WHERE deleted_at IS NULL AND processing_status IN (1,2,3);` (5=Failed).
- سجل الإثبات الإلزامي: `Starting job: ID={Id}, Target={TargetQuality}, SourceHeight={SourceHeight}, Rungs={Rungs}` — يثبت وصول اختيار المشرف إلى المُرمِّز حرفيًا.

**الاختبارات**: API 336/336 (+2 حية)؛ vitest طالب 117/117 · مشرف 34/34؛ e2e: player-video 17/17 · player-hls 19/19 · admin-upload 28/28.

**المؤجَّل**: `PlayerShell`/`LazyPlayerMount` بلا مستخدم إنتاجي (احتُفظ بهما)؛ مشغّل الصوت لم يُبدأ (بوابة موافقة).

---

## ملاحظة ختامية حول 10.8→10.13

بعد 10.8 دخلت الموجة طور **الإصلاحات العاجلة** (10.8c–10.8f ثم 10.9/10.10/10.12/10.13) بسبب حوادث مزوّد التخزين المتعاقبة (Upstash ثم B2) — توثّقها كاملةً الوثيقة 03. مخرَج تلك السلسلة هو البنية الحالية: **B2 موفّرًا وحيدًا + رفع Single PUT + CORS تلقائي + CSP محدّثة**، وبقي عائقًا واحدًا حرجًا: **401 على مقاطع HLS** (وثيقة 04 §1).
