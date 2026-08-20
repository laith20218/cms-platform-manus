# FINAL ANDROID OFFLINE AND RELEASE REPORT

**التاريخ:** 20 أغسطس 2026  
**النطاق:** استكمال Android Offline ضمن Phase 45، اختبار محلي، إعداد مسار CI لتشغيل instrumentation، وإعادة قرار البوابة.  
**الحكم التنفيذي:** **Phase 45 = NOT CLOSED / NO-GO** و**Phase 46 = BLOCKED** و**Production Candidate = NO**.

> تم تنفيذ وربط طبقات Android Offline وكتابة instrumentation حقيقية وتجهيز workflow CI قابل للتشغيل. لكن لم يُشغَّل أي instrumentation على Android runtime مكتمل الإقلاع في هذه الجولة، ولم يُشغَّل workflow لأنه لا توجد شجرة Git أو remote GitHub في workspace، كما لا توجد مفاتيح نشر موثقة في secret store. لذلك لا تتحول أدلة source أو JVM أو APK إلى دليل runtime ولا يجوز إصدار Release Candidate.

## 1. حدود المهمة وما لم يُمس

لم يُعاد تصميم أو بناء المراحل المغلقة 39–44 أو backend HTTP/PostgreSQL أو Student Web؛ لم تتغير تلك الطبقات أثناء هذه الجولة. استُخدم عقد Offline HTTP القائم فقط: `POST /api/v1/entitlements/issue` و`POST /api/v1/offline/download` و`GET /api/v1/offline/packages/{packageId}/status` و`POST /api/v1/offline/sync`.

| الدليل السابق | الحالة في هذه الجولة | الملاحظة |
|---|---|---|
| Phase 44 PostgreSQL audit matrix | لم يُعد تشغيله | يظل مغلقاً وفق Gate 6؛ لا regression من تغييرات Android. |
| Backend Offline HTTP acceptance | لم يُعد تشغيله | لا تغيير backend؛ كان `11/11 PASS` في Gate 7. |
| Android ECDSA/RSA/AES contract JVM | حافظ عليه | لم يُستخدم كبديل عن device runtime. |
| Student Web Offline | لم يُمس | يبقى fail-closed عمداً، وليس Offline PASS. |

## 2. ما تم تنفيذه في Android

تم تحويل Android من shell أمني صغير إلى مسار Offline مشروط ومغلق افتراضياً. لا يحتوي المسار على سؤال تجريبي أو key خام أو manifest signing private key.

| المجال | ملفات التنفيذ | السلوك الفعلي في الكود |
|---|---|---|
| عقود runtime | `OfflinePackageModels.kt` | `IManifestSignatureVerifier` و`IPackageKeyProvider` و`IKeyReleaseTokenVerifier` و`IRevocationStatusProvider` و`IOfflinePackageDecryptor` و`IOfflinePackageStore` و`ISyncClient` ضمن dependency graph واحد. |
| تشفير التخزين | `EncryptedOfflinePackageStore.kt` | يحفظ envelope وanswer metadata فقط داخل `EncryptedFile` بمفتاح `MasterKey` من Android Keystore؛ لا يحفظ plaintext questions أو AES package key. |
| HTTPS transport | `HttpsOfflineClients.kt` | يرفض cleartext/redirects، يرسل JWT و`X-Installation-Id`، يطلب entitlement وdownload/status/sync، ويصنف HTTP/network failures دون log للأسرار. |
| trusted flow | `OfflineRuntimeCoordinator.kt` | يربط entitlement → download → manifest binding → status refresh → decrypt → question parse → question-ID index → answer capture → idempotent sync. |
| إبطال وفشل الشبكة | `TrustedOfflineRuntime.kt` | transport failure أو confirmation قديم/غير مطابق يحول cache إلى `UNKNOWN`؛ verifier يرفض `UNKNOWN` و`REVOKED`. |
| bootstrap والجلسة | `CmsApplication.kt`, `HttpsOfflineClients.kt`, `MainActivity.kt` | ينفذ login عبر HTTPS مع `deviceFingerprint`، يحتفظ access token في الذاكرة فقط، يربط session بالتثبيت، ثم يطلب encrypted package من الواجهة؛ يعود Offline runtime `null` عندما flag الموثوق `false`. |
| شاشة الامتحان | `OfflineExamActivity.kt` | تستعمل coordinator فقط، تفتح الحزمة online أو ضمن نافذة offline policy، تعرض payload المفكوك، تسجل الاختيارات، تدعم السابق/التالي وموضع السؤال، وتستعيد الاختيارات من encrypted store بعد Activity recreation؛ تطبق `FLAG_SECURE`. |
| network boundary | `AndroidManifest.xml` | أضيف `INTERNET` مع استمرار `usesCleartextTraffic=false` و`network_security_config`. |

