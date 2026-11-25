# Admin UI ↔ API Coverage Matrix — Wave 0 Recon

- **Date**: 2026-11-25
- **Base**: `origin/main` @ `750fb09` (post-offline era verified)
- **Scope**: `apps/api` admin/operator surface ↔ `apps/admin-web` UI surface
- **Method**: static scan of all 40 API controllers (admin/operator routes enumerated action-by-action, with auth attributes and DTOs) + full call-site grep of `apps/admin-web/src` (every literal/template path in `api.ts` and all components) + per-component UX profiling + design-system inventory. No feature code was written in this wave.

---

## 1. Executive summary

The backend exposes **157 admin/operator endpoints across 20 controllers** (13 pure `Admin*` controllers, `SystemSettingsController`, `SecurityController`, and 5 mixed controllers with admin sections: Academic, Library, Notifications, Questions, Stats). The admin console wires the large majority of them: content centers (Questions, Exams, Exam Courses, Library, Courses, Academic), users (Students, Admins, Roles), access (Codes), and governance (Audit, Analytics, Settings, Content Pages, Offline) are all functional.

The gaps are of four kinds:

1. At W0, 9 capability groups had NO UI. **W3–W6 wired 9 of them** (subscription revoke, question bulk import, 2FA, report assign, exam unpublish + student-view preview, library metadata edit, sent-notifications ledger + stats, dashboard feeds). Remaining: **offline package detail** (P3 — deep offline-package internals, tracked in OFFLINE-DEBT-REGISTER).
2. **Systemic interaction-model debt**: 6 `window.confirm` destructive actions, 6+ copy-pasted custom confirm modals (none with Esc/focus-trap), 5 destructive actions with **no confirmation at all** (library publish/archive, codes bulk revoke, lecture publish, session revoke).
3. **Arabic-first violations**: 12+ call sites render raw English enum wire values (`Active`, `Critical`, `FullSubject`…); 10+ hardcoded English/Arabic-only strings break the locale toggle.
4. **List completeness bugs**: 5 centers have no pagination (Questions/Exams/Codes fixed `pageSize=100`, Admins 50); **LibraryCenter fetches `pageSize=25` with no pager — rows 26+ are unreachable**.

**Design system**: `@cms/ui` exports 12 primitives (Button/Input/Badge/Card/Text/Box/Stack/Container/Grid/Spinner/Skeleton/Accordion) but admin-web imports **none of them**; `react-hook-form`, `zustand`, `axios`, `cva`, `clsx`, `tailwind-merge`, `@cms/types`, `@cms/utils` are declared-but-unused. The package's `test` script is **broken** (`vitest` not installed, `src/test-setup.ts` missing) and it has zero tests. The app's best primitive, `AccessibleModal` (portal, focus trap, Esc, scroll lock), is used by only 2 flows.

---

## 2. Coverage matrix

Legend — UI: `full` / `partial` / `none` (capability-equivalent surface counted as covered). UX: `modal` = modal/drawer-driven, `page` = page/inline-heavy, `broken` = user-visible defect.

