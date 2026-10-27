using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
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
public sealed class SecurityAuditPostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task BatchedAuditEvent_PersistsActorEventTimestampAndRedactsSensitiveValues()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the PostgreSQL audit integration test.");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString)
            .Options;
        await using var setupDb = new ApplicationDbContext(options);

        var phone = $"09{Random.Shared.Next(10_000_000, 99_999_999)}";
        var student = Student.Create(phone, "audit-test-hash", "Audit Integration Student");
        student.VerifyPhone();
        setupDb.Students.Add(student);
        await setupDb.SaveChangesAsync();

        var services = new ServiceCollection()
            .AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString))
            .BuildServiceProvider();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Device:SingleActiveDevice"] = "true",
            ["Security:Audit:BatchSize"] = "10",
            ["Security:Audit:FlushSeconds"] = "60",
            ["Security:Audit:QueueCapacity"] = "10"
        }).Build();
        var batch = new SecurityEventBatchService(
            services.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = "11111111111111111111111111111111" };
        var security = new SecurityService(setupDb, new Mock<ICacheService>().Object, batch, correlation, configuration);
        var before = DateTime.UtcNow;

        await security.LogSecurityEventAsync(
            student.Id, null, SecurityEventType.LoginSuccess, SecuritySeverity.Info,
            "refresh_token=TEST_ONLY_POSTGRES_REFRESH", "127.0.0.1", "integration-agent", "audit-installation");
        await batch.FlushAsync();

        await using var verifyDb = new ApplicationDbContext(options);
        var log = await verifyDb.SecurityLogs.AsNoTracking()
            .SingleAsync(entry => entry.StudentId == student.Id && entry.Description == "refresh_token=[REDACTED]");
        log.StudentId.Should().Be(student.Id);
        log.AdminId.Should().BeNull();
        log.EventType.Should().Be(SecurityEventType.LoginSuccess);
        log.Severity.Should().Be(SecuritySeverity.Info);
        log.Description.Should().Contain("refresh_token=[REDACTED]").And.NotContain("TEST_ONLY_POSTGRES_REFRESH");
        log.CreatedAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(DateTime.UtcNow);
        log.IpAddress!.ToString().Should().Be("127.0.0.1");
        log.CorrelationId.Should().Be(correlation.CorrelationId);
    }
}
