# PR-3 — Localization & Dictionary Adoption (Admin Web)

**Program:** Arabic CMS Admin Command Center, PR sequence 2→10
**Base:** `main @ 9273a06` (PR #214 merge)
**Scope:** Frontend only — no backend, database, migration, or deployment changes.

## 1. Objective

Make the shared dictionary the reliable source for Admin Web user-facing
language, preserving Arabic quality (primary, RTL), English support, and every
existing behavior. Before PR-3 the dictionary module
(`src/lib/dictionary.ts`, DESIGN-01) had **zero consumers**: the entire
console rendered through ~1,937 inline `isArabic ? 'عربي' : 'English'`
ternaries and per-component copy objects.

## 2. Dictionary v2 architecture

```
src/lib/dictionary/
  index.ts       — composition + public API (t, hasDictKey, localeOf,
                   statusLabel, apiErrorHumanMessage, dictEntries)
  types.ts       — Locale, DictEntry, DictSection, safe interpolation
  core.ts        — login/2FA, nav groups+items, topbar, common, dashboard,
                   admins, roles, scope, shell, palette, notFound,
                   twoFactorCard, modal, errorBoundary
  statuses.ts    — central status-label registry (17 domains)
  errors.ts      — API errorCode → localized human message map
  danger.ts      — Danger Zone wipe + Hard Delete dialogs
  students.ts questions.ts exams.ts courses.ts library.ts codes.ts
  academic.ts reports.ts audit.ts admincenters.ts notifications.ts
  └ one module per center; byte-identical string moves
src/lib/dictionary.ts  — stable re-export shim (the historical import path)
src/lib/shellCopy.ts   — App.tsx copy object rebuilt from the dictionary
```

**Public API**

| Export | Contract |
|---|---|
| `t(locale, path, params?)` | Dotted-path lookup; missing key → returns the raw path (visible, never crashes); `{{token}}` interpolation is plain-text substitution only (React renders values as text nodes — never innerHTML) |
| `localeOf(isArabic)` | Legacy boolean → Locale |
| `statusLabel(locale, domain, value)` | Central status registry; known wire values render the glossary label, unknown values follow the per-domain legacy behavior (pass-through or explicit unknown label) |
| `apiErrorHumanMessage(error, locale)` | Resolution order: backend `humanMessage` → errorCode map → raw ProblemDetails message → generic; `technicalDetails` always preserved separately |
| `dictEntries()` | Full-path walk used by the integrity tests |

## 3. Migration evidence

- **Before:** 1,937 `isArabic ?` ternaries across 41 components + App.tsx
  (dictionary had 0 consumers).
- **After:** 149 `isArabic ?` occurrences remain, **all of them non-string
  uses**: 54 `dir` attributes, 32 Intl locale tags, 2 language-toggle values,
  9 RTL icon swaps, 38 API data-field selections (nameAr/nameEn, labelAr/
  labelEn), 14 dictionary-routed/structural wrappers. Inline bilingual **UI
  strings: zero** outside the dictionary (the inventory classifier is
  deliberately conservative — see §4).
- Machine-readable inventory: `docs/pr-3-legacy-string-inventory.json`,
  regenerated via `node scripts/legacy-string-inventory.mjs`.

### Byte-identity guarantees

1. `src/test/shell-copy.test.ts` pins **every key** of the former App.tsx
   inline copy object to its exact legacy value in both locales (24 assertions
   over ~120 keys × 2).
2. Per-center migrations were verified byte-identical by scripted audits
   during the migration (dictionary values traced back to the pre-migration
   sources in git).
3. The 205-test suite (181 pre-existing exact-string assertions + 24 new)
   passes unchanged.

### Status labels (consistency requirement)

The registry covers the required set with one glossary per wire value:
Draft/مسودة · Published/منشور · Unpublished/غير منشور · Archived/مؤرشف ·
Quarantined/معزول · Retention pending/قيد الاحتجاز · Unavailable/غير متاح ·
Permission denied (common.permissionDenied) · Validation failed
(errors.VALIDATION_FAILED) — plus the center domains: student, session,
securitySeverity, subscriptionScope, reportReason, codeStatus,
redemptionStatus, libraryType, libraryScan, libraryCategory, mediaProtection,
questionType (W21.1 glossary), questionDifficulty, mediaProcessing.

Where a center's legacy unknown-value behavior differed from the registry
(e.g. Questions/Library render «مسودة» for any unrecognized status), the
center keeps a thin wrapper with a dictionary entry — **byte-identical output
wins over registry purity**.

### Error codes → localized messages

`apiErrorHumanMessage` maps: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT,
BUSINESS_RULE_VIOLATION, DOMAIN_ERROR, BAD_GATEWAY, MEDIA_PROCESSING_FAILED,
RATE_LIMIT_EXCEEDED, VALIDATION_FAILED, TWO_FACTOR_REQUIRED/INVALID/REPLAY.
Technical details are never hidden (returned alongside for the dual-language
error modal). No credentials, tokens, or connection strings exist in any
mapping — asserted by the dictionary no-secrets test.

## 4. Legacy-string inventory (explicit deferral)

Regenerate: `node scripts/legacy-string-inventory.mjs` (from the repo root).
The JSON lists every remaining `isArabic ?` with a classification
(`dir` / `localeTag` / `langSwitch` / `icon` / `data` / `string`).

The classifier counts **16 "string"** occurrences — reviewed individually,
each is one of:
1. API **data fields** (`module.labelAr`, `TABLE_LABELS?.ar`,
   `admin.roleNameAr`, `step.labelAr`, `healthBadge.labelAr`,
   `scope.ar`, option `labelAr/labelEn` metadata maps) — backend data, not
   UI copy; moving them would change nothing but risk;
2. **Dictionary-routed wrappers** (`isArabic ? t(locale, 'codes.statuses.
   unknownCode') : status` — the legacy unknown-value pass-through);
3. **Structural** (`labels={isArabic ? undefined : {…}}` — the EN pagination
   label override; `copy.titleLabel : copy.titleLabelEn` — both sides already
   dictionary-sourced);
4. **mediaProcessing-owned constants** (`TARGET_QUALITY_DOWNGRADE_WARNING_AR/EN`).

Secondary metric: ~1,047 lines contain Arabic literals not routed through
`t()` — the majority are code comments; the remainder are intentionally
Arabic-only surfaces (e.g. ContentCenter's hardcoded-RTL legal-text editor)
and backend-authored Arabic messages surfaced verbatim. These are documented
in the inventory JSON (`arabicOnlyLines`).

## 5. Dead-code removal

The 2024 `dictionary.ts` was dead (0 imports). Its content is preserved
byte-identical as the `core` sections and the file is now a stable re-export
shim of the new module — the historical import path keeps working. No other
dictionary code was dead; nothing was deleted silently.

## 6. Interpolation & XSS safety

- Interpolation is `{{token}}` plain-string replacement (types.ts).
- Unknown tokens stay visible (`{{name}}` remains literal) — never silently
  empty.
- Markup-shaped params pass through unchanged as text; React renders them as
  text nodes. **No `innerHTML`/`dangerouslySetInnerHTML` exists anywhere in
  admin-web** (verified by grep; the dictionary tests inject hostile input to
  pin the contract).
- User content is never concatenated into HTML.

## 7. RTL & locale behavior

`dir` attributes, Intl locale tags, RTL icon swaps, and date-formatting
locale selection are untouched. Arabic remains the primary experience;
English output is preserved wherever the product supported it.

## 8. Tests added

- `src/test/dictionary.test.ts` (22 tests): locale selection, fallback,
  interpolation (incl. hostile-markup inertness), full-tree bilingual
  integrity, placeholder tokens, **no-secrets scan**, the required status
  set in both locales, byte-identity against the legacy center glossaries,
  unknown-value behavior, error-code mapping + resolution order + rate-limit
  Arabic wording, RTL-sensitive labels, destructive-warning vocabulary.
- `src/test/shell-copy.test.ts` (2 tests): every legacy App copy key pinned
  byte-for-byte in both locales.

## 9. Quality gates (local)

| Gate | Result |
|---|---|
| `tsc -b` (admin-web) | clean |
| `eslint --max-warnings=0` (admin-web) | clean (the one migration-introduced exhaustive-deps warning was fixed properly, no suppression) |
| admin-web vitest | **205/205** (181 pre-existing + 24 new) |
| packages/ui vitest | **61/61** |
| student-web vitest | **835/835** |
| admin-web production build | success |
| student-web production build | success (PWA precache) |

## 10. Known limitations

1. The inventory's "string" classifier is conservative (16 false positives —
   all documented in §4).
2. `arabicOnlyLines` is a line heuristic (comments included) — a precise
   audit remains future work.
3. Date/number formatting still uses Intl with inline locale tags by design
   (correct behavior, not user-facing copy).
4. Backend-authored Arabic domain messages are surfaced verbatim (the
   `humanMessage`/message fields) — correct per the contract; only the
   mapped error codes get frontend-authored bilingual wording.
