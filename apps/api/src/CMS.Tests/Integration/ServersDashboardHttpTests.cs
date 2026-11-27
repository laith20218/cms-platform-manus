using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using CMS.Application.DTOs.Monitoring;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;

namespace CMS.Tests.Integration;

/// <summary>
/// PR-8 (Servers Dashboard) HTTP integration tests.
/// Factory pattern mirrors SettingsStudioHttpTests: InMemory EF + header-driven test auth
/// handler + seeded super admin, a custom-role admin WITHOUT servers grants, and a custom-role
/// admin WITH an explicit servers.view grant (still not enough — the SuperAdmin role policy pins
/// the surface). Real monitors run with NO MONITORING_* env names → every provider must answer
/// honestly with missing_credentials.
/// </summary>
[Collection("SignedEntitlementHttp")]
public sealed class ServersDashboardHttpTests : IClassFixture<ServersDashboardHttpFactory>
{
    private readonly ServersDashboardHttpFactory _factory;

    public ServersDashboardHttpTests(ServersDashboardHttpFactory factory) => _factory = factory;

    private HttpClient Client => _factory.Client;

    private static HttpRequestMessage As(HttpMethod method, string uri, Guid adminId, string role = "super_admin")
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", adminId.ToString());
        request.Headers.TryAddWithoutValidation("X-Test-Role", role);
        return request;
    }

    // ===== authorization boundary =====

    [Fact]
    public async Task AnonymousSummary_Unauthorized()
    {
        var response = await Client.GetAsync("/api/v1/admin/servers/summary");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task NonSuperAdmin_WithoutServersGrant_Forbidden()
    {
        var response = await Client.SendAsync(As(HttpMethod.Get, "/api/v1/admin/servers/summary",
            _factory.CustomAdminId, role: "custom"));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
            "no seeded role grant carries servers.view — the custom admin fails both policies");
    }

    [Fact]
    public async Task NonSuperAdmin_WithExplicitServersViewGrant_StillForbidden()
    {
        // The servers.view grant alone is NOT enough: [Authorize(Policy = "SuperAdmin")] also
        // stacks on the controller — the surface stays SuperAdmin-only by role until relaxed.
        var response = await Client.SendAsync(As(HttpMethod.Get, "/api/v1/admin/servers/summary",
            _factory.GrantedAdminId, role: "custom"));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task StudentToken_Forbidden()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/admin/servers/summary");
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", Guid.NewGuid().ToString());
        var response = await Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ===== honest missing_credentials with no monitoring env =====

    [Fact]
    public async Task SuperAdmin_NoMonitoringEnv_EveryProviderMissingCredentials()
    {
        // fresh=true keeps this test deterministic regardless of the shared in-memory cache.
        var response = await Client.SendAsync(As(HttpMethod.Get, "/api/v1/admin/servers/summary?fresh=true", _factory.SuperAdminId));
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("overallStatus").GetString().Should().Be(ServersOverallStatus.Unavailable,
            "nothing is configured — the dashboard never fakes an up state");

        var providers = body.GetProperty("providers");
        providers.GetArrayLength().Should().Be(4);
        foreach (var provider in providers.EnumerateArray())
        {
            provider.GetProperty("status").GetString().Should().Be(ProviderStatus.MissingCredentials);
            provider.GetProperty("responseTimeMs").GetInt32().Should().Be(-1);
            provider.GetProperty("unavailableReason").GetString().Should().Be("بيانات الاعتماد غير مُهيّأة");
            provider.GetProperty("note").GetString().Should().Be("credentials not configured");
            provider.GetProperty("freshness").GetProperty("cached").GetBoolean().Should().BeFalse();
            provider.GetProperty("freshness").GetProperty("ageSeconds").GetInt32().Should().Be(0);
        }
        providers.EnumerateArray().Select(provider => provider.GetProperty("provider").GetString())
            .Should().BeEquivalentTo(new[] { "render", "vercel", "neon", "github" }, options => options.WithStrictOrdering());
    }

    [Fact]
    public async Task SuperAdmin_RenderDetail_MissingCredentialsEnvelope()
    {
        var response = await Client.SendAsync(As(HttpMethod.Get, "/api/v1/admin/servers/render", _factory.SuperAdminId));
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("provider").GetString().Should().Be("render");
        body.GetProperty("status").GetString().Should().Be(ProviderStatus.MissingCredentials);
        body.GetProperty("responseTimeMs").GetInt32().Should().Be(-1);
        body.GetProperty("unavailableReason").GetString().Should().Be("بيانات الاعتماد غير مُهيّأة");
        body.EnumerateObject().Select(property => property.Name).Should().Contain("checkedAt");
        body.TryGetProperty("data", out var data).Should().BeTrue();
        data.ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task SuperAdmin_FreshParam_RechecksHonestState()
    {
        var response = await Client.SendAsync(As(HttpMethod.Get, "/api/v1/admin/servers/vercel?fresh=true", _factory.SuperAdminId));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be(ProviderStatus.MissingCredentials);
    }

    // ===== history =====

    [Fact]
    public async Task RenderHistory_ReturnsBoundedInMemoryShape()
    {
        // Warm the monitor with at least one check first.
        await Client.SendAsync(As(HttpMethod.Get, "/api/v1/admin/servers/render", _factory.SuperAdminId));

        var response = await Client.SendAsync(As(HttpMethod.Get, "/api/v1/admin/servers/render/history", _factory.SuperAdminId));
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("provider").GetString().Should().Be("render");
        body.GetProperty("capacity").GetInt32().Should().Be(50);
        body.GetProperty("windowNote").GetString().Should().Contain("السجل في الذاكرة منذ آخر إعادة تشغيل للخدمة");
        body.GetProperty("windowNote").GetString().Should().Contain("in-memory history since the last API restart");

        var items = body.GetProperty("items");
        items.GetArrayLength().Should().BeGreaterOrEqualTo(1);
        var first = items[0];
        first.GetProperty("status").GetString().Should().Be(ProviderStatus.MissingCredentials);
        first.GetProperty("responseTimeMs").GetInt32().Should().Be(-1);
        first.GetProperty("reason").GetString().Should().Be("بيانات الاعتماد غير مُهيّأة");
        first.EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo("checkedAt", "status", "responseTimeMs", "reason");
    }

    [Fact]
    public async Task UnknownProviderHistory_NotFoundProblemDetails()
    {
        var response = await Client.SendAsync(As(HttpMethod.Get, "/api/v1/admin/servers/unknown-provider/history", _factory.SuperAdminId));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("title").GetString().Should().Be("Unknown provider");
        body.GetProperty("status").GetInt32().Should().Be(404);
        body.GetProperty("detail").GetString().Should().Contain("render");
    }
}

// ===== Mocked-orchestrator factory tests: exact DTO shape end-to-end =====

/// <summary>
/// End-to-end DTO-shape assertions with IServersMonitorService replaced by a mock returning
/// fixed envelopes — pins the whole wire contract (summary + all four details + history) with
/// no upstream dependency.
/// </summary>
[Collection("SignedEntitlementHttp")]
public sealed class ServersDashboardMockedHttpTests : IClassFixture<ServersDashboardMockedHttpFactory>
{
    private readonly ServersDashboardMockedHttpFactory _factory;

    public ServersDashboardMockedHttpTests(ServersDashboardMockedHttpFactory factory) => _factory = factory;

    private Task<HttpResponseMessage> GetAsSuper(string uri)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", _factory.SuperAdminId.ToString());
        request.Headers.TryAddWithoutValidation("X-Test-Role", "super_admin");
        return _factory.Client.SendAsync(request);
    }

    [Fact]
    public async Task Summary_MockedOrchestrator_ExactWireShape()
    {
        var response = await GetAsSuper("/api/v1/admin/servers/summary");
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo("overallStatus", "checkedAt", "providers");
        body.GetProperty("overallStatus").GetString().Should().Be("degraded");

        var providers = body.GetProperty("providers");
        providers.GetArrayLength().Should().Be(4);
        foreach (var provider in providers.EnumerateArray())
        {
            provider.EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo(
                "provider", "status", "checkedAt", "responseTimeMs", "unavailableReason", "freshness", "note");
        }
        providers[0].GetProperty("provider").GetString().Should().Be("render");
        providers[0].GetProperty("status").GetString().Should().Be("operational");
        providers[0].GetProperty("responseTimeMs").GetInt32().Should().Be(110);
        providers[0].GetProperty("note").GetString().Should().Be("render note");
        providers[0].GetProperty("freshness").GetProperty("cached").GetBoolean().Should().BeFalse();
        providers[0].GetProperty("freshness").GetProperty("ageSeconds").GetInt32().Should().Be(0);
        providers[2].GetProperty("status").GetString().Should().Be("down");
        providers[2].GetProperty("unavailableReason").GetString().Should().Be("upstream timeout");
    }

    [Fact]
    public async Task RenderDetail_MockedEnvelope_ExactWireShape()
    {
        var response = await GetAsSuper("/api/v1/admin/servers/render");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo(
            "provider", "status", "checkedAt", "responseTimeMs", "unavailableReason", "freshness", "data");

        var data = body.GetProperty("data");
        data.EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo(
            "service", "lastDeploy", "metricsAvailable", "metricsUnavailableReason");

        var service = data.GetProperty("service");
        service.GetProperty("id").GetString().Should().Be("srv-mock");
        service.GetProperty("name").GetString().Should().Be("cms-api-preview");
        service.GetProperty("suspended").GetBoolean().Should().BeFalse();
        service.GetProperty("autoDeploy").GetBoolean().Should().BeTrue();
        service.GetProperty("plan").GetString().Should().Be("free");
        service.GetProperty("region").GetString().Should().Be("oregon");

        var deploy = data.GetProperty("lastDeploy");
        deploy.GetProperty("id").GetString().Should().Be("dep-mock");
        deploy.GetProperty("status").GetString().Should().Be("live");
        deploy.GetProperty("commitSha").GetString().Should().Be("c9547ac");
        deploy.GetProperty("commitMessage").GetString().Should().Be("feat: mock");

        data.GetProperty("metricsAvailable").GetBoolean().Should().BeFalse();
        data.GetProperty("metricsUnavailableReason").GetString().Should().Be("metrics not exposed on this plan");
    }

    [Fact]
    public async Task VercelDetail_MockedEnvelope_BothProjectsWireShape()
    {
        var response = await GetAsSuper("/api/v1/admin/servers/vercel");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var projects = body.GetProperty("data").GetProperty("projects");
        projects.GetArrayLength().Should().Be(2);

        var first = projects[0];
        first.EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo(
            "id", "name", "latestDeployment", "url");
        first.GetProperty("id").GetString().Should().Be("prj-admin");
        first.GetProperty("url").GetString().Should().Be("cms-admin-web.vercel.app");

        var deployment = first.GetProperty("latestDeployment");
        deployment.GetProperty("id").GetString().Should().Be("dpl-admin");
        deployment.GetProperty("state").GetString().Should().Be("READY");
        deployment.GetProperty("target").GetString().Should().Be("production");
        deployment.GetProperty("commitSha").GetString().Should().Be("abc123");
        deployment.GetProperty("commitRef").GetString().Should().Be("main");
    }

    [Fact]
    public async Task NeonDetail_MockedEnvelope_NoConnectionMaterial()
    {
        var response = await GetAsSuper("/api/v1/admin/servers/neon");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var raw = await response.Content.ReadAsStringAsync();
        raw.Should().NotContainAny("connection", "postgres://", "password");

        var data = body.GetProperty("data");
        data.EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo(
            "project", "branch", "usage", "usageUnavailableReason");
        data.GetProperty("project").GetProperty("id").GetString().Should().Be("neon-mock");
        data.GetProperty("project").GetProperty("regionId").GetString().Should().Be("aws-eu-central-1");
        data.GetProperty("branch").GetProperty("name").GetString().Should().Be("main");
        data.GetProperty("usage").ValueKind.Should().Be(JsonValueKind.Null);
        data.GetProperty("usageUnavailableReason").GetString().Should().Be("consumption metrics not exposed by the scoped key/plan");
    }

    [Fact]
    public async Task GithubDetail_MockedEnvelope_WorkflowsWireShape()
    {
        var response = await GetAsSuper("/api/v1/admin/servers/github");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var data = body.GetProperty("data");
        var repository = data.GetProperty("repository");
        repository.GetProperty("name").GetString().Should().Be("cms-platform-manus");
        repository.GetProperty("fullName").GetString().Should().Be("laith20218/cms-platform-manus");
        repository.GetProperty("visibility").GetString().Should().Be("private");
        repository.GetProperty("defaultBranch").GetString().Should().Be("main");
        repository.GetProperty("openIssuesCount").GetInt32().Should().Be(2);

        var workflows = data.GetProperty("recentWorkflows");
        workflows.GetArrayLength().Should().Be(1);
        workflows[0].GetProperty("id").GetInt64().Should().Be(123456);
        workflows[0].GetProperty("name").GetString().Should().Be("CI");
        workflows[0].GetProperty("conclusion").GetString().Should().Be("success");
    }

    [Fact]
    public async Task History_MockedOrchestrator_ExactWireShape()
    {
        var response = await GetAsSuper("/api/v1/admin/servers/github/history");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo(
            "provider", "capacity", "windowNote", "items");
        body.GetProperty("provider").GetString().Should().Be("github");
        body.GetProperty("capacity").GetInt32().Should().Be(50);
        body.GetProperty("windowNote").GetString().Should().Contain("in-memory history since the last API restart");

        var items = body.GetProperty("items");
        items.GetArrayLength().Should().Be(1);
        items[0].EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo(
            "checkedAt", "status", "responseTimeMs", "reason");
        items[0].GetProperty("status").GetString().Should().Be("operational");
        items[0].GetProperty("responseTimeMs").GetInt32().Should().Be(55);
        items[0].GetProperty("reason").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public async Task MockedDetailRoutes_PassFreshAndCorrelationId()
    {
        await GetAsSuper("/api/v1/admin/servers/render?fresh=true");

        _factory.Monitor.Verify(m => m.GetRenderAsync(
            true, It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}

// ===== Factories =====

/// <summary>Shared plumbing: env, InMemory EF, header-driven auth, session/audit mocks, seeding.</summary>
public abstract class ServersDashboardHttpFactoryBase : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string JwtSigningKey = "servers-dashboard-test-jwt-signing-key-32b";
    private readonly string _databaseName = $"servers-dashboard-http-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection()
        .AddEntityFrameworkInMemoryDatabase()
        .BuildServiceProvider();

    internal HttpClient Client { get; private set; } = null!;
    internal Mock<ISessionService> Sessions { get; } = new();
    internal Mock<ISecurityAuditWriter> Audit { get; } = new();

    internal Guid SuperAdminId { get; private set; }
    internal Guid CustomAdminId { get; private set; }
    internal Guid GrantedAdminId { get; private set; }

    /// <summary>Hook for the mocked factory to swap the orchestrator; the real factory uses the app's.</summary>
    protected abstract void ConfigureMonitoring(IServiceCollection services);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Environment.SetEnvironmentVariable("Jwt__Secret", JwtSigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "servers-dashboard-test");
        Environment.SetEnvironmentVariable("Jwt__Audience", "servers-dashboard-test");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Port=5432;Database=cms_servers_dashboard_test;Username=postgres;Password=not-used");
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "servers-dashboard-entitlement-key-32b!!");

        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:Secret", JwtSigningKey);
        builder.UseSetting("Jwt:Issuer", "servers-dashboard-test");
        builder.UseSetting("Jwt:Audience", "servers-dashboard-test");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = "servers-dashboard-test",
            ["Jwt:Audience"] = "servers-dashboard-test",
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Port=5432;Database=cms_servers_dashboard_test;Username=postgres;Password=not-used",
            ["ConnectionStrings:Redis"] = "localhost:6379"
            // Deliberately NO MONITORING_* names: the honest-state tests rely on their absence.
        }));

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<ApplicationDbContext>();
            services.RemoveAll<IApplicationDbContext>();
            services.AddDbContext<ApplicationDbContext>(options => options
                .UseInMemoryDatabase(_databaseName)
                .UseInternalServiceProvider(_inMemoryEfServices));
            services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());

            // Header-driven test auth: super admin / custom-role admin / anonymous.
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = ServersDashboardTestAuthHandler.Scheme;
                options.DefaultChallengeScheme = ServersDashboardTestAuthHandler.Scheme;
                options.DefaultForbidScheme = ServersDashboardTestAuthHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, ServersDashboardTestAuthHandler>(ServersDashboardTestAuthHandler.Scheme, _ => { });

            services.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>(
                Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme,
                options =>
                {
                    options.Events ??= new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents();
                    options.Events.OnAuthenticationFailed = _ => Task.CompletedTask;
                    options.Events.OnMessageReceived = _ => Task.CompletedTask;
                });

            services.RemoveAll<ISessionService>();
            Sessions.Setup(s => s.IsActiveAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(true);
            Sessions.Setup(s => s.TouchActivityAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            Sessions.Setup(s => s.RevokeAllForUserAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.AddScoped<ISessionService>(_ => Sessions.Object);

            services.RemoveAll<ICacheService>();
            services.AddSingleton<ICacheService, ServersDashboardInMemoryCache>();

            services.RemoveAll<ISecurityAuditWriter>();
            Audit.Setup(a => a.LogSecurityEventAsync(
                    It.IsAny<Guid?>(), It.IsAny<Guid?>(),
                    It.IsAny<SecurityEventType>(), It.IsAny<SecuritySeverity>(),
                    It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(),
                    It.IsAny<string?>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.AddScoped<ISecurityAuditWriter>(_ => Audit.Object);

            ConfigureMonitoring(services);
        });
    }

    public async Task InitializeAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var superRole = AdminRole.Create(Roles.SuperAdmin, "مدير عام الاختبار", isSystem: true);
        var customRole = AdminRole.Create("pr8_custom", "مدير مخصص");
        db.AdminPermissions.Add(AdminPermission.Create(customRole.Id, Resources.Questions,
            System.Text.Json.JsonSerializer.Serialize(new List<string> { Actions.View }), "scoped"));
        // A role that DOES carry servers.view — proving the grant alone still cannot reach the
        // surface while the SuperAdmin role policy stacks on the controller.
        var grantedRole = AdminRole.Create("pr8_servers_viewer", "مشاهد الخدمات");
        db.AdminPermissions.Add(AdminPermission.Create(grantedRole.Id, Resources.Servers,
            System.Text.Json.JsonSerializer.Serialize(new List<string> { Actions.View }), "own"));

        var superAdmin = Admin.Create("super@pr8.test", "not-used", "مدير عام", superRole.Id);
        var customAdmin = Admin.Create("custom@pr8.test", "not-used", "مدير مخصص", customRole.Id);
        var grantedAdmin = Admin.Create("granted@pr8.test", "not-used", "مشاهد الخدمات", grantedRole.Id);
        db.AddRange(superRole, customRole, grantedRole, superAdmin, customAdmin, grantedAdmin);
        await db.SaveChangesAsync();

        SuperAdminId = superAdmin.Id;
        CustomAdminId = customAdmin.Id;
        GrantedAdminId = grantedAdmin.Id;
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
    }
}

