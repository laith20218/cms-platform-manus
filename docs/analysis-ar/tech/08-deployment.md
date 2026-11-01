# 08 — النشر والتشغيل

> الأدلة: `render.yaml`، و`apps/api/Dockerfile`، و`docker-compose*.yml`، و`.github/workflows/*`، وشجرة `deploy/`، ووثائق الحالة. حالة البيئة الحية من سجلات المستودع المؤرخة 2026-10-22/23؛ ولم يُفحص **الحالي** منها (بتفويض قراءة فقط) — **UNVERIFIED** حيثما عُلِّمت.

---

## 1. البيئات

| البيئة | الركيزة | الدليل |
|---|---|---|
| **التطوير المحلي** | ‏docker-compose: ‏PostgreSQL 16-alpine مع Redis 7-alpine (+ خدمة api في صيغة الإنتاج)؛ وخوادم تطوير Vite على 5173/5174 تحوّل `/api` إلى `localhost:8080`؛ و`dotnet watch` للواجهة البرمجية؛ والتهيئة بالبيانات عبر `deploy/scripts/init-db.sql` و`deploy/seed/` | docker-compose.yml؛ وإعدادات vite؛ وسكربتات package.json في الجذر |
| **‏CI** | ‏GitHub Actions ‏(ubuntu-24.04)، بخمس سير عمل — انظر [07-quality.md](07-quality.md) §2؛ وتحصل اختبارات التكامل على حاوية خدمة Postgres حقيقية | ci.yml:86-125 |
| **الإنتاج** | **Render** ‏(الواجهة البرمجية، Docker، فرانكفورت، الخطة: **مجانية**، ‏`cms-api-preview.onrender.com`، نشر تلقائي من main، والصحة على `/health/live`) + **Vercel** ×2 ‏(`cms-platform-manus-student-web.vercel.app`، و`cms-platform-manus-admin-web.vercel.app`) + ‏**Neon** ‏PostgreSQL + **Upstash Redis ‏(REST)** + **Backblaze B2** ‏(واجهة S3، والحاوية `cms-files`، والمنطقة eu-central-003 بحسب تعليق render.yaml) + ‏Firebase FCM | render.yaml:18-87؛ وEXECUTION_STATUS.md:170-177 |
| **‏Staging** | لا شيء مميزاً — روابط المعاينة على Render/Vercel تقوم مقام ما قبل الإنتاج؛ وأجّل EXECUTION_STATUS «تشغيل الحزمة الكاملة مقابل staging» إلى الموجة Wave 6 | EXECUTION_STATUS.md:310 |

حالة الإنتاج عند آخر نشر موثق (2026-10-23، إقفال الموجة Wave 5): الخدمات الثلاث خضراء عند `cac5052`/`07c8f35`، ونقاط التحليل السبع 7/7 ترجع 200، وتطبيق PWA قابل للتثبيت، وربط الأجهزة متحقق منه (EXECUTION_STATUS.md:230-246). وبعد النشر: واصلت الموجات 6-12.3 الشحن إلى main مع النشر التلقائي (render.yaml:27).

## 2. صورة الواجهة البرمجية (`apps/api/Dockerfile`)

متعددة المراحل (الاستعادة ← البناء ← النشر ← التشغيل)، ‏.NET 9 **alpine**، ‏`linux-musl-x64`، ‏ReadyToRun، ومستخدم غير جذري `cms` ‏(uid ‏1001)، و`HEALTHCHECK` عبر wget على `/health/live` ‏(30 ثانية/10/20/3 محاولات). حزم التشغيل: `icu-libs tzdata wget ca-certificates ffmpeg ghostscript` — **خطوط أنابيب الوسائط مضمومة في الصورة** (سلم FFmpeg لـ HLS + إعادة تضمين خطوط PDF عبر Ghostscript)، مع مفاتيح بيئة `FFMPEG_TIMEOUT_MINUTES=10` و`GS_TIMEOUT_MINUTES=10`، و**حزمة الخطوط العربية OFL** ‏(Amiri + Noto Naskh) في `/app/ghostscript-fonts` (مضمومة لأن أقراص الشريحة المجانية على Render زائلة). و`TZ=Asia/Riyadh`، والعولمة المتغير عليها **معطلة** (دعم العربية).

