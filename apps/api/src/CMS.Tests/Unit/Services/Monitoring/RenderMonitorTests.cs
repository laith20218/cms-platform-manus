using System.Net;
using System.Text.Json;
using CMS.Application.DTOs.Monitoring;
using CMS.Infrastructure.Services.Monitoring;
using FluentAssertions;
using Moq;

namespace CMS.Tests.Unit.Services.Monitoring;

/// <summary>
/// PR-8 Render monitor unit tests: fixture parsing + stable DTO mapping, degraded (suspended)
/// mapping, missing-credentials short-circuit, 401/429 mapping, retry-once semantics, circuit
/// breaker lifecycle, short-cache semantics, and the shared-core behavior through the concrete
/// Render monitor.
/// </summary>
public sealed class RenderMonitorTests
{
    // ===== representative provider fixture shapes (values are synthetic) =====

    private const string RenderServiceJson = """
    {
      "id": "srv-cms-test",
      "name": "cms-api-preview",
      "suspended": false,
      "autoDeploy": true,
      "plan": "free",
      "region": "oregon"
    }
    """;

    private const string RenderSuspendedServiceJson = """
    {
      "id": "srv-cms-test",
      "name": "cms-api-preview",
      "suspended": true,
      "autoDeploy": true,
      "plan": "starter",
      "region": null
    }
    """;

    private const string RenderDeploysJson = """
    [
      {
        "id": "dep-building",
        "status": "build_in_progress",
        "commit": { "id": "sha-building", "message": "wip", "createdAt": "2026-01-15T11:00:00Z" },
        "createdAt": "2026-01-15T11:00:00Z",
        "finishedAt": null
      },
      {
        "id": "dep-live-1",
        "status": "live",
        "commit": {
          "id": "c9547ac67b7e59ef37c7ec6aaf07ec9e851a3a96",
          "message": "feat: pr-8 servers dashboard monitoring password=hunter2 api_key=leak",
          "createdAt": "2026-01-15T10:00:00Z",
          "updatedAt": "2026-01-15T10:05:00Z"
        },
        "createdAt": "2026-01-15T10:00:00Z",
        "finishedAt": "2026-01-15T10:05:00Z"
      }
    ]
    """;

    private static StubHttpMessageHandler HappyHandler() => new((request, _) => Task.FromResult(
        request.RequestUri!.AbsolutePath.EndsWith("/deploys", StringComparison.Ordinal)
            ? StubResponses.Json(RenderDeploysJson)
            : StubResponses.Json(RenderServiceJson)));

    // ===== happy path: operational + stable DTO mapping =====

    [Fact]
    public async Task HappyPath_MapsOperationalEnvelope_WithSpecificStableFields()
    {
        var handler = HappyHandler();
        var cache = new RecordingCacheService();
        var time = new MutableTimeProvider();
        var monitor = MonitorFactory.Render(handler, cache, MonitoringTestDefaults.RenderEnv, time);

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Provider.Should().Be("render");
        envelope.Status.Should().Be(ProviderStatus.Operational);
        envelope.UnavailableReason.Should().BeNull();
        envelope.CheckedAt.Should().Be(time.GetUtcNow().UtcDateTime);
        envelope.ResponseTimeMs.Should().BeGreaterOrEqualTo(0);
        envelope.Freshness.Should().Be(new ProviderFreshness(false, 0));
        envelope.Data.Should().NotBeNull();

        // Specific mapped fields — proves there is no raw JSON passthrough.
        var service = envelope.Data!.Service;
        service.Should().NotBeNull();
        service!.Id.Should().Be("srv-cms-test");
        service.Name.Should().Be("cms-api-preview");
        service.Suspended.Should().BeFalse();
        service.AutoDeploy.Should().BeTrue();
        service.Plan.Should().Be("free");
        service.Region.Should().Be("oregon");

        // Latest deploy: the newest LIVE deploy is preferred over the newer building one.
        var deploy = envelope.Data!.LastDeploy;
        deploy.Should().NotBeNull();
        deploy!.Id.Should().Be("dep-live-1");
        deploy.Status.Should().Be("live");
        deploy.CommitSha.Should().Be("c9547ac67b7e59ef37c7ec6aaf07ec9e851a3a96");
        deploy.CreatedAt.Should().Be(new DateTime(2026, 1, 15, 10, 0, 0, DateTimeKind.Utc));
        deploy.FinishedAt.Should().Be(new DateTime(2026, 1, 15, 10, 5, 0, DateTimeKind.Utc));

        // Commit message is sanitized: control-flattened, secret-shaped values redacted.
        deploy.CommitMessage.Should().NotContain("hunter2");
        deploy.CommitMessage.Should().NotContain("leak");
        deploy.CommitMessage.Should().Contain("password=[REDACTED]");
        deploy.CommitMessage.Should().Contain("api_key=[REDACTED]");

        envelope.Data!.MetricsAvailable.Should().BeFalse();
        envelope.Data!.MetricsUnavailableReason.Should().Be("metrics not exposed on this plan");

        // Both fixed GETs hit the pinned base host only.
        handler.RequestedPaths.Should().BeEquivalentTo("/v1/services/srv-cms-test", "/v1/services/srv-cms-test/deploys");
        foreach (var request in handler.Requests)
        {
            request.RequestUri!.Host.Should().Be("api.render.com");
            request.Method.Should().Be(HttpMethod.Get);
            request.Headers.Authorization!.Scheme.Should().Be("Bearer");
        }
    }

