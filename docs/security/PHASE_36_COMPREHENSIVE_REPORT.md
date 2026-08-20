# تقرير Phase 36 الشامل — Content Protection & Offline Packages

| الحقل | القيمة |
|---|---|
| المشروع | CMS — College Medical System |
| المرحلة | Phase 36 — Content Protection & Offline Packages |
| القرار التنفيذي | **NO-GO** |
| Offline default | **Fail-closed: جميع flags = false** |

## الحكم التنفيذي

تم ربط مسار `POST /api/v1/offline/download` بمسار إصدار حزمة مشفرة فعلياً بدلاً من إعادة الأسئلة كنص واضح. آخر تحقق بعد هذا الربط: Release build ناجح والحزمة الكاملة **71/71** ناجحة. يمر المسار عبر Signed Entitlement و`X-Installation-Id`/التوافق الرجعي `X-Device-Fingerprint` و`X-Idempotency-Key` قبل MediatR، ثم يستخدم `OfflinePackageLifecycleService` الذي يستدعي `IOfflinePackageCryptoService` ويخزن سجل الحزمة durable. الاستجابة الجديدة لا تحتوي على الأسئلة أو مفتاح AES الخام؛ وتحتوي فقط على Manifest وciphertext وtag وwrapped-key وKey Release Token opaque.

تمت إضافة KeyReleaseLog دائم وتسجيل أحداث `issued` و`revoked` داخل عملية الحفظ نفسها، كما طُبقت migrations الخاصة بسجل الحزمة وKeyReleaseToken وKeyReleaseLog على قاعدة PostgreSQL الاختبارية المحلية. مع ذلك، لا يمكن إصدار **GO** لأن اختبارات HTTP المطلوبة للإصدار المشفر والرفض الثمانية لم تُنفذ في هذه الجولة، كما أن flags الإنتاج الافتراضية بقيت false. وفق قاعدة الأدلة، الحالة الحالية **NO-GO** وليست إغلاقاً كاملاً.

## حالة حواجز P0

| الحاجز | الحالة | الدليل أو شرط الإغلاق |
|---|---|---|
| إصدار envelope مشفر من المسار الفعلي | **IMPLEMENTED — UNVERIFIED HTTP** | `OfflineHandlers.Handle(DownloadOfflinePackageCommand)` يستخدم lifecycle و`IOfflinePackageCryptoService`، لكن يلزم اختبار HTTP ناجح على controller الفعلي. |
| منع plaintext وraw AES key | **IMPLEMENTED — VERIFIED by code/build** | `OfflinePackageDto` يعيد Manifest وciphertext وtag وwrapped-key وKeyReleaseToken فقط؛ لا توجد `Questions` أو `EncryptionKey` في DTO الجديد. يلزم HTTP proof للتصنيف PASS. |
| Signed Entitlement + Device Binding + Ownership قبل الإصدار | **IMPLEMENTED — existing controller gate** | `RequireEntitlementAsync` يرفض غياب/فشل entitlement قبل MediatR، وlifecycle يربط الطالب والتثبيت. يلزم إثبات HTTP. |
| HTTP idempotency | **IMPLEMENTED — unit/service verified; HTTP unverified** | `X-Idempotency-Key` مطلوب، وunique `(student_id, idempotency_hash)` مع `IssueAsync` يعيد نفس PackageId. يلزم اختبار HTTP للتكرار. |
| KeyReleaseLog durable | **IMPLEMENTED — migration applied; HTTP unverified** | سجل `OfflineKeyReleaseLog` مع `issued` و`revoked`، وفهارس package/time وstudent/installation/action. release endpoint/event logging الكامل لم يُثبت HTTP. |
| Revoked package rejection | **PARTIAL** | `RevokeAsync` owner-bound ويغير `status` و`revoked_at`، لكن مسار Download لا يزال يحتاج فحص سجل revoked قبل إعادة envelope في اختبار HTTP صريح. |
| Offline feature safety | **PASS by default-deny** | flags `OfflineEnabled`, `OfflineAesGcmImplemented`, `OfflineManifestImplemented`, `OfflineKeyReleaseImplemented`, و`OfflinePackageIssuanceImplemented` تبقى false افتراضياً. |

## مصفوفة اختبارات HTTP المطلوبة

