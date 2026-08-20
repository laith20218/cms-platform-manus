# Gate 7 — Phase 45 Offline Full Acceptance

## الحكم التنفيذي

> **الإغلاق الداخلي للـ Backend وعقد Android JVM: PASS. الإغلاق الكامل لـ Phase 45: NOT CLOSED / NO-GO للإصدار.**
>
> تم استبدال المسار غير القابل للتحقق محلياً في حالة العميل الموثوق بعقد **ECDSA P-256** لتوقيع manifest و**RSA-OAEP-SHA256** لتغليف مفتاح حزمة AES-256-GCM إلى public key خاص بتثبيت Android. ومع ذلك، لا يوجد دليل تشغيل على جهاز Android فعلي، ولم تُهيأ مفاتيح النشر الفعلية في بيئة إنتاج، ويظل عميل الويب fail-closed. لذلك لا يجوز اعتبار Offline قابلاً للإطلاق أو إعادة Gate 46 كـ Production Candidate.

## ما تغيّر داخل النطاق

| العنصر | التنفيذ الموثق | النتيجة |
|---|---|---|
| Device public-key binding | حقل `offline_package_public_key_spki` على `device_bindings` مع migration `Phase45OfflineDevicePublicKey` مطبقة على PostgreSQL المحلي. يثبت handler صحة SPKI/RSA 2048+ ويربطه بأول installation نشطة ويمنع استبداله. | **PASS** |
| توقيع manifest قابل للتحقق محلياً | `OfflinePackageCryptoService` يدعم ECDSA P-256 بصيغة RFC3279 DER عند trusted issuance، بينما لا يبقى HMAC مسار ثقة للعميل الموثوق. | **PASS** |
| تغليف مفتاح الحزمة | الحزمة تستعمل AES-256-GCM، ويُغلّف مفتاحها إلى public key Android عبر RSA-OAEP-SHA256. لا يُعاد raw AES key ولا يُخزّن في السجل أو response. | **PASS** |
| Trusted gate | `Features:OfflineTrustedClientImplemented=false` افتراضياً. عند تفعيله صراحةً، يرفض download بلا public key أو بمفتاح مختلف للـ installation قبل lifecycle. | **PASS** |
| Android verifier | `PinnedEcdsaManifestSignatureVerifier` و`AndroidKeystorePackageKeyProvider` و`CachedOfflineRevocationStatusProvider` وfactory fail-closed موجودة في source الإنتاجي. | **PASS — JVM/compile** |
| تأكيد الإبطال | endpoint جديد محدود البيانات: `GET /api/v1/offline/packages/{packageId}/status` يفرض student + installation ويعيد الحالة فقط، بلا envelope أو keys. | **PASS** |
| Offline الافتراضي | جميع flags، ومنها trusted-client gate، تبقى `false` في `appsettings.json`. OTP يبقى disabled/deferred. | **PASS** |

## أدلة قبول HTTP الحقيقية

اختبارات `OfflineHttpIntegrationTests` تعمل عبر `WebApplicationFactory` الحقيقي: مصادقة، session middleware، signed entitlement، device binding، rate limit، controller، MediatR، lifecycle، crypto، persistence in-memory الخاصة بالـ host الاختباري. قيمة الـ flags مفعلة داخل fixture فقط.

| سيناريو HTTP | النتيجة | الدليل التشغيلي |
|---|---|---|
| إصدار envelope مشفّر | **PASS** | 200 مع manifest/ciphertext/tag/wrapped key/key-release receipt فقط، ومنع `questions` وraw key وcorrect answers. |
| إصدار trusted device-key | **PASS** | يرسل `X-Offline-Package-Public-Key`، ويثبت الاختبار أن wrapped key يفك فقط بالمفتاح الخاص RSA المطابق وأن SPKI حفظ في binding. |
| غياب trusted public key | **PASS** | 403 قبل إنشاء package record عند trusted gate. |
| تبديل public key لتثبيت مرتبط | **PASS** | 403 قبل lifecycle؛ لا سجل حزمة إضافي. |
| غياب entitlement | **PASS** | 401 قبل إنشاء package. |
| entitlement منتهي أو محرّف أو جهاز مختلف أو خارج النطاق | **PASS** | 403 في كل حالة قبل إنشاء package. |
| idempotency | **PASS** | نفس المفتاح يعيد نفس `PackageId` وينشئ record واحداً. |
| revoke ثم sync | **PASS** | delete يعيد 204؛ sync لاحق يعيد 403 بلا attempt. |
| status بعد revoke | **PASS** | status المملوك للتثبيت ينتقل من `active` إلى `revoked` ولا يحتوي ciphertext أو wrapped key. |
| ownership وmanifest scope في sync | **PASS** | حزمة طالب آخر مرفوضة؛ سؤال خارج allowed subject لا ينشئ attempt. |

