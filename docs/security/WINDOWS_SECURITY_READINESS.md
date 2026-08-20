# CMS — Windows Security Readiness Assessment

**القرار:** **NOT READY** لتطبيق Windows مكتبي يتعامل مع اشتراكات ومحتوى محمي بالوضع الحالي.  
**نطاق التقييم:** لا يوجد مشروع Windows أو WebView2 في الحزمة؛ التقييم خاص باستعداد API والبنية الأمنية لتطبيق مستقبلي.

## ملاءمة WebView2

يمكن لـWebView2 إعادة استخدام واجهة React الحالية، لكنه يرث تقريباً مخاطر الويب نفسها: الرموز في localStorage، محتوى IndexedDB الواضح، الروابط الموقعة، وإمكانية استخدام أدوات المطور في بيئة العميل. وضع الموقع داخل تطبيق Windows لا يحولها تلقائياً إلى حماية سطح مكتب.

| المجال | الحالة | سبب القرار |
|---|---|---|
| استخدام الواجهة الحالية داخل WebView2 | PARTIAL | واجهة PWA قابلة للعرض نظرياً، لكن route/config/auth غير ناضجة. |
| مصادقة التطبيق المكتبي | NOT READY | refresh token/revocation/device binding في Backend غير آمنة. |
| Offline Windows | NOT READY | لا يوجد format حزمة مشفرة أو API نزاهة أو secure key management. |
| ربط الجهاز | NOT READY | البصمة الحالية client-controlled وغير مدمجة. |
| حماية لقطات الشاشة | PARTIAL نظرياً | APIs native قد تقلل الالتقاط، لكنها لا تمنع كاميرا أو أدوات ذات صلاحية عالية. |
| جسر native | MISSING | لا يوجد protocol محدد لحصر الرسائل والقدرات بين WebView وnative host. |

## متطلبات Windows قبل التنفيذ

### 1. هوية وجلسة منفصلتان عن localStorage

يجب أن تستخدم النسخة المكتبية رمز جلسة أو refresh handle داخل Windows Credential Manager أو DPAPI، ولا تمرره تلقائياً إلى JavaScript العام. يجب أن تكون session server-side، قابلة للإبطال، ومربوطة بتثبيت أو جهاز مدروس بعناية.

### 2. Offline محمي على مستوى التطبيق

احفظ المحتوى المصرح به فقط في قاعدة محلية مشفرة، ومفتاحه محمي بـDPAPI أو Windows Hello/TPM عندما تكون متاحة. يجب أن تحتوي كل حزمة على معرف مستخدم/تثبيت، وقت انتهاء، manifest موقّع، وhashes للمحتوى. لا تُخزن المفاتيح بجوار النص الواضح كما يفعل Offline Web الحالي.

### 3. WebView2 hardening

إذا استخدم التطبيق WebView2، عطل أو قيّد DevTools في release، امنع navigation إلى origins غير مسموحة، لا تمنح native host objects للصفحات غير الموثوقة، طبّق CSP، واسمح فقط برسائل `postMessage` ذات schema وorigin متوقعين. لا يجب أن تعرض HTML مرفوعاً في origin التطبيق أو ضمن صفحة تملك وصولاً إلى رموز الجلسة.

### 4. حدود حماية المحتوى الواقعية

يمكن استخدام `SetWindowDisplayAffinity` في سيناريوهات محدودة لتقليل التسجيل، ويمكن إضافة watermark حيوي. لكن لا يمكن ضمان منع screenshots أو screen recording على Windows في كل البيئات، ولا منع تصوير الشاشة بكاميرا. ركّز على authorization، short-lived access، watermark، telemetry، والتحقيق بعد التسريب.

## بوابة البدء

| شرط | مطلوب قبل Windows |
|---|---|
| إغلاق SEC-001 وSEC-002 وSEC-003 | نعم |
| API contract مستقر وبناء CI قابل لإعادة الإنتاج | نعم |
| نظام entitlement وربط جهاز/جلسة | نعم |
| Offline cryptography مع format موقّع | نعم |
| سياسة للتخزين الآمن وDPAPI/Credential Manager | نعم |
| threat model لجسر WebView2 ورفع HTML | نعم |

**حالة البوابة الحالية:** غير محققة.
