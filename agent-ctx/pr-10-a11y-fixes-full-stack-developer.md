# PR-10 A11y + Mobile-Overflow Fixes (apps/admin-web + packages/ui)

Task ID: `pr-10-a11y-fixes` · Branch: `feat/pr-10-final-quality-launch-closure` · All changes left UNCOMMITTED as instructed. Scope confined to `apps/admin-web/src` and `packages/ui/src` (the only packages/ui change is KEEPING the operator's pre-applied Breadcrumbs muted→soft contrast fix — untouched by me). No dev-server e2e run performed (operator re-runs it); unit gates all executed and green. No secrets printed/stored anywhere.

## Final verification (gates from repo root)

- `pnpm --filter @cms/admin-web test` → **Test files 46 passed (46), Tests 339 passed (339)** — baseline 339 maintained, 0 failures.
- `pnpm --filter @cms/admin-web lint` → **exit 0, 0 warnings** (`--max-warnings=0` clean).
- `pnpm --filter @cms/admin-web build` → **tsc -b + vite build clean** (`✓ built in 12.40s`; only the pre-existing >500 kB chunk advisory, same as baseline).
- `pnpm --filter @cms/ui test` → **Test files 12 passed (12), Tests 61 passed (61)** — Breadcrumbs test passes as-is against the operator's soft-token classes (no test edit needed).

## Diagnostic evidence (NOT the e2e script — a private measurement harness, deleted after use)

Before fixing TASK B I reproduced the four failures against the live dev server with the same fixture payloads the e2e mock world seeds, then bisected the docΔ source per view:

- Root cause for `admins Δ227 / students Δ117 / questions Δ387 (+Δ2 @768)`: the table shells are `overflow-x-auto rounded-xl border bg-white` WITHOUT `[contain:paint]`. In an RTL document Chrome still counts the wrapper's internally-scrolled (clipped-left) table content toward `documentElement.scrollWidth`, so the page itself becomes horizontally scrollable. Hiding each wrapper / the table / adding `contain:paint` all dropped docΔ→0 in the bisect. ExamsCenter/ExamCoursesCenter already ship exactly `overflow-x-auto [contain:paint] rounded-xl border bg-white` (ExamsCenter.tsx:1082, ExamCoursesCenter.tsx:908) — which is why those views never failed. Fix = mirror that byte-identical class in the three failing centers.
- Root cause for `overview Δ5`: the TwoFactorCard actions row (`flex items-center gap-2 shrink-0`) cannot fit its two Arabic buttons ("تفعيل/تعطيل المصادقة الثنائية") inside the card at 375px; the disable button's box landed at L-5, dragging html/body 5px wider. Fix = `flex-wrap` on that row (buttons stack at 375 only; ≥sm nothing changes).

## Files modified (13 in admin-web; zero new files)

| File | Change |
| --- | --- |
| `src/components/AdminsCenter.tsx` | aria-label `copy.role` on the role filter select (:190) and the dialog role select (:780), `copy.status` on the status filter select (:205); table shell → `overflow-x-auto [contain:paint] rounded-xl border bg-white` (:275) |
| `src/components/AuditCenter.tsx` | aria-label `t(locale,'audit.center.severityFilter')` (:318) + `t(locale,'audit.center.eventTypeFilter')` (:331) on the two filter selects |
| `src/components/AuditLogViewer.tsx` | aria-label `t(locale,'audit.viewer.severity')` (:245) + `t(locale,'audit.viewer.eventType')` (:255) — both existing keys |
| `src/components/CodesCenter.tsx` | All 13 selects: filter row — `codes.ledger.statusFilter` (new key), `codes.ledger.scopeFilter` (new key), `codes.ledger.university`, `codes.ledger.college`, `codes.generateModal.academicYear`, `codes.generateModal.semester`, `codes.generateModal.subject`; generate-modal form — same academic keys + `codes.generateModal.contentScope` on the content-scope select (all form selects also sit inside implicit `<label>` wrappers; the explicit aria-label matches the visible prompt text exactly, so the accessible name is unchanged where a name already existed — belt-and-braces for the future dialog scans) |
| `src/components/StudentsCenter.tsx` | aria-labels: `students.common.university` (filter :928 + create :2470), `students.common.status` (filter :940), `students.editModal.gender` (:2235), `students.common.college` (:2489), `students.createModal.year` (:2508), `students.createModal.genderOptional` (:2528); table shell → `+ [contain:paint]` (:999) |
| `src/components/QuestionsCenter.tsx` | Table shell → `+ [contain:paint]` (:1355). All 14 selects already had names (aria-labels or implicit `<label>` wrappers) — no select edits needed |
| `src/components/NotificationCompose.tsx` | aria-label `copy.notifType` on the type select (:215), `copy.target` on the three target selects (:266 university picker, :273 student picker, :326 cascade final target) — the audience/cascade-context selects already carried aria-labels |
| `src/components/PermissionMatrixEditor.tsx` | Per-row scope select aria-label `` `${isArabic ? r.ar : r.en}: ${copy.scope}` `` (:268) — reuses the file's own bilingual RESOURCES data + dictionary `admincenters.permissions.matrix.scope`, matching the sibling toggle buttons' per-row labeling convention |
| `src/components/ReportsModeration.tsx` | aria-label `t(locale,'reports.moderation.status')` on the status filter select (:235) |
| `src/components/ReportsTabs.tsx` | aria-label `t(locale,'reports.header.dateRange')` on the date-preset select (:678) |
| `src/components/TwoFactorCard.tsx` | Actions row → `flex flex-wrap items-center gap-2 shrink-0` (fixes the overview 5px document overflow at 375; no visual change ≥sm) |
| `src/lib/dictionary/audit.ts` | +2 entries in `audit.center`: `severityFilter` {تصفية الخطورة / Severity filter}, `eventTypeFilter` {تصفية نوع الحدث / Event type filter} |
| `src/lib/dictionary/codes.ts` | +2 entries in `codes.ledger`: `statusFilter` {تصفية الحالة / Status filter}, `scopeFilter` {تصفية النطاق / Scope filter} |

### Selects already carrying accessible names (verified — untouched)

CoursesCenter (:344 aria-label), EpisodeMetadataFields (htmlFor/id pairs), ExamCoursesCenter (4× implicit `<label>` wraps), ExamsCenter (:780/:1310/:1322 aria-labels, :732/:1599/:1615 implicit labels), LibraryCenter (3 aria-labels + 8 implicit/`htmlFor` pairs), QuestionsCenter (13 aria-labels + implicit labels), ScopePicker (4 aria-labels), SecurityCenter (:490 aria-label), StudentsCenter activity-type (:1618 aria-label), CodesCenter row checkbox etc. — plus `App.tsx` / `preview/*` contain no `<select>`.

## Verification beyond the gates (private harness, deleted)

Ran a select-name + hScroll sweep across **all 17 e2e views** with the e2e's own fixture payloads: `select-name=0` and `docΔ=0 / scrollΔ=0` on every view at 768 (and 375 for the previously failing overview/admins/students/questions + audit/codes/reports). All `data-testid` attributes preserved (diff-audited).

## Observations intentionally OUT OF SCOPE (reported, not fixed)

A full-tag axe scan (wcag2a/aa/21aa/22aa) in this sandbox also surfaces pre-existing **color-contrast (serious)** flags on some admin surfaces (e.g. `--cms-text-muted` 12px `th` text on `--cms-ivory-100` theads ≈3.2:1 in admins/students/questions, an 11px muted line in RolesCenter cards, a 9px muted line in DashboardFeeds). These were not in the task's defect list, involve no code I touched, and follow the same class the operator already fixed in `@cms/ui` Breadcrumbs (muted→soft) — flagged here for the next wave.

## Dictionary test impact

`src/test/dictionary.test.ts` does NOT enumerate individual dictionary keys (its full-tree integrity walk auto-covers new entries; the only enumerated list is apiErrorCodes). The 4 new entries pass the bilingual-pair + placeholder + secret-scan invariants with zero test edits. 339/339 green.
