# WIP_STATUS — feat/14.4-student-ui (Wave 14.4: Student UI Completeness)

## ─── STATE ───────────────────────────────────────────────
Wave 14.3 is MERGED (main @ `8f562e18`, PR #72). This branch implements Wave 14.4
(the student UI consuming the W14.2 APIs) — apps/student-web + focused API fixes;
NO migrations, NO lockfile changes (§3 honored — verified
`dotnet ef migrations has-pending-model-changes` → "No changes").
**5 of 5 commits DONE (LOCAL ONLY — push requires supervisor approval, §2).**

Session-recovery note: the previous session crashed on an environment timeout
(600 s, background vite) DURING Commit 5. This continuation session verified
Commits 1–4 intact (SHAs match the resume brief exactly), completed the §13
evidence pass (fixing 9 axe color-contrast failures + 1 harness testid bug
found by the crashed session's first 39/49 run), and landed Commit 5.

Verification ladder (final tree, in-sandbox, pnpm 9.12.0 / node 24 / .NET 9.0.320):
**tsc -b 0 errors · eslint (`eslint . --ext ts,tsx --max-warnings=0`) exit 0 ·
vitest 379/379 (30 files) · vite build PASS · dotnet build 0 errors (20
pre-existing warnings) · dotnet test 663/663 passed, 0 failed, 27 skipped
(Testcontainers — no Docker; 637 at the W14.3 baseline + 26 new W14.4 API
tests) · `dotnet ef migrations has-pending-model-changes` → "No changes" ·
§13 e2e 49/49 checks (12 axe scans 0 critical/serious, 30 zero-h-scroll gates,
peak Chromium RSS 917 MB < 1.6 GB, 0 console errors) · RTL diff-grep 0 new
directional utilities.**

## ─── COMMITS (this branch, oldest → newest) ──────────────
1. `db35599` fix(api): allow any subject grant to access exams
2. `641ccee` feat(student): exam courses UI + categorized practice tree
3. `06a6bf1` feat(student): practice flow with reset (D13)
4. `54d9bcc` feat(student): results v2 + content protection (D9, security)
5. `<HEAD>`  test(student): §13 evidence + WIP_STATUS (W14.4)
   Base: main @ `8f562e18` (PR #72, W14.3 merged).

## ─── WHAT WAS IMPLEMENTED ────────────────────────────────

### Commit 1 — Phase 0: exams entitlement widened (db35599)
- **`ExamHandlers.cs`** (+15/−3): the exam session endpoints (start/question/
  submit/results) accepted ONLY `QuestionsExams` grants; now ANY valid subject
  grant (`VideoAudio` / `LecturesText` / `QuestionsExams` / `FullSubject` /
  `FullYear`) authorizes, matching the rest of the storefront. Entitlement
  services (`SignedEntitlementService`/`EntitlementService`) unchanged in
  contract — the grant-kind gate moved to the exam handlers.
- **`ExamEntitlementAnyGrantW144Tests.cs`** (new, 145 lines): per-grant-kind
  matrix + denied-without-grant + expired-token cases.
- `ExamLifecycleHandlerTests.cs`: 4 lines adapted to the widened policy.

### Commit 2 — Phase A: exam courses storefront + categorized tree (641ccee)
- Backend: `GET /practice/categorized/{subjectId}` (PracticeController +47,
  PracticeCommands +43, PracticeDtos +90, PracticeHandlers +372) — tree built
  from `Question.LectureId` + `ParagraphTag`; double-null → «غير مصنف» bucket
  (lecture `lectureId:null`, group `paragraphTag:null`), untagged lectures
  sorted LAST; `POST /practice/categorized/{subjectId}/start` honors
  lectureId/paragraphTag/untagged filters. `StudentExamCourseHandlers` (+8):
  any-grant access (same policy as Commit 1). Tests:
  `PracticeCategorizedW144Tests` (288), `ExamCourseStorefrontAnyGrantW144Tests`
  (89).
- Frontend: sidebar tab «الدورات الامتحانية» (entitled-only, +30);
  **`ExamCoursesPage.tsx`** (new, 530) — year (defaults to the student's
  latest round year)/semester/subject filters + dual tabs: «دورات سنوات»
  (`GET /exam-courses/subject/{id}?year=&semester=` → cards) and «دورات مصنفة»
  (lecture→paragraphTag accordions, «ابدأ التدريب» per group);
  **`ExamCourseDetailPage.tsx`** (new, 167) — bundle exams with تدريب/اختبار
  entries + attempt-state badges; `exam-courses-api.ts` (85), `practice-api.ts`
  (206); `exam-courses.test.tsx` (189).

### Commit 3 — Phase B: practice flow with reset, D13 (06a6bf1)
- **`PracticePage.tsx`** (new, 683): PracticeSession runner — option select →
  POST answer → immediate correctness + explanation + reference; progress bar
  «أجبت X من Y»; إعادة ضبط السؤال (single) + إعادة ضبط الكل (D13 resets,
  both hitting the reset endpoints); untagged-lecture/untagged-tag URL params.
- Backend: `PracticeDtos`/`PracticeHandlers` (+8/+18) expose answeredCount/
  reset semantics; `practice-page.test.tsx` (202) + 35 more lines of
  `PracticeCategorizedW144Tests`.

### Commit 4 — Phase C: results v2 + content protection, D9 (54d9bcc)
- **Results v2 (D9)**: `ExamDtos` (+23) v2 fields (strongTopics, attempts
  history, comparison, remainingAttempts); `ExamHandlers` (+44) — wrong count
  now comes from the BACKEND value (was client-miscounted), strong/weak topics
  from ParagraphTag accuracy, attempt history. `ExamPage.tsx` (65): score ring
  + metric grid + مقارنة + المواضيع الأقوى/الأضعف + سجل المحاولات + إعادة
  المحاولة (remaining-attempts aware). `exam-results-v2.test.tsx` (173) +
  `ExamResultsV2W144Tests` (132).
- **Protection (security)**: QuestionPage share action REMOVED (C.2);
  `SecurityWrapper` watermark mounted on QuestionPage/ExamPage/ExamReviewPage
  (C.3); `useContentProtection` hardened (+4).

### Commit 5 — §13 evidence + docs (this commit)
- **`e2e/w14.4-student-ui.e2e.mjs` + `e2e/w144-mock-world.mjs`** (new): the
  §13 harness — real vite dev server + mocked API (context.route interception,
  STUDENT seeding: cms-access-token + /auth/me + signed-shaped entitlement),
  ONE Chromium (RSS sampled at 400 ms, ceiling 1.6 GB), fail-visible aborts on
  unmocked /api/v1/**. 49 checks: 6 surfaces × 5 widths (375/414/768/1024/1440)
  screenshot + strict h-scroll gates (scrollableDelta truth — W14.3 finding),
  12 axe-core scans (wcag2a/aa + wcag21/22aa) 0 critical/serious, golden-path
  exam run (start → answer → submit → results v2), practice immediate-feedback
  + reset flows, share-removed + watermark-mounted assertions.
- **§13 contrast fixes** (first run surfaced 9 axe color-contrast serious
  failures across the W14.4 surfaces — same defect class as the W14.3 shell
  fixes; all fixed with one-token swaps, zero layout change):
  - `globals.css`: added the AA text steps `--cms-success-700` #047857,
    `--cms-warning-700` #92400e, `--cms-danger-700` #b91c1c (light) + luminous
    dark aliases — measured failures: #059669 on #ecfdf5 = 3.58:1, #d97706 on
    #fffbeb = 3.07:1, #dc2626 on #fef2f2 = 4.42:1; the new steps measure
    5.21:1 / 6.84:1 / 5.91:1. Same documented pattern as the W12.2.D teal-800
    step (teal-700 on teal-50 = 4.26:1 — that finding reused directly).
  - `ExamCoursesPage`: active-tab pill icon+label → teal-800; Badge
    success/warning tones → 700 steps.
  - `ExamCourseDetailPage`: مدفوعة/مجانية, محاولة جارية, مكتملة → 700 steps.
  - `ExamPage` (results v2): score label, مقارنة «الأعلى», attempt score %,
    «هذه المحاولة» (→ teal-800), «انتهى الوقت», «نجاح» → 700 steps.
  - `QuestionPage`: header index box (3 states), tag badges (→ teal-800),
    difficulty badge (3 states), «صحيح!/خاطئ» chips → 700 steps.
- **Harness bug fixed** (disclosed): the crashed session's check expected
  `lecture-accordion-untagged` / `start-practice-untagged-untagged`, but the
  committed Commit-2 component contract is
  `lecture-accordion-uncategorized` / `start-practice-uncategorized-untagged`,
  and the accordion must be opened before counting group rows. The HARNESS was
  fixed to match the component — Commits 1–4 untouched (frozen per the resume
  brief).
- **Screenshots committed** (admin-web/Wave-13.1a2 precedent; `.gitignore`
  un-ignores `w14.4-*.png` only): 36 artifacts — examcourses-years ×5,
  examcourses-categorized ×5, coursedetail ×5, practice ×5, practice-feedback
  ×1 (@1440), exam-running ×5, exam-results ×5, question ×5.

## ─── DISCLOSED DEVIATIONS ────────────────────────────────
1. **Categorized fields**: built from the EXISTING `Question.LectureId` +
   `ParagraphTag` fields; the multi-section `Sections` field stays deferred to
   W14.5 (per the brief — no schema change, §3).
2. **Commit 5 carries source fixes**: the axe gate surfaced contrast defects in
   the Commit-2/3/4 surfaces; §8 (WCAG 2.2 AA) is binding, so the one-token
   color swaps ride in Commit 5 rather than amending frozen commits (W14.3
   precedent: evidence-commit shell fixes, disclosed in the worklog).
3. **Test-count baselines** (both green, both explained): student-web vitest is
   379/379 (the W14.3 "58/58" figure was the admin-web package — different
   suites); dotnet moved 637 → 663 (26 new W14.4 API tests, all passing).

## ─── NEXT (post-push approval) ────────────────────
1. Supervisor reviews the 5 local commits → push approval → `git push -u
   origin feat/14.4-student-ui` (PAT inline, §5, triple-scrub) → PR → CI green
   → merge.
2. Rotate the chat-pasted credentials (GitHub PAT, Vercel ×2, Neon, Upstash
   blob, Render, both account passwords) — outstanding since W14.1.
- **Environment note**: sandbox has NO Docker (27 Testcontainers tests skip,
  expected); dotnet SDK 9.0.320 at /home/z/.dotnet (export
  PATH=/home/z/.dotnet:$PATH); fresh-sandbox clone at
  /home/z/cms-platform-manus (old /home/z/cms-work is GONE); the Next.js
  scaffold at /home/z/my-project is UNRELATED to this repo.
