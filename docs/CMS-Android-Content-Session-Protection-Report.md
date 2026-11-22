# نظام حماية المحتوى والجلسات في تطبيق Android (CMS)

- **المستودع:** `laith20218/cms-platform-manus` — فرع `main`
- **المرجع (SHA):** `fded6f3` (دمج Pull Request #164 — Batch 4)
- **تاريخ التدقيق:** 2026-11-22
- **إعداد:** مستند من المستودع — غير تسويقي
- **النطاق بسطر واحد:** هذا التقرير يوثّق **ما هو منفَّذ فعلياً في الكود المصدري فقط** — لا يصف ميزات مخططة كمُسلَّمة، ولا يدّعي حماية غير موجودة.

> هذا التقرير يعكس حالة المستودع عند الالتزام `fded6f3` بتاريخ 2026-11-22 فقط. أي تغيير لاحق على `main` غير مشمول.

---

## 1. الملخص التنفيذي

يحمي تطبيق Android الطالب اليوم، كما يظهر من الكود المصدري على `main` عند `fded6f3`، أربعة محاور متكاملة: **غلاف WebView مُحصَّن** يقيد التصفح على أصل HTTPS واحد مُدرج في قائمة سماح صريحة ويمنع لقطات الشاشة عبر `FLAG_SECURE`؛ **جلسة أصلية مشفَّرة** تخزّن رموز الوصول والتجديد في `EncryptedSharedPreferences` دون تخزين كلمة المرور مطلقاً؛ **كاش وسائط مشفَّر** (Batch 4) يخزن ملفات المكتبة على الجهاز مشفَّرة بـ AES-GCM مع فهرس مشفَّر، وحصة سقفها 1 GiB مع إخلاء LRU، ونافذة صلاحية أوفلاين 72 ساعة مرتبطة بآخر تأكيد استحقاق من الخادم؛ و**جسر JS واحد مدقَّق** (`window.CmsNative`) من 11 دالة فقط، كلها محمية بحارس أصل يستعلم نفس قائمة السماح التي تحكم التصفح، ولا يمرر عبره أي رمز دخول أو مسار ملفات.

وفي المقابل، لا يدّعي التطبيق — ولا هذا التقرير — حماية غير موجودة: **لا يوجد DRM ولا Widevine** في الكود (المشغّلات تعرض المحتوى المستحق للطالب كصور/صوت عادي داخل أنشطة `FLAG_SECURE`)؛ **لا تُحقن أي رموز في JavaScript** (استراتيجية D1 الموثقة في `docs/android-shell-roadmap.md`)؛ **تثبيت الشهادات (pinning) خطاف موجود لكن غير مفعَّل** لأن `OFFLINE_API_SPKI_PINS_BASE64` فارغ في البناءات الحالية؛ **حزم الأسئلة offline (security/\*) gated OFF** عبر `OFFLINE_TRUSTED_CLIENT_IMPLEMENTED=false`؛ وفيديوهات YouTube وحلقات المقررات **ليست قابلة للتخزين** لعدم وجود بايتات عبر واجهة الـ API نفسها. كل هذه الحدود موثقة في الفصل 12 بصيغة هندسية لا تسويقية.

---

## 2. خريطة المكوّنات على المستودع

جميع المسارات أدناه نسبية إلى `apps/android/app/src/main/java/com/cms/student/` ما لم يُذكر خلاف ذلك.

| المسار | المسؤولية | الدفعة (كما في roadmap) |
|---|---|---|
| `shell/ShellActivity.kt` | نشاط LAUNCHER؛ يضبط `FLAG_SECURE`؛ يستضيف WebView ويحمل الجسر وشاشة الأخطاء وزر الكتالوج الأوفلاين | Batch 1 (+ Batch 3/4) |
| `shell/WebViewHost.kt` | كل إعدادات WebView وقرارات التصفح؛ إرفاق الجسر بعد التأمين | Batch 1/3 |
| `shell/ShellUrlPolicy.kt` | قائمة سماح HTTPS: نفس المضيف والمنفذ فقط؛ رفض بروتوكولات/مضيفين/اعتمادات مضمنة | Batch 1 |
| `session/InstallationIdProvider.kt` | توليد UUID v4 مرة واحدة لكل تثبيت | Batch 1 |
| `session/EncryptedInstallationIdStore.kt` | تخزين الهوية في `EncryptedSharedPreferences` (ملف `cms_installation_identity`) | Batch 1 |
| `session/TokenStore.kt` | رموز access/refresh الأصلية في `EncryptedSharedPreferences` (ملف `cms_native_session`)؛ لا كلمات مرور | Batch 2 |
| `session/NativeSessionManager.kt` | آلة حالة دورة حياة الجلسة + خطاف `onTokensCleared` لمسح الكاش | Batch 2 (+4) |
| `security/OfflineRequestHeaders.kt` | المكان الوحيد لبناء هيدرات `Authorization` / `X-Installation-Id` / `X-Device-Fingerprint` | Batch 2 |
| `security/HttpsOfflineClients.kt` | عميل HTTPS للـ login/refresh/حزم offline (no redirects, no caches, pinning اختياري) | سابق + Batch 2 |
| `bridge/CmsJsBridge.kt` | `window.CmsNative`: 4 دوال هوية (Batch 3) + 7 دوال كاش (Batch 4) بحارس أصل | Batch 3/4 |
| `bridge/CmsNativeCacheApi.kt` | واجهة سطح الكاش الذي ينفذه `MediaCacheService` | Batch 4 |
| `media/MediaCacheService.kt` | المنسّق: آلة حالة التنزيل/الفتح/الاستحقاق/الحصة/المسح | Batch 4 |
| `media/EncryptedMediaCacheStore.kt` | `EncryptedMediaFileStore` (كائنات) + `EncryptedMediaCachePersistence` (الفهرس) بـ EncryptedFile/Keystore | Batch 4 |
| `media/CacheIndex.kt` | فهرس وصفيات الملفات + `lastConfirmedAt`/`lastAccessAt` (مفاتيح LRU والنافذة) | Batch 4 |
| `media/CacheQuota.kt` | مخطِّط إخلاء LRU تحت سقف 1 GiB دون مس إدخالات محمية | Batch 4 |
| `media/CachePolicy.kt` | الثوابت: السقف، نافذة 72 ساعة، المهلات، أنماط UUID، رموز الحالة | Batch 4 |
| `media/MediaContentTransport.kt` | `HttpsMediaContentTransport`: التنزيل + إصدار الاستحقاق + فحص HEAD محدود | Batch 4 |
| `media/CacheProgressBus.kt` | ناقل تقدم داخلي (غير مرئي لـ JS) لتحديث شاشة الكتالوج | Batch 4 |
| `media/NativeMediaOpener.kt` | إطلاق المشغّل الأصلي المناسب لكل نوع، داخل التطبيق فقط | Batch 4 |
| `media/MediaViewerActivity.kt` + `PdfViewActivity.kt` / `TextReaderActivity.kt` / `AudioPlayerActivity.kt` / `VideoPlayerActivity.kt` / `ImageViewerActivity.kt` | مشغّلات داخلية، كلها ترث `FLAG_SECURE` | Batch 4 |
| `media/OfflineCatalogActivity.kt` | شاشة «وضع بدون إنترنت» | Batch 4 |
| `media/ConnectivityNetworkAvailability.kt` / `MediaFileStore.k` (واجهة + `PlainMediaFileStore` للاختبار فقط) | فحص الاتصال؛ واجهة مخزن الكائنات | Batch 4 |
| `CmsApplication.kt` | الرسم البياني للتبعيات + ربط الجلسة بمسح الكاش + مسارات login/restore/refresh | Batch 0–4 |
| `MainActivity.kt` / `OfflineExamActivity.kt` | مدخل الدخول المحلي (هاتف/كلمة مرور) ووحدة الامتحان الأوفلاين — لم يعودا LAUNCHER | سابق (أُبقيا) |
| `security/*` (11 ملفاً) | نواة حزم الأسئلة offline المشفَّرة والموقعة — معطَّلة في البناءات الحالية | مراحل سابقة |
| `apps/student-web/src/utils/native-bridge.ts` | المُوصِّل الوحيد لجسر الهوية (feature-detect) | Batch 3 |
| `apps/student-web/src/utils/native-cache.ts` | المُوصِّل الوحيد لسطح الكاش + خريطة رسائل الرفض العربية + حلقة الانتظار | Batch 4 |
| `apps/student-web/src/utils/index.ts` (`getOrCreateInstallationId`) | يفضّل الهوية الأصلية داخل الغلاف ويحافظ على `web-<32hex>` في المتصفح | Batch 3 |
| `apps/student-web/src/features/library/DocumentViewer.tsx` | خطاف فتح الملف عبر ensureLocal→openLocal داخل الغلاف فقط | Batch 4 |
| `docs/android-shell-roadmap.md` | وثيقة الدفعات 0–4 وحالتها | متجددة |

المجلدات `shell/` و`session/` و`bridge/` و`media/` و`security/` **كلها موجودة على main** — لا يوجد مكوّن موصوف هنا «غير موجود»؛ ما هو غير موجود يُذكر صريحاً (FCM، DRM، تفعيل pinning) في الفصول التالية.

---

## 3. غلاف التطبيق و WebView

`ShellActivity` (`shell/ShellActivity.kt`) هو نقطة الدخول الباردة للتطبيق: بيان `MAIN`/`LAUNCHER` في `apps/android/app/src/main/AndroidManifest.xml` مرتبط به وحده، بينما فقد `MainActivity` فلتر الإطلاق وصار `exported="false"` (يُفتح بقصد صريح فقط). أول ما يفعله النشاط في `onCreate` هو:

```kotlin
window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
```

وهو ما يمنع لقطات الشاشة وصور «التطبيقات الأخيرة» لكامل تجربة الطالب — نفس العلم مضبوط في `MainActivity` و`OfflineExamActivity` وكل مشغّلات الوسائط عبر القاعدة المشتركة `MediaViewerActivity.onCreate`.

إعدادات WebView الفعلية (كما في `shell/WebViewHost.kt::attach()`):

| الإعداد | القيمة في الكود |
|---|---|
| `javaScriptEnabled` | `true` (تطبيق SPA) |
| `domStorageEnabled` | `true` (جلسة student-web في localStorage/sessionStorage) |
| `allowFileAccess` / `allowContentAccess` | `false` / `false` |
| `setSavePassword` | `false` |
| `allowFileAccessFromFileURLs` / `allowUniversalAccessFromFileURLs` | `false` / `false` |
| `setGeolocationEnabled` | `false` |
| `javaScriptCanOpenWindowsAutomatically` / `setSupportMultipleWindows` | `false` / `false` |
| `mixedContentMode` | `MIXED_CONTENT_NEVER_ALLOW` |
| أخطاء TLS | `handler.cancel()` دائماً — fail closed |
| التصفح | كلا زوجَي `shouldOverrideUrlLoading` يرجعان `!urlPolicy.isAllowed(url)` — أي تنقّل غير مسموح يُحذف بصمت: لا شريط عناوين ولا متصفح خارجي |

قائمة السماح (`shell/ShellUrlPolicy.kt`): تُبنى من `BuildConfig.STUDENT_WEB_BASE_URL` وتقبل **فقط** عناوين URL المطلقة بنظام HTTPS على المضيف نفسه (والمنفذ الصريح إن وُجد)، وترفض URL غير المطلقة أو الفارغة أو الحاملة لاعتمادات مضمنة (`uri.rawUserInfo != null`). إذا كان عنوان الأساس غير صالح، تُبنى سياسة `allowNothing()` (تحجب كل شيء) وتظهر شاشة خطأ الإعداد العربية بدل تحميل أي محتوى — وهذا سلوك «فشل مقفل» مقصود. رصدت الجسّات (greps) على الشجرة: `FLAG_SECURE` في 5 ملفات أنشطة، و`shouldOverrideUrlLoading` في `WebViewHost.kt` فقط.

المستند (`AndroidManifest.xml`) يضيف طبقة أصلية: `allowBackup="false"`، `usesCleartextTraffic="false"`، و`network_security_config.xml` يرفض cleartext؛ الأذونات المطلوبة هي `INTERNET` و`ACCESS_NETWORK_STATE` (فحص الاتصال للكاش) فقط — لا أذونات حساسة أخرى. رسائل الأخطاء عربية أولاً من `res/values/strings.xml` مع fallback إنجليزي في `values-en/`: «الإعداد غير مكتمل»، «تعذّر الاتصال…»، وزر «إعادة المحاولة» يعيد تحميل الصفحة. عند فشل الشبكة تحمل شاشة الخطأ زر «وضع بدون إنترنت (المحتوى المحفوظ)» يفتح `OfflineCatalogActivity` — لا «وضع أوفلاين زائف» في أي مكان من الكود.

---

## 4. هوية التثبيت (Installation Id)

الهوية (`session/InstallationIdProvider.kt`) هي UUID v4 يُولَّد مرة واحدة لكل تثبيت ويُعاد استخدامها (دالة `@Synchronized installationId()`: قراءة، وإلا توليد + كتابة مع فحص commit). التخزين في `session/EncryptedInstallationIdStore.kt` عبر `EncryptedSharedPreferences` بنفس الملف والمفتاح اللذين استخدمهما الكود قبل دفعة الغلاف (`cms_installation_identity` / `installation_id`) بحيث تحافظ التثبيتات القديمة على هويتها عبر الترقية. مكدس التشفير كما في الكود: `MasterKey` بمخطط `AES256_GCM`، ومفاتيح بـ `AES256_SIV` وقيم بـ `AES256_GCM` — أي أن الهوية **مشفَّرة على القرص**.

وصول الهوية إلى JavaScript محصور بمسار واحد: دالة الجسر `getInstallationId()` (`bridge/CmsJsBridge.kt`) التي لا تُرجع UUID إلا إذا كان أصل الصفحة الحالية مسموحاً؛ وإلا تُرجع سلسلة فارغة. لا تُحقن الهوية في أي URL أو cookie. من جهة الويب، `apps/student-web/src/utils/index.ts::getOrCreateInstallationId()` يقرأ الهوية الأصلية أولاً عبر `native-bridge.ts` عندما يكون التطبيق داخل الغلاف — فتُرسل مُعتبرات `X-Installation-Id` و`X-Device-Fingerprint` من مُعتبر axios (`src/services/api-client.ts`) **بقيمة الهوية الأصلية نفسها** التي ترسلها طبقة Kotlin — تعادل الهيدرات بين الويب والأصلي — بينما يحتفظ بناء المتصفح بهوية `web-<32hex>` كما هي دون أي تغيير.

---

## 5. الجلسات الأصلية (Native session)

**TokenStore** (`session/TokenStore.kt`): الواجهة تعرّف `save/read/clear` والتنفيذ `EncryptedTokenStore` يخزّن **ثلاث قيم فقط**: `studentId` و`accessToken` و`refreshToken` في ملف `EncryptedSharedPreferences` مستقل (`cms_native_session`) بنفس مكدس تشفير الهوية. كلمة المرور **لا تُخزَّن في أي مكان** — تُستخدم في نداء الدخول وتُنسى؛ والدالة `StoredNativeSession.toString()` تُرجع النموذج مع `<redacted>` للرمزين حتى لا يتسربا إلى سجلات أو تقارير انهيار. القيم تُكتب فقط بعد نجاح login أو refresh (`commit()` ويُفحص رجوعها).

**NativeSessionManager** (`session/NativeSessionManager.kt`) — آلة حالة نقية قابلة للاختبار على JVM:

| الحدث | السلوك في الكود |
|---|---|
| نجاح الدخول | `onLoginSucceeded` → حفظ الرموز (`check(store.save(...))`) |
| 401 (رفض auth) | `onAuthRejected` → `store.clear()` + إطلاق `onTokensCleared` |
| خروج صريح | `onLoggedOut` → نفس المسح + الخطاف |
| موت العملية | `restore(refresh)` → تدوير الرموز عبر `/auth/refresh`؛ 401 → مسح؛ فشل شبكة عابر → استعادة «غير مُتحقَّقة» مع إبقاء الرموز (فشل مقفل صادق) |
| رفض refresh 401 | مسح + الخطاف (رموز ميتة لا تبقى) |

**Batch 4 أضاف الخطاف** `onTokensCleared` الذي يُطلق في **كل** مسار يمسح الرموز — وفي `CmsApplication.kt` السطر:

```kotlin
private val sessionManager by lazy { NativeSessionManager(tokenStore) { mediaCacheService.wipe() } }
```

يربط المسح بمسح كاش الوسائط كله (الملفات المشفرة + الفهرس) في نفس اللحظة (انظر الفصل 8).

**OfflineRequestHeaders** (`security/OfflineRequestHeaders.kt`) — المكان الوحيد لهيدرات كل طلب أصلي:

| الهيدر | القيمة | ملاحظة من الكود |
|---|---|---|
| `Authorization` | `Bearer <accessToken>` | في الطلبات المُصدَّقة فقط (`authenticated(session)`) |
| `X-Installation-Id` | UUID التثبيت | دائماً؛ الـ rate limiter يفتح عليه |
| `X-Device-Fingerprint` | نفس UUID | توافق معكوس: `/auth/refresh` وعدة وحدات تقرأه (`X-Installation-Id ?? X-Device-Fingerprint`) |

`installation(id)` يُرسل حتى مع login/refresh غير المُصدَّقين — مطابقة لتصرُّف مُعتبر student-web كما يوثق تعليق الملف.

**HttpsOfflineClients.kt** ينفذ `login` (POST `auth/login` مع body فيه `deviceFingerprint` و`deviceName`) و`refresh` (POST `auth/refresh` مع `refreshToken`) عبر `HttpsURLConnection` بلا redirects وبلا caches، مع خطاف pinning اختياري — نفس قواعد التأمين التي يتبعها ناقل الوسائط لاحقاً.

**علاقة MainActivity بالغلاف:** `MainActivity` هو «وحدة التحكم الأوفلاين» القديمة — شاشة دخول هاتف/كلمة مرور تستدعي `CmsApplication.loginStudent()`؛ خروجها `clearAuthenticatedStudent()`؛ وعند الإنشاء يستعيد الجلسة عبر `restoreNativeSession()`. لم يعد نقطة الإطلاق، لكنه صار **مدخل الدخول المحلي** الذي تعرضه شاشة «وضع بدون إنترنت» لمن يريد تنزيل محتوى دون جلسة أصلية (راجع الفصل 8) — نفس بيانات الحساب التي يستخدمها الطالب في WebView ونفس نقطة نهاية `/auth/login`.

---

## 6. استراتيجية جلسة WebView (D1)

الاستراتيجية كما هي موثقة في الكود (`session/TokenStore.kt` تعليق الرأس: «WebView session strategy D1: the shell does not inject any token into student-web») وفي roadmap (دفعة Batch 2): **لا يحقن الغلاف أي رمز داخل WebView**. يحمّل الغلاف عنوان `STUDENT_WEB_BASE_URL` الصريح، ويسجّل الطالب الدخول داخل WebView نفسها، ويبقى لتطبيق student-web إدارة جلسته الخاصة في `localStorage`/`sessionStorage` (المفتاحان `cms-access-token` / `cms-refresh-token` كما يوثق الـ roadmap استناداً إلى `AuthProvider.tsx` و`api-client.ts`).

سبب هذا الاختيار، كما دوّنته Recon الدفعة الثانية (منسوباً في roadmap): لا توجد cookie من نوع HttpOnly يمكن وضعها؛ تمرير الرموز في query string يسرّب أسراراً (ممنوع)؛ وحقن الرموز إلى JS يتطلب `evaluateJavascript` — أي جسر فعلي كان خارج نطاق الدفعة، وحين ظهر الجسر في Batch 3 قُصر عمداً على دوال قراءة فقط **لا تشمل أي مُوصل رمز** (`getAccessToken`/`getRefreshToken` غير موجودين في `CmsJsBridge.kt` — ينص تعليقه «Forbidden and absent»).

النتيجة الهندسية المترتبة، موثقة بأمانة في `media/MediaCacheService.kt`: جلسة WebView **غير قابلة للوصول من Kotlin** عمداً، لذا التنزيلات في Batch 4 تتطلب جلسة أصلية (TokenStore). عند غيابها يرد `ensureLocal` بالرمز `denied_native_session` — لا تزييف ولا تلميع؛ وتعرض شاشة الكتالوج زر «تسجيل الدخول المحلي» كحل تحميل صادق (D1 bootstrap).

---

## 7. جسر CmsNative

الجسر الوحيد بين student-web وKotlin هو `window.CmsNative` (`bridge/CmsJsBridge.kt`)، يُرفق عبر `WebViewHost.attachJsBridge()` — `addJavascriptInterface(bridge, "CmsNative")` — **بعد** تطبيق كل إعدادات التأمين، ولا توجد أي واجهة ثانية في أي مكان من الشجرة (`@JavascriptInterface` موجود في 3 ملفات فقط: المضيف والجسر واختباره).

الجدول التالي هو **كل** الدوال `@JavascriptInterface` الموجودة فعلاً (يُتحقق منها باختبار انعكاس جرد في `CmsJsBridgeTest`):

| الدالة | ترجع عند الأصل المسموح | القيمة الآمنة عند أصل غير مسموح |
|---|---|---|
| `hasNativeShell()` | `true` | `false` |
| `getPlatform()` | `"android"` | `""` |
| `getAppVersion()` | versionName من PackageManager | `""` |
| `getInstallationId()` | UUID التثبيت | `""` |
| `listCached()` | مصفوفة JSON من صفوف آمنة فقط: `contentId/type/title/bytes/createdAt/lastAccessAt` | `"[]"` |
| `ensureLocal(contentId, type, hintsJson)` | رموز حالة: `started/ready/downloading/denied_*…` | `denied_origin` |
| `openLocal(contentId)` | `opened/missing/denied_stale/denied_auth/denied_native_session/error` | `denied_origin` |
| `cacheStatus(contentId)` | `queued`/`downloading:<pct>`/`ready`/`denied_auth`/`error:<code>`/`absent` | `absent` |
| `cancelDownload(contentId)` | `canceled/not_downloading/absent` | `absent` |
| `removeCached(contentId)` | `removed/absent` | `absent` |
| `clearCache()` | `cleared` | `denied_origin` |

**حارس الأصل:** كل دالة تستدعي `isOriginAllowed()` التي تحل URL الصفحة الحالية عبر `currentUrl()` و تستشير `ShellUrlPolicy.isAllowed` — نفس قائمة سماح HTTPS التي تحكم التصفح. أي أصل غريب أو مخطط غير HTTPS أو اعتمادات مضمنة أو منفذ شاذ أو URL فارغ يجعل الدالة ترجع القيمة الآمنة الافتراضية: لا استثناءات تصل JS (`guarded` بـ `runCatching` يُرجع دائماً fallback)، لا قيم جزئية، ولا وصول لأي منطق كاش خارج الأصل. مدخلات الطالب (`contentId`) تُقص وتُرفض إن تجاوزت 256 حرفاً أو خرجت عن نمط UUID (`CachePolicy.CONTENT_ID_PATTERN`) — ما يحجب حِيَل المسارات.

**نموذج التهديد** (من تعليق الصنف): لو نجح XSS داخل student-web فالسطح المقروء يظل: هوية التثبيت (معرّف ربط جهاز معتم، ليس بيانات دخول) + النسخة + بيانات وصف الكاش فقط — **لا بايتات محتوى، لا مسارات ملفات** (`storedFileName`/`sourcePath` لا تعبر الجسر إطلاقاً)، **لا URLs المصدر، لا رموز**. سطح الأفعال يستطيع ملء الكاش بمحتوى الطالب نفسه (الخادم يعيد التحقق من جلسته الأصلية واستحقاقه الموقَّع في كل تنزيل)، حرق حصة الـ rate-limit لكل تثبيت، أو حذف صفوف — إزعاج لا تصعيد: لا انتحال شخصية، لا وصول لمحتوى طالب آخر، لا تسريب رمز، لا تنفيذ سلاسل، لا قيادة التصفح. `openLocal` لا يفتح إلا معرفات موجودة أصلاً في الكاش. الممنوع والغائب: `getAccessToken`/`getRefreshToken`، واجهات كلمة المرور، مسارات ملفات خام، جلب URL اعتباطي (الرابط يستخرجه الكود الأصلي نفسه من UUID — لا يُجلب URL من JS أبداً)، `eval`، ومقاصد المشغّلات الخارجية.

---

## 8. كاش الوسائط المشفّر (Batch 4)

موجود بالكامل على `main` عند `fded6f3` (مجلد `media/` من 17 ملفاً + `CmsNativeCacheApi`). أدناه تدفقه الفعلي من الكود.

### 8.1 تدفق ensureLocal → تنزيل → تشفير → فهرس → openLocal

1. `ensureLocal(contentId, type, hints)` (`media/MediaCacheService.kt`): تحقق UUID + نوع من `MediaKind`؛ إذا كان العنصر **جاهزاً وضمن نافذة التأكيد** يرد `ready`؛ إذا كانت الشبكة مقطوعة: جاهز داخل النافذة → `ready`، وإلا `denied_offline`؛ إذا لم توجد جلسة أصلية → `denied_native_session` (D1). وإلا: يُنشئ `DownloadState` وينشر `QUEUED` على `CacheProgressBus` ويُجدول التنزيل على منفِّذ أحادي الخيط ويرد `started`.
2. على المنفِّذ `runDownload`: يطلب رمز استحقاق موقَّعاً من `POST entitlements/issue` (مُصدَّق بالرموز الأصلية؛ يُخزَّن مؤقتاً في العملية ويُجدَّد قبل 60 ثانية من انتهائه — `HttpsMediaContentTransport.currentEntitlementToken`) ثم `GET {base}/library/{contentId}/content` بالهيدرات: `Authorization: Bearer` + `X-Installation-Id` + `X-Device-Fingerprint` + `X-Entitlement`، ويدفّع البايتات مباشرة إلى `MediaFileStore.openOutput` — أي **تشفير أثناء البث** (المنفذ الحقيقي: `EncryptedFile`).
3. عند النجاح: `CacheIndex.put` (فهرس مشفَّر) ثم `trimToQuota` (إخلاء LRU) ثم نشر `READY`. عند إخفاق 401: **محاولة تدوير واحدة** عبر `sessionRefresher` (`/auth/refresh`)؛ رفض التدوير يستدعي `onAuthDead` فيُمسَح الكاش كله مع الجلسة. 403 = إنكار استحقاق لهذا الطالب (`denied_auth`) دون مسح. الإلغاء تعاوني: `cancelDownload` يرفع علم `canceled` ويُفحص بين الدفعات (`MediaDownloadCanceledException`) وتُحذف الكتابة الجزئية فوراً (`fail` يحذف الملف الجزئي دوماً).
4. `openLocal(contentId)`: إن كان متصلاً: يتحقق من الجلسة ثم فحص استحقاق **HEAD محدود بـ 2.5 ثانية** (`CachePolicy.VERIFY_TIMEOUT_MILLIS`) على نفس رابط المحتوى بالهيدرات الكاملة؛ سماح → `index.confirm(now)` (تجديد `lastConfirmedAt`) ثم فتح المشغّل الأصلي؛ إنكار → `denied_auth`؛ تعذر الوصول → تطبيق قاعدة الأوفلاين. إن كان غير متصل (أو تعذر الفحص): يفتح فقط إذا كان `lastConfirmedAt` **ضمن 72 ساعة** (`CachePolicy.CONFIRMATION_WINDOW_HOURS`)، وإلا `denied_stale` برسالة عربية تطلب إعادة الاتصال.

### 8.2 التشفير والحصة والنافذة

| البند | القيمة المشفَّرة في الكود |
|---|---|
| مكدس التشفير | AndroidX `EncryptedFile` + Keystore `MasterKey` بمخطط `AES256_GCM`، ملفات بمخطط `EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB` (`media/EncryptedMediaCacheStore.kt`) |
| الكائنات | `filesDir/media-cache/{contentId}.bin` — دليل خاص بالتطبيق، كتابة ذرّية (tmp ثم rename)، والملف المؤقت يُحذف دائماً |
| الفهرس | `filesDir/media-cache/index.json` **مشفَّر بنفس المكدس** — مقصود: `lastConfirmedAt` يقود نافذة الأوفلاين، وفهرس قابل للتحرير لِمستخدم الجهاز يمدّد الوصول الأوفلاين؛ AES-GCM يعطي سرية + سلامة |
| الحصة | `CachePolicy.MAX_CACHE_BYTES = 1_073_741_824` (1 GiB بالضبط) |
| الإخلاء | `CacheQuota.planEviction`: LRU حسب `lastAccessAt`؛ الإدخالات قيد التنزيل/الفتح والكائن الجديد **محمية لا تُمس**؛ خطة غير قابلة للتقليم → رفض التنزيل برمز `quota` وحذف الكائن الجديد |
| نافذة الأوفلاين | 72 ساعة من آخر تأكيد استحقاق من الخادم (تنزيل أو فحص 2xx عند الفتح) |
| المتجر الصريح للنصوص | `PlainMediaFileStore` **لاختبارات JVM فقط** — لا يُوصل في بناء الإنتاج أبداً (تعليقه: G6 يحظر كاخ وسائط نصّي على الجهاز) |

### 8.3 المسح عند الخروج

`MediaCacheService.wipe()` (متزامن `@Synchronized`): يرفع إلغاء كل التنزيلات الجارية، يمسح `CacheIndex.clear()` و`fileStore.deleteAll()`. يُستدعى من: (أ) الخطاف `onTokensCleared` في `NativeSessionManager` — يشتعل عند **logout** و**رفض auth (401)** و**رفض refresh** كما في `CmsApplication.kt`؛ (ب) دالة الجسر `clearCache`؛ (ج) زر «مسح كل الملفات المحفوظة» في الكتالوج. لا تنجو أي جلسة وسائط من جلسة ميتة.

### 8.4 المشغّلات الأصلية وشاشة «وضع بدون إنترنت»

كل المشغّلات أنشطة داخلية `exported="false"` في المانيفست، تُطلق عبر `NativeMediaOpener` بقصد `FLAG_ACTIVITY_NEW_TASK` من سياق التطبيق — **لا مشغّل خارجي ولا مشاركة ملف ولا `file://`** (تعليق القاعدة في `MediaOpenContract`/`NativeMediaOpener`). القاعدة المشتركة `MediaViewerActivity` تضبط `FLAG_SECURE` لكل مشغّل، وتُمرَّر البيانات عبر extras صغيرة فقط (معرّف/عنوان/نوع) — البايتات تُفكَّك داخل المشغّل من المخزن المشترك، حماية من TransactionTooLarge.

| النوع | المشغّل | كيف يفتح الملف المشفَّر |
|---|---|---|
| PDF (مسار الدمج الحرج) | `media/PdfViewActivity.kt` | فك تشفير إلى ملف مؤقت خاص في دليل cache للتطبيق يُحذف في `onDestroy`؛ إطار العمل `PdfRenderer`؛ صفحات Bitmap على منفِّذ خلفي مع `LruCache` (12 صفحة) في ListView عمودي |
| txt | `media/TextReaderActivity.kt` | عمود TextView |
| html | نفس `TextReaderActivity` | WebView مُحصَّن: **JavaScript مُطفأ**، عرض ثابت للدروس التفاعلية (تخفيض موثّق) |
| صوت | `media/AudioPlayerActivity.kt` | `MediaPlayer` + شريط تقدم + أزرار عربية |
| فيديو (غير YouTube) | `media/VideoPlayerActivity.kt` | `VideoView` + `MediaController` |
| صورة | `media/ImageViewerActivity.kt` | فك ترميز في الذاكرة مع `inSampleSize` (لا ملف نصّي مؤقت إطلاقاً) + تكبير/تصغير |

شاشة **«وضع بدون إنترنت»** (`media/OfflineCatalogActivity.kt`): تعرض كل الكائنات المخزنة (الأحدث وصولاً أولاً)، وتفتح عنصراً عند النقر عبر **نفس مسار `openLocal` الخاضع للاستحقاق** الذي يستخدمه الجسر، مع إشعارات Toast عربية لكل حالة رفض (`media_open_denied_auth` / `media_open_denied_stale`)، وزر «مسح كل الملفات المحفوظة»، وزر «تسجيل الدخول المحلي» إلى `MainActivity` عندما لا توجد جلسة أصلية. مستمع `CacheProgressBus` يحدّث الصفوف حيّةً أثناء اكتمال التنزيلات، وشارة كل صف: «متاح دون اتصال» أو «تحتاج تحديثاً بعد الاتصال» حسب نافذة الـ 72 ساعة.

### 8.5 مصفوفة أنواع المحتوى (من recon الدفعة الرابعة، كما نفذت فعلاً)

| نوع المكتبة | استراتيجية التنزيل | المشغّل | الحالة |
|---|---|---|---|
| PDF | `GET {API}/library/{id}/content` | `PdfViewActivity` | منفَّذ (مسار دمج حرج) |
| txt / html | نفس نقطة `/content` | `TextReaderActivity` | منفَّذ (html بعرض ثابت) |
| صوت | نفس نقطة `/content` (كائن كامل) | `AudioPlayerActivity` | منفَّذ |
| فيديو غير YouTube | نفس نقطة `/content` (كائن كامل) | `VideoPlayerActivity` | منفَّذ؛ روابط playback الموقَّعة/HLS **غير مستخدمة عمداً** (مضيف خارجي / سلّم متعدد الكائنات) |
| صورة | نفس نقطة `/content` | `ImageViewerActivity` | منفَّذ |
| فيديو YouTube | **محجوب** — لا بايتات عبر الـ API أصلاً | مسار iframe الويب كما هو | student-web يتخطى ensureLocal لصفوف `youtubeVideoId` |
| حلقات المقرر (audio/video) | **محجوب** — فقط روابط playback موقَّعة من مخزن كائنات أو سلّم HLS متعدد الكائنات؛ لا نقطة كائن كامل بنفس الأصل | بث الويب كما هو | موثَّق لدفعة مستقبلية |

الرابط يستخرجه الكود الأصلي بنفسه: `{OFFLINE_API_BASE_URL ?? API_BASE_URL}/library/{contentId}/content` من UUID مُتحقَّق — **لا يُجلب أي URL من JavaScript** (لا سطح جلب اعتباطي).

---

## 9. حزم الأسئلة offline (security/*) — فصل صريح عن كاش المكتبة

مجلد `security/` (11 ملفاً) هو نواة **حزم أسئلة الامتحانات الأوفلاين** — منظومة منفصلة تماماً عن كاش وسائط المكتبة في الفصل 8: `OfflineRuntimeCoordinator` (تنسيق دورة التنزيل/المزامنة/الاستمرار)، `EncryptedOfflinePackageStore` (تخزين الحزم)، `OfflinePackageVerifier` و`TrustedOfflineRuntime` (تحقق توقيع/سلامة)، `PlayIntegrityHelper` (stub)، و`OfflineCertificatePinning` (خطاف SPKI).

في البناءات الحالية هذه المنظومة **معطَّلة عمداً** وليست مفعَّلة: `CmsApplication.offlineEnabled = false` (ثابت مصرَّح)، و`BuildConfig.OFFLINE_TRUSTED_CLIENT_IMPLEMENTED` يساوي `false` من `app/build.gradle.kts`، فتُرجع `createRuntimeOrNull()` قيمة null وتعرض `MainActivity` رسالة الأمانة «Offline الموثوق معطَّل في هذا البناء». واجهات الـ API التي يستهلكها العميل (عند تفعيله) كما في مصفوفة هيدرات roadmap: `POST /auth/login`، `POST /auth/refresh`، `POST /entitlements/issue`، `POST /offline/download` (مع `X-Entitlement` و`X-Idempotency-Key` و`X-Offline-Package-Public-Key`)، `POST /offline/sync`، و`GET /offline/packages/{id}/status`. اختبارات JVM الخاصة بها (27 اختباراً أمنياً سابقاً) ما زالت خضراء وتُشغَّل مع كل بناء. **خطاف تثبيت الشهادات** هنا أيضاً: موجود ويعمل fail-closed عند ضبط pins، لكن `OFFLINE_API_SPKI_PINS_BASE64` فارغ افتراضياً — أي أن pinning **خطاف غير مفعَّل بالقيم** في البناءات الحالية، حقيقة يذكرها الـ roadmap صريحاً.

---

## 10. التكامل مع student-web

- `apps/student-web/src/utils/native-bridge.ts` — المُوصِّل الوحيد لجسر الهوية الأربع: فحص وجود `window.CmsNative` + فحص شكل الدوال + `try/catch` + سقف طول للهوية (64) — أي حقن معطوب/عدائي يتدهور إلى «غير موجود». في المتصفح تعيد كل الدوال قيماً كاذبة وتبقى سلوكيات الويب كما هي.
- `apps/student-web/src/utils/native-cache.ts` (جديد في Batch 4) — مُوصِّل سطح الكاش: يكتشف الدفعات الأقدم (Batch 3 فقط) ويتدهور لمسار الويب؛ خريطة الأنواع (مع **رفض صريح لصفوف YouTube**)؛ بناء hints JSON؛ خريطة **رسائل الرفض العربية** لكل رمز (`denied_native_session` → «لتخزين المحتوى وفتحه دون اتصال، سجّل الدخول أولاً من شاشة وضع بدون إنترنت…» إلخ)؛ وحلقة انتظار `waitForNativeCacheReady` (استطلاع 700 ملّي ثانية، مهلة 15 دقيقة، تمرير نسبة التقدم).
- `DocumentViewer.tsx` — خطاف واحد: عند أول فتح لملف قابل للتخزين **داخل الغلاف فقط** (`isNativeMediaCacheActive()`) يستدعي `ensureLocal` ثم شاشة تقدم ثم `openLocal`؛ في المتصفح الخطاف خامل وكل فروع العرض القائمة غير ممسوسة. أنواع `other` وYouTube تتخطى التوجيه الأصلي.
- تعادل الهيدرات: `getOrCreateInstallationId()` يفضّل الهوية الأصلية داخل الغلاف (فصل 4) — فيرسل مُعتبر axios نفس `X-Installation-Id`/`X-Device-Fingerprint` التي ترسلها Kotlin، بينما يبقى بناء المتصفح على `web-<32hex>`.

---

## 11. الاختبارات والأدلة

**اختبارات JVM على Android — نُفِّذت فعلياً في هذه الجلسة** (2026-11-22، `./gradlew :app:testDebugUnitTest` بعد `cleanTestDebugUnitTest`): **104 اختبارات، 0 إخفاقات، 0 أخطاء**. التوزيع:

| الجناح (ملف الاختبار) | عدد الاختبارات |
|---|---|
| `shell/ShellUrlPolicyTest` | 8 |
| `session/InstallationIdProviderTest` | 5 |
| `session/TokenStoreTest` | 3 |
| `session/NativeSessionManagerTest` | 12 (منها 4 لخطاف المسح) |
| `security/OfflineRequestHeadersTest` | 5 |
| `security/OfflineSessionModelsTest` | 3 |
| `security/OfflineCertificatePinningTest` | 7 |
| `security/OfflineRuntimeCoordinatorTest` | 4 |
| `security/OfflinePackageContractVectorTest` | 2 |
| `security/TrustedOfflineRuntimeTest` | 4 |
| `security/TrustedOfflineContractVectorTest` | 2 |
| `security/PlayIntegrityHelperTest` | 2 |
| `bridge/CmsJsBridgeTest` | 9 (يشمل جرد الانعكاس لسطح الجسر: 4 + 7 بالضبط) |
| `media/CacheIndexTest` | 6 |
| `media/CacheQuotaTest` | 6 |
| `media/MediaCacheServiceTest` | 26 (آلة حالة ensureLocal بمُزوِّد تنزيل مزيف) |

كما نجح `./gradlew :app:assembleDebug` في الجلسة نفسها وأنتج `app-debug.apk` (~4.6 MB).

**اختبارات student-web (vitest):** `native-bridge.test.ts` (8 حالة) و`native-cache.test.ts` (14 حالة) — مُعدّة من المصدر كما تُظهرها شجرة المستودع؛ **لم تُشغَّل في هذه الجلسة** (لم تُنفَّذ عملية تثبيت الاعتماديات في نطاق التقرير)، وتوثّق قِيَمها التقارير المرجعية في وصف PR الدمج #164.

**حالة CI على main (تم جلبها من GitHub Actions أثناء التدقيق):** آخر تشغيل لسير عمل «Android Offline Runtime» على `fded6f3` (رقم 45019008347): خطوة «Assemble app and instrumentation APK» **نجحت**، وخطوة «Run Android 35 connected instrumentation» **فشلت** — وهو الفشل المزمن المعروف للمحاكي في CI (موثَّق بنفس الصياغة منذ الدفعات السابقة، وليس انحداراً في هذه الدفعة). سير «CI/CD Pipeline» أخضر على آخر تشغيل مكتمل. لا يُدَّعى في هذا التقرير أن المحاكي أخضر — هو أحمر وموثَّق كذلك.

**أوامر البناء المحلية** (من `docs/android-shell-roadmap.md`): `cd apps/android && ./gradlew :app:assembleDebug` (يتطلب JDK 17+ و`ANDROID_HOME`)؛ الاختبارات `:app:testDebugUnitTest`؛ و`-PSTUDENT_WEB_BASE_URL=… -PAPI_BASE_URL=…` لتجاوز عناوين البناء (HTTPS فقط، تُرفض قيم غير صالحة عند الضبط).

**أدلة جسّ الشجرة** (أعداد الملفات المطابقة عند `fded6f3`): `FLAG_SECURE` 5 ملفات؛ `EncryptedSharedPreferences` 4؛ `EncryptedFile` 4؛ `CmsNative` 7؛ `JavascriptInterface` 3؛ `TokenStore` 7؛ `CacheIndex` 6؛ `ensureLocal` 7؛ `wipe` 9؛ `X-Installation-Id` 6؛ `lastConfirmedAt` 11؛ `clearCache` 8.

---

## 12. حدود الحماية (صراحة هندسية)

1. **`FLAG_SECURE` ليس DRM.** يمنع لقطات الشاشة ومعاينات «التطبيقات الأخيرة» على الأسطح المضبوطة؛ لكنه لا يمنع جهازاً مفتوحاً (root) أو أدوات تصوير متقدمة من التقاط الشاشة بطرق أخرى خارج هذه الآلية، ولا يحمي المحتوى بعد وصوله إلى عين الطالب.
2. **WebView ليست خزنة.** المحتوى يُعرض كصور/صوت/فيديو عادي لطالب مستحق؛ وقرصان على جهاز مفتوح يستطيع نظرياً التقاط الذاكرة. الحماية هنا بنيوية (تشفير عند الراحة + بوابات استحقاق على الخادم) وليست إدارة حقوق رقمية.
3. **نافذة 72 ساعة سياسة لا تشفير زمني.** `lastConfirmedAt` محفوظ في فهرس مشفَّر AES-GCM (سري ومحمي من التلاعب لغير root)، لكن الطول نفسه اختيار سياسي موثَّق في `CachePolicy`.
4. **لحظة نصّي عابرة عند العرض:** مشغّلات PDF/فيديو/صوت تفك التشفير إلى ملف مؤقت خاص بالتطبيق يُحذف عند إغلاق المشغّل (`onDestroy`) — لحظة تعرّض مقصودة وموثقة في الكود؛ مشغّل الصور لا ينشئ ملفاً نصّياً إطلاقاً.
5. **pinning غير مفعَّل بالقيم.** الخطاف موجود وfail-closed عند الضبط، لكن `OFFLINE_API_SPKI_PINS_BASE64` فارغ في البناءات الحالية — الحماية اليوم هي CA النظام + HTTPS فقط.
6. **عناوين نائبة حتى الضبط الإنتاجي:** `app.cms.example.com`/`api.cms.example.com` افتراضيات موثقة؛ الإطلاق يتطلب حقن قيم حقيقية من خط الإصدار (الأوامر في الملحق).
7. **منظومة حزم الأسئلة offline معطَّلة** (`OFFLINE_TRUSTED_CLIENT_IMPLEMENTED=false`) — وجودها في الكود لا يعني تفعيلها.
8. **YouTube وحلقات المقررات خارج الكاش** (لا بايتات عبر الـ API) — يتم عرضها عبر الويب فقط، كما هي.
9. **التنزيل يتطلب جلسة أصلية** (D1): مستخدم أوفلاين جديد كلياً يحتاج تسجيل دخول محلي مرة واحدة على الأقل من شاشة الكتالوج — قيد تصميمي مقصود ومعلن في رسالة الرفض العربية.
10. **CI المحاكي أحمر بشكل مزمن** (connected instrumentation) — البناء نفسه أخضر؛ لا يجوز قراءة ذلك كأخضر تام.
11. **لا FCM ولا إشعارات دفع ولا Play Integrity مفعَّل** — خارج نطاق ما هو منفَّذ حتى `fded6f3`.

---

## 13. الملحق

**ملفات المصدر الأساسية** (كلها موجودة على `main` عند `fded6f3`): `shell/ShellActivity.kt`، `shell/WebViewHost.kt`، `shell/ShellUrlPolicy.kt`، `session/TokenStore.kt`، `session/InstallationIdProvider.kt`، `session/EncryptedInstallationIdStore.kt`، `session/NativeSessionManager.kt`، `bridge/CmsJsBridge.kt`، `bridge/CmsNativeCacheApi.kt`، `media/MediaCacheService.kt`، `media/EncryptedMediaCacheStore.kt`، `media/CacheIndex.kt`، `media/CacheQuota.kt`، `media/CachePolicy.kt`، `media/MediaContentTransport.kt`، `media/MediaFileStore.kt`، `media/NativeMediaOpener.kt`، `media/MediaViewerActivity.kt`، `media/PdfViewActivity.kt`، `media/TextReaderActivity.kt`، `media/AudioPlayerActivity.kt`، `media/VideoPlayerActivity.kt`، `media/ImageViewerActivity.kt`، `media/OfflineCatalogActivity.kt`، `media/CacheProgressBus.kt`، `media/ConnectivityNetworkAvailability.kt`، `security/OfflineRequestHeaders.kt`، `security/HttpsOfflineClients.kt`، `security/OfflineCertificatePinning.kt`، `CmsApplication.kt`، `AndroidManifest.xml`، `res/values/strings.xml`، إضافة إلى `apps/student-web/src/utils/native-bridge.ts` و`native-cache.ts` و`src/features/library/DocumentViewer.tsx` و`docs/android-shell-roadmap.md`.

**آخر الالتزامات ذات الصلة على `main`:** `fded6f3` (دمج PR #164 — Batch 4)، `fd06c6e` (Batch 4: كاش وسائط مشفَّر + مشغّلات أصلية + كتالوج أوفلاين + سطح كاش CmsNative)، `5262302` (دمج PR #163 — Batch 3)، `4ad91c7` (Batch 3: الجسر المدقَّق + تعادل هيدرات student-web)، `dc953eb` (Batch 2)، `6f9bd90` (Batch 1)، `ad021b6` (Batch 0).

**أوامر محلية موثقة:**

```bash
cd apps/android && ./gradlew :app:assembleDebug
cd apps/android && ./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug -PSTUDENT_WEB_BASE_URL=https://<student-web-host> -PAPI_BASE_URL=https://<api-host>
./gradlew :app:assembleRelease -POFFLINE_API_SPKI_PINS_BASE64="sha256/AAAA...,sha256/BBBB..."
```

**بيان الظرف الزمني:** هذا التقرير يعكس المستودع عند `fded6f3` بتاريخ 2026-11-22 فقط؛ تمت قراءة الملفات المذكورة من شجرة العمل عند ذلك الالتزام، وتشغيل اختبارات JVM و`assembleDebug` محلياً في الجلسة نفسها، وجلب حالة GitHub Actions كما كانت لحظة التدقيق.
