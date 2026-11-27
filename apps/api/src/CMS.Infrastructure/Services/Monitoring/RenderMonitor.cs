using System.Text.Json;
using CMS.Application.DTOs.Monitoring;
using CMS.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services.Monitoring;

/// <summary>
/// Render (api.render.com) read-only monitor. Env names consumed (values NEVER logged or
/// exposed): MONITORING_RENDER_API_KEY (secret — Bearer only), MONITORING_RENDER_SERVICE_ID.
/// Fixed GETs only: /v1/services/{id} + /v1/services/{id}/deploys?limit=5 — no mutation calls.
/// Render free-plan metrics are not exposed, so metricsAvailable is always false with the fixed
/// unavailable reason.
/// </summary>
internal sealed class RenderMonitor : ProviderMonitorBase<RenderProviderData>, IRenderMonitor
{
    private const string MetricsUnavailableReason = "metrics not exposed on this plan";

    private readonly string? _serviceId;
    private readonly bool _configured;

    public RenderMonitor(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ICacheService cache,
        TimeProvider timeProvider,
        ILogger<RenderMonitor> logger)
        : base(ServerProviders.Render,
            MonitoringHttpClients.Render,
            configuration["MONITORING_RENDER_API_KEY"],
            httpClientFactory, cache, timeProvider, logger)
    {
        _serviceId = configuration["MONITORING_RENDER_SERVICE_ID"];
        _configured = !string.IsNullOrWhiteSpace(configuration["MONITORING_RENDER_API_KEY"])
            && !string.IsNullOrWhiteSpace(_serviceId);
    }

    protected override bool IsConfigured => _configured;

    protected override async Task<ProviderCheckOutcome<RenderProviderData>> FetchAsync(
        HttpClient client, string? correlationId, CancellationToken ct)
    {
        var servicePath = $"v1/services/{Escaped(_serviceId!)}";
        var serviceCall = await CallGetAsync(client, servicePath, correlationId, ct);
        if (!serviceCall.Succeeded)
            return FromCallFailure(serviceCall);

        var deploysPath = $"{servicePath}/deploys?limit=5";
        var deploysCall = await CallGetAsync(client, deploysPath, correlationId, ct);

        var service = RenderParser.ParseService(ParseBody(serviceCall.Body));
        if (service is null)
            return MalformedPrimary(serviceCall);

        if (!deploysCall.Succeeded)
            return FromSecondaryFailure(deploysCall, new RenderProviderData(service, null, false, MetricsUnavailableReason));

        var (deploysValid, lastDeploy) = RenderParser.ParseDeploys(ParseBody(deploysCall.Body));
        if (!deploysValid)
            return FromSecondaryFailure(MalformedCall(deploysCall), new RenderProviderData(service, null, false, MetricsUnavailableReason));

        var suspended = service.Suspended;
        return new ProviderCheckOutcome<RenderProviderData>(
            suspended ? ProviderStatus.Degraded : ProviderStatus.Operational,
            suspended ? "service suspended" : null,
            new RenderProviderData(service, lastDeploy, false, MetricsUnavailableReason),
            deploysCall.ElapsedMs,
            null,
            AllCallsSucceeded: true,
            TransientUpstreamFailure: false);
    }

    private static ProviderCheckOutcome<RenderProviderData> MalformedPrimary(ProviderCallOutcome call) =>
        FromCallFailure(MalformedCall(call));
}

/// <summary>Defensive mappers for the two fixed Render responses (commit messages sanitized).</summary>
internal static class RenderParser
{
    public static RenderServiceInfo? ParseService(JsonElement? root)
    {
        if (root is not { ValueKind: JsonValueKind.Object } element) return null;
        return new RenderServiceInfo(
            MonitoringJson.String(element, "id") ?? string.Empty,
            MonitoringJson.String(element, "name") ?? string.Empty,
            MonitoringJson.Bool(element, false, "suspended"),
            MonitoringJson.Bool(element, false, "autoDeploy"),
            MonitoringJson.String(element, "plan") ?? string.Empty,
            MonitoringJson.String(element, "region"));
    }

    /// <summary>Latest deploy: newest "live" deploy when present, else the newest entry.
    /// Valid=false marks a malformed payload; a valid EMPTY list yields a null LastDeploy.</summary>
    public static (bool Valid, RenderDeployInfo? LastDeploy) ParseDeploys(JsonElement? root)
    {
        if (root is not { ValueKind: JsonValueKind.Array } array) return (false, null);
        var entries = array.EnumerateArray()
            .Where(entry => entry.ValueKind == JsonValueKind.Object)
            .ToList();
        if (entries.Count == 0) return (true, null);

        var ordered = entries
            .OrderByDescending(entry => MonitoringJson.Date(entry, "createdAt") ?? DateTime.MinValue)
            .ToList();
        var live = ordered.FirstOrDefault(entry =>
            string.Equals(MonitoringJson.String(entry, "status"), "live", StringComparison.OrdinalIgnoreCase));
        var deploy = live.ValueKind == JsonValueKind.Object ? live : ordered[0];

        var commit = MonitoringJson.Property(deploy, "commit");
        return (true, new RenderDeployInfo(
            MonitoringJson.String(deploy, "id") ?? string.Empty,
            MonitoringJson.String(deploy, "status") ?? string.Empty,
            commit is null ? string.Empty : (MonitoringJson.String(commit.Value, "id") ?? string.Empty),
            MonitoringTextSanitizer.SanitizeProviderText(commit is null ? null : MonitoringJson.String(commit.Value, "message")),
            MonitoringJson.Date(deploy, "createdAt"),
            MonitoringJson.Date(deploy, "finishedAt")));
    }
}
