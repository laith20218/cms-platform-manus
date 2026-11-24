# دليل حزمة APK لتجربة الطلاب — تطبيق CMS لأندرويد

> **الجمهور:** من يجهّز حزمة التثبيت (مشرف/مطوّر) والطلاب الذين سيثبّتونها على هواتفهم.
> **الغرض:** تجربة التطبيق على هواتف الطلاب عبر التحميل الجانبي (Sideload) دون الحاجة إلى Google Play.
> التطبيق موجود في `apps/android` بمعرّف الحزمة `com.cms.student`، ويظهر بعد التثبيت باسم «CMS».

## 1) نظرة عامة سريعة

1. جهّز بيئة البناء (مرة واحدة).
2. حدّد رابطي الخدمة الحقيقيين (HTTPS فقط).
3. جمّع حزمة Debug (أو Release موقّعة).
4. انقل ملف APK إلى هاتف الطالب وثبّته.
5. أول تشغيل يحتاج إنترنت؛ تسجيل الدخول يجري داخل التطبيق، وقد يُطلب تسجيل دخول أصلي لتفعيل التحميل دون اتصال.

## 2) المتطلبات الأساسية (اختر أحد الخيارين)

### الخيار الأول — Android Studio (الأسهل)

- أحدث إصدار من Android Studio (يتضمن JDK وأداة SDK Manager).
- من داخل SDK Manager ثبّت: **Android SDK Platform 35** (مع Build-Tools المرافقة).

### الخيار الثاني — سطر الأوامر فقط

- **JDK 17 أو أحدث** (نسخة تطوير JDK وليست JRE فقط — يحتاجها Gradle والمترجم).
- **Android SDK**: Platform 35 + Build-Tools، تُثبّت عبر `sdkmanager` وتُحدَّد بـ `ANDROID_HOME` أو بملف `apps/android/local.properties` الذي يحتوي `sdk.dir=...`.
- **Gradle لا يُثبَّت يدوياً** — المستودع يتضمن Gradle Wrapper (`./gradlew` داخل `apps/android`).
- نظام التشغيل: Linux أو macOS أو Windows (على Windows استخدم `gradlew.bat` بدل `./gradlew`).

ملاحظة عن هواتف الطلاب: الحد الأدنى هو **Android 8.0 (API 26)**.

## 3) روابط الخدمة (HTTPS فقط)

قبل التجميع يجب تحديد الرابطين التاليين لبيئة حقيقية:

| خاصية البناء | المعنى | مثال |
|---|---|---|
| `STUDENT_WEB_BASE_URL` | رابط واجهة الطالب (student-web) التي يفتحها التطبيق | `https://student.your-domain.com` |
| `API_BASE_URL` | الرابط الأساسي لواجهة برمجة التطبيقات (API) — تسجيل الدخول الأصلي والتحميل دون اتصال | `https://api.your-domain.com` |

قواعد يفرضها البناء نفسه (فشل مبكر برسالة واضحة عند مخالفتها):

- يجب أن يبدأ الرابطان بـ `https://` — قيم HTTP أو غير مطلقة تُرفض ويُوقف البناء.
- لا يُقبل محتوى الرابط علامات اقتباس أو شرطات مائلة عكسية.
- القيمتان الافتراضيتان في الكود (`https://app.cms.example.com` و`https://api.cms.example.com`) مجرد عناوين placeholder موثّقة للتجربة ولا تعملان فعلياً — لا تصلحان لتوزيع حقيقي على الطلاب.
- روابط الإنتاج تُمرَّر وقت البناء فقط عبر `-P` أو من أسرار CI — ولا تُثبَّت في الكود ولا في المستودع.

## 4) نسخة Debug أم Release؟

| | Debug APK | Release APK |
|---|---|---|
| التوقيع | تلقائي بمفتاح debug المحلي — يعمل فوراً | يتطلب مفتاح توقيع خاصاً بك (انظر `docs/android-signing-notes.md`) |
| الحجم والأداء | أكبر حجماً وأبطأ | أصغر وأسرع |
| متى تستخدمه | التجربة الأولى السريعة والتشخيص وتثبيت `adb` | التوزيع الفعلي على مجموعة الطلاب (Pilot) |

