using System.Net;
using System.Net.Http.Json;
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
using System.Text.Encodings.Web;
using System.Security.Claims;
using CMS.Application.Handlers.Admin;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using Moq;

namespace CMS.Tests.Integration;

/// <summary>
/// Push 3 / Track 3: HTTP-level contract for the advanced UI-permission endpoints —
/// including the project's FIRST HTTP 403 suite (non-super administrator on
/// policy-protected endpoints). UI keys are cosmetic only: a custom-role admin gets
/// 403 from classic RBAC regardless of any UI keys (the two-layers doctrine).
/// </summary>
[Collection("UiPermissionsHttp")]
public sealed class UiPermissionsHttpIntegrationTests : IClassFixture<UiPermissionsHttpFactory>
{
    private readonly UiPermissionsHttpFactory _factory;

    public UiPermissionsHttpIntegrationTests(UiPermissionsHttpFactory factory) => _factory = factory;

    // ===== 401: unauthenticated =====

    [Fact]
    public async Task RoleUiPermissions_AllVerbs_Unauthenticated_Return401()
    {
        var roleId = _factory.LifecycleRoleId;
        (await _factory.Client.GetAsync($"/api/v1/admin/roles/{roleId}/ui-permissions")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var put = await _factory.Client.PutAsJsonAsync($"/api/v1/admin/roles/{roleId}/ui-permissions", new { allowedKeys = new[] { "view:codes" } });
        put.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        (await _factory.Client.DeleteAsync($"/api/v1/admin/roles/{roleId}/ui-permissions")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task MyUiPermissions_Unauthenticated_Returns401()
    {
        (await _factory.Client.GetAsync("/api/v1/auth/admin/me/ui-permissions")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ===== THE FIRST HTTP 403 SUITE: non-super administrator =====

    [Fact]
    public async Task RoleUiPermissions_NonSuperAdmin_AllVerbs_Return403()
    {
        // The viewer has NO classic permission grants, so every policy-protected
        // endpoint must deny — and if a policy ever let one through, the handler-level
        // RequireSuperAdmin would still 403. Both layers fail closed here.
        var roleId = _factory.LifecycleRoleId;
        var viewerId = _factory.ViewerAdminId;

        (await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Get, viewerId, super: false, $"/api/v1/admin/roles/{roleId}/ui-permissions")))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var put = _factory.AdminRequest(HttpMethod.Put, viewerId, super: false, $"/api/v1/admin/roles/{roleId}/ui-permissions");
        put.Content = JsonContent.Create(new { allowedKeys = new[] { "view:codes" } });
        (await _factory.Client.SendAsync(put)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Delete, viewerId, super: false, $"/api/v1/admin/roles/{roleId}/ui-permissions")))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task GetRoles_NonSuperAdmin_Returns403()
    {
        (await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Get, _factory.ViewerAdminId, super: false, "/api/v1/admin/roles")))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task GetCodes_NonSuperAdmin_Returns403_DefenseInDepth()
    {
        // 2.1 doctrine: UI keys never bypass backend RBAC. The viewer's role is
        // unconfigured (would render every UI element), yet classic RBAC still
        // denies /admin/codes with 403 — a curl caller is stopped by THIS layer.
        (await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Get, _factory.ViewerAdminId, super: false, "/api/v1/admin/codes")))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ===== 200 envelope shapes =====

