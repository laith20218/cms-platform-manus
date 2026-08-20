# External Closure — Rebuildability Evidence

## Results

| Target | Command class | Result |
|---|---|---|
| Frontend dependency install | `pnpm install --frozen-lockfile` | PASS |
| Frontend TypeScript | `pnpm exec tsc -b` | PASS |
| Frontend lint | `pnpm lint` | PASS with 37 warnings and 0 errors |
| Frontend tests | `pnpm exec vitest run` | PASS — 9/9 |
| Frontend production build | `pnpm build` | PASS |
| Backend restore | `dotnet restore CMS.sln` | PASS |
| Backend Release build | `dotnet build CMS.sln -c Release --no-restore` | PASS — 0 warnings, 0 errors |
| Backend complete test attempt | `dotnet test CMS.sln -c Release --no-build` | 95 passed, 2 blocked because `CMS_PHASE34_TEST_POSTGRES` is absent |
| Redis connectivity | `redis-cli ping` | PASS — PONG |
| Redis TTL/invalidation probe | `SET EX`, `GET`, `TTL`, `DEL`, `EXISTS` | PASS |

## Interpretation

The source is reproducibly buildable with its lockfile and installed toolchains. The full backend suite did not pass: it intentionally fails two PostgreSQL session integration tests when a dedicated integration connection is not provided. This is a true external verification gate, not a code/build failure.

Frontend lint warnings should be tracked as quality debt but do not currently fail the configured CI job, which also permits lint continuation. No production candidate decision is supported until the PostgreSQL suite and other release gates are exercised in a controlled environment.

Artifacts: `external_frontend_*.log`, `external_backend_*.log`, `external_runtime_availability_2026-08-20.log`, and `external_redis_behavior_2026-08-20.log`.
