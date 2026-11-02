# WIP_STATUS — feat/14.2-backend-api (Wave 14.2: Backend API Completeness)

## ─── STATE ───────────────────────────────────────────────
Wave 14.1 is MERGED (main @ 87d93d5, PR #70). This branch implements Wave 14.2
(R75 P0/P1/P2 backend fixes + W14.1 entity APIs + missing admin endpoints) —
**6 commits, LOCAL ONLY — push requires supervisor approval (§2)**.

Verification ladder (this wave, in-sandbox, .NET 9 SDK 9.0.320):
**dotnet build 0 errors** (warnings all pre-existing, all in CMS.Tests) ·
**dotnet test 637/637 passed, 0 failed, 27 skipped (Testcontainers — no Docker;
same 27 as the 12.5/14.1 baseline)** — 619 baseline + 18 new W14.2 tests ·
**`dotnet ef migrations has-pending-model-changes` → "No changes"** (run after
every commit; zero schema changes this wave — §3 honored).

## ─── COMMITS (this branch, oldest → newest) ───────────────

1. `0639228` fix(api): wave 14.2 security & consistency (P0/P1/P2)
2. `af9dcb9` feat(api): wave 14.2 domain APIs (ExamCourse, Practice, Reports)
3. `f74c102` feat(api): wave 14.2 missing admin endpoints
4. `2875017` feat(api): wave 14.2 stats + sweeper + heartbeat
5. `515cc4f` feat(api): wave 14.2 DTO alignment
6. `<HEAD>`  test(api): wave 14.2 regression suite + WIP_STATUS

## ─── WHAT WAS IMPLEMENTED ────────────────────────────────

### Phase A — Security & Consistency (commit 1)
- **A.1 Offline sync P0** (`OfflineHandlers.cs`): sync bound to an exam session now
  verifies ownership (JWT-derived StudentId vs `ExamSession.StudentId` → 403 + audit),
  grades against the immutable `ExamSessionQuestion` snapshot (option identity +
  IsCorrect flags, `AttemptLog.ExamSessionQuestionId` now linked), and the former
  EMPTY tamper-check block is replaced by timestamp sanity (future-dated/stale
  answers rejected + security audit) plus a client-mismatch audit event. Non-session
  syncs grade against the server-side cache captured at package issue time, falling
  back to the live bank only when the cache entry is absent.
- **A.2 403 → ProblemDetails** (`ExceptionHandlingMiddleware` already produced detail
  for ForbiddenException; the bare `Forbid()` sites did not): the 4 R75 sites
  (ExamsController, QuestionsController, AcademicController, OfflineController
  entitlement rejections) now return `Problem(403, detail: FailureReason ?? …)`.
  In commit 3 the wave constraint "EVERY 403 = ProblemDetails with detail" was
  applied to ALL remaining bare `Forbid()` sites: **90 sites across 13 controllers**
  mechanically converted (behavior-preserving: 403→403 with body). `rg "return Forbid\(\);"`
  over CMS.Api/Controllers → 0 hits.
- **A.3 Legacy Question.ExamId reads retired** (`QuestionHandlers.cs:46-47`,
  `OfflineHandlers.cs:88`): both TODO(W14.2) markers removed; exam membership now
  resolved via the `ExamQuestion` join. Column KEPT (dormant) per brief — no migration.
- **A.4 AdminExamsController double auth**: class-level `[Authorize(Roles="admin,super_admin")]`
  added (was bare `[Authorize]`); per-endpoint policies unchanged.
- **A.5 Guid.Parse → TryParse** (`QuestionsController.GetAdminId`,
  `AcademicController.GetAdminId`): malformed admin subject claim now → 401
  (UnauthorizedAccessException mapping) instead of FormatException → 500.
- **A.6 Rate limiter "exam-session"** (Program.cs, 120 req/min) applied to
  start / answer / submit / cancel in ExamsController.

### Phase B — Domain APIs (commit 2)
- **B.1 ExamCourse admin** (D1/D5/D6): `ExamCourseHandlers` (Create/Update/Publish/
  Archive/SoftDelete/AddExam/RemoveExam/Reorder) + `AdminExamCoursesController`
  (double-layer auth: class roles + per-endpoint policies `ExamCourse*` mapped to
  the `exams` resource — no new permission rows; per-mutation subject scope check).
  Publish requires ≥1 exam (D6 spirit). AddExam is bank-only + same-subject-only +
  unique (course,exam).
- **B.2 ExamCourse student** (D4): `StudentExamCourseHandlers` (published-only list
  with subject/year/semester URL filters; detail with per-student attempt state)
  + `ExamCoursesController` (entitlement gate via signed entitlement, fail-closed
  re-check inside handlers).
- **B.3 Practice (D13)**: `PracticeHandlers` (idempotent get-or-create start;
  answer upsert graded vs bank — MCQ/TF single, MultipleSelect set-equality, Essay
  NULL=ungraded; auto-complete when every composed question is graded → Score frozen;
  reset-question unfreezes; reset-session wipes; progress counts). `PracticeController`
  with ownership + entitlement gates.
- **B.4 Reports (D12)**: `ReportQuestionDto/Command` extended with optional
  `ReportType` (unknown → Other; legacy clients unaffected). Admin triage:
  `GET /admin/questions/reports?status=&type=` (scope-narrowed) and
  `PUT /admin/questions/reports/{id}/resolve|reject` (resolver identity persisted).

### Phase C — Missing admin endpoints (commit 3)
- Questions: `duplicate` (options+images+metadata as fresh Draft), `unpublish`
  (Published→Draft only), `preview` (student view — no correctness/explanation),
  `bulk-publish` / `bulk-archive` (≤100 ids, per-question scope check, skips
  reported not fatal, Deleted rows never resurrected).
- Exams: `unpublish` (D2: existing sessions keep snapshots), `reorder`
  (full-order replace of `ExamQuestion.SortOrder`), `preview` (student view).
- Domain additions (pure code, zero schema impact): `Question.Unpublish()`,
  `Question.SetYear()`, `Exam.Unpublish()`.

### Phase D — Stats + Sweeper + Heartbeat (commit 4)
- **D.1** `GET /admin/exams/{id}/stats` — started/attempts (scored = Completed+
  TimedOut)/completed/timeouts/inProgress/cancelled/pass/fail/mean/median/
  avgDurationSeconds/decile distribution. Scope-checked (`exam` entity).
- **D.2** `GET /admin/exams/{id}/question-stats` — per composed question:
  attempts, correct%, mostCommonWrongChoice (option-letter rendered when
  resolvable), avgDurationSeconds, problematicFlag (attempts≥10 && correct<40%).
- **D.3** `CMS.Api/BackgroundServices/ExamTimeoutSweeper` — plain BackgroundService
  (Hangfire stays UNWIRED per ruling), 30s loop + 45s initial delay, batches of 50,
  reuses the single finalize path (`ExamQueryHandlers.FinalizeTimedOutSessionIfNeededAsync`
  made public for exactly this). Registered as HostedService in Program.cs.
  The Exam include was deliberately dropped from its query (scoring needs only
  SessionQuestions + AttemptLogs) so an orphaned session finalizes instead of
  silently vanishing (found via the new sweeper tests — see deviations).
- **D.4** `POST /api/v1/exams/sessions/{id}/heartbeat` — ownership + entitlement,
  lazy-finalizes an expired session, returns authoritative remainingSeconds.

### Phase E — DTO alignment (commit 5)
- `QuestionListItemDto` + `QuestionUsage` (string); `GET /questions?usage=practice|exam`
  filter (admits Both — D3).
- `ExamDto` / `ExamListItemDto` / `AdminExamListItemDto` + `ModelLetter` (A/B/C, D7).
- Admin reports list payload + `reportType` (D12).

### Phase F — Regression tests (commit 6, 18 new)
- `ExamCourseHandlersTests` (6): create validation, publish gating, bank-only/
  same-subject/unique add, reorder, remove+soft-delete, student fail-closed gate.
- `PracticeHandlersTests` (4): idempotent start, grading+auto-complete+unfreeze,
  reset-all + progress accounting, foreign session/question rejection.
- `QuestionReportW14Tests` (4): ReportType persisted / default Other, resolve &
  reject persist resolver identity (controller-level with mocked permissions),
  bulk publish/archive + unknown-id reporting.
- `OfflineSyncOwnershipTests` (2): sync with a session owned by ANOTHER student →
  403 + audit + zero attempts recorded; future-dated answers rejected.
- `ExamTimeoutSweeperTests` (2): finalizes ONLY expired InProgress sessions
  (Completed/TimedOut/Cancelled untouched); idempotent second run.

## ─── §10 DEVIATIONS / DISCLOSURES ────────────────────────

1. **D.4 LastAccessedAt NOT persisted** — `ExamSession` has no such column and W14.2
   is migration-frozen (§3). Heartbeat therefore validates ownership + lazily
   finalizes + returns remaining seconds; expiry authority is `ExpiresAt` (sweeper),
   not last-access. Adding the column is a candidate for W14.3.
2. **A.2 extended wave-wide (90 sites, 13 controllers)** — the brief listed 4 sites;
   the hard constraint said EVERY 403. All bare `Forbid()` now carry ProblemDetails
   detail (single generic Arabic reason per controller family; per-site reasons
   remain a future polish).
3. **C.2 `PUT /admin/exams/{id}/reorder` = question-order replace** — the brief did
   not specify the reorder target; exam SortOrder is already editable via
   UpdateExamCommand, so the endpoint reorders the exam's `ExamQuestion` rows
   (full-list replace, partial orders rejected).
4. **Sweeper skips the Exam include** (see D.3) — surfaced by the new tests: with
   EF InMemory, `Include(Exam)` over a missing principal silently drops the row.
   Production data always has the principal; the sweeper is now orphan-proof.
5. **Practice auto-complete** — the brief defines no "complete practice" endpoint;
   the session auto-completes (Score frozen, D13) when every composed question
   carries a graded answer; reset paths unfreeze it.
6. **B.4 list scope model** — super admin sees all reports; a scoped admin is
   narrowed by SubjectId; a scoped admin with NO academic scope gets a
   ProblemDetails 403 (fail-closed, mirrors ApplyScopeAsync).
7. **ExamCourse soft-delete = Status=Deleted** — `ExamCourse : BaseEntity` has no
   DeletedAt column (W14.1 shape), so soft delete is status-based. No migration.
8. **Duplicate question copies text/options/images/metadata but not `TextHtml`** —
   no domain setter exists for `Question.TextHtml` today (write-legacy field);
   flagged for W14.3 if the HTML editor needs it.

## ─── Out of scope / untouched (§12) ──────────────────────
- No frontend changes (admin-web / student-web untouched). No lockfile changes.
- ZERO migrations — snapshot untouched; EF parity tool-proven after every commit.
- Hangfire remains package-only (unwired) per the BackgroundService ruling.
- Vercel/Render/Neon/Upstash credentials shared in chat: NOT used, NOT stored.
  **SUPERVISOR ACTION (still outstanding since W14.1): rotate all of them + the
  two account passwords — they were pasted in plaintext.**

## ─── git log (this branch) ───────────────────────────────
6 commits on `feat/14.2-backend-api` (base `87d93d5`).
STOP GATE: push requires supervisor approval (§2) + PAT.
