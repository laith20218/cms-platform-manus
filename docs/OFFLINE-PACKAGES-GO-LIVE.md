# دليل تفعيل حزم الأسئلة دون اتصال — Offline Packages Go-Live

> **الغرض:** خطوات تشغيل مرتّبة لتفعيل نظام حزم الأسئلة دون اتصال (trusted offline)
> على بيئة الإنتاج الحالية (Render + Vercel + Neon)، من حالة اليوم —
> الحزم **متوقفة fail-closed** افتراضياً — إلى حالة «يعمل كاملاً».
> **لا يحتوي هذا الدليل أي مفتاح خاص أو سرّ** — كل القيم `<PLACEHOLDER>` يعبّئها المالك.
> مرجع المفاتيح المعماري: `docs/security/ANDROID_OFFLINE_KEY_CONFIGURATION.md`.

## 0) ماذا تعني «يعمل كاملاً»

يعمل النظام كاملاً فقط عند تحقق **جميع** ما يلي (مصدر الحقيقة المعماري):

1. أعلام الخادم `Features:Offline*` **مفعّلة** على Render (القسم 2).
2. مفاتيح تشفير/توقيع الحزم **صحيحة ومكتملة** على Render (القسم 2).
3. بناء أندرويد صدر بـ **SPKI العام** + URL + علم العميل الموثوق (القسم 4).
4. أول **استلام حزمة online** على جهاز حقيقي (يتطلب دخولاً أصلياً native).
5. **وضع الطيران** يفتح الحزمة ويجيب حتى `expiresAt` المضمّنة.
6. **الإبطال admin** ظاهر: الحزمة الملغاة تُرفض عند أول فتح/مزامنة online بعده.

أي بند ناقص = الحزم متوقفة أو غير موثوقة — وهذا **مقصود** (قرار المالك 2026-11-23).

## 1) الوضع الحالي — Current state (تم التحقق 2026-11-24)

| المكوّن | الحالة المؤكدة |
|---|---|
| Render `cms-api-preview` | `/health` = 200؛ أعلام `Features__OfflineEnabled` موجودة لكن OFF؛ لا مفاتيح `Security__Offline__*` بعد |
| سلوك offline API مع الأعلام OFF | (قبل هذا الإصلاح) خطأ 500 عام؛ **بعد هذا الإصلاح** جواب 403 صريح «التنزيل دون اتصال معطّل حتى اعتماد AES-256-GCM وManifest الموقع وإصدار المفتاح الآمن» |
| Vercel `student-web` | `VITE_API_URL` = رابط Render API (مؤكد من حزمة الإنتاج)؛ CORS يسمح لمضيفي مشروع Vercel تلقائياً |
| أندرويد | افتراضي OFF fail-closed؛ التفعيل يتطلب `-POFFLINE_TRUSTED_CLIENT_IMPLEMENTED=true` + SPKI العام + URL |

> **عمارة الحقيقة:** Vercel يستضيف واجهة الطالب SPA فقط — **لا يصدر أظرفة الحزم**
> ولا يحمل أي مفتاح خاص. Render يستضيف API وهو مكان الأعلام + التوقيع + التشفير.
> Neon قاعدة بيانات فقط. تطبيق أندرويد يفتح student-web في WebView ويستدعي API
> للحزم عند تفعيل العميل الموثوق في البناء.

## 2) الخادم (Render) — Render environment variables

القيم بأسماء ASP.NET الحقيقية كما يقرؤها الكود (double underscore `__` في Render
تتوسع إلى `:`):

**أعلام الميزة (كلها مطلوبة — يفتح `EnsureOfflineIsExplicitlyEnabled` البوابة):**

| متغير Render | القيمة عند التفعيل | سبب |
|---|---|---|
| `Features__OfflineEnabled` | `true` | البوابة الرئيسية |
| `Features__OfflineAesGcmImplemented` | `true` | اعتماد AES-256-GCM |
| `Features__OfflineManifestImplemented` | `true` | اعتماد Manifest الموقع |
| `Features__OfflineKeyReleaseImplemented` | `true` | اعتماد إصدار المفتاح الآمن |
| `Features__OfflinePackageIssuanceImplemented` | `true` | اعتماد إصدار الحزم |
| `Features__OfflineTrustedClientImplemented` | `true` | يتطلب SPKI جهاز عند طلب الحزمة (ربط الجهاز) |

**مفاتيح التشغيل (أسرار Render — لا تدخل المستودع ولا PR أبداً):**

