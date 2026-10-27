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

## T5 — Advanced design proposal (PROPOSAL ONLY — §2 stop gate; no code written)

### D1 — Data model
Migration REQUIRED: exactly ONE (`AddEpisodeFavorites`). The Favorite table cannot represent
episodes today (T1/H2) — the whole bug. Design follows the ESTABLISHED favorites integrity pattern
(typed nullable FK + CHECK exactly-one + filtered unique index), NOT the polymorphic no-FK
MediaBookmark pattern (episode favorites deserve FK integrity, consistent with question/file rows):

```sql
ALTER TABLE favorites ADD COLUMN course_episode_id UUID NULL
  REFERENCES course_episodes(id);                       -- matches question/library FK behavior (no cascade)
ALTER TABLE favorites DROP CONSTRAINT ck_favorites_exactly_one_target;
ALTER TABLE favorites ADD CONSTRAINT ck_favorites_exactly_one_target CHECK (
  (question_id IS NOT NULL AND library_file_id IS NULL AND course_episode_id IS NULL)
  OR (question_id IS NULL AND library_file_id IS NOT NULL AND course_episode_id IS NULL)
  OR (question_id IS NULL AND library_file_id IS NULL AND course_episode_id IS NOT NULL));
CREATE UNIQUE INDEX ix_favorites_student_id_course_episode_id
  ON favorites(student_id, course_episode_id) WHERE course_episode_id IS NOT NULL;
```
Before: 2 nullable target FKs, 2-way CHECK. After: 3 nullable target FKs, 3-way CHECK, 3 filtered
unique indexes. All existing rows satisfy the new CHECK (course_episode_id IS NULL → branches 1/2).
Entity change: Favorite gains `Guid? CourseEpisodeId` + nav (OperationalEntities.cs:175-184 area).
PlaybackProgress and MediaBookmark: NO schema change (progress already covers both asset types).

### D2 — Proposed backend DTO ("enriched favorite") — TypeScript contract
```ts
interface FavoriteItem {                    // sources (all server-side, one call)
  favoriteId: string;                       // favorites.id
  targetType: 'question' | 'file' | 'episode'; // derived from which FK is set
  targetId: string;                         // question_id | library_file_id | course_episode_id
  subjectId: string;                        // question.subject_id | library_file.subject_id | course.subject_id
  savedAt: string;                          // favorites.created_at (ISO-8601 UTC)
  title: string;                            // question.text (clamped ~120 chars) | library_file.title | episode.title
  subtitle: string | null;                  // lecture.name_ar | library_file.description | course.title
  typeMeta: string;                         // 'easy'|'medium'|'hard' | file type lowercased | 'video'|'audio'
  thumbnailUrl: string | null;              // library_file.thumbnail_url | course.cover_image_url | null (questions → icon fallback)
  durationSeconds: number | null;           // episode.duration_seconds | library_file.duration_seconds | null
  fileSizeBytes: number | null;             // library_file.file_size | episode.file_size | null
  pagesCount: number | null;                // library_file.pages_count | null
  episodeNumber: number | null;             // episode.episode_number | null
  courseId: string | null;                  // episode.course_id | null
  processingStatus: string | null;          // episode/library_file.processing_status ('ready'…) | null
  progress: { lastPositionSeconds: number; durationSeconds: number | null; completionPercent: number | null } | null;
                                            // playback_progress row (video/audio assets) — absent for questions/texts
}
```
Nullable-vs-required mirrors the entities exactly (T4 sources cited). processingStatus lets the card
disable "continue" for pending/failed transcodes (existing locked-card semantics, CoursePlayerPage).

### D3 — Proposed endpoints
- GET /api/v1/favorites?type=all|question|file|episode&sort=savedAt_desc|savedAt_asc|title_asc|title_desc&page=1&pageSize=20
  → PagedResult envelope { items: FavoriteItem[], total, page, pageSize, totalPages } — same envelope
  as /library/subject/{id} and /questions (PagedResult<T> convention). ONE list endpoint (not per-type):
  the UI is a mixed feed with type tabs; per-type endpoints would force client-side merging and break
  the one-round-trip goal. Server-side filter+sort+pagination; default savedAt_desc.
