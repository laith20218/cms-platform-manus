# WIP_STATUS — wip/11.1-rewrite

## Base
Branch: wip/11.1-rewrite
Parent: 3a14857ab7b9b1e80c3c3acef16aacaaa0b7570e (Push 11.1, full proxy)
Status: PART C (Option C implementation) COMPLETE — awaiting supervisor review. NOT merged to main (STOP GATE).

## PART A — done
Pushed e525f09 (diagnostic commit) to origin; PAT scrubbed and verified after every push.

## PART B — done, VERDICT: PASS
- T2-c GetBucketCorsAsync dump: MATCH with the code-derived startup rule (AllowedOrigins ["*"], AllowedHeaders ["*"], GET/PUT/HEAD/POST/DELETE, ExposeHeaders etag/content-range/accept-ranges/content-length/content-type, MaxAge 3600; live dump lowercases ExposeHeaders — HTTP headers are case-insensitive).
- T2-b presigned GET of a REAL production ladder (courses/64f45bfc…/03aa51a91d134d4296f998bda408aee4/hls/) with student-web Origin: master.m3u8 / 360p/index.m3u8 / 360p/segment_000.ts ALL 200 + exact origin echo + accept-ranges + expose-headers. (Episode selected via read-only ListObjectsV2 — no DB credentials were supplied this session.)
- T1-Step2 wildcard presign: 6 derived URLs → 403 SignatureDoesNotMatch; 2 raw `*`-key URLs → 404 NoSuchKey. Wildcard support = NO (Option C necessary; no escalation finding).
- B2 credentials used only as transient env vars for the scratch probe; nothing persisted.

## PART C — Option C implementation (gate passed → implemented)
Backend (apps/api):
- MediaHandlers.Handle(GetHlsObjectQuery) — ROLE dispatch after the UNCHANGED gates (path whitelist, visibility, entitlement, transcoding state):
  * root master.m3u8 → raw stream, no-store (behavior UNCHANGED);
  * any other .m3u8 → RewriteVariantPlaylistAsync: download text, replace every bare .ts/.m4s line with an object-scoped presigned GET URL (TTL 540s = MediaPolicy), tags/comments/unknown lines preserved VERBATIM, CR endings preserved, presign in Task.WhenAll batches of 50, ONE log line per variant ("HLS variant rewritten: episode={id} variant={rung} segments={N} ttl=540s"), serves application/vnd.apple.mpegurl + private,max-age=60;
  * .ts/.m4s → RETIRED: 404 before ANY storage access + deprecation warning log;
  * mid-rewrite presign failure → BadGatewayException (new, CMS.Domain/Exceptions) → HTTP 502 via ExceptionHandlingMiddleware (new catch ABOVE the DomainException/400 catch) — never a partial playlist.
- MediaController: NO CHANGES (per C.2). GetPlaybackUrlQuery: NO CHANGES (proxy master route + TTL 540 kept). MP4/audio/YouTube paths: untouched.
Frontend (apps/student-web):
- VideoPlayer.tsx: hls.js fatal NETWORK_ERROR → triggerSilentRefresh() (status-agnostic — B2 401/403 carries no CORS headers, measured in PART B); MEDIA_ERROR → recoverMediaError(); 5s anti-hammer guard shared with the native path; the hls attach/load effect is now ALSO keyed on the lease `generation` (the proxy master URL is a stable string — without the generation key a silent refresh would never re-run loadSource, and the variant would never re-mint presigned segments); overlay text set to «جاري تجديد الرابط…»; xhrSetup UNCHANGED + Option C documentation comment (headers attach ONLY to API-origin URLs; B2 presigned GETs are bare — no preflight).
Tests:
- Unit: MediaHandlersTests — variant rewrite (tags/unknown lines/order/TTL/key derivation), empty playlist (zero presigns), single-segment, retired .ts 404 (×2 rows), non-rung .m3u8 treated as variant, presign failure → 502. Suite: 380/380 passed (was 376). The two old ".ts streams through proxy" Theory rows were UPDATED to the retired-404 contract (deliberate behavior removal — net suite count still grew).
- e2e: NEW player-hls-option-c.e2e.mjs — 13/13 passed, peak Chromium RSS 1130 MB, unexpected console errors 0 (8 injected-403 messages are the spec's own expiry simulation); verifies master+variant → API origin with auth headers, segments → B2 origin DIRECT with NO auth headers, ZERO API-origin segment requests, playback > 5s, TTL-compressed silent refresh with variant re-fetch + fresh-generation segments, and NETWORK_ERROR recovery (timer parked via long TTL; seek past buffer; expired 403s → fatal → refresh → resume at seek position).
- e2e legacy regression player-hls.e2e.mjs: 19/19 passed, RSS 1021 MB (untouched presigned-master path).
- Build: dotnet build 0 errors; tsc -b clean; eslint 0 errors on changed files (2 pre-existing `any` warnings in untouched files remain, out of scope); vitest 117/117.
- Superseded artifacts REMOVED: player-hls-proxy.e2e.mjs + its screenshot (asserted the deprecated segment-through-proxy architecture; full rollback copy intact on branch wip/11.1). .eslintrc.cjs ignores the e2e binary ladder dirs (parsing errors on .ts artifacts); .gitignore adds public/e2e-hls-optionc/.

## Deliberate non-implementations (per C.6)
- No fallback to the segment proxy (removed cleanly, 404).
- No backwards compatibility for cached old clients (fail fast → variant re-fetch).
- No conditional switch / feature flag / env var — clean cut.
- No Redis cache (T3: 900 signings ≈ 246 ms).

## Blockers / notes
- The controller's GetHlsObject doc comment still says "no manifest rewriting needed" — MediaController.cs left UNTOUCHED per C.2; the authoritative semantics live in GetHlsObjectQuery's doc (updated).
- Known edge (reported, not fixed): the variant's 60s browser cache can serve a ≤60s-old playlist whose presigned URLs are near expiry if a refresh lands within that window; recovery converges via the 404/403 → NETWORK_ERROR loop. Production cadence (refresh at ttl−60 = 480s ≫ 60s cache) makes the overlap rare.
- PAT + B2 credentials were supplied inline for this push and used transiently; both scrubbed (remote URL clean; creds never written anywhere).

## RESUME_FROM
RESUME_FROM: <sha of this commit> — supervisor review → merge decision → production verify (Render auto-deploy + test student 0936185126)
