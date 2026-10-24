using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using CMS.Api.Middleware;
using CMS.Application.Handlers.Admin;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Push 3 / Track 3: registry invariants, ParseStoredKeys hardening (corrupt never widens),
/// the /me cache contract (directive 2.2) and the PUT/DELETE role lifecycle with audit +
/// invalidation — plus the middleware 503 mapping for UiPermissionsUnavailableException.
/// </summary>
public class UiPermissionHandlerTests
{
    // ===== Registry invariants =====

    [Fact]
    public void Registry_Has62Keys_Split_12Views_10Tabs_40Buttons()
    {
        UiPermissionRegistry.AllKeys.Should().HaveCount(62);
        UiPermissionRegistry.ViewKeys.Should().HaveCount(12);
        UiPermissionRegistry.TabKeys.Should().HaveCount(10);
        UiPermissionRegistry.ButtonKeys.Should().HaveCount(40);
    }

    [Fact]
    public void Registry_AllKeys_AreUnique_AndFollowLevelOrder()
    {
        UiPermissionRegistry.AllKeys.Should().OnlyHaveUniqueItems();
        UiPermissionRegistry.AllKeys.Take(12).Should().BeEquivalentTo(UiPermissionRegistry.ViewKeys, options => options.WithStrictOrdering());
        UiPermissionRegistry.AllKeys.Skip(12).Take(10).Should().BeEquivalentTo(UiPermissionRegistry.TabKeys, options => options.WithStrictOrdering());
        UiPermissionRegistry.AllKeys.Skip(22).Should().BeEquivalentTo(UiPermissionRegistry.ButtonKeys, options => options.WithStrictOrdering());
        UiPermissionRegistry.AllKeys.Should().OnlyContain(key => key.StartsWith("view:", StringComparison.Ordinal)
            || key.StartsWith("tab:", StringComparison.Ordinal)
            || key.StartsWith("btn:", StringComparison.Ordinal));
        UiPermissionRegistry.RegistryVersion.Should().Be("2026-10-24.1");
    }

    [Fact]
    public void Registry_Tree_CoversEveryKeyExactlyOnce()
    {
        UiPermissionRegistry.Tree.Keys.Should().BeEquivalentTo(UiPermissionRegistry.ViewKeys);
        var flattened = UiPermissionRegistry.Tree.Values.SelectMany(children => children).ToList();
        flattened.Should().HaveCount(62 - 12, "only the 50 non-view keys live as tree children");
        flattened.Should().OnlyHaveUniqueItems("every key appears exactly once across the tree");
        var everything = UiPermissionRegistry.Tree.Keys.Concat(flattened).ToList();
        everything.Should().BeEquivalentTo(UiPermissionRegistry.AllKeys, "tree ∪ view keys == the registry, no orphans on either side");
    }

    [Fact]
    public void Registry_FindInvalidKeys_ReportsUnknownOnly_BlanksIgnored()
    {
        var invalid = UiPermissionRegistry.FindInvalidKeys(["view:codes", "  ", "", "nope:fake", "nope:fake", "btn:codes.export", null]);
        invalid.Should().BeEquivalentTo(["nope:fake"]);
    }

    // ===== ParseStoredKeys hardening =====

    [Fact]
    public void ParseStoredKeys_Null_ReturnsNull_Unconfigured()
    {
        UiPermissionRegistry.ParseStoredKeys(null).Should().BeNull();
    }

    [Fact]
    public void ParseStoredKeys_EmptyArray_ReturnsEmpty_ConfiguredDenyAll()
    {
        UiPermissionRegistry.ParseStoredKeys("[]").Should().BeEmpty();
    }

    [Fact]
    public void ParseStoredKeys_CorruptJson_ReturnsEmpty_NeverFull()
    {
        UiPermissionRegistry.ParseStoredKeys("not json at all {{{").Should().BeEmpty();
        UiPermissionRegistry.ParseStoredKeys("   ").Should().BeEmpty();
    }