توصية عملية: ابدأ أول تجربة بـ **Debug** للتحقق من الروابط وتسجيل الدخول على هاتف واحد أو اثنين، وعند التوزيع الأوسع جمّع **Release موقّعة** بمفتاحك.

## 5) أوامر التجميع (من جذر المستودع)

تجميع Debug بروابط حقيقية:

```bash
cd apps/android && ./gradlew :app:assembleDebug -PSTUDENT_WEB_BASE_URL=https://student.your-domain.com -PAPI_BASE_URL=https://api.your-domain.com
```

أو بصيغة أسطر متعددة:

```bash
cd apps/android && ./gradlew :app:assembleDebug \
  -PSTUDENT_WEB_BASE_URL=https://student.your-domain.com \
  -PAPI_BASE_URL=https://api.your-domain.com
```

تجميع Release (بعد إعداد التوقيع كما في `docs/android-signing-notes.md`):

```bash
cd apps/android && ./gradlew :app:assembleRelease -PSTUDENT_WEB_BASE_URL=https://student.your-domain.com -PAPI_BASE_URL=https://api.your-domain.com
```

- بدون توقيع مضبوط ينتج البناء `app-release-unsigned.apk` — لا يمكن تثبيته على هاتف حتى يُوقَّع.
- للتحقق من الاختبارات بعد أي تعديل: `./gradlew :app:testDebugUnitTest`.

سكربت مساعد يختصر ما سبق (من جذر المستودع، يتحقق من HTTPS ويطبع مسار APK الناتج):

```bash
scripts/android-assemble-student-apk.sh https://student.your-domain.com https://api.your-domain.com debug
```

(على Windows: استخدم `gradlew.bat` بدل `./gradlew`، أو شغّل السكربت من Git Bash.)

## 6) أين يظهر ملف APK؟

بعد ظهور `BUILD SUCCESSFUL` يكون الملف جاهزاً:

| النوع | المسار بالنسبة إلى `apps/android` |
|---|---|
| Debug | `app/build/outputs/apk/debug/app-debug.apk` |
| Release موقّعة | `app/build/outputs/apk/release/app-release.apk` |
| Release غير موقّعة | `app/build/outputs/apk/release/app-release-unsigned.apk` |

مثال كامل من جذر المستودع: `apps/android/app/build/outputs/apk/debug/app-debug.apk`

## 7) تثبيت التطبيق على هاتف الطالب

1. انقل ملف `.apk` إلى الهاتف (رابط تحميل مباشر، بريد إلكتروني، تطبيق مشاركة ملفات، أو كابل USB).
2. فعّل السماح بالتثبيت من مصادر غير معروفة (مرة واحدة لكل تطبيق تفتح منه الملف):
   - الإعدادات ← التطبيقات ← وصول خاص ← **تثبيت تطبيقات غير معروفة** (Install unknown apps) ← اختر التطبيق الذي ستفتح منه الملف (مثل Chrome أو «الملفات») ← فعّل «السماح من هذا المصدر».
   - في بعض الواجهات: الإعدادات ← الأمان ← «مصادر غير معروفة» (واجهات أندرويد الأقدم).
3. افتح ملف APK من تطبيق الملفات ← «تثبيت»، وإن ظهر تحذير Play Protect اختر «تثبيت على أي حال» (أمر طبيعي مع التحميل الجانبي لأن التطبيق غير منشور في المتجر).
4. بعد التثبيت يظهر التطبيق باسم «CMS». النشر في **Google Play اختياري لاحقاً** وليس شرطاً لهذه المرحلة.

للمطوّرين — تثبيت عبر USB مع تصحيح الأخطاء (بعد تفعيل «خيارات المطوّر» و«تصحيح USB»):

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 8) المتوقع عند أول تشغيل

