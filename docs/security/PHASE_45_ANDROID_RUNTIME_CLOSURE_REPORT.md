# Phase 45 — Android Runtime Closure Report

**التاريخ:** 20 أغسطس 2026  
**النطاق:** إثبات تشغيل Offline على Android فعلياً؛ ولا يشمل إعادة بناء Phase 44 أو HTTP backend الذي ثبت سابقاً ما لم يظهر regression.  
**الحكم التنفيذي:** **Phase 45 = NOT CLOSED / NO-GO.** لم ينتج هذا التشغيل أي تنفيذ instrumentation على جهاز Android أو محاكي مكتمل الإقلاع. كما أن تطبيق Android لا يزال shell مصغراً يعطّل Offline ولا يربط verifier أو endpoint الحالة أو التقاط الإجابات أو sync ضمن مسار تطبيقي فعلي. لذلك تبقى **Gate 46 محجوبة** ولا تُنشأ حزمة إصدار نهائية.

> لا يُعامل تجميع APK أو نجاح JVM unit tests أو نجاح HTTP backend كدليل على Android Keystore أو `FLAG_SECURE` أو استخدام الحزمة offline على جهاز. الدليل المقبول لهذه العناصر هو تشغيل instrumentation/E2E على Android runtime مكتمل الإقلاع فقط.

## 1. بيئة Android التي اكتُشفت

| البند | النتيجة الفعلية | الدليل |
|---|---|---|
| نظام المضيف | Linux `x86_64`؛ لا يوجد `/dev/kvm` | [سجل اكتشاف البيئة](phase45_emulator_boot_2026-08-20.log) |
| Android SDK | اكتُشف في `/home/ubuntu/android-sdk`، خارج `PATH` في البداية | [سجل اكتشاف SDK](phase45_android_sdk_install_2026-08-20.log) |
| Platform-tools / ADB | `37.0.1`؛ `adb devices -l` لم يعرض أي جهاز متصل | [سجل نسخ الأدوات وAPK](phase45_android_version_and_apk_evidence_2026-08-20.log) |
| Android Emulator | لم يكن مثبتاً أولاً؛ ثُبّت لاحقاً إصدار `37.1.11.0` | [سجل تثبيت SDK](phase45_android_sdk_install_2026-08-20.log) |
| منصة البناء | `platforms;android-35`، Build Tools `35.0.0`، و`compileSdk/targetSdk=35` | [سجل نسخ الأدوات وAPK](phase45_android_version_and_apk_evidence_2026-08-20.log) |
| صورة النظام | ثُبّتت `system-images;android-35;aosp_atd;x86_64` | [تحقق التثبيت](phase45_emulator_boot_2026-08-20.log) |
| AVD سابق | لا يوجد AVD سابق | [سجل فحص SDK المختصر](phase45_android_sdk_install_2026-08-20.log) |
| AVD مؤقت | أُنشئ `phase45_atd_api35` | [سجل إنشاء AVD](phase45_avd_create_2026-08-20.log) |
| إصدار Android runtime | **غير متاح**: المحاكي لم يصل إلى `sys.boot_completed=1` | [سجل runtime](phase45_emulator_runtime_2026-08-20.log) |

تم فحص السعة قبل التثبيت؛ كانت المساحة المتاحة تقارب 25 GiB. لم تُنشأ مفاتيح نشر أو أسرار داخل المستودع أثناء هذه المحاولة.

## 2. المحاولات العملية المستنفدة

| المسار | الأمر أو الإجراء | النتيجة | التصنيف |
|---|---|---|---|
| جهاز Android متصل | `adb devices -l` | لا توجد أجهزة | **EXTERNAL BLOCKER** |
| محاكي/AVD قائم | فحص `emulator -list-avds` وملفات AVD | لم يكن emulator مثبتاً ولا AVD موجوداً | مستنفد |
| SDK محلي | اكتشاف `adb` و`avdmanager` و`sdkmanager` داخل SDK | أدوات SDK متاحة؛ لا runtime جاهز | مستنفد |
| إنشاء runtime | تثبيت emulator وصورة Android 35 AOSP ATD ثم إنشاء `phase45_atd_api35` | نجح التثبيت والإنشاء | **PASS — تحضير فقط** |
| محاكي headless | تشغيل AVD بـ `-no-window -no-audio -gpu swiftshader_indirect -accel off` | ظهر `emulator-5554` بحالة `offline` ثم اختفى؛ فشل الوصول إلى boot خلال 180 ثانية | **BLOCKED** |
| التسريع | `emulator -accel-check` | `/dev/kvm is not found` | **EXTERNAL BLOCKER** |
| محاكاة TCG البرمجية | متابعة سجل QEMU | سجل TCG قيود `AVX/F16C` ثم `ERROR stop: Not implemented`؛ لا جهاز ADB صالح | **BLOCKED** |
| Gradle Device Providers | `:app:deviceAndroidTest` | `UP-TO-DATE` خلال 513ms؛ لا Device Provider أو نتائج tests؛ ليس instrumentation | مستنفد، **ليس PASS** |
| instrumentation الرسمي | `:app:connectedDebugAndroidTest` | فشل: `DeviceException: No connected devices!` | **EXTERNAL BLOCKER** |