    [Fact]
    public void ParseStoredKeys_WrongShape_ReturnsEmpty_NeverFull()
    {
        UiPermissionRegistry.ParseStoredKeys("""{"allowed":true}""").Should().BeEmpty();
        UiPermissionRegistry.ParseStoredKeys("\"text\"").Should().BeEmpty();
        UiPermissionRegistry.ParseStoredKeys("null").Should().BeEmpty();
        UiPermissionRegistry.ParseStoredKeys("[42]").Should().BeEmpty();
    }

    [Fact]
    public void ParseStoredKeys_UnknownKeysDropped_SurvivorsInRegistryOrder()
    {
        var parsed = UiPermissionRegistry.ParseStoredKeys("""["btn:codes.export","view:codes","view:codes","legacy:gone"]""");
        parsed.Should().BeEquivalentTo(["view:codes", "btn:codes.export"], options => options.WithStrictOrdering());
    }

    [Fact]
    public void SerializeKeys_RegistryOrdersAndDedupes()
    {
        var serialized = UiPermissionRegistry.SerializeKeys(["btn:codes.export", "view:codes", "view:codes"]);
        serialized.Should().Be("""["view:codes","btn:codes.export"]""");
    }

    // ===== /me envelope: the directive 2.2 subject =====

    [Fact]
    public async Task GetMy_SuperAdmin_ReturnsModeSuperAdmin_AllowedEqualsAll()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var superAdmin = db.Admins.First();
        var (handler, _) = BuildHandler(db);

        var envelope = await handler.Handle(new GetMyUiPermissionsQuery(superAdmin.Id), CancellationToken.None);

