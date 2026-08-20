# 🚨 CMS Platform — Emergency Runbook

> **استخدم هذا الملف عند وقوع حوادث الإنتاج.**
> **آخر تحديث**: 2026-07-31 — Phase 32

---

## 📞 جهات الاتصال للطوارئ

| الدور | الاسم | الهاتف | Slack |
|------|------|--------|-------|
| On-Call Engineer (P0) | @oncall-1 | +966-5X-XXX-XXXX | `@oncall-1` |
| On-Call Engineer (Backup) | @oncall-2 | +966-5X-XXX-XXXX | `@oncall-2` |
| Tech Lead | @tech-lead | +966-5X-XXX-XXXX | `@tech-lead` |
| DevOps Lead | @devops-lead | +966-5X-XXX-XXXX | `@devops-lead` |
| DBA | @dba | +966-5X-XXX-XXXX | `@dba` |
| Security | @security | +966-5X-XXX-XXXX | `@security` |

**تصعيد الحوادث**:
- P0 (خدمة معطّلة كلياً) → اتصل بالـ On-Call فوراً (خلال 1 دقيقة)
- P1 (خدمة بطيئة/محدودة) → Slack خلال 5 دقائق
- P2 (تحذيرات) → Slack خلال 30 دقيقة

---

## 🔥 سيناريوهات الطوارئ الشائعة

### Scenario 1: API Service Down (P0)

**الأعراض**:
- Health check يعيد 5xx أو لا يستجيب
- جميع المستخدمين يحصلون على أخطاء
- Sentry يستقبل influx من الأخطاء

**خطوات التشخيص**:

```bash
# 1. تحقق من حالة الخدمة
curl -I https://api.cms.example.com/health/live

# 2. تحقق من Railway dashboard
open https://railway.app/project/cms-production

# 3. تحقق من السجلات
railway logs --service cms-api-production

# 4. تحقق من قاعدة البيانات
railway psql --service postgresql -c "SELECT 1;"

# 5. تحقق من Redis
railway redis-cli --service redis PING
```

**الإجراءات**:

```bash
# A. إعادة تشغيل سريعة (إذا كانت المشكلة مؤقتة)
railway redeploy --service cms-api-production

# B. التراجع إلى آخر نسخة ناجحة (إذا فشلت النسخة الحالية)
railway rollback --service cms-api-production

# C. تفعيل وضع الصيانة (إذا استمرت المشكلة)
# في Railway Variables:
#   FEATURE_MAINTENANCE_MODE=true
# ثم أعد النشر

# D. إذا فشلت قاعدة البيانات:
# استرجاع من آخر backup:
gunzip -c /backups/cms-$(date +%Y%m%d).sql.gz | psql "$DATABASE_URL"
```

---

### Scenario 2: Database Down (P0)

**الأعراض**:
- جميع الطلبات تفشل بـ 500
- خطأ: "Connection refused" أو "Cannot connect to PostgreSQL"
- Railway Dashboard يظهر PostgreSQL غير صحي

**خطوات التشخيص**:

```bash
# 1. تحقق من حالة PostgreSQL
railway status --service postgresql

# 2. تحقق من السعة (Disk space)
railway psql --service postgresql -c "SELECT pg_database_size('cms');"

# 3. تحقق من الاتصالات النشطة
railway psql --service postgresql -c "SELECT count(*) FROM pg_stat_activity;"
```

**الإجراءات**:

```bash
# A. إعادة تشغيل PostgreSQL
railway restart --service postgresql

# B. إذا استمرت المشكلة، ترقية الخطة (قد تكون مشكلة موارد)
railway scale --service postgresql --cpu 2 --memory 2G

# C. استرجاع backup كامل
# 1. احصل على backup URL من Railway
railway backups list --service postgresql

# 2. استرجع backup محدد
railway backups restore <backup-id> --service postgresql

# D. إذا فشل الخادم بالكامل:
# 1. أنشئ PostgreSQL جديد
railway add --plugin postgresql --name postgresql-recovery

# 2. استرجع آخر backup
gunzip -c /backups/cms-latest.sql.gz | psql "$NEW_DATABASE_URL"

# 3. حدّث متغير البيئة في API
railway variables set ConnectionStrings__PostgreSQL="$NEW_DATABASE_URL" --service cms-api-production

# 4. أعد نشر API
railway redeploy --service cms-api-production
```

---

### Scenario 3: Frontend Down (P1)

**الأعراض**:
- الصفحة بيضاء / 404 / 500
- المستخدمون لا يستطيعون الوصول

**خطوات التشخيص**:

```bash
# 1. تحقق من Vercel
curl -I https://app.cms.example.com/
vercel inspect https://app.cms.example.com/

# 2. تحقق من آخر deployment
vercel ls cms-student-web
```

**الإجراءات**:

