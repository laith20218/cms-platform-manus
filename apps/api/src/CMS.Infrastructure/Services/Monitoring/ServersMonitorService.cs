using CMS.Application.DTOs.Monitoring;
using CMS.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services.Monitoring;

/// <summary>
/// PR-8 orchestrator for the Servers Dashboard. Fans the four provider checks out in parallel
/// (Task.WhenAll) with each provider honoring its own cache/failure isolation, computes the
/// overall status, builds the one-line per-provider notes, and routes detail/history reads.
/// Read-only by design — nothing in this service can mutate any provider.
/// </summary>
public sealed class ServersMonitorService : IServersMonitorService
{
    private readonly IRenderMonitor _render;
    private readonly IVercelMonitor _vercel;
    private readonly INeonMonitor _neon;
    private readonly IGithubMonitor _github;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<ServersMonitorService> _logger;

    public ServersMonitorService(
        IRenderMonitor render,
        IVercelMonitor vercel,
        INeonMonitor neon,
        IGithubMonitor github,
        TimeProvider timeProvider,
        ILogger<ServersMonitorService> logger)
    {
        _render = render;
        _vercel = vercel;
        _neon = neon;
        _github = github;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task<ServersSummary> GetSummaryAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        // Parallel fan-out — Task.WhenAll over the four provider checks, each with its own
        // cache/failure isolation. The Safe wrapper is a second isolation net so a bug in one
        // monitor can never fail the whole summary.
        var render = Safe(_render.GetAsync(fresh, correlationId, ct), ServerProviders.Render, now);
        var vercel = Safe(_vercel.GetAsync(fresh, correlationId, ct), ServerProviders.Vercel, now);
        var neon = Safe(_neon.GetAsync(fresh, correlationId, ct), ServerProviders.Neon, now);
        var github = Safe(_github.GetAsync(fresh, correlationId, ct), ServerProviders.Github, now);
        await Task.WhenAll(render, vercel, neon, github);
        var renderEnvelope = render.Result;
        var vercelEnvelope = vercel.Result;
        var neonEnvelope = neon.Result;
        var githubEnvelope = github.Result;

        var providers = new List<ServersProviderHead>
        {
            Head(renderEnvelope, RenderNote(renderEnvelope)),
            Head(vercelEnvelope, VercelNote(vercelEnvelope)),
            Head(neonEnvelope, NeonNote(neonEnvelope)),
            Head(githubEnvelope, GithubNote(githubEnvelope))
        };

        return new ServersSummary(ComputeOverall(providers), now, providers);
    }

