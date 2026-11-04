# WIP_STATUS — feature/w15.0-backend-custom-lists (W15.0 Phase 1: Backend Custom Lists)

## ─── STATE ───────────────────────────────────────────────
W15.0 Phase 1 (PART I workorder) COMPLETE — 3 of 3 commits DONE on
`feature/w15.0-backend-custom-lists` (LOCAL ONLY — push requires supervisor
approval, §2). Base: main @ `800789fad8ed1c5df805464c1768deb420eb437d`
(verified before branching, §9). Phases 2–4 (frontend) live on SEPARATE
branches off the same main, per the workorder — see RESUME_FROM.md.

## ─── COMMITS (this branch, oldest → newest) ──────────────
1. `de2452a` feat(api): custom favorite lists entities + migration (W15.0 P1-C1)
2. `1bc2364` feat(api): custom favorite lists API — CQRS + controller (W15.0 P1-C2)
3. `528a91a` feat(api): student preferences GET/PUT endpoint (W15.0 P1-C3)

## ─── WHAT WAS IMPLEMENTED ────────────────────────────────

### Commit 1 — entities + migration (`de2452a`)
- `FavoriteList` : AuditableEntity (soft-delete capable; CreatedBy = student id):
  StudentId, Name(≤100), Description(≤500), Color(≤20) — CMS.Domain/Entities/
  OperationalEntities.cs:227-285. `FavoriteListItem` : BaseEntity (FavoriteListId,
  QuestionId) — OperationalEntities.cs:294-311.
- Nav props: `Student.FavoriteLists` (UserEntities.cs:65),
  `Question.FavoriteListItems` (QuestionEntities.cs:61).
- DbContext config (ApplicationDbContext.cs:406-441): unique ix
  (favorite_list_id, question_id); reverse-lookup ix on question_id (the picker);
  Student→Cascade, List→Cascade, Question→Cascade (ExamCourseItem precedent —
  "a membership row is meaningless without either side").
- Migration `20261118120000_AddCustomFavoriteLists` (RENAME DISCLOSURE: generated as
  20261104… by the sandbox clock, which predates the repo's future-dated sequence —
  hand-renamed .cs/.Designer.cs + [Migration] id so it sorts AFTER
  20261117120000_DropQuestionExamId; `has-pending-model-changes` → "No changes").
- Idempotent SQL mirror: scripts/migrations/W15_0AddCustomFavoriteLists.sql.
  **NOT applied to any database (§2/§3 — Supervisor executes on Neon).**

### Commit 2 — CQRS + controller (`1bc2364`)
- DTOs: FavoriteListDto (+QuestionsCount, +ContainsQuestion for the picker),
  FavoriteListMutationDto, AddQuestionToFavoriteListResult (FavoriteListDtos.cs).
- Commands/Queries (FavoriteListsCommands.cs): Create/Update/Delete list,
  Add/Remove question membership, GetFavoriteLists(?questionId → membership flags),
  GetQuestionsInFavoriteList (paged, ?search=, FavoriteItemDto card shape —
  reuses the SAME question-card contract as flat favorites).
- Handlers (FavoriteListsHandlers.cs): ownership-by-lookup (foreign id → 404),
  same-name conflict → 409, Published-question gate + QuestionsExams entitlement
  on add (mirrors CreateQuestionOrFileFavoriteCommand), idempotent add/remove,
  batched entitlement map on the list-questions read.
- Controller: FavoriteListsController @ /api/v1/favorites/lists (rate-limit
  "favorites", student role). Route-precedence note: the literal "lists" segment
  beats FavoritesController's {targetType}/{targetId} template — unambiguous.
- 21 unit tests (FavoriteListsHandlersTests.cs).

### Commit 3 — preferences endpoint (`528a91a`)
- StudentPreferencesController @ /api/v1/student/preferences (GET + PUT, student role).
- GetStudentPreferencesQuery / UpdateStudentPreferencesCommand + handlers
  (Commands/Profile/, Handlers/Profile/): pass-through over the previously-UNWIRED
  Student.Preferences JSON column (UserEntities.cs:52). Shape-only validation:
  must be a JSON OBJECT (arrays/scalars/null → 400 PREFERENCES_INVALID_JSON),
  ≤ 8 KB (PREFERENCES_TOO_LARGE); stores the canonical serialization; corrupt
  stored value degrades to the entity default on read (never a 500).
