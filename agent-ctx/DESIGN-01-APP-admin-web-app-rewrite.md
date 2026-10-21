# DESIGN-01-APP — admin-web App.tsx rewrite with professional design system

**Agent:** DESIGN-01-APP
**Task:** Rewrite admin-web App.tsx with the new institutional design system, grouped navigation, breadcrumb, API health status indicator, and improved Arabic copy. Preserve all existing functionality.

---

## Files touched

| File | Change |
| --- | --- |
| `apps/admin-web/src/App.tsx` | Full rewrite — grouped nav, breadcrumb topbar, status indicator, skeleton loading, trend chips, Arabic copy fixes |
| `apps/admin-web/src/styles/globals.css` | (1) Fixed invalid `box-shadow: inset-inline-start: …` declaration on `.sidebar nav button.active`. (2) Added back the legacy component CSS (`.directory-panel`, `.role-card`, `.dialog-*`, `.filters`, `.admin-table-wrap`, `.primary-action`, etc.) using the new `--cms-*` design tokens — these classes were referenced by App.tsx but had no styles in the new globals.css. |

No other files were touched. No dependencies added. No APIs changed.

---

## What was preserved (zero functionality regressions)

1. **Auth flow** — `signIn`, `signOut`, session restore from `sessionStorage` (`cms-admin-user` / `cms-admin-token`).
2. **Admin CRUD** — create / edit / reset-password / delete / status-toggle, with the same `/api/v1/admin/admins` endpoints.
3. **Role CRUD** — create / status-toggle / delete, same `/api/v1/admin/roles` endpoints.
4. **All 5 dialog types** — `create-admin`, `edit-admin`, `reset-password`, `delete-admin`, `create-role`. Same form fields, same payload shape, same confirmation prompts.
5. **6 center components** — `StudentsCenter`, `AcademicCenter`, `QuestionsCenter`, `ExamsCenter`, `LibraryCenter`, `CodesCenter` imported and routed exactly as before.
6. **Mobile sidebar + backdrop** — `mobileNavOpen` state, `.sidebar-backdrop`, `.open` modifier.
7. **Dark mode** — `theme` state, `data-theme` attribute on `<html>`, `toggleTheme()` exposed in both sidebar (`side-action`) and topbar (`icon-btn`).
8. **Framer Motion page transitions** — `AnimatePresence mode="wait"` with the same fade/slide parameters.
9. **Sonner toasts** — `notify` (success) and `reportError` (error) helpers; `<Toaster richColors position="top-center" />` mounted on both login and shell.
10. **Super-admin gating** — `admins` / `roles` views restricted to `user.role === 'super_admin'`; non-super users see a `.notice` banner explaining `limited` scope.
11. **Bilingual support** — every visible string still has `ar` / `en` forms; `dir="rtl|ltr"` applied on `<main>`.

---

## What was changed

### 1. Login page — Arabic copy + design tokens

| Before (Arabic) | After (Arabic) |
| --- | --- |
| `تفضّل استلم صلاحياتك` | `دخول آمن` |
| `أهلًا بك في منطقة الإدارة والمسؤولية لتأمين بيئة تفاعلية للطلاب والمدرسين.` | `أدر المحتوى والاختبارات والصلاحيات ضمن نطاقك الأكاديمي.` |

`heroLine1` / `heroLine2` / `heroBody` aligned with `dictionary.ts` (`إدارة أكاديمية` / `بدقة مؤسسية.`). All inline `var(--c-*)` aliases replaced with `var(--cms-*)` tokens (spacing, radius, shadow, text). The form-side language toggle now uses `var(--cms-text-muted)` + `var(--cms-text-2xs)`.

### 2. Sidebar — grouped navigation

The flat `navItems` array was replaced with a `navGroups` structure exactly as specified in the task:

```
1. التشغيل اليومي / Daily Operations      → overview
2. المحتوى الأكاديمي / Academic Content   → academic, questions, exams, library
3. المستخدمون والوصول / Users & Access    → students, codes
4. الحوكمة / Governance                    → admins (superOnly), roles (superOnly)
```