    [Fact]
    public async Task SuspendedService_MapsDegraded_WithServiceSuspendedReason()
    {
        var handler = new StubHttpMessageHandler((request, _) => Task.FromResult(
            request.RequestUri!.AbsolutePath.EndsWith("/deploys", StringComparison.Ordinal)
                ? StubResponses.Json(RenderDeploysJson)
                : StubResponses.Json(RenderSuspendedServiceJson)));
        var monitor = MonitorFactory.Render(handler, new RecordingCacheService(), MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.Degraded);
        envelope.UnavailableReason.Should().Be("service suspended");
        envelope.Data!.Service!.Suspended.Should().BeTrue();
        envelope.Data!.Service!.Region.Should().BeNull();
    }

    // ===== credentials gate =====

    [Fact]
    public async Task MissingEnvNames_MissingCredentials_WithNoUpstreamCall()
    {
        var handler = HappyHandler(); // would answer happily — must never be invoked
        var cache = new RecordingCacheService();
        var monitor = MonitorFactory.Render(handler, cache,
            MonitoringTestDefaults.Without(MonitoringTestDefaults.RenderEnv, "MONITORING_RENDER_API_KEY"),
            new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.MissingCredentials);
        envelope.UnavailableReason.Should().Be("بيانات الاعتماد غير مُهيّأة");
        envelope.ResponseTimeMs.Should().Be(-1);
        envelope.Data.Should().BeNull();
        envelope.Freshness.Should().Be(new ProviderFreshness(false, 0));
        handler.Calls.Should().Be(0, "no upstream call may be attempted when credentials are missing");
    }

    [Fact]
    public async Task MissingServiceIdOnly_MissingCredentials_Too()
    {
        var handler = HappyHandler();
        var monitor = MonitorFactory.Render(handler, new RecordingCacheService(),
            MonitoringTestDefaults.Without(MonitoringTestDefaults.RenderEnv, "MONITORING_RENDER_SERVICE_ID"),
            new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.MissingCredentials);
        handler.Calls.Should().Be(0);
    }

    // ===== 401 / 429 =====

