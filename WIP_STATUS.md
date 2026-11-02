# WIP_STATUS — main @ 65a2e50 → feat/14.1-data-foundations (Wave 14.1: Data Model Foundations)

## ─── STATE ───────────────────────────────────────────────
Waves 11.x, 12.x, 13.x are CLOSED and deployed (main @ 65a2e50, PR #69 merged).
R75 DIAG ACCEPTED — the 13 decisions D1–D13 are LOCKED and drive this wave.

Verification ladder (this wave, in-sandbox — .NET 9 SDK 9.0.320 PRESENT, unlike
Phase61/62): **dotnet build 0 errors** · **dotnet test 619/619 passed, 0 failed,
27 skipped (Testcontainers — no Docker in sandbox; same 27 as the 12.5 baseline)** ·
**`dotnet ef migrations has-pending-model-changes` → "No changes"** (hand-edited
snapshot verified semantically identical to the live model by the tool itself).

## ─── WAVE 14.1 — IMPLEMENTED (this branch, 1 commit, NOT pushed) ───
Backend ONLY. No API endpoints touched. No business logic. Entities + EF config +
one hand-authored migration + two TODO markers + docs.

### What was added

1. **New entities (one file each, FileBookmark 12.5.B style — public setters,
   EF materialization ctor, XML docs):**
   - `CMS.Domain/Entities/ExamCourse.cs` (D1) — SubjectId FK, NameAr/NameEn,
     Description?, CoverUrl?, Year (int, `Exam.Year` convention), Semester (int
     number), CourseType (`ExamCourseType`: First/Second/Supplementary/Model/Practice),
     FreeOrPaid (bool — **true = paid**, false = free), SortOrder, Status (ContentStatus).
   - `CMS.Domain/Entities/ExamCourseItem.cs` (D1/D6) — join row; (ExamCourseId,
     ExamId) UNIQUE; both FKs cascade.
   - `CMS.Domain/Entities/PracticeSession.cs` (D13) — StudentId, ExamModelId,
     StartedAt, LastAccessedAt, Score?, Status (`PracticeSessionStatus`:
     InProgress/Completed).
   - `CMS.Domain/Entities/PracticeAnswer.cs` (D13) — PracticeSessionId, QuestionId,
     SelectedAnswer?, IsCorrect? (NULL = ungraded), AnsweredAt.
2. **New enums** — `CMS.Domain/Enums/Wave14Enums.cs`: `ExamCourseType`,
   `QuestionUsage` (Practice/Exam/Both, default Both — D3), `PracticeSessionStatus`,
   `ReportType` (Typo/WrongAnswer/BadImage/Other — D12). All stored as plain int
   (repo convention, zero HasConversion anywhere).
3. **Modified entities:**
   - `Question.QuestionUsage` (D3) — private set + initializer Both; `Create()` NOT
     signature-changed (§12: no API logic).
   - `Exam.ModelLetter` (D7) — `char?`, NULL for normal exams.
   - `ErrorReport.ReportType` (D12) — initializer Other.
4. **EF config** — `ApplicationDbContext.cs` + `IApplicationDbContext.cs`: 4 new
   DbSets; fluent blocks; FK behaviors per spec: PracticeSession→students CASCADE,
   PracticeAnswer→practice_sessions CASCADE, ExamCourse→subjects RESTRICT. Extra
   indexes: exam_courses(subject_id, year, semester) for D4 filters,
   practice_sessions(student_id, status), practice_answers(session, question),
   error_reports(question_id, status) per spec.
5. **Migration `20261116120000_AddWave14ExamsRework`** — hand-authored, attributes
   on the class, NO Designer (Phase61/62 precedent); snapshot hand-extended in the
   SAME commit (repo ruling: next tool migration must diff cleanly). Creates ONLY
   new tables/columns; backfills: questions.question_usage=2 (Both),
   error_reports.report_type=3 (Other). Idempotent SQL mirror for Neon:
   `scripts/migrations/Wave14ExamsRework.sql`.
6. **P0 legacy read path — documentation only (2.E):** TODO(W14.2) markers at
   `QuestionHandlers.cs:43-47` (GetQuestionsQuery ExamId filter) and
   `OfflineHandlers.cs:86-89` (offline package exam filter). Logic UNCHANGED.

### §13 evidence (this wave)

- `dotnet build CMS.sln` → 0 errors (19 pre-existing CS0618/CS86xx warnings, ALL in
  CMS.Tests which is historically exempt from TreatWarningsAsErrors; zero in the
  4 product projects).
- `dotnet test CMS.sln` → Passed! Failed: 0, Passed: 619, Skipped: 27, Total: 646 —
  identical counts to the last recorded green ladder (W12.5: 619/619, 27 skipped).
- `dotnet ef migrations has-pending-model-changes` (pinned local tool 9.0.22 via
  `.config/dotnet-tools.json`) → "No changes have been made to the model since the
  last migration." — proves snapshot ↔ model parity without human eyeballing.
- Migration ID 20261116120000 sorts AFTER 20261115120000_Phase62 (apply order safe).

### Deviations from the PART I brief (§10 disclosure — all spec-vs-origin conflicts,
### resolved per §9 ground truth)

1. **`Exam` is NOT in `ExamLifecycleEntities.cs`** — it lives in
   `QuestionEntities.cs:241-400` (that file only holds ExamQuestion/ExamSessionQuestion).
   `ModelLetter` was added where Exam actually is.
2. **`ErrorReport.QuestionId` ALREADY EXISTS** (required FK + navigation, Phase59 —
   `OperationalEntities.cs:232`). The brief said "add QuestionId (nullable)" — NOT
   duplicated; this wave adds only `ReportType` + the (question_id, status) index.
3. **Index consequence:** adding the (QuestionId, Status) composite makes EF's
   ForeignKeyIndexConvention DROP the conventional single-column
   `ix_error_reports_question_id` (same leading column) — migration therefore does
   DropIndex + CreateIndex; snapshot updated to match (tool-verified).
4. **One commit, not the repo's usual multi-commit-per-wave map** — supervisor's
   brief wins (§12). WIP_STATUS/RESUME_FROM updates ride inside the single commit.
5. **FK behaviors chosen where the brief was silent (reviewable):**
   ExamCourseItem→exam CASCADE (join row meaningless alone),
   PracticeSession→exam RESTRICT (protect history, D2 spirit),
   PracticeAnswer→question RESTRICT (same), ErrorReport→question stays CASCADE
   (pre-existing Phase59 behavior, untouched).
6. **`FreeOrPaid` semantics:** bool per brief; documented as **true = paid**,
   false = free (default). If the supervisor intended the inverse, it is a
   one-line entity + comment change before push.
7. **`Semester` is a plain int** (semester number 1..3) per the brief's "Year,
   Semester" — NOT an FK to the `semesters` lookup table. Flag for 14.2 if D4
   filter joins need the lookup.
8. **Sandbox bonus:** dotnet build/test/ef-parity actually EXECUTED here (Phase61/62
   could not — no SDK). New-column defaults are backfill-only (no HasDefaultValue in
   fluent/snapshot), matching the Phase62 `enable_scripts` precedent.

### Out of scope / untouched (§12)

- No API endpoints, no handlers logic, no DTOs, no frontends, no new tests beyond
  existing suites (entity-only wave; handler tests come with 14.2 logic).
- Vercel/Render/Neon/Upstash credentials shared in chat: NOT used, NOT stored.
  **SUPERVISOR ACTION: rotate all of them + the two account passwords — they were
  pasted in plaintext.**

## ─── git log (this branch) ───────────────────────────────

1 commit on `feat/14.1-data-foundations`; STOP GATE: push requires supervisor
approval (§2). Migration applies on Render deploy ONLY — the Neon SQL mirror is
for supervisor-run application/review, never the CI path.