| # | Capability (endpoints) | UI | UX | Priority | Proposed surface |
|---|---|---|---|---|---|
| 1 | Admin login, refresh, `me/permissions`, `me/ui-permissions` (AdminAuth 3/5) | full | page (login) + boot-time fetch | — | Keep; drive sidebar gating (current) |
| 2 | **Admin 2FA enable / disable** (AdminAuth 2/5) | **full (W4)** | TwoFactorCard on لوحة القيادة — enable → QR + secret + one-time recovery codes; disable requires password per API | done | no status endpoint exists (documented deviation); card never fakes state |
| 3 | Dashboard stats / revenue / student-growth (AdminDashboard 3/32) | full | charts | — | Keep |
| 4 | **recent-activity / top-subjects / reports-summary** (AdminDashboard 3/32) | **full (W6)** | DashboardFeeds on لوحة القيادة (super-admin): 3 cards, per-card error/empty states | done | — |
| 5 | Students list/search/filter/pagination, ban/unban/revoke-sessions, profile drawer tabs (AdminDashboard students + AdminStudents) | full | table + drawer + modals | — | Keep; P2 polish for raw enums in drawer tabs |
| 6 | Manual student create + avatar upload (AdminStudents POST + avatar) | full | modal | — | Keep |
| 7 | Admins CRUD, reset-password, status, delete w/ super-admin password (AdminDashboard admins 9) | full | modal (DialogLayer) | **P0** (a11y + native confirm) | Migrate DialogLayer onto shared `Dialog`; replace `window.confirm` on status (App.tsx:361) with `ConfirmDialog` |
| 8 | Roles CRUD + permission matrix + UI-permissions editors (AdminDashboard roles 9) | full | modals + shared ConfirmDialogs (W4) | — | D-18 fixed: subjects load from every semester; remaining dialog migration is P2 polish |
| 9 | Codes ledger/generate/activate/redemptions/single revoke (AdminDashboard codes 5) | full | modals + mandatory reason | — (single revoke is best-in-class) | Keep; adopt shared ConfirmDialog |
| 10 | **Bulk code revoke** (codes/{id}/revoke in loop) | **full (W3)** | ConfirmDialog + mandatory Arabic reason + per-item failure report | done | — |
| 11 | **Subscription revoke per student** (AdminDashboard subscriptions 1) | **full (W3)** | Row action with confirm + Arabic reason | done | — |
| 12 | Questions CRUD/publish/archive/unpublish/duplicate/preview/bulk-publish/bulk-archive (AdminQuestions + Questions admin) | full | drawer + confirm modal + bulk checkbox toolbar | — (best-in-app) | Keep; add pagination; adopt shared primitives |
| 13 | **Question bulk import** (Questions `/import`, CSV client-side parse → JSON rows) | **full (W5)** | QuestionImportModal: validation + explicit start + honest created/failed report | done | API takes JSON rows, not files — CSV is the client-side path; Excel users export CSV |
| 14 | Error-report triage resolve/reject (AdminQuestions reports) | full | inline panel + notes modal | — | Keep |
| 15 | Reports moderation list + status transitions (AdminReports 2/3) | full | table + modal | — | Keep |
| 16 | **Report assign** (AdminReports `/assign`) | **full (W5)** | تعيين row action → Dialog + admin Select → PUT + refresh | done | — |
| 17 | Exams CRUD/publish/archive/question-builder/results/stats/question-stats/candidates (AdminExams 14/15) | full | drawer + inline sections | — | Keep; P2: raw `result.status` enum (ExamsCenter:1866) |
| 18 | **Exam unpublish** (AdminExams `/unpublish`) + **student-view preview** (`/preview`) | **full (W6)** | unpublish = confirm w/ sessions-keep-snapshots text; preview = shared Dialog, ordered questions + options, no correctness flags | done | — |
| 19 | Exam-course bundles CRUD/publish/archive/exam attach/detach/reorder (AdminExamCourses 10) | full | panel + modals + confirm | — | Keep |
| 20 | Library upload pipeline (upload-url → PUT → complete-upload), publish/archive/delete (Library admin 6) | full | upload drawer + XHR progress + processing timeline | **P0** | Publish/archive need ConfirmDialog; **pagination missing — pageSize=25 cap makes rows 26+ unreachable** |
| 21 | **Library file metadata edit** (PUT `/library/{id}`) | **full (W6)** | edit modal: title/description/tags/lecture + PATCH-optional difficulty & targetQuality («بدون تغيير» = null) | done | new UI-permission key btn:library.edit (72 keys) |
| 22 | Courses + episodes CRUD, YouTube episodes, single-PUT uploads, abort flows (AdminCourses 14/15) | full | panels + EpisodeEditModal | **P0** | Replace `window.confirm` on course/episode delete (destroys videos) with danger ConfirmDialog |
| 23 | Academic tree browse/create/archive/restore + lecture publish (Academic admin 16) | full | 5-column board + inline forms + confirm modal | **P1** | Lecture publish needs confirm; add loading skeletons |
| 24 | Content pages list/upsert (AdminContentPages 2) | full | inline editor | P3 | EN-mode editor is Arabic-only (ContentCenter:146-173) |
| 25 | Notification send (targeted audiences) | **full (W5)** | compose modal + full audience cascade | — | D-22 fixed: College/Year/Semester/Subject resolve through cascade selects with visible Arabic validation; compose modal Esc/focus trap remains P2 |
| 26 | **Sent notifications list + delivery stats** (Notifications 2 admin) | **full (W6)** | SentNotificationsDialog (super-admin topbar «سجل الإشعارات»): paged ledger + per-row 5-counter stats panel | done | — |
| 27 | Offline packages list/revoke (AdminOffline 2/3) | full | table + confirm modal | P3 | Package-detail endpoint unused; `--c-*` token drift (see D-31) |
| 28 | Activity sessions/logs (AdminActivity 2) | full | tabs + pagination | — | Keep |
| 29 | Analytics 7 tabs (AdminAnalytics 7) | full | charts + date presets + CSV | P2 | Hardcoded English loading/empty strings (ReportsTabs:158,169-170) |
| 30 | Settings list/update/reset (SystemSettings 4) | full | inline edit | **P1** | `window.confirm` reset (SettingsCenter:153); default value parsed from description string (fragile) |
| 31 | Security console: alerts, audit logs, student logs/sessions/unbind/revoke (Security 6) | full | tables + pagination + modals | **P1** | Session revoke fires with no confirm (StudentsCenter:1217); raw severity in AuditLogViewer:344 |
| 32 | Scoped content lists (`/admin/content/questions|exams|files`, lectures picker) | partial | files used by LibraryCenter; questions/exams lists unused (superseded by dedicated controllers) | — | No action: capability covered via AdminQuestions/AdminExams |
| 33 | Academic hierarchy shared reads (universities/colleges/years/semesters/subjects) | full | cascade selects, URL-synced context | — | Keep; 9 components refetch independently (no shared cache) |
| 34 | Global stats (StatsController `/stats/global`) | full | stat cards | — | Keep |
| 35 | Legacy multipart resume status (AdminCourses) | none | — | P3 | Retained for API surface only (per api.ts:343 comment); leave |

