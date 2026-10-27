using CMS.Application.Commands.Admin;
using CMS.Application.Commands.Dashboard;
using CMS.Application.Commands.Subscriptions;
using CMS.Application.Handlers.Admin;
using CMS.Application.Handlers.Dashboard;
using CMS.Application.Handlers.Subscriptions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Security;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

using CMS.Tests.Infrastructure;

namespace CMS.Tests.Integration;

[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class Phase44ProducerMatrixPostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task RolePermissionAndSubscriptionChanges_PersistActorTargetSeverityAndCorrelation()
    {
        var connectionString = RequireConnectionString();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new ApplicationDbContext(options);
        var suffix = Guid.NewGuid().ToString("N")[..10];
        var superRole = await db.AdminRoles.FirstOrDefaultAsync(role => role.Name == Roles.SuperAdmin);
        if (superRole is null)
        {
            superRole = AdminRole.Create(Roles.SuperAdmin, "مدير أعلى", isSystem: true);
            db.AdminRoles.Add(superRole);
            await db.SaveChangesAsync();
        }
        var targetRole = AdminRole.Create($"audited_role_{suffix}", "دور مدقق");
        var assignedRole = AdminRole.Create($"assigned_role_{suffix}", "دور معين");
        var permissionRole = AdminRole.Create($"permission_role_{suffix}", "دور صلاحيات");
        db.AdminRoles.AddRange(targetRole, assignedRole, permissionRole);
        await db.SaveChangesAsync();

        var actor = Admin.Create($"actor-{suffix}@test.local", "hash", "Audit Actor", superRole.Id);
        var targetAdmin = Admin.Create($"target-{suffix}@test.local", "hash", "Audit Target", targetRole.Id);
        var phone = $"09{Random.Shared.Next(10_000_000, 99_999_999)}";
        var student = Student.Create(phone, "audit-student-hash", "Subscription Audit Student");
        student.VerifyPhone();
        var batchRecord = new CodeBatch
        {
            Name = $"audit-batch-{suffix}", Quantity = 1, ScopeType = "university", ScopeUniversityId = Guid.NewGuid(),
            DurationDays = 30, CreatedBy = actor.Id
        };
        db.Admins.AddRange(actor, targetAdmin);
        db.Students.Add(student);
        db.CodeBatches.Add(batchRecord);
        await db.SaveChangesAsync();
        var code = new SubscriptionCode
        {
            Code = $"AUDIT{suffix.ToUpperInvariant()}", BatchId = batchRecord.Id, ScopeType = SubscriptionScopeType.University,
            ScopeUniversityId = batchRecord.ScopeUniversityId, DurationDays = 30, Status = CodeStatus.Active, CreatedBy = actor.Id
        };
        db.SubscriptionCodes.Add(code);
        await db.SaveChangesAsync();

        var configuration = AuditConfiguration();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var cache = new Mock<ICacheService>();
        var audit = new SecurityService(db, cache.Object, batch, correlation, configuration);
        using var unitOfWork = new UnitOfWork(db);
        var permissions = new PermissionService(db, cache.Object);
        var roleHandlers = new RoleAdministrationHandlers(db, unitOfWork, permissions, audit);
        var subscriptionHandlers = new SubscriptionHandlers(db, unitOfWork, permissions, audit);
        var adminHandlers = new AdminManagementHandlers(db, unitOfWork, permissions, audit, NoOp.ActivityWriter());

        await roleHandlers.Handle(new AssignAdminRoleCommand(actor.Id, targetAdmin.Id, assignedRole.Id), CancellationToken.None);
        await roleHandlers.Handle(new ReplaceRolePermissionsCommand(actor.Id, permissionRole.Id,
            [new RolePermissionGrant(Resources.Questions, [Actions.View], "scoped")]), CancellationToken.None);
        var redemption = await subscriptionHandlers.Handle(new RedeemSubscriptionCodeCommand(student.Id, code.Code), CancellationToken.None);
        await subscriptionHandlers.Handle(new RevokeStudentSubscriptionCommand(actor.Id, redemption.SubscriptionId, "test_revocation"), CancellationToken.None);
        await adminHandlers.Handle(new BanStudentCommand(student.Id, "audit_ban", null, actor.Id), CancellationToken.None);

        await using var verifyDb = new ApplicationDbContext(options);
        var events = await verifyDb.SecurityLogs.AsNoTracking()
            .Where(log => log.CorrelationId == correlation.CorrelationId)
            .OrderBy(log => log.CreatedAt)
            .ToListAsync();
        events.Should().Contain(log => log.EventType == SecurityEventType.RoleChange && log.AdminId == actor.Id && log.Description.Contains(targetAdmin.Id.ToString()));
        events.Should().Contain(log => log.EventType == SecurityEventType.PermissionChange && log.AdminId == actor.Id && log.Description.Contains(permissionRole.Id.ToString()));
        events.Should().Contain(log => log.EventType == SecurityEventType.SubscriptionActivated && log.StudentId == student.Id && log.Description.Contains(redemption.SubscriptionId.ToString()));
        events.Should().Contain(log => log.EventType == SecurityEventType.SubscriptionRevoked && log.StudentId == student.Id && log.AdminId == actor.Id && log.Description.Contains(redemption.SubscriptionId.ToString()));
        events.Should().Contain(log => log.EventType == SecurityEventType.AdminAction && log.StudentId == student.Id && log.AdminId == actor.Id && log.Description == "action=ban_student");
        events.Should().OnlyContain(log => log.Severity == SecuritySeverity.Warning);
        events.Should().OnlyContain(log => log.CreatedAt > DateTime.UtcNow.AddMinutes(-2));
    }

    [PostgresFact]
    public async Task SuspiciousActivityThreshold_PersistsCriticalSecurityAlertWithCorrelation()
    {
        var connectionString = RequireConnectionString();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new ApplicationDbContext(options);
        var phone = $"09{Random.Shared.Next(10_000_000, 99_999_999)}";
        var student = Student.Create(phone, "security-alert-hash", "Security Alert Student");
        student.VerifyPhone();
        db.Students.Add(student);
        await db.SaveChangesAsync();
        for (var attempt = 0; attempt < 5; attempt++)
        {
            db.SecurityLogs.Add(new SecurityLog
            {
                StudentId = student.Id,
                EventType = SecurityEventType.LoginFailed,
                Severity = SecuritySeverity.Warning,
                Description = $"failed_login_{attempt}",
                CorrelationId = Guid.NewGuid().ToString("N")
            });
        }
        await db.SaveChangesAsync();

        var configuration = AuditConfiguration();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var service = new SecurityService(db, new Mock<ICacheService>().Object, batch, correlation, configuration);

        var result = await service.CheckSuspiciousActivityAsync(student.Id, "127.0.0.1");
        result.IsSuspicious.Should().BeTrue();
        result.Reason.Should().Contain("failed login");

        await using var verifyDb = new ApplicationDbContext(options);
        var alert = await verifyDb.SecurityLogs.AsNoTracking().SingleAsync(log =>
            log.StudentId == student.Id && log.EventType == SecurityEventType.SecurityAlert && log.CorrelationId == correlation.CorrelationId);
        alert.Severity.Should().Be(SecuritySeverity.Critical);
        alert.IpAddress!.ToString().Should().Be("127.0.0.1");
        alert.CreatedAt.Should().BeOnOrAfter(DateTime.UtcNow.AddMinutes(-2));
    }

    [PostgresFact]
    public async Task EnableAndFailedMfa_RealAdminTriggersPersistSafeAuditEvents()
    {
        var connectionString = RequireConnectionString();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new ApplicationDbContext(options);
        var suffix = Guid.NewGuid().ToString("N")[..10];
        var role = await db.AdminRoles.FirstOrDefaultAsync(candidate => candidate.Name == Roles.SuperAdmin);
        if (role is null)
        {
            role = AdminRole.Create(Roles.SuperAdmin, "مدير أعلى", isSystem: true);
            db.AdminRoles.Add(role);
            await db.SaveChangesAsync();
        }
        var password = "Phase44Mfa!2026";
        var hasher = new PasswordHasher();
        var admin = Admin.Create($"mfa-{suffix}@test.local", hasher.HashPassword(password), "MFA Audit Admin", role.Id);
        db.Admins.Add(admin);
        await db.SaveChangesAsync();

        var configuration = AuditConfiguration();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var cache = new Mock<ICacheService>();
        cache.Setup(service => service.GetAsync<bool?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((bool?)null);
        var audit = new SecurityService(db, cache.Object, batch, correlation, configuration);
        using var unitOfWork = new UnitOfWork(db);
        var enableHandler = new Enable2FACommandHandler(db, unitOfWork, audit);
        var loginHandler = new AdminLoginCommandHandler(db, hasher, new Mock<ISessionService>().Object, cache.Object, unitOfWork, audit);

        await enableHandler.Handle(new Enable2FACommand(admin.Id), CancellationToken.None);
        var invalidLogin = () => loginHandler.Handle(new AdminLoginCommand(admin.Email, password, "000000", "phase44-mfa-installation"), CancellationToken.None);
        await invalidLogin.Should().ThrowAsync<CMS.Domain.Exceptions.DomainException>();

        await using var verifyDb = new ApplicationDbContext(options);
        var events = await verifyDb.SecurityLogs.AsNoTracking()
            .Where(log => log.AdminId == admin.Id && log.CorrelationId == correlation.CorrelationId &&
                (log.EventType == SecurityEventType.MfaEnabled || log.EventType == SecurityEventType.MfaFailed))
            .OrderBy(log => log.CreatedAt)
            .ToListAsync();
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.MfaEnabled && log.Severity == SecuritySeverity.Warning);
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.MfaFailed && log.Severity == SecuritySeverity.Warning);
        events.Should().OnlyContain(log => log.CreatedAt > DateTime.UtcNow.AddMinutes(-2));
        events.Select(log => log.Description).Should().OnlyContain(description =>
            !description.Contains("000000", StringComparison.Ordinal) &&
            !description.Contains("password", StringComparison.OrdinalIgnoreCase) &&
            !description.Contains("secret", StringComparison.OrdinalIgnoreCase) &&
            !description.Contains("recovery", StringComparison.OrdinalIgnoreCase));
    }

    private static string RequireConnectionString() =>
        Environment.GetEnvironmentVariable(ConnectionVariable)
        ?? throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the PostgreSQL producer-matrix integration test.");

    private static IConfiguration AuditConfiguration() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Security:Device:SingleActiveDevice"] = "true",
        ["Security:Audit:BatchSize"] = "10",
        ["Security:Audit:FlushSeconds"] = "60",
        ["Security:Audit:QueueCapacity"] = "20"
    }).Build();
}
