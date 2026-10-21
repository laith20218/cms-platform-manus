# DESIGN-06-LIBRARY-V2 — admin-web LibraryCenter institutional redesign (v2)

**Agent:** DESIGN-06-LIBRARY-V2
**Task:** Redesign `apps/admin-web/src/components/LibraryCenter.tsx` to professional institutional quality (matching the patterns established by `QuestionsCenter.tsx` and `ExamsCenter.tsx` in DESIGN-05-COMPONENTS), preserving ALL existing functionality and API contracts. Use Tailwind utility classes only; apply `--cms-*` design tokens via inline `style`. Add semantic badges, loading skeletons, empty state, slide-in upload panel, and custom delete-confirm modal with red tint.

---

## Files touched

| File | Lines before | Lines after | Change |
| --- | --- | --- | --- |
| `apps/admin-web/src/components/LibraryCenter.tsx` | 574 | 958 | Full visual redesign — page header with eyebrow + title + live count badge + Library icon, hierarchy filter bar (6-column grid using `--cms-ivory-100` / `--cms-line` tokens), toolbar with search / status filter / refresh, responsive table with semantic type/status/scan badges, slide-in upload panel from right (with file picker / title+type / subject+lecture / description / XHR progress bar), 6-row shimmer skeleton, empty state (two-tier message: "select a subject" vs "no matches"), custom delete-confirm modal with red (`--cms-danger`) palette, design-token inline styles throughout. Added subject & lecture selectors to the upload form so `form.subjectId` / `form.lectureId` can actually be populated (previously the form had these fields in state but no UI to set them). |

No other files were touched. No dependencies added. No API paths changed. No types changed.

---

## What was preserved (zero functionality regressions)

1. **Academic hierarchy filters** — university → college → year → semester → subject → lecture (cascading selects; lower levels reset on parent change). All six selects remain in a single responsive grid.
2. **File list fetch** — `GET /api/v1/admin/content/files?page=&pageSize=25` with optional `subjectId` / `status` / `search` params. The conditional `useEffect` that only loads files when at least one of `subjectId` / `statusFilter` / `query` is set is preserved.
3. **Upload flow (3-step presigned PUT)** — unchanged:
   - Step 1: `POST /api/v1/library/upload-url` with `{ fileName, contentType, fileSize, subjectId, lectureId, type, title, description }`
   - Step 2: `PUT <presigned-url>` via XHR with `xhr.upload.progress` listener driving `setUploadProgress`
   - Step 3: `POST /api/v1/library/complete-upload` with `{ fileId, fileKey, actualFileSize, pagesCount: null, durationSeconds: null, youtubeVideoId: null }`
4. **Publish** — `POST /api/v1/library/{id}/publish`
5. **Archive** — `POST /api/v1/library/{id}/archive`
6. **Delete** — `DELETE /api/v1/library/{id}` (with confirmation modal)
7. **File types** — `Pdf`, `Html`, `Image`, `Video`, `Audio`, `Summary`, `Comprehensive`, `Paragraph`. `contentTypeMap` auto-detects `type` and `contentType` from the browser-supplied MIME on file selection (same map preserved exactly).
8. **XHR upload progress** — preserved exactly (listener on `xhr.upload.progress`, percent = `Math.round((loaded / total) * 100)`).
9. **State variables** — all preserved: `universities`, `colleges`, `years`, `semesters`, `subjects`, `lectures`, the 6 `*Id` strings, `files`, `page`, `query`, `statusFilter`, `loading`, `busy`, `showUpload`, `form`, `selectedFile`, `uploadProgress`, `confirmDelete`.
10. **All `useEffect` hooks** — preserved exactly (with `// eslint-disable-next-line react-hooks/exhaustive-deps`).
11. **Bilingual support** — every visible string still has `ar` / `en` forms via `isArabic`. A few new copy strings were added (`eyebrow`, `noSubject`, `noSubjectHint`, `noFilesHint`, `selectSubjectForm`, `selectLectureForm`) — both languages.
12. **`dir="rtl|ltr"`** — applied on the section root for proper Arabic layout (newly added; QuestionsCenter has this).
13. **Props contract** — `{ token, isArabic, onError, onNotice }` unchanged.
14. **API client types** — `apiRequest`, `PagedResult<T>`, `AdminLibraryFileListItem`, `UploadUrlResponse` consumed unchanged.

---

## What was changed (institutional visual upgrades)

