# Wave 23 — Phase 0 Deep Recon (residual register)

**Mission:** close residual groups (أ) and (ب) cleanly.
**Start main:** `b74a667` (Wave 22.4 merge — PR #154; Wave 22.5 skipped as empty per its handoff).
**Baselines at start (local):** student-web vitest **647 passed / 68 files**; admin-web vitest **87 passed / 12 files**; tsc **0 / 0** both apps; student-web eslint `--max-warnings=0` **clean**; admin-web eslint **31 warnings (gate fails)**. dotnet tests run via GitHub Actions (no local SDK in executor sandbox).

No P0 security issue found in student-web/api scope during this recon — no STOP condition.

---

## Group (أ) — explicit leftovers

### A1 — CoursePlayerPage bare «تعذر» (P1) → **FIX in Wave 23.1**
- File: `apps/student-web/src/features/my-studies/pages/CoursePlayerPage.tsx` **line 492** — the failed-transcode card copy: `'تعذر معالجة هذا الفيديو. يرجى التواصل مع الدعم.'` (bare spelling, no shadda).
- Companion test locking the old wording: `apps/student-web/src/test/my-studies.test.tsx` **line 425** (`getByText('تعذر معالجة هذا الفيديو…')`).
- Line 31 mentions «تعذر المعالجة» in a **comment only** — Wave 22.4 precedent leaves comments untouched (minimal diff); only the user-facing string + the test assertion change.
- C2 status: CoursePlayerPage is C2-frozen; the Wave 23 brief grants a **narrow C2 string-only exception** for exactly this line (+ the companion test). Same pattern as Wave 22.4 (`02add88`).

### A2 — admin-web eslint debt (P1) → **FIX in Wave 23.3**
`pnpm lint` (admin-web, `eslint . --ext ts,tsx --max-warnings=0`) currently fails with exactly **31 warnings, 0 errors**:

| File | Rule | Count | Classification |
| --- | --- | --- | --- |
| `src/components/ReportsTabs.tsx` | `@typescript-eslint/no-explicit-any` | 27 | real fix — replace `any` with typed shapes (report row / column accessors) |
| `src/components/NotificationCompose.tsx` (78:6) | `react-hooks/exhaustive-deps` | 1 | real fix — add the missing `students.length` / `universities.length` deps |
| `src/components/SettingsCenter.tsx` (95:102) | `react-hooks/exhaustive-deps` | 1 | real fix — add missing `load` dep (stable-ize with `useCallback`) |
| `src/hooks/useUiPermissions.tsx` (31:17, 111:17) | `react-refresh/only-export-components` | 2 | real fix — move the exported non-component symbols to a plain `.ts` module (no HMR semantics change) |

No test updates expected; no UI behavior change intended. No blanket disables planned — every warning has a real fix.

### A3 — English «Explanation is required» on the import path (P1) → **FIX in Wave 23.2**
- Path: `ImportQuestionsCommand` handler (`CMS.Application/Handlers/Questions/QuestionHandlers.cs:752`) calls `question.UpdateExplanation(row.Explanation)` → domain entity `CMS.Domain/Entities/QuestionEntities.cs:127` throws `new DomainException("Explanation is required")` (**English**) → the per-row catch folds it as `السطر N: Explanation is required` into `ImportResultDto.Errors` (mixed-script per-row report).
- Companion test locking the entity message: `CMS.Tests/Unit/Domain/EntityTests.cs:157-168` (`WithMessage("Explanation is required")`).
- **Behavior decision (recon):** the admin UI **requires** explanation before saving (`admin-web/src/components/QuestionsCenter.tsx:535` — «اكتب شرح السؤال العلمي.») and `Publish()` refuses empty explanations (`QuestionEntities.cs:198`). Empty explanation is **not** allowed by the product → keep the required behavior; translate + standardize the exception only.
- Fix: `UpdateExplanation` raises `BusinessRuleViolationException("الشرح مطلوب")` (Arabic, project-standard type — same convention as «نص السؤال مطلوب» / «الإجابة الصحيحة مطلوبة» already on the same import path from W22.3). ImportResultDto per-row aggregation stays untouched (still a 200 with an honest row report). No schema change. This is the granted **C3 exception scope** (exception text in domain layer only).
- Tests: update `EntityTests` expectation; add `Import_MissingExplanation_ReportsTheArabicRowError` to `QuestionImportW223Tests` (row without explanation → `السطر 1: الشرح مطلوب`, row failed, valid rows still import).

---

## Group (ب) — web product gaps

### B6 — student-web / admin-web deep recon → residual register

| ID | Sev | File | Finding | Disposition |
| --- | --- | --- | --- | --- |
| B6-1 | P2 | `student-web/src/features/questions/services/matching.ts:85` | dead export `isMatchingComplete` (zero refs monorepo-wide, incl. tests) | **FIX in 23.4** — remove |
| B6-2 | P2 | `admin-web/src/lib/api.ts:259` | dead export `fetchMyUiPermissions` (zero refs) | **FIX in 23.4** — remove |
| B6-3 | P2 | `admin-web/src/lib/mediaProcessing.ts:54` | dead export `processingPhaseIndex` (zero refs) | **FIX in 23.4** — remove |
| B6-4 | P2 | `admin-web/src/lib/mediaProcessing.ts:161` | dead export `pdfProcessingChipLabel` (zero refs) | **FIX in 23.4** — remove |
| B6-5 | P3 | `student-web/src/features/study/components/ProgressTab.tsx:12` | `TODO 15.4.5` comment (unify with StatsPage grid) — code comment only, user-facing surfaces unaffected; unifying is a refactor | **document-only** (accepted limitation note) |

Verified clean (no action): raw English enums in rendered student UI — none (status/type/difficulty surfaces use the W22.1/W22.2 maps; remaining enum literals are logic comparisons, not copy); bare «تعذر»/«جاري» outside A1 — none in user-facing strings (remaining hits are code comments / logic comparisons; «محاولة جارية» in `ExamCourseDetailPage.tsx:141` is the feminine adjective form, not the banned gerund); `window.confirm`/`window.alert` — zero leftovers (dialogs replaced in W18.3); `console.log` — zero in non-test src; `<img>` alt coverage — all flagged imgs carry `alt` on continuation lines; empty/error truthfulness surfaces stay locked by the W18.1 suite (green in baseline). Exam picker bilingual coverage intact (198 `isArabic` branches; exam-type/status/report labels all mapped).

### B4 / B5 / B7 — non-goals (evidence)

- **B4 (full parity with the native Android app):** the monorepo carries a separate native program `apps/android` (Gradle: `app/`, `build.gradle.kts`, `gradlew`). Native parity means OS-level capabilities a web app cannot take over (background media downloads, OS push, app-store packaging, native codecs). Closing this "gap" on the web side would mean re-implementing the Android program inside student-web — not a web residual. **Accepted limitation — belongs to the Android program.**
- **B5 (entire site works offline):** student-web ships a workbox PWA (`vite.config.ts` injects the service worker) and the API has a dedicated encrypted **offline packages/media** subsystem (`CMS.Application/Handlers/Offline/*`, integration-tested). The honest engineering statement is: offline = the packages and media the student explicitly downloaded; auth, live exams, grading and fresh streaming require connectivity. Full-site offline is not a truthful engineering goal in this program. **Accepted limitation.**
- **B7 (richer educational game engine / more question types):** question types are a locked backend enum (`QuestionType`: Mcq/TrueFalse/MultipleSelect/Essay/Matching) wired through editors, players, truthfulness tests and (for Matching, W20–21) E2E; no half-landed/broken type exists in recon (all suites green, label map covers every member with a fallback). New types/game modes = a new product brief (schema, editors, players, grading), not a residual fix. **Accepted limitation — needs a future product brief.**

---

## Fix vs documented-only summary

**Will be code-closed:** A1 (23.1), A3 (23.2), A2 (23.3), B6-1..B6-4 (23.4).
**Documented-only:** B6-5 (comment TODO), B4, B5, B7 (23.5 `docs/wave-23-accepted-limitations.md`).
