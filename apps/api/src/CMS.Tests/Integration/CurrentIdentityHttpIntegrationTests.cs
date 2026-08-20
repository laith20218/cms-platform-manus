using System.Net;
using System.Net.Http.Json;
using FluentAssertions;

namespace CMS.Tests.Integration;

[Collection("SignedEntitlementHttp")]
public sealed class CurrentIdentityHttpIntegrationTests : IClassFixture<SignedEntitlementHttpFactory>
{
    private readonly SignedEntitlementHttpFactory _factory;

    public CurrentIdentityHttpIntegrationTests(SignedEntitlementHttpFactory factory) => _factory = factory;

    [Fact]
    public async Task Me_WithAuthenticatedStudent_ReturnsCanonicalIdentity()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/me");
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", _factory.StudentId.ToString());
        request.Headers.TryAddWithoutValidation("X-Installation-Id", SignedEntitlementHttpFactory.InstallationA);

        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var identity = await response.Content.ReadFromJsonAsync<CurrentIdentityResponse>();
        identity.Should().NotBeNull();
        identity!.Id.Should().Be(_factory.StudentId);
        identity.Role.Should().Be("student");
    }

    [Fact]
    public async Task Me_WithoutAuthentication_ReturnsUnauthorized()
    {
        var response = await _factory.Client.GetAsync("/api/v1/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Me_WithAuthenticatedButMissingStudent_ReturnsUnauthorized()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/me");
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", Guid.NewGuid().ToString());
        request.Headers.TryAddWithoutValidation("X-Installation-Id", SignedEntitlementHttpFactory.InstallationA);

        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized, await response.Content.ReadAsStringAsync());
    }

    private sealed record CurrentIdentityResponse(Guid Id, string Phone, string FullName, string Role);
}