```bash
# A. التراجع إلى آخر deployment ناجح
vercel rollback <deployment-url>

# B. إعادة النشر من آخر commit
cd apps/student-web
vercel --prod

# C. تفعيل صفحة صيانة (temporary)
# انشر static HTML page على Vercel:
echo '<html><body><h1>المنصة قيد الصيانة، عودوا قريباً</h1></body></html>' > maintenance.html
vercel deploy maintenance.html --prod
```

---

### Scenario 4: Security Breach (P0)

**الأعراض**:
- تسريب بيانات المستخدمين
- وصول غير مصرح به إلى الـ Admin
- هجوم brute force على الـ Auth

**الإجراءات الفورية**:

```bash
# 1. أوقف الخدمة فوراً (لمنع المزيد من التسريب)
railway stop --service cms-api-production

# 2. غيّر JWT_SECRET (يُبطل جميع الجلسات النشطة)
NEW_JWT=$(openssl rand -base64 64)
railway variables set Jwt__Secret="$NEW_JWT" --service cms-api-production

# 3. غيّر جميع كلمات مرور الـ Admins
railway psql --service postgresql -c "UPDATE admins SET password_hash = '...', is_active = false WHERE role != 'super_admin';"

# 4. أبلغ فريق الأمن
# Slack: #security-incidents
# Email: security@cms.example.com

# 5. راجع سجلات الوصول (Audit Logs)
railway psql --service postgresql -c "
  SELECT * FROM audit_logs 
  WHERE performed_at > NOW() - INTERVAL '24 hours' 
  ORDER BY performed_at DESC 
  LIMIT 100;
"

# 6. أبلغ المستخدمين (إذا تسرّبت بياناتهم)
# استخدم قالب الإشعار في: deploy/communication/security-breach-template.md
```

---

### Scenario 5: High Error Rate (P1)

**الأعراض**:
- Sentry يستقبل > 10 أخطاء/دقيقة
- معدل الأخطاء 5xx > 5%

**خطوات التشخيص**:

```bash
# 1. راجع أحدث الأخطاء في Sentry
open https://sentry.io/organizations/cms/issues/?environment=production

# 2. راجع سجلات API (آخر 100 سطر)
railway logs --service cms-api-production --tail 100

# 3. تحقق من الضغط على الخدمة
railway metrics --service cms-api-production
```

**الإجراءات**:

```bash
# A. إذا كان السبب deployment جديد:
railway rollback --service cms-api-production

# B. إذا كان السبب ضغط زائد (traffic spike):
railway scale --service cms-api-production --replicas 2

# C. إذا كان السبب DB bottleneck:
# راجع الاستعلامات البطيئة
railway psql --service postgresql -c "
  SELECT query, mean_exec_time, calls 
  FROM pg_stat_statements 
  ORDER BY mean_exec_time DESC 
  LIMIT 10;
"
```

---

### Scenario 6: Disk Space Full (P1)

**الأعراض**:
- خطأ: "No space left on device"
- الـ Logs لا تُكتب
- قاعدة البيانات لا تقبل كتابات

**خطوات التشخيص**:

```bash
# 1. تحقق من المساحة في Railway
railway metrics --service postgresql
railway metrics --service cms-api-production

# 2. تحقق من حجم السجلات
railway exec --service cms-api-production -- du -sh /app/logs/
```

**الإجراءات**:

```bash
# A. حذف السجلات القديمة
railway exec --service cms-api-production -- find /app/logs -name "*.log" -mtime +7 -delete

# B. تنظيف PostgreSQL (VACUUM)
railway psql --service postgresql -c "VACUUM FULL ANALYZE;"

# C. تنظيف سجلات Audit القديمة
railway psql --service postgresql -c "
  DELETE FROM audit_logs 
  WHERE performed_at < NOW() - INTERVAL '90 days';
"

# D. ترقية خطة التخزين في Railway
# Dashboard → Service → Settings → Scale → Storage
```

---

## 🔄 Rollback Strategy

### Rollback Levels

| المستوى | الوصف | RTO | إجراء |
|--------|-------|-----|-------|
| L1 | إعادة تشغيل بسيطة | < 1 min | `railway redeploy` |
| L2 | تراجع deployment | < 5 min | `railway rollback` |
| L3 | تراجع migration | < 30 min | `dotnet ef database update <prev>` |
| L4 | استرجاع backup كامل | < 2 hours | استرجاع من آخر backup يومي |

### Rollback Decision Tree

```
هل المشكلة في آخر deployment؟
├─ نعم → railway rollback --service cms-api-production
│        └─ نجح؟ → تم. otherwise → استمر
└─ لا → هل المشكلة في آخر migration؟
         ├─ نعم → dotnet ef database update <previous-migration>
         │        └─ نجح؟ → تم. otherwise → استمر
         └─ لا → هل البيانات تالفة؟
                  ├─ نعم → استرجع آخر backup
                  └─ لا → راجع السجلات + Sentry
```

### Pre-Rollback Checklist

