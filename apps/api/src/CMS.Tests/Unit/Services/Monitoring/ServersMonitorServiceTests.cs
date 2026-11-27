using CMS.Application.DTOs.Monitoring;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Services.Monitoring;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CMS.Tests.Unit.Services.Monitoring;

/// <summary>
/// PR-8 orchestrator unit tests: overall-status computation, parallel summary assembly with
/// one-line per-provider notes, and history routing (unknown provider → null for a 404).
/// </summary>
public sealed class ServersMonitorServiceTests
{
    private readonly Mock<IRenderMonitor> _render = new();
    private readonly Mock<IVercelMonitor> _vercel = new();
    private readonly Mock<INeonMonitor> _neon = new();
    private readonly Mock<IGithubMonitor> _github = new();
    private readonly MutableTimeProvider _time = new();

    private ServersMonitorService Service() => new(
        _render.Object, _vercel.Object, _neon.Object, _github.Object, _time,
        NullLogger<ServersMonitorService>.Instance);

    private static ProviderEnvelope<RenderProviderData> RenderEnvelope(string status, string? reason = null) => new(
        ServerProviders.Render, status, new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc), 10, reason,
        new ProviderFreshness(false, 0),
        status == ProviderStatus.Operational
            ? new RenderProviderData(
                new RenderServiceInfo("srv-1", "cms-api-preview", Suspended: false, AutoDeploy: true, "free", "oregon"),
                new RenderDeployInfo("dep-1", "live", "c9547ac67b7e59ef37c7ec6aaf07ec9e851a3a96", "feat", null, null),
                false, "metrics not exposed on this plan")
            : null);

    private static ProviderEnvelope<VercelProviderData> VercelEnvelope(string status, string? reason = null) => new(
        ServerProviders.Vercel, status, new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc), 20, reason,
        new ProviderFreshness(false, 0),
        status == ProviderStatus.Operational
            ? new VercelProviderData(new[]
            {
                new VercelProjectInfo("prj-1", "cms-admin-web",
                    new VercelDeploymentInfo("dpl-1", "READY", "production", "abc123", "main", null, null), "cms-admin-web.vercel.app"),
                new VercelProjectInfo("prj-2", "cms-student-web",
                    new VercelDeploymentInfo("dpl-2", "READY", "preview", "stu999", "feat/x", null, null), "cms-student-web.vercel.app")
            })
            : null);

    private static ProviderEnvelope<NeonProviderData> NeonEnvelope(string status, string? reason = null) => new(
        ServerProviders.Neon, status, new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc), 30, reason,
        new ProviderFreshness(false, 0),
        status == ProviderStatus.Operational
            ? new NeonProviderData(
                new NeonProjectInfo("neon-1", "cms-db", "aws-eu-central-1"),
                new NeonBranchInfo("br-1", "main", true, false, null),
                null, "consumption metrics not exposed by the scoped key/plan")
            : null);

    private static ProviderEnvelope<GithubProviderData> GithubEnvelope(string status, string? reason = null) => new(
        ServerProviders.Github, status, new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc), 40, reason,
        new ProviderFreshness(false, 0),
        status == ProviderStatus.Operational
            ? new GithubProviderData(
                new GithubRepositoryInfo("repo", "owner/repo", "private", "main", null, 2),
                new[] { new GithubWorkflowRunInfo(123, "CI", "sha1", "completed", "success", null, null) })
            : null);

    private void SetupMonitorStatuses(
        string render, string vercel, string neon, string github,
        string? renderReason = null, string? vercelReason = null, string? neonReason = null, string? githubReason = null)
    {
        _render.Setup(m => m.GetAsync(It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(RenderEnvelope(render, renderReason));
        _vercel.Setup(m => m.GetAsync(It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(VercelEnvelope(vercel, vercelReason));
        _neon.Setup(m => m.GetAsync(It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(NeonEnvelope(neon, neonReason));
        _github.Setup(m => m.GetAsync(It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(GithubEnvelope(github, githubReason));
    }

    [Fact]
    public async Task AllOperational_Healthy_WithNotes()
    {
        SetupMonitorStatuses(ProviderStatus.Operational, ProviderStatus.Operational, ProviderStatus.Operational, ProviderStatus.Operational);

        var summary = await Service().GetSummaryAsync();

        summary.OverallStatus.Should().Be(ServersOverallStatus.Healthy);
        summary.Providers.Should().HaveCount(4);
        summary.Providers.Select(head => head.Provider).Should().BeEquivalentTo(
            new[] { "render", "vercel", "neon", "github" }, options => options.WithStrictOrdering());
        summary.Providers[0].Status.Should().Be(ProviderStatus.Operational);
        summary.Providers[0].ResponseTimeMs.Should().Be(10);
        summary.Providers[0].Note.Should().Be("service cms-api-preview · plan free · deploy live @ c9547ac6");
        summary.Providers[1].Note.Should().Be("2 projects · latest READY");
        summary.Providers[2].Note.Should().Be("project cms-db · branch main");
        summary.Providers[3].Note.Should().Be("repo owner/repo · last workflow success");
    }

    [Fact]
    public async Task MixedOperationalAndDegraded_Degraded()
    {
        SetupMonitorStatuses(ProviderStatus.Operational, ProviderStatus.Degraded, ProviderStatus.Operational, ProviderStatus.Operational);

        (await Service().GetSummaryAsync()).OverallStatus.Should().Be(ServersOverallStatus.Degraded);
    }

    [Fact]
    public async Task OneOperationalThreeMissing_Degraded()
    {
        SetupMonitorStatuses(ProviderStatus.Operational, ProviderStatus.MissingCredentials,
            ProviderStatus.MissingCredentials, ProviderStatus.MissingCredentials,
            vercelReason: "بيانات الاعتماد غير مُهيّأة");

        var summary = await Service().GetSummaryAsync();
        summary.OverallStatus.Should().Be(ServersOverallStatus.Degraded);
        summary.Providers[1].Note.Should().Be("credentials not configured");
    }

    [Fact]
    public async Task AllDown_Down()
    {
        SetupMonitorStatuses(ProviderStatus.Down, ProviderStatus.Down, ProviderStatus.Down, ProviderStatus.Down, "upstream timeout");

        var summary = await Service().GetSummaryAsync();
        summary.OverallStatus.Should().Be(ServersOverallStatus.Down);
        summary.Providers[0].Note.Should().Be("upstream down");
    }

    [Fact]
    public async Task AllMissingCredentials_Unavailable()
    {
        SetupMonitorStatuses(ProviderStatus.MissingCredentials, ProviderStatus.MissingCredentials,
            ProviderStatus.MissingCredentials, ProviderStatus.MissingCredentials,
            renderReason: "بيانات الاعتماد غير مُهيّأة", vercelReason: "بيانات الاعتماد غير مُهيّأة",
            neonReason: "بيانات الاعتماد غير مُهيّأة", githubReason: "بيانات الاعتماد غير مُهيّأة");

        var summary = await Service().GetSummaryAsync();
        summary.OverallStatus.Should().Be(ServersOverallStatus.Unavailable);
        summary.Providers.Should().OnlyContain(head => head.Status == ProviderStatus.MissingCredentials);
    }

    [Fact]
    public async Task DownMixedWithMissingWithoutOperational_Unavailable()
    {
        SetupMonitorStatuses(ProviderStatus.Down, ProviderStatus.MissingCredentials, ProviderStatus.InvalidCredentials, ProviderStatus.Down,
            renderReason: "upstream timeout", neonReason: "provider rejected credentials (401)");

        (await Service().GetSummaryAsync()).OverallStatus.Should().Be(ServersOverallStatus.Unavailable);
    }

    [Fact]
    public async Task GetProviderHistory_RoutesKnownProviders_ReturnsNullForUnknown()
    {
        _render.Setup(m => m.ProviderName).Returns(ServerProviders.Render);
        _render.Setup(m => m.GetHistory()).Returns(new ProviderHistorySnapshot(50, new[]
        {
            new ProviderHistoryItem(new DateTime(2026, 1, 15, 12, 0, 0, DateTimeKind.Utc), ProviderStatus.Operational, 10, null)
        }));

        var service = Service();
        var history = service.GetProviderHistory(ServerProviders.Render);

        history!.Provider.Should().Be(ServerProviders.Render);
        history.Capacity.Should().Be(50);
        history.WindowNote.Should().Contain("السجل في الذاكرة منذ آخر إعادة تشغيل للخدمة");
        history.WindowNote.Should().Contain("in-memory history since the last API restart");
        history.Items.Should().ContainSingle().Which.Status.Should().Be(ProviderStatus.Operational);

        service.GetProviderHistory("not-a-provider").Should().BeNull();
    }

    [Fact]
    public async Task DetailMethods_RouteToTheRightMonitor()
    {
        _render.Setup(m => m.GetAsync(true, "cid-1", It.IsAny<CancellationToken>())).ReturnsAsync(RenderEnvelope(ProviderStatus.Operational)).Verifiable();
        _vercel.Setup(m => m.GetAsync(false, null, It.IsAny<CancellationToken>())).ReturnsAsync(VercelEnvelope(ProviderStatus.Operational)).Verifiable();
        _neon.Setup(m => m.GetAsync(false, null, It.IsAny<CancellationToken>())).ReturnsAsync(NeonEnvelope(ProviderStatus.Operational)).Verifiable();
        _github.Setup(m => m.GetAsync(false, null, It.IsAny<CancellationToken>())).ReturnsAsync(GithubEnvelope(ProviderStatus.Operational)).Verifiable();

        var service = Service();
        (await service.GetRenderAsync(true, "cid-1")).Status.Should().Be(ProviderStatus.Operational);
        (await service.GetVercelAsync()).Status.Should().Be(ProviderStatus.Operational);
        (await service.GetNeonAsync()).Status.Should().Be(ProviderStatus.Operational);
        (await service.GetGithubAsync()).Status.Should().Be(ProviderStatus.Operational);

        _render.VerifyAll();
        _vercel.VerifyAll();
        _neon.VerifyAll();
        _github.VerifyAll();
    }
}
