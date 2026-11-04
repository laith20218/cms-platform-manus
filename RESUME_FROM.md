# RESUME_FROM — next session start point

- **State: ALL FOUR W15.0 PHASES (PART I workorder) COMPLETE.** Every phase
  branch carries its own WIP_STATUS.md; this file is the AUTHORITATIVE
  session-wide resume map. ALL BRANCHES ARE LOCAL ONLY (do NOT push without
  supervisor approval, §2).

## W15.0 phase map (each branch off main @ 800789f)

| Phase | Branch | Commits (oldest → newest) | Status |
|---|---|---|---|
| 1 — backend custom lists + preferences | `feature/w15.0-backend-custom-lists` | `de2452a` → `1bc2364` → `528a91a` → `ab9386a` (docs) | DONE, verified |
| 2 — favorites UI + list picker | `feature/w15.0-frontend-favorites` | `34bf13f` → `69a45fb` → `c43dcf4` → `d4a58a6` (docs) | DONE, verified |
| 3 — courses cascade + accordion | `feature/w15.0-frontend-courses-cascade` | `54a08cf` → `0d7df34` → `e934f25` → `f2cd249` → `3c9d185` (docs) | DONE, verified |
| 4 — shared QuestionRow + inline lists | `feature/w15.0-frontend-question-list` | `75b74bc` → `be82f61` → `8be64f4` → `4fc68d3` → `536b65e` (evidence) + docs | DONE, verified |

## Verification summary (per branch, final trees)

- **Phase 1 (API)**: dotnet build 0 errors / 20 pre-existing warnings · dotnet
  test **710 passed / 0 failed / 27 skipped** (baseline 679; +31 new: 21
  FavoriteLists + 10 Preferences) · `dotnet ef migrations has-pending-model-changes`
  → "No changes" · migration SQL mirror
  scripts/migrations/W15_0AddCustomFavoriteLists.sql (NOT applied — §2/§3;
  Supervisor executes on Neon).
- **Phase 2 (favorites UI)**: tsc 0 · eslint 0 · vitest **385/385 (30 files)**
  (baseline 378 + 7) · vite build PASS.
- **Phase 3 (cascade)**: tsc 0 · eslint 0 · vitest **382/382** (+4 cascade
  tests) · @cms/ui tsc 0 · e2e w15.0-cascade **12/12** + w14.4 regression
  **49/49** · RSS 886MB · 375px screenshots
  (w15.0-cascade-{,restored-,deeplink-categorized-}375.png).
- **Phase 4 (question lists)**: tsc 0 · eslint 0 · vitest **380/380** (+2
  list/action tests) · vite build PASS · w14.4 §13 matrix re-baselined **49/49**
  · RSS 885MB · refreshed 375px captures (practice list = 375×1344 full page).

## Pending supervisor STOP-GATE steps (in order)

1. Review each branch's WIP_STATUS.md evidence pack (deviations are listed
   per branch — the material ones: Phase-1 migration timestamp hand-rename,
   RemoveQuestion unpublished-tolerance, 409 list-name conflicts; Phase-2
   star-click opens the picker; Phase-3 localStorage-over-Preferences-API on
   that branch + lecture-accordion→accordion-header testid rename; Phase-4
   QuestionPage left as pager, exam resume = last answered index, review
   border coding dropped).
2. Push approvals (PAT inline, §5, triple-scrub), one branch at a time:
   `git push -u origin <branch>` → PR → CI green → merge.
3. **Merge order**: Phase 1 FIRST (Phase 2's UI assumes its endpoints until
   merged), then Phase 2; Phases 3 and 4 are independent of 1/2 (all endpoints
   they use exist on main). Phase 2 and Phase 4 both touch
   QuestionPage-adjacent surfaces but NOT the same files (Phase 2 edits
   QuestionPage.tsx + favorites feature; Phase 4 adds components/QuestionRow +
   ReportQuestionDialog and rewrites practice/exam pages) — no conflicts.
4. Deploy gate (Phase 1): apply scripts/migrations/W15_0AddCustomFavoriteLists.sql
   to Neon (idempotent, transaction-wrapped) → deploy the API → re-run the
   student golden paths.
5. Post-merge follow-ups already scoped in the WIP_STATUS files: list
   rename/delete UI (Phase 2), Preferences-API sync for the cascade (Phase 3),
   QuestionPage list conversion + isFavorite on practice DTOs (Phase 4).

## Environment (next session)

- dotnet SDK 9.0.320 at /home/z/.dotnet; pnpm 9.12.0 via corepack at
  /home/z/.corepack-bin; export PATH=/home/z/.corepack-bin:/home/z/.dotnet:$PATH.
- `dotnet ef` design-time needs CMS_EF_CONNECTION=<any dummy Npgsql string>
  (factory never connects for add/script/has-pending-model-changes).
- Local eslint in student-web/admin-web requires ESLINT_USE_FLAT_CONFIG=false —
  the clone lives inside /home/z/my-project (a Next.js scaffold whose flat
  eslint.config eslint 8.57 detects up-tree). CI unaffected.
- vite dev binds IPv6 localhost — run e2e with E2E_WEB_URL=http://localhost:5173.
- Playwright chromium-1200 preinstalled at ~/.cache/ms-playwright.
- No Docker (Testcontainers tests skip — expected).
- **Sandbox clock reads Nov 2026 — BEFORE the repo's future-dated migrations
  (20261116/20261117): any NEW migration must be hand-renamed to sort after
  20261117120000 (Phase 1 hit this; see its WIP_STATUS deviation #1).**
- Clone: /home/z/my-project/cms-platform-manus.
