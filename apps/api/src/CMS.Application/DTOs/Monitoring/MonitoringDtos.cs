namespace CMS.Application.DTOs.Monitoring;

/// <summary>
/// PR-8 (Servers Dashboard) — read-only provider monitoring DTO contract.
///
/// Design rules (docs/ops/credential-rotation.md §5 + PR-8 spec):
///  - The DTO surface is STABLE and camelCase on the wire; raw provider JSON is
///    never passed through — every field is mapped into the records below.
///  - No headers, no tokens, no connection strings, no secret values ever appear
///    in any envelope, log line, or exception message.
///  - Envelope statuses are the ONLY health vocabulary the clients consume:
///    operational / degraded / down / unavailable / missing_credentials /
///    invalid_credentials / rate_limited.
/// </summary>

/// <summary>Canonical provider health status values for <see cref="ProviderEnvelope{TData}"/>.</summary>
public static class ProviderStatus
{
    /// <summary>Upstream answered 2xx and the payload mapped (or provider-internal state is fine).</summary>
    public const string Operational = "operational";

    /// <summary>Upstream answered but the provider's own state signals a problem (e.g. Render service suspended) or only partial data could be fetched.</summary>
    public const string Degraded = "degraded";

    /// <summary>Transient upstream failure (timeout / network / 5xx) that persisted after the single bounded retry.</summary>
    public const string Down = "down";

    /// <summary>No upstream call could produce a result (circuit open, other non-2xx, malformed payload).</summary>
    public const string Unavailable = "unavailable";

    /// <summary>The documented MONITORING_* environment names are not configured — no upstream call is attempted at all.</summary>
    public const string MissingCredentials = "missing_credentials";

    /// <summary>The provider rejected the configured credentials (401/403).</summary>
    public const string InvalidCredentials = "invalid_credentials";

    /// <summary>The provider answered 429 (Retry-After honored when present).</summary>
    public const string RateLimited = "rate_limited";
}

/// <summary>The four monitored provider names (also the URL segment + cache suffix).</summary>
public static class ServerProviders
{
    public const string Render = "render";
    public const string Vercel = "vercel";
    public const string Neon = "neon";
    public const string Github = "github";

    public static readonly string[] All = { Render, Vercel, Neon, Github };
}

/// <summary>Overall dashboard status computed by the orchestrator from the four provider statuses.</summary>
public static class ServersOverallStatus
{
    public const string Healthy = "healthy";
    public const string Degraded = "degraded";
    public const string Down = "down";
    public const string Unavailable = "unavailable";

    /// <summary>Pre-check value; the API itself never emits it in a completed summary.</summary>
    public const string Unknown = "unknown";
}

/// <summary>Whether a returned envelope came from the short cache and how old the underlying check is.</summary>
/// <param name="Cached">True when the envelope was served from the 60-second provider cache (not a fresh check).</param>
/// <param name="AgeSeconds">Seconds elapsed since the ORIGINAL check (0 for fresh checks).</param>
public sealed record ProviderFreshness(bool Cached, int AgeSeconds);

/// <summary>
/// Stable envelope every provider monitor returns. <paramref name="ResponseTimeMs"/> is the
/// Stopwatch elapsed of the LAST upstream call, summed with its retries when one was retried
/// (documented PR-8 semantics); it is -1 when NO upstream call was made at all
/// (missing_credentials / circuit-open short-circuit).
/// </summary>
/// <param name="Provider">One of <see cref="ServerProviders"/> values.</param>
/// <param name="Status">One of <see cref="ProviderStatus"/> values.</param>
/// <param name="CheckedAt">UTC timestamp of the ORIGINAL check (ISO-8601 on the wire).</param>
/// <param name="ResponseTimeMs">Last upstream call elapsed in ms, or -1 when no call was attempted.</param>
/// <param name="UnavailableReason">Short technical reason when status is not operational; null otherwise.</param>
/// <param name="Freshness">Cache hit indicator + age of the original check.</param>
/// <param name="Data">Provider-specific mapped payload (never raw provider JSON); null when no data could be produced.</param>
public sealed record ProviderEnvelope<TData>(
    string Provider,
    string Status,
    DateTime CheckedAt,
    int ResponseTimeMs,
    string? UnavailableReason,
    ProviderFreshness Freshness,
    TData? Data) where TData : class;

// ===== Render payload =====

/// <summary>Render provider payload (service + latest deploy; metrics are not exposed on the free plan).</summary>
/// <param name="Service">Mapped GET /v1/services/{id} fields, or null when unavailable.</param>
/// <param name="LastDeploy">Latest deploy (live deploy preferred, else newest), or null.</param>
/// <param name="MetricsAvailable">Always false today — the Render free plan does not expose metrics.</param>
/// <param name="MetricsUnavailableReason">Always "metrics not exposed on this plan".</param>
public sealed record RenderProviderData(
    RenderServiceInfo? Service,
    RenderDeployInfo? LastDeploy,
    bool MetricsAvailable,
    string MetricsUnavailableReason);

/// <summary>Render service row (id/name/suspension/plan facts only).</summary>
public sealed record RenderServiceInfo(
    string Id,
    string Name,
    bool Suspended,
    bool AutoDeploy,
    string Plan,
    string? Region);