**Totals**: 157 admin endpoints inventoried; capability-level coverage ≈ 146 wired (full/partial), 9 capability groups with **none**, plus partial-quality gaps inside wired groups (confirms, enums, pagination) listed above.

---

## 3. UX debt register (verified, with evidence)

### Interaction model (P0)
- **D-01** ~~`window.confirm` admin enable/disable~~ **FIXED (W4)** — shared ConfirmDialog with consequence text
- **D-02** `window.confirm` role status/delete — App.tsx:427, 441
- **D-03** `window.confirm` course delete (destroys all episodes + stored videos) — CoursesCenter.tsx:175
- **D-04** `window.confirm` episode delete (destroys stored video) — CoursesCenter.tsx:550
- **D-05** `window.confirm` settings reset — SettingsCenter.tsx:153
- **D-06** `window.confirm` UI-permissions reset — UiPermissionsEditor.tsx:177
- **D-07** Library publish (single click → student-visible) with **no confirm** — LibraryCenter.tsx:1106
- **D-08** Library archive with **no confirm** — LibraryCenter.tsx:1117
- **D-09** Codes bulk revoke: **no confirm**, silent per-item failure swallow, hardcoded English reason `'Bulk revoke by admin'` — CodesCenter.tsx:223-236, 313
- **D-10** Lecture publish (student-facing) **no confirm** — AcademicCenter.tsx:657
- **D-11** Student session revoke **no confirm** — StudentsCenter.tsx:1217
- **D-12** 6+ copy-pasted confirm-modal implementations (QuestionsCenter:1943, ExamsCenter:1911, ExamCoursesCenter:1208, AcademicCenter:812, LibraryCenter:1679, OfflineCenter:197) — none support Esc/focus-trap

