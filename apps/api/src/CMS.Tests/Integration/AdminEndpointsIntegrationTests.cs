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
using CMS.Infrastructure.Persistence;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Common;
using Moq;
using System.Security.Claims;

namespace CMS.Tests.Integration;

/// <summary>
/// Integration tests for the new admin endpoints (P1-08 through Wave 3).
/// Uses a dedicated WebApplicationFactory with super_admin test auth + seeded data.
/// Tests: SystemSettings, AdminStudents, AdminReports, AdminAnalytics, SecurityController, Notifications.
/// </summary>
[Collection("SignedEntitlementHttp")]
public sealed class AdminEndpointsIntegrationTests : IClassFixture<AdminEndpointFactory>
{
    private readonly AdminEndpointFactory _factory;

    public AdminEndpointsIntegrationTests(AdminEndpointFactory factory) => _factory = factory;

    // ===== SystemSettings (P1-08) =====

    [Fact]
    public async Task Settings_GetAll_Unauthenticated_Returns401()
    {
        var response = await _factory.Client.GetAsync("/api/v1/admin/settings");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Settings_GetAll_AsSuperAdmin_Returns200WithSettings()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/settings");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var settings = await response.Content.ReadFromJsonAsync<List<SettingResponse>>();
        settings.Should().NotBeNull();
        settings!.Count.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Settings_GetByKey_AsSuperAdmin_Returns200()
    {
        // First get all settings to find a valid key
        var listRequest = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/settings");
        var listResponse = await _factory.Client.SendAsync(listRequest);
        var settings = await listResponse.Content.ReadFromJsonAsync<List<SettingResponse>>();
        var firstKey = settings![0].key;

        var request = _factory.SuperAdminRequest(HttpMethod.Get, $"/api/v1/admin/settings/{firstKey}");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Settings_Update_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Put, "/api/v1/admin/settings/platform_name");
        request.Content = JsonContent.Create(new { Value = "Updated Test Platform", Description = "Test" });
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Settings_GetNonExistent_Returns404()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/settings/non_existent_key_12345");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ===== AdminStudents (P1-01) =====

    [Fact]
    public async Task Students_UpdateProfile_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Put, $"/api/v1/admin/students/{_factory.TestStudentId}");
        request.Content = JsonContent.Create(new { FullName = "Updated Student Name" });
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Students_UpdateProfile_NonExistent_Returns404()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Put, "/api/v1/admin/students/00000000-0000-0000-0000-000000000001");
        request.Content = JsonContent.Create(new { FullName = "Ghost Student" });
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ===== AdminReports (P1-09) =====

    [Fact]
    public async Task Reports_List_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/reports?page=1&pageSize=5");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Reports_List_WithStatusFilter_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/reports?status=Pending&page=1&pageSize=5");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ===== AdminAnalytics (Wave 3) =====

    [Fact]
    public async Task Analytics_Students_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/analytics/students");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Analytics_Academic_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/analytics/academic");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Analytics_Exams_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/analytics/exams");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Analytics_Questions_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/analytics/questions");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Analytics_Content_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/analytics/content");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Analytics_Codes_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/analytics/codes");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Analytics_Operations_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/analytics/operations");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ===== Response-shape tests for the 2 endpoints fixed in Wave 5D =====
    //
    // ⚠️ WARNING — CRITICAL TESTING GAP:
    // These tests run against UseInMemoryDatabase, which does NOT translate LINQ
    // to SQL. It executes the query expression tree directly on in-memory objects,
    // so DateTime.ToString("yyyy-MM-dd") works here but FAILS on Npgsql (PostgreSQL)
    // in production. These tests verify the response SHAPE only (that the
    // dailyBreakdown / dailyActivation arrays exist and are well-formed) — they
    // do NOT and CANNOT catch EF Core translation errors.
    //
    // Translation errors are only caught by: (1) manual smoke test on staging/prod
    // after deploy, or (2) Testcontainers + real PostgreSQL (planned Wave 6).
    // See EXECUTION_STATUS.md → "Critical Testing Gap" for full context.

    [Fact]
    public async Task Analytics_Students_ResponseShape_HasDailyBreakdownArray()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/analytics/students");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

        var json = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        json.GetProperty("totalStudents").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("newRegistrations").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("activeStudents").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("inactiveStudents").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("dailyBreakdown").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Array);

        // Each element of dailyBreakdown must have a string `date` + numeric `registrations`.
        foreach (var item in json.GetProperty("dailyBreakdown").EnumerateArray())
        {
            item.GetProperty("date").ValueKind.Should().Be(System.Text.Json.JsonValueKind.String);
            item.GetProperty("registrations").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
            // date must match the yyyy-MM-dd format (10 chars, starts with a 4-digit year).
            var dateStr = item.GetProperty("date").GetString();
            dateStr.Should().MatchRegex(@"^\d{4}-\d{2}-\d{2}$", "dailyBreakdown dates must be yyyy-MM-dd formatted");
        }
    }

    [Fact]
    public async Task Analytics_Codes_ResponseShape_HasDailyActivationArray()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/analytics/codes");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

        var json = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        json.GetProperty("totalIssued").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("activated").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("expired").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("revoked").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("activationRate").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("activeSubscriptions").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("estimatedValue").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
        json.GetProperty("dailyActivation").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Array);

        // Each element of dailyActivation must have a string `date` + numeric `activated`.
        foreach (var item in json.GetProperty("dailyActivation").EnumerateArray())
        {
            item.GetProperty("date").ValueKind.Should().Be(System.Text.Json.JsonValueKind.String);
            item.GetProperty("activated").ValueKind.Should().Be(System.Text.Json.JsonValueKind.Number);
            var dateStr = item.GetProperty("date").GetString();
            dateStr.Should().MatchRegex(@"^\d{4}-\d{2}-\d{2}$", "dailyActivation dates must be yyyy-MM-dd formatted");
        }
    }

    // ===== SecurityController audit-logs (P1-06) =====

    [Fact]
    public async Task AuditLogs_GetAll_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/security/audit-logs?page=1&pageSize=5");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AuditLogs_GetAll_Unauthenticated_Returns401()
    {
        var response = await _factory.Client.GetAsync("/api/v1/security/audit-logs");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ===== Notifications (P1-10) =====

    [Fact]
    public async Task Notifications_GetSent_AsSuperAdmin_Returns200()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/notifications/sent?page=1&pageSize=5");
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }

    private sealed record SettingResponse(string id, string key, string value, string? description, string? category);

    // ===== Push 2 / Fix-3: forwarded headers must re-key the admin-login rate limiter =====

    /// <summary>
    /// With UseForwardedHeaders (Fix-3) installed, X-Forwarded-For must become the rate-limit
    /// key: six rapid login attempts carrying the SAME forwarded IP hit the per-IP window
    /// (5/minute) and the 6th returns 429, while requests with DIFFERENT forwarded IPs each
    /// get their own partition (no 429). The burst is aligned to the start of a fresh
    /// clock-anchored window so a boundary crossing can never split the counter.
    /// </summary>
    [Fact]
    public async Task AdminLogin_RateLimits_OnForwardedClientIp_NotProxyAddress()
    {
        // Align to a fresh fixed window (limiter windows anchor to whole minutes).
        var now = DateTime.UtcNow;
        var untilBoundary = TimeSpan.FromMilliseconds(60000 - now.Millisecond + 350);
        await Task.Delay(untilBoundary);

        // Fresh TEST-NET-2 IP — unique per run so other tests can never poison this partition.
        var forwardedIp = $"198.51.100.{Random.Shared.Next(1, 254)}";
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 6; i++)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/admin/login")
            {
                Content = JsonContent.Create(new { email = $"xff-p2-{i}@example.invalid", password = "WrongPass123!" })
            };
            request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedIp);
            request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");
            var response = await _factory.Client.SendAsync(request);
            statuses.Add(response.StatusCode);
        }

        statuses.Should().Contain(HttpStatusCode.TooManyRequests,
            "six attempts from one forwarded client IP must breach the 5/minute window: {0}",
            string.Join(", ", statuses));
        statuses.Count(s => s == HttpStatusCode.BadRequest).Should().Be(5);
    }

    [Fact]
    public async Task AdminLogin_DistinctForwardedIps_EachGetTheirOwnPartition()
    {
        var now = DateTime.UtcNow;
        var untilBoundary = TimeSpan.FromMilliseconds(60000 - now.Millisecond + 350);
        await Task.Delay(untilBoundary);

        for (var i = 0; i < 4; i++)
        {
            var forwardedIp = $"198.51.100.{Random.Shared.Next(1, 254)}";
            var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/admin/login")
            {
                Content = JsonContent.Create(new { email = $"xff-uniq-{i}@example.invalid", password = "WrongPass123!" })
            };
            request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedIp);
            request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");
            var response = await _factory.Client.SendAsync(request);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "each distinct forwarded IP is its own rate-limit partition (wrong credentials → 400, never 429)");
        }
    }
}