- POST /api/v1/favorites — CreateFavoriteRequest(QuestionId?, LibraryFileId?, EpisodeId?) with
  exactly-one-of-three validation; idempotent semantics preserved (200 existing / 201 new).
- DELETE /api/v1/favorites/episodes/{episodeId} (NEW; mirrors existing questions/ + files/ routes).
- Auth/rate-limit UNCHANGED: student role + signed entitlement + "favorites" 30/min.
- Recommended (implementation choice): move handlers into MediatR (GetFavoritesQuery / Create/Delete
  commands in CMS.Application/Handlers/Favorites/) — restores the CQRS pipeline consistency the
  controller currently bypasses (T2 anomaly) and enables the standard HandlerTests pattern.
- Enrichment with NO N+1: page query → collect DISTINCT subject ids of the page (≤ pageSize) → ONE
  batched entitlement scope check → in-memory filter; progress enrichment = ONE PlaybackProgress
  query for the page's video/audio asset ids (dictionary join); Include chains for question→lecture,
  file, episode→course→subject. Total fixed query count ≈ 5 per page regardless of page size.

### D4 — Proposed frontend architecture
Component tree (new feature folder features/favorites/):
```
FavoritesPage (/favorites)
├── FavoritesToolbar: TypeFilterTabs (all/questions/files/episodes) + SortSelect — state in URL search params (?type=&sort=&page=)
├── FavoritesList → FavoriteCard×N (type variants: question/file/episode)
│    card: thumbnail-or-icon | type chip | title | subtitle(course/lecture) | meta row (duration/size/pages/difficulty)
│          | progress bar when progress ≠ null | Continue (video/audio, disabled when processingStatus ≠ ready)
│          | Open (question→LecturePage, file→LibraryPage+DocumentViewer, episode→CoursePlayerPage) | Remove (optimistic)
├── SkeletonGrid (loading) | EmptyState PER active tab (per-filter copy) | ErrorState (retry)
```
- State ownership: URL search params (shareable, back-button-safe) + React Query
  ['favorites', {type,sort,page}] ; local state only for transient UI.
- Optimistic delete: onMutate (cancel + snapshot + remove from cache) → onError rollback + toast →
  onSettled invalidate ['favorites'] (prefix — invalidates all parameterizations).
- Save fixes riding the same push (they are part of the bug): QuestionPage favoriteMutation gets
  onSuccess/onError (toast + icon flip + invalidate ['favorites'] AND the questions-list key);
  CoursePlayerPage gains an "add to favorites" toggle for episodes (new — the missing affordance);
  LibraryPage path unchanged (already correct).
