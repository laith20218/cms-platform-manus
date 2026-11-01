# 06 — الأمان

> الأدلة: الشيفرة والإعداد فقط. توجد 70 وثيقة أمان تحت `docs/security/` (معدودة) — تُستشهد بها حيثما قُرئت؛ وما بقي **UNVERIFIED** على مستوى المحتوى.
> لم يُجرَ أي اختبار اختراق (بتفويض قراءة فقط).

---

## 1. نموذج المصادقة

**‏JWT Bearer مع سجل جلسات في جهة الخادم وهوية جهاز.** ليست جلسات في ملفات تعريف الارتباط: رموز JWT عديمة الحالة صارت قابلة للإبطال بفحص من قاعدة البيانات عند كل طلب.

| الخاصية | القيمة | الدليل |
|---|---|---|
| الخوارزمية | ‏HMAC-SHA256، مثبَّتة (`ValidAlgorithms`) | Program.cs:81 |
| رمز الوصول | 15 دقيقة | render.yaml:56-57 |
| رمز التحديث | 7 أيام، مجزَّء في السكون، بفهرس فريد | render.yaml:58-59؛ وApplicationDbContext.cs:89 |
| تفاوت الساعة | **صفر** | Program.cs:82 |
| التعامل مع السرّ | 32 بايتاً فأكثر مفروضة عند الإقلاع وإلا رفضت العملية الإقلاع | Program.cs:58-60 |
| المطالب | `sub`، و`role`، و**`sid`** (الجلسة)، و**`installation_id`** (الجهاز)، و**`tv`** (إصدار الرمز) | SessionValidationMiddleware.cs:22-24 |
| ربط المطالب | معطَّل (`MapInboundClaims = false`) لتبقى الأسماء السلكية كما هي | Program.cs:71 |
| الإبطال | كل طلب مصادَق عليه يعيد التحقق من `IsActiveAsync(sid, tv, installation_id)` مقابل `user_sessions` ← فيصبح تسجيل الخروج / استرجاع كلمة المرور / إبطال الجهاز / إعادة استخدام التحديث نافذاً فوراً | SessionValidationMiddleware.cs:20-40 |
| تجزئة كلمات المرور | ‏BCrypt (للطلاب والمشرفين) عبر `Infrastructure/Security/SecurityServices.cs`؛ وArgon2 ‏(Konscious) مُشار إليه أيضاً — واختبارات مخصصة في `CMS.Tests/Unit/Services/PasswordSecurityTests.cs` | |
| خنق تسجيل الدخول | سياسة "login" خمس محاولات كل 5 دقائق (تقسيم IP+حساب+تثبيت)؛ ودخول المشرفين خمس محاولات في الدقيقة لكل IP **و** 20 كل 5 دقائق لكل بريد إلكتروني مطبَّع مع `Retry-After` | Program.cs:131, 145-151؛ وSecurityMiddleware.cs:156-162 |
| ‏OTP | مُعطَّل افتراضياً بمفتاح ميزة (`Features__OtpEnabled=false`، render.yaml:81-82؛ والمسار مخفي في الواجهة، router.tsx:38,47) | |

سطحا هوية منفصلان: `api/v1/auth/*` (الطلاب، قائم على الهاتف) و`api/v1/auth/admin/*` (المشغلون) بتحصين مستقل لكل منهما (AdminAuthController.cs:17).

## 2. التخويل

- سياسات الأدوار: `StudentOnly`، و`AdminOnly`، و`QuestionManagement` (دور + مطالبة `permissions`)، و`SuperAdmin` (Program.cs:87-96) مع مجموعة سياسات مسجلة (`CMS.Api/Authorization`، و`Policies.Register`).
- ‏`PermissionHandler` ‏(معالج `IAuthorizationHandler` مخصص، Program.cs:97) يقيّم صلاحيات المشرفين مع **النطاق** (جامعة/كلية/سنة/مادة) — وهي درجة دقة التحكم بالوصول القائم على الأدوار التي تحررها واجهة الإدارة عبر `PermissionMatrixEditor`/`UiPermissionsEditor`.
- صلاحيات الواجهة تفشل **مغلقةً**: الخدمة غير متاحة ← `UiPermissionsUnavailableException` ← الخطأ 503، ولا فراغ بمعنى المنع أبداً، ولا وصول كامل أبداً (ExceptionHandlingMiddleware.cs:44-49).
- الملكية في جهة الطالب: كل عملية تغيير تستنبط هوية المستدعي من `sub` وتقيّد بـ studentId (مثال: MediaController.cs:160-177 لتعديل/حذف الإشارات المرجعية للمالك وحده).

