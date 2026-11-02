using System.Net;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Integration;

/// <summary>
/// R62 §2.A — CORS preflight contract for the endpoints that broke in Wave 12.4.
///
/// Regression context: on the failing laptop (Chrome 156) the browser's OPTIONS preflight for
/// GET /api/v1/courses/subject/{id} failed while GET /api/v1/subjects/my-subjects passed,
/// so the Courses catalog never received a single byte. These tests pin the preflight
/// behavior at the HTTP layer:
///   1. An allow-listed origin (Cors:StudentApp) gets 204 + Access-Control-Allow-Origin +
///      Access-Control-Allow-Headers covering Authorization AND the custom headers the
///      student-web client attaches (X-Entitlement, X-Installation-Id, X-Device-Fingerprint).
///   2. my-subjects keeps passing (Wave 12.4 constraint: "do NOT break the working
///      my-subjects endpoint").
///   3. A rejected origin still gets 204 but WITHOUT Access-Control-Allow-Origin — the
///      browser blocks the request (Fetch spec) while the auth layers stay out of the
///      preflight path entirely (CorsPreflightCompletionMiddleware).
///
/// Harness note: the HtmlViewHttpFactory is reused verbatim (Testing environment, InMemory EF,
/// Cors:StudentApp = https://student-web.test). Preflights are answered by the CORS stack
/// before any endpoint/EF/auth code runs, so no DB fixtures are needed here.
/// </summary>
public sealed class CorsPreflightHttpIntegrationTests : IClassFixture<HtmlViewHttpFactory>
{
    private readonly HtmlViewHttpFactory _factory;

    public CorsPreflightHttpIntegrationTests(HtmlViewHttpFactory factory) => _factory = factory;

    private static HttpRequestMessage Preflight(string url, string origin, string requestHeaders)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, url);
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "GET");
        request.Headers.Add("Access-Control-Request-Headers", requestHeaders);
        return request;
    }

    [Fact]
    public async Task Preflight_CoursesSubject_AllowedOrigin_Returns204WithAllowHeaders()
    {
        var request = Preflight(
            $"/api/v1/courses/subject/{Guid.NewGuid()}",
            "https://student-web.test",
            "authorization, x-entitlement, x-installation-id, x-device-fingerprint");

        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        response.Headers.TryGetValues("Access-Control-Allow-Origin", out var allowOrigin).Should().BeTrue();
        allowOrigin!.Should().Contain("https://student-web.test");

        response.Headers.TryGetValues("Access-Control-Allow-Headers", out var allowHeaders).Should().BeTrue();
        // Browsers match preflight headers case-insensitively (Fetch spec); the API echoes
        // the policy's verbatim casing. Normalize before asserting.
        var headerList = string.Join(",", allowHeaders!).ToLowerInvariant();
        headerList.Should().Contain("authorization");
        headerList.Should().Contain("x-entitlement");
        headerList.Should().Contain("x-installation-id");
        headerList.Should().Contain("x-device-fingerprint");
    }

    [Fact]
    public async Task Preflight_MySubjects_AllowedOrigin_Returns204_RegressionGuard()
    {
        var request = Preflight(
            "/api/v1/subjects/my-subjects",
            "https://student-web.test",
            "authorization, x-installation-id, x-device-fingerprint");

        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        response.Headers.TryGetValues("Access-Control-Allow-Origin", out var allowOrigin).Should().BeTrue();
        allowOrigin!.Should().Contain("https://student-web.test");
    }

    [Fact]
    public async Task Preflight_RejectedOrigin_Returns204WithoutAllowOrigin_BrowserBlocks()
    {
        var request = Preflight(
            $"/api/v1/courses/subject/{Guid.NewGuid()}",
            "https://untrusted-origin.example",
            "authorization, x-entitlement");

        var response = await _factory.Client.SendAsync(request);

        // Clean 204 (never a 401/403 from the auth layers) but WITHOUT Access-Control-Allow-Origin,
        // so the Fetch spec still makes the browser block the actual request. Security unchanged.
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        response.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse();
    }
}
