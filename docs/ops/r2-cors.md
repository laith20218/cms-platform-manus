# R2 Bucket CORS Policy — One-Time Operator Setup

> Push 10.0 (§1.A), **updated by the Push 10.6 production upload hotfix**, and
> **migrated to Backblaze B2 by PUSH 10.9**. This is a
> **storage-side** configuration, performed once by the operator in the provider console
> — it is NOT code and NOT a migration. ~~While storage runs on Upstash Blob (bucket
> inside Upstash's R2 account), the same policy must be requested through Upstash
> support~~ — that era ended with 10.9: the media bucket now lives in OUR OWN Backblaze
> B2 account (`CMSmedia` @ `eu-central-003`), so the operator applies the policy
> directly in the B2 console (see the B2 section below).

## Why

Two browser flows talk to the storage host directly (host is now
>`s3.eu-central-003.backblazeb2.com` after PUSH 10.9; previously
>`*.r2.cloudflarestorage.com`):

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

## Backblaze B2 application (PUSH 10.9 — current production storage)

The `CMSmedia` bucket is under OUR Backblaze account — no support email needed anymore.
Apply the same policy JSON above (B2's S3-compatible CORS follows the same rule shape)
through either surface:

1. **B2 console** — bucket `CMSmedia` → *Bucket Settings* → *CORS Rules* → add each
   rule (the console presents the JSON fields as a form; the values map 1:1).
2. **b2 CLI**:
   ```bash
   b2 update-bucket --cors-rules cors.json CMSmedia allPrivate
   ```
   (`cors.json` = the policy JSON above; the bucket type must be restated on update.)
3. **S3-compatible API** — `PutBucketCors` against
   `https://s3.eu-central-003.backblazeb2.com` with the B2 application keys
   (the AWS CLI's `aws s3api put-bucket-cors` works with `--endpoint-url` set).

B2-specific notes:
- **`"*"` is only valid as a FULL value** in `AllowedOrigins`/`AllowedHeaders` — B2
  rejects partial wildcards like `https://*.vercel.app`. Our policy uses exact
  hostnames, so this is a non-issue.
- **Mixed-case bucket name** (`CMSmedia`) is legal on B2 but ONLY addressable
  path-style (`https://s3.<region>.backblazeb2.com/CMSmedia/<key>`) — which is exactly
  how the API's `AmazonS3Config` is pinned (`ForcePathStyle = true`, PUSH 10.9).
- The `AllowedMethods`/`ExposeHeaders` requirements are unchanged from the R2 era:
  `GET`+`HEAD` for playback (Range streaming), `PUT` for the browser-direct
  single-PUT course uploads and library presigns; `ETag` exposure stays harmless
  (no longer required to complete a 10.8f single-PUT upload, but kept for the
  same-origin library flow's future needs and parity with the R2 policy).
- Presigned URLs minted by `S3StorageService` now carry the B2 host + path-style
  bucket — the Render log line `Single-PUT presign: …` (query redacted) is the
  fastest way to confirm the endpoint switch took effect in production.

## Upstash Blob caveat (RETIRED by PUSH 10.9 — historical)

The production bucket lived inside **Upstash's R2 account** until PUSH 10.9 retired
it (1GB free-tier limit hit — account now read-only; storage moved to Backblaze B2,
bucket `CMSmedia`). The historical route — email Upstash support with the JSON above
verbatim — is kept for reference only. The code-side mitigations that shipped with the
10.6 hotfix (ETag recovery via server-side ListParts, graceful multipart-status)
remain as dead-lettered safety nets for legacy rows.

## Triage: server-side 403 ≠ CORS failure (added by HOTFIX 10.8d)

> **HOTFIX 10.8f update — the upload wire changed, the CORS posture did NOT.**
> Course-episode uploads are now a **single browser XHR PUT of the whole file** against
> one presigned URL (`initiate-upload` → PUT → `complete-upload`, no multipart,
> no parts). The browser now sends an explicit `Content-Type` header on that PUT (it is
> signed into the URL) — `AllowedHeaders: "*"` already covers it, and `ExposeHeaders:
> ETag` is no longer needed to *complete* an upload (no ETags are collected), though it
> stays harmless. A **403 with `HTTP 403` in the upload error banner near the END of a
> slow upload** is a different animal: it means the ~10-minute presigned URL expired
> mid-transfer — that is a URL-lifetime limitation of the single-PUT strategy, not a
> CORS problem; the panel's guidance (cancel and restart) is correct.

> **PUSH 10.9 update — the presign origin changed with the B2 migration.**
> With Upstash retired, `initiate-upload`'s presigned PUT URL is minted by
> `S3StorageService` DIRECTLY against the B2 S3-compatible endpoint (long-lived B2
> application keys, no credential exchange, no `/v1/presign` agent). A 503
> "Storage provider rejected credentials" on `initiate-upload` after the 10.9 deploy
> now means: wrong `Storage:S3:Endpoint`/`Region`, or the B2 application key is not
> valid for the `CMSmedia` bucket — check the Render log lines (the
> `S3 InitiateMultipartUpload rejected` / `Single-PUT presign:` lines name the host)
> before touching CORS. The 10-minute URL lifetime (MediaPolicy cap) is unchanged.

Two distinct upload failure modes must not be conflated:

- **Server-side 403 Access Denied** — the API's own SigV4 call to R2 was rejected
  (`initiate-upload` answers 503 "Storage provider rejected credentials"). Causes: wrong
  endpoint host, credentials not valid for that bucket, or SDK request features R2
  refuses. HOTFIX 10.8d pins the AWS SDK checksum knobs
  (`RequestChecksumCalculation`/`ResponseChecksumValidation` = `WHEN_REQUIRED`) so the
  SDK never emits the `x-amz-sdk-checksum-algorithm` / `x-amz-trailer:
  x-amz-checksum-crc32` headers R2 rejects, and the API now logs the exact HTTP status
  code, the full provider message and the ServiceURL on every multipart-initiate
  rejection — check the Render logs for `S3 multipart initiate rejected` before
  touching CORS. (10.8f: multipart initiate no longer exists on the course path at all —
  the presign goes through Upstash `/v1/presign`, the library-proven flow.)
- **Browser CORS preflight failure** — the browser-direct PUTs from admin-web are
  blocked before ever reaching R2 (upload freezes at 0%, errors in the browser console
  only). That is THIS document's domain: `AllowedHeaders` must include `"*"` and
  `ExposeHeaders` must include `ETag` — see the policy above.

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
