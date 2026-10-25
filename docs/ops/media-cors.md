# Media CORS & Range — Current State (Upstash Blob)

> Push 10.0b (verification-only). Written from static code inspection + Upstash/Cloudflare
> public documentation + the official `@upstash/blob` SDK source. **No live test could be
> run from the sandbox: it holds no Upstash credentials and no previously-issued presigned
> URL exists in the repo or the sandbox.** Everything marked UNVERIFIED below requires one
> operator run of `docs/ops/verify-range.sh` (see §6).

## 1. Provider chain

Production uses **Upstash Blob** — a serverless wrapper over **Cloudflare R2** — through
`UpstashBlobStorageService`. The generic `S3StorageService` is a fallback that is never
active in production.

What the code actually proves (apps/api, branch wip/10.0b):

| Fact | Evidence |
| --- | --- |
| Upstash service wins whenever `Upstash:Blob:Token` is set | `CMS.Infrastructure/DependencyInjection/DependencyInjection.cs:63-74` — `if (!string.IsNullOrWhiteSpace(configuration["Upstash:Blob:Token"])) → UpstashBlobStorageService; else → S3StorageService` |
| Upstash Blob is backed by R2 | `UpstashS3ClientFactory.cs:30-37` — credential exchange returns an R2 endpoint/bucket/region; official SDK source `src/server/credentials.ts:102` **validates** the endpoint hostname `endsWith('.r2.cloudflarestorage.com')` |
| Bucket is private | `ExternalServices.cs` class docs ("anonymous direct reads are rejected"); docs: a private bucket has no public host, reads go through signed URLs |
| SDK exchange flow | `POST https://blob.upstash.io/v1/credentials` (Bearer = bucket token) → short-lived S3 session credentials (`UpstashS3ClientFactory.cs:124-170`) |

## 2. Presigned URL anatomy

Our code has **two distinct GET-presign paths** with different signing authorities:

### Path A — agent-presigned (object-scoped) — `GetSignedUrlAsync`

- Code: `ExternalServices.cs` `GetSignedUrlAsync` → `PresignAsync` → `POST https://blob.upstash.io/v1/presign`.
- **Signing authority: Upstash's agent, not our server.** The URL comes back in the response
  (`PresignResult.Url`); our code never constructs the host.
- Host: `*.r2.cloudflarestorage.com` — the official SDK **validates** this
  (`blob-js/src/server/r2.ts:376`: `url.hostname.endsWith('.r2.cloudflarestorage.com')`),
  so presigned read URLs are R2-direct, not `*.upstash.io`.
- Scope: one object, one method (GET), one header set (empty `{}` for reads), TTL ≤ 600 s
  (SDK `MAX_PRESIGN_SECONDS = 600`; our clamp `MediaPolicy.UpstashPresignCapSeconds`).
- Used by: library document `/access`, avatars.

### Path B — credential-lease presigned (bucket-scoped credential!) — `GetSignedUrlViaCredentialsAsync`

- Code: `ExternalServices.cs:631-648` — AWS SDK `GetPreSignedURL` (SigV4) with the
  short-lived session credentials leased from the Upstash exchange. Host = the R2 endpoint
  returned by `/v1/credentials` (`UpstashS3ClientFactory.cs:155-164`, path-style addressing).
- TTL: clamped to `60 s … lease-remaining − 30 s` (effectively ≤ ~9 min).
- Used by: course episode `/access` (`CourseHandlers.cs`) **and** the new
  `POST /api/v1/media/{assetType}/{assetId}/playback-url` (`MediaHandlers.cs`).
- **⚠️ SECURITY WARNING (documented by Upstash itself):** the presigned URL carries the
  session token (`X-Amz-Security-Token`), and "R2 derives a temporary credential's secret
  from its session token … a url signed with it would hand its holder every object in the
  bucket until the credential expires" (`blob-js/src/server/r2.ts:213-216`). Upstash docs
  say it plainly: *"Do not presign with an S3 client built from bucket.s3(). Its URLs carry
  the temporary credential, which works on the whole bucket. Hand out URLs only from
  signedReadUrl and signedUploadUrl."* (docs: /blob/bucket/connecting#using-an-s3-client,
  /blob/reference/signing#who-signs-a-url). Anyone holding one Path-B playback URL
  therefore holds bucket-wide read/write for its ≤ 9-minute lifetime. This is a
  pre-existing pattern (episode `/access`, Push 4) that Push 10.0 deliberately mirrored;
  it needs a supervisor decision — Path A (`/v1/presign`) is the object-scoped alternative
  and already implemented in the same class.

Neither path signs any response-header overrides; neither signs a `Range` header (Range
is not part of query-string SigV4 presigns), so a client may send `Range: bytes=…` freely.

## 3. HTTP Range support

