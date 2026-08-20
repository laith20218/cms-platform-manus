# 🚀 CMS Platform — دليل النشر الشامل

**آخر تحديث**: 2026-07-31 (Phase 31)
**الحالة**: Production-Ready

---

## 📋 جدول المحتويات

1. [نظرة عامة على البنية](#1-نظرة-عامة-على-البنية)
2. [المتطلبات الأساسية](#2-المتطلبات-الأساسية)
3. [النشر المحلي (Docker Compose)](#3-النشر-المحلي-docker-compose)
4. [نشر Backend على Railway](#4-نشر-backend-على-railway)
5. [نشر Frontend على Vercel](#5-نشر-frontend-على-vercel)
6. [إعداد Cloudflare R2](#6-إعداد-cloudflare-r2)
7. [إعداد WhatsApp Business API](#7-إعداد-whatsapp-business-api)
8. [إعداد Firebase (Push Notifications)](#8-إعداد-firebase-push-notifications)
9. [إعداد Sentry (Error Monitoring)](#9-إعداد-sentry-error-monitoring)
10. [إدارة قاعدة البيانات (Migrations)](#10-إدارة-قاعدة-البيانات-migrations)
11. [CI/CD Pipeline](#11-cicd-pipeline)
12. [المراقبة والتنبيهات](#12-المراقبة-والتنبيهات)
13. [الاستعادة من الكوارث](#13-الاستعادة-من-الكوارث)
14. [قائمة التحقق قبل الإطلاق](#14-قائمة-التحقق-قبل-الإطلاق)

---

## 1. نظرة عامة على البنية

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Vercel CDN    │  │   Cloudflare    │  │   Railway       │
│  (Frontend PWA) │  │  R2 (Storage)   │  │  (Backend API)  │
│ app.cms.com     │  │ cdn.cms.com     │  │ api.cms.com     │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         │                    │                    ▼
         │                    │         ┌─────────────────────┐
         │                    │         │  Railway PostgreSQL │
         │                    │         │  (Managed DB)       │
         │                    │         └─────────────────────┘
         │                    │                    │
         │                    │                    ▼
         │                    │         ┌─────────────────────┐
         │                    │         │  Railway Redis      │
         │                    │         │  (Cache + Tokens)   │
         │                    │         └─────────────────────┘
         │                    │
         │                    ▼
         │          ┌─────────────────────┐
         └─────────►│  Sentry + Better    │
                    │  Stack (Monitoring) │
                    └─────────────────────┘
```

### الخدمات السحابية المستخدمة

| الخدمة | المزود | الغرض | التكلفة المتوقعة/شهر |
|--------|--------|-------|---------------------|
| Frontend Hosting | Vercel Pro | React PWA + CDN | $20 |
| Backend Hosting | Railway Pro | ASP.NET Core API | $20-40 |
| PostgreSQL | Railway | قاعدة البيانات | $5-20 |
| Redis | Railway | الكاش + JWT Blacklist | $5-10 |
| File Storage | Cloudflare R2 | PDFs + Videos | $5-15 |
| Push Notifications | Firebase Cloud Messaging | إشعارات الطلاب | مجاني |
| OTP Service | WhatsApp Business API | رموز التحقق | $10-30 |
| Error Monitoring | Sentry | تتبع الأخطاء | $26 |
| Uptime Monitoring | Better Stack | مراقبة التشغيل | $20 |
| DNS + CDN | Cloudflare | DNS + WAF + DDoS | $20 |

**إجمالي تقديري**: $130-200/شهر للإنتاج

---

## 2. المتطلبات الأساسية

### الأدوات المطلوبة على الجهاز المحلي

```bash
# التحقق من الأدوات
docker --version          # Docker 24+
docker compose version    # Compose v2+
dotnet --version          # .NET SDK 9.0
node --version            # Node 20+
pnpm --version            # pnpm 9+
git --version             # Git 2.40+

# أدوات النشر (اختياري - يمكن عبر GitHub Actions)
npm install -g @railway/cli
npm install -g vercel
npm install -g @lhci/cli
```

### الحسابات السحابية المطلوبة

- [GitHub](https://github.com) — مستودع الكود + CI/CD
- [Vercel](https://vercel.com) — استضافة Frontend
- [Railway](https://railway.app) — استضافة Backend + DB + Redis
- [Cloudflare](https://cloudflare.com) — DNS + R2 + WAF
- [Meta for Developers](https://developers.facebook.com) — WhatsApp Business
- [Firebase Console](https://console.firebase.google.com) — Push Notifications
- [Sentry](https://sentry.io) — تتبع الأخطاء

### النطاق (Domain)

- شراء نطاق مثل `cms.example.com` من Cloudflare Registrar أو Namecheap
- إعداد DNS records:
  ```
  A     app.cms.example.com    → Vercel
  A     api.cms.example.com    → Railway
  A     admin.cms.example.com  → Vercel (future)
  A     cdn.cms.example.com    → Cloudflare R2
  ```

---

## 3. النشر المحلي (Docker Compose)

### الإعداد الأولي

```bash
# 1. استنساخ المستودع
git clone https://github.com/your-org/cms-platform.git
cd cms-platform

# 2. إعداد متغيرات البيئة
cp .env.example .env
# عدّل القيم في .env حسب احتياجك

# 3. تشغيل سكريبت الإعداد
./deploy/scripts/setup-dev.sh
```

### تشغيل البيئة الكاملة

```bash
# تشغيل جميع الخدمات
docker compose up -d

# عرض السجلات
docker compose logs -f api
docker compose logs -f web

# إيقاف
docker compose down

# إيقاف مع حذف البيانات (احذر!)
docker compose down -v
```

### تشغيل خدمات التطوير الإضافية (pgAdmin + Redis Insight)

```bash
docker compose --profile tools up -d
# pgAdmin:      http://localhost:5050  (admin@cms.local / admin)
# Redis Insight: http://localhost:8001
```

### الوصول للخدمات محلياً

| الخدمة | URL | بيانات الدخول |
|--------|-----|--------------|
| Frontend | http://localhost:5173 | - |
| API | http://localhost:8080 | - |
| Swagger | http://localhost:8080/swagger | - |
| Health | http://localhost:8080/health | - |
| PostgreSQL | localhost:5432 | cms / cms_password_dev |
| Redis | localhost:6379 | redis_password_dev |
| pgAdmin | http://localhost:5050 | admin@cms.local / admin |

---

## 4. نشر Backend على Railway

### الخطوة 1: إنشاء مشروع Railway

```bash
# تثبيت Railway CLI
npm install -g @railway/cli

# تسجيل الدخول
railway login

# إنشاء مشروع جديد
railway init
# اختر: "Empty Project"
# اسم المشروع: cms-production
```

### الخطوة 2: إضافة قاعدة البيانات + Redis

```bash
# إضافة PostgreSQL
railway add --plugin postgresql
# احفظ DATABASE_URL من المتغيرات

# إضافة Redis
railway add --plugin redis
# احفظ REDIS_URL من المتغيرات
```

### الخطوة 3: ربط المستودع ونشر API

```bash
# ربط GitHub repo
railway link

# نشر Backend
railway up
# Railway سيكتشف Dockerfile تلقائياً
```

### الخطوة 4: إعداد متغيرات البيئة

في Railway Dashboard → Variables، أضف:

```env
# Connection Strings (تلقائي من Railway)
ConnectionStrings__PostgreSQL=${{Postgres.DATABASE_URL}}
ConnectionStrings__Redis=${{Redis.REDIS_URL}}

# JWT (مهم! استخدم 64+ حرف عشوائي)
Jwt__Secret=<استخدم: openssl rand -base64 64>
Jwt__Issuer=CMS
Jwt__Audience=CMS-Users
Jwt__AccessTokenExpiryMinutes=15
Jwt__RefreshTokenExpiryDays=7

# CORS
Cors__StudentApp=https://app.cms.example.com
Cors__AdminApp=https://admin.cms.example.com

# Cloudflare R2
Cloudflare__R2__AccountId=your-account-id
Cloudflare__R2__AccessKey=your-access-key
Cloudflare__R2__SecretKey=your-secret-key
Cloudflare__R2__BucketName=cms-files-production
Cloudflare__R2__PublicUrl=https://cdn.cms.example.com

# WhatsApp
WhatsApp__Token=your-whatsapp-token
WhatsApp__PhoneNumberId=your-phone-id

# Firebase
Firebase__ProjectId=cms-prod

# Environment
ASPNETCORE_ENVIRONMENT=Production
PORT=8080
```

### الخطوة 5: إعداد Domain مخصص

```bash
# في Railway Dashboard → Settings → Networking
# Generate Domain → ستحصل على: cms-production.up.railway.app
# Custom Domain: api.cms.example.com
# أضف CNAME record في Cloudflare DNS
```

### الخطوة 6: التحقق من النشر

```bash
# Health check
curl https://api.cms.example.com/health
# المتوقع: {"status":"Healthy","duration":"00:00:00.0123"}

# Live check
curl https://api.cms.example.com/health/live
# المتوقع: 200 OK

# Ready check
curl https://api.cms.example.com/health/ready
# المتوقع: 200 OK (يتحقق من PostgreSQL + Redis)
```

---

## 5. نشر Frontend على Vercel

### الخطوة 1: إنشاء مشروع Vercel

```bash
# تثبيت Vercel CLI
npm install -g vercel

# تسجيل الدخول
vercel login

# من مجلد المشروع
cd apps/student-web
vercel
```

### الخطوة 2: إعداد المتغيرات البيئية

في Vercel Dashboard → Project → Settings → Environment Variables:

```env
VITE_API_URL=https://api.cms.example.com/api/v1
VITE_APP_ENV=production
VITE_APP_VERSION=1.0.0
VITE_SENTRY_DSN=https://xxx@sentry.io/frontend
```

### الخطوة 3: إعداد Build

ملف `vercel.json` موجود بالفعل في `apps/student-web/vercel.json` ويحتوي على:
- Build command: `pnpm build`
- Output directory: `dist`
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- SPA rewrites (لـ React Router)
- Cache headers (assets immutable لمدة سنة)

### الخطوة 4: ربط Domain مخصص

```bash
# في Vercel Dashboard → Project → Settings → Domains
# أضف: app.cms.example.com
# أضف CNAME record في Cloudflare DNS:
# app.cms.example.com → cname.vercel-dns.com
```

### الخطوة 5: النشر للإنتاج

```bash
# نشر production
cd apps/student-web
vercel --prod

# أو من جذر المشروع
vercel --prod --cwd apps/student-web
```

---

## 6. إعداد Cloudflare R2

### الخطوة 1: إنشاء Bucket

1. سجّل دخول إلى [Cloudflare Dashboard](https://dash.cloudflare.com)
2. اذهب إلى **R2 Object Storage** → **Create bucket**
3. اسم Bucket: `cms-files-production`
4. الموقع: Auto (أو الأقرب لمستخدميك)

### الخطوة 2: إنشاء API Token

1. اذهب إلى **R2** → **Manage R2 API Tokens**
2. **Create API token**
3. الصلاحيات:
   - Object Read & Write
   - Bucket: `cms-files-production`
4. احفظ:
   - `Access Key ID`
   - `Secret Access Key`
   - `Account ID` (من يمين الصفحة)

### الخطوة 3: إعداد Public Access

```bash
# في R2 → Bucket → Settings → Public Access
# Custom Domain: cdn.cms.example.com
# Cloudflare سيضيف CNAME تلقائياً
```

### الخطوة 4: التحقق

```bash
# رفع ملف تجريبي
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/{account_id}/r2/buckets/cms-files-production/objects/test.txt" \
  -H "Authorization: Bearer {token}" \
  -d "Hello CMS"

# التحقق من الوصول العام
curl https://cdn.cms.example.com/test.txt
# المتوقع: Hello CMS
```

---

## 7. إعداد WhatsApp Business API

### الخطوة 1: إنشاء تطبيق Meta

1. اذهب إلى [Meta for Developers](https://developers.facebook.com)
2. **My Apps** → **Create App**
3. النوع: **Business**
4. أضف منتج: **WhatsApp Business Platform**

### الخطوة 2: الحصول على Token

1. في إعدادات التطبيق → **WhatsApp** → **API Setup**
2. احفظ:
   - `Permanent Access Token`
   - `Phone Number ID`
   - `WhatsApp Business Account ID`

### الخطوة 3: تسجيل القالب (Template)

```json
{
  "name": "cms_otp",
  "language": "ar",
  "category": "AUTHENTICATION",
  "components": [
    {
      "type": "BODY",
      "text": "رمز التحقق الخاص بك في منصة CMS هو: {{1}}"
    }
  ]
}
```

### الخطوة 4: اختبار

```bash
curl -X POST "https://graph.facebook.com/v18.0/{phone_id}/messages" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "9665XXXXXXXX",
    "type": "template",
    "template": {
      "name": "cms_otp",
      "language": {"code": "ar"},
      "components": [{
        "type": "body",
        "parameters": [{"type": "text", "text": "1234"}]
      }]
    }
  }'
```

---

## 8. إعداد Firebase (Push Notifications)

### الخطوة 1: إنشاء مشروع Firebase

1. اذهب إلى [Firebase Console](https://console.firebase.google.com)
2. **Add project** → اسم: `cms-production`
3. فعّل **Cloud Messaging**

### الخطوة 2: الحصول على Service Account Key

1. **Project Settings** → **Service Accounts**
2. **Generate new private key** → تنزيل JSON
3. احفظ محتوى JSON كـ `FIREBASE_SERVICE_ACCOUNT` في Railway

### الخطوة 3: إعداد Web Push

1. **Project Settings** → **Cloud Messaging**
2. احفظ `Web Push certificates` (VAPID keys)
3. أضف في Frontend:
   ```env
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=cms-prod.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=cms-production
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:123:web:abc
   VITE_FIREBASE_VAPID_KEY=BJxxx...
   ```

---

## 9. إعداد Sentry (Error Monitoring)

### الخطوة 1: إنشاء مشروع Sentry

1. اذهب إلى [Sentry](https://sentry.io) → **New Project**
2. أنشئ مشروعين:
   - `cms-backend` (Platform: .NET)
   - `cms-frontend` (Platform: React)

### الخطوة 2: Backend Integration

```bash
# في Railway Variables
Sentry__Dsn=https://xxx@sentry.io/backend
Sentry__Environment=production
Sentry__SendDefaultPii=true
```

### الخطوة 3: Frontend Integration

```bash
# في Vercel Environment Variables
VITE_SENTRY_DSN=https://xxx@sentry.io/frontend
VITE_SENTRY_ENVIRONMENT=production
```

### الخطوة 4: إعداد Source Maps (Vercel)

```bash
# vercel.json مُعد تلقائياً لرفع source maps
# Sentry سيحلل الأخطاء بالملفات الأصلية
```

---

## 10. إدارة قاعدة البيانات (Migrations)

### توليد Migration جديدة

```bash
cd apps/api
dotnet ef migrations add AddNewFeature \
  --project src/CMS.Infrastructure \
  --startup-project src/CMS.Api
```

### تطبيق Migrations محلياً

```bash
# عبر Docker
docker compose exec api dotnet ef database update \
  --project src/CMS.Infrastructure \
  --startup-project src/CMS.Api

# أو محلياً
cd apps/api
dotnet ef database update \
  --project src/CMS.Infrastructure \
  --startup-project src/CMS.Api \
  --connection "Host=localhost;Port=5432;Database=cms;Username=cms;Password=cms_password_dev"
```

### تطبيق Migrations على الإنتاج

#### الطريقة 1: عبر GitHub Actions (موصى به)

```bash
# اذهب إلى GitHub → Actions → Database Migration → Run workflow
# اختر: environment=production, action=apply
```

#### الطريقة 2: عبر Railway CLI

```bash
# احصل على connection string من Railway
railway variables | grep DATABASE_URL

# طبّق الـ migration
cd apps/api
dotnet ef database update \
  --project src/CMS.Infrastructure \
  --startup-project src/CMS.Api \
  --connection "Host=...;Port=5432;Database=...;Username=...;Password=..."
```

### التراجع عن Migration

```bash
# التراجع خطوة واحدة
dotnet ef database update PreviousMigrationName \
  --project src/CMS.Infrastructure \
  --startup-project src/CMS.Api \
  --connection "PRODUCTION_CONNECTION_STRING"
```

### النسخ الاحتياطي (Backups)

```bash
# نسخ احتياطي يومي (أضف cron job)
pg_dump "$DATABASE_URL" | gzip > /backups/cms-$(date +%Y%m%d).sql.gz

# الاحتفاظ بآخر 30 يوماً
find /backups -name "cms-*.sql.gz" -mtime +30 -delete

# الاستعادة
gunzip -c /backups/cms-20260731.sql.gz | psql "$DATABASE_URL"
```

---

## 11. CI/CD Pipeline

### نظرة عامة على الـ Pipeline

```yaml
Push to develop →  Staging Deployment
   │
   ├─ Backend Tests (xUnit)
   ├─ Frontend Tests (Vitest)
   ├─ Security Scan (CodeQL + Trivy)
   ├─ Lighthouse CI
   ├─ Docker Build & Push
   ├─ Deploy API to Railway (Staging)
   └─ Deploy Frontend to Vercel (Staging)

Push to main →  Production Deployment
   │
   ├─ (نفس الفحوصات السابقة)
   ├─ Deploy API to Railway (Production)
   ├─ Deploy Frontend to Vercel (Production)
   ├─ Notify Sentry of new release
   └─ Slack notification
```

### إعداد GitHub Secrets

في GitHub Repository → Settings → Secrets and variables → Actions:

```env
# Railway
RAILWAY_TOKEN= railway-token
RAILWAY_API_SERVICE_STAGING= service-id
RAILWAY_API_SERVICE_PRODUCTION= service-id

# Vercel
VERCEL_TOKEN= vercel-token
VERCEL_ORG_ID= team-id
VERCEL_TEAM_ID= team-id
VERCEL_PROJECT_ID_STAGING= project-id
VERCEL_PROJECT_ID_PRODUCTION= project-id

# Sentry
SENTRY_AUTH_TOKEN= sentry-token

# Slack
SLACK_WEBHOOK_URL= https://hooks.slack.com/services/...

# Lighthouse
LHCI_GITHUB_APP_TOKEN= lhci-token
```

### تشغيل النشر يدوياً

```bash
# من GitHub UI
# Actions tab → CI/CD Pipeline → Run workflow
# اختر environment: staging أو production
```

---

## 12. المراقبة والتنبيهات

### Health Checks (مدمجة)

| Endpoint | الغرض | التكرار |
|----------|-------|---------|
| `/health/live` | التحقق من أن العملية حية | كل 30 ثانية |
| `/health/ready` | التحقق من PostgreSQL + Redis | كل 30 ثانية |
| `/health` | شامل + معلومات | عند الطلب |

### Uptime Monitoring (Better Stack)

1. اذهب إلى [Better Stack](https://betterstack.com)
2. أنشئ Monitor:
   - URL: `https://api.cms.example.com/health`
   - التكرار: كل 30 ثانية
   - التنبيه: Slack + Email + SMS

### GitHub Actions Health Check

ملف `.github/workflows/health-check.yml` يعمل كل 5 دقائق:
- فحص API
- فحص Frontend
- قياس زمن الاستجابة
- تنبيه Slack عند الفشل

### Logs Aggregation

```bash
# Backend logs (Railway)
railway logs --service cms-api

# Frontend logs (Vercel)
vercel logs https://app.cms.example.com

# PostgreSQL logs
docker compose logs postgres

# Sentry Errors
# https://sentry.io/organizations/cms/issues/
```

---

## 13. الاستعادة من الكوارث

### خطة استمرارية الأعمال (BCP)

| السيناريو | الإجراء | RTO |
|----------|---------|-----|
| فشل Railway | إعادة النشر من آخر صورة Docker ناجحة | 5 دقائق |
| فشل PostgreSQL | استعادة من آخر backup | 30 دقيقة |
| فشل Vercel | إعادة النشر من Git | 3 دقائق |
| فشل Cloudflare R2 | نقل الملفات إلى bucket احتياطي | 1 ساعة |
| فقدان البيانات | استعادة من backup يومي | 1 ساعة |

### قائمة استعادة سريعة

```bash
# 1. استعادة PostgreSQL من backup
gunzip -c /backups/cms-20260731.sql.gz | psql "$DATABASE_URL"

# 2. إعادة نشر Backend
railway up --service cms-api-production --detach

# 3. إعادة نشر Frontend
cd apps/student-web && vercel --prod

# 4. التحقق من Health
curl https://api.cms.example.com/health
curl -I https://app.cms.example.com

# 5. تنبيه الفريق
# curl -X POST $SLACK_WEBHOOK -d '{"text":"🚨 Production restored"}'
```

---

## 14. قائمة التحقق قبل الإطلاق

### الأمان

- [ ] تغيير `JWT_SECRET` إلى قيمة عشوائية 64+ حرف
- [ ] تغيير جميع كلمات المرور الافتراضية
- [ ] تفعيل HTTPS فقط (HSTS preload)
- [ ] إعداد CSP headers
- [ ] تفعيل Rate Limiting
- [ ] مراجعة CORS (لا تستخدم `*`)
- [ ] حذف Swagger من الإنتاج
- [ ] تفعيل Audit Logging

### الأداء

- [ ] تفعيل Gzip/Brotli compression
- [ ] إعداد CDN caching للـ assets
- [ ] تفعيل Lazy loading للصور
- [ ] فحص Lighthouse score > 90
- [ ] تفعيل PWA offline mode
- [ ] اختبار أداء API (p95 < 200ms)

### قاعدة البيانات

- [ ] تطبيق جميع الـ migrations
- [ ] إضافة الفهارس الموصى بها
- [ ] تفعيل connection pooling
- [ ] إعداد Backups اليومية
- [ ] اختبار استعادة backup

### المراقبة

- [ ] إعداد Sentry (Backend + Frontend)
- [ ] إعداد Better Stack uptime monitoring
- [ ] إعداد Slack alerts
- [ ] اختبار workflow الصحة
- [ ] تفعيل Log aggregation

### الـ Code

- [ ] اجتياز جميع الاختبارات (Backend + Frontend)
- [ ] فحص CodeQL بدون Critical/High
- [ ] مراجعة TODO/FIXME قبل الإطلاق
- [ ] تحديث CHANGELOG.md
- [ ] Tag الإصدار: `git tag v1.0.0`

### ما بعد الإطلاق

- [ ] مراقبة السجلات لمدة 24 ساعة
- [ ] اختبار جميع الـ endpoints رئيسية
- [ ] مراقبة Sentry للأخطاء الجديدة
- [ ] مراقبة أداء قاعدة البيانات
- [ ] إعداد On-call rotation
- [ ] توثيق أي مشاكل في Postmortem

---

## 📞 جهات الاتصال للطوارئ

| الدور | المسؤول |联系方式 |
|------|---------|---------|
| Tech Lead | @tech-lead | Slack: #tech-oncall |
| DevOps | @devops | Slack: #devops-oncall |
| Database Admin | @dba | PagerDuty |
| Security | @security | security@cms.example.com |

---

**آخر مراجعة**: Phase 31 — 2026-07-31
**المراجع التالي**: Phase 32 — Production Release
