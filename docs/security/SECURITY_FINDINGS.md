# CMS — Phase 33 Security Findings Register

**نوع الفحص:** مراجعة ساكنة ومعمارية آمنة لنسخة المصدر المرفقة. لم يُشغَّل التطبيق، ولم تُجرَ أي محاولات اختراق أو حذف أو تعديل لبيانات أو خدمات خارجية.  
**نطاق الإثبات:** كل نتيجة أدناه مرتبطة بمسار وموضع في الشيفرة أو التهيئة المرفقة. لا تُعرض أي قيمة سرية في هذا المستند.

> **قاعدة التفسير:** تشير كلمة **مُثبت** إلى سلوك ظاهر في الشيفرة. وتشير كلمة **غير متحقق منه** إلى إعداد خارجي لا يمكن إثبات حالته من حزمة المصدر وحدها، مثل خصوصية bucket في Cloudflare R2 أو فعالية قواعد WAF المنشورة.

## ملخص الترتيب

| الشدة | العدد | المعرفات |
|---|---:|---|
| **CRITICAL** | 3 | SEC-001، SEC-002، SEC-003 |
| **HIGH** | 6 | SEC-004 إلى SEC-009 |
| **MEDIUM** | 6 | SEC-010 إلى SEC-015 |
| **LOW / INFORMATIONAL** | 3 | SEC-016 إلى SEC-018 |

## النتائج الحرجة

### SEC-001 — تجاوز المصادقة عبر Refresh Token غير مُتحقق منه

| الحقل | التفاصيل |
|---|---|
| **Severity** | CRITICAL |
| **Component** | Authentication / Token refresh |
| **Evidence** | `apps/api/src/CMS.Infrastructure/Security/SecurityServices.cs:119-132`، و`apps/api/src/CMS.Application/Handlers/Auth/AuthHandlers.cs:195-203`، و`apps/api/src/CMS.Api/Controllers/AuthController.cs:94-103` |
| **Current behavior** | دالة `GetUserIdFromToken` تستخدم `ReadJwtToken` لاستخراج `sub` فقط، من دون التحقق من التوقيع أو المصدر أو الجمهور أو العمر. ثم يعيد endpoint عام بلا مصادقة إصدار Access وRefresh tokens جديدين لهذا المعرّف. |
| **Security risk** | يمكن للخصم إنشاء JWT قابل للتحليل محلياً يحوي `sub` بمعرّف GUID، ثم طلب `/api/v1/auth/refresh` للحصول على رموز موقعة من الخادم. لا توجد قائمة جلسات أو بصمة Refresh Token مخزنة للتحقق أو الإبطال أو الدوران. |
| **Safe exploitation scenario** | إنشاء token شكلي به `sub` صالح ثم إرساله لمسار refresh؛ لا تحتاج هذه العملية إلى token موقّع أصلاً وفق السلوك الحالي. لم يُنفذ هذا السيناريو عملياً احتراماً لقيود Phase 33. |
| **Required fix** | لا تُستخرج هوية refresh token قبل `ValidateToken` الكامل. استخدم refresh token عشوائياً غير قابل للتحليل، خزّن hash له مرتبطاً بالمستخدم والجهاز والجلسة، طبّق rotation لمرة واحدة، واكشف إعادة الاستخدام. يجب أيضاً التحقق من وجود الطالب/المدير وحالته قبل الإصدار. |
| **Complexity / dependencies** | مرتفعة؛ تتطلب جدول جلسات أو مخزناً موثوقاً، migration، وسياسة إبطال. |
| **Priority** | P0 — أوقف النشر قبل المعالجة. |

### SEC-002 — غياب التحقق الخلفي من الاستحقاق الأكاديمي والاشتراك للمحتوى المدفوع

