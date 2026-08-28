# Deployment evidence — 2026-08-28

## Directly verified public deployments

| Surface | URL | Observed state | Evidence method |
|---|---|---|---|
| Student web | https://cms-platform-manus-student-web.vercel.app | Reachable; redirects to `/login`; Arabic student-login interface renders. | Direct browser visit at 2026-08-28 00:15 sandbox session time. |
| Admin web | https://cms-platform-manus-admin-web.vercel.app | Reachable; Arabic administrative-login interface renders. | Direct browser visit at 2026-08-28 00:15 sandbox session time. |

## Vercel account evidence

The authenticated Vercel integration lists two Git-connected projects for repository `laith20218/cms-platform-manus`:

- `cms-platform-manus-student-web` — project ID `prj_kNQITsgGqNkzxItqay8v4EbPyqDR`.
- `cms-platform-manus-admin-web` — project ID `prj_9VpClN59VenE4triif9b73gFdZ4T`.

Both projects are linked to GitHub repository `laith20218/cms-platform-manus`. The integration permits listing projects but returns `403 Forbidden` when requesting deployments, and `404 Not Found` when reading the student project directly. Therefore, the public URLs establish reachability but Vercel deployment status, commit SHA, build log, and custom domain bindings are not independently verifiable from this session.

## Source-of-truth qualification

`PROJECT_STATUS.md` states `PRODUCTION NO-GO — BLOCKERS REMAIN`, explaining that local Web/Backend integrity is proven but external staging/production evidence, TLS/DNS, actual R2, secret rotation, Browser E2E, monitoring, backups, and CI evidence remain blocked. It is more current than historical claims of production readiness.

## Preliminary hosting conclusion

Vercel is the only platform externally verified as currently serving this CMS project's public web applications. No live backend hosting provider, database service, Redis service, object-storage endpoint, or custom domain has been verified yet. Repository configuration contains historical/planned Railway and Cloudflare R2 references, as well as a preview fallback at Render; these references do not prove that any of those services are currently in use.

## Additional verified findings

- The latest scheduled GitHub Actions `Health Check` run (#261; 2026-08-27; commit `d6f5d85`) failed **before its job started**. GitHub’s annotation states that recent account payments failed or the spending limit needs to be increased. This is a GitHub Actions account-billing/spending-limit gate, not an application health response.
- The currently served JavaScript bundles embed `https://cms-api-preview.onrender.com/api/v1` for the student app and `https://cms-api-preview.onrender.com` for the admin app. This was extracted directly from each public Vercel bundle on 2026-08-28.
- `https://api.cms.example.com/health/live` does not resolve publicly. The configured Render preview root health endpoint timed out; `/api/v1/health/live` returns HTTP 404. This supports the repository's current `NO-GO` status and demonstrates that the advertised `api.cms.example.com` custom-domain endpoint is not deployed.
- The connected Neon account contains an active, free-plan project named `cms-production` (`patient-dew-46888054`) in `aws-eu-central-1`; its 31 tables match the CMS data model. Aggregate live-data inspection found 1 administrator, 2 students, 1 university, 3 subjects, 2 lectures, 0 questions, 0 exams, 0 library files, 0 notifications, and 84 security-log records. This confirms Neon is genuinely being used for this platform database, but does not by itself prove which backend process has the current connection string.
- No Upstash connection is configured in this session, so Upstash usage cannot be independently verified here. It remains a configured/planned Redis adapter in the repository's environment template.
