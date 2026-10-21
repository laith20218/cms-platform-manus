# خطة تنفيذ مفصلة — إغلاق فجوات CMS

> **مبنية على**: ADMIN STATUS REPORT v5.0 + تحقق فعلي من المستودع  
> **الفرع**: `feature/admin-05-student-profile`  
> **آخر commit**: `a5f2f43` (21 أكتوبر 2026)  
> **المرجع**: `admin-status-report.html` (نسخة 5.0)  
> **التاريخ**: 21 أكتوبر 2026

---

## ملخص تنفيذي

خطة مرحلية لإغلاق **93 فجوة** مصنّفة ومتحقَّق منها فعلياً:

| الأولوية | العدد | الجهد التقديري | الحواجز الخارجية |
|---|---|---|---|
| **P0** حرجة | 8 | ~10 أسابيع | 5 (domain, R2, Redis, CI billing, scanner) |
| **P1** مهمة | 13 | ~16 أسبوع | 2 (content, monitoring) |
| **ADMIN-04** توسعة | 14 sub-task | ~8 أسابيع | 0 |
| **P2/P3** صقل | 72 | ~12 أسبوع | 1 (Phase 45 Android) |
| **الإجمالي** | **93** | **~38 أسبوع** (4 مطورين متوازين) | 5 خارجية |

---

## 1. قواعد لا يجوز تجاوزها

### 1.1 لا تكرر الميزات المنجزة

**منجز بعد التقرير (ADMIN-05 commit a5f2f43)**:
- ✅ **P1-03** أسماء الفاعلين في السجل الأمني — SecurityController.cs:33 يُرجع studentName + adminName
- ✅ **P1-02** بصمة الجهاز (جزئي) — عرض في تبويب Security log فقط
- ✅ **P1-04 backend** — Scopes محفوظة + مُفروضة (AdminDashboardController.cs:173,186)
- ✅ **P1-05 backend PUT** — PUT /api/v1/admin/roles/{id}/permissions موجود
- ✅ **P1-10 backend** — POST /api/v1/notifications/send يدعم 7 audience types
- ✅ **P0-06 seed-production.sql** — 260 سطر (7 جامعات/8 مواد/5 أسئلة)
- ✅ **P1-09 entity** — ErrorReport بـ 4 حالات + ResolvedBy/ResolutionNotes

### 1.2 مصفوفة الحالة (7 حالات)

| الحالة | المعنى |
|---|---|
| `IMPLEMENTED_AND_VERIFIED` | موجودة + اجتازت اختباراً فعلياً |
| `IMPLEMENTED_BUT_UNVERIFIED` | الكود موجود لكن التحقق غير كافٍ |
| `PARTIAL` | بعض دورة العمل موجودة |
| `UI_ONLY` | الواجهة موجودة دون backend |
| `BACKEND_ONLY` | API موجودة لكن الاستخدام الإداري غير مكتمل |
| `MISSING` | الميزة غير موجودة |
| `BLOCKED_EXTERNAL` | تحتاج حساباً أو خدمة خارجية |

### 1.3 قواعد صارمة

- لا تستخدم بيانات وهمية في الإنتاج
- لا تضع إحصائيات ثابتة في الواجهة
- لا تُرجع نتيجة فحص ملف Clean دون فحص حقيقي
- لا تعتبر نجاح اختبارات Backend دليلاً على اكتمال اختبارات الواجهة
- لا تُعلن الجاهزية للإنتاج بمجرد نجاح البناء
- لا تستبدل مزوداً غير متاح بمحاكاة وتعتبر العمل مكتملاً

---

## 2. تصحيحات على التقرير المرجعي

6 ادعاءات في التقرير تم تصحيحها بناءً على فحص الكود الفعلي:

### 2.1 ⚠️ BUG حرج: HourlyActivity DTO مكسور
- **Backend**: `ActiveUsers/QuestionsAnswered`
- **Frontend**: يقرأ `uniqueStudents/totalAnswers`
- **النتيجة**: مخطط النشاط بالساعة يعرض **undefined**
- **الإصلاح**: P2 quick win (أولوية قصوى ضمن ADMIN-04)