| الحقل | التفاصيل |
|---|---|
| **Severity** | CRITICAL |
| **Component** | Authorization / Questions / Library / Offline |
| **Evidence** | `QuestionHandlers.cs:23-109`، `LibraryHandlers.cs:42-103`، `OfflineHandlers.cs:41-121`، والمتـحكمات المقابلة في `QuestionsController.cs` و`LibraryController.cs` و`OfflineController.cs`. |
| **Current behavior** | تتحقق endpoints أساساً من وجود مستخدم مصادق عليه، ثم تقرأ الأسئلة المنشورة أو ملفات مادة أو تنشئ حزمة Offline بحسب ID في الطلب. لا يظهر فحص لخطة اشتراك الطالب أو جامعته أو كليته أو سنته أو حقه في المادة/المحاضرة. |
| **Security risk** | طالب صالح — أو من حصل على token عبر SEC-001 — يستطيع طلب معرّفات مواد أو أسئلة أو ملفات منشورة خارج نطاق اشتراكه. مسار الحصول على رابط ملف موقّع لا يفرض entitlement قبل إصدار الرابط. |
| **Safe exploitation scenario** | تغيير `subjectId` أو `id` في طلب مصادق عليه إلى معرّف محتوى منشور آخر؛ handler يعامل المعرّف المطلوب كمصدر موثوق. |
| **Required fix** | تقديم خدمة entitlement مركزية في Backend تقرر `student × resource × action` قبل كل قراءة أو تنزيل أو إجابة أو رابط موقّع. يجب أن تشمل الجامعة والكلية والسنة والمادة وتاريخ الاشتراك والحالة والإلغاء، ولا يجوز الاعتماد على إخفاء عناصر الواجهة. |
| **Complexity / dependencies** | مرتفعة؛ يلزم إكمال كيانات الاشتراك والمجال وترحيلات قاعدة البيانات واختبارات IDOR/BOLA. |
| **Priority** | P0. |

### SEC-003 — حدود صلاحيات المدير والنطاق الإداري غير مفروضة فعلياً

| الحقل | التفاصيل |
|---|---|
| **Severity** | CRITICAL |
| **Component** | Admin authorization / RBAC + ABAC |
| **Evidence** | `AdminDashboardController.cs:14-128`، `PermissionAuthorization.cs:189-236`، `Program.cs:47-55`، و`Infrastructure/DependencyInjection/DependencyInjection.cs`. |
| **Current behavior** | غالبية عمليات الإدارة الحساسة تحمي فقط بـ`[Authorize(Roles = "admin,super_admin")]`. توجد classes للصلاحيات والنطاق، لكن لا يظهر تسجيل `PermissionHandler` أو `ScopeHandler` أو استدعاء `Policies.Register`، كما لا يمرر Dashboard handlers هوية المدير للتحقق من النطاق. |
| **Security risk** | أي حساب يحمل دور `admin` يمكنه قراءة قوائم طلاب وبيانات إيراد وتوليد أكواد وحظر/إلغاء حظر مستخدمين، بغض النظر عن الجامعة أو الكلية أو المادة التي يفترض أن تقيّده. |
| **Safe exploitation scenario** | مدير مادة يطلب endpoint إدارياً مع معرّف طالب أو مادة من نطاق آخر؛ لا توجد طبقة Backend ظاهرة تربط العملية بنطاق مدير الطلب. |
| **Required fix** | تسجيل handlers والسياسات، وإضافة authorization requirement صريح لكل endpoint حساس. يجب تنفيذ تحقق النطاق داخل command/query handler اعتماداً على identity من server-side وليس DTO. أضف اختبارات مصفوفة للأدوار والنطاقات. |
| **Complexity / dependencies** | مرتفعة؛ تتطلب تصميم صلاحيات موحداً وإكمال schema للأدوار والنطاقات. |
| **Priority** | P0. |

## النتائج العالية

### SEC-004 — مواد سرية غير صورية موجودة في حزمة الإصدار

