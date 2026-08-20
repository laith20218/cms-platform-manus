using System.Security.Claims;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Student-owned question bookmarks. Every read or mutation is constrained by the
/// signed entitlement bound to the authenticated student and installation.
/// </summary>
[ApiController]
[Route("api/v1/favorites")]
[Authorize(Roles = "student")]
[EnableRateLimiting("favorites")]
public sealed class FavoritesController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    private readonly ISignedEntitlementService _signedEntitlements;

    public FavoritesController(IApplicationDbContext db, ISignedEntitlementService signedEntitlements)
    {
        _db = db;
        _signedEntitlements = signedEntitlements;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var entitlement = await ValidateEntitlementAsync(studentId.Value, null, ct);
        if (entitlement.Rejection is not null) return entitlement.Rejection;

        var allowedSubjects = entitlement.AllowedSubjects;
        var favorites = await _db.Favorites.AsNoTracking()
            .Where(favorite => favorite.StudentId == studentId.Value
                && favorite.QuestionId.HasValue
                && allowedSubjects.Contains(favorite.Question!.SubjectId))
            .OrderByDescending(favorite => favorite.CreatedAt)
            .Select(favorite => new FavoriteQuestionDto(
                favorite.Id,
                favorite.QuestionId!.Value,
                favorite.Question!.SubjectId,
                favorite.Question.Text,
                favorite.Question.Difficulty.ToString().ToLowerInvariant(),
                favorite.Question.Lecture != null ? favorite.Question.Lecture.NameAr : null,
                favorite.CreatedAt))
            .ToListAsync(ct);

        return Ok(favorites);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFavoriteRequest request, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();
        if (request.QuestionId == Guid.Empty) return BadRequest(new { error = "questionId is required" });

        var subjectId = await SubjectIdForQuestionAsync(request.QuestionId, ct);
        if (!subjectId.HasValue) return NotFound();
        var entitlement = await ValidateEntitlementAsync(studentId.Value, subjectId, ct);
        if (entitlement.Rejection is not null) return entitlement.Rejection;

        var existing = await _db.Favorites
            .SingleOrDefaultAsync(favorite => favorite.StudentId == studentId.Value && favorite.QuestionId == request.QuestionId, ct);
        if (existing is not null)
            return Ok(new FavoriteMutationDto(existing.Id, request.QuestionId, true));

        var favorite = new Favorite { StudentId = studentId.Value, QuestionId = request.QuestionId };
        _db.Favorites.Add(favorite);
        await _db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(List), new FavoriteMutationDto(favorite.Id, request.QuestionId, true));
    }

    [HttpDelete("{questionId:guid}")]
    public async Task<IActionResult> Delete(Guid questionId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var subjectId = await SubjectIdForQuestionAsync(questionId, ct);
        if (!subjectId.HasValue) return NotFound();
        var entitlement = await ValidateEntitlementAsync(studentId.Value, subjectId, ct);
        if (entitlement.Rejection is not null) return entitlement.Rejection;

        var favorite = await _db.Favorites
            .SingleOrDefaultAsync(item => item.StudentId == studentId.Value && item.QuestionId == questionId, ct);
        if (favorite is not null)
        {
            _db.Favorites.Remove(favorite);
            await _db.SaveChangesAsync(ct);
        }

        return NoContent();
    }

    private Guid? StudentId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value, out var id)
        ? id
        : null;

    private async Task<Guid?> SubjectIdForQuestionAsync(Guid questionId, CancellationToken ct) =>
        await _db.Questions.AsNoTracking()
            .Where(question => question.Id == questionId)
            .Select(question => (Guid?)question.SubjectId)
            .SingleOrDefaultAsync(ct);

    private async Task<(IActionResult? Rejection, IReadOnlyList<Guid> AllowedSubjects)> ValidateEntitlementAsync(Guid studentId, Guid? requiredSubjectId, CancellationToken ct)
    {
        var token = Request.Headers["X-Entitlement"].FirstOrDefault();
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(installationId))
            return (Unauthorized(), Array.Empty<Guid>());

        var validation = await _signedEntitlements.ValidateAsync(token, studentId, installationId, requiredSubjectId, ct);
        if (!validation.IsValid || validation.Entitlement is null)
            return (Forbid(), Array.Empty<Guid>());

        return (null, validation.Entitlement.AllowedSubjects);
    }
}

public sealed record CreateFavoriteRequest(Guid QuestionId);
public sealed record FavoriteMutationDto(Guid FavoriteId, Guid QuestionId, bool IsFavorite);
public sealed record FavoriteQuestionDto(
    Guid FavoriteId,
    Guid QuestionId,
    Guid SubjectId,
    string Text,
    string Difficulty,
    string? LectureTitle,
    DateTime CreatedAt);
