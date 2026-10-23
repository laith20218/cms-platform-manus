# ITEM-3-STUDENT-CREATE — Add "Create Student" modal to StudentsCenter.tsx

**Agent:** full-stack-developer
**Target file:** `apps/admin-web/src/components/StudentsCenter.tsx`
**Backend endpoint (already deployed):** `POST /api/v1/admin/students` accepting `{ phone, password, fullName, universityId, collegeId, academicYearId, gender?, email? }`

## What was done

1. **Imports** — added `UserPlus` to the existing `lucide-react` import block.
2. **Types** — defined `College` and `AcademicYear` types alongside the existing `University` type. The task brief listed them as "already defined in file" but they were missing — added them with the same shape CodesCenter uses.
3. **State (separate from filter state)** — added 8 new hooks: `createOpen`, `createForm { fullName, phone, password, gender, email }`, `createUniversityId`, `createCollegeId`, `createYearId`, `createColleges`, `createYears`, `createBusy`. The existing filter state (`universityId`, `collegeId`, `yearId`) is untouched — opening the modal or picking cascades inside it does NOT change the filter URL or trigger a list reload.
4. **Cascade functions** — `chooseCreateUniversity(id)` calls `GET /api/v1/universities/{id}/colleges` → `College[]`; `chooseCreateCollege(id)` calls `GET /api/v1/colleges/{id}/years` → `AcademicYear[]`. Each resets downstream selections + state on change (mirrors CodesCenter's pattern).
5. **`openCreate()`** — resets all create-form state before opening so the modal always starts clean.
6. **`submitCreate(e)`** — runs client-side validation first (phone `/^09\d{8}$/`, password ≥ 8, all cascade IDs set), then `POST /api/v1/admin/students` via the existing `request` helper. On success: closes modal, calls `loadStudents(1)` to refresh, fires `onNotice`. On error: fires `onError`, modal stays open so user can retry.
7. **Header button** — added an "Add student" primary CTA on the right side of the page header (`var(--cms-teal-600)` → `var(--cms-teal-700)` on hover/focus), mirroring how CodesCenter places its primary action.
8. **Modal JSX** — added before the closing `</section>`, mirrors the existing edit-profile modal style (fixed inset-0 z-50 backdrop + centered card). Fields: fullName (required), phone (required, Syrian-format pattern + digits-only filter), password (required, `minLength=8`), university/college/academic-year cascade (required, downstream disabled until parent picked), gender (optional), email (optional). Submit button shows `LoaderCircle` while `createBusy`. Backdrop click / Cancel / X all close the modal unless submit is in flight. Bilingual via `isArabic`.

## Verification

- `node_modules/.bin/tsc --noEmit` → **0 errors** ✅
- `node_modules/.bin/vite build` → **built successfully in 10.45s** ✅ (only pre-existing >500kB chunk-size warning, unrelated to this change)

## Design-token usage

All styling uses the existing `--cms-*` tokens (`--cms-teal-50/100/600/700`, `--cms-line`, `--cms-line-strong`, `--cms-surface`, `--cms-text`, `--cms-text-soft`, `--cms-text-muted`, `--cms-danger`) — no new colors introduced. Structural classes are pure Tailwind, matching the file's convention noted in its header comment.

## Notes for downstream agents

- The `College` / `AcademicYear` type definitions added at the top of `StudentsCenter.tsx` are NOT exported. If another component needs them, either duplicate (they're one-liners) or lift them into `lib/api.ts` and import from there.
- The create-student modal is intentionally simple — no avatar upload, no university/college/year creation inline. If you need to add those, follow the existing edit-profile modal's avatar-upload pattern (lines ~1320-1332 pre-change).
- `loadStudents(1)` is called after a successful create so the new student appears at the top of page 1. If you implement server-side sorting defaults later, this still works because it just refetches the current filter state.