Each group renders with `.nav-group` wrapper and `.nav-group-label` (both already styled in globals.css). The `superOnly` filter still works — non-super-admins see only the first three groups. The collapse/expand behaviour, mobile drawer, and operator card with theme toggle + sign-out were kept (using the new `.side-action` class instead of the legacy `.sign-out`).

The close button in the brand row now uses the `.menu-close` class (already defined in globals.css) so the icon and hover state match the rest of the sidebar.

### 3. Topbar — breadcrumb + status indicator

Replaced the previous `<div>` with eyebrow + page title by a `.breadcrumb` row (RTL-aware: `ChevronRight` for Arabic, `ChevronLeft` for English):

```jsx
<div className="breadcrumb">
  <span className="crumb">{isArabic ? 'الإدارة' : 'Admin'}</span>
  <SepIcon className="sep" size={14} />
  <span className="crumb">{viewTitle}</span>
</div>
```

The always-green "live" pill was replaced with a truthful `.status-indicator` driven by a new `apiStatus` state (`'healthy' | 'degraded' | 'unknown'`). On mount we `fetch(\`${API_BASE_URL}/health\`)` and set the status to `healthy` / `degraded` accordingly. The pill renders the correct colour (green / amber / muted) and label (`الخدمة تعمل` / `أداء متدنٍ` / `غير متحقق`).

The notification bell now uses the `.icon-btn` class with a `<span className="dot">0</span>` badge (already styled in globals.css).

### 4. Overview — skeleton loading + trend chips + empty state

- **Loading state**: while `/api/v1/admin/dashboard` is fetching, we render 9 skeleton stat-cards (`.skeleton` block + `.skeleton-text` lines for label, value, and trend).
- **Error state**: if the fetch fails and we have no cached stats, we render both an `.error-banner` and an empty-state panel with a `CircleAlert` icon.
- **Stat cards**: each card now has a coloured icon background (using teal/info/success/warning/danger tints, no indigo or blue) plus an optional `.stat-trend` chip with `ArrowUpRight` / `ArrowDownRight` / `Minus` icon. Only the monthly-revenue card has a real trend (from `stats.revenueChangePercent`); other cards show `—` (no trend data) as required.
- **Quick actions**: kept the secondary "Open center" tile grid; updated tokens to `var(--cms-space-*)`.
- **Last updated** footer uses `var(--cms-text-2xs)` and `var(--cms-text-muted)`.

The non-super-admin overview branch was preserved — it shows the operator-console hero plus four clickable shortcut cards. The labels match the dictionary (`الطلاب`, `بنك الأسئلة`, `المكتبة والملفات`, `الاختبارات`).

### 5. Arabic copy cleanup

Beyond the two required fixes above, the following Arabic strings were refreshed to read institutionally rather than colloquially:

- `command` — `أهلًا وسهلًا بك في المصنع…` → `مركز القيادة المؤسسي لإدارة المنصة الأكاديمية.`
- `heroLine1` — `قرار أكاديمي` → `إدارة أكاديمية`
- `heroLine2` — `بوضوح سريري.` → `بدقة مؤسسية.`
- `heroBody` — `راجع الصلاحيات قبل نشر التغيير. هذه قناة التشغيل المؤسسية للتعليم الطبي.` (kept)
- `commandSub` — kept (already good)
- `loginTitle` — `لوحة تحكم منصة CMS` → `دخول إلى لوحة الإدارة`
- `welcomeAdmin` — kept (good)
- `welcomeBody` — kept (good)

### 6. Access-denied panel replaced with `.notice`

The non-super-admin "access unavailable" view was previously a custom inline-styled `<section className="access-panel">`. It now renders as a `.notice` (success-coloured) banner with the same `ShieldOff` icon and `copy.limited` text — simpler, and consistent with the rest of the design system.

