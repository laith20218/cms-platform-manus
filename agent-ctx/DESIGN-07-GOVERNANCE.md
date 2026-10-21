# DESIGN-07-GOVERNANCE — admin-web governance components (Admins · Roles · Audit) institutional redesign

**Agent:** DESIGN-07-GOVERNANCE
**Task:** Extract the inline `AdminsView` / `RolesView` / `DialogLayer` functions from `apps/admin-web/src/App.tsx` into three new component files under `apps/admin-web/src/components/`, redesign them with Tailwind utility classes (matching the institutional pattern set by `StudentsCenter.tsx` / `QuestionsCenter.tsx`), and add a brand-new **AuditCenter** component that surfaces critical security alerts from the existing `GET /api/v1/security/alerts` endpoint. Add `audit` to the `View` union and the Governance nav group.

---

## Files touched

| File | Lines before | Lines after | Change |
| --- | --- | --- | --- |
| `apps/admin-web/src/App.tsx` | 1097 | 904 | Removed inline `AdminsView` (901–981), `RolesView` (983–1022), and `DialogLayer` (1024–1095) — 195 lines deleted. Removed 5 now-unused lucide imports (`Edit3`, `Eye`, `LockKeyhole`, `Plus`, `Trash2`). Removed unused `ActiveDialog` type alias. Added `audit` to the `View` union, the Governance nav group, the `isManagementView` predicate, and the `viewTitle` switch. Added `view === 'audit'` render branch routing to `<AuditCenter>`. Added imports for `AdminsCenter`, `RolesCenter`, `AuditCenter`, `DialogLayer`. Replaced inline `<AdminsView>` / `<RolesView>` JSX with `<AdminsCenter>` / `<RolesCenter>`. The `<DialogLayer>` call site is unchanged (now resolves to the imported symbol). |
| `apps/admin-web/src/components/AdminsCenter.tsx` | — | 563 | **NEW FILE.** Exports `AdminsCenter` (table view) and `DialogLayer` (modal renderer for all 5 dialog kinds). Page header with eyebrow + bilingual title + count badge + add-admin primary action; filter bar (search · role · status · clear) inside a bordered card; responsive table with avatar + identity (name / email / phone / created date) + role badge (teal pill) + scope badge (ivory pill) + status badge (emerald for active, red for disabled, with dot indicator) + last-login + row actions (view · edit · reset-password · enable/disable · delete). 6-row shimmer skeleton mirroring the table layout. Two-tier empty state with KeyRound-less UsersRound icon, message, and conditional clear-filters CTA. DialogLayer: sticky header with danger/teal icon tile + title + close; create/edit form uses 2-col grid with role select filtered to active roles, optional initial-password field with reminder, and conditional scope note; reset-password form shows target identity card + new password; delete form shows red-tinted danger banner + target card with red left border + super-admin password field; create-role form uses 2-col grid for technical+Arabic names with pattern validation and a permissions note. All action bars are sticky-bottom with secondary (line-strong border) + primary (teal-700 fill) or danger (danger-50 fill) buttons. |
| `apps/admin-web/src/components/RolesCenter.tsx` | — | 256 | **NEW FILE.** Exports `RolesCenter`. Page header with KeyRound icon tile + eyebrow + bilingual title + count badge + create-role primary action. Responsive role-card grid (1 col mobile · 2 cols sm · 3 cols lg) — each card shows: status pill (emerald active / red disabled with dot) + system/custom badge (teal for system, ivory for custom) · bilingual role name (h3) · technical name in mono teal · description (2-line clamp) · metrics row with UsersRound + ShieldCheck icon tiles and admin-count + permission-count · action bar with toggle-status button (amber hover when active, emerald hover when disabled) and optional delete button for custom roles only. `super_admin` role cannot be toggled (button disabled with title tooltip). 6-card skeleton loading. Empty state with KeyRound icon + bilingual message. |
| `apps/admin-web/src/components/AuditCenter.tsx` | — | 410 | **NEW FILE.** Exports `AuditCenter`. Page header with ShieldCheck icon tile + eyebrow + bilingual title "السجل الأمني" / "Security Audit" + count badge + bilingual subtitle. Three severity summary cards (Critical / Warning / Info) using `--cms-danger-50` / `--cms-warning-50` / `--cms-info-50` tints with big count number. Filter bar with severity select (All/Critical/Warning/Info) + search input (right-aligned Search icon for RTL) + clear-filters button (only when filters active). Responsive audit table with columns: Time (medium+short format) · Type (event-type icon tile + bilingual label, with `EVENT_ICON` map: LoginSuccess/Failed/Logout/Session*=LogIn, Refresh/RefreshReuse=RefreshCw, Device*=Smartphone, Devtools/Screenshot/Copy/Download*=ShieldAlert, Mfa*=ShieldCheck, Ban*=Ban) · Severity (badge: Info=sky, Warning=amber, Critical=red, with dot) · Description (max-w-md) · Actor (mono code showing Admin/Student/System + 8-char id prefix) · IP (mono, em-dash when null). Severity-aware icon tile tints via `EVENT_ICON_TINT` and `EVENT_ICON_COLOR` maps. 6-row shimmer skeleton. Empty state "لا توجد أحداث أمنية" / "No security events" with ClipboardList icon and two-tier message (no events vs no matches). Data fetched from `GET /api/v1/security/alerts?count=100` with debounced useEffect (200ms). |

