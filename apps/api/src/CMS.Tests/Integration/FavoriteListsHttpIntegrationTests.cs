using System.Net;
using System.Net.Http.Json;
using CMS.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CMS.Tests.Integration;

/// <summary>
/// W15.0 FIX-A — HTTP integration coverage for FavoriteListsController (custom favorites
/// lists at /api/v1/favorites/lists), mirroring FavoritesHttpIntegrationTests: the same
/// SignedEntitlementHttpFactory (header-driven test authentication, REAL signed-entitlement
/// validation, real MediatR pipeline over the in-memory EF store). The unit suite
/// (FavoriteListsHandlersTests) covers handler logic; this file proves the HTTP contract
/// end-to-end: status codes (201/200/204/404/409), the route precedence of
/// DELETE /lists/{listId} over the flat DELETE {targetType}/{targetId} template, the JSON
/// envelopes (FavoriteListMutationDto / FavoriteListDto / AddQuestionToFavoriteListResult),
/// the picker contract (?questionId → ContainsQuestion + QuestionsCount), and cross-student
/// ownership isolation (a foreign authenticated student → 404, no existence leak).
/// </summary>
[Collection("SignedEntitlementHttp")]
public sealed class FavoriteListsHttpIntegrationTests : IClassFixture<SignedEntitlementHttpFactory>
{
    private readonly SignedEntitlementHttpFactory _factory;

    public FavoriteListsHttpIntegrationTests(SignedEntitlementHttpFactory factory) => _factory = factory;

    // FIX-A §1 + §2: POST /api/v1/favorites/lists → 201, then GET → the created list.
    [Fact]
    public async Task CreateList_ThenListing_ReturnsCreatedListWithZeroCount()
    {
        var create = ListsRequest(HttpMethod.Post);
        create.Content = JsonContent.Create(new
        {
            name = "قائمة HTTP الأساسية",
            description = "قائمة اختبار تكامل",
            color = "#e11d48"
        });
        var created = await _factory.Client.SendAsync(create);

        created.StatusCode.Should().Be(HttpStatusCode.Created, await created.Content.ReadAsStringAsync());
        created.Headers.Location!.AbsolutePath.Should().Be("/api/v1/favorites/lists",
            "CreatedAtAction(List) must point at the listing route");
        var createdBody = await created.Content.ReadFromJsonAsync<ListMutation>();
        createdBody!.Name.Should().Be("قائمة HTTP الأساسية");

        var listed = await _factory.Client.SendAsync(ListsRequest(HttpMethod.Get));
        listed.StatusCode.Should().Be(HttpStatusCode.OK, await listed.Content.ReadAsStringAsync());
        var rows = await listed.Content.ReadFromJsonAsync<List<ListRow>>();
        rows!.Should().Contain(row => row.Id == createdBody.Id, "the freshly created list must appear in its owner's listing");
        var row = rows.Single(row => row.Id == createdBody.Id);
        row.Name.Should().Be("قائمة HTTP الأساسية");
        row.Description.Should().Be("قائمة اختبار تكامل");
        row.Color.Should().Be("#e11d48");
        row.QuestionsCount.Should().Be(0, "a brand-new list has no members yet");
        row.ContainsQuestion.Should().BeNull("no picker questionId was supplied");
    }

    // Create contract: the SAME student re-using a trimmed name → 409 (ConflictException
    // surfaced by ExceptionHandlingMiddleware).
    [Fact]
    public async Task CreateList_DuplicateName_ReturnsConflict()
    {
        var first = ListsRequest(HttpMethod.Post);
        first.Content = JsonContent.Create(new { name = "قائمة تعارض HTTP", description = (string?)null, color = (string?)null });
        var firstResponse = await _factory.Client.SendAsync(first);
        firstResponse.StatusCode.Should().Be(HttpStatusCode.Created, await firstResponse.Content.ReadAsStringAsync());

        var second = ListsRequest(HttpMethod.Post);
        second.Content = JsonContent.Create(new { name = "قائمة تعارض HTTP", description = (string?)null, color = (string?)null });
        var secondResponse = await _factory.Client.SendAsync(second);

        secondResponse.StatusCode.Should().Be(HttpStatusCode.Conflict, await secondResponse.Content.ReadAsStringAsync());
    }