        envelope.Mode.Should().Be("super_admin");
        envelope.IsSuperAdmin.Should().BeTrue();
        envelope.AllowedKeys.Should().BeEquivalentTo(UiPermissionRegistry.AllKeys, options => options.WithStrictOrdering());
        envelope.AllowedKeys.Should().HaveCount(62);
        envelope.AllowedKeys.Should().Equal(envelope.AllKeys);
    }

    [Fact]
    public async Task GetMy_UnconfiguredCustomRole_ZeroBehaviorChange_AllowedEqualsAll()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        var (handler, _) = BuildHandler(db);

        var envelope = await handler.Handle(new GetMyUiPermissionsQuery(customAdmin.Id), CancellationToken.None);

        envelope.Mode.Should().Be("unconfigured");
        envelope.IsSuperAdmin.Should().BeFalse();
        envelope.AllowedKeys.Should().HaveCount(62);
        envelope.AllowedKeys.Should().Equal(envelope.AllKeys);
    }

    [Fact]
    public async Task GetMy_ConfiguredCustomRole_ReturnsStoredKeysInRegistryOrder()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        role.SetUiPermissions(UiPermissionRegistry.SerializeKeys(["btn:codes.export", "view:codes"]));
        await db.SaveChangesAsync();
        var (handler, _) = BuildHandler(db);

        var envelope = await handler.Handle(new GetMyUiPermissionsQuery(customAdmin.Id), CancellationToken.None);

        envelope.Mode.Should().Be("custom");
        envelope.IsSuperAdmin.Should().BeFalse();
        envelope.AllKeys.Should().HaveCount(62);
        envelope.AllowedKeys.Should().Equal(["view:codes", "btn:codes.export"]);
    }

    [Fact]
    public async Task GetMy_CorruptStoredValue_NeverWidensToFull()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        // Simulate a corrupt value that slipped past the API (direct DB write):
        typeof(AdminRole).GetProperty("UiPermissions")!.SetValue(role, """{"allowed":true}""");
        await db.SaveChangesAsync();
        var (handler, _) = BuildHandler(db);

        var envelope = await handler.Handle(new GetMyUiPermissionsQuery(customAdmin.Id), CancellationToken.None);

        envelope.Mode.Should().Be("custom");
        envelope.AllowedKeys.Should().BeEmpty("a corrupt value must resolve to deny-all, never to full access");
    }

    [Fact]
    public async Task GetMy_CacheHit_ServesEnvelopeWithoutDatabase()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        var (handler, cache) = BuildHandler(db);

        var first = await handler.Handle(new GetMyUiPermissionsQuery(customAdmin.Id), CancellationToken.None);
        cache.Gets.Should().Be(1);
        cache.Sets.Should().Be(1);

        // Kill the database after priming: a cache hit must never need it again.
        db.Dispose();

        var second = await handler.Handle(new GetMyUiPermissionsQuery(customAdmin.Id), CancellationToken.None);
        second.Mode.Should().Be("unconfigured");
        second.AllowedKeys.Should().HaveCount(62);
        second.AllowedKeys.Should().Equal(second.AllKeys);
    }

    [Fact]
    public async Task GetMy_CacheGetThrows_FallsBackToDatabase_Directive22()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        var (handler, cache) = BuildHandler(db);
        cache.ThrowOnGet = true;

        // 2.2: cache failure → warning + database fallback, never a denial, never an error.
        var envelope = await handler.Handle(new GetMyUiPermissionsQuery(customAdmin.Id), CancellationToken.None);

        envelope.Mode.Should().Be("unconfigured");
        envelope.AllowedKeys.Should().HaveCount(62);
        cache.Gets.Should().Be(1);
    }

    [Fact]
    public async Task GetMy_CacheAndDatabaseBothFail_Throws503Exception_Directive22()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        var (handler, cache) = BuildHandler(db);
        cache.ThrowOnGet = true;

        // A disposed context makes every EF query throw — the database is "down".
        db.Dispose();

        var act = () => handler.Handle(new GetMyUiPermissionsQuery(customAdmin.Id), CancellationToken.None);
        var assertion = await act.Should().ThrowAsync<UiPermissionsUnavailableException>();
        assertion.Which.ErrorCode.Should().Be("UI_PERMISSIONS_UNAVAILABLE");
        assertion.Which.InnerException.Should().NotBeNull("the database failure is preserved as the inner exception");

        // 2.2: never cache errors — no SET may happen on a failed read.
        cache.Sets.Should().Be(0);
    }

    [Fact]
    public async Task GetMy_CacheSetFails_StillServesEnvelope_Directive22()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        var (handler, cache) = BuildHandler(db);
        cache.ThrowOnSet = true;

        var envelope = await handler.Handle(new GetMyUiPermissionsQuery(customAdmin.Id), CancellationToken.None);

        envelope.Mode.Should().Be("unconfigured");
        envelope.AllowedKeys.Should().HaveCount(62);
        cache.Sets.Should().Be(1);
    }

    [Fact]
    public async Task GetMy_MissingAdmin_PassesThrough404NotFound()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (handler, _) = BuildHandler(db);

        var act = () => handler.Handle(new GetMyUiPermissionsQuery(Guid.NewGuid()), CancellationToken.None);
        (await act.Should().ThrowAsync<NotFoundException>())
            .Which.ErrorCode.Should().Be("NOT_FOUND");
    }

    // ===== PUT / DELETE role lifecycle =====

    [Fact]
    public async Task PutRole_StoresRegistryOrderedDeduped()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, _) = SeedCustomRoleWithAdmin(db);
        var superAdmin = db.Admins.First();
        var (handler, _) = BuildHandler(db);

        await handler.Handle(new ReplaceRoleUiPermissionsCommand(
            superAdmin.Id, role.Id, ["btn:codes.export", "view:codes", "view:codes"]), CancellationToken.None);

        var stored = db.AdminRoles.AsNoTracking().Single(r => r.Id == role.Id);
        stored.UiPermissions.Should().Be("""["view:codes","btn:codes.export"]""");
    }

    [Fact]
    public async Task PutRole_BlankAndDuplicateEntries_AreSanitized()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, _) = SeedCustomRoleWithAdmin(db);
        var superAdmin = db.Admins.First();
        var (handler, _) = BuildHandler(db);

        await handler.Handle(new ReplaceRoleUiPermissionsCommand(
            superAdmin.Id, role.Id, ["  ", "", null, " view:codes "]), CancellationToken.None);

        var stored = db.AdminRoles.AsNoTracking().Single(r => r.Id == role.Id);
        stored.UiPermissions.Should().Be("""["view:codes"]""");
    }

    [Fact]
    public async Task PutRole_InvalidKeys_ThrowsWithOffenders()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, _) = SeedCustomRoleWithAdmin(db);
        var superAdmin = db.Admins.First();
        var (handler, _) = BuildHandler(db);

        var act = () => handler.Handle(new ReplaceRoleUiPermissionsCommand(
            superAdmin.Id, role.Id, ["view:codes", "nope:fake", "also:bad"]), CancellationToken.None);
        var assertion = await act.Should().ThrowAsync<DomainException>();
        assertion.Which.ErrorCode.Should().Be("UI_PERMISSION_INVALID_KEYS");
        assertion.Which.Message.Should().Contain("nope:fake").And.Contain("also:bad");

        var stored = db.AdminRoles.AsNoTracking().Single(r => r.Id == role.Id);
        stored.UiPermissions.Should().BeNull("a rejected PUT must not partially persist");
    }

    [Fact]
    public async Task PutRole_SystemRole_IncludingSuperAdmin_ThrowsSystemRoleReadonly()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var superRole = db.AdminRoles.Single(r => r.Name == "super_admin");
        var superAdmin = db.Admins.First();
        var (handler, _) = BuildHandler(db);

        var act = () => handler.Handle(new ReplaceRoleUiPermissionsCommand(
            superAdmin.Id, superRole.Id, ["view:codes"]), CancellationToken.None);
        (await act.Should().ThrowAsync<DomainException>())
            .Which.ErrorCode.Should().Be("SYSTEM_ROLE_READONLY");
    }

    [Fact]
    public async Task PutRole_NonSuperActor_ThrowsForbidden()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        var (handler, _) = BuildHandler(db);

        var act = () => handler.Handle(new ReplaceRoleUiPermissionsCommand(
            customAdmin.Id, role.Id, ["view:codes"]), CancellationToken.None);
        (await act.Should().ThrowAsync<ForbiddenException>())
            .Which.ErrorCode.Should().Be("FORBIDDEN");
    }

    [Fact]
    public async Task PutRole_UnknownRole_PassesThrough404NotFound()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var superAdmin = db.Admins.First();
        var (handler, _) = BuildHandler(db);

        var act = () => handler.Handle(new ReplaceRoleUiPermissionsCommand(
            superAdmin.Id, Guid.NewGuid(), ["view:codes"]), CancellationToken.None);
        (await act.Should().ThrowAsync<NotFoundException>())
            .Which.ErrorCode.Should().Be("NOT_FOUND");
    }

    [Fact]
    public async Task PutRole_AuditsPermissionChange_AndInvalidatesAssignedAdmins()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        var superAdmin = db.Admins.First();
        var audit = new Mock<ISecurityAuditWriter>();
        var (handler, cache) = BuildHandler(db, audit.Object);

        await handler.Handle(new ReplaceRoleUiPermissionsCommand(
            superAdmin.Id, role.Id, ["view:codes", "btn:codes.export"]), CancellationToken.None);

        audit.Verify(a => a.LogSecurityEventAsync(
            null, superAdmin.Id, SecurityEventType.PermissionChange, SecuritySeverity.Warning,
            It.Is<string>(description => description.Contains("replace_ui_permissions") && description.Contains($"target_role_id={role.Id}")),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);

        cache.Removed.Should().Contain($"uiperm:admin:{customAdmin.Id}",
            "the assigned admin's cached envelope must be evicted before their next /me read");
    }

    [Fact]
    public async Task DeleteRole_ResetsToUnconfigured_Audits_AndInvalidates()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, customAdmin) = SeedCustomRoleWithAdmin(db);
        var superAdmin = db.Admins.First();
        var audit = new Mock<ISecurityAuditWriter>();
        var (handler, cache) = BuildHandler(db, audit.Object);

        await handler.Handle(new ReplaceRoleUiPermissionsCommand(superAdmin.Id, role.Id, ["view:codes"]), CancellationToken.None);
        await handler.Handle(new ClearRoleUiPermissionsCommand(superAdmin.Id, role.Id), CancellationToken.None);

        var stored = db.AdminRoles.AsNoTracking().Single(r => r.Id == role.Id);
        stored.UiPermissions.Should().BeNull("DELETE resets the role to unconfigured = full access");

        audit.Verify(a => a.LogSecurityEventAsync(
            null, superAdmin.Id, SecurityEventType.PermissionChange, SecuritySeverity.Warning,
            It.Is<string>(description => description.Contains("reset_ui_permissions")),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);

        cache.Removed.Should().Contain($"uiperm:admin:{customAdmin.Id}");
    }

    [Fact]
    public async Task DeleteRole_SystemRole_ThrowsSystemRoleReadonly()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var superRole = db.AdminRoles.Single(r => r.Name == "super_admin");
        var superAdmin = db.Admins.First();
        var (handler, _) = BuildHandler(db);

        var act = () => handler.Handle(new ClearRoleUiPermissionsCommand(superAdmin.Id, superRole.Id), CancellationToken.None);
        (await act.Should().ThrowAsync<DomainException>())
            .Which.ErrorCode.Should().Be("SYSTEM_ROLE_READONLY");
    }

    [Fact]
    public async Task DeleteRole_DatabaseReadFails_Throws503()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, _) = SeedCustomRoleWithAdmin(db);
        var superAdmin = db.Admins.First();
        var (handler, _) = BuildHandler(db);
        db.Dispose();

        var act = () => handler.Handle(new ClearRoleUiPermissionsCommand(superAdmin.Id, role.Id), CancellationToken.None);
        (await act.Should().ThrowAsync<UiPermissionsUnavailableException>())
            .Which.ErrorCode.Should().Be("UI_PERMISSIONS_UNAVAILABLE");
    }

    [Fact]
    public async Task GetRole_ReflectsConfiguredState()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (role, _) = SeedCustomRoleWithAdmin(db);
        var superAdmin = db.Admins.First();
        var (handler, _) = BuildHandler(db);

        var before = await handler.Handle(new GetRoleUiPermissionsQuery(superAdmin.Id, role.Id), CancellationToken.None);
        before.Configured.Should().BeFalse();
        before.AllowedKeys.Should().BeNull();
        before.AllKeys.Should().HaveCount(62);
        before.RegistryVersion.Should().Be(UiPermissionRegistry.RegistryVersion);

        await handler.Handle(new ReplaceRoleUiPermissionsCommand(superAdmin.Id, role.Id, ["view:codes"]), CancellationToken.None);

        var after = await handler.Handle(new GetRoleUiPermissionsQuery(superAdmin.Id, role.Id), CancellationToken.None);
        after.Configured.Should().BeTrue();
        after.AllowedKeys.Should().Equal(["view:codes"]);
    }

    // ===== Middleware 503 mapping (directive 2.2 contract at the HTTP edge) =====

    [Fact]
    public async Task Middleware_MapsUiPermissionsUnavailable_To503WithErrorCode()
    {
        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new UiPermissionsUnavailableException(new InvalidOperationException("database down")),
            NullLogger<ExceptionHandlingMiddleware>.Instance);
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        await middleware.InvokeAsync(context);

        context.Response.StatusCode.Should().Be(503);
        // WriteAsJsonAsync serves application/json (pre-existing middleware behavior for
        // every mapped exception) — the contract that matters is status + errorCode.
        context.Response.ContentType.Should().Contain("application/json");
        context.Response.Body.Position = 0;
        using var document = await JsonDocument.ParseAsync(context.Response.Body);
        document.RootElement.GetProperty("status").GetInt32().Should().Be(503);
        document.RootElement.GetProperty("errorCode").GetString().Should().Be("UI_PERMISSIONS_UNAVAILABLE");
    }

    [Fact]
    public void UiPermissionsUnavailableException_DerivesFromDomainException()
    {
        var exception = new UiPermissionsUnavailableException(new InvalidOperationException("boom"));
        exception.Should().BeAssignableTo<DomainException>();
        exception.ErrorCode.Should().Be("UI_PERMISSIONS_UNAVAILABLE");
        exception.InnerException.Should().NotBeNull();
    }

    // ===== Helpers =====

    private static (UiPermissionHandlers Handler, RecordingCache Cache) BuildHandler(
        ApplicationDbContext db, ISecurityAuditWriter? audit = null)
    {
        var cache = new RecordingCache();
        var handler = new UiPermissionHandlers(
            db,
            new UnitOfWork(db),
            cache,
            audit ?? NoOpUiPermissions.AuditWriter(),
            NullLogger<UiPermissionHandlers>.Instance);
        return (handler, cache);
    }

    private static (AdminRole Role, Admin CustomAdmin) SeedCustomRoleWithAdmin(ApplicationDbContext db)
    {
        var role = AdminRole.Create("ui_viewer", "قارئ واجهة", "دور اختبار صلاحيات الواجهة");
        db.AdminRoles.Add(role);
        var admin = Admin.Create("ui-viewer@cms.example.com", "not-used", "مدير واجهة", role.Id);
        db.Admins.Add(admin);
        db.SaveChanges();
        return (role, admin);
    }

    /// <summary>
    /// InMemory cache double with failure toggles for the directive 2.2 contract tests.
    /// </summary>
    private sealed class RecordingCache : ICacheService
    {
        private readonly Dictionary<string, object?> _store = new();

        internal List<string> Removed { get; } = [];
        internal bool ThrowOnGet;
        internal bool ThrowOnSet;
        internal int Gets;
        internal int Sets;

        public Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
        {
            Gets++;
            if (ThrowOnGet) throw new InvalidOperationException("simulated cache GET outage");
            return Task.FromResult(_store.TryGetValue(key, out var value) ? (T?)value : default);
        }

        public Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default) => throw new NotSupportedException();

        public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default)
        {
            Sets++;
            if (ThrowOnSet) throw new InvalidOperationException("simulated cache SET outage");
            _store[key] = value;
            return Task.CompletedTask;
        }

        public Task<long> IncrementAsync(string key, TimeSpan? expiry = null, CancellationToken ct = default) => throw new NotSupportedException();

        public Task RemoveAsync(string key, CancellationToken ct = default)
        {
            Removed.Add(key);
            _store.Remove(key);
            return Task.CompletedTask;
        }

        public Task RemoveByPatternAsync(string pattern, CancellationToken ct = default) => Task.CompletedTask;
    }
}

/// <summary>
/// No-op audit double shared with the handler tests (parallel to NoOp.ActivityWriter).
/// </summary>
public static class NoOpUiPermissions
{
    public static ISecurityAuditWriter AuditWriter() => new NullAuditWriter();

    private sealed class NullAuditWriter : ISecurityAuditWriter
    {
        public Task LogSecurityEventAsync(
            Guid? studentId, Guid? adminId, SecurityEventType eventType, SecuritySeverity severity,
            string description, string? ipAddress = null, string? userAgent = null, string? installationId = null,
            CancellationToken ct = default) => Task.CompletedTask;
    }
}
