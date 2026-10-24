using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Text.Encodings.Web;
using System.Security.Claims;
using Npgsql;
using CMS.Application.Handlers.Admin;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using Moq;

namespace CMS.Tests.Integration;

/// <summary>
/// Push 3 / Track 3 against a real PostgreSQL database (schema pre-applied by
/// push3_migrations.sql on the throwaway Neon branch — the EF-translation gate that
/// InMemory cannot provide). Covers: column contract, full HTTP round-trip, the
/// corrupt-impossible / wrong-shape hardening, and the default-behavior-preserved
/// regression proof for unconfigured roles.
/// </summary>
[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class UiPermissionsPostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [Fact]
    public async Task AdminRoles_UiPermissionsColumn_IsJsonbAndNullable()
    {
        var connectionString = RequireConnection();
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await using var command = new NpgsqlCommand(
            """
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'admin_roles' AND column_name = 'ui_permissions';
            """, connection);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<(string Name, string Type, string Nullable)>();
        while (await reader.ReadAsync())
            rows.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2)));

        rows.Should().ContainSingle("the Push 3 migration adds exactly one ui_permissions column");
        rows[0].Name.Should().Be("ui_permissions");
        rows[0].Type.Should().Be("jsonb");
        rows[0].Nullable.Should().Be("YES", "NULL = unconfigured = full access (Q1)");
    }

    [Fact]
    public async Task UiPermissions_RoundTrip_NullToFull_SetToCustom_OverHttp()
    {
        var connectionString = RequireConnection();
        await using var factory = new UiPermissionsPgFactory(connectionString);
        try
        {
            await factory.SeedAsync();

            // Unconfigured custom role → full envelope (zero behavior change).
            var before = await GetMyEnvelopeAsync(factory, factory.CustomAdminId, super: false);
            before.Mode.Should().Be("unconfigured");
            before.AllowedKeys.Should().Equal(before.AllKeys);
            before.AllKeys.Should().HaveCount(70);

            // PUT (scrambled + duplicated) → stored registry-ordered.
            var put = factory.AdminRequest(HttpMethod.Put, factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{factory.CustomRoleId}/ui-permissions");
            put.Content = JsonContent.Create(new { allowedKeys = new[] { "btn:codes.export", "view:codes", "view:codes" } });
            (await factory.Client.SendAsync(put)).StatusCode.Should().Be(HttpStatusCode.NoContent);

            var after = await GetMyEnvelopeAsync(factory, factory.CustomAdminId, super: false);
            after.Mode.Should().Be("custom");
            after.IsSuperAdmin.Should().BeFalse();
            after.AllowedKeys.Should().Equal(["view:codes", "btn:codes.export"]);

            // DELETE → back to unconfigured = full access.
            (await factory.Client.SendAsync(factory.AdminRequest(HttpMethod.Delete, factory.SuperAdminId, super: true, $"/api/v1/admin/roles/{factory.CustomRoleId}/ui-permissions")))
                .StatusCode.Should().Be(HttpStatusCode.NoContent);

            var reset = await GetMyEnvelopeAsync(factory, factory.CustomAdminId, super: false);
            reset.Mode.Should().Be("unconfigured");
            reset.AllowedKeys.Should().Equal(reset.AllKeys);
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }

    [Fact]
    public async Task UiPermissions_WrongShapeJsonb_NeverWidensToFull()
    {
        var connectionString = RequireConnection();
        await using var factory = new UiPermissionsPgFactory(connectionString);
        try
        {
            await factory.SeedAsync();

            // jsonb accepts any JSON document, so a wrong-shape object CAN be written
            // directly to the database. Invalid JSON text is rejected by the column itself
            // (corrupt-impossible). This is the realistic corruption case:
            await using (var connection = new NpgsqlConnection(connectionString))
            {
                await connection.OpenAsync();
                await using var command = new NpgsqlCommand(
                    "UPDATE admin_roles SET ui_permissions = '{\"allowed\":true}'::jsonb WHERE id = @roleId;",
                    connection);
                command.Parameters.AddWithValue("roleId", factory.CustomRoleId);
                await command.ExecuteNonQueryAsync();
            }

            var envelope = await GetMyEnvelopeAsync(factory, factory.CustomAdminId, super: false);
            envelope.Mode.Should().Be("custom");
            envelope.AllowedKeys.Should().BeEmpty("a wrong-shape value must resolve to deny-all, never to full access");
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }

    /// <summary>
    /// Default Behavior Preserved (Push 3 regression gate): three custom roles with
    /// ui_permissions = NULL and one admin per role — every /me/ui-permissions call
    /// must return allowedKeys == allKeys (all 70 keys) with mode == "unconfigured".
    /// Proves zero behavioral change for existing roles.
    /// </summary>
    [Fact]
    public async Task UnconfiguredRoles_AllAdminsHaveFullAccess()
    {
        var connectionString = RequireConnection();
        await using var factory = new UiPermissionsPgFactory(connectionString);
        try
        {
            await factory.SeedAsync();
            var secondRole = await factory.SeedExtraCustomRoleAsync("pg_unconfigured_2");
            var thirdRole = await factory.SeedExtraCustomRoleAsync("pg_unconfigured_3");

            foreach (var adminId in new[] { factory.CustomAdminId, secondRole.AdminId, thirdRole.AdminId })
            {
                var envelope = await GetMyEnvelopeAsync(factory, adminId, super: false);
                envelope.Mode.Should().Be("unconfigured", "no Push 3 gate may fire for a role that was never configured");
                envelope.AllKeys.Should().HaveCount(70);
                envelope.AllowedKeys.Should().Equal(envelope.AllKeys, "allowedKeys == allKeys is the definition of full access");
                envelope.IsSuperAdmin.Should().BeFalse();
            }
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }

    // ===== Helpers =====

    private static string RequireConnection()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                $"BLOCKED: set {ConnectionVariable} to run the UI-permissions PostgreSQL integration tests.");
        return connectionString;
    }

    private static async Task<MyUiPermissionsDto> GetMyEnvelopeAsync(UiPermissionsPgFactory factory, Guid adminId, bool super)
    {
        var response = await factory.Client.SendAsync(factory.AdminRequest(HttpMethod.Get, adminId, super, "/api/v1/auth/admin/me/ui-permissions"));
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<MyUiPermissionsDto>())!;
    }
}

