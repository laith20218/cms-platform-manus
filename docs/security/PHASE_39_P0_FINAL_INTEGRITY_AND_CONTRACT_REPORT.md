# Phase 39 P0 — Final Play Integrity Contract & Offline Verifier Status

**المشروع:** CMS Production Release v1.0  
**التاريخ:** 2026-08-19  
**المعد:** Manus AI  
**النطاق:** Backend Play Integrity contract، Phase 36 → Android contract test، حالة P0 والحواجز الخارجية

## 1. الحكم التنفيذي

تم في هذه الجولة إضافة **Backend Play Integrity endpoint وعقد خدمة fail-closed**، وتنفيذ **contract test قابل لإعادة التشغيل** يولّد envelope من `OfflinePackageCryptoService` في Backend ثم يمرره إلى Android Native verifier في اختبار JVM. كلا المسارين بُنيا واختُبرا محلياً بنجاح.

> **قرار P0 النهائي: NO-GO للإطلاق أو تفعيل Offline.**
>
> ما أُغلق هو عقد endpoint وcontract evidence محلياً. ما بقي مفتوحاً هو Play Integrity الحقيقي، تنفيذ Instrumentation على جهاز، Android lifecycle/secure key release في الواقع، والتراجع غير المفسر في suite اختبارات Backend من الأدلة التاريخية إلى 73 اختباراً ظاهراً في المستودع الحالي.

لا يوجد ادعاء بأن Google Play Integrity يعمل أو أن Android Instrumentation نفّذ بنجاح.

## 2. ما تم تنفيذه وإثباته

| البند | الملفات الأساسية | الدليل التشغيلي في هذه الجولة | الحالة |
|---|---|---|---|
| Play Integrity contract | `CMS.Application/Interfaces/IPlayIntegrityService.cs` | `dotnet build` ناجح | **PASS — contract compiled** |
| Backend fail-closed service | `CMS.Infrastructure/Services/FailClosedPlayIntegrityService.cs` | HTTP integration tests تمر | **PASS — fail-closed** |
| HTTP endpoint | `CMS.Api/Controllers/PlayIntegrityController.cs` | اختبار 400 لطلب hash غير صالح و403 للـprovider غير المهيأ | **PASS — HTTP evidence** |
| DI/config default | `DependencyInjection.cs`, `appsettings.json` | default `Security:PlayIntegrity:Enabled=false` | **PASS — source/build evidence** |
| Backend→Android vector generator | `tools/Phase36ContractVector/` | استدعى `OfflinePackageCryptoService` فعلياً وكتب fixture | **PASS — generated this run** |
| Cross-platform contract test | `scripts/verify_phase36_android_contract.sh` | `CONTRACT_RC=0` | **PASS — local contract evidence** |
| Android Native verifier | `apps/android/.../OfflinePackageVerifier.kt` | Android JVM tests نجحت | **PASS — JVM evidence** |
| Offline default gate | `CmsApplication.offlineEnabled=false` وverifier gate | اختبار fixture مع gate false نجح | **PASS — JVM/source evidence** |

## 3. Backend Play Integrity Endpoint

### العقد

المسار الجديد:

```text
POST /api/v1/security/play-integrity/verify
```

يتطلب مصادقة role `student`، header `X-Installation-Id`، وbody يحتوي token opaque، وrequest hash بصيغة base64url، وoperation من:

```text
Login | OfflineDownload | SensitiveContent | PeriodicRefresh
```

الخدمة لا تسجل token ولا تعيده في الاستجابة. يستخرج Controller المستخدم من claims وسياق التثبيت من header، ثم يستدعي `IPlayIntegrityService`.

### سياسة fail-closed الحالية

`FailClosedPlayIntegrityService` هو التطبيق المسجل حالياً. لا يتصل بـGoogle ولا يقبل أي token. عند عدم الإعداد يرجع قراراً آمناً فقط:

```text
not_configured
```

وحتى إذا ضُبط `Security:PlayIntegrity:Enabled=true`، يرجع:

```text
provider_not_configured
```

