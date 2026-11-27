using System.Net;
using CMS.Application.DTOs.Monitoring;
using CMS.Infrastructure.Services.Monitoring;
using FluentAssertions;

namespace CMS.Tests.Unit.Services.Monitoring;

/// <summary>
/// PR-8 Vercel monitor unit tests: both projects mapped with latest deployments, missing-credential
/// short-circuit, provider-wide 401/429 handling, partial-data degradation, cache semantics.
/// </summary>
public sealed class VercelMonitorTests
{
    private const string AdminProjectJson = """
    {
      "id": "prj_admin_test",
      "name": "cms-admin-web",
      "url": "cms-admin-web.vercel.app"
    }
    """;

    private const string StudentProjectJson = """
    {
      "id": "prj_student_test",
      "name": "cms-student-web",
      "targets": { "production": { "url": "cms-student-web.vercel.app", "alias": ["cms-student-web.vercel.app"] } }
    }
    """;

    private const string AdminDeploymentsJson = """
    {
      "deployments": [
        {
          "uid": "dpl_admin_2",
          "state": "READY",
          "target": "preview",
          "meta": { "gitSource": { "commitSha": "abc123def", "commitRef": "feat/pr-8" } },
          "created": 1760000100000,
          "ready": 1760000160000
        },
        {
          "uid": "dpl_admin_1",
          "state": "READY",
          "target": "production",
          "meta": { "gitSource": { "commitSha": "c9547ac", "commitRef": "main" } },
          "created": 1759999000000,
          "ready": 1759999600000
        }
      ]
    }
    """;

    private const string StudentDeploymentsJson = """
    {
      "deployments": [
        {
          "uid": "dpl_student_1",
          "state": "READY",
          "target": "production",
          "meta": { "gitSource": { "commitSha": "stu999", "commitRef": "main" } },
          "created": 1760001000000,
          "ready": 1760001600000
        }
      ]
    }
    """;

    private static StubHttpMessageHandler HappyHandler() => new((request, _) =>
    {
        var path = request.RequestUri!.AbsolutePath;
        var query = request.RequestUri!.Query;
        return Task.FromResult(path switch
        {
            "/v9/projects/prj_admin_test" => StubResponses.Json(AdminProjectJson),
            "/v9/projects/prj_student_test" => StubResponses.Json(StudentProjectJson),
            _ when path == "/v6/deployments" && query.Contains("projectId=prj_admin_test", StringComparison.Ordinal)
                => StubResponses.Json(AdminDeploymentsJson),
            _ when path == "/v6/deployments" && query.Contains("projectId=prj_student_test", StringComparison.Ordinal)
                => StubResponses.Json(StudentDeploymentsJson),
            _ => StubResponses.Json("{}", HttpStatusCode.NotFound)
        });
    });

