# الوثيقة 06 — دليل التشغيل (Operations Manual)

> **Wave 10 — تسليم الجلسة النهائي** · الفرع: `handover/wave10-final` (من `main` @ `17754a1`)
> دليل عملي للمشرف: النشر، التراجع، تدوير الاعتمادات، الوصول للقاعدة، الهجرات، قراءة سجلات التشخيص، وورقة الغش لرموز الأخطاء.

---

## 1. كيف تنشر

> **النشر = دفع إلى `main`** — كل من Render و Vercel يترصدان main بنشر تلقائي.

```
git checkout main
git merge wip/<X.YZ>          # بعد موافقتك واختبار الإنتاج على الفرع
git push origin main
```
- **Render** (`cms-api-preview.onrender.com`): يعيد بناء الصورة (Dockerfile + ffmpeg) عند كل دفعة إلى main. مدة البناء المعتادة: بضع دقائق.
- **Vercel** (مشروعا student-web و admin-web): يعيدان النشر تلقائيًا من المستودع (ترويسات `vercel.json` تُطبَّق لكل deployment جديد).
- **تحقق ما بعد النشر**: (1) سطر `B2/S3 CORS configuration applied successfully to bucket CMSmedia.` في سجل Render عند الإقلاع (10.10)؛ (2) جلب `/` أو نقطة صحية؛ (3) فتح الواجهتين.
- **عُرف سير العمل** (التُزم طوال Wave 10): التطوير على `wip/X.YZ` → بناء + اختبارات → دفع الفرع → **STOP GATE** (اختبار إنتاج بيد المشرف) → الدمج بيد المشرف فقط.

## 2. كيف تتراجع

**الخيار أ — `git revert` (المفضل، موثّق، قابل للتتبع):**
```
git checkout main
git revert <SHA-سيّئ>        # ينشئ commit معاكس
git push origin main         # Render+Vercel يعيدان النشر تلقائيًا
```

**الخيار ب — التراجع إلى SHA سابق:**
```
git checkout main
git reset --hard <SHA-جيد>
git push --force-with-lease origin main     # حذر: يعيد كتابة التاريخ
```

**الخيار ج — Render UI rollback** (للـ API فقط، دون تغيير git): Render → Service → Events → آخر deployment ناجح → **Rollback** — ثم أصلح الكود بgit كي لا يفلت التناقض.

> ملاحظة Vercel: التراجع عبر git يخاطب المشروعين معًا؛ لو أردت تجميد واجهة فقط، عطّل auto-deploy لها من لوحة Vercel مؤقتًا.

## 3. تدوير الاعتمادات (خطوة-خطوة)

### Backblaze B2 (الأهم — انظر القضية 04 §4)
1. لوحة B2 → App Keys → **Add Application Key**: الاسم `cms-api-key-XX`، النطاق: bucket `CMSmedia` حصرًا، الصلاحيات: `Read & Write` (+ تأكد ضمنيًا من `setBucketCors` ضمن writeBucket — سجل الإقلاع بعد التبديل يثبتها).
2. Render → Environment → حدّث: `Storage__S3__AccessKey` = keyID الجديد، `Storage__S3__SecretKey` = applicationKey الجديد → Save (يُعيد النشر تلقائيًا).
3. تحقق: سجل `B2/S3 CORS configuration applied successfully` + سطر `Presigned GET issued` يُظهر keyID الجديد في `X-Amz-Credential`.
4. بعد ‎≥24 ساعة سليمة: احذف/أبطل المفتاح القديم من B2.
5. لا تغيير كود مطلوب أبدًا (الكود config-driven — تحقق دوري: `rg "Storage:S3:AccessKey" apps/api/src`).

### Upstash Redis (الكاش)
1. Upstash → Database → rotate token → نسخ REST URL/TOKEN الجديدين.
2. Render → حدّث `UPSTASH__REDIS__RESTURL`/`UPSTASH__REDIS__RESTTOKEN` → إعادة نشر.
3. الكاش آمن التدوير بالكامل (بياناته قابلة لإعادة البناء).