/// <summary>
/// Boots the full API against the pre-migrated branch database with real MediatR
/// handlers. Only transport-level concerns (authentication, session validation, caching)
/// are replaced with test doubles.
/// </summary>
internal sealed class UiPermissionsPgFactory : WebApplicationFactory<Program>, IAsyncDisposable
{
    private const string JwtSigningKey = "ui-permissions-pg-test-jwt-signing-key-32-bytes";
    private readonly string _connectionString;

    internal HttpClient Client { get; private set; } = null!;
    internal Guid SuperAdminId { get; private set; }
    internal Guid SuperRoleId { get; private set; }
    internal Guid CustomRoleId { get; private set; }
    internal Guid CustomAdminId { get; private set; }

    private readonly List<Guid> _extraAdminIds = [];
    private readonly List<Guid> _extraRoleIds = [];

    public UiPermissionsPgFactory(string connectionString) => _connectionString = connectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Environment.SetEnvironmentVariable("Jwt__Secret", JwtSigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "ui-permissions-pg-test");
        Environment.SetEnvironmentVariable("Jwt__Audience", "ui-permissions-pg-test");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "ui-permissions-pg-entitlement-key-32-bytes!!");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", _connectionString);
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");

        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = "ui-permissions-pg-test",
            ["Jwt:Audience"] = "ui-permissions-pg-test",
            ["Security:Entitlements:SigningKey"] = "ui-permissions-pg-entitlement-key-32-bytes!!",
            ["ConnectionStrings:PostgreSQL"] = _connectionString,
            ["ConnectionStrings:Redis"] = "localhost:6379"
        }));
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<ApplicationDbContext>();
            services.RemoveAll<IApplicationDbContext>();
            services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(_connectionString));
            services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());

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
            sessionMock.Setup(service => service.IsActiveAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(true);
            services.AddScoped<ISessionService>(_ => sessionMock.Object);

            services.RemoveAll<ICacheService>();
            services.AddSingleton<ICacheService, UiPermissionsHttpCache>();

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

    internal async Task SeedAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var suffix = Guid.NewGuid().ToString("N")[..8];
        var superRole = AdminRole.Create("super_admin", $"مدير عام {suffix}", null, true);
        var superAdmin = Admin.Create($"ui-pg-super-{suffix}@cms.example.com", "not-used", "مدير عام", superRole.Id);
        var customRole = AdminRole.Create($"ui_pg_view_{suffix}", $"قارئ {suffix}", "دور غير مُهيأ");
        var customAdmin = Admin.Create($"ui-pg-viewer-{suffix}@cms.example.com", "not-used", "مدير عرض", customRole.Id);

        db.AdminRoles.AddRange(superRole, customRole);
        db.Admins.AddRange(superAdmin, customAdmin);
        await db.SaveChangesAsync();

        SuperAdminId = superAdmin.Id;
        SuperRoleId = superRole.Id;
        CustomRoleId = customRole.Id;
        CustomAdminId = customAdmin.Id;
    }

    internal sealed record ExtraRole(Guid RoleId, Guid AdminId);

    /// <summary>Seeds one more custom role (ui_permissions NULL) with its own admin — for the 3-role regression test.</summary>
    internal async Task<ExtraRole> SeedExtraCustomRoleAsync(string hint)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var role = AdminRole.Create($"{hint}_{suffix}", $"دور إضافي {suffix}", "دور غير مُهيأ إضافي");
        var admin = Admin.Create($"ui-pg-{hint}-{suffix}@cms.example.com", "not-used", $"مدير {hint}", role.Id);
        db.AdminRoles.Add(role);
        db.Admins.Add(admin);
        await db.SaveChangesAsync();
        _extraRoleIds.Add(role.Id);
        _extraAdminIds.Add(admin.Id);
        return new ExtraRole(role.Id, admin.Id);
    }

    internal HttpRequestMessage AdminRequest(HttpMethod method, Guid adminId, bool super, string uri)
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", adminId.ToString());
        if (super)
            request.Headers.TryAddWithoutValidation("X-Test-Super", "1");
        return request;
    }

    internal async Task CleanupAsync()
    {
        try
        {
            await using var scope = Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.Admins.Where(admin => admin.Id == CustomAdminId || admin.Id == SuperAdminId || _extraAdminIds.Contains(admin.Id))
                .ExecuteDeleteAsync();
            await db.AdminRoles.Where(role => role.Id == CustomRoleId || role.Id == SuperRoleId || _extraRoleIds.Contains(role.Id))
                .ExecuteDeleteAsync();
        }
        catch
        {
            // Cleanup is best-effort — a leftover seeded row never invalidates a test verdict.
        }
    }
}
