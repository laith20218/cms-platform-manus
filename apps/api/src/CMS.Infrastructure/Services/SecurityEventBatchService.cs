using System.Net;
using System.Threading.Channels;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Durable, ordered batching boundary for non-critical security audit events. Critical
/// events bypass this service in <see cref="SecurityService"/> and are persisted inline.
/// </summary>
public sealed class SecurityEventBatchService : BackgroundService, ISecurityEventBatch
{
    private readonly Channel<SecurityEventWrite> _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SecurityEventBatchService> _logger;
    private readonly TimeSpan _flushInterval;
    private readonly int _batchSize;
    private readonly SemaphoreSlim _flushLock = new(1, 1);
    private readonly SemaphoreSlim _flushRequested = new(0, 1);
    private int _queuedCount;

    public SecurityEventBatchService(IServiceScopeFactory scopeFactory, IConfiguration configuration, ILogger<SecurityEventBatchService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _batchSize = Math.Clamp(configuration.GetValue<int?>("Security:Audit:BatchSize") ?? 50, 1, 500);
        var seconds = Math.Clamp(configuration.GetValue<int?>("Security:Audit:FlushSeconds") ?? 60, 1, 300);
        _flushInterval = TimeSpan.FromSeconds(seconds);
        var capacity = Math.Clamp(configuration.GetValue<int?>("Security:Audit:QueueCapacity") ?? 1000, _batchSize, 10_000);
        _queue = Channel.CreateBounded<SecurityEventWrite>(new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public async ValueTask EnqueueAsync(SecurityEventWrite securityEvent, CancellationToken ct = default)
    {
        await _queue.Writer.WriteAsync(securityEvent, ct);
        if (Interlocked.Increment(ref _queuedCount) >= _batchSize)
            _flushRequested.ReleaseIfAvailable();
    }

    public async Task FlushAsync(CancellationToken ct = default)
    {
        await _flushLock.WaitAsync(ct);
        try
        {
            var batch = new List<SecurityEventWrite>(_batchSize);
            while (batch.Count < _batchSize && _queue.Reader.TryRead(out var item))
            {
                batch.Add(item);
                Interlocked.Decrement(ref _queuedCount);
            }

            if (batch.Count == 0)
                return;

            try
            {
                await PersistWithRetryAsync(batch, ct);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                // Preserve order when persistence is unavailable. The bounded channel has
                // just been drained by this batch, so re-queueing cannot evict an event.
                foreach (var item in batch)
                {
                    await _queue.Writer.WriteAsync(item, CancellationToken.None);
                    Interlocked.Increment(ref _queuedCount);
                }
                _logger.LogError(ex, "Security audit batch persistence failed; {Count} events requeued.", batch.Count);
            }
        }
        finally
        {
            _flushLock.Release();
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = Task.Delay(_flushInterval, stoppingToken);
            var requested = _flushRequested.WaitAsync(stoppingToken);
            await Task.WhenAny(delay, requested);
            if (stoppingToken.IsCancellationRequested)
                break;

            await FlushUntilEmptyAsync(stoppingToken);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await FlushUntilEmptyAsync(CancellationToken.None);
        _queue.Writer.TryComplete();
        await base.StopAsync(cancellationToken);
    }

    private async Task FlushUntilEmptyAsync(CancellationToken ct)
    {
        do
        {
            var before = Volatile.Read(ref _queuedCount);
            await FlushAsync(ct);
            if (before == 0 || Volatile.Read(ref _queuedCount) >= before)
                break;
        } while (Volatile.Read(ref _queuedCount) > 0);
    }

    private async Task PersistWithRetryAsync(IReadOnlyCollection<SecurityEventWrite> batch, CancellationToken ct)
    {
        const int attempts = 3;
        for (var attempt = 1; attempt <= attempts; attempt++)
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.SecurityLogs.AddRange(batch.Select(ToSecurityLog));
                await db.SaveChangesAsync(ct);
                return;
            }
            catch when (attempt < attempts && !ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(100 * attempt), ct);
            }
        }

        throw new InvalidOperationException("Security audit batch could not be persisted after three attempts.");
    }

    private static SecurityLog ToSecurityLog(SecurityEventWrite item) => new()
    {
        StudentId = item.StudentId,
        AdminId = item.AdminId,
        EventType = item.EventType,
        Severity = item.Severity,
        Description = item.Description,
        IpAddress = IPAddress.TryParse(item.IpAddress, out var ip) ? ip : null,
        UserAgent = item.UserAgent,
        DeviceFingerprint = item.DeviceFingerprint,
        CorrelationId = item.CorrelationId
    };
}

internal static class SemaphoreSlimExtensions
{
    public static void ReleaseIfAvailable(this SemaphoreSlim semaphore)
    {
        try { semaphore.Release(); }
        catch (SemaphoreFullException) { }
    }
}
