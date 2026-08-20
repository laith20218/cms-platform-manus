# تدقيق تكامل Web/Backend للإنتاج — CMS

**التاريخ:** 20 أغسطس 2026  
**النطاق:** `student-web`، وواجهة ASP.NET Core، وعقود API، وPostgreSQL، وRedis المحلي، وDocker/Nginx/CI في حدود الفحص المتاح. لم يتضمن هذا التقرير تنفيذ Android أو Windows native runtime، ولا إعادة فتح بوابات Offline المغلقة أو المؤجلة.

> **الحكم التنفيذي: `PRODUCTION NO-GO`.**
>
> تكامل Web/Backend المحلي اجتاز البناء والاختبارات وإثبات PostgreSQL وhealth readiness بعد إصلاح عيوب حقيقية في العقود والتشغيل. لكن لا يوجد تشغيل Docker، أو smoke عبر compose/Nginx، أو R2/secret-store/TLS evidence، أو CI run مُصدَّر، أو Browser E2E ضد stack منشور. كما تبقى Phase 45 الخاصة بـAndroid غير مغلقة. لذلك لا يجوز إنشاء Release Candidate أو اعتبار الإنتاج جاهزاً.

## 1. حدود الأدلة والمنهجية

استند التدقيق إلى controllers ونداءات `apiClient`، ثم حُوّلت المطابقة إلى اختبارات HTTP حيث كان العيب أمنياً أو تعاقدياً. لا تعني المطابقة الساكنة وحدها نجاح DTO أو الاستيثاق أو rendering؛ لذلك فُصلت أدلة static وbuild وHTTP/PostgreSQL وruntime المحلي والتشغيل الخارجي.

| طبقة الدليل | النتيجة | الدليل القابل لإعادة التشغيل | الدلالة الصحيحة |
|---|---|---|---|
| API ↔ Web static reconciliation | **PASS** | `python3 scripts/audit_api_reality.py`؛ 104 endpoint و57 web calls و0 unmatched | تطابق method/route فقط، وليس Browser E2E |
| React routes static reconciliation | **PASS** | `python3 scripts/audit_web_routes.py`؛ 22 route و30 navigation targets و0 review | لا توجد route literal ميتة متبقية |
| Student Web build | **PASS** | `pnpm --filter @cms/student-web build` | TypeScript وVite/PWA يبنيان |
| Student Web tests | **PASS** | `pnpm --filter @cms/student-web test -- --run`؛ 11/11 | دليل Web unit/component فقط |
| Backend Release build | **PASS مع 6 warnings تاريخية** | `dotnet build ... -c Release --no-restore` | كل المشاريع تتجمع؛ التحذيرات غير الجديدة موثقة أدناه |
| Backend regression | **PASS** | `dotnet test ... -c Release --no-build`؛ 134/134 | يشمل suite الحالية واختبارات HTTP الجديدة |
| PostgreSQL Phase47 | **PASS** | EF `database update` ثم `psql` schema inspection | constraint والفهارس مطبقة على `cms_phase34_test` |
| Redis محلي | **PASS محلياً** | `redis-cli ... PING` = `PONG` | لا يثبت إعداد Redis الإنتاج |
| API local health | **PASS** | `/health/live` و`/health/ready` = 200 | يثبت PostgreSQL وRedis المحليين في readiness |
| Docker/Nginx/R2/CI production | **BLOCKED / EXTERNAL** | Docker غير متاح؛ لا remote/run id/credentials/TLS | لا يوجد دليل تشغيل أو نشر إنتاج |

## 2. عيوب التكامل المثبتة والإصلاحات

