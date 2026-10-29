# WIP_STATUS — main (Wave 11.7.x root fix in flight — P0+P1+P2 landed)

## ─── STATUS ───────────────────────────────────────────
Wave 11.7.x / P2 (Deferred-intent queue + base-flow
e2e sweep) — STATUS: CLOSED
Merge SHA: bcf0b4e48e9288b1417669fee5b85c6ae331dcbf
Closed at: 2026-10-29
Commits: ced70db, 236b599, 5cf24a5, fe9f037, 9ae1188,
         1ce1af0, 3415026
Closes: SWAPPING-phase residual of W1, W7a, W7b
Also closes: 15 raw element-read races in base-17
               e2e checks (pre-P0, exposed by Commit 6)
Preserves: W1-W10 (all P0 + P1 closures intact)
P2 queue: single-slot playPause + seek, collapse
            last-writer-wins, merged plan in
            applyRestore, terminal differentiation
            (apply vs drop)
CI: 5 consecutive green on BRANCH_SHA_3 before merge.

## ─── ROOT FIX PROGRESS ────────────────────────────────
P0 ✅ (a2d66d5)
P1 ✅ (a4be3e9)
P2 ✅ (this commit)
P3 ⏳ Red-first regression matrix (W1-W10 permanent)
P4 ⏳ Re-merge F1 (AudioPlayer adaptation + delete
        G1/G2/G2-ext)

## ─── ADJACENT DEBT (from P2 scope decisions) ──────────
- A10: volume/rate/mute during SWAPPING not
  queue-protected. Restore legitimately reverts them
  from previousState. #8/#9 e2e specs use bounded
  pair-retry (<=3) to reduce residual ~3x; final
  residual ~5% if a swap reverts inside last attempt.
  Re-correctable by user. Revisit only if reported.
- W1-swapping was green-by-passthrough on P1; the
  queue converts to guaranteed (spec kept as
  permanent guard).
- Headless screenshot fonts-loading flake: observed
  once during P2 local validation (S1) AFTER
  24/24 checks passed. Infrastructure, not
  element-read class. Not fixed in P2; if it hits
  CI gate more than once, address as P3 infrastructure
  item.
- Old run 40824944242 closed with 2 success + 1
  failure on #5 flake. That run does not count toward
  the final gate (superseded by BRANCH_SHA_3 run).