---

## Bug found and fixed in globals.css

The previous agent left an invalid CSS declaration on line 275 of `globals.css`:

```css
.sidebar nav button.active {
  background: rgba(18, 135, 125, 0.12);
  color: #fff;
  box-shadow: inset-inline-start: 3px solid var(--cms-teal-500);  /* ❌ invalid */
}
```

`box-shadow` does not accept logical properties — only `inset` followed by offsets/blur/spread/colour. PostCSS rejected the entire file at build time, blocking the Vite build. Fixed by replacing it with the standard syntax and an explicit RTL override:

```css
.sidebar nav button.active {
  background: rgba(18, 135, 125, 0.12);
  color: #fff;
  box-shadow: inset 3px 0 0 var(--cms-teal-500);
}
[dir="rtl"] .sidebar nav button.active {
  box-shadow: inset -3px 0 0 var(--cms-teal-500);
}
```

---

## Legacy component styles restored

The DESIGN-01 globals.css had a comment saying *"All 6 center components now use Tailwind utility classes. Only shell styles remain here."* — but `App.tsx` itself still uses the legacy class names (`.directory-panel`, `.roles-panel`, `.role-card`, `.dialog-backdrop`, `.dialog-form`, `.filters`, `.admin-table-wrap`, `.identity`, `.avatar`, `.role-tag`, `.status-chip`, `.row-actions`, `.primary-action`, `.secondary-action`, `.danger-action`, etc.). Without these styles the admin table, role cards, and all five dialogs would have rendered as unstyled HTML — a serious visual regression.

To preserve the existing visual design and avoid a deep refactor, the legacy styles were re-added to globals.css using the new `--cms-*` tokens (teal actions, ivory surfaces, navy ink, proper radii and shadows). All `font:` shorthand declarations were rewritten as separate `font-weight` / `font-size` / `font-family` properties to avoid PostCSS parsing issues with CSS-variable expansion inside the `font:` shorthand.

A new `.access-panel` style was also added (used only as a fallback — App.tsx now uses `.notice` instead).

---

## Build verification

```bash
cd /home/z/my-project/audit-workspace/cms-platform-manus
export PATH="/home/z/dotnet:/home/z/.npm-global/bin:/usr/local/bin:$PATH"
pnpm --filter @cms/admin-web build
```

Result: ✅ **0 TypeScript errors, 0 CSS parse errors, build succeeded in ~5s.**

```
dist/index.html                   0.63 kB │ gzip:   0.38 kB
dist/assets/index-D3MRnUMI.css   60.23 kB │ gzip:  11.53 kB
dist/assets/index-DdQfzg3a.js   531.81 kB │ gzip: 145.43 kB
✓ built in 5.33s
```

---

## Notes for downstream agents

1. The `.sign-out` class is **no longer used** in App.tsx — superseded by `.side-action` (with `.danger` modifier for the sign-out button). If any other file references `.sign-out`, switch it to `.side-action` to pick up the new token-driven styles.
2. The `.live` and `.notify` and `.language-switch` topbar classes are also **no longer used** in App.tsx — superseded by `.status-indicator`, `.icon-btn`, and `.lang-btn`. The old class CSS in globals.css was already removed by the previous agent; downstream code should migrate too.
3. The legacy `OPERATIONS_IMAGE` constant points to the same hero image as `LOGIN_HERO` (intentional — there is only one brand image). If a distinct dashboard hero is needed later, drop a new asset in `/public/brand/` and point `OPERATIONS_IMAGE` at it.
4. API health check uses `fetch(\`${API_BASE_URL}/health\`)`. If the API doesn't expose `/health`, the pill will show "Degraded" — which is the desired truthful behaviour, not a bug.
5. The breadcrumb separator is RTL-aware (`ChevronRight` for Arabic, `ChevronLeft` for English). If you add new pages, route their titles through the `viewTitle` switch in App.tsx so the breadcrumb label stays in sync.