- `Student.UpdatePreferences` domain method (UserEntities.cs:58-64).
- 10 unit tests (StudentPreferencesHandlersTests.cs).

## ─── ENDPOINTS ADDED (this branch) ───────────────────────
| Verb   | Route                                              | Purpose                          |
|--------|----------------------------------------------------|----------------------------------|
| GET    | /api/v1/favorites/lists?questionId=                | Lists + counts (+ membership)    |
| POST   | /api/v1/favorites/lists                            | Create list (409 on same name)   |
| PUT    | /api/v1/favorites/lists/{listId}                   | Partial update (rename/color)    |
| DELETE | /api/v1/favorites/lists/{listId}                   | Delete list (cascade items)      |
| POST   | /api/v1/favorites/lists/{listId}/questions/{qid}   | Add membership (idempotent 201/200) |
| DELETE | /api/v1/favorites/lists/{listId}/questions/{qid}   | Remove membership (idempotent 204) |
| GET    | /api/v1/favorites/lists/{listId}/questions         | Paged questions in list          |
| GET    | /api/v1/student/preferences                        | Read preferences JSON            |
| PUT    | /api/v1/student/preferences                        | Replace preferences JSON         |

## ─── VERIFICATION LADDER (final tree) ────────────────────
- `dotnet build CMS.sln`: 0 errors / 20 pre-existing warnings (W14.5 baseline).
- `dotnet test CMS.sln`: **710 passed / 0 failed / 27 skipped** (Testcontainers,
  no Docker). Baseline 679 → +31 (21 FavoriteLists + 10 Preferences), 0 regressions.
- `dotnet ef migrations has-pending-model-changes` → "No changes".
- Migration SQL: see scripts/migrations/W15_0AddCustomFavoriteLists.sql (idempotent,
  transaction-wrapped, __EFMigrationsHistory-guarded).

## ─── DISCLOSED DEVIATIONS / DECISIONS ────────────────────
1. **Migration timestamp hand-renamed** (20261104… → 20261118120000): sandbox clock
   predates the repo's future-dated sequence; unrenamed, the migration would sort
   BEFORE DropQuestionExamId and script generation returns empty output.
2. **RemoveQuestion tolerates unpublished/soft-deleted questions** (skips the
   Published filter; hard-deleted → idempotent 204): removing one's OWN row must
   stay possible — deviation from DeleteFavoriteCommand (which 404s), tested.
3. **Same-name conflict check (409)**: not in the workorder; added to keep chips +
   picker unambiguous. Exact-match (trimmed), case-sensitive.
4. **List count cap NOT enforced** (no max-lists-per-student): product decision —
   open question flagged to Supervisor.
5. **Color is any string ≤ 20** (no hex-format enforcement): presentation metadata.
6. **List delete is HARD delete** (cascade of membership rows; questions and flat
   favorites untouched). AuditableEntity base leaves soft-delete available if the
   product later wants a trash/undo flow.
7. **GetQuestionsInFavoriteList Total is pre-entitlement** (pagination stability),
   page hides inaccessible questions — identical trade-off to the flat favorites list.
8. **GetFavoriteLists requires no entitlement headers** (student metadata only,
   JWT identity suffices); question-content endpoints carry the full
   X-Entitlement + X-Installation-Id contract.

## ─── NEXT (STOP GATE → supervisor) ───────────────────────
1. Review the 3 local commits + this evidence pack.
2. Push approval → `git push -u origin feature/w15.0-backend-custom-lists`
   (PAT inline, §5, triple-scrub) → PR → CI green → merge.
3. Deploy gate → apply scripts/migrations/W15_0AddCustomFavoriteLists.sql to Neon
   (idempotent) → deploy API.
4. Phases 2–4 (frontend branches) merge against main AFTER this branch merges —
   their API contracts assume these endpoints.
- **Environment note**: dotnet SDK 9.0.320 at /home/z/.dotnet; pnpm 9.12.0 via
  corepack at /home/z/.corepack-bin (export PATH=/home/z/.corepack-bin:/home/z/.dotnet:$PATH);
  no Docker (27 Testcontainers skips expected); repo clone at
  /home/z/my-project/cms-platform-manus.
