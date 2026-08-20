using System.Net;
using System.Net.Http.Json;
using CMS.Application.Interfaces;
using FluentAssertions;

namespace CMS.Tests.Integration;

[Collection("SignedEntitlementHttp")]
public sealed class PlayIntegrityHttpIntegrationTests : IClassFixture<SignedEntitlementHttpFactory>
{
    private readonly SignedEntitlementHttpFactory _factory;

    public PlayIntegrityHttpIntegrationTests(SignedEntitlementHttpFactory factory) => _factory = factory;

    [Fact]
    public async Task Verify_WithMalformedRequestHash_ReturnsBadRequest()
    {
        var response = await _factory.Client.SendAsync(Request(token: "opaque-token", requestHash: "not valid"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<PlayIntegrityVerificationResponse>();
        body.Should().NotBeNull();
        body!.Accepted.Should().BeFalse();
        body.Decision.Should().Be("invalid_request");
    }

    [Fact]
    public async Task Verify_WhenProviderIsNotConfigured_RejectsBeforeAnyProtectedOperation()
    {
        var response = await _factory.Client.SendAsync(Request(token: "opaque-token", requestHash: "A1234567890_-aBcDeFgHiJkLmNopQ"));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        var body = await response.Content.ReadFromJsonAsync<PlayIntegrityVerificationResponse>();
        body.Should().NotBeNull();
        body!.Accepted.Should().BeFalse();
        body.Decision.Should().Be("not_configured");
    }

    private HttpRequestMessage Request(string token, string requestHash)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/security/play-integrity/verify")
        {
            Content = JsonContent.Create(new PlayIntegrityVerificationRequest(token, requestHash, PlayIntegrityOperation.OfflineDownload))
        };
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", _factory.StudentId.ToString());
        request.Headers.TryAddWithoutValidation("X-Installation-Id", SignedEntitlementHttpFactory.InstallationA);
        return request;
    }

    private sealed record PlayIntegrityVerificationResponse(bool Accepted, string Decision, DateTimeOffset? ValidUntil);
}
