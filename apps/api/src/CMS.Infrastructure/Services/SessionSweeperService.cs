using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using CMS.Domain.Entities;
using CMS.Infrastructure.Persistence;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Push 2 / Track 2: closes idle administrative sessions. Every 5 minutes it finds
/// non-student sessions that are still active, have no ClosedAt, and whose
/// LastActivityAt is older than 15 minutes — and marks them Expired with ClosedAt = now.
///
/// Student sessions are deliberately excluded: their lifetime is governed by the refresh
/// token expiry (Push 2 constraint — student login behavior must not change).
///
/// The 15-minute idle window is a security-hardening measure for the admin console; the
/// <c>SessionValidationMiddleware</c> heartbeat keeps genuinely active sessions alive by
/// refreshing LastActivityAt on every authenticated request (throttled to one write/minute).
/// </summary>
public sealed class SessionSweeperService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan IdleThreshold = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(45);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SessionSweeperService> _logger;

    public SessionSweeperService(IServiceScopeFactory scopeFactory, ILogger<SessionSweeperService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small startup delay so the sweep never competes with cold-start work.
        try { await Task.Delay(InitialDelay, stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await SweepAsync(stoppingToken); }
            catch (OperationCanceledException) { return; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Session sweep iteration failed; will retry on the next interval");
            }

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    /// <summary>Visible for testing — one sweep iteration.</summary>
    public async Task<int> SweepAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var cutoff = DateTime.UtcNow - IdleThreshold;
        var idleSessions = await db.UserSessions
            .Where(s => s.ClosedAt == null
                && s.Status == SessionStatus.Active
                && s.Role != "student"
                && s.LastActivityAt < cutoff)
            .ToListAsync(ct);

        if (idleSessions.Count == 0) return 0;

        var closedAt = DateTime.UtcNow;
        foreach (var session in idleSessions)
        {
            session.Status = SessionStatus.Expired;
            session.ClosedAt = closedAt;
            _logger.LogInformation(
                "Idle admin session closed by sweeper. SessionId={SessionId} UserId={UserId} Role={Role} LastActivityAt={LastActivityAt:o} ClosedAt={ClosedAt:o}",
                session.Id, session.UserId, session.Role, session.LastActivityAt, closedAt);
        }

        await db.SaveChangesAsync(ct);
        return idleSessions.Count;
    }
}
