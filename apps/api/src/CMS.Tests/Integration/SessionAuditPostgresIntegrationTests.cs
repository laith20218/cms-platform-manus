using CMS.Application.Commands.Auth;
using CMS.Application.Handlers.Auth;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
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
public sealed class SessionAuditPostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task SessionLifecycle_PersistsActorEventsAndOneCorrelationId()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the PostgreSQL session audit integration test.");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new ApplicationDbContext(options);
        var phone = $"09{Random.Shared.Next(10_000_000, 99_999_999)}";
        var student = Student.Create(phone, "session-audit-hash", "Session Audit Student");
        student.VerifyPhone();
        db.Students.Add(student);
        await db.SaveChangesAsync();

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:RefreshTokenExpiryDays"] = "7",
            ["Security:Device:SingleActiveDevice"] = "true",
            ["Security:Audit:BatchSize"] = "10",
            ["Security:Audit:FlushSeconds"] = "60",
            ["Security:Audit:QueueCapacity"] = "20"
        }).Build();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = "33333333333333333333333333333333" };
        var security = new SecurityService(db, new Mock<ICacheService>().Object, batch, correlation, configuration);
        var tokens = new Mock<ITokenService>();
        tokens.Setup(service => service.GenerateAccessToken(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>()))
            .Returns("test-access-token");
        var sessions = new SessionService(db, tokens.Object, security, configuration);

        var issued = await sessions.CreateAsync(student.Id, student.Phone, "student", "web-1234567890abcdef1234567890abcdef", "Audit Device");
        await batch.FlushAsync();
        await new LogoutCommandHandler(sessions).Handle(new LogoutCommand(issued.SessionId), CancellationToken.None);
        await batch.FlushAsync();

        await using var verifyDb = new ApplicationDbContext(options);
        var events = await verifyDb.SecurityLogs.AsNoTracking()
            .Where(log => log.StudentId == student.Id && log.CorrelationId == correlation.CorrelationId)
            .ToListAsync();
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.SessionCreated && log.Severity == SecuritySeverity.Info);
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.LoginSuccess && log.Severity == SecuritySeverity.Info);
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.SessionRevoked && log.Severity == SecuritySeverity.Warning);
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.Logout && log.Severity == SecuritySeverity.Info);
        events.Should().OnlyContain(log => log.CreatedAt > DateTime.UtcNow.AddMinutes(-2));
        events.Select(log => log.Description.ToLowerInvariant()).Should().OnlyContain(description => !description.Contains("token") && !description.Contains("secret") && !description.Contains("password"));
    }

    [PostgresFact]
    public async Task RefreshAndReuse_RealCommandTriggersPersistActorSeverityCorrelationAndRedaction()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable)
            ?? throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the PostgreSQL session audit integration test.");
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new ApplicationDbContext(options);
        var student = Student.Create($"09{Random.Shared.Next(10_000_000, 99_999_999)}", "session-refresh-hash", "Session Refresh Student");
        student.VerifyPhone();
        db.Students.Add(student);
        await db.SaveChangesAsync();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:RefreshTokenExpiryDays"] = "7", ["Security:Device:SingleActiveDevice"] = "true",
            ["Security:Audit:BatchSize"] = "10", ["Security:Audit:FlushSeconds"] = "60", ["Security:Audit:QueueCapacity"] = "20"
        }).Build();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var security = new SecurityService(db, new Mock<ICacheService>().Object, batch, correlation, configuration);
        var tokens = new Mock<ITokenService>();
        tokens.Setup(service => service.GenerateAccessToken(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>())).Returns("test-access-token");
        var sessions = new SessionService(db, tokens.Object, security, configuration);
        const string installation = "web-1234567890abcdef1234567890abcdef";
        var issued = await sessions.CreateAsync(student.Id, student.Phone, "student", installation, "Refresh Audit Device");
        var refresh = new RefreshTokenCommandHandler(sessions);

        var rotated = await refresh.Handle(new RefreshTokenCommand(issued.RefreshToken, installation), CancellationToken.None);
        rotated.RefreshToken.Should().NotBe(issued.RefreshToken);
        var reuse = () => refresh.Handle(new RefreshTokenCommand(issued.RefreshToken, installation), CancellationToken.None);
        await reuse.Should().ThrowAsync<UnauthorizedAccessException>();
        await batch.FlushAsync();

        await using var verifyDb = new ApplicationDbContext(options);
        var events = await verifyDb.SecurityLogs.AsNoTracking().Where(log => log.StudentId == student.Id && log.CorrelationId == correlation.CorrelationId &&
            (log.EventType == SecurityEventType.Refresh || log.EventType == SecurityEventType.RefreshReuse)).ToListAsync();
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.Refresh && log.Severity == SecuritySeverity.Info);
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.RefreshReuse && log.Severity == SecuritySeverity.Critical);
        events.Should().OnlyContain(log => log.CreatedAt > DateTime.UtcNow.AddMinutes(-2));
        events.Select(log => log.Description).Should().OnlyContain(description => !description.Contains(issued.RefreshToken, StringComparison.Ordinal));
    }
}
