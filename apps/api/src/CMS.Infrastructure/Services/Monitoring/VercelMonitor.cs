using System.Text.Json;
using CMS.Application.DTOs.Monitoring;
using CMS.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services.Monitoring;

/// <summary>
/// Vercel (api.vercel.com) read-only monitor. Env names consumed (values NEVER logged or
/// exposed): MONITORING_VERCEL_ACCESS_TOKEN (secret — Bearer only),
/// MONITORING_VERCEL_ADMIN_PROJECT_ID + MONITORING_VERCEL_STUDENT_PROJECT_ID (identifiers).
/// Fixed GETs only, per project: /v9/projects/{id} + /v6/deployments?projectId={id}&amp;limit=5
/// (one deployments list per project; the newest entry becomes latestDeployment with its own
/// target — production or preview).
/// </summary>
internal sealed class VercelMonitor : ProviderMonitorBase<VercelProviderData>, IVercelMonitor
{
    private readonly string? _adminProjectId;
    private readonly string? _studentProjectId;
    private readonly bool _configured;

    public VercelMonitor(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ICacheService cache,
        TimeProvider timeProvider,
        ILogger<VercelMonitor> logger)
        : base(ServerProviders.Vercel,
            MonitoringHttpClients.Vercel,
            configuration["MONITORING_VERCEL_ACCESS_TOKEN"],
            httpClientFactory, cache, timeProvider, logger)
    {
        _adminProjectId = configuration["MONITORING_VERCEL_ADMIN_PROJECT_ID"];
        _studentProjectId = configuration["MONITORING_VERCEL_STUDENT_PROJECT_ID"];
        _configured = !string.IsNullOrWhiteSpace(configuration["MONITORING_VERCEL_ACCESS_TOKEN"])
            && !string.IsNullOrWhiteSpace(_adminProjectId)
            && !string.IsNullOrWhiteSpace(_studentProjectId);
    }

    protected override bool IsConfigured => _configured;

    protected override async Task<ProviderCheckOutcome<VercelProviderData>> FetchAsync(
        HttpClient client, string? correlationId, CancellationToken ct)
    {
        var projects = new List<VercelProjectInfo>();
        var lastElapsedMs = -1;

        foreach (var projectId in new[] { _adminProjectId!, _studentProjectId! })
        {
            var projectPath = $"v9/projects/{Escaped(projectId)}";
            var projectCall = await CallGetAsync(client, projectPath, correlationId, ct);
            if (!projectCall.Succeeded)
            {
                return projects.Count == 0
                    ? FromCallFailure(projectCall)
                    : FromSecondaryFailure(projectCall, new VercelProviderData(projects));
            }

            var project = VercelParser.ParseProject(ParseBody(projectCall.Body));
            if (project is null)
            {
                var malformed = MalformedCall(projectCall);
                return projects.Count == 0
                    ? FromCallFailure(malformed)
                    : FromSecondaryFailure(malformed, new VercelProviderData(projects));
            }

            // One deployments list per project; the newest entry (production or preview) is the
            // latest deployment for the DTO's single latestDeployment slot.
            var deploysPath = $"v6/deployments?projectId={Escaped(projectId)}&limit=5";
            var deploysCall = await CallGetAsync(client, deploysPath, correlationId, ct);
            lastElapsedMs = deploysCall.ElapsedMs;

            if (!deploysCall.Succeeded)
            {
                // Secondary failure: keep the project row (latestDeployment null) + degrade.
                projects.Add(project with { LatestDeployment = null });
                return FromSecondaryFailure(deploysCall, new VercelProviderData(projects));
            }

            var (valid, latest) = VercelParser.ParseLatestDeployment(ParseBody(deploysCall.Body));
            if (!valid)
            {
                // Malformed deployments body: keep the project row (latestDeployment null) + degrade.
                projects.Add(project with { LatestDeployment = null });
                return FromSecondaryFailure(MalformedCall(deploysCall), new VercelProviderData(projects));
            }

            projects.Add(project with { LatestDeployment = latest });
        }

        return new ProviderCheckOutcome<VercelProviderData>(
            ProviderStatus.Operational,
            null,
            new VercelProviderData(projects),
            lastElapsedMs,
            null,
            AllCallsSucceeded: true,
            TransientUpstreamFailure: false);
    }
}