/// <summary>Real monitoring layer (no MONITORING_* env → honest missing_credentials).</summary>
public sealed class ServersDashboardHttpFactory : ServersDashboardHttpFactoryBase
{
    protected override void ConfigureMonitoring(IServiceCollection services)
    {
        // No override: the REAL monitors + orchestrator run exactly as registered by the app.
    }
}

/// <summary>Mocked orchestrator factory for the exact wire-shape assertions.</summary>
public sealed class ServersDashboardMockedHttpFactory : ServersDashboardHttpFactoryBase
{
    internal Mock<IServersMonitorService> Monitor { get; } = new();

    protected override void ConfigureMonitoring(IServiceCollection services)
    {
        services.RemoveAll<IServersMonitorService>();
        services.AddSingleton<IServersMonitorService>(Monitor.Object);
        SetupFixedEnvelopes();
    }

    private void SetupFixedEnvelopes()
    {
        var checkedAt = new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc);
        var fresh = new ProviderFreshness(false, 0);

        var renderData = new RenderProviderData(
            new RenderServiceInfo("srv-mock", "cms-api-preview", false, true, "free", "oregon"),
            new RenderDeployInfo("dep-mock", "live", "c9547ac", "feat: mock",
                checkedAt, checkedAt.AddMinutes(5)),
            false, "metrics not exposed on this plan");
        var render = new ProviderEnvelope<RenderProviderData>("render", ProviderStatus.Operational, checkedAt, 110, null, fresh, renderData);