السجلات القابلة لإعادة الفحص هي [إقلاع AVD](phase45_emulator_boot_2026-08-20.log)، [سجل المحاكي](phase45_emulator_runtime_2026-08-20.log)، [فحص Gradle Device Provider](phase45_gradle_device_provider_2026-08-20.log)، و[محاولة connected instrumentation](phase45_connected_instrumentation_2026-08-20.log).

## 3. تعريف APK والتحقق غير المتصل

| artifact | المعرّف والإصدار | SHA-256 |
|---|---|---|
| `app-debug.apk` | `com.cms.student`، `versionCode=1`، `versionName=0.1.0`، `minSdk=26`، `targetSdk=35` | `dbee2a07a9af6631360df595ba0c4620f21639bd7318f6830a86162b1fa5fa17` |
| `app-debug-androidTest.apk` | `com.cms.student.test`، `minSdk=26`، `targetSdk=35` | `45ebe4b634809a5c781097817f5cf1702d1c880634c665c4bc2395efb8191ad0` |

أعيد تشغيل:

```text
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest --console=plain
```

والنتيجة `BUILD SUCCESSFUL` مع 65 مهمة `UP-TO-DATE`. هذا يثبت قابلية تجميع وحدات JVM وAPK فقط، ولا يثبت تثبيت APK أو تنفيذ Android instrumentation. السجل: [Android JVM/APK regression](phase45_android_jvm_apk_regression_2026-08-20.log).

## 4. مصفوفة القبول الإلزامية

| شرط Phase 45 | الدليل المتاح في هذه الجولة | الحالة الصحيحة |
|---|---|---|
| Android Keystore: إنشاء مفتاح RSA وعدم قابلية تصدير private key | test instrumentation موجود في `OfflineSecurityInstrumentationTest.kt` ومجمع، لكنه لم ينفذ على AndroidKeyStore | **IMPLEMENTED — UNVERIFIED** |
| Manifest verification: ECDSA P-256 / DER | JVM cross-contract كان ناجحاً سابقاً؛ لا تشغيل Android runtime | **PASS — JVM فقط؛ Android runtime BLOCKED** |
| Key unwrap: RSA-OAEP SHA-256 | JVM vector كان ناجحاً سابقاً؛ لا Keystore فعلي | **PASS — JVM فقط؛ Android runtime BLOCKED** |
| AES-256-GCM + AAD decrypt | JVM vector كان ناجحاً سابقاً؛ لا decrypt على جهاز | **PASS — JVM فقط؛ Android runtime BLOCKED** |
| package issue | HTTP backend acceptance سابقاً `11/11 PASS` | **PASS — Backend HTTP فقط** |
| Offline use | لا يوجد مسار تطبيق Android يهيئ `TrustedOfflineVerifierFactory` أو يستهلك envelope | **IMPLEMENTED — UNVERIFIED / INTEGRATION PENDING** |
| Answer capture | `CmsApplication` يبقي Offline معطلاً، ولا توجد طبقة Android لتجميع الإجابات | **NOT IMPLEMENTED IN APP FLOW** |
| Sync | backend `POST /api/v1/offline/sync` موجود ومثبت HTTP سابقاً؛ لا عميل Android أو اختبار جهاز يستدعيه | **PASS — Backend فقط؛ Android integration PENDING** |
| Revocation | endpoint الحالة وعقد cache/refresher موجودان؛ لا HTTP/auth transport ولا refresh موصول قبل الاستخدام | **IMPLEMENTED — UNVERIFIED / INTEGRATION PENDING** |
| `FLAG_SECURE` | test instrumentation موجود ومجمع، و`MainActivity` يضبط العلم؛ لم ينفذ على Window فعلي | **IMPLEMENTED — UNVERIFIED** |
| مفاتيح النشر وpublic-key pin | لا مفتاح توقيع نشر في secret store ولا public SPKI مثبت في إعداد إصدار فعلي | **EXTERNAL / DEPLOYMENT BLOCKER** |

