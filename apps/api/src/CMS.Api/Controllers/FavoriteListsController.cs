using System.Security.Claims;
using CMS.Application.Commands.Favorites;
using CMS.Application.DTOs.Favorites;
using CMS.Application.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CMS.Api.Controllers;

/// <summary>
/// W15.0 — student-owned custom favorites lists (named question collections). List CRUD is
/// pure student metadata (JWT identity suffices); question-membership endpoints carry the
/// SAME entitlement contract as the flat favorites family (X-Entitlement + X-Installation-Id,
/// server-side QuestionsExams scope checks) so a list can only ever contain questions the
/// student could have favorited in the first place.
///
/// Route note: DELETE api/v1/favorites/lists/{listId} also matches FavoritesController's
/// parameterized DELETE {targetType}/{targetId} template — the literal "lists" segment wins
/// ASP.NET Core route precedence (literal &gt; parameter), so dispatch is unambiguous.
/// </summary>
[ApiController]
[Route("api/v1/favorites/lists")]
[Authorize(Roles = "student")]
[EnableRateLimiting("favorites")]
public sealed class FavoriteListsController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;

    public FavoriteListsController(IMediator mediator, ISignedEntitlementService signedEntitlements)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
    }

    /// <summary>
    /// The student's lists with computed question counts. Optional ?questionId= resolves
    /// per-list ContainsQuestion flags in the same round-trip (the QuestionPage picker).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid? questionId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var result = await _mediator.Send(new GetFavoriteListsQuery(studentId.Value, questionId), ct);
        return Ok(result);
    }

    /// <summary>Creates a named list. 409 when the student already has a list with that name.</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFavoriteListRequest request, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var result = await _mediator.Send(
            new CreateFavoriteListCommand(studentId.Value, request.Name, request.Description, request.Color), ct);
        return CreatedAtAction(nameof(List), result);
    }

    /// <summary>
    /// Partial update (rename / change color): omitted (null) fields stay unchanged.
    /// A foreign list id resolves to 404 — ownership never leaks.
    /// </summary>
    [HttpPut("{listId:guid}")]
    public async Task<IActionResult> Update(Guid listId, [FromBody] UpdateFavoriteListRequest request, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var result = await _mediator.Send(
            new UpdateFavoriteListCommand(studentId.Value, listId, request.Name, request.Description, request.Color), ct);
        return Ok(result);
    }

    /// <summary>
    /// Deletes a list (hard delete). Membership rows cascade; questions and flat favorites
    /// are untouched.
    /// </summary>
    [HttpDelete("{listId:guid}")]
    public async Task<IActionResult> Delete(Guid listId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        await _mediator.Send(new DeleteFavoriteListCommand(studentId.Value, listId), ct);
        return NoContent();
    }

    /// <summary>
    /// Adds a question to a list. Same gates as the flat question-favorite create
    /// (Published target + QuestionsExams scope). Idempotent: 201 fresh, 200 duplicate.
    /// </summary>
    [HttpPost("{listId:guid}/questions/{questionId:guid}")]
    public async Task<IActionResult> AddQuestion(Guid listId, Guid questionId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var headers = ReadEntitlementHeaders();
        if (headers is null) return Unauthorized();

        var result = await _mediator.Send(
            new AddQuestionToFavoriteListCommand(studentId.Value, listId, questionId, headers.Token, headers.InstallationId), ct);

        return result.IsNew
            ? CreatedAtAction(nameof(List), result)
            : Ok(result);
    }

    /// <summary>
    /// Removes a question's membership. Idempotent 204 (absent row, or the question itself
    /// already hard-deleted — its memberships cascaded away with it).
    /// </summary>
    [HttpDelete("{listId:guid}/questions/{questionId:guid}")]
    public async Task<IActionResult> RemoveQuestion(Guid listId, Guid questionId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var headers = ReadEntitlementHeaders();
        if (headers is null) return Unauthorized();

        await _mediator.Send(
            new RemoveQuestionFromFavoriteListCommand(studentId.Value, listId, questionId, headers.Token, headers.InstallationId), ct);
        return NoContent();
    }

    /// <summary>
    /// The questions inside one list — paged, ?search= filtered, entitlement-gated per
    /// subject. Rows reuse the FavoriteItemDto question-card shape (TargetType="question")
    /// so the FavoritesPage renders list contents with the SAME card component as flat
    /// question favorites.
    /// </summary>
    [HttpGet("{listId:guid}/questions")]
    public async Task<IActionResult> Questions(
        Guid listId,
        [FromQuery] string? search,
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var headers = ReadEntitlementHeaders();
        if (headers is null) return Unauthorized();

        // Signed-entitlement validation (student + installation bound), subject-unscoped —
        // the same boundary check as GET /api/v1/favorites.
        var validation = await _signedEntitlements.ValidateAsync(headers.Token, studentId.Value, headers.InstallationId, null, ct);
        if (!validation.IsValid || validation.Entitlement is null)
            return Forbid();

        var result = await _mediator.Send(
            new GetQuestionsInFavoriteListQuery(
                studentId.Value, listId, search, page ?? 1, pageSize ?? 20, headers.Token, headers.InstallationId), ct);
        return Ok(result);
    }

    // ===== HTTP-level helpers =====

    private Guid? StudentId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value, out var id)
        ? id
        : null;

    private sealed record EntitlementHeaders(string Token, string InstallationId);

    private EntitlementHeaders? ReadEntitlementHeaders()
    {
        var token = Request.Headers["X-Entitlement"].FirstOrDefault();
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(installationId))
            return null;
        return new EntitlementHeaders(token, installationId);
    }
}

/// <summary>Create-list body. Name required (≤100); description ≤500; color ≤20 (any string — presentation metadata).</summary>
public sealed record CreateFavoriteListRequest(string Name, string? Description, string? Color);

/// <summary>Update-list body (partial: null fields unchanged).</summary>
public sealed record UpdateFavoriteListRequest(string? Name, string? Description, string? Color);