No other files were touched. No dependencies added. No API paths changed. No backend changes.

---

## What was preserved (zero functionality regressions)

1. **Admin CRUD** — list, search, role-filter, status-filter, create, edit, reset-password, enable/disable, permanent-delete (with super-admin password confirmation). All API paths unchanged:
   - `GET /api/v1/admin/admins?page=&pageSize=&search=&roleId=&isActive=`
   - `POST /api/v1/admin/admins`
   - `PUT /api/v1/admin/admins/{id}`
   - `DELETE /api/v1/admin/admins/{id}` (with `currentSuperAdminPassword`)
   - `POST /api/v1/admin/admins/{id}/status` (`{ isActive }`)
   - `POST /api/v1/admin/admins/{id}/reset-password` (`{ newPassword }`)
2. **Role CRUD** — list, create (empty + permissions note), toggle-status, delete (custom only, system protected, super_admin cannot be toggled). API paths unchanged:
   - `GET /api/v1/admin/roles`
   - `POST /api/v1/admin/roles`
   - `POST /api/v1/admin/roles/{id}/status`
   - `DELETE /api/v1/admin/roles/{id}`
3. **Dialog kinds** — all 5 dialog kinds preserved (create-admin · edit-admin · reset-password · delete-admin · create-role). Form fields, validation (`minLength={12}` on initial password and new password; `pattern="[A-Za-z0-9_]{3,50}"` on role technical name), and field semantics unchanged.
4. **Shared dialog state** — the `dialog` state still lives in `App.tsx`. The same `dialog.kind` union is rendered by the imported `DialogLayer`. The dialog still appears regardless of which Governance view (admins / roles / audit) is active, because `<DialogLayer>` is rendered by `App.tsx` outside the AnimatePresence block (matching the original behaviour exactly).
5. **Admin/role state** — `admins`, `roles`, `totalAdmins`, `loadingData`, `query`, `roleFilter`, `statusFilter`, `dialog`, `adminForm`, `roleForm`, `busy`, `selectedRole` all remain in `App.tsx`. `fetchManagementData`, `openCreateAdmin`, `openEditAdmin`, `submitAdmin`, `setAccountStatus`, `submitResetPassword`, `submitDeleteAdmin`, `submitRole`, `setRoleStatus`, `deleteRole`, `scopeText` — all unchanged in `App.tsx`.
6. **Bilingual support** — every visible string still has `ar` / `en` forms via `isArabic`. The `copy` dictionary is passed through unchanged from `App.tsx`. New strings in `AuditCenter` (severity labels, event-type labels, summary-card labels, filter labels) are defined inline with both languages.
7. **`dir="rtl|ltr"`** — applied at the section root of every component for proper Arabic layout.
8. **API client types** — `apiRequest`, `ApiError`, `AdminRecord`, `RoleRecord`, `AdminUser`, `PagedResult<T>` consumed unchanged from `../lib/api`.
9. **Permission gate** — `view === 'admins' && isSuperAdmin`, `view === 'roles' && isSuperAdmin`, and now `view === 'audit' && isSuperAdmin` (matching the backend `GetCriticalAlerts` policy: `if (scope?.IsSuperAdmin != true || !await _permissions.HasPermissionAsync(adminId, Resources.Logs, Actions.View, ct)) return Forbid();`). The non-super-admin fallback (`isManagementView && !isSuperAdmin`) now covers `audit` too via the updated `isManagementView` predicate.
10. **Command palette** — `navGroups.flatMap` already iterates the new `audit` nav item automatically (no extra change needed). Super-admin filtering for the nav item is preserved via `superOnly: true`.
11. **Toaster / Sonner** — the existing `<Toaster richColors position="top-center" />` in `App.tsx` remains. `notify` / `reportError` are passed to `AuditCenter` as `onNotice` / `onError` props (matching the StudentsCenter / QuestionsCenter / ExamsCenter / LibraryCenter / CodesCenter convention).
12. **Ses­sion restore / sign-out / sidebar collapse / theme toggle / API status probe** — all `useEffect` hooks and handlers in `App.tsx` are untouched.

