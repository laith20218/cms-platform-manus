# Gate A — Credential Rotation Runbook (PR-0)

> Admin Command Center program — credential rotation gate and deployment-safety verification.
> This document contains variable **names only**. It never contains, and must never be given, secret values.

## 1. Incident and rule

Provider API tokens, an Upstash blob token name, and test-account credentials were previously pasted into
chat conversations and older reports. **All of them must be treated as compromised.**

Operating rules (enforced for the whole program):

1. Never print, store, commit, echo, screenshot, or transmit a secret value — not in chat, GitHub, a PR,
   a terminal command visible in logs, a report, or a browser field controlled by this program.
2. Replacement values are entered **by the owner only**, directly in the provider dashboard
   (Render Secret Environment Variables UI, Vercel project settings, Neon console, GitHub developer settings).
3. Verification performed by this program reports exactly three states per variable:
   `configured` / `missing` / `invalid`. Never values or partial values.
4. Monitoring credentials must be **separate** from runtime credentials (JWT secret, database connection
   string, storage keys, deployment credentials).

## 2. Compromised credential inventory (names only)

| # | Credential (name / nature) | Where exposed | Rotation target |
|---|---|---|---|
| 1 | `GITHUB_TOKEN` — fine-grained PAT for `laith20218/cms-platform-manus` | Chat + old reports | New fine-grained PAT, repo-scoped, read-only metadata/contents/actions/PRs |
| 2 | `RENDER_API_TOKEN` — Render API key (`rnd_…` shape) | Chat + old reports | New workspace-scoped key, read-only for services/deploys/events |
| 3 | `VERCEL_ADMIN_TOKEN` — Vercel project token for `cms-platform-manus-admin-web` | Chat | New project-scoped token, read-only |
| 4 | `VERCEL_STUDENT_TOKEN` — Vercel project token for `cms-platform-manus-student-web` | Chat | New project-scoped token, read-only |
| 5 | `NEON_API_KEY` — Neon API key (`napi_…` shape) | Chat | New project-scoped Neon key |
| 6 | `UPSTASH_BLOB_TOKEN` — Upstash Blob token name (value was empty in the exposure; provider retired by PUSH 10.9) | Chat | No action beyond revoking anything remaining in the Upstash console |
| 7 | Admin account credential (email + password) | Chat | Owner changes the password in the product; consider forcing session revocation |
| 8 | Student demo account credential (phone + password) | Chat | Owner changes the password in the product |
| 9 | Render runtime secret values if any were ever pasted anywhere (see §4 name list) | — | Rotate in Render Secret Environment Variables UI |

## 3. Gate A verification — 2026-11-25 baseline (status only)

Performed read-only against live providers from the operations environment. Values were never read into
any report (the env-var API responses were filtered to names only at the jq layer).

| Provider / check | Method (read-only) | Status |
|---|---|---|
| GitHub PAT | `GET /repos/laith20218/cms-platform-manus`, `GET /commits/main`, `GET /pulls/211` | **configured / valid** (token works; repo write scope confirmed — used only for branches/PRs in this program). Exposed ⇒ rotate |
| GitHub repo state | `main` HEAD = `c9547ac67b7e59ef37c7ec6aaf07ec9e851a3a96`; PR #211 merged (2026-11-25T21:41Z) | Verified — matches the claimed checkpoint |
| Render API key | `GET /v1/services/{id}` | **configured / valid**. Service `cms-api-preview` `not_suspended`, plan `free`, autoDeploy=yes from `main`. Exposed ⇒ rotate |
| Render latest deploy | `GET /v1/services/{id}/deploys` | **live** at commit `c9547ac…` (deploy `dep-dc3lbvjrjlhs73eodd4g`) — production is exactly `main` HEAD |
| Render env names (31, names only) | `GET /v1/services/{id}/env-vars` | See §4 |
| Vercel admin token | `GET /v9/projects` | **configured / valid**, project-scoped: sees only `cms-platform-manus-admin-web` (`prj_9VpClN59VenE4triif9b73gFdZ4T`). Exposed ⇒ rotate |
| Vercel admin deploy | `GET /v6/deployments` | **READY** at commit `c9547ac…` from `main` |
| Vercel student token | `GET /v9/projects` | **configured / valid**, project-scoped: sees only `cms-platform-manus-student-web` (`prj_kNQITsgGqNkzxItqay8v4EbPyqDR`). Exposed ⇒ rotate |
| Vercel student deploy | `GET /v6/deployments` | **READY** at commit `c9547ac…` from `main` |
| Vercel frontend env names | `GET /v9/projects/{id}/env` | admin-web: `VITE_API_BASE_URL`; student-web: `VITE_API_URL` — non-secret public base URLs only. No secrets in frontend env (correct) |
| Neon API key | `GET /v2/projects` | **present / validity unverifiable from ops env**: `api.neon.tech` currently publishes no A/AAAA record (NODATA via 1.1.1.1 and dns.google, method sanity-checked against `api.github.com`). The key was **not** routed through any third-party relay to force verification. Exposed ⇒ rotate |
| Neon DB health (indirect) | `GET https://cms-api-preview.onrender.com/health/ready` | **200 OK** — the Npgsql + Upstash Redis ready checks pass in production, so the production database path is healthy |
| API liveness | `GET /health/live` | **200 Healthy** (first hit ~23.5s — free-tier cold start, expected) |
| Web frontends | `GET` both Vercel URLs | **200 / 200** |
| Upstash Blob | retired provider (PUSH 10.9); token value was empty in exposure | **not applicable** — no runtime dependency |
| `MONITORING_*` names on Render | env-var name list | **missing (expected)** — to be introduced with PR-8 (see §5) |
| Hard-delete feature flag | env-var name list + appsettings scan | **missing (defect)** — backend has no kill switch today; corrected in PR-1 |

