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
        var items = await list.Content.ReadFromJsonAsync<List<FavoriteItem>>();
        items.Should().ContainSingle(item => item.QuestionId == _factory.FavoriteQuestionId);

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

    private sealed record FavoriteItem(Guid FavoriteId, Guid QuestionId, Guid SubjectId, string Text, string Difficulty, string? LectureTitle, DateTime CreatedAt);
}