- [ ] تم تأكيد المشكلة (ليست false positive)
- [ ] تم إعلام On-Call + Tech Lead
- [ ] تم إنشاء incident في Sentry
- [ ] تم تحديد السبب الجذري (إن أمكن)
- [ ] تم اختيار مستوى التراجع المناسب

### Post-Rollback Checklist

- [ ] تم التحقق من health check
- [ ] تم تشغيل smoke tests
- [ ] تم إعلام المستخدمين (إن لزم)
- [ ] تم توثيق الحادث في postmortem
- [ ] تم إنشاء fix في branch منفصل

---

## 📊 Backups

### استراتيجية النسخ الاحتياطي

| النوع | التكرار | الاحتفاظ | التخزين |
|------|---------|----------|---------|
| DB Full | يومي 03:00 AM UTC | 30 يوم | Railway + S3 |
| DB Incremental | كل ساعة | 24 ساعة | Railway |
| DB WAL | مستمر | 7 أيام | Railway |
| Code | كل commit | دائم | GitHub |
| Docker Images | كل build | 10 versions | GHCR |

### اختبار استرجاع Backup (شهرياً)

```bash
# 1. أنشئ قاعدة بيانات اختبار
railway add --plugin postgresql --name postgresql-test

# 2. استرجع آخر backup
gunzip -c /backups/cms-$(date +%Y%m%d).sql.gz | psql "$TEST_DB_URL"

# 3. تحقق من سلامة البيانات
psql "$TEST_DB_URL" -c "
  SELECT 
    (SELECT COUNT(*) FROM students) AS students,
    (SELECT COUNT(*) FROM questions) AS questions,
    (SELECT COUNT(*) FROM attempt_logs) AS attempts,
    (SELECT COUNT(*) FROM audit_logs) AS audit_logs;
"

# 4. احذف قاعدة البيانات الاختبارية
railway remove --service postgresql-test
```

---

## 📝 Incident Response Process

### 1. Detection (0-1 min)
- تنبيه من Sentry / Better Stack / Slack
- بلاغ من مستخدم

### 2. Acknowledgment (1-5 min)
- On-Call يؤكد استلام البلاغ في Slack
- ينشئ incident channel: `#incident-YYYY-MM-DD-XXX`
- يحدد الـ Severity (P0/P1/P2)

### 3. Investigation (5-30 min)
- يجمع السجلات والأخطاء
- يحدد السبب الجذري
- يطبق hotfix أو rollback

### 4. Resolution (30-60 min)
- يطبق الإصلاح
- يتحقق من health checks
- يغلق incident channel

### 5. Postmortem (within 48 hours)
- يكتب تقرير مفصل
- يحدد الإجراءات الوقائية
- يضيفها إلى backlog

### قالب Postmortem

```markdown
# Incident Report — [Title]

**Date**: YYYY-MM-DD
**Severity**: P0/P1/P2
**Duration**: X minutes
**Affected Users**: ~X
**Reported By**: @name

## Summary
(2-3 sentences describing what happened)

## Timeline (UTC)
- HH:MM — Detection (alert fired)
- HH:MM — Acknowledgment
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — Verified resolved
- HH:MM — Incident closed

## Root Cause
(Detailed technical explanation)

## Impact
- Users affected: X
- Requests failed: X
- Revenue impact: $X (if applicable)
- SLA breach: Yes/No

## What Went Well
- ...

## What Went Wrong
- ...

## Action Items
- [ ] Action 1 — Owner: @name — Due: YYYY-MM-DD
- [ ] Action 2 — Owner: @name — Due: YYYY-MM-DD

## Lessons Learned
- ...
```

---

## 🛠️ أدوات التشخيص السريعة

```bash
# فحص شامل للإنتاج
./deploy/scripts/smoke-tests.sh production

# فحص صحة قاعدة البيانات
railway psql --service postgresql -c "
  SELECT 
    pg_database_size('cms') as db_size,
    (SELECT count(*) FROM pg_stat_activity) as connections,
    (SELECT count(*) FROM students WHERE status = 'active') as active_students,
    (SELECT count(*) FROM questions WHERE status = 'published') as published_questions;
"

# فحص Sentry لآخر الأخطاء
curl -H "Authorization: Bearer $SENTRY_TOKEN" \
  "https://sentry.io/api/0/projects/cms/cms-backend/issues/?environment=production&statsPeriod=1h"

# فحص معدل الأخطاء
railway logs --service cms-api-production --since 5m | grep -c "ERROR"
```

---

## 📚 مراجع إضافية

- [DEPLOYMENT.md](../docs/DEPLOYMENT.md) — دليل النشر الكامل
- [Architecture Diagram](../docs/ARCHITECTURE.md) — بنية النظام
- [Database Schema](../docs/DATABASE_SCHEMA.md) — مخطط قاعدة البيانات
- [API Specification](../docs/API_SPECIFICATION.md) — توثيق الـ API

---

**آخر مراجعة**: Phase 32 — 2026-07-31
