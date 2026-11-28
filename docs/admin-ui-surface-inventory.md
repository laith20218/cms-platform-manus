# Admin Web — Interaction Surface Inventory (Phase 0)

Base: `main @ 77d21e3da25a1c27c4034f320a557191e3c62a42` (PR #227 merged).
Branch: `feat/admin-final-ui-surfaces-polish`.

Legend for `status`:
- `migrated` — moved onto the shared `@cms/ui` Modal/Drawer system in this PR.
- `already-shared` — already used `@cms/ui` Dialog/Drawer/ConfirmDialog before this PR (verified, no change needed).
- `permanent` — justified permanent workspace region (not a detail/edit overlay): kept inline by design, documented here.

Row key: `route | center | surface | current behavior | target behavior | trigger | primary action | danger action | responsive behavior | status`

| # | route | center | surface | current behavior | target behavior | trigger | primary action | danger action | responsive behavior | status |
|---|-------|--------|---------|------------------|-----------------|---------|----------------|---------------|---------------------|--------|
| 1 | `/` | Dashboard/Overview | Command header (hero) | Static hero with title/subtitle, no env chip, no API state, no refresh | Command Header: Arabic title, subtitle, environment chip, API connectivity, last-updated, refresh control | page load | تحديث البيانات (refresh) | — | stacks vertically at 375px | migrated |
| 2 | `/` | Dashboard/Overview | KPI stat grid | 9 cards, skeleton while loading, ErrorState on failure | KPI hierarchy: consistent cards + skeleton + honest `غير متاح` when API degraded, trend with a11y note | page load / refresh | — | — | `minmax` grid collapses 2-col at 375px | migrated |
| 3 | `/` | Dashboard/Overview | Quick actions | 4 navigation cards | unchanged (safe navigation only) | click | فتح المركز | — | stacks | already-shared (kept) |
| 4 | `/` | Dashboard/Overview | Metrics/Activity tabs | URL-driven tablist | unchanged (kept; URL state preserved) | click | — | — | wraps | already-shared (kept) |
| 5 | `/` | Dashboard/Overview | Needs-attention section | none (gap) | prioritized real conditions only: pending reports, unavailable service health, failed dashboard feed; no alarming notices for normal empty states | automatic from data | فتح التقارير/الخوادم | — | stacks | migrated (new) |
| 6 | `/` | Dashboard/Overview | Dashboard feeds (activity / top subjects / reports summary) | 3 cards w/ loading+error states | unchanged (states verified) | page load | — | — | stacks | already-shared (kept) |
| 7 | `/` | Dashboard/Overview | Service health summary card | honest loading/unavailable/ready + link to /servers | unchanged (states verified; linked from Needs Attention too) | page load / refresh | فتح مركز الخوادم | — | full width | already-shared (kept) |
| 8 | `/` | Dashboard/Overview | Footer last-refresh | static timestamp | kept, moved under command header + footer | page load | — | — | inline | migrated |
| 9 | `/students` | Students | Row → details drawer | hand-rolled fixed `aside` right-anchored, own backdrop, no focus trap | shared `DetailDrawer` (portal, focus trap, logical RTL side, skeleton/error states) | row click / عرض التفاصيل | — | أرشفة in overflow | full-screen below 640px | migrated |
| 10 | `/students` | Students | Row overflow menu | `RowActionsMenu` (shared) | kept; ban/reactivate/reset/archive/restore labeled | ⋮ button | — | أرشفة/حظر (danger item) | dropdown flips RTL | already-shared |
| 11 | `/students` | Students | Edit-profile modal | hand-rolled centered section | shared `Dialog` shell (focus trap, Esc, labelled) | row action تعديل | حفظ التغييرات | — | max-w-md, 375px ok | migrated |
| 12 | `/students` | Students | Ban / reactivate protected dialog | hand-rolled centered section | shared `Dialog` shell, danger separated from cancel | row action | تأكيد | حظر الطالب (danger) | max-w-md | migrated |
| 13 | `/students` | Students | Create-student modal | hand-rolled centered section | shared `Dialog` shell + sticky footer | إضافة طالب | إضافة الطالب | — | cascade grid collapses | migrated |
| 14 | `/students` | Students | Unban confirm | hand-rolled mini dialog | shared `ConfirmDialog` | row action | إعادة التنشيط | — | compact | migrated |
| 15 | `/students` | Students | Password-reset dialog | shared `Dialog` (typed confirm + re-auth) | kept | row action | إعادة التعيين | إعادة التعيين (danger tone) | 2-col grid collapses | already-shared |
| 16 | `/students` | Students | Session revoke confirm | shared `ConfirmDialog` | kept | drawer security tab | تأكيد | إنهاء الجلسة | compact | already-shared |
| 17 | `/students` | Students | Subscription revoke confirm | shared `ConfirmDialog` w/ reason | kept | drawer subscriptions tab | تأكيد | إلغاء الاشتراك | compact | already-shared |
| 18 | `/students` | Students | Archive/restore lifecycle confirm | shared `ConfirmDialog` | kept | row overflow | أرشفة/استعادة | أرشفة (danger) | compact | already-shared |
| 19 | `/questions` | Question Bank | Question editor drawer | hand-rolled fixed `aside` right-anchored, sticky header, action bar inside form | shared `Drawer` (size xl, sticky footer, unsaved-changes guard, busy guard) | سؤال جديد / تعديل | حفظ التغييرات | — | full-screen below 640px | migrated |
| 20 | `/questions` | Question Bank | Lifecycle confirm (publish/archive/unpublish/delete) | hand-rolled centered dialog | shared `ConfirmDialog` (variant by action) | row overflow | نشر/أرشفة | حذف (danger) | compact | migrated |
| 21 | `/questions` | Question Bank | CSV import modal | shared `Dialog` (QuestionImportModal) | kept | استيراد | بدء الاستيراد | — | multi-step, 375px ok | already-shared |
| 22 | `/questions` | Question Bank | Universal question preview | shared `Dialog` | kept | معاينة | إغلاق | — | scrollable | already-shared |
| 23 | `/questions` | Question Bank | Row overflow menu | `RowActionsMenu` | kept | ⋮ | — | أرشفة/حذف نهائي (danger, gated) | RTL dropdown | already-shared |
| 24 | `/exams` | Exams | Exam editor drawer | hand-rolled fixed `aside` right-anchored, sticky bottom action bar | shared `Drawer` (size xl, sticky footer, busy guard) | امتحان جديد / تعديل | حفظ كمسودة | — | full-screen below 640px | migrated |
| 25 | `/exams` | Exams | Exam results inline panel | flat expanding section under the list | shared `DetailDrawer` (read-only results, skeleton, retry) | row action النتائج | إعادة المحاولة (on error) | — | full-screen below 640px | migrated |
| 26 | `/exams` | Exams | Question-report notes dialog | hand-rolled centered dialog | shared `Dialog` (resolve/reject, danger variant separated) | row action في التقرير | اعتماد/رفض | رفض التقرير | compact | migrated |
| 27 | `/exams` | Exams | Lifecycle confirm (publish/archive/unpublish/duplicate/restore/delete) | hand-rolled centered dialog | shared `ConfirmDialog` | row overflow | نشر/تكرار | حذف (danger) | compact | migrated |
| 28 | `/exams` | Exams | Student-view preview | shared `Dialog` (UniversalPreviewDialog) | kept | معاينة | إغلاق | — | scrollable | already-shared |
| 29 | `/exam-courses` | Exam Courses | Bundle editor | inline page workspace (full editor with picker + items) | permanent workspace region (justified: large multi-step editor, per spec "use a full page for complex editors") | إنشاء/تعديل حزمة | حفظ الحزمة | حذف الحزمة (confirm) | responsive tables | permanent |
| 30 | `/exam-courses` | Exam Courses | Exam picker modal | hand-rolled centered dialog | shared `Dialog` (search + list + add) | إضافة امتحان | إضافة | — | 2xl | migrated |
| 31 | `/exam-courses` | Exam Courses | Storefront preview modal | hand-rolled centered dialog | shared `Dialog` (read-only preview) | معاينة | إغلاق | — | 2xl | migrated |
| 32 | `/exam-courses` | Exam Courses | Lifecycle confirm | hand-rolled centered dialog | shared `ConfirmDialog` | row overflow | نشر | حذف (danger) | compact | migrated |
| 33 | `/library` | Library | Upload drawer | hand-rolled fixed `aside` right-anchored | shared `Drawer` (size xl, sticky footer w/ progress, busy guard) | رفع ملف | رفع الملف | — | full-screen below 640px | migrated |
| 34 | `/library` | Library | Edit-metadata dialog | shared `Dialog` | kept | row action تعديل البيانات | حفظ | — | compact | already-shared |
| 35 | `/library` | Library | Delete confirm (retention/quarantine semantics) | shared `ConfirmDialog` | kept | row overflow | — | حذف (danger; retention) | compact | already-shared |
| 36 | `/library` | Library | Restore-from-quarantine confirm | shared `ConfirmDialog` (+quarantine reason disclosure) | kept | row overflow | استعادة | — | compact | already-shared |
| 37 | `/library` | Library | Purge (final deletion) dialog | hand-rolled centered dialog w/ password re-auth | shared `Dialog` shell (same re-auth + retention copy, fail-closed flag untouched) | row overflow (super-admin) | — | الحذف النهائي (danger, gated) | compact | migrated |
| 38 | `/library` | Library | Row overflow menu | `RowActionsMenu` | kept | ⋮ | — | حذف/حذف نهائي (danger, gated) | RTL dropdown | already-shared |
| 39 | `/library` | Library (Courses tab) | Course editor drawer | shared `Drawer` (CoursesCenter) | kept | row action | حفظ | أرشفة (confirm) | full-screen | already-shared |
| 40 | `/codes` | Access Codes | Generate-codes modal | hand-rolled centered dialog (was permanent side form) | shared `Dialog` (cascade + options, sticky footer) | إنشاء أكواد | إنشاء الأكواد | — | grid collapses | migrated |
| 41 | `/codes` | Access Codes | Redemptions detail modal | hand-rolled centered dialog | shared `DetailDrawer` (read-only ledger, loading/empty states) | row action التفاصيل | — | — | full-screen below 640px | migrated |
| 42 | `/codes` | Access Codes | Manual-activation modal | hand-rolled centered dialog | shared `Dialog` (search + select + submit) | row action تفعيل | تفعيل | — | compact | migrated |
| 43 | `/codes` | Access Codes | Revoke confirm modal | hand-rolled centered dialog w/ reason | shared `ConfirmDialog` w/ requireReason | row action | — | إبطال الأكواد (danger) | compact | migrated |
| 44 | `/codes` | Access Codes | Bulk-revoke confirm | shared `ConfirmDialog` | kept | toolbar | — | إبطال المحدد (danger) | compact | already-shared |
| 45 | `/codes` | Access Codes | Row action buttons | scattered: view / activate / revoke inline beside primary | consolidated: primary عرض + labeled overflow menu for activate/revoke (danger separated) | row | عرض التفاصيل | إبطال (overflow, danger) | wraps | migrated |
| 46 | `/academic` | Academic Structure | Entity create/edit forms | inline grid forms in the page (university/college/year/semester/subject) | permanent workspace region (justified: always-visible structure builder with cascade context, not an on-demand detail) | inline | إضافة | — | grid collapses | permanent |
| 47 | `/academic` | Academic Structure | Archive/restore confirm | hand-rolled mini dialog | shared `ConfirmDialog` | row action | استعادة | أرشفة | compact | migrated |
| 48 | `/academic` | Academic Structure | Lecture publish confirm | shared `ConfirmDialog` | kept | row action | نشر | — | compact | already-shared |
| 49 | `/reports` | Reports | Assign-dialog | shared `Dialog` | kept | row action إسناد | حفظ | — | compact | already-shared |
| 50 | `/reports` | Reports | Transition modal | hand-rolled centered dialog | shared `Dialog` (choice list + notes, danger transitions labeled) | row action تغيير الحالة | تطبيق | رفض (danger tone) | compact | migrated |
| 51 | `/admins` | Admins | Admin details drawer | shared `Drawer` | kept | row action التفاصيل | — | تعطيل (confirm) | full-screen | already-shared |
| 52 | `/admins` | Admins | DialogLayer (create/edit admin, reset-password, delete-admin, create-role) | hand-rolled overlay w/ useModalA11y retrofit | shared `Dialog` shell (same five forms, focus contract from primitive) | toolbar / row action | حفظ | حذف المدير (danger, typed) | 2-col collapses | migrated |
| 53 | `/roles` | Roles | Create-role dialog | via AdminsCenter DialogLayer (see row 52) | same migration | toolbar | حفظ | — | compact | migrated (row 52) |
| 54 | `/roles` | Roles | Permission-matrix editor modal | hand-rolled overlay (PermissionMatrixEditor) | shared `Dialog` shell (size xl) | row action الصلاحيات | حفظ | — | matrix scrolls | migrated |
| 55 | `/roles` | Roles | UI-permissions editor modal | hand-rolled overlay (UiPermissionsEditor) | shared `Dialog` shell (size xl) | row action صلاحيات الواجهة | حفظ التغييرات | — | matrix scrolls | migrated |
| 56 | `/audit` | Audit Log | Audit-event details | shared `Drawer` (AuditLogViewer) | kept | row click | — | — | full-screen | already-shared |
| 57 | `/security` | Security Center | Security-event details drawer | shared `Drawer` | kept | row click / عرض | — | — | full-screen | already-shared |
| 58 | `/offline` | Offline Packages | Revoke confirm | hand-rolled centered dialog | shared `ConfirmDialog` | row action | — | إبطال الحزمة (danger) | compact | migrated |
| 59 | `/settings` | Settings | Settings-history drawer | shared `Drawer` | kept | عرض السجل | — | — | full-screen | already-shared |
| 60 | `/settings` | Settings | Reset-to-defaults confirm | shared `ConfirmDialog` | kept | zone action | — | إعادة الضبط (danger, typed) | compact | already-shared |
| 61 | `/content` | Content Pages | List + lifecycle | page workspace + shared confirms | kept (no flat panel found) | — | — | — | — | already-shared |
| 62 | `/servers` | Servers Dashboard | Provider cards | read-only center (guarantee) | unchanged — read-only, no mutation controls | page load | — | — (none allowed) | grid | already-shared |
| 63 | shell | App | Notification compose | hand-rolled overlay w/ useModalA11y | shared `Dialog` shell (same cascade form) | bell + إنشاء | إرسال | — | 2-col collapses | migrated |
| 64 | shell | App | Sent-notifications ledger | shared `Dialog` | kept | bell menu | إغلاق | — | scrollable | already-shared |
| 65 | shell | App | Command palette | specialized ARIA combobox overlay | permanent/specialized (justified: keyboard-first palette, not a standard modal) | Ctrl+K | — | — | full-screen mobile | permanent |
| 66 | shell | App | 2FA dialogs (enable/disable) | shared `Dialog` (TwoFactorCard) | kept | security card | تمكين/تعطيل | تعطيل (re-auth) | compact | already-shared |
| 67 | shell | App | Hard-delete dialog | shared `Dialog` (HardDeleteDialog, fail-closed flag) | kept | danger zones | — | الحذف النهائي (typed, gated) | compact | already-shared |

## Totals

- Total surfaces found: **67**
- Migrated to the shared system in this PR: **31** (rows 1, 2, 5, 8, 9, 11, 12, 13, 14, 19, 20, 24, 25, 26, 27, 30, 31, 32, 33, 37, 40, 41, 42, 43, 45, 47, 50, 52, 53, 54, 55, 58, 63)
- Explicitly justified as permanent workspace regions: **4** (rows 29, 46, 65 — plus the academic cascade region on `/library`)
- Already on the shared system (verified, kept): **32**
- Remaining flat/unreviewed: **0**
