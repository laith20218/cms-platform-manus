using System.Text.Json;
using FluentAssertions;
using CMS.Infrastructure.Security;

namespace CMS.Tests.Unit.Security;

/// <summary>
/// Push 2 / Track 2: User-Agent summarizer feeding UserSession.DeviceDetails (jsonb).
/// </summary>
public class DeviceDetailsParserTests
{
    [Theory]
    [InlineData(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Chrome", "Windows", "desktop")]
    [InlineData(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
        "Safari", "macOS", "desktop")]
    [InlineData(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
        "Safari", "iOS", "mobile")]
    [InlineData(
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
        "Chrome", "Android", "mobile")]
    [InlineData("curl/8.5.0", "curl", null, "desktop")]
    [InlineData("python-requests/2.31.0", "Python client", null, "desktop")]
    public void Parse_ProducesBrowserOsDeviceType(string userAgent, string? browser, string? os, string deviceType)
    {
        var result = DeviceDetailsParser.Parse(userAgent);

        result.Should().NotBeNull();
        var parsed = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(result!)!;
        if (browser is null)
            parsed.Should().NotContainKey("browser");
        else
            parsed["browser"].GetString().Should().Be(browser);
        if (os is null)
            parsed.Should().NotContainKey("os");
        else
            parsed["os"].GetString().Should().Be(os);
        parsed["deviceType"].GetString().Should().Be(deviceType);
    }

    [Fact]
    public void Parse_NullOrWhitespace_ReturnsNull()
    {
        DeviceDetailsParser.Parse(null).Should().BeNull();
        DeviceDetailsParser.Parse("").Should().BeNull();
        DeviceDetailsParser.Parse("   ").Should().BeNull();
    }

    [Fact]
    public void Parse_UnknownAgent_StillReportsDeviceType()
    {
        var result = DeviceDetailsParser.Parse("some-unknown-client/1.0");
        var parsed = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(result!)!;
        parsed["deviceType"].GetString().Should().Be("desktop");
        parsed.Should().NotContainKey("browser");
    }
}