- **أول تشغيل يحتاج اتصال إنترنت**: التطبيق يفتح واجهة الطالب مباشرة، وعند تعذر الاتصال تظهر رسالة خطأ عربية صريحة مع زر إعادة محاولة — لا يوجد وضع «دون اتصال» زائف.
- **تسجيل الدخول يجري داخل التطبيق** (WebView آمن يستضيف واجهة الطالب) بنفس حساب الطالب المعتاد.
- **التحميل دون اتصال يحتاج جلسة أصلية**: قد يُطلب من الطالب تسجيل دخول أصلي (Native) عبر زر الدخول المحلي في فهرس «وضع بدون إنترنت» — نفس البريد وكلمة المرور اللذين يستخدمهما في الواجهة — قبل أن يصبح تنزيل الوسائط للاستخدام دون اتصال متاحاً.
- سعة التخزين المشفّر دون اتصال **5 GiB** مع إزالة تلقائية للأقدم (LRU)، والمحتوى المحفوظ يظل قابلاً للفتح دون اتصال حتى **انتهاء الصلاحية الصادرة عن الخادم** (entitlement expiry) أو تسجيل الخروج أو الإبطال — لا يوجد حد زمني ثابت بالساعات (قرار المالك 2026-11-23؛ انظر `docs/offline-program.md`).

## 9) السلامة وأسرار التوقيع

- لا تشارك ملف release keystore أو كلمات مروره مع أي شخص، ولا ترسلها في محادثات أو بريد.
- لا ترفعها أبداً إلى المستودع — ملفات `*.jks` و`*.keystore` و`keystore.properties` محجوبة في `.gitignore`، والمستودع يتضمن `keystore.properties.example` بقيم وهمية فقط.
- إذا تسرب مفتاح التوقيع: أنشئ مفتاحاً جديداً فوراً (rotation)، أعد تجميع Release به وأعد توزيعها — وسيلزم للطلاب إزالة النسخة القديمة أولاً لأن التوقيع اختلف.
- الخطوات الكاملة لإنشاء المفتاح وضبط البناء: `docs/android-signing-notes.md`.

## 10) حل مشكلات شائعة

| المشكلة | الحل |
|---|---|
| `SDK location not found` | أنشئ `apps/android/local.properties` يحتوي `sdk.dir=/مسار/اندرويد-SDK` أو اضبط `ANDROID_HOME` |
| `STUDENT_WEB_BASE_URL must be an absolute HTTPS URL` | أحد الرابطين لا يبدأ بـ `https://` — صحّح قيم `-P` |
| رسالة خطأ عربية عند فتح التطبيق | الروابط المدمجة placeholder أو الخدمة متوقفة — أعد البناء بروابط حقيقية وتأكد من أن الخدمة تعمل |
| Play Protect يحذّر عند التثبيت | متوقع مع التحميل الجانبي — اختر «تثبيت على أي حال» |
| الهاتف يرفض التثبيت | فعّل «تثبيت تطبيقات غير معروفة» للتطبيق الذي تفتح منه الملف (القسم 7) |
| `app-release-unsigned.apk` لا يُثبّت | Release غير موقّعة — اتبع `docs/android-signing-notes.md` ثم أعد البناء |

## 11) قائمة تجهيز إصدار المرشح RC1 — Release Candidate

قائمة مرتّبة لبناء حزمة قابلة للتوزيع على مجموعة الطلاب (Pilot). القائمة الكاملة
للإطلاق (الخادم + الويب + الأندرويد + التراجع) في `docs/RELEASE-CANDIDATE-CHECKLIST.md`.

1. **سجّل SHA الالتزام**: `git rev-parse HEAD` من فرع `main` — يُدوَّن مع الحزمة (راجع القائمة الكاملة، البند A).
2. **ابنِ Debug بروابط الإنتاج أولاً** (تحقق سريع من الروابط وتسجيل الدخول على هاتف واحد):
   ```bash
   scripts/android-assemble-student-apk.sh https://student.your-domain.com https://api.your-domain.com debug
   ```
   الناتج: `apps/android/app/build/outputs/apk/debug/app-debug.apk`.