**نتيجة suite:** `11 passed, 0 failed, 0 skipped`. سجل إعادة التشغيل: [`phase45_trusted_offline_http_runtime_2026-08-20.log`](phase45_trusted_offline_http_runtime_2026-08-20.log).

## دليل عقد Backend ↔ Android

تم توليد vector test-only من خدمة backend الحقيقية. يستخدم private ECDSA ومفتاح RSA خاص بالجهاز مُولّدين أثناء الاختبار فقط، ولا يكتب أي secret إنتاج. يقرأ Android JVM هذا vector ويثبت التوافق التالي:

| خطوة العقد | النتيجة |
|---|---|
| Canonical manifest JSON | **PASS** — تم توحيد صيغة ticks الزمنية بين `System.Text.Json` وKotlin. |
| ECDSA P-256/RFC3279 DER | **PASS** — Android يتحقق بمفتاح SPKI العام فقط. |
| RSA-OAEP SHA-256/MGF1 SHA-256 | **PASS** — Android يفك المفتاح الملتف بالمفتاح الخاص المطابق فقط. |
| AES-256-GCM + AAD | **PASS** — plaintext يطابق vector بعد جميع الفحوصات. |
| Unknown revocation وtampered signature | **PASS — fail-closed** — verifier يعيد `null`. |
| Factory/revocation runtime | **PASS — JVM** — لا ينشأ verifier عند Offline disabled أو غياب public signing key؛ وتحديث status المؤكد فقط يغير cached state. |

الأدلة: [`phase45_backend_android_contract_vector_2026-08-20.log`](phase45_backend_android_contract_vector_2026-08-20.log)، [`phase45_android_trusted_contract_runtime_2026-08-20.log`](phase45_android_trusted_contract_runtime_2026-08-20.log)، و[`phase45_android_trusted_runtime_unit_2026-08-20.log`](phase45_android_trusted_runtime_unit_2026-08-20.log).

## البناء والانحدار

| الأمر | النتيجة |
|---|---|
| `dotnet build CMS.sln -c Release --no-restore` | **PASS** — 0 warnings، 0 errors في التشغيل النهائي. |
| `dotnet test CMS.sln -c Release --no-build` على PostgreSQL | **PASS** — **130 passed، 0 failed، 0 skipped**. |
| PostgreSQL trusted public-key binding runtime | **PASS** — يثبت تخزين SPKI مع دورة issue/revoke/rejected sync. |
| `pnpm build` في `student-web` | **PASS**. |
| `pnpm exec vitest run` في `student-web` | **PASS** — 11 tests. |
| `./gradlew testDebugUnitTest assembleDebug` | **PASS**. |
| `./gradlew assembleDebugAndroidTest` | **PASS** — APK الاختبار وAPK التطبيق تولّدا. |

سجلات رئيسية: [`phase45_final_backend_build_2026-08-20.log`](phase45_final_backend_build_2026-08-20.log)، [`phase45_final_backend_postgres_tests_2026-08-20.log`](phase45_final_backend_postgres_tests_2026-08-20.log)، [`phase45_student_web_build_2026-08-20.log`](phase45_student_web_build_2026-08-20.log)، [`phase45_student_web_tests_2026-08-20.log`](phase45_student_web_tests_2026-08-20.log)، و[`phase45_android_instrumentation_compile_2026-08-20.log`](phase45_android_instrumentation_compile_2026-08-20.log).

## Instrumentation وحالة المنصات — تحديث runtime الفعلي

