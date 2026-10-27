using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

using CMS.Tests.Infrastructure;

namespace CMS.Tests.Integration;

[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class SecurityAuditRetentionPostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task Retention_DeletesOnlyAuditEventsOlderThanConfiguredWindow()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the PostgreSQL audit retention integration test.");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new ApplicationDbContext(options);
        var marker = Guid.NewGuid().ToString("N");
        var now = DateTime.UtcNow;
        var oldLog = new SecurityLog
        {
            EventType = SecurityEventType.LoginFailed,
            Severity = SecuritySeverity.Warning,
            Description = $"retention-old-{marker}",
            CorrelationId = marker
        };
        var recentLog = new SecurityLog
        {
            EventType = SecurityEventType.LoginSuccess,
            Severity = SecuritySeverity.Info,
            Description = $"retention-recent-{marker}",
            CorrelationId = marker
        };
        db.SecurityLogs.AddRange(oldLog, recentLog);
        await db.SaveChangesAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE security_logs SET created_at = {now.AddDays(-366)} WHERE id = {oldLog.Id}");
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE security_logs SET created_at = {now.AddDays(-30)} WHERE id = {recentLog.Id}");
        db.ChangeTracker.Clear();

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Audit:RetentionDays"] = "365"
        }).Build();
        var service = new SecurityAuditRetentionService(db, configuration);
        var result = await service.RunOnceAsync();

        result.CutoffUtc.Should().BeCloseTo(now.AddDays(-365), TimeSpan.FromMinutes(1));
        result.DeletedCount.Should().BeGreaterThan(0);
        (await db.SecurityLogs.AnyAsync(log => log.Id == oldLog.Id)).Should().BeFalse();
        (await db.SecurityLogs.AnyAsync(log => log.Id == recentLog.Id)).Should().BeTrue();
    }
}
