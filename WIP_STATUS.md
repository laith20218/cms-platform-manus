# WIP_STATUS — wip/11.2-diag

## Base
Branch: wip/11.2-diag
Parent: 20f4bf65a45cd04021b155f636f42b99e2c9f9c8 (main, Push 11.1 merged + verified; Issues #1/#2 CLOSED)
Status: DIAGNOSTIC ONLY (Push 11.2-DIAG). T1–T4 COMPLETE (this commit, per §1 incremental rule).
T5 (advanced design) + T6 (risks) PENDING — will follow in a second commit on this branch.
NO production code written. NO migrations. NO handler/component touched. main untouched.

## T1 — Root cause: "save succeeds but favorites page empty"

Verdict (evidence per hypothesis):

- H1 (cache invalidation missing) — CONFIRMED for the QUESTION flow, RULED OUT for the file flow.
  * QuestionPage.tsx:163-166 — `favoriteMutation` has NO onSuccess/onError, NO `useQueryClient` import
    anywhere in the file, NO local `isFavorite` update (button state read at :461/:466-467 never flips).
    Neither `['favorites']` nor the questions-list cache is invalidated after a question save.
  * App.tsx:8-17 — global QueryClient defaults: `staleTime: 5 * 60 * 1000`, `refetchOnWindowFocus: false`.
    FavoritesPage.tsx:16 — `useQuery({ queryKey: ['favorites'], queryFn })` with NO staleTime override →
    mount refetch happens ONLY for data older than 5 min. Sequence: visit /favorites (caches []),
    save a question, return within 5 min → STALE EMPTY list rendered. F5 (hard reload) DOES show the
    item (fresh fetch, backend path verified symmetric — see H4). So H1 explains a genuinely-empty-
    looking page for question saves within the 5-min window, with zero user feedback (no toast fires
    at all — no onSuccess/onError handlers exist).
  * LibraryPage.tsx:47-54 — the file-card save DOES invalidate both `['library', subjectId]` and
    `['favorites']` → file saves reflect immediately. RULED OUT for files.

- H2 (polymorphic type mismatch) — CONFIRMED, and it is the PRIMARY root cause for EPISODES,
  in variant form: not a wrong discriminator value but a two-TABLE concept split.
  * The `Favorite` entity supports ONLY questions + library files: OperationalEntities.cs:175-184
    (`StudentId`, `QuestionId?`, `LibraryFileId?` — there is NO episode column at all).
  * The episode "save" the user clicks is the media player's bookmark button:
    ControlsBar.tsx:194-203 (aria-label «حفظ مقطع (علامة مرجعية)») → BookmarkDialog.tsx:77-89
    (toast «تم حفظ المقطع …») → media-api.ts:123-140 → POST /api/v1/media/{assetType}/{assetId}/bookmarks
    → writes `media_bookmarks` (MediaEntities.cs:30-53 — polymorphic AssetId, NO FK, timeline windows).
  * The favorites page reads GET /api/v1/favorites (FavoritesController.cs:46-52) which queries ONLY
    the `favorites` table. Episode saves can therefore NEVER appear there. MediaBookmark has NO
    global list endpoint — MediaController.cs:120-121 lists bookmarks per-asset only
    (GET /media/{assetType}/{assetId}/bookmarks), and no page renders a global bookmark list.
  * Entity docs state the split explicitly: MediaEntities.cs:20-24 ("a favorite marks a whole library
    file as interesting; a bookmark points INSIDE a video/audio timeline").

- H3 (DTO missing required fields) — RULED OUT as the empty-page cause.
  * FavoriteItemDto (FavoritesController.cs:243-251): FavoriteId, TargetType, TargetId, SubjectId,
    Title, Subtitle?, Meta, CreatedAt. Frontend FavoriteItem (question-api.ts:4-13) matches 1:1.
  * FavoritesPage.tsx:42-77 renders ANY returned item; no client-side filtering exists; the empty
    state (:50-56) fires only when the API itself returns []. Missing enrichment fields
    (thumbnail/duration/course/progress) are a DESIGN gap (T5), not the bug.

- H4 (backend hardcoded type filter excluding the saved type) — RULED OUT for the reported symptom.
  * List (FavoritesController.cs:46-85) filters ONLY by StudentId (:47) + per-item
    `Status == Published` (:57, :71) + per-item `CanAccessSubjectContentAsync` scope (:58-59, :72-73).
    These are SYMMETRIC with Create (:103-110 question path, :124-131 file path) — anything creatable
    is listable under the same access. No hardcoded `WHERE type = X`.
  * Live-DB verification of the current test user's rows: UNVERIFIED (no DB credentials in sandbox;
    §3 forbids touching the DB). Honest limitation, not fabrication.

- COMBINED VERDICT: the reported symptom is the SUPERPOSITION of two independent defects:
  (1) PRIMARY (episodes): concept split — the player's save button writes `media_bookmarks`,
      invisible to GET /favorites; the Favorite model has no episode support at all.
  (2) SECONDARY (questions): no invalidation + 5-min staleTime + zero mutation feedback.
  Library-file saves via the LibraryPage card work end-to-end (POST 201 → invalidate → refetch).
  If the user's "library file" half persists in production with card-icon saves, the only remaining
  backend mechanism is the per-item scope drop at list time — requires live DB check (UNVERIFIED).
  Note: SearchPage.tsx:23 hardcodes `isFavorite: false` on every search result (cosmetic, no save
  button there); FavoritesPage.tsx:23 shows the toast «أزيل السؤال من المفضلة» even when removing
  a file (cosmetic copy bug).

## T2 — Backend map (favorites)

| Item | Location | Detail |
|---|---|---|
| Entity `Favorite` | OperationalEntities.cs:175-184 | StudentId (Guid), QuestionId (Guid?), LibraryFileId (Guid?), navs Student/Question/LibraryFile; inherits BaseEntity (Id, CreatedAt, UpdatedAt — BaseEntity.cs:7-12) |
| DbContext config | ApplicationDbContext.cs:287-299 | CHECK ck_favorites_exactly_one_target; 2 filtered UNIQUE indexes ix_favorites_student_id_question_id / ix_favorites_student_id_library_file_id |
| FKs | ModelSnapshot :3328-3347 | questions (fk_favorites_questions_question_id), library_files (fk_favorites_library_files_library_file_id), students (Cascade, :3339-3341) |
| Table history | Phase34 migration :850-874 (created 2026-08-18); Phase47 :14-54 (hardened: unique filtered indexes + CHECK, 2026-08-20) | — |
| MediatR commands/queries | NONE | FavoritesController injects IApplicationDbContext directly (FavoritesController.cs:23, :46, :90, :145, :169) — bypasses the MediatR pipeline used by Library/Questions/Media. Anomaly worth noting for 11.3 design. |
| Endpoints | FavoritesController.cs | GET api/v1/favorites :37-88; POST api/v1/favorites :90-143 (idempotent: existing → 200, new → 201); DELETE /{questionId} + /questions/{questionId} :145-167; DELETE /files/{fileId} :169-194 |
| Auth policy | :17-20 | [Authorize(Roles="student")] + [EnableRateLimiting("favorites")]; per-request signed entitlement (X-Entitlement + X-Installation-Id, :227-235, null-subject validation passes — SignedEntitlementService.cs:135); rate limit 30/min fixed window (Program.cs:141) |
| DTOs | FavoritesController.cs:241-251 | CreateFavoriteRequest(QuestionId?, LibraryFileId?); FavoriteMutationDto(FavoriteId, TargetId, TargetType, IsFavorite); FavoriteItemDto(8 fields, inline in controller file) |
| Tests | FavoritesHttpIntegrationTests.cs:14-70 | 3 Facts, QUESTION-ONLY: create/dup/list/delete-own (:15-43), no entitlement → 401 (:46-54), outside subject → 403 (:57-70). No file-favorite test, no episode test, no frontend unit/e2e test for favorites at all (verified: no favorites e2e spec, no FavoritesPage vitest). Not executed this session (integration suite needs Postgres; sandbox has none — honest). |

Q2a: ONE unified favorites table (`favorites`) covering questions + library files only (two nullable
FKs + CHECK exactly-one; OperationalEntities.cs:175-184 + ApplicationDbContext.cs:287-299). Episodes
and media timeline clips live in a SEPARATE `media_bookmarks` table (MediaEntities.cs:30-53) by
explicit design decision (doc comment :20-24). No favorites table per asset type beyond this.
Q2b: Yes — `student_id` FK fk_favorites_students_student_id, Cascade on student delete
(ModelSnapshot :3339-3341); per-target uniqueness via the two filtered unique indexes.
Q2c: YES — `PlaybackProgress` (MediaEntities.cs:64-83): one row per (StudentId, AssetType, AssetId)
(unique index ApplicationDbContext.cs:235), LastPositionSeconds, DurationSeconds (sticky),
CompletionPercent (derived 95% rule). Endpoints: POST/GET /api/v1/media/{assetType}/{assetId}/progress
(MediaController.cs:185-202). MediaAssetType = LibraryFile(0) | CourseEpisode(1) (MediaEntities.cs:8-14).
Reusable for "continue watching" today, but there is NO bulk/list-progress endpoint — only per-asset GET.
Q2d: NONE. GET /favorites returns ALL rows for the student in one array — no type filter, no
pagination, no sort parameter; sort is hardcoded OrderByDescending(CreatedAt) (FavoritesController.cs:51).

## T3 — Frontend map (favorites, student-web)

| Item | Location | Detail |
|---|---|---|
| Page | FavoritesPage.tsx:14-83 (features/questions) | No props; no local useState; no useEffect; route /favorites (router.tsx:63, lazy :19); nav: Sidebar.tsx:25, BottomNav.tsx:22, DashboardPage.tsx:40 (favoriteCount + «عرض المفضلة» link) |
| Query | FavoritesPage.tsx:16 | useQuery key ['favorites'], fn questionApi.getFavorites; NO staleTime/refetch overrides → App.tsx:8-17 globals apply (staleTime 5 min, refetchOnWindowFocus false, retry 1) |
| Mutations | FavoritesPage.tsx:17-26 | removeFavorite → dispatch by targetType (:18-20); onSuccess invalidates ['favorites'] + toast; onError toast. Toast copy always says «السؤال» even for files (:23). |
| Save buttons | QuestionPage.tsx:458-468 (Star, «مفضلة/في المفضلة»); LibraryPage.tsx:143-153 (Bookmark icon per file card); player ControlsBar.tsx:194-203 (Bookmark → BookmarkDialog → MediaBookmark, NOT Favorite) | QuestionPage mutation :163-166 has NO onSuccess/onError/onInvalidation (H1) |
| API wrappers | question-api.ts:41-53 (getFavorites, toggleFavorite); library-api.ts:102-109 (toggleFavorite) | All via apiClient (Bearer + X-Installation-Id + X-Device-Fingerprint on every request — api-client.ts:44-62) + entitlementRequestConfig (X-Entitlement, entitlement-api.ts:50-52, auto-issue on miss :34-48) |
| UI | FavoritesPage.tsx:50-56 empty state (hardcoded Arabic), :28-30 spinner, :32-40 error card, :59-77 plain article rows, FileText icon for files only (:61), difficulty map :8-12, trash button :69-76 | No skeleton, no tabs, no sort, no thumbnails, no pagination |
| Filtering/sorting/pagination | NONE | Client renders the raw array |

Q3a: Key = `['favorites']` (FavoritesPage.tsx:16). Invalidated at: LibraryPage.tsx:51 (after file save)
and FavoritesPage.tsx:22 (after own delete). NOT invalidated at QuestionPage.tsx:163-166 (question save).
Q3b: Hardcoded — FavoritesPage.tsx:53-54.
Q3c: Page sets nothing; App.tsx:8-17 globals apply: staleTime 5 min, gcTime 30 min, retry 1,
refetchOnWindowFocus FALSE. refetchOnMount = TanStack default (true) → refetch only when cache is
stale (> 5 min old) — this is what makes the missing QuestionPage invalidation user-visible.

## T4 — Data availability for enrichment (server-side, single query, no N+1)

- Episode (course_episodes): Title (CourseEntities.cs:35), EpisodeNumber (:36), DurationSeconds?
  (:38), FileSize? (:46), ContentType? (:49), YoutubeVideoId? (:54), Description? (:68), Difficulty
  (:72), ProcessingStatus? (:75). Course join: CourseId FK (:34) → Course nav (:87) → Course.Title
  (:17), Course.CoverImageUrl? (:19 — the ONLY thumbnail source for episodes; NO per-episode thumbnail
  column exists anywhere), Course.Status (:21), Course.SubjectId (:16) → Subject.NameAr. Joinable in
  one Include chain; FK is required (non-null CourseId).
- Library file (library_files): Title (OperationalEntities.cs:78), Description? (:79), Type (:75),
  FileSize (:81), FileFormat? (:82), DurationSeconds? (:83), PagesCount? (:84), ThumbnailUrl? (:85),
  YoutubeVideoId? (:86), Tags (:87), Category? (:77), Difficulty (:99), ProcessingStatus? (:102),
  CreatedAt (auditable). All server-side available today.
- Last playback position: PlaybackProgress (MediaEntities.cs:74-80) per (StudentId, AssetType,
  AssetId) — covers BOTH course episodes and video/audio library files; joinable server-side in the
  same list query (grouped fetch by asset id set). No bulk endpoint today, but the TABLE is
  sufficient for one-call enrichment.
- Course from episode: ALWAYS joinable (required FK + nav). Subject from file: required SubjectId
  (OperationalEntities.cs:73).
- NOT available server-side: per-episode thumbnail (must fall back to course cover); question
  thumbnails (questions have Images collection — different shape, optional); nothing else missing
  for the requested card.

## Honest limitations this session
- No production DB access (no credentials; §3 forbids DB changes): row-level checks for the live
  test student are UNVERIFIED.
- Backend integration tests not executed (no Postgres in sandbox). Unit suite not re-run (no code
  changed — diagnostic only; §2 stop gate).
- PAT used inline for the branch push only; scrubbed immediately (remote -v clean; 0 matches in
  .git/config).

## RESUME_FROM
(in progress — T5 design + T6 risks follow on this branch in the next commit)
