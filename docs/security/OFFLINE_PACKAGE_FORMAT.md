# مواصفة حزمة Offline — حالة معطّلة في Phase 34

## الحالة الحالية

المسارات غير المتصلة معطلة افتراضياً عبر `Features:OfflineEnabled=false`. لا يمثل وجود service worker أو cache للواجهة تصريحاً لتنزيل محتوى طبي محمي أو بيانات أسئلة للاستخدام offline. يجب أن يبقى `Download/Sync` مرفوضاً خادمياً حتى اعتماد التصميم التالي وتنفيذه واختباره.

> **قاعدة الإفراج:** لا يعاد تمكين offline feature لحل خطأ build أو ضغط إصدار. يلزم اعتماد أمني مستقل واختبار اختراق وقرار مالك المنتج.

## تنسيق مقترح قبل التمكين

| الحقل | المتطلب |
|---|---|
| `formatVersion` | إصدار صريح ومقبول من العميل فقط. |
| `packageId` | UUID عشوائي غير قابل للتخمين. |
| `subjectId` و`studentId` | metadata محمية ومطابقة للهوية الخادمية. |
| `issuedAt` و`expiresAt` | صلاحية قصيرة ونافذة offline مقيدة. |
| `keyId` | معرف مفتاح content encryption وإصداره. |
| `ciphertext` | AES-256-GCM؛ nonce فريد لكل عملية تشفير وtag مصادق. |
| `manifest` | قائمة عناصر وhashes وmetadata، موقعة من الخادم. |
| `signature` | توقيع غير متماثل أو MAC مع key distribution محكم. |
| `revocationEpoch` | قيمة خادمية تمنع قبول حزم ما قبل الإبطال. |

## ضوابط الأمان المطلوبة

الحزمة لا تحفظ access token أو refresh token أو كلمة مرور أو TOTP secret. تشفر المحتويات باستخدام مفتاح بيانات عشوائي لكل package. يغلف مفتاح البيانات بمفتاح مرتبط بجهاز/تثبيت موثوق أو بمادة سرية محمية من keystore المنصة؛ لا يجوز اشتقاقه من `studentId` أو device fingerprint أو قيمة ثابتة في JavaScript.

يجب أن يتحقق العميل من signature وexpiry وstudent binding وrevocation epoch قبل فك أي محتوى. ويجب أن يفرض الخادم entitlement قبل إصدار package، وأن يسجل event إصدار وتنزيل وإبطال. عند logout أو إبطال session أو تغيير password أو إلغاء installation، ينفذ العميل `clearAllOfflineData()` ويمسح المفاتيح والحزم المشفرة المحلية.

## متطلبات الاختبار قبل الإطلاق

| الاختبار | معيار النجاح |
|---|---|
| package tamper | رفض أي تغيير byte أو manifest أو signature. |
| replay | رفض package منتهي أو سبق إبطاله أو خاص بطالب آخر. |
| key loss | لا يمكن استخراج المحتوى من storage بعد حذف keystore material. |
| logout/reset | مسح offline keys/data عند كل حدث إبطال. |
| device revoke | رفض package على installation ملغى. |
| downgrade | رفض `formatVersion` غير المدعوم أو الأقل أمناً. |
| concurrency | عدم مزامنة تعارضات الإجابات دون قواعد خادمية محددة. |

## قرار Phase 34

لم ينفذ هذا التنسيق بعد؛ لذا فإن تعطيل offline هو الضبط الصحيح وليس نقصاً يمكن إخفاؤه. أي تغيير إلى `OfflineEnabled=true` يفتح بوابة أمنية جديدة ويحتاج تحديث هذا المستند و`ONLINE_ENCRYPTION.md` وKey Management واختبارات التكامل.