        var vercelData = new VercelProviderData(new[]
        {
            new VercelProjectInfo("prj-admin", "cms-admin-web",
                new VercelDeploymentInfo("dpl-admin", "READY", "production", "abc123", "main", checkedAt, checkedAt),
                "cms-admin-web.vercel.app"),
            new VercelProjectInfo("prj-student", "cms-student-web",
                new VercelDeploymentInfo("dpl-student", "READY", "preview", "stu123", "feat/x", checkedAt, checkedAt),
                "cms-student-web.vercel.app")
        });
        var vercel = new ProviderEnvelope<VercelProviderData>("vercel", ProviderStatus.Operational, checkedAt, 120, null, fresh, vercelData);

        var neonData = new NeonProviderData(
            new NeonProjectInfo("neon-mock", "cms-db", "aws-eu-central-1"),
            new NeonBranchInfo("br-mock", "main", true, false, null),
            null, "consumption metrics not exposed by the scoped key/plan");
        var neon = new ProviderEnvelope<NeonProviderData>("neon", ProviderStatus.Operational, checkedAt, 130, null, fresh, neonData);

        var githubData = new GithubProviderData(
            new GithubRepositoryInfo("cms-platform-manus", "laith20218/cms-platform-manus", "private", "main", checkedAt, 2),
            new[] { new GithubWorkflowRunInfo(123456, "CI", "shamock", "completed", "success", checkedAt, checkedAt) });
        var github = new ProviderEnvelope<GithubProviderData>("github", ProviderStatus.Operational, checkedAt, 140, null, fresh, githubData);