Conclusion: all four provider surfaces are live and pinned to `main @ c9547ac`, and every exposed
credential is currently **valid** — which is exactly why rotation is urgent: exposure plus validity
equals active risk. No production-connected functional test that depends on these credentials is
performed until the owner confirms rotation.

## 4. Render `cms-api-preview` — verified variable names (never values)

`ASPNETCORE_ENVIRONMENT`, `ASPNETCORE_URLS`, `PORT`, `TZ`,
`ConnectionStrings__PostgreSQL`, `Jwt__Secret`, `Jwt__Issuer`, `Jwt__Audience`,
`Jwt__AccessTokenExpiryMinutes`, `Jwt__RefreshTokenExpiryDays`,
`Cors__StudentApp`, `Cors__AdminApp`,
`Storage__S3__Endpoint`, `Storage__S3__Region`, `Storage__S3__AccessKey`,
`Storage__S3__SecretKey`, `Storage__S3__BucketName` (Backblaze B2 via S3-compatible API — bucket/region live in the Render dashboard),
`Upstash__Redis__RestUrl`, `Upstash__Redis__RestToken`,
`Features__OtpEnabled`, `Features__OfflineEnabled`, `Features__OfflineAesGcmImplemented`,
`Features__OfflineManifestImplemented`, `Features__OfflineKeyReleaseImplemented`,
`Features__OfflinePackageIssuanceImplemented`, `Features__OfflineTrustedClientImplemented`,
`Security__PlayIntegrity__Enabled`,
`Security__Offline__KeyWrappingKey`, `Security__Offline__ManifestSigningKey`,
`Security__Offline__ManifestSigningPrivateKeyPkcs8`, `Security__Entitlements__SigningKey`.

All of the above are **configured** (present and non-empty at the provider). Rotation of the secret
members of this list is recommended if their values were ever exposed anywhere.

## 5. Monitoring secret names to be created by the owner (PR-8 preparation)

Names only. The owner creates these as **Render secret environment values** (or an approved encrypted
secret manager) and fills the values through the provider's secure UI. Nothing here is ever pasted
into chat, GitHub, a PR, or a terminal command.

Non-secret identifiers (safe to document once known):

- `MONITORING_RENDER_WORKSPACE_ID`, `MONITORING_RENDER_SERVICE_ID`
- `MONITORING_VERCEL_TEAM_ID`, `MONITORING_VERCEL_ADMIN_PROJECT_ID`, `MONITORING_VERCEL_STUDENT_PROJECT_ID`
- `MONITORING_NEON_ORG_ID`, `MONITORING_NEON_PROJECT_ID`, `MONITORING_NEON_BRANCH_ID`
- `MONITORING_GITHUB_OWNER`, `MONITORING_GITHUB_REPOSITORY`

Secrets (names only — owner supplies values):

- `MONITORING_RENDER_API_KEY` (workspace-scoped, read-only: services, deployments, events, logs, metrics)
- `MONITORING_VERCEL_ACCESS_TOKEN` (project- or team-scoped to the two CMS projects, narrowest read-only)
- `MONITORING_NEON_API_KEY` (project-scoped; documented caveat: Neon project keys may carry Editor capability — backend restricts usage to fixed read-only status/consumption calls)
- `MONITORING_GITHUB_TOKEN` (fine-grained, this repository only, read-only metadata/contents/actions/checks/PRs)

Minimum-access rules are enforced in code by PR-8 (fixed allowlisted routes per provider, no generic
URL proxy, no provider mutation actions). The dashboard is read-only by design.

## 6. Owner rotation checklist (values entered only in provider dashboards)

1. GitHub — Developer settings → Fine-grained tokens: revoke the exposed PAT; create the replacement
   read-only token (and later the separate `MONITORING_GITHUB_TOKEN`).
2. Vercel — Project settings → Tokens: revoke both exposed project tokens; create read-only replacements
   (one per project, or a narrowly-scoped team token if unavoidable).
3. Render — Account settings → API Keys: revoke the exposed key; create a read-only workspace key.
4. Neon — Console → Account settings → API keys: revoke the exposed key; create a project-scoped replacement.
5. Render — `cms-api-preview` → Environment: rotate any runtime secret whose value may have been
   exposed (`Jwt__Secret`, `ConnectionStrings__PostgreSQL`, `Storage__S3__AccessKey`/`SecretKey`,
   `Upstash__Redis__RestToken`, `Security__Offline__*`, `Security__Entitlements__SigningKey`).
   Coordinate with a maintenance window: JWT secret rotation invalidates active sessions.
6. In-product: change the admin account password and the student demo account password.
7. Reply to the program with a **confirmation only** ("rotation complete for: …"). Never paste values.

After the confirmation, re-run `scripts/ops/verify-provider-config.sh` (PR-0) to flip statuses to
`configured` and only then proceed to production-connected provider tests (PR-8/PR-9 gate).

## 7. Verification tooling

`scripts/ops/verify-provider-config.sh` (added by this PR) performs the same status-only checks on
demand: per-provider `configured / missing / invalid / unreachable` and per-Render-name
`configured / missing`. It filters env-var responses to names at the jq layer and never prints values.