### 2.2 TrustedFileScanner ليس ماسحاً
- `TrustedFileScanner.cs:27-32` يُرجع `IsClean=true` دائماً
- وثيقة XML تعترف: "performs NO malware detection"
- **النتيجة**: P0-02 مفتوح فعلاً (bypass وليس ماسحاً)

### 2.3 مسارات ADMIN-04 مختلفة عن افتراض البرومبت
- الفعلي: `/api/v1/admin/{revenue,student-growth,top-subjects}` (لا `/reports/` prefix)
- `/api/v1/admin/reports/summary`
- `/api/v1/stats/global`
- admin-web يناديها بشكل صحيح

### 2.4 ErrorReport states لا تطابق البرومبت
- الفعلي: `Pending/Reviewing/Resolved/Rejected` (4 حالات)
- البرومبت طلب: `Open/InReview/Resolved/Rejected/Closed` (5 حالات)
- **الإجراء**: إضافة Closed + تطبيع الأسماء

### 2.5 Playwright 19 وليس 23
- `phase39-identity.spec.ts` (17 test) + `phase39-otp-deferred.spec.ts` (2 test)
- `playwright.config.ts:3` baseURL = `127.0.0.1:5173` (ليس deployed backend)

### 2.6 Redis لا يُستخدم لـ token blacklist
- RELEASE_NOTES.md يدّعي ذلك لكن الفعلي: جلسات في Postgres `Sessions` table
- Redis يُستخدم فقط لـ: failed-login counter + permission cache + performance cache

---

## 3. مخطط التبعيات

```
═══ المسار الحرج (P0 — يجب أن يتسلسل) ═══
P0-05 Domain → P0-04 CI billing → P0-01 R2 + P0-07 Redis → P0-08 Secrets → P0-02 Scanner → P0-06 Content → P0-03 E2E

═══ P1 — 4 مجموعات متوازية ═══
Group A: P1-01 Profile+Avatar → P1-02 Device FP + P1-11 Sessions
Group B: P1-04 Scope picker → P1-05 Permission Matrix + P1-06 Audit viewer + P1-07 Security Console
Group C: P1-08 Settings + P1-09 Reports moderation + P1-10 Notification UI
Group D: P1-12 Monitoring + P1-13 Content strategy

═══ ADMIN-04 (مستقل، يبدأ بالتوازي مع P1) ═══
3.1 Fix DTO + unused fields → 3.2 Date picker + Export → 3.3 8 new tabs (تتطلب backend endpoints)

═══ P2/P3 (بعد P1، باستثناء Quick Wins) ═══
Quick wins: c37f353 push + RELEASE_NOTES + setup-dev.sh
→ Test coverage (10) → Content security (5) + Security tests (5) + Perf/a11y (6)
```

---

## 4. المرحلة 1 — P0 حواجز الإنتاج الحرجة (8 بنود)

### P0-01 — Cloudflare R2: التحقق الإنتاجي الحقيقي
- **الحالة**: `CONFIGURED_BUT_UNVERIFIED`
- **المشكلة**: UpstashBlobStorageService موجود لكن NO real bucket URL committed. NO integration test يضع ملفاً في R2 حقيقي.
- **DoD**: حاوية R2 حقيقية + اختبار PUT فعلي + التحقق من وجود الملف + رفض الوصول العام + انتهاء الرابط الموقّع + اختبار فشل الشبكة + توثيق دون كشف مفاتيح
- **المانع الخارجي**: bucket credentials من المالك
- **الجهد**: ~1 أسبوع

### P0-02 — ماسح الملفات الضارة
- **الحالة**: `MISSING (bypass)`
- **المشكلة**: TrustedFileScanner.cs:27 يُرجع IsClean=true دائماً. وثيقة XML تعترف: "performs NO malware detection". Library publish gate فعلياً متجاوز.
- **DoD**: مزود فحص حقيقي (ClamAV/VirusTotal) + IFileScanner حقيقي + منع النشر قبل الفحص + رفض/عزل المصابات + الحجر للملفات غير المعروفة + fail-closed عند تعطل الماسح + التحقق من MIME/التوقيع/الحجم + تسجيل
- **الاختبارات**: ملف سليم → Clean / EICAR → Infected / نتيجة غير معروفة → Quarantine / انقطاع المزود → block publish
- **المانع الخارجي**: ClamAV host أو VirusTotal API key
- **الجهد**: ~1.5 أسبوع