| الحقل | التفاصيل |
|---|---|
| **Severity** | HIGH |
| **Component** | Secrets / Deployment |
| **Evidence** | `CMS_Source/.env.production` و`Environment/.env.production`؛ مسح metadata أثبت وجود قيم غير مصنفة كـplaceholder لمفاتيح R2 وWhatsApp وإعدادات قاعدة البيانات/Redis، من دون عرض قيمها. |
| **Current behavior** | ملفا بيئة إنتاج موجودان داخل حزمة المصدر. وجود `.gitignore` يمنع التتبع مستقبلاً، لكنه لا يحمي القيم التي أُدرجت بالفعل في أرشيف التسليم. لا يتضمن الأرشيف `.git`، لذلك لا يمكن إثبات تاريخ التعرض أو صحة القيم عن بعد. |
| **Security risk** | إن كانت القيم حقيقية، فمشاركة الأرشيف توسع سطح التعرض لخدمات التخزين أو الرسائل أو البيانات. |
| **Required fix** | اعتبر القيم المتأثرة مكشوفة حتى يثبت العكس: rotate للمفاتيح، أزل ملفات production من التوزيع، وفر قالباً بلا أسرار فقط، واستخدم secret manager في CI/Railway/Vercel. |
| **Complexity / dependencies** | متوسطة؛ تتطلب تنسيقاً مع مالكي البنية الخارجية. |
| **Priority** | P0/P1 بحسب تأكيد صلاحية القيم. |

### SEC-005 — محرك Offline يخزن المحتوى والمفتاح في IndexedDB بصيغة واضحة

| الحقل | التفاصيل |
|---|---|
| **Severity** | HIGH |
| **Component** | Offline engine / PWA |
| **Evidence** | `offline-db.ts:47-77` و`offline-db.ts:203-221`، و`useOffline.ts:65-79`، و`OfflineHandlers.cs:70-121`. |
| **Current behavior** | تحفظ الواجهة نصوص الأسئلة والخيارات و`encryptionKey` في record واحد داخل IndexedDB عبر `store.put` بلا AES أو Web Crypto أو تحقق سلامة. يولد الخادم مفتاح AES لكنه لا يشفّر payload به قبل الإرسال. |
| **Security risk** | يمكن لأي مستخدم يملك وصولاً محلياً إلى ملف تعريف المتصفح استخراج محتوى الحزم من DevTools/Application/IndexedDB أو نسخه. لا توجد device binding أو signature أو secure keystore يحمي هذا المحتوى. |
| **Required fix** | لا ترسل مفتاح تشفير مع النص الواضح. صمم envelope encryption للمحتوى، واربط مفتاح فك التشفير بجلسة/جهاز موثوق، واستخدم AES-GCM مع nonce فريد وAAD وintegrity، مع وجود حدود واقعية: لا يمكن لتطبيق ويب منع مستخدم مخول من التقاط المحتوى المعروض. |
| **Complexity / dependencies** | مرتفعة؛ يلزم تصميم جديد لOffline entitlement وkey management. |
| **Priority** | P1. |

### SEC-006 — ربط الأجهزة موجود ككود لكنه غير مدمج في المصادقة أو التحقق من JWT

| الحقل | التفاصيل |
|---|---|
| **Severity** | HIGH |
| **Component** | Device binding / Session security |
| **Evidence** | `SecurityService.cs:27-74`، `AuthHandlers.cs:159-173`، `SecurityServices.cs:69-72`، و`Infrastructure/DependencyInjection/DependencyInjection.cs:44-48`. |
| **Current behavior** | توجد دالة للتحقق من البصمة وربط أول جهاز، لكن Login handler يحتوي TODO صريحاً ويتجاوز التحقق. كما لا يظهر تسجيل SecurityService في DI، ولا تحقق في JWT من claim `device_fingerprint`. |
| **Security risk** | نسخ Access أو Refresh token إلى جهاز مختلف لا يُكتشف ولا يُمنع. بصمة الجهاز المرسلة من العميل يمكن أيضاً تعديلها لأنها قيمة localStorage/header غير موثوقة بمفردها. |
| **Required fix** | طبّق binding في مسار الدخول والتجديد والتحقق من token، واستخدم session identifier مخزناً server-side مع سجل جهاز وحدود انتقال وworkflow تأكيد. تعامل مع البصمة كإشارة خطر لا كعامل إثبات مستقل. |
| **Complexity / dependencies** | مرتفعة. |
| **Priority** | P1. |

### SEC-007 — الإبطال وتدوير الجلسات غير فعالين

