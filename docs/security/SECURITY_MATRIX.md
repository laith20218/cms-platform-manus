# CMS — Phase 33 Security Matrix

**منهج الحالة:** `IMPLEMENTED` = موجود ومربوط وظيفياً حسب الشيفرة، `PARTIAL` = موجود لكن غير مكتمل/غير موصول، `WEAK` = موجود لكنه لا يحقق الضمان الأمني المطلوب، `MISSING` = لا يظهر تنفيذ فعلي، `UNVERIFIED` = يعتمد على إعداد خارجي لا يمكن إثباته من الحزمة.

| Security Area | Status | أعلى Severity | Current State | Required Action |
|---|---|---:|---|---|
| Authentication | **WEAK** | CRITICAL | BCrypt جيد وJWT access tokens موقعة، لكن refresh token يستخرج `sub` بلا تحقق من توقيع أو تخزين جلسة. | استبدال refresh flow بمخزن جلسات وrotation وvalidation كامل. |
| Authorization | **WEAK** | CRITICAL | توجد أدوار وسياسات مُعرّفة، لكن RBAC/ABAC التفصيلي غير مسجل/غير مفروض على endpoints. | فرض entitlement وscope في handlers، مع اختبارات IDOR/BOLA. |
| Device Binding | **PARTIAL** | HIGH | خدمة تحقق موجودة، لكن Login لا يستدعيها ولا يظهر تسجيلها في DI. | دمج device/session binding في login/refresh/JWT. |
| Subscription | **MISSING** | CRITICAL | المراجع إلى اشتراكات موجودة، لكن نموذج المجال والـenforcement غير مكتملين في المصدر. | بناء entitlement/subscription model في Backend أولاً. |
| API | **WEAK** | CRITICAL | `[Authorize]` شائع، لكن لا توجد حماية مورد دقيقة ومطابقة routes غير مكتملة. | Contract tests، pagination limits، authorization policy لكل مورد. |
| Database | **PARTIAL** | HIGH | EF Core وقيود مجال موجودة، لكن كيانات/ترحيلات مهمة غائبة ولا يمكن التحقق من FK/constraints. | إكمال entities/migrations ثم مراجعة schema وtransactions. |
| R2 | **PARTIAL** | HIGH | روابط GET موقعة قصيرة العمر موجودة؛ لا entitlement قبل الإصدار ولا تحقق upload/scan كافٍ. | Private bucket، policy مقيدة، scan/quarantine، authorization قبل URL. |
| Redis | **PARTIAL** | HIGH | OTP/cache/blacklist مخطط لها مع TTL، لكن blacklist غير مستهلك وبيانات offline تعتمد Redis وحده. | Namespace، TLS/ACL، session store موثوق، لا تستخدم key scanning في hot path. |
| Encryption | **WEAK** | HIGH | BCrypt وJWT signing موجودان؛ Offline AES key مولد ولا يستخدم للتشفير. | AES-GCM envelope encryption وkey management؛ rotation للأسرار. |
| Offline | **WEAK** | HIGH | IndexedDB يحفظ payload وkey plaintext؛ لا membership/integrity متين عند sync. | تصميم offline entitlement وتوقيع package وidempotency. |
| PWA | **PARTIAL** | MEDIUM | PWA/Workbox موجودان؛ caching المحتوى المصادق وauth storage بحاجة سياسة صارمة. | لا cache للمحتوى المحمي إلا بسياسة واضحة؛ راجع source maps. |
| HTML uploads | **WEAK** | HIGH | iframe sandbox بلا scripts مفيد، لكن pipeline رفع/فحص/نشر غير مكتمل. | sanitize/isolate HTML، scan، Content-Disposition وCSP مستقل. |
| Admin | **WEAK** | CRITICAL | دخول مدير و2FA وشاشات إدارة موجودة، لكن 2FA شكلي ونطاق المدير غير مفروض. | TOTP فعلي وper-action scope enforcement وسجل تدقيق. |
| Notifications | **PARTIAL** | MEDIUM | endpoints وDTOs موجودة؛ push delivery موسوم TODO. | تحقق من الجمهور، صمم payload بلا PII، FCM server-side فقط. |
| Dependencies | **UNVERIFIED** | MEDIUM | manifests موجودة ولا lockfile. لا يمكن تدقيق شجرة الاعتماديات الحقيقية. | lockfile، SBOM، dependabot/renovate، actions pinned by SHA. |
| Deployment | **PARTIAL** | HIGH | Docker/Nginx/Vercel/Railway config موجود؛ env/routing/limiting غير متسقة. | توحيد env names وroutes وتنفيذ pre-deploy verification. |
| Logging & Monitoring | **PARTIAL** | MEDIUM | Serilog وsecurity log code موجودان؛ بعض middleware غير موصول ولا سياسة retention. | سجل تدقيق مركزي، redaction، retention، تنبيه لا يسبب حملًا متزامناً. |
| Android readiness | **NOT READY** | HIGH | لا يوجد تطبيق Android؛ Backend security/entitlement/offline غير ناضجة. | أصلح الهوية/الاستحقاق/offline قبل mobile API contract. |
| Windows readiness | **NOT READY** | HIGH | لا يوجد تطبيق Windows؛ WebView2 لا يعالج حماية token/offline وحده. | أصلح API/session/offline ثم صمم secure desktop storage/native bridge. |

## التغطية حسب وضع التنفيذ

| الفئة | النتيجة |
|---|---:|
| Implemented أو جزئي مفيد | BCrypt، JWT access validation، CORS مقيد، روابط R2 موقعة، رؤوس HTTP أساسية، Health checks. |
| Partial أو Weak يتطلب hardening | المصادقة، الإدارة، ربط الأجهزة، offline، الملفات، logging، caching، النشر. |
| Missing أو غير قابل للإثبات | entitlement الاشتراكي، كيانات/ترحيلات أساسية، lockfile، حالة R2/Redis/Cloudflare الخارجية، تطبيقات Android وWindows. |

> **بوابة Phase 34:** لا يبدأ hardening العلاجي قبل تدوير الأسرار المحتملة وإغلاق SEC-001 وSEC-002 وSEC-003، ثم تثبيت بناء قابل لإعادة الإنتاج.