    [Fact]
    public async Task MyUiPermissions_SuperAdmin_ReturnsFullEnvelope()
    {
        var response = await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Get, _factory.SuperAdminId, super: true, "/api/v1/auth/admin/me/ui-permissions"));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = (await response.Content.ReadFromJsonAsync<MyUiPermissionsDto>())!;
        envelope.Mode.Should().Be("super_admin");
        envelope.IsSuperAdmin.Should().BeTrue();
        envelope.RegistryVersion.Should().Be("2026-10-24.1");
        envelope.AllKeys.Should().HaveCount(62);
        envelope.AllowedKeys.Should().Equal(envelope.AllKeys);
    }

    [Fact]
    public async Task MyUiPermissions_UnconfiguredCustomRole_AllowedEqualsAll()
    {
        var response = await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Get, _factory.ViewerAdminId, super: false, "/api/v1/auth/admin/me/ui-permissions"));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var envelope = (await response.Content.ReadFromJsonAsync<MyUiPermissionsDto>())!;
        envelope.Mode.Should().Be("unconfigured");
        envelope.IsSuperAdmin.Should().BeFalse();
        envelope.AllKeys.Should().HaveCount(62);
        envelope.AllowedKeys.Should().Equal(envelope.AllKeys);
    }

    [Fact]
    public async Task GetRoleUiPermissions_Unconfigured_ReturnsNotConfigured()
    {
        var response = await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Get, _factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{_factory.LifecycleRoleId}/ui-permissions"));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var state = (await response.Content.ReadFromJsonAsync<RoleUiPermissionsDto>())!;
        state.Configured.Should().BeFalse();
        state.AllowedKeys.Should().BeNull();
        state.RegistryVersion.Should().Be("2026-10-24.1");
        state.AllKeys.Should().HaveCount(62);
    }

    // ===== Lifecycle: PUT → GET role → GET me → DELETE =====

    [Fact]
    public async Task RoleUiPermissions_Lifecycle_PutGetMeDelete()
    {
        var roleId = _factory.LifecycleRoleId;

        // PUT (scrambled + duplicated) → 204, stored registry-ordered.
        var put = _factory.AdminRequest(HttpMethod.Put, _factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{roleId}/ui-permissions");
        put.Content = JsonContent.Create(new { allowedKeys = new[] { "btn:codes.export", "view:codes", "view:codes" } });
        (await _factory.Client.SendAsync(put)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        // GET role → configured with registry order.
        var state = await GetRoleStateAsync(roleId);
        state.Configured.Should().BeTrue();
        state.AllowedKeys.Should().Equal(["view:codes", "btn:codes.export"]);

        // GET me (the admin assigned to the lifecycle role) → exact custom envelope.
        var me = await GetMyEnvelopeAsync(_factory.LifecycleAdminId, super: false);
        me.Mode.Should().Be("custom");
        me.IsSuperAdmin.Should().BeFalse();
        me.AllKeys.Should().HaveCount(62);
        me.AllowedKeys.Should().Equal(["view:codes", "btn:codes.export"]);

        // DELETE → 204, back to unconfigured = full access.
        (await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Delete, _factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{roleId}/ui-permissions")))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        var after = await GetRoleStateAsync(roleId);
        after.Configured.Should().BeFalse();
        after.AllowedKeys.Should().BeNull();

        var meAfter = await GetMyEnvelopeAsync(_factory.LifecycleAdminId, super: false);
        meAfter.Mode.Should().Be("unconfigured");
        meAfter.AllowedKeys.Should().Equal(meAfter.AllKeys);
    }

    // ===== Validation edges =====

    [Fact]
    public async Task PutRoleUiPermissions_SystemRole_Returns400SystemRoleReadonly()
    {
        var put = _factory.AdminRequest(HttpMethod.Put, _factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{_factory.SuperRoleId}/ui-permissions");
        put.Content = JsonContent.Create(new { allowedKeys = new[] { "view:codes" } });
        var response = await _factory.Client.SendAsync(put);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ParseErrorCodeAsync(response)).Should().Be("SYSTEM_ROLE_READONLY");
    }

    [Fact]
    public async Task DeleteRoleUiPermissions_SystemRole_Returns400SystemRoleReadonly()
    {
        var response = await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Delete, _factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{_factory.SuperRoleId}/ui-permissions"));
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await ParseErrorCodeAsync(response)).Should().Be("SYSTEM_ROLE_READONLY");
    }

    [Fact]
    public async Task PutRoleUiPermissions_InvalidKeys_Returns400WithOffenders()
    {
        var put = _factory.AdminRequest(HttpMethod.Put, _factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{_factory.LifecycleRoleId}/ui-permissions");
        put.Content = JsonContent.Create(new { allowedKeys = new[] { "view:codes", "nope:fake" } });
        var response = await _factory.Client.SendAsync(put);
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var errorCode = await ParseErrorCodeAsync(response);
        errorCode.Should().Be("UI_PERMISSION_INVALID_KEYS");

        // Nothing persisted for a rejected PUT.
        (await GetRoleStateAsync(_factory.LifecycleRoleId)).Configured.Should().BeFalse();
    }

    [Fact]
    public async Task RoleUiPermissions_UnknownRole_Returns404()
    {
        var unknown = Guid.NewGuid();
        (await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Get, _factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{unknown}/ui-permissions")))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Delete, _factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{unknown}/ui-permissions")))
            .StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ===== Helpers =====

    private async Task<RoleUiPermissionsDto> GetRoleStateAsync(Guid roleId)
    {
        var response = await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Get, _factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{roleId}/ui-permissions"));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<RoleUiPermissionsDto>())!;
    }

    private async Task<MyUiPermissionsDto> GetMyEnvelopeAsync(Guid adminId, bool super)
    {
        var response = await _factory.Client.SendAsync(_factory.AdminRequest(HttpMethod.Get, adminId, super, "/api/v1/auth/admin/me/ui-permissions"));
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<MyUiPermissionsDto>())!;
    }

    private static async Task<string> ParseErrorCodeAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<ProblemDetailsProbe>();
        return payload?.ErrorCode ?? "(none)";
    }

    private sealed record ProblemDetailsProbe(string? Title, string? Detail, string? ErrorCode);
}