### Accessibility (P1)
- **D-13** Only `AccessibleModal` has the full a11y contract (focus trap, Esc, scroll lock, focus restore, aria) but serves 2 flows; ~14 other dialog surfaces close only via backdrop/click
- **D-14** Drawers physically anchored `right-0` (StudentsCenter:822, QuestionsCenter:1173, ExamsCenter:1325) — wrong side in EN/LTR mode; need logical `inset-inline-end`
- **D-15** Command palette centering broken in RTL (App.tsx:801)
- **D-16** `document.documentElement.lang/dir` never updated on locale toggle (index.html static `ar`/`rtl`)
- **D-17** Buttons implement hover via JS `onMouseEnter/Leave` inline-style swaps (~40 sites) instead of CSS classes — no keyboard-focus parity

### Correctness (P0/P1)
- **D-18** ~~ScopePicker first-semester-only~~ **FIXED (W4)** — subjects load from every semester of the year; regression test locks both-semesters behavior
- **D-19** LibraryCenter `pageSize=25`, no pager — **rows beyond 25 unreachable** (LibraryCenter.tsx:415)
- **D-20** Fixed `pageSize` without pagination: Questions 100 (QuestionsCenter:329), Exams 100 (ExamsCenter:342), Codes 100 (CodesCenter:104), Admins 50 (App.tsx:246)
- **D-21** Settings default value parsed from description string via `split(':').pop()` — key without `:` silently disables reset (SettingsCenter.tsx:152)
- **D-22** Notification audience cascade: College/Year/Semester/Subject targets have **no target picker** — send blocked with no explanation (NotificationCompose.tsx:67-80)

### Arabic-first (P1)
- **D-23** Raw enums rendered to users: code status (CodesCenter:424, 604), exam result status (ExamsCenter:1866), log severity (StudentsCenter:1084, AuditLogViewer:344), session status (StudentsCenter:1203), event type (StudentsCenter:1046), scopeType camelCase-split hack (StudentsCenter:1351), report reason/status (StudentsCenter:1399, 1402), user role (App.tsx:605)
- **D-24** Hardcoded English: ReportsTabs loading/empty (158, 169-170), series name "Active" (225), error fallbacks `'Request failed.'` (CodesCenter:113+), `'Unable to load students.'` (StudentsCenter:230)
- **D-25** Arabic-only in EN mode: OfflineCenter statuses + toast (33-38, 77), ContentCenter editor (146-173), ExamsCenter error (432)

### Architecture (P2, documented for later waves)
- **D-26** No URL routing for views (App.tsx:113 `useState<View>`); refresh lands on overview; no deep links
- **D-27** App.tsx is a 1,079-line monolith owning admins/roles CRUD for 15 views
- **D-28** 9 components independently refetch the universities directory (no shared cache; zustand declared-but-unused)
- **D-29** `src/lib/dictionary.ts` (bilingual dictionary + `t()`) exists but is imported by nothing; ~15 hand-maintained copy objects instead
- **D-30** Unused deps: react-hook-form, @hookform/resolvers, zustand, axios, cva, clsx, tailwind-merge, @cms/ui, @cms/types, @cms/utils
- **D-31** OfflineCenter uses `--c-*`/`--grad-primary` token aliases + `--z-modal` — visual drift from the `--cms-*` system

### Positive patterns to standardize on
- QuestionsCenter bulk toolbar (select-all + per-row + count + publish/archive/clear)
- CodesCenter single-revoke modal with **mandatory reason textarea**
- StudentsCenter paginated/filtered table + 7-tab drawer with per-tab loading/empty states
- `AccessibleModal` a11y contract → basis for the shared `Dialog` primitive
- URL-persisted academic context (`lib/academicContext.ts`) shared across centers

---

## 4. Design-system recon

**@cms/ui (packages/ui)** — 12 exported primitives: `Button` (cva variants primary/secondary/ghost/danger/success/glass/link, loading, icon slots), `Input` (error/success states, logical padding), `Badge`, `Card`, `Text`, `Box`, `Stack`, `Container`, `Grid`, `Spinner`, `Skeleton`, `Accordion` (aria-expanded/controls, best-in-package). Styling: Tailwind utilities + `cn()` (clsx+tailwind-merge), tokens via `var(--c-*)` — aliased to `--cms-*` inside admin-web's `globals.css`, so the package is drop-in compatible token-wise.

