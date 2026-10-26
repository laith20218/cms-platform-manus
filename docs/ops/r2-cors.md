# R2 Bucket CORS Policy — One-Time Operator Setup

> Push 10.0 (§1.A), **updated by the Push 10.6 production upload hotfix**. This is a
> **storage-side** configuration, performed once by the operator in the provider console
> — it is NOT code and NOT a migration. The policy below applies whenever the media
> bucket is under our direct Cloudflare R2 account. While storage runs on Upstash Blob
> (bucket inside Upstash's R2 account), the same policy must be requested through
> Upstash support — Upstash exposes no CORS settings surface today (see media-cors.md §4).

## Why

Two browser flows talk to the storage host (`*.r2.cloudflarestorage.com`) directly:

1. **Playback (student web + admin web)** — `POST /api/v1/media/{assetType}/{assetId}/playback-url`
   hands the browser a presigned GET URL; the player then streams video/audio bytes
   directly from storage (with HTTP Range for seeking) instead of proxying through the
   API.
2. **Uploads (admin web)** — course-episode multipart PUTs go **browser-direct** to the
   presigned UploadPart URLs (`initiate-upload` → 64 MB parts). A cross-origin PUT always
   triggers a CORS preflight, and every part's completion needs the `ETag` response
   header readable by JS — without `ExposeHeaders: ETag` the upload cannot complete even
   when the PUT itself succeeds. (This is the exact failure the Push 10.6 hotfix was
   issued for: production uploads froze at 0% with «تعذّر رفع الجزء 1 بعد 3 محاولات».)

Without this policy the browser blocks the media fetch AND the part PUTs — even though
the presigned URLs themselves are valid (Cloudflare R2 docs: "Without a CORS policy,
browser-based uploads and downloads using presigned URLs will fail").

Documents (PDF/TXT/HTML) are unaffected: they keep using the same-origin
`GET /api/v1/library/{id}/content` channel, which needs no CORS.

## Policy (paste into the R2 dashboard → bucket → Settings → CORS Policy → JSON tab)

```json
[
  {
    "AllowedOrigins": [
      "https://cms-platform-manus-student-web.vercel.app",
      "https://cms-platform-manus-admin-web.vercel.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [
      "ETag",
      "Content-Range",
      "Accept-Ranges",
      "Content-Length",
      "Content-Type"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

Field notes:
- **AllowedOrigins** — student web, admin web (both production Vercel origins), and the
  local dev server (Vite default port 5173). Never use `"*"` with credentials-bearing flows.
- **AllowedMethods** — `GET` + `HEAD` for playback; **`PUT` for the browser-direct
  multipart part uploads and the library single-PUT presigns** (added by the 10.6
  hotfix — the 10.0 policy predicted this: "revisit before Wave 10.2 upload work if PUT
  starts failing preflights"). `DELETE`/`POST` never go browser-direct.
- **AllowedHeaders** — `*`: part PUTs carry the blob's `Content-Type` (a non-simple
  header that joins the preflight); the presigns sign no request headers, so nothing
  narrower is needed.
- **ExposeHeaders** — `ETag` **first and non-negotiable**: multipart completion needs
  every part's ETag readable by JS (`xhr.getResponseHeader('ETag')`); `Content-Range` and
  `Accept-Ranges` power seek/progress logic; `Content-Length`/`Content-Type` for buffer
  sizing and MIME checks.
- **MaxAgeSeconds 3600** — caches the preflight for an hour; playback sessions issue
  many range requests and must not re-preflight each one.

## Upstash Blob caveat (current production storage)

The production bucket lives inside **Upstash's R2 account** — we cannot paste this JSON
into any dashboard we own. Route for today: **email Upstash support with the JSON
above** verbatim (they apply bucket CORS on request; their documented default is
"allow every origin", but the 10.6 production incident proves PUT preflights/ETag
exposure are NOT currently satisfied for our bucket). The code-side mitigations that
shipped with the 10.6 hotfix (ETag recovery via server-side ListParts, graceful
multipart-status) keep the admin panel from freezing either way, but **completing an
upload still requires the CORS fix** when the preflight itself is rejected.

## Verification (after applying)

```bash
curl -sS -D - -o /dev/null \
  -H "Origin: https://cms-platform-manus-admin-web.vercel.app" \
  -X OPTIONS \
  -H "Access-Control-Request-Method: PUT" \
  "https://<r2-host>/<bucket>/<key>"
```
Expect `Access-Control-Allow-Origin: https://cms-platform-manus-admin-web.vercel.app`
and `Access-Control-Allow-Methods` containing `PUT`. (CORS headers are ONLY returned
when the request carries `Origin`/preflight headers — a bare curl shows none either way;
Cloudflare R2 documented behavior.)
For the playback Range + CORS check use `docs/ops/verify-range.sh`.

## Wrangler alternative (owned R2 accounts)

```bash
npx wrangler r2 bucket cors set <BUCKET_NAME> --file cors.json
npx wrangler r2 bucket cors list <BUCKET_NAME>
```

*No secrets in this file. Replace the admin-web placeholder before applying.*
