using System.Net;
using System.Text.Json;
using CMS.Application.DTOs.Monitoring;
using CMS.Infrastructure.Services.Monitoring;
using FluentAssertions;

namespace CMS.Tests.Unit.Services.Monitoring;

/// <summary>
/// PR-8 Neon monitor unit tests: project/branch mapping (default + pinned branch), connection
/// material never exposed, usage-unavailable honesty, missing-credentials short-circuit, 401.
/// </summary>
public sealed class NeonMonitorTests
{
    private const string NeonProjectJson = """
    {
      "project": {
        "id": "neon-proj-test",
        "name": "cms-db",
        "region": "aws-eu-central-1",
        "connection_details": { "connection_uri": "postgresql://must-never-be-mapped:5432/db" }
      }
    }
    """;

    private const string NeonBranchesJson = """
    {
      "branches": [
        { "id": "br-main", "name": "main", "is_default": true, "protected": false },
        { "id": "br-dev", "name": "dev", "is_default": false, "protected": false }
      ]
    }
    """;

    private static StubHttpMessageHandler HappyHandler() => new((request, _) => Task.FromResult(
        request.RequestUri!.AbsolutePath.EndsWith("/branches", StringComparison.Ordinal)
            ? StubResponses.Json(NeonBranchesJson)
            : StubResponses.Json(NeonProjectJson)));

    [Fact]
    public async Task HappyPath_MapsProjectAndDefaultBranch_NoConnectionMaterial()
    {
        var handler = HappyHandler();
        var monitor = MonitorFactory.Neon(handler, new RecordingCacheService(), MonitoringTestDefaults.NeonEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Provider.Should().Be("neon");
        envelope.Status.Should().Be(ProviderStatus.Operational);
        envelope.ResponseTimeMs.Should().BeGreaterOrEqualTo(0);

        envelope.Data!.Project.Should().NotBeNull();
        envelope.Data!.Project!.Id.Should().Be("neon-proj-test");
        envelope.Data!.Project!.Name.Should().Be("cms-db");
        envelope.Data!.Project!.RegionId.Should().Be("aws-eu-central-1");

        envelope.Data!.Branch.Should().NotBeNull();
        envelope.Data!.Branch!.Id.Should().Be("br-main", "the default branch is used when none is pinned");
        envelope.Data!.Branch!.Name.Should().Be("main");
        envelope.Data!.Branch!.IsDefault.Should().BeTrue();
        envelope.Data!.Branch!.Protected.Should().BeFalse();

        envelope.Data!.Usage.Should().BeNull();
        envelope.Data!.UsageUnavailableReason.Should().Be("consumption metrics not exposed by the scoped key/plan");

        // Connection material NEVER leaks: the fixture embeds a connection_details section and
        // the serialized envelope must not contain any connection string.
        var json = JsonSerializer.Serialize(envelope);
        json.Should().NotContain("postgresql");
        json.Should().NotContain("connection_uri");
        json.Should().NotContain("must-never-be-mapped");

        handler.RequestedPaths.Should().BeEquivalentTo(
            "/api/v2/projects/neon-proj-test", "/api/v2/projects/neon-proj-test/branches");
        foreach (var request in handler.Requests)
            request.RequestUri!.Host.Should().Be("api.neon.tech");
    }

    [Fact]
    public async Task PinnedBranchId_MatchesThatBranch()
    {
        var handler = HappyHandler();
        var env = MonitoringTestDefaults.With(MonitoringTestDefaults.NeonEnv,
            ("MONITORING_NEON_BRANCH_ID", "br-dev"));
        var monitor = MonitorFactory.Neon(handler, new RecordingCacheService(), env, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.Operational);
        envelope.Data!.Branch!.Id.Should().Be("br-dev");
        envelope.Data!.Branch!.Name.Should().Be("dev");
        envelope.Data!.Branch!.IsDefault.Should().BeFalse();
    }

    [Fact]
    public async Task PinnedBranchMissing_DegradedWithHonestReason()
    {
        var handler = HappyHandler();
        var env = MonitoringTestDefaults.With(MonitoringTestDefaults.NeonEnv,
            ("MONITORING_NEON_BRANCH_ID", "br-does-not-exist"));
        var monitor = MonitorFactory.Neon(handler, new RecordingCacheService(), env, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.Degraded);
        envelope.UnavailableReason.Should().Be("configured branch not found");
        envelope.Data!.Project.Should().NotBeNull();
        envelope.Data!.Branch.Should().BeNull();
    }

    [Fact]
    public async Task MissingProjectId_MissingCredentials_NoUpstreamCall()
    {
        var handler = HappyHandler();
        var monitor = MonitorFactory.Neon(handler, new RecordingCacheService(),
            MonitoringTestDefaults.Without(MonitoringTestDefaults.NeonEnv, "MONITORING_NEON_PROJECT_ID"),
            new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.MissingCredentials);
        envelope.UnavailableReason.Should().Be("بيانات الاعتماد غير مُهيّأة");
        envelope.ResponseTimeMs.Should().Be(-1);
        handler.Calls.Should().Be(0);
    }

    [Fact]
    public async Task Unauthorized401_InvalidCredentials()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Status(HttpStatusCode.Unauthorized)));
        var monitor = MonitorFactory.Neon(handler, new RecordingCacheService(), MonitoringTestDefaults.NeonEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.InvalidCredentials);
        envelope.UnavailableReason.Should().Be("provider rejected credentials (401)");
        handler.Calls.Should().Be(1);
    }

    [Fact]
    public async Task SecondCallWithinTtl_ServesCachedEnvelope()
    {
        var handler = HappyHandler();
        var cache = new RecordingCacheService();
        var time = new MutableTimeProvider();
        var monitor = MonitorFactory.Neon(handler, cache, MonitoringTestDefaults.NeonEnv, time);

        var first = await monitor.GetAsync(fresh: false);
        time.Advance(TimeSpan.FromSeconds(3));
        var second = await monitor.GetAsync(fresh: false);

        second.Freshness.Cached.Should().BeTrue();
        second.Freshness.AgeSeconds.Should().Be(3);
        second.CheckedAt.Should().Be(first.CheckedAt);
        handler.Calls.Should().Be(2);
        cache.Writes.Should().ContainSingle().Which.Expiry.Should().Be(TimeSpan.FromSeconds(60));
    }
}
