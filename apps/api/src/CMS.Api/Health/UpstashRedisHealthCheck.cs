using CMS.Infrastructure.Services;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace CMS.Api.Health;

/// <summary>
/// Verifies that the configured Upstash Redis REST endpoint accepts authenticated commands.
/// </summary>
public sealed class UpstashRedisHealthCheck : IHealthCheck
{
    private readonly UpstashRedisRestCacheService _cache;

    public UpstashRedisHealthCheck(UpstashRedisRestCacheService cache)
    {
        _cache = cache;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var reachable = await _cache.PingAsync(cancellationToken);
            return reachable
                ? HealthCheckResult.Healthy("Upstash Redis REST endpoint is reachable")
                : HealthCheckResult.Unhealthy("Upstash Redis REST endpoint returned an unexpected PING response");
        }
        catch (Exception exception)
        {
            return HealthCheckResult.Unhealthy("Upstash Redis REST endpoint is unavailable", exception);
        }
    }
}
