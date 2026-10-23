# ITEM-2-STUDENT-REDESIGN — Premium redesign of ProfilePage + AppShell + Sidebar

**Agent:** full-stack-developer
**Task ID:** ITEM-2-STUDENT-REDESIGN
**Target files (3):**
1. `apps/student-web/src/features/profile/ProfilePage.tsx`
2. `apps/student-web/src/components/layouts/AppShell.tsx`
3. `apps/student-web/src/components/layouts/Sidebar.tsx`

## Context read

- Read `worklog.md` — prior agent (ITEM-3-STUDENT-CREATE) redesigned admin-web's StudentsCenter with a create modal; same `--cms-*` token vocabulary.
- Read `agent-ctx/ITEM-3-STUDENT-CREATE-full-stack-developer.md` for the established token conventions.
- Read all three target files + `globals.css`, `Navbar.tsx`, `BottomNav.tsx`, `profile-api.ts`, `auth-api.ts`, `useAuth.ts`, `utils/index.ts`, `vitest.config.ts`, `tsconfig.json`, `package.json`, `src/test/component.test.tsx`.

## Design intent

- Replace "flat and primitive" + "thick blue strip" with a clean Profile Header Card (no gradient banner).
- Single white card (`bg-[var(--cms-surface)] rounded-2xl border-[var(--cms-line)] shadow-sm`).
- Avatar on the RIGHT (start side in RTL) + name/phone/status on the LEFT (end side in RTL) via `flex justify-between`.
- "Edit" button (ghost/outline) in top-right corner — wired to trigger email edit mode.
- Avatar camera upload button preserved (bottom-left of avatar).
- Logout button preserved — relocated into the security section (where it semantically belongs).
- All other features (email inline edit, password change, subscriptions list, masked codes) preserved 1:1.
- Use `font-bold` (NOT `font-extrabold`) for headings.
- Use `--cms-*` tokens only (no `--c-*` aliases in new code).
- Wrap page in `motion.main` with `initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}` for subtle fade-in.

## AppShell.tsx changes
- Swap `bg-[var(--c-bg)]` → `bg-[var(--cms-ivory-100)]` (no alias).
- Keep existing `p-6 md:p-8 max-w-[1280px] mx-auto w-full` (already matches spec).

## Sidebar.tsx changes
- Swap `--cms-surface-glass` (translucent) → `--cms-surface` (clean white).
- Active state: `bg-[var(--cms-teal-50)] text-[var(--cms-teal-700)] font-semibold` + start-side accent (`border-s-2 border-s-[var(--cms-teal-600)]`).
- Hover: `hover:bg-[var(--cms-teal-50)] hover:text-[var(--cms-teal-700)]`.
- Group labels: `text-[11px] font-semibold uppercase tracking-wider text-[var(--cms-text-muted)]`.
- Group spacing: `mb-6` (was `mb-4`).
- Item spacing: `space-y-1` (kept).
- Transition: `transition-all duration-200 ease-out`.
- Replace the leftover emerald rgba(13,116,107,*) tokens with `--cms-teal-*` tokens.

## Verification results
- `node_modules/.bin/tsc --noEmit` → **0 errors** ✅
- `node_modules/.bin/vite build` → **success, built in 7.08s** ✅ (ProfilePage chunk: 15.85 kB / 4.16 kB gzip)
- `node_modules/.bin/vitest run` → **4 test files, 70 tests, all passed** ✅
- (Note: `eslint` fails at the rule-loader level on EVERY file in the repo — pre-existing env issue with `@typescript-eslint/no-unused-expressions` reading `allowShortCircuit` under ESLint 8.57.1. Confirmed identical failure on untouched `src/utils/index.ts`. Not caused by this change; not in the required verification set.)

## Notes for downstream agents
- The `text-end` choice for the name block inside the profile header creates left-aligned text in RTL (end = left). This places the name text at the LEFT edge of the card with the avatar on the RIGHT — visually distributes content across the card for the premium "Apple Health" feel.
- The Edit button in the header triggers `setEmailEditing(true)` and seeds `emailValue` — same handler the inline email edit link uses, so both entry points share one code path.
- Logout button was relocated from the profile header to the security section header (sits next to the "Change password" toggle). Both `void logout()` semantics preserved.
