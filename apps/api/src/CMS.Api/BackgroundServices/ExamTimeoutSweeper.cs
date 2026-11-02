using CMS.Application.Handlers.Exams;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.BackgroundServices;

/// <summary>
/// W14.2 D.3 — finalizes exam sessions whose server-driven timer (D7) has expired.
/// Runs every 30 seconds, scans InProgress sessions with ExpiresAt in the past in
/// bounded batches, and funnels each through the SAME finalize path the request
/// pipeline uses (<see cref="ExamQueryHandlers.FinalizeTimedOutSessionIfNeededAsync"/>),
/// so scoring, pass/fail and timestamps can never drift between lazy and swept
/// finalization. Per the wave ruling this is a plain BackgroundService — Hangfire
/// stays unwired.
/// </summary>
public sealed class ExamTimeoutSweeper : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(45);
    private const int BatchSize = 50;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ExamTimeoutSweeper> _logger;

    public ExamTimeoutSweeper(IServiceScopeFactory scopeFactory, ILogger<ExamTimeoutSweeper> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small startup delay so the first sweep never competes with cold-start work.
        try { await Task.Delay(InitialDelay, stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var finalized = await SweepAsync(stoppingToken);
                if (finalized > 0)
                    _logger.LogInformation("Exam timeout sweep finalized {Count} expired session(s)", finalized);
            }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exam timeout sweep iteration failed; will retry on the next interval");
            }

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    /// <summary>Visible for testing — one sweep iteration. Returns the number of finalized sessions.</summary>
    public async Task<int> SweepAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var now = DateTime.UtcNow;
        // Scoring touches SessionQuestions + AttemptLogs only — the Exam include is
        // deliberately omitted so an orphaned session (defensive: no principal row)
        // can still be finalized instead of silently vanishing from the batch.
        var expired = await db.ExamSessions
            .Include(session => session.SessionQuestions)
            .Include(session => session.AttemptLogs)
            .Where(session => session.Status == ExamSessionStatus.InProgress && session.ExpiresAt < now)
            .OrderBy(session => session.ExpiresAt)
            .Take(BatchSize)
            .ToListAsync(ct);

        var finalized = 0;
        foreach (var session in expired)
        {
            if (await ExamQueryHandlers.FinalizeTimedOutSessionIfNeededAsync(session, ct))
                finalized++;
        }

        if (finalized > 0)
            await unitOfWork.SaveChangesAsync(ct);
        return finalized;
    }
}
