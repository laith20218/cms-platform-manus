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
