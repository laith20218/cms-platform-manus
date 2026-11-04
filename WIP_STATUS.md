# WIP_STATUS — feature/w15.0-frontend-courses-cascade (W15.0 Phase 3: Courses Cascade + Accordion)

## ─── STATE ───────────────────────────────────────────────
W15.0 Phase 3 (PART I workorder) COMPLETE — 3 commits + e2e evidence DONE on
`feature/w15.0-frontend-courses-cascade` (LOCAL ONLY — push requires supervisor
approval, §2). Base: main @ `800789fad8ed1c5df805464c1768deb420eb437d`
(verified before branching, §9).

## ─── COMMITS (this branch, oldest → newest) ──────────────
1. `54a08cf` feat(ui): reusable accessible Accordion component (W15.0 P3-C1)
2. `0d7df34` feat(student-web): cascading filters + last-filter persistence (W15.0 P3-C2)
3. `e934f25` refactor(student-web): categorized tab uses the shared Accordion (W15.0 P3-C3)
4. `f2cd249` test(student-web): W15.0 cascade e2e evidence + axe contrast fix

## ─── WHAT WAS IMPLEMENTED ────────────────────────────────

### Commit 1 — @cms/ui Accordion (`54a08cf`)
- packages/ui/src/components/Accordion.tsx + export: items[] API
  (header/headerIcon/headerMeta/content), uncontrolled (defaultOpenIds) +
  controlled (openIds + onToggle), aria-expanded/aria-controls + role=region
  panel labelled by its header, disabled items, nesting via arbitrary content.
  No new dependencies (lockfile frozen). Chrome defaults --c-* with
  className/headerClassName/panelClassName/chevronClassName overrides
  (tailwind-merge last-conflict-wins) for --cms-* pages.

### Commit 2 — cascade + persistence (`0d7df34`)
- CascadeFilters.tsx (features/exam-courses/components/): 5 Radix Selects
  (University → College → Year → Semester → Subject) over the EXISTING
  per-level academicApi endpoints (DIAG-2: no aggregate endpoint — each level
  React-Query-cached independently). Choosing a level clears descendants;
  «الكل» resets level + descendants; «إعادة تعيين» clears all. Subject level:
  entitled enabled, non-entitled LOCKED (aria-disabled + lock icon, A.1 ruling).
- ExamCoursesPage: cascade lives in the URL (deep-linkable
  universityId/collegeId/yearId/semesterId/subjectId); unified canonical URL
  writer keeps tab + subject + cascade across switches. localStorage
  cms-exam-courses-filters-v1: restore-on-mount ONLY after subjects load and
  ONLY when the URL carries no cascade (URL wins; stored subject validated
  against entitlement); writes gated on the bootstrap pass (mount-time clobber
  race — found by test). Server-side sync via Phase-1 /student/preferences is
  a post-merge follow-up (branch builds on main — endpoint absent here).
- test-setup.ts: jsdom scrollIntoView stub (Radix Select).
- +4 vitest tests (deep-link fetches, persistence round-trip, lock, URL write).

### Commit 3 — categorized tab refactor (`e934f25`)
- CategorizedTab maps the practice tree onto AccordionItemData with controlled
  open-state (reset on subject change, first lecture open by default) +
  --cms-* chrome overrides — visual parity with the removed page-local
  LectureAccordion. start-practice-* testids + group rows unchanged.
- e2e contract rename: lecture-accordion-* → accordion-header-* (w14.4 script).

### Commit 4 — e2e evidence (`f2cd249`)
- w144-mock-world: cascade fixtures (s-9 non-entitled for the lock contract);
  children-before-list route registration (Playwright precedence; list matched
  by ?query regex).
- w15.0-cascade.e2e.mjs (12/12): level-by-level selection deep-links every URL
  param; locked subject; 375px screenshot + zero-h-scroll + axe 2.2 AA
  (0 critical/serious — one serious color-contrast found and FIXED: level
  prefix darkens to --cms-teal-800 on the selected teal background);
  localStorage restore on a fresh visit; cold deep-link renders labels.
- W14.4 regression matrix re-run: **49/49**, peak Chromium RSS 886MB (§4 <1.6GB).

## ─── VERIFICATION LADDER (final tree) ────────────────────
- `tsc -b`: 0 errors · `eslint --max-warnings=0`: exit 0 (ESLINT_USE_FLAT_CONFIG=false
  locally — sandbox nesting quirk; CI unaffected) · `vitest run`: **382/382 (29
  files)** — baseline 378 + 4 cascade tests · @cms/ui `tsc --noEmit`: 0 errors.
- E2E: w15.0-cascade 12/12 · w14.4-student-ui regression 49/49 · RSS 886MB.
- Screenshots (375px): e2e/screenshots/w15.0-cascade-375.png,
  w15.0-cascade-restored-375.png, w15.0-cascade-deeplink-categorized-375.png.

## ─── DISCLOSED DEVIATIONS / DECISIONS ────────────────────
1. **localStorage chosen over the Preferences API** (workorder allowed either):
   this branch builds on main, which lacks the Phase-1 endpoint; sync via
   /student/preferences is a post-merge follow-up (comment in the page).
2. **Entitled subject chips row KEPT alongside the cascade** (non-regression):
   chips remain the quick path; the cascade is the browse path. Choosing via
   chips keeps the cascade value intact; the 5th select shows the subject only
   when it belongs to the loaded semester.
3. **N+1 cascade loads accepted** (DIAG-2): each level is its own cached query;
   no aggregate endpoint was added (out of scope — backend phase froze at
   Phase 1's contract).
4. **Accordion testid rename** lecture-accordion-* → accordion-header-* — e2e
   updated + documented inline; vitest unaffected (no references).
5. **Cascade level labels show counters** (collegesCount/yearsCount/…) from the
   existing DTOs — free signal, no extra requests.

## ─── NEXT (STOP GATE → supervisor) ───────────────────────
1. Review the 4 commits + screenshots + this evidence pack.
2. Push approval → `git push -u origin feature/w15.0-frontend-courses-cascade`
   → PR → CI green → merge (independent of Phase 1/2 branches — no API
   contract dependency; all endpoints used already exist on main).
- **Environment note**: pnpm 9.12.0 via corepack at /home/z/.corepack-bin;
  ESLINT_USE_FLAT_CONFIG=false for local lint; vite dev server for e2e binds
  localhost (IPv6 in this sandbox — use E2E_WEB_URL=http://localhost:5173);
  Playwright chromium-1200 at ~/.cache/ms-playwright; clone at
  /home/z/my-project/cms-platform-manus.
