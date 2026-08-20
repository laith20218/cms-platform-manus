# External Release Source Audit — 2026-08-20

## Source-of-truth decision

The current executable source, reproducible command logs under `docs/security/`, and the most recent Phase 41–46 reports are the source of truth for this closure. Legacy project-status narrative is not authoritative where it conflicts with later, dated evidence.

| Audit item | Observed evidence | Decision |
|---|---|---|
| Project status narrative | `PROJECT_STATUS.md` contains historical Phase 32/33/34 claims, including both previous go-live language and later blocked states. | **Stale / conflicting documentation.** It cannot support a release decision. |
| Current local evidence | Logs document Backend Release build, 95 non-PostgreSQL tests, Student Web build, and 9 Vitest tests. | **Current local truth.** |
| Git provenance | The provided release source is not a Git working tree. | No commit SHA or immutable release provenance can be verified locally. |
| Required release root docs | `CONTEXT.md`, `PROJECT_STATUS.md`, `PROJECT_TIMELINE.md`, `PROGRESS.md`, `CHANGELOG.md`, `DECISIONS.md`, `FILE_INDEX.md`, and `DEPENDENCY_GRAPH.md` are present. | Present, but must be reconciled before archive renewal. |
| Lockfiles and build metadata | `pnpm-lock.yaml`, `CMS.sln`, `docker-compose.yml`, `railway.toml`, and `vercel.json` are present. | Rebuildable inputs are present. |
| CI workflow | CI runs build/tests/security scan/SBOM and deployments, but action refs use mutable major tags (`@v4`, `@v6`, etc.) rather than commit SHA pins. | **Pinned-CI requirement not met.** A real run from an immutable release commit is required. |
| Docker invocation | Workflow expects Docker Buildx; local preflight reports Docker unavailable. | External environment verification required. |

## Release consequence

The current release cannot be promoted to **Production Candidate** on documentation alone. It remains **READY WITH EXTERNAL VERIFICATION** pending executable environment evidence, immutable source provenance, CI SHA pinning/run, and the external gates enumerated in the current production-gate report.
