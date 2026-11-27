using CMS.Application.DTOs.Monitoring;

namespace CMS.Application.Interfaces;

/// <summary>
/// PR-8 (Servers Dashboard) — read-only provider monitoring interfaces.
///
/// Every implementation is a SINGLETON (circuit-breaker + in-memory history state must be shared
/// across requests) and must never throw out of <c>GetAsync</c>: a provider failure is DATA
/// (a non-operational envelope), never an exception, so one provider can never break the summary.
/// No mutation surface exists anywhere in this layer.
/// </summary>

/// <summary>Non-generic capability shared by all four provider monitors.</summary>
public interface IProviderMonitor
{
    /// <summary>Canonical provider name (one of <see cref="ServerProviders"/>).</summary>
    string ProviderName { get; }

    /// <summary>Bounded in-memory check history snapshot (newest first).</summary>
    ProviderHistorySnapshot GetHistory();
}

/// <summary>History snapshot straight from a monitor ring.</summary>
/// <param name="Capacity">Ring capacity (number of checks kept in memory).</param>
/// <param name="Items">Newest-first check entries.</param>
public sealed record ProviderHistorySnapshot(int Capacity, IReadOnlyList<ProviderHistoryItem> Items);

/// <summary>
/// Render (api.render.com) read-only monitor: fixed GET /v1/services/{id} +
/// /v1/services/{id}/deploys?limit=5 only. Never logs or returns the API key.
/// </summary>
public interface IRenderMonitor : IProviderMonitor
{
    /// <summary>
    /// Runs one bounded check (cache → credentials → upstream with retry/circuit) and returns the
    /// stable envelope. <paramref name="fresh"/> true bypasses the cache READ (the result is still
    /// written back). <paramref name="correlationId"/> is logged with the sanitized check lines only.
    /// </summary>
    Task<ProviderEnvelope<RenderProviderData>> GetAsync(bool fresh, string? correlationId = null, CancellationToken ct = default);
}

/// <summary>
/// Vercel (api.vercel.com) read-only monitor: fixed GET /v9/projects/{id} +
/// /v6/deployments?projectId={id}&amp;limit=5 for BOTH the admin and student projects.
/// </summary>
public interface IVercelMonitor : IProviderMonitor
{
    /// <summary>See <see cref="IRenderMonitor.GetAsync"/> — identical semantics for Vercel.</summary>
    Task<ProviderEnvelope<VercelProviderData>> GetAsync(bool fresh, string? correlationId = null, CancellationToken ct = default);
}

/// <summary>
/// Neon (api.neon.tech) read-only monitor: fixed GET /api/v2/projects/{id} +
/// /api/v2/projects/{id}/branches ONLY — deliberately never reads connection URIs/connection_details.
/// </summary>
public interface INeonMonitor : IProviderMonitor
{
    /// <summary>See <see cref="IRenderMonitor.GetAsync"/> — identical semantics for Neon.</summary>
    Task<ProviderEnvelope<NeonProviderData>> GetAsync(bool fresh, string? correlationId = null, CancellationToken ct = default);
}

/// <summary>
/// GitHub (api.github.com) read-only monitor: fixed GET /repos/{owner}/{repo} +
/// /repos/{owner}/{repo}/actions/runs?per_page=5.
/// </summary>
public interface IGithubMonitor : IProviderMonitor
{
    /// <summary>See <see cref="IRenderMonitor.GetAsync"/> — identical semantics for GitHub.</summary>
    Task<ProviderEnvelope<GithubProviderData>> GetAsync(bool fresh, string? correlationId = null, CancellationToken ct = default);
}

/// <summary>
/// Orchestrator for the Servers Dashboard: fans the four provider checks out in parallel
/// (Task.WhenAll — each provider honors its own cache/failure isolation), computes the overall
/// status, and routes per-provider detail + history. Read-only by design.
/// </summary>
public interface IServersMonitorService
{
    /// <summary>
    /// All four provider checks in parallel, each with its own cache/failure isolation; returns
    /// the overall status plus one lightweight head row per provider.
    /// </summary>
    Task<ServersSummary> GetSummaryAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default);

    /// <summary>Render detail (single provider envelope).</summary>
    Task<ProviderEnvelope<RenderProviderData>> GetRenderAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default);

    /// <summary>Vercel detail (single provider envelope).</summary>
    Task<ProviderEnvelope<VercelProviderData>> GetVercelAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default);

    /// <summary>Neon detail (single provider envelope).</summary>
    Task<ProviderEnvelope<NeonProviderData>> GetNeonAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default);

    /// <summary>GitHub detail (single provider envelope).</summary>
    Task<ProviderEnvelope<GithubProviderData>> GetGithubAsync(bool fresh = false, string? correlationId = null, CancellationToken ct = default);

    /// <summary>
    /// Bounded in-memory history for a known provider (one of <see cref="ServerProviders"/>).
    /// Returns null for unknown provider names — the API layer answers 404 in that case.
    /// </summary>
    ProviderHistoryDto? GetProviderHistory(string provider);
}