## 3. الإعداد والأسرار

- ملف render.yaml هو مصدر البنية كشيفرة للواجهة البرمجية: **أسماء** متغيرات البيئة في المستودع، والقيم عبر مخزن أسرار Render ‏(`sync: false` لاتصال قاعدة البيانات، و`Jwt__Secret`، وزوج Upstash Redis REST، ومفتاحي الوصول والسرّ لـ B2 — render.yaml:40-76). والقيم العامة (أصول CORS، ومُصدر/جمهور JWT، ومدد الانتهاء، ومفاتيح الميزات `OtpEnabled=false` و`OfflineEnabled=false` و`PlayIntegrity.Enabled=false`) مُدرجة في الشيفرة.
- الواجهتان الأماميتان: بيئتا `VITE_*` مضبوطة في مشروعي Vercel ‏(`VITE_API_URL` / `VITE_API_BASE_URL`؛ وافتراضي وكيل التطوير `http://localhost:8080`).
- يثبِّت CORS أصلَي Vercel ‏(render.yaml:62-65؛ وProgram.cs:108-120).
- يوثِّق `.env.example` قيم التطوير المحلي ومسار Upstash Blob المحال (توثيق التراجع).
- يُصلح الإقلاع ذاتياً **سياسة CORS لحاوية B2** عبر `PutBucketCors` (غير قابل للكسر، وبأفضل جهد، ومتخطى في بيئة Testing — ‏Program.cs:193-224؛ والإجراء اليدوي في `docs/ops/r2-cors.md`).

## 4. عملية ترحيل قاعدة البيانات

- ترحيلات EF Core:‏ 31 مُدرجة (من Phase 34 إلى Phase 61؛ انظر [02-data-model.md](02-data-model.md) §5). ومصنع وقت التصميم: `ApplicationDbContextFactory.cs`.
- شبه آلية عبر **`migrate.yml`** ‏(`workflow_dispatch` يدوي): تختار المدخلات **التوليد** ‏(`dotnet ef migrations add`)، أو **التطبيق** ‏(`dotnet ef database update`)، أو **التراجع** ‏(`dotnet ef database update <target>`)، أو **التحقق** ‏(`dotnet ef migrations list`) — تعمل على ubuntu مع .NET 9 وأداة EF ‏(migrate.yml:37-87).
- طبّقت Neon الترحيلات حتى Phase 54-57 خلال نافذة نشر الموجة Wave-5 وما بعدها (EXECUTION_STATUS.md:219, 246).
- **استراتيجية التراجع**: ‏`dotnet ef database update <previous-migration>` ‏(migrate.yml:72-76). كل الترحيلات إضافية؛ وبعض المبكر ينقصه ملفات `.Designer.cs` (مكتوبة يدوياً) — مثبت في 02-data-model.md. وسلامة التراجع تتوقف على سلوكيات حذف المفاتيح الأجنبية الموثقة هناك.

## 5. أدوات النشر والتحقق

