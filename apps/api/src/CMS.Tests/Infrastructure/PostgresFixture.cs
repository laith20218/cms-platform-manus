using CMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace CMS.Tests.Infrastructure;

/// <summary>
/// Push 11.5 / PART B — shared Postgres provider for the 27 PostgresIntegration tests.
///
/// Semantics (premise-corrected vs. the pre-11.5 state):
///   • If CMS_PHASE34_TEST_POSTGRES is already set, its value is treated as an EXTERNAL
///     connection string (e.g. a Neon branch) and is used verbatim — no container starts.
///   • Otherwise a throwaway PostgreSqlContainer (postgres:16-alpine) is started, all EF
///     migrations are applied, and the resulting connection string is published through the
///     SAME environment variable the guarded tests already read — zero changes to their bodies.
///   • If neither is available, the container is never started; instead
///     <see cref="PostgresFixture.ProbeSkipReason"/> marks every [PostgresFact] as skipped
///     with a clear reason.
///
/// The fixture is attached to the existing [Collection("PostgresIntegration")]
/// (DisableParallelization = true) via ICollectionFixture in PostgresIntegrationCollection.cs,
/// so it initializes exactly once, before the first test of the collection runs.
/// </summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private PostgreSqlContainer? _container;

    public string ConnectionString { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        var external = Environment.GetEnvironmentVariable(PostgresIntegrationEnvironment.VariableName);
        if (string.IsNullOrWhiteSpace(external))
        {
            _container = new PostgreSqlBuilder()
                .WithImage("postgres:16-alpine") // throwaway test DB; Neon production is PG16-compatible
                .Build();
            await _container.StartAsync();
            ConnectionString = _container.GetConnectionString();
        }
        else
        {
            ConnectionString = external;
        }

        // The guarded tests (incl. MigrationContract_CoursesTablesExist_WithConstraints) expect
        // the schema to pre-exist; one test TRUNCATEs security tables. Apply every migration to
        // the throwaway/external database before any test runs.
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;
        await using var db = new ApplicationDbContext(options);
        await db.Database.MigrateAsync();

        // Publish for the existing Environment.GetEnvironmentVariable(...) reads inside the
        // 27 guarded test methods (their bodies are intentionally untouched).
        Environment.SetEnvironmentVariable(PostgresIntegrationEnvironment.VariableName, ConnectionString);
    }

    public async Task DisposeAsync()
    {
        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
    }

    /// <summary>
    /// Discovery-time availability probe consumed by <see cref="PostgresFactAttribute"/>.
    /// Returns null (run) when an external connection string is provided OR a Docker endpoint
    /// exists for the fixture to start its container; otherwise returns the skip reason.
    /// </summary>
    public static string? ProbeSkipReason()
    {
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(PostgresIntegrationEnvironment.VariableName)))
        {
            return null; // external database provided — tests will run against it
        }

        var dockerHost =
            File.Exists("/var/run/docker.sock") ||
            !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DOCKER_HOST"));
        if (dockerHost)
        {
            return null; // the fixture will start a throwaway container
        }

        return "Postgres integration tests skipped: no CMS_PHASE34_TEST_POSTGRES connection string and no Docker endpoint for Testcontainers.";
    }
}

/// <summary>
/// [Fact] with a runtime skip: runs when Postgres is reachable (external connection string or
/// Docker for the Testcontainers fixture); otherwise the test is skipped with a clear reason
/// instead of failing with BLOCKED. Replaces the old fail-fast behavior of the 27 guarded tests.
/// </summary>
public sealed class PostgresFactAttribute : FactAttribute
{
    private static readonly string? SkipReason = PostgresFixture.ProbeSkipReason();

    public override string? Skip => SkipReason;
}

/// <summary>Shared constant for the connection-string environment variable.</summary>
public static class PostgresIntegrationEnvironment
{
    public const string VariableName = "CMS_PHASE34_TEST_POSTGRES";
}