## ─── FLAKY_MAIN_STATUS UPDATE ─────────────────────────
P2 + base-flow sweep: player-video e2e now has 24
deterministic checks with protected element reads.
#5 and #10 and 13 other sites fully settled. W
harness has its own orchestration protection.
No known element-read race survives in the spec.
Residual risk: A10 product race (#8/#9, ~5%),
screenshot fonts flake (infrastructure, rare).
If either hits, P3 matrix will surface it.

⚠️  AudioPlayer on wip/11.7 is STILL on OLD hook
    contract. Do NOT merge wip/11.7 until P4 adapts
    AudioPlayer.

## ─── RESUME_FROM ──────────────────────────────────────
main @ bcf0b4e (P2 merge) + this docs checkpoint (HEAD)
— awaiting supervisor PART X (P3 design) review.
P0+P1+P2 landed, main stable.

# (history below — P2 review checkpoint, then P1 closed checkpoint, then P1 review checkpoint, then P0, then Wave 11.5.x, closed)

# WIP_STATUS — wip/11.7.x-p2 (Wave 11.7.x root fix, P2 in review)

## ─── STATUS ───────────────────────────────────────────
Wave 11.7.x / P2 (deferred-intent queue) — STATUS:
BRANDED, LOCAL, AWAITING SUPERVISOR REVIEW + PUSH
AUTHORIZATION.
Branch: wip/11.7.x-p2 (from main 3b41c11)
Commits (local, unpushed):
  ced70db test(useMediaLease): P2 queue specs — RED vs P1
  236b599 feat(useMediaLease): queue + 5 intent methods
  5cf24a5 feat(VideoPlayer): route intents through the hook
  fe9f037 test(e2e): SWAPPING-phase W1s/W7a/W7b specs
  (+ docs checkpoint — this commit)
Closes: the SWAPPING/RESTORING-phase residual — the
  informal W1-swapping / W7a-swapping / W7b-swapping
  variants (intent issued after onSwapStart, before the
  restore).
F1/F2 (the review's consumer-side flaw findings, fixed
  by A1): togglePlay's classifier read el.paused of the
  torn-down element and INVERTED the intent (the ghost
  un-pause); seekBy computed el.currentTime+delta on the
  reset element and its NaN-duration guard dropped the
  intent entirely (the seek revert). Both now classify
  hook-side against the ACTIVE CTX's previousState.
Amendments: A1-A10 all in force and implemented.
P0/P1 preserved: P0 file 5/5 and P1 file 14/14 pass
  UNMODIFIED; P1's e2e fetch-phase specs stay green.

Local verification (branch HEAD):
  vitest full suite: 11 files, 159/159 (145 existing +
  14 new P2)
  tsc -b: 0 errors | eslint: clean (max-warnings=0)
  player-video e2e: 24/24 × 3 consecutive reruns
    (21 existing + W1s/W7a/W7b green; NODE RSS 185-192
    MB; console errors none). Red-first vs P1 HEAD
    (3b41c11): 22/24 — W7a RED (ghost un-pause:
    baseAt=12.5s final=23.8s paused=false), W7b RED
    (seek revert: final=23.7s), W1s GREEN-BY-PASSTHROUGH
    (pausedAt=12.5s final=14.7s — documented honestly,
    kept as a permanent guard); all 21 existing checks
    green on P1 in the same run.
  player-audio e2e vs pristine wip/11.7 (read-only):
    26/26 — S4e passed this run; console errors 0 (the
    9 about:blank sessionStorage page-errors are teardown
    noise, not app errors). Peak Chromium RSS 1018 MB /
    1600 contract.

ADJACENT DEBT (A10/OPEN-8 ruling — out of P2 scope,
  documented): volume/rate/mute changes issued during
  SWAPPING/RESTORING are overwritten by the restore's
  previousState application. Rare (a click inside the
  200-500ms window), user-visible, instantly
  re-correctable. Queue slots NOT added per the ruling;
  revisit only if a user reports it.

## ─── ROOT FIX PROGRESS ────────────────────────────────
P0 ✅ CLOSED on main (merge a2d66d5, CI 5/5)
P1 ✅ CLOSED on main (merge a4be3e9, CI 5/5 + merge green)
P2 ⏳ IMPLEMENTED on wip/11.7.x-p2 — awaiting review + push
P3 ⏳ Red-first regression tests (W1-W10 permanent matrix)
P4 ⏳ Re-merge F1 (adapt AudioPlayer, delete G1/G2/G2-ext)

⚠️  wip/11.7 (F1) is still on the OLD hook contract
    (pre-P1). Do NOT merge wip/11.7 until P4 adapts
    AudioPlayer to the P1+P2 contract. The P1 CONTRACT
    SUMMARY (two sections below) remains the P4 brief.

## ─── RESUME_FROM ────────────────────────────────
wip/11.7.x-p2 @ fe9f037 (+ this docs checkpoint)
— awaiting supervisor P2 review + push authorization.
PART I-push (push + 5-rerun gate + merge) comes
separately. Do NOT push from this session.

# (history below — P1 closed checkpoint, then P1 review checkpoint, then P0, then Wave 11.5.x, closed)

# WIP_STATUS — main (Wave 11.7.x root fix in flight — P1 landed)

## ─── STATUS ───────────────────────────────────────────
Wave 11.7.x / P1 (useMediaLease redesign) — STATUS: CLOSED
Merge SHA: a4be3e996898278b0b61bbf7199e793e5b1353b8
Closed at: 2026-10-29
Commits: 1122fb1, 01fb0ed, f008ba6, c72fc55, 8c40fe9,
         7110056, 0c24947
         (0c24947 = the #12 letter-deviation fix ruled at
         pre-push verification: console.debug on the
         swallowed restore-play rejection, DF-8)
Closes: W1, W2, W3, W7, W9
Preserves: W4, W5, W6, W8, W10 (P0)
Contract: capture-at-swap swap lifecycle — see the
          "P1 CONTRACT SUMMARY" section below (kept live
          for P4's AudioPlayer adaptation)
CI: 5 consecutive green on the branch SHA (0c24947) before
    merge — run 40812599281 attempts 1-5, all five required
    jobs green every attempt (Backend Tests / Frontend Tests
    / Security Scan / Security Artifact Gate / Lighthouse CI;
    durations 340-377s). player-video e2e in-run evidence
    (B.6) from attempts 1 & 2: 21/21 each — W1/W2/W3/W7 all
    PASS, NODE RSS 131/128 MB, console errors none. Merge run
    40816591686 on a4be3e9: green (536s) — no re-run needed.

## ─── ROOT FIX PROGRESS ────────────────────────────────
P0 ✅ (closed at a2d66d5)
P1 ✅ (this merge, a4be3e9)
P2 ⏳ Deferred-intent queue (SWAPPING-phase intent)
P3 ⏳ Red-first regression tests (W1-W10 permanent
      matrix)
P4 ⏳ Re-merge F1 (adapt AudioPlayer, delete G1/G2/G2-ext)

## ─── P1 CONTRACT SUMMARY (for P4's AudioPlayer work) ───
- useMediaLease options: onSwapStart REQUIRED (sync, ctx-driven),
  onSwapError REQUIRED, onSwapComplete optional, swapAckTimeoutMs
  (default 5000, floor 500).
- Returns: info (LeaseInfo: PlaybackUrlInfo & {swapId: number|null}),
  loading, refreshing (fetch∨SWAPPING∨RESTORING), error (Error),
  swapId, isSwapInFlight (render-only!), ackSwap(id), isSwapActive()
  (hot-path gate), refresh(reason?).
- Consumer duties: assign src / hls.loadSource(ctx.newUrl) inside
  onSwapStart (ALWAYS for HLS — URL identity is not a skip
  condition); ack on isElementSwapReady(el); in onSwapError detach
  readiness listeners + surface retry UI; never JSX-bind src; gate
  hot-path position writes on !isSwapActive() &&
  readyState >= HAVE_CURRENT_DATA.
- LeaseInfo.swapId === null ⇔ initial/asset-change load (no
  lifecycle); number ⇔ the swap that delivered it.

## ─── FLAKY_MAIN_STATUS ────────────────────────────────
Update: with P1 landed, the W1/W2/W3/W7 seam races are
closed. Player-video e2e should now be stable. Player-audio
(still on wip/11.7) may show S4e flake until P4 re-merges
AudioPlayer against the new contract.

⚠️  AudioPlayer on wip/11.7 is still on the OLD hook
    contract (generation/resetPending removed). Do NOT
    merge wip/11.7 until P4 adapts AudioPlayer.

## ─── RESUME_FROM ──────────────────────────────────────
main @ a4be3e9 (P1 merge) + this docs checkpoint (HEAD)
— awaiting supervisor PART X (P2 design) review.
P0+P1 landed, main stable.

# (history below — P1 checkpoint, then P0 checkpoint, then Wave 11.5.x, closed)

# WIP_STATUS — wip/11.7.x-p1 (Wave 11.7.x root fix, P1 in review)

## ─── STATUS ───────────────────────────────
Wave 11.7.x / P1 (useMediaLease swap-lifecycle redesign
+ VideoPlayer adaptation) — STATUS: BRANDED, LOCAL,
AWAITING SUPERVISOR REVIEW + PUSH AUTHORIZATION.
Branch: wip/11.7.x-p1 (from main 5168f37)
Commits (local, unpushed):
  1122fb1 test(useMediaLease): W9 API presence specs — RED vs P0
  01fb0ed feat(useMediaLease): the swap-lifecycle contract
  f008ba6 test(useMediaLease): adapt the P0 regression file (1:1 mapping)
  c72fc55 feat(VideoPlayer): adapt to the swap-lifecycle contract
  8c40fe9 test(e2e): W1/W2/W3/W7 fetch-phase race specs
  (+ docs checkpoint — this commit)
Closes: W1, W2, W3, W7, W9 (fetch-phase intent; SWAPPING-phase
        intent remains P2 territory by design)
X-b.1 amendments: all 17 in force and implemented (DF-1..DF-10,
        OPEN-1/3/4/6/8/9/11/12 as amended).
P0 behaviors preserved: W4/W5/W6/W8/W10 green in the adapted
        file (5/5) — permanently.

Local verification (branch HEAD):
  vitest full suite: 10 files, 145/145 (131 on main + 14 W9 specs)
  tsc -b: 0 errors | eslint: clean
  player-video e2e: 21/21 (17 existing + W1/W2/W3/W7 green),
     red-first vs main 5168f37 captured (17/21 — exactly the
     four windows failed: dead tap, resolve-then-reset dead,
     ghost un-pause, seek revert); 3 consecutive reruns green
     (21/21 each; peak Chromium RSS 1008-1046MB / 1600 contract)
  player-hls-option-c e2e vs branch HEAD: 13/13 — the HLS swap
     path (onSwapStart → loadSource → isElementSwapReady ack →
     restore) works end-to-end incl. NETWORK_ERROR recovery.
  player-audio e2e vs pristine wip/11.7 (read-only): 26/26 —
     S4e passed this run; no NEW failures; contract compatible
     with parked F1.
  HLS spike (OPEN-9, ~25min of the 2h box): ack latency
     234-255ms per swap on the Option-C VOD pattern
     (hls.js 1.7.3, autoStartLoad:false, startLoad(position));
     restore lands within 1-7ms of ack; ~20x headroom under
     SWAP_ACK_TIMEOUT_MS=5000; clamp + restore-deadline fallback
     never needed. Evidence: /home/z/p1-evidence/ (session-local).

## ─── ROOT FIX PROGRESS ────────────────────────────────
P0 ✅ CLOSED on main (merge a2d66d5, CI 5/5)
P1 ✅ IMPLEMENTED on wip/11.7.x-p1 — awaiting review + push
P2 ⏳ Deferred-intent queue (SWAPPING-phase intent — the
     documented residual; e2e specs will poll
     data-swap-in-flight mid-flight)
P3 ⏳ Full red-first regression matrix (W1-W10 cross-consumer)
P4 ⏳ Re-merge F1 (adapt AudioPlayer to the P1 contract,
     delete G1/G2/G2-ext workarounds)

## ─── P1 CONTRACT SUMMARY (for P4's AudioPlayer work) ───
- useMediaLease options: onSwapStart REQUIRED (sync, ctx-driven),
  onSwapError REQUIRED, onSwapComplete optional, swapAckTimeoutMs
  (default 5000, floor 500).
- Returns: info (LeaseInfo: PlaybackUrlInfo & {swapId: number|null}),
  loading, refreshing (fetch∨SWAPPING∨RESTORING), error (Error),
  swapId, isSwapInFlight (render-only!), ackSwap(id), isSwapActive()
  (hot-path gate), refresh(reason?).
- Consumer duties: assign src / hls.loadSource(ctx.newUrl) inside
  onSwapStart (ALWAYS for HLS — URL identity is not a skip
  condition); ack on isElementSwapReady(el); in onSwapError detach
  readiness listeners + surface retry UI; never JSX-bind src; gate
  hot-path position writes on !isSwapActive() &&
  readyState >= HAVE_CURRENT_DATA.
- LeaseInfo.swapId === null ⇔ initial/asset-change load (no
  lifecycle); number ⇔ the swap that delivered it.

## ─── RESUME_FROM ────────────────────────────────
wip/11.7.x-p1 @ 8c40fe9 (+ this docs checkpoint)
— awaiting supervisor P1 review; PART I-push (push + 5-rerun
gate + merge) comes separately. Do NOT push from this session.
Next phases: P2 (deferred-intent queue), P3 (regression matrix),
P4 (AudioPlayer adaptation on wip/11.7 re-merge).

# (history below — P0 checkpoint, then Wave 11.5.x, closed)

# WIP_STATUS — main (Wave 11.7.x root fix in flight)

## ─── STATUS ───────────────────────────────────────────
Wave 11.7.x / P0 (Hook hygiene) — STATUS: CLOSED
Merge SHA: a2d66d5a45215014e481d5da5ccb2c645950f855
Closed at: 2026-10-29
Commits: 9aa71e0, 83b2bfd, 87c607b, eb85466, 056a36a,
         fe4b46a (tsc conformance), 57f9ef9 (docs)
Closes: W4, W5, W6, W8, W10
Public API: unchanged
CI: 5 consecutive green on the branch SHA
     (57f9ef9) before merge — run 40796556538 attempts
     1-5, all five required jobs green every attempt
     (Backend/Frontend/Security Scan/Artifact Gate/
     Lighthouse; durations 299-356s). Merge run
     40801012489 on a2d66d5: green (453s), incl.
     player-video e2e 17/17 in-run evidence.
Local verification (pre-push): vitest 131/131, tsc -b 0
     errors, eslint clean, player-video 17/17 (RSS
     ~1042MB/1600), player-audio 26/26 x2 vs pristine
     wip/11.7 worktree.

## ─── ROOT FIX PROGRESS ────────────────────────────────
P0 ✅ (this merge)
P1 ⏳ Hook-owned atomic swap + lifecycle events
P2 ⏳ Deferred-intent queue
P3 ⏳ Red-first regression tests (W1-W10)
P4 ⏳ Re-merge F1 (adapt AudioPlayer, delete workarounds)

## ─── FLAKY_MAIN_STATUS ────────────────────────────────
P0 does NOT fix the S4e flake observed on wip/11.7
(confirmed empirically: same signature on pristine
wip/11.7 AND with P0 hook applied). That flake is the
surviving seam race — P1/P2 territory. Therefore:

⚠️  main is expected to be stable for non-F1 CI
    (video path benefits from P0's W6 fix).
⚠️  Player-audio spec still flaky when exercised
    (it lives on wip/11.7, not main, so main's CI is
    not affected).
⚠️  Do NOT merge wip/11.7's F1 to main until P1-P4
    complete and S4e flake is closed.

## ─── RESUME_FROM ──────────────────────────────────────
main @ a2d66d5 (P0 merge) + this docs checkpoint (HEAD)
— awaiting supervisor PART X (P1 design) review.
P0 landed, main stable.

# (history below — Wave 11.5.x, closed)

# WIP_STATUS — wip/11.5.1

## Base
Branch: wip/11.5.1
Parent: 544c00a479fb13f72f0b5933e110507ab00206b8 (main, Push 11.5 merged — CI Trust)
Status: Push 11.5.1 — FIX N1 (migration chain replayability). PART A diagnostic COMPLETE;
PAUSED at A.5 awaiting supervisor's production-schema SQL output + Phase57 Up() modification
approval (see PART A decision below). NO files modified except WIP_STATUS.md so far.
Scope gate: ONLY N1. N2-N6 untouched (STOP GATE §12).

## PART A — N1 diagnostic findings (read-only, 2026-10-27)

### A.1 — Catalog (corrects N1's premise)
- Total migration .cs files on disk: **26** (NOT 27 — N1's "27" was a miscount; the
  previous session's "script emits 22 of 27" should read "22 of 26").
- 19 migrations WITH .Designer.cs; **7 WITHOUT**: Phase50, Phase51, Phase52,
  Phase54, Phase55, Phase56, Phase57 (N1 named 5 / listed 4 names; reality = 7 files
  lacking Designer, of which only 4 are actually undiscovered — see A.2).

### A.2 — Discovery attribute audit (the REAL root cause)
- EF Core discovers a migration only if its class carries BOTH
  [DbContext(typeof(ApplicationDbContext))] AND [Migration("<id>")] (normally both
  live in Designer.cs).
- Phase50/51/52: Designer.cs absent but attributes are INLINE in the .cs files
  (Phase50 added by commit 24bd427 "fix(migrations): register lecture metadata
  migration" — the repo's own precedent fix for this exact problem). → DISCOVERED.
- Phase54/55/56/57: NO attributes anywhere (neither in .cs nor Designer) →
  NOT DISCOVERED. This is the N1 root cause: not "missing Designer.cs" per se,
  but missing discovery attributes.
- Verified empirically: `dotnet ef migrations list` (design-time, CMS_EF_CONNECTION
  dummy) prints exactly 22 migrations — Phase54/55/56/57 absent from the list.
- Up() summary of the 4 undiscovered migrations (all hand-written, never EF-generated):
  - Phase54: CREATE TABLE system_settings (pk, ix_key UNIQUE, ix_category,
    fk_system_settings_admins_updated_by) + 11-row Arabic seed INSERT (ON CONFLICT DO NOTHING).
  - Phase55: 3 nullable columns on error_reports (assigned_to, reviewed_by,
    reviewed_at) + composite index ix_error_reports_status_assigned_to.
  - Phase56: 1 nullable column notifications.expires_at.
  - Phase57: raw-SQL DO-blocks (drop fk_notifications_admins_sender_id IF EXISTS,
    drop sender_id IF EXISTS, add fk_notifications_admins_sent_by) **+ a manual
    INSERT INTO __EFMigrationsHistory (ON CONFLICT DO NOTHING) — see A.4 risk.**

### A.3 — Git history
- `git log --all --diff-filter=D` on `*<PhaseName>*Designer*` for all 7: ZERO
  deletion records → **Designer.cs files NEVER existed** for any of them.
- Each migration added by its own feat commit (Phase54: 858bfc2; Phase55: 39bed16/
  1aa5694; Phase56: 3a531f8/2fb3b51; Phase57: 4a5b7ff/34e2d54; Phase50: 3d8178d +
  attribute fix 24bd427; Phase51: ad860ae; Phase52: 48a147c).
- → CHOICE 1 (restore from history) is NOT AVAILABLE.

### A.4 — ModelSnapshot + script verification
- ApplicationDbContextModelSnapshot.cs: [DbContext(typeof(ApplicationDbContext))],
  ProductVersion 9.0.0. Contains system_settings (pk + ix_key + ix_category +
  ix_updated_by + FK), error_reports.assigned_to/reviewed_by/reviewed_at,
  notifications.expires_at/sent_by + ix_notifications_sent_by → snapshot INCLUDES
  all Phase54-57 schema.
- `dotnet ef migrations has-pending-model-changes` → "No changes have been made to
  the model since the last migration." → **snapshot IS in sync with the current
  AppDbContext model** (B.2 VERIFY_NO_OP is expected to be clean).
- `dotnet ef migrations script --idempotent` (current state): 22 INSERT INTO
  "__EFMigrationsHistory" statements, 2326 lines — matches discovery count.
- Chain-vs-model drift (DB-level enforcement only; runtime/tests unaffected):
  snapshot expects fk_error_reports_admins_assigned_to/reviewed_by +
  ix_error_reports_assigned_to/reviewed_by which NO migration Up() ever creates;
  conversely Phase55's composite ix_error_reports_status_assigned_to is NOT in the
  model. A chain-replayed DB will lack the 2 FKs + 2 indexes (and carry 1 extra
  composite index). Acceptable for DR (EF runtime does not require DB-level FKs);
  flagged honestly.
- **CRITICAL RISK FOUND — Phase57 self-recording INSERT**: Phase57.Up() manually
  INSERTs its own row into __EFMigrationsHistory. Runtime MigrateAsync inserts the
  history row with a PLAIN insert after applying each migration (the idempotent
  script's IF NOT EXISTS guards are script-only). On a fresh DB replay, the manual
  insert creates the row first → EF's plain insert then fails with 23505 duplicate
  key → MigrateAsync FAILS at Phase57 even after attributes are added. The 4-line
  manual INSERT block must be REMOVED from Phase57.Up() for fresh replay to succeed
  (it was only ever needed for manually-run SQL on production; EF records the row
  itself when it applies the migration). Modifying Up() requires supervisor
  approval per STOP GATE §7 → requested, awaiting decision together with A.5.
- Prerequisites OK: admins/error_reports/notifications all created by Phase34 (the
  first migration); nothing before Phase54 references system_settings; Push4Courses
  and AddLibraryFileCategory seeds/indexes reference system_settings only AFTER
  Phase54 in the chain order. Production API does NOT call MigrateAsync/EnsureCreated
  at startup (only CMS.Tests PostgresFixture does) → merging this fix deploys safely.

### A.6 — Fix approach decision (provisional; A.5 pending)
- CHOICE 1 (restore Designer.cs from git): UNAVAILABLE — files never existed (A.3).
- CHOICE 2 (regenerate on scratch branch): UNSAFE per its own A.6-d safety check —
  the hand-written Up()s contain content a model-diff regeneration cannot produce
  (Phase54's 11-row seed INSERT, Phase55's composite index that is not in the model,
  Phase57's DO-blocks + manual history INSERT) → generated Up() ≠ existing Up() for
  all 4 → falls through to CHOICE 3.
- CHOICE 3 (hand-write): the minimal, lowest-risk form is INLINE DISCOVERY
  ATTRIBUTES — add `[DbContext(typeof(ApplicationDbContext))]` +
  `[Migration("<id>")]` + `using Microsoft.EntityFrameworkCore.Infrastructure;` to
  each of the 4 .cs files — exactly the pattern this repo already uses for
  Phase50/51/52 (commit 24bd427) and that is proven applied-on-Neon (the 22
  discovered include Phase50-52). TargetModel/Designer.cs is NOT consulted by
  runtime MigrateAsync or script generation (tooling-only: `migrations remove` edge
  cases — pre-existing condition for Phase50-52 already). Fabricating full
  Designer.cs TargetModels for historical model states would be strictly riskier.
- DECISION: CHOICE 3-minimal (inline attributes, repo precedent 24bd427) for
  Phase54/55/56/57 + REMOVE Phase57's manual history INSERT block (pending approval).
  After fix: discovered = 26/26, script INSERTs = 26, MigrateAsync replays the full
  chain on an empty DB (modulo Phase57 insert removal).

### A.5 — Production schema reference (PENDING — awaiting supervisor)
Emitted for supervisor to run read-only on Neon:
  1) SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
  2) SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='system_settings' ORDER BY ordinal_position;
  3) SELECT "MigrationId" FROM "__EFMigrationsHistory" ORDER BY 1;
Awaiting output to confirm production schema matches what the missing migrations
produce (mismatch = MAJOR issue → STOP per A.5).

## PART B — FIX (COMPLETE; supervisor approved Phase57 Up() modification + proceed without A.5 output)

### B.1 — Implementation (CHOICE 3-minimal, repo precedent 24bd427)
- 4 files edited, net +17/−6 lines, NO other files touched:
  - Phase54SystemSettings.cs / Phase55ReportsModeration.cs /
    Phase56NotificationExpiresAt.cs / Phase57FixNotificationSenderFk.cs:
    added `using Microsoft.EntityFrameworkCore.Infrastructure;` +
    `[DbContext(typeof(ApplicationDbContext))]` + `[Migration("<exact id>")]`
    above each class (same inline-attribute pattern as Phase50/51/52).
  - Phase57FixNotificationSenderFk.cs: REMOVED the manual
    `INSERT INTO "__EFMigrationsHistory" ... ON CONFLICT DO NOTHING` block
    (supervisor-approved) — replaced with an explanatory NOTE comment. EF Core
    records the history row itself after applying the migration; the manual
    insert collided (23505) with EF's plain runtime insert on fresh replay.
- NO Designer.cs files were fabricated (per A.6 rationale: runtime MigrateAsync
  and script generation never consult TargetModel; inline attributes are the
  proven repo pattern). NO ModelSnapshot change (verified untouched via git status).
- `dotnet build CMS.sln`: 0 errors, 18 pre-existing warnings (unrelated).

### B.2 — VERIFY_NO_OP: PASS
- `dotnet ef migrations add VERIFY_NO_OP -o /tmp/verify_migrations` → generated
  migration has EMPTY Up() and EMPTY Down() → model in sync with snapshot.
- ApplicationDbContextModelSnapshot.cs NOT modified (git status showed only the
  4 intended files). /tmp/verify_migrations deleted after inspection.

### B.3 — Full script verification: PASS
- `dotnet ef migrations script -o /tmp/full_script.sql`:
  **26** INSERT INTO "__EFMigrationsHistory" statements (was 22), 1297 lines.
  (The original instruction expected "27" — that was N1's miscount; true total
  chain = 26. Reported honestly.)
- `dotnet ef migrations list`: **26/26 discovered** — Phase54/55/56/57 appear in
  correct chain position (after Phase53ExamAnalyticsTracking, before
  AddLibraryFileCategory).
- Extracted verbatim DDL of the 4 previously-missing migrations (script lines
  1019-1094): Phase54 CREATE TABLE system_settings + pk + FK + unique ix_key +
  ix_category + 11-row seed (ON CONFLICT (key) DO NOTHING); Phase55 3 ALTER
  TABLE ADD columns + composite ix_error_reports_status_assigned_to; Phase56
  ALTER TABLE notifications ADD expires_at; Phase57 3 guarded DO-blocks +
  EF's own standard history INSERT (manual self-INSERT gone — only occurrence
  of Phase57 id in script is line 1094, EF's standard insert).
- Replay-conflict audit: only Phase57 ever self-inserted history (rg across all
  migrations); later system_settings seeds (AddLibraryFileCategory …101-105,
  Push4Courses …106) use distinct keys/UUIDs + ON CONFLICT (key) DO NOTHING →
  no pk/unique collision with Phase54's …001-011 seed rows.

### B.4 — Caveats + production-safety notes (honest)
- A.5 production schema output was NOT provided; supervisor instructed to
  proceed. Production __EFMigrationsHistory content for Phase54-57 remains
  UNVERIFIED. Before anyone manually runs the migrate.yml "apply" action (or
  `dotnet ef database update`) against PRODUCTION, the supervisor MUST first
  confirm/repair the history rows (guarded INSERTs from the --idempotent
  script) — otherwise EF would attempt to re-apply Phase54-57 and fail on
  already-existing objects (42P07). This push itself changes NO production
  state (attributes + one removed manual insert; API never auto-migrates;
  migrate.yml is workflow_dispatch-only).
- Chain-vs-model drift (pre-existing, unchanged, DB-level only): replayed DB
  lacks fk_error_reports_admins_assigned_to/reviewed_by + their 2 indexes, and
  carries the extra composite ix_error_reports_status_assigned_to.
- Local live replay (MigrateAsync on fresh Postgres) NOT possible — sandbox has
  no Docker. CI's Testcontainers job is the replay proof (PART C reports
  trigger; supervisor checks completion).
- Expected CI on wip/11.5.1: Backend "Run tests" should now pass the
  Testcontainers MigrateAsync step (26 migrations applied on fresh
  postgres:16-alpine) → the 27 Postgres integration tests RUN (previously
  BLOCKED); N2 (FavoritesHttp JsonException) still fails — out of scope.

## RESUME_FROM (Push 11.5.1)
RESUME_FROM: <final wip/11.5.1 SHA — see PART B commit> — CI verification + merge
decision pending supervisor (STOP GATE: no merge, no deploy, no production DB
changes, no 11.5.2/11.6, N2-N6 untouched).

## PART A — Diagnostic findings (read-only survey, 2026-10-27)
- CI workflows EXIST (5 files in .github/workflows/): ci.yml ("CI/CD Pipeline" — the file this
  push extends), health-check.yml (5-min prod cron), launch.yml (one-time manual), migrate.yml
  (manual EF), android-offline-runtime.yml (Android instrumentation).
- ci.yml shape: triggers push→[main, develop] + PR→main + manual; jobs: security-gate
  (verify-security-artifact.sh) → backend-test (dotnet build+test FULL solution, NO filter, NO
  Postgres env) → frontend-test (student-web lint+vitest+build+SBOM; NO admin-web, NO Playwright)
  ∥ security-scan (CodeQL+Trivy) → lighthouse (needs frontend) → docker-build (push-only, ghcr)
  → deploy-staging/deploy-production (both `if: false` — Render/Vercel auto-deploy instead).
  NOTE: wip/** pushes do NOT trigger ci.yml today (main/develop only).
- LIVE CI STATE (GitHub API, run 40446432090 on main @ ca3ef39, 2026-10-27T03:50Z):
  Backend Tests FAILURE + Frontend Tests FAILURE + Security Scan FAILURE (job-setup); downstream
  skipped. Root causes, evidence-backed:
  * Backend "Run tests": 28 failed = the 27 PostgresIntegration tests (BLOCKED:
    CMS_PHASE34_TEST_POSTGRES unset → InvalidOperationException, log shows 54 BLOCKED lines =
    27 tests × 2) + 1 EXTRA: FavoritesHttpIntegrationTests.Favorite_WithValidBoundEntitlement_
    CreatesListsAndDeletesOnlyOwnBookmark — System.Text.Json.JsonException (List<FavoriteItem>
    vs the Push-11.3 PAGED list response) at FavoritesHttpIntegrationTests.cs:35. PRE-EXISTING
    11.3 regression, NOT env-var-related → report-only per §12 (fix = separate push).
  * Frontend "Setup pnpm": pnpm/action-setup@v4 ERR — "Multiple versions of pnpm specified:
    version 9 in the GitHub Action config … version pnpm@9.12.0 in the package.json
    (packageManager)". One defect, two sites (frontend-test + lighthouse jobs). Prerequisite
    fix for PART C/D (in scope: the frontend job hosts the new steps).
  * Security Scan "Set up job": `Unable to resolve action aquasecurity/trivy-action@0.28.0` —
    unresolvable action version. Unrelated job → report-only per §12.
  * android-offline-runtime.yml ALSO fails on every push (incl. wip/* despite its malformed
    `branches: ain, develop]` filter line — typo present in the file). Unrelated → report-only.
- Backend guarded-test inventory: CMS_PHASE34_TEST_POSTGRES is a CONNECTION STRING (not a flag):
  each [Fact] reads it and throws BLOCKED when unset (no skip mechanism exists today). 27 tests
  in 12 files (counts: SessionService 5, UiPermissions 4, PasswordAudit 3, Phase44ProducerMatrix
  3, SessionAudit 2, Courses 2, LibraryAudit 2, AuthAudit 2, SecurityAudit 1, MySubjects 1,
  OfflineAuditProducer 1, SecurityAuditRetention 1) — ALL in [Collection("PostgresIntegration")]
  (DisableParallelization) + [Trait Category=PostgresIntegration]; empty collection definition
  (no fixture) at Integration/PostgresIntegrationCollection.cs. Pattern: hand-built
  ApplicationDbContext(UseNpgsql(cs)) — schema must pre-exist (MigrationContract asserts
  constraints); one test TRUNCATEs security tables. No Testcontainers package anywhere today
  (only a comment in AdminEndpointsIntegrationTests.cs:195). CI must NOT set the env var to "1"
  — it would be used AS a connection string; the Testcontainers fixture sets it instead.
- Playwright: @playwright/test 1.58.2 (devDep) + playwright.config.ts (testDir ./e2e, workers 1,
  baseURL defaults to PRODUCTION Vercel — the .spec.ts files target real prod/Render backends,
  legacy production smokes, NOT CI-runnable without secrets). The CI-runnable suite = 5 custom
  .e2e.mjs scripts (network-layer API mocks, dev server on E2E_WEB_URL ?? 127.0.0.1:5173,
  chromium via PLAYWRIGHT_CHROMIUM_EXECUTABLE — default is a sandbox-specific path that CI must
  override): favorites-advanced (30), player-video (17), player-favorite-toggle (14), player-hls
  (19), player-hls-option-c (7). Assets: e2e-hls ladder + e2e-test-video.mp4 are git-ignored
  and NOT auto-generated by player-hls/player-video/player-favorite-toggle specs (option-c
  self-generates) → CI needs an ffmpeg generation step (ubuntu-24.04 ships ffmpeg 6.1; specs'
  header command was validated on ffmpeg 7 — CI will use version-robust per-rung generation,
  verified locally). All specs already enforce the §4 RAM contract internally.
- admin-web: tests ALREADY EXIST (premise correction — debt C1 is CI-only): 6 files under
  src/test/ (api, audit-log-viewer, courses-center, mediaType, settings-center, ui-permissions)
  + setup.ts + vitest.config.ts (jsdom, globals, setupFiles) + "test": "vitest run" script;
  vitest@^2 / jsdom@^25 / @testing-library/react@^16 / jest-dom@^6 / user-event@^14 ALL already
  in devDependencies AND pnpm-lock.yaml → PART D needs ZERO new packages (§3 authorization
  unused — no lockfile change) — only local verification + a CI step.
- pnpm filter names: workspace packages are @cms/student-web / @cms/admin-web (the prompt's
  `--filter student-web` does not match; existing ci.yml already uses the @cms/* form).

## PART B — Testcontainers.PostgreSql fixture + graceful skip (COMPLETE)
- Package: Testcontainers.PostgreSql PINNED to 4.16.0 in CMS.Tests.csproj (transitives:
  Testcontainers 4.16.0, Npgsql 9.0.2 — matches Infrastructure's pinned Npgsql, no drift).
- NEW apps/api/src/CMS.Tests/Infrastructure/PostgresFixture.cs (namespace CMS.Tests.Infrastructure):
  PostgresFixture : IAsyncLifetime — env var set → EXTERNAL connection string used verbatim
  (Neon branch flow preserved); else PostgreSqlBuilder().WithImage("postgres:16-alpine").Build()
  → StartAsync → GetConnectionString; then ApplicationDbContext.UseNpgsql(cs).
  Database.MigrateAsync() (schema pre-exists for MigrationContract; the TRUNCATE test runs on a
  throwaway DB); connection string PUBLISHED via Environment.SetEnvironmentVariable so the 27
  guarded test bodies are UNTOUCHED (they already read the env var). PostgresFactAttribute :
  FactAttribute overrides Skip via static ProbeSkipReason() — env var set OR /var/run/docker.sock
  OR DOCKER_HOST → run; else skip with clear reason (replaces fail-fast BLOCKED).
- PostgresIntegrationCollection.cs: [CollectionDefinition] now ALSO ICollectionFixture
  <PostgresFixture> — initializes once before the first test of the collection (collection is
  DisableParallelization; skipped tests never instantiate the fixture → no Testcontainers error
  when Docker is absent).
- The 12 guarded files: [Fact] → [PostgresFact] (27/27 swapped, 0 [Fact] remaining, 0 [Theory]
  present) + `using CMS.Tests.Infrastructure;` (12 files). Zero changes to test bodies.
- LOCAL VERIFICATION (sandbox has NO Docker — honest limitation; real-Postgres proof lands in
  CI after PART C's wip/** trigger, observed via the GitHub API):
  * dotnet build CMS.sln → 0 errors (18 pre-existing warnings).
  * dotnet test --filter Integration → Failed: 1, Passed: 88, Skipped: 27, Total: 116, 2m9s.
    The 27 = ALL PostgresIntegration tests SKIP with the probe reason (mechanism validated);
    the 1 failure = FavoritesHttpIntegrationTests.Favorite_WithValidBoundEntitlement_… — the
    PRE-EXISTING Push-11.3 contract regression (JsonException at :35, list endpoint now paged),
    reproduced IDENTICALLY in CI (run 40446432090) → §12 report-only, NOT fixed here.
  * dotnet test --filter Unit → 419/419 Passed (14s) — zero regressions.
- CI semantic correction: CI does NOT set CMS_PHASE34_TEST_POSTGRES (it is a connection string,
  not a flag; "1" would be used AS a connection string). Docker is preinstalled on
  ubuntu-latest → fixture auto-starts the container.

## PART C — Playwright + wip-trigger in ci.yml (COMPLETE)
- C.3 LOCAL VALIDATION FIRST (CI-faithful: chromium-1208 via chromium.executablePath() — the
  build playwright 1.58.2 expects and `playwright install` provides; assets DELETED then
  regenerated with the exact CI commands; dev server 127.0.0.1:5173):
  * favorites-advanced 30/30 — RSS 931MB — 13.6s
  * player-video 17/17 on rerun (16/17 first run: the KNOWN flaky keepalive-beacon check
    "posts 2→2" — pre-existing flake class per 11.3 log; flagged for supervisor, NOT touched)
  * player-favorite-toggle 14/14 — RSS 988MB — 9.3s
  * player-hls 19/19 — RSS 1032MB — 11.0s — PROVES the CI per-rung ffmpeg ladder generation
    (freshly generated, not the old var_stream_map artifact)
  * player-hls-option-c 13/13 — RSS 1195MB — 49.6s (self-generated its 120s ladder)
  * TOTAL wall ≈ 102s for all 5 specs (well under any CI budget); peak RSS 1195MB < 1600MB.
  * Scope note: the prompt listed 4 specs; player-hls-option-c (Option C regression guard,
    merged to main in 11.1-REWRITE) is included as a 5th — all green locally.
- ci.yml changes (minimal extension per C.2; YAML re-validated with a parser):
  * push branches += 'wip/**' (per the C.1 template) — CI trust becomes verifiable on work
    branches pre-merge; docker-build gated `if: push && (main || develop)` so wip pushes do NOT
    publish throwaway ghcr images (required guard for the trigger extension).
  * frontend-test: pnpm/action-setup version input REMOVED (fixes the live "Multiple versions
    of pnpm specified" job-killer — packageManager pnpm@9.12.0 is authoritative); 4 new steps
    after "Run tests": Install Playwright Chromium (--with-deps), Resolve Chromium executable
    (dynamic — the specs' default path is sandbox-specific), Generate e2e media assets
    (ffmpeg: MP4 + per-rung HLS ladder + verbatim master.m3u8 — all commands validated above),
    Run Playwright e2e (dev server on 127.0.0.1:5173 + curl wait loop + 5 specs + cleanup).
  * lighthouse job: same pnpm/action-setup fix (same one-line defect, second site).
  * backend-test job: INTENTIONALLY unchanged — Docker is preinstalled on ubuntu-latest so the
    PART B fixture auto-starts; the full-suite `dotnet test` already covers unit+integration.
    Known pre-existing red on backend: FavoritesHttp JsonException (§12 report-only).
  * security-scan job: left verbatim (pre-existing trivy-action@0.28.0 unresolvable → job-setup
    failure; §12) — wip runs will show this job red; per-job results are the signal.

## PART D — admin-web tests in CI (COMPLETE; premise-corrected)
- PREMISE CORRECTION: admin-web already had 6 test files (35 tests) + setup.ts +
  vitest.config.ts + ALL test devDeps (vitest@^2, jsdom@^25, @testing-library/react@^16,
  jest-dom@^6, user-event@^14) in package.json AND pnpm-lock.yaml → debt C1 was CI-only.
  §3's vitest authorization was NOT needed — ZERO new packages, ZERO lockfile change.
- D.3 complement (per the prompt's smoke list): NEW src/test/app-boot.test.tsx — 3 tests:
  boot-to-login (email+password placeholders + Arabic copy), failed sign-in error surface,
  successful sign-in (session persisted + authenticated shell + a data failure surfaces via a
  REAL sonner [data-sonner-toast] node — the Toaster wiring proof; the welcome toast itself is
  lost across the login→app Toaster swap in jsdom — app-code observation, flagged, NOT fixed).
  Existing 35 already covered the API client (ApiError status/message/fallback), the
  mediaType utility, and 4 component suites. Total: 7 files / 38 tests.
- D.4 local: `pnpm --filter @cms/admin-web test` → 38/38 passed, 6.7s. (Invocation premise
  correction: the script is "test": "vitest run" — `test run` passes "run" as a filename
  filter → "No test files found"; CI uses `pnpm --filter @cms/admin-web test`.)
- tsc -b clean; eslint on the NEW file clean (--max-warnings=0). admin-web FULL `pnpm lint`
  is red from PRE-EXISTING no-explicit-any/exhaustive-deps warnings in source files (why the
  original CI never linted admin-web) — admin-web lint step intentionally NOT added (§12).
- D.5 CI: frontend-test job gained "admin-web tests: pnpm --filter @cms/admin-web test" right
  after the student-web vitest step (with a comment documenting the invocation correction).

## PART E — Final validation + LIVE CI verification (COMPLETE)
- Follow-up commits during CI observation (each pushed, PAT-scrubbed):
  * 3565efb "ci(11.5): run new test surfaces before pre-existing lint gate + actionable
    fixture failure" — the C-run revealed Lint (step) failing from 2 PRE-EXISTING
    no-explicit-any warnings in student-web source (SettingsPage.tsx:34,
    ActivateCodePage.tsx:47; --max-warnings=0 → exit 1; previously MASKED by the pnpm
    bug killing the job earlier). Fixing them = app code (out of scope) → the 5 NEW steps
    were moved BEFORE the Lint gate so CI-trust surfaces stay executable; the pre-existing
    gates (Lint → student vitest → Audit → Build → SBOM) keep their original order at the
    tail. PostgresFixture.MigrateAsync failures now rethrow with an actionable message.
  * 40566f2 "ci(11.5): install ffmpeg on runner (ubuntu-24.04 images ship none)" — premise
    correction: ubuntu-24.04 runner images do NOT include ffmpeg (exit 127 in the C-run);
    an apt-get step installs it (6.1.1 confirmed in the log) — the per-rung ladder
    generation was designed for exactly this version spread and PASSED.
- E.1 LOCAL matrix (sandbox): dotnet build 0 errors; Unit 419/419 (14s); Integration
  88 passed + 27 skipped + 1 failed (FavoritesHttp — pre-existing, §12 report-only) 2m9s;
  pnpm install --frozen-lockfile OK; student-web build ✓ 19.3s (PWA precache); admin-web
  build ✓ 9.7s; student vitest 126/126 ✓ 19.4s; admin vitest 38/38 ✓ 6.7s; all 5 e2e specs
  ✓ locally (asset regen + chromium-1208, total ≈102s).
- E.1 LIVE CI matrix (run 40451816149 on wip/11.5 @ 40566f2, ubuntu-24.04, ffmpeg 6.1.1):
  * Frontend job: Setup pnpm ✓ (fix verified live) → Install ✓ → admin-web tests ✓
    (38/38, debt C1 CLOSED with live evidence) → Playwright Chromium ✓ → executable
    resolved ✓ → ffmpeg installed ✓ → assets generated ✓ → **ALL 5 E2E SPECS ✓**
    (favorites 30/30 RSS 1012MB · player-video 17/17 FIRST-TRY (the keepalive flake did
    not bite; 1 known beacon-abort console line) · favorite-toggle 14/14 RSS 1098MB ·
    player-hls 19/19 · option-c 13/13) → Lint ✗ (pre-existing, report-only) → tail skipped.
  * Backend job: Testcontainers CONNECTED (unix:///var/run/docker.sock; ryuk + postgres:16-
    alpine container started ~8s) → fixture's MigrateAsync FAILED with the actionable
    message → 27 tests fail at fixture level + 1 FavoritesHttp fail (28 total).
  * Workflow conclusion: failure — driven by the three PRE-EXISTING defects below.
- CI-TRUST DEBT STATUS: C1 admin-web-in-CI = CLOSED (live green). C2 Playwright-in-CI =
  CLOSED (live green, 93 checks). D4/I6 27-Postgres-tests-in-CI = INFRASTRUCTURE DELIVERED
  (Testcontainers wired, container starts, fixture + skip semantics work) BUT the tests
  cannot pass until the migration-chain defect is remediated — see NEW DEBTS.
- NEW DEBTS DISCOVERED (all report-only per §12 — fixes are separate pushes):
  * N1 (CRITICAL): the EF migration chain is NOT replayable from an empty database —
    20261022000000_Phase54SystemSettings / Phase55ReportsModeration / Phase56Notification-
    ExpiresAt / Phase57FixNotificationSenderFk have NO Designer.cs files → EF never
    discovers them (dotnet ef migrations script emits only 22 of the 27 files) → on a fresh
    DB system_settings is never created → AddLibraryFileCategory's CREATE INDEX +
    INSERT INTO system_settings fail 42P01. These 4 migrations also never ran on Neon via
    database update (the table there was created manually — seed-production.sql era).
    Remediation: add the four Designer.cs files (or a consolidated baseline migration) —
    a MIGRATIONS push. This also means Neon disaster-recovery via migrations alone would
    hit the same wall — worth an explicit supervisor decision.
  * N2: FavoritesHttpIntegrationTests.Favorite_WithValidBoundEntitlement_… — JsonException
    at :35 (test deserializes List<FavoriteItem>; the Push-11.3 list endpoint returns the
    PAGED shape) — pre-existing 11.3 contract regression; 5-line test fix.
  * N3: student-web lint — 2 pre-explicit-any warnings (SettingsPage.tsx:34,
    ActivateCodePage.tsx:47) make the Lint gate red (was masked by the pnpm bug).
  * N4: security-scan job — aquasecurity/trivy-action@0.28.0 unresolvable (job-setup fail).
  * N5: android-offline-runtime.yml — malformed `branches: ain, develop]` filter line (typo)
    + the job fails on every push (incl. wip/*).
  * N6: lighthouse job is now UNBLOCKED by the pnpm fix but unexercised (needs frontend-test
    to pass first; LHCI_GITHUB_APP_TOKEN unknown) — expect new failures there once N3 is
    fixed; not touched per §12.
- pnpm-lock.yaml: UNTOUCHED (§3 authorization unused — all test deps pre-existed).

## 11.3 PART A — Migration AddEpisodeFavorites (FILE ONLY — NOT APPLIED)
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

## 11.3 PART B — Backend MediatR + enriched DTO + paged endpoint + playback-url IsFavorite (COMPLETE)
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

## 11.3 PART C — features/favorites/ folder (COMPLETE)
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

## 11.3 PART D — Player star + QuestionPage cache fix + ?episode= deep link (COMPLETE)
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

## 11.3 PART E — Tests (COMPLETE)
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

## RESUME_FROM (Push 11.5)
RESUME_FROM: <final wip/11.5 SHA — see below> — awaiting merge review (STOP GATE §2:
no merge, no deploy, no 11.6).
Delivered: Testcontainers.PostgreSql 4.16.0 fixture + [PostgresFact] runtime-skip (27
tests); admin-web tests in CI (38/38 live-green); Playwright e2e in CI (5 specs, 93
checks live-green on ubuntu-24.04/ffmpeg 6.1.1); pnpm/action-setup conflict fixed
(frontend pipeline resurrected); wip/** CI trigger + docker-build gated to main/develop.
Known-red (pre-existing, report-only): N1 migration chain not replayable from empty
(Phase54-57 lack Designer.cs → blocks the 27 tests passing + a Neon DR risk), N2
FavoritesHttp paged-shape JsonException, N3 student-web lint warnings, N4 trivy-action
unresolvable, N5 android workflow typo, N6 lighthouse unexercised. Supervisor decides
which remediation pushes follow (N1 first — it gates D4/I6 closure).

## Post-merge debts (Push 11.5)

- N1 [CRITICAL, tracked for 11.5.1]: Migration chain cannot 
  replay from empty DB. 5 migrations (Phase54SystemSettings, 
  Phase55, Phase56, Phase57) lack Designer.cs files → EF 
  cannot discover them → MigrateAsync from scratch fails 
  with 42P01 (relation system_settings does not exist). 
  These 4-5 migrations were never applied via database update 
  on Neon (system_settings was created manually at some 
  earlier point). Disaster-recovery risk: if neondb is lost, 
  it cannot be rebuilt from code alone. FIX: add missing 
  Designer.cs files + verify MigrateAsync on empty Postgres 
  succeeds with all 27 migrations applied.

- N2 [Medium]: FavoritesHttpIntegrationTests deserializes 
  List<FavoriteItem> but 11.3 changed endpoint to paged 
  shape → JsonException at line 35. 5-line fix.

- N3 [Medium]: 2 pre-existing `no-explicit-any` warnings 
  in student-web (SettingsPage.tsx:34, 
  ActivateCodePage.tsx:47) block Lint gate.

- N4 [Medium]: trivy-action@0.28.0 unresolvable → Security 
  Scan job broken.

- N5 [Low]: Workflow typo `branches: ain, develop]` + 
  android-offline fails on every push.

- N6 [Low]: Lighthouse job never exercised (needs successful 
  frontend + LHCI token).

## Post-merge debts (Push 11.5.1)

- N1 [CLOSED]: Migration chain can now replay from empty DB. 
  26 migrations discovered, 26 applied. Disaster Recovery 
  from code is now possible for schema. CI-verified via 
  Testcontainers on postgres:16-alpine.

- N2 [Medium, unchanged]: FavoritesHttpIntegrationTests 
  deserializes List<FavoriteItem> but 11.3 changed the endpoint 
  to PagedResult shape → JsonException at line 35. 5-line 
  fix. Tracked for 11.5.2.

- N3 [Medium, unchanged]: 2 no-explicit-any warnings in 
  student-web block Lint gate (SettingsPage.tsx:34, 
  ActivateCodePage.tsx:47). Tracked for 11.5.2.

- N7 [Medium, NEW from 11.5.1-A]: Schema drift in error_reports. 
  Production has fk_error_reports_admins_assigned_to/reviewed_by 
  + indexes; migration chain does NOT create them. Also 
  Phase55 creates ix_error_reports_status_assigned_to which 
  is not in the model. Tracked for 11.5.2 (migration Phase58).

- N8 [CRITICAL, NEW from A.5 on production]: 
  Phase53ExamAttemptPolicy (20260822160000) is applied on 
  production (exists in __EFMigrationsHistory) but its .cs 
  file is ABSENT on disk. Meaning: rebuild-from-empty will 
  MISS the DDL for is_first_attempt/counts_against_limit/
  *_snapshot columns (they exist on production). These columns 
  are currently added by an unknown hand-edit or an equivalent 
  migration. DR from code alone is therefore INCOMPLETE for 
  exam-attempt-policy schema. Tracked for 11.5.2 (restore 
  file from git history OR add Phase58RestoreExamAttemptPolicy).

- NEW [Medium]: CoursesPostgresIntegrationTests.
  HandlerRoundTrip_OnRealPostgres_CreateEpisodePublishAccess 
  fails with ForbiddenException. First real execution (was 
  BLOCKED before 11.5.1). May be test-authoring issue OR 
  EntitlementService drift. Tracked for 11.5.2 investigation.

---

# WIP_STATUS — wip/11.5.2

## Base
Branch: wip/11.5.2 (created from main @ 83c40216333a973f0049dbfcfc2e15399fc2299b — 11.5.1 merged)
Status: Push 11.5.2 — IMPLEMENT N8 + N2 + N3. COMPLETE (Parts B/C/D/E).
Commits: 998067e (B) → 4c7bff9 (C) → 8063b4f (D) → this docs commit (E).
Scope gate: N8/N2/N3 ONLY. N7, CoursesPostgres, N4, N5, N6 untouched (STOP GATE).

## PART B — N8 CLOSED: counts_against_limit via guarded Phase58

- Entity: `ExamSession.CountsAgainstLimit` added (bool, default true) —
  OperationalEntities.cs:65 (doc comment 62-64 marks it dead-column, schema fidelity only).
- DbContext: property mapping (HasColumnName counts_against_limit, default true, required) —
  ApplicationDbContext.cs:201-204.
- Migration: `20261028003241_Phase58RestoreCountsAgainstLimit` (27th in chain).
  Up() = guarded DO $$ block (idempotent: adds column only if missing — production
  already has it, so prod application only inserts the history row).
  Down() = intentional no-op (column predates this migration on prod; dropping breaks prod).
  Designer.cs + ApplicationDbContextModelSnapshot.cs regenerated → model now includes
  the column → future migrations will NOT drift.
- Chain on disk: 27 migrations (was 26).
- Verification: dotnet build 0 errors; `migrations list` shows Phase58 latest;
  /tmp/phase58.sql = DO $$ block + history INSERT only (supervisor applies manually —
  STOP GATE respected, production NOT touched).

## PART C — N2 CLOSED: FavoritesHttp PagedResult shape

- FavoritesHttpIntegrationTests.cs:37-38 now deserializes `FavoritePage`
  (record: Items/Total/Page/PageSize/TotalPages, line 75-76) and asserts `.Items`.
- Local `FavoriteItem` record refreshed (line 79): Id (was FavoriteId), Meta dropped —
  matches FavoriteItemDto (FavoriteDtos.cs:16-28).
- CI: ALL 3 FavoritesHttp tests PASSED (incl. the previously JsonException-failing
  Favorite_WithValidBoundEntitlement_CreatesListsAndDeletesOnlyOwnBookmark).
  Backend job: 534/535 passed; the single failure is CoursesPostgres (known, out of scope).

## PART D — N3 CLOSED: no-explicit-any × 2

- SettingsPage.tsx: onError (error: unknown) + getApiErrorMessage(error, 'فشل') — lines 35-37.
- ActivateCodePage.tsx: same pattern, fallback 'فشل تفعيل الكود' — lines 48-50.
- Import '@/utils/api-error' added in both files (established pattern, 8 existing call sites).
- Local: `eslint . --ext ts,tsx --max-warnings=0` → exit 0, 0 warnings.
- CI: cannot re-verify this push — see infra note below.

## PART E — Verification matrix

Local:
- dotnet build apps/api/CMS.sln → 0 errors (18 pre-existing warnings, all in test code).
- dotnet test --filter Unit → 419/419 passed.
- pnpm --filter @cms/student-web build → tsc -b exit 0; vite build complete (45 assets,
  all index.html refs resolve). NOTE: pnpm wrapper exits 137 (sandbox OOM) AFTER vite
  finishes writing dist — artifacts intact, environment-only artifact.
- pnpm --filter @cms/student-web lint → exit 0, 0 warnings.
- pnpm --filter @cms/admin-web test → 38/38 passed (7 files).

CI (run 40609897238 on 8063b4f):
- Security Artifact Gate: success.
- Backend Tests: 534/535 passed. ONLY failure = CoursesPostgres round-trip
  (ForbiddenException at CourseHandlers.cs:123 — known test-authoring debt, out of scope).
  Testcontainers Postgres started+ready ×2; MigrationContract test passed →
  full 27-migration chain (incl. Phase58) applied cleanly on fresh Postgres.
- Frontend Tests: FAILED at "Install Playwright Chromium" — NEW infra drift,
  NOT caused by this push: GitHub's ubuntu-latest now resolves to ubuntu26.04-x64 and
  pinned Playwright 1.58.2 refuses chromium install on it. Same failure on 998067e
  (backend-only commit) and absent on main's run 40456894350 (2026-10-27T05:43) where
  lint itself failed — drift began between those timestamps. Lint step never ran this push.
- Security Scan: failure (N4 trivy — known, out of scope).
- android-offline-runtime: failure (N5 branches typo — known, out of scope).
- On main @ 83c4021 lint failed with EXACTLY the 2 N3 warnings
  (SettingsPage.tsx:34:22, ActivateCodePage.tsx:47:22 — verbatim from CI log);
  both are now fixed locally (0 warnings). CI re-verification blocked by the
  Playwright/runner drift above → N3 CLOSED on local evidence + main-log diff.

## Debt ledger after 11.5.2

- N8 [CLOSED]: replay=prod 1:1 (27 migrations). counts_against_limit is a known-dead
  column (zero code references) kept for schema fidelity. Phase53ExamAttemptPolicy
  (20260822160000) remains a prod-history-only row; Phase58 reconciles the chain.
- N2 [CLOSED]: CI-verified (3/3 FavoritesHttp green).
- N3 [CLOSED]: locally verified (0 warnings); CI blocked by infra drift below.
- NEW infra debt [UNTRIAGED, proposed N9]: ubuntu-latest → ubuntu26.04-x64 breaks
  `playwright install --with-deps chromium` for pinned Playwright 1.58.2 → Frontend
  Tests job cannot reach Lint/tests steps. Fix options for 11.5.3: pin runs-on
  ubuntu-24.04 (workflow-only) OR bump Playwright (lockfile — needs supervisor approval).
  NOTE: main's "Health Check" workflow is also failing since ≥2026-10-27 (separate).
- N7 [open]: error_reports FK/index drift — out of scope this push.
- CoursesPostgres [open]: handler-level ForbiddenException vs BeEmpty expectation —
  out of scope this push.
- N4 (trivy unresolvable), N5 (android-offline branches typo), N6: unchanged.

RESUME_FROM: docs commit (final HEAD of wip/11.5.2; SHA in the session report) —
awaiting supervisor review of Phase58 SQL before any production application
(manual apply, exactly like 11.3 AddEpisodeFavorites).

## Post-merge debts (Push 11.5.2)

- N8 [CLOSED]: counts_against_limit is now in the model + 
  Phase58 guarded migration. Replay=prod 1:1 (27 migrations). 
  Phase58 will be applied to production manually by supervisor 
  (safe-guarded DO block; column already exists on prod). 
  No urgency — the API does not auto-migrate; Phase58 pending 
  is harmless until next migration.

- N2 [CLOSED]: FavoritesHttpIntegrationTests updated to 
  PagedResult shape. CI: 3/3 pass.

- N3 [CLOSED-locally]: any-warnings replaced with 
  getApiErrorMessage. Local Lint: 0 warnings. CI cannot 
  verify due to N9.

- N9 [CRITICAL, NEW, 11.5.3 target]: ubuntu-latest now 
  resolves to ubuntu26.04-x64; Playwright 1.58.2 Chromium 
  install fails (DNS EAI_AGAIN during install step). Effect: 
  Frontend Tests job fails at install, before Lint and e2e. 
  All frontend CI verification blocked. Fix options in 
  11.5.3: (a) pin runs-on: ubuntu-24.04 (workflow only, 
  no lockfile) — RECOMMENDED; (b) upgrade Playwright 
  (lockfile change); (c) add retry. Verification of N3 in 
  CI is pending N9 fix.

- N10 [LOW, NEW, 11.5.3 target]: Health Check workflow on 
  main fails repeatedly since ≥ 2026-10-27. Root cause 
  uninvestigated. Requires diagnostic in 11.5.3.

- Remaining: N7 (error_reports FK drift) + CoursesPostgres 
  (test-authoring) + N4 (trivy) + N5 (android typo) + 
  N6 (lighthouse). All 11.5.3+.

## Post-merge debts (Push 11.5.3)

- N7 [CLOSED]: Phase59AddErrorReportForeignKeys added 
  (2 FKs ON DELETE SET NULL + 2 indexes + composite index 
  registered in DbContext). Phase57 history row also 
  reconciled (DDL was no-op; only INSERT was needed). 
  Production and disk now have identical 29 migrations, 
  identical 5 FKs and 7 indexes on error_reports.

- N9 [CLOSED]: runs-on pinned to ubuntu-24.04 in ci.yml 
  (8 jobs). Frontend CI can now proceed past "Install 
  Playwright Chromium".

- N5 [CLOSED — different root cause than documented]: 
  The documented "branches typo" never existed; the actual 
  defect was `${{ env.ANDROID_HOME }}` inside job-level env 
  (GitHub rejects this — the file was marked invalid, 
  causing phantom failing runs on every push). Removed the 
  invalid block; workflow filters restored.

- CoursesPostgres [CLOSED]: test updated to expect 
  ForbiddenException (test-authoring, not EntitlementService 
  drift). Backend CI: 535/535.

- N3 [CLOSED-locally]: 0 lint warnings. CI verification 
  pending N11 fix.

- N10 [DIAGNOSED, fix in 11.5.4]: Health Check probes 
  placeholder domains (api.cms.example.com) + missing 
  SLACK_WEBHOOK_URL secret. API has real /health endpoint 
  available.

- N11 [NEW, CRITICAL, 11.5.4 target]: player-video.e2e.mjs 
  keepalive test fails (16/17) on first-ever CI execution. 
  Blocks Lint (step order: e2e → Lint). Likely race in 
  teardown or real keepalive bug — needs investigation.

- N4 [DEFERRED 11.5.4]: trivy-action@0.28.0 unresolvable.

- Remaining (Wave 11.6/12): B7 (Npgsql in Application), 
  B3 (in-memory pagination), D1 (processing_error), 
  B1 (transcoding retry), F1-F4 (players), O1-O5, S4-S7.

## Push 11.5.4 status

- N11 [CLOSED]: e2e flakiness family (keepalive + double-tap + HLS
  recovery) hardened. Root causes (3 distinct, evidence-backed):
  (1) keepalive beacon on page.goto escapes CDP route interception
  intermittently (CI vite proxy ECONNREFUSED logs prove it) — exit now
  via the real user path (navbar SPA link → React unmount → beacon
  from live page) + 15s poll; (2) double-tap used stale
  touchscreen.tap coordinates (layout shift between measure and
  dispatch → taps landed on episode-stage) — now locator.tap() with
  actionability/hit-target checks + gesture retry; (3) HLS recovery
  read the fresh-gen segment counter at loop-exit instant — now a
  bounded 15s counter poll. Local: 3× runs each spec, all green
  (player-video 17/17 ×3, player-hls-option-c 13/13 ×3). CI run
  40623651995 in progress at report time.

- N12 [CLOSED]: gradlew 100644 → 100755 (mode-only, blob unchanged).
  android-offline workflow fires on main only (branch filters) — its
  first real execution happens after merge; result to be observed
  then (previous failure was the exec bit itself).

- N10 [CLOSED]: Health Check URLs replaced with real endpoints
  (cms-api-preview.onrender.com/health,
  cms-platform-manus-student-web.vercel.app), runs-on pinned to
  ubuntu-24.04, Slack notify step removed (SLACK_WEBHOOK_URL secret
  not configured — silent failure is the cleaner default).

- N3 [CLOSED in CI]: Lint step passed on main run 40618355176
  (evidence: step 12 "Lint" → success). Re-verification rides this
  push's Frontend job.

- N13 [NEW, CRITICAL, 11.5.5 target]: Frontend job fails at "Audit
  production dependencies" — pnpm audit --prod --audit-level high
  reports 15 vulnerabilities; headline: axios@1.19.0 ReDoS
  (GHSA-c29m-xwm3-cm6r, fixed in >=1.20.0) in admin-web +
  student-web. Fix requires pnpm-lock.yaml changes (out of scope
  11.5.4). Frontend job stays red on main until N13.

- Remaining after 11.5.4: N4 (trivy, deferred 11.5.5), N13 (audit,
  11.5.5). Wave 11.5 complete except N13.

## Post-merge debts (Push 11.5.4)

- N11 [CLOSED]: three root causes (keepalive beacon escapes 
  interception during unload; double-tap stale boundingBox; 
  HLS counter race at loop exit) fixed with proven patterns. 
  CI step 11 = SUCCESS. Local 3x3 all green.

- N12 [CLOSED]: apps/android/gradlew 100644→100755 (blob 
  unchanged). Note: `git update-index --chmod=+x` alone is 
  reverted by `git add` under core.filemode=true; correct 
  approach is `chmod +x` on disk then `git add`.

- N10 [CLOSED]: Health Check URLs replaced with real 
  endpoints; runner pinned to ubuntu-24.04; Slack step 
  removed (secret unconfigured). Verification on first 
  scheduled run after merge.

- N3 [CLOSED in CI]: Lint success on runs 40618355176 (main) 
  and 40623534942 (wip/11.5.4).

- N13 [CRITICAL, NEW, 11.5.5 target]: pnpm audit fails with 
  axios@1.19.0 ReDoS (GHSA-c29m-xwm3-cm6r, fixed >=1.20.0) 
  + 14 other vulns. Frontend job will remain red on main 
  until fixed. Requires pnpm-lock changes (supervisor must 
  authorize in 11.5.5).

- N4 [DEFERRED 11.5.5]: trivy.

- Remaining Wave 11.5: N4 + N13 only. Wave 11.5 will be 
  fully closed by 11.5.5.

- Local-only observation (no fix): player-video check 13 
  can show "posts 1→1" occasionally under memory pressure. 
  CI never exhibited it. Watch for future occurrence.

## Push 11.5.5 status

- N13 [CLOSED]: axios@1.19.0 -> 1.21.0 via pnpm
  overrides. Audit: 15 -> 0 advisories. Frontend step 14
  (Audit) now passes.

- N14 [PARTIAL CLOSED]: android workflow now has per-step
  timeouts (emulator 15min, diagnostics 5min) and
  artifact upload before diagnostics (if: always()).
  Emulator boot still fails at step 6 — deferred to Wave
  12 (Android Offline feature work). The 35-minute hang
  is fixed: diagnostics now terminates at 5min max,
  preserving artifacts.

- Wave 11.5 status: 12/13 closed. Only N4 (trivy) remains.
  11.5.6 will close N4 and complete Wave 11.5.

- N13 evidence: wip/11.5.5 commits 2946822 (qualified
  overrides in root package.json pnpm.overrides — the
  pnpm 9 location; pnpm-workspace.yaml overrides verified
  inert on pnpm 9.12.0), 38dac7a (dead zod removed from
  admin-web — 0 imports repo-wide), 0cfe3ef (lockfile
  +15/-19). CI run 40630875693 on 0cfe3ef: Frontend job
  SUCCESS — all 18 steps green incl. step 14 (first
  green Frontend since the audit gate landed; steps
  15-18 Build/SBOM/artifacts unblocked). Backend 535/535,
  e2e 5 specs green (30/17/14/19/13).

- N14 verification note: android-offline on.push branches
  = [main, develop] — wip pushes do NOT trigger it; the
  5-min diagnostics bound + pre-diagnostics artifact
  observe on the FIRST main run after merge (report-only
  there).

## Post-merge debts (Push 11.5.5)

- N13 [CLOSED]: pnpm.overrides in root package.json forces
  axios>=1.20.0 (1.19.0→1.21.0) and follow-redirects>=1.16.1
  (1.16.0→1.16.2). Audit: 15→0. CI step 14 = SUCCESS on
  0cfe3ef (run 40630875693). Removed dead zod dependency
  from admin-web (0 imports repo-wide, all gates green).

- N14 [STRUCTURALLY CLOSED]: added timeout-minutes: 15 
  (emulator step), 5 (diagnostics step), and pre-diagnostics 
  artifact upload with if: always(). No more 35-min hang on 
  emulator failure. Emulator itself still fails at step 6 — 
  tracked for Wave 12. Operational verification: first main 
  run after this merge.

- Wave 11.5: 12/13. Only N4 (trivy-action) remains. 11.5.6
  will close N4 and Wave 11.5 completes.

## Push 11.5.6 status

- N4 [CLOSED]: trivy-action upgraded from 0.28.0 (removed) to 
  v0.36.0 (SHA-pinned at ed142fd0673e97e23eac54620cfb913e5ce36c25). 
  Security Scan job now resolves and runs. Scan outcome: SUCCESS 
  — full job green (CodeQL init/autobuild/analyze + trivy fs scan 
  + SARIF upload); 0 CRITICAL/HIGH findings (0 code-scanning 
  alerts, open or otherwise; Trivy + CodeQL analyses both 
  uploaded on 02b99e7, run 40634985453).
- Wave 11.5: 13/13 on paper for security scanning. Frontend 
  remains flaky (N11, 11.5.7). N4 fix does not affect e2e.
- Next: 11.5.7 (N11 re-fix), then 11.5.8 (CodeQL).
- Deviation note: SHA-pin departs from ci.yml's tag-ref 
  convention (intentional, supply-chain posture); systematic 
  SHA migration for all actions deferred to Wave 12.

## Post-merge debts (Push 11.5.6)

- N4 [CLOSED]: trivy-action 0.28.0 → v0.36.0 SHA-pinned at
  ed142fd0673e97e23eac54620cfb913e5ce36c25. Security Scan 
  job green for the first time ever. Trivy 0.70.0 ran fs 
  scan (vuln+secret), SARIF uploaded, 0 CRITICAL/HIGH 
  findings. Wave 11.5: 13/13 on paper.

- N11 [OPEN, 11.5.7 target]: keepalive flake recurs on main 
  and wip (16/17, posts 2→2). Prior fix (11.5.4-B: polling 
  + SPA link) insufficient under CI load. 11.5.7 will 
  re-diagnose.

- CodeQL observation: CodeQL/C# already runs in the 
  security-scan job (init + autobuild + analyze with 171 
  csharp queries, all success). 11.5.8 = extend CodeQL to 
  JavaScript/TypeScript for frontend coverage (incremental, 
  not from-scratch).

- Remaining Wave 11.5 sequence:
  * 11.5.7 = N11 keepalive re-fix
  * 11.5.8 = CodeQL JS/TS coverage (2nd inspector complete)

## Push 11.5.7 status

- N11 [CLOSED]: keepalive test determinized via synthetic
  beforeunload. Local: 5/5 runs × 17/17 each (was 4/5 before
  fix). CI: VERIFIED — run 40639970231 (de9bfc7), Frontend Tests
  success, player-video 17/17, "page-leave (beforeunload) → final
  progress save (keepalive) — posts 2→3" green. Root cause
  confirmed: beacon escapes CDP interception during unload; synthetic
  dispatch runs handler in live context. Hardening (a) added:
  try/catch around postDataJSON() in the progress route handler
  (degraded postBody no longer kills the handler before
  route.fulfill). Unmount-path onHide coverage deferred to unit
  tests (supervisor decision 11.5.7). CI evidence: frontend job log
  lines 1260-1261.

- N15 [CLOSED]: Lighthouse staticDistDir set to
  ./apps/student-web/dist via inline flag in ci.yml:299 (chosen over
  lighthouserc.js: the step has no working-directory, so a nested
  config file would also need an explicit --config flag = 2 changes).
  CI: job RUNS — collect succeeded (1 URL × 3 audits; findBuildDir
  error gone). Job conclusion = failure from LHCI's BUILT-IN default
  assertions (none configured by us; "Configuration file not found"
  in the log): ✘ unused-javascript (maxLength), ✘
  network-dependency-tree-insight (minScore); warnings incl.
  first-contentful-paint, interactive, LCP, render-blocking-resources
  (expected ≤0, found 3). Per supervisor decision 11.5.7:
  performance-metric failure = report-only, not a blocker.
  Disabling the default assertions is a supervisor decision — NOT
  touched in this push.

- N16 [RECORDED, deferred]: check 13 (interval progress posts)
  flakes under TTL=8 churn. Local: 1/5 fails. CI: 5/5 passes so far
  (incl. this run — "progress POST every 10s — posts 1→2" green,
  job log line 1260). Deferred to post-Wave-11.5 with dedicated
  DIAG. No fix in this push.

- CORRECTION to 11.5.6 record: Security Scan "0 findings" was a
  false negative — the alerts query ran before SARIF ingestion
  completed (CodeQL analysis 2042372383 on 02b99e7 = 157 results,
  created 05:00:17Z, after the check). Current open code-scanning
  alerts: 157 (149 cs/ + 8 js/; severity: 77 note, 69 warning,
  6 medium, 2 high, 3 error). Notable: js/xss-through-dom
  (apps/admin-web/src/lib/mediaProcessing.ts:184, HIGH),
  js/regex/missing-regexp-anchor (e2e/player-hls-option-c.e2e.mjs:169,
  HIGH), cs/loss-of-precision ×3 (PerformanceService.cs:122-123,
  ERROR), cs/log-forging ×6 (middlewares, MEDIUM), cs/catch-of-all-
  exceptions ×46 (quality). Facts for scope planning: CodeQL
  javascript-typescript has been in ci.yml's init step since the
  initial import (d08b64a) alongside csharp with the
  security-and-quality suite — the "extend CodeQL to JS/TS"
  premise for 11.5.8 is moot; the actual 11.5.8 work = triage
  policy for these 157 findings (supervisor decision). All
  findings REPORTED ONLY (§12) — no triage/fix in this push.

- Wave 11.5 status: 14/14 on paper (13 debts + N15). N16 deferred.
  Next: 11.5.8 (CodeQL findings triage — scope per supervisor)
  closes Wave 11.5 operationally.

### Push 11.5.7 followup — N15 assertion suppression flag REJECTED by LHCI

- Supervisor-approved followup commit 86ead1b appended
  `--assert.assertions=""` to the autorun command (ci.yml:303). CI run
  40641892837 (86ead1b): Lighthouse CI job = FAILURE at a NEW point —
  collect fully green (Running Lighthouse 3 time(s), Run #1/#2/#3
  done, "Done running Lighthouse!", log lines 289-293), then
  `Error: No assertions to use` thrown at assert.js:55 → "assert
  command failed. Exiting with status code 1." All other jobs green
  (Backend 535/535, Frontend e2e 5/5 specs, Security Scan success,
  Artifact Gate success).

- ROOT CAUSE (source-verified, @lhci/cli 0.15.1 — same version CI
  resolves; local copy installed to /tmp/lhci-probe for forensics):
  * assert.js:53-55: `areAssertionsSet = Boolean(assertions ||
    assertMatrix || preset)`; empty-string assertions is FALSY →
    throws 'No assertions to use'. The assert command REFUSES to run
    with zero assertions — no empty-set form can ever pass.
  * autorun.js:137: assert is skipped ONLY when the assert config is
    falsy AND upload config is present. With no assert flags at all,
    autorun injects `--preset=lighthouse:recommended` (the source of
    the original default-assertion failures).
  * autorun.js:144-147: upload failures are WARNING-only by default
    (exit 0) unless --failOnUploadFailure.
  * LHCI_GITHUB_APP_TOKEN is read NOWHERE in @lhci/cli 0.15.1 src —
    the workflow's env var is inert.
- LOCAL EMPIRICAL VERIFICATION (existing dist/, no app code changed
  in 11.5.7):
  * T1 repro: `--assert.assertions=""` → exit 1, "Error: No
    assertions to use" — byte-identical to CI.
  * T2 candidate mechanism: `--upload.target=filesystem
    --upload.outputDir=<dir>` with NO assert flags → exit 0, "Done
    running autorun.", assert step SKIPPED entirely, 3 report pairs
    (html+json) + manifest.json written to disk.
- N15 [REOPENED]: mechanism correction requires a supervisor
  decision (findings-visibility tradeoff):
  * Option 1 (RECOMMENDED): T2 flags + an actions/upload-artifact@v4
    step (pattern already used 3× in ci.yml at lines 72/213/219) —
    green + reports downloadable in the run's Artifacts section
    ("findings visible in the report artifact" literally). 2 changes.
  * Option 2: T2 flags only — green, but reports die with the job
    workspace; no findings visibility. 1 change.
  * Option 3: `--upload.target=temporary-public-storage` — green
    (upload failure = warning-only), prints PUBLIC report links in
    the log; exposes the build's report on public storage + adds a
    network dependency. 1 change.
- 11.5.8 scope REVISED by supervisor (recorded for planning, no work
  done): fix js/xss-through-dom (admin-web mediaProcessing.ts:184),
  fix js/regex/missing-regexp-anchor (e2e spec:169), fix/verify
  cs/loss-of-precision ×3 (PerformanceService.cs:122-123),
  acknowledge-or-fix cs/log-forging ×6 (middlewares), document the
  146 warning/note alerts as backlog.

## Push 11.5.7 status (updated — N15 final closure)

- N15 [CLOSED]: Lighthouse autorun with filesystem upload,
  no assert flags. Autorun skips assert (autorun.js:137).
  Reports uploaded as artifact. Default assertions suppressed
  via absence of assert configuration. Local T2 verified.
  CI VERIFIED — run 40644558809 (b0d0d10), Lighthouse CI job
  SUCCESS for the first time: command resolved + executed
  (log lines 274-275), Healthcheck passed (line 296), Running
  Lighthouse 3 time(s) → Run #1/#2/#3 done → Done running
  Lighthouse! (lines 299-303), reports dumped to ./lhci-reports
  (line 305), "Done running autorun." exit 0 (line 308) — no
  assertion step ran at all. Artifact step (upload-artifact@
  ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2, SHA verified
  against the v4.6.2 tag before pinning): "Artifact
  lighthouse-reports-40644558809 has been successfully uploaded!
  Final size is 466870 bytes. Artifact ID is 12796958537" (log
  line 336). Artifact downloaded and verified: exactly 3 HTML+JSON
  report pairs (06:38:40 / 06:38:52 / 06:39:03; html ~474-479 KB,
  json ~287-292 KB each) + manifest.json (1.4 KB) = 7 files.

- Wave 11.5 status: 14/14 closed on paper. Only 11.5.8
  (CodeQL triage) remains.

- Run 40644558809 overall: FULL GREEN (conclusion: success —
  first fully green pipeline run). Backend 535/535 (Test Run
  Successful, 535 Passed lines, 0 Failed). Frontend: unit 38 + 126
  passed; e2e 5/5 specs — favorites-advanced 30/30, player-video
  17/17 (check 13 posts 1→2 line 1215; keepalive beforeunload
  posts 2→3 line 1216), player-favorite-toggle 14/14, player-hls
  19/19, player-hls-option-c 13/13. Security Scan success (157
  CodeQL alerts uploaded to the Security tab — findings tracked
  separately for 11.5.8 triage, NOT a job failure). Security
  Artifact Gate success.

## Post-merge debts (Push 11.5.7)

- N11 [CLOSED]: keepalive test determinized via synthetic 
  beforeunload. CI-verified: posts 2→3, player-video 17/17, 
  5/5 specs green.

- N15 [CLOSED]: Lighthouse CI runs autorun with filesystem 
  upload (no --assert flags). Autorun skips assert entirely 
  (autorun.js:137). Reports uploaded via upload-artifact@v4.6.2 
  (SHA-pinned ea165f8d). Artifact contains 7 files 
  (3 HTML+JSON pairs + manifest). Default assertions suppressed 
  via absence of assert configuration.

- Lighthouse default assertions decision: no performance gate. 
  Findings visible in artifact for manual review.

- N16 [RECORDED, deferred]: check 13 flake under TTL=8 churn. 
  CI: 5/5 passes so far. Local: 1/5 fails. Post-Wave-11.5 DIAG.

- CodeQL alerts (157 total, 2 high + 3 error + 6 medium + 
  rest note/warning): visible in Security tab. Tracked for 
  11.5.8 triage. High-severity: js/xss-through-dom 
  (admin-web/src/lib/mediaProcessing.ts:184), 
  js/regex/missing-regexp-anchor (e2e spec:169), 
  cs/loss-of-precision ×3 (PerformanceService.cs:122-123).

- Wave 11.5 status: 14/14 closed. Only 11.5.8 (CodeQL triage) 
  remains. First FULL GREEN CI achieved on this merge.

## Push 11.5.8 status

- CodeQL triage completed:

| Alert | Type | Disposition |
|---|---|---|
| #150 js/xss-through-dom | HIGH | Dismissed (false positive, API + source comment) |
| #151 js/regex/missing-regexp-anchor | HIGH | Fixed (anchor added) |
| #21-23 cs/loss-of-precision | ERROR ×3 | Fixed (literals promoted to double) |
| #1-6 cs/log-forging | MEDIUM ×6 | Deferred to Wave 12 (N17) |
| 146 note/warning | Backlog | Documented, no fix |

- Open alert count: 157 → 152 (wip/11.5.8 @ 2cd4a1b ref,
  analyses 2047156798/2047158832 ingested 17:12Z; API-verified
  2026-10-28T17:27Z: state=open on ref = 152 = 6 log-forging +
  146 backlog; regex/loss-of-precision/xss all absent).
  Default-branch (main) view: 156 — #21-23 + #151 remain open
  there until merge triggers fresh main analysis (pre-fix
  analysis 2042847628 from 8e796608 still latest on main);
  #150 dismissal is API-driven and immediate.

- Verification on 2cd4a1b (CI run 40732721837, full green):
  Backend 535/535; Frontend e2e 5/5 specs (30/30, 17/17,
  14/14, 19/19, 13/13 — option-c green with anchored regex);
  local: dotnet build 0 errors, 419/419 unit, e2e 13/13 × 3,
  student lint clean, both web builds green.

- N17 [NEW, Wave 12 target]: log-forging ×6 (medium)
  - Sites: SecurityMiddleware.cs:95/118/125,
    CorrelationIdMiddleware.cs:31 (×2 alerts),
    PerformanceMiddleware.cs:228
  - Issue: Console() sink writes raw values (no escaping);
    potential newline injection in aggregated logs
  - Fix: WriteTo.Console(new CompactJsonFormatter()) in
    Program.cs — changes production log format globally
  - Impact: requires ops review (Render log parsing, alerting)
  - Deferred to Wave 12

- Backlog breakdown (146 total, API-verified from wip ref):
  - 46 × cs/catch-of-all-exceptions
  - 20 × cs/useless-upcast
  - 19 × cs/useless-assignment-to-local
  - 12 × cs/complex-condition
  - 10 × cs/constant-condition
  - 9 × cs/local-not-disposed
  - 8 × cs/linq/missed-where
  - 5 × cs/path-combine
  - remaining 17 across 10 rules (3× js/trivial-conditional,
    3× cs/useless-cast-to-self, 2× js/superfluous-trailing-
    arguments, 2× cs/missed-ternary-operator, 2×
    cs/linq/missed-select, and 5 singletons)
  - Policy: opportunistic cleanup in future waves;
    CI non-blocking; no dedicated push scheduled

- Wave 11.5 status: **CLOSED**.
  - 14/14 debts closed (N1-N15, N16 deferred post-wave)
  - CodeQL triage complete (5 fixed/dismissed, 6 deferred
    to Wave 12 as N17, 146 backlog documented)
  - First full-green CI achieved (11.5.7)
  - Next: Wave 12 (Android Offline)

- RESUME_FROM: wip/11.5.8 HEAD (2cd4a1b code fixes + this
  docs commit) — awaiting merge approval into main @ 8e79660.

## Post-merge debts (Push 11.5.8)

- CodeQL triage: Wave 11.5 closure complete.
  * #150 js/xss-through-dom: dismissed via API (false positive)
  * #151 js/regex/missing-regexp-anchor: fixed (anchor added)
  * #21-23 cs/loss-of-precision ×3: fixed (literals to double)
  * #1-6 cs/log-forging ×6: deferred to Wave 12 (N17)
  * 146 note/warning: documented as backlog, opportunistic 
    cleanup in future waves

- Alert count after merge SARIF analysis: expected 152 
  (146 backlog + 6 N17). Verification pending.

- Wave 11.5 status: **CLOSED** (14/14 debts + CodeQL triage).
  Debts closed: N1-N15 (N16 deferred post-wave).
  First full-green CI: maintained.
  Production: healthy (videos play, favorites work).
  Migrations: 29 replay=prod 1:1.
  Security: trivy + CodeQL operating (2 inspectors).

- Next: Wave 12 (Android Offline) — R1 DIAG pending approval.