- Continue behavior: navigate /my-studies/courses/:courseId (+ optional ~5-line enhancement reading
  ?episode= into the page's initial selection); auto-resume already lives inside VideoPlayer
  (CoursePlayerPage doc :24 — resume-from-last-position). For library video/audio: open the file in
  DocumentViewer (no position restore there today — honest limitation; flagged in T6).
- WCAG 2.2 AA: aria-pressed tabs, ≥44px targets, focus-visible rings, aria-busy skeletons, Arabic
  aria-labels; mobile-first single-column → sm: 2-col → lg: 3-col grid; native RTL (app dir=rtl).

### D5 — Interconnection
- One-call list: YES — GET /favorites with params returns every field the cards render; ZERO client
  joins, ZERO two-phase fetches, ZERO per-card follow-up calls (progress included server-side).
- Payload: enriched item ≈ 0.4 KB JSON → 20-item page ≈ 8 KB; a 50-favorite user (3 pages) ≈ 20 KB
  total. Acceptable; pagination keeps the ceiling bounded.

### D6 — Complexity estimate
- Files to CREATE (~9): prisma n/a — EF: Migrations/*_AddEpisodeFavorites.cs (+auto Designer);
  CMS.Application/DTOs/Favorites/FavoriteDtos.cs; CMS.Application/Handlers/Favorites/FavoritesHandlers.cs;
  student-web: features/favorites/pages/FavoritesPage.tsx, features/favorites/services/favorites-api.ts,
  features/favorites/components/FavoriteCard.tsx, FavoritesToolbar.tsx, FavoriteSkeleton.tsx.
- Files to MODIFY (~7): OperationalEntities.cs (Favorite entity); ApplicationDbContext.cs (config);
  FavoritesController.cs (thin MediatR dispatch + episode delete route + request DTO);
  QuestionPage.tsx (mutation feedback/invalidation fix); CoursePlayerPage.tsx (episode favorite
  button + ?episode= param); router.tsx (import path); question-api.ts/library-api.ts (favorites
  wrappers migrate to favorites-api.ts).
- Migrations: exactly 1 — AddEpisodeFavorites.
- Tests: unit handler tests (~12 cases: enrichment shape, type filter, sorts, pagination, episode
  target, idempotent create); integration extension of FavoritesHttpIntegrationTests (~6 facts:
  episode create/list/delete, file favorite round-trip, pagination/sort envelope); vitest page tests
  (~8: tabs, per-tab empty states, optimistic rollback, skeleton); NEW e2e favorites.e2e.mjs (~6:
  save episode from player → appears under Episodes tab → continue navigates → optimistic remove).
- Estimated pushes: ONE atomic push (11.3) — the GET envelope change (array → PagedResult) breaks the
  CURRENT page, so API + web must merge to main together (Render + Vercel auto-deploy from the same
  commit). Splitting into 2 pushes would require a temporary compat shim judged not worth the debt;
  if the supervisor prefers smaller review surfaces, the split point is backend+migration+integration
  tests (11.3-a, envelope kept array-compatible by ALSO returning items at top level — not
  recommended) then frontend (11.3-b).

## T6 — Risks and open questions
1. CHECK-constraint swap on a live table: safe by construction (all existing rows keep satisfying
   the 3-way CHECK — course_episode_id is NULL for them), but the migration MUST apply before the
   API starts accepting episode favorites (standard EF migration ordering; Render deploy gate).
2. Payload growth for heavy users (500+ favorites): pagination mandatory from day one (default 20,
   cap 100); the current unbounded array becomes a page.
3. Entitlement scope checks are per-item today (N+1 pattern, same as LibraryHandlers.cs:85-93 with
   its documented EF concurrency constraint) — the 11.3 handler MUST batch by the page's distinct
   subject set or latency regresses with favorite count.
4. Episode thumbnails do NOT exist server-side (T4) — cards fall back to Course.CoverImageUrl;
   questions fall back to a type icon. Needs user sign-off on the visual.
5. Continue button on audio favorites (and on library video/audio files): data fully exists
   (PlaybackProgress covers both asset types) but DocumentViewer has no position restore — user
   decision: episodes-only in 11.3, or library media included (restore needs a small player swap)?
6. Saved timeline CLIPS (media_bookmarks) remain invisible on the favorites page after 11.3 — the
   user's mental model may still expect them. Surfacing clips is out of 11.3 scope (§12) — Wave 12
   candidate; needs an explicit supervisor/user decision.
7. Deploy skew: for seconds, old cached Vercel bundles may hit the new PagedResult envelope
   (FavoritesPage would render "empty" until the new bundle loads). Blast radius tiny (the page is
   already broken-empty per T1); atomic merge mitigates.
8. Stats favoriteCount (StatsHandlers.cs:64 — raw row count, no scope/published filter) will diverge
   further from the visible list once episodes count. Minor; propose aligning in a later push.

## RESUME_FROM
RESUME_FROM: f7fbf1d + <this commit> (wip/11.2-diag) — DIAGNOSTIC + DESIGN COMPLETE. Awaiting
supervisor AND user approval of the T5 design before Push 11.3 (implementation). No production code
exists on this branch; main untouched at 20f4bf65a45cd04021b155f636f42b99e2c9f9c8.
