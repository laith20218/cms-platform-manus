# 🚀 CMS Platform — Go-Live Checklist

> **استخدم هذه القائمة قبل وبعد الإطلاق الرسمي.**
> **لا تطلق المنصة إلا بعد التحقق من جميع العناصر.**
> **آخر تحديث**: 2026-07-31 — Phase 32

---

## 📋 Phase 1: Pre-Launch (T-7 days)

### ✅ الكود والاختبارات

- [ ] جميع الـ PRs مدموجة في `main`
- [ ] CI/CD Pipeline يعمل بنجاح (آخر build أخضر)
- [ ] جميع الاختبارات تمر (Backend + Frontend)
- [ ] CodeQL + Trivy بدون Critical/High findings
- [ ] Lighthouse score > 90 لكل الفئات
- [ ] مراجعة كود نهائية من Tech Lead
- [ ] Tag الإصدار: `git tag v1.0.0`
- [ ] تحديث `CHANGELOG.md` بجميع التغييرات

### ✅ البنية التحتية

- [ ] Railway project مُنشأ (production)
- [ ] PostgreSQL provisioned (min 1GB RAM, 10GB storage)
- [ ] Redis provisioned (min 256MB)
- [ ] Vercel project مُنشأ (production)
- [ ] Cloudflare account جاهز + DNS محوّل
- [ ] Domain مسجّل (`cms.example.com`)
- [ ] Cloudflare R2 bucket مُنشأ (`cms-files-production`)
- [ ] SSL/TLS certificates جاهزة (Cloudflare Universal SSL)

### ✅ التهيئة والتكوين

- [ ] جميع متغيرات البيئة مُعدّة في Railway + Vercel
- [ ] `JWT_SECRET` تم توليده (64+ char random)
- [ ] `POSTGRES_PASSWORD` قوي (64+ char)
- [ ] `REDIS_PASSWORD` قوي (64+ char)
- [ ] CORS مُعد للدومينات الصحيحة فقط (لا `*`)
- [ ] Rate Limiting مفعّل
- [ ] جميع الخدمات تستخدم non-root user
- [ ] Health checks مُعدّة لجميع الخدمات

### ✅ قاعدة البيانات

- [ ] Migrations مطبّقة على الإنتاج
- [ ] Seed data مُحمّلة (deploy/seed/seed-production.sql)
- [ ] فحص سلامة البيانات (counts match expected)
- [ ] أول super admin مُنشأ
- [ ] **كلمة مرور super admin تغيّرت** من الافتراضية
- [ ] 2FA مفعّل لجميع الـ Admins
- [ ] Backup يومي مُجدول + تم اختباره
- [ ] Connection pooling مُفعّل

### ✅ الأمان

- [ ] فحص الأمان الشامل (OWASP Top 10)
- [ ] جميع الـ secrets في Railway/Vercel Variables (وليس في الكود)
- [ ] HTTPS مفعّل (HSTS preload ready)
- [ ] CSP headers مُعدّة بشكل صحيح
- [ ] Swagger مُخفى في الإنتاج
- [ ] Detailed errors مُعطّلة في الإنتاج
- [ ] Audit logging مُفعّل
- [ ] Device binding مُفعّل
- [ ] OTP via WhatsApp يعمل
- [ ] JWT Refresh token rotation مُفعّل
- [ ] JWT Blacklisting يعمل (Redis)

### ✅ المراقبة والتنبيهات