**Gaps proven by recon**: no Dialog/Modal, no ConfirmDialog, no Drawer, no Select, no Checkbox, no Table, no Pagination, no focus-trap anywhere in the package. Zero tests; `test` script unrunnable (`vitest`/`@vitejs/plugin-react`/`jsdom`/RTL not in devDependencies; `vitest.config.ts` references a missing `src/test-setup.ts`).

**Net-new primitives planned (Wave 1, in @cms/ui, documented per PR)**: `Dialog`, `ConfirmDialog`, `Drawer`, `Select`, `Checkbox`, `Table` (shell), `Pagination`. All will follow the DESIGN_SYSTEM.md conventions: `cn()` composition, cva where variants exist, logical (`ps/pe/start/end`) utilities only, `size`/`variant` API shape, Vitest+RTL tests colocated, barrel-only imports.

**admin-web adoption path**: admin-web's Tailwind 4 CSS-first build must scan `packages/ui/src` for class generation (add `@source`), and `vitest.config.ts` needs the `@cms/*` resolution (workspace symlinks already exist after `pnpm install`).

---

## 5. Wave plan (P0/P1 only unless capacity remains)

| Wave | Scope | Debt items |
|---|---|---|
| 1 | @cms/ui: Dialog, ConfirmDialog, Drawer, Select, Checkbox, Table, Pagination + repair ui test infra + RTL tests; admin-web `@source` adoption | D-12, D-13 (foundation) |
| 2 | Content centers: Questions, Exams, ExamCourses, Library, Courses, Academic — shared ConfirmDialog for all destructive actions, drawer a11y + logical anchors, pagination, Arabic enum glossary | D-03, D-04, D-07, D-08, D-10, D-19, D-20 (partial), D-23 (content), D-14 |
| 3 | Codes bulk revoke (confirm + reason + failure report), Offline token alignment, StudentsCenter destructive confirms + subscription revoke action + Arabic statuses | D-09, D-11, D-23 (users/codes), matrix #11, D-31 |
| 4 | Roles/Admins: window.confirm removal, Dialog migration, ScopePicker semester fix, 2FA self-service UI | D-01, D-02, D-18, matrix #2 |
| 5 | Remaining P1: question import modal, notification audience cascade, reports assign, session-revoke confirms (if not in W3) | D-22, matrix #13, #16 |
| 6 | Polish: glossary sweep, empty/error parity, keyboard pass, this doc updated to final state + handoff | D-24, D-25, D-16 |

Deferred (P2/P3, with reason): URL routing for views D-26 (large refactor, no operator-blocking defect); dictionary adoption D-29 (touch-every-file copy change); library metadata edit / exam preview / sent-notifications / assign / overview feeds (P2 rows above); multipart legacy D-35 (dead surface).

---

## 6. Verified baselines

> **Waves 4–5 status (2026-11-25, this update)** — W4 (PR #206, merged `ec1aa1d`) and W5 (PR #207) flipped the
> P1 rows above. admin-web vitest 120 → **136** (+16: 7 W4 + 9 W5); @cms/ui 39/39; eslint max-warnings=0 and
> `tsc --noEmit` clean throughout; production build green. No new runtime dependencies; no API changes.
>
> **W6 (2026-11-25, coverage completion)** — rows 4/18/21/26 wired (dashboard feeds, exam unpublish + preview, library metadata edit,
> sent notifications + stats); rows 10/11 flipped (stale — W3 had fixed them). admin-web vitest 136 → **149**; new UI-permission key
> `btn:library.edit` (registry 71 → **72** keys). Security wave (same session): CodeQL log-forging ×6 closed + 41 dead-code alerts
> fixed + obj/bin artifacts excluded — see PR #208.

| Gate | Result |
|---|---|
| `pnpm --filter @cms/admin-web lint` (max-warnings=0) | ✅ exit 0 |
| `pnpm --filter @cms/admin-web test` | ✅ 14 files, 100/100 tests |
| `pnpm --filter @cms/ui test` | ❌ fails — `vitest: not found` (repaired in Wave 1) |
| CI on PRs to main runs for admin-web | `pnpm --filter @cms/admin-web test` only (lint not CI-gated; local gate applies) |
