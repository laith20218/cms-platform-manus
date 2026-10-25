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