### P0-03 — Browser E2E (Playwright)
- **الحالة**: `CONFIGURED_BUT_UNVERIFIED` (19 test، NOT 23)
- **المشكلة**: 19 اختبار في ملفين، baseURL=`127.0.0.1:5173`، يتطلب local Redis DB #15، غير مُشغّل ضد deployed backend
- **DoD**: بيئة اختبار متكاملة + حسابات اختبار + محتوى + playwright.config مُحدَّث + تشغيل اختبارات (دخول/صلاحيات/تنقل/طلاب/أكواد/أسئلة/اختبارات/مكتبة/تقارير) + سيناريوهات إيجابية/سلبية + Desktop/Mobile/RTL + حفظ تقارير عند الفشل
- **المانع الخارجي**: حسابات اختبار + محتوى (يعتمد على P0-06)
- **الجهد**: ~2 أسبوع

### P0-04 — GitHub Actions و CI
- **الحالة**: `PARTIALLY_VERIFIED`
- **المشكلة**: launch.yml يرجع railway.toml المُزال · health-check.yml يستهدف example.com · run #261 فشل pre-job بسبب billing
- **DoD**: تحديد السبب الفعلي + حل الفوترة + إصلاح launch.yml + إصلاح health-check.yml + workflow بإصدارات Actions مثبتة + تشغيل build/tests + CodeQL + Trivy + حفظ رابط التشغيل
- **المانع الخارجي**: GitHub org admin لفك billing
- **الجهد**: ~1 أسبوع

### P0-05 — النطاق المخصص + TLS + CORS
- **الحالة**: `MISSING`
- **المشكلة**: api.cms.example.com في 9+ ملفات · DNS لا يحلّ · Live host = cms-api-preview.onrender.com
- **DoD**: التحقق من النطاق الحقيقي + DNS + TLS + تحديث Vercel env + API + CSP + CORS + إزالة النطاقات الوهمية + اختبار health/auth/API + تحديث الوثائق
- **المانع الخارجي**: domain ownership من المالك
- **الجهد**: ~0.5 أسبوع

### P0-06 — تجهيز محتوى الإنتاج
- **الحالة**: `PARTIAL`
- **المشكلة**: seed-production.sql: 5 أسئلة فقط · Neon production: 1 سؤال، 0 اختبارات، 0 ملفات، 0 إشعارات · لا أداة استيراد
- **DoD**: خطة تجهيز موثّقة + آلية آمنة لإدخال الجامعات/الكليات/... + استيراد الأسئلة من CSV/Excel مع validation/preview + اختبارات فعلية + idempotent + التحقق من العلاقات + توثيق عدد العناصر + عدم اختلاق محتوى طبي
- **المانع الخارجي**: محتوى طبي معتمد
- **الجهد**: ~2 أسبوع

### P0-07 — Upstash Redis
- **الحالة**: `CONFIGURED_BUT_UNVERIFIED`
- **المشكلة**: UpstashRedisRestCacheService موجود · NO real upstash.com URL committed · Constructor fails closed
- **DoD**: اختبار اتصال حي + التحقق من القراءة/الكتابة/الحذف/TTL + المصادقة/التشفير/المهلات + اختبار انقطاع Redis + تحديد الوظائف المتعطلة مقابل الأمنية + عدم اعتماد cache كمصدر وحيد + حفظ دليل دون credentials
- **المانع الخارجي**: Upstash REST URL
- **الجهد**: ~0.5 أسبوع

### P0-08 — تدوير الأسرار
- **الحالة**: `VERIFIED (clean)` + فجوات
- **المشكلة**: 0 أسرار مُلتزمة · .env.example نظيف · ينقص: pre-commit hook محلي + Upstash:Blob:Token في .env.example + أداة تدوير
- **DoD**: مراجعة + تدوير + إبطال قديم + تحقق + pre-commit hook (Husky) + إضافة Upstash:Blob:Token + دليل تدوير خارجي
- **الجهد**: ~0.5 أسبوع

---

## 5. المرحلة 2 — P1 إكمال وظيفي (13 بنداً)

### Group A — Student Profile & Security (متوازية)

