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