يبقى `OFFLINE_TRUSTED_CLIENT_IMPLEMENTED=false` افتراضياً. وعند محاولة تفعيله بلا HTTPS API URL أو public SPKI pin أو alias، يفشل bootstrap فشلاً مغلقاً. مراجع development/staging/production موثقة فقط في [`ANDROID_OFFLINE_KEY_CONFIGURATION.md`](ANDROID_OFFLINE_KEY_CONFIGURATION.md) ولا تشمل قيمة private key.

## 3. اختبارات تم إعدادها

| الطبقة | الاختبارات | النتيجة والدليل |
|---|---|---|
| JVM | `OfflineRuntimeCoordinatorTest` | `4/4 PASS`: download/open/capture/sync، revoked، network failure→unknown، disabled configuration. |
| JVM | `TrustedOfflineRuntimeTest` | `4/4 PASS`: factory fail-closed، active/revoked، transport failure→unknown، stale confirmation→unknown. |
| JVM | كامل Android unit suite | `14/14 PASS`, `0 failed`, `0 skipped`. [سجل JVM](phase45_android_offline_all_jvm_tests_2026-08-20.log) |
| Android instrumentation — existing | `OfflineSecurityInstrumentationTest` | Keystore non-exportability و`FLAG_SECURE`؛ **مُجمع فقط**. |
| Android instrumentation — جديد | `OfflineRuntimeInstrumentationTest` | Android Keystore RSA-OAEP unwrap، ECDSA manifest verify، AES-GCM decrypt، tampered ciphertext/tag/signature، wrong installation/wrong key/expiry، revoked/unknown، EncryptedFile restart persistence، answer binding، وOfflineExam `FLAG_SECURE`؛ **مُجمع فقط**. |

> فئات JVM تستعمل fixtures لاختبار منطق coordinator فقط. لا تُعرض هذه fixtures كدليل production runtime، ولا يوجد mock Keystore في instrumentation الجديد؛ المفاتيح RSA الخاصة فيه تأتي من `AndroidKeyStore` عند التنفيذ على جهاز.

## 4. Android artifacts والتحقق المحلي

نفذ هذا الأمر بعد التغييرات:

```text
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest --console=plain
```

وكانت النتيجة `BUILD SUCCESSFUL`. أحدث سجل: [phase45_latest_revision_local_regression_2026-08-20.log](phase45_latest_revision_local_regression_2026-08-20.log).

| artifact | SHA-256 |
|---|---|
| `app-debug.apk` | `2e7937b674aca493d59cddd3f876837a9720d54617d32eb170e135c30cce5712` |
| `app-debug-androidTest.apk` | `e9e71e20d209f965f37b1542af945620c4c563f9ff750070c29d4af20e7b3988` |

هذه artifacts قابلة للتثبيت، **لكنها ليست دليلاً على تثبيت أو تنفيذ**.

## 5. Android runtime المحلي

| محاولة | النتيجة | الحالة |
|---|---|---|
| جهاز عبر `adb devices -l` | لا يوجد جهاز | **EXTERNAL BLOCKER** |
| AVD headless محلي سابق | ثُبّت emulator وصورة API 35 وأُنشئ AVD؛ غياب `/dev/kvm` وقيود TCG منع اكتمال boot | **EXTERNAL BLOCKER** |
| أحدث تشغيل instrumentation | `:app:connectedDebugAndroidTest` فشل بـ`DeviceException: No connected devices!` | **EXTERNAL BLOCKER** |

الدليل الحالي: [phase45_latest_revision_connected_instrumentation_2026-08-20.log](phase45_latest_revision_connected_instrumentation_2026-08-20.log). وعليه لا توجد هوية جهاز أو إصدار Android runtime أو نتيجة instrumentation قابلة للإسناد لهذه الجولة.

## 6. مسار CI الحقيقي المُعد

أضيف [`android-offline-runtime.yml`](../../.github/workflows/android-offline-runtime.yml). يشغل Android API 35 (`aosp_atd`, `x86_64`) ويهيئ KVM، وينتظر `sys.boot_completed=1`، وينفذ `connectedDebugAndroidTest`، ويجمع ADB properties وlogcat وتقارير AndroidTest وSHA للـAPK في artifact. تتطلب GitHub-hosted Linux runners تهيئة KVM للوصول إلى تسريع المحاكي؛ وهذا هو نمط التهيئة الموصى به في توثيق GitHub وaction runner [1] [2].

| عنصر CI | الحالة |
|---|---|
| workflow محفوظ في المصدر | **PREPARED — UNAPPLIED** |
| مراجع actions | مثبتة عند SHA لـcheckout وsetup-java وemulator-runner وupload-artifact |
| security-artifact check | **PASS** — [السجل](phase45_android_ci_security_check_2026-08-20.log) |
| workflow run ID / commit SHA / reports | **غير متاح**: workspace ليس Git worktree ولا يملك remote GitHub؛ فشل تحقق connector GitHub بمصادقة غير صالحة. |

لا يصح الادعاء بأن CI نفذ أو أن emulator boot في GitHub قبل أن يرفع مالك المستودع workflow إلى remote موثوق ثم يقدم `run ID` وartifact النتائج.

## 7. مفاتيح النشر

