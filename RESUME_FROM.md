# RESUME_FROM — next session start point

- **Branch**: `feat/14.1-data-foundations` (1 commit, LOCAL — do NOT push without supervisor approval, §2).
- **Base**: main @ `65a2e50` (PR #69 merged; all prior waves closed/deployed).
- **State**: Wave 14.1 (Data Model Foundations) implemented per PART I —
  entities `ExamCourse` / `ExamCourseItem` / `PracticeSession` / `PracticeAnswer`
  (D1/D6/D13), `Question.QuestionUsage` (D3), `Exam.ModelLetter` (D7),
  `ErrorReport.ReportType` (D12), EF config + hand-authored migration
  `20261116120000_AddWave14ExamsRework` + snapshot extended in the same commit,
  TODO(W14.2) markers on the two legacy read-path filter sites, idempotent Neon
  SQL mirror at `scripts/migrations/Wave14ExamsRework.sql`.
- **Verification (in-sandbox, .NET 9.0.320)**: dotnet build 0 errors ·
  dotnet test 619/619 passed (27 skipped Testcontainers, same as baseline) ·
  `dotnet ef migrations has-pending-model-changes` → "No changes" (snapshot parity
  tool-proven). Deviations from the PART I brief are ALL disclosed in
  WIP_STATUS.md → "Deviations" (Exam file location, ErrorReport.QuestionId
  pre-existing, index supersession, chosen FK behaviors, FreeOrPaid semantics,
  Semester as int).
- **Next round (W14.2)**: supervisor review of this branch → push approval →
  PR + CI + merge + Render deploy (migration applies during deploy — verify
  `exam_courses`, `exam_course_items`, `practice_sessions`, `practice_answers`
  exist in Neon and `questions.question_usage`/`error_reports.report_type`
  backfills landed). THEN Wave 14.2 = API logic (ExamCourse endpoints, D3
  filtering, D5 admin editor backend, D12 report submission), removal of the two
  TODO(W14.2) legacy read paths.
- **Environment note**: this sandbox HAS the .NET 9 SDK at `/home/z/.dotnet`
  (`export PATH=/home/z/.dotnet:$PATH`); dotnet-ef 9.0.22 restores from
  `.config/dotnet-tools.json`. No Docker → 27 Testcontainers tests skip (expected).
