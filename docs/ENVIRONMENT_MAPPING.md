# Environment & API Origin Mapping — Admin Web

**Verified live on 2026-11-27** (Vercel API + Render API + deployed bundle inspection).

## Current platform reality

| Surface | Host | Notes |
| --- | --- | --- |
| Admin Web (production) | `https://cms-platform-manus-admin-web.vercel.app` | Vercel project `cms-platform-manus-admin-web` (framework: Vite, root: `apps/admin-web`, production branch: `main`, auto-deploy on push to `main`) |
| Admin Web (preview) | per-PR `*.vercel.app` preview URLs | Built from the PR head |
| Student Web | `https://cms-platform-manus-student-web.vercel.app` | Vercel project `cms-platform-manus-student-web` |
| API (the only one that exists) | `https://cms-api-preview.onrender.com` | Render service `cms-api-preview` (branch `main`, autoDeploy yes, Docker, health `/health/live`) |

**Important:** there is exactly ONE API service today. Its name contains
`preview`, and the Admin Web (both production and preview targets) points at it
via the `VITE_API_BASE_URL` environment variable. This is NOT a silent
production→preview redirect bug — it is the only deployed API. The fix shipped
with the environment-labeling wave is **honesty**: the UI derives its label
from the configured origin instead of hardcoding a production claim.

## How the label is derived (no secrets involved)

`apps/admin-web/src/lib/environment.ts` classifies the configured API origin:

| Origin contains | Label shown | Style |
| --- | --- | --- |
| `localhost`, `127.0.0.1`, `*.local` | بيئة محلية / Local environment | info |
| a `preview` host segment (e.g. `cms-api-preview.onrender.com`) | بيئة المعاينة / Preview environment | warning |
| any other parsable origin | بيئة الإنتاج / Production environment | teal |
| unparsable configuration | بيئة غير محددة / Unlabeled environment | neutral |

The label appears in two places, both driven by the same derivation:

1. **Login screen** — the environment line (label + public origin host).
2. **Topbar environment chip** (`data-testid="environment-chip"`) — always
   visible next to the connectivity indicator; the tooltip shows the public
   API origin host. Only the public host is ever displayed — never tokens,
   paths, or connection strings.

## Required mapping (owner decision pending)

| Deployment | Should call | Status |
| --- | --- | --- |
| Production Admin | Production API | **Unavailable** — no production API service exists yet. Owner must provision one (or rename/promote the current service) and set the Production `VITE_API_BASE_URL` on the Vercel project. |
| Preview Admin | Preview API (`https://cms-api-preview.onrender.com`) | Implemented — current behavior. |
| Local Admin | Local dev API or explicitly configured preview API | Implemented — set `VITE_API_BASE_URL` in `apps/admin-web/.env.local` (never committed). |

Until a production API exists, the platform is honestly labeled
«بيئة المعاينة» everywhere the preview origin is configured. The Admin Web
refuses to guess: if `VITE_API_BASE_URL` is unparsable, it labels
«بيئة غير محددة» rather than assuming production.

## Configuration strategy (single knob)

- The ONLY configuration knob is the Vercel environment variable
  `VITE_API_BASE_URL` (declared in the Vercel project settings; the source
  tree intentionally carries no hardcoded production URL).
- The Vite fallback in `src/lib/api.ts` exists for local development only and
  points at the same single API.
- Changing environments = changing this variable in the Vercel dashboard for
  the correct target (Production / Preview) — no code changes, no commits,
  and secret values stay in the provider's secret store.

## Server Dashboard provider credentials (separate concern)

The read-only Servers Dashboard (`/servers`) reads provider status from the
API. Provider credentials are read from the Render service environment
(`MONITORING_*` names — see `render.yaml`). They are NOT set today, so all
provider cards answer honestly with «بيانات الاعتماد غير مُهيّأة». The owner
adds them through the Render dashboard; values must never be committed.
