# pr-9-frontend — Servers Dashboard (admin-web)

Task: PR-9 FRONTEND — premium read-only operational dashboard for Render / Vercel / Neon / GitHub monitoring, super-admin only, in `apps/admin-web`, stacked on `feat/pr-8-servers-dashboard-frontend` (backend PR-8 in tree). Read-only by design; never display tokens/headers/connection strings.

## What was read first (contract alignment)

- `apps/api/src/CMS.Application/DTOs/Monitoring/MonitoringDtos.cs` — full DTO set (ProviderEnvelope, RenderProviderData, VercelProviderData, NeonProviderData, GithubProviderData, ServersSummary, ProviderHistoryDto, status vocabularies).
- `apps/api/src/CMS.Api/Controllers/AdminServersController.cs` — endpoints: `GET /api/v1/admin/servers/summary|render|vercel|neon|github(+?fresh=true)` and `/{provider}/history`.
- `CMS.Infrastructure/Services/Monitoring/ServersMonitorService.cs` + `ProviderMonitoringCore.cs` — note/reason strings (e.g. missing_credentials reason is Arabic: «بيانات الاعتماد غير مُهيّأة»; history windowNote is bilingual).
- Frontend conventions copied: `src/App.tsx` (PR-6 SecurityCenter super-only wiring), `src/components/SecurityCenter.tsx` (manual refresh, states, eslint-disable-with-justification fetch effects), `src/components/OfflineCenter.tsx` (read-only ledger), `src/lib/api.ts` (typed helpers), dictionary section pattern + tests.

## Files created

1. **`src/lib/serversStatus.ts`** (new) — shared status vocabulary helper:
   - `SERVERS_POLL_INTERVAL_MS = 300_000` (documented 5-minute rationale + visibilitychange pause).
   - `providerStatusLabel / providerStatusExplanation / providerStatusTone` for ALL wire statuses (operational / degraded / down / unavailable / missing_credentials / invalid_credentials / rate_limited + unknown fallback).
   - `overallStatusLabel / overallStatusTone` for healthy / degraded / down / unavailable / unknown.
   - `serversToneClasses` (teal/green ok, amber warn, red error, slate neutral, orange config — never color-only, text always rides along).
   - `responseTimeLabel` — honest: -1 → «غير متاح» (never an invented number); real values formatted `ar-u-nu-arab` («٦٨٠ ملّي») / "680 ms".

2. **`src/lib/dictionary/servers.ts`** (new, registered in `index.ts`) — the full bilingual `servers.*` section: title/description, read-only + no-mutations notices, polling note, refresh + a11y labels, last-successful/attempted-check labels, status.* + overall.* + statusExplanation.* for every wire value, freshness.*, fields.*, providers.{render,vercel,neon,github}.*, history.*.

3. **`src/components/ServersCenter.tsx`** (new, 977 lines) — the dashboard:
   - Header: title + description + overall hero badge (role=status) + checkedAt + last-successful/last-attempted (derived from provider heads) + manual refresh (aria-label, busy, 44px) + polling note + fixed read-only notice. NO mutation affordances anywhere (asserted by a test).
   - Conservative polling: exactly 5 min, paused via `document.visibilitychange` (interval torn down on hide, rescheduled on return); first load immediate; manual refresh passes `fresh=true`.
   - Shared `{tick, fresh}` clock drives summary + all four provider envelope fetches (partial-failure isolation via `useProviderEnvelope` slots).
   - Summary strip: four provider cards (status badge, response time, checkedAt, freshness cached(age)/fresh, verbatim unavailableReason, verbatim head note; Vercel card splits the two projects into rows).
   - Provider nav (jump buttons) + always-visible stacked detail sections (keyboard-focusable cards / tabIndex + Enter scrolls to the section):
     - Render: service facts + suspended/autoDeploy badges, last deploy (id, raw status badge, commitSha mono first-10, sanitized commitMessage as plain text, createdAt/finishedAt), honest metrics chip + verbatim reason.
     - Vercel: both projects (name, url link target=_blank rel=noopener noreferrer, deployment state/target production/preview badges, commitSha 10 + commitRef, createdAt/readyAt).
     - Neon: project (name/id/regionId), branch (name + default/protected badges + state), usage-unavailable chip + verbatim reason, FIXED bilingual note «لا تُعرض سلاسل الاتصال أبداً في هذه اللوحة» (rendered even with no data). No connection material ever requested/rendered.
     - GitHub: repository (fullName/visibility/defaultBranch/pushedAt/openIssuesCount), workflows list (name, status/conclusion badges, headSha 10, createdAt/updatedAt) in a `max-h-96 overflow-y-auto` list.
   - History panel per provider: collapsible (aria-expanded/aria-controls), **load on expand only**, newest-first rows (status badge, response time, reason verbatim), backend bilingual windowNote verbatim + capacity note.
   - States: skeletons per section, error-with-retry per section (partial failure never blanks the dashboard), 403 forbidden surfaces, empty states.
   - RTL root dir, logical utilities, aria-labels on refresh/sections/nav, `@cms/ui` primitives (Badge, ErrorState, EmptyState, Skeleton).

