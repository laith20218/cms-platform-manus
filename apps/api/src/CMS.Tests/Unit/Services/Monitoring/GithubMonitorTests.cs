using System.Net;
using System.Text;
using CMS.Application.DTOs.Monitoring;
using CMS.Infrastructure.Services.Monitoring;
using FluentAssertions;

namespace CMS.Tests.Unit.Services.Monitoring;

/// <summary>
/// PR-8 GitHub monitor unit tests: repository + recent workflow mapping (bounded to 5),
/// missing-credentials short-circuit, 401/429 handling, malformed secondary payload degradation.
/// </summary>
public sealed class GithubMonitorTests
{
    private const string RepoJson = """
    {
      "name": "test-repo",
      "full_name": "test-owner/test-repo",
      "visibility": "private",
      "default_branch": "main",
      "pushed_at": "2026-01-15T11:00:00Z",
      "open_issues_count": 3
    }
    """;

    private static string RunsJson(int count)
    {
        var builder = new StringBuilder("{\"workflow_runs\":[");
        for (var i = 1; i <= count; i++)
        {
            if (i > 1) builder.Append(',');
            builder.Append("{\"id\": ").Append(1000 + i)
                .Append(", \"name\": \"CI workflow ").Append(i).Append('"')
                .Append(", \"head_sha\": \"sha").Append(i).Append('"')
                .Append(", \"status\": \"completed\", \"conclusion\": \"success\"")
                .Append(", \"created_at\": \"2026-01-15T11:00:00Z\", \"updated_at\": \"2026-01-15T11:00:30Z\"}");
        }
        builder.Append("],\"total_count\":");
        builder.Append(count);
        builder.Append('}');
        return builder.ToString();
    }

    private static StubHttpMessageHandler HappyHandler(int runCount = 2) => new((request, _) => Task.FromResult(
        request.RequestUri!.AbsolutePath.EndsWith("/actions/runs", StringComparison.Ordinal)
            ? StubResponses.Json(RunsJson(runCount))
            : StubResponses.Json(RepoJson)));

    [Fact]
    public async Task HappyPath_MapsRepositoryAndRecentWorkflows()
    {
        var handler = HappyHandler();
        var monitor = MonitorFactory.Github(handler, new RecordingCacheService(), MonitoringTestDefaults.GithubEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Provider.Should().Be("github");
        envelope.Status.Should().Be(ProviderStatus.Operational);
        envelope.ResponseTimeMs.Should().BeGreaterOrEqualTo(0);

        var repository = envelope.Data!.Repository;
        repository.Should().NotBeNull();
        repository!.Name.Should().Be("test-repo");
        repository.FullName.Should().Be("test-owner/test-repo");
        repository.Visibility.Should().Be("private");
        repository.DefaultBranch.Should().Be("main");
        repository.PushedAt.Should().Be(new DateTime(2026, 1, 15, 11, 0, 0, DateTimeKind.Utc));
        repository.OpenIssuesCount.Should().Be(3);

        envelope.Data!.RecentWorkflows.Should().HaveCount(2);
        var workflow = envelope.Data!.RecentWorkflows[0];
        workflow.Id.Should().Be(1001);
        workflow.Name.Should().Be("CI workflow 1");
        workflow.HeadSha.Should().Be("sha1");
        workflow.Status.Should().Be("completed");
        workflow.Conclusion.Should().Be("success");

        handler.RequestedPaths.Should().BeEquivalentTo(
            "/repos/test-owner/test-repo", "/repos/test-owner/test-repo/actions/runs");
        handler.Requests[1].RequestUri!.Query.Should().Contain("per_page=5");
        foreach (var request in handler.Requests)
            request.RequestUri!.Host.Should().Be("api.github.com");
    }

    [Fact]
    public async Task WorkflowRuns_CappedAtFive()
    {
        var handler = HappyHandler(runCount: 7);
        var monitor = MonitorFactory.Github(handler, new RecordingCacheService(), MonitoringTestDefaults.GithubEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Data!.RecentWorkflows.Should().HaveCount(5, "the DTO caps recent workflows at 5");
    }

    [Fact]
    public async Task MissingEnvNames_MissingCredentials_NoUpstreamCall()
    {
        var handler = HappyHandler();
        var monitor = MonitorFactory.Github(handler, new RecordingCacheService(),
            MonitoringTestDefaults.Without(MonitoringTestDefaults.GithubEnv, "MONITORING_GITHUB_TOKEN", "MONITORING_GITHUB_REPOSITORY"),
            new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.MissingCredentials);
        envelope.UnavailableReason.Should().Be("بيانات الاعتماد غير مُهيّأة");
        envelope.ResponseTimeMs.Should().Be(-1);
        handler.Calls.Should().Be(0);
    }

    [Fact]
    public async Task Unauthorized401_InvalidCredentials_WithoutRetry()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Status(HttpStatusCode.Unauthorized)));
        var monitor = MonitorFactory.Github(handler, new RecordingCacheService(), MonitoringTestDefaults.GithubEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.InvalidCredentials);
        envelope.UnavailableReason.Should().Be("provider rejected credentials (401)");
        handler.Calls.Should().Be(1);
    }

    [Fact]
    public async Task RateLimited429_RateLimitedWithShortTtl()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(StubResponses.Json("{}", 45)));
        var cache = new RecordingCacheService();
        var monitor = MonitorFactory.Github(handler, cache, MonitoringTestDefaults.GithubEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.RateLimited);
        envelope.UnavailableReason.Should().Be("provider rate limit (429); retry-after 45s");
        cache.Writes.Should().ContainSingle().Which.Expiry.Should().Be(TimeSpan.FromSeconds(45));
    }

    [Fact]
    public async Task MalformedRunsBody_DegradedPartialWithRepository()
    {
        var handler = new StubHttpMessageHandler((request, _) => Task.FromResult(
            request.RequestUri!.AbsolutePath.EndsWith("/actions/runs", StringComparison.Ordinal)
                ? StubResponses.Json("{\"not_runs\": true}")
                : StubResponses.Json(RepoJson)));
        var monitor = MonitorFactory.Github(handler, new RecordingCacheService(), MonitoringTestDefaults.GithubEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.Degraded);
        envelope.UnavailableReason.Should().Be("partial data: malformed upstream response");
        envelope.Data!.Repository.Should().NotBeNull();
        envelope.Data!.RecentWorkflows.Should().BeEmpty();
    }

    [Fact]
    public async Task EmptyWorkflowRuns_OperationalWithNoRuns()
    {
        var handler = new StubHttpMessageHandler((request, _) => Task.FromResult(
            request.RequestUri!.AbsolutePath.EndsWith("/actions/runs", StringComparison.Ordinal)
                ? StubResponses.Json("{\"workflow_runs\": [], \"total_count\": 0}")
                : StubResponses.Json(RepoJson)));
        var monitor = MonitorFactory.Github(handler, new RecordingCacheService(), MonitoringTestDefaults.GithubEnv, new MutableTimeProvider());

        var envelope = await monitor.GetAsync(fresh: true);

        envelope.Status.Should().Be(ProviderStatus.Operational);
        envelope.Data!.RecentWorkflows.Should().BeEmpty();
    }
}