#### P1-01 — ملف الطالب الكامل + الصورة الشخصية
- **الحالة**: `MISSING`
- **المشكلة**: StudentProfileController.cs:10 GET فقط · لا PUT · لا /avatar · لا IFormFile · StudentsCenter drawer 3 تبويبات فقط (يطلب 7)
- **DoD**: 
  - `PUT /api/v1/admin/students/{id}`
  - `POST /api/v1/admin/students/{id}/avatar` (image/jpeg,png,webp · max 3MB)
  - ضغط العميل (canvas resize + quality)
  - تخزين في R2 (إعادة استخدام IFileStorageService)
  - معاينة قبل الحفظ + إلغاء + أخطاء لكل حقل
  - تسجيل التعديلات الحساسة
  - منع المدير محدود النطاق
  - Drawer بـ 7 تبويبات: المعلومات الأساسية / التقدم الدراسي / الاختبارات والنتائج / الاشتراكات والأكواد / الجلسات والأجهزة / سجل الأحداث الأمني / البلاغات المرتبطة
- **الملفات**: new AdminStudentsController.cs · StudentProfileController.cs · UserEntities.cs:93 · new AvatarService.cs · new migration · StudentsCenter.tsx (expand) · new StudentProfileTabs/
- **الجهد**: ~2 أسبوع

#### P1-02 — عرض بصمة الجهاز (إكمال)
- **الحالة**: `PARTIAL` (موجود في security log فقط)
- **DoD**: إكمال عرض البيانات + توضيح نوع المعرف + تاريخ الربط + حالة الربط + إجراء إلغاء الربط + تسجيل السبب/المنفذ/التوقيت + عدم اختلاق بيانات + سياسة الخصوصية + التحقق من تأثير Backend
- **الجهد**: ~3 أيام

#### P1-11 — Student sessions API + UI
- **الحالة**: `MISSING`
- **المشكلة**: لا GET sessions endpoint · UserSession يفتقد device fields (فقط InstallationId)
- **DoD**: 
  - `GET /api/v1/security/students/{id}/sessions` (join UserSession + DeviceBinding)
  - `POST /api/v1/security/students/{id}/sessions/{sessionId}/revoke`
  - إبطال جلسة واحدة أو جميع الجلسات
  - إلغاء ربط الجهاز
  - التحقق من أن الملغاة لا تستمر في الوصول
  - إبطال refresh tokens المرتبطة
  - تسجيل العملية + السبب + المنفذ
  - اختبارات تكامل
  - عدم عرض رموز الجلسات الكاملة
- **الجهد**: ~1.5 أسبوع

### Group B — Admin RBAC (متسلسلة)

#### P1-04 — Role/scope picker
- **الحالة**: `PARTIAL` (backend ✓, UI ✗)
- **DoD**: `GET /api/v1/admin/admins/{id}/grants` + UI picker (4 selects متسلسلة) + منع اختيار أدنى دون أب + عرض النطاق الحالي عند التحرير + منح الصلاحيات خارج نطاق المدير + اختبار رفع الامتيازات ذاتيًا + اختبارات تلاعب بالمعرفات
- **الجهد**: ~1 أسبوع

#### P1-05 — Permission Matrix editor (يعتمد على P1-04)
- **الحالة**: `PARTIAL` (PUT ✓, GET ✗, UI ✗)
- **DoD**: `GET /api/v1/admin/roles/{id}/permissions` + Matrix Editor UI (grid permissions × roles) + عرض الموروث + الخاصة + النطاق + مراجعة قبل التأكيد + أثر بعد الدمج + منع منح صلاحية لا يملك تفويضها + تسجيل التغييرات + اختبارات مسموح/مرفوض
- **الجهد**: ~1.5 أسبوع

#### P1-06 — Audit Log viewer شامل
- **الحالة**: `MISSING`
- **DoD**: `GET /api/v1/admin/audit-logs` + فلاتر (user/actor/date/event type/entity/result) + pagination + sort + تفاصيل قبل/بعد + تنقيح + ربط بهوية الفاعل + تصدير وفق الصلاحية + منع التعديل/الحذف + تسجيل تصدير حساس
- **الجهد**: ~1.5 أسبوع

