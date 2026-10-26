# WIP STATUS — Hotfix 10.8c (S3 Config & Non-Blocking Cleanup)

Branch: `wip/10.8c` (from main @ 63cdb09 — deployed 10.8)
Scope: **`apps/api` ONLY**. **No migration, no schema change, no frontend touch, no new packages.** NOT merged to main — STOP GATE.

## Incident (from Render production logs)
`POST /api/v1/admin/courses/{id}/episodes/initiate-upload` → 500. Root cause chain: `/v1/credentials` returns 200 OK, but the minted `AmazonS3Client` addresses `https://smashing-kiwi-127167.upstash.io/` (an Upstash proxy/API host, NOT `*.r2.cloudflarestorage.com`) → every S3 call answers `AmazonS3Exception: Access Denied`. The official `@upstash/blob` SDK (v0.0.11, verified from source) **refuses** any credentials response whose `endpoint` host is not `*.r2.cloudflarestorage.com` — production was silently proceeding with the invalid endpoint.

## Done (10.8c)

### 1.A — S3 client configuration (CRITICAL) — `UpstashS3ClientFactory.cs`
- [x] **R2-preference endpoint selection**: the credentials response is now parsed as a raw JSON document; endpoint candidates are scanned across `endpoint` / `s3Endpoint` / `r2Endpoint` / `url` and the **first candidate whose host ends with `.r2.cloudflarestorage.com` wins**. Only when no R2 candidate exists does the legacy `endpoint` field remain (last resort, loudly warned).
- [x] **Ops escape hatch**: `Upstash:Blob:S3Endpoint` (new optional config key, https-validated, trailing-slash-normalized) forces the correct R2 URL and beats everything — fixes the endpoint **without a code deploy** if the agent's response is wrong.
- [x] **`ForcePathStyle = true` and `AuthenticationRegion` ("auto" or the response's region)** — explicitly confirmed/kept on the `AmazonS3Config` (matches the official SDK's `{endpoint}/{bucket}/{key}` path-style addressing).
- [x] **The exact ServiceURL is now logged** on every lease mint (host-only, zero credentials — assert-tested): `Upstash S3 lease minted: ServiceURL=…, Bucket=…, Region=…, EndpointSource=…, ExpiresAt=…`, plus a `NON-R2 endpoint` **Warning** naming the bad URL and the override remedy. `UpstashS3Lease` record now carries `ServiceURL` so the value is observable in code.
- [x] **Live demo** (console harness against the real factory, production-shaped payloads): incident shape → `ServiceURL=https://smashing-kiwi-127167.upstash.io` + Warning; alternate-field R2 → `https://acc999.r2.cloudflarestorage.com` (source `response.s3Endpoint`); override → R2 (source `config-override`); healthy → R2, no warning.

### 1.B — Non-blocking ghost cleanup — `CourseHandlers.EnsureEpisodeNumberUsableAsync`
- [x] The `AbortMultipartUploadAsync` and `DeleteAsync` calls are now wrapped in **independent** try-catch blocks: each failure logs a warning (`EpisodeId/FileKey/UploadId` included) and **never throws** — `InitiateEpisodeUploadCommand` proceeds, the ghost row is still hard-purged, and the number is recycled. (A single outer guard has existed since Push 7; 10.8c makes each call independently guarded so a failing abort no longer skips the delete attempt.)

### 1.C — Graceful error handling — `AdminCoursesController.InitiateUpload`
- [x] `AmazonS3Exception` (and `UpstashS3ClientFactory.UpstashExchangeException`) are caught at the endpoint and converted to **503 ProblemDetails**: `title=Storage Provider Rejected`, `detail="Storage provider rejected credentials. Please verify R2 endpoint configuration."`, `errorCode=storage_provider_rejected` — never a bare 500. The API-side error log records the S3 status code + message.

## Verification (10.8c)
- Build: `dotnet build CMS.Tests.csproj` → **0 errors** (17 warnings, all pre-existing).
- Full unit regression: `dotnet test --filter "Category!=PostgresIntegration"` → **433/433 passed**.
- New tests (9): endpoint selection ×5 (R2-preference over non-R2 `endpoint`; non-R2 last-resort + trailing-slash normalization; override wins; non-https override rejected; exact-ServiceURL-on-lease with no-credential assertion), mint-log ×2 (Information line names the exact ServiceURL + NON-R2 Warning; healthy path emits no warning), ghost-cleanup ×1 (`InitiateUpload_GhostCleanupAccessDenied_StillSucceeds_NeverBlocksUpload` — both storage calls throw `AmazonS3Exception("Access Denied")`, initiate still returns a live upload session, ghost purged, number recycled, both calls proven attempted).
- Postgres-gated integration suite excluded (no real DB in sandbox — pre-existing, unchanged).

