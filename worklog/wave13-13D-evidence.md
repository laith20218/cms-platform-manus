# Wave 13 / F3 — §13 Evidence Pack (commit 13.D)

Branch: `feat/13.1-html-player` (on top of main `7987cc4`) — local commits, NOT pushed.
Generated: 2026-11-01 (sandbox session). All commands run from `apps/student-web/`
against the local vite dev server (`127.0.0.1:5173`, sandbox-internal only).

## 1. Five-width §13 matrix (375 / 414 / 768 / 1024 / 1440)

```
E2E_WIDTHS=375,414,768,1024,1440 node e2e/w13.1-html.e2e.mjs
  PASS  §13 matrix 375px: player opens + screenshot
  PASS  §13 matrix 414px: player opens + screenshot
  PASS  §13 matrix 768px: player opens + screenshot
  PASS  §13 matrix 1024px: player opens + screenshot
  PASS  §13 matrix 1440px: player opens + screenshot
==== w13.1-html E2E: 27/27 checks passed ====
```

Artifacts (dir `e2e/screenshots/` is gitignored per repo convention):
`w13.1-375-matrix.png`, `w13.1-414-matrix.png`, `w13.1-768-matrix.png`,
`w13.1-1024-matrix.png`, `w13.1-1440-matrix.png`
(+ flow shots: `w13.1-375-static.png`, `w13.1-375-interactive.png`, `w13.1-375-recovered.png`).

## 2. axe-core scan (html player)

`node e2e/w13.1-axe.mjs` — tags `wcag2a, wcag2aa, wcag21aa, wcag22aa`,
scoped to `[data-testid="player-stage"]` (the subtree Wave 13 owns):

```
  AXE interactive @ 375px: 0 total, 0 blocking
  AXE interactive @ 414px: 0 total, 0 blocking
  AXE interactive @ 768px: 0 total, 0 blocking
  AXE interactive @ 1024px: 0 total, 0 blocking
  AXE interactive @ 1440px: 0 total, 0 blocking
  AXE page-chrome @ 768px (informational, unscoped): 0 total, 0 blocking
  AXE error-state @ 375px: 0 total, 0 blocking
  AXE static @ 375px: 0 total, 0 blocking
==== w13.1-axe: 8 scans, blocking=NONE ====
```

Machine-readable output: `e2e/screenshots/w13.1-axe.json`.

### Pre-existing finding (disclosed, OUT OF SCOPE §12)

An UNSCOPED probe run at 768×1024 (axe over the whole page) flagged:

```
color-contrast serious
  HTML: <span class="relative z-[1] text-[10.5px] leading-none transition-all
        duration-200 font-bold">المواد</span>
  4.26:1 (foreground #1e6feb, background #eff6ff) — expected 4.5:1
```

Source: `apps/student-web/src/components/layouts/BottomNav.tsx:69` — the app's
bottom navigation active label. NOT Wave 13 UI (the player stage never renders
it); re-detection via unscoped axe is occlusion-dependent (the full-screen
overlay usually hides the nav from axe). Filed for a dedicated fix pass.

## 3. RTL grep (new code — `src/features/media-player/html/`)

```
$ rg -n 'dir="rtl"' src/features/media-player/html/
  HtmlPlayer.tsx:33:  dir="rtl"          (error state)
  HtmlPlayer.tsx:55:  dir="rtl"          (loading state)
  HtmlPlayer.tsx:68:  <div dir="rtl" …>  (ready state — player root)

$ rg -c "إعادة المحاولة|جارٍ تجهيز|تعذّر" HtmlPlayer.tsx
  3   (Arabic user-facing copy in all three states)

$ rg -n '\b(pl-|pr-|ml-|mr-|text-left|text-right|left-|right-)' src/features/media-player/html/
  → 0 matches (zero physical-direction utilities)

$ rg -n "top: '|left: '" HtmlPlayer.tsx
  98:  style={{ top: '18%', left: '8%', … }}    (watermark — absolute %)
  104: style={{ top: '58%', left: '28%', … }}   (watermark — absolute %)
```

The two watermark `left:` percentages are decorative deterrent positioning and
mirror the PdfPlayer precedent exactly (`PdfPlayer.tsx:1291,1294`), where the
same pattern was accepted in Waves 11/12. All layout chrome uses logical
properties / flexbox.

## 4. Verification ladder (exact counts)

| Gate | Result |
| --- | --- |
| `tsc -b` student-web | PASS (0 errors) |
| `tsc -b` admin-web | PASS (0 errors) |
| `eslint --max-warnings=0` on every touched file | PASS |
| vitest student-web | 334/334 (21 files) |
| vitest admin-web | 50/50 (8 files) |
| e2e `w13.1-html.e2e.mjs` (full) | 27/27 + 1 SKIP (S5, disclosed) |
| e2e `w13.1-axe.mjs` | 8 scans, 0 blocking |
| e2e `player-pdf-11.11.e2e.mjs` (regression) | 24/24 scenarios, 0 console errors, 0 page errors |
| `dotnet test` / `dotnet build` | **NOT RUN — no dotnet SDK in the sandbox** |

## 5. UNVERIFIED disclosures

1. **.NET backend (13.A)** — cannot compile/test here (no SDK). CI must run
   `dotnet build` + `dotnet test` before push/merge. Risk areas flagged for CI
   attention: Ganss `AllowedTags.Add("script")` content preservation; the
   hand-authored `Phase62AddHtmlPlayerFields` migration (Phase61 hand-authored
   precedent applies cleanly in EF Core 8/9).
2. **S5 (`{key}-ready` swap)** — asserted by unit tests
   (`CompleteUpload_HtmlFile_InvokesSanitizer_WithActualSize`,
   `CompleteUpload_HtmlFile_TrustedPath_…`), not by browser E2E.
3. **BottomNav contrast** — pre-existing, out of scope (see §2 above).
