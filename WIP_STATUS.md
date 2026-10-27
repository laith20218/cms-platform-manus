# WIP_STATUS — wip/11.3

## Base
Branch: wip/11.3
Parent: 20f4bf65a45cd04021b155f636f42b99e2c9f9c8 (main, Push 11.1 merged; 11.2-DIAG design APPROVED)
Status: PART A COMPLETE. PARTS B–E in progress.
CRITICAL: migration file generated but NOT applied to any DB (STOP GATE §2/§3).

## PART A — Migration AddEpisodeFavorites (FILE ONLY — NOT APPLIED)
- Entity: Favorite gains `Guid? CourseEpisodeId` + `CourseEpisode?` nav
  (apps/api/src/CMS.Domain/Entities/OperationalEntities.cs:172-193).
- DbContext (apps/api/src/CMS.Infrastructure/Persistence/ApplicationDbContext.cs:287-312):
  * CHECK ck_favorites_exactly_one_target → ternary (question|file|episode exactly-one);
  * NEW unique partial index ix_favorites_student_id_course_episode_id
    (filter "course_episode_id IS NOT NULL") — matches the two existing siblings;
  * FK favorites.course_episode_id → course_episodes.id ON DELETE RESTRICT (documented
    rationale in code: deleting an episode must not silently delete students' favorites).
- Migration file: apps/api/src/CMS.Infrastructure/Persistence/Migrations/
  20261027013220_AddEpisodeFavorites.cs (+ .Designer.cs) — generated via
  `dotnet ef migrations add` (design-time factory + placeholder CMS_EF_CONNECTION; no DB touched).
- SQL extracted to /tmp/add_episode_favorites.sql (`dotnet ef migrations script
  20261026014837_AddTargetQuality AddEpisodeFavorites …`) — full script included in the
  push report for supervisor review.
- Pre-flight: every existing row has course_episode_id NULL → satisfies ternary CHECK
  branches 1/2 → constraint swap is safe on live data. EF also auto-adds the conventional
  non-unique FK-support index ix_favorites_course_episode_id (expected, mirrors the
  question/library FK indexes from Phase34).
- `dotnet ef database update` NOT run. No DB touched anywhere.

## RESUME_FROM
(after each part) — PART A done; PART B (backend MediatR) next.

## PART B — Backend MediatR + enriched DTO + paged endpoint + playback-url IsFavorite (COMPLETE)
- NEW DTOs (CMS.Application/DTOs/Favorites/FavoriteDtos.cs): FavoriteItemDto (11-field enriched shape),
  FavoriteProgressDto (LastPositionSeconds + nullable DurationSeconds/CompletionPercent — honest to the
  entity: completion stays NULL while duration unknown; «متابعة» still works from LastPositionSeconds),
  CreateFavoriteResult(Mutation, IsNew), FavoriteMutationDto (moved from controller file).
- NEW commands (CMS.Application/Commands/Favorites/FavoritesCommands.cs): GetFavoritesQuery,
  CreateEpisodeFavoriteCommand, CreateQuestionOrFileFavoriteCommand (legacy body route),
  DeleteFavoriteCommand (unified). PagedResult<T> REUSED from CMS.Application.Commands.Questions
  (one of 5 existing per-domain copies — NOT duplicated, cited in report).
- NEW handlers (CMS.Application/Handlers/Favorites/FavoritesHandlers.cs): all four handlers in one class
  (codebase convention). List pipeline: favorites+targets fetch w/ Includes (Q1) → batched entitlement map
  (Q2-Q4: student/subjects/subscriptions via NEW IEntitlementService.GetAccessibleSubjectMapAsync) →
  in-memory sort/pagination → progress join (Q5, skipped for question-only pages). Full-set fetch instead
  of DB-side Skip/Take is DELIBERATE: keeps ≤5 budget incl. entitlement security checks + "alpha" is a
  cross-table sort impossible in single SQL; client payload stays paginated. Create/Delete preserve the
  pre-11.3 semantics exactly (signed-entitlement-with-subject + scope gate inside handlers via injected
  ISignedEntitlementService; dedup 200/201; idempotent 204 deletes; 409/422 playback-identical
  transcoding gates for episode create — NULL status legacy MP4 stays favoritable).
- EntitlementService: GetAccessibleSubjectMapAsync added (batched twin of CanAccessSubjectContentAsync,
  same MatchesAcademicScope/GrantsContent statics — zero logic duplication; single-subject method untouched).
- PlaybackUrlDto: + IsFavorite (default false — non-breaking for existing constructors). GetPlaybackUrlQuery
  episode path: ONE Favorites EXISTS query after the entitlement gate (covers Ready HLS + legacy NULL-status
  MP4 episodes — deviation from B.5's literal "Ready" condition, justified: star button shows for ALL episode
  playback URLs; a Ready-only check would misreport legacy MP4 episodes as unfavorited).
- FavoritesController: rewritten to thin IMediator dispatch (5 routes: GET list w/ query params, POST
  episodes/{id}, POST legacy body, DELETE unified {targetType}/{targetId}, DELETE legacy questions//files/
  + single-segment question route). CreateFavoriteRequest stays (API body model).
- Verified: dotnet build 0 errors; EXISTING unit suite 380/380 passed (no regressions from MediaHandlers /
  EntitlementService / controller changes). New favorites unit tests land in PART E.

## PART C — features/favorites/ folder (COMPLETE)
- NEW files (apps/student-web/src/features/favorites/): types.ts (mirrors backend DTO + courseId/subjectId
  added — see PART B note: REQUIRED for the prompt's own متابعة/فتح navigation; the B.1 shape lacked them),
  api.ts (listFavorites/createEpisodeFavorite/deleteFavorite via apiClient + entitlementRequestConfig),
  hooks.ts (useFavoritesList ['favorites','list',params] w/ placeholderData; useCreateEpisodeFavorite;
  useDeleteFavorite with optimistic removal + snapshot rollback + ['favorites'] prefix invalidation —
  kills the 11.2-DIAG H1 stale-cache class), components/FavoritesToolbar.tsx (native ARIA tablist =
  MyStudiesPage convention — @radix-ui/react-tabs NOT installed and lockfile frozen §3; sort via
  @radix-ui/react-select), components/FavoriteCard.tsx (thumbnail/course-cover fallback, type chip,
  duration, processing badge, progress bar w/ role=progressbar, متابعة (episode+progress only, decision #3),
  فتح الحلقة / فتح في المكتبة, 44px delete), components/FavoritesSkeleton.tsx (6 cards, aria-busy),
  components/FavoritesEmptyState.tsx (per-tab copy + CTA), FavoritesPage.tsx (URL-param state
  ?type=&sort=&page=, canonicalization, error retry, pagination controls, AnimatePresence grid).
- DELETED: src/features/questions/FavoritesPage.tsx (replaced); question-api.ts lost its dead
  getFavorites/FavoriteItem (toggleFavorite kept — QuestionPage still uses it).
- router.tsx: import updated to features/favorites. Sidebar/BottomNav/DashboardPage link to the
  unchanged /favorites route (verified — no edits needed).
- tsc -b clean; eslint 0 errors on changed files; vitest 117/117 (no regressions).
- Known honest limitation: question cards carry no فتح deep link (question routes are subject-SLUG
  based and the DTO carries ids only) — questions keep delete-only actions in 11.3.

## PART D — Player star + QuestionPage cache fix + ?episode= deep link (COMPLETE)
- VideoPlayer.tsx: showFavoriteButton = assetType === 'course-episode'; isFavorite derives from
  lease info (PlaybackUrlInfo.isFavorite — NEW optional field) with an optimistic override that
  clears on every lease refresh (silent refreshes re-sync server truth); toggle calls
  favoritesApi create/delete, rolls back + toasts «تعذّر تحديث المفضلة، حاول مجددًا» on error,
  invalidates ['favorites'] on success. (Fixed a TDZ slip during authoring — favorite block moved
  AFTER the useMediaLease destructure; verified by tsc.)
- ControlsBar.tsx: ⭐ Star button (44px, aria-label «إضافة للمفضلة»/«إزالة من المفضلة»,
  aria-pressed, amber-filled when active, disabled while pending, data-testid=video-favorite-button)
  mounted NEXT TO the existing 🔖 bookmark button — product decision #1 (two separate concepts).
- CoursePlayerPage.tsx: EpisodeStage reads ?episode={id} ONCE on mount (deep-link target of the
  favorites card's «متابعة» navigation; falls back to the first playable episode; later in-page
  selections win over the stale URL param).
- QuestionPage.tsx (the 11.2-DIAG H1 fix): favoriteMutation rebuilt — onMutate flips the question's
  cached copies (['questions'] list shapes AND ['question-detail', id]) + a local override map;
  onSuccess invalidates ['favorites'] + toast (direction derived from mutation variables — no stale
  closure); onError removes the override + invalidates the question surfaces + error toast; button
  renders the computed state, aria-pressed, disabled while pending.
- tsc -b clean; eslint 0 errors; vitest 117/117.

## PART E — Tests (COMPLETE)
- Backend unit (apps/api/src/CMS.Tests/Unit/Handlers/FavoritesHandlersTests.cs — 32 tests):
  filter (mixed/3 types/invalid-type), sort (recent/oldest/alpha), pagination (slice+totals,
  pageSize clamp 100, page clamp), enrichment (episode: course title + cover + duration + Ready +
  progress; file: own thumb + type + category + progress; question: 160-char clamp + lecture
  subtitle + never progress), entitlement-revoked hiding, unpublished-course hiding, episode create
  (success/dedup-200/Pending-409/Failed-422/legacy-NULL-favoritable/invalid-signed-403/outside-scope-403),
  unified delete (episode/idempotent/ownership-security/missing-404), legacy question-file create
  (200-vs-201 parity + exactly-one rejection).
  THE ≤5-QUERY CONTRACT (SQLite in-memory + command-counting interceptor + REAL EntitlementService
  + FullSubject grant): measured EXACTLY 5 commands (favorites+targets fetch, student, subjects,
  subscriptions, progress) at pageSize=20 AND pageSize=100 — assertion pinned to ==5 for
  regression loudness. TRAP FIXED during authoring: interceptor overrides must be the ASYNC pair
  (ReaderExecutingAsync/ScalarExecutingAsync) — the sync-only pair counts ZERO on EF async APIs
  (a false-positive this suite explicitly guards against). Microsoft.EntityFrameworkCore.Sqlite
  9.0.0 added to CMS.Tests.csproj (test project only — required by the prompt's "counting
  DbContext" verification).
- MediaHandlersTests: +4 PlaybackUrlDto.IsFavorite tests (favorited episode true / unfavorited
  false / library video false even when favorited / library audio false).
- Frontend unit (src/features/favorites/tests/hooks.test.tsx — 9 tests): list fetch params
  (typed + type omitted), optimistic delete (pending-promise window) + rollback + toast, episode
  create (POST URL + ['favorites'] invalidation) + error toast, FavoritesPage URL-param
  normalization (bogus type/sort/page → canonical defaults), per-tab empty copy, enriched render +
  متابعة matrix + duration badge.
- e2e NEW favorites-advanced.e2e.mjs — 30/30 passed, console errors 0, PEAK CHROME RSS 906 MB
  (ceiling 1600): per-tab empty states + CTA, 20-card grid + thumbnails + chips, متابعة matrix
  (2/6 episodes; files → open-in-library; questions → none), non-Ready badge + disabled action,
  Episodes tab filtering, alpha + oldest sorts (DOM order), pagination (2/2 indicator + back),
  optimistic delete (specific card detaches + total label 22→21 + DELETE once), متابعة deep link
  → /my-studies/courses/:id?episode=episode-18, mobile 375px (no h-scroll, 44px tabs) + screenshot.
  Spec-only fixes during authoring: glob patterns must include the query string (**/favorites**),
  stateful delete mock (the onSettled refetch must serve consistent data), full-page delete count
  assertion replaced by card+total assertions (a full page refills from page 2 — correct pagination).
- e2e NEW player-favorite-toggle.e2e.mjs — 14/14 passed, console errors 0 (injected 500 excluded
  per the 11.1 convention), PEAK CHROME RSS 966 MB: star presence + initial aria state + Arabic
  labels, optimistic fill + POST once + success toast, optimistic unfill + DELETE once,
  isFavorite=true initial state from playback-url, delayed-500 → fill → revert (rollback) + error
  toast. Route-mock lesson recorded: DELETE goes to the SINGULAR /favorites/episode/{id} (unified
  {targetType} route) while POST is PLURAL /favorites/episodes/{id} — both backend-correct; the
  rollback behavior was verified working even when the mock initially missed the route.
- Regressions: dotnet build 0 errors/warnings; backend unit 416/416 (was 380; +36); tsc clean;
  eslint 0 errors; vitest 126/126 (was 117; +9); player-video.e2e.mjs 17/17 (2 consecutive runs;
  1 keepalive-beacon abort console line at page unload — navigation artifact, pre-existing
  mechanism, not an app error); player-hls.e2e.mjs 19/19 (ladder regenerated with ffmpeg 7's
  name:360p colon syntax), console errors 0, peak RSS 1015 MB.

## FINAL — commit map + verifications
- Commits on wip/11.3 (in order): ddbc883 (A: entity + migration FILE) → bfef93e (B: MediatR
  backend) → 98df808 (C: features/favorites/) → 25914d6 (D: player star + QuestionPage fix) →
  e05bbc2 (E: tests) → 0588f32 (chore: untrack regenerable e2e MP4 artifact + .gitignore) →
  THIS (final WIP_STATUS + RESUME_FROM).
- Full verification matrix at final state: dotnet build 0 errors/0 warnings; backend unit
  416/416; tsc -b clean; eslint 0 errors on changed files; vitest 126/126;
  e2e favorites-advanced 30/30 (RSS 906MB); e2e player-favorite-toggle 14/14 (RSS 966MB);
  e2e player-hls regression 19/19 (RSS 1015MB, console 0); e2e player-video regression 17/17
  ×2 consecutive runs (1 keepalive-beacon abort console line at page unload — navigation
  artifact of the beacon mechanism, pre-existing, not an app error).
- Honest limitations: integration tests (FavoritesHttpIntegrationTests + full integration suite)
  NOT executed — the sandbox has no Postgres (unchanged since 11.1). The controller's
  HTTP-surface changes (query-param list + new routes) are covered by unit-level handler tests +
  the two e2e suites at the network layer; the Postgres integration suite must run in 11.3-MERGE
  CI or on the supervisor's machine before production apply. pnpm-lock.yaml untouched. No DB
  touched anywhere. admin-web untouched.

## Post-merge debts (Push 11.3)
- ~~admin-web hard-delete (DELETE → 204) on episodes will trigger FK RESTRICT violation once a
  student favorites an episode.~~ RESOLVED by Push 11.3.1 (branch wip/11.3.1). PREMISE CORRECTED
  during implementation: DeleteEpisodeCommand is a SOFT delete (sets DeletedAt — the row survives,
  so the FK can never fire on its save); the REACHABLE 23503 path is the ghost purge in
  EnsureEpisodeNumberUsableAsync (hard-purges soft-deleted episodes on number reuse — a ghost can
  still be referenced by student favorites). Both save sites in CourseHandlers.cs now translate
  23503-on-fk_favorites_course_episodes_course_episode_id to ConflictException → 409 with Arabic
  guidance (Archive advice on the delete guard; pick-another-number advice on the ghost purge).
  Sibling hard-delete sites (AbortEpisodeUpload, CompleteUpload-oversize) were deliberately left
  unguarded per §12: their rows are pre-Ready uploads, which CreateEpisodeFavoriteCommand rejects.
- In-memory pagination in GetFavoritesQuery: fine for <200 favorites/user. Switch to SQL
  Skip/Take when usage grows.
- favoriteCount in StatsHandlers still counts only questions + files; episodes not included.
  Wave 12.
- e2e MP4 fixture at apps/student-web/e2e/fixtures/*.mp4 should be .gitignore'd
  (remove-if-needed).

## Post-merge debts (Push 11.3.1)
- B7: Npgsql dependency added to CMS.Application.csproj
      (architectural debt, tracked for Wave 12).
- D6-b: AbortEpisodeUploadCommand + CompleteEpisodeUploadCommand
        (size-limit path) not guarded — rows aren't favoritable
        today (Ready gate); revisit if Ready gate relaxes.

## Push 11.3.1 — FK RESTRICT graceful handling on episode delete (wip/11.3.1)
- Handler map (all episode-row delete paths, single file CourseHandlers.cs):
  DeleteEpisodeCommand (:379) SOFT; DeleteCourseCommand (:297) SOFT; ghost purge in
  EnsureEpisodeNumberUsableAsync riding SaveEpisodesWithNumberGuardAsync (:807) — HARD and
  REACHABLE via AddYouTubeEpisode/InitiateEpisodeUpload/UpdateEpisode renumber;
  AbortEpisodeUploadCommand + CompleteEpisodeUploadCommand-oversize — HARD but rows are
  pre-Ready (unfavoritable today), left unguarded per §12.
- Implementation (Option A, race-free): typed matcher IsFavoritesEpisodeRestrict — scans the
  DbUpdateException inner chain for PostgresException { SqlState == "23503" && ConstraintName ==
  "fk_favorites_course_episodes_course_episode_id" }; catch blocks at DeleteEpisodeCommand's save
  (defensive — soft delete today) and SaveEpisodesWithNumberGuardAsync (the reachable path);
  ConflictException (CMS.Domain) → ExceptionHandlingMiddleware:51-54 → 409 ProblemDetails with
  Arabic Detail. Message propagation verified end-to-end read-only: middleware Detail →
  admin-web lib/api.ts readProblem (detail ?? message ?? title) → ApiError.message →
  CoursesCenter.tsx:558 onError → App.tsx:214 toast.error. No admin-web changes needed.
- Dependency: Npgsql 9.0.2 direct reference added to CMS.Application.csproj (pinned to
  Infrastructure's transitive version — no drift) for typed PostgresException access.
- Tests (CourseHandlersTests.cs, +3): DeleteEpisode_FavoritesFkRestrict_TranslatedToConflict409
  (synthetic DbUpdateException wrapping a real PostgresException built with SqlState 23503 +
  constraintName — the extended public ctor; asserts ConflictException + المفضلة + الأرشفة),
  DeleteEpisode_WithoutFavorites_SoftDeletesEpisodeAndCleansBlob (regression),
  InitiateUpload_NumberHeldByFavoritedGhost_FkRestrict_TranslatedToConflict409 (the reachable
  path; asserts المفضلة + رقمًا آخر). Suite: CourseHandlersTests 51/51; full unit 419/419
  (416 baseline + 3). Build 0 errors. No migration, no admin-web/pnpm-lock changes.

## RESUME_FROM
RESUME_FROM: pending production verification. Push 11.3-MERGE completed: AddEpisodeFavorites
applied to Neon safety branch (user-confirmed) → production main/neondb (user-confirmed) →
schema verified (column/course_episode_id uuid YES; history row 20261027013220_AddEpisodeFavorites;
constraints ck_favorites_exactly_one_target + fk_favorites_course_episodes_course_episode_id
present) → merged to main --no-ff (28dc416) + debts recorded → pushed (auto-deploy triggered).
Supervisor will coordinate production verification with user.
Push 11.3.1 delivered on wip/11.3.1 (from main 699beff): 23503-on-favorites-episode-FK →
409 ConflictException with Arabic guidance, both save sites guarded, 3 unit tests added
(419/419 green).
Push 11.3.1-MERGE completed: wip/11.3.1 (c376907) merged to main --no-ff (64dc8b8);
post-merge debts B7 + D6-b recorded in this file; docs commit pushed to origin/main →
Render + Vercel auto-deploy triggered. RESUME_FROM: final main HEAD (this docs commit,
SHA in the 11.3.1-MERGE report) — production verification (supervisor coordinates;
golden path: favorited-episode ghost-purge renumber → 409 + Arabic toast in admin-web).