[CollectionDefinition("UiPermissionsHttp", DisableParallelization = true)]
public sealed class UiPermissionsHttpCollection
{
}

// ===== Test Factory =====

public sealed class UiPermissionsHttpFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string JwtSigningKey = "ui-permissions-test-jwt-signing-key-32-bytes!!";
    private readonly string _databaseName = $"ui-permissions-test-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection()
        .AddEntityFrameworkInMemoryDatabase()
        .BuildServiceProvider();

    internal HttpClient Client { get; private set; } = null!;
    internal Guid SuperAdminId { get; private set; }
    internal Guid ViewerAdminId { get; private set; }
    internal Guid LifecycleAdminId { get; private set; }
    internal Guid SuperRoleId { get; private set; }
    internal Guid LifecycleRoleId { get; private set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Environment.SetEnvironmentVariable("Jwt__Secret", JwtSigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "ui-permissions-test");
        Environment.SetEnvironmentVariable("Jwt__Audience", "ui-permissions-test");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Port=5432;Database=cms_ui_permissions_test;Username=postgres;Password=not-used");
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "ui-permissions-entitlement-key-32-bytes!!");

        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:Secret", JwtSigningKey);
        builder.UseSetting("Jwt:Issuer", "ui-permissions-test");
        builder.UseSetting("Jwt:Audience", "ui-permissions-test");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = "ui-permissions-test",
            ["Jwt:Audience"] = "ui-permissions-test",
            ["Jwt:AccessTokenExpiryMinutes"] = "15",
            ["Security:Entitlements:SigningKey"] = "ui-permissions-entitlement-key-32-bytes!!",
            ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Port=5432;Database=cms_ui_permissions_test;Username=postgres;Password=not-used",
            ["ConnectionStrings:Redis"] = "localhost:6379"
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

            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = UiPermissionsTestAuthHandler.Scheme;
                options.DefaultChallengeScheme = UiPermissionsTestAuthHandler.Scheme;
                options.DefaultForbidScheme = UiPermissionsTestAuthHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, UiPermissionsTestAuthHandler>(UiPermissionsTestAuthHandler.Scheme, _ => { });

            services.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>(
                Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme,
                options =>
                {
                    options.Events ??= new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents();
                    options.Events.OnAuthenticationFailed = _ => Task.CompletedTask;
                    options.Events.OnMessageReceived = _ => Task.CompletedTask;
                });

            services.RemoveAll<ISessionService>();
            var sessionMock = new Mock<ISessionService>();
            sessionMock.Setup(s => s.IsActiveAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(true);
            services.AddScoped<ISessionService>(_ => sessionMock.Object);

            // In-memory cache double: dictionary semantics, never fails (2.2 failure
            // paths have their own dedicated unit suite).
            services.RemoveAll<ICacheService>();
            services.AddSingleton<ICacheService, UiPermissionsHttpCache>();

            services.RemoveAll<IFileStorageService>();
            var storageMock = new Mock<IFileStorageService>();
            storageMock.Setup(s => s.UploadAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync("test-key");
            storageMock.Setup(s => s.GetSignedUrlAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync("https://test-signed-url.example.com/file");
            storageMock.Setup(s => s.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.AddSingleton<IFileStorageService>(_ => storageMock.Object);

            services.RemoveAll<ISecurityAuditWriter>();
            var auditMock = new Mock<ISecurityAuditWriter>();
            auditMock.Setup(a => a.LogSecurityEventAsync(
                It.IsAny<Guid?>(), It.IsAny<Guid?>(),
                It.IsAny<SecurityEventType>(), It.IsAny<SecuritySeverity>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.AddScoped<ISecurityAuditWriter>(_ => auditMock.Object);
        });
    }

    public async Task InitializeAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // System role + super admin.
        var superRole = AdminRole.Create("super_admin", "مدير عام", null, true);
        var superAdmin = Admin.Create("ui-super@cms.example.com", "not-used", "مدير عام اختبار", superRole.Id);

        // Stable viewer role (never mutated by tests) + its admin — no classic grants.
        var viewerRole = AdminRole.Create("ui_viewer", "قارئ واجهة", "دور عرض بدون صلاحيات كلاسيكية");
        var viewerAdmin = Admin.Create("ui-viewer@cms.example.com", "not-used", "مدير عرض", viewerRole.Id);

        // Lifecycle role (PUT/DELETE tests mutate it) + its admin.
        var lifecycleRole = AdminRole.Create("ui_lifecycle", "دور دورة الحياة", "دور اختبار PUT/DELETE");
        var lifecycleAdmin = Admin.Create("ui-lifecycle@cms.example.com", "not-used", "مدير دورة الحياة", lifecycleRole.Id);

        // Academic minimum for /admin/codes and scope resolution.
        var university = University.Create("جامعة صلاحيات الواجهة", "ui-perm-uni", "UI Perm University");
        var college = College.Create(university.Id, "كلية صلاحيات الواجهة", "ui-perm-college", "UI Perm College");
        var year = AcademicYear.Create(college.Id, "السنة الأولى", "ui-perm-year", 1);
        var semester = Semester.Create(year.Id, "الفصل الأول", "ui-perm-semester", 1);
        var subject = Subject.Create(semester.Id, "مادة صلاحيات الواجهة", "ui-perm-subject", "UI Perm Subject");

        db.AddRange(superRole, superAdmin, viewerRole, viewerAdmin, lifecycleRole, lifecycleAdmin,
            university, college, year, semester, subject);
        await db.SaveChangesAsync();

        SuperAdminId = superAdmin.Id;
        ViewerAdminId = viewerAdmin.Id;
        LifecycleAdminId = lifecycleAdmin.Id;
        SuperRoleId = superRole.Id;
        LifecycleRoleId = lifecycleRole.Id;
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
    }

    /// <summary>
    /// Builds an authenticated request. super: true adds the super_admin role claim;
    /// super: false authenticates as a plain custom-role administrator (the 403 suite).
    /// </summary>
    internal HttpRequestMessage AdminRequest(HttpMethod method, Guid adminId, bool super, string uri)
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", adminId.ToString());
        if (super)
            request.Headers.TryAddWithoutValidation("X-Test-Super", "1");
        return request;
    }
}

