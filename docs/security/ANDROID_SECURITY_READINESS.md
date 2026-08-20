# CMS — Android Security Readiness Assessment

**القرار:** **NOT READY** لتطوير تطبيق Android يتعامل مع محتوى مدفوع أو تنزيلات Offline على أساس Backend الحالي.  
**نطاق التقييم:** لا يوجد مشروع Android في الحزمة؛ التقييم يختبر استعداد API والعقد الأمني للاستخدام مستقبلاً من عميل Android.

## ما يمكن إعادة استخدامه

| العنصر | الحالة | الملاحظة |
|---|---|---|
| REST API concept | PARTIAL | Controllers وDTOs موجودة، لكن توجد فجوات في البناء والعقد والمسارات. |
| Password hashing | IMPLEMENTED | BCrypt cost 12 مناسب كنقطة بداية. |
| Access JWT | PARTIAL | التوقيع والتحقق مضبوطان مبدئياً، لكن lifecycle يفشل بسبب refresh/revocation. |
| مبدأ device fingerprint | PARTIAL | يوجد claim وخدمة server-side، لكن لا يوجد enforcement. |
| روابط R2 موقعة | PARTIAL | تصلح كفكرة للملفات، لكنها لا تفرض entitlement قبل الإصدار. |
| Offline API | WEAK | الحزم plaintext ولا تملك integrity أو ownership enforcement موثوقاً. |

## ما يجب إصلاحه قبل أي Android client

1. **إغلاق SEC-001:** استبدال refresh token الحالي بجلسات server-side وtoken rotation. تطبيق Android لا يعالج خللاً في Backend token validation.
2. **إغلاق SEC-002 وSEC-003:** إنشاء entitlement engine وRBAC/ABAC حقيقيين. يجب أن يحصل Android على قرار وصول من الخادم لكل مادة/ملف/حزمة، لا من cache العميل.
3. **تصميم Device Binding متوافق مع المنصات:** لا تعتمد على user-agent أو قيمة JavaScript. استخدم installation key في Android Keystore، attestation عند توفرها، device/session registry، وآلية recovery مدروسة.
4. **إعادة بناء Offline:** على Android يمكن تخزين مفاتيح غير قابلة للتصدير في Android Keystore وتشفير البيانات بـAES-GCM، لكن يجب أن يصدر Backend package موقّعاً ومربوطاً بمستخدم/تثبيت ومدة انتهاء. لا ترسل المفتاح مع payload.
5. **توحيد API contract:** اختبارات OpenAPI/contract، أخطاء RFC 7807 موحدة، paging حدود واضحة، idempotency للعمليات، وversioning صريح.
6. **تدوير الأسرار وإعداد البيئة:** لا تضمّن أسرار R2 أو Firebase server credentials داخل APK؛ لا يستخدم العميل إلا مفاتيح عامة ومقيدة إن لزم.

## تخزين Android المقترح لاحقاً

| نوع البيانات | المكان المقترح | ملاحظة أمنية |
|---|---|---|
| Access token قصير العمر | ذاكرة التطبيق، أو EncryptedSharedPreferences عند الضرورة | لا يكتب في logs ولا يشارك مع WebView. |
| Refresh/session handle | EncryptedSharedPreferences، محمي بـAndroid Keystore | يجب ربطه بجلسة خادمية وإبطال قابل للتنفيذ. |
| مفتاح تنزيل Offline | Android Keystore | مفتاح non-exportable قدر الإمكان، مع ربط بالتثبيت. |
| أسئلة Offline مشفرة | Room/SQLCipher أو ملف encrypted | AES-GCM، nonce فريد، AAD، وتوقيع package من الخادم. |
| Telemetry | Batch queue مشفرة قدر الحاجة | إرسال دفعات متأخر، لا call متزامن لكل حدث UI. |

## ما يمكن وما لا يمكن حمايته

يمكن لتطبيق Android استخدام `FLAG_SECURE` لتقليل screenshots والتسجيل على كثير من الأجهزة، لكنه ليس ضماناً مطلقاً ضد كاميرا خارجية أو أجهزة معدلة/rooted. يجب أن يبقى watermark وentitlement والتحقيق اللاحق أدوات ردع ومساءلة، لا وعداً بمنع النسخ كلياً.

## بوابة البدء

لا أنصح بالبدء بمرحلة Android قبل نجاح معايير القبول التالية:

| معيار | مطلوب |
|---|---|
| لا توجد نتيجة CRITICAL مفتوحة في authentication/authorization | نعم |
| تطبيق entitlement على الأسئلة والملفات وOffline | نعم |
| Refresh token rotation/revocation وتسجيل الجلسات | نعم |
| Offline package encryption + integrity + ownership | نعم |
| اختبارات API integration وabuse cases | نعم |
| Secrets خارج المستودع وتدوير القيم المشتبه بها | نعم |

**حالة البوابة الحالية:** غير محققة.
