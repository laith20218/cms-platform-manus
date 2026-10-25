# R2 Bucket CORS Policy — One-Time Operator Setup

> Push 10.0 (§1.A). This is a **storage-side** configuration, performed once by the
> operator in the provider console — it is NOT code and NOT a migration. The policy
> below applies whenever the media bucket is under our direct Cloudflare R2 account.
> While storage runs on Upstash Blob (bucket inside Upstash's R2 account), the same
> policy must be requested through Upstash support — Upstash exposes no CORS settings
> surface today (see media-cors.md §4).

## Why

`POST /api/v1/media/{assetType}/{assetId}/playback-url` hands the browser a presigned
GET URL on the storage host (`*.r2.cloudflarestorage.com`). The browser then streams
video/audio bytes **directly from storage** (with HTTP Range for seeking) instead of
proxying through the API. For that cross-origin fetch to work, the bucket must answer
CORS preflights for the web app origins and expose the player's response headers.
Without this policy the browser blocks the media fetch — even though the presigned URL
itself is valid (Cloudflare R2 docs: "Without a CORS policy, browser-based uploads and
downloads using presigned URLs will fail").

Documents (PDF/TXT/HTML) are unaffected: they keep using the same-origin
`GET /api/v1/library/{id}/content` channel, which needs no CORS.

## Policy (paste into the R2 dashboard → bucket → Settings → CORS Policy → JSON tab)

```json
[
  {
    "AllowedOrigins": [
      "https://cms-platform-manus-student-web.vercel.app",
      "<ADMIN-WEB-VERCEL-URL>",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [
      "Content-Range",
      "Accept-Ranges",
      "ETag",
      "Content-Length",
      "Content-Type"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

Field notes:
- **AllowedOrigins** — student web (given), admin web (**operator: replace
  `<ADMIN-WEB-VERCEL-URL>` with the actual admin deployment origin**), and the local
  dev server (Vite default port 5173). Never use `"*"` with credentials-bearing flows.
- **AllowedMethods** — `GET` + `HEAD` only: playback is read-only; uploads go through
  the API-issued presigned PUTs, which need their own wider policy only if the admin
  web uploads directly from the browser (it does — revisit before Wave 10.2 upload work
  if PUT starts failing preflights).
- **ExposeHeaders** — the player reads these on media responses: `Content-Range` and
  `Accept-Ranges` power seek/progress logic; `ETag` enables cache revalidation;
  `Content-Length`/`Content-Type` for buffer sizing and MIME checks.
- **MaxAgeSeconds 3600** — caches the preflight for an hour; playback sessions issue
  many range requests and must not re-preflight each one.

## Verification (after applying)

```bash
curl -sS -D - -o /dev/null \
  -H "Origin: https://cms-platform-manus-student-web.vercel.app" \
  "<PRESIGNED_URL>"
```
Expect `Access-Control-Allow-Origin` (+ `Access-Control-Expose-Headers`) in the
response. Note: CORS headers are ONLY returned when the request carries `Origin` — a
bare curl shows none either way (Cloudflare R2 documented behavior).
For the full Range + CORS check use `docs/ops/verify-range.sh`.

## Wrangler alternative (owned R2 accounts)

```bash
npx wrangler r2 bucket cors set <BUCKET_NAME> --file cors.json
npx wrangler r2 bucket cors list <BUCKET_NAME>
```

*No secrets in this file. Replace the admin-web placeholder before applying.*