---

## What was changed (institutional visual upgrades)

| Area | Before | After |
| --- | --- | --- |
| **Admins page header** | Plain eyebrow + h2 with `<small>` count + Plus primary-action | UsersRound icon tile (teal-50/teal-700) + eyebrow + 2xl title with count pill (teal-100/teal-700) + bilingual subtitle + teal-700 add-admin button with hover opacity |
| **Admins filter bar** | CSS-grid `.filters` with custom `.search-field` pseudo-element icon | Card panel (`bg-white` + `var(--cms-line)` border) holding search input with absolute-positioned Search icon (right side for RTL), role select, status select, and conditional clear button |
| **Admins table** | CSS-table with `.identity` (avatar + name + email + phone) + role-tag + status-chip + row-actions | Tailwind-table inside `overflow-x-auto` card. Identity cell: round avatar (teal when active, slate when disabled) + name + email + phone line + "Created" date subtitle (matching StudentsCenter pattern). Role badge: teal-50/teal-700 pill. Scope badge: ivory pill. Status badge: emerald (active) / red (disabled) pill with dot indicator. Row actions: 5 icon buttons with semantic colors (view/edit/reset = muted hover teal; disable = amber, enable = emerald; delete = red) |
| **Admins loading** | Single row with spinner + text | 6-row shimmer skeleton matching table columns (avatar placeholder, identity bars, 3 pill placeholders, date bar, 3 action-button placeholders) |
| **Admins empty** | Single row with UsersRound icon + message + conditional clear button | Centered card with UsersRound icon tile, message, hint, conditional clear button |
| **Roles page header** | Plain eyebrow + h2 + Plus primary-action | KeyRound icon tile + eyebrow + 2xl title with count pill + bilingual subtitle + create-role button |
| **Roles grid** | CSS-grid `.role-grid` with `.role-card` (system/custom badge, status pill, h3, code, p, metrics, actions) | Tailwind grid (1/2/3 cols responsive). Each card: top row with status pill (emerald/red, dot indicator) + system/custom badge (teal-50/teal-700 for system, ivory for custom) · 2xl title · mono technical name in teal · description (flex-1 to push metrics to bottom) · metrics row with icon tiles (UsersRound + ShieldCheck) and bold count + muted label · action bar with toggle-status button (amber hover when active, emerald hover when disabled; disabled+tooltip for super_admin) + conditional delete button (red, only for non-system roles) |
| **Roles loading** | Single centered spinner | 6-card skeleton grid matching card structure |
| **Roles empty** | Single centered KeyRound + message | Centered card with KeyRound icon tile + bilingual message + bilingual hint |
| **DialogLayer** | CSS `.dialog-backdrop` + `.dialog-card` + `.dialog-form` (grid 1fr 1fr) + custom button classes | Tailwind modal: `fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4` backdrop + `bg-white rounded-xl max-w-xl w-full shadow-xl max-h-[calc(100vh-40px)] overflow-y-auto` card. Sticky header with danger/teal icon tile + eyebrow + title + close button. Forms use Tailwind grid + label + input classes with focus-ring (`focus:ring-2 focus:ring-teal-500 focus:border-teal-500`). Sticky bottom action bar with border-top separator. Danger form (delete-admin) shows red-tinted alert banner + target card with red left border + super-admin password field with red submit button |
| **Audit (new)** | n/a — did not exist | Page header + 3 severity summary cards + filter bar + responsive audit table with event-type icon tiles (severity-aware tint), severity badges, actor code chip, IP mono cell + skeleton loading + empty state. All `--cms-*` tokens applied via inline `style`. |