3. **تحقق من هوية الحزمة**: يطبع السكربت `applicationId` و`versionName` و`versionCode` ويتحقق منها عبر `aapt dump badging` عند توفر SDK — يجب أن تكون `com.cms.student` (والإصدار المتوقع، مثلاً `0.1.0` / `1`).
4. **ابنِ Release موقّعة للتوزيع**: أنشئ مفتاحك خارج المستودع واضبط `apps/android/keystore.properties` (محجوب في git — القالب `keystore.properties.example`)، ثم:
   ```bash
   scripts/android-assemble-student-apk.sh https://student.your-domain.com https://api.your-domain.com release
   ```
   الناتج: `apps/android/app/build/outputs/apk/release/app-release.apk` (موقّعة وقابلة للتثبيت). لا أسرار في المستودع إطلاقاً (`docs/android-signing-notes.md`).
5. **ملاحظة تثبيت الشهادات (للنشر في المتجر لاحقاً فقط)**: نشر Google Play يستلزم تشغيل التثبيت الإلزامي للشهادات — `-POFFLINE_API_SPKI_PINS_MANDATORY=true` مع مجموعة pins حقيقية (أسرار خط الإنتاج، لا توضع في المستودع). للتوزيع الجانبي في RC1 تبقى الاختيارية. التفاصيل: `docs/security/CERTIFICATE-PINNING.md`.
6. **حزم الأسئلة دون اتصال متوقفة افتراضياً** (`OFFLINE_TRUSTED_CLIENT_IMPLEMENTED` يساوي OFF في الإعدادات الافتراضية للمستودع) — كاش المكتبة المشفّر («وضع بدون إنترنت») يعمل بلا علم؛ لا تفعّل الحزم إلا بقرار المالك وبالإعداد الكامل (`docs/offline-program.md` §3).
7. **نفّذ فحص التدخين RC1** على هاتف حقيقي واحد على الأقل قبل التوزيع: `docs/RC1-SMOKE-TEST.md`، وسجّل النتيجة مع SHA الحزمة.

---

## English quick reference

Prerequisites: Android Studio, OR command-line JDK 17+ + Android SDK Platform 35 / Build-Tools (Gradle wrapper is bundled).

```bash
# Debug APK (from repo root)
cd apps/android && ./gradlew :app:assembleDebug \
  -PSTUDENT_WEB_BASE_URL=https://student.your-domain.com \
  -PAPI_BASE_URL=https://api.your-domain.com
# -> apps/android/app/build/outputs/apk/debug/app-debug.apk

# Release APK (signing setup: docs/android-signing-notes.md)
cd apps/android && ./gradlew :app:assembleRelease \
  -PSTUDENT_WEB_BASE_URL=https://student.your-domain.com \
  -PAPI_BASE_URL=https://api.your-domain.com
# -> apps/android/app/build/outputs/apk/release/app-release.apk (signed)

# Thin helper (validates HTTPS, prints the APK path + identity echo:
# applicationId / versionName / versionCode, aapt-verified when available)
scripts/android-assemble-student-apk.sh https://student.your-domain.com https://api.your-domain.com debug

# RC1 build checklist (Arabic, ordered): §11 above + docs/RELEASE-CANDIDATE-CHECKLIST.md
# RC1 device smoke test: docs/RC1-SMOKE-TEST.md

# Unit tests
cd apps/android && ./gradlew :app:testDebugUnitTest

# Install over USB
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Both base URLs must be absolute HTTPS (the build fails fast otherwise); the committed
`*.cms.example.com` defaults are placeholders only. Students enable "Install unknown
apps" for the app they open the APK from; Google Play is optional later. First run
needs network; a native login may be required before media can be cached for offline
use. Never share or commit the release keystore; rotate it if leaked.
