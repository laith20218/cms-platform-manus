# WIP_STATUS — wip/11.1-rewrite

## Base
Branch: wip/11.1-rewrite
Parent: 3a14857ab7b9b1e80c3c3acef16aacaaa0b7570e (Push 11.1, full proxy)
Status: DIAGNOSTIC ONLY — no implementation yet.

## Completed in this branch
- T1: B2 wildcard presigned URLs — NO per official docs (object-scoped SigV4 semantics; no wildcard/prefix feature anywhere in the S3-Compatible API docs); live wildcard GET test BLOCKED (no B2 credentials in this sandbox).
- T2: CORS preflight against production endpoint PASSED (200; origin echoed exactly; access-control-allow-headers: range; max-age 3600 — matches the startup-applied rule); actual signed GET + GetBucketCorsAsync BLOCKED (no credentials); unsigned GET answers 401 with NO CORS headers.
- T3: Signing throughput (AWSSDK.S3 3.7.421.10, GetPreSignedURL, .NET 9): 100 URLs ≈ 23 ms, 900 URLs ≈ 246 ms median (per-URL p50 172 µs / p99 360 µs) — far within the 2 s threshold; no Redis cache layer required by the latency criterion alone.
- T5: "ExistsAsync" = IFileStorageService wrapper — S3StorageService.ExistsAsync is GetObjectMetadataAsync + catch 404 (ExternalServices.cs:336-347); called at MediaHandlers.cs:276. NOT AmazonS3Util.DoesS3ObjectExistAsync.
- T6: GetPlaybackUrlQuery — MP4 (Ready, HlsKey NULL) keeps the presigned source-object URL unchanged; Ready+HlsKey returns the API proxy route; non-Ready maps to 409 (encoding) / 422 (failed) / source-object fallback (NULL status).
- T7: xhrSetup sends Authorization + X-Entitlement + X-Installation-Id AND X-Device-Fingerprint (same value); controller validates X-Entitlement + X-Installation-Id with X-Device-Fingerprint as read-side fallback alias.
- T8: "requests=2" counted POST /playback-url API calls (initial load + one silent refresh), NOT HLS object fetches (those are counted separately as master/variants/segments evidence).

## Blockers / findings requiring supervisor decision
- No B2 credentials in this sandbox → wildcard presign live test (T1 step 2), signed GET CORS check and GetBucketCorsAsync dump (T2) are UNVERIFIED — evidence for these is documentary/code-level only.
- No GitHub PAT in this session → branch push deferred; WIP_STATUS.md committed locally on wip/11.1-rewrite.
- T3 environment: Debian 13 x64 + .NET 9.0.22 (production container is aspnet:9.0-alpine) — signing is pure managed-code SigV4 computation; architecture identical, OS differs (reported honestly).

## Next step (pending supervisor approval)
- Implement Option C: playlist rewrite at variant boundary.
- Segments go direct to B2 via presigned URLs.
- Redis cache layer if T3 shows signing > 2s for 900 URLs. (T3 measured ≈ 246 ms — cache layer NOT required by the latency criterion.)

## RESUME_FROM
RESUME_FROM: <sha of this WIP_STATUS commit> — Option C implementation (pending approval)
