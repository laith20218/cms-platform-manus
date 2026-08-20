# مصفوفة التحقق — Phase 34

**حالة التحقق المحلي:** PASS  
**قرار Production Gate:** BLOCKED بحواجز خارجية موثقة

| المعرّف | شرط البوابة | الدليل القابل للتكرار | النتيجة | الملاحظة |
|---|---|---|---|---|
| V-01 | لا أسرار في artifact | `bash scripts/ci/verify-security-artifact.sh` | PASS | يشمل ملفات البيئة والمراجع المتحركة. |
| V-02 | بناء API Release | `dotnet build apps/api/CMS.sln -c Release --no-restore` | PASS | target `net9.0` بمرجع SDK محلي متوافق. |
| V-03 | اختبارات backend | `DOTNET_ROLL_FORWARD=Major dotnet test apps/api/src/CMS.Tests/CMS.Tests.csproj -c Release --no-build` | PASS | 39/39، تتضمن entitlement وIDOR وrevocation. |
| V-04 | تكامل session حقيقي | الاختبار `Category=PostgresIntegration` مع `CMS_PHASE34_TEST_POSTGRES` | PASS | PostgreSQL 16، create/rotate/replay/revoke. |
| V-05 | migration قابل للتوليد | `dotnet-ef migrations has-pending-model-changes` | PASS | لا تغييرات نموذج معلقة. |
| V-06 | migration قابل للتطبيق | `dotnet-ef database update` على `cms_phase34_test` | PASS | سجل migration موجود في `__EFMigrationsHistory`. |
| V-07 | مخطط جلسات واستحقاق مفهرس | استعلام `pg_indexes` المحلي | PASS | قيود unique وفهارس الجلسات/الأكواد/المنح. |
| V-08 | smoke للتطبيق | API محلي + `GET /health` | PASS | HTTP 200 بعد تشغيل PostgreSQL وRedis محليين. |
| V-09 | بناء الواجهة | `pnpm --filter @cms/student-web build` | PASS | PWA artifact مولّد. |
| V-10 | اختبارات الواجهة | `pnpm --filter @cms/student-web exec vitest run` | PASS | 7/7. |
| V-11 | تدقيق pnpm production | `pnpm audit --prod --audit-level high` | PASS | لا ثغرات معروفة. |
| V-12 | تدقيق NuGet | `dotnet list apps/api/CMS.sln package --vulnerable --include-transitive` | PASS | لا حزم vulnerable بعد pin للإصدار المعالج. |
| V-13 | Trivy vulnerabilities | `trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL` | PASS | 0 HIGH/CRITICAL vulnerabilities. |
| V-14 | Trivy secrets | التقرير نفسه | PASS | 0 HIGH/CRITICAL secrets. |
| V-15 | Trivy misconfiguration | التقرير نفسه | PASS | 0 HIGH/CRITICAL misconfigurations بعد non-root Docker fixes. |
| V-16 | SBOM frontend | `artifacts/sbom/student-web.cdx.json` | PASS | CycloneDX 1.5 متاح. |
| V-17 | CodeQL بعيد | job `security-scan` في GitHub Actions | BLOCKED | يتطلب تشغيل CI وصلاحية GitHub Security. |
| V-18 | صور Docker | build images ثم `id -u` داخلها | BLOCKED | Docker daemon غير متوفر محلياً؛ Dockerfiles تضبط `USER cms`. |
| V-19 | تدوير الأسرار الإنتاجية | سجل secret manager ووقت الإبطال | BLOCKED | يتطلب مالك أسرار الإنتاج. |
| V-20 | تحقق staging/production | نشر، migration، smoke وauthz checks | BLOCKED | لا توجد صلاحية نشر لهذه الجلسة. |

> لا يمكن استبدال صفوف V-17 إلى V-20 بملفات TODO أو قيم اعتماد وهمية. وهي شروط فعلية قبل أي إقرار بإغلاق الإنتاج.

## ملحق أدلة الملفات

| النوع | المسار |
|---|---|
| ترحيل EF | `apps/api/src/CMS.Infrastructure/Persistence/Migrations/20260818172242_Phase34SecuritySessionsAndEntitlements.cs` |
| SQL idempotent | `artifacts/migrations/phase34-idempotent.sql` |
| Trivy raw | `artifacts/security/trivy-phase34.json` |
| Trivy summary | `artifacts/security/trivy-phase34-summary.json` |
| SBOM | `artifacts/sbom/student-web.cdx.json` |
| اختبارات الجلسات | `CMS.Tests/Integration/SessionServicePostgresIntegrationTests.cs` |
| اختبارات entitlement/IDOR | `CMS.Tests/Unit/Services/EntitlementServiceTests.cs` |
