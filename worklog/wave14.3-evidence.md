# Wave 14.3 — §13 Evidence Pack (Commit 5)

Branch: `feat/14.3-admin-ui` (on top of main `8d12a6d`) — local commits, NOT pushed.
Generated: 2026-11-25 (sandbox session). The e2e drives the REAL admin-web vite dev
server (`127.0.0.1:5174`) with a mocked API (admin-upload.e2e.mjs pattern:
`context.route` interception + seeded super_admin session —
`e2e/w143-mock-world.mjs`, reused by `e2e/w14.3-admin-ui.e2e.mjs`).

Screens covered (the W14.3-owned surfaces):
- **ExamCoursesCenter** (D1) — list / editor / exam picker / storefront preview
- **ExamsCenter stats dashboard** (D10) + **question reports triage** (D12)

## 1. Five-width §13 matrix (375 / 414 / 768 / 1024 / 1440)

```
E2E_ADMIN_URL=http://127.0.0.1:5174 node e2e/w14.3-admin-ui.e2e.mjs
== A. ExamCoursesCenter — 5-width matrix + axe + h-scroll ==
  PASS  §13 examcourses 375px: zero horizontal scroll — docΔ=0 bodyΔ=0 scrollΔ=0
  PASS  §13 examcourses 414px: zero horizontal scroll — docΔ=0 bodyΔ=0 scrollΔ=0
  PASS  §13 examcourses 768px: zero horizontal scroll — docΔ=0 bodyΔ=0 scrollΔ=0
  PASS  §13 examcourses 1024px: zero horizontal scroll — docΔ=0 bodyΔ=0 scrollΔ=0
  PASS  §13 examcourses 1440px: zero horizontal scroll — docΔ=0 bodyΔ=0 scrollΔ=0
== C. ExamsCenter stats dashboard — 5-width matrix + axe + h-scroll ==
  PASS  §13 examstats 375px … 1440px: zero horizontal scroll — docΔ=0 bodyΔ=0 scrollΔ=0  (×5)
== D. Question reports — triage UI + notes dialog ==
  PASS  reports 375px / 414px / 768px / 1024px / 1440px: zero horizontal scroll — docΔ=0 bodyΔ=0 scrollΔ=0  (×5)
```

The h-scroll gate is the STRICT form: not merely `scrollWidth == clientWidth` but
actual scrollability — `scrollingElement.scrollLeft` clamped to both extremes; the
user must not be able to scroll horizontally at all (`scrollΔ=0`). This mattered:
in RTL, Chromium counts an `overflow-x:auto` box's own scrollable-overflow region
toward the document scroll area (measured +145px of phantom scroll at 375px even
with correct clipping). Fixed with `contain: paint` isolation on the table
wrappers (see §5).

Artifacts (`apps/admin-web/e2e/screenshots/` — committed, admin-web precedent
from Wave 13.1a2; 1.8 MB total):
`w14.3-examcourses-{375,414,768,1024,1440}.png`,
`w14.3-examcourses-editor-1440.png`, `w14.3-examcourses-picker-1440.png`,
`w14.3-examcourses-preview-1440.png`, `w14.3-examstats-{375,414,768,1024,1440}.png`,
`w14.3-reports-{375,414,768,1024,1440}.png`, `w14.3-report-notes-1440.png`
(19 artifacts).

## 2. axe-core scans

`node e2e/w14.3-admin-ui.e2e.mjs` — tags `wcag2a, wcag2aa, wcag21aa, wcag22aa`,
page-level on the W14.3 screens, gate 0 critical/serious:

```
  PASS  AXE examcourses list @ 375px: 0 critical/serious — 0 rule(s), blocking=0
  PASS  AXE examcourses list @ 1440px: 0 critical/serious — 0 rule(s), blocking=0
  PASS  AXE stats dashboard @ 375px: 0 critical/serious — 0 rule(s), blocking=0
  PASS  AXE stats dashboard @ 1440px: 0 critical/serious — 0 rule(s), blocking=0
  PASS  AXE reports triage @ 375px: 0 critical/serious — 0 rule(s), blocking=0
  PASS  AXE reports triage @ 1440px: 0 critical/serious — 0 rule(s), blocking=0
==== w14.3-admin-ui E2E: 26/26 checks passed ====
peak Chromium RSS: 953 MB (ceiling 1562 MB) — ONE Chromium, contexts per scenario
console errors (excluding mocked-route noise): 0
```

### Contrast findings fixed to reach the gate (disclosed)

The first scan run surfaced 8 failing element groups. Attribution was done per
node (fg/bg/ratio dumped from axe). **Every one is PRE-EXISTING chrome or the
pre-existing exams table** — zero belonged to the new W14.3 components. Because
they sit on the pages W14.3 evidences and the gate requires 0 critical/serious,
each was fixed with a one-token color swap (no layout change):

