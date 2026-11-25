# Admin-Web UI/UX — Waves 4 & 5 Handoff

Executor session 2026-11-25. Scope per instruction: **W4 (Roles/Admins/Scope/2FA) + W5 (Import/Notifications/Report assign) only.**

---

## 1) SHAs & PRs

| Wave | Branch | PR | Result | Merge SHA |
|---|---|---|---|---|
| start | — | — | main verified at `96ac686` (PR #205 / W3 already merged by owner's CI window; state checked, not assumed) | — |
| W4 | `feat/admin-ui-w4-roles-2fa-scope` | [#206](https://github.com/laith20218/cms-platform-manus/pull/206) | **merged** | `ec1aa1d` |
| W5 | `feat/admin-ui-w5-import-notify-assign` | [#207](https://github.com/laith20218/cms-platform-manus/pull/207) | **open — merging on required-CI green** (this PR carries these docs); final main SHA recorded in the executor's closing report | — |

### 1.1 Documented red (NOT invented green)
- **W4 Lighthouse CI failed on PR #206** — job log (run `45656510722`, attempts 1 & 2): `npm error 404 Not Found — @sentry/server-runtime-injection-11.18.0.tgz` — an npm-registry-side flake for a transient @sentry tarball. The branch touches **zero dependency files** (verified via `git diff origin/main --name-only`), all required jobs were green, and `mergeable_state: unstable` confirms Lighthouse is non-required. Evidence appended to the PR body before merging.
- **main @ 96ac686 push-run** also has a red **CodeQL Analysis** step (pre-existing, external scanner flake; the same job passed on the W4/W5 PRs). No action taken — not a repo defect.

## 2) What shipped

### W4 — Roles / Admins / Scope / 2FA (PR #206)
- **D-18 (correctness P0)**: ScopePicker loaded subjects from the **first semester only** — subjects in semesters 2+ were unassignable as admin scope. Now subjects load from **every semester** of the selected year (per-semester failures tolerated). Client data path only. Cascade selects got aria-labels (labels were unassociated).
- **D-01/D-02**: the last `window.confirm` surfaces (admin status, role status, role delete in App.tsx) → shared ConfirmDialogs with bilingual consequence text; role delete is danger + **acknowledge-gated**. The super-admin password gate on admin delete is untouched.
- **2FA self-service (was UI=none)**: `TwoFactorCard` on لوحة القيادة for every operator — enable → API's **QR + manual secret + one-time recovery codes** (copyable, «تظهر مرة واحدة فقط» warning); disable → password dialog per API contract. **Documented deviation**: no 2FA-status endpoint exists, so the card shows no current state and never fakes one; API verdicts surface verbatim.
- **D-06**: UiPermissionsEditor reset-to-full (NULL = full access) → danger ConfirmDialog with acknowledge gate.

### W5 — Import / Notifications / Assign (PR #207)
- **Question bulk import (was UI=none)**: `QuestionImportModal` from بنك الأسئلة toolbar (new UI-permission key `btn:questions.import`, registry 62→63 keys, mirror test updated). CSV → RFC-4180 parser (quoted commas, EN/AR header aliases) → client-side validation with Arabic reasons → **explicit «بدء الاستيراد»** → honest report (الإجمالي / أُنشئت / فشلت + backend errors verbatim). **Deviation documented**: the live API takes structured JSON rows (not a file), so CSV is the client-side path; Excel users export CSV.
- **D-22**: NotificationCompose College/Year/Semester/Subject audiences resolve through a real cascade (context selects above the target select); **visible Arabic validation** replaces the silently-disabled Send; the audience select is aria-labelled.
- **Report assign (was UI=none)**: «تعيين» row action in التقارير والتحليلات → Dialog + admin Select (directory from `/api/v1/admin/admins`) → `PUT /api/v1/admin/reports/{id}/assign` → toast + refresh. Fixed a real refresh bug: post-action `setPage(page)` was a no-op on page 1 → refresh counter.

## 3) Test deltas (local gates, all green)

| Suite | Session start (main 96ac686) | After W4 | After W5 (final) |
|---|---|---|---|
| admin-web vitest | 120 (20 files) | 127 (22) | **136 (25 files)** |
| `@cms/ui` vitest | 39 (7 files) | 39 | 39 |
| `tsc --noEmit` | clean | clean | clean |
| `eslint --max-warnings=0` | exit 0 | exit 0 | exit 0 |
| production build | ✓ | ✓ | ✓ |

New tests: W4 +7 (`scope-picker` 2, `two-factor-card` 5); W5 +9 (`question-import-modal` 4, `notification-compose-cascade` 3, `reports-assign` 2). The `ui-permissions` mirror test was updated 70→71 keys / 47→48 buttons (intentional registry addition).

## 4) Dependencies added

None in either wave (runtime or dev). CSV parsing is a ~40-line client parser; all dialogs/selects are @cms/ui primitives.

## 5) Owner click-paths (8–12)

1. لوحة القيادة → card «أمان الحساب — المصادقة الثنائية (2FA)» → «تفعيل المصادقة الثنائية» → dialog shows QR + manual key + 10 recovery codes → copy codes → «إلغاء» closes.
2. Same card → «تعطيل المصادقة الثنائية» → password dialog → confirm button disabled until typed → wrong password shows the API's Arabic error and keeps the dialog open.
3. المدراء (super) → تعطيل on an admin → **ConfirmDialog** («سيُعطَّل الحساب وتُبطل جلساته») — not a browser confirm; «إلغاء» never fires.
4. الأدوار → حذف on a role → danger dialog requires checking «أفهم أن الحذف نهائي…» before «حذف» enables.
5. إنشاء/تعديل مدير → ScopePicker → pick جامعة → كلية → السنة الأولى → **المادة list now contains subjects from BOTH semesters** (الفصل الأول والثاني) — the D-19 regression lock.
6. الأدوار → صلاحيات الواجهة → «إعادة إلى الوصول الكامل» → danger dialog with acknowledge gate (was browser confirm).
7. بنك الأسئلة → pick subject → «استيراد أسئلة» → choose CSV → «تم التحقق من N سؤال» → «بدء الاستيراد» → result shows أُنشئت/فشلت + server errors → «إتمام».
8. Same modal with a bad CSV (answer column "X") → «الإجابة الصحيحة يجب أن تكون A أو B أو C أو D» in Arabic; «بدء الاستيراد» stays disabled.
9. الإشعارات → الجمهور = مادة محددة → cascade الجامعة→الكلية→السنة→الفصل→المادة → hint disappears once the target resolves → «إرسال» sends with the resolved subjectId.
10. Same compose with الجمهور = سنة محددة and no target chosen → Arabic hint «اختر الهدف…» and Send cannot fire.
11. التقارير والتحليلات → moderation row → «تعيين» → admin directory loads → pick «مدير المراجعة الأولى» → «حفظ» → toast «تم تعيين المسؤول للبلاغ» + the المسؤول column refreshes.
12. Keyboard pass on any new dialog: Tab cycles inside; Esc closes; focus returns to the invoker.

## 6) Residuals / deferred (with reasons)

- **Endpoints still without UI** (all P2/P3, unchanged from W0 except the four now wired): exam student-view preview (`GET /admin/exams/{id}/preview`), library file metadata edit (`PUT /library/{id}`), sent-notifications list + delivery stats, dashboard recent-activity/top-subjects/reports-summary feeds, exam unpublish, offline package detail. Reasons: priority P2/P3 per matrix; W4/W5 budget went to the four P1 none-rows.
- **Glossary leftovers (W6 class, string-only)**: AuditLogViewer raw severity chip; ReportsTabs hardcoded EN loading/empty strings; OfflineCenter `--c-*` token drift (D-31); SettingsCenter default-value parsing fragility (D-21).
- **Compose modal a11y**: NotificationCompose/DialogLayer still lack the shared Dialog's focus trap/Esc contract (migrating those two large modals is a bigger refactor — flagged for a future wave, non-blocking).
- **Waves 6+** (URL routing D-26, dictionary adoption D-29, glossary sweep): out of the W4+W5 mandate.

## 7) P12

Verified **0/0** after every push this session (W4 ×1, W5 ×1 + docs push). Token lives only in `/home/z/my-project/.gh_token` (outside the repo tree); never committed, never in a PR body, git config, or remote URL.