**Verdict for OUR bucket: UNVERIFIED (live).** No Upstash credentials exist in the sandbox
(env vars absent; `.env*` are placeholder templates; the clone is credential-free), and no
previously-issued presigned URL exists anywhere (searched repo + sandbox for
`X-Amz-Signature` / `X-Amz-Credential` / `*.r2.cloudflarestorage.com` — only synthetic unit-test
fixtures and a health-check URL in `docs/ARCHITECTURE.md`).

Evidence that it *should* work (why UNVERIFIED, not "not supported"):

- Cloudflare R2 S3 API compatibility table: **GetObject → Range ✅** (also HeadObject →
  Range ✅, "no effect"). A presigned GET URL is the same GetObject operation with the
  signature on the query string; the `Range` request header is not signed, so R2 applies
  it at serve time.
- Upstash docs acknowledge byte ranges over the S3 surface: *"There is no range option
  [in SDK `get()`]. For byte ranges, use an S3 client."*
  (docs: /blob/bucket/reading#get), with a `GetObjectCommand({ …, Range: "bytes=0-1023" })`
  example (docs: /blob/bucket/connecting#using-an-s3-client).
- Our codebase contains **zero** Range-related code (`Accept-Ranges` / `Content-Range` /
  `bytes=` / `206` / `PartialContent` — no matches in any `.cs` file), i.e. nothing we do
  disables or interferes with Range.

Evidence NOT to trust it blindly:

- `supportsRange: true` in the playback-url response (`MediaHandlers.cs`) is a hardcoded
  constant, not derived from any capability check.
- No test in the repo verifies Range behavior — the only related assertions are
  `result.SupportsRange.Should().BeTrue()`, which assert the hardcode itself; Upstash
  service tests stub the agent with a fake URL.

**The decisive test** (operator-run, ~1 minute):

```bash
bash docs/ops/verify-range.sh "<fresh presigned URL for a video/audio object>"
```

The script sends `Range: bytes=0-1023` (expects `206` + `Content-Range` + length 1024),
a no-Range control (expects `200` + full length), and an informational Origin-bearing GET
for CORS diagnostics; it prints PASS / FAIL / ERROR and hex-dumps the first 16 bytes on
PASS. It reads the URL from `$1` only — never hardcode a signed URL anywhere.

## 4. CORS configuration — how to set it today

| Question | Answer | Evidence |
| --- | --- | --- |
| Does Upstash provide a dashboard UI for bucket CORS? | **NOT DOCUMENTED.** A CORS *policy* on Upstash buckets is implied to exist ("a bucket whose CORS policy was narrowed") but no console page, screenshot or setting is documented anywhere. | docs search (`/docs/ask?q=cors`) returns only 2 incidental Blob mentions (errors, large-files); the docs index (`/docs/llms.txt`) has no CORS page |
| Default bucket CORS behavior | **"Buckets allow every origin by default"** — CORS preflight failures "only show up on a bucket whose CORS policy was narrowed" | docs: /blob/reference/errors#errors-the-browser-raises-on-its-own |
| Does Upstash expose `PutBucketCors` on its S3-compatible endpoint? | **UNVERIFIED, likely not.** The S3 features Upstash documents for `bucket.s3()` are "byte ranges, conditional GETs, delimiters and common prefixes, object tagging" — CORS management is not among them. The leased credentials are bucket-scoped; bucket-policy operations typically require account-level rights we do not hold (the bucket lives in Upstash's R2 account). | docs: /blob/bucket/connecting#using-an-s3-client; no `PutBucketCors` mention anywhere in docs or SDK source |
| Does the `@upstash/blob` SDK have a CORS helper? | **NO.** Zero `cors` matches in the SDK source (`src/server/bucket.ts`, `r2.ts`, `handler.ts`, `credentials.ts`, `token.ts`, …). The SDK treats CORS as a bucket-side property, surfaced only as an upload failure mode. | github.com/upstash/blob-js (main), raw file grep |

**Conflict to resolve with one live test:** our own Push 9 note
(`LibraryController.cs` /content docs) says presigned URLs "carry no CORS headers, so the
browser cannot fetch() them". Two readings:

1. *Genuinely no CORS on our bucket* — contradicts Upstash's documented default
   ("allow every origin"), unless our bucket's policy was narrowed at some point.
2. *Observation artifact* — Cloudflare R2 docs state: "If you are testing directly or
   using a command-line tool such as curl, you will not see CORS Access-Control-*
   response headers unless the Origin request header is included in the request." A
   curl check without `-H "Origin: …"` shows no CORS headers even on a perfectly
   CORS-enabled bucket.

The Origin-bearing GET built into `verify-range.sh` (informational section) resolves
this: `Access-Control-Allow-Origin` present → browser `fetch()` works;
absent → cross-origin `fetch()`/XHR of playback URLs will fail (plain `<video>`/`<audio>`
element playback may still work since media elements do not require CORS for simple
playback, but `fetch()`-based Range requests and readable error bodies will not).

Relevant R2 behavior for any R2-backed host (Upstash included):
"Without a CORS policy, browser-based uploads and downloads using presigned URLs will
fail, even though the presigned URL itself is valid." Also, expired presigned URLs return
403 **without** CORS response headers, so browser JS cannot read the error body — the
player must refresh URLs before expiry (docs:
developers.cloudflare.com/r2/buckets/cors/#use-cors-with-a-presigned-url).

## 5. Migration to Cloudflare R2 (future)

Moving from Upstash Blob to a directly-owned R2 bucket changes who owns the bucket; the
presigned-URL mechanics stay the same.

**What changes:**

| Aspect | Upstash (today) | Owned R2 (future) |
| --- | --- | --- |
| Credentials | `UPSTASH_BLOB_TOKEN` + exchange for ≤ ~15-min session credentials | Long-lived R2 API token (AccessKey/Secret) via dashboard |
| Presign authority | Upstash agent (`/v1/presign`) or our lease (Path B, discouraged) | Our server, AWS SDK SigV4 — same `S3StorageService` code path that already exists |
| Presigned TTL ceiling | 10 min (agent hard cap: `MAX_PRESIGN_SECONDS = 600`) | 1 s – 7 days (`604_800 s`) — `MediaPolicy` clamps must be revisited |
| CORS | Not configurable by us (default allow-all, undocumented narrowing) | Fully ours: dashboard (bucket → Settings → CORS Policy → JSON), Wrangler CLI (`npx wrangler r2 bucket cors set <bucket> --file cors.json`), or S3 `PutBucketCors` |
| Host | `*.r2.cloudflarestorage.com` (Upstash's account) | `*.r2.cloudflarestorage.com` (our account) — unchanged shape |

**What stays the same:**

- Presigned URL flow: GET/PUT verbs, SigV4 query-string signatures, R2 host, browser
  refresh-on-expiry cadence.
- `IFileStorageService` interface and both implementations — `S3StorageService` already
  implements it against any S3-compatible endpoint (endpoint/region/keys from
  `Storage:S3:*` config, path-style addressing); the DI switch is one environment change
  (unset `UPSTASH__BLOB__TOKEN`, set `STORAGE_S3_*`).
- Multipart orchestration (Initiate / PresignUploadPart / ListParts / Complete / Abort) —
  already implemented in `S3StorageService` exactly as in the Upstash service.
- The same-origin `/library/{id}/content` channel for PDF/TXT/HTML (CORS-irrelevant).
- `MediaPolicy` as the single TTL source (values change, structure stays).
- `docs/ops/r2-cors.md` (Push 10.0) becomes directly applicable — that JSON policy is
  what gets pasted into the R2 dashboard CORS tab. Remember `ExposeHeaders` must include
  `Content-Range`, `Accept-Ranges`, `ETag` for player JS to read them.

## 6. Operator checklist (before Wave 10.2 video player ships)

1. **Mint a fresh playback URL** for one real video/audio object — either call
   `POST /api/v1/media/library-file/{id}/playback-url` (or `/course-episode/{id}/…`) as
   the student test account with valid `X-Entitlement` + `X-Installation-Id` headers, or
   mint one directly from storage with the bucket token. Use it within minutes.
2. **Run the verifier** (URL from step 1, never committed anywhere):
   ```bash
   bash docs/ops/verify-range.sh "<PRESIGNED_URL>"
   ```
   Record: the verdict line (PASS / FAIL / ERROR), `content-range`,
   `access-control-allow-origin`, `access-control-expose-headers`, and the 16-byte dump.
3. **If the verdict is FAIL (200 + full length):** STOP. Range is not honored — escalate
   to the supervisor before any player work; the streaming architecture must be
   re-evaluated (same-origin proxy for video, CDN, or transcode).
4. **If the informational section shows no `Access-Control-Allow-Origin`:** browser
   `fetch()` of playback URLs will fail cross-origin. Then check (a) whether plain
   `<video>`/`<audio>` playback still works (media elements can play without CORS), and
   (b) ask Upstash support to confirm/set the bucket CORS policy (origins
   student-web + admin-web + localhost dev, methods GET/HEAD, `AllowedHeaders: ["*"]`,
   `ExposeHeaders: [Content-Range, Accept-Ranges, ETag, Content-Length, Content-Type]`),
   or schedule the owned-R2 migration (§5).
5. **Cross-check in a real browser:** open the student web app, play a video, and confirm
   in devtools → Network that media requests return `206` with `Content-Range` and carry
   `Access-Control-Allow-Origin` for the app origin.
6. **Confirm refresh cadence:** the player must re-request playback URLs on error/stall;
   effective URL lifetime is ≤ 9 min (Path B) / ≤ 10 min hard cap (Path A), and expired
   URLs 403 without CORS headers (unreadable error bodies).
7. **Report the results** (verdict + the two header lines) back in the push report; only
   then start Wave 10.1/10.2 player work.

*No secrets, full presigned URLs, or account IDs appear in this document by design.*