    public Task<ProviderEnvelope<RenderProviderData>> GetRenderAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default)
        => _render.GetAsync(fresh, correlationId, ct);

    public Task<ProviderEnvelope<VercelProviderData>> GetVercelAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default)
        => _vercel.GetAsync(fresh, correlationId, ct);

    public Task<ProviderEnvelope<NeonProviderData>> GetNeonAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default)
        => _neon.GetAsync(fresh, correlationId, ct);

    public Task<ProviderEnvelope<GithubProviderData>> GetGithubAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default)
        => _github.GetAsync(fresh, correlationId, ct);

    public ProviderHistoryDto? GetProviderHistory(string provider) => provider switch
    {
        ServerProviders.Render => History(ServerProviders.Render, _render.GetHistory()),
        ServerProviders.Vercel => History(ServerProviders.Vercel, _vercel.GetHistory()),
        ServerProviders.Neon => History(ServerProviders.Neon, _neon.GetHistory()),
        ServerProviders.Github => History(ServerProviders.Github, _github.GetHistory()),
        _ => null
    };

    // ===== summary internals =====

    private static ServersProviderHead Head<TData>(ProviderEnvelope<TData> envelope, string note) where TData : class => new(
        envelope.Provider,
        envelope.Status,
        envelope.CheckedAt,
        envelope.ResponseTimeMs,
        envelope.UnavailableReason,
        envelope.Freshness,
        note);

    /// <summary>
    /// Overall status: healthy when all four are operational; down when ALL are down; degraded
    /// when any non-operational coexists with at least one operational; unavailable when every
    /// provider is non-operational without being all-down (e.g. all missing_credentials).
    /// </summary>
    private static string ComputeOverall(IReadOnlyCollection<ServersProviderHead> providers)
    {
        if (providers.Count == 0) return ServersOverallStatus.Unknown;
        if (providers.All(head => head.Status == ProviderStatus.Operational)) return ServersOverallStatus.Healthy;
        if (providers.All(head => head.Status == ProviderStatus.Down)) return ServersOverallStatus.Down;
        if (providers.Any(head => head.Status == ProviderStatus.Operational)) return ServersOverallStatus.Degraded;
        return ServersOverallStatus.Unavailable;
    }

    private async Task<ProviderEnvelope<TData>> Safe<TData>(Task<ProviderEnvelope<TData>> check, string provider, DateTime now)
        where TData : class
    {
        try
        {
            return await check;
        }
        catch (OperationCanceledException)
        {
            throw; // caller cancellation propagates — the summary is not answerable then.
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "servers summary isolation net {Provider} {ExceptionType}", provider, ex.GetType().Name);
            return new ProviderEnvelope<TData>(provider, ProviderStatus.Unavailable, now, -1,
                ProviderReasons.Unexpected, new ProviderFreshness(false, 0), null);
        }
    }

    // ===== one-line per-provider notes (payload-derived; never secrets) =====

    private static string RenderNote(ProviderEnvelope<RenderProviderData> envelope)
    {
        var service = envelope.Data?.Service;
        if (service is null) return FailureNote(envelope);
        var deploy = envelope.Data?.LastDeploy is { } last
            ? $" · deploy {last.Status} @ {Sha8(last.CommitSha)}"
            : " · no deploys yet";
        return $"service {service.Name} · plan {service.Plan}{deploy}";
    }

    private static string VercelNote(ProviderEnvelope<VercelProviderData> envelope)
    {
        var projects = envelope.Data?.Projects;
        if (projects is null || projects.Count == 0) return FailureNote(envelope);
        var latest = projects
            .Select(project => project.LatestDeployment)
            .Where(deployment => deployment is not null)
            .OrderByDescending(deployment => deployment!.CreatedAt ?? DateTime.MinValue)
            .FirstOrDefault();
        return latest is null
            ? $"{projects.Count} projects · no deployments yet"
            : $"{projects.Count} projects · latest {latest.State}";
    }

    private static string NeonNote(ProviderEnvelope<NeonProviderData> envelope)
    {
        var project = envelope.Data?.Project;
        if (project is null) return FailureNote(envelope);
        var branch = envelope.Data?.Branch is { } branchInfo ? $" · branch {branchInfo.Name}" : string.Empty;
        return $"project {project.Name}{branch}";
    }

    private static string GithubNote(ProviderEnvelope<GithubProviderData> envelope)
    {
        var repository = envelope.Data?.Repository;
        if (repository is null) return FailureNote(envelope);
        var workflow = envelope.Data?.RecentWorkflows is { Count: > 0 } runs
            ? $" · last workflow {runs[0].Conclusion ?? runs[0].Status ?? "unknown"}"
            : string.Empty;
        return $"repo {repository.FullName}{workflow}";
    }

    private static string FailureNote<TData>(ProviderEnvelope<TData> envelope) where TData : class => envelope.Status switch
    {
        ProviderStatus.MissingCredentials => "credentials not configured",
        ProviderStatus.InvalidCredentials => "credentials rejected by provider",
        ProviderStatus.RateLimited => "provider rate limit",
        ProviderStatus.Down => "upstream down",
        ProviderStatus.Unavailable => envelope.UnavailableReason ?? "no provider data",
        _ => envelope.UnavailableReason ?? "no provider data"
    };

    private static string Sha8(string sha) => sha.Length <= 8 ? sha : sha[..8];

    private static ProviderHistoryDto History(string provider, ProviderHistorySnapshot snapshot) =>
        new(provider, snapshot.Capacity, MonitoringNotes.HistoryWindowNote, snapshot.Items);
}