| Area | Before | After |
| --- | --- | --- |
| **Page header** | Plain h2 + helper text + teal "Upload file" button | Eyebrow ("Digital content management / إدارة المحتوى الرقمي") + bilingual title with `Library` icon tile (teal-50 / teal-700 tokens) + live count badge (teal-100 / teal-700) + helper line. Upload button uses `var(--cms-teal-700)` with hover lift to `var(--cms-teal-600)`. |
| **Hierarchy filter bar** | 6-column grid with `bg-slate-50 border-slate-200` | Same 6-column grid using `var(--cms-ivory-100)` background + `var(--cms-line)` border; each select has a tiny `--cms-text-soft` label above it; focus ring `focus:ring-2 focus:ring-teal-500` |
| **Toolbar** | Inline row of search / status / refresh with slate tints | Card panel (`bg-white` + `var(--cms-line)` border) holding search input (with Search icon), status filter select, refresh button (RefreshCw icon, disabled when no filters) |
| **List rendering** | Simple table with text cells and tiny chip badges | Responsive table (`overflow-x-auto`) with semantic pill badges for type / status / scan; title cell shows type icon + title (line-clamp-2); subject / size (mono tabular-nums) / created cells use soft / muted text tokens; row actions in a tight 1-gap row |
| **Type badge** | Plain text `file.type` (raw enum string) | Semantic pill: Pdf=red, Html=sky, Image=violet, Video=amber, Audio=teal, default (Summary/Comprehensive/Paragraph)=slate — with localized labels (`ملف PDF`, `صفحة HTML`, `صورة`, `فيديو`, `صوت`, etc.) |
| **Status badge** | Plain chip with `statusColor()` returning 3 classes (text/bg/border) | Pill with dot indicator + semantic colors: Published=emerald, Draft=slate, Archived=amber — with localized labels (`منشور`, `مسودة`, `مؤرشف`) |
| **Scan badge** | Plain text colored via `scanColor()` (text color only) | Pill with semantic colors: Clean=emerald, Pending=sky, Infected=red, Error=amber — with localized labels (`نظيف`, `قيد الفحص`, `مصاب`, `خطأ`) |
| **Upload form** | Inline `<form>` panel below the list, only 4 fields (file / title / type / description) | Slide-in panel from the right (`fixed inset-y-0 right-0`, `sm:max-w-md lg:max-w-xl`), backdrop (`bg-black/40`), click-outside-to-close, `role="dialog" aria-modal="true"`, sticky glass header (`var(--cms-surface-glass)`), sticky bottom action bar. Now includes 6 fields: file picker (with detected size hint in ivory-50 card) / Title + Type (2-col) / **Subject + Lecture (2-col, NEW)** / Description textarea / XHR progress bar (teal-500 fill on ivory-200 track) |
| **Action bar (upload panel)** | Cancel + Upload inline at bottom | Sticky bottom bar with Cancel + Upload buttons; Cancel uses `var(--cms-line-strong)` border + `var(--cms-text-soft)` text; Upload uses `var(--cms-teal-700)` fill with hover lift |
| **Loading** | Single centered spinner with text | 6-row shimmer skeleton inside a bordered card matching the table structure (icon placeholder / title bar / type+status pills / size bar / actions placeholder) |
| **Empty state** | Single centered text line | Two-tier message: if no filters applied → "Select a subject to view its files." + helper line ("The hierarchy above leads from university down to subject."); if filters applied but no results → "No matching files." + helper line ("Try adjusting the filters or search keywords."). Library icon tile (ivory-100 / muted) above. |
| **Delete confirmation** | Centered modal with `bg-black/50` overlay, plain white card, Cancel + Delete buttons | Same centered modal pattern but with design tokens: `var(--cms-shadow-xl)` on card, `var(--cms-danger-50)` / `var(--cms-danger)` on alert icon tile, Cancel uses `var(--cms-line-strong)` border + `var(--cms-text-soft)` text, Delete uses `var(--cms-danger)` fill with hover lift to `#9c3a31`. Backdrop click dismisses (unless `busy`). Click-outside on the card itself is stopped via `event.stopPropagation()`. |
| **Design tokens** | Tailwind `slate-*` only (e.g. `bg-slate-50`, `border-slate-200`, `text-slate-900`) | Tailwind utilities for layout + inline `style={{ color: 'var(--cms-*)', background: 'var(--cms-*)', borderColor: 'var(--cms-*)' }}` for accents throughout (header icon, count badge, filter bar background, toolbar border, table headers, table dividers, status/scan badges use Tailwind color classes per spec, file-icon color, panel header backdrop, action button fills, progress bar fill, delete-modal palette) |