### Neon Postgres
1. Neon → Project → Roles/كلمة مرور جديدة (أو مشروع جديد مع استعادة فرع).
2. حدّث قيم Postgres في Render → إعادة نشر.
3. للتبديل بين مشاريع/فروع Neon: حدّث سلسلة الاتصال ثم **تحقق من الهجرات المطبقة** في الوجهة (جدول `__EFMigrationsHistory`) قبل فتح الخدمة.

## 4. الوصول إلى قواعد البيانات

- **Neon Console**: https://console.neon.tech → المشروع (اسم المشروع/البريد المالك لدى المشرف — **UNVERIFIED** هنا: غير مسجل في المستودع عمدًا لأسباب أمنية).
- من اللوحة: **SQL Editor** (تشغيل استعلامات مباشرة — هذا مسار تطبيق الهجرات، §5) أو **Connection string** (psql/أداة تفضلها).
- الفروع (branches): الإنتاج على الفرع الرئيسي؛ يمكن إنشاء فرع اختبار للاستنساخ الآمن.
- جداول Wave 10 ذات الصلة: `course_episodes` (الأعمدة: `description`, `difficulty`, `processing_status`, `hls_key`, `target_quality`, `upload_id`), `library_files` (مثلها عدا الوصف), `MediaBookmarks`, `PlaybackProgress`.

## 5. تشغيل الهجرات (النمط اليدوي المتَّبع)

> **لا يُستخدم `dotnet ef database update`** — النمط المعتمد: توليد السكربت، مراجعته، ثم تشغيله في Neon SQL Editor.

```bash
cd apps/api
export DOTNET_ROOT=/home/z/.dotnet && export PATH=$PATH:/home/z/.dotnet
dotnet ef migrations script <من-الهجرة> -o /tmp/mig.sql -p src/CMS.Infrastructure -s src/CMS.Api
# راجع /tmp/mig.sql (يجب أن يكون: أعمدة nullable/default + فهارس جزئية — آمن على بيانات حية)
```
ثم في Neon SQL Editor: نفّذ السكربت داخل معاملة واحدة (السكربت المولّد يتضمن `BEGIN/COMMIT` افتراضيًا).
- تحقق: `SELECT * FROM "__EFMigrationsHistory" ORDER BY "MigrationId";` — يجب أن ترى `20261025194934_AddMediaBookmarksAndPlaybackProgress` و`20261025211326_AddMediaMetadata`.
- **الهجرتان أعلاه مُطبَّقتان في الإنتاج** (طبّقهما المشرف يدويًا خلال الموجة).
- مثال SQL تشغيلية (إنقاذ حلقات عالقة في المعالجة — من 10.8):
```sql
UPDATE course_episodes SET processing_status = 5   -- 5 = Failed
WHERE deleted_at IS NULL AND processing_status IN (1,2,3);
```

## 6. جهات الاتصال للطوارئ

N/A — المشرف هو الجهة الوحيدة (فريق شخص واحد + وكيل GLM). المستودع: `github.com/laith20218/cms-platform-manus`.

## 7. ورقة غش رموز الأخطاء (الأرجح أولًا في هذا المشروع)

| الرمز | أين | الأرجح في مشروعنا | الفحص الأول |
|---|---|---|---|
| **401** | جلب `.m3u8/.ts` من B2 في المتصفح | **مقاطع HLS غير موقّعة** (رابط master موقّع فقط — القضية 04 §1) أو كائن غير موجود بدلو خاص (B2 يرد 401 لا 404!) | سطر `Presigned GET issued` في سجل Render + تنزيل الـ master ومعاينة المسارات |
| 401 | طلب API | توكن JWT منتهٍ (الواجهة تُجدّد تلقائيًا — إن تكرر: جلسة فاسدة) | إعادة دخول؛ ترويسات Authorization |
| **403** | initiate-upload/PUT إلى B2 | انتهاء صلاحية رابط الرفع (600s) أو عدم تطابق Content-Type/Length الموقّعين | جسم خطأ B2 (XML `SignatureDoesNotMatch`/`AccessDenied`) من تبويب الشبكة |
| **409** | playback-url | **سلوك مقصود**: الأصل قيد الترميز (Pending/Transcoding) | بطاقة «قيد المعالجة» في الواجهة؛ اكتمل ⇒ يعمل |
| **422** | playback-url | **مقصود**: فشل الترميز (Failed) | رسالة ثنائية اللغة في ProblemDetails (humanMessage/technicalDetails) |
| **503** | initiate-upload | رفض مزوّد التخزين عند العميل (خريطة 10.8c) | سجل `S3 … rejected: HTTP {code}` — تحقق من قيم `Storage__S3__*` الخمس |
| **500** | أي | استثناء غير معالج | سجل Render الكامل + `ExceptionHandlingMiddleware` |
| **(blocked:csp)** | طلبات وسائط في المتصفح | CSP لا يشمل الأصل | `vercel.json` للتطبيق المعني (connect-src للـ XHR) |
| **status 0** | رفع/جلب من B2 | فشل CORS على مستوى الدلو (preflight) | سجل `B2/S3 CORS configuration applied` موجود؟ (10.10 يعيد التطبيق كل إقلاع) |

