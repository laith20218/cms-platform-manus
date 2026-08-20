# معمارية التشفير — CMS

## الهدف والنطاق

تغطي هذه الوثيقة التشفير المستخدم للمصادقة والجلسات و2FA والاتصالات. لا تخزن هذه الوثيقة قيماً سرية أو أمثلة مفاتيح قابلة للاستخدام. كل مفتاح إنتاجي يُحمّل وقت التشغيل من secret manager أو متغيرات البيئة الآمنة فقط.

## مخطط المواد المشفرة

| الأصل | الخوارزمية أو الآلية | مكان الحفظ | ما لا يجوز تخزينه |
|---|---|---|---|
| JWT access token | HMAC-SHA-256 (`HS256`) مع `kid` | يصدر مؤقتاً للعميل | مفتاح التوقيع، أو token في localStorage. |
| JWT signing key | سر عشوائي لا يقل عن 32 بايت | secret manager / runtime env | appsettings، repository، SBOM، logs. |
| refresh token | 64 بايت CSPRNG، Base64URL | raw value للعميل مرة واحدة | raw token في DB أو logs أو telemetry. |
| refresh token at rest | SHA-256 hex | `user_sessions.refresh_token_hash` | النص الخام للرمز. |
| مقارنة installation ID | `CryptographicOperations.FixedTimeEquals` | ذاكرة العملية | مقارنة غير ثابتة الزمن في مسار حساس. |
| 2FA TOTP | HMAC-SHA1 وفق معيار TOTP | سر 2FA مشفر في مخزن الاعتماد | OTP أو سر TOTP في log/cache عام. |
| password | BCrypt عبر `IPasswordHasher` | hash في قاعدة البيانات | كلمة مرور نصية أو reversible encryption. |
| النقل | TLS 1.2+ عند حافة النشر | Vercel/Railway/proxy | HTTP إنتاجي أو mixed content. |

## JWT

يتحقق `Program.cs` و`JwtTokenService` من أن سر JWT غير فارغ وطوله 32 بايت على الأقل قبل بدء التطبيق. يقيّد token validation الخوارزميات المقبولة إلى `SecurityAlgorithms.HmacSha256`، ويتحقق من issuer وaudience وlifetime ومفتاح التوقيع، ويضبط `ClockSkew` إلى صفر. يتيح `kid` اختيار material تدوير محدد بدلاً من تخمين مفتاح بين مفاتيح متعددة.

> access token قصير العمر ليس مصدر حقيقة للإبطال. مصدر الحقيقة هو session server-side المعرّفة بـ`sid` و`tv` و`installation_id`.

## دورة refresh token

1. ينشئ الخادم 64 بايت عشوائية تشفيرياً ويعيد raw token مرة واحدة فقط.
2. يحفظ SHA-256 فقط ضمن session مع family ID وinstallation ID وتاريخ انتهاء وtoken version.
3. عند refresh، يبحث الخادم بالـhash ويتحقق من النشاط والانتهاء والتثبيت.
4. يستهلك الاستعلام الشرطي token مرة واحدة داخل معاملة قاعدة بيانات وينشئ successor في family نفسها.
5. إذا سبق استهلاك token أو فشل شرط الاستهلاك، يبطل الخادم كل family بسبب `refresh_token_reuse`.
6. يتحقق middleware من session state في كل طلب مصادق عليه، فتسري آثار logout وتغيير password وإلغاء الجهاز فوراً.

## 2FA ومنع إعادة الاستخدام

يتحقق TOTP من نافذة الزمن المحددة باستخدام HMAC-SHA1. يسجل cache fingerprint للرمز المقبول ضمن نافذة صلاحيته لمنع إدخال الرمز نفسه مرة ثانية. cache ليس مصدر قرار الثقة النهائي للجلسة؛ هو حاجز replay إضافي.

## حدود التصميم

لا يدعي هذا التصميم تشفير offline package وهو معطّل افتراضياً حتى يمر تصميم تنسيق الحزمة وإدارة المفاتيح offline باعتماد مستقل. ولا يحل SHA-256 لrefresh token محل تدوير الأسرار أو حماية قاعدة البيانات أو TLS.
