# WIP_STATUS — feat/14.3-admin-ui (Wave 14.3: Admin UI Completeness)

## ─── STATE ───────────────────────────────────────────────
Wave 14.2 is MERGED (main @ `8d12a6d`, PR #71). This branch implements Wave 14.3
(the admin UI consuming the W14.2 APIs) — **apps/admin-web + ONE supervisor-
approved backend exception (R78)**; NO migrations, NO schema changes (§3 honored).
**5 of 5 commits DONE (LOCAL ONLY — push requires supervisor approval, §2).**

Verification ladder (final tree, in-sandbox, pnpm 9.15.9 / node 24 / .NET 9.0.320):
**tsc -b 0 errors · eslint 0 errors + 31 warnings IDENTICAL to the origin/main
baseline (touched files 0/0) · vitest 58/58 · vite build PASS · dotnet build
0 errors (20 pre-existing warnings, all CMS.Tests) · dotnet test 637/637 passed,
0 failed, 27 skipped (Testcontainers — no Docker; same 27 as the W14.2 baseline) ·
`dotnet ef migrations has-pending-model-changes` → "No changes" · §13 e2e
26/26 checks (7 axe scans 0 critical/serious, peak Chromium RSS 953 MB < 1.6 GB)**.

## ─── COMMITS (this branch, oldest → newest) ───────────────

1. `7dfd7e5` feat(admin): shared URL-persisted academic context (D4)
2. `b9811db` feat(admin): tabbed question editor + image upload + missing actions (D5)
3. `6c9bdc8` feat(api): admin exam-courses list endpoint (W14.3 exception) — R78 commit 3a
4. `9f43d79` feat(admin): ExamCourses management screen (D1) — R78 commit 3b
5. `a0b1436` feat(admin): exam stats dashboard + question reports UI (D10, D12)
6. `<HEAD>`  test(admin): §13 evidence + WIP_STATUS (W14.3)

## ─── WHAT WAS IMPLEMENTED ────────────────────────────────

### Commit 1 — D4: shared URL-persisted academic context
- **`src/lib/academicContext.ts`** (new): `useAcademicContext()` hook over
  react-router `useSearchParams` (router 7.18.2). Params `univ/college/year/
  semester/subject`; downstream-reset semantics preserved (chooseUniversity
  clears the rest, …); empty params are deleted from the URL; writes use
  history `replace`; `hydrate()` (bulk, no clearing) + `clear()`.
- **`src/main.tsx`**: wraps `<App/>` in `<BrowserRouter>` (provider for the hook).
- **QuestionsCenter / ExamsCenter / AcademicCenter**: the five per-center
  `useState` ids replaced by the hook; cascade list-fetching stays per-center;
  all three hydrate the cascade from the URL on mount (new for Exams/Academic);
  QuestionsCenter's legacy localStorage sticky migrates into the URL once and
  now keeps only editor defaults ("Save & Add Another" behavior unchanged);
  AcademicCenter `resetBelow` is list-clearing only (ids live in the URL);
  subject switch clears the bulk selection.
- **`src/test/academicContext.test.tsx`** (new): 8 tests — URL read, defaults,
  cascade writes, hydrate-merge, clear (foreign params preserved), and the
  A.3 cross-consumer guarantee (a second consumer of the same router sees the
  selection the first wrote = center-switch preservation).

### Commit 2 — D5 + R75 C2 + B.3 + B.4 (QuestionsCenter)
- **B.1 (D5) Tabbed editor**: 4 tabs (المحتوى / الشرح والمراجع / التصنيف والوسوم /
  الإعدادات) with `role=tablist/tab` + `aria-selected`; one Save persists all
  tabs. Hidden-tab fields can't be HTML5-validated → `doSubmit` validates
  manually and jumps to the offending tab. Difficulty moved to التصنيف per the
  brief; usage snapshot (attempts / correct-rate) on التصنيف for edits;
  publish-status badge on الإعدادات.
- **B.2 (R75 C2) Option images**: per-option attach — upload through the
  EXISTING library presign flow (`POST /api/v1/library/upload-url` type Image →
  browser PUT → `POST /api/v1/library/complete-upload`) or paste a public URL;
  `imageUrl` now rides create/update option payloads (was hardcoded `null`).
  ⚠️ `VITE_R2_PUBLIC_BASE` env: when unset, upload completes but the attachment
  fails VISIBLY with guidance — students render `<img src>` with no auth
  header, so the stored value must be publicly fetchable (deployment decision).
- **B.3 Missing actions** (all W14.2 endpoints): معاينة (GET /admin/questions/{id}/preview
  → modal, student view: no correctness flags, question + option images),
  تكرار (POST duplicate → reload), إلغاء النشر (POST unpublish; confirm dialog
  variant + editor action-bar shortcut), إجراءات جماعية (select-all/row
  checkboxes → toolbar → POST bulk-publish / bulk-archive body `{ids}`, notice
  "succeeded of requested"; selection cleared on subject switch).
- **B.4 "0%" bug**: `attemptsCount === 0` → «لا توجد محاولات بعد» replaces the
  misleading red 0% (also in the editor usage card).

### Commit 3a — R78 backend exception (supervisor-approved)
- **`AdminExamCoursesController.cs:44-64`**: `GET /api/v1/admin/exam-courses?subjectId=`
  — `[HttpGet]` + `[Authorize(Policy = Policies.ExamCourseView)]`; subject-scope
  check (`CanManageSubjectAsync(Actions.View, …)`) applied ONLY when the optional
  filter is provided (same pattern as DashboardHandlers.cs:303); ordered
  `Year desc, Semester desc, SortOrder asc`. ~15 lines, read-only, zero schema change.
- **`ExamCourseDtos.cs:38`**: `ExamCourseListItemDto` record (application layer
  only) — the pre-existing `StudentExamCourseListItemDto` lacks `Status`, which
  the management list requires (ACCEPTED deviation, see §R78).
- Backend gates: dotnet build 0 errors · dotnet test 637/0/27 · ef
  has-pending-model-changes → "No changes".

### Commit 3b — D1: ExamCoursesCenter (الدورات الامتحانية)
- **`ExamCoursesCenter.tsx`** (new, ~1300 lines): list via the R78 endpoint;
  create/edit form (ar/en names, description, year, semester, type
  First/Second/Supplementary/Model/Practice, free/paid, sortOrder); cover image
  via the library presign flow or pasted URL (same VITE_R2_PUBLIC_BASE behavior
  as B.2); in-bundle exam management (add from subject bank, remove, reorder
  via PUT {examIds} full-list replace); student-storefront preview modal;
  publish/archive/delete with confirm dialogs.
- **App.tsx**: nav item «الدورات الامتحانية» rides `view:exams` via the new
  `NavItem.gateKey` (backend reuses exam verbs — registry stays v2, zero drift);
  academic cascade hydrates from the shared URL context (D4).

### Commit 4 — D10 + D12 (ExamsCenter)
- **Stats dashboard (D10)**: per-exam analytics (TrendingUp row action, replaces
  the list while open) — GET /admin/exams/{id}/stats summary cards
  (started/attempts/completed/in-progress/timed-out/cancelled), pass-vs-fail
  bar, mean/median scores, avg duration, decile score-distribution bars; the
  per-question stats table (GET /admin/exams/{id}/question-stats: attempts,
  color-coded %correct, most common wrong choice, avg time, problematic flag)
  with expandable question text and an Open-question-bank shortcut (D4 carries
  the subject across centers). Fresh exams show «لا توجد محاولات بعد» instead
  of misleading zeros (B.4 lesson); per-question %correct shows an em dash at
  0 attempts.
- **Question reports triage (D12)**: GET /admin/questions/reports with
  status/type filters (Pending/Reviewing/Resolved/Rejected/Closed ×
  Typo/WrongAnswer/BadImage/Other), expandable question text, description,
  screenshot link, Resolve/Reject with optional notes (PUT
  reports/{id}/resolve|reject) gated by `btn:questions.edit` to match the
  backend QuestionEdit policy.

### Commit 5 — §13 evidence + docs (this commit)
- **`e2e/w14.3-admin-ui.e2e.mjs`** + **`e2e/w143-mock-world.mjs`** (new): the
  §13 harness — real vite dev server + mocked API (`context.route`
  interception + seeded super_admin session), ONE Chromium, RSS ceiling 1.6 GB.
  26 checks: 3×5-width screenshot matrices (375/414/768/1024/1440), 7 axe-core
  scans (wcag2a/aa + wcag21/22aa), strict h-scroll gate (scrollableDelta=0)
  at every width, editor/picker/preview/notes-dialog flows. Full results:
  `worklog/wave14.3-evidence.md`.
- **§13 shell fixes** (disclosed in the worklog §2/§5): 8 pre-existing contrast
  failures on the evidenced pages fixed with one-token color swaps (sidebar
  role text 0.35→0.72 alpha, ⌘K hint, breadcrumb crumbs, exams-table thead +
  4 cell tones, stats-card labels) + flex-chain shrink rules (`.workspace`,
  `.topbar`, `.content` get `min-width:0`; topbar `overflow-x:clip`) +
  `[contain:paint]` on the 4 table wrappers (Chromium RTL scrollable-overflow
  quirk). Zero layout/design change.
- **Screenshots committed** (Wave 13.1a2 precedent, 1.8 MB): examcourses ×8
  (5 widths + editor/picker/preview @1440), examstats ×5, reports ×5,
  report-notes ×1.

## ─── §R78 — backend exception EXECUTED (was: §BLOCKER) ────
Phase C originally blocked: no admin list endpoint for exam-courses, and the
student list route 401s for admins (missing entitlement headers, unconditional).
R78 approved the minimal exception (~15 lines) and it landed as commit 3a
(`6c9bdc8`) exactly as specced: ExamCourseView policy, subject-scope check on
the optional filter, Year/Semester/SortOrder ordering, no migrations.
R78 also ACCEPTED the three deviations: per-question show-explanation omitted
(exam-level setting), VITE_R2_PUBLIC_BASE dependency, and the list-DTO shape
(new `ExamCourseListItemDto` — the existing student DTO lacks `Status`).

## ─── DISCLOSED DEVIATIONS (ALL supervisor-ACCEPTED via R78) ─
1. **D5 'show-explanation' per-question toggle NOT implemented** — no such
   per-question field exists; `ShowExplanations` is an EXAM-level column
   (`QuestionEntities.cs:294`, set via `ExamHandlers.cs`). The الإعدادات tab
   shows an honest pointer to the exam-level setting instead of a dead control.
2. **B.2 public-image-URL dependency** — `VITE_R2_PUBLIC_BASE` must be set in
   the admin-web deployment for uploaded option/cover images to resolve;
   upload-side works regardless (fails visibly without it).
3. **List-DTO shape** — R78 said "reuse the existing ExamCourseListItemDto";
   the existing list DTO is the STUDENT one and lacks `Status`, so a
   dedicated `ExamCourseListItemDto` record was added (application layer only).
4. **BrowserRouter added in main.tsx** — required by D4 (`useSearchParams`);
   app-boot tests untouched (login shell renders no centers) and stay green.

## ─── NEXT (post-push approval) ────────────────────────────
1. Push approval → `git push -u origin feat/14.3-admin-ui` (PAT inline, §5,
   triple-scrub) → PR → CI green → merge.
2. Deploy note: set `VITE_R2_PUBLIC_BASE` on the admin-web deployment (Vercel)
   or image attachments fail visibly.
3. Rotate the chat-pasted credentials (Vercel ×2, GitHub PAT, Neon key,
   Upstash blob token, Render key, both account passwords) — outstanding
   since W14.1.
- **Environment note**: sandbox has NO Docker (27 Testcontainers tests skip,
  expected); dotnet SDK at /home/z/.dotnet (export PATH=/home/z/.dotnet:$PATH);
  the Next.js scaffold at /home/z/my-project is UNRELATED to this repo.
