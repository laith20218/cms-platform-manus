# CMS Secret Rotation Runbook — Phase 34

**الحالة:** خطة تنفيذ؛ لا يعني هذا الملف أن التدوير الخارجي قد تم.  
**قاعدة الأمان:** لا تدوّر قيمة حية أو تلغيها من دون نافذة صيانة وخطة rollback وتأكيد مالك الخدمة.

## 1. التحضير

يحدد مالك البنية القيم المشتبه بها، يسجل ticket للحادث، ويؤكد الخدمات والأقاليم المتأثرة. يجب فحص logs لتحديد استخدام المفتاح، وإنشاء قيمة بديلة في secret manager قبل تعطيل القيمة السابقة. لا توضع القيمة الجديدة في تذكرة أو terminal history أو ملف محلي قابل للمشاركة.

## 2. ترتيب التدوير

| الترتيب | النظام | الإجراء الآمن | التحقق | الإبطال |
|---:|---|---|---|---|
| 1 | R2 | أنشئ key مقيداً بالbucket والعمليات اللازمة فقط | upload/download staging | عطّل key القديم بعد نجاح الإنتاج |
| 2 | Redis | أنشئ credential/ACL جديداً وحدث backend | cache/session health | ألغ القديم بعد graceful reconnect |
| 3 | Database | أضف user أو password جديداً بأقل صلاحية | migration/readiness | ألغ القديم بعد connection drain |
| 4 | JWT | أضف signing key جديداً مع `kid` وسياسة قبول قصيرة للقديم | login/refresh/introspection | أزل القديم بعد أقصى عمر Access + Refresh حسب السياسة |
| 5 | Messaging / Firebase | أنشئ credential/service account جديداً محدوداً | send staging test | ألغ القديم بعد delivery verification |
| 6 | CI/CD | استبدل GitHub/Railway/Vercel tokens في secret stores | dry-run workflow | ألغ القديم بعد successful deployment |

## 3. JWT Key Rotation

يدعم التصميم المستهدف `kid` ومجموعة مفاتيح نشطة/سابقة. يجب أن يوقع الإصدار الجديد بالمفتاح الجديد، وأن يتحقق مؤقتاً من المفتاح السابق فقط خلال نافذة انتقال موثقة. لا يجب أن تستمر صلاحية مفتاح قديم لأكثر من أقصى عمر tokens المتأثر بها. عند حادث حرج، ألغ sessions إجبارياً بدلاً من الإبقاء على التوافق.

## 4. التحقق بعد التدوير

ينفذ المالك اختبارات login وrefresh وlogout وقراءة/رفع ملف R2 وhealth checks وworkflow staging. يراجع alerts وerror rates، ثم يثبت أن القيمة القديمة مرفوضة. يسجل owner والتاريخ وسبب التدوير والـexpiry القادم من دون تسجيل قيمة السر.

## 5. Rollback

لا يعاد تفعيل قيمة تعرضت للاشتباه. إذا فشل التدوير، ينشأ credential بديل جديد ويعود deployment إلى secret reference صالح، مع إبقاء القيمة المشتبه بها معطلة. تسجل الحادثة وتفتح مراجعة بعدية.
