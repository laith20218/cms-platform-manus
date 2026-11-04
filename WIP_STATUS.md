# WIP_STATUS — feature/w15.0-frontend-question-list (W15.0 Phase 4: Shared QuestionRow + Inline List)

## ─── STATE ───────────────────────────────────────────────
W15.0 Phase 4 (PART I workorder) COMPLETE — 4 commits + evidence DONE on
`feature/w15.0-frontend-question-list` (LOCAL ONLY — push requires supervisor
approval, §2). Base: main @ `800789fad8ed1c5df805464c1768deb420eb437d`
(verified before branching, §9). This is the FINAL W15.0 phase; the
session-wide RESUME_FROM.md on this branch is authoritative for all four.

## ─── COMMITS (this branch, oldest → newest) ──────────────
1. `75b74bc` feat(student-web): shared QuestionRow component (W15.0 P4-C1)
2. `be82f61` feat(student-web): PracticePage inline list view (W15.0 P4-C2)
3. `8be64f4` feat(student-web): ExamPage + ExamReviewPage inline list views (W15.0 P4-C3)
4. `4fc68d3` feat(student-web): bookmark + report actions on practice rows (W15.0 P4-C4)
5. `536b65e` test(student-web): refreshed §13 evidence screenshots (inline list views)

## ─── WHAT WAS IMPLEMENTED ────────────────────────────────

### Commit 1 — the shared row (`75b74bc`)
- src/components/QuestionRow.tsx: ONE presentational inline question row bridging
  the three DTO families (PracticeQuestion / ExamQuestion / ExamReviewQuestion
  normalize at the page boundary — QuestionRowData + QuestionRowFeedback).
  Workorder styling: subtle border-b separator (NO card wrapper), number + text +
  options as BUTTONS (role=radio/checkbox, aria-checked) + optional explanation;
  inline confirm per row; per-row reset/bookmark/report when wired; essay
  textarea + read-only review mode (non-interactive option rows, per-option
  correctness, user-answer highlight, hidden-correctness badge); confirm-gated
  reveal preserved; ALL testids namespaced by question id.

### Commit 2 — PracticePage list (`be82f61`)
- Single-card pager REMOVED: every session question renders as a QuestionRow
  (options + INLINE confirm + immediate feedback + per-row reset) inside one
  surface container. submitAnswer/resetQuestion parameterized by question (state
  was already per-question keyed); toggleSelection extracted; currentIndex +
  prev/next removed; chip navigator → SCROLL ANCHORS (smooth scrollIntoView);
  session header (title/progress/score/reset-all) + confirm dialog unchanged.

### Commit 3 — Exam lists (`8be64f4`)
- ExamPage: every exam question as a QuestionRow; selections autosave with the
  question's OWN index (workorder contract — resume order now tracks the last
  ANSWERED question; goToQuestion/saveProgress navigation removed with the
  pager); progress bar + header now answered-count based; submit CTA always
  visible under the list; NO correctness during the run (server-gated to review).
- ExamReviewPage: same QuestionRow in read-only mode (correctness badge replaces
  the old per-card border coding — disclosed; server-gated correct-answer line,
  explanation blocks, essay fallback).

### Commit 4 — bookmark/report on practice rows (`4fc68d3`)
- src/components/ReportQuestionDialog.tsx: the «الإبلاغ عن خطأ» dialog extracted
  from QuestionPage (reason radiogroup + description + mutation + W14.5
  onError-toast fix carried over), shared by any surface.
- PracticePage rows: flat-favorite toggle (questionApi endpoints, optimistic
  override + rollback + ['favorites'] invalidation) + the report dialog.
  PracticeQuestion DTO carries NO isFavorite flag — toggle starts false,
  optimistic (disclosed).

### Commit 5 — evidence (`536b65e`)
- W14.4 §13 matrix re-run against the lists: **49/49** (5-width zero-h-scroll,
  axe 2.2 AA 0 critical/serious at 375+1440, practice feedback + reset flows,
  exam golden path, question page contracts). All screenshots re-baselined
  (practice 375px = full-page 375×1344 two-row list). Peak Chromium RSS 885MB.

## ─── VERIFICATION LADDER (final tree) ────────────────────
- `tsc -b`: 0 errors · `eslint . --max-warnings=0`: exit 0
  (ESLINT_USE_FLAT_CONFIG=false locally — sandbox nesting quirk; CI unaffected)
  · `vitest run`: **380/380 (29 files)** — baseline 378 + 2 new (simultaneous
  list render; bookmark POST→DELETE + report submit) · `vite build`: PASS.
- E2E: w14.4-student-ui **49/49** re-baselined for the list views; RSS 885MB (§4).

## ─── DISCLOSED DEVIATIONS / DECISIONS ────────────────────
1. **QuestionPage NOT converted** — the workorder's commits (C1–C4) convert
   Practice/Exam/Review only; the lecture pager stays (converting it would also
   collide with Phase 2's picker changes to the same file — separate branches
   off main). Its favorite/report remain as-is; the shared dialog extraction
   makes a later swap cheap.
2. **Exam resume semantics changed with the pager**: currentQuestionOrder now
   tracks the last ANSWERED question (saveSelection sends the question's own
   index; the goToQuestion/saveProgress navigation path is gone). Open question
   flagged to Supervisor.
3. **Review per-card border coding dropped** for the uniform row look — the
   correctness badge + option highlights carry the same information.
4. **Practice favorite initial state unknown** (DTO lacks isFavorite) — toggle
   starts false, optimistic; a DTO addition would make it exact (backend change
   out of scope for this phase).
5. **Token family**: QuestionRow uses --cms-* (workorder's prescribed
   separator) inside Exam pages' --c-* chrome — deliberate uniform row look.
6. **e2e testid contract**: practice testids namespaced per question
   (practice-confirm-pq-1 etc.) — w14.4 script updated + documented inline.

## ─── NEXT (STOP GATE → supervisor) ───────────────────────
1. Review the 5 commits + refreshed screenshots + this evidence pack.
2. Push approval → `git push -u origin feature/w15.0-frontend-question-list`
   → PR → CI green → merge (frontend-only; no API contract dependency).
3. Merge order recommendation: Phase 1 (backend) → Phase 2 (needs 1) →
   Phases 3+4 (independent). Phase 2's QuestionPage picker and this branch's
   QuestionPage-adjacent extraction (ReportQuestionDialog) do NOT conflict
   (different files; QuestionPage itself untouched here).
- **Environment note**: pnpm 9.12.0 via corepack at /home/z/.corepack-bin;
  ESLINT_USE_FLAT_CONFIG=false for local lint; vite dev binds IPv6 localhost
  (E2E_WEB_URL=http://localhost:5173); Playwright chromium-1200; clone at
  /home/z/my-project/cms-platform-manus.
