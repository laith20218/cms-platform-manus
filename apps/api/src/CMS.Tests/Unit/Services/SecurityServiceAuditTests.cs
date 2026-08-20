using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;

namespace CMS.Tests.Unit.Services;

public class SecurityServiceAuditTests
{
    [Fact]
    public async Task LogSecurityEventAsync_LoginFailed_PersistsImmediately()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var cache = new Mock<ICacheService>();
        var batch = new Mock<ISecurityEventBatch>();
        var service = new SecurityService(db, cache.Object, batch.Object, new CorrelationContext(), Configuration());

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Info, "failed login");

        (await db.SecurityLogs.CountAsync(log => log.EventType == SecurityEventType.LoginFailed)).Should().Be(1);
        batch.Verify(queue => queue.EnqueueAsync(It.IsAny<SecurityEventWrite>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task LogSecurityEventAsync_CriticalPersistence_RedactsSensitiveAuditValues()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = new SecurityService(db, new Mock<ICacheService>().Object, new Mock<ISecurityEventBatch>().Object, new CorrelationContext(), Configuration());

        await service.LogSecurityEventAsync(
            Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            "access_token=TEST_ONLY_TOKEN", "127.0.0.1", "Bearer TEST_ONLY_TOKEN", "password=TEST_ONLY_PASSWORD");

        var log = await db.SecurityLogs.SingleAsync();
        log.Description.Should().Contain("access_token=[REDACTED]").And.NotContain("TEST_ONLY_TOKEN");
        log.UserAgent.Should().Contain("Bearer=[REDACTED]").And.NotContain("TEST_ONLY_TOKEN");
        log.DeviceFingerprint.Should().Contain("password=[REDACTED]").And.NotContain("TEST_ONLY_PASSWORD");
    }

    [Fact]
    public async Task LogSecurityEventAsync_BatchedPersistence_RedactsSensitiveAuditValues()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var batch = new Mock<ISecurityEventBatch>();
        var service = new SecurityService(db, new Mock<ICacheService>().Object, batch.Object, new CorrelationContext(), Configuration());

        await service.LogSecurityEventAsync(
            Guid.NewGuid(), null, SecurityEventType.LoginSuccess, SecuritySeverity.Info,
            "refresh_token=TEST_ONLY_REFRESH");

        batch.Verify(queue => queue.EnqueueAsync(
            It.Is<SecurityEventWrite>(entry =>
                entry.Description.Contains("refresh_token=[REDACTED]") &&
                !entry.Description.Contains("TEST_ONLY_REFRESH")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task LogSecurityEventAsync_UsesTheSameScopedCorrelationForImmediateAndBatchedWrites()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var correlation = new CorrelationContext { CorrelationId = "22222222222222222222222222222222" };
        var batch = new Mock<ISecurityEventBatch>();
        var service = new SecurityService(db, new Mock<ICacheService>().Object, batch.Object, correlation, Configuration());

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning, "immediate");
        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginSuccess, SecuritySeverity.Info, "batched");

        (await db.SecurityLogs.SingleAsync()).CorrelationId.Should().Be(correlation.CorrelationId);
        batch.Verify(queue => queue.EnqueueAsync(
            It.Is<SecurityEventWrite>(entry => entry.CorrelationId == correlation.CorrelationId),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task LogSecurityEventAsync_InformationalEvent_QueuesForBatchPersistence()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var cache = new Mock<ICacheService>();
        var batch = new Mock<ISecurityEventBatch>();
        var service = new SecurityService(db, cache.Object, batch.Object, new CorrelationContext(), Configuration());

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginSuccess, SecuritySeverity.Info, "login success");

        (await db.SecurityLogs.CountAsync(log => log.EventType == SecurityEventType.LoginSuccess)).Should().Be(0);
        batch.Verify(queue => queue.EnqueueAsync(
            It.Is<SecurityEventWrite>(entry => entry.EventType == SecurityEventType.LoginSuccess),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    private static IConfiguration Configuration() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["Security:Device:SingleActiveDevice"] = "true" })
        .Build();
}