/// <summary>Defensive mappers for the two fixed Vercel responses.</summary>
internal static class VercelParser
{
    public static VercelProjectInfo? ParseProject(JsonElement? root)
    {
        if (root is not { ValueKind: JsonValueKind.Object } element) return null;
        return new VercelProjectInfo(
            MonitoringJson.String(element, "id") ?? string.Empty,
            MonitoringJson.String(element, "name") ?? string.Empty,
            LatestDeployment: null,
            ProjectUrl(element));
    }

    private static string? ProjectUrl(JsonElement element)
    {
        var direct = MonitoringJson.String(element, "url");
        if (!string.IsNullOrWhiteSpace(direct)) return direct;

        var targets = MonitoringJson.Property(element, "targets");
        var production = targets is null ? null : MonitoringJson.Property(targets.Value, "production");
        if (production is null) return null;
        var targetUrl = MonitoringJson.String(production.Value, "url");
        if (!string.IsNullOrWhiteSpace(targetUrl)) return targetUrl;
        var alias = MonitoringJson.Property(production.Value, "alias");
        if (alias is { ValueKind: JsonValueKind.Array } aliases && aliases.GetArrayLength() > 0
            && aliases[0].ValueKind == JsonValueKind.String)
            return aliases[0].GetString();
        return null;
    }

    /// <summary>
    /// Newest deployment from the single deployments list. Valid=false marks a malformed
    /// payload; a valid EMPTY list yields a null LatestDeployment (no deployments yet).
    /// </summary>
    public static (bool Valid, VercelDeploymentInfo? Latest) ParseLatestDeployment(JsonElement? root)
    {
        var deployments = root is { ValueKind: JsonValueKind.Object } wrapper
            ? MonitoringJson.Property(wrapper, "deployments")
            : root is { ValueKind: JsonValueKind.Array } array ? array : null;
        if (deployments is not { ValueKind: JsonValueKind.Array } list) return (false, null);

        var entries = list.EnumerateArray()
            .Where(entry => entry.ValueKind == JsonValueKind.Object)
            .ToList();
        if (entries.Count == 0) return (true, null);

        var newest = entries
            .OrderByDescending(entry => DeploymentDate(entry) ?? DateTime.MinValue)
            .First();

        var meta = MonitoringJson.Property(newest, "meta");
        var gitSource = meta is null ? null : MonitoringJson.Property(meta.Value, "gitSource");
        JsonElement? gitSourceElement = gitSource is null ? null : gitSource.Value;
        JsonElement? metaElement = meta is null ? null : meta.Value;
        return (true, new VercelDeploymentInfo(
            MonitoringJson.String(newest, "uid") ?? MonitoringJson.String(newest, "id") ?? string.Empty,
            MonitoringJson.String(newest, "state") ?? string.Empty,
            MonitoringJson.String(newest, "target"),
            gitSourceElement is null
                ? (metaElement is null ? null : MonitoringJson.String(metaElement.Value, "commitSha"))
                : MonitoringJson.String(gitSourceElement.Value, "commitSha")
                  ?? (metaElement is null ? null : MonitoringJson.String(metaElement.Value, "githubCommitSha")),
            gitSourceElement is null
                ? (metaElement is null ? null : MonitoringJson.String(metaElement.Value, "commitRef"))
                : MonitoringJson.String(gitSourceElement.Value, "commitRef")
                  ?? (metaElement is null ? null : MonitoringJson.String(metaElement.Value, "githubCommitRef")),
            DeploymentDate(newest),
            MonitoringJson.Date(newest, "readyAt", "ready")));
    }

    private static DateTime? DeploymentDate(JsonElement entry) => MonitoringJson.Date(entry, "createdAt", "created");
}