    [Fact]
    public async Task Unauthorized401_InvalidCredentials_WithoutRetry()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Status(HttpStatusCode.Unauthorized)));
        var monitor = MonitorFactory.Render(handler, new RecordingCacheService(), MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.InvalidCredentials);
        envelope.UnavailableReason.Should().Be("provider rejected credentials (401)");
        envelope.Data.Should().BeNull();
        handler.Calls.Should().Be(1, "401 is terminal — no retry, and no second fixed GET");
    }

    [Fact]
    public async Task Forbidden403_InvalidCredentials()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Status(HttpStatusCode.Forbidden)));
        var monitor = MonitorFactory.Render(handler, new RecordingCacheService(), MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.InvalidCredentials);
        envelope.UnavailableReason.Should().Be("provider rejected credentials (403)");
    }

    [Fact]
    public async Task RateLimited429_WithRetryAfter_ReportsItAndCachesShorter()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Json("{}", 30)));
        var cache = new RecordingCacheService();
        var monitor = MonitorFactory.Render(handler, cache, MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.RateLimited);
        envelope.UnavailableReason.Should().Be("provider rate limit (429); retry-after 30s");
        cache.Writes.Should().ContainSingle().Which.Expiry.Should().Be(TimeSpan.FromSeconds(30),
            "a 429 envelope caches for max(15s, Retry-After) — not the full 60s");
    }

    [Fact]
    public async Task RateLimited429_WithoutRetryAfter_MinimumFifteenSecondsTtl()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Status(HttpStatusCode.TooManyRequests)));
        var cache = new RecordingCacheService();
        var monitor = MonitorFactory.Render(handler, cache, MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.RateLimited);
        envelope.UnavailableReason.Should().Be("provider rate limit (429)");
        envelope.UnavailableReason.Should().NotContain("retry-after");
        cache.Writes.Should().ContainSingle().Which.Expiry.Should().Be(TimeSpan.FromSeconds(15));
    }

    [Fact]
    public async Task RateLimited429_RetryAfterAboveCap_CappedAtSixtySeconds()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Json("{}", 120)));
        var cache = new RecordingCacheService();
        var monitor = MonitorFactory.Render(handler, cache, MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.UnavailableReason.Should().Be("provider rate limit (429); retry-after 60s");
        cache.Writes.Should().ContainSingle().Which.Expiry.Should().Be(TimeSpan.FromSeconds(60));
    }

    // ===== retry semantics =====

    [Fact]
    public async Task ServerErrorTwice_Down_AfterExactlyOneRetry()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Status(HttpStatusCode.ServiceUnavailable)));
        var monitor = MonitorFactory.Render(handler, new RecordingCacheService(), MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.Down);
        envelope.UnavailableReason.Should().Be("upstream 503 after retry");
        handler.Calls.Should().Be(2, "exactly one retry on a transient 5xx — the second fixed GET never runs");
        envelope.ResponseTimeMs.Should().BeGreaterOrEqualTo(0);
    }

    [Fact]
    public async Task ServerErrorOnceThenSuccess_Operational()
    {
        var serviceAttempts = 0;
        var handler = new StubHttpMessageHandler((request, _) => Task.FromResult(
            request.RequestUri!.AbsolutePath.EndsWith("/deploys", StringComparison.Ordinal)
                ? StubResponses.Json(RenderDeploysJson)
                : Interlocked.Increment(ref serviceAttempts) == 1
                    ? StubResponses.Status(HttpStatusCode.InternalServerError)
                    : StubResponses.Json(RenderServiceJson)));
        var monitor = MonitorFactory.Render(handler, new RecordingCacheService(), MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.Operational);
        handler.Calls.Should().Be(3, "retry of the service GET + the deploys GET");
    }

    [Fact]
    public async Task SecondaryDeploysFailure_DegradedPartialData()
    {
        var handler = new StubHttpMessageHandler((request, _) =>
            Task.FromResult(request.RequestUri!.AbsolutePath.EndsWith("/deploys", StringComparison.Ordinal)
                ? StubResponses.Status(HttpStatusCode.BadGateway)
                : StubResponses.Json(RenderServiceJson)));
        var monitor = MonitorFactory.Render(handler, new RecordingCacheService(), MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.Degraded);
        envelope.UnavailableReason.Should().Be("partial data: upstream 502 after retry");
        envelope.Data!.Service.Should().NotBeNull();
        envelope.Data!.LastDeploy.Should().BeNull();
    }

    // ===== circuit breaker =====

    [Fact]
    public async Task TimeoutTwicePerCheck_ThreeDownChecksOpenCircuit_ThenShortCircuits()
    {
        var handler = new StubHttpMessageHandler((_, _) => throw new TaskCanceledException("simulated timeout"));
        var cache = new RecordingCacheService();
        var time = new MutableTimeProvider();
        var monitor = MonitorFactory.Render(handler, cache, MonitoringTestDefaults.RenderEnv, time);

        var first = await monitor.GetAsync(fresh: true);
        var second = await monitor.GetAsync(fresh: true);
        var third = await monitor.GetAsync(fresh: true);

        first.Status.Should().Be(ProviderStatus.Down);
        first.UnavailableReason.Should().Be("upstream timeout");
        second.Status.Should().Be(ProviderStatus.Down);
        third.Status.Should().Be(ProviderStatus.Down);
        handler.Calls.Should().Be(6, "three checks x two timeout attempts (initial + single retry)");

        // The circuit is now OPEN after the third consecutive down check — the next check
        // short-circuits with NO upstream call at all.
        var fourth = await monitor.GetAsync(fresh: true);
        fourth.Status.Should().Be(ProviderStatus.Unavailable);
        fourth.UnavailableReason.Should().Be("circuit open (recent consecutive upstream failures)");
        fourth.ResponseTimeMs.Should().Be(-1);
        handler.Calls.Should().Be(6, "circuit-open short-circuit performs no HTTP call");
    }

    [Fact]
    public async Task Circuit_ClosesAfterOpenWindow_WhenProbeSucceeds()
    {
        var failing = true;
        var handler = new StubHttpMessageHandler((request, _) =>
        {
            if (failing) throw new HttpRequestException("simulated network error");
            return Task.FromResult(request.RequestUri!.AbsolutePath.EndsWith("/deploys", StringComparison.Ordinal)
                ? StubResponses.Json(RenderDeploysJson)
                : StubResponses.Json(RenderServiceJson));
        });
        var time = new MutableTimeProvider();
        var monitor = MonitorFactory.Render(handler, new RecordingCacheService(), MonitoringTestDefaults.RenderEnv, time);

        await monitor.GetAsync(fresh: true);
        await monitor.GetAsync(fresh: true);
        await monitor.GetAsync(fresh: true);
        await monitor.GetAsync(fresh: true); // circuit-open short-circuit
        var callsWhileBroken = handler.Calls;

        time.Advance(TimeSpan.FromSeconds(61)); // open window (60s) elapses
        failing = false; // the probe now succeeds
        var probe = await monitor.GetAsync(fresh: true);
        probe.Status.Should().Be(ProviderStatus.Operational, "circuit closed: probe answered 2xx");
        handler.Calls.Should().BeGreaterThan(callsWhileBroken, "the probe actually called upstream");

        // Counter reset: three NEW failures would be needed to trip again.
        failing = true;
        await monitor.GetAsync(fresh: true);
        var notYetReopened = await monitor.GetAsync(fresh: true);
        notYetReopened.Status.Should().Be(ProviderStatus.Down, "one/two failures after reset do not open the circuit");
        handler.Calls.Should().BeGreaterThan(callsWhileBroken + 2);
    }

    [Fact]
    public async Task Circuit_DoesNotTrip_OnInvalidCredentialsOrRateLimit()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Status(HttpStatusCode.Unauthorized)));
        var time = new MutableTimeProvider();
        var monitor = MonitorFactory.Render(handler, new RecordingCacheService(), MonitoringTestDefaults.RenderEnv, time);

        for (var i = 0; i < 5; i++)
        {
            var envelope = await monitor.GetAsync(fresh: true);
            envelope.Status.Should().Be(ProviderStatus.InvalidCredentials);
        }

        handler.Calls.Should().Be(5, "invalid credentials never open the circuit — every check still goes upstream");
    }

    // ===== short cache =====

    [Fact]
    public async Task SecondCallWithinTtl_ServesCachedEnvelope_WithOriginalCheckedAt()
    {
        var handler = HappyHandler();
        var cache = new RecordingCacheService();
        var time = new MutableTimeProvider();
        var monitor = MonitorFactory.Render(handler, cache, MonitoringTestDefaults.RenderEnv, time);

        var first = await monitor.GetAsync(fresh: false);

        time.Advance(TimeSpan.FromSeconds(10));
        var second = await monitor.GetAsync(fresh: false);

        second.Freshness.Cached.Should().BeTrue();
        second.Freshness.AgeSeconds.Should().Be(10);
        second.CheckedAt.Should().Be(first.CheckedAt, "a cache hit keeps the ORIGINAL check timestamp");
        second.Status.Should().Be(ProviderStatus.Operational);
        second.ResponseTimeMs.Should().Be(first.ResponseTimeMs);
        handler.Calls.Should().Be(2, "the second call within the TTL performs no HTTP call");
        cache.Writes.Should().ContainSingle().Which.Expiry.Should().Be(TimeSpan.FromSeconds(60));
    }

    [Fact]
    public async Task FreshTrue_BypassesCacheRead_AndWritesBack()
    {
        var handler = HappyHandler();
        var cache = new RecordingCacheService();
        var time = new MutableTimeProvider();
        var monitor = MonitorFactory.Render(handler, cache, MonitoringTestDefaults.RenderEnv, time);

        await monitor.GetAsync(fresh: false);
        time.Advance(TimeSpan.FromSeconds(10));
        var refreshed = await monitor.GetAsync(fresh: true);

        refreshed.Freshness.Should().Be(new ProviderFreshness(false, 0));
        refreshed.CheckedAt.Should().Be(time.GetUtcNow().UtcDateTime);
        handler.Calls.Should().Be(4, "?fresh=true re-issued both fixed GETs");
        cache.Writes.Should().HaveCount(2, "the refreshed envelope is written back to the cache");
    }

    // ===== history ring =====

    [Fact]
    public async Task History_RecordsChecks_BoundedAndNewestFirst()
    {
        var handler = HappyHandler();
        var cache = new RecordingCacheService();
        var monitor = MonitorFactory.Render(handler, cache, MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        await monitor.GetAsync(fresh: true);
        await monitor.GetAsync(fresh: false); // cache hit — NOT recorded again
        await monitor.GetAsync(fresh: true); // fresh — recorded

        var history = monitor.GetHistory();
        history.Capacity.Should().Be(50);
        history.Items.Should().HaveCount(2, "cache hits are not new checks");
        history.Items[0].Status.Should().Be(ProviderStatus.Operational);
        history.Items[0].ResponseTimeMs.Should().BeGreaterOrEqualTo(0);
        history.Items[0].Reason.Should().BeNull();
    }

    // ===== circuit-breaker concurrency smoke =====

    [Fact]
    public async Task ParallelChecks_DoNotCorruptCircuitOrHistory()
    {
        var handler = new StubHttpMessageHandler((_, _) => throw new HttpRequestException("simulated network error"));
        var cache = new RecordingCacheService();
        var monitor = MonitorFactory.Render(handler, cache, MonitoringTestDefaults.RenderEnv, new MutableTimeProvider());

        var envelopes = await Task.WhenAll(Enumerable.Range(0, 30).Select(_ => monitor.GetAsync(fresh: true)));

        envelopes.Should().OnlyContain(envelope =>
            envelope.Status == ProviderStatus.Down || envelope.Status == ProviderStatus.Unavailable,
            "parallel failing checks either go upstream (down) or observe the freshly-opened circuit (unavailable)");
        var history = monitor.GetHistory();
        history.Items.Should().HaveCount(envelopes.Length, "every completed check is recorded exactly once");

        // The single-threaded follow-up still behaves: the circuit is open (counter >= 3).
        var after = await monitor.GetAsync(fresh: true);
        after.Status.Should().Be(ProviderStatus.Unavailable);
        after.UnavailableReason.Should().Be("circuit open (recent consecutive upstream failures)");
    }

    // ===== wire contract (camelCase envelope shape) =====

    [Fact]
    public void Envelope_SerializesWithCamelCaseStableContract()
    {
        var data = new RenderProviderData(
            new RenderServiceInfo("srv-1", "svc", false, true, "free", "oregon"),
            new RenderDeployInfo("dep-1", "live", "sha", "msg", null, null),
            MetricsAvailable: false,
            MetricsUnavailableReason: "metrics not exposed on this plan");
        var envelope = new ProviderEnvelope<RenderProviderData>(
            "render", ProviderStatus.Operational, new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc),
            42, null, new ProviderFreshness(false, 0), data);

        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        var json = JsonSerializer.Serialize(envelope, options);
        var root = JsonDocument.Parse(json).RootElement;

        root.EnumerateObject().Select(property => property.Name).Should().BeEquivalentTo(
            "provider", "status", "checkedAt", "responseTimeMs", "unavailableReason", "freshness", "data");
        root.GetProperty("freshness").EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo("cached", "ageSeconds");
        root.GetProperty("data").EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo("service", "lastDeploy", "metricsAvailable", "metricsUnavailableReason");
    }
}