| الحقل | التفاصيل |
|---|---|
| **Severity** | HIGH |
| **Component** | Logout / Token revocation |
| **Evidence** | `AuthHandlers.cs:209-219`، `Program.cs:29-44`، و`SecurityServices.cs:93-117`. |
| **Current behavior** | logout يكتب قيمة blacklist مؤقتة في Redis باستخدام `GetHashCode()`، لكن pipeline الخاص بـJWT لا يستعلم عنها عند التحقق. Refresh tokens لا تحفظ ولا تدور ولا ترتبط بجهاز أو session record. |
| **Security risk** | يبقى access token المسروق صالحاً حتى انتهاء صلاحيته، ولا يمكن إبطال refresh token موثوقاً أو اكتشاف إعادة استخدامه. |
| **Required fix** | اعتمد JTI أو token version وحفظاً hash-based للجلسات، وتحقق من الإبطال داخل `OnTokenValidated`، واربط logout بكل token/session مع TTL مناسب. |
| **Complexity / dependencies** | متوسطة إلى مرتفعة. |
| **Priority** | P1. |

### SEC-008 — المصادقة الثنائية للإدارة لا تتحقق من TOTP فعلياً

| الحقل | التفاصيل |
|---|---|
| **Severity** | HIGH |
| **Component** | Admin authentication / 2FA |
| **Evidence** | `AdminHandlers.cs:50-60` و`AdminHandlers.cs:122-146`. |
| **Current behavior** | عند تفعيل 2FA يقبل مسار الدخول أي ستة أرقام؛ التعليق يصرح بعدم تنفيذ تحقق TOTP. كما يتم تفعيل السر مباشرة قبل workflow تحقق مستقل. |
| **Security risk** | لا تضيف 2FA طبقة مقاومة فعلية ضد سرقة كلمة مرور مدير. |
| **Required fix** | استخدم مكتبة TOTP موثوقة، تحقق من رمز أول قبل اعتماد التفعيل، خزّن السر مشفراً، خزّن recovery codes كـhashes، وحدد rate limiting ومراجعة أحداث الاستخدام. |
| **Complexity / dependencies** | متوسطة. |
| **Priority** | P1. |

### SEC-009 — الرفع المباشر إلى R2 لا يطبق تحقق ملف أو فحص برمجيات خبيثة قبل النشر

| الحقل | التفاصيل |
|---|---|
| **Severity** | HIGH |
| **Component** | Library uploads / R2 |
| **Evidence** | `LibraryHandlers.cs:130-192` و`ExternalServices.cs:91-101`. |
| **Current behavior** | يتحقق handler من enum لنوع الملف وحجم معلن من العميل فقط. اسم الملف وContent-Type والحجم الفعلي لا تتحقق من محتوى object، ثم ينشر `CompleteUpload` الملف بعد `ExistsAsync` رغم أن حالة virus scan ما تزال Pending. خدمة الرابط الموقّع تنشئ GET فقط، لا PUT مشروطاً، ما يدل أيضاً على أن تدفق الرفع غير مكتمل وظيفياً. |
| **Security risk** | عند إصلاح الرفع دون ضوابط إضافية قد يصل HTML ضار أو SVG أو ملف متنكر إلى المكتبة، أو تُخزن ملفات أكبر/مختلفة عن metadata. |
| **Required fix** | طبّق allowlist للامتدادات وMIME عبر فحص server-side، حدود حجم عند edge/R2، scan غير متزامن، حجر الملف حتى النجاح، أسماء مفاتيح server-generated فقط، وheaders تنزيل آمنة. لا تنشر المحتوى قبل clean verdict. |
| **Complexity / dependencies** | مرتفعة؛ تتطلب خدمة scanning/queue وبنية الحالة. |
| **Priority** | P1. |

## النتائج المتوسطة

### SEC-010 — Tokens محفوظة في localStorage وسطح XSS غير منضبط تماماً

| الحقل | التفاصيل |
|---|---|
| **Severity** | MEDIUM |
| **Component** | Frontend session / XSS |
| **Evidence** | `api-client.ts:17-26,43-57`، `AuthProvider.tsx:31-75`، و`LibraryPage.tsx:250-253`. |
| **Current behavior** | Access وRefresh tokens محفوظة في localStorage. كما توجد `dangerouslySetInnerHTML` لعرض قيمة `accessUrl`. لا توجد CSP في `vercel.json` للواجهة، وVite يسمح بسورسمابات الإنتاج. |
| **Security risk** | أي XSS فعلي في نفس أصل الواجهة يستطيع قراءة الرموز واستخدامها، في حين يعطل غياب CSP طبقة احتواء مهمة. السطر الخاص بالـHTML هو sink ينبغي عدم الاعتماد على سلامته ما لم يكن المحتوى مُعقماً. |
| **Required fix** | خفّض سطح XSS: لا تستخدم `dangerouslySetInnerHTML` للمحتوى غير المعقم، أضف CSP مناسباً بلا `unsafe-eval`، وقيّم cookies محمية HttpOnly/SameSite أو نموذج BFF للرموز بحسب تصميم المنتج. |
| **Complexity / dependencies** | متوسطة. |
| **Priority** | P2. |