| السيناريو | النتيجة الحالية | الحالة المطلوبة للإغلاق |
|---|---|---|
| إصدار ناجح: Manifest + Ciphertext + Tag + Release Token | **NOT RUN** | WebApplicationFactory مع flags اختبارية true وبيانات entitlement/device، ثم تحقق من عدم وجود plaintext/raw key. |
| missing entitlement | **NOT RUN in Offline HTTP suite** | HTTP 401/403 قبل MediatR. |
| expired entitlement/package | **NOT RUN in Offline HTTP suite** | HTTP 401/403 قبل أي envelope أو token. |
| tampered Manifest/ciphertext | **NOT RUN in Offline HTTP suite** | HTTP 401/403 عند التحقق قبل release. |
| different device/installation | **NOT RUN in Offline HTTP suite** | HTTP 401/403 مع اختلاف `X-Installation-Id`. |
| out-of-scope | **NOT RUN in Offline HTTP suite** | HTTP 401/403 لموضوع خارج `AllowedSubjects`. |
| revoked package | **NOT RUN in Offline HTTP suite** | HTTP 401/403 بعد revoke، دون إصدار token. |
| idempotent download | **NOT RUN in Offline HTTP suite** | تكرار الطلب بنفس المستخدم/المحتوى/المفتاح يعيد نفس PackageId ولا يضيف صفاً جديداً. |

هذه الحالات لا يجوز تصنيفها PASS اعتماداً على قراءة الكود أو اختبارات الخدمة فقط.

## ما تم تنفيذه

| المجال | التنفيذ |
|---|---|
| AES-256-GCM | مفتاح 256-bit، nonce فريد، tag، وAAD مرتبط بالـManifest؛ اختبارات Crypto السابقة ناجحة. |
| Signed Manifest | HMAC-SHA256 canonical مع تحقق ثابت الزمن؛ التحريف مرفوض على مستوى الخدمة. |
| Key wrapping | wrapped key opaque؛ لا يعاد raw AES key. |
| Durable package lifecycle | `OfflinePackageRecord` مع ownership/device/version/expiry/status/ciphertext/tag/wrapped-key/token وunique idempotency hash. |
| Lifecycle service | إصدار idempotent وإبطال owner-bound، مع حفظ سجل issued/revoked. |
| HTTP binding | controller يطلب `X-Installation-Id` و`X-Idempotency-Key` ويفحص entitlement قبل إرسال command. |
| Default safety | Offline remains disabled by default، والمسارات القديمة/sync/list/delete fail-closed عند عدم اكتمال flags. |

## الأدلة التشغيلية

| الأمر | النتيجة الفعلية |
|---|---|
| `dotnet build apps/api/CMS.sln -c Release --no-restore --verbosity minimal` | **PASS** — Release build ناجح، مع تحذيرَي `ISystemClock` المعروفين في test authentication handler فقط. |
| `DOTNET_ROLL_FORWARD=Major dotnet test apps/api/src/CMS.Tests/CMS.Tests.csproj -c Release --verbosity minimal` | **PASS — 71/71**، صفر failed، صفر skipped، آخر مدة 5.3 ثانية بعد ربط Download وKeyReleaseLog وDTO envelope. |
| `dotnet-ef migrations add Phase36OfflineKeyReleaseLog ...` | **PASS** — migration مولدة من النموذج الحقيقي. |
| `dotnet-ef database update ...` | **PASS** — schema Phase36 محدثة على `cms_phase34_test` المحلي. |
| PostgreSQL integration | **PASS سابقاً — 1/1** على schema Phase36 السابقة؛ يلزم إعادة تشغيل مستقلة بعد KeyReleaseLog قبل أي GO. |
| NuGet/Trivy/pnpm | **PASS سابقاً** — لا نتائج ضعف معروفة في الأدلة المحلية السابقة؛ لا تُغلق مانع HTTP بهذه الفحوصات. |

## ملاحظات غير مانعة

تحذيرات `ISystemClock` في test authentication handler لا تفشل البناء أو الاختبارات، لكنها تستحق ترقية لاحقة إلى `TimeProvider`. كما أن client-side encrypted storage وwatermark خارج هذه الجولة Backend-only ولا ينبغي وصفهما كحماية مكتملة للعميل.

## القرار النهائي

> **NO-GO — Phase 36 لم تُغلق بعد. Offline يبقى غير قابل للتفعيل.**

السبب الوحيد المباشر المتبقي في هذا النطاق هو غياب مجموعة HTTP Integration المطلوبة التي تثبت الإصدار المشفر والرفض قبل إصدار البيانات في جميع الحالات الثمانية، إضافة إلى ضرورة إعادة تشغيل PostgreSQL integration بعد آخر migration. بعد تنفيذ WebApplicationFactory وتشغيل الحالات الثمانية بنجاح، وإعادة تشغيل Release build والحزمة الكاملة وPostgreSQL integration، يمكن إعادة تقييم القرار. لا يجوز تغيير flags الافتراضية إلى true قبل ذلك.