- [ ] Sentry مُعد (Backend + Frontend)
- [ ] Better Stack uptime monitors مُنشأة (API + Web + Admin + CDN)
- [ ] Slack webhooks مُختبَرة (#alerts-critical + #alerts-info)
- [ ] PagerDuty / SMS alerts مُختبَرة (لـ P0)
- [ ] Status page عام (`status.cms.example.com`)
- [ ] Heartbeat monitor مُفعّل
- [ ] Log retention مُعد (30 يوم)
- [ ] Performance dashboard جاهز

### ✅ العمليات

- [ ] On-call schedule مُعد (24/7 coverage)
- [ ] Emergency runbook موزّع على الفريق
- [ ] Rollback plan موثّق ومُختبَر
- [ ] Backup strategy موثّقة + تم اختبار الاسترجاع
- [ ] Communication templates جاهزة (للحوادث والإعلانات)
- [ ] Legal + Privacy policies مُحدّثة
- [ ] Terms of Service مُحدّثة
- [ ] Support email يعمل (`support@cms.example.com`)

---

## 📋 Phase 2: Soft Launch (T-1 day)

### ✅ نشر Staging النهائي

- [ ] نشر على staging من `main` branch
- [ ] تشغيل smoke tests على staging: `./deploy/scripts/smoke-tests.sh staging`
- [ ] اختبار جميع المسارات الحرجة يدوياً:
  - [ ] تسجيل طالب جديد
  - [ ] تسجيل دخول + OTP
  - [ ] تصفح المواد
  - [ ] حل سؤال
  - [ ] بدء اختبار
  - [ ] عرض النتائج
  - [ ] تصفح المكتبة
  - [ ] تفعيل الوضع Offline
  - [ ] تسجيل دخول Admin
  - [ ] لوحة تحكم Admin
  - [ ] إدارة الطلاب
  - [ ] توليد أكواد اشتراك
- [ ] اختبار PWA (تثبيت على الهاتف)
- [ ] اختبار RTL + اللغة العربية
- [ ] اختبار على متصفحات مختلفة (Chrome, Safari, Firefox, Edge)
- [ ] اختبار على أجهزة مختلفة (Desktop, Tablet, Mobile)

### ✅ التحقق النهائي

- [ ] جميع الـ endpoints الرئيسية تعمل
- [ ] Performance مقبولة (p95 < 500ms للـ API)
- [ ] Frontend TTFB < 600ms
- [ ] Lighthouse score > 90
- [ ] لا توجد أخطاء في Sentry
- [ ] لا توجد أخطاء في Railway logs
- [ ] لا توجد أخطاء في Vercel logs

---

## 📋 Phase 3: Production Launch (T-0)

### ✅ النشر على الإنتاج

- [ ] **FINAL GO/NO-GO MEETING** (Tech Lead + DevOps + Product)
- [ ] تأكيد: جميع عناصر Phase 1 + 2 مكتملة
- [ ] نشر Backend على Railway: `railway up --service cms-api-production`
- [ ] انتظار Health check يصبح Healthy
- [ ] نشر Frontend على Vercel: `cd apps/student-web && vercel --prod`
- [ ] انتظار Vercel deployment يكتمل
- [ ] تشغيل DNS setup: `./deploy/scripts/setup-dns-ssl.sh`
- [ ] انتظار 15 دقيقة لاكتمال SSL

### ✅ التحقق من الإنتاج

- [ ] تشغيل smoke tests: `./deploy/scripts/smoke-tests.sh production`
- [ ] جميع الاختبارات تمر (0 failures)
- [ ] Health check يعمل: `curl https://api.cms.example.com/health`
- [ ] Frontend يفتح: `https://app.cms.example.com`
- [ ] تسجيل دخول Admin يعمل
- [ ] تغيير كلمة مرور super admin فوراً
- [ ] تفعيل 2FA لـ super admin
- [ ] Sentry يستقبل الأحداث بشكل صحيح
- [ ] Better Stack يظهر جميع الخدمات "Up"
- [ ] Slack alerts تعمل (اختبار بسيط)

### ✅ إعلان الإطلاق

- [ ] إرسال إعلان داخلي للفريق (Slack: #announcements)
- [ ] إرسال إعلان للمستخدمين التجريبيين (Beta testers)
- [ ] تحديث status page: "All Systems Operational"
- [ ] نشر على وسائل التواصل (Twitter/LinkedIn/Instagram)
- [ ] إرسال بريد إلكتروني للقائمة البريدية

---

## 📋 Phase 4: Post-Launch (T+0 to T+72h)

### ✅ المراقبة المكثّفة (أول 24 ساعة)

- [ ] **On-Call Engineer يراقب بشكل مستمر**
- [ ] مراجعة Sentry كل ساعة (لأي أخطاء جديدة)
- [ ] مراجعة Railway metrics كل ساعتين
- [ ] مراجعة Better Stack uptime كل ساعة
- [ ] فحص سجلات الأخطاء: `railway logs --tail 100`
- [ ] مراقبة معدل الأخطاء 5xx (يجب أن يكون < 0.1%)
- [ ] مراقبة زمن الاستجابة (p95 < 500ms)
- [ ] مراقبة استهلاك الموارد (CPU < 70%, Memory < 80%)

### ✅ التحقق اليومي (T+1, T+2, T+3)

- [ ] تشغيل smoke tests يومياً
- [ ] مراجعة Sentry issues + تجميعها
- [ ] مراجعة أخطاء المستخدمين (Support inbox)
- [ ] فحص أحجام قاعدة البيانات + السجلات
- [ ] فحص المساحة التخزينية (R2 + Railway)
- [ ] تأكيد عمل Backup اليومي
- [ ] مراجعة مستوى رضا المستخدمين (NPS إن أمكن)

### ✅ الاجتماع اليومي (15 دقيقة)

- [ ] ما الذي سار جيداً؟
- [ ] ما هي المشاكل التي واجهناها؟
- [ ] ما هي الأولويات لليوم؟
- [ ] هل نحتاج تعديل On-Call؟

---

## 📋 Phase 5: Stabilization (T+7 days)

### ✅ مراجعة الأسبوع الأول

- [ ] إحصائيات الاستخدام:
  - عدد المستخدمين المسجّلين
  - DAU / WAU
  - متوسط زمن الجلسة
  - أكثر الصفحات زيارة
  - معدل التحويل (تسجيل → اشتراك)
- [ ] إحصائيات الأداء:
  - p50, p95, p99 latency
  - uptime نسبة
  - معدل الأخطاء
  - استهلاك الموارد
- [ ] مراجعة جميع Sentry issues + إصلاح الـ High
- [ ] مراجعة جميع تذاك الدعم الفني + الرد عليها
- [ ] تحديث الـ FAQ بناءً على الأسئلة الشائعة
- [ ] مراجعة Postmortems للحوادث (إن وجدت)

### ✅ تحسينات الأداء

- [ ] إضافة فهارس للاستعلامات البطيئة
- [ ] تحسين الـ N+1 queries
- [ ] ضغط الصور بشكل أفضل
- [ ] تحسين cache hit ratio
- [ ] تحسين bundle size (إن لزم)

---

## 📋 Phase 6: Post-Launch Review (T+14 days)

### ✅ اجتماع المراجعة

- [ ] جميع أعضاء الفريق يحضرون
- [ ] مراجعة الإحصائيات النهائية
- [ ] مراجعة الحوادث + Postmortems
- [ ] مراجعة رضا المستخدمين
- [ ] تحديد الدروس المستفادة
- [ ] إنشاء action items للتحسينات المستقبلية
- [ ] توثيق best practices الجديدة
- [ ] تحديث الـ Runbooks بناءً على التجربة

### ✅ التخطيط المستقبلي

- [ ] تحديد أولويات الـ v1.1
- [ ] جدولة المهام التقنية (refactoring, tests, etc.)
- [ ] مراجعة الـ SLAs + SLOs
- [ ] تحديث الـ Roadmap
- [ ] تخطيط الـ features الجديدة

---

## 📊 مؤشرات النجاح (KPIs)

### تقني

| المؤشر | الهدف | القياس |
|--------|------|--------|
| Uptime | ≥ 99.9% | Better Stack |
| API p95 Latency | < 500ms | Railway metrics |
| Frontend TTFB | < 600ms | Lighthouse |
| Error Rate | < 0.1% | Sentry |
| Lighthouse Score | > 90 | Lighthouse CI |

### أعمال

| المؤشر | الهدف | القياس |
|--------|------|--------|
| المسجلون في الأسبوع الأول | 1,000 | DB count |
| DAU بعد أسبوع | 200 | Analytics |
| معدل الاحتفاظ (7-day) | > 30% | DB analytics |
| NPS | > 40 | Survey |
| تذاكر الدعم | < 50 / أسبوع | Support system |

---

## 🚨 توقف عن الإطلاق إذا...

- ❌ أي P0 bug مكتشف غير مُصلح
- ❌ Smoke tests تفشل في أي قسم
- ❌ Health check يعيد غير Healthy
- ❌ Sentry يستقبل أخطاء critical
- ❌ Rate limiting لا يعمل
- ❌ SSL certificate غير صالح
- ❌ CORS مُعد بشكل مفتوح (`*`)
- ❌ كلمة مرور super admin افتراضية
- ❌ Backup غير مُختبَر
- ❌ On-Call غير متاح

---

## ✅ Sign-off النهائي

| الدور | الاسم | التوقيع | التاريخ |
|------|------|--------|---------|
| Tech Lead | _______ | _______ | _______ |
| DevOps Lead | _______ | _______ | _______ |
| Product Manager | _______ | _______ | _______ |
| Security Officer | _______ | _______ | _______ |

---

**تاريخ الإطلاق المتوقع**: `__ / __ / 2026`
**الوقت المتوقع (UTC)**: `__:__`

---

**آخر مراجعة**: Phase 32 — 2026-07-31
