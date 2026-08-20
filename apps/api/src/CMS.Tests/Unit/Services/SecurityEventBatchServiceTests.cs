using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CMS.Tests.Unit.Services;

public class SecurityEventBatchServiceTests
{
    [Fact]
    public async Task FlushAsync_PersistsNonCriticalEventsInEnqueueOrder()
    {
        await using var provider = CreateProvider();
        var service = CreateService(provider);
        var studentId = Guid.NewGuid();

        await service.EnqueueAsync(Event("first", studentId));
        await service.EnqueueAsync(Event("second", studentId));
        await service.FlushAsync();

        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var logs = await db.SecurityLogs.OrderBy(log => log.CreatedAt).ToListAsync();
        logs.Select(log => log.Description).Should().Equal("first", "second");
    }

    [Fact]
    public async Task StopAsync_FlushesQueuedEventsBeforeCompletingWriter()
    {
        await using var provider = CreateProvider();
        var service = CreateService(provider);

        await service.EnqueueAsync(Event("shutdown", Guid.NewGuid()));
        await service.StopAsync(CancellationToken.None);

        await using var scope = provider.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        (await db.SecurityLogs.CountAsync(log => log.Description == "shutdown")).Should().Be(1);
    }

    private static ServiceProvider CreateProvider()
    {
        var databaseName = Guid.NewGuid().ToString("N");
        return new ServiceCollection()
            .AddSingleton<InMemoryDatabaseRoot>()
            .AddDbContext<ApplicationDbContext>((provider, options) =>
                options.UseInMemoryDatabase(databaseName, provider.GetRequiredService<InMemoryDatabaseRoot>()))
            .BuildServiceProvider();
    }

    private static SecurityEventBatchService CreateService(ServiceProvider provider) => new(
        provider.GetRequiredService<IServiceScopeFactory>(),
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Audit:BatchSize"] = "2",
            ["Security:Audit:FlushSeconds"] = "60",
            ["Security:Audit:QueueCapacity"] = "10"
        }).Build(),
        NullLogger<SecurityEventBatchService>.Instance);

    private static SecurityEventWrite Event(string description, Guid studentId) => new(
        studentId,
        null,
        SecurityEventType.LoginSuccess,
        SecuritySeverity.Info,
        description,
        "127.0.0.1",
        "unit-test",
        "test-installation",
        "11111111111111111111111111111111");
}
