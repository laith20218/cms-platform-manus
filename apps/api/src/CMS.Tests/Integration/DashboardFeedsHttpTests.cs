using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace CMS.Tests.Integration;

/// <summary>
/// Route-contract locks for the admin dashboard feed endpoints.
///
/// Regression background: the backend mounted the three dashboard feeds at
/// /api/v1/admin/{recent-activity,top-subjects,reports/summary} while admin-web
/// (DashboardFeeds.tsx) calls /api/v1/admin/dashboard/... — every deployed
/// environment answered 404 for the feeds even though both sides shipped at the
/// same commit. These tests lock the documented frontend contract so a route
/// drift can never merge silently again.
/// </summary>
[Collection("SignedEntitlementHttp")]
public sealed class DashboardFeedsHttpTests : IClassFixture<AdminEndpointFactory>
{
    private readonly AdminEndpointFactory _factory;

    public DashboardFeedsHttpTests(AdminEndpointFactory factory) => _factory = factory;

    // ===== anonymous access is rejected =====

    [Theory]
    [InlineData("/api/v1/admin/dashboard/recent-activity?count=6")]
    [InlineData("/api/v1/admin/dashboard/top-subjects?count=5")]
    [InlineData("/api/v1/admin/dashboard/reports/summary")]
    [InlineData("/api/v1/admin/dashboard/revenue?months=6")]
    [InlineData("/api/v1/admin/dashboard/student-growth?days=30")]
    public async Task Anonymous_FeedRoutes_Unauthorized(string uri)
    {
        var response = await _factory.Client.GetAsync(uri);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    // ===== the documented frontend contract answers 200 =====

    [Fact]
    public async Task SuperAdmin_RecentActivity_ReturnsOkArray()
    {
        var response = await _factory.Client.SendAsync(
            _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/dashboard/recent-activity?count=6"));
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.ValueKind.Should().Be(JsonValueKind.Array, "the feed contract is a JSON array");
    }

    [Fact]
    public async Task SuperAdmin_TopSubjects_ReturnsOkArray()
    {
        var response = await _factory.Client.SendAsync(
            _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/dashboard/top-subjects?count=5"));
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.ValueKind.Should().Be(JsonValueKind.Array, "the feed contract is a JSON array");
    }

    [Fact]
    public async Task SuperAdmin_ReportsSummary_ReturnsOkObjectWithKnownShape()
    {
        var response = await _factory.Client.SendAsync(
            _factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/dashboard/reports/summary"));
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.ValueKind.Should().Be(JsonValueKind.Object);
        body.GetProperty("totalReports").GetInt32().Should().BeGreaterThanOrEqualTo(0);
        body.GetProperty("pendingReports").GetInt32().Should().BeGreaterThanOrEqualTo(0);
        body.GetProperty("resolvedReports").GetInt32().Should().BeGreaterThanOrEqualTo(0);
        body.GetProperty("rejectedReports").GetInt32().Should().BeGreaterThanOrEqualTo(0);
        body.GetProperty("recentReports").ValueKind.Should().Be(JsonValueKind.Array);
    }

    [Fact]
    public async Task SuperAdmin_RevenueAndStudentGrowth_ReturnOkArrays()
    {
        foreach (var uri in new[]
                 {
                     "/api/v1/admin/dashboard/revenue?months=6",
                     "/api/v1/admin/dashboard/student-growth?days=30"
                 })
        {
            var response = await _factory.Client.SendAsync(_factory.SuperAdminRequest(HttpMethod.Get, uri));
            response.StatusCode.Should().Be(HttpStatusCode.OK, $"{uri} must answer the documented route");
            (await response.Content.ReadFromJsonAsync<JsonElement>()).ValueKind
                .Should().Be(JsonValueKind.Array);
        }
    }

    // ===== the legacy unprefixed routes must stay gone (no accidental dual mount) =====

    [Theory]
    [InlineData("/api/v1/admin/recent-activity")]
    [InlineData("/api/v1/admin/top-subjects")]
    [InlineData("/api/v1/admin/reports/summary")]
    [InlineData("/api/v1/admin/revenue")]
    [InlineData("/api/v1/admin/student-growth")]
    public async Task LegacyUnprefixedFeedRoutes_Are404(string uri)
    {
        var response = await _factory.Client.SendAsync(_factory.SuperAdminRequest(HttpMethod.Get, uri));
        response.StatusCode.Should().Be(HttpStatusCode.NotFound,
            "the unprefixed mount was the 404 bug — it must not come back beside the dashboard/ contract");
    }
}