---

## Props contracts (unchanged where possible)

### `AdminsCenter`
```ts
type AdminsCenterProps = {
  copy: Record<string, string>;
  isArabic: boolean;
  admins: AdminRecord[];
  roles: RoleRecord[];
  total: number;
  query: string;
  roleFilter: string;
  statusFilter: string;
  busy: boolean;
  loading: boolean;
  scopeText: (admin: AdminRecord) => string;
  setQuery: (value: string) => void;
  setRoleFilter: (value: string) => void;
  setStatusFilter: (value: string) => void;
  clearFilters: () => void;
  onCreate: () => void;
  onEdit: (admin: AdminRecord) => void;
  onReset: (admin: AdminRecord) => void;
  onDelete: (admin: AdminRecord) => void;
  onStatus: (admin: AdminRecord, active: boolean) => void;
};
```

### `RolesCenter`
```ts
type RolesCenterProps = {
  copy: Record<string, string>;
  isArabic: boolean;
  roles: RoleRecord[];
  busy: boolean;
  loading: boolean;
  onCreate: () => void;
  onStatus: (role: RoleRecord, active: boolean) => void;
  onDelete: (role: RoleRecord) => void;
};
```

### `AuditCenter` (new — follows StudentsCenter / QuestionsCenter pattern)
```ts
type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};
```

### `DialogLayer` (exported from `AdminsCenter.tsx`, rendered by `App.tsx`)
```ts
type DialogLayerProps = {
  copy: Record<string, string>;
  isArabic: boolean;
  dialog: AdminDialog;  // = Exclude<App.Dialog, null>
  roles: RoleRecord[];
  adminForm: { fullName: string; email: string; password: string; phone: string; roleId: string };
  selectedRole?: RoleRecord;
  roleForm: { name: string; nameAr: string; description: string };
  busy: boolean;
  onClose: () => void;
  onAdminForm: (form: AdminForm) => void;
  onRoleForm: (form: RoleForm) => void;
  onSubmitAdmin: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitReset: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitDelete: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitRole: (event: FormEvent<HTMLFormElement>) => void;
};
```

---

## AuditCenter — implementation notes

### Backend endpoint
- **`GET /api/v1/security/alerts?count=100`** — backend controller `SecurityController.GetCriticalAlerts` returns `{ Id, eventType, severity, Description, studentId, IpAddress, CreatedAt }`. Server-side currently filters to `Severity == Critical` (see `SecurityService.GetCriticalAlertsAsync`). The UI severity filter and search operate client-side on the returned set, so future backend expansions to other severities will surface automatically without code changes.
- **Authorisation** — backend requires `scope.IsSuperAdmin == true` AND `HasPermissionAsync(Logs, View)`. The nav item is marked `superOnly: true` in App.tsx and the render branch is gated on `view === 'audit' && isSuperAdmin`. A 403 response from the backend produces a localized "no permission" error toast.

### Event-type → icon map
- `LoginSuccess` / `LoginFailed` / `Logout` / `SessionCreated` / `SessionRevoked` → `LogIn`
- `Refresh` / `RefreshReuse` → `RefreshCw`
- `DeviceRegistered` / `DeviceChange` / `DeviceBindingFailed` → `Smartphone`
- `DevtoolsDetected` / `ScreenshotAttempt` / `CopyAttempt` / `DownloadAttempt` → `ShieldAlert`
- `MfaEnabled` / `MfaDisabled` / `MfaChallenged` → `ShieldCheck`
- `BanApplied` / `BanRevoked` → `Ban`
- default → `ShieldCheck`

### Severity → badge map (per task spec)
- `Info` → `text-sky-700 bg-sky-50 border-sky-200` (sky-500 dot)
- `Warning` → `text-amber-700 bg-amber-50 border-amber-200` (amber-500 dot)
- `Critical` → `text-red-700 bg-red-50 border-red-200` (red-500 dot)