أي أن flag لا يساوي bypass. لا يمكن أن تعود الاستجابة `200 Accepted=true` حتى يتم استبدال interface provider حقيقي يفحص verdict وrequest hash وreplay server-side.

### اختبارات HTTP

أضيف `PlayIntegrityHttpIntegrationTests.cs` باستخدام `WebApplicationFactory` القائمة، ويثبت:

| السيناريو | HTTP المتوقع | النتيجة |
|---|---:|---|
| `RequestHash` غير صالح | 400 | PASS |
| token/hash سليمان شكلياً لكن لا يوجد provider | 403، `not_configured` | PASS |

نتيجة Backend النهائية لهذه الجولة:

```text
Build succeeded — 0 warnings, 0 errors
Passed: 73, Failed: 0, Skipped: 0
```

## 4. Backend ↔ Android Contract Test

### التسلسل القابل لإعادة التشغيل

السكربت التالي هو نقطة الإثبات الرسمية:

```bash
scripts/verify_phase36_android_contract.sh
```

ينفذ بالترتيب:

1. `DOTNET_ROLL_FORWARD=Major dotnet run --project tools/Phase36ContractVector/...`
2. توليد `apps/android/app/src/test/resources/phase36-contract-vector.json` من `OfflinePackageCryptoService.Encrypt` و`ReleaseKey` الفعليين.
3. تشغيل `./gradlew --no-daemon testDebugUnitTest` في Android.

النتيجة الفعلية:

```text
CONTRACT_RC=0
BUILD SUCCESSFUL
```

### نطاق fixture

الـfixture يحتوي Manifest وCiphertext وTag وWrappedKey وKeyReleaseToken الصادرة من Backend، ويدخل إلى `OfflinePackageVerifier` Native. لضمان إمكانية إثبات AES-GCM وHMAC contract في JVM، يحتوي fixture تحت **`src/test/resources` فقط** على مفاتيح test-only وplaintext المتوقع. هذه القيم ليست production secrets ولا تدخل APK الإنتاجي.

Android test يثبت أن verifier يستطيع:

- مطابقة canonical manifest/AAD مع عقد Phase 36.
- التحقق من HMAC test fixture.
- فك AES-256-GCM عند اكتمال كل الشروط.
- رفض نفس envelope عندما يكون offline gate false.

لا يثبت هذا إصدار raw AES key إلى Android production. في production، لا يجوز شحن HMAC signing secret الخاص بالخادم في APK؛ يجب أن يكون التحقق عبر public-key signature أو قرار/إصدار قصير العمر موثق من الخادم.

## 5. استعادة Android Module وفحوصاته

أثناء هذه الجولة ظهر أن `apps/android` في المستودع المحلي لم يحتوِ ملفات الوحدة السابقة؛ بقي فقط fixture path، بينما اختفت `build.gradle.kts` وKotlin sources وwrapper. صُنفت هذه الحادثة **Repository Regression** وليست External Blocker.

تمت استعادة الحد الأدنى القابل للبناء المدعوم بالعقود السابقة:

```text
apps/android/settings.gradle.kts
apps/android/build.gradle.kts
apps/android/gradle.properties
apps/android/gradlew + gradle/wrapper/*
apps/android/app/build.gradle.kts
apps/android/app/src/main/java/com/cms/student/security/*
apps/android/app/src/test/resources/phase36-contract-vector.json
apps/android/app/src/test/java/*
```

تعذر البناء أولاً بسبب SDK location غير موجود. تم استعادة Android command-line tools وPlatform 35 وBuild Tools وكتابة `local.properties`. ظهر بعد ذلك فشل JUnit حقيقي في test مستعاد يعيد assertion result بدلاً من `Unit`؛ تم تصحيحه دون حذف الاختبار.

النتيجة النهائية:

```text
./gradlew --no-daemon testDebugUnitTest assembleDebug
BUILD SUCCESSFUL
PlayIntegrityHelperTest: 2/2 passed
OfflinePackageContractVectorTest: 2/2 passed
```

## 6. الحواجز الخارجية مقابل الحواجز الداخلية