#### P1-07 — Security Console filters
- **الحالة**: `PARTIAL`
- **DoD**: إضافة date-range picker + structured actor filter + structured event-type filter + إصلاح Warning/Info cards (backend filters to Critical-only)
- **الجهد**: ~1 أسبوع

### Group C — Operations (متوازية)

#### P1-08 — System Settings
- **الحالة**: `MISSING`
- **DoD**: التحقق من وجود system_settings table + تحديد الإعدادات (watermark, upload limits, content policies) + فصل الإعدادات عن الأسرار + `GET/PUT /api/v1/admin/settings` + UI (قيمة + وصف + مدى) + حفظ/إلغاء/استعادة + تسجيل + تطبيق في الخدمة + اختبار أثر التغيير
- **الجهد**: ~1 أسبوع

#### P1-09 — دورة حياة البلاغات
- **الحالة**: `PARTIAL` (entity ✓ 4 states, API/UI ✗)
- **DoD**: إضافة Closed state + تطبيع الأسماء + `GET /api/v1/admin/reports` + `PUT /api/v1/admin/reports/{id}/status` + تعيين مسؤول + ملاحظات + سبب + أوقات + فلاتر + منع إغلاق دون معلومات + سجل انتقالات + إحصاءات + منع محدود النطاق
- **الجهد**: ~1.5 أسبوع

#### P1-10 — Notification compose UI
- **الحالة**: `PARTIAL` (backend ✓, UI ✗)
- **DoD**: إضافة ExpiresAt + migration + UI compose (عام/موجّه) + تحديد الجمهور + معاينة + إرسال فوري/مجدول + انتهاء + إلغاء + حالة الإرسال + منع تكرار + حدود + سجل + تفعيل bell button
- **الجهد**: ~1 أسبوع

### Group D — Monitoring + Content

#### P1-12 — Live monitoring evidence
- **الحالة**: `CONFIGURED_BUT_UNVERIFIED`
- **DoD**: التحقق من المزود + ربط أخطاء Frontend/Backend + Correlation ID + آلية تنبيه + اختبار حدث تجريبي + إثبات الوصول + تنقيح + توثيق + عدم تسجيل "مكتملة" لمجرد وجود إعدادات
- **المانع الخارجي**: Sentry/Better Stack account
- **الجهد**: ~1 أسبوع

#### P1-13 — استراتيجية تجهيز المحتوى
- **الحالة**: `PARTIAL`
- **DoD**: آلية موثّقة + التحقق من seed-production.sql + idempotent + التحقق من الروابط + validation/preview + تقرير بعد الإدخال + فصل اختبار/إنتاج + عدم تغيير الإنتاج دون موافقة
- **المانع الخارجي**: محتوى معتمد
- **الجهد**: ~1 أسبوع

---

## 6. المرحلة 3 — ADMIN-04 توسعة التقارير (14 sub-task)

### 3.1 Quick Wins (أولوية قصوى)
1. **إصلاح HourlyActivityDto field mismatch** — rename backend أو fix frontend
2. **استهلاك codesSold + newSubscriptions** — عرض في تبويب Overview
3. **استهلاك averageAccuracy + activeStudents** — عرض في جدول المواد
4. **تعريف المؤشرات** — "إيرادات" → "أكواد صادرة" إذا لا دفع حقيقي

### 3.2 منتقي النطاق + التصدير
5. **Date range picker** — اليوم/7/30/90/شهر/6 أشهر/سنة/مخصص
6. **زر إعادة ضبط الفلاتر** + الفترة المختارة + آخر تحديث
7. **تصدير CSV** للبيانات الجدولية (يحترم الفلاتر)
8. **تصدير PDF** للتقرير الإداري المنسق
9. **تسجيل تصدير البيانات الحساسة** في Audit Log

### 3.3 توسيع 8 تبويبات (تتطلب backend endpoints جديدة)
10. **Tab 1: نظرة عامة** — إعادة هيكلة (existing endpoints)
11. **Tab 2: الطلاب** — `/api/v1/admin/reports/students-overview` + `/inactive`
12. **Tab 3: الأداء الأكاديمي** — `/api/v1/admin/reports/academic-performance`
13. **Tab 4: الاختبارات** — `/api/v1/admin/reports/exams-overview`
14. **Tab 5: الأسئلة** — `/api/v1/admin/reports/questions-overview`
15. **Tab 6: المحتوى والمكتبة** — `/api/v1/admin/reports/content-overview`
16. **Tab 7: الأكواد والاشتراكات** — `/api/v1/admin/reports/codes-overview`
17. **Tab 8: التشغيل والأمان** — `/api/v1/admin/reports/operations-overview`