| المعرف | العيب المثبت قبل الإصلاح | الإصلاح المنفذ | الدليل بعد الإصلاح | الحالة |
|---|---|---|---|---|
| WEB-API-01 | `student-web` يستدعي `/favorites*` بينما لا يوجد controller؛ جدول `favorites` بلا unique partial indexes أو check target | أُضيف `FavoritesController` مقيد بالطالب + installation + signed entitlement؛ migration `Phase47WebBackendIntegrity` تضيف check وفهارس فريدة جزئية | `FavoritesHttpIntegrationTests`: 3/3؛ PostgreSQL يظهر القيد والفهارس | **PASS محلياً** |
| WEB-API-02 | `useContentProtection` يرسل `/security/log` غير الموجود مع severity/description حرين | أُضيف `/api/v1/security/events` عبر `ISecurityEventBatch` مع whitelist ثابت وrate-limit، وأعيدت كتابة hook بdebounce وpayload محدود | API matrix: `CONSUMED`; backend build/test PASS | **IMPLEMENTED — HTTP direct test pending** |
| WEB-API-03 | طلب أسئلة المحاضرة يرسل `lectureId` فقط، بينما controller كان يطلب `subjectId` قبل entitlement | يستنتج controller subject من lecture/exam على الخادم، ويرفض تعارض IDs، ثم يحقق entitlement قبل MediatR | اختبار HTTP `ProtectedQuestions_ForLectureWithoutSubjectId_DerivesScopeBeforeHandler` PASS | **PASS** |
| WEB-ROUTE-01 | `/favorites` و`/admin/reports` ظاهرين في navigation بلا routes | صفحة `FavoritesPage` مرتبطة بAPI؛ صفحة `AdminReportsPage` مرتبطة بـ`/admin/reports/summary`؛ routes lazy ومحمية | route reconciliation = 0 review؛ Web build PASS | **PASS static/build** |
| WEB-UI-01 | Dashboard وSidebar تعرضان subjects وأرقاماً وروابط hard-coded/غير canonical | Dashboard يستخدم `/stats/me`؛ Sidebar يستخدم navigation حقيقية فقط؛ Navbar search يحمل query والإشعارات route فعلية | Web build وVitest PASS | **PASS static/build؛ Browser E2E pending** |
| API-OPS-01 | `/health/ready` يفلتر tag `ready` لكن فحوص PostgreSQL/Redis لم تحمل tag، فيمكن أن يبدو healthy بلا checks | أُضيف tag `ready` إلى Npgsql وRedis health checks | API local `/health/ready` = 200 مع PostgreSQL/Redis جاهزين | **PASS محلياً** |
| API-DATA-01 | `completedPercentage` في `StatsHandlers` ثابتة دائماً عند صفر | تُحسب من unique answered questions مقابل published question bank، مع `ThenInclude(Subject)` صريح | Backend build/regression PASS | **PASS build/regression؛ data-seeded scenario pending** |
| DEPLOY-01 | Dockerfile وcompose يمرران `VITE_API_BASE_URL` بينما Axios يقرأ `VITE_API_URL`، وVite proxy داخل container يشير إلى localhost | وُحّد العقد على `VITE_API_URL`؛ أُضيف `VITE_DEV_API_PROXY_TARGET=http://api:8080` للتطوير containerized؛ default production `/api/v1` | Web build PASS؛ مراجعة Docker/Nginx static | **IMPLEMENTED — Docker smoke blocked** |

## 3. تكامل البيانات والتخزين المؤقت

طبقت migration `20260820135033_Phase47WebBackendIntegrity` على قاعدة الاختبار المحلية، بعد مراجعة عملياتها. أزالت الفهرس العام للطالب في `favorites` وأنشأت الفهرسين الفريدين الجزئيين لكل من `(student_id, question_id)` و`(student_id, library_file_id)`، وأضافت قيداً يمنع الصف الذي لا يستهدف سؤالاً أو ملفاً، أو يستهدف كليهما. أظهر فحص PostgreSQL وجود القيد والفهارس وتسجيل migration في `__EFMigrationsHistory`.

| التحقق | النتيجة |
|---|---|
| `20260820135033_Phase47WebBackendIntegrity` في migration history | **PASS** |
| `ck_favorites_exactly_one_target` | **PASS** |
| `ix_favorites_student_id_question_id` unique partial | **PASS** |
| `ix_favorites_student_id_library_file_id` unique partial | **PASS** |
| PostgreSQL local readiness | **PASS** |
| Redis 7.0.15 local `PONG` | **PASS محلياً** |
| AOF في Redis المحلي | **OFF**؛ compose production يطلب AOF لكن لم يُشغّل |

## 4. التشغيل والأمن

تستمر قيم `appsettings.json` الافتراضية دون أسرار: PostgreSQL وJWT production لا تُضبط في المصدر، وOffline flags جميعها `false`، وOTP يبقى `false` حسب القرار السابق. لا تُعامل هذه الحقيقة كجاهزية؛ بل تتطلب secret store وبيئة staging لإثباتها. فحص `verify-security-artifact.sh` نجح ولم يُظهر إدخال secrets إلى ملفات هذه الجولة.

بُنيت API وشُغلت محلياً بإعدادات اختبار عابرة لا تُسجّل في المصدر. أعاد `/health/live` و`/health/ready` حالة `200 Healthy`، وتضمن response correlation id ورؤوس الحماية. التحذير `Failed to determine the https port for redirect` ظهر في هذا smoke لأن Kestrel شغّل على HTTP محلي فقط؛ لا يمثل نجاح HTTPS ولا يجب نقله إلى production.

