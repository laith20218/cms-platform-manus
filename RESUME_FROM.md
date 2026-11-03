# RESUME_FROM — next session start point

- **Branch**: `feat/14.4-student-ui` (5 commits, LOCAL — do NOT push without
  supervisor approval, §2). Base: main @ `8f562e18` (PR #72, W14.3 merged).
  Sandbox clone: `/home/z/cms-platform-manus` (fresh-sandbox re-clone; the old
  `/home/z/cms-work` path is GONE. Token scrubbed from `.git/config` after
  clone, §5 — verified no residual credentials in the remote URL).
- **State**: Wave 14.4 (Student UI Completeness) is COMPLETE — 5 of 5 planned
  commits, all verified. This includes the crash-recovery continuation session
  (previous session died on a 600 s environment timeout during Commit 5;
  Commits 1–4 were verified intact by SHA before continuing).
- **Commit SHAs (local, oldest→newest)**: `db35599` (exams entitlement: any
  subject grant) → `641ccee` (exam courses UI + categorized practice tree,
  backend `GET /practice/categorized/{subjectId}`) → `06a6bf1` (PracticePage
  with immediate feedback + D13 resets) → `54d9bcc` (results v2 + share
  removed + SecurityWrapper on Question/Exam/Review pages) → `<HEAD>`
  (§13 evidence + WIP_STATUS).
- **Verification (final tree, all green)**: tsc -b 0 errors · eslint
  (`eslint . --ext ts,tsx --max-warnings=0`) exit 0 · vitest 379/379 (30
  files — student-web package; the admin-web "58/58" baseline is a different
  suite) · vite build PASS · dotnet build 0 errors (20 pre-existing warnings)
  · dotnet test 663/0/27 skipped (Testcontainers, no Docker; 637 baseline +
  26 new W14.4 API tests) · `CMS_EF_CONNECTION=… dotnet ef migrations
  has-pending-model-changes` → "No changes" (§3 honored — no migrations, no
  lockfiles).
- **§13 evidence**: `apps/student-web/e2e/w14.4-student-ui.e2e.mjs` +
  `w144-mock-world.mjs` — **49/49 checks**: 6 surfaces × 5 widths
  (375/414/768/1024/1440) zero-h-scroll (scrollableDelta truth), 12 axe-core
  scans 0 critical/serious, exam golden path (start → answer → submit →
  results v2 with retake/attempts/strong-topics), practice immediate-feedback
  + reset flows, share-removed + watermark-mounted, peak Chromium RSS 917 MB
  < 1.6 GB, 0 console errors. 36 screenshots committed at
  `apps/student-web/e2e/screenshots/w14.4-*.png` (admin-web precedent;
  `.gitignore` un-ignores only `w14.4-*.png`). RTL diff-grep vs base: 0 new
  directional utilities.
- **Commit-5 fixes disclosed** (W14.3 evidence-commit precedent): 9 axe
  color-contrast serious failures fixed with one-token swaps — new AA steps
  `--cms-{success,warning,danger}-700` in `globals.css` (#047857/#92400e/
  #b91c1c light + luminous dark aliases; measured failures 3.58:1/3.07:1/
  4.42:1 on the 50-tints) applied across ExamCoursesPage (tab pill → teal-800,
  Badge tones), ExamCourseDetailPage (3 badges), ExamPage results v2 (6 spots),
  QuestionPage (index box, tag/difficulty badges, correct/incorrect chips);
  plus the harness's untagged-bucket testids corrected to the committed
  component contract (`lecture-accordion-uncategorized` /
  `start-practice-uncategorized-untagged`, accordion clicked open first).
  Commits 1–4 were NOT amended (frozen per the resume brief).
- **Next (STOP GATE → supervisor)**:
  1. Supervisor reviews the 5 local commits + this evidence pack.
  2. Push approval → `git push -u origin feat/14.4-student-ui` (PAT inline, §5,
     triple-scrub) → PR → CI green → merge.
  3. Rotate the chat-pasted credentials (GitHub PAT, Vercel ×2, Neon key,
     Upstash blob token, Render key, both account passwords) — outstanding
     since W14.1.
- **Verification commands** (repro): `pnpm --filter @cms/student-web exec tsc -b`
  · `pnpm --filter @cms/student-web lint` · `pnpm --filter @cms/student-web
  test` · `pnpm --filter @cms/student-web build` · `export
  PATH=/home/z/.dotnet:$PATH && cd apps/api && dotnet build CMS.sln && dotnet
  test CMS.sln --no-build` · `CMS_EF_CONNECTION="Host=localhost;Database=d;
  Username=ef;Password=ef" dotnet ef migrations has-pending-model-changes
  --project src/CMS.Infrastructure --startup-project src/CMS.Api` ·
  e2e (single command, sandbox kills background servers):
  `cd apps/student-web && (./node_modules/.bin/vite --host 127.0.0.1 --port
  5173 > /tmp/vite.log 2>&1 &) && sleep 8 && node
  e2e/w14.4-student-ui.e2e.mjs` (kills any stale vite first:
  `pkill -f "student-web.*vite"`).
- **Environment note**: sandbox has NO Docker (27 Testcontainers tests skip,
  expected); dotnet SDK 9.0.320 at /home/z/.dotnet; Playwright Chromium at
  `/home/z/.cache/ms-playwright/chromium-1200/`; the Next.js scaffold at
  /home/z/my-project is UNRELATED to this repo.
