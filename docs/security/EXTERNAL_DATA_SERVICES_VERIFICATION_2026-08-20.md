# External Closure — PostgreSQL, Redis, and Container Runtime Verification

## PostgreSQL 16 integration

A local PostgreSQL 16.14 service was found listening on port 5432. The isolated database `cms_phase34_test` existed. The test process used Unix-socket peer authentication as the local `ubuntu` PostgreSQL role; no password, production credential, or remote database was used.

| Command | Result |
|---|---|
| PostgreSQL probe | PASS — PostgreSQL 16.14 |
| `SessionServicePostgresIntegrationTests` | PASS — 2/2 |
| Full `dotnet test CMS.sln -c Release --no-build` with `CMS_PHASE34_TEST_POSTGRES` | PASS — 97/97 |

The integration tests exercise refresh rotation, replay revocation, explicit revocation, active-session validation, and expired refresh-token rejection against the actual PostgreSQL database. The fixture truncates only its designated session/security/student tables in the isolated test database.

## Redis

Redis is listening locally on port 6379. Connectivity and a non-production probe passed: `SET ... EX 30`, `GET`, `TTL`, `DEL`, and `EXISTS` yielded `OK`, the stored value, a positive TTL, deletion count `1`, then absence `0`.

## Container runtime

Neither Docker, Podman, nerdctl, nor containerd command was available in this environment. Docker image/compose validation remains **EXTERNAL VERIFICATION REQUIRED**. This does not invalidate the successful source build, database integration, or Redis verification.

Evidence files: `external_postgres_service_probe_2026-08-20.log`, `external_postgres_integration_tests_2026-08-20.log`, `external_backend_full_with_postgres_2026-08-20.log`, `external_redis_behavior_2026-08-20.log`, and `external_runtime_availability_2026-08-20.log`.