| المتطلب | الحالة | شرط الإغلاق |
|---|---|---|
| development/staging/production references | **PREPARED** | المراجع في `ANDROID_OFFLINE_KEY_CONFIGURATION.md` منفصلة ولا تحمل private material. |
| private ECDSA signing material | **EXTERNAL / DEPLOYMENT BLOCKER** | دليل secret-store يثبت وجود key البيئة الصحيحة وإخفاء قيمتها. |
| public SPKI pin في build محمي | **PREPARED — UNAPPLIED** | injection محمي يطابق public SPKI مع private key للبيئة نفسها. |
| production signing package | **EXTERNAL / DEPLOYMENT BLOCKER** | ownership وsigning ceremony وأدلة release خارج هذا workspace. |

## 8. مصفوفة قبول Phase 45

| شرط إلزامي | الحالة الحالية | الدليل أو فجوة الإغلاق |
|---|---|---|
| Backend وHTTP | PASS سابقاً | Gate 7؛ لم يتغير backend. |
| Android contract | PASS — JVM فقط | vector contract قائم. |
| Keystore | **IMPLEMENTED — UNVERIFIED ON DEVICE** | instrumentation جديد مُجمع فقط. |
| Manifest verification | **IMPLEMENTED — UNVERIFIED ON DEVICE** | instrumentation جديد مُجمع فقط. |
| RSA unwrap وAES-GCM | **IMPLEMENTED — UNVERIFIED ON DEVICE** | instrumentation جديد مُجمع فقط. |
| Envelope storage | **IMPLEMENTED — UNVERIFIED ON DEVICE** | EncryptedFile test مُجمع فقط. |
| Offline question use | **IMPLEMENTED — UNVERIFIED ON DEVICE** | `MainActivity` يربط login/session وطلب الحزمة، و`OfflineExamActivity` يدعم عرض payload والتنقل والاستعادة؛ لا E2E runtime أو live backend device evidence. |
| Answer capture | **IMPLEMENTED — UNVERIFIED ON DEVICE** | coordinator/store tests JVM فقط. |
| Sync/idempotency | **IMPLEMENTED — UNVERIFIED ON DEVICE** | HTTPS client/coordinator موجودان؛ لا live-server Android flow. |
| Revocation/unknown/network failure | **IMPLEMENTED — UNVERIFIED ON DEVICE** | JVM tests PASS؛ لا runtime/CI evidence. |
| `FLAG_SECURE` | **IMPLEMENTED — UNVERIFIED ON DEVICE** | activity instrumentation مُجمع فقط. |
| Production keys | **EXTERNAL / DEPLOYMENT BLOCKER** | secret-store proof مفقود. |

## 9. القرار النهائي وخطوات الاستئناف

> **Phase 45 لا تُغلق.** توجد فحوص Android runtime وإعداد CI، لكنها لم تُنفذ. ولا يزال live Android E2E ضد backend مصادق عليه غير مثبت على جهاز/CI.
>
> **لا تبدأ Phase 46.** وبما أن Phase 45 ليست `CLOSED`، فلا إعادة لبناء كامل المراحل أو Docker/R2/scanner/نشر ولا `CMS_Production_Release_FINAL.zip` أو ملف SHA.

يلزم الإغلاق بالترتيب التالي:

1. رفع source إلى Git remote موثوق وتشغيل `Android Offline Runtime`؛ حفظ commit SHA وrun ID وartifact logcat وJUnit reports.
2. التأكد أن instrumentation وصل إلى `device` وأن `sys.boot_completed=1`، ثم اجتاز tests المتعلقة بـKeystore/decrypt/storage/answer/`FLAG_SECURE`.
3. توفير بيئة staging backend حقيقية وآمنة أو test harness موثوق يمكن لتطبيق Android الوصول إليه، لإثبات login/session→entitlement→download→open→answer→disconnect/reconnect→sync→revoke→reject من واجهات التطبيق، دون mock Keystore أو بيانات demo.
4. الحصول على دليل secret store لمفاتيح staging ثم production وpublic SPKI pin المطابق، دون كشف قيمة خاصة.
5. بعد PASS لكل ما سبق فقط، يعاد Gate 45؛ ثم فقط إذا أصبح `CLOSED` يعاد Gate 46.

## المراجع

[1] [GitHub Actions — Hardware accelerated Android virtualization](https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/)  
[2] [ReactiveCircus Android Emulator Runner — Official README](https://github.com/ReactiveCircus/android-emulator-runner)  
[3] [Phase 45 Android Runtime Closure Report](PHASE_45_ANDROID_RUNTIME_CLOSURE_REPORT.md)  
[4] [Gate 7 — Phase 45 Offline Acceptance](GATE_7_PHASE45_OFFLINE_ACCEPTANCE_2026-08-20.md)  
[5] [Gate 8 — Phase 46 Decision](GATE_8_PHASE46_RELEASE_CANDIDATE_DECISION_2026-08-20.md)  
[6] [CI external-reference note](phase45_ci_external_references_2026-08-20.md)
