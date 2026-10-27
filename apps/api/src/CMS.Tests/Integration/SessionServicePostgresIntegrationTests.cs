using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Security;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;

using CMS.Tests.Infrastructure;

namespace CMS.Tests.Integration;

[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public class SessionServicePostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task SessionLifecycle_RotationReuseAndRevocation_AreEnforcedByPostgres()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                $"BLOCKED: set {ConnectionVariable} to run the PostgreSQL session lifecycle integration test.");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        await using var db = new ApplicationDbContext(options);
        await db.Database.ExecuteSqlRawAsync("TRUNCATE TABLE security_logs, user_sessions, user_installations, device_bindings, students CASCADE;");

        var tokenService = new Mock<ITokenService>();
        tokenService.Setup(t => t.GenerateAccessToken(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>()))
            .Returns("test-access-token");
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:RefreshTokenExpiryDays"] = "7",
                ["Security:Device:SingleActiveDevice"] = "true"
            })
            .Build();
        var cache = new Mock<ICacheService>();
        var auditBatch = new Mock<ISecurityEventBatch>();
        var securityService = new SecurityService(db, cache.Object, auditBatch.Object, new CorrelationContext(), configuration);
        var service = new SessionService(db, tokenService.Object, securityService, configuration);
        var student = Student.Create("0995550000", "legacy-hash", "Integration Student");
        student.VerifyPhone();
        db.Students.Add(student);
        await db.SaveChangesAsync();
        var userId = student.Id;
        const string installationId = "integration-installation-00000001";

        var initial = await service.CreateAsync(userId, "student-subject", "student", installationId, "Integration device");
        var storedInitial = await db.UserSessions.SingleAsync(s => s.Id == initial.SessionId);
        storedInitial.RefreshTokenHash.Should().NotBe(initial.RefreshToken);
        (await service.IsActiveAsync(initial.SessionId, 1, installationId)).Should().BeTrue();

        var rotated = await service.RotateAsync(initial.RefreshToken, installationId);
        rotated.Should().NotBeNull();
        rotated!.RefreshToken.Should().NotBe(initial.RefreshToken);
        (await service.IsActiveAsync(initial.SessionId, 1, installationId)).Should().BeTrue();

        var replay = await service.RotateAsync(initial.RefreshToken, installationId);
        replay.Should().BeNull();
        var family = await db.UserSessions.AsNoTracking()
            .Where(s => s.FamilyId == storedInitial.FamilyId)
            .ToListAsync();
        family.Should().HaveCount(2);
        family.Should().OnlyContain(s => s.Status == SessionStatus.Revoked && s.RevocationReason == "refresh_token_reuse");
        (await service.IsActiveAsync(rotated.SessionId, 1, installationId)).Should().BeFalse();

        var explicitSession = await service.CreateAsync(userId, "student-subject", "student", installationId, "Integration device");
        await service.RevokeAsync(explicitSession.SessionId, "logout");
        (await service.IsActiveAsync(explicitSession.SessionId, 1, installationId)).Should().BeFalse();
    }

    [PostgresFact]
    public async Task SessionLifecycle_ExpiredRefreshToken_IsRejectedByPostgres()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the PostgreSQL session lifecycle integration test.");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        await using var db = new ApplicationDbContext(options);
        await db.Database.ExecuteSqlRawAsync("TRUNCATE TABLE security_logs, user_sessions, user_installations, device_bindings, students CASCADE;");

        var tokenService = new Mock<ITokenService>();
        tokenService.Setup(t => t.GenerateAccessToken(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>()))
            .Returns("test-access-token");
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:RefreshTokenExpiryDays"] = "7",
                ["Security:Device:SingleActiveDevice"] = "true"
            })
            .Build();
        var cache = new Mock<ICacheService>();
        var auditBatch = new Mock<ISecurityEventBatch>();
        var securityService = new SecurityService(db, cache.Object, auditBatch.Object, new CorrelationContext(), configuration);
        var service = new SessionService(db, tokenService.Object, securityService, configuration);
        var student = Student.Create("0995550001", "legacy-hash", "Expired Integration Student");
        student.VerifyPhone();
        db.Students.Add(student);
        await db.SaveChangesAsync();
        const string installationId = "integration-installation-00000002";

        var session = await service.CreateAsync(student.Id, "student-subject", "student", installationId, "Integration device");
        var persisted = await db.UserSessions.SingleAsync(s => s.Id == session.SessionId);
        persisted.RefreshTokenExpiresAt = DateTime.UtcNow.AddSeconds(-1);
        await db.SaveChangesAsync();

        (await service.RotateAsync(session.RefreshToken, installationId)).Should().BeNull();
        (await service.IsActiveAsync(session.SessionId, persisted.TokenVersion, installationId)).Should().BeFalse();
    }

    [PostgresFact]
    public async Task SuperAdminSession_DoesNotCreateOrRequireAStudentDeviceBinding()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                $"BLOCKED: set {ConnectionVariable} to run the PostgreSQL session lifecycle integration test.");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        await using var db = new ApplicationDbContext(options);
        await db.Database.ExecuteSqlRawAsync("TRUNCATE TABLE security_logs, user_sessions, user_installations, device_bindings, students CASCADE;");

        var tokenService = new Mock<ITokenService>();
        tokenService.Setup(t => t.GenerateAccessToken(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>()))
            .Returns("test-access-token");
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:RefreshTokenExpiryDays"] = "7",
                ["Security:Device:SingleActiveDevice"] = "true"
            })
            .Build();
        var cache = new Mock<ICacheService>();
        var auditBatch = new Mock<ISecurityEventBatch>();
        var securityService = new SecurityService(db, cache.Object, auditBatch.Object, new CorrelationContext(), configuration);
        var service = new SessionService(db, tokenService.Object, securityService, configuration);
        // The session must reference a real admin account: IsActiveAsync additionally verifies
        // that the admin and its role are still active on every request (ADMIN-01 / FIX-9).
        var superRole = AdminRole.Create("super_admin", "مدير عام");
        var superAdmin = Admin.Create("super-admin@example.test", "not-used", "Super Admin", superRole.Id);
        db.AdminRoles.Add(superRole);
        db.Admins.Add(superAdmin);
        await db.SaveChangesAsync();
        var administratorId = superAdmin.Id;
        const string installationId = "super-admin-installation-00000001";

        var initial = await service.CreateAsync(
            administratorId,
            "super-admin@example.test",
            "super_admin",
            installationId,
            "Admin Web");

        (await db.DeviceBindings.CountAsync()).Should().Be(0);
        (await service.IsActiveAsync(initial.SessionId, 1, installationId)).Should().BeTrue();

        var rotated = await service.RotateAsync(initial.RefreshToken, installationId);
        rotated.Should().NotBeNull();
        (await service.IsActiveAsync(rotated!.SessionId, 1, installationId)).Should().BeTrue();
    }

    // ===== Push 2 / Track 2: activity-monitor enrichment + throttled heartbeat =====

    [PostgresFact]
    public async Task CreateAsync_WithIpAddressAndUserAgent_PersistsSessionEnrichment()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                $"BLOCKED: set {ConnectionVariable} to run the PostgreSQL session lifecycle integration test.");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        await using var db = new ApplicationDbContext(options);
        await db.Database.ExecuteSqlRawAsync("TRUNCATE TABLE security_logs, user_sessions, user_installations, device_bindings, students CASCADE;");

        var tokenService = new Mock<ITokenService>();
        tokenService.Setup(t => t.GenerateAccessToken(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>()))
            .Returns("test-access-token");
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:RefreshTokenExpiryDays"] = "7",
                ["Security:Device:SingleActiveDevice"] = "true"
            })
            .Build();
        var cache = new Mock<ICacheService>();
        var auditBatch = new Mock<ISecurityEventBatch>();
        var securityService = new SecurityService(db, cache.Object, auditBatch.Object, new CorrelationContext(), configuration);
        var service = new SessionService(db, tokenService.Object, securityService, configuration);
        var adminRole = AdminRole.Create("super_admin", "مدير عام");
        var admin = Admin.Create("enrichment@example.test", "not-used", "Enrichment Admin", adminRole.Id);
        db.AdminRoles.Add(adminRole);
        db.Admins.Add(admin);
        await db.SaveChangesAsync();

        var userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        var issued = await service.CreateAsync(
            admin.Id, "enrichment@example.test", "super_admin", "enrichment-installation-01", "Admin Web",
            CancellationToken.None,
            ipAddress: "203.0.113.42", userAgent: userAgent);

        var stored = await db.UserSessions.AsNoTracking().SingleAsync(s => s.Id == issued.SessionId);
        stored.IpAddress.Should().Be("203.0.113.42");
        stored.UserAgent.Should().Be(userAgent);
        stored.DeviceDetails.Should().NotBeNull();
        stored.DeviceDetails.Should().Contain("Chrome");
        stored.DeviceDetails.Should().Contain("Windows");
        stored.DeviceDetails.Should().Contain("desktop");
        stored.ClosedAt.Should().BeNull();

        // Student path (no IP/UA passed) keeps enrichment null — login behavior unchanged.
        var student = Student.Create("0995550111", "legacy-hash", "Student No Context");
        student.VerifyPhone();
        db.Students.Add(student);
        await db.SaveChangesAsync();
        var studentSession = await service.CreateAsync(
            student.Id, student.Phone, "student", "enrichment-installation-02", "Student device");
        var storedStudent = await db.UserSessions.AsNoTracking().SingleAsync(s => s.Id == studentSession.SessionId);
        storedStudent.IpAddress.Should().BeNull();
        storedStudent.UserAgent.Should().BeNull();
        storedStudent.DeviceDetails.Should().BeNull();
    }

    [PostgresFact]
    public async Task TouchActivityAsync_RefreshesOnlyWhenOlderThanThrottleWindow()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                $"BLOCKED: set {ConnectionVariable} to run the PostgreSQL session lifecycle integration test.");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        await using var db = new ApplicationDbContext(options);
        await db.Database.ExecuteSqlRawAsync("TRUNCATE TABLE security_logs, user_sessions, user_installations, device_bindings, students CASCADE;");

        var stale = new UserSession
        {
            UserId = Guid.NewGuid(),
            Role = "super_admin",
            InstallationId = "touch-installation-0000000001",
            FamilyId = Guid.NewGuid(),
            RefreshTokenHash = $"hash-{Guid.NewGuid():N}",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(1),
            LastActivityAt = DateTime.UtcNow.AddMinutes(-2)
        };
        var fresh = new UserSession
        {
            UserId = Guid.NewGuid(),
            Role = "super_admin",
            InstallationId = "touch-installation-0000000002",
            FamilyId = Guid.NewGuid(),
            RefreshTokenHash = $"hash-{Guid.NewGuid():N}",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(1),
            LastActivityAt = DateTime.UtcNow
        };
        db.UserSessions.AddRange(stale, fresh);
        await db.SaveChangesAsync();

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:RefreshTokenExpiryDays"] = "7"
        }).Build();
        var tokenService = new Mock<ITokenService>();
        var cache = new Mock<ICacheService>();
        var auditBatch = new Mock<ISecurityEventBatch>();
        var securityService = new SecurityService(db, cache.Object, auditBatch.Object, new CorrelationContext(), configuration);
        var service = new SessionService(db, tokenService.Object, securityService, configuration);

        await service.TouchActivityAsync(stale.Id);
        await service.TouchActivityAsync(fresh.Id);

        var seededFreshAt = fresh.LastActivityAt; // captured before the touch calls
        var touchedStale = await db.UserSessions.AsNoTracking().SingleAsync(s => s.Id == stale.Id);
        touchedStale.LastActivityAt.Should().BeAfter(DateTime.UtcNow.AddSeconds(-5),
            "a LastActivityAt older than the 60s throttle window must be refreshed");
        var untouchedFresh = await db.UserSessions.AsNoTracking().SingleAsync(s => s.Id == fresh.Id);
        // timestamptz round-trips at microsecond precision, so allow a tiny tolerance —
        // a real heartbeat rewrite would move the value by whole seconds, far outside it.
        untouchedFresh.LastActivityAt.Should().BeCloseTo(seededFreshAt, TimeSpan.FromMilliseconds(50),
            "a LastActivityAt inside the 60s throttle window must NOT be rewritten by the throttled heartbeat");
    }
}
