# حماية البيانات أثناء الاتصال — CMS

## نطاق الحماية

تغطي الحماية أثناء الاتصال المسار بين الطالب أو المدير وواجهة Vercel أو proxy، ثم API على Railway أو البيئة المستهدفة، ثم PostgreSQL وRedis وR2 والموفرين الخارجيين. لا يغني تشفير طبقة واحدة عن ضبط بقية المسار.

## المتطلبات الملزمة

| الطبقة | المتطلب |
|---|---|
| المتصفح إلى الواجهة/API | HTTPS فقط مع TLS حديث، ومنع mixed content. |
| HSTS | `Strict-Transport-Security` في production، مع `includeSubDomains` بعد تحقق ملكية النطاقات. |
| CORS | origins صريحة لتطبيق الطالب والإدارة؛ لا `*` مع credentials. |
| JWT | Authorization Bearer عبر HTTPS فقط، access token قصير العمر. |
| refresh | قيمة opaque ضمن طلب HTTPS، مرتبطة بـinstallation؛ لا تمرير في URL أو logs. |
| CSP | سياسة default-src self مع مصادر ضرورة محددة ومنع object/base injection. |
| PostgreSQL | اتصال خاص أو TLS مصادق مع أقل صلاحية للحساب. |
| Redis | private network أو TLS وauth؛ لا منفذ عام مكشوف. |
| R2/signed URLs | HTTPS، مدة قصيرة، entitlement قبل الإصدار، ومفتاح object لا يمنح وصولاً عاماً دائماً. |
| Observability | redact للـAuthorization وrefresh token وcookies وأسرار الموفرين. |

## الرؤوس والسياسات في Phase 34

تضيف الواجهة رؤوس CSP، `X-Content-Type-Options: nosniff`، `X-Frame-Options`، `Referrer-Policy` و`Permissions-Policy`. ويضيف backend رؤوس الحماية وHSTS للاتصالات غير المحلية. يعتمد تسجيل الدخول على `sessionStorage` في الواجهة ولا تخزن tokens في localStorage الدائم.

## تشغيل الإنتاج

يجب أن يقوم مالك النشر بالتحقق بعد النشر من redirect HTTP→HTTPS ومن chain certificate ومن HSTS ومن CSP ومن CORS لمجالات Vercel الفعلية. كما يجب فحص أن Railway/R2/Redis/PostgreSQL لا تقبل اتصالاً عاماً غير متوقع وأن credentials أو certificates مفعلة في secrets manager.

## منع التسرب في التشغيل

لا تسجل middleware أو exception handler content لـAuthorization ولا raw refresh token ولا OTP. يجب أن تبقى logs المصدرة إلى Sentry أو Slack أو أي مزود خارجي خاضعة لredaction قبل الإرسال. أي diagnostics محلي استخدم إعدادات مؤقتة لـEF أو قاعدة اختبار لا ينشر ولا ينسخ إلى artifacts.
