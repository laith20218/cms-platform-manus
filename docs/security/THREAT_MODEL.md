# نموذج التهديد — CMS Phase 34

## الأصول ومناطق الثقة

| الأصل | القيمة أو الحساسية | منطقة الثقة |
|---|---|---|
| حسابات الطلاب والمديرين | هوية، صلاحيات، سجل أكاديمي | API وPostgreSQL |
| access/refresh credentials | وصول مباشر للمنصة | متصفح، API، session store |
| الأسئلة والمكتبة | محتوى تعليمي مدفوع أو مقيد | API وR2/cache |
| الاشتراكات والأكواد | قرار entitlement وإيراد | PostgreSQL وadmin API |
| مفاتيح JWT وR2 وRedis | سيطرة تشغيلية | secret manager فقط |
| TOTP/recovery material | تجاوز محتمل للمصادقة | API وstorage محمي |
| حزم offline المستقبلية | محتوى مقيد خارج الاتصال | device keystore/cache |

## الجهات والمهاجمون المفترضون

يفترض النموذج طالباً خبيثاً يحاول الوصول إلى مادة أو ملف أو سجل لطالب آخر، ومهاجماً يملك refresh token مسروقاً، ومديراً محدود الصلاحية يحاول تجاوز scope، ومهاجماً يستغل XSS أو CORS أو CSP، ومهاجماً يستخرج secret من repository أو image، ومورداً تعرضت تبعيته لثغرة معروفة.

## مصفوفة التهديدات

| التهديد | المسار المحتمل | الأثر | الضوابط المنفذة | التحقق |
|---|---|---|---|---|
| سر مكشوف | env/source/image/log | استيلاء تشغيلي | templates آمنة، artifact gate، Trivy secret scan، key policy | PASS محلي؛ rotation خارجي. |
| JWT ضعيف أو مفوض بخوارزمية خاطئة | forged token | session takeover | 32-byte minimum، HS256 allowlist، issuer/audience/signing validation، `kid` | build وcode review. |
| refresh replay | token مسروق مستخدم مرتين | session persistence | hash only، consume ذري، family revoke، installation binding | PostgreSQL integration PASS. |
| logout/reset غير نافذ | JWT صالح ظاهرياً | وصول بعد الإبطال | session validation middleware وtoken version وrevoke methods | unit/integration PASS. |
| IDOR محتوى | question/file ID مختلف | تسريب محتوى | server-side entitlement وidentity-derived student ID | entitlement/IDOR tests PASS. |
| scope escalation إداري | admin يستدعي مورد خارج نطاقه | تعديل أو كشف واسع | Permission/Scope handlers وdefault deny | build وregistration review. |
| نشر ملف قبل scan | object خبيث/غير مؤهل | malware أو تسريب | clean scan gate وentitlement قبل signed URL | code path verified. |
| 2FA replay | OTP صحيح معاد الاستخدام | takeover | TOTP وcache replay guard | code path verified. |
| brute force auth | login/OTP flood | takeover/DoS | rate limiter auth policy | code path verified. |
| XSS/token theft | injected HTML/script | credential theft | CSP، إزالة HTML raw، sessionStorage | frontend build/test. |
| dependency compromise | vulnerable package/image | RCE/data exposure | lockfile، SBOM، NuGet/pnpm audit، Trivy | PASS محلي. |
| container root | breakout blast radius | host/image impact | `USER cms` في Dockerfiles | Trivy PASS؛ image build خارجي. |
| offline data extraction | cache/storage access | content leakage | offline disabled | PASS by default deny. |

## افتراضات وحدود

يفترض النظام أن TLS والحافة والبنية السحابية مضبوطة من مالك البيئة، وأن PostgreSQL وRedis لا يكشفان endpoints عامة، وأن secret manager منفصل عن source control. لا يغطي هذا النموذج اختراق جهاز المستخدم بالكامل أو keylogger محلي؛ لكنه يقلل قيمة token المسروق بالدوران والإبطال ومدة access token.

## المخاطر المتبقية

أكبر المخاطر المتبقية تشغيلية: أسرار إنتاج لم تدوّر بعد، وعدم وجود evidence من CI البعيد وstaging أو بناء Docker image. هذه ليست قبول مخاطر ضمني؛ بل شروط حظر صريحة في `PRODUCTION_SECURITY_GATE.md`.
