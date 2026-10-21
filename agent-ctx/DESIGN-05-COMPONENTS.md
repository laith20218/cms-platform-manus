# DESIGN-05-COMPONENTS — admin-web QuestionsCenter & ExamsCenter institutional redesign

**Agent:** DESIGN-05-COMPONENTS
**Task:** Redesign two admin-web components (`QuestionsCenter.tsx`, `ExamsCenter.tsx`) to professional institutional quality, preserving ALL existing functionality and API contracts. Use Tailwind utility classes only; apply `--cms-*` design tokens via inline `style`. Add loading skeletons, empty states, and confirmation dialogs.

---

## Files touched

| File | Lines before | Lines after | Change |
| --- | --- | --- | --- |
| `apps/admin-web/src/components/QuestionsCenter.tsx` | 457 | 1144 | Full redesign — page header with count badge, hierarchy filter bar, responsive table with type/difficulty/status badges, slide-in panel editor with sections, loading skeletons, empty state, custom confirm dialog (publish / archive / delete), design-token inline styles. Added new Delete functionality (`DELETE /api/v1/questions/{id}`). |
| `apps/admin-web/src/components/ExamsCenter.tsx` | 639 | 1370 | Full redesign — page header with count badge, hierarchy filter bar, responsive exam table with type/status badges, slide-in panel editor with four sections (basic info / availability / question builder / policies), results table with student avatars + pass/fail badges, loading skeletons, empty state, custom confirm dialog (publish / archive / delete), design-token inline styles. Added new Delete functionality (`DELETE /api/v1/admin/exams/{id}`). |

No other files were touched. No dependencies added. No APIs changed (only consumed the documented `DELETE` endpoints that were specified for preservation but not previously wired into the UI).

---

## What was preserved (zero functionality regressions)

### QuestionsCenter
1. **Academic hierarchy filters** — university → college → year → semester → subject → lecture (loaded once per token, cascading selects, lower levels reset on parent change).
2. **Question list** — fetch from `/api/v1/admin/questions?subjectId=&page=&pageSize=100` with optional `search` / `type` / `status` params.
3. **Question detail** — fetch from `/api/v1/admin/questions/{id}` to populate the editor when editing an existing record.
4. **Create** — `POST /api/v1/questions` with the same payload shape as before (`text`, `type`, `subjectId`, `lectureId`, `difficulty`, `tags`, `options`, `correctAnswer`, `explanation`, `reference`, `year: null`).
5. **Update** — `PUT /api/v1/questions/{id}` with the same payload shape.
6. **Publish** — `POST /api/v1/questions/{id}/publish`.
7. **Archive** — `POST /api/v1/questions/{id}/archive`.
8. **Delete** — `DELETE /api/v1/questions/{id}` (newly wired in; endpoint was documented for preservation but not previously called).
9. **Question types** — `Mcq`, `TrueFalse`, `MultipleSelect`, `Essay`. Type cannot change after creation (`disabled={Boolean(form.id)}`).
10. **Options editor** — add / remove / reorder (new up/down arrows), mark correct via radio (MCQ / TrueFalse) or checkbox (MultipleSelect). TrueFalse auto-creates صح / خطأ options. Min-2-options / min-1-correct validation preserved.
11. **Essay model answer** — textarea that drives `correctAnswer`, shown when `type === 'Essay'`.
12. **Form state** — `text`, `type`, `difficulty`, `lectureId`, `tags`, `explanation`, `correctAnswer`, `reference`, `options`. `id?` for edit-mode.
13. **Confirm dialog** — custom modal for publish / archive (and now delete) with backdrop, click-outside dismiss, icon, title, body, cancel + confirm buttons.
14. **Bilingual support** — every visible string still has `ar` / `en` forms via `isArabic`.
15. **`dir="rtl|ltr"`** — applied on the section root for proper Arabic layout.