### 3.4 فلاتر مشتركة + تفاعل
- date from/to + University + College + Year + Semester + Subject + exam/content status + subscription status + compare previous period
- Tooltips + الضغط على الرسم يفتح التفاصيل + جداول قابلة للبحث/الترتيب/الترقيم + حالات Loading/Error/Empty/Unauthorized/Success + إخفاء سلاسل + ملخص نصي + RTL

### قواعد صارمة
- عرّف "المستخدم النشط" ولا تساوه بفتح الصفحة
- لا تخلط عدد المحاولات بعدد الطلاب الفريدين
- لا تصف سؤالاً بأنه سيئ فقط لأن نسبة الخطأ مرتفعة
- لا تسمِّ حدث عرض المحتوى "تنزيلاً"
- لا تضع قياسات تقنية غير موجودة

---

## 7. المرحلة 4 — P2/P3 صقل (72 بنداً)

### 4.1 تغطية الاختبارات (10 بنود) — أولوية قصوى
1. إطار اختبار admin-web (Vitest + Testing Library) — **0 tests حالياً**
2. اختبارات packages/ui — **0 tests (config only)**
3. HTTP integration tests لـ 12 controller — **9/21 covered**
4. اختبار S3StorageService بدل المحاكاة — **always mocked** (يعتمد P0-01)
5. اختبار تدفق رفع المكتبة كامل
6. اختبار نتائج الماسح الحقيقية (يعتمد P0-02)
7. اختبار مسار Notifications/FCM
8. اختبار تفعيل الأكواد وصرفها
9. اختبار Dashboard handlers
10. **اختبار JWT pipeline الحقيقي** — **always bypassed**

### 4.2 أمان المحتوى والعارض (5 بنود)
11. Server-side watermark (DTO موجود فقط)
12. HTML sanitizer حقيقي (لا كود إطلاقاً)
13. اختبار عزل HTML داخل العارض
14. الملفات الخاصة لا تُتاح قبل الفحص + التحقق من الاستحقاق
15. توثيق حدود الحماية — لا ادّعاء حماية مطلقة

### 4.3 الاختبارات الأمنية (5 بنود)
16. Penetration Test موثّق
17. اختبار IDOR/BOLA
18. اختبار التلاعب بالـ IDs والنطاقات
19. اختبار انتهاء الجلسات وإبطال refresh token
20. اختبار المسارات الحساسة بـ JWT الحقيقي

### 4.4 الأداء وإمكانية الوصول (6 بنود)
21. قياس Lighthouse + حفظ النتائج
22. تشغيل axe-core accessibility scan
23. اختبار قارئ الشاشة
24. اختبار التنقل بلوحة المفاتيح
25. التحقق من RTL على النسخة المنشورة
26. قياس Web Vitals + توصيلها لـ Sentry

### 4.5 وظائف الموقع (10 بنود) — Quick Wins متاحة
27. فهرس اختبارات مستقل `/exams`
28. صفحة مكتبة موحدة
29. القوائم المسماة للمفضلة (schema + API + UI)
30. استبدال روابط الشروط والخصوصية `href="#"`
31. إخفاء مسار OTP عندما `OtpEnabled=false`
32. إصلاح `setup-dev.sh` (لا يعتمد على `/home/z/my-project`)
33. إكمال `monitoring-setup.tf` (يفتقد terraform/provider blocks)
34. تحديث `RELEASE_NOTES.md` (لا تعلن Production Ready)
35. تحديث `PROJECT_HANDOFF.md` (إزالة اعتماد Railway)
36. دفع `c37f353` ADMIN-01_REPORT.md update (dangling commit)