| الأداة | الغرض | الدليل |
|---|---|---|
| `scripts/pre-deploy-check.sh` | بوابة ما قبل الدفع: تثبيت CI بقفل ملف التبعيات نفسه + بناء/اختبار كاملان + قائمة فحص دخان يدوية (وُلدت من حادثة `ERR_PNPM_OUTDATED_LOCKFILE` على Vercel بتاريخ 2026-10-22) | EXECUTION_STATUS.md:180-198 |
| `deploy/scripts/deploy.sh` | مشغّل النشر | deploy/scripts/ |
| `deploy/scripts/smoke-tests.sh` | فحص الدخان بعد النشر | |
| `.github/workflows/health-check.yml` | **كل 5 دقائق (cron)**: استعلام `/health` للواجهة البرمجية (بانتظار 200)، وstudent-web ‏(بانتظار 200)، وفحص زمن استجابة بعتبة | health-check.yml:8-37 |
| `.github/workflows/launch.yml` | إطلاق محروس لمرة واحدة: اختبارات كاملة ← مسح أمني ← نشر ← فحص دخان ← إعلان | |
| `deploy/monitoring/` | ‏`dashboard-config.yaml` مع Terraform ‏(`monitoring-setup.tf`) لركيزة مراقبة | |
| `deploy/nginx/` | ‏`nginx-prod.conf`، و`nginx-student-web.conf` — واجهة أمامية بديلة ذاتية الاستضافة (ليست المسار الحي على Vercel/Render) | |
| `deploy/runbooks/` | دليل الطوارئ، وقائمة فحص الانطلاق مع الإعلان، ومراجعة ما بعد الإطلاق | |

نقاط الصحة على الواجهة البرمجية: `/health` ‏(محدد المعدل 600 في الدقيقة)، و`/health/ready` ‏(فحصا Npgsql وUpstash Redis)، و`/health/live` ‏(الحيوية فقط) — ‏Program.cs:270-278؛ ومسبار Render نفسه يستخدم `/health/live` ‏(render.yaml:28).

## 6. الإصدار والتراجع

- **الواجهتان الأماميتان**: نشر تلقائي من `main` على Vercel؛ وعمليات نشر غير قابلة للتغيير مع تراجع فوري عبر لوحة Vercel (غير مُبرمَجة في المستودع).
- **الواجهة البرمجية**: نشر تلقائي من `main` على Render ببناء `apps/api/Dockerfile`؛ والتراجع = إعادة نشر commit سابق (لوحة Render؛ بلا أتمتة في المستودع).
- **قاعدة البيانات**: تقدُّمية فقط افتراضياً؛ وخطوة التراجع في `migrate.yml` موجودة لكنها يدوية.
- نمط فشل معروف ومُختبَر وموثق من قبل: انحراف بيان ملف التبعيات/القفل يكسر `--frozen-lockfile` على Vercel ‏(الحادثة والبوابة الوقائية، EXECUTION_STATUS.md:180-198).
- تُرمِّز سير عمل `launch.yml` مراسم الإطلاق الإنتاجي الكاملة (نص التأكيد "LAUNCH"، ووسم الإصدار، والاختبارات، والمسوح، والنشر، وفحص الدخان) — استُخدمت لإطلاق v1.0.0-rc بتاريخ 2026-10-22/23.

## 7. مخاطر التشغيل

1. **الاعتماد على الشريحة المجانية**: خطة Render المجانية (render.yaml:23) — إقلاعات باردة، وقرص زائل (خُفِّف بضم الخطوط إلى الصورة)، وسقوف موارد مقرٌّ بها في تعليقات Dockerfile (رقباء «عالق، لا بطيء»).
2. **تعتمد مهمة cron في `health-check.yml` على دقائق GitHub Actions** — مشكلة فوترة/سقف إنفاق سابقة على Actions عطّلت المراقبة مرة (CMS_FINAL_FUNCTIONAL_STATUS.md:58).
3. **لا بيئة staging** — الإنتاج هو بيئة التكامل الوحيدة (حتى `baseURL` الافتراضي عند Playwright هو الإنتاج، playwright.config.ts:5).
4. **ركيزة المراقبة معرَّفة (`deploy/monitoring/*.tf`) لكن نشرها الحي UNVERIFIED**؛ والبند P1-12 «دليل مراقبة حية» هو BLOCKED_EXTERNAL ‏(EXECUTION_STATUS.md:112).

---

*ذو صلة: [05-performance.md](05-performance.md) · [09-risks-and-roadmap.md](09-risks-and-roadmap.md)*
