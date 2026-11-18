using CMS.Api.Controllers;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace CMS.Tests.Unit.Controllers;

/// <summary>
/// Wave 16.4 — GET /api/v1/system/version: the student-facing dynamic version
/// source (Settings → «حول»). Pure controller unit tests
/// (LeaderboardSharingEndpointTests pattern, no database needed).
/// </summary>
public sealed class SystemVersionEndpointTests
{
    private static IConfiguration ConfigWith(string? platformVersion = null)
    {
        var data = platformVersion is null
            ? new Dictionary<string, string?>()
            : new Dictionary<string, string?> { ["Platform:Version"] = platformVersion };

        return new ConfigurationBuilder().AddInMemoryCollection(data).Build();
    }

    private static SystemController ControllerWith(string? platformVersion = null)
        => new(ConfigWith(platformVersion));

    [Fact]
    public void ResolveVersion_ConfigOverrideWins()
    {
        SystemController.ResolveVersion(ConfigWith("16.4.2"))
            .Should().Be("16.4.2", "the PLATFORM__VERSION-style override must win without a redeploy");
    }

    [Fact]
    public void ResolveVersion_NullConfig_FallsBackToAssemblyVersion()
    {
        var version = SystemController.ResolveVersion(null);

        version.Should().NotBeNullOrWhiteSpace();
        version.Should().NotContain("+", "the SourceLink commit suffix must be stripped");
        version.Should().MatchRegex(@"^\d+\.\d+\.\d+", "the fallback must be a parseable semver-ish value");
    }

    [Fact]
    public void ResolveVersion_WhitespaceOverride_FallsBackToAssemblyVersion()
    {
        var version = SystemController.ResolveVersion(ConfigWith("   "));

        version.Should().NotBeNullOrWhiteSpace("whitespace must not be treated as a version");
    }

    [Fact]
    public void GetVersion_ReturnsOkWithVersionField()
    {
        var action = ControllerWith("16.4.0-test").GetVersion();

        var ok = action.Result.Should().BeOfType<OkObjectResult>().Subject;
        var dto = ok.Value.Should().BeOfType<PlatformVersionDto>().Subject;
        dto.Version.Should().Be("16.4.0-test");
    }
}
