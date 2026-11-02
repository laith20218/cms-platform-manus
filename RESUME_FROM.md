# RESUME_FROM — next session start point

- **Branch**: `feat/14.2-backend-api` (6 commits, LOCAL — do NOT push without
  supervisor approval, §2). Base: main @ `87d93d5` (PR #70, W14.1 merged).
- **State**: Wave 14.2 (Backend API Completeness) implemented per PART I —
  Phase A R75 P0/P1/P2 (offline sync ownership + snapshot grading + tamper
  replacement, 403→ProblemDetails wave-wide, legacy `Question.ExamId` reads
  retired via ExamQuestion join, AdminExams double auth, TryParse guards,
  "exam-session" rate limiter) · Phase B domain APIs (ExamCourse admin+student,
  Practice D13, Reports D12) · Phase C missing admin endpoints (questions
  duplicate/unpublish/preview/bulk, exams unpublish/reorder/preview) · Phase D
  (per-exam + per-question stats, ExamTimeoutSweeper BackgroundService, exam
  heartbeat) · Phase E DTO alignment (QuestionUsage / ModelLetter / ReportType) ·
  Phase F 18 new regression tests + this file + WIP_STATUS.
- **Verification (in-sandbox, .NET 9.0.320 at /home/z/.dotnet — reinstall with
  `bash /tmp/dotnet-install.sh`-style script if a fresh sandbox loses it;
  `export PATH=/home/z/.dotnet:$PATH`; design-time EF needs
  `ConnectionStrings__PostgreSQL` env var)**: dotnet build 0 errors ·
  dotnet test **637/637 passed (27 skipped Testcontainers, same as baseline)** ·
  `dotnet ef migrations has-pending-model-changes` → "No changes" after EVERY commit.
- **Commit SHAs (local, oldest→newest)**: `0639228` → `af9dcb9` → `f74c102` →
  `2875017` → `515cc4f` → `<HEAD>` (see WIP_STATUS for the map + endpoint list).
- **Deviations (ALL disclosed, review before push)**: WIP_STATUS §10 items 1–8 —
  headline: heartbeat does NOT persist LastAccessedAt (no column, §3 freeze);
  A.2 was extended to all 90 bare-Forbid sites per the "every 403" constraint;
  exam reorder = question-order replace; sweeper drops the Exam include
  (orphan-proof, found via tests); practice auto-completes on full grading.
- **Next round (STOP GATE → supervisor)**:
  1. Supervisor reviews this branch (esp. the 90-site 403 sweep + deviations).
  2. Push approval → `git push -u origin feat/14.2-backend-api` (PAT inline, §5,
     triple-scrub) → PR → CI green → merge → Render deploy (NO migration runs
     this wave — verify `exam_courses` etc. UNCHANGED in Neon after deploy).
  3. Rotate the chat-pasted credentials (Vercel ×2, GitHub PAT, Neon key,
     Upstash blob token, Render key, both account passwords) — outstanding
     since W14.1.
  4. THEN Wave 14.3 candidates (not committed): ExamSession.LastAccessedAt
     column (heartbeat durability), Question.TextHtml domain setter, D5/D7/D8
     frontend waves, Question.ExamId column drop (A.3 follow-up).
- **Environment note**: this sandbox has NO Docker (27 Testcontainers tests skip,
  expected) and NO dotnet on PATH by default — the SDK was installed to
  /home/z/.dotnet during this wave.
