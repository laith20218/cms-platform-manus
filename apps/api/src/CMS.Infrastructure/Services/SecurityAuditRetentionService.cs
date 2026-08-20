using CMS.Application.Interfaces;
using CMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services;

public sealed class SecurityAuditRetentionService : ISecurityAuditRetentionService
{
    private readonly ApplicationDbContext _db;
    private readonly IConfiguration _configuration;

    public SecurityAuditRetentionService(ApplicationDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    public async Task<SecurityAuditRetentionResult> RunOnceAsync(CancellationToken ct = default)
    {
        var retentionDays = Math.Clamp(_configuration.GetValue<int?>("Security:Audit:RetentionDays") ?? 365, 1, 3650);
        var cutoff = DateTime.UtcNow.AddDays(-retentionDays);
        var deleted = await _db.SecurityLogs
            .Where(log => log.CreatedAt < cutoff)
            .ExecuteDeleteAsync(ct);
        return new SecurityAuditRetentionResult(cutoff, deleted);
    }
}

public sealed class SecurityAuditRetentionHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SecurityAuditRetentionHostedService> _logger;

    public SecurityAuditRetentionHostedService(
        IServiceScopeFactory scopeFactory,
        IConfiguration configuration,
        ILogger<SecurityAuditRetentionHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalHours = Math.Clamp(_configuration.GetValue<int?>("Security:Audit:RetentionRunIntervalHours") ?? 24, 1, 168);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var retention = scope.ServiceProvider.GetRequiredService<ISecurityAuditRetentionService>();
                var result = await retention.RunOnceAsync(stoppingToken);
                _logger.LogInformation("Security audit retention completed. CutoffUtc: {CutoffUtc}; DeletedCount: {DeletedCount}", result.CutoffUtc, result.DeletedCount);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Security audit retention failed; no completion result was recorded and the next scheduled run will retry.");
            }

            await Task.Delay(TimeSpan.FromHours(intervalHours), stoppingToken);
        }
    }
}