### SEC-011 — حماية المحتوى في المتصفح قابلة للتجاوز وتقاريرها غير موصولة بخادم

| الحقل | التفاصيل |
|---|---|
| **Severity** | MEDIUM |
| **Component** | Client-side content protection |
| **Evidence** | `useContentProtection.ts:10-245`، `SecurityController.cs`، `SecurityWrapper.tsx`. |
| **Current behavior** | يمنع العميل copy/context menu وبعض اختصارات DevTools ويعرض watermark CSS، لكنه يرسل الأحداث إلى `/security/log` الذي لا يظهر ضمن SecurityController الإداري فقط. كشف DevTools مبني على فرق حجم النافذة، ولقطة الشاشة معطلة افتراضياً وتستخدم blur heuristic فقط. |
| **Security risk** | يمكن تجاوز هذه الضوابط من أدوات المتصفح أو تعديل JavaScript أو استخراج البيانات من network/storage. لا ينبغي تقديمها كممانعة حقيقية للنسخ أو التسجيل. |
| **Required fix** | أضف endpoint telemetry مصادقاً ومحدد المعدل إن كانت القياسات لازمة، واعتبر هذه الضوابط deterrence/forensics فقط. استخدم watermark خادماً/مرئياً حيث يمكن، ولا تعد بحماية screenshots في الويب. |
| **Complexity / dependencies** | متوسطة. |
| **Priority** | P2. |

### SEC-012 — ضبط المعدل المعلن للمصادقة غير موصول بالـpipeline بصورة مثبتة

| الحقل | التفاصيل |
|---|---|
| **Severity** | MEDIUM |
| **Component** | Rate limiting / Brute-force protection |
| **Evidence** | `Program.cs:80-100,153-160` و`SecurityMiddleware.cs:129-192` و`nginx-prod.conf:17-20,77-91`. |
| **Current behavior** | Program يعرّف policy باسم `auth` لكنه لا يطبقها على endpoints. يوجد AuthRateLimitMiddleware مخصص لكن لا يظهر تسجيله. Nginx يطبق limiter على `/api/auth/` بينما المسارات الخلفية الفعلية هي `/api/v1/auth/...`، إضافة إلى global fixed window عام 100 طلب/دقيقة. |
| **Security risk** | حماية password/OTP من التخمين والـcredential stuffing أضعف من المقصود أو قد تعتمد على تطابق نشر غير مثبت. |
| **Required fix** | اجعل limiter endpoint-specific في ASP.NET (`RequireRateLimiting("auth")`) مع key مركب IP + حساب، وأضف backoff/lockout مراقباً وقياساً. طابق مسارات Nginx مع URI المنشور الفعلي. |
| **Complexity / dependencies** | متوسطة. |
| **Priority** | P2. |

### SEC-013 — حزم Offline لا تتحقق من الملكية أو محتوى الحزمة عند المزامنة

| الحقل | التفاصيل |
|---|---|
| **Severity** | MEDIUM |
| **Component** | Offline sync / Integrity |
| **Evidence** | `OfflineHandlers.cs:128-240` و`OfflineController.cs:44-52`. |
| **Current behavior** | handler يقرأ metadata من Redis، لكنه لا يستخدم `correctAnswersRaw` ولا يثبت أن package belongs to الطالب الحالي أو أن كل سؤال وارد ضمن `QuestionIds` للحزمة قبل كتابة AttemptLog. يعتمد على الاستعلام المباشر من قاعدة البيانات لكل سؤال. |
| **Security risk** | يسمح التصميم بإرسال إجابات offline مختارة خارج الحزمة أو إعادة استخدام package ID بصورة غير منضبطة، ويضعف نزاهة إحصاءات ومحاولات الطالب. |
| **Required fix** | تحقق من package ownership وexpiry وexam/subject وquestion membership لكل batch، واستخدم server-issued opaque package/session nonce وتوقيع payload أو MAC. نفذ المعالجة في transaction مع idempotency key. |
| **Complexity / dependencies** | متوسطة إلى مرتفعة. |
| **Priority** | P2. |

