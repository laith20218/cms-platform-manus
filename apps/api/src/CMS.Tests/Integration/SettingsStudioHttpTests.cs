using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using CMS.Application.Interfaces;
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
/// PR-7 (Settings + Role Studio) HTTP integration tests.
/// Covers the reworked settings surface (typed validation + SystemSettingHistory rows +
/// registry-based reset that IGNORES the client DefaultValue), the read-only feature-flag
/// inventory, the effective-permissions view, and the last-effective-super-admin guard
/// on the disable/delete/demote/reset-password admin paths.
/// Dedicated factory with InMemory EF and a header-driven test auth handler
/// (super admin / permission-less admin / settings-viewer admin).
/// </summary>
[Collection("SignedEntitlementHttp")]
public sealed class SettingsStudioHttpTests : IClassFixture<SettingsStudioHttpFactory>
{
    private readonly SettingsStudioHttpFactory _factory;

    public SettingsStudioHttpTests(SettingsStudioHttpFactory factory) => _factory = factory;

    // ===== PUT /api/v1/admin/settings/{key} — typed validation + history =====

    [Fact]
    public async Task Settings_Update_AsSuperAdmin_PersistsValue_AndWritesHistoryRowWithReasonUpdate()
    {
        var before = await _factory.GetSetting("platform_name");
        var newValue = "PR-7 Updated Platform Name";

        var response = await _factory.PutJsonAsSuper("/api/v1/admin/settings/platform_name",
            new { Value = newValue, Description = before!.Description });

        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("value").GetString().Should().Be(newValue);
        // PR-7: the DTO now carries the schema metadata for typed UI controls.
        body.GetProperty("valueType").GetString().Should().Be("string");

        (await _factory.GetSetting("platform_name"))!.Value.Should().Be(newValue);
        var history = await _factory.GetHistoryRows("platform_name");
        history.Should().Contain(row =>
            row.OldValue == before.Value
            && row.NewValue == newValue
            && row.Reason == "update"
            && row.ChangedBy == _factory.SuperAdminId);
    }

    [Fact]
    public async Task Settings_Update_InvalidTypedValue_Returns400SettingValueInvalid_AndWritesNothing()
    {
        var before = await _factory.GetSetting("max_login_attempts");
        var historyCountBefore = (await _factory.GetHistoryRows("max_login_attempts")).Count;

        var response = await _factory.PutJsonAsSuper("/api/v1/admin/settings/max_login_attempts",
            new { Value = "42" }); // schema bound: max 10

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("errorCode").GetString().Should().Be("SETTING_VALUE_INVALID");
        body.GetProperty("detail").GetString().Should().Be("قيمة الإعداد غير صالحة");

        (await _factory.GetSetting("max_login_attempts"))!.Value.Should().Be(before!.Value, "a rejected value must never reach the setting");
        (await _factory.GetHistoryRows("max_login_attempts")).Should().HaveCount(historyCountBefore,
            "a rejected value must not append history");
    }