## What production will show after deploy
1. Every lease mint logs the exact ServiceURL — one line settles the diagnosis: R2 (healthy) vs `response.endpoint(non-R2)` (agent is handing out the proxy URL → set `Upstash:Blob:S3Endpoint` in Render env to the bucket's `https://<account>.r2.cloudflarestorage.com` and restart).
2. Ghost cleanup can no longer block an upload even when storage answers Access Denied.
3. initiate-upload answers a clean 503 with the verify-R2 message instead of a 500.

## Commit log (10.8c)
- (this commit) — fix(api): Hotfix 10.8c — R2-preference S3 endpoint selection + ServiceURL mint logging + Upstash:Blob:S3Endpoint override; independent non-blocking ghost cleanup; 503 ProblemDetails on S3 provider failure at initiate-upload

## Open items (for the supervisor)
- **STOP GATE**: 10.8c pushed to `wip/10.8c`; do NOT merge to main until approved.
- After deploy: read one `Upstash S3 lease minted:` line from Render logs. If `EndpointSource=response.endpoint(non-R2)`, set `UPSTASH__BLOB__S3ENDPOINT` (Render env → .NET `Upstash:Blob:S3Endpoint`, same double-underscore convention as `UPSTASH__BLOB__TOKEN`) to the true R2 endpoint — no code change required.
- If Upstash's response carries the R2 URL in an alternate field, production self-heals on the first mint after deploy.

---

# WIP STATUS — Push 10.8 (Combined: Admin Fixes & Student UI Integration)

Branch: `wip/10.8` (from main @ b093d1a — deployed 10.7)
Scope: api + admin-web + student-web. **No new migration** (no schema change — abort-processing flips the existing `processing_status` column; TargetQuality columns shipped in 10.7 and were applied to Neon by the supervisor). NOT merged to main — STOP GATE.

## Done (10.8)

### Phase 1 — Admin & backend fixes
- [x] **1.A THE BUG + fix**: the admin's TargetQuality pick was silently DROPPED at four HTTP boundaries — `CompleteUploadRequestDto`/`UpdateEpisodeDto` (AdminCoursesController) and `CompleteUploadDto`/`UpdateLibraryFileDto` (LibraryController) never exposed the key, so the commands received null and the worker read the stored default (Auto) → the full 3-rung ladder. The Application layer (10.7) was already correct. All four boundaries now bind + forward `TargetQuality?`.
- [x] **1.A mandated log line**: `Starting job: ID={Id}, Target={TargetQuality}, SourceHeight={SourceHeight}, Rungs={Rungs}` emitted right after the ladder build — LIVE evidence captured by `VideoTranscodingTargetQualityLiveTests` (real ffmpeg 7.1.5, real 1280×720 source): `Target=P360, SourceHeight=720, Rungs=360p` (one rung, 3 HLS objects) vs `Target=Auto, SourceHeight=720, Rungs=360p,720p` (5 objects).
- [x] **1.B terminology**: 360p→SD, 720p→HD, 1080p→FHD across `PROCESSING_PHASES` sentences, `TARGET_QUALITY_OPTIONS` dropdown labels, and the row chip (`المعالجة: HD`).
- [x] **1.B dynamic timeline**: `processingPhasesFor(targetQuality)` — P360/P720/P1080 collapse the ladder to exactly `[Pending, rung, Ready]` (bar passes 60% mid-encode); Auto keeps the five steps. `ProcessingTimeline` renders the visible set; a legacy Transcoding_* status outside the set widens back to the full ladder (honest fallback). `CoursesCenter` passes the episode's stored target.
- [x] **1.C abort-processing**: `POST /api/v1/admin/courses/episodes/{id}/abort-processing` → `AbortEpisodeProcessingCommand` → marks Failed (persist FIRST) + `ITranscodingJobRegistry.TryCancel` kills the in-flight ffmpeg via a job-scoped linked CTS (registered before the skip-check so an abort racing the dequeue still cancels; the worker's abort path never overwrites the Failed status; queued-not-started jobs are skipped at dequeue by the Failed read). Admin UI: "إلغاء المعالجة" button renders ONLY while `processingStatus` is `Transcoding_*` (hidden while Pending — asserted in e2e), with a deliberate-cancel banner (not the generic failure headline).
- [x] SQL rescue snippet (for the supervisor, Neon): `UPDATE course_episodes SET processing_status = 5 WHERE deleted_at IS NULL AND processing_status IN (1,2,3);` (enum stored as integer; 5 = Failed).

### Phase 2 — Student UI integration
- [x] **2.A**: `CoursePlayerPage` video path renders the production custom `VideoPlayer` (features/media-player) inline — HLS/MP4 dual-engine, silent lease refresh, resume, progress autosave, bookmarks all live INSIDE the player. The old native `<video controls>` `VideoStage`, the video lease-refresh useEffect, `handleNoVideoTrack`/`forceAudioStage` are deleted. The audio stage + YouTube embed keep the page-side lease trap (interval gated to `isAudioOnly`; YouTube gets the initial fetch only).
- [x] **2.B**: `EpisodeMetadata` card rendered under the player inside a dark cinema wrapper (title / description / difficulty badge / duration / views — the API has carried these since 10.5; the TS `CourseEpisode` interface now declares them).
- [x] **2.C processing gate**: status ≠ Ready (and non-null) → no player. `Pending/Transcoding_*` → "الفيديو قيد المعالجة حالياً. يرجى المحاولة لاحقاً." (spinner card); `Failed` → "تعذر معالجة هذا الفيديو. يرجى التواصل للدعم." (amber card). null status = legacy row → plays directly.
- [x] **2.D**: `/my-studies/player-test` route + `PlayerTestPage.tsx` deleted; `player-shell.e2e.mjs` deleted with it (sandbox target gone); `player-video`/`player-hls` e2e retargeted to the PRODUCTION course page.
- [x] Watermark preserved: `WatermarkLayer` decoupled from the access envelope (video path passes the student profile; audio stage forwards access.watermark) — rides z-30 over the custom player, pointer-events-none; wrapper `overflow-hidden` keeps the 375px no-overflow contract.

## Verification (10.8)
- API: `dotnet build` 0 errors; unit suite **336/336** (6 new: TargetQuality persistence ×2, abort ×3 + registry); live-pipeline evidence tests **2/2**.
- vitest: student **117/117** (CoursePlayerPage section rewritten: custom player + metadata card + no-/access-for-video + audio lease trap + 4 processing-gate cases), admin **34/34**.
- Playwright (real chromium, RAM-capped): student `player-video` **17/17** + `player-hls` **19/19** (custom player mechanics on the production page + the full metadata card matrix), admin `admin-upload` **28/28** (SD/HD/FHD sentences, P360 dynamic timeline = 3 steps with HD/FHD hidden, targetQuality=P360 riding the complete-upload body, cancel-button lifecycle + deliberate-cancel banner).

## Commit log (10.8)
- (this commit) — feat(api+admin+student): Push 10.8 — TargetQuality binding fix + live evidence, SD/HD/FHD dynamic timeline, abort-processing, student VideoPlayer + metadata + locked states, player-test deleted

## Open items (for the supervisor)
- **STOP GATE**: 10.8 implemented and pushed to `wip/10.8`; do NOT merge to main until the supervisor approves.
- Rescue the stuck 58% row with the SQL snippet (or the new abort button once 10.8 deploys).
- PlayerShell + LazyPlayerMount are now unused infra (kept for future reader players; tree-shaken from the bundle).

---

# WIP STATUS — Push 10.5 (API Integration & Metadata Exposure — backend)

Branch: `wip/10.5` (from wip/10.4 @ 4e6d062; **local commit `7a64b57` — push blocked: no PAT in this session** (verified: no credential helper, no ~/.git-credentials, env clean — same state as 10.4's session; re-supply the PAT and `git push origin wip/10.5` completes it))
Scope: **`apps/api` ONLY** — zero frontend files, zero lockfile changes, `main` untouched @ 93367ae. **No migration generated, no migration applied** (entities untouched — verified zero model drift).

## Done (10.5)

- [x] **1.A DTOs**: `CourseEpisodeDto` + `LibraryFileDto` gain additive optional keys — `Description`, `Difficulty` (enum → "Easy"|"Medium"|"Hard" via the global JsonStringEnumConverter), `ProcessingStatus` (enum → "Pending"…"Ready"/"Failed", null = pipeline never applied: audio/YouTube/pre-10.3), `ProcessingError` (string, only while Failed), `HlsKey`. Existing positional constructions stay source-compatible (optional params with defaults). `CourseDto` embeds `CourseEpisodeDto` — the list flows automatically.
- [x] **1.B Read endpoints**: `MapToEpisodeDto` (CourseHandlers — covers student `GetCourseByIdQuery` + admin `GetAdminCourseByIdQuery`) and `MapToDto` (LibraryHandlers — `GetLibraryFileByIdQuery`, update/publish/archive returns) now map the full metadata + lifecycle surface. `ProcessingError` is the honest synthesized English technical string from `MediaProcessingFailure` (10.3 persisted only the terminal status enum; FFmpeg diagnostics live in server logs — documented, no schema change).
- [x] **1.C playback-url (MediaHandlers)**: `ResolveHlsKeyForPlayback(status, hlsKey)` runs AFTER the entitlement gate on both asset branches — **Ready + HlsKey** → presigns the HLS master playlist with `application/vnd.apple.mpegurl` (student player's `.m3u8` URL sniff engages hls.js automatically); **Pending/Transcoding_\*** → `ConflictException` → **409** with the dual-language still-processing sentence; **Failed** → `MediaProcessingException` → **422** ProblemDetails carrying Arabic `humanMessage` + English `technicalDetails` (10.3's middleware mapping reused as-is); **null status / Ready-without-key** → legacy source-object path (honest degradation; the MP4 keeps playing).
- [x] **1.D Write endpoints**: `CompleteEpisodeUploadCommand` + `CompleteUploadCommand` accept PATCH-optional `Title/Description/Difficulty` riding the completion body (the 10.4 admin upload panel already sends `{parts, title, description, difficulty}`; the library UI doesn't yet — null keys keep prior values). `UpdateEpisodeCommand` + `UpdateLibraryFileCommand` accept PATCH-optional metadata (the 10.4 edit modal already sends it). Controller request DTOs (`CompleteUploadRequestDto`, `UpdateEpisodeDto`, `CompleteUploadDto`, `UpdateLibraryFileDto`) updated to bind the additive keys. Title was already mapped at initiate-upload (verified).
- [x] **1.E Migration verification (NOT applied)**: `20261025211326_AddMediaMetadata` files + Designer intact; `dotnet ef migrations has-pending-model-changes` → **"No changes have been made to the model since the last migration"** (zero drift — entities untouched); `dotnet ef migrations script` generated the valid PostgreSQL DDL (7 columns + 2 partial indexes) to a temp file, inspected, deleted — no database touched.
- [x] **Tests (20 new cases, all passing)**: MediaHandlersTests — HLS master presign for BOTH asset types (Times.Once on the m3u8 key, Times.Never on the source object), 409 theory across all 4 active statuses (dual-language message asserted), 422 Failed for BOTH asset types (HumanMessage + TechnicalDetails asserted), Ready-without-HlsKey source fallback. CourseHandlersTests — complete-upload metadata persistence (title trim/description/difficulty + still Pending), absent-keys keep initiate-time values, update PATCH semantics (both directions), `GetAdminCourseById` lifecycle exposure (Ready episode exposes metadata/hlsKey & null error; Failed episode exposes the technical error string). LibraryHandlersTests — complete-upload metadata override, absent-keys keep upload-url-time values, update difficulty PATCH both directions.
- [x] Build green: `dotnet build CMS.sln` → 0 errors (17 warnings — all pre-existing in test projects, unrelated).

## Verification (10.5)
- Full suite `dotnet test CMS.sln` → **400 passed / 27 failed**; the 27 are the Postgres-gated integration suite failing at the `CMS_PHASE34_TEST_POSTGRES` environment guard (no real PostgreSQL in the sandbox — thrown in `PrepareAsync` before any business code; pre-existing by design, NOT a regression).
- Focused: `--filter MediaHandlersTests|CourseHandlersTests|LibraryHandlersTests` → **110/110** (includes the 20 new cases).

## Commit log (10.5)
- `7a64b57` — feat(api): Push 10.5 — expose media metadata + HLS playback-url + write-endpoint wiring

## Reconciliations (spec vs. shipped frontend — deliberate, documented)
- Task book described DTO-level `ProcessingError` as an object `{humanMessage, technicalDetails}`; the SHIPPED 10.4 frontend reads `processingError` as a **string** (admin `CourseEpisode` type; feeds the error modal's collapsible section while polling). Implemented as the string to match the live contract; the OBJECT shape lives exactly where the task's 422 wording puts it — on the Failed playback response (ProblemDetails `humanMessage`/`technicalDetails` extensions via `MediaProcessingException`). Both surfaces work with zero frontend changes.
- No `ProcessingError` column exists (10.3 stored only the status) → the string is synthesized honestly (`MediaProcessingFailure.TechnicalDetails`), explaining the failure + pointing at server logs; no migration was authorized for this push.

## Open items (for 10.6+ / supervisor)
- **Push 10.5 → remote**: needs the PAT re-supplied (same protocol as 10.4's backup push: inject → push → scrub immediately).
- Migration `AddMediaMetadata` apply remains a supervisor action (from 10.3; still NOT applied).
- Retry/requeue endpoint (real pipeline re-enqueue) still future backend work — the admin Retry button re-polls today.
- Audio player (Push 10.6 per the 10.4 stop-gate numbering) NOT started — awaiting explicit supervisor approval.

---

# WIP STATUS — Push 10.4 (Admin Upload UI & Student HLS Player — frontend)

Branch: `wip/10.4` (from wip/10.3 @ f3364e0; **local commits only — push deferred: the supervisor PAT was scrubbed per protocol after 10.3 and is not present in this session**; re-supply it and `git push origin wip/10.4` is one command away)
Scope: BOTH frontends (`apps/admin-web` + `apps/student-web`). **Zero backend files.** Lockfile exception used exactly as authorized: `hls.js@1.7.3` (+8 lines). `main` untouched @ 93367ae.

## Done (10.4) — ADMIN-WEB

- [x] 1.A Metadata fields (`EpisodeMetadataFields.tsx`, shared by the upload panel + the new `EpisodeEditModal`): Title (required, ≤200, live counter), Description (optional, ≤1000, counter), Difficulty native select (سهل/متوسط/صعب → Easy=0/Medium=1/Hard=2). Fields ride the **complete-upload** body (`{parts, title, description, difficulty}`) and the **PUT episode** update body — additive keys the current API ignores (unknown JSON members), forward-compatible the moment the backend DTO wiring ships (entities + migration already exist from 10.3).
- [x] 1.B Processing state machine (`ProcessingTimeline.tsx` + the panel's new `processing|ready` states): **Uploading** = stats strip (total size · live speed MB/s · ETA · parts count, rolling-window speed that survives pause/resume) — the Push-6 multipart engine itself untouched; **Transcoding** = the 10.3 ladder as a human checklist with the task book's EXACT Arabic sentences (جاري تجهيز الفيديو في الخادم… / 360p مناسبة للجوال… / 720p جودة عالية… / 1080p جودة فائقة… / جاهز للمشاهدة ✅) + one shared animated bar (CSS `transition-all duration-700`, phase target %, pulse shimmer while in flight, red on Failed, 100% under the Ready banner); **polling** = ONE 3s interval per course drawer (`useEffect` in EpisodesManager — refreshes the same `detail` state the list renders from; active while any episode is non-terminal OR the upload panel watches one; immediate poll on activation; `pollNow()` forced poll for retries).
- [x] **Honest degradation**: today's API returns no `processingStatus` on episode DTOs → the poller resolves an uploaded episode with an absent status to **Ready** (the source MP4 is playable immediately) — no infinite spinner, no fake ladder. The full ladder lights up with zero frontend changes once the field ships.
- [x] 1.C Dual-language error modal (`AccessibleModal.tsx` primitive + `ProcessingErrorModal.tsx`): opens on `ProcessingStatus == Failed` AND on structured API failures (ApiError now parses ProblemDetails extensions `humanMessage`/`technicalDetails` from the 422 media-processing shape). Arabic human level: «عذراً، تعذر معالجة الفيديو.» + the API's humanMessage (curated fallback). Technical level: collapsible, LTR monospace, scrollable `technicalDetails` (FFmpeg logs) + **Copy Error** (clipboard API + execCommand fallback; "تم النسخ ✓" feedback) + **Retry** (resumes the multipart session for upload failures; re-arms the watcher + forced poll for pipeline failures — guarded so a stale Failed can't instantly undo the retry). Radix semantics replicated by hand (portal + focus trap + Escape + aria-modal + focus restore + body scroll lock + AnimatePresence) because admin-web carries no Radix packages and the lockfile exception is hls.js-only — documented reconciliation.
- [x] Episode rows: difficulty badge (سهل green/متوسط amber/صعب red), live processing chip (spinner while a rung is active, red on Failed), edit pencil (gated `btn:library.course.edit`). `EpisodeEditModal` edits title/description/difficulty + episodeNumber/durationSeconds → PUT.
- [x] `lib/mediaProcessing.ts`: ProcessingStatus union, PROCESSING_PHASES (exact sentences + % targets), difficulty normalization (accepts 0|1|2 AND "Easy"|"Medium"|"Hard"), chip/badge labels, speed/ETA formatters. `CourseEpisode` type gains optional `description/difficulty/processingStatus/processingError`.

## Done (10.4) — STUDENT-WEB

- [x] 2.B hls.js integration (`hls.js@1.7.3` — the authorized lockfile exception, +8 lines): `VideoPlayer` is dual-engine — `.m3u8` playback URLs (checked on the URL **pathname** so presign query strings can't break the sniff) play through hls.js+MSE; Safari/iOS without MSE falls back to native HLS `src`; MP4 keeps the exact 10.2 native path. **Silent refresh for HLS** = `hls.loadSource(newUrl)` with `autoStartLoad:false` + `startLoad(capturedPlayhead)` on MANIFEST_PARSED — the fresh manifest buffers straight at the playhead; `onLoadedMetadata` restore remains the safety net (time + play state + rate/volume/mute survive every swap). Fatal NETWORK errors ride the existing throttled preserve-time refresh (expired presigned manifest/fragment); MEDIA errors → `recoverMediaError()`; destroy+fatal UI otherwise. Custom controls, double-tap, bookmarks, progress pipeline all engine-agnostic (element properties + events) — verified e2e under MSE.
- [x] 2.A Metadata display (`video/EpisodeMetadata.tsx` + `PlayerShell.metadata` prop): inside the shell under the player — prominent title (h2), difficulty badge (سهل emerald / متوسط amber / صعب red — accepts numeric or enum-string), duration `15:30` + views, description clamped to 3 lines with عرض المزيد/أقل toggle (aria-expanded). Shell content column groups player+metadata (`m-auto`: centered when it fits, scrollable when it doesn't). 375px-first. `PlayerTestPage` wired with sandbox metadata.

## Verification (10.4)
- **Admin e2e** `apps/admin-web/e2e/admin-upload.e2e.mjs` (new; RAM-capped single Chromium): **20/20** — simulated multipart upload with metadata body assertions on complete-upload AND the episode PUT, paced ladder Pending→360p→720p→1080p→Ready with the exact Arabic sentences + bar 8%→32%→58%→84%→100%, live chip, difficulty badge, edit-modal prefill, Failed modal (headline/human/LTR FFmpeg details/clipboard Copy/Retry→Ready), tablet 768px usability. **Peak Chromium RSS 961MB < 1.6GB; console errors 0.**
- **Student HLS e2e** `e2e/player-hls.e2e.mjs` (new; REAL local 360p+720p ladder generated with ffmpeg, git-ignored): **19/19** — engine selection (hls+MSE, blob: src), master→variant→segment fetches, resume seek over MSE, real playback, **silent refresh via loadSource** (≥2 leases, time kept, engine stable, still playing), buffer indicator, controls under MSE, double-tap ±10s, metadata card (title/badge/duration/views/collapsible), progress POSTs, 375px. **Peak Chromium RSS 1034MB < 1.6GB; console errors 0.**
- **Student MP4 regression** `e2e/player-video.e2e.mjs` re-run: **16/16** (native engine untouched).
- Gates: student tsc clean + vitest **117/117** + 0 new eslint warnings; admin tsc clean + vitest **34/34** + 0 new warnings (31 pre-existing on base, untouched).
- Two e2e-caught fixes: ① the ladder now stays mounted through Ready (full checklist + 100% bar instead of vanishing); ② retry guard holds transitions while a forced poll is in flight.

## Commit log (10.4)
- `b0f9d7a` — feat(student-web): hls.js dual-engine player + episode metadata card
- `c9bbe82` — feat(admin-web): upload metadata + processing state machine + dual-language error modal
- `339b50a` — test(student-web): HLS e2e suite (19/19, RAM 1034MB) + refreshed screenshots
- `435c6a9` — test+fix(admin-web): upload e2e (20/20, RAM 961MB) + two e2e-caught UX fixes

## Reconciliations (spec vs. constraints — deliberate, documented)
- "Radix Dialog/Select" in admin-web → hand-built `AccessibleModal` (Radix semantics) + native select: no Radix packages exist there and the lockfile exception is hls.js-only.
- Difficulty wire value = **numeric 0|1|2** (task-book mapping); the READER also normalizes the API's future enum strings ("Easy"…). JsonStringEnumConverter accepts both number and string on read.
- Playback-url still returns the source MP4 today (HlsKey unread by MediaHandlers) — the player's URL-shape sniff means HLS engages automatically the moment the backend signs master.m3u8; e2e proves the full path against a real ladder.
- Backend gaps (documented, NOT touched): no `processingStatus`/`difficulty`/`description` in any DTO yet, no poll-specific endpoint (admin polls the existing course-detail GET), no retry/requeue endpoint (the Retry button re-polls; a real requeue POST is future backend work).

## Open items (for 10.5+ / supervisor)
- **Push 10.4 → remote**: needs the PAT re-supplied (scrubbed after 10.3 per protocol; nothing persisted).
- Backend DTO wiring for the metadata fields + `processingStatus`/`processingError` exposure + playback-url HlsKey switch (the frontend is ready for all three).
- Migration apply remains a supervisor action (10.3 open item).
- Transcoding requeue sweep + real retry endpoint.
- Audio player (Push 10.5) — **STOP GATE: not started, awaiting supervisor approval.**

---

# WIP STATUS — Push 10.3 (FFmpeg Transcoding & Schema Upgrade — backend)

Branch: `wip/10.3` (from wip/10.2 @ 2530f2c; **pushed to remote**)
Scope: BACKEND ONLY (`apps/api`). No frontend files. Migration **generated but NOT applied** (SQL script verified).

## Done (10.3)
- [x] 1.A Schema: `ProcessingStatus` enum in new `CMS.Domain/Enums/MediaEnums.cs` (Pending=0 … Failed=5). Entities: **CourseEpisode** + **LibraryFile** gain `Difficulty` (required int, default 0=Easy — REUSES the existing question-domain enum, exact Easy/Medium/Hard match), nullable `ProcessingStatus`, nullable `HlsKey` (≤600); **CourseEpisode** additionally gains `Description` (≤1000). **Title already existed on both entities** (and Description on LibraryFile) — documented; no risky live-data ALTERs on legacy columns. Migration `20261025211326_AddMediaMetadata` generated (NOT applied); idempotent SQL script verified: 7 additive ALTERs + 2 partial filtered indexes (`ix_{course_episodes,library_files}_processing_status WHERE processing_status IS NOT NULL`), one transaction, all new columns nullable-or-defaulted → safe on live Neon data.
- [x] 1.B Dockerfile: runtime stage `apk add … ffmpeg` (Alpine stock package, ships libx264+aac) + `FFMPEG_PATH`/`FFPROBE_PATH`/`FFMPEG_TIMEOUT_MINUTES` env knobs. **No Docker daemon in this sandbox** → verified the equivalent of stages 1–3 locally: `dotnet publish -c Release -r linux-musl-x64` green (exact Dockerfile publish path); no NuGet lock files exist → `--locked-mode` inert; `apk add ffmpeg` is the stock Alpine package name.
- [x] 1.C Pipeline `CMS.Application/BackgroundJobs/VideoTranscodingService.cs`: `ITranscodingQueue` (bounded 200, DropWrite) + hosted single-consumer `BackgroundService`. Flow: complete-upload (video/* only) sets `Pending` in the same commit → enqueue AFTER commit → worker: `DownloadAsync` → ffprobe (width/height/duration/HasAudio) → ONE ffmpeg `var_stream_map` ladder → upload tree via `PutAsync` (`{key}/hls/…`, m3u8/ts content types) → `HlsKey={key}/hls/master.m3u8` + `Ready`. Statuses advance Pending→360p→720p(≥⅓)→1080p(≥⅔)→Ready via `-progress pipe:1` parsing (out_time_us; rungs encode in lockstep — rung statuses = progress phases). Failed on any error (dual-language log); shutdown resets to Pending; 60-min watchdog + entireProcessTree kill; never upscales (rungs above source height dropped, 360p floor); temp workspace under `/tmp/cms-transcode` wiped in finally. Registered in AddApplicationServices (concrete singleton forwarded as interface + AddHostedService).
- [x] 1.D `CMS.Application/Exceptions/MediaProcessingException.cs` (Arabic `HumanMessage` default + English `TechnicalDetails`) → `ExceptionHandlingMiddleware` maps to **422** ProblemDetails with BOTH messages (extensions humanMessage/technicalDetails + errorCode MEDIA_PROCESSING_FAILED).
- [x] 1.E `FfmpegLadder` exact command (in code + live-validated): 360p 800k/720p 2800k/1080p 5000k (maxrate 107%, bufsize 1.5×), profiles main/main/high, aac 96/128/192k stereo, GOP 48, 4s MPEG-TS VOD segments, `independent_segments`, `-var_stream_map "v:N,a:N,name:{rung}"`, `-master_pl_name master.m3u8`.
- [x] **LIVE command validation** (real ffmpeg vs generated sources): full 3-rung ladder on a 1080p+audio source → encode completed, master.m3u8 perfect (BANDWIDTH 985600/3220800/5711200, CODECS avc1.4d401e/4d401f/640028 + mp4a.40.2); caught+fixed a REAL hang (missing `-nostdin` → interactive stdin mode); audio-less 480p source validated the HasAudio gate (audio-form fails exactly as predicted; no-audio form exits 0 <1s) + rung filtering.
- [x] Gates: `dotnet build CMS.sln` green (17 pre-existing warnings); unit suite **294/294** (4 test constructor call sites updated with an inert `TranscodingChannelQueue`).
- [x] NuGet: CMS.Application gains `Microsoft.Extensions.Hosting.Abstractions` + `Logging.Abstractions` 10.0.0 (BackgroundService host — same 10.0.0 wave as the existing DI.Abstractions).

## Commit log (10.3)
- `629ec9c` — feat(api): FFmpeg transcoding pipeline + media metadata schema
- `81e763e` — fix(api): -nostdin from live command validation

## Open items (for 10.4 / supervisor)
- Migration apply = supervisor action (`AddMediaMetadata` — SQL verified, safe).
- Playback still signs `FileKey` (direct MP4); switching the player to `HlsKey`/HLS is future wiring (needs hls.js decision on the frontend or native HLS support).
- Queue is in-memory (restart drops queued jobs — assets stay Pending); a requeue/sweep admin surface is the natural 10.4 addition. No `ProcessingError` column (failure reason lives in logs) — add if the admin UI needs to display it.

---

# WIP STATUS — Push 10.2 (Video Player Integration — frontend)

Branch: `wip/10.2` (from wip/10.1 @ 2530f2c; **pushed to remote** @ 4554e5f)
Scope: FRONTEND ONLY (`apps/student-web`). Zero backend/admin files. **NO new packages** — the presigned URLs are direct MP4 objects on R2 (Range-capable per 10.0b live test), NOT HLS → native `<video>` suffices; hls.js not needed. pnpm-lock.yaml byte-identical.

## Done (10.2)
- [x] 1.E API layer `src/features/media-player/services/media-api.ts`: playback-url POST, progress GET (204→null) / POST (int-rounded, camelCase bodies), bookmarks POST with X-Duration-Warning surfacing, keepalive final-save (fetch+keepalive with manually mirrored auth headers). X-Entitlement via existing `entitlementRequestConfig()`; X-Installation-Id rides the global axios interceptor.
- [x] 1.A Silent refresh `hooks/useMediaLease.ts`: timer at **ttl − 60s** (min-3s clamp keeps short-TTL e2e testable; production 540→480s); 15s retry backoff ×3; preserve-time + play-state captured BEFORE the fetch, restored by the host in `onLoadedMetadata`; media-error path refreshes immediately; generation counter for side-effects. Playback state (time/rate/volume/mute) survives every swap — verified e2e.
- [x] 1.B Custom controls `video/ControlsBar.tsx` (native controls removed): center play/pause (tap/click), bottom bar — play/pause, Radix-Slider seek with **buffer indicator** (trailing-range fallback) + keyboard arrows + aria-valuetext, time current/total, volume mute + hover-reveal slider (Radix), speed Radix-Select 0.25–2× (portal z-[100]), bookmark button, fullscreen (routes through the shell). Physical LTR timeline (YouTube-Arabic convention — task-book example honored) with RTL text; 44px targets; auto-hide 2.6s while playing.
- [x] 1.B Double-tap zones: physical left = −10s / right = +10s; 280ms window cancels the single-tap action (touch: toggle controls; mouse: play/pause); framer-motion ripple badge (±10s) at tap position.
- [x] 1.C Progress: GET on mount → seek to lastPositionSeconds at metadata; POST every 10s while playing + on pause/ended + checkpoint before each lease swap + **keepalive final save on unmount/beforeunload/visibilitychange**.
- [x] 1.D Bookmarks `video/BookmarkDialog.tsx`: dark dialog — start defaults to current position, end +30s (clamped to duration), label required, note optional; success toast with the window summary + X-Duration-Warning note.
- [x] Keyboard on the player region: Space/K play-pause, ←/→ ±5s, J/L ±10s, M mute, F fullscreen (Radix-slider arrows preserved via role="slider"] guard).
- [x] Fullscreen: PlayerShell exposes `toggleFullscreen(): Promise<boolean>` via new `shell-context.ts`; the player's FS button drives the SHELL stage (controls stay visible); iPhone fallback → video.webkitEnterFullscreen.
- [x] PlayerTestPage now hosts the REAL VideoPlayer via LazyPlayerMount (generic TProps typed); DummyVideoPlayer removed.
- [x] **3 production bugs caught by the e2e suite** (commit 4554e5f): ① volume/mute state never reached the element (UI-only state) — dedicated effects added; ② BookmarkDialog re-seeded defaults on every timeupdate (~4×/s) wiping the label mid-typing — now snapshots once per open; ③ controls-bar gradient swallowed taps over the center play button on short mobile players — bar pointer-transparent, only interactive rows opt in.
- [x] e2e `e2e/player-video.e2e.mjs`: **16/16 PASS, zero console errors** against a REAL ffmpeg-generated MP4 served locally (git-ignored; regen command in the header). Covers: playback-url fetch, resume-seek, real playback, seamless lease swap (requests=2, time preserved, still playing), play/pause, keyboard seek, buffer width, mute, rate 1.5×, double-tap ±10s + ripples (desktop+mobile), bookmark defaults+POST+toast, 10s progress cadence, close→keepalive save, 375px fit. Peak Chromium RSS **1.01GB** (<1.6GB), node runner 163MB, wall 24s.
- [x] Gates: tsc clean; vitest **117/117**; eslint 0 new warnings (2 pre-existing on base).

## Commit log (10.2)
- `1e45933` — feat: real VideoPlayer (API integration + custom controls)
- `4554e5f` — fix+test: three e2e-caught bugs + real-media Playwright suite

---

# WIP STATUS — Push 10.1 (Player Shell & Fullscreen Modal — frontend)

Branch: `wip/10.1` (from wip/10.0 @ f79140b; **pushed to remote** — survives sandbox resets)
Scope: FRONTEND ONLY (`apps/student-web`). Zero backend/admin files touched. No new packages (node_modules restored from the FROZEN pnpm lockfile — `pnpm install --frozen-lockfile`, lockfile byte-identical).

## Done (10.1)
- [x] 1.A `src/features/media-player/protection/usePlayerProtection.ts` (+ `PlayerProtection.tsx` wrapper): player-SCOPED capture-phase deterrents — contextmenu, selectstart, dragstart, copy, cut, Ctrl/Cmd+C/S/P — each gated on "event target OR active selection inside the container". Inputs (INPUT/TEXTAREA/SELECT/contentEditable) stay usable. Zero page impact while the shell is closed (listeners exist only when enabled).
- [x] 1.B `src/features/media-player/PlayerShell.tsx`: Radix Dialog portal modal — `fixed inset-0 z-50`, `bg-[#0b1120]/95 backdrop-blur-2xl` glass, Framer Motion enter/exit (AnimatePresence + forceMount), RTL-native logical props (close button top-LEFT, verified x=24 y=20), kind badges, ShieldCheck indicator, WCAG labels, 44px touch targets, **Fullscreen API on the STAGE** (never the media element — controls verified visible in fullscreen, auto-exit on close, webkit fallback).
- [x] 1.C `src/features/media-player/LazyPlayerMount.tsx`: React.lazy + IntersectionObserver double gate (`active` AND slot visible) + premium `PlayerLoading` skeleton. The player chunk is not even requested until the modal opens.
- [x] 1.D `/my-studies/player-test` sandbox route (TEMPORARY, marked for removal) + `DummyVideoPlayer` real code-split chunk (video element with NO src — zero network media).
- [x] FIX during e2e: protection attach race — AnimatePresence/Radix portals mount the stage one commit AFTER `open` flips, so the original ref-only effect bailed on a null container. Container node is now mirrored into state via a `setContainer` callback ref (single node carries both the fullscreen target and the protection scope).
- [x] `e2e/player-shell.e2e.mjs` (RAM-capped: ONE Chromium, `--headless=new --disable-gpu --disable-dev-shm-usage`, `browser.newContext()` per scenario, browser closed immediately): **16/16 PASS, zero console errors** — modal open/close (Escape + X), fullscreen targets the stage with controls visible, RTL close position, lazy chunk mount, WCAG labels, contextmenu/Ctrl+S/copy blocked in-shell, page UNAFFECTED after close, 375px mobile no-overflow. Screenshots: `e2e/screenshots/player-shell-{01-open,02-fullscreen,03-mobile-375}.png`.
- [x] Quality gates: `tsc -b` clean; vitest **117/117** (no regression); eslint — 0 new warnings (2 PRE-EXISTING warnings on the base branch: SettingsPage.tsx:34, ActivateCodePage.tsx:47 — untouched, documented).
- [x] Resource ceiling: peak Chromium RSS **861 MB** (sampler, ps -C chrome) < 1.6 GB contract; node runner 161 MB; e2e wall time 8s.

## Commit log (10.1)
- `3c4f3c4` — feat(student-web): player shell stack (1.A–1.D)
- `d4c8bbd` — fix: protection attach race + e2e suite (16/16)

---

# WIP STATUS — Push 10.0c (Security Fix & Backend Finalization)

Branch: `wip/10.0` (wip/10.0b merged in via `6c61a77` --no-ff; all work continues here)
Context: supervisor's live Range test on a production presigned URL = **PASS** (206 Partial Content, Content-Range: bytes 0-1023/1150804, Accept-Ranges: bytes); the same test confirmed the lease-path credential exposure (X-Amz-Security-Token in the URL).

## Done (10.0c)
- [x] Task 1: wip/10.0b merged into wip/10.0 (merge commit 6c61a77).
- [x] Task 2A (security fix): MediaHandlers playback-url → `GetSignedUrlAsync(fileKey, ttl, ct)` — object-scoped `/v1/presign` agent path; TTL unchanged (MediaPolicy.PlaybackUrlTtlSeconds = 540 ≤ 600 cap; no adjustment needed).
- [x] Task 2B (security fix): CourseHandlers episode `/access` (legacy Push-4 vulnerability) → `GetSignedUrlAsync(episode.FileKey, PlaybackUrlTtl, ct)`.
- [x] Interface deprecation doc-comment on `IFileStorageService.GetSignedUrlViaCredentialsAsync` (no production call sites remain — only the interface declaration survives, retained for server-to-server use).
- [x] Tests: all existing media/course mocks swapped to the agent path; ONE dedicated new test `GetPlaybackUrl_UsesObjectScopedPresign_NeverTheCredentialLeasePath` (Times.Once on agent path + Times.Never on lease path).
- [x] Verified: `rg GetSignedUrlViaCredentialsAsync src/CMS.Application src/CMS.Api` → only the interface declaration; zero call sites.
- [x] Task 3: media-cors.md updated — Range verdict VERIFIED SUPPORTED with the supervisor's raw PASS evidence; Path B marked DEPRECATED with the resolution note (both call sites + regression test); operator checklist items 1–2 struck DONE, CORS flagged as the remaining open item.
- [x] Build green + `dotnet test --filter "FullyQualifiedName~Media"` → **45/45**; `--filter CourseHandlers` → **28/28**; full unit regression `FullyQualifiedName~CMS.Tests.Unit` → **294/294**.

---

# WIP STATUS — Push 10.0b REBUILD (Range & CORS Verification — read-only + docs)

Branch: `wip/10.0b` (from wip/10.0 rebuild @ 8c61ee1)
Scope: VERIFICATION ONLY. No production code changes beyond the 10.0 rebuild already on this branch. New files: docs/ops/media-cors.md, docs/ops/verify-range.sh (+WIP_STATUS.md).

## In progress
- 10.0b rebuild complete: media-cors.md (6 sections — Range verdict UNVERIFIED pending operator live test, CORS state table, Path A/B presign anatomy with the credential-lease security warning, R2 migration matrix, operator checklist) + verify-range.sh (Range + control + informational Origin-bearing GET; PASS/FAIL/ERROR verdict; functionally validated against local mock servers).

---

# WIP STATUS — Push 10.0 REBUILD (Backend Foundation: Streaming + Bookmarks + Progress)

Branch: `wip/10.0` (from main @ 93367ae)
Scope: backend-only. No frontend files touched. Migration generated but NOT applied. No deploy.

> ⚠️ REBUILD NOTICE (10.0c session): the sandbox was reset between Push 10.0b and 10.0c.
> The original local-only commits (10.0: 8733541 → f79553e → e40d4ba; 10.0b: ba2af25 →
> 1c2c5d9 → d70e80d) were lost — the clone was PAT-free so nothing had been pushed. This
> branch is a faithful rebuild from the preserved worklog + task-book specs, then Push
> 10.0c executes on top. SHAs below are NEW; original SHAs are unrecoverable.

## Done
- [x] Environment: .NET SDK 9.0.319 reinstalled in sandbox (no dotnet was present after reset)
- [x] §1.A.3 `CMS.Domain/Constants/MediaPolicy.cs` (TTL single source of truth: 540/600/300/600 + UpstashPresignCapSeconds 600)
- [x] §1.B/§1.C entities: `CMS.Domain/Entities/MediaEntities.cs` — MediaAssetType enum + MediaBookmark + PlaybackProgress; inline EF configuration in ApplicationDbContext (unique indexes (StudentId,AssetType,AssetId,StartSeconds,EndSeconds) + (StudentId,AssetType,AssetId), index (StudentId,CreatedAt), cascade FK to students, ck_media_bookmarks_range, numeric(5,2) completion, NO DB-level FK on polymorphic AssetId)
- [x] `IApplicationDbContext` + `ApplicationDbContext` DbSets
- [x] Application layer: `Commands/Media`, `DTOs/Media`, `Handlers/Media` (7 MediatR handlers: playback-url, bookmark create/list/update/delete, progress upsert/get)
- [x] API layer: `Controllers/MediaController.cs` (playback-url, bookmarks CRUD, progress upsert/get; /access-style entitlement gate: student role + X-Entitlement + X-Installation-Id + handler-side VideoAudio scope; X-Duration-Warning: unknown; 204-on-empty progress)
- [x] TTL refactor at the 3 listed sites (LibraryHandlers /access → 300s, CourseHandlers PlaybackUrlTtl → 540s, ExternalServices ClampExpiry → cap via MediaPolicy)
- [x] Build green: `dotnet build CMS.sln` → 0 errors (17 warnings, all pre-existing in test project)
- [x] Tests: `dotnet test --filter "FullyQualifiedName~Media"` → **44/44 passed** (playback-url gating + TTL + content-type fallbacks, bookmarks CRUD + validation + ownership, progress upsert + completion 0/50/94.92/95→100/100 + clamping + duration stickiness + null-on-empty)
- [x] Regression: `dotnet test --filter "FullyQualifiedName~CMS.Tests.Unit"` → **293/293 passed** (Postgres integration suite excluded — known CI debt, requires real DB; original run was 308 with a 59-test media suite)
- [x] docs/ops/r2-cors.md written (exact JSON policy + operator placeholder for admin-web origin, marked one-time operator setup)

## In progress
- (none — 10.0 rebuild complete; 10.0b rebuild next)

## Blockers / notes
- Remote push requires credentials (PAT-free clone); commits stay local until a PAT is re-issued.
- Non-listed TTL sites intentionally unchanged (same as original 10.0): avatars 6h/1h in StudentProfileController + AdminStudentsController (silently clamped to 600s on Upstash anyway), 30-min upload request in LibraryHandlers (clamped), part-presign 540s clamp in ExternalServices.
- REBUILD deltas vs original (unrecoverable details, spec-faithful choices): migration timestamp differs (regenerated); test count may differ from original 59; UpsertProgress duration fallback chain = client → stored → asset metadata.

## Commit log
- `e73f217` — wip(10.0): backend foundation rebuild — MediaPolicy + entities + handlers + controller + TTL refactor, build green
- `82d438f` — wip(10.0): migration AddMediaBookmarksAndPlaybackProgress (regenerated 20261025194934, NOT applied)
- (see below) — wip(10.0): InMemory tests (44/44 media, 293/293 unit regression) + docs/ops/r2-cors.md