### SEC-014 — وضع CSP والرؤوس الأمنية غير متسق بين التطبيق والواجهة

| الحقل | التفاصيل |
|---|---|
| **Severity** | MEDIUM |
| **Component** | HTTP security / Frontend deployment |
| **Evidence** | `SecurityMiddleware.cs:20-53`، `ExceptionHandlingMiddleware.cs:137-160`، `vercel.json:11-24`، و`vite.config.ts:72-100`. |
| **Current behavior** | API middleware المقترح يحتوي `unsafe-inline` و`unsafe-eval` في CSP، بينما middleware آخر يضع `default-src 'self'` فقط. Vercel يضع رؤوساً مفيدة لكنه لا يعلن CSP. الإنتاج يبني sourcemaps (`sourcemap: true`). |
| **Security risk** | تراجع دفاع XSS وتعقيد في توقع سلوك الواجهة؛ sourcemaps توسع قدرة المهاجم على فهم الشيفرة لكنها ليست ثغرة مستقلة. |
| **Required fix** | اصنع CSP واحداً خاصاً بكل origin، أزل `unsafe-eval` في الإنتاج، استخدم nonces/hashes إن لزم، واضبط نشر sourcemaps في مصدر مراقب أو عطّلها للعامة. |
| **Complexity / dependencies** | متوسطة. |
| **Priority** | P2. |

### SEC-015 — سلامة الاعتماديات والنشر غير قابلة لإعادة الإنتاج

| الحقل | التفاصيل |
|---|---|
| **Severity** | MEDIUM |
| **Component** | Supply chain / CI-CD |
| **Evidence** | غياب lockfile في `CMS_Source/`، و`vercel.json:3,6`، و`.github/workflows/ci.yml`، و`package.json` files. |
| **Current behavior** | مسارات CI/Vercel تستخدم `pnpm install --frozen-lockfile` رغم عدم وجود `pnpm-lock.yaml` في حزمة الإصدار. بعض actions تستخدم refs متحركة مثل `@master` وفق pipeline. |
| **Security risk** | لا يمكن إثبات artifact قابل لإعادة البناء أو إجراء تدقيق دقيق للشجرة الانتقالية للاعتماديات؛ وقد يفشل النشر أو يسحب نسخاً مختلفة. |
| **Required fix** | أنشئ lockfile موثقاً، فعّل dependency review وSBOM ونسخاً مثبتة بالـcommit SHA لـGitHub Actions، ثم نفذ scan في CI على lockfile/containers. |
| **Complexity / dependencies** | متوسطة. |
| **Priority** | P2. |

## النتائج المنخفضة والمعلوماتية

### SEC-016 — سجلات الأمان قد تحتوي بيانات شخصية ولا توجد سياسة احتفاظ ظاهرة

| الحقل | التفاصيل |
|---|---|
| **Severity** | LOW |
| **Component** | Logging / Privacy |
| **Evidence** | `SecurityMiddleware.cs:83-123` و`SecurityService.cs:87-100`. |
| **Risk and action** | تسجل الطلبات عنوان IP وUser-Agent وstudent/admin identifiers، وهو مفيد للتدقيق لكنه يحتاج minimization، صلاحية وصول، retention schedule، وحماية للنسخ الاحتياطية. |
| **Priority** | P3. |

### SEC-017 — إعدادات R2 وRedis وحالة قاعدة البيانات الخارجية غير قابلة للتحقق من المصدر وحده

| الحقل | التفاصيل |
|---|---|
| **Severity** | INFORMATIONAL |
| **Component** | External infrastructure |
| **Evidence** | `ExternalServices.cs` و`appsettings.json` وملفات Docker. |
| **Risk and action** | لا يمكن من هذه الحزمة تأكيد أن bucket خاص، أو أن credentials مقيدة، أو أن Redis مشفر/محمي شبكياً، أو أن backups مشفرة. يتطلب ذلك مراجعة لوحة Cloudflare/Railway وnetwork policies، بعد موافقة مالك البيئة. |
| **Priority** | P3. |