### 4.6 البنود المتبقية (36 بند)
تشمل: استكمال Reports Center moderation UI + AdminsCenter sessions view + Academic Center edit/move/reorder/unpublish + Questions Center media upload + math formula + preview + Exams Center drill-down + Library Center drag-drop + multi-upload + Codes Center export + Audit Center filters + Reports Center drill-down + Phase 45 Android + Phase 46 + Load testing + Disaster recovery + Incident response + On-call rotation + Real Terms/Privacy legal review + Web Vitals monitoring + Independent Exam catalog + Unified Library page + Multi-favorite named lists + Student account sessions UI + Document protection limits + FCM integration + Subscription code redemption + Dashboard handlers + Real JWT pipeline + PenTest + Lighthouse + axe-core + Screen reader + Keyboard navigation + RTL verification.

---

## 8. المرحلة 5 — التوثيقات

### ملفات جديدة في `docs/admin/`
- `ADMIN_GAP_CLOSURE_PLAN.md` — خطة الإغلاق الكاملة
- `ADMIN_GAP_MATRIX.md` — مصفوفة الـ 93 بنداً
- `REPORTS_ANALYTICS_SPEC.md` — مواصفات 8 تبويبات
- `ADMIN_FUNCTIONAL_MATRIX.md` — كل ميزة: handler + endpoint + scope
- `ADMIN_SECURITY_AND_SCOPE_MATRIX.md` — كل صلاحية: دور + نطاق
- `RELEASE_READINESS_EVIDENCE.md` — أدلة الإغلاق

### أعمدة ADMIN_GAP_MATRIX.md
ID · الوصف · أولوية التنفيذ · الحالة قبل التنفيذ · الدليل · الملفات المتأثرة · API/Database impact · الاختبارات المطلوبة · نتيجة الاختبار الفعلية · Commit · مانع خارجي · الحالة بعد التنفيذ

### ملفات لتحديثها
- `RELEASE_NOTES.md` — إزالة "v1.0.0 (Production)"
- `PROJECT_HANDOFF.md` — إزالة 15+ إشارة إلى Railway
- `ADMIN-01_REPORT.md` — دفع c37f353 المعلّق
- `CHANGELOG.md` — إضافة ADMIN-05 + الخطة
- `API_SPECIFICATION.md` — تحديث endpoints الجديدة
- `DEPLOYMENT.md` — تحديث Render + Vercel + إزالة Railway

---

## 9. معايير القبول Definition of Done (14 معياراً)

1. الميزة موجودة في الواجهة الفعلية
2. جميع أزرارها تعمل وتعرض النتائج الفعلية
3. Backend موجود ومرتبط بعقد API صحيح
4. البيانات محفوظة ومتحقق منها في قاعدة البيانات
5. الصلاحيات والنطاقات مفروضة في Backend
6. حالات الخطأ + التحميل + الفراغ + عدم الصلاحية معالجة
7. اختبارات ملائمة ناجحة
8. لا توجد بيانات ثابتة تحل محل بيانات الإنتاج
9. لا توجد أسرار مكشوفة
10. الوثائق وسجل التغيير محدثان
11. تم الاحتفاظ بأدلة الاختبار الفعلية
12. لا يوجد Regression في الميزات الموجودة
13. تم تحديد أي مانع خارجي بوضوح
14. لم تُعلن جاهزية الإنتاج دون إغلاق بوابات الإنتاج

---

## 10. التسليم النهائي — تقرير بعد كل دفعة

بعد كل دفعة، قدّم تقريراً يذكر:
1. ما اكتُشف
2. ما كان موجوداً ولم يحتج إعادة بنائه
3. ما أُضيف أو أُصلح
4. الملفات والطبقات التي تغيرت
5. APIs والـ migrations الجديدة/المعدّلة
6. الاختبارات المنفذة + النتائج الفعلية
7. المشاكل أو التحذيرات المتبقية
8. ما يحتاج إعداداً أو صلاحية خارجية
9. بوابات الإنتاج المفتوحة/المغلقة مع الأدلة
10. المهام التالية مرتبة بالأولوية

**لا تدّعِ أن جميع البنود الـ93 أُغلقت إلا إذا أُنشئت مصفوفة صحيحة لها، وفُحص كل بند، ووجد لكل بند دليل قابل للتحقق.**

---

## روابط التحميل

- **HTML تفاعلي**: https://gofile.io/d/l6rL9Bck
- **Markdown**: `docs/admin/ADMIN_IMPLEMENTATION_PLAN.md`
- **معاينة محلية**: `/admin-implementation-plan.html` (عبر Next.js)