    // FIX-A §3: POST /api/v1/favorites/lists/{listId}/questions/{questionId} with a valid
    // bound entitlement → 201 fresh, 200 idempotent duplicate; membership lands (the
    // picker resolves ContainsQuestion=true and QuestionsCount=1 in the same round-trip).
    [Fact]
    public async Task AddQuestionToList_WithBoundEntitlement_Returns201FreshThen200Duplicate()
    {
        var listId = await CreateListAsync("قائمة إضافة HTTP");
        var entitlement = CreateBoundEntitlement();

        var added = await _factory.Client.SendAsync(
            ListsRequest(HttpMethod.Post, entitlement, listId, questionId: _factory.FavoriteQuestionId));
        added.StatusCode.Should().Be(HttpStatusCode.Created, await added.Content.ReadAsStringAsync());
        var addResult = await added.Content.ReadFromJsonAsync<AddResult>();
        addResult!.ListId.Should().Be(listId);
        addResult!.QuestionId.Should().Be(_factory.FavoriteQuestionId);
        addResult!.IsNew.Should().BeTrue();

        var duplicate = await _factory.Client.SendAsync(
            ListsRequest(HttpMethod.Post, entitlement, listId, questionId: _factory.FavoriteQuestionId));
        duplicate.StatusCode.Should().Be(HttpStatusCode.OK, await duplicate.Content.ReadAsStringAsync());
        var duplicateResult = await duplicate.Content.ReadFromJsonAsync<AddResult>();
        duplicateResult!.ListId.Should().Be(listId);
        duplicateResult!.IsNew.Should().BeFalse("an existing membership is an idempotent 200, not a fresh 201");

        var listed = await _factory.Client.SendAsync(
            ListsRequest(HttpMethod.Get, pickerQuestionId: _factory.FavoriteQuestionId));
        listed.StatusCode.Should().Be(HttpStatusCode.OK, await listed.Content.ReadAsStringAsync());
        var rows = await listed.Content.ReadFromJsonAsync<List<ListRow>>();
        var row = rows!.Single(row => row.Id == listId);
        row.QuestionsCount.Should().Be(1);
        row.ContainsQuestion.Should().BeTrue("the picker must see the freshly added membership");
    }

    // FIX-A §4: DELETE /api/v1/favorites/lists/{listId} → 204 and the list is GONE for its
    // owner (absent from the listing; a repeat delete resolves to 404 like any missing id).
    // This also proves the literal "lists" route wins over the flat DELETE
    // /favorites/{targetType}/{targetId} template (controller route-precedence note).
    [Fact]
    public async Task DeleteList_ReturnsNoContent_AndListIsGone()
    {
        var listId = await CreateListAsync("قائمة حذف HTTP");
        var entitlement = CreateBoundEntitlement();

        var added = await _factory.Client.SendAsync(
            ListsRequest(HttpMethod.Post, entitlement, listId, questionId: _factory.FavoriteQuestionId));
        added.StatusCode.Should().Be(HttpStatusCode.Created, await added.Content.ReadAsStringAsync());

        var deleted = await _factory.Client.SendAsync(ListsRequest(HttpMethod.Delete, listId: listId));
        deleted.StatusCode.Should().Be(HttpStatusCode.NoContent, await deleted.Content.ReadAsStringAsync());

        var listed = await _factory.Client.SendAsync(ListsRequest(HttpMethod.Get));
        listed.StatusCode.Should().Be(HttpStatusCode.OK, await listed.Content.ReadAsStringAsync());
        var rows = await listed.Content.ReadFromJsonAsync<List<ListRow>>();
        rows!.Should().NotContain(row => row.Id == listId, "hard-deleted lists must vanish from the listing");

        var repeatDelete = await _factory.Client.SendAsync(ListsRequest(HttpMethod.Delete, listId: listId));
        repeatDelete.StatusCode.Should().Be(HttpStatusCode.NotFound, await repeatDelete.Content.ReadAsStringAsync());
    }