### SEC-018 — لا توجد تطبيقات Android أو Windows فعلية ضمن المصدر للمراجعة

| الحقل | التفاصيل |
|---|---|
| **Severity** | INFORMATIONAL |
| **Component** | Platform readiness |
| **Evidence** | `CMS_Source/apps/` يحتوي API وStudent Web فقط. |
| **Risk and action** | التقييم أدناه هو استعداد Backend/API للتطبيقات المستقبلية، وليس تدقيقاً لتطبيق Android أو Windows موجود. |
| **Priority** | P3. |

## ملاحظات إيجابية مثبتة

| الضابط | الحالة | الدليل |
|---|---|---|
| Hash كلمات المرور | IMPLEMENTED | BCrypt مع cost factor 12 في `SecurityServices.cs:14-27`. |
| Access token signature validation | PARTIAL | إعداد JWT يفعّل issuer/audience/lifetime/signing key في `Program.cs:29-44`؛ يضعفه مسار refresh في SEC-001. |
| CORS المقيد | IMPLEMENTED جزئياً | أصول student/admin محددة في `Program.cs:65-78`، لكن التحقق الفعلي للنشر غير ممكن من المصدر. |
| رؤوس أساسية وHTTPS | PARTIAL | إعدادات Nginx/Vercel وميدلوير خلفي موجودة، لكن CSP غير موحد. |
| روابط محتوى قصيرة العمر | PARTIAL | رابط R2 موقّع لمدة 5 دقائق في `LibraryHandlers.cs:95-102`، لكن entitlement قبل الإصدار غير موجود. |
| Health checks / structured logging | PARTIAL | توجد Health checks وSerilog، لكن AuditLoggingMiddleware غير ظاهر في pipeline ولا توجد retention policy. |

---

**الحكم التنفيذي:** يجب معالجة SEC-001 وSEC-002 وSEC-003 وSEC-004 قبل اعتبار أي بيئة متصلة بالمستخدمين جاهزة للاختبار المفتوح أو الإنتاج.


---

## ملحق حالة Phase 34 — 2026-08-18

هذا الملحق لا يحذف الأدلة التاريخية لـPhase 33؛ بل يحدّث حالة المعالجة وفق أدلة تنفيذ لاحقة. التفاصيل الكاملة في `SECURITY_REMEDIATION_MATRIX.md` و`PHASE_34_VERIFICATION_MATRIX.md`.

| مجموعة النتائج | حالة Phase 34 المحلية | الدليل |
|---|---|---|
| SEC-001، SEC-006، SEC-007 | LOCAL PASS | جلسات opaque، rotation/reuse revocation، middleware؛ تكامل PostgreSQL PASS. |
| SEC-002، SEC-003 | LOCAL PASS | Entitlement وscope/default deny؛ اختبارات entitlement/IDOR PASS. |
| SEC-004 | PARTIAL / EXTERNAL | artifact gate وTrivy secrets PASS؛ تدوير الأسرار الإنتاجية ما زال حصرياً للمالك. |
| SEC-005، SEC-013 | LOCAL PASS by default deny | Offline معطل؛ تصميم الحزمة المشفرة مؤجل ومحدد في `OFFLINE_PACKAGE_FORMAT.md`. |
| SEC-008 إلى SEC-015 | LOCAL PASS | 2FA/rate-limit/files/CSP/supply-chain/Docker non-root؛ build/tests/scans PASS. |
| SEC-016، SEC-017 | LOCAL PASS | ترحيل EF مطبق محلياً و39/39 اختبارات backend ناجحة. |
| SEC-018 | EXTERNAL | CI البعيد وCodeQL/SARIF وبناء صور Docker وstaging غير متحققين في هذه البيئة. |

> **قرار الإنتاج لا يتغير:** الحواجز الخارجية، ولا سيما تدوير الأسرار والتحقق البعيد، تمنع إعلان الإغلاق الإنتاجي النهائي رغم اكتمال الأدلة المحلية.
