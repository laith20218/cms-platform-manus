# إدارة المفاتيح والأسرار — CMS

## المبدأ

الأسرار مواد تشغيلية لا مواد مصدر. لا تُنشأ أو تُدوّر قيم إنتاجية داخل repository أو أثناء build أو لأجل إغلاق مرحلة توثيقية. يجب أن تكون القيمة الجديدة عشوائية، محفوظة في secret manager، ومقترنة بسجل تغيير وإبطال للقيمة السابقة.

## سجل المواد وملكية الإدارة

| المادة | الغرض | الحد الأدنى | مالك التدوير | الإجراء عند الاشتباه أو التسرب |
|---|---|---|---|---|
| `Jwt:Secret` | توقيع access tokens | 32 بايت عشوائية أو أكثر | مالك backend/security | تدوير فوري، تغيير `kid`، وإبطال sessions المناسبة. |
| `Jwt:KeyId` | تعريف مفتاح JWT الحالي | معرف إصدار غير سري | مالك backend/security | نشر key set جديد ثم retire للقديم وفق نافذة صالحة. |
| PostgreSQL URI/password | بيانات CMS والجلسات والمنح | كلمة مرور قوية منفصلة لكل بيئة | مالك database/platform | تدوير credential، مراجعة الاتصالات، وإبطال الوصول السابق. |
| Redis URI/password/TLS | cache و2FA replay guard | endpoint خاص ومصادق عليه | مالك platform | تدوير credential ومسح مفاتيح replay عند الحاجة. |
| R2 credentials | تخزين الملفات الموقعة | access محدود النطاق | مالك storage | تدوير access key ومراجعة signed URL logs. |
| FCM/WhatsApp/Sentry/Slack | رسائل وتنبيه وتشغيل | credentials منفصلة لكل مزود | مالك integration | تدوير المفتاح ومراجعة استعمال المزود. |
| Vercel/Railway/GitHub tokens | نشر وCI | token أدنى صلاحية | مالك DevOps | إبطال token، إصدار token جديد، ومراجعة deploy history. |

## بروتوكول التدوير

1. يفتح مالك البيئة change record يحدد المادة والبيئات والأثر المتوقع ونافذة التنفيذ.
2. ينشئ السر الجديد في secret manager ولا يسجله في ticket أو log أو shell history أو repository.
3. ينشر السر الجديد إلى staging ويشغل smoke: health، إصدار JWT، login، refresh، 2FA، وsigned file URL عندما ينطبق.
4. ينشر إلى production ضمن نافذة معتمدة ويراقب أخطاء المصادقة وcache والملفات.
5. يبطل السر السابق من المصدر والموفر ويثبت وقت الإبطال في change record.
6. يرفق المالك evidence غير سري: secret version ID أو timestamp، نتيجة deploy، ونتيجة smoke.

## تدوير JWT بدون توقف غير مبرر

يستخدم JWT `kid`. يمكن خلال نافذة قصيرة قبول مفتاحين معروفين: يوقّع الخادم بالجديد، ويتحقق من القديم فقط حتى تنتهي access tokens التي سبق إصدارها. بعد النافذة، يزال المفتاح القديم. لا تكفي هذه الآلية وحدها إذا اشتبه بتسرب؛ عند التسرب يجب تقصير النافذة وإبطال server-side sessions وفق تقييم الحادث.

## ضوابط المصدر وCI

بوابة `scripts/ci/verify-security-artifact.sh` تمنع ملفات البيئة غير المسموحة والمراجع المتحركة. تستخدم `.env.example` و`.env.production.example` placeholders فقط. أي ظهور لsecret في source أو artifact هو حادث أمني، لا تحذير يمكن تجاوزه.

## شرط رفع الحاجز الحالي

تظل Production Gate محجوبة حتى يؤكد مالك البيئة، في سجل منفصل، تدوير الأسرار الفعلية المطلوبة وتحديثها في كل منصة نشر وإبطال القيم السابقة. لا تمثل متغيرات EF المؤقتة المحلية أو قاعدة `cms_phase34_test` أو مثال توثيقي عملية تدوير.