    // FIX-A §5 — ownership isolation: the factory's REAL seeded second student
    // (authenticated through the same header contract) can neither delete nor rename the
    // owner's list (404 both times — a foreign id is indistinguishable from a missing
    // one), never sees it in their own listing, and the owner keeps the list untouched.
    [Fact]
    public async Task ListOperations_ByAnotherStudent_Return404AndDoNotLeakOwnership()
    {
        var listId = await CreateListAsync("قائمة ملكية HTTP");
        var otherStudentId = await FindOtherStudentIdAsync(_factory);

        var foreignDelete = await _factory.Client.SendAsync(
            ListsRequest(HttpMethod.Delete, listId: listId, actorStudentId: otherStudentId));
        foreignDelete.StatusCode.Should().Be(HttpStatusCode.NotFound,
            await foreignDelete.Content.ReadAsStringAsync());

        var foreignUpdate = ListsRequest(HttpMethod.Put, listId: listId, actorStudentId: otherStudentId);
        foreignUpdate.Content = JsonContent.Create(new { name = "محاولة استيلاء" });
        var foreignUpdateResponse = await _factory.Client.SendAsync(foreignUpdate);
        foreignUpdateResponse.StatusCode.Should().Be(HttpStatusCode.NotFound,
            await foreignUpdateResponse.Content.ReadAsStringAsync());

        var foreignListing = await _factory.Client.SendAsync(
            ListsRequest(HttpMethod.Get, actorStudentId: otherStudentId));
        foreignListing.StatusCode.Should().Be(HttpStatusCode.OK, await foreignListing.Content.ReadAsStringAsync());
        var foreignRows = await foreignListing.Content.ReadFromJsonAsync<List<ListRow>>();
        foreignRows!.Should().NotContain(row => row.Id == listId,
            "another student's listing must never leak the owner's list");

        var ownerListing = await _factory.Client.SendAsync(ListsRequest(HttpMethod.Get));
        ownerListing.StatusCode.Should().Be(HttpStatusCode.OK, await ownerListing.Content.ReadAsStringAsync());
        var ownerRows = await ownerListing.Content.ReadFromJsonAsync<List<ListRow>>();
        ownerRows!.Should().Contain(row => row.Id == listId,
            "the failed foreign attempts must not affect the owner's list");
    }

    // ===== helpers =====

    /// <summary>
    /// Builds a request against /api/v1/favorites/lists with the same header contract as
    /// SignedEntitlementHttpFactory.AddAuthentication (the Phase35 test handler reads
    /// X-Test-Student-Id / X-Installation-Id), with the ACTING student overridable so a
    /// second authenticated account can be simulated for ownership scenarios.
    /// </summary>
    private HttpRequestMessage ListsRequest(
        HttpMethod method,
        string? entitlement = null,
        Guid? listId = null,
        Guid? questionId = null,
        Guid? pickerQuestionId = null,
        Guid? actorStudentId = null)
    {
        var path = "/api/v1/favorites/lists";
        if (listId.HasValue) path += $"/{listId.Value}";
        if (questionId.HasValue) path += $"/questions/{questionId.Value}";
        if (pickerQuestionId.HasValue) path += $"?questionId={pickerQuestionId.Value}";

        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", (actorStudentId ?? _factory.StudentId).ToString());
        request.Headers.TryAddWithoutValidation("X-Installation-Id", SignedEntitlementHttpFactory.InstallationA);
        if (!string.IsNullOrWhiteSpace(entitlement)) request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    /// <summary>Creates a list over HTTP and returns its server-assigned id.</summary>
    private async Task<Guid> CreateListAsync(string name)
    {
        var request = ListsRequest(HttpMethod.Post);
        request.Content = JsonContent.Create(new { name, description = (string?)null, color = (string?)null });
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        var body = await response.Content.ReadFromJsonAsync<ListMutation>();
        return body!.Id;
    }

    /// <summary>Entitlement bound to the factory student + subject on InstallationA — same shape as FavoritesHttpIntegrationTests.</summary>
    private string CreateBoundEntitlement() => _factory.CreateSignedToken(
        SignedEntitlementHttpFactory.InstallationA,
        new[] { _factory.SubjectId },
        DateTime.UtcNow.AddMinutes(-1),
        DateTime.UtcNow.AddMinutes(10));

    /// <summary>
    /// The factory seeds a real second student (phone 0990004321) whose id is not exposed
    /// as a property — resolve it read-only through the same in-memory store the app uses,
    /// so the ownership scenario runs against an actual second account rather than a
    /// phantom identity.
    /// </summary>
    private static async Task<Guid> FindOtherStudentIdAsync(SignedEntitlementHttpFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        return await db.Students.AsNoTracking()
            .Where(student => student.Phone == "0990004321")
            .Select(student => student.Id)
            .SingleAsync();
    }

    // ===== JSON envelopes (camelCase wire names, case-insensitive binding — the same
    // private-record pattern as FavoritesHttpIntegrationTests) =====

    private sealed record ListMutation(Guid Id, string Name);

    private sealed record ListRow(
        Guid Id,
        string Name,
        string? Description,
        string? Color,
        int QuestionsCount,
        bool? ContainsQuestion,
        DateTime CreatedAt,
        DateTime UpdatedAt);

    private sealed record AddResult(Guid ListId, Guid QuestionId, bool IsNew);
}