/// <summary>Latest Render deploy (commit message is control-flattened, secret-redacted and length-capped).</summary>
public sealed record RenderDeployInfo(
    string Id,
    string Status,
    string CommitSha,
    string? CommitMessage,
    DateTime? CreatedAt,
    DateTime? FinishedAt);

// ===== Vercel payload =====

/// <summary>Vercel provider payload: BOTH the admin and the student projects, each with its latest deployment.</summary>
public sealed record VercelProviderData(IReadOnlyList<VercelProjectInfo> Projects);

/// <summary>One Vercel project row (mapped project id/name/url + latest deployment).</summary>
public sealed record VercelProjectInfo(
    string Id,
    string Name,
    VercelDeploymentInfo? LatestDeployment,
    string? Url);

/// <summary>Latest Vercel deployment for a project (target is "production" | "preview" | null).</summary>
public sealed record VercelDeploymentInfo(
    string Id,
    string State,
    string? Target,
    string? CommitSha,
    string? CommitRef,
    DateTime? CreatedAt,
    DateTime? ReadyAt);

// ===== Neon payload =====

/// <summary>
/// Neon provider payload. Deliberately contains NO connection URIs or connection_details of any
/// kind — the monitors never read that section of the Neon responses (a project-scoped key may be
/// Editor-capable, so only the two fixed read-only GETs are ever issued).
/// </summary>
/// <param name="Project">Mapped project facts, or null when unavailable.</param>
/// <param name="Branch">The configured (or default) branch, or null.</param>
/// <param name="Usage">Always null — consumption metrics are not exposed by the scoped key/plan.</param>
/// <param name="UsageUnavailableReason">Always "consumption metrics not exposed by the scoped key/plan".</param>
public sealed record NeonProviderData(
    NeonProjectInfo? Project,
    NeonBranchInfo? Branch,
    object? Usage,
    string UsageUnavailableReason);

/// <summary>Neon project row (identifier facts only; never connection material).</summary>
public sealed record NeonProjectInfo(string Id, string Name, string? RegionId);

/// <summary>Neon branch row.</summary>
public sealed record NeonBranchInfo(
    string Id,
    string Name,
    bool? IsDefault,
    bool? Protected,
    string? State);

// ===== GitHub payload =====

/// <summary>GitHub provider payload (repository + the 5 most recent workflow runs).</summary>
public sealed record GithubProviderData(
    GithubRepositoryInfo? Repository,
    IReadOnlyList<GithubWorkflowRunInfo> RecentWorkflows);

/// <summary>GitHub repository row (metadata only).</summary>
public sealed record GithubRepositoryInfo(
    string Name,
    string FullName,
    string Visibility,
    string DefaultBranch,
    DateTime? PushedAt,
    int? OpenIssuesCount);

/// <summary>One recent Actions workflow run.</summary>
public sealed record GithubWorkflowRunInfo(
    long Id,
    string Name,
    string HeadSha,
    string? Status,
    string? Conclusion,
    DateTime? CreatedAt,
    DateTime? UpdatedAt);

// ===== Summary + history =====

/// <summary>Servers dashboard summary (overall status + one lightweight head row per provider).</summary>
/// <param name="OverallStatus">One of <see cref="ServersOverallStatus"/> values.</param>
/// <param name="CheckedAt">UTC timestamp of the summary orchestration.</param>
/// <param name="Providers">Four rows, one per provider, in render/vercel/neon/github order.</param>
public sealed record ServersSummary(
    string OverallStatus,
    DateTime CheckedAt,
    IReadOnlyList<ServersProviderHead> Providers);

/// <summary>Lightweight per-provider head used by the summary (envelope header fields + one-line note).</summary>
public sealed record ServersProviderHead(
    string Provider,
    string Status,
    DateTime CheckedAt,
    int ResponseTimeMs,
    string? UnavailableReason,
    ProviderFreshness Freshness,
    string Note);

/// <summary>Bounded in-memory per-provider check history (NOT durable — see <paramref name="WindowNote"/>).</summary>
/// <param name="Provider">One of <see cref="ServerProviders"/> values.</param>
/// <param name="Capacity">Ring capacity (checks kept in memory).</param>
/// <param name="WindowNote">Bilingual window disclaimer (Arabic + English).</param>
/// <param name="Items">Newest-first check entries.</param>
public sealed record ProviderHistoryDto(
    string Provider,
    int Capacity,
    string WindowNote,
    IReadOnlyList<ProviderHistoryItem> Items);

/// <summary>One recorded check outcome in the history ring.</summary>
public sealed record ProviderHistoryItem(
    DateTime CheckedAt,
    string Status,
    int ResponseTimeMs,
    string? Reason);

/// <summary>
/// History window disclaimer (bilingual by spec): the history lives in memory only and is lost
/// whenever the API process restarts — it is an operations aid, not a durable record.
/// </summary>
public static class MonitoringNotes
{
    public const string HistoryWindowNote =
        "السجل في الذاكرة منذ آخر إعادة تشغيل للخدمة — in-memory history since the last API restart";
}