        Monitor.Setup(m => m.GetRenderAsync(It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(render);
        Monitor.Setup(m => m.GetVercelAsync(It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(vercel);
        Monitor.Setup(m => m.GetNeonAsync(It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(neon);
        Monitor.Setup(m => m.GetGithubAsync(It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(github);

        var summary = new ServersSummary(ServersOverallStatus.Degraded, checkedAt, new[]
        {
            new ServersProviderHead("render", ProviderStatus.Operational, checkedAt, 110, null, fresh, "render note"),
            new ServersProviderHead("vercel", ProviderStatus.RateLimited, checkedAt, -1, "provider rate limit (429); retry-after 25s", new ProviderFreshness(false, 0), "provider rate limit"),
            new ServersProviderHead("neon", ProviderStatus.Down, checkedAt, -1, "upstream timeout", new ProviderFreshness(false, 0), "upstream down"),
            new ServersProviderHead("github", ProviderStatus.MissingCredentials, checkedAt, -1, "بيانات الاعتماد غير مُهيّأة", new ProviderFreshness(false, 0), "credentials not configured")
        });
        Monitor.Setup(m => m.GetSummaryAsync(It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(summary);

        var history = new ProviderHistoryDto("github", 50, MonitoringNotes.HistoryWindowNote, new[]
        {
            new ProviderHistoryItem(checkedAt, ProviderStatus.Operational, 55, null)
        });
        Monitor.Setup(m => m.GetProviderHistory(It.IsAny<string>())).Returns(history);
    }
}

/// <summary>In-memory ICacheService stand-in (real monitors + permission cache share it).</summary>
internal sealed class ServersDashboardInMemoryCache : ICacheService
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, object?> _entries = new();

    public Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
        => Task.FromResult(_entries.TryGetValue(key, out var value) && value is T typed ? typed : default);

    public Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default)
    {
        _entries.TryRemove(key, out var value);
        return Task.FromResult(value is T typed ? typed : default);
    }

    public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default)
    {
        _entries[key] = value;
        return Task.CompletedTask;
    }

    public Task<long> IncrementAsync(string key, TimeSpan? expiry = null, CancellationToken ct = default)
        => Task.FromResult(0L);

    public Task RemoveAsync(string key, CancellationToken ct = default)
    {
        _entries.TryRemove(key, out _);
        return Task.CompletedTask;
    }

    public Task RemoveByPatternAsync(string pattern, CancellationToken ct = default) => Task.CompletedTask;
}

// ===== Header-driven test auth (super admin / custom-role admin / student) =====

internal sealed class ServersDashboardTestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal new const string Scheme = "ServersDashboardTestAuth";

    public ServersDashboardTestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ISystemClock clock)
        : base(options, logger, encoder, clock) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var adminHeader = Request.Headers["X-Test-Admin-Id"].FirstOrDefault();
        var studentHeader = Request.Headers["X-Test-Student-Id"].FirstOrDefault();

        var adminId = Guid.TryParse(adminHeader, out var parsedAdmin) ? parsedAdmin : Guid.Empty;
        var studentId = Guid.TryParse(studentHeader, out var parsedStudent) ? parsedStudent : Guid.Empty;
        if (adminId == Guid.Empty && studentId == Guid.Empty)
            return Task.FromResult(AuthenticateResult.NoResult());

        var identity = new ClaimsIdentity(Scheme);
        var userId = adminId != Guid.Empty ? adminId : studentId;
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, userId.ToString()));
        identity.AddClaim(new Claim("sub", userId.ToString()));
        if (adminId != Guid.Empty)
        {
            identity.AddClaim(new Claim(ClaimTypes.Role, "admin"));
            var role = Request.Headers["X-Test-Role"].FirstOrDefault() ?? "super_admin";
            if (role == "super_admin")
                identity.AddClaim(new Claim(ClaimTypes.Role, "super_admin"));
        }
        else
        {
            identity.AddClaim(new Claim(ClaimTypes.Role, "student"));
        }
        identity.AddClaim(new Claim("sid", Guid.Parse("22222222-2222-2222-2222-222222222222").ToString()));
        identity.AddClaim(new Claim("installation_id", "servers-dashboard-test-installation"));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}