| عنصر تشغيلي | الحالة | شرط الإغلاق |
|---|---|---|
| PostgreSQL وRedis local readiness | **PASS** | — |
| Docker compose render/up | **BLOCKED** | Docker daemon/CLI قابل للتشغيل في CI أو host التشغيل |
| Nginx TLS وproxy end-to-end | **BLOCKED** | certs صالحة وcompose smoke وراء Nginx |
| R2 private bucket وsigned URL | **EXTERNAL BLOCKER** | R2 account/bucket/keys وverification من owner؛ لا تشارك الأسرار هنا |
| Production secrets (JWT, Redis, DB, WhatsApp, Firebase) | **EXTERNAL BLOCKER** | secret-store references وrotation/owner evidence |
| CORS actual domains | **EXTERNAL BLOCKER** | قيم staging/production صحيحة واختبار preflight من origins المعتمدة |
| CI workflow run/provenance | **EXTERNAL BLOCKER** | repository GitHub/remote وrun URL/artifacts؛ المصدر ليس Git worktree |
| Browser E2E عبر deployed stack | **BLOCKED** | URL staging، student/admin fixtures، وبيئة متكاملة |
| Android device/CI instrumentation | **EXTERNAL BLOCKER** | يبقى حسب Gate 7؛ غير داخل نطاق هذا الفحص |
| Windows native runtime | **NOT RUN** | خارج نطاق بيئة Linux الحالية |

## 5. تحذيرات البناء غير المغلقة

نجح Release build لكنه أظهر ستة تحذيرات موجودة في suite الاختبارات: `ISystemClock` deprecated في fixtures HTTP، احتمال null في `Guid.Parse` داخل fixture entitlement، وnullability warning في `OfflineHandlerSecurityTests`. هذه لا تمنع build أو 134/134 regression، لكنها يجب أن تُعالج ضمن debt منفصل قبل سياسة `warnings-as-errors` شاملة؛ لم تُخف أو تُعطل أي اختبارات لهذه الجولة.

## 6. Android وWindows: حدود الدمج

| العميل | ما تم تثبيته هنا | ما لم يثبت |
|---|---|---|
| Android | API contracts للمفضلة/security/events/questions متاحة ضمن API matrix؛ Offline flags ما زالت fail-closed | Android runtime، Keystore/FLAG_SECURE/Offline E2E وCI run؛ **Phase 45 لا تتغير** |
| Windows | يمكن استهلاك API contracts الموحدة من client لاحقاً | لا Windows build أو UI/native API run في هذه البيئة |

## 7. قرار الإصدار وخطة الاستئناف

**قرار Web/Backend المحلي:** الإصلاحات المثبتة اجتازت evidence المحلي وتزيل الفجوات المحددة في contracts والschema والمسارات.  
**قرار الإنتاج الكلي:** **NO-GO**. لا يوجد نشر أو Release Candidate.

يلزم قبل تغيير الحكم: تشغيل compose/Nginx مع PostgreSQL وRedis وAPI وWeb، إجراء Browser E2E للرحلات public/student/admin على staging، تزويد R2 وsecret-store وTLS/CORS evidence دون كشف قيم سرية، تشغيل CI وإرفاق provenance، ثم استكمال Android runtime barriers المثبتة في Gate 7 قبل Gate 46.

### خطة rollback

إذا ظهرت مشكلة في Phase47، فالrollback التقني هو target migration السابق عبر EF في بيئة staging فقط بعد نسخ احتياطي وفحص أثر حذف الفهارس والقيد. لا يُنفذ rollback على production من هذا التقرير. يمكن تعطيل surface Web الجديدة بإزالة routes من إصدار لاحق فقط إذا تطلب الأمر، لكن لا يجوز إعادة client إلى `/security/log` أو تجاوز entitlement للمفضلة.

## References

[1]: ../API_REALITY_MATRIX.md "API Reality Matrix"
[2]: ../WEB_ROUTE_RECONCILIATION.md "Web Route Reconciliation"
[3]: web_backend_full_backend_regression_2026-08-20.log "Backend regression log (134/134)"
[4]: web_backend_student_web_after_fix_build_2026-08-20.log "Student Web build log"
[5]: web_backend_student_web_after_fix_tests_2026-08-20.log "Student Web Vitest log"
[6]: web_backend_phase47_migration_apply_final_2026-08-20.log "Phase47 EF migration application log"
[7]: web_backend_local_api_smoke_server_2026-08-20.log "Local API health smoke log"
[8]: web_backend_security_artifact_check_2026-08-20.log "Security artifact verification log"