// ===== Test Factory =====

public sealed class AdminEndpointFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string JwtSigningKey = "admin-endpoint-test-jwt-signing-key-32-bytes!!";
    private readonly string _databaseName = $"admin-endpoint-test-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection()
        .AddEntityFrameworkInMemoryDatabase()
        .BuildServiceProvider();

    internal HttpClient Client { get; private set; } = null!;
    internal Guid TestStudentId { get; private set; }
    internal Guid SuperAdminId { get; private set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Set environment variables (required for services that read them at startup)
        Environment.SetEnvironmentVariable("Jwt__Secret", JwtSigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "admin-endpoint-test");
        Environment.SetEnvironmentVariable("Jwt__Audience", "admin-endpoint-test");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Port=5432;Database=cms_admin_test;Username=postgres;Password=not-used");
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "admin-endpoint-entitlement-key-32-bytes!!");

        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:Secret", JwtSigningKey);
        builder.UseSetting("Jwt:Issuer", "admin-endpoint-test");
        builder.UseSetting("Jwt:Audience", "admin-endpoint-test");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = "admin-endpoint-test",
            ["Jwt:Audience"] = "admin-endpoint-test",
            ["Jwt:AccessTokenExpiryMinutes"] = "15",
            ["Security:Entitlements:SigningKey"] = "admin-endpoint-entitlement-key-32-bytes!!",
            ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Port=5432;Database=cms_admin_test;Username=postgres;Password=not-used",
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

            // Use test auth handler that supports super_admin role
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = AdminTestAuthHandler.Scheme;
                options.DefaultChallengeScheme = AdminTestAuthHandler.Scheme;
                options.DefaultForbidScheme = AdminTestAuthHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, AdminTestAuthHandler>(AdminTestAuthHandler.Scheme, _ => { });

            // PostConfigure JWT bearer to not throw during test (it coexists with test handler)
            services.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>(
                Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme,
                options =>
                {
                    options.Events ??= new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents();
                    options.Events.OnAuthenticationFailed = _ => Task.CompletedTask;
                    options.Events.OnMessageReceived = _ => Task.CompletedTask;
                });

            // Mock ISessionService (required for session validation middleware)
            services.RemoveAll<ISessionService>();
            var sessionMock = new Mock<ISessionService>();
            sessionMock.Setup(s => s.IsActiveAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(true);
            services.AddScoped<ISessionService>(_ => sessionMock.Object);

            // Mock cache
            services.RemoveAll<ICacheService>();
            var cache = new Mock<ICacheService>();
            cache.Setup(c => c.GetAsync<bool?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((bool?)null);
            cache.Setup(c => c.GetAsync<AdminScope?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((AdminScope?)null);
            cache.Setup(c => c.SetAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(c => c.SetAsync(It.IsAny<string>(), It.IsAny<AdminScope>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            services.AddScoped<ICacheService>(_ => cache.Object);

            // Mock IFileStorageService (required by AdminStudentsController for avatar upload)
            services.RemoveAll<IFileStorageService>();
            var storageMock = new Mock<IFileStorageService>();
            storageMock.Setup(s => s.UploadAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync("test-key");
            storageMock.Setup(s => s.GetSignedUrlAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync("https://test-signed-url.example.com/file");
            storageMock.Setup(s => s.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.AddSingleton<IFileStorageService>(_ => storageMock.Object);

            // Mock ISecurityAuditWriter (required by controllers that log audit events)
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

        // Seed academic hierarchy
        var university = University.Create("جامعة الاختبار", "test-uni", "Test University");
        var college = College.Create(university.Id, "كلية الاختبار", "test-college", "Test College");
        var year = AcademicYear.Create(college.Id, "السنة الأولى", "year-one", 1);
        var semester = Semester.Create(year.Id, "الفصل الأول", "semester-one", 1);
        var subject = Subject.Create(semester.Id, "مادة الاختبار", "test-subject", "Test Subject");

        // Seed student
        var student = Student.Create("0990001234", "not-used", "طالب اختبار");
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();

        // Seed super_admin role + admin
        var superRole = AdminRole.Create("super_admin", "مدير عام");
        var admin = Admin.Create("admin@test.com", "not-used", "مدير اختبار عام", superRole.Id);

        // Seed system settings
        var settings = new List<SystemSetting>
        {
            new() { Key = "platform_name", Value = "CMS Test", Description = "Platform name", Category = "platform" },
            new() { Key = "max_upload_size_mb", Value = "10", Description = "Max upload", Category = "upload" },
        };
        // Use reflection to set Id since BaseEntity.Id has protected setter
        foreach (var s in settings)
        {
            typeof(BaseEntity).GetProperty("Id")?.SetValue(s, Guid.NewGuid());
        }

        db.AddRange(university, college, year, semester, subject, student, superRole, admin);
        db.SystemSettings.AddRange(settings);
        await db.SaveChangesAsync();

        TestStudentId = student.Id;
        SuperAdminId = admin.Id;
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
    }

    internal HttpRequestMessage SuperAdminRequest(HttpMethod method, string uri)
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", SuperAdminId.ToString());
        return request;
    }
}

// ===== Admin test auth handler (supports super_admin role) =====
internal sealed class AdminTestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal new const string Scheme = "AdminTestAuth";

    public AdminTestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ISystemClock clock)
        : base(options, logger, encoder, clock) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var adminHeader = Request.Headers["X-Test-Admin-Id"].FirstOrDefault();
        var isAdmin = Guid.TryParse(adminHeader, out var adminId);

        if (!isAdmin && !Guid.TryParse(Request.Headers["X-Test-Student-Id"].FirstOrDefault(), out _))
            return Task.FromResult(AuthenticateResult.NoResult());

        var userId = isAdmin ? adminId : Guid.Parse(Request.Headers["X-Test-Student-Id"].First());
        var identity = new ClaimsIdentity(Scheme);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, userId.ToString()));
        identity.AddClaim(new Claim("sub", userId.ToString()));
        if (isAdmin)
        {
            identity.AddClaim(new Claim(ClaimTypes.Role, "admin"));
            identity.AddClaim(new Claim(ClaimTypes.Role, "super_admin"));
        }
        else
        {
            identity.AddClaim(new Claim(ClaimTypes.Role, "student"));
        }
        identity.AddClaim(new Claim("sid", Guid.Parse("11111111-1111-1111-1111-111111111111").ToString()));
        identity.AddClaim(new Claim("installation_id", "admin-test-installation"));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}
