using System.Collections.Concurrent;
using System.Net;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Persistence;
using CMS.Tests.Integration;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace CMS.Tests.Integration.Health;

/// <summary>
/// Wave 15.5c (DEBT-HEALTH-ENDPOINT) — the Neon wakeup guard.
///
/// Owner context: UptimeRobot pings (every 10min) kept the Neon Postgres compute
/// awake 24/7 (82.8% of the monthly free-tier allowance). UptimeRobot was paused and
/// is re-enabled AFTER this wave targeting /health/live ONLY. /health/live is mapped
/// with Predicate = _ => false (no registered check runs), so a ping never opens a
/// DB connection. These tests are the GUARD: the first one FAILS if anyone ever
/// wires a DB-dependent check into /health/live (e.g. by changing the predicate or
/// removing the "ready" tags). /health/ready keeps the "ready"-tagged checks
/// (AddNpgSql + UpstashRedisHealthCheck) and must go 503 when they fail.
/// </summary>
public sealed class HealthEndpointTests : IClassFixture<HtmlViewHttpFactory>
{
    private readonly HtmlViewHttpFactory _factory;

    public HealthEndpointTests(HtmlViewHttpFactory factory) => _factory = factory;

    /// <summary>
    /// WebApplicationFactory with a guaranteed-unreachable PostgreSQL target.
    /// The NpgSql health check is registered in Program.cs via an EAGER
    /// builder.Configuration.GetConnectionString("PostgreSQL") read, so the value must
    /// come from the default config chain (env vars beat appsettings) — hence the ctor
    /// env var, not only the in-memory collection. EF and the session/cache services
    /// are swapped to the same InMemory/offline contract the other integration
    /// factories use, so host startup and background services never need real
    /// Postgres; ONLY the NpgSql readiness check sees the unreachable string.
    /// Loopback port 1 refuses instantly: no DNS, no retries, deterministic on every
    /// runner. (xUnit runs classes in parallel and each HtmlViewHttpFactory also sets
    /// ConnectionStrings__PostgreSQL — but both candidate values are unreachable in
    /// every environment this suite runs in, so the 503 assertion is race-proof.)
    /// </summary>
    private sealed class UnreachableDbFactory : WebApplicationFactory<Program>
    {
        private const string Unreachable = "Host=127.0.0.1;Port=1;Database=cms_guard;Username=cms;Timeout=2";

        private readonly string _databaseName = $"cms-15-5c-health-guard-{Guid.NewGuid():N}";
        private readonly ServiceProvider _inMemoryEfServices =
            new ServiceCollection().AddEntityFrameworkInMemoryDatabase().BuildServiceProvider();
        private readonly ConcurrentDictionary<string, object?> _cache = new();

        public UnreachableDbFactory()
        {
            // Same env contract the other factories establish for Program.cs, with the
            // PostgreSQL value pointed at the unreachable guard target.
            Environment.SetEnvironmentVariable("Jwt__Secret", "wave-15-5c-health-guard-jwt-signing-key-not-production");
            Environment.SetEnvironmentVariable("Jwt__Issuer", "wave-15-5c-health-tests");
            Environment.SetEnvironmentVariable("Jwt__Audience", "wave-15-5c-health-tests");
            Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "wave-15-5c-health-guard-entitlement-test-key");
            Environment.SetEnvironmentVariable("Security__Entitlements__LifetimeMinutes", "20");
            Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", Unreachable);
            Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:PostgreSQL"] = Unreachable,
                ["ConnectionStrings:Redis"] = "localhost:6379",
                // UpstashRedisHealthCheck resolves the CONCRETE UpstashRedisRestCacheService,
                // whose ctor throws (500 via the exception middleware) unless the REST keys
                // are configured. Point them at the same unreachable loopback: the ctor
                // succeeds, the PING fails at check time, and the check reports Unhealthy —
                // mirroring the production "configured but degraded" 503 path.
                ["Upstash:Redis:RestUrl"] = "https://127.0.0.1:1/",
                ["Upstash:Redis:RestToken"] = "wave-15-5c-guard-not-a-real-token",
                ["Security:Audit:BatchSize"] = "50",
                ["Security:Audit:FlushSeconds"] = "60",
                ["Security:Audit:QueueCapacity"] = "100",
            }));
            builder.ConfigureServices(services =>
            {
                // EF on InMemory so startup and hosted services never touch Postgres —
                // only the NpgSql readiness check does (that is the thing under test).
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<ApplicationDbContext>();
                services.RemoveAll<IApplicationDbContext>();
                services.AddDbContext<ApplicationDbContext>(options =>
                    options.UseInMemoryDatabase(_databaseName).UseInternalServiceProvider(_inMemoryEfServices));
                services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
                services.RemoveAll<ICacheService>();
                services.AddSingleton<ICacheService>(new OfflineHttpCache(_cache));
                services.RemoveAll<ISessionService>();
                var sessions = new Mock<ISessionService>();
                sessions
                    .Setup(s => s.IsActiveAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                    .Returns(Task.FromResult(true));
                services.AddScoped<ISessionService>(_ => sessions.Object);
            });
        }

        public new async Task DisposeAsync()
        {
            await base.DisposeAsync();
            await _inMemoryEfServices.DisposeAsync();
        }
    }

    [Fact]
    public async Task Live_Returns200_WhenDatabaseIsUnreachable()
    {
        // THE GUARD (15.5c): if this test starts failing with 503, someone has wired a
        // DB dependency into /health/live — re-enabled UptimeRobot pings would wake
        // Neon again (the exact regression this wave exists to prevent).
        var factory = new UnreachableDbFactory();
        try
        {
            var response = await factory.CreateClient().GetAsync("/health/live");

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "/health/live must be a pure liveness check: no DB dependency, ever");
            var body = await response.Content.ReadAsStringAsync();
            body.Should().Contain("Healthy");
        }
        finally
        {
            await factory.DisposeAsync();
        }
    }

    [Fact]
    public async Task Ready_Returns503_WhenDatabaseIsUnreachable()
    {
        // Readiness is the DB-dependent path by design: the "ready"-tagged checks
        // (NpgSql + UpstashRedisHealthCheck) must fail against an unreachable DB and
        // surface 503, so deploy gating (deploy.sh curls /health/ready) works.
        var factory = new UnreachableDbFactory();
        try
        {
            var response = await factory.CreateClient().GetAsync("/health/ready");

            response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable,
                "/health/ready runs the DB-dependent checks and must be 503 when they fail");
        }
        finally
        {
            await factory.DisposeAsync();
        }
    }

    [Fact]
    public async Task Live_Returns200_UnderNormalInMemorySetup()
    {
        // Normal harness (InMemory EF, seeded fixture): /health/live is 200 here too —
        // its answer never depends on the database in either direction.
        var response = await _factory.Client.GetAsync("/health/live");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("Healthy");
    }
}
