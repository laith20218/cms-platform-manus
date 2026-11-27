using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using CMS.Application.Interfaces;
using CMS.Domain.Common;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Security;
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
/// PR-6 (Student Center + Security Center) HTTP integration tests.
/// Covers the admin per-student drawer endpoints (detail / password reset /
/// archive / restore / unified activity) and the security summary endpoint.
/// Uses a dedicated WebApplicationFactory with InMemory EF, a header-driven test
/// auth handler (super admin + a permission-less admin), and seeded audit rows.
/// The password-reset route carries the danger-zone rate limit (5/min per
/// partition) — the suite stays well under it.
/// </summary>
[Collection("SignedEntitlementHttp")]
public sealed class StudentSecurityCenterHttpTests : IClassFixture<StudentSecurityCenterHttpFactory>
{
    private readonly StudentSecurityCenterHttpFactory _factory;

    public StudentSecurityCenterHttpTests(StudentSecurityCenterHttpFactory factory) => _factory = factory;

    // ===== POST /api/v1/admin/students/{id}/password-reset =====

    [Fact]
    public async Task PasswordReset_Anonymous_Returns401()
    {
        var response = await _factory.Client.PostAsJsonAsync(
            $"/api/v1/admin/students/{_factory.TestStudentId}/password-reset",
            new { ActorPassword = "Irrelevant0!", NewPassword = "Irrelevant0!" });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PasswordReset_AdminWithoutStudentsEdit_Returns403()
    {
        var response = await _factory.PostJsonAsLimited(
            $"/api/v1/admin/students/{_factory.TestStudentId}/password-reset",
            new { ActorPassword = "Irrelevant0!", NewPassword = "Irrelevant0!" });

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task PasswordReset_UnknownStudent_Returns404()
    {
        var response = await _factory.PostJsonAsSuper(
            "/api/v1/admin/students/00000000-0000-0000-0000-00000000000f/password-reset",
            new { ActorPassword = StudentSecurityCenterHttpFactory.SuperAdminPassword, NewPassword = "NewStudentPass123!" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task PasswordReset_WrongActorPassword_Returns400InvalidCurrentPassword()
    {
        var response = await _factory.PostJsonAsSuper(
            $"/api/v1/admin/students/{_factory.TestStudentId}/password-reset",
            new { ActorPassword = "NotTheActorPassword1!", NewPassword = "NewStudentPass123!" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("errorCode").GetString().Should().Be("INVALID_CURRENT_PASSWORD");
    }

    [Fact]
    public async Task PasswordReset_HappyPath_Returns204_SwapsHash_RevokesSessions_Audits_AndFlagsStudent()
    {
        var before = await _factory.GetStudent(_factory.TestStudentId);
        before!.MustChangePassword.Should().BeFalse();

        var response = await _factory.PostJsonAsSuper(
            $"/api/v1/admin/students/{_factory.TestStudentId}/password-reset",
            new { ActorPassword = StudentSecurityCenterHttpFactory.SuperAdminPassword, NewPassword = "NewStudentPass123!", ForceChangeOnNextLogin = true });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // The new secret actually verifies, the flag is persisted, the plaintext never leaks.
        var after = await _factory.GetStudent(_factory.TestStudentId);
        new PasswordHasher().VerifyPassword("NewStudentPass123!", after!.PasswordHash).Should().BeTrue();
        after.MustChangePassword.Should().BeTrue();

        _factory.Sessions.Verify(s => s.RevokeAllForUserAsync(_factory.TestStudentId, "admin_password_reset", It.IsAny<CancellationToken>()), Times.Once);
        _factory.Audit.Verify(a => a.LogSecurityEventAsync(
            _factory.TestStudentId,
            _factory.SuperAdminId,
            SecurityEventType.PasswordChanged,
            SecuritySeverity.Warning,
            It.Is<string>(description => description.Contains("credential_reset=student")
                && description.Contains($"target_student_id={_factory.TestStudentId}")
                && description.Contains("force_change=true")
                && !description.Contains("NewStudentPass123!")),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);

        // The drawer detail surfaces the forced-change state immediately.
        var detail = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}");
        detail.GetProperty("mustChangePassword").GetBoolean().Should().BeTrue();
        detail.GetProperty("archived").GetBoolean().Should().BeFalse();
    }

    // ===== GET /api/v1/admin/students/{id} (detail) =====

    [Fact]
    public async Task Detail_Anonymous_Returns401()
    {
        var response = await _factory.Client.GetAsync($"/api/v1/admin/students/{_factory.TestStudentId}");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Detail_AdminWithoutStudentsView_Returns403()
    {
        var response = await _factory.SendLimited(HttpMethod.Get, $"/api/v1/admin/students/{_factory.TestStudentId}");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Detail_UnknownStudent_Returns404()
    {
        var response = await _factory.SendSuper(HttpMethod.Get, "/api/v1/admin/students/00000000-0000-0000-0000-00000000000f");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Detail_HappyPath_ReturnsFullDrawerShape()
    {
        var json = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}");

        json.GetProperty("id").GetString().Should().Be(_factory.TestStudentId.ToString());
        json.GetProperty("fullName").GetString().Should().Be(StudentSecurityCenterHttpFactory.TestStudentName);
        json.GetProperty("phone").GetString().Should().NotBeNullOrEmpty();
        json.GetProperty("status").GetString().Should().Be("Active");
        json.GetProperty("banReason").ValueKind.Should().Be(JsonValueKind.Null);
        json.GetProperty("banUntil").ValueKind.Should().Be(JsonValueKind.Null);
        json.GetProperty("lockedOut").GetBoolean().Should().BeFalse();
        json.GetProperty("lockoutUntil").ValueKind.Should().Be(JsonValueKind.Null);
        json.GetProperty("failedLoginCount").GetInt32().Should().Be(0);
        json.GetProperty("phoneVerified").GetBoolean().Should().BeTrue();
        // The forced-change flag is order-sensitive across tests (the password-reset test
        // sets it) — the shape contract here is "always a boolean".
        json.GetProperty("mustChangePassword").ValueKind.Should().BeOneOf(JsonValueKind.True, JsonValueKind.False);
        json.GetProperty("archived").GetBoolean().Should().BeFalse();
        json.GetProperty("archivedAt").ValueKind.Should().Be(JsonValueKind.Null);
        json.GetProperty("createdAt").ValueKind.Should().Be(JsonValueKind.String);
        json.GetProperty("updatedAt").ValueKind.Should().Be(JsonValueKind.String);
        json.GetProperty("lastLogin").ValueKind.Should().Be(JsonValueKind.Null);
        json.GetProperty("loginCount").GetInt32().Should().Be(0);
        json.GetProperty("lastActivityDate").ValueKind.Should().Be(JsonValueKind.Null);
        json.GetProperty("questionsAnswered").GetInt32().Should().Be(0);
        json.GetProperty("correctAnswers").GetInt32().Should().Be(0);
        json.GetProperty("accuracy").GetDouble().Should().Be(0);
        json.GetProperty("currentStreak").GetInt32().Should().Be(0);
        json.GetProperty("longestStreak").GetInt32().Should().Be(0);

        var academic = json.GetProperty("academic");
        academic.GetProperty("universityId").GetString().Should().Be(_factory.TestUniversityId.ToString());
        academic.GetProperty("universityName").GetString().Should().Be(StudentSecurityCenterHttpFactory.TestUniversityName);
        academic.GetProperty("collegeId").GetString().Should().Be(_factory.TestCollegeId.ToString());
        academic.GetProperty("collegeName").GetString().Should().NotBeNullOrEmpty();
        academic.GetProperty("academicYearId").GetString().Should().Be(_factory.TestYearId.ToString());
        academic.GetProperty("academicYearName").GetString().Should().NotBeNullOrEmpty();

        var subscriptionSummary = json.GetProperty("subscriptionSummary");
        subscriptionSummary.GetProperty("activeCount").GetInt32().Should().Be(1);
        var latest = subscriptionSummary.GetProperty("latest");
        latest.GetProperty("id").GetString().Should().Be(_factory.TestSubscriptionId.ToString());
        latest.GetProperty("status").GetString().Should().Be("Active");
        latest.GetProperty("scopeType").GetString().Should().Be("Subject");
        latest.GetProperty("startsAt").ValueKind.Should().Be(JsonValueKind.String);
        latest.GetProperty("expiresAt").ValueKind.Should().Be(JsonValueKind.String);

        var activeDevice = json.GetProperty("activeDevice");
        activeDevice.GetProperty("deviceName").GetString().Should().Be("PR6 Test Device");
        activeDevice.GetProperty("deviceType").GetString().Should().Be("mobile");
        activeDevice.GetProperty("os").GetString().Should().Be("Android");
        activeDevice.GetProperty("browser").GetString().Should().Be("Chrome");
        activeDevice.GetProperty("boundAt").ValueKind.Should().Be(JsonValueKind.String);
        activeDevice.GetProperty("lastUsed").ValueKind.Should().Be(JsonValueKind.String);
    }

    // ===== POST /api/v1/admin/students/{id}/archive + /restore =====

    [Fact]
    public async Task Archive_FullLifecycle_HidesThenRestoresStudent()
    {
        // Visible in the default list before archiving.
        (await _factory.ListStudentIds("/api/v1/admin/students"))
            .Should().Contain(_factory.ArchiveStudentId);

        // Archive → 204, tombstone set, sessions revoked, audited.
        var archiveResponse = await _factory.SendSuper(HttpMethod.Post, $"/api/v1/admin/students/{_factory.ArchiveStudentId}/archive");
        archiveResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await _factory.GetStudent(_factory.ArchiveStudentId))!.DeletedAt.Should().NotBeNull();
        _factory.Sessions.Verify(s => s.RevokeAllForUserAsync(_factory.ArchiveStudentId, "student_archived", It.IsAny<CancellationToken>()), Times.Once);
        _factory.Audit.Verify(a => a.LogSecurityEventAsync(
            _factory.ArchiveStudentId, _factory.SuperAdminId, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            It.Is<string>(description => description.Contains("action=student_archive") && description.Contains($"target_student_id={_factory.ArchiveStudentId}")),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);

        // Hidden from the default list, visible under status=archived.
        (await _factory.ListStudentIds("/api/v1/admin/students"))
            .Should().NotContain(_factory.ArchiveStudentId);
        (await _factory.ListStudentIds("/api/v1/admin/students?status=archived"))
            .Should().Contain(_factory.ArchiveStudentId).And.NotContain(_factory.TestStudentId);

        // Detail reports the archived state.
        var detail = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.ArchiveStudentId}");
        detail.GetProperty("archived").GetBoolean().Should().BeTrue();
        detail.GetProperty("archivedAt").ValueKind.Should().Be(JsonValueKind.String);

        // Idempotent: archiving an already-archived student is still 204 (no second revocation/audit).
        var secondArchive = await _factory.SendSuper(HttpMethod.Post, $"/api/v1/admin/students/{_factory.ArchiveStudentId}/archive");
        secondArchive.StatusCode.Should().Be(HttpStatusCode.NoContent);
        _factory.Sessions.Verify(s => s.RevokeAllForUserAsync(_factory.ArchiveStudentId, It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);

        // Restore → 204, tombstone cleared, audited, visible in the default list again.
        var restoreResponse = await _factory.SendSuper(HttpMethod.Post, $"/api/v1/admin/students/{_factory.ArchiveStudentId}/restore");
        restoreResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await _factory.GetStudent(_factory.ArchiveStudentId))!.DeletedAt.Should().BeNull();
        _factory.Audit.Verify(a => a.LogSecurityEventAsync(
            _factory.ArchiveStudentId, _factory.SuperAdminId, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            It.Is<string>(description => description.Contains("action=student_restore")),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
        (await _factory.ListStudentIds("/api/v1/admin/students"))
            .Should().Contain(_factory.ArchiveStudentId);
    }

    [Fact]
    public async Task Archive_UnknownStudent_Returns404()
    {
        var response = await _factory.SendSuper(HttpMethod.Post, "/api/v1/admin/students/00000000-0000-0000-0000-00000000000f/archive");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Archive_AdminWithoutStudentsEdit_Returns403()
    {
        var response = await _factory.SendLimited(HttpMethod.Post, $"/api/v1/admin/students/{_factory.ArchiveStudentId}/archive");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Restore_UnknownStudent_Returns404()
    {
        var response = await _factory.SendSuper(HttpMethod.Post, "/api/v1/admin/students/00000000-0000-0000-0000-00000000000f/restore");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ===== GET /api/v1/admin/students/{id}/activity =====

    [Fact]
    public async Task Activity_Anonymous_Returns401()
    {
        var response = await _factory.Client.GetAsync($"/api/v1/admin/students/{_factory.TestStudentId}/activity");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Activity_AdminWithoutLogsView_Returns403()
    {
        var response = await _factory.SendLimited(HttpMethod.Get, $"/api/v1/admin/students/{_factory.TestStudentId}/activity");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Activity_AsSuperAdmin_ReturnsSeededEventsWithExactShape()
    {
        var json = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}/activity");

        json.GetProperty("total").GetInt32().Should().Be(6);
        json.GetProperty("page").GetInt32().Should().Be(1);
        json.GetProperty("pageSize").GetInt32().Should().Be(20);
        json.GetProperty("totalPages").GetInt32().Should().Be(1);
        var items = json.GetProperty("items");
        items.GetArrayLength().Should().Be(6);

        foreach (var item in items.EnumerateArray())
        {
            item.GetProperty("id").GetString().Should().NotBeNullOrEmpty();
            item.GetProperty("eventType").GetString().Should().NotBeNullOrEmpty();
            item.GetProperty("severity").GetString().Should().NotBeNullOrEmpty();
            item.GetProperty("description").GetString().Should().NotBeNullOrEmpty();
            item.GetProperty("correlationId").GetString().Should().NotBeNullOrEmpty();
            item.GetProperty("createdAt").ValueKind.Should().Be(JsonValueKind.String);
            item.GetProperty("actorType").GetString().Should().BeOneOf("admin", "student");
        }

        // The admin-attributed row resolves the acting admin's name; student rows report actorType=student.
        var adminRow = items.EnumerateArray().Single(item => item.GetProperty("description").GetString() == "activity_admin_action");
        adminRow.GetProperty("adminName").GetString().Should().Be(StudentSecurityCenterHttpFactory.SuperAdminName);
        adminRow.GetProperty("actorType").GetString().Should().Be("admin");
        var studentRow = items.EnumerateArray().Single(item => item.GetProperty("description").GetString() == "activity_login_success");
        studentRow.GetProperty("adminName").ValueKind.Should().Be(JsonValueKind.Null);
        studentRow.GetProperty("actorType").GetString().Should().Be("student");
        var failedRow = items.EnumerateArray().First(item => item.GetProperty("description").GetString()!.StartsWith("activity_login_failed"));
        failedRow.GetProperty("ipAddress").GetString().Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Activity_Pagination_RespectsPageAndPageSize()
    {
        var json = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}/activity?page=2&pageSize=2");

        json.GetProperty("total").GetInt32().Should().Be(6);
        json.GetProperty("page").GetInt32().Should().Be(2);
        json.GetProperty("pageSize").GetInt32().Should().Be(2);
        json.GetProperty("totalPages").GetInt32().Should().Be(3);
        json.GetProperty("items").GetArrayLength().Should().Be(2);
    }

    [Fact]
    public async Task Activity_TypeAndSeverityFilters_Apply()
    {
        var byType = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}/activity?type=LoginFailed");
        byType.GetProperty("total").GetInt32().Should().Be(3);
        byType.GetProperty("items").EnumerateArray().Should().OnlyContain(item => item.GetProperty("eventType").GetString() == "LoginFailed");

        var bySeverity = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}/activity?severity=Warning");
        bySeverity.GetProperty("total").GetInt32().Should().Be(5);

        var byBoth = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}/activity?type=LoginSuccess&severity=Info");
        byBoth.GetProperty("total").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Activity_InvalidEnumFilters_AreIgnoredNot500()
    {
        var json = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}/activity?type=NotAnEventType&severity=Nope");

        json.GetProperty("total").GetInt32().Should().Be(6, "invalid enum filter values are dropped, not errors");
    }

    [Fact]
    public async Task Activity_DateRangeFilter_Apply()
    {
        var futureFrom = DateTime.UtcNow.AddHours(1).ToString("o");
        var json = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}/activity?dateFrom={Uri.EscapeDataString(futureFrom)}");
        json.GetProperty("total").GetInt32().Should().Be(0, "nothing was logged in the future");

        var pastFrom = DateTime.UtcNow.AddHours(-1).ToString("o");
        var all = await _factory.GetJsonAsSuper($"/api/v1/admin/students/{_factory.TestStudentId}/activity?dateFrom={Uri.EscapeDataString(pastFrom)}");
        all.GetProperty("total").GetInt32().Should().Be(6);
    }

    // ===== GET /api/v1/security/summary =====

    [Fact]
    public async Task Summary_Anonymous_Returns401()
    {
        var response = await _factory.Client.GetAsync("/api/v1/security/summary");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Summary_AdminWithoutLogsView_Returns403()
    {
        var response = await _factory.SendLimited(HttpMethod.Get, "/api/v1/security/summary");
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Summary_AsSuperAdmin_ReturnsRealCountersFromSeededLogs()
    {
        var json = await _factory.GetJsonAsSuper("/api/v1/security/summary");

        json.GetProperty("generatedAt").ValueKind.Should().Be(JsonValueKind.String);
        json.GetProperty("failedLogins24h").GetInt32().Should().Be(3);
        json.GetProperty("failedLogins7d").GetInt32().Should().Be(4);
        json.GetProperty("activeLockouts").GetInt32().Should().Be(1);
        json.GetProperty("refreshReuse7d").GetInt32().Should().Be(1);
        json.GetProperty("mfaEnabled7d").GetInt32().Should().Be(1);
        json.GetProperty("mfaDisabled7d").GetInt32().Should().Be(1);
        json.GetProperty("mfaFailed7d").GetInt32().Should().Be(1);
        json.GetProperty("criticalEvents7d").GetInt32().Should().Be(1);
        json.GetProperty("suspiciousAlerts7d").GetInt32().Should().Be(2);
        json.GetProperty("passwordResets7d").GetInt32().Should().Be(2);

        var topIps = json.GetProperty("topFailedLoginIps24h");
        topIps.GetArrayLength().Should().Be(2);
        topIps[0].GetProperty("ipAddress").GetString().Should().Be("203.0.113.10");
        topIps[0].GetProperty("count").GetInt32().Should().Be(2);
        topIps[1].GetProperty("ipAddress").GetString().Should().Be("198.51.100.7");
        topIps[1].GetProperty("count").GetInt32().Should().Be(1);
    }
}

// ===== Test Factory =====

public sealed class StudentSecurityCenterHttpFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string JwtSigningKey = "student-center-test-jwt-signing-key-32b";
    private readonly string _databaseName = $"student-center-http-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection()
        .AddEntityFrameworkInMemoryDatabase()
        .BuildServiceProvider();

    internal HttpClient Client { get; private set; } = null!;
    internal Mock<ISessionService> Sessions { get; } = new();
    internal Mock<ISecurityAuditWriter> Audit { get; } = new();

    internal Guid TestStudentId { get; private set; }
    internal Guid ArchiveStudentId { get; private set; }
    internal Guid SuperAdminId { get; private set; }
    internal Guid LimitedAdminId { get; private set; }
    internal Guid TestUniversityId { get; private set; }
    internal Guid TestCollegeId { get; private set; }
    internal Guid TestYearId { get; private set; }
    internal Guid TestSubscriptionId { get; private set; }
    internal const string TestStudentName = "طالب مركز الأمان";
    internal const string SuperAdminName = "مدير عام الاختبار";
    internal const string TestUniversityName = "جامعة مركز الأمان";
    internal const string SuperAdminPassword = "SuperAdminPass123!";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Environment.SetEnvironmentVariable("Jwt__Secret", JwtSigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "student-center-test");
        Environment.SetEnvironmentVariable("Jwt__Audience", "student-center-test");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Port=5432;Database=cms_student_center_test;Username=postgres;Password=not-used");
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "student-center-entitlement-key-32-bytes!!");

        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:Secret", JwtSigningKey);
        builder.UseSetting("Jwt:Issuer", "student-center-test");
        builder.UseSetting("Jwt:Audience", "student-center-test");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = "student-center-test",
            ["Jwt:Audience"] = "student-center-test",
            ["Jwt:AccessTokenExpiryMinutes"] = "15",
            ["Security:Entitlements:SigningKey"] = "student-center-entitlement-key-32-bytes!!",
            ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Port=5432;Database=cms_student_center_test;Username=postgres;Password=not-used",
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

            // Header-driven test auth: super admin OR a permission-less admin OR a student.
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = StudentCenterTestAuthHandler.Scheme;
                options.DefaultChallengeScheme = StudentCenterTestAuthHandler.Scheme;
                options.DefaultForbidScheme = StudentCenterTestAuthHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, StudentCenterTestAuthHandler>(StudentCenterTestAuthHandler.Scheme, _ => { });

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
            services.AddScoped<ISessionService>(_ => Sessions.Object);

            services.RemoveAll<ICacheService>();
            var cache = new Mock<ICacheService>();
            cache.Setup(c => c.GetAsync<bool?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((bool?)null);
            cache.Setup(c => c.GetAsync<AdminScope?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((AdminScope?)null);
            cache.Setup(c => c.SetAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(c => c.SetAsync(It.IsAny<string>(), It.IsAny<AdminScope>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            services.AddScoped<ICacheService>(_ => cache.Object);

            services.RemoveAll<IFileStorageService>();
            var storage = new Mock<IFileStorageService>();
            storage.Setup(s => s.UploadAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync("test-key");
            storage.Setup(s => s.GetSignedUrlAsync(It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync("https://test-signed-url.example.com/file");
            storage.Setup(s => s.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.AddSingleton<IFileStorageService>(_ => storage.Object);

            services.RemoveAll<ISecurityAuditWriter>();
            Audit.Setup(a => a.LogSecurityEventAsync(
                    It.IsAny<Guid?>(), It.IsAny<Guid?>(),
                    It.IsAny<SecurityEventType>(), It.IsAny<SecuritySeverity>(),
                    It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(),
                    It.IsAny<string?>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.AddScoped<ISecurityAuditWriter>(_ => Audit.Object);
        });
    }

    public async Task InitializeAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var now = DateTime.UtcNow;

        // Academic hierarchy
        var university = University.Create(TestUniversityName, "pr6-uni", "PR6 University");
        var college = College.Create(university.Id, "كلية مركز الأمان", "pr6-college", "PR6 College");
        var year = AcademicYear.Create(college.Id, "السنة الأولى", "pr6-year-1", 1);

        // Students: main (drawer target) + archive lifecycle target (locked out → activeLockouts=1)
        var student = Student.Create("0994561234", "legacy-student-hash", TestStudentName);
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();
        var archiveStudent = Student.Create("0994565678", "legacy-archive-hash", "طالب الأرشفة");
        archiveStudent.SetAcademicInfo(university.Id, college.Id, year.Id);
        archiveStudent.VerifyPhone();
        typeof(Student).GetProperty("LockoutUntil")?.SetValue(archiveStudent, now.AddMinutes(30));

        // Admins: super admin (real Argon2 hash so the danger-zone re-auth verifies) + permission-less admin
        var superRole = AdminRole.Create(Roles.SuperAdmin, SuperAdminName, isSystem: true);
        var superAdmin = Admin.Create("super@pr6.test", new PasswordHasher().HashPassword(SuperAdminPassword), SuperAdminName, superRole.Id);
        var limitedRole = AdminRole.Create("pr6_limited", "مدير بلا صلاحيات");
        var limitedAdmin = Admin.Create("limited@pr6.test", "not-used", "مدير بلا صلاحيات", limitedRole.Id);

        // Subscription + active device for the detail shape
        var subscription = new StudentSubscription
        {
            StudentId = student.Id,
            ScopeType = SubscriptionScopeType.Subject,
            Status = SubscriptionStatus.Active,
            StartsAt = now.AddDays(-1),
            ExpiresAt = now.AddDays(30),
        };
        var device = new DeviceBinding
        {
            StudentId = student.Id,
            DeviceFingerprint = "pr6-fingerprint",
            DeviceName = "PR6 Test Device",
            DeviceType = "mobile",
            Os = "Android",
            Browser = "Chrome",
            IsActive = true,
            BoundAt = now.AddDays(-5),
            LastUsed = now.AddHours(-2),
        };

        db.AddRange(university, college, year, student, archiveStudent, superRole, superAdmin, limitedRole, limitedAdmin, subscription, device);

        // Seeded audit rows: the activity feed (per-student, 6 rows) + summary counters.
        db.SecurityLogs.AddRange(
            AuditLog(SecurityEventType.LoginFailed, SecuritySeverity.Warning, "activity_login_failed_1", student.Id, ip: "203.0.113.10", createdAt: now),
            AuditLog(SecurityEventType.LoginFailed, SecuritySeverity.Warning, "activity_login_failed_2", student.Id, ip: "203.0.113.10", createdAt: now),
            AuditLog(SecurityEventType.LoginFailed, SecuritySeverity.Warning, "activity_login_failed_3", student.Id, ip: "198.51.100.7", createdAt: now),
            AuditLog(SecurityEventType.LoginSuccess, SecuritySeverity.Info, "activity_login_success", student.Id, createdAt: now),
            AuditLog(SecurityEventType.AdminAction, SecuritySeverity.Warning, "activity_admin_action", student.Id, adminId: superAdmin.Id, createdAt: now),
            AuditLog(SecurityEventType.PasswordChanged, SecuritySeverity.Warning, "activity_password_changed", student.Id, createdAt: now),
            AuditLog(SecurityEventType.LoginFailed, SecuritySeverity.Warning, "window_login_failed_old", null, ip: "203.0.113.10", createdAt: now.AddHours(-30)),
            AuditLog(SecurityEventType.RefreshReuse, SecuritySeverity.Warning, "window_refresh_reuse", null, createdAt: now.AddDays(-3)),
            AuditLog(SecurityEventType.MfaEnabled, SecuritySeverity.Info, "window_mfa_enabled", null, createdAt: now.AddDays(-3)),
            AuditLog(SecurityEventType.MfaDisabled, SecuritySeverity.Info, "window_mfa_disabled", null, createdAt: now.AddDays(-3)),
            AuditLog(SecurityEventType.MfaFailed, SecuritySeverity.Warning, "window_mfa_failed", null, createdAt: now.AddDays(-3)),
            AuditLog(SecurityEventType.SecurityAlert, SecuritySeverity.Warning, "window_suspicious_alert", null, createdAt: now.AddDays(-2)),
            AuditLog(SecurityEventType.SecurityAlert, SecuritySeverity.Critical, "window_critical_alert", null, createdAt: now.AddDays(-2)),
            AuditLog(SecurityEventType.PasswordResetRequested, SecuritySeverity.Info, "window_reset_requested", null, createdAt: now.AddDays(-2)));

        await db.SaveChangesAsync();

        TestStudentId = student.Id;
        ArchiveStudentId = archiveStudent.Id;
        SuperAdminId = superAdmin.Id;
        LimitedAdminId = limitedAdmin.Id;
        TestUniversityId = university.Id;
        TestCollegeId = college.Id;
        TestYearId = year.Id;
        TestSubscriptionId = subscription.Id;
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
    }

    // ===== Request helpers =====

    internal Task<HttpResponseMessage> SendSuper(HttpMethod method, string uri)
        => Client.SendAsync(Seeded(method, uri, SuperAdminId));

    internal Task<HttpResponseMessage> SendLimited(HttpMethod method, string uri)
        => Client.SendAsync(Seeded(method, uri, LimitedAdminId));

    internal async Task<HttpResponseMessage> PostJsonAsSuper<T>(string uri, T value)
    {
        var request = Seeded(HttpMethod.Post, uri, SuperAdminId);
        request.Content = JsonContent.Create(value);
        return await Client.SendAsync(request);
    }

    internal async Task<HttpResponseMessage> PostJsonAsLimited<T>(string uri, T value)
    {
        var request = Seeded(HttpMethod.Post, uri, LimitedAdminId);
        request.Content = JsonContent.Create(value);
        return await Client.SendAsync(request);
    }

    internal async Task<JsonElement> GetJsonAsSuper(string uri)
    {
        var response = await SendSuper(HttpMethod.Get, uri);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    internal async Task<List<Guid>> ListStudentIds(string uri)
    {
        var response = await SendSuper(HttpMethod.Get, uri);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return json.GetProperty("items").EnumerateArray().Select(item => Guid.Parse(item.GetProperty("id").GetString()!)).ToList();
    }

    internal async Task<Student?> GetStudent(Guid studentId)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Students.AsNoTracking().FirstOrDefaultAsync(s => s.Id == studentId);
    }

    private static HttpRequestMessage Seeded(HttpMethod method, string uri, Guid adminId)
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", adminId.ToString());
        return request;
    }

    private static SecurityLog AuditLog(SecurityEventType eventType, SecuritySeverity severity, string description, Guid? studentId, Guid? adminId = null, string? ip = null, DateTime? createdAt = null)
    {
        var log = new SecurityLog
        {
            StudentId = studentId,
            AdminId = adminId,
            EventType = eventType,
            Severity = severity,
            Description = description,
            IpAddress = ip is null ? null : System.Net.IPAddress.Parse(ip),
            CorrelationId = "pr6-test-correlation",
        };
        if (createdAt.HasValue)
            typeof(BaseEntity).GetProperty("CreatedAt")?.SetValue(log, createdAt.Value);
        return log;
    }
}

// ===== Header-driven test auth (super admin / limited admin / student) =====

internal sealed class StudentCenterTestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal new const string Scheme = "StudentCenterTestAuth";

    public StudentCenterTestAuthHandler(
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
        identity.AddClaim(new Claim("sid", Guid.Parse("22222222-2222-2222-2222-222222222222").ToString()));
        identity.AddClaim(new Claim("installation_id", "student-center-test-installation"));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}