| # | Element | Ratio | Fix |
| --- | --- | --- | --- |
| 1 | sidebar operator role `<small>` (App.tsx) | 3.13 | `.operator small` rgba(255,255,255,0.35→0.72) |
| 2 | topbar breadcrumb `.crumb` (globals.css) | 3.39 | `--cms-text-muted` → `--cms-text-soft` |
| 3 | ⌘K hint span (App.tsx) | 2.68 | opacity 0.6 → `--cms-text-soft` |
| 4 | exams table `thead` (ExamsCenter, pre-existing) | 3.17 | muted → soft |
| 5 | exams row slug `font-mono` (ExamsCenter, pre-existing) | 3.48 | muted → soft |
| 6 | exams row availability meta `text-[10px]` (pre-existing) | 3.48 | muted → soft |
| 7 | exams row avg-score cell (pre-existing) | 3.48 | muted → soft |
| 8 | exams row attempts "/48" span (pre-existing) | 3.48 | muted → soft |

New-component contrast was compliant from the start except the stats summary
card labels (`--cms-text-muted` on white, 3.48) — switched to `--cms-text-soft`
(≈6.4:1) during the fix pass, together with every text usage of muted inside the
new ExamCoursesCenter file and the new ExamsCenter regions (19 replacements,
scoped by line range; pre-existing regions outside the new blocks were left
alone unless listed above).

## 3. RTL grep (new code)

```
$ rg -n '\b(pl-|pr-|ml-|mr-|text-left|text-right|left-|right-)' src/components/ExamCoursesCenter.tsx
  → 0 matches (whole file is new; logical utilities only: text-start / ps-* / pe-* / start-* / -end-*)

$ git diff b9811db -- src/components/ExamsCenter.tsx | grep '^+' | grep -E '\b(pl-|pr-|ml-|mr-|text-left|text-right|left-|right-)'
  → 0 new physical-direction classes (pre-existing pr-10/right-3/right-0 lines predate W14.3 and are unchanged)

$ git diff b9811db -- src/App.tsx | grep '^+' | grep -E '…same pattern…'
  → 0 new physical-direction classes
```

Arabic-first `dir="rtl"` rendering is what every screenshot shows; the language
toggle (`isArabic=false` → dir="ltr") is served by the logical utilities.

## 4. Verification ladder (exact counts)

| Gate | Result |
| --- | --- |
| `tsc -b` admin-web | PASS (0 errors) |
| eslint admin-web | 31 warnings = origin/main baseline (diff empty), 0 errors; touched files 0/0 |
| vitest admin-web | 58/58 (9 files) |
| `vite build` | PASS (chunk-size advisory is pre-existing) |
| e2e `w14.3-admin-ui.e2e.mjs` | 26/26 + 7 axe scans 0 blocking |
| `dotnet build` CMS.sln | PASS (0 errors; 20 warnings all pre-existing in test files) — for commit 3a |
| `dotnet test` CMS.sln | 637 passed / 0 failed / 27 skipped (Postgres-only integration, pre-existing) — for commit 3a |
| `dotnet ef migrations has-pending-model-changes` | "No changes" — zero schema change incl. commit 3a (§3) |

## 5. Shell-level fixes required by the §13 gate (disclosed)

Three fixes outside the new components were necessary because the gate applies
to the rendered pages at all widths; each is minimal and disclosed:

1. **`.workspace { min-width: 0 }`** (globals.css) — flex default `min-width:auto`
   let wide table min-content push the whole shell horizontally at 375/414
   (pre-existing on every admin table screen; surfaced by the strict gate).
2. **`.topbar { min-width: 0; overflow-x: clip }` + `.content { min-width: 0 }`**
   (globals.css) — same flex-chain rule one level deeper (topbar actions +
   content are flex items of the workspace).
3. **`[contain:paint]` on table wrappers** (ExamCoursesCenter ×1, ExamsCenter ×3)
   — the Chromium RTL quirk from §1: an `overflow-x:auto` box's own
   scrollable-overflow leaks into the document scroll area; paint containment
   isolates it with zero visual change (the boxes already clip). No fixed/absolute
   descendants exist inside any of the four wrappers (all dialogs are section-level
   siblings), so the containing-block change is inert.

## 6. UNVERIFIED disclosures

1. **Real-API rendering** — the e2e mocks `/api/v1/**` (hermetic contract shapes
   from the W14.2 DTOs verified in controller source). Pixel behavior against the
   deployed preview API (Render) is not exercised in-sandbox; the shapes were
   transcribed from `AdminExamCoursesController.cs`, `ExamDtos.cs` (stats),
   `QuestionDtos.cs` (reports) at their W14.2 commit.
2. **`VITE_R2_PUBLIC_BASE`** — cover-image upload derives public URLs from that
   env (same disclosed B.2 dependency); without it the upload completes but the
   attachment fails VISIBLY with guidance.
3. **Custom-role visibility** — the exam-courses nav item rides `view:exams`
   (backend reuses exam verbs), so custom roles with the exam view key see it;
   the backend `ExamCourseView` policy remains the real gate either way.
