# بوابة الأمن للإنتاج — Phase 34

## القرار الحالي

> **DECISION: BLOCKED — لا يصرح بالنشر الإنتاجي النهائي في هذه الحالة.**

اجتازت كل أدلة التنفيذ والتحقق المحلي المتاحة: build، tests، migration generation/application، frontend build/tests، artifact gate، dependency audits، Trivy، وsmoke محلي بعد PostgreSQL/Redis. الحظر ليس نتيجة فشل شيفرة محلي، بل نتيجة متطلبات إنتاجية لا يملك هذا التشغيل صلاحية تنفيذها أو إثباتها.

## معايير الدخول للإنتاج

| الفئة | الشرط | الحالة الحالية | دليل الرفع المطلوب |
|---|---|---|---|
| الشيفرة | حل API وweb يبنيان بنجاح | PASS | artifact من CI للالتزام المرشح. |
| الاختبار | tests الخلفية والأمامية وintegration ذات الصلة ناجحة | PASS محلي | CI .NET 9 الرسمي ونتائج tests المرفوعة. |
| schema | migration موجودة، model لا يملك pending changes، وطبقت على PostgreSQL | PASS محلي | سجل migration في staging ثم production change ticket. |
| الأسرار | لا أسرار في source/artifact | PASS | artifact gate من CI. |
| تدوير الأسرار | جميع أسرار الإنتاج المتأثرة دورت وأبطلت السابقة | BLOCKED | secret manager audit + change record من المالك. |
| supply chain | pnpm/NuGet/Trivy بلا HIGH/CRITICAL | PASS محلي | CI security-scan وSARIF CodeQL/Trivy. |
| الحاويات | تشغيل non-root وصور مبنية | CODE PASS / VERIFY BLOCKED | Docker build في CI وproof أن `USER cms` فعال. |
| النشر | deploy staging وhealth/authz smoke | BLOCKED | سجلات Railway/Vercel ونتائج smoke. |
| المراقبة | alerting/redaction/release tracking | BLOCKED | إثبات Sentry/monitoring configuration من المالك. |

## إجراء رفع الحظر

يبدأ مالك البنية بتدوير الأسرار في secret manager لكل بيئة، ثم يحدث المراجع في Railway وVercel وموفري R2 وRedis وPostgreSQL وFCM أو القنوات الأخرى حيث تنطبق. لا ينسخ السر الجديد إلى repository أو ملفات محلية. بعد نشر staging، يطبق migration idempotent ويراجع جدول history والفهارس، ثم ينفذ login وrefresh rotation وreuse logout وentitlement وIDOR و2FA وsigned URL smoke tests.

بعد ذلك يشغّل commit المرشح في CI الرسمي. يجب أن تنجح jobs: security artifact gate، backend-test تحت .NET 9، frontend-test، security-scan مع CodeQL وTrivy، وبناء صور Docker. يراجع مالك الأمان SARIF، ثم يوقع على change record قبل production deployment. بعد الإنتاج، يفحص `/health` وmetrics وauth failures، ويراقب أخطاء migration وRedis وR2 ضمن نافذة التغيير.

## ممنوعات الإغلاق

لا يسمح بتعطيل offline أو 2FA أو session validation أو rate limiting أو تحذير pending migration أو Trivy لتجاوز build. لا تعد قيمة placeholder أو database محلية أو JWT design-time دليلاً لتدوير secret. ولا يحل TODO أو تصريح شفهي محل evidence مسجل.

## توقيع القبول المطلوب

| الدور | المطلوب | الحالة |
|---|---|---|
| مالك البنية/الأسرار | تأكيد التدوير والإبطال | PENDING |
| مالك النشر | staging ثم production verification | PENDING |
| مالك المستودع | CI وCodeQL/SARIF pass | PENDING |
| مالك الأمن | قبول evidence وrisk sign-off | PENDING |
| المطور المرجعي | مراجعة الترحيل والوظيفة | PENDING |
