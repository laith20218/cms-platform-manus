using System.Net;
using System.Net.Http.Json;
using FluentAssertions;

namespace CMS.Tests.Integration;

[Collection("SignedEntitlementHttp")]
public sealed class FavoritesHttpIntegrationTests : IClassFixture<SignedEntitlementHttpFactory>
{
    private readonly SignedEntitlementHttpFactory _factory;

    public FavoritesHttpIntegrationTests(SignedEntitlementHttpFactory factory) => _factory = factory;

    [Fact]
    public async Task Favorite_WithValidBoundEntitlement_CreatesListsAndDeletesOnlyOwnBookmark()
    {
        var token = _factory.CreateSignedToken(
            SignedEntitlementHttpFactory.InstallationA,
            new[] { _factory.SubjectId },
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(10));

        var create = _factory.FavoriteRequest(HttpMethod.Post, token);
        create.Content = JsonContent.Create(new { questionId = _factory.FavoriteQuestionId });
        var created = await _factory.Client.SendAsync(create);
        created.StatusCode.Should().Be(HttpStatusCode.Created, await created.Content.ReadAsStringAsync());

        var duplicate = _factory.FavoriteRequest(HttpMethod.Post, token);
        duplicate.Content = JsonContent.Create(new { questionId = _factory.FavoriteQuestionId });
        var duplicateResponse = await _factory.Client.SendAsync(duplicate);
        duplicateResponse.StatusCode.Should().Be(HttpStatusCode.OK, await duplicateResponse.Content.ReadAsStringAsync());

        var list = await _factory.Client.SendAsync(_factory.FavoriteRequest(HttpMethod.Get, token));
        list.StatusCode.Should().Be(HttpStatusCode.OK, await list.Content.ReadAsStringAsync());
        // 11.5.2 (N2): GET /api/v1/favorites returns PagedResult<FavoriteItemDto>
        // ({"items":[…],"total",…"totalPages"}), not a bare array.
        var page = await list.Content.ReadFromJsonAsync<FavoritePage>();
        page!.Items.Should().ContainSingle(item => item.TargetType == "question" && item.TargetId == _factory.FavoriteQuestionId);

        var deleted = await _factory.Client.SendAsync(_factory.FavoriteRequest(HttpMethod.Delete, token, _factory.FavoriteQuestionId));
        deleted.StatusCode.Should().Be(HttpStatusCode.NoContent, await deleted.Content.ReadAsStringAsync());

        var repeatDelete = await _factory.Client.SendAsync(_factory.FavoriteRequest(HttpMethod.Delete, token, _factory.FavoriteQuestionId));
        repeatDelete.StatusCode.Should().Be(HttpStatusCode.NoContent, await repeatDelete.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Favorite_WithoutEntitlement_RejectsBeforeMutation()
    {
        var request = _factory.FavoriteRequest(HttpMethod.Post, entitlement: null);
        request.Content = JsonContent.Create(new { questionId = _factory.FavoriteQuestionId });

        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Favorite_OutsideSubjectEntitlement_IsForbidden()
    {
        var token = _factory.CreateSignedToken(
            SignedEntitlementHttpFactory.InstallationA,
            new[] { Guid.NewGuid() },
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(10));
        var request = _factory.FavoriteRequest(HttpMethod.Post, token);
        request.Content = JsonContent.Create(new { questionId = _factory.FavoriteQuestionId });

        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden, await response.Content.ReadAsStringAsync());
    }

    // 11.5.2 (N2): response envelope for GET /api/v1/favorites.
    private sealed record FavoritePage(
        List<FavoriteItem> Items, int Total, int Page, int PageSize, int TotalPages);

    // 11.5.2 (N2): refreshed to match FavoriteItemDto field names (Id, no Meta).
    private sealed record FavoriteItem(Guid Id, string TargetType, Guid TargetId, Guid SubjectId, string Title, string? Subtitle, DateTime CreatedAt);
}
