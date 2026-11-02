# WIP_STATUS — main @ 6a28f6d → feat/12.5-tech-debt (Wave 12.5: Technical Debt)

## ─── STATE ───────────────────────────────────────────────
Waves 13.x and 12.4 are CLOSED and deployed:
- PR #66 (12.4a video controls) — merged, Render live since e7cd6a6.
- PR #67 (12.4b) — merged (zero apps/api delta).
- PR #68 (12.4c courses content-scope + issue guard, R69) — pushed in R70,
  all CI green (incl. CodeQL), merged as 6a28f6d; Render auto-deploy
  confirmed live on 6a28f6d (dep-dbk0ms3ncjis73e3s39g, trigger new_commit).
- R68 DIAG accepted (device binding exonerated; scope semantics root cause).

Verification ledger (last recorded): backend 607/607 · vitest 355/355 ·
e2e 14/14 · CodeQL/Trivy/Lighthouse green · 375px + WCAG 2.2 AA ladder green.

## ─── WAVE 12.5 — IMPLEMENTED (this branch, 5 commits, NOT pushed) ───
R71 DIAG accepted; all 7 supervisor decisions LOCKED and implemented (Q1–Q7).

### Commit map (PART I R72 → commits)

1. **feat(api) 12.5.B** — `FileBookmark` entity (unique StudentId+FileId+PageNumber,
   check `page_number >= 1`, cascading FKs, Snippet ≤120), EF migration
   `AddFileBookmarks` (§3 permission GRANTED — file only, applied by deploy,
   never run manually against Neon), MediatR handlers (GET list / idempotent
   per-page POST upsert / owner-only DELETE → 403 foreign id), entitlement-gated
   endpoints under `api/v1/library` mirroring annotations, 9 handler tests.
2. **feat(student-web) 12.5.B** — bookmarks → server API: `usePdfBookmarks`
   (query + optimistic onMutate/onError-rollback mutations + server-truth
   toggle resolve for the pending-add race), one-time per-file legacy import
   (POST each → remove key → `cms:pdf:bookmarks:migrated:v1` marker; Q2),
   `pdf-bookmarks.ts` reduced to types + pure ordering + legacy readers,
   e2e S9 rewritten (server store: add→reload→persists, delete→gone,
   import→key removed) + bookmarks routes added to w12.3-matrix.
3. **fix(api) 12.5.A.5 (Q5)** — CoursesController 403 = ProblemDetails with
   `validation.FailureReason` (bare Forbid() dropped it — the R68 masquerade
   root); audit line preserved; unit tests assert the body carries the reason.
4. **fix(student-web) 12.5.A** — 20 silent error sites (R71 §A inventory):
   Group 1 catalogs ×4 → R69 taxonomy ported (`loadCatalogAcrossSubjects` +
   shared CatalogErrorCards; per-subject failures collected, bounded self-heal,
   throw on total failure, empty state only on genuine 200-empty);
   Group 2 profile ×2 → inline status text (password pattern);
   Group 3 session ×3 → single deduped session-expired toast (Q4);
   Group 4 query pages ×9 → error cards / inline cascade retry (DashboardPage
   pattern), notifications mutations get onError toasts, PermissionProvider
   surfaces a banner + `isError` in context;
   Group 5 media ×3 → audio-markers failure banner + retry, once-per-session
   progress-save toast (Q3). Tests: dedup unit tests + catalog error e2e (7/7).
5. **docs 12.5.C** — this refresh.

### §13 evidence (commits 2 & 4)

- `e2e/w12.5-bookmarks-axe.mjs`: 5 widths (375/414/768/1024/1440) — axe
  (wcag2a/2aa/21aa/22aa) **0 blocking at every width**, zero horizontal page
  scroll, panel targets ≥44px (rows + remove = 44px, rail add = 48px);
  screenshots `e2e/screenshots/w12.5-bookmarks-*.png` + `w12.5-bookmarks-axe.json`.
- PRE-EXISTING findings (A/B-proven on main @ 6a28f6d, NOT regressions, §12
  out of scope): rail toggle compresses to 22px at 1024×768 (12.2/12.3 rail
  flex behavior); panel close button 40px (12.3 chrome).
- RTL grep: zero directional utilities in added lines (commits 2 & 4).
- `e2e/w12.5-catalog-error.e2e.mjs` @375px: error card not empty state,
  retry ≥44px, zero h-scroll — 7/7.

### Deviations (§10 disclosure)

1. Q2's import flag: the locked flag name `cms:pdf:bookmarks:migrated:v1` is set
   as the device marker, but the import GATE is per-file legacy keys (a single
   global gate would silently drop every other document's bookmarks). Keys are
   removed only after a successful import; a failed import retries next mount.
2. Q7 delete by bookmarkId: the page→id resolution happens server-truth-first
   (fresh GET) inside the mutations, which also closes the pending-add race.
3. LibraryCatalog previously fetched my-subjects inline; it now shares
   `useMySubjects` (consistent entitlement signal across all four catalogs).

### Out of scope / untouched (§12)

- Annotations, media bookmarks, favorites public interfaces (Q constraint).
- No z-index changes; no measureText.
- Pre-existing 1024×768 rail compression + 40px panel close button (A/B-proven).

## ─── git log (this branch) ───────────────────────────────

`git log main..feat/12.5-tech-debt --oneline` — 5 commits; STOP GATE: push
requires supervisor PAT (next round). Migration applies on Render deploy only.
