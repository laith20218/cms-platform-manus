using System.Text.Json;
using System.Text.Json.Serialization;

namespace CMS.Infrastructure.Security;

/// <summary>
/// Push 2 / Track 2: minimal User-Agent summarizer for the activity monitor. Produces a
/// compact JSON object ({ browser, os, deviceType }) stored on UserSession.DeviceDetails
/// (jsonb). Deliberately heuristic and dependency-free — this powers a monitoring surface,
/// not an authentication decision.
/// </summary>
public static class DeviceDetailsParser
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static string? Parse(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent)) return null;

        var ua = userAgent.ToLowerInvariant();

        var browser = DetectBrowser(ua);
        var os = DetectOs(ua);
        var deviceType = DetectDeviceType(ua);

        return JsonSerializer.Serialize(new { browser, os, deviceType }, JsonOptions);
    }

    private static string? DetectBrowser(string ua) =>
        ua.Contains("edg/") ? "Edge"
        : ua.Contains("opr/") || ua.Contains("opera") ? "Opera"
        : ua.Contains("chrome/") && !ua.Contains("chromium") ? "Chrome"
        : ua.Contains("chromium") ? "Chromium"
        : ua.Contains("firefox/") || ua.Contains("seamonkey") ? "Firefox"
        : ua.Contains("safari/") && ua.Contains("version/") ? "Safari"
        : ua.Contains("curl") ? "curl"
        : ua.Contains("python") || ua.Contains("python-requests") ? "Python client"
        : ua.Contains("postman") ? "Postman"
        : null;

    private static string? DetectOs(string ua) =>
        ua.Contains("windows") ? "Windows"
        : ua.Contains("android") ? "Android"
        : ua.Contains("iphone") || ua.Contains("ipad") || ua.Contains("ipod") ? "iOS"
        : ua.Contains("mac os x") || ua.Contains("macintosh") ? "macOS"
        : ua.Contains("cros") ? "ChromeOS"
        : ua.Contains("linux") ? "Linux"
        : null;

    private static string? DetectDeviceType(string ua)
    {
        if (ua.Contains("mobile") || ua.Contains("iphone") || ua.Contains("android") && !ua.Contains("tablet")) return "mobile";
        if (ua.Contains("ipad") || ua.Contains("tablet")) return "tablet";
        return "desktop";
    }
}
