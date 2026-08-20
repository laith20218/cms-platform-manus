# Android Offline — Key Configuration References

**الحالة:** هذه الوثيقة تصف مراجع تشغيل فقط. لا تحتوي على private key أو token أو قيمة قابلة للاستخدام.

## مبدأ الثقة

يتطلب Offline الموثوق زوجاً من مواد ثقة منفصلة. خادم CMS يوقع manifest بمفتاح ECDSA P-256 خاص محفوظ في secret store، ويحتوي Android build على **public SPKI pin** المقابل فقط. ويُنشئ كل تثبيت Android زوج RSA في `AndroidKeyStore`؛ يرسل الـpublic SPKI عند طلب الحزمة، بينما لا يغادر المفتاح الخاص Keystore أبداً.

| البيئة | مرجع المفتاح الخاص على الخادم | مرجع public SPKI في Android build | حالة الاستخدام |
|---|---|---|---|
| development | `CMS_OFFLINE_DEV_MANIFEST_SIGNING_PRIVATE_KEY_PKCS8` في vault التطوير | `CMS_ANDROID_DEV_OFFLINE_MANIFEST_SIGNING_PUBLIC_SPKI_BASE64` | integration غير إنتاجي فقط |
| staging | `CMS_OFFLINE_STAGING_MANIFEST_SIGNING_PRIVATE_KEY_PKCS8` في vault/CI environment المحمي | `CMS_ANDROID_STAGING_OFFLINE_MANIFEST_SIGNING_PUBLIC_SPKI_BASE64` | release-candidate verification |
| production | `CMS_OFFLINE_PROD_MANIFEST_SIGNING_PRIVATE_KEY_PKCS8` في production secret manager | `CMS_ANDROID_PROD_OFFLINE_MANIFEST_SIGNING_PUBLIC_SPKI_BASE64` | production فقط |

> يجب أن تكون مفاتيح development وstaging وproduction **مستقلة وغير قابلة لإعادة الاستخدام**. لا يقبل build مفعّل لـOffline قيمة public pin فارغة، ولا يقبل server key من بيئة أخرى.

## متغيرات البناء العامة فقط

القيم التالية يمكن لخط إصدار محمي حقنها كـ`BuildConfig` لأنها لا تتضمن private material. يجب عدم حقنها من pull request غير موثوق.

| BuildConfig | المصدر المسموح | القاعدة |
|---|---|---|
| `OFFLINE_TRUSTED_CLIENT_IMPLEMENTED` | إعداد environment محمي | يبقى `false` افتراضياً، ولا يصبح `true` إلا في build مخصص للتشغيل الموثوق. |
| `OFFLINE_API_BASE_URL` | إعداد environment محمي | URL مطلق `https` فقط؛ لا cleartext ولا userinfo. |
| `OFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64` | secret/configuration العامة للبيئة | يجب أن يطابق المفتاح العام للمفتاح الخاص المحفوظ للخادم في البيئة نفسها. |
| `OFFLINE_KEYSTORE_ALIAS` | configuration عامة | alias محلي غير سري وفريد لتطبيق CMS. |

يجب أن تفشل `AndroidOfflineBuildConfiguration` فشلاً مغلقاً عندما يكون flag الموثوق مفعلاً وتغيب API URL أو public pin أو alias. ولا يوجد في المصدر مسار يقبل `ManifestSigningPrivateKeyPkcs8` أو أي server secret داخل Android.

## متطلبات تشغيل release

قبل أي `production` build، يثبت مالك release خارج المستودع ما يلي:

1. أن private ECDSA key موجود حصراً في secret manager للبيئة، لا في Git أو Android artifact أو log.
2. أن public SPKI المحمول في build يطابق private key في البيئة نفسها عبر ceremony موثق لا يكشف المفتاح الخاص.
3. أن server يرفض issue عندما trusted client key غير موجود أو لا يطابق installation binding.
4. أن متغيرات development/staging/production تشير إلى معرفات vault مستقلة.
5. أن run CI موثق استخدم configuration staging فقط مع evidence runtime، ثم تخضع production configuration لموافقة release owner منفصلة.

لا تحقق هذه الوثيقة provisioning أو rotation؛ كلاهما دليل خارجي مملوك لمسؤول secret store/release. غياب هذا الدليل يمنع إغلاق Phase 45 وإصدار Production Candidate.