## 8. قراءة سجلات التشخيص (المُنشَرة منذ 10.13)

| السطر (في Render) | متى | ماذا يخبرك |
|---|---|---|
| `Presigned GET issued: ServiceURL={…} Bucket={…} Key={…} ExpiresIn={…}s Url={…}` | كل إصدار رابط تشغيل/وصول/مكتبة | **الأداة المركزية لحادثة 401**: Key الموقَّع بالضبط، و`X-Amz-Credential` (مرئي عمدًا) يسمّي **keyID الموقِّع** — دليل التدوير. التوقيع مقنّع `[REDACTED]` |
| `B2/S3 CORS configuration applied successfully to bucket CMSmedia.` | عند كل إقلاع | 10.10 عمل: المفتاح يملك `setBucketCors` والسياسة مطبَّقة |
| `Failed to apply B2/S3 bucket CORS …` (تحذير) | إقلاع فاشل | المفتاح بلا صلاحية setBucketCors أو قيم S3 خاطئة — الـ API يعمل رغم ذلك؛ راجع المفتاح |
| `Transcoding job started: {AssetType} {AssetId} dequeued and entering pipeline` | التقاط مهمة | العامل حي ويأخذ المهمة |
| `Transcoding job skipped: episode {id} — notFound=… status=… fileKeyEmpty=…` | تخطٍّ (كان صامتًا قبل 10.13) | **سبب توقف صامت**: صفوف حُذف/أُجهضت/بلا مفتاح |
| `Transcoding job completed: {type} {id} — status=Ready HlsKey={…} (N HLS objects)` | إكمال | المفتاح المثبَّت — **طابقه مع سطر Presigned GET** لسلسلة كاملة encode→DB→presign |
| `Transcode {type} {id}: downloading {Key}` / `ffmpeg ladder starting…` / `Starting job: ID, Target, SourceHeight, Rungs` | مراحل | تقدم السلّم الفعلي وأهدافه |
| `Transcoding failed … Human: … Technical: …` | فشل | رسالة ثنائية اللغة — التقنية تحمل سبب ffmpeg |

> هذه السجلات (presign + دورة الترميز) **مؤقتة** من 10.13 — تُخفَّض/تُزال في دفعة التنظيف بعد إغلاق الحادثة (خطة 11.1).

## 9. قوائم فحص سريعة

**قبل النشر (دفعة إلى main)**: فرع wip اختُبر (بناء 0 أخطاء + 440/440) → اختبار إنتاج يدوي على الفرع إن أمكن → دمج → مراقبة سجل الإقلاع (سطر CORS) → اختبار دخان (تسجيل دخول، رفع صغير، تشغيل MP4).

**عند بلاغ "فيديو لا يعمل"**: 1) حالة الحلقة في اللوحة (Ready؟) 2) إن Ready: سطر `Presigned GET issued` (Key صحيح؟) 3) تنزيل master والتحقق من المقاطع (غير موقّعة = القضية 04 §1) 4) إن Pending عالق طويلًا: سطر `job skipped` أو مهلة 60 دقيقة.

**عند بلاغ "رفع يفشل"**: تبويب الشبكة — أي طلب يفشل (initiate/PUT/complete)؟ → §7 أعلاه → جسم الخطأ من B2 حرفيًا.