## 3. إنفاذ الاستحقاقات (التحكم بالوصول إلى المحتوى)

بوابة المحتوى الجوهرية للمنصة — رمز ثانٍ قصير العمر **مستقل عن الـ JWT**:

1. ‏`POST /api/v1/entitlements/issue` — يصادق الطالب؛ ويفحص الخادم **اشتراكاً نشطاً** (`student_subscriptions`، وSignedEntitlementService.cs:164) ثم يصدر **رمزاً موقَّعاً بـ HMAC-SHA256** مرتبطاً بـ `(studentId, installationId)` بمدة حياة قصيرة (`:41-74`).
2. كل طلب محتوى/وسائط يحمل `X-Entitlement` مع `X-Installation-Id`؛ وتستدعي المعالجات `ValidateAsync` الذي يفحص التوقيع والحداثة (تفاوت ±1 دقيقة) و**ربط مدة الحياة** (لا يمكن أن تتجاوز مدة الرمز مدة السياسة)، ثم **يعيد فحص حيوية الاشتراك** (`:77-133`).
3. نقاط الإنفاذ (كلها تستخدم نمط دالة البوابة نفسه، MediaController.cs:236-250):‏ `/access` مع `/content` للمكتبة (LibraryController.cs:92-123)، و`playback-url` للوسائط، ووسيط HLS، والإشارات المرجعية، والتقدم (MediaController.cs:53-213)، وفهرس الدورات مع `/access` للحلقات (CoursesController.cs:15, 70, 110).

ربط الأجهزة: جدول `device_bindings` مع `user_installations` (فريد لكل مستخدم+تثبيت) ومطالبة `installation_id` — محتوى الطالب مقيَّد بجهازه المرتبط؛ ويمكن للمشرفين إبطال جهاز (StudentsCenter، وCMS_FINAL_FUNCTIONAL_STATUS.md:32).

## 4. مكافحة الاستخراج الآلي وحماية المحتوى

| التدبير | الدليل | الحد الصادق |
|---|---|---|
| رادعات نسخ داخل نطاق المشغّل: منع قائمة السياق/التحديد/النسخ/القص/السحب/الاختصارات داخل حاوية المشغّل بتنبيهات عربية؛ وقائمة سماح للتحديد المأذون به لأداة التظليل الدراسي | `protection/usePlayerProtection.ts:19, 51-56, 128-135` | يصف نفسه بأنه «رادع للنسخ الساذج، وليس حماية مطلقة» (ترويسة الملف :14-15) |
| العلامة المائية | `my-studies/watermark.css`؛ وتكامل PlayerShell | على مستوى الطبقة العلوية |
| ارتباطات موقعة مسبقاً بمدة قصيرة + تجديد صامت للعقد (`TTL−60s`) | useMediaLease.ts:63 | التقاط الارتباط خلال مدة الصلاحية يبقى ممكناً |
| ‏HLS عبر وسيط الواجهة البرمجية (سطح مصادقة على كل مقطع) | MediaController.cs:75-112 | |
| المستندات عبر قناة `/content` من الأصل نفسه (لا رابط حاوية مباشراً) | LibraryController.cs:113-123 | |
| فحص ملفات فاشل مغلق عند الرفع | `Infrastructure/Services/FailClosedFileScanner.cs`، و`TrustedFileScanner.cs` | |
| تنقية HTML ‏(Ganss.XSS) في جهة الخادم لمستندات المكتبة | CMS.Infrastructure.csproj:32-33؛ ومربوط في مسار الرفع (EXECUTION_STATUS.md:149-153) | |
| تنقية actionUrl للإشعارات (قائمة سماح ضد XSS وإعادة التوجيه المفتوحة) | `utils/sanitizeActionUrl.ts` — ‏59 حالة Vitest ‏(EXECUTION_STATUS.md:165-168) | |
| ‏`drop_console` في حزم الإنتاج | vite.config.ts للتطبيقين | |

## 5. النقل والترويسات

- ‏`SecurityHeadersMiddleware` ‏(SecurityMiddleware.cs:22-55):‏ CSP، و`X-Frame-Options: SAMEORIGIN`، و`nosniff`، و`Referrer-Policy: strict-origin-when-cross-origin`، و`Permissions-Policy` (رفض الموقع الجغرافي/المِيكروفون/الكاميرا)، و**HSTS** ‏(بمدة 31536000، وتشمل النطاقات الفرعية، ومع التحميل المسبق — لغير الارتباط المحلي فقط)، وCOOP/CORP ‏`same-origin`.
- تُعالَج الترويسات المحوَّلة بـ `ForwardLimit=1` مع إخلاء الشبكات المعروفة فلا يستطيع العملاء تزوير مفتاح تحديد المعدل (Program.cs:227-240).