| متغير Render | الصيغة | الدور |
|---|---|---|
| `Security__Offline__KeyWrappingKey` | Base64 **لمفتاح 32 بايت** بالضبط | تغليف مفتاح الحزمة (المسار القديم للاختبار) |
| `Security__Offline__ManifestSigningKey` | Base64 **لمفتاح 32 بايت** بالضبط | HMAC للـManifest (المسار غير الموثوق) |
| `Security__Offline__ManifestSigningPrivateKeyPkcs8` | Base64 **PKCS#8 ECDSA P-256 خاص** | توقيع Manifest الموثوق — هو المفتاح الذي يقابل SPKI العام في بناء أندرويد |

قواعد ملزمة يتحقق منها الكود عند أول استخدام (لا عند الإقلاع — فشل صريح باسم المتغير):
- مفتاحا 32-بايت يجب أن يكونا Base64 لـ32 بايت بالضبط وإلا فشل الإقلاع الصريح عند الطلب.
- المفتاح الخاص يجب أن يكون PKCS#8 صالحاً لـECDSA P-256 (`KeySize ≥ 256`).
- عند طلب حزمة مع SPKI جهاز والمفتاح الخاص غائب: يُرفض الإصدار — لا مسار موثوق بدون توقيع.
- **`expiresAt` ≤ 7 أيام** من `issuedAt` (سياسة الكود) — الحزمة المضمّنة تحمل انتهاءها.

**CORS (موجود وصحيح — لا تغيير مطلوب عادةً):** `Cors__StudentApp` (اليوم
`https://cms-platform-manus-student-web.vercel.app`) — `CmsCorsOrigins` يسمح تلقائياً
بمضيفي نشر مشروع Vercel (الإنتاج + previews)؛ تطبيق أندرويد WebView **ليس** خاضعاً
لـCORS أصلاً (عميل أصلي). إن كان المالك يستخدم نطاقاً مخصصاً فليضبط `Cors__StudentApp`
عليه.

خطوات التنفيذ على Render (لوحة Render — لا تُنفَّذ من هذا المستودع):

1. أنشئ المفاتيح خارج المستودع (راجع §5) وضع المتغيرات الثلاثة كـ **Secret** في خدمة `cms-api-preview`.
2. فعّل أعلام الميزة الستة (Environment).
3. أعد النشر (Deploy) وانتظر `/health` = 200.
4. **تحقق من البوابة**: استدعاء `GET /api/v1/offline/packages` بمصادقة طالب يجب أن
   يجيب 200 بقائمة (وليس 403)؛ بدون مصادقة = 401؛ وبالأعلام OFF = 403 صريح برسالة
   «التنزيل دون اتصال معطّل…» (وليس 500 — هذا ما أصلحه هذا الإصدار).

## 3) الواجهة (Vercel — student-web) — الاصطفاف فقط

- المتغير الوحيد الموجود: `VITE_API_URL` = رابط Render API
  (`https://cms-api-preview.onrender.com`) — **مؤكد مضمّناً في حزمة الإنتاج اليوم**.
- **لا مفاتيح خاصة على Vercel إطلاقاً** — student-web لا يوقّع ولا يصدر أظرفة؛ أي
  `Security__Offline__*` على Vercel خطأ معماري.
- عند تغيير `VITE_API_URL`: يجب **إعادة بناء** (Redeploy) student-web لأن القيمة
  تُدمج وقت البناء في حزمة SPA.
- HTTPS فقط؛ ملفات تعريف الارتباط/التخزين تعمل عبر نطاق API نفسه كما هي اليوم.

## 4) بناء أندرويد المفعّل — Android release build (القيم من المالك)

```bash
cd apps/android && ./gradlew :app:assembleRelease \
  -PSTUDENT_WEB_BASE_URL="https://cms-platform-manus-student-web.vercel.app" \
  -PAPI_BASE_URL="https://cms-api-preview.onrender.com" \
  -POFFLINE_TRUSTED_CLIENT_IMPLEMENTED=true \
  -POFFLINE_API_BASE_URL="https://cms-api-preview.onrender.com" \
  -POFFLINE_MANIFEST_SIGNING_PUBLIC_KEY_SPKI_BASE64="<SPKI_PUBLIC_BASE64>" \
  -POFFLINE_KEYSTORE_ALIAS=cms.offline.package.key
```

- `<SPKI_PUBLIC_BASE64>` = **العمومي فقط** المقابل للمفتاح الخاص
  `Security__Offline__ManifestSigningPrivateKeyPkcs8` على Render — بثلاث خطوات:
  1. أنشئ زوج ECDSA P-256: `openssl ecparam -name prime256v1 -genkey -noout -out offline_signing.key`
  2. استخرج PKCS#8 الخاص (يوضع في Render secret): `openssl pkcs8 -topk8 -nocrypt -in offline_signing.key -out offline_signing_pkcs8.pem`
  3. استخرج SPKI العام (يوضع في البناء): `openssl ec -in offline_signing.key -pubout -outform DER | base64 -w0`
