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
/// Student-owned bookmarks for questions, library assets, and course episodes. Every
/// operation requires a signed entitlement bound to the authenticated student and
/// installation, followed by server-side checks of the exact content scope.
///
/// Push 11.3 — the controller is now a THIN MediatR dispatcher: all data access and
/// business rules live in CMS.Application.Handlers.Favorites (the 11.2-DIAG T2 anomaly —
/// direct IApplicationDbContext usage in the controller — is gone). HTTP-level concerns
/// stay here: student identity, entitlement headers, response shaping (201 vs 200 vs 204).
/// </summary>
[ApiController]
[Route("api/v1/favorites")]
[Authorize(Roles = "student")]
[EnableRateLimiting("favorites")]
public sealed class FavoritesController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;

    public FavoritesController(IMediator mediator, ISignedEntitlementService signedEntitlements)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
    }

    /// <summary>
    /// The enriched favorites list — filter (type), sort, and pagination server-side; one
    /// round-trip returns everything the favorites cards render (targets, course names,
    /// thumbnails, durations, processing state, playback progress).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? type,
        [FromQuery] string? sort,
        [FromQuery] int? page,
        [FromQuery] int? pageSize,
        CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var entitlement = await ValidateEntitlementAsync(studentId.Value, null, ct);
        if (entitlement.Rejection is not null) return entitlement.Rejection;

        var result = await _mediator.Send(
            new GetFavoritesQuery(studentId.Value, type, sort ?? "recent", page ?? 1, pageSize ?? 20), ct);
        return Ok(result);
    }

    /// <summary>
    /// Player star button (product decision #1): saves a WHOLE EPISODE as a favorite —
    /// a separate concept from the timeline 🔖 bookmark. Idempotent: 201 Created on the
    /// first save, 200 OK when the row already exists.
    /// </summary>
    [HttpPost("episodes/{episodeId:guid}")]
    public async Task<IActionResult> CreateEpisodeFavorite(Guid episodeId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var headers = ReadEntitlementHeaders();
        if (headers is null) return Unauthorized();

        var result = await _mediator.Send(
            new CreateEpisodeFavoriteCommand(studentId.Value, episodeId, headers.Token, headers.InstallationId), ct);

        return result.IsNew
            ? CreatedAtAction(nameof(List), result.Mutation)
            : Ok(result.Mutation);
    }

    /// <summary>
    /// Legacy create (question | library file exactly-one body) — the pre-11.3 contract
    /// kept verbatim for deployed bundles; dispatches through the same handler pipeline.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFavoriteRequest request, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var headers = ReadEntitlementHeaders();
        if (headers is null) return Unauthorized();

        var result = await _mediator.Send(
            new CreateQuestionOrFileFavoriteCommand(
                studentId.Value, request.QuestionId, request.LibraryFileId, headers.Token, headers.InstallationId), ct);

        return result.IsNew
            ? CreatedAtAction(nameof(List), result.Mutation)
            : Ok(result.Mutation);
    }

    // Unified delete — DELETE /api/v1/favorites/{targetType}/{targetId}. The literal
    // question/file routes below win route precedence for their plural spellings; this
    // parameterized route serves episodes (and any future target type) with the same
    // idempotent 204 semantics.
    [HttpDelete("{targetType}/{targetId:guid}")]
    public async Task<IActionResult> Delete(string targetType, Guid targetId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var headers = ReadEntitlementHeaders();
        if (headers is null) return Unauthorized();

        await _mediator.Send(
            new DeleteFavoriteCommand(studentId.Value, targetType, targetId, headers.Token, headers.InstallationId), ct);
        return NoContent();
    }

    // ===== Legacy delete routes (backward compat — old bundles call these plural forms) =====

    [HttpDelete("{questionId:guid}")]
    [HttpDelete("questions/{questionId:guid}")]
    public async Task<IActionResult> DeleteQuestion(Guid questionId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var headers = ReadEntitlementHeaders();
        if (headers is null) return Unauthorized();

        await _mediator.Send(
            new DeleteFavoriteCommand(studentId.Value, "question", questionId, headers.Token, headers.InstallationId), ct);
        return NoContent();
    }

    [HttpDelete("files/{fileId:guid}")]
    public async Task<IActionResult> DeleteFile(Guid fileId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var headers = ReadEntitlementHeaders();
        if (headers is null) return Unauthorized();

        await _mediator.Send(
            new DeleteFavoriteCommand(studentId.Value, "file", fileId, headers.Token, headers.InstallationId), ct);
        return NoContent();
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

    private async Task<(IActionResult? Rejection, IReadOnlyList<Guid> AllowedSubjects)> ValidateEntitlementAsync(Guid studentId, Guid? requiredSubjectId, CancellationToken ct)
    {
        var headers = ReadEntitlementHeaders();
        if (headers is null)
            return (Unauthorized(), Array.Empty<Guid>());

        var validation = await _signedEntitlements.ValidateAsync(headers.Token, studentId, headers.InstallationId, requiredSubjectId, ct);
        if (!validation.IsValid || validation.Entitlement is null)
            return (Forbid(), Array.Empty<Guid>());

        return (null, validation.Entitlement.AllowedSubjects);
    }
}

/// <summary>Legacy POST body — exactly one of questionId / libraryFileId.</summary>
public sealed record CreateFavoriteRequest(Guid? QuestionId, Guid? LibraryFileId);
