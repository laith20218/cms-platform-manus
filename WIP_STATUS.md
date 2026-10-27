# WIP_STATUS — wip/11.1-rewrite

## Base
Branch: wip/11.1-rewrite
Parent: 3a14857ab7b9b1e80c3c3acef16aacaaa0b7570e (Push 11.1, full proxy)
Status: PART B (live B2 probes) CLOSED — verdict PASS. PART C (Option C implementation) in progress per the conditional gate.

## Completed in this branch
- Pushed the diagnostic commit to origin (PART A done).
- T1 (docs): B2 wildcard presigned URLs — NO per official docs (object-scoped SigV4 semantics).
- T1-Step2 (LIVE): wildcard presign probes against production bucket — 6 derived URLs (star substituted, wildcard-key signature kept) ALL answered **403 SignatureDoesNotMatch**; the 2 raw `*`-key URLs (signature VALID for the literal key) answered **404 NoSuchKey** — B2 signs the literal key with NO wildcard interpretation. Wildcard = definitively unsupported → Option C remains necessary.
- T2 (preflight, LIVE): CORS preflight from student-web origin with `range` header → 200, origin echoed exactly, `access-control-allow-headers: range`, max-age 3600.
- T2-c (LIVE): GetBucketCorsAsync("CMSmedia") dump — MATCHES the code-derived startup rule (AllowedMethods GET/PUT/HEAD/POST/DELETE; AllowedOrigins ["*"]; AllowedHeaders ["*"]; ExposeHeaders etag/content-range/accept-ranges/content-length/content-type [live dump lowercased — HTTP headers are case-insensitive]; MaxAgeSeconds 3600).
- T2-b (LIVE): presigned GET (production method, TTL 540s) of a REAL production ladder (courses/64f45bfc…/03aa51a91d134d4296f998bda408aee4/hls/, 360p rung, 53 segments) with Origin=student-web: master.m3u8 → 200; 360p/index.m3u8 → 200; 360p/segment_000.ts → 200. ALL three carry `access-control-allow-origin: https://cms-platform-manus-student-web.vercel.app` (exact echo) + accept-ranges/expose-headers. (Episode selected via read-only ListObjectsV2 of the bucket — no DB credentials were supplied this session; the bucket listing is the storage-side ground truth.)
- T3: Signing throughput (AWSSDK.S3 3.7.421.10, GetPreSignedURL, .NET 9): 100 URLs ≈ 23 ms, 900 URLs ≈ 246 ms median (per-URL p50 172 µs / p99 360 µs) — far within the 2 s threshold; no Redis cache layer required by the latency criterion alone.
- T5: "ExistsAsync" = IFileStorageService wrapper — S3StorageService.ExistsAsync is GetObjectMetadataAsync + catch 404 (ExternalServices.cs:336-347); called at MediaHandlers.cs:276. NOT AmazonS3Util.DoesS3ObjectExistAsync.
- T6: GetPlaybackUrlQuery — MP4 (Ready, HlsKey NULL) keeps the presigned source-object URL unchanged; Ready+HlsKey returns the API proxy route; non-Ready maps to 409 (encoding) / 422 (failed) / source-object fallback (NULL status).
- T7: xhrSetup sends Authorization + X-Entitlement + X-Installation-Id AND X-Device-Fingerprint (same value); controller validates X-Entitlement + X-Installation-Id with X-Device-Fingerprint as read-side fallback alias.
- T8: "requests=2" counted POST /playback-url API calls (initial load + one silent refresh), NOT HLS object fetches (those are counted separately as master/variants/segments evidence).

## PART B VERDICT: PASS
- B.1 CORS dump: MATCH on AllowedOrigins (and every other field).
- B.2 All three objects: HTTP 200 + exact student-web origin echo → PASS criteria met.
- T1-Step2: wildcard unsupported (403 SignatureDoesNotMatch × 6, 404 NoSuchKey × 2) — as expected; no escalation finding.
→ Proceeding to PART C (Option C implementation) per the conditional gate.

## Blockers / findings requiring supervisor decision
- B2 credentials were supplied inline for PART B and used ONLY as transient environment variables for the scratch probe process (never written to any file, never echoed); no residue remains.
- PAT supplied inline; scrubbed after every push (git remote -v clean, rg github_pat_ .git/config = 0 matches).
- T3 environment: Debian 13 x64 + .NET 9.0.22 (production container is aspnet:9.0-alpine) — signing is pure managed-code SigV4 computation; architecture identical, OS differs (reported honestly).
- Signed GET CORS evidence note: a 401/403 from B2 carries NO CORS headers (measured live, unsigned GET) — frontend error handling must treat B2 auth failures as opaque NETWORK_ERROR (Option C's VideoPlayer change addresses exactly this).

## Next step
- PART C (in this push, gate passed): Option C — variant playlist rewrite at the variant boundary (segments presigned, direct-to-B2), segment proxy removed (404), VideoPlayer NETWORK_ERROR silent refresh, unit + e2e tests.

## RESUME_FROM
RESUME_FROM: <sha of this commit> — PART C: Option C implementation (gate passed; in progress)
