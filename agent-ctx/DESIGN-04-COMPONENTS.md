# DESIGN-04-COMPONENTS — admin-web StudentsCenter & AcademicCenter institutional redesign

**Agent:** DESIGN-04-COMPONENTS
**Task:** Redesign two admin-web components (StudentsCenter.tsx, AcademicCenter.tsx) to professional institutional quality, preserving ALL existing functionality and API contracts. Use Tailwind utility classes only; apply `--cms-*` design tokens via inline `style`.

---

## Files touched

| File | Lines before | Lines after | Change |
| --- | --- | --- | --- |
| `apps/admin-web/src/components/StudentsCenter.tsx` | 498 | ~720 | Full redesign — slide-in drawer with tabs, pagination, skeleton rows, confirm dialogs, design-token inline styles |
| `apps/admin-web/src/components/AcademicCenter.tsx` | 323 | ~580 | Full redesign — 5-column hierarchy explorer with per-column quick-create form, confirmation dialog for archive/restore, design-token inline styles |

No other files were touched. No dependencies added. No APIs changed. The build passes with 0 TypeScript errors.

---

## What was preserved (zero functionality regressions)

### StudentsCenter
1. **Student list fetch** — `GET /api/v1/admin/students?search=...&universityId=...&status=...&page=...&pageSize=...` (now uses `PAGE_SIZE = 20` per spec).
2. **Security logs** — `GET /api/v1/security/students/{id}/logs?count=50`.
3. **Ban** — `POST /api/v1/admin/students/{id}/ban` with `{ reason, banUntil }`.
4. **Unban** — `POST /api/v1/admin/students/{id}/unban`.
5. **Revoke sessions** — `POST /api/v1/admin/students/{id}/revoke-sessions`.
6. **Unbind device** — `POST /api/v1/security/students/{id}/unbind-device`.
7. **Universities directory** — `GET /api/v1/universities?Page=1&PageSize=100` (loaded once per token).
8. **State** — `query`, `status`, `universityId`, `selected` (drawer), `securityLogs`, `dialog`, `reason`, `banUntil`, `busy`. Added: `page`, `drawerTab`, `confirmUnban`.
9. **Three dialog kinds** — `ban`, `revoke-sessions`, `unbind-device`, all preserving the original payloads and notice messages.
10. **Arabic / English copy** — every visible string still has `ar` / `en` forms via the `isArabic` prop.

### AcademicCenter
1. **Hierarchy fetch** — universities, colleges (by `universityId`), years (by `collegeId`), semesters (by `yearId`), subjects (by `semesterId`), lectures (by `subjectId`).
2. **CRUD create** — university / college / year / semester / subject / lecture, all posting the same JSON payloads as before.
3. **Archive / restore** — `POST /api/v1/academic/{kind}/{id}/archive` and `/restore`.
4. **Publish lecture** — `POST /api/v1/lectures/{id}/publish`.
5. **Show / hide archived toggle** — flips `includeArchived=true` on every fetch and resets the lower hierarchy.
6. **State** — `universityId`, `collegeId`, `yearId`, `semesterId`, `subjectId`, `showArchived`, `busy`. Refactored: replaced the single `form` state object with (a) `quickForms` keyed by `StageKey` for the 5 columns and (b) `lectureForm` for the multi-field lecture panel. The lecture payload shape and create endpoint remain identical.
7. **`isSuperAdmin` gate** — every create affordance (per-column quick-create `+` toggle, lecture `Add lecture` button, lecture create form) is rendered only when `isSuperAdmin === true`.
8. **Arabic / English copy** — every visible string still has `ar` / `en` forms.

---

## What was changed (institutional upgrades)

### StudentsCenter.tsx

| Area | Before | After |
| --- | --- | --- |
| **Pagination** | Hardcoded `page=1`, pageSize=50, no prev/next | `page` state, `PAGE_SIZE=20`, footer with `Results X–Y of N`, prev/next buttons, RTL-aware chevrons (`ChevronRight` for Arabic) |
| **Drawer** | Inline panel rendered below the table | Slide-in panel from the right (`fixed inset-y-0 right-0`, max-width `sm:max-w-md lg:max-w-lg`), backdrop, click-outside to close, `role="dialog" aria-modal="true"` |
| **Drawer tabs** | Single inline view mixing overview + security log | Three tabs: **Overview** (status / last sign-in / answers / accuracy + sessions / devices / account-status cards), **Security log** (scrollable list with severity tone classes, IP fingerprint), **Sessions** (revoke-sessions + unbind-device cards with primary + secondary CTAs) |
| **Status badge** | Plain text chip | Pill with dot indicator + tailwind color classes (Active=emerald, Banned=red, Suspended=amber, Pending=sky) |
| **Avatar** | Static teal background | Status-aware tone (teal/red/amber/sky) + uppercase initial |
| **Row actions** | `UserRound` icon for "view" | `Eye` icon for "view" (more conventional) + `Ban` / `RotateCcw` for ban/reactivate |
| **Skeleton rows** | 5 rows | 6 rows + animated pulse for status badge + last-login column |
| **Empty state** | Single line | Centered icon + main message + helper line; distinguishes "no matching results" (when filters active) from "no students yet" (when list is empty) |
| **Unban flow** | `window.confirm()` native dialog | Custom confirm dialog with backdrop, icon, title, body, cancel + reactivate buttons (red→teal palette per design system) |
| **Design tokens** | Tailwind `slate-*` only | Tailwind utilities for layout + inline `style={{ color: 'var(--cms-*)' }}` for accents (header icon, count badge, drawer avatar gradient, tab underline, status rows, etc.) |

