# WIP_STATUS — feat/12.4a-video-controls (Wave 12.4.A: Video Player Fixes)

## ─── 12.4.A — CURRENT STATE (this branch) ────────────────

Base: main @ e7cd6a6 (PR #66 merge — Wave 12.4b-courses-fix CLOSED).
Waves 13.2–13.7 and 12.4b CLOSED. R62/R63/R64 verified and recorded in their
reports; the R62 section that previously lived in this file is superseded —
its content landed on main via PR #66.

NOT pushed — awaiting supervisor PAT (§2 stop gate). 4 commits on the branch
(SHAs finalized at commit time; see the git log block at the bottom):

1. `fix(student-web)` §2.B — ControlsBar mobile layout: container-query fold,
   single-line row at every width, axe thumb labels.
2. `fix(student-web)` §2.A — VideoPlayer auto-hide contract: 5000 ms, no touch
   visibility toggle, fullscreen re-arm, unmount timer cleanup.
3. `test(student-web)` §2.C + §13 — e2e extensions (timing / fullscreen /
   row-overflow / fold) + `w12.4a-axe.mjs` 5-width axe+screenshot harness.
4. `docs` — this WIP_STATUS refresh.

### Workorder map (PART I 12.4.A → commits)

- **§2.A Bug B (VideoPlayer.tsx)**
  - `CONTROLS_AUTO_HIDE_MS` 2600 → **5000** (user-reported expectation ~5s).
  - Touch single-tap race REMOVED: the deferred single-tap (DOUBLE_TAP_MS=280)
    previously INVERTED visibility ~280 ms after the pointerup bump → bar
    vanished ~0.3 s after every tap. Now the touch branch only calls
    `bumpControls()` (show + re-arm 5 s). Toggling removed entirely —
    show-on-tap + auto-hide-after-5 s is the whole touch contract.
  - Fullscreen: `toggleFullscreen` body wrapped in try/finally → `bumpControls()`
    on every exit path (shell / document enter+exit / caught error / native iOS);
    `fullscreenchange` listener also bumps + re-arms (covers OS-driven exits).
  - Unmount cleanup: auto-hide timer + deferred single-tap timer cleared
    (setState-on-unmounted hygiene).
- **§2.B Bug C (ControlsBar.tsx)**
  - Button row: `flex-wrap justify-center` + `data-testid="video-controls-row"`.
  - Favorite + bookmark: folded on narrow CONTAINERS (`hidden @sm:flex`),
    NOT below-sm viewports — see "Deviation (supervisor-visible)" below.
  - Time display: `text-[10px]` on narrow containers (`@sm:text-xs`), `px-0.5`.
  - Seek slider band 28 → 24 px (h-6 — exactly the WCAG 2.5.8 AA minimum) so the
    center play button's hit point clears the slider on short 16:9 boxes.
  - Rate trigger floor `min-w-14` → `min-w-11`; volume reveal `sm:block` →
    `@lg:block` (no hover-wrap on narrow boxes).
  - Target met: **375 px → row scrollWidth 291 ≤ clientWidth 291, zero overflow,
    zero page horizontal scroll.**
- **§2.C e2e (player-video.e2e.mjs)**
  - ROW `scrollWidth <= clientWidth` assert at 375 px (plus fold + fullscreen-
    reachability asserts).
  - Timing spec: tap → visible @0 s, still visible @4 s, hidden @~5.3 s
    (swap-free lease route ttl=3600 — the base ttl=8 cascade can pause the
    element exactly on the 5 s hide deadline and skip the hide).
  - Fullscreen spec: enter → visible, 5.5 s → hidden, exit → visible.
  - Suite: **29/29 passed, zero console errors.**
- **§13 evidence (`w12.4a-axe.mjs`, mirrors w13.1-axe.mjs contract)**
  - 5 widths (375/414/768/1024/1440): screenshot per width
    (`e2e/screenshots/w12.4a-video-*.png`) + axe (wcag2a/2aa/21aa/22aa) scoped
    to the player container + page-level no-horizontal-scroll + row zero-
    overflow at EVERY width. Result: **5/5 scans, 0 blocking violations**
    (`w12.4a-axe.json`). The new scan surfaced a pre-existing serious violation
    (`aria-input-field-name`): Radix renders `role="slider"` on the THUMB while
    the aria-labels sat on the Root — fixed by labeling both thumbs directly.
  - RTL grep (added lines only): **zero directional utilities introduced**.
    Pre-existing physical `left-0/right-0` classes are the documented
    LTR-seek-timeline convention (ControlsBar.tsx:8-16, YouTube-Arabic style).

### Deviation (supervisor-visible, evidence-driven)

Workorder §2.B said "hide favorite/bookmark below `sm` (<640 px)". Implemented
as container queries (`@sm` on the bar's own width) instead of viewport `sm`,
because the 5-width §13 run PROVED viewport-based folding is the wrong axis:
at ≥lg the course page renders the player in a ~302 px side-by-side column —
with `sm:` folding the row kept all 7 buttons, wrapped to 2 lines (h=94) and
the bar covered the entire 16:9 box, making the CENTER PLAY BUTTON
UNCCLICKABLE for real users (DIAG: row y-offset 63..157 vs button center 85 of
170; intercepting element `video-controls-row`, then `video-seek-slider`).
Container folding satisfies the workorder's 375 px contract AND the lg column.
Affected: favorite/bookmark fold, time font, bar padding, volume reveal.

### Verification ladder (final state, all green)

```
pnpm --filter @cms/student-web exec tsc -b        → exit 0
pnpm --filter @cms/student-web lint               → exit 0 (--max-warnings=0)
pnpm --filter @cms/student-web exec vitest run    → 24 files, 347/347 passed
node e2e/player-video.e2e.mjs                     → 29/29 passed, 0 console errors
node e2e/w12.4a-axe.mjs                           → 5/5 widths, 0 blocking
pnpm --filter @cms/student-web build              → exit 0 (SW generated, 68 entries)
```

Note: `pnpm --filter <pkg> tsc` / `vitest` (workorder ladder wording) silently
resolve as MISSING SCRIPTS on this pnpm — run via `exec` (done above); the
build script (`tsc -b && vite build`) also re-verifies both.

### Out of scope / untouched

- Backend: zero changes (frontend-only wave).
- Audio/PDF players: their own controls untouched (12.3 pattern respected).
- BottomNav contrast finding (w13.1 informational) — still out of scope §12.

## ─── git log (this branch) ───────────────────────────────

See `git log main..feat/12.4a-video-controls --oneline` for the exact SHAs;
the four commits above correspond 1:1 to the workorder map. STOP GATE:
pushing requires supervisor PAT (next round).