4. **`src/test/servers-center.test.tsx`** (new, 25 tests) — mocks the three api helpers; covers: four cards, overall badge mapping (role=status), missing_credentials honest Arabic reason + «غير متاح» for -1 (never invented numbers), cached-vs-fresh freshness, `٦٨٠ ملّي` locale formatting, manual refresh with `fresh=true` for ALL helpers, all four detail sections (render/vercel×2 projects/neon/github), connection note even without data, history load-on-expand + rows + windowNote + capacity + error/empty, partial failure isolation + per-section retry, 403 surfaces (summary + section), empty workflows, read-only affordance scan (no restart/deploy/rollback buttons), polling asserted via the exported 300_000 constant (no fake timers), full status-vocabulary mapping (both locales), dictionary key enumeration bilingually.

## Files modified

5. **`src/lib/api.ts`** — appended the PR-9 block: `ServersProviderName`, `ProviderFreshness`, generic `ProviderEnvelope<TData>`, `RenderServersData` (+Service/Deploy info), `VercelServersData` (+Project/Deployment), `NeonServersData` (usage: unknown — never rendered), `GithubServersData` (+Repository/WorkflowRun), `ServersProviderHead`, `ServersSummary`, `ProviderHistory(Item)`; helpers `fetchServersSummary(token, fresh?)`, `fetchServersProvider` (literal-typed overloads per provider + generic tail), `fetchServersHistory(token, provider)`.
6. **`src/lib/dictionary/core.ts`** — added `nav.servers` (لوحة الخوادم / Servers Dashboard).
7. **`src/lib/dictionary/index.ts`** — registered `serversDict`.
8. **`src/App.tsx`** — exact PR-6 mirror: `Server` icon import, `ServersCenter` import, `'servers'` in View union + VIEW_PATHS (`/servers`) + PATH_VIEWS, navGroups audit item `{ key: 'servers', …, superOnly: true, gateKey: 'view:audit' }` after security, viewTitle ternary entry, render block `view === 'servers' && (isSuperAdmin && can('view:audit') ? <ServersCenter …/> : <LimitedNotice …/>)`; command palette picks it up via navGroups.
9. **`src/test/app-routing.test.tsx`** — stubbed `ServersCenter` + two new cases: `/servers` renders the center for super admin (nav item + breadcrumb title) and LimitedNotice for non-super (center never mounts, no nav item).

## Final gates (from repo root, `pnpm --filter @cms/admin-web …`)

- **test**: 46 files / **339 passed, 0 failures** (baseline 312 + 25 servers-center + 2 app-routing).
- **lint**: **0 warnings, 0 errors** (exit 0, `--max-warnings=0`).
- **build**: `tsc -b && vite build` — **exit 0** (only pre-existing lightningcss notes on `bg-[var(--c-*)]` utilities from earlier components + the pre-existing chunk-size info warning; nothing introduced by PR-9).

## Deviations / decisions (with reasons)

- **Stacked always-visible sections** (offered by the task as the simple option): all four envelopes fetch on mount; card/nav clicks + Enter smooth-scroll to the section (guarded `scrollIntoView` for jsdom).
- **`ar-u-nu-arab` explicit numbering system** for Arabic digits — modern ICU renders plain 'ar' with Western digits; explicit request yields «٦٨٠»/«٤٠»/«٦٠» as the task example shows.
- **Neon connection note always rendered** (even when data is null) — it is a fixed panel-level guarantee, not data-dependent.
- **English Neon note wording** avoids the literal phrase "connection string(s)" because the dictionary secret-scan test forbids that substring ("No connection details are ever displayed in this dashboard."); Arabic «سلاسل الاتصال» unchanged.
- **History refresh cadence**: fetch on first expand; while open, a poll/manual-refresh tick refetches it (still load-on-expand-only for collapsed panels).
- **Overall hero + provider badges** use `@cms/ui` Badge (variant per tone) + custom tone classes for the orange config tone (missing_credentials) to stay distinguishable from amber degraded; text always present.
- No git commit/push performed, as instructed.