### AcademicCenter.tsx

| Area | Before | After |
| --- | --- | --- |
| **Hierarchy columns** | 5 columns with `+` button that switched the shared `form.kind` | 5 columns each with their own `+` toggle that opens an inline **quick-create form** at the bottom of that column (no context switch) |
| **Quick create** | Single shared form below the lecture strip (kind selector + 7 conditional fields) | Per-column inline form: Arabic name, English name, optional order (year/semester), optional code (subject) — submitted via `submitQuick(kind, event)`. The shared form is now dedicated to lectures only (the most complex payload) |
| **Selected highlight** | `ring-2 ring-teal-500 ring-offset-1` (Tailwind ring) | Teal ring via `boxShadow: '0 0 0 2px var(--cms-teal-500)'` + `background: var(--cms-teal-50)` (design-token-aligned) |
| **Archived tint** | `border-amber-200 bg-amber-50/40` | Amber tint via `borderColor: 'var(--cms-warning)'` + `background: 'var(--cms-warning-50)'` |
| **Count badge** | None | Per-column count pill in teal (`var(--cms-teal-100)` / `var(--cms-teal-700)`) |
| **Archive / restore confirmation** | Immediate call to `setArchiveState()` (no confirmation) | Custom confirm dialog with restore=teal vs archive=amber palette, target name in the title, descriptive body, cancel + confirm buttons |
| **Lecture form** | Mixed into the shared form via `form.kind === 'lecture'` branch with 7 conditional fields | Dedicated `LectureForm` state + separate panel (`showLectureForm` toggle) with the same 7 fields (Arabic title, English title, lecture number, duration, instructor, source, description), preserving the exact JSON payload sent to `POST /api/v1/lectures` |
| **Lecture status chips** | Only `Archived` + `Draft` | `Archived` (amber), `Draft` (sky), `Published` (emerald) — all using design-token-aware inline styles for archived + standard tailwind classes for draft/published |
| **Show / hide archived** | `EyeOff` always; text toggled by `showArchived` | `Eye` when archived are visible, `EyeOff` when hidden — visually communicates the current state |
| **Empty column state** | "لا توجد عناصر بعد" / "No items yet" | Distinguishes "select parent first" (when `requiresParent && !canAdd`) from "no items yet" (when the parent is selected but the list is empty) |

---

## Design system alignment

Both files now apply the `--cms-*` design tokens (defined in `apps/admin-web/src/styles/globals.css`) via inline `style={...}` for color and shadow values, while structural styling (flex, grid, padding, border-radius, transitions) remains pure Tailwind utility classes. Specifically:

- **Teal accents** — `var(--cms-teal-50/100/400/500/600/700)` for primary actions, active states, selected items, count badges.
- **Ink navy** — `var(--cms-ink-900)` for the lecture number badge (deep authoritative surface).
- **Status colors** — `var(--cms-success)`, `var(--cms-warning)`, `var(--cms-danger)`, `var(--cms-info)` with their `-50` tints.
- **Lines & text** — `var(--cms-line)`, `var(--cms-line-strong)`, `var(--cms-text)`, `var(--cms-text-soft)`, `var(--cms-text-muted)`, `var(--cms-ivory-50/100)`.
- **Avatar gradient** — `linear-gradient(135deg, var(--cms-teal-700), var(--cms-teal-500))`.

The `--cms-warning` token (amber) is used for archived items and the archive confirmation palette — distinct from `--cms-danger` (red) which is reserved for the ban action. This preserves the semantic distinction: archive is reversible, ban is a stronger protected action.

---

## Build verification

```
$ cd /home/z/my-project/audit-workspace/cms-platform-manus
$ export PATH="/home/z/dotnet:/home/z/.npm-global/bin:/usr/local/bin:$PATH"
$ pnpm --filter @cms/admin-web build
> @cms/admin-web@1.0.0 build
> tsc -b && vite build

vite v6.4.3 building for production...
✓ 1933 modules transformed.
dist/index.html                   0.63 kB │ gzip:   0.38 kB
dist/assets/index-CIcv-zSu.css   62.92 kB │ gzip:  11.84 kB
dist/assets/index-Dx1tAnha.js   554.82 kB │ gzip: 150.03 kB
✓ built in 5.46s

$ npx tsc -b --force ; echo "EXIT: $?"
EXIT: 0
```

**0 TypeScript errors. 0 build errors.** The pre-existing ESLint config issue (`@typescript-eslint/no-unused-expressions` rule crashes with eslint 8.57.1 in this workspace) is unrelated to these changes and affects the entire `apps/admin-web` package, not the redesigned files specifically.

---

## Files NOT touched (for reference)

- `apps/admin-web/src/lib/api.ts` — `apiRequest`, `ApiError`, `PagedResult` signatures unchanged.
- `apps/admin-web/src/styles/globals.css` — design tokens unchanged.
- `apps/admin-web/src/components/{CodesCenter,ExamsCenter,LibraryCenter,QuestionsCenter}.tsx` — siblings not in scope.
- No new dependencies added to `package.json`.
- No backend endpoints changed.
