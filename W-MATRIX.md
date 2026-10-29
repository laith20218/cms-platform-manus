# W-MATRIX — Wave 11.7.x Regression Matrix

## Purpose

Single source of truth for "where is each closed race window tested, and where
is its red-first evidence." Wave 11.7.x closed ten fetch/hook-hygiene windows
(W1-W10, via P0 + P1) and three SWAPPING-phase residuals (W1s/W7a/W7b, via
P2). Closure evidence was previously scattered across commit messages,
WIP_STATUS sections, and test-file headers; this matrix indexes every window
to an exact, grep-able test name so a future regression is detected by a test
that provably fails on pre-fix code. SHA provenance convention (corrected in
P3 per review finding F-B): the "True red-state SHA" column cites the commit
the test was RED against (the phase's branch base), and "Closed by" cites the
MERGE SHA that landed the fix — per WIP_STATUS convention.

## How to verify a row

    grep -rnF "<exact test name>" <test file>

Confirm the "Verified at" SHA is an ancestor of (or equal to) current main.
If the test name no longer greps, or the row's file:line drifted, the row is
stale — fix the row in the same PR that moved the test.

## Matrix — W1 through W10

| W | Description | Closed by (merge) | True red-state SHA | Test file (file:line) | Exact test name (grep-able) | Kind | Status | Verified at |
|---|---|---|---|---|---|---|---|---|
| W1 | AbortError on play during fetch | a4be3e9 | 5168f37 | apps/student-web/e2e/player-video.e2e.mjs:665 | W1 — play during FETCH survives the swap (dead tap) | e2e | red-verified | 862d3ae |
| W2 | Resolve-then-reset | a4be3e9 | 5168f37 | apps/student-web/e2e/player-video.e2e.mjs:697 | W2 — resolved play survives the late swap (resolve-then-reset) | e2e | red-verified | 862d3ae |
| W3 | wasPlayingRef capture race | a4be3e9 | 5168f37 | apps/student-web/e2e/player-video.e2e.mjs:738 | W3 — pause during FETCH is respected (no ghost un-pause) | e2e | red-verified | 862d3ae |
| W4 | Overlapping refreshes | a2d66d5 | 9a05466 | apps/student-web/src/features/media-player/hooks/__tests__/useMediaLease.test.ts:184 | W4 — overlapping refreshes for the same asset coalesce into ONE swap | vitest | red-verified | 862d3ae |
| W5 | Stale response across asset change | a2d66d5 | 9a05466 | apps/student-web/src/features/media-player/hooks/__tests__/useMediaLease.test.ts:234 | W5 — a stale response from the previous asset is discarded after an in-place asset change | vitest | red-verified | 862d3ae |
| W6 | Dead retry path | a2d66d5 | 9a05466 | apps/student-web/src/features/media-player/hooks/__tests__/useMediaLease.test.ts:273 | W6 — the retry timer re-arms after a failed silent refresh | vitest | red-verified | 862d3ae |
| W7 | Ghost un-pause / seek revert (fetch) | a4be3e9 | 5168f37 | apps/student-web/e2e/player-video.e2e.mjs:763 | W7 — seek during FETCH survives the swap (no seek revert) | e2e | red-verified | 862d3ae |
| W8 | Stale isRefresh closure | a2d66d5 | 9a05466 | apps/student-web/src/features/media-player/hooks/__tests__/useMediaLease.test.ts:318 | W8 — an asset change classifies the new asset\'s first fetch as INITIAL, not refresh † | vitest | red-verified | 862d3ae |
| W9 | Swap lifecycle contract absent (no events, no ackSwap, no deadlines — dead API surface) | a4be3e9 | 5168f37 | apps/student-web/src/features/media-player/hooks/__tests__/useMediaLease.p1.test.ts:272 (+ 13-spec family :272-687) | W9 — module surface: lifecycle exports + contract constants | vitest | red-verified | 862d3ae |
| W10 | Stale capture refs | a2d66d5 | 9a05466 | apps/student-web/src/features/media-player/hooks/__tests__/useMediaLease.test.ts:351 | W10 — a failed refresh captures NOTHING; the next swap captures FRESH state (stronger than the P0 ref check) | vitest | red-verified | 862d3ae |

SHA provenance key (per P3 review F-B): P0 branch base / true red-state =
9a05466 (the F1-revert pivot; P0's W4/W5/W6/W8/W10 specs were red there);
P1's specs (W1/W2/W3/W7 e2e + W9 unit) were red against 5168f37 (P0 HEAD);
P2's specs were red against 3b41c11 (P1 HEAD). Merge SHAs: P0 = a2d66d5,
P1 = a4be3e9, P2 = bcf0b4e.

† W8: the it() literal escapes the apostrophe — the source bytes are
`asset\'s`. Grep -F for the escaped form exactly as shown in the row; the
runtime test name (vitest output) omits the backslash.

## Matrix — SWAPPING-phase (P2)

| W | Description | Closed by (merge) | True red-state SHA | Test file (file:line) | Exact test name (grep-able) | Kind | Status | Verified at |
|---|---|---|---|---|---|---|---|---|
| W1s | Play during SWAPPING | bcf0b4e | 3b41c11 | apps/student-web/e2e/player-video.e2e.mjs:814 | W1s — play during SWAPPING survives the swap (dead tap, queue form) | e2e | green-by-passthrough on 3b41c11; guaranteed by bcf0b4e | 862d3ae |
| W7a | Pause during SWAPPING (ghost un-pause) | bcf0b4e | 3b41c11 | apps/student-web/e2e/player-video.e2e.mjs:847 | W7a — pause during SWAPPING is respected (no ghost un-pause) | e2e | red-verified | 862d3ae |
| W7b | Seek during SWAPPING (revert) | bcf0b4e | 3b41c11 | apps/student-web/e2e/player-video.e2e.mjs:868 | W7b — seek during SWAPPING survives the swap (no seek revert) | e2e | red-verified | 862d3ae |

## Queue deterministic specs (P2 unit)

File: `apps/student-web/src/features/media-player/hooks/__tests__/useMediaLease.p2.test.ts`
(commit ced70db, red-state 3b41c11, closed by merge bcf0b4e). 14 specs, each
independently falsifiable. Red evidence: commit ced70db ("RED vs P1" — the
five intent methods are absent on the P1 hook, so every spec fails on a clean
typeof check, exactly like the P1 file's surface spec did against P0).

| # | Spec (file:line) | Exact test name |
|---|---|---|
| 1 | :257 | P2 surface — five stable-identity intent methods on the result |
| 2 | :274 | A8 — IDLE: play/pause/seek/togglePlay/seekBy apply immediately to the element |
| 3 | :309 | A8 — IDLE: null element is a silent no-op; play() rejection swallowed (P1 #12 semantics) |
| 4 | :334 | A2 — queue collapse: seek×2 → latest; play/pause → latest; one slot per concern |
| 5 | :361 | F1 guardian — togglePlay during SWAPPING classifies against previousState, not the torn-down element |
| 6 | :386 | F2 guardian — seekBy during SWAPPING computes from previousState.currentTime, not the reset element |
| 7 | :404 | F2 guardian — seekBy clamps to previousState duration; ended media seeks relative to 0 |
| 8 | :420 | F1 guardian — togglePlay on a PAUSED base enqueues play (W1 in its queue form) |
| 9 | :441 | A3 — refused seek + late RESTORING intent: the readiness retry consumes the LATEST queue |
| 10 | :508 | A4 — onSwapComplete fires AFTER the replay; element state matches intent in the callback |
| 11 | :531 | A6 — onSwapError terminal: best-effort apply (seek → playPause) + queue cleared; no onSwapError loop |
| 12 | :552 | A6 — ASSET_CHANGE mid-queue: DROP (never apply); the next asset never sees the stale intent |
| 13 | :582 | A6 — unmount mid-queue: DROP (never apply) |
| 14 | :601 | A7 — intents during the refresh FETCH apply immediately to the element (no queue) — capture-at-swap reads them |

Verified at: 862d3ae.

## Queue property specs (P3)

File: `apps/student-web/src/features/media-player/hooks/__tests__/useMediaLease.p3-queue-property.test.ts`
(added by P3; seeds 42-46, mulberry32 — any failure reproduces with the same
seed; the failure message carries seed + iteration + the generated action
sequence). Red applicability (worktree-verified during P3 against the exact
pre-fix hooks): on the P1 hook (3b41c11) the four intent-calling properties
are RED — they fail at their first intent call (`r.play` / `r.pause` is not
a function; the five intent methods are P2 additions). P3-P4 is GREEN there
BY DESIGN: its swapId contract was established by P1 (the W9 family) and
preserved by P2, so its true red-state is 5168f37 (P0), where it fails at
the initial-counter check (the P0 hook has no swapId surface). On 5168f37
all five properties are RED (P3-P1/P2/P3/P5 fail at the reachSwapping gate
— P0 emits no lifecycle events). Measured on the full-suite run
(12 files / 164 tests) at wip/11.7.x-p3:

| Property | Invariant | File:line | Iterations | Seed | Measured |
|---|---|---|---|---|---|
| P3-P1 | collapse + no-lost-intent (merged-plan oracle; element state at onSwapComplete = oracle over generated intents ⊕ capture) | useMediaLease.p3-queue-property.test.ts:459 | 1000 | 42 | 1143 ms |
| P3-P2 | late RESTORING intent upgrades readiness-retry plan (merged plan re-planned from the LATEST queue) | useMediaLease.p3-queue-property.test.ts:547 | 1000 | 43 | 763 ms |
| P3-P3 | terminal differentiation: complete = merged plan / error = RAW queue (:349-359) / asset-change = DROP / unmount = DROP | useMediaLease.p3-queue-property.test.ts:629 | 1000 | 44 | 1114 ms |
| P3-P4 | swapId surfaces: counter === k after k swaps; info.swapId null on initial; ctx.swapId === counter at emission; preserved across ASSET_CHANGE; fresh instance → 0 | useMediaLease.p3-queue-property.test.ts:738 | 1000 | 45 | 2037 ms |
| P3-P5 | pendingRefresh drain-after-terminal: exactly one drained POST; next swap captures FRESH state; consumed queue never ghosts | useMediaLease.p3-queue-property.test.ts:830 | 1000 | 46 | 712 ms |

Total: 5769 ms — under the 8s budget, so 1000 iterations stand (no 500 drop).
A10 (volume/playbackRate/mute during SWAPPING) is deliberately not generated —
P2 scope decision, recorded in the property file header.

## Unreachable-by-construction

swap-during-swap (a second swap beginning while the first is in flight) is
structurally unreachable: refresh() during SWAPPING coalesces into
pendingRefreshRef (depth 1, latest-wins) and ASSET_CHANGE terminal-clears the
in-flight swap. It is therefore NOT in the property set; P5 covers the drain
semantics that make it unreachable. If a future change makes it reachable, a
new matrix row is MANDATORY before any fix lands.

## How to add a new W

When a new window is found, add its row to the matrix BEFORE any fix lands:
specify the true red-state SHA (the commit the reproducing test fails
against), the test file:line, the exact grep-able test name, and (once
merged) the closed-by merge SHA. The test must be red-first: write it, watch
it fail on the pre-fix code, then fix. A row without red-first evidence is a
documentation claim, not a regression guard.

## Maintenance rules

- A W-test may NEVER be deleted once merged.
- A W-test may be refactored only if its red-first evidence is preserved
  (true red-state SHA + failure excerpt in the test file's git history).
- The "Verified at" column MUST be updated in any PR touching
  `apps/student-web/src/features/media-player/hooks/useMediaLease.ts` or
  `apps/student-web/src/features/media-player/VideoPlayer.tsx`.
- The exact-string names above are grep targets; renaming a test requires
  updating its row in the same commit.
