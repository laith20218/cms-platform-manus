# RESUME_FROM — next session start point

- **Branch**: `feat/12.5-tech-debt` (5 commits, LOCAL — do NOT push without supervisor PAT, §2).
- **Base**: main @ `6a28f6d` (PR #68 merged; Render live).
- **HEAD**: `f70b478` (see `git log main..feat/12.5-tech-debt --oneline` for the commit map).
- **State**: Wave 12.5 (Tech Debt) implemented per R72 — 5 commits: backend
  FileBookmark stack + migration `AddFileBookmarks` (applies on deploy ONLY),
  bookmarks server migration + optimistic UI + one-time import, 403
  ProblemDetails reason, 20 silent-error sites surfaced, WIP_STATUS refresh.
- **Verification (final ladder, all green)**: dotnet 619/619 (27 skipped
  Testcontainers) · tsc 0 · lint 0 · vitest 364/364 · build 0 ·
  e2e pdf-11.11 26/26 · pdf 27/27 · video 29/29 · §13 pack
  (`e2e/screenshots/w12.5-bookmarks-*.png` + `w12.5-bookmarks-axe.json`,
  axe 0 blocking at 5 widths) · catalog-error e2e 7/7 @375px.
- **Next round (R73)**: supervisor review of this branch → push + PR + CI +
  merge + Render deploy verification (the R70 playbook; migration
  `AddFileBookmarks` applies during deploy — verify `file_bookmarks` exists in
  Neon and GET /library/{id}/bookmarks responds).
- **Environment note**: `public/e2e-test-video.mp4` is a git-IGNORED fixture;
  if `player-video.e2e.mjs` times out on resume-seek, regenerate with the
  ffmpeg command documented in that file's header (missing fixture = the
  failure signature; A/B-proven 2026-11-02).
