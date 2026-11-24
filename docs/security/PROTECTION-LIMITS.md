# Protection Limits — حدود الحماية المُعلنة

D-ABSURD closure (debt register, 2026-11-24). This document formalizes what the
platform does and does NOT promise. It is the reference for marketing copy,
support answers, and future security reviews: **no absolute anti-copy /
anti-screenshot / anti-root claim may ever be made about this product.**

---

## English

### What FLAG_SECURE does
`FLAG_SECURE` is set on every student-facing Activity. It asks Android to block
screenshots and hide the app's contents in the recents/app-switcher thumbnail.
That is all it does.

### What it does NOT do (out of scope, by design)
- **Rooted devices**: a root user can read app memory, dump the WebView DOM
  storage, and hook any API. No client-side control survives a compromised OS.
- **Emulators**: we do not promise emulator detection (Play Integrity is not
  enforced in this program).
- **Screen recording**: some ROMs ignore FLAG_SECURE for screen recording; a
  second device's camera can always film the screen.
- **External cameras / photography of the physical screen**: technically
  impossible to prevent.
- **DRM**: there is no Widevine or any DRM SDK in this program. Adding one
  would be a new product program, not a patch.

### The architectural controls we DO rely on (honest, enforceable)
1. **Encrypted at rest** — offline question packages, the media cache, and the
   native token store are AES-encrypted with AndroidKeyStore keys; WebView
   remember-me tokens are sealed via the same keystore (D-JS-AUTH). A stolen
   file copy yields ciphertext without the device.
2. **Session-bound access** — content flows only through authenticated,
   installation-bound sessions (entitlement tokens, per-installation identity);
   there is no offline file that plays outside the app's session context.
3. **Server-side revocation & expiry** — rights end at the server-issued
   expiry or at the next online contact after revocation. Sharing a file does
   not share a right.

These controls protect the *distribution channel* and *data at rest*. They do
not, and cannot, stop a determined user from re-capturing content they are
legitimately viewing on screen.

---

## العربية

### ما الذي تفعله خاصية FLAG_SECURE
تفعَّل `FLAG_SECURE` على كل شاشات الطالب داخل التطبيق، فتطلب من نظام
أندرويد منع لقطات الشاشة وإخفاء المحتوى في معاينة التطبيقات الأخيرة.
هذا هو كل ما تفعله.

### ما الذي لا تفعله (خارج النطاق بحكم التصميم)
- **الأجهزة المكسورة الحماية (Root)**: يستطيع مستخدم الروت قراءة ذاكرة
  التطبيق ونسخ مخزن بياناته؛ لا يصمد أي تحقق داخل العميل أمام نظام
  تشغيل مخترق.
- **المحاكيات**: لا نَعِد بكشف المحاكيات في هذا البرنامج.
- **تسجيل الشاشة**: بعض الأنظمة تتجاهل FLAG_SECURE عند التسجيل، كما يمكن
  دائمًا تصوير الشاشة بكاميرا هاتف آخر.
- **الكاميرات الخارجية**: منع التصوير الفوتوغرافي للشاشة مستحيل تقنيًا.
- **إدارة الحقوق الرقمية (DRM)**: لا يوجد Widevine أو أي DRM في هذا
  البرنامج؛ إضافته برنامج منتج جديد وليست تعديلًا.

### الضوابط المعمارية التي نعتمد عليها فعلاً (صادقة وقابلة للفرض)
1. **تشفير البيانات في حالة السكون** — الحزم دون اتصال، وذاكرة الوسائط،
   ومخزن الجلسة الأصلي، ورموز «تذكّرني» داخل الويب، كلها مشفّرة بمفاتيح
   AndroidKeyStore؛ نسخة مسروقة من الملفات لا تعني شيئًا بلا الجهاز نفسه.
2. **ربط الوصول بالجلسة** — المحتوى يمر فقط عبر جلسات موثّقة مرتبطة
   بالتثبيت والهوية؛ لا يوجد ملف يعمل خارج سياق جلسة التطبيق.
3. **الإبطال والانتهاء من الخادم** — تنتهي الصلاحيات بتاريخ الخادم أو عند
   أول اتصال بعد الإبطال؛ مشاركة الملف لا تشارك الحق.

هذه الضوابط تحمي **قناة التوزيع** و**البيانات المخزّنة**، ولا يمكنها —
بحكم التقنية — منع مستخدم مصمم من إعادة تصوير محتوى يشاهده بشكل مشروع.

---

*Source docs: `docs/offline-program.md` §6 (residual risks),
`docs/security/OFFLINE-DEBT-REGISTER.md` (D-ABSURD),
`docs/security/CERTIFICATE-PINNING.md` (transport pinning limits).*
