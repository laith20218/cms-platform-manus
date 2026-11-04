# WIP_STATUS — feature/w15.0-frontend-favorites (W15.0 Phase 2: Favorites Custom Lists UI)

## ─── STATE ───────────────────────────────────────────────
W15.0 Phase 2 (PART I workorder) COMPLETE — 3 of 3 commits DONE on
`feature/w15.0-frontend-favorites` (LOCAL ONLY — push requires supervisor
approval, §2). Base: main @ `800789fad8ed1c5df805464c1768deb420eb437d`
(verified before branching, §9). Depends on the Phase-1 API contract
(/favorites/lists + /student/preferences) — that branch must merge first.

## ─── COMMITS (this branch, oldest → newest) ──────────────
1. `34bf13f` feat(student-web): custom lists types, API wrappers, and hooks (W15.0 P2-C1)
2. `69a45fb` feat(student-web): favorites list chips + list-scoped browse (W15.0 P2-C2)
3. `c43dcf4` feat(student-web): question-page list picker popover (W15.0 P2-C3)

## ─── WHAT WAS IMPLEMENTED ────────────────────────────────

### Commit 1 — types/api/hooks (`34bf13f`)
- types.ts: FavoriteListSummary (containsQuestion mirrors the backend's
  picker contract), Create/Update payloads, list-questions params.
- api.ts: `favoriteListsApi` — list CRUD (no entitlement: student metadata),
  membership add/remove + list-scoped paged questions (entitlement config,
  same auth surface as the flat family).
- hooks.ts: useFavoriteLists(questionId?), useQuestionsInFavoriteList,
  useCreate/Update/DeleteFavoriteList, useToggleQuestionInFavoriteList
  (optimistic containsQuestion + questionsCount patch across ALL
  ['favorites','lists',*] caches, keyed-questionId-aware, rollback + toast),
  useRemoveQuestionFromFavoriteList (optimistic grid removal).

### Commit 2 — FavoritesPage chips (`69a45fb`)
- FavoriteListChips.tsx: «الكل» + per-list chips (color dot, name, count) +
  «قائمة جديدة» dialog (name ≤100 + 6 preset color swatches as a
  radiogroup, CenteredDialog). Tablist ARIA, 44px targets, horizontal
  scroll + fade edges at 375px.
- FavoritesPage: ?listId= → list-scoped browse (list's questions, newest
  membership first; type tabs + sort hidden — a list holds questions only);
  stale/foreign listId silently falls back to «الكل»; canonical-URL effect
  keeps listId ONLY after the lists query resolves (never strips a valid
  deep link mid-load — race found by test, fixed); card delete in list mode
  removes the MEMBERSHIP (optimistic) instead of the flat favorite.

### Commit 3 — QuestionPage picker (`c43dcf4`)
- FavoriteListPicker.tsx: the star button is now a Radix Popover trigger
  (data-testid="question-favorite-button" PRESERVED — vitest + e2e
  contracts intact). Content: «المفضلة العامة» checkbox (flat favorite,
  unchanged semantics via the existing QuestionPage mutation callback) +
  per-list checkboxes (server membership flags, optimistic toggles) +
  inline create-and-add («قائمة جديدة…» → create → add current question).
- A11y: aria-haspopup="dialog" trigger, dialog-labelled content, NATIVE
  checkboxes with visible labels, 44px rows, ESC/focus by Radix, w-80
  clamped via collisionPadding for 375px, trigger fills when flat-favorited
  OR in ≥1 list.

## ─── VERIFICATION LADDER (final tree) ────────────────────
- `tsc -b`: 0 errors.
- `eslint . --ext ts,tsx --max-warnings=0`: exit 0
  (NOTE: requires ESLINT_USE_FLAT_CONFIG=false in THIS sandbox — the clone
  lives inside /home/z/my-project, whose Next.js scaffold ships an
  eslint.config that eslint 8.57 auto-detects up-tree; CI on GitHub is
  unaffected. Env quirk, not a repo defect.)
- `vitest run`: **385/385 (30 files)** — baseline 378/29 files; +7 tests
  (2 FavoritesPage list-mode incl. stale-listId fallback, 5 picker).
- `vite build`: PASS (PWA precache 76 entries).

## ─── DISCLOSED DEVIATIONS / DECISIONS ────────────────────
1. **Rename/delete list UI NOT built** — the workorder scoped Commit 2 to
   chips + Add List only. The backend endpoints (PUT/DELETE) and hooks
   (useUpdateFavoriteList/useDeleteFavoriteList) exist and are tested at the
   API layer; the chips row has no overflow menu yet. Follow-up candidate.
2. **Sort is hidden in list mode** — the Phase-1 list-questions endpoint
   orders by newest membership only (no sort param); the workorder did not
   ask for list sorting.
3. **Flat-favorite trigger semantics**: the star button no longer toggles
   flat-favorite on CLICK — it opens the picker (workorder-mandated). The
   flat toggle is the first checkbox inside. Testids/labels preserved.
4. **Picker queries only while open** — useFavoriteLists(questionId) is
   gated on popover open state (no idle background refetch per question).
5. **Color swatches**: 6 presets (rose/amber/emerald/teal/violet/slate);
   the backend accepts any string ≤20 (documented in Phase 1).

## ─── NEXT (STOP GATE → supervisor) ───────────────────────
1. Review the 3 commits + this evidence pack.
2. Push approval → `git push -u origin feature/w15.0-frontend-favorites`
   → PR → CI green → merge (AFTER the Phase-1 backend branch merges —
   this UI assumes its endpoints; until then the chips row/picker will
   get 404s from /favorites/lists).
- **Environment note**: pnpm 9.12.0 via corepack at /home/z/.corepack-bin;
  ESLINT_USE_FLAT_CONFIG=false for local lint (see verification note);
  clone at /home/z/my-project/cms-platform-manus.
