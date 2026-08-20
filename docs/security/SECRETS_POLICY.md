# CMS Secrets & Environment Policy — Phase 34

## الغرض

تحدد هذه السياسة الطريقة الوحيدة المقبولة لحفظ الأسرار وتوزيعها وتدويرها في CMS. لا يجوز أن يظهر أي credential فعلي في repository أو archive للإصدار أو Docker build context أو frontend bundle أو سجل CI.

## القاعدة التشغيلية

| نوع القيمة | مكان الحفظ المسموح | ممنوع |
| --- | --- | --- |
| كلمات مرور PostgreSQL وRedis | مدير أسرار المنصة أو متغيرات البيئة المحمية | Git، `.env.production`، image layers، logs |
| JWT signing secret | مدير أسرار مع owner وسياسة rotation | ملفات source أو frontend variables |
| R2 access/secret keys | مدير أسرار؛ أقل صلاحية ممكنة | bucket policy عامة أو artifact |
| WhatsApp/SMTP/Firebase server credentials | مدير أسرار خاص بالـbackend | `VITE_*` أو تطبيق العميل |
| Sentry auth token | secrets CI فقط | client bundle أو command logs |
| VITE values | إعدادات عامة قابلة للنشر فقط | أي token أو key أو password |

## ملفات البيئة

يحتوي المشروع فقط على `.env.example` و`.env.production.example`. أزيلت ملفات `.env.production` من شجرة الإصدار في Phase 34 ووُضعت خارج المشروع في حجر محلي؛ لا تمثل الحجر مصدراً آمناً بديلاً ولا يجب تضمينها في أي release لاحق.

## منع التسرب

1. يجب أن يمر كل pull request عبر `scripts/ci/verify-security-artifact.sh`.

1. يفشل CI إذا وجد `.env` أو `.env.production` أو credential file ضمن الشجرة أو نمط credential عالي الثقة.

1. لا تضاف secrets إلى Docker `ARG` أو `ENV` أثناء build؛ تُحقن وقت التشغيل فقط.

1. لا يطبع التطبيق Authorization headers أو OTP أو refresh tokens أو مفاتيح التشفير.

1. تفحص السجلات، artifacts، وSBOM منفصلة قبل الإصدار.

## الملكية والتدوير

| السر | المالك | بيئة الاستخدام | سياسة التدوير |
| --- | --- | --- | --- |
| JWT signing key | مسؤول Backend | production/staging | عند الاشتباه أو كل 90 يوماً؛ مع key ID وسياسة انتقال |
| R2 credentials | مسؤول البنية | backend فقط | عند الاشتباه أو كل 90 يوماً؛ إبطال القديم بعد تحقق الخدمة |
| Database / Redis | مسؤول البنية | backend فقط | عند الاشتباه أو حسب مزود الخدمة؛ اختبار connection قبل الإبطال |
| Messaging / Firebase | مسؤول التكاملات | backend workers فقط | عند الاشتباه أو كل 90–180 يوماً |
| CI deployment tokens | مسؤول CI/CD | GitHub Actions فقط | عند تغيير عضو/حادثة/كل 90 يوماً |

> التدوير الفعلي للحسابات الخارجية ليس منفذاً في Phase 34 المحلية، لأنه يتطلب وصول مالك الحساب وتأكيداً منفصلاً قبل تغيير خدمات حية. يجب اعتبار القيم الموجودة في artifact السابق محتملة التعرض إلى أن يكتمل التدو

