# Gate 8 — Phase 46 / Release Candidate Decision

## القرار

> **DEFERRED — لا تُعاد Phase 46 ولا تُنشأ حزمة Release Candidate في هذا التشغيل.**

Phase 44 تملك دليل PostgreSQL كامل لمصفوفة منتجي التدقيق. أما Phase 45 فقد اجتازت backend HTTP وعقد Android JVM، وأصبح Android يملك coordinator وEncryptedFile store وHTTPS transport وOfflineExamActivity واختبارات instrumentation وworkflow API 35/KVM مُعداً. لكن محاولة runtime المحلية لم تصل إلى جهاز صالح: اكتُشف SDK، ثُبّت emulator وصورة Android 35، أُنشئ AVD، ثم فشل boot headless لغياب `/dev/kvm` وقيود TCG، وفشل أحدث `connectedDebugAndroidTest` بعد بناء login/session وتدفق Offline بـ `No connected devices`. ولم يُشغّل workflow لأن workspace ليس Git worktree ولا يملك remote أو run ID. كما لا توجد تهيئة مفاتيح نشر حقيقية أو live Android E2E ضد backend مصادق عليه. لذلك لا تتحقق قاعدة الدخول إلى Gate 46: «كل حاجز P0 يجب أن يكون PASS أو EXTERNAL معتمد ولا يمنع حكم الاستخدام المطلوب».

| شرط الدخول إلى Gate 46 | الحالة | سبب القرار |
|---|---|---|
| Phase 44 producer matrix وPostgreSQL runtime | PASS | موثق في `GATE_6_PHASE44_RUNTIME_AUDIT_2026-08-20.md`. |
| Offline backend HTTP وtrusted device-key contract | PASS محلياً | 11/11 HTTP و130/130 backend tests؛ موثق في Gate 7. |
| Android local ECDSA/RSA/AES contract | PASS على JVM | vector من backend يتحقق ويفك في Android JVM. |
| Android Keystore وFLAG_SECURE على جهاز فعلي | EXTERNAL — UNEXECUTED | توجد ADB/SDK الآن، لكن لا جهاز متصل؛ المحاكي المؤقت لم يكمل الإقلاع بغياب KVM و`connectedDebugAndroidTest` فشل صراحةً بـ `No connected devices`. |
| Android Offline use / answers / sync | IMPLEMENTED — UNVERIFIED ON DEVICE | `MainActivity` login/session وطلب الحزمة، coordinator وstore و`OfflineExamActivity` وHTTPS sync موجودة؛ لا Android E2E أو live backend session/entitlement/download مثبتة على جهاز أو CI. |
| مفاتيح نشر ECDSA/public-key pin | DEPLOYMENT PENDING | توجد مراجع بيئات فقط؛ لا تستخدم مفاتيح الاختبار كبديل لمفاتيح secret store والنشر. |
| Android status refresh transport | IMPLEMENTED — UNVERIFIED ON DEVICE | HTTPS transport وrefresh قبل open/sync موجودان ويفشلان إلى `UNKNOWN`؛ لا device/CI proof. |
| Android runtime CI | PREPARED — UNAPPLIED | workflow API 35 وKVM و`connectedDebugAndroidTest` مثبت SHA؛ لا Git remote أو run ID أو artifact results. |
| Browser Offline usable mode | FAIL-CLOSED intentionally | لا يكفي ذلك لتصنيف Offline عام كقابل للإطلاق. |

## المحظورات الناتجة

لا يصح في هذه الحالة إنشاء `CMS_Production_Release_v2.0.zip`، أو حساب SHA-256 باعتباره Release Candidate، أو إصدار حكم **Production Candidate / GO**. أي من ذلك سيخالف دليل الإغلاق ويخلط بين build/JVM proof وdevice runtime proof.

## شرط الاستئناف

يُستأنف Gate 46 فقط بعد رفع workflow وتشغيل instrumentation على جهاز Android فعلي أو CI emulator موثق ومكتمل الإقلاع، وتنفيذ رحلة Android حقيقية لا تستعمل mock Keystore تشمل login/session وentitlement وissuance والتحقق وفك المفتاح وAES decrypt والاستخدام offline والتقاط الإجابات وsync ورفض الإبطال/فشل النقل. ويلزم كذلك توفير مفاتيح النشر عبر secret store مع public SPKI مطابق في التطبيق، ثم إعادة full acceptance وGate 46. التقرير الجامع: `FINAL_ANDROID_OFFLINE_AND_RELEASE_REPORT.md`.
