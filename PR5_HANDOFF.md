# PR-5 Handoff — push blocked (no credentials in this environment)

> **UPDATE (delivery session): the push block was resolved by the owner — the
> branch was pushed and the Pull Request opened. The sections below are the
> preserved handoff record from the sandbox session that produced the work;
> only the "push blocked" framing is historical.**

> **Status: PR-5 is fully implemented, tested, and committed locally. The push
> failed because this machine has NO GitHub credentials (no token, no gh CLI, no
> credential helper). A Pull Request does NOT exist yet. Do not merge anything
> silently — the owner reviews and opens/merges the PR.**

## Recovery result

The previously-reported local PR-5 work was **not recoverable** (the sandbox was
reset; the entire `/home/z/cms-platform-manus` clone from the previous session was
gone). PR-5 was **re-implemented from scratch** from the latest remote main
(verified ancestor `5db99f9`, PR #216 merge commit).

## Exact next action (owner or a credentialed session)

```bash
cd /home/z/cms-platform-manus
git fetch origin
git checkout feat/pr-5-content-centers-b2-retention
# verify the commit below is HEAD
git rev-parse HEAD          # expected: f0d8cf204a480fcbb65c7fa1df762bf9d23e1cee
git push -u origin feat/pr-5-content-centers-b2-retention
# then open the PR on GitHub:
#   base: main   <-   feat/pr-5-content-centers-b2-retention
#   title: PR-5 — Exams, Courses, Library lifecycle, and B2 retention
```

If `git push` is run from a session with credentials, the branch lands as-is.
No force flags needed; the branch has exactly one commit on top of `5db99f9`.

## Branch / commit

- Base: `origin/main` = `5db99f90a20fae9aa25941de1e6fa44a51b93da1` (PR #216 merge)
- Branch: `feat/pr-5-content-centers-b2-retention`
- Commit: `f0d8cf204a480fcbb65c7fa1df762bf9d23e1cee` (1 commit, 35 files, +1688/−85)

## Completed scope

### Exams
- `POST /api/v1/admin/exams/{id}/duplicate` — configuration + ordered composition
  copied as a fresh Draft; distinct slug; sessions/results never copied.
- `POST /api/v1/admin/exams/{id}/restore` — archived → Draft.
- Dependency-aware archive: `EXAM_IN_PUBLISHED_BUNDLE` refusal (draft bundles
  never block).
- `GET /api/v1/admin/exams/{id}/composition-validation` — pre-flight per-question
  issue report (byte-identical messages with the publish throws).
- Editor UI: pre-flight check button + issue panel (missing/invalid question
  warnings BEFORE publish); duplicate + restore row actions with confirms.

### Courses (video courses)
- `POST /admin/courses/{id}/unpublish` (Published → Draft; episodes untouched).
- `POST /admin/courses/{id}/duplicate` (metadata-only Draft; episodes NOT copied
  — an upload episode owns its stored blob).
- `POST /admin/courses/{id}/restore` (archived → Draft).
- `GET /admin/courses/{id}/usage` — real episodes/views/favorites/in-flight counts.
- UI: server-side pagination + search/status filters + the shared pager; the
  archive confirm carries the real usage numbers.

### Library + provider-neutral B2 retention
- `LibraryRetentionState` (Active / RetentionPending / Quarantined) + quarantine
  columns (nullable; NULL = Active) — EF migration `AddLibraryRetention`.
- `POST /library/{id}/quarantine` (reason required; audited; object untouched).
- `POST /library/{id}/restore` (quarantine lift or tombstone clear → Draft).
- `POST /library/{id}/purge` — final object deletion ONLY: SuperAdmin + actor
  password re-auth + `Features:HardDeleteEnabled` (fail-closed, shared with the
  system hard-delete) + `Library:RetentionDays` window + Critical
  intent/executed audits; storage objects deleted FIRST (idempotent retry),
  then the row + cascade references in one transaction; `DeletePrefixAsync`
  added to `IFileStorageService` (S3/B2 paged list + batch delete; the retired
  Upstash implementation satisfies the interface too).
- Retention lifecycle view on the admin list (`lifecycle=tombstoned|quarantined`)
  + retention badges + quarantine reason/timestamps + usage counters.
- **Retention contract fix**: normal course/episode deletes no longer physically
  destroy stored blobs (the hidden blob cleanup inside the CRUD handlers is
  gone — tombstones only; purge is the only physical deletion path). The library
  delete confirm text was corrected to match (retention, not storage removal).

## Incomplete / known limitations

- No GitHub PR opened (push blocked, credentials absent).
- Postgres integration tests (36) skip locally by design; they run in CI.
- Purge deletes the upload folder prefix (`library/{guid}/…`) in one
  `DeletePrefixAsync`; legacy non-folder keys fall back to explicit key +
  sibling deletes (tested). Thumbnails referenced by external URLs are not B2
  objects and are not purged.
- Course duplicate is metadata-only by design (blob ownership rule).

## Tests (exact counts)

- Backend (xUnit): **995 passed / 0 failed / 36 skipped** locally (skips = the
  Postgres integration suite, runs in CI). New: 35 lifecycle tests
  (LibraryRetentionLifecycleHandlerTests 14, ExamLifecycleAdminHandlerTests 10,
  CourseLifecycleAdminHandlerTests 11); 2 legacy course-delete tests updated to
  the new retention contract.
- admin-web (vitest/jsdom): **254 passed / 0 failed** (was 234; +20 new across
  exams-lifecycle-admin / courses-lifecycle-admin / library-retention).
- @cms/ui: **61 passed / 0 failed**. tsc admin-web: clean. ESLint on touched
  files: clean.
- student-web (regression): **835 passed / 0 failed** + production build clean.
- admin-web production build: clean. Security artifact gate + secret scan: clean.

## Rollback plan

Single-commit branch: `git revert f0d8cf2` on main after merge (the EF migration
is additive/nullable — `Down()` drops the three columns + index; no data loss
for active rows; quarantined rows lose their quarantine metadata).