توجد اختبارات Android instrumentation حقيقية في `app/src/androidTest/.../OfflineSecurityInstrumentationTest.kt` تغطي Android Keystore RSA غير القابل للتصدير و`FLAG_SECURE`. أعيد التحقق من تجميع `app-debug.apk` و`app-debug-androidTest.apk` بنجاح.

> **لا يوجد PASS لتنفيذ instrumentation.** اكتُشف SDK محلي كامل بعد الفحص، وثُبّت Android Emulator `37.1.11.0` وصورة `android-35;aosp_atd;x86_64`، ثم أُنشئ AVD مؤقت وشُغّل headless مع `-accel off`. لكن `/dev/kvm` غير متاح؛ ظهر `emulator-5554` بحالة `offline` ثم اختفى، ولم يصل إلى `sys.boot_completed=1` خلال 180 ثانية. فشل أحدث `:app:connectedDebugAndroidTest` صراحةً بـ `DeviceException: No connected devices!` بعد بناء login/session وتدفق Offline. لا يثبت تجميع APK أو مهمة Gradle Device Provider التي كانت `UP-TO-DATE` تثبيت APK أو تنفيذ اختبار على Keystore فعلي. هذه **External Blocker** تتطلب جهاز Android فعلياً أو CI Android يملك جهازاً/Emulator مع تسريع مناسب.

السجل الكامل للمحاولات والنسخ وبصمات APK: [`PHASE_45_ANDROID_RUNTIME_CLOSURE_REPORT.md`](PHASE_45_ANDROID_RUNTIME_CLOSURE_REPORT.md).

## حواجز الإغلاق المتبقية

| الحاجز | التصنيف | سبب منع Production Candidate |
|---|---|---|
| Android device/emulator runtime | **EXTERNAL** | لا دليل تشغيل Keystore أو `FLAG_SECURE` أو AndroidKeyStore provider على جهاز حقيقي؛ تمت محاولة AVD headless ولم يكتمل الإقلاع بسبب غياب KVM/فشل TCG. |
| Android Offline app flow | **IMPLEMENTED — UNVERIFIED ON DEVICE** | أضيف `MainActivity` لـlogin/session وطلب الحزمة، وbootstrap وcoordinator وEncryptedFile store و`OfflineExamActivity` للتنزيل/decrypt/open/answer/sync والتنقل والاستعادة؛ لا يوجد تشغيل Android E2E أو live backend session مثبت على جهاز. |
| تهيئة مفاتيح النشر | **EXTERNAL / DEPLOYMENT** | مراجع key environments موثقة فقط في `ANDROID_OFFLINE_KEY_CONFIGURATION.md`؛ يتطلب النشر secret-store proof وpublic SPKI pin مطابقاً؛ لا يجوز استخدام مفاتيح الاختبارات. |
| Browser Offline usage | **INTENTIONAL FAIL-CLOSED** | web client يخزن envelope فقط ولا يملك keystore boundary؛ لا يفك المحتوى ولا يلتقط إجابات Offline. |
| Revocation refresh transport | **IMPLEMENTED — UNVERIFIED ON DEVICE** | عميل HTTPS authenticated يستدعي status قبل open/sync ويتحول إلى `UNKNOWN` عند network/stale failure؛ JVM PASS فقط ولا دليل device/CI بعد. |
| Android runtime CI | **PREPARED — UNAPPLIED** | workflow API 35/KVM/connected instrumentation محفوظ ومثبت actions عند SHA؛ workspace ليس Git worktree ولا يوجد workflow run ID أو artifacts. |

## قرار Gate 7

**NO-GO للإغلاق الكامل وProduction Candidate في هذه الجولة.** أصبح تدفق Android وtransport واختبارات instrumentation وworkflow CI موجوداً، لكن Phase 45 حسب معيار «actual runtime on device» لا يكتمل بلا instrumentation فعلي وlive E2E ضد backend مصادق عليه ومفاتيح نشر موثقة. لذلك **لن يُعاد Gate 46 كحكم إنتاجي ولن تُنشأ حزمة `CMS_Production_Release_v2.0.zip` في هذه الحالة**. Offline وOTP يبقيان معطلين افتراضياً. التقرير الجامع: `FINAL_ANDROID_OFFLINE_AND_RELEASE_REPORT.md`.
