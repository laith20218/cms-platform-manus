# Wave 23 — Accepted Limitations (Owner-facing, honest non-goals)

**Status:** These are the residuals the Wave 23 contract classifies as **not implementable / not truthful engineering goals for the web program**. They are closed as documented accepted limitations — not as open defects. Evidence and disposition per item below.

---

## B4 — «Full parity with the native Android app» → belongs to the Android program

The monorepo ships a separate native program (`apps/android` — a Gradle project with its own `app/` module, instrumented-test workflow `Android Offline Runtime`, and release pipeline). "Parity with the native app" ultimately means OS-level capabilities a browser app cannot take over: OS-level background downloads and media, native push channels, app-store packaging, and hardware codec pipelines. Re-implementing those inside `student-web` would mean rebuilding the Android program in the web surface — that is a product decision for the Android roadmap, not a web residual.

**Accepted limitation:** the web program (student-web / admin-web / api) is complete for its own contract; native-parity items are owned by `apps/android`.

## B5 — «Entire site works offline» → not a truthful engineering goal here

What the platform actually ships, today and by design:

- a workbox service worker (PWA shell caching — `student-web/vite.config.ts`);
- an **encrypted offline packages/media subsystem** (`CMS.Application/Handlers/Offline/*`, integration-tested against real Postgres in CI) — the student explicitly downloads packages and media files for offline study;
- offline exam answering flows owned by the Android runtime.

Auth, session refresh, live exams, grading, leaderboards and fresh streaming require connectivity by design (they are server-authoritative). "The entire site works offline" would require moving authoritative state to the client — contradicting the security and truthfulness architecture the platform has enforced since Wave 18 (server is the source of truth).

**Accepted limitation:** offline = the packages and media the student explicitly downloaded; the live, authenticated, server-authoritative parts of the site are online-only by design.

## B7 — «Richer educational game engine / more question types» → needs a future product brief

The question-type surface is a locked, fully-landed vertical: backend enum (`QuestionType`: Mcq / TrueFalse / MultipleSelect / Essay / Matching) → admin editors (incl. the Wave 21.1 Matching editor) → student players → grading → review, with the W18.1 truthfulness suites and (for Matching) E2E coverage all green. The Wave 23 deep recon found **no half-landed or broken question type** — every enum member renders a correct Arabic label with an explicit fallback (`questionLabels.ts`), and no test surfaces a broken player.

Adding new types (or a richer game engine) means new product decisions: schema migration, editor UX, player UX, grading rules, review surfaces. That is a product brief, not a residual fix.

**Accepted limitation:** new question types / game-engine work requires a future product brief; Wave 23 fixed only what was actually broken (nothing was).

## B6-5 — ProgressTab ↔ StatsPage grid unification (comment-only TODO, documented)

`student-web/src/features/study/components/ProgressTab.tsx:12` carries a code comment (`TODO 15.4.5: unify with StatsPage via shared BySubjectGrid …`). It is not user-facing and not a defect; unifying the two components is a refactor with UI-regression risk on two green surfaces. Out of scope for a residual-closure wave.

**Accepted limitation (documented):** kept as a tracked code comment; unification belongs to a dedicated refactor brief.

---

## Closure evidence for the code-closed items (for the record)

| Item | Evidence |
| --- | --- |
| A1 — CoursePlayerPage bare «تعذر» | product string now «تعذّر معالجة هذا الفيديو…» (`CoursePlayerPage.tsx:492`), locked by `my-studies.test.tsx`; only a code comment still spells it plainly (Wave 22.4 precedent: comments untouched) |
| A2 — admin-web eslint debt | `pnpm lint` (eslint `--max-warnings=0`) exit 0 — was 31 warnings across 4 files |
| A3 — English «Explanation is required» | domain guard raises `BusinessRuleViolationException("الشرح مطلوب")` (`QuestionEntities.cs:127`); import path reports «السطر N: الشرح مطلوب» per-row — locked by `QuestionImportW223Tests` + `EntityTests` |
| B6-1..B6-4 — dead exports | removed (Wave 23.4); dead-export re-scan after Wave 23.x: **0 candidates** in both apps — no new dead code |

Full Phase 0 register and disposition: `docs/wave-23-recon.md`.