    [Fact]
    public async Task HappyPath_MapsBothProjectsWithLatestDeployment()
    {
        var handler = HappyHandler();
        var cache = new RecordingCacheService();
        var monitor = MonitorFactory.Vercel(handler, cache, MonitoringTestDefaults.VercelEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Provider.Should().Be("vercel");
        envelope.Status.Should().Be(ProviderStatus.Operational);
        envelope.UnavailableReason.Should().BeNull();
        envelope.ResponseTimeMs.Should().BeGreaterOrEqualTo(0);

        var projects = envelope.Data!.Projects;
        projects.Should().HaveCount(2);

        // Admin project: fixed id/name/url mapping + the NEWEST deployment (the preview one).
        projects[0].Id.Should().Be("prj_admin_test");
        projects[0].Name.Should().Be("cms-admin-web");
        projects[0].Url.Should().Be("cms-admin-web.vercel.app");
        var adminDeployment = projects[0].LatestDeployment;
        adminDeployment.Should().NotBeNull();
        adminDeployment!.Id.Should().Be("dpl_admin_2", "the single deployments list yields the newest entry");
        adminDeployment.State.Should().Be("READY");
        adminDeployment.Target.Should().Be("preview");
        adminDeployment.CommitSha.Should().Be("abc123def");
        adminDeployment.CommitRef.Should().Be("feat/pr-8");
        adminDeployment.CreatedAt.Should().Be(DateTimeOffset.FromUnixTimeMilliseconds(1760000100000).UtcDateTime);
        adminDeployment.ReadyAt.Should().Be(DateTimeOffset.FromUnixTimeMilliseconds(1760000160000).UtcDateTime);

        // Student project: url resolved via targets.production; production deployment mapped.
        projects[1].Id.Should().Be("prj_student_test");
        projects[1].Name.Should().Be("cms-student-web");
        projects[1].Url.Should().Be("cms-student-web.vercel.app");
        projects[1].LatestDeployment!.Id.Should().Be("dpl_student_1");
        projects[1].LatestDeployment!.Target.Should().Be("production");

        handler.Calls.Should().Be(4, "project + deployments GETs for BOTH admin and student projects");
        foreach (var request in handler.Requests)
            request.RequestUri!.Host.Should().Be("api.vercel.com");
    }

    [Fact]
    public async Task MissingProjectIds_MissingCredentials_NoUpstreamCall()
    {
        var handler = HappyHandler();
        var monitor = MonitorFactory.Vercel(handler, new RecordingCacheService(),
            MonitoringTestDefaults.Without(MonitoringTestDefaults.VercelEnv, "MONITORING_VERCEL_ADMIN_PROJECT_ID"),
            new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.MissingCredentials);
        envelope.UnavailableReason.Should().Be("بيانات الاعتماد غير مُهيّأة");
        envelope.ResponseTimeMs.Should().Be(-1);
        handler.Calls.Should().Be(0);
    }

    [Fact]
    public async Task Unauthorized401_InvalidCredentials_NoSecondCall()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Status(HttpStatusCode.Unauthorized)));
        var monitor = MonitorFactory.Vercel(handler, new RecordingCacheService(), MonitoringTestDefaults.VercelEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.InvalidCredentials);
        envelope.UnavailableReason.Should().Be("provider rejected credentials (401)");
        handler.Calls.Should().Be(1);
    }

    [Fact]
    public async Task RateLimitedOnStudentProjectCall_RateLimitedProviderWide()
    {
        var handler = new StubHttpMessageHandler((request, _) =>
        {
            if (request.RequestUri!.AbsolutePath == "/v9/projects/prj_student_test")
                return Task.FromResult(StubResponses.Json("{}", 25));
            if (request.RequestUri!.AbsolutePath == "/v9/projects/prj_admin_test")
                return Task.FromResult(StubResponses.Json(AdminProjectJson));
            return Task.FromResult(StubResponses.Json(AdminDeploymentsJson));
        });
        var cache = new RecordingCacheService();
        var monitor = MonitorFactory.Vercel(handler, cache, MonitoringTestDefaults.VercelEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        // 429 is provider-wide (quota): it wins over the degraded-partial mapping even though
        // the admin project was already fetched.
        envelope.Status.Should().Be(ProviderStatus.RateLimited);
        envelope.UnavailableReason.Should().Be("provider rate limit (429); retry-after 25s");
        envelope.Data.Should().BeNull();
        cache.Writes.Should().ContainSingle().Which.Expiry.Should().Be(TimeSpan.FromSeconds(25));
        handler.Calls.Should().Be(3, "admin project + admin deployments + the failing student project call");
    }

    [Fact]
    public async Task StudentDeploymentsFail_DegradedPartialWithBothProjectRows()
    {
        var handler = new StubHttpMessageHandler((request, _) =>
        {
            var path = request.RequestUri!.AbsolutePath;
            var query = request.RequestUri!.Query;
            if (path == "/v6/deployments" && query.Contains("projectId=prj_student_test", StringComparison.Ordinal))
                return Task.FromResult(StubResponses.Status(HttpStatusCode.InternalServerError));
            if (path == "/v9/projects/prj_admin_test")
                return Task.FromResult(StubResponses.Json(AdminProjectJson));
            if (path == "/v9/projects/prj_student_test")
                return Task.FromResult(StubResponses.Json(StudentProjectJson));
            return Task.FromResult(StubResponses.Json(AdminDeploymentsJson));
        });
        var monitor = MonitorFactory.Vercel(handler, new RecordingCacheService(), MonitoringTestDefaults.VercelEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.Degraded);
        envelope.UnavailableReason.Should().Be("partial data: upstream 500 after retry");
        envelope.Data!.Projects.Should().HaveCount(2, "both project rows stay visible; the failed part is null");
        envelope.Data!.Projects[0].LatestDeployment.Should().NotBeNull();
        envelope.Data!.Projects[1].LatestDeployment.Should().BeNull();
    }

    [Fact]
    public async Task SecondCallWithinTtl_ServesCachedEnvelope()
    {
        var handler = HappyHandler();
        var cache = new RecordingCacheService();
        var time = new MutableTimeProvider();
        var monitor = MonitorFactory.Vercel(handler, cache, MonitoringTestDefaults.VercelEnv, time);

        var first = await monitor.GetAsync(fresh: false);
        time.Advance(TimeSpan.FromSeconds(5));
        var second = await monitor.GetAsync(fresh: false);

        second.Freshness.Cached.Should().BeTrue();
        second.Freshness.AgeSeconds.Should().Be(5);
        second.CheckedAt.Should().Be(first.CheckedAt);
        handler.Calls.Should().Be(4, "the cached summary performs no additional HTTP calls");
        cache.Writes.Should().ContainSingle().Which.Expiry.Should().Be(TimeSpan.FromSeconds(60));
    }
}