---

## Notes on the new subject/lecture selectors in the upload form

The task spec listed "subject, lecture" as part of the upload form, but the original `LibraryCenter.tsx` upload form only had four fields (file picker / title / type / description). The form's state already had `subjectId` and `lectureId` fields, and the handler's validation (`if (!selectedFile || !form.subjectId || !form.title)`) and the submit button's `disabled={busy || !selectedFile || !form.subjectId || !form.title}` already required `form.subjectId` to be populated — meaning the form was effectively non-functional before (could never pass validation).

The redesign adds two new selectors to the upload panel that populate `form.subjectId` and `form.lectureId` from the already-loaded `subjects` and `lectures` arrays (loaded by the cascade filter `useEffect`s). When `form.subjectId` changes, `form.lectureId` is reset to `''` (matching the cascade-reset pattern of the filter bar above). The lecture select is disabled until a subject is chosen in the form. This makes the upload flow actually work end-to-end without changing any API calls or types.

This is a functional fix that aligns the UI with the documented upload payload (`{ subjectId, lectureId, ... }` was already being sent — the fields were just never populated by the user).

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
dist/index.html                   0.63 kB │ gzip:   0.39 kB
dist/assets/index-BGO_oC7S.css   63.28 kB │ gzip:  11.96 kB
dist/assets/index-FE-1zHL7.js   582.43 kB │ gzip: 155.66 kB
✓ built in 5.39s

$ npx tsc -b --force ; echo "EXIT: $?"
EXIT: 0
```

**0 TypeScript errors. 0 build errors.** The bundle-size warning (`> 500 kB`) is pre-existing and unrelated to this change — the same warning existed before the redesign (see DESIGN-05-COMPONENTS.md).

---

## Files NOT touched (for reference)

- `apps/admin-web/src/lib/api.ts` — `apiRequest`, `ApiError`, `PagedResult<T>`, `AdminLibraryFileListItem`, `UploadUrlResponse` signatures unchanged.
- `apps/admin-web/src/styles/globals.css` — design tokens unchanged.
- `apps/admin-web/src/components/{AcademicCenter,CodesCenter,ExamsCenter,QuestionsCenter,StudentsCenter}.tsx` — siblings not in scope.
- `apps/admin-web/src/App.tsx` — navigation and shell unchanged.
- No new dependencies added to `package.json`.
- No backend endpoints changed.

---

## Design system alignment

The redesign applies the `--cms-*` design tokens (defined in `apps/admin-web/src/styles/globals.css`) via inline `style={...}` for color and shadow values, while structural styling (flex, grid, padding, border-radius, transitions) remains pure Tailwind utility classes. Specifically:

- **Teal accents** — `var(--cms-teal-50/100/400/500/600/700)` for the page-header icon tile, count badge, primary CTA (Upload button), upload-form submit button, and the progress-bar fill.
- **Status colors** — Tailwind utility classes per the task spec: Published=emerald (`text-emerald-700 bg-emerald-50 border-emerald-200`), Draft=slate, Archived=amber.
- **Scan colors** — Tailwind utility classes per the task spec: Clean=emerald, Pending=sky, Infected=red, Error=amber.
- **Type colors** — Tailwind utility classes per the task spec: Pdf=red, Html=sky, Image=violet, Video=amber, Audio=teal, default=slate (for Summary / Comprehensive / Paragraph which aren't file types per se).
- **Lines & text** — `var(--cms-line)`, `var(--cms-line-strong)`, `var(--cms-text)`, `var(--cms-text-soft)`, `var(--cms-text-muted)`, `var(--cms-ivory-50/100/200)`.
- **Surfaces** — `var(--cms-surface-glass)` for the sticky upload-panel header backdrop (matches the topbar pattern in globals.css).
- **Shadows** — `var(--cms-shadow-xl)` for the slide-in panel and the delete-confirm modal.
- **Danger** — `var(--cms-danger)` + `var(--cms-danger-50)` reserved exclusively for the delete-action palette (icon tile, confirm button), distinct from the teal publish-action palette.

The `--cms-warning` token (amber) is used for the archive-action button (in the table row) and would be used for archive confirmations if the workflow needed them — preserving the semantic distinction: archive is reversible, delete is permanent.
