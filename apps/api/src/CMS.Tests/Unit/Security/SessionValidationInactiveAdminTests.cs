using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Security;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CMS.Tests.Unit.Security;

/// <summary>
/// ADMIN-01 — Verifies that SessionService.IsActiveAsync rejects an admin whose role has been
/// deactivated, or whose Admin.Status is not Active, even if the JWT has not yet expired.
/// Student sessions must remain unaffected by this admin-specific check.
/// </summary>
public sealed class SessionValidationInactiveAdminTests
{
    private static ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        var db = new ApplicationDbContext(options);
        TestDbHelper.SeedTestData(db);
        return db;
    }

    private static (AdminRole activeRole, AdminRole inactiveRole, Admin activeAdmin, Admin inactiveRoleAdmin, Admin suspendedAdmin) SeedAdminScenarios(ApplicationDbContext db)
    {
        var activeRole = AdminRole.Create("content_admin", "مدير محتوى", "content", false);
        var inactiveRole = AdminRole.Create("retired_admin", "دور متقاعد", "retired", false);
        inactiveRole.SetActive(false);
        db.AdminRoles.AddRange(activeRole, inactiveRole);

        var activeAdmin = Admin.Create("active@cms.example.com", "hash-active", "Active Admin", activeRole.Id);
        var inactiveRoleAdmin = Admin.Create("role-inactive@cms.example.com", "hash-role-inactive", "Inactive Role Admin", inactiveRole.Id);
        var suspendedAdmin = Admin.Create("suspended@cms.example.com", "hash-suspended", "Suspended Admin", activeRole.Id);
        suspendedAdmin.SetStatus(AdminStatus.Suspended);
        db.Admins.AddRange(activeAdmin, inactiveRoleAdmin, suspendedAdmin);
        db.SaveChanges();
        return (activeRole, inactiveRole, activeAdmin, inactiveRoleAdmin, suspendedAdmin);
    }

    private static UserSession CreateAdminSession(Admin admin, string role) => new()
    {
        UserId = admin.Id,
        Role = role,
        InstallationId = "admin-web-installation",
        FamilyId = Guid.NewGuid(),
        RefreshTokenHash = "hash",
        RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(7),
        LastActivityAt = DateTime.UtcNow,
        TokenVersion = 1,
        Status = SessionStatus.Active
    };

    private static SessionService BuildSessionService(ApplicationDbContext db)
    {
        var tokenService = new MockTokenService();
        var cache = new MockCache();
        var batch = new NoopBatch();
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var securityService = new SecurityService(db, cache, batch, correlation, new ConfigurationBuilder().Build());
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:RefreshTokenExpiryDays"] = "7"
        }).Build();
        return new SessionService(db, tokenService, securityService, cfg);
    }

    private sealed class MockTokenService : CMS.Application.Interfaces.ITokenService
    {
        public string GenerateAccessToken(Guid userId, string subject, string role, Guid sessionId, string installationId, int tokenVersion) => "access";
        public bool ValidateToken(string token) => true;
    }

    private sealed class MockCache : CMS.Application.Interfaces.ICacheService
    {
        public Task<T?> GetAsync<T>(string key, CancellationToken ct = default) => Task.FromResult<T?>(default);
        public Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default) => Task.FromResult<T?>(default);
        public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default) => Task.CompletedTask;
        public Task RemoveAsync(string key, CancellationToken ct = default) => Task.CompletedTask;
        public Task RemoveByPatternAsync(string pattern, CancellationToken ct = default) => Task.CompletedTask;
        public Task<long> IncrementAsync(string key, TimeSpan? expiry = null, CancellationToken ct = default) => Task.FromResult(0L);
        public Task<bool> PingAsync(CancellationToken ct = default) => Task.FromResult(true);
    }

    private sealed class NoopBatch : CMS.Application.Interfaces.ISecurityEventBatch
    {
        public ValueTask EnqueueAsync(CMS.Application.Interfaces.SecurityEventWrite securityEvent, CancellationToken ct = default) => default;
        public Task FlushAsync(CancellationToken ct = default) => Task.CompletedTask;
    }

    [Fact]
    public async Task IsActiveAsync_AllowsActiveAdminSession()
    {
        using var db = CreateContext();
        var (_, _, activeAdmin, _, _) = SeedAdminScenarios(db);
        var session = CreateAdminSession(activeAdmin, "admin");
        db.UserSessions.Add(session);
        await db.SaveChangesAsync();

        var svc = BuildSessionService(db);
        var result = await svc.IsActiveAsync(session.Id, session.TokenVersion, session.InstallationId);

        result.Should().BeTrue();
    }

    [Fact]
    public async Task IsActiveAsync_RejectsAdminWhoseRoleIsInactive()
    {
        using var db = CreateContext();
        var (_, _, _, inactiveRoleAdmin, _) = SeedAdminScenarios(db);
        var session = CreateAdminSession(inactiveRoleAdmin, "admin");
        db.UserSessions.Add(session);
        await db.SaveChangesAsync();

        var svc = BuildSessionService(db);
        var result = await svc.IsActiveAsync(session.Id, session.TokenVersion, session.InstallationId);

        result.Should().BeFalse("an admin whose role has been deactivated must not keep using an old access token");
    }

    [Fact]
    public async Task IsActiveAsync_RejectsSuspendedAdminEvenWhenRoleIsActive()
    {
        using var db = CreateContext();
        var (_, _, _, _, suspendedAdmin) = SeedAdminScenarios(db);
        var session = CreateAdminSession(suspendedAdmin, "admin");
        db.UserSessions.Add(session);
        await db.SaveChangesAsync();

        var svc = BuildSessionService(db);
        var result = await svc.IsActiveAsync(session.Id, session.TokenVersion, session.InstallationId);

        result.Should().BeFalse("a suspended admin account must not keep using an old access token");
    }

    [Fact]
    public async Task IsActiveAsync_StudentSessionIsNotAffectedByAdminRoleCheck()
    {
        using var db = CreateContext();
        var student = TestDbHelper.GetTestStudent(db);

        db.DeviceBindings.Add(new DeviceBinding
        {
            StudentId = student.Id,
            DeviceFingerprint = "student-installation",
            IsActive = true
        });
        var session = new UserSession
        {
            UserId = student.Id,
            Role = "student",
            InstallationId = "student-installation",
            FamilyId = Guid.NewGuid(),
            RefreshTokenHash = "hash",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(7),
            LastActivityAt = DateTime.UtcNow,
            TokenVersion = 1,
            Status = SessionStatus.Active
        };
        db.UserSessions.Add(session);
        await db.SaveChangesAsync();

        var svc = BuildSessionService(db);
        var result = await svc.IsActiveAsync(session.Id, session.TokenVersion, session.InstallationId);

        result.Should().BeTrue();
    }

    [Fact]
    public async Task IsActiveAsync_SuperAdminIsAlsoBoundByRoleIsActive()
    {
        using var db = CreateContext();
        var (_, _, _, inactiveRoleAdmin, _) = SeedAdminScenarios(db);
        var session = CreateAdminSession(inactiveRoleAdmin, "super_admin");
        db.UserSessions.Add(session);
        await db.SaveChangesAsync();

        var svc = BuildSessionService(db);
        var result = await svc.IsActiveAsync(session.Id, session.TokenVersion, session.InstallationId);

        result.Should().BeFalse("super_admin tokens must also be rejected when the underlying role is inactive");
    }

    // ===== FIX-9: custom (non-built-in) admin roles are session-validated too =====

    [Fact]
    public async Task IsActiveAsync_CustomRoleAdminWithActiveAccountAndRole_IsAllowed()
    {
        using var db = CreateContext();
        var (activeRole, _, activeAdmin, _, _) = SeedAdminScenarios(db);
        // The session stores the persisted role NAME, not a built-in constant.
        var session = CreateAdminSession(activeAdmin, activeRole.Name);
        db.UserSessions.Add(session);
        await db.SaveChangesAsync();

        var svc = BuildSessionService(db);
        var result = await svc.IsActiveAsync(session.Id, session.TokenVersion, session.InstallationId);

        result.Should().BeTrue("a custom-role admin with an active account and role must pass session validation");
    }

    [Fact]
    public async Task IsActiveAsync_CustomRoleAdminWhoseRoleIsInactive_IsRejected()
    {
        using var db = CreateContext();
        var (_, inactiveRole, _, inactiveRoleAdmin, _) = SeedAdminScenarios(db);
        var session = CreateAdminSession(inactiveRoleAdmin, inactiveRole.Name);
        db.UserSessions.Add(session);
        await db.SaveChangesAsync();

        var svc = BuildSessionService(db);
        var result = await svc.IsActiveAsync(session.Id, session.TokenVersion, session.InstallationId);

        result.Should().BeFalse("a custom-role admin whose role was deactivated must not keep using an old access token");
    }

    [Fact]
    public async Task IsActiveAsync_CustomRoleSuspendedAdmin_IsRejected()
    {
        using var db = CreateContext();
        var (activeRole, _, _, _, suspendedAdmin) = SeedAdminScenarios(db);
        var session = CreateAdminSession(suspendedAdmin, activeRole.Name);
        db.UserSessions.Add(session);
        await db.SaveChangesAsync();

        var svc = BuildSessionService(db);
        var result = await svc.IsActiveAsync(session.Id, session.TokenVersion, session.InstallationId);

        result.Should().BeFalse("a suspended custom-role admin must not keep using an old access token");
    }

    [Fact]
    public async Task IsActiveAsync_NonStudentIdentityThatIsNotAnAdmin_IsRejected()
    {
        using var db = CreateContext();
        var stranger = Student.Create("0999998888", "hash-stranger", "غير مدير");
        stranger.VerifyPhone();
        db.Students.Add(stranger);
        // A session claiming a non-student role for a user with no Admin row must be
        // rejected (fail-closed) instead of silently remaining valid.
        var session = new UserSession
        {
            UserId = stranger.Id,
            Role = "mystery-role",
            InstallationId = "mystery-installation",
            FamilyId = Guid.NewGuid(),
            RefreshTokenHash = "hash",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(7),
            LastActivityAt = DateTime.UtcNow,
            TokenVersion = 1,
            Status = SessionStatus.Active
        };
        db.UserSessions.Add(session);
        await db.SaveChangesAsync();

        var svc = BuildSessionService(db);
        var result = await svc.IsActiveAsync(session.Id, session.TokenVersion, session.InstallationId);

        result.Should().BeFalse("a non-student session whose user is not an admin must fail closed");
    }
}