### Arabic strings (per task spec)
- "السجل الأمني" / "Security Audit"
- "الوقت" / "Time"
- "النوع" / "Type"
- "الخطورة" / "Severity"
- "الوصف" / "Description"
- "الفاعل" / "Actor"
- "IP"
- "معلومات" / "Info"
- "تحذير" / "Warning"
- "حرج" / "Critical"
- "لا توجد أحداث أمنية" / "No security events"
- "ابحث في الأحداث" / "Search events"

All twelve required strings are present verbatim in `AuditCenter.tsx`.

---

## Build verification

```bash
$ cd /home/z/my-project/audit-workspace/cms-platform-manus
$ export PATH="/home/z/dotnet:/home/z/.npm-global/bin:/usr/local/bin:$PATH"
$ pnpm --filter @cms/admin-web build
> @cms/admin-web@1.0.0 build
> tsc -b && vite build

vite v6.4.3 building for production...
✓ 1936 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.63 kB │ gzip:   0.38 kB
dist/assets/index-CgbKL1fs.css   65.06 kB │ gzip:  12.26 kB
dist/assets/index-BY2sSz0v.js   612.31 kB │ gzip: 160.33 kB
✓ built in 5.45s
```

`tsc -b` passes with **0 errors**. `vite build` succeeds. The chunk-size warning is pre-existing (the project bundles everything into a single chunk and was already over 500 kB before this change). No TypeScript errors, no type mismatches between `App.tsx` and the three new component files.

### One issue fixed during build
- Initial `tsc -b` reported `src/App.tsx(61,6): error TS6196: 'ActiveDialog' is declared but never used.` — the `ActiveDialog = Exclude<Dialog, null>` type alias was previously consumed only by the inline `DialogLayer` function (now moved into `AdminsCenter.tsx`). Removed the alias from `App.tsx`. Build then passed cleanly.

---

## ESLint note (pre-existing project issue, not introduced by this change)

The repo's `lint` script (`eslint . --ext ts,tsx --max-warnings=0`) is broken on this machine — it passes the deprecated `--ext` flag to a flat-config ESLint setup. Running `npx eslint <files>` directly surfaces a deeper pre-existing rule-loading issue (`TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions': Cannot read properties of undefined (reading 'allowShortCircuit')`). This is a project-level eslint/typescript-eslint version mismatch and is not related to my changes. The `tsc -b && vite build` build (which is what the task spec explicitly requires) passes cleanly with 0 errors.

---

## Files / exports summary

```
apps/admin-web/src/
├── App.tsx                                    (904 lines, was 1097)
├── components/
│   ├── AcademicCenter.tsx                     (unchanged)
│   ├── AdminsCenter.tsx                       (NEW — 563 lines — exports AdminsCenter + DialogLayer)
│   ├── AuditCenter.tsx                        (NEW — 410 lines — exports AuditCenter)
│   ├── CodesCenter.tsx                        (unchanged)
│   ├── ExamsCenter.tsx                        (unchanged)
│   ├── LibraryCenter.tsx                      (unchanged)
│   ├── QuestionsCenter.tsx                    (unchanged)
│   ├── RolesCenter.tsx                        (NEW — 256 lines — exports RolesCenter)
│   └── StudentsCenter.tsx                     (unchanged)
└── lib/api.ts                                 (unchanged)
```

---

## Navigation additions (App.tsx)

The Governance nav group now has three items (was two):

```tsx
{
  label: isArabic ? 'الحوكمة' : 'Governance',
  items: [
    { key: 'admins', label: copy.admins, icon: UsersRound, superOnly: true },
    { key: 'roles',  label: copy.roles,  icon: KeyRound,   superOnly: true },
    { key: 'audit',  label: isArabic ? 'السجل الأمني' : 'Security Audit', icon: ShieldCheck, superOnly: true },
  ],
},
```

The `viewTitle` switch now includes an `audit` branch (resolves to "السجل الأمني" / "Security Audit"), and the `isManagementView` predicate now includes `view === 'audit'` so the non-super-admin fallback ("Access is limited by your role and academic scope") is shown for the audit tab too when applicable.