### External Blockers

| البند | الدليل | المالك/الإجراء المطلوب |
|---|---|---|
| Android Instrumentation execution | `connectedDebugAndroidTest` فشل سابقاً: `No connected devices`; x86_64 Emulator يحتاج `/dev/kvm`; ARM64 غير مدعوم على host x86_64 | مالك CI/infra أو جهاز Android فعلي؛ توفير ADB device أو runner بـKVM |
| Google Play Integrity live verification | لا يوجد Play Console application/signing/provider/replay store | مالك Google Play/Cloud وBackend؛ internal testing + service account/provider + server verification |
| Release signing/provenance | لا يوجد signed AAB أو CI provenance مثبت | مالك release/CI؛ توقيع خارج المستودع وإثبات artifact |

### Repository Blockers / Gaps قابلة للإغلاق داخلياً

| البند | الدليل | الإجراء التالي |
|---|---|---|
| اختبارات Phase 36 Offline HTTP الثمانية ليست موجودة في المصدر الحالي | `OfflinePackageHttpIntegrationTests.cs` غير موجود و`dotnet test --list-tests` لا يعرضه؛ suite الحالي 73 اختباراً | استعادة ملف الاختبارات من artifact موثوق أو إعادة بنائه من العقد الحالي، ثم إعادة تشغيل full suite |
| Android module اختفى من source tree | استعيد في هذه الجولة من العقود السابقة | commit/backup موثوق وCI check يمنع حذف module/wrapper/tests |
| Production manifest verification | HMAC server secret لا يجوز توزيعه | تحويل manifest إلى signature public-key أو اعتماد key-release server-side موثق |
| Android revocation source | verifier يقبل interface لكنه غير موصول lifecycle حقيقي | ربط provider بسجل revocation موثوق وTTL/cache fail-closed |

## 7. ما يمكن إغلاقه لاحقاً وشروط القبول

| بند | شرط PASS الحقيقي |
|---|---|
| Instrumentation | `connectedDebugAndroidTest` على API 34/35 أو جهاز فعلي؛ Keystore/SecureStorage/FLAG_SECURE tests تنجح دون skip |
| Play Integrity | release-signed app على Play internal testing؛ token حقيقي؛ Backend يتحقق من package/cert/requestHash/freshness/replay/verdicts؛ tests للرفض والقبول |
| Offline Android | verifier مربوط secure key-release وrevocation؛ tests device للexpiry/tamper/wrong device/revoke؛ offline gate يبقى false حتى إتمامها |
| Phase 36 HTTP regression | 8 سيناريوهات HTTP موجودة ومكتشفة وتشغل ضد fixture حقيقية |
| Production release | signed AAB، CI provenance، deployed headers، owner approval، rollback evidence |

## 8. القرار النهائي والخطوة التالية

**P0 status: Improved but not closed.**

العقد بين Backend وAndroid أصبح قابلاً لإعادة التشغيل ومثبتاً محلياً، وendpoint Play Integrity يرفض كل طلب بأمان حتى إعداد provider. هذان إغلاقان حقيقيان على مستوى source/build/JVM/HTTP المحلي.

لكن **NO-GO** يبقى القرار الوحيد الصحيح للإنتاج. تبدأ الخطوة المنطقية التالية باستعادة اختبارات Offline HTTP Phase 36 المفقودة من مصدر موثوق أو إعادة بنائها، ثم توفير CI/device للـInstrumentation، ثم Play Integrity integration في Play internal testing. لا يجب تفعيل Offline أو تغيير flags الافتراضية قبل ذلك.

## References

[1]: https://developer.android.com/google/play/integrity/overview "Android Developers — Play Integrity overview"

[2]: https://developer.android.com/training/articles/keystore "Android Developers — Android Keystore system"

[3]: https://developer.android.com/studio/run/emulator-acceleration "Android Developers — Android Emulator acceleration"

[4]: PHASE_39_OFFLINE_VERIFIER_AND_BLOCKER_REPORT.md "Previous Offline verifier and instrumentation blocker report"
