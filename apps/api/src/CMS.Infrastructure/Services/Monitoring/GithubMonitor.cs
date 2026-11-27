using System.Text.Json;
using CMS.Application.DTOs.Monitoring;
using CMS.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services.Monitoring;

/// <summary>
/// GitHub (api.github.com) read-only monitor. Env names consumed (values NEVER logged or
/// exposed): MONITORING_GITHUB_TOKEN (secret — Bearer only), MONITORING_GITHUB_OWNER,
/// MONITORING_GITHUB_REPOSITORY. Fixed GETs only: /repos/{owner}/{repo} and
/// /repos/{owner}/{repo}/actions/runs?per_page=5.
/// </summary>
internal sealed class GithubMonitor : ProviderMonitorBase<GithubProviderData>, IGithubMonitor
{
    private readonly string? _owner;
    private readonly string? _repository;
    private readonly bool _configured;

    public GithubMonitor(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ICacheService cache,
        TimeProvider timeProvider,
        ILogger<GithubMonitor> logger)
        : base(ServerProviders.Github,
            MonitoringHttpClients.Github,
            configuration["MONITORING_GITHUB_TOKEN"],
            httpClientFactory, cache, timeProvider, logger)
    {
        _owner = configuration["MONITORING_GITHUB_OWNER"];
        _repository = configuration["MONITORING_GITHUB_REPOSITORY"];
        _configured = !string.IsNullOrWhiteSpace(configuration["MONITORING_GITHUB_TOKEN"])
            && !string.IsNullOrWhiteSpace(_owner)
            && !string.IsNullOrWhiteSpace(_repository);
    }

    protected override bool IsConfigured => _configured;

    protected override async Task<ProviderCheckOutcome<GithubProviderData>> FetchAsync(
        HttpClient client, string? correlationId, CancellationToken ct)
    {
        var repoPath = $"repos/{Escaped(_owner!)}/{Escaped(_repository!)}";
        var repoCall = await CallGetAsync(client, repoPath, correlationId, ct);
        if (!repoCall.Succeeded)
            return FromCallFailure(repoCall);

        var repository = GithubParser.ParseRepository(ParseBody(repoCall.Body));
        if (repository is null)
            return FromCallFailure(MalformedCall(repoCall));

        var runsPath = $"{repoPath}/actions/runs?per_page=5";
        var runsCall = await CallGetAsync(client, runsPath, correlationId, ct);
        if (!runsCall.Succeeded)
            return FromSecondaryFailure(runsCall, new GithubProviderData(repository, []));

        var runs = GithubParser.ParseWorkflowRuns(ParseBody(runsCall.Body));
        if (runs is null)
            return FromSecondaryFailure(MalformedCall(runsCall), new GithubProviderData(repository, []));

        return new ProviderCheckOutcome<GithubProviderData>(
            ProviderStatus.Operational,
            null,
            new GithubProviderData(repository, runs),
            runsCall.ElapsedMs,
            null,
            AllCallsSucceeded: true,
            TransientUpstreamFailure: false);
    }
}

/// <summary>Defensive mappers for the two fixed GitHub responses.</summary>
internal static class GithubParser
{
    public static GithubRepositoryInfo? ParseRepository(JsonElement? root)
    {
        if (root is not { ValueKind: JsonValueKind.Object } element) return null;
        return new GithubRepositoryInfo(
            MonitoringJson.String(element, "name") ?? string.Empty,
            MonitoringJson.String(element, "full_name") ?? string.Empty,
            MonitoringJson.String(element, "visibility") ?? string.Empty,
            MonitoringJson.String(element, "default_branch") ?? string.Empty,
            MonitoringJson.Date(element, "pushed_at"),
            MonitoringJson.Int(element, "open_issues_count"));
    }

    /// <summary>
    /// Workflow runs from { "workflow_runs": [...] } (max 5 by the fixed per_page). Null marks a
    /// malformed payload; a valid empty list yields zero entries.
    /// </summary>
    public static List<GithubWorkflowRunInfo>? ParseWorkflowRuns(JsonElement? root)
    {
        var runs = root is { ValueKind: JsonValueKind.Object } wrapper
            ? MonitoringJson.Property(wrapper, "workflow_runs")
            : root is { ValueKind: JsonValueKind.Array } array ? array : null;
        if (runs is not { ValueKind: JsonValueKind.Array } list) return null;

        var result = new List<GithubWorkflowRunInfo>();
        foreach (var entry in list.EnumerateArray().Take(5))
        {
            if (entry.ValueKind != JsonValueKind.Object) continue;
            result.Add(new GithubWorkflowRunInfo(
                MonitoringJson.Long(entry, "id") ?? 0,
                MonitoringJson.String(entry, "name") ?? string.Empty,
                MonitoringJson.String(entry, "head_sha") ?? string.Empty,
                MonitoringJson.String(entry, "status"),
                MonitoringJson.String(entry, "conclusion"),
                MonitoringJson.Date(entry, "created_at"),
                MonitoringJson.Date(entry, "updated_at")));
        }
        return result;
    }
}