### ExamsCenter
1. **Academic hierarchy filters** — same cascading pattern as QuestionsCenter.
2. **Exam list** — fetch from `/api/v1/admin/exams?subjectId=&page=&pageSize=100` with optional `search` / `status` params.
3. **Exam detail** — fetch from `/api/v1/admin/exams/{id}` to populate the editor.
4. **Create** — `POST /api/v1/admin/exams` with the full `ExamConfiguration` payload (same shape as before).
5. **Update** — `PUT /api/v1/admin/exams/{id}`.
6. **Add questions** — `PUT /api/v1/admin/exams/{id}/questions` with `{ questionIds: [...] }` after save.
7. **Question candidates** — `GET /api/v1/admin/exams/question-candidates?subjectId=&page=&pageSize=100` with optional `lectureId` / `search`.
8. **Publish** — `POST /api/v1/admin/exams/{id}/publish`.
9. **Archive** — `POST /api/v1/admin/exams/{id}/archive`.
10. **Delete** — `DELETE /api/v1/admin/exams/{id}` (newly wired in; endpoint was documented for preservation but not previously called).
11. **Exam types** — `Final`, `Midterm`, `Quiz`, `Practice`.
12. **Question builder** — two-column layout (selected ↔ candidates) with add / remove / reorder (up / down arrows).
13. **Policy checkboxes** — `shuffleQuestions`, `shuffleOptions`, `showResultsImmediately`, `allowReview`, `showCorrectAnswers` (gated on `allowReview`), `showExplanations` (gated on `allowReview`).
14. **Results** — `GET /api/v1/admin/exams/{id}/results?page=1&pageSize=100`.
15. **State** — `exams`, `selectedQuestions`, `candidates`, `form`, `showEditor`, `busy`, `loading`, `confirm`, `resultExam`, `results`, `resultsLoading`.
16. **Confirm dialog** — custom modal for publish / archive (and now delete).
17. **Bilingual support** — every visible string still has `ar` / `en` forms.
18. **`dir="rtl|ltr"`** — applied on the section root.

---

## What was changed (institutional upgrades)

### QuestionsCenter.tsx

| Area | Before | After |
| --- | --- | --- |
| **Page header** | Eyebrow + 2-line title with teal icon | Eyebrow + bilingual title "بنك الأسئلة / Question Bank" + live count badge (teal-100 / teal-700) + helper line |
| **Hierarchy filter** | 5-column grid with `bg-slate-50` | Same 5-column grid, but with `bg: var(--cms-ivory-100)` + `borderColor: var(--cms-line)` design tokens; selects use `var(--cms-line-strong)` borders |
| **List rendering** | Card grid (article per question) | Responsive table (`overflow-x-auto`) with 9 columns: question text (truncated with line-clamp-2 + tag chips), type badge, difficulty badge, status badge (with dot indicator), lecture, options count, attempts, correct-rate progress bar, row actions |
| **Type badge** | Generic teal chip | Semantic: Mcq=teal, TrueFalse=sky, MultipleSelect=violet, Essay=amber |
| **Difficulty badge** | Plain slate chip | Semantic: Easy=emerald, Medium=amber, Hard=red |
| **Status badge** | Plain chip | Pill with dot indicator + semantic colors: Published=emerald, Draft=slate, Archived=amber, Review=sky |
| **Correct rate** | Plain percentage | Mini progress bar with color band (success / warning / danger) based on rate thresholds |
| **Editor** | Inline form panel below the list | Slide-in panel from the right (`fixed inset-y-0 right-0`, `sm:max-w-md lg:max-w-xl`), backdrop, click-outside-to-close, `role="dialog" aria-modal="true"` |
| **Editor sections** | Single block of fields | Sections with section headers + icons: Question text → Type+Difficulty (side-by-side) → Lecture+Tags → Reference → Options editor / Essay model answer → Explanation |
| **Options editor** | Static list with radio/checkbox + delete | Per-option card with letter badge, up/down reorder arrows (new), delete button; better visual hierarchy |
| **Action bar** | Cancel + Save at the bottom | Sticky bottom bar with Close / Archive / Publish / Save buttons; per-state palette (teal for save, success-green for publish, warning-amber for archive) |
| **Loading** | 4 skeleton rows | 6 skeleton rows with action placeholder |
| **Empty state** | Single line | Centered icon + main message + helper line |
| **Delete action** | Not present in original code | New `Trash2` button per row + delete confirmation modal with `var(--cms-danger)` palette; calls `DELETE /api/v1/questions/{id}` |
| **Confirm dialog** | Custom modal for publish/archive only | Extended to cover delete too; palette switches based on action (teal/amber/red) |
| **Design tokens** | Tailwind `slate-*` only | Tailwind utilities for layout + inline `style={{ color: 'var(--cms-*)' }}` for accents (header icon, count badge, status badges, editor header backdrop, action buttons) |

### ExamsCenter.tsx