## 5. حدود ما ثبت سابقاً ولم يُعد ادعاؤه كدليل جهاز

تظل أدلة backend HTTP وعقد JVM السابقة صالحة ضمن حدودها: package issuance المشفر، entitlement، binding، idempotency، revocation/sync على الخادم، وvector ECDSA/RSA/AES بين backend وJVM. الملخص المرجعي هو [Gate 7](GATE_7_PHASE45_OFFLINE_ACCEPTANCE_2026-08-20.md). هذه الجولة لم تعثر على regression في Android build، لكنها لم تعيد backend أو frontend suites لأن ملفات تلك الطبقات لم تتغير.

فحص الإغلاق العام سجّل أن `dotnet` و`psql` و`redis-cli` و`pnpm` متاحة، وأن Docker غير متاح في هذه البيئة. هذا فحص معلوماتي ولا يُستخدم لإلغاء دليل PostgreSQL السابق أو استبدال Android runtime المطلوب. السجل: [security closure preflight](phase45_security_closure_preflight_2026-08-20.log).

## 6. الحواجز وشروط الاستئناف

| الحاجز | النوع والمالك | شرط الإغلاق القابل للقياس |
|---|---|---|
| عدم وجود Android runtime صالح | **EXTERNAL BLOCKER**؛ مالك بيئة CI أو مالك جهاز Android | جهاز فعلي API 26+ أو runner يتيح `/dev/kvm` ومحاكي مكتمل الإقلاع؛ يظهر `adb` الجهاز بحالة `device` و`sys.boot_completed=1` |
| عدم اكتمال عميل Offline داخل التطبيق | **INTERNAL P0**؛ فريق التطبيق | ربط download envelope، `TrustedOfflineVerifierFactory`، تخزين envelope الآمن، التقاط الإجابات، sync idempotent، و`OfflinePackageStatusApi` authenticated HTTPS؛ مع tests instrumented حقيقية لكل مسار |
| revocation transport/auth | **INTERNAL P0**؛ فريق التطبيق | استدعاء endpoint status عبر HTTPS ومصادقة JWT و`X-Installation-Id`، refresh قبل أول decrypt/استخدام، والتحول إلى `UNKNOWN` عند error؛ ثم إثبات revoked/unknown fails closed على جهاز |
| مفاتيح النشر | **EXTERNAL / DEPLOYMENT**؛ مالك secret store/release | مرجع secret-store فقط لـ `ManifestSigningPrivateKeyPkcs8` ومفتاح Android public SPKI الموافق في configuration الموثوقة؛ لا توضع أي private keys في repository |

بعد توفر المسببات أعلاه، يكون تسلسل التشغيل المطلوب هو:

```text
adb devices -l
adb -s <serial> shell getprop ro.build.version.sdk
adb -s <serial> shell getprop sys.boot_completed
./gradlew :app:connectedDebugAndroidTest --console=plain
```

ويجب أن تتضمن suite الحقيقية، فوق اختباري Keystore و`FLAG_SECURE` الحاليين، E2E لا يستعمل mock Keystore: issuance عبر HTTP، ECDSA manifest verification، RSA unwrap داخل Android Keystore، AES-GCM decrypt، offline use، answer capture، sync، والتحول إلى رفض بعد revocation أو فشل transport.

## 7. القرار النهائي

> **Phase 45: NOT CLOSED.**
>
> **Gate 46: BLOCKED — لم تُعد كمراجعة Production.**
>
> **Final Release Package: NOT CREATED.**

يبقى Offline و`OfflineTrustedClientImplemented` معطلين افتراضياً، ويبقى OTP `DEFERRED/DISABLED`. لا يوجد أساس أدلة يسمح بتصنيف الإصدار `READY WITH EXTERNAL VERIFICATION` لأن Offline داخل نطاق release المطلوب وما زالت أدلة runtime والتكامل التطبيقي ومفاتيح النشر ناقصة.

## المراجع الداخلية

[1] [Gate 7 — Phase 45 Offline Full Acceptance](GATE_7_PHASE45_OFFLINE_ACCEPTANCE_2026-08-20.md)  
[2] [محاولة connected instrumentation](phase45_connected_instrumentation_2026-08-20.log)  
[3] [سجل محاكي headless](phase45_emulator_runtime_2026-08-20.log)  
[4] [Android JVM/APK regression](phase45_android_jvm_apk_regression_2026-08-20.log)  
[5] [فحص إصدارات SDK وAPK](phase45_android_version_and_apk_evidence_2026-08-20.log)
