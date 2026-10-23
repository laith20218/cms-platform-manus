using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Security;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;

namespace CMS.Tests.Integration;

[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public class SessionServicePostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [Fact]
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

    [Fact]
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

    [Fact]
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
}
