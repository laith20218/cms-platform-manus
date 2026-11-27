using System.Text.Json;
using CMS.Application.DTOs.Monitoring;
using CMS.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services.Monitoring;

/// <summary>
/// Neon (api.neon.tech) read-only monitor. Env names consumed (values NEVER logged or exposed):
/// MONITORING_NEON_API_KEY (secret — Bearer only), MONITORING_NEON_PROJECT_ID, and the OPTIONAL
/// MONITORING_NEON_BRANCH_ID (matched against the branches list; the default branch is used when
/// unset).
///
/// SSRF/scope discipline: a Neon project-scoped key may carry Editor capability, so this monitor
/// issues ONLY the two fixed read-only GETs (/api/v2/projects/{id} and /api/v2/projects/{id}/branches)
/// and NEVER requests, reads or exposes connection URIs — the connection_details section of any
/// response is deliberately never touched by the parser.
/// </summary>
internal sealed class NeonMonitor : ProviderMonitorBase<NeonProviderData>, INeonMonitor
{
    private const string UsageUnavailableReason = "consumption metrics not exposed by the scoped key/plan";

    private readonly string? _projectId;
    private readonly string? _branchId;
    private readonly bool _configured;

    public NeonMonitor(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ICacheService cache,
        TimeProvider timeProvider,
        ILogger<NeonMonitor> logger)
        : base(ServerProviders.Neon,
            MonitoringHttpClients.Neon,
            configuration["MONITORING_NEON_API_KEY"],
            httpClientFactory, cache, timeProvider, logger)
    {
        _projectId = configuration["MONITORING_NEON_PROJECT_ID"];
        _branchId = configuration["MONITORING_NEON_BRANCH_ID"];
        _configured = !string.IsNullOrWhiteSpace(configuration["MONITORING_NEON_API_KEY"])
            && !string.IsNullOrWhiteSpace(_projectId);
    }

    protected override bool IsConfigured => _configured;

    protected override async Task<ProviderCheckOutcome<NeonProviderData>> FetchAsync(
        HttpClient client, string? correlationId, CancellationToken ct)
    {
        var projectPath = $"api/v2/projects/{Escaped(_projectId!)}";
        var projectCall = await CallGetAsync(client, projectPath, correlationId, ct);
        if (!projectCall.Succeeded)
            return FromCallFailure(projectCall);

        var project = NeonParser.ParseProject(ParseBody(projectCall.Body));
        if (project is null)
            return FromCallFailure(MalformedCall(projectCall));

        var branchesPath = $"{projectPath}/branches";
        var branchesCall = await CallGetAsync(client, branchesPath, correlationId, ct);
        if (!branchesCall.Succeeded)
            return FromSecondaryFailure(branchesCall, new NeonProviderData(project, null, null, UsageUnavailableReason));

        var branches = NeonParser.ParseBranches(ParseBody(branchesCall.Body));
        if (branches is null)
            return FromSecondaryFailure(MalformedCall(branchesCall), new NeonProviderData(project, null, null, UsageUnavailableReason));

        var branch = SelectBranch(branches);
        if (branch is null && !string.IsNullOrWhiteSpace(_branchId))
        {
            // The operator pinned a branch that does not exist (anymore) — surface it honestly.
            return new ProviderCheckOutcome<NeonProviderData>(
                ProviderStatus.Degraded,
                "configured branch not found",
                new NeonProviderData(project, null, null, UsageUnavailableReason),
                branchesCall.ElapsedMs,
                null,
                AllCallsSucceeded: true,
                TransientUpstreamFailure: false);
        }

        return new ProviderCheckOutcome<NeonProviderData>(
            ProviderStatus.Operational,
            null,
            new NeonProviderData(project, branch, null, UsageUnavailableReason),
            branchesCall.ElapsedMs,
            null,
            AllCallsSucceeded: true,
            TransientUpstreamFailure: false);
    }

    /// <summary>Configured branch when pinned (must match); else the default branch; else the first.</summary>
    private NeonBranchInfo? SelectBranch(IReadOnlyList<NeonBranchInfo> branches)
    {
        if (branches.Count == 0) return null;
        if (!string.IsNullOrWhiteSpace(_branchId))
        {
            var pinned = branches.FirstOrDefault(branch =>
                string.Equals(branch.Id, _branchId, StringComparison.OrdinalIgnoreCase));
            if (pinned is not null) return pinned;
            return null; // pinned but not found — caller surfaces the degraded reason.
        }
        return branches.FirstOrDefault(branch => branch.IsDefault == true) ?? branches[0];
    }
}

/// <summary>Defensive mappers for the two fixed Neon responses (NEVER touches connection material).</summary>
internal static class NeonParser
{
    public static NeonProjectInfo? ParseProject(JsonElement? root)
    {
        if (root is not { ValueKind: JsonValueKind.Object } outer) return null;
        // Neon v2 answers either the project object directly or wrapped in { "project": {...} }.
        var element = MonitoringJson.Property(outer, "project") ?? outer;
        if (element.ValueKind != JsonValueKind.Object) return null;
        return new NeonProjectInfo(
            MonitoringJson.String(element, "id") ?? string.Empty,
            MonitoringJson.String(element, "name") ?? string.Empty,
            MonitoringJson.String(element, "regionId") ?? MonitoringJson.String(element, "region"));
    }

    /// <summary>
    /// Branch list from either { "branches": [...] } or a bare array. Null marks a malformed
    /// payload; an empty list is a valid (defensive) outcome.
    /// </summary>
    public static List<NeonBranchInfo>? ParseBranches(JsonElement? root)
    {
        var branches = root is { ValueKind: JsonValueKind.Object } wrapper
            ? MonitoringJson.Property(wrapper, "branches")
            : root is { ValueKind: JsonValueKind.Array } array ? array : null;
        if (branches is not { ValueKind: JsonValueKind.Array } list) return null;

        var result = new List<NeonBranchInfo>();
        foreach (var entry in list.EnumerateArray())
        {
            if (entry.ValueKind != JsonValueKind.Object) continue;
            result.Add(new NeonBranchInfo(
                MonitoringJson.String(entry, "id") ?? string.Empty,
                MonitoringJson.String(entry, "name") ?? string.Empty,
                MonitoringJson.OptionalBool(entry, "isDefault", "is_default"),
                MonitoringJson.OptionalBool(entry, "protected"),
                MonitoringJson.String(entry, "state")));
        }
        return result;
    }
}