/// <summary>
/// Test auth handler for the UI-permissions suite: X-Test-Admin-Id becomes the sub claim
/// (so handler-level actor checks hit the seeded rows), X-Test-Super=1 adds super_admin.
/// </summary>
internal sealed class UiPermissionsTestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal new const string Scheme = "UiPermissionsTestAuth";

    public UiPermissionsTestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ISystemClock clock)
        : base(options, logger, encoder, clock) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var adminHeader = Request.Headers["X-Test-Admin-Id"].FirstOrDefault();
        if (!Guid.TryParse(adminHeader, out var adminId))
            return Task.FromResult(AuthenticateResult.NoResult());

        var identity = new ClaimsIdentity(Scheme);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, adminId.ToString()));
        identity.AddClaim(new Claim("sub", adminId.ToString()));
        identity.AddClaim(new Claim(ClaimTypes.Role, "admin"));
        if (string.Equals(Request.Headers["X-Test-Super"].FirstOrDefault(), "1", StringComparison.Ordinal))
            identity.AddClaim(new Claim(ClaimTypes.Role, "super_admin"));
        identity.AddClaim(new Claim("sid", Guid.Parse("22222222-2222-2222-2222-222222222222").ToString()));
        identity.AddClaim(new Claim("installation_id", "ui-permissions-test-installation"));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}

/// <summary>In-memory ICacheService double for the HTTP suite (dictionary semantics).</summary>
internal sealed class UiPermissionsHttpCache : ICacheService
{
    private readonly Dictionary<string, object?> _store = new();

    public Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
        => Task.FromResult(_store.TryGetValue(key, out var value) ? (T?)value : default);

    public Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default) => throw new NotSupportedException();

    public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default)
    {
        _store[key] = value;
        return Task.CompletedTask;
    }

    public Task<long> IncrementAsync(string key, TimeSpan? expiry = null, CancellationToken ct = default) => throw new NotSupportedException();

    public Task RemoveAsync(string key, CancellationToken ct = default)
    {
        _store.Remove(key);
        return Task.CompletedTask;
    }

    public Task RemoveByPatternAsync(string pattern, CancellationToken ct = default) => Task.CompletedTask;
}