    [Fact]
    public async Task Settings_Update_EnumKey_OutsideAllowedValues_Returns400()
    {
        var response = await _factory.PutJsonAsSuper("/api/v1/admin/settings/default_language",
            new { Value = "fr" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("errorCode").GetString().Should().Be("SETTING_VALUE_INVALID");
    }

    [Fact]
    public async Task Settings_List_IncludesValueTypeAndAllowedValuesForEnum()
    {
        var json = await _factory.GetJsonAsSuper("/api/v1/admin/settings");

        var language = json.EnumerateArray().Single(item => item.GetProperty("key").GetString() == "default_language");
        language.GetProperty("valueType").GetString().Should().Be("enum");
        language.GetProperty("allowedValues").EnumerateArray().Select(item => item.GetString())
            .Should().BeEquivalentTo("ar", "en");

        var attempts = json.EnumerateArray().Single(item => item.GetProperty("key").GetString() == "max_login_attempts");
        attempts.GetProperty("valueType").GetString().Should().Be("int");
        attempts.GetProperty("allowedValues").ValueKind.Should().Be(JsonValueKind.Null, "only enum keys expose allowedValues");

        var upload = json.EnumerateArray().Single(item => item.GetProperty("key").GetString() == "max_upload_size_mb");
        upload.GetProperty("valueType").GetString().Should().Be("string", "unregistered keys stay plain strings");
    }

    // ===== POST /api/v1/admin/settings/{key}/reset — registry-based, client value ignored =====

    [Fact]
    public async Task Settings_Reset_IgnoresClientDefaultValue_AndRestoresRegisteredDefault_WithHistoryRow()
    {
        // Taint the value first so the reset has a real old→new transition.
        await _factory.PutJsonAsSuper("/api/v1/admin/settings/enable_watermark", new { Value = "false" });
        var beforeReset = await _factory.GetSetting("enable_watermark");
        beforeReset!.Value.Should().Be("false");

        var response = await _factory.PostJsonAsSuper("/api/v1/admin/settings/enable_watermark/reset",
            new { DefaultValue = "evil-client-controlled-value" }); // must be IGNORED

        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("value").GetString().Should().Be("true", "the REGISTERED default — never the client value");

        (await _factory.GetSetting("enable_watermark"))!.Value.Should().Be("true");
        (await _factory.GetSetting("enable_watermark"))!.Value.Should().NotBe("evil-client-controlled-value");

        var history = await _factory.GetHistoryRows("enable_watermark");
        history.Should().Contain(row =>
            row.OldValue == "false"
            && row.NewValue == "true"
            && row.Reason == "reset"
            && row.ChangedBy == _factory.SuperAdminId);
    }

    [Fact]
    public async Task Settings_Reset_UnregisteredKey_Returns404NoRegisteredDefault()
    {
        var response = await _factory.PostJsonAsSuper("/api/v1/admin/settings/max_upload_size_mb/reset",
            new { DefaultValue = "10" });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("title").GetString().Should().Be("No registered default");
        body.GetProperty("detail").GetString().Should().Be("لا يوجد افتراضي مسجّل لهذا الإعداد");
    }

    // ===== GET /api/v1/admin/settings/{key}/history — paginated read-only trail =====

    [Fact]
    public async Task Settings_History_Anonymous_Returns401()
    {
        var response = await _factory.Client.GetAsync("/api/v1/admin/settings/platform_name/history");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Settings_History_AsSuper_ReturnsPagedRowsWithActorNameAndReason()
    {
        // Produce two changes so the endpoint has real rows to page over.
        await _factory.PutJsonAsSuper("/api/v1/admin/settings/max_login_attempts", new { Value = "7" });
        await _factory.PostJsonAsSuper("/api/v1/admin/settings/max_login_attempts/reset", new { });

        var body = await _factory.GetJsonAsSuper("/api/v1/admin/settings/max_login_attempts/history?page=1&pageSize=1");

        body.GetProperty("total").GetInt32().Should().BeGreaterThanOrEqualTo(2, "update + reset rows");
        body.GetProperty("page").GetInt32().Should().Be(1);
        body.GetProperty("pageSize").GetInt32().Should().Be(1);
        body.GetProperty("totalPages").GetInt32().Should().BeGreaterThanOrEqualTo(2);

        var row = body.GetProperty("items")[0];
        row.GetProperty("key").GetString().Should().Be("max_login_attempts");
        row.GetProperty("reason").GetString().Should().BeOneOf("update", "reset");
        // Newest-first ordering: the reset row is the most recent mutation.
        row.GetProperty("reason").GetString().Should().Be("reset");
        row.GetProperty("oldValue").GetString().Should().Be("7");
        row.GetProperty("newValue").GetString().Should().Be("5", "the registered default");
        // Actor resolution: the seeded super admin performed both mutations.
        row.GetProperty("changedByName").GetString().Should().Be(SettingsStudioHttpFactory.SuperAdminName);
    }

    [Fact]
    public async Task Settings_History_UnknownKey_ReturnsEmptyItemsWithTotalZero()
    {
        var body = await _factory.GetJsonAsSuper("/api/v1/admin/settings/never_registered_key/history");
        body.GetProperty("total").GetInt32().Should().Be(0);
        body.GetProperty("items").GetArrayLength().Should().Be(0);
        body.GetProperty("totalPages").GetInt32().Should().Be(1, "zero-page edge stays at 1, never 0 or negative");
    }

    // ===== GET /api/v1/admin/settings/feature-flags — read-only inventory =====

    [Fact]
    public async Task FeatureFlags_Anonymous_Returns401()
    {
        var response = await _factory.Client.GetAsync("/api/v1/admin/settings/feature-flags");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task FeatureFlags_AdminWithoutSettingsView_Returns403()
    {
        var response = await _factory.SendAs(HttpMethod.Get, "/api/v1/admin/settings/feature-flags", _factory.LimitedAdminId);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task FeatureFlags_NonSuperAdminWithSettingsView_Returns403()
    {
        // The permission grant alone is not enough — the endpoint mirrors the security-category
        // super-admin gate (GetScopeAsync → IsSuperAdmin).
        var response = await _factory.SendAs(HttpMethod.Get, "/api/v1/admin/settings/feature-flags", _factory.SettingsViewerAdminId);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task FeatureFlags_AsSuperAdmin_ReturnsAllFiveReadOnlyEntries()
    {
        var json = await _factory.GetJsonAsSuper("/api/v1/admin/settings/feature-flags");

        json.GetArrayLength().Should().Be(5);
        var byKey = json.EnumerateArray().ToDictionary(item => item.GetProperty("key").GetString()!);

        byKey.Keys.Should().BeEquivalentTo(
            "Features:OtpEnabled", "Features:OfflineEnabled", "Features:HardDeleteEnabled",
            "Security:PlayIntegrity:Enabled", "Library:RetentionDays");

        foreach (var item in json.EnumerateArray())
        {
            item.GetProperty("editable").GetBoolean().Should().BeFalse("feature flags change only via environment/appsettings — display-only");
            item.GetProperty("source").GetString().Should().BeOneOf("environment", "default");
            item.GetProperty("value").ValueKind.Should().Be(JsonValueKind.String);
            item.GetProperty("rawEnvName").GetString().Should().NotBeNullOrEmpty();
        }

        byKey["Features:OtpEnabled"].GetProperty("valueType").GetString().Should().Be("bool");
        byKey["Features:OfflineEnabled"].GetProperty("valueType").GetString().Should().Be("bool");
        byKey["Features:HardDeleteEnabled"].GetProperty("valueType").GetString().Should().Be("bool");
        byKey["Security:PlayIntegrity:Enabled"].GetProperty("valueType").GetString().Should().Be("bool");
        byKey["Library:RetentionDays"].GetProperty("valueType").GetString().Should().Be("int");

        // Environment-provided value (the test factory config sets Features:OtpEnabled=true,
        // which overrides the appsettings default).
        byKey["Features:OtpEnabled"].GetProperty("value").GetString().Should().Be("true");
        byKey["Features:OtpEnabled"].GetProperty("source").GetString().Should().Be("environment");
        byKey["Features:OtpEnabled"].GetProperty("rawEnvName").GetString().Should().Be("Features__OtpEnabled");

        // Nothing in any active configuration source provides Library:RetentionDays →
        // the fail-closed code default (30) with source "default".
        byKey["Library:RetentionDays"].GetProperty("value").GetString().Should().Be("30");
        byKey["Library:RetentionDays"].GetProperty("source").GetString().Should().Be("default");
        byKey["Library:RetentionDays"].GetProperty("rawEnvName").GetString().Should().Be("Library__RetentionDays");
    }

    // ===== GET /api/v1/admin/admins/{id}/effective-permissions =====

    [Fact]
    public async Task EffectivePermissions_Anonymous_Returns401()
    {
        var response = await _factory.Client.GetAsync($"/api/v1/admin/admins/{_factory.SuperAdminId}/effective-permissions");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task EffectivePermissions_NonSuperActor_Returns403()
    {
        var response = await _factory.SendAs(HttpMethod.Get,
            $"/api/v1/admin/admins/{_factory.CustomAdminId}/effective-permissions", _factory.LimitedAdminId);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task EffectivePermissions_UnknownTarget_Returns404()
    {
        var response = await _factory.SendSuper(HttpMethod.Get,
            "/api/v1/admin/admins/00000000-0000-0000-0000-00000000000f/effective-permissions");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task EffectivePermissions_SuperAdminTarget_BypassShape()
    {
        var json = await _factory.GetJsonAsSuper($"/api/v1/admin/admins/{_factory.SuperAdminId}/effective-permissions");

        json.GetProperty("adminId").GetString().Should().Be(_factory.SuperAdminId.ToString());
        json.GetProperty("email").GetString().Should().Be("super@pr7.test");
        json.GetProperty("isActive").GetBoolean().Should().BeTrue();
        json.GetProperty("isSuperAdmin").GetBoolean().Should().BeTrue();
        json.GetProperty("accessSource").GetString().Should().Be("super_admin_bypass");
        json.GetProperty("grants").GetArrayLength().Should().Be(0, "a super admin's access is the role-name bypass, not grant rows");
        json.GetProperty("role").GetProperty("name").GetString().Should().Be("super_admin");
        json.GetProperty("role").GetProperty("nameAr").GetString().Should().Be(SettingsStudioHttpFactory.SuperAdminName);
        json.GetProperty("role").GetProperty("isActive").GetBoolean().Should().BeTrue();
        var ui = json.GetProperty("uiPermissions");
        ui.GetProperty("mode").GetString().Should().Be("full");
        ui.GetProperty("allowedKeysCount").GetInt32().Should().BePositive();
        ui.GetProperty("registryVersion").GetString().Should().NotBeNullOrEmpty();
        var scope = json.GetProperty("academicScope");
        scope.GetProperty("universityId").ValueKind.Should().Be(JsonValueKind.Null, "super admins carry no academic scope");
    }

    [Fact]
    public async Task EffectivePermissions_CustomRoleAdmin_GrantsParsed_UiCustomCount_ScopeNames()
    {
        var json = await _factory.GetJsonAsSuper($"/api/v1/admin/admins/{_factory.CustomAdminId}/effective-permissions");

        json.GetProperty("isSuperAdmin").GetBoolean().Should().BeFalse();
        json.GetProperty("accessSource").GetString().Should().Be("role_grants");
        json.GetProperty("role").GetProperty("name").GetString().Should().Be("pr7_moderator");
        json.GetProperty("role").GetProperty("isActive").GetBoolean().Should().BeTrue();

        var grants = json.GetProperty("grants").EnumerateArray().ToList();
        grants.Should().HaveCount(2);
        var questions = grants.Single(grant => grant.GetProperty("resource").GetString() == "questions");
        questions.GetProperty("actions").EnumerateArray().Select(action => action.GetString())
            .Should().BeEquivalentTo("view", "edit");
        questions.GetProperty("scope").GetString().Should().Be("scoped");
        var settings = grants.Single(grant => grant.GetProperty("resource").GetString() == "settings");
        settings.GetProperty("actions").EnumerateArray().Select(action => action.GetString())
            .Should().BeEquivalentTo("view");
        settings.GetProperty("scope").GetString().Should().Be("own");

        var ui = json.GetProperty("uiPermissions");
        ui.GetProperty("mode").GetString().Should().Be("custom");
        ui.GetProperty("allowedKeysCount").GetInt32().Should().Be(2, "view:questions + btn:questions.create were configured for the role");

        var academic = json.GetProperty("academicScope");
        academic.GetProperty("universityId").GetString().Should().Be(_factory.TestUniversityId.ToString());
        academic.GetProperty("universityName").GetString().Should().Be(SettingsStudioHttpFactory.TestUniversityName);
        academic.GetProperty("collegeId").GetString().Should().Be(_factory.TestCollegeId.ToString());
        academic.GetProperty("collegeName").GetString().Should().NotBeNullOrEmpty();
        academic.GetProperty("yearId").GetString().Should().Be(_factory.TestYearId.ToString());
        academic.GetProperty("yearName").GetString().Should().NotBeNullOrEmpty();
        academic.GetProperty("subjectId").GetString().Should().Be(_factory.TestSubjectId.ToString());
        academic.GetProperty("subjectName").GetString().Should().NotBeNullOrEmpty();
    }

    // ===== LAST_SUPER_ADMIN guard on the admin management surface =====

    [Fact]
    public async Task AdminDisable_LastEffectiveSuperAdmin_Returns400LastSuperAdmin()
    {
        var response = await _factory.PostJsonAsSuper(
            $"/api/v1/admin/admins/{_factory.SuperAdminId}/status", new { IsActive = false });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("errorCode").GetString().Should().Be("LAST_SUPER_ADMIN");
        // Nothing was mutated: the last effective super admin stays active.
        (await _factory.GetAdmin(_factory.SuperAdminId))!.Status.Should().Be(AdminStatus.Active);
    }

    [Fact]
    public async Task AdminDelete_LastEffectiveSuperAdmin_Returns400LastSuperAdmin()
    {
        // DELETE carries the actor re-auth body (the danger-zone contract).
        var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/v1/admin/admins/{_factory.SuperAdminId}")
        {
            Content = JsonContent.Create(new { CurrentSuperAdminPassword = SettingsStudioHttpFactory.SuperAdminPassword })
        };
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", _factory.SuperAdminId.ToString());
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("errorCode").GetString().Should().Be("LAST_SUPER_ADMIN");
        (await _factory.GetAdmin(_factory.SuperAdminId)).Should().NotBeNull("the last effective super admin must survive");
    }

    [Fact]
    public async Task AdminDemote_LastEffectiveSuperAdmin_Returns400LastSuperAdmin()
    {
        var response = await _factory.PutJsonAsSuper($"/api/v1/admin/admins/{_factory.SuperAdminId}",
            new
            {
                Email = "super@pr7.test",
                FullName = SettingsStudioHttpFactory.SuperAdminName,
                Phone = (string?)null,
                RoleId = _factory.ModeratorRoleId,
                ScopeUniversityId = (Guid?)null,
                ScopeCollegeId = (Guid?)null,
                ScopeYearId = (Guid?)null,
                ScopeSubjectId = (Guid?)null
            });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("errorCode").GetString().Should().Be("LAST_SUPER_ADMIN");
        (await _factory.GetAdmin(_factory.SuperAdminId))!.RoleId.Should().Be(_factory.SuperRoleId,
            "the demotion of the last effective super admin must not persist");
    }

    [Fact]
    public async Task AdminResetPassword_LastEffectiveSuperAdmin_Returns400LastSuperAdmin()
    {
        var response = await _factory.PostJsonAsSuper(
            $"/api/v1/admin/admins/{_factory.SuperAdminId}/reset-password", new { NewPassword = "BrandNewAdmin123!" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("errorCode").GetString().Should().Be("LAST_SUPER_ADMIN");
        (await _factory.GetAdmin(_factory.SuperAdminId))!.PasswordHash.Should().Be(_factory.SuperAdminPasswordHash,
            "the rejected reset must not change the last effective super admin's credentials");
    }

    [Fact]
    public async Task AdminDisable_SuperTarget_BackedByAnotherActiveSuper_Succeeds()
    {
        // Target: a second ACTIVE super admin; the seeded actor backs the mutation.
        var secondSuperId = await _factory.CreateSuperAdmin("second-super@pr7.test");
        var response = await _factory.PostJsonAsSuper(
            $"/api/v1/admin/admins/{secondSuperId}/status", new { IsActive = false });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent, await response.Content.ReadAsStringAsync());
        (await _factory.GetAdmin(secondSuperId))!.Status.Should().Be(AdminStatus.Disabled);
        // The seeded actor stays the effective super admin — every later "last effective"
        // test keeps seeing exactly one ACTIVE super admin regardless of test order.
        (await _factory.GetAdmin(_factory.SuperAdminId))!.Status.Should().Be(AdminStatus.Active);
    }

    [Fact]
    public async Task AdminDisable_LastActiveSuper_WhenSecondSuperIsSuspended_StillBlocked()
    {
        // Seed a second super admin that is already suspended — only ACTIVE peers count.
        var suspendedSuperId = await _factory.CreateSuperAdmin("suspended-super@pr7.test", active: false);
        var response = await _factory.PostJsonAsSuper(
            $"/api/v1/admin/admins/{_factory.SuperAdminId}/status", new { IsActive = false });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("errorCode").GetString().Should().Be("LAST_SUPER_ADMIN",
            "a suspended second super admin does not back the mutation — only ACTIVE peers count");
        (await _factory.GetAdmin(_factory.SuperAdminId))!.Status.Should().Be(AdminStatus.Active);
    }

    [Fact]
    public async Task AdminDisable_NonSuperTarget_Succeeds()
    {
        var response = await _factory.PostJsonAsSuper(
            $"/api/v1/admin/admins/{_factory.CustomAdminId}/status", new { IsActive = false });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent, await response.Content.ReadAsStringAsync());
        (await _factory.GetAdmin(_factory.CustomAdminId))!.Status.Should().Be(AdminStatus.Disabled);
    }
}

// ===== Test Factory =====

public sealed class SettingsStudioHttpFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string JwtSigningKey = "settings-studio-test-jwt-signing-key-32b";
    private readonly string _databaseName = $"settings-studio-http-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection()
        .AddEntityFrameworkInMemoryDatabase()
        .BuildServiceProvider();

    internal HttpClient Client { get; private set; } = null!;
    internal Mock<ISessionService> Sessions { get; } = new();
    internal Mock<ISecurityAuditWriter> Audit { get; } = new();

    internal Guid SuperAdminId { get; private set; }
    internal Guid LimitedAdminId { get; private set; }
    internal Guid SettingsViewerAdminId { get; private set; }
    internal Guid CustomAdminId { get; private set; }
    internal Guid SuperRoleId { get; private set; }
    internal Guid ModeratorRoleId { get; private set; }
    internal Guid TestUniversityId { get; private set; }
    internal Guid TestCollegeId { get; private set; }
    internal Guid TestYearId { get; private set; }
    internal Guid TestSubjectId { get; private set; }
    internal const string SuperAdminName = "مدير عام الاختبار";
    internal const string TestUniversityName = "جامعة الإعدادات";
    internal const string SuperAdminPassword = "SuperAdminPass123!";
    internal string SuperAdminPasswordHash { get; private set; } = string.Empty;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Environment.SetEnvironmentVariable("Jwt__Secret", JwtSigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "settings-studio-test");
        Environment.SetEnvironmentVariable("Jwt__Audience", "settings-studio-test");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Port=5432;Database=cms_settings_studio_test;Username=postgres;Password=not-used");
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "settings-studio-entitlement-key-32-bytes!!");

        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:Secret", JwtSigningKey);
        builder.UseSetting("Jwt:Issuer", "settings-studio-test");
        builder.UseSetting("Jwt:Audience", "settings-studio-test");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = "settings-studio-test",
            ["Jwt:Audience"] = "settings-studio-test",
            ["Jwt:AccessTokenExpiryMinutes"] = "15",
            ["Security:Entitlements:SigningKey"] = "settings-studio-entitlement-key-32-bytes!!",
            ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Port=5432;Database=cms_settings_studio_test;Username=postgres;Password=not-used",
            ["ConnectionStrings:Redis"] = "localhost:6379",
            // Feature-flag fixture: an explicit environment value for OtpEnabled (overrides
            // the appsettings default). Library:RetentionDays stays UNSET anywhere so the
            // endpoint must surface the fail-closed code default (30) with source "default".
            ["Features:OtpEnabled"] = "true"
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

            // Header-driven test auth: super admin / any seeded admin / student.
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = SettingsStudioTestAuthHandler.Scheme;
                options.DefaultChallengeScheme = SettingsStudioTestAuthHandler.Scheme;
                options.DefaultForbidScheme = SettingsStudioTestAuthHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, SettingsStudioTestAuthHandler>(SettingsStudioTestAuthHandler.Scheme, _ => { });

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
            Sessions.Setup(s => s.RevokeAllForUserAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.AddScoped<ISessionService>(_ => Sessions.Object);

            services.RemoveAll<ICacheService>();
            var cache = new Mock<ICacheService>();
            cache.Setup(c => c.GetAsync<bool?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((bool?)null);
            cache.Setup(c => c.GetAsync<AdminScope?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((AdminScope?)null);
            cache.Setup(c => c.SetAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(c => c.SetAsync(It.IsAny<string>(), It.IsAny<AdminScope>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(c => c.RemoveByPatternAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
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

        // Academic hierarchy (scope-name resolution for the effective-permissions view).
        var university = University.Create(TestUniversityName, "pr7-uni", "PR7 University");
        var college = College.Create(university.Id, "كلية الإعدادات", "pr7-college", "PR7 College");
        var year = AcademicYear.Create(college.Id, "السنة الأولى", "pr7-year-1", 1);
        var semester = Semester.Create(year.Id, "الفصل الأول", "pr7-semester-1", 1);
        var subject = Subject.Create(semester.Id, "مادة الإعدادات", "pr7-subject", "PR7 Subject");

        // Roles: super admin (system) + a custom moderator role with grants + UI keys.
        var superRole = AdminRole.Create(Roles.SuperAdmin, SuperAdminName, isSystem: true);
        var moderatorRole = AdminRole.Create("pr7_moderator", "مراجع الإعدادات");
        moderatorRole.SetUiPermissions(UiPermissionRegistry.SerializeKeys(
            new[] { UiPermissionRegistry.ViewQuestions, UiPermissionRegistry.BtnQuestionsCreate }));
        db.AdminPermissions.Add(AdminPermission.Create(moderatorRole.Id, Resources.Questions,
            System.Text.Json.JsonSerializer.Serialize(new List<string> { Actions.View, Actions.Edit }), "scoped"));
        db.AdminPermissions.Add(AdminPermission.Create(moderatorRole.Id, Resources.Settings,
            System.Text.Json.JsonSerializer.Serialize(new List<string> { Actions.View }), "own"));

        // Permission-less limited admin + a settings-viewer (grant but non-super).
        var limitedRole = AdminRole.Create("pr7_limited", "مدير بلا صلاحيات");
        var settingsViewerRole = AdminRole.Create("pr7_settings_viewer", "مشاهد الإعدادات");
        db.AdminPermissions.Add(AdminPermission.Create(settingsViewerRole.Id, Resources.Settings,
            System.Text.Json.JsonSerializer.Serialize(new List<string> { Actions.View }), "own"));

        var superAdmin = Admin.Create("super@pr7.test", new CMS.Infrastructure.Security.PasswordHasher().HashPassword(SuperAdminPassword), SuperAdminName, superRole.Id);
        var limitedAdmin = Admin.Create("limited@pr7.test", "not-used", "مدير بلا صلاحيات", limitedRole.Id);
        var settingsViewer = Admin.Create("viewer@pr7.test", "not-used", "مشاهد الإعدادات", settingsViewerRole.Id);
        var customAdmin = Admin.Create("moderator@pr7.test", "not-used", "مراجع الإعدادات", moderatorRole.Id);
        customAdmin.SetScope(university.Id, college.Id, year.Id, subject.Id);

        db.AddRange(university, college, year, semester, subject, superRole, moderatorRole, limitedRole, settingsViewerRole,
            superAdmin, limitedAdmin, settingsViewer, customAdmin);

        // System settings: registered (typed) keys + one unregistered key for the reset-404 path.
        db.SystemSettings.AddRange(
            new SystemSetting { Key = "platform_name", Value = "CMS Test", Description = "اسم المنصة", Category = "platform" },
            new SystemSetting { Key = "default_language", Value = "ar", Description = "اللغة الافتراضية", Category = "platform" },
            new SystemSetting { Key = "max_login_attempts", Value = "5", Description = "أقصى محاولات دخول", Category = "security" },
            new SystemSetting { Key = "enable_watermark", Value = "true", Description = "تفعيل العلامة المائية", Category = "content" },
            new SystemSetting { Key = "max_upload_size_mb", Value = "10", Description = "Max upload", Category = "upload" });

        await db.SaveChangesAsync();

        SuperAdminId = superAdmin.Id;
        LimitedAdminId = limitedAdmin.Id;
        SettingsViewerAdminId = settingsViewer.Id;
        CustomAdminId = customAdmin.Id;
        SuperRoleId = superRole.Id;
        ModeratorRoleId = moderatorRole.Id;
        TestUniversityId = university.Id;
        TestCollegeId = college.Id;
        TestYearId = year.Id;
        TestSubjectId = subject.Id;
        SuperAdminPasswordHash = superAdmin.PasswordHash;
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
    }

    // ===== Request helpers =====

    internal Task<HttpResponseMessage> SendSuper(HttpMethod method, string uri)
        => SendAs(method, uri, SuperAdminId);

    internal Task<HttpResponseMessage> SendAs(HttpMethod method, string uri, Guid adminId)
    {
        var request = Seeded(method, uri, adminId);
        return Client.SendAsync(request);
    }

    internal async Task<HttpResponseMessage> PutJsonAsSuper<T>(string uri, T value)
    {
        var request = Seeded(HttpMethod.Put, uri, SuperAdminId);
        request.Content = JsonContent.Create(value);
        return await Client.SendAsync(request);
    }

    internal async Task<HttpResponseMessage> PostJsonAsSuper<T>(string uri, T value)
    {
        var request = Seeded(HttpMethod.Post, uri, SuperAdminId);
        request.Content = JsonContent.Create(value);
        return await Client.SendAsync(request);
    }

    internal async Task<JsonElement> GetJsonAsSuper(string uri)
    {
        var response = await SendSuper(HttpMethod.Get, uri);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    /// <summary>Seeds an additional super admin (backing peer) and returns its id.</summary>
    internal async Task<Guid> CreateSuperAdmin(string email, bool active = true)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var superRole = await db.AdminRoles.AsNoTracking().FirstAsync(role => role.Name == Roles.SuperAdmin);
        var admin = Admin.Create(email, "not-used", "مدير عام إضافي", superRole.Id);
        if (!active)
            admin.SetStatus(AdminStatus.Disabled);
        db.Admins.Add(admin);
        await db.SaveChangesAsync();
        return admin.Id;
    }

    internal async Task<SystemSetting?> GetSetting(string key)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(setting => setting.Key == key);
    }

    internal async Task<List<SystemSettingHistory>> GetHistoryRows(string key)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.SystemSettingHistories.AsNoTracking().Where(row => row.Key == key).ToListAsync();
    }

    internal async Task<Admin?> GetAdmin(Guid adminId)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Admins.AsNoTracking().Include(admin => admin.Role).FirstOrDefaultAsync(admin => admin.Id == adminId);
    }

    private static HttpRequestMessage Seeded(HttpMethod method, string uri, Guid adminId)
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", adminId.ToString());
        return request;
    }
}

// ===== Header-driven test auth (any admin authenticates with both role claims) =====

internal sealed class SettingsStudioTestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal new const string Scheme = "SettingsStudioTestAuth";

    public SettingsStudioTestAuthHandler(
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
        identity.AddClaim(new Claim("sid", Guid.Parse("11111111-1111-1111-1111-111111111112").ToString()));
        identity.AddClaim(new Claim("installation_id", "settings-studio-test-installation"));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}
