# RESUME_FROM — next session start point

- **State: W15.0 Phase 1 (backend custom lists + preferences) COMPLETE.**
  3 of 3 commits on `feature/w15.0-backend-custom-lists`, all verified,
  LOCAL ONLY (do NOT push without supervisor approval, §2).
- **W15.0 phase map (PART I workorder)** — each phase lives on its OWN branch
  off main @ `800789f` per the workorder; this file tracks Phase 1 only. The
  AUTHORITATIVE session-wide resume file (all four phases' SHAs + stop-gate
  order) is on the final branch, `feature/w15.0-frontend-question-list`:
  - Phase 1 — backend custom lists + preferences: **DONE, this branch**
    (`feature/w15.0-backend-custom-lists`).
  - Phase 2 — favorites custom-lists UI + list picker:
    `feature/w15.0-frontend-favorites` (same session).
  - Phase 3 — courses cascade + accordion tree:
    `feature/w15.0-frontend-courses-cascade` (same session).
  - Phase 4 — shared QuestionRow + inline list view:
    `feature/w15.0-frontend-question-list` (same session).
  Consult each branch's own WIP_STATUS.md / RESUME_FROM.md for its state.
- **Commit SHAs (Phase 1, oldest→newest)**: `de2452a` (entities + migration
  20261118120000_AddCustomFavoriteLists + SQL mirror) → `1bc2364`
  (FavoriteListsHandlers/Commands/DTOs + FavoriteListsController @
  /api/v1/favorites/lists + 21 unit tests) → `528a91a`
  (StudentPreferencesController @ /api/v1/student/preferences + handlers +
  10 unit tests).
- **Verification (Phase 1 final tree)**: dotnet build 0 errors / 20 pre-existing
  warnings · dotnet test **710 passed / 0 failed / 27 skipped** (baseline 679,
  +31 new, 0 regressions) · `dotnet ef migrations has-pending-model-changes`
  → "No changes" · SQL mirror scripts/migrations/W15_0AddCustomFavoriteLists.sql.
- **Pending supervisor STOP-GATE steps (in order)**:
  1. Review the 3 Phase-1 commits + WIP_STATUS.md evidence pack (deviations
     listed there — migration timestamp rename, RemoveQuestion unpublished
     tolerance, 409 name conflicts, etc.).
  2. Push approval → `git push -u origin feature/w15.0-backend-custom-lists`
     (PAT inline, §5, triple-scrub) → PR → CI green → merge.
  3. Deploy gate → apply scripts/migrations/W15_0AddCustomFavoriteLists.sql
     to Neon (idempotent, transaction-wrapped) → deploy the API.
  4. Then review/push Phases 2–4 branches (frontend; they assume the Phase-1
     API contract; see each branch's WIP_STATUS.md).
- **Environment**: dotnet SDK 9.0.320 at /home/z/.dotnet; pnpm 9.12.0 via
  corepack at /home/z/.corepack-bin; export PATH=/home/z/.corepack-bin:/home/z/.dotnet:$PATH;
  CMS_EF_CONNECTION=<any dummy Npgsql string> needed for `dotnet ef` design-time
  commands (factory never connects for add/script/has-pending-model-changes).
  No Docker (27 Testcontainers skips expected). Clone:
  /home/z/my-project/cms-platform-manus. Sandbox clock reads Nov 2026 — BEFORE
  the repo's future-dated migrations (20261116/20261117): any NEW migration must
  be hand-renamed to sort after 20261117120000.