- التوقيع: عبر `apps/android/keystore.properties` المحجوب (راجع
  `docs/android-signing-notes.md`)؛ الناتج
  `app/build/outputs/apk/release/app-release.apk` — راجع هوية الحزمة من مخرجات
  `scripts/android-assemble-student-apk.sh`.
- السكربت المساعد يغطي الأعلام الأساسية أيضاً:
  `scripts/android-assemble-student-apk.sh <WEB_URL> <API_URL> release` — أو مباشرة
  بمُعامِلات `-P` الإضافية عبر ملف `gradle.properties` محلي محجوب (لا يُرفع إلى git).
- **الحزم دون اتصال في هذا البناء فقط تتفعل بالقيم أعلاه**؛ البناء الافتراضي يبقى
  OFF fail-closed (مثبت في اختبارات `AndroidOfflineBuildConfigurationTest`).
- اختياري (للنشر في المتجر لاحقاً فقط): `-POFFLINE_API_SPKI_PINS_MANDATORY=true`
  مع `-POFFLINE_API_SPKI_PINS_BASE64=sha256/...` — pins الـAPI الشهادية؛
  RC2 التوزيع الجانبي لا يفرضها.

## 5) حصر مفاتيح المالك — Private-key custody (إلزامي)

- المفتاح الخاص ECDSA يوضع **فقط** في Render secret (أو vault الإنتاج) — أبداً في
  Git أو PR أو بناء أندرويد أو سجل.
- بيئات dev/staging/prod تستخدم أزواجاً **مستقلة** (لا إعادة استخدام عبر البيئات)
  — `docs/security/ANDROID_OFFLINE_KEY_CONFIGURATION.md` جدول المراجع.
- التدوير: أنشئ زوجاً جديداً + SPKI جديد + بناء أندرويد جديد؛ الحزم القديمة تنتهي
  بانتهاء `expiresAt` المضمّنة (≤ 7 أيام) فلا هجرة تدوير معقدة.

## 6) سيناريو القبول على جهاز المالك — Device acceptance

(فحص الجهاز الشامل RC1: `docs/RC1-SMOKE-TEST.md`؛ هذا القسم خاص بالحزم.)

1. **تثبيت** APK المبني بالقيم أعلاه (versionCode 2 / versionName 0.1.1).
2. **دخول online** بحساب طالب ثم فتح فهرس «وضع بدون إنترنت» → زر الدخول الأصلي
   (native login بنفس الهاتف/كلمة المرور) — ينشئ زوج RSA في AndroidKeyStore.
3. **تنزيل حزمة**: من شاشة الحزم أدخل معرّف المادة واضغط «تنزيل حزمة الامتحان
   المشفرة» — يظهر «جارٍ طلب حزمة مشفرة والتحقق منها…» ثم نجاح.
4. **وضع الطيران**: افتح الحزمة وأجب على الأسئلة — يعمل حتى `expiresAt` المضمّنة.
5. **العودة online**: تزامن الأجوبة (sync) — تظهر النتيجة المصححة من الخادم.
6. **إبطال admin**: من admin-web «الحزم دون اتصال» (OfflineCenter) اختر الحزمة →
   Revoke — ثم على الجهاز: أول فتح/مزامنة online بعد الإبطال **يُرفض**.
7. **تسجيل الخروج**: يمسح المواد الحساسة المحلية وفق سياسات المسح القائمة
   (راجع `docs/offline-program.md`).

## 7) ما تم التحقق منه في هذا المستودع مقابل ما يبقى على المالك

| تم التحقق (CI/محلي) | يبقى على المالك (أسرار/أجهزة) |
|---|---|
| الجواب 403 الصريح مع الأعلام OFF (اختبارات وحدة + سلوك الكود) | تعيين أسرار `Security__Offline__*` الحقيقية على Render |
| فشل مغلق لأي بناء أندرويد ناقص SPKI/URL/alias (`AndroidOfflineBuildConfigurationTest`) | إنشاء زوج ECDSA وتوزيعه (خاص→Render، عام→بناء) |
| بناء أندرويد كامل بمعاملات عامة تجميعية (identity + aapt) | بناء RC2 بالإنتاج الحقيقي + تثبيت جهاز + سيناريو §6 |
| قائمة الأعلام/المفاتيح أعلاه مستخرجة من الكود الفعلي (لا تخمين) | تفعيل الأعلام الستة على Render بعد المفاتيح |

**النظام يعمل كاملاً فقط بعد** أن يعيّن المالك أسرار Render ويعيد بناء APK
بالـSPKI العام — وقبل ذلك يبقى كل مسار الحزم متوقفاً fail-closed (مقصود).