## 6. إدارة الأسرار

- مخزن أسرار Render: مداخل `sync: false` لاتصال قاعدة البيانات، وسرّ JWT، وUpstash Redis، ومفتاحي B2 ‏(render.yaml:40-76)؛ وسرّ JWT **لا يُعطى قيمة افتراضية أبداً** — الإقلاع يرمي استثناءً إن غاب أو قصُر (Program.cs:58-60).
- **ترفض CI الأسرار المُدرجة في الشيفرة**: مسح بتعبيرات نمطية لكل الشجرة عن رموز `ghp_/gho_/ghu_/ghs_/ghr_` و`github_pat_`، إضافة إلى `scripts/ci/verify-security-artifact.sh` (الأفعال القابلة للتغيير وأنماط الأسرار) بوصفه المهمة رقم 0 ‏(ci.yml:38-51). وتوجد وصيلة pre-commit ‏(`.githooks/`).
- يوثِّق `.env.example` العناصر النائبة فقط؛ ومسار رمز Upstash Blob المُحال موثَّق صراحةً بأنه معطَّل (ملاحظة "RETIRED" في .env.example).
- حزم العمل دون اتصال: تشفير محتوى **AES-GCM** مع تغليف بمفتاح **Keystore العام** للجهاز (‏RSA بـ 2048 فأكثر مفروض)، وإصدار المفتاح مُسجَّل ويُرفض دون تفويض (OfflinePackageCryptoService.cs:54-109).
- سلامة أندرويد: `FailClosedPlayIntegrityService` — «الوضع الآمن الافتراضي إلى أن يُهيَّأ مزود Google Play ومخزن الإعادة والتحقق من الحكم في جهة الخادم» (ترويسة الملف :7)؛ ومفتاح Play Integrity معطَّل في الإنتاج (render.yaml:85-86).

## 7. التدقيق والمراقبة

- يسجل `AuditLoggingMiddleware` الحالة النهائية (شاملاً 401/403/5xx) دون رموز أو بيانات شخصية (Program.cs:262-266).
- ‏`admin_activity_logs` (بمفتاح أجنبي Restrict للحذف)، و`security_logs` (بمفاتيح NoAction — أدلة غير قابلة للتعديل)، و`SecurityEventBatchService` (كتابات مجمَّعة)، و`SecurityAuditRetentionService` (التقليم، المرحلة Phase 44).
- معرّفات ارتباط على كل طلب (CorrelationIdMiddleware، وProgram.cs:252).

## 8. الفجوات المعروفة (من سجلات المستودع نفسه)

1. **ثمانية عوائق بأولوية قصوى P0، كلها BLOCKED_EXTERNAL** (بيانات اعتماد/قرارات من المالك) — يصف package.json:5 المشروع بأنه «NOT Production Ready».
2. التحقق من Play Integrity كعبٌ فاشل مغلق (لا مزود Google) — render.yaml:85-86، وFailClosedPlayIntegrityService.cs:7.
3. ‏OTP معطَّل افتراضياً؛ ومسار الشيفرة باقٍ (الخطر محتوى بمفتاح الميزة والمسار المخفي).
4. ‏CORS بـ `AllowCredentials()` مع أصلين ثابتين (Program.cs:108-120) — ضيّق، لكن اقترانه برموز الاستحقاق المحمولة في الترويسات يعني بيانات اعتماد وترويسات مخصصة على الطلبات العابرة للأصول؛ مقبول، ومراجعته من مدقق خارجي **UNVERIFIED**.
5. لا دليل في المستودع على اختبار اختراق خارجي (يحتوي docs/security على 70 تقريراً داخلياً؛ والتدقيق من طرف ثالث **UNVERIFIED**).
6. أخفت اختبارات التكامل على InMemory خطأ ترجمة EF وصل إلى الإنتاج (EXECUTION_STATUS.md:274-311) — فجوة عملية، وليست ثغرة مباشرة.
7. بنية تحتية مشتركة بالشريحة المجانية (خطة Render المجانية) — تبعات الجار الصاخب والقرص الزائل على منصة محتوى.
8. **رمز الوصول GitHub الذي لُصق في طلب التحليل** (خارج المستودع) — التوصية بالتدوير؛ ولم يستخدمه هذا التحليل (استنساخ عام).

---

*ذو صلة: [01-architecture.md](01-architecture.md) · [07-quality.md](07-quality.md) · docs/security/ (70 تقريراً داخلياً)*