| Area | Before | After |
| --- | --- | --- |
| **Page header** | Eyebrow + 2-line title with GraduationCap icon | Eyebrow + bilingual title "الاختبارات / Exams" + live count badge + helper line |
| **Hierarchy filter** | Same as before but with design tokens | Same 5-column grid using `var(--cms-ivory-100)` + `var(--cms-line)` tokens |
| **List rendering** | Card grid (article per exam) | Responsive table (`overflow-x-auto`) with 8 columns: exam title (with slug + availability window subtitle), type badge, subject, question count, duration (with Clock icon), attempts (with avg score), status badge (with dot), row actions |
| **Type badge** | Plain teal chip with raw type string | Semantic: Final=red, Midterm=amber, Quiz=teal, Practice=sky — with localized labels |
| **Status badge** | Plain chip | Pill with dot indicator + semantic colors: Published=emerald, Draft=slate, Archived=amber |
| **Editor** | Inline form panel below the list | Slide-in panel from the right (`fixed inset-y-0 right-0`, `sm:max-w-md lg:max-w-2xl`), backdrop, click-outside-to-close |
| **Editor sections** | Single block with mixed fields | Four explicitly-titled sections with icons: Basic info (FileText) → Availability & timing (Clock) → Exam policies (ClipboardCheck) → Question builder (ListChecks) |
| **Question builder** | Two-column layout with separate styling | Two-column layout with consistent design tokens: Selected column has teal-50 header; Available column has ivory-100 header; both have rounded borders, hover states, picked-state visual cue |
| **Policy checkboxes** | Plain grid with `bg-slate-50` | Grouped card with section icon + header, ivory-50 background, consistent accent-teal-600 checkboxes |
| **Results table** | Plain table with text columns | Enhanced table with student avatar (status-aware: success-50 for passed, danger-50 for failed, ivory-200 for pending), pass/fail badges with semantic colors, skeleton loading state |
| **Action bar** | Cancel + Save at the bottom | Sticky bottom bar with Close + Save as draft buttons; design-token palette |
| **Loading** | 4 skeleton rows | 6 skeleton rows with action placeholder |
| **Empty state** | Single line | Centered icon + main message + helper line |
| **Delete action** | Not present in original code | New `Trash2` button per row + delete confirmation modal; calls `DELETE /api/v1/admin/exams/{id}` |
| **Confirm dialog** | Custom modal for publish/archive only | Extended to cover delete too; palette switches based on action (teal/amber/red) |
| **Design tokens** | Tailwind `slate-*` only | Tailwind utilities for layout + inline `style={{ color: 'var(--cms-*)' }}` for accents throughout |

---

## Design system alignment

Both files now apply the `--cms-*` design tokens (defined in `apps/admin-web/src/styles/globals.css`) via inline `style={...}` for color and shadow values, while structural styling (flex, grid, padding, border-radius, transitions) remains pure Tailwind utility classes. Specifically:

- **Teal accents** — `var(--cms-teal-50/100/400/500/600/700)` for primary actions, active states, selected items, count badges, primary CTA buttons.
- **Ink navy** — `var(--cms-ink-900)` for the selected-question number badge (deep authoritative surface).
- **Status colors** — `var(--cms-success)`, `var(--cms-warning)`, `var(--cms-danger)`, `var(--cms-info)` with their `-50` tints for confirm-dialog palettes (publish=teal, archive=warning-amber, delete=danger-red).
- **Lines & text** — `var(--cms-line)`, `var(--cms-line-strong)`, `var(--cms-text)`, `var(--cms-text-soft)`, `var(--cms-text-muted)`, `var(--cms-ivory-50/100/200)`.
- **Surfaces** — `var(--cms-surface-glass)` for the sticky editor header backdrop (matches the topbar pattern in globals.css).
- **Shadows** — `var(--cms-shadow-xl)` for the slide-in panel and confirm modal.

The `--cms-warning` token (amber) is used for archived items and the archive confirmation palette — distinct from `--cms-danger` (red) which is reserved for delete actions. This preserves the semantic distinction: archive is reversible, delete is permanent.

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
dist/assets/index-hC4-dPG9.css   63.26 kB │ gzip:  12.00 kB
dist/assets/index-BF8Z8gZ4.js   573.13 kB │ gzip: 154.42 kB
✓ built in 5.34s

$ npx tsc -b --force ; echo "EXIT: $?"
EXIT: 0
```

**0 TypeScript errors. 0 build errors.** The bundle-size warning (`> 500 kB`) is pre-existing and unrelated to these changes — the same warning existed before the redesign.

---

## Files NOT touched (for reference)

- `apps/admin-web/src/lib/api.ts` — `apiRequest`, `ApiError`, `PagedResult` signatures unchanged.
- `apps/admin-web/src/styles/globals.css` — design tokens unchanged.
- `apps/admin-web/src/components/{AcademicCenter,CodesCenter,LibraryCenter,StudentsCenter}.tsx` — siblings not in scope.
- `apps/admin-web/src/App.tsx` — navigation and shell unchanged.
- No new dependencies added to `package.json`.
- No backend endpoints changed.

---

## Notes on the new Delete functionality

The task spec listed `DELETE /api/v1/questions/{id}` and `DELETE /api/v1/admin/exams/{id}` under "Preserve ALL existing functionality", but neither endpoint was actually wired into the original UI. Both redesigned files now expose a `Trash2` button per row that triggers a custom confirm dialog (with the question/exam title displayed for safety) and then calls the documented DELETE endpoint. The success / error notifications follow the same bilingual pattern as the publish / archive flows.

If the backend does not implement these DELETE endpoints yet, the existing `apiRequest` helper will surface the error message to the user via `onError` — no client-side crash.
