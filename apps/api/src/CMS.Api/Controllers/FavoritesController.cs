using System.Security.Claims;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Student-owned bookmarks for questions and library assets. Every operation requires
/// a signed entitlement bound to the authenticated student and installation, followed
/// by a server-side check of the exact content scope.
/// </summary>
[ApiController]
[Route("api/v1/favorites")]
[Authorize(Roles = "student")]
[EnableRateLimiting("favorites")]
public sealed class FavoritesController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    private readonly ISignedEntitlementService _signedEntitlements;
    private readonly IEntitlementService _entitlements;

    public FavoritesController(
        IApplicationDbContext db,
        ISignedEntitlementService signedEntitlements,
        IEntitlementService entitlements)
    {
        _db = db;
        _signedEntitlements = signedEntitlements;
        _entitlements = entitlements;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var entitlement = await ValidateEntitlementAsync(studentId.Value, null, ct);
        if (entitlement.Rejection is not null) return entitlement.Rejection;

        var favorites = await _db.Favorites.AsNoTracking()
            .Where(favorite => favorite.StudentId == studentId.Value)
            .Include(favorite => favorite.Question)
                .ThenInclude(question => question!.Lecture)
            .Include(favorite => favorite.LibraryFile)
            .OrderByDescending(favorite => favorite.CreatedAt)
            .ToListAsync(ct);

        var items = new List<FavoriteItemDto>();
        foreach (var favorite in favorites)
        {
            if (favorite.Question is { Status: ContentStatus.Published } question
                && await _entitlements.CanAccessSubjectContentAsync(
                    studentId.Value, question.SubjectId, SubscriptionContentScope.QuestionsExams, ct))
            {
                items.Add(new FavoriteItemDto(
                    favorite.Id,
                    "question",
                    question.Id,
                    question.SubjectId,
                    question.Text,
                    question.Lecture?.NameAr,
                    question.Difficulty.ToString().ToLowerInvariant(),
                    favorite.CreatedAt));
            }
            else if (favorite.LibraryFile is { Status: ContentStatus.Published } file
                && await _entitlements.CanAccessSubjectContentAsync(
                    studentId.Value, file.SubjectId, RequiredContentScope(file.Type), ct))
            {
                items.Add(new FavoriteItemDto(
                    favorite.Id,
                    "file",
                    file.Id,
                    file.SubjectId,
                    file.Title,
                    file.Description,
                    file.Type.ToString().ToLowerInvariant(),
                    favorite.CreatedAt));
            }
        }

        return Ok(items);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFavoriteRequest request, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var hasQuestion = request.QuestionId is { } questionId && questionId != Guid.Empty;
        var hasFile = request.LibraryFileId is { } fileId && fileId != Guid.Empty;
        if (hasQuestion == hasFile)
            return BadRequest(new { error = "exactly one favorite target is required" });

        if (hasQuestion)
        {
            var question = await _db.Questions.AsNoTracking()
                .Where(item => item.Id == request.QuestionId && item.Status == ContentStatus.Published)
                .Select(item => new { item.Id, item.SubjectId })
                .SingleOrDefaultAsync(ct);
            if (question is null) return NotFound();

            var rejection = await ValidateContentAccessAsync(
                studentId.Value, question.SubjectId, SubscriptionContentScope.QuestionsExams, ct);
            if (rejection is not null) return rejection;

            var existing = await _db.Favorites
                .SingleOrDefaultAsync(favorite => favorite.StudentId == studentId.Value && favorite.QuestionId == question.Id, ct);
            if (existing is not null)
                return Ok(new FavoriteMutationDto(existing.Id, question.Id, "question", true));

            var favorite = new Favorite { StudentId = studentId.Value, QuestionId = question.Id };
            _db.Favorites.Add(favorite);
            await _db.SaveChangesAsync(ct);
            return CreatedAtAction(nameof(List), new FavoriteMutationDto(favorite.Id, question.Id, "question", true));
        }

        var file = await _db.LibraryFiles.AsNoTracking()
            .Where(item => item.Id == request.LibraryFileId && item.Status == ContentStatus.Published && item.DeletedAt == null)
            .Select(item => new { item.Id, item.SubjectId, item.Type })
            .SingleOrDefaultAsync(ct);
        if (file is null) return NotFound();

        var fileRejection = await ValidateContentAccessAsync(
            studentId.Value, file.SubjectId, RequiredContentScope(file.Type), ct);
        if (fileRejection is not null) return fileRejection;

        var existingFileFavorite = await _db.Favorites
            .SingleOrDefaultAsync(favorite => favorite.StudentId == studentId.Value && favorite.LibraryFileId == file.Id, ct);
        if (existingFileFavorite is not null)
            return Ok(new FavoriteMutationDto(existingFileFavorite.Id, file.Id, "file", true));

        var newFileFavorite = new Favorite { StudentId = studentId.Value, LibraryFileId = file.Id };
        _db.Favorites.Add(newFileFavorite);
        await _db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(List), new FavoriteMutationDto(newFileFavorite.Id, file.Id, "file", true));
    }

    [HttpDelete("{questionId:guid}")]
    [HttpDelete("questions/{questionId:guid}")]
    public async Task<IActionResult> DeleteQuestion(Guid questionId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var subjectId = await SubjectIdForQuestionAsync(questionId, ct);
        if (!subjectId.HasValue) return NotFound();
        var rejection = await ValidateContentAccessAsync(
            studentId.Value, subjectId.Value, SubscriptionContentScope.QuestionsExams, ct);
        if (rejection is not null) return rejection;

        var favorite = await _db.Favorites
            .SingleOrDefaultAsync(item => item.StudentId == studentId.Value && item.QuestionId == questionId, ct);
        if (favorite is not null)
        {
            _db.Favorites.Remove(favorite);
            await _db.SaveChangesAsync(ct);
        }

        return NoContent();
    }

    [HttpDelete("files/{fileId:guid}")]
    public async Task<IActionResult> DeleteFile(Guid fileId, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var file = await _db.LibraryFiles.AsNoTracking()
            .Where(item => item.Id == fileId && item.DeletedAt == null)
            .Select(item => new { item.SubjectId, item.Type })
            .SingleOrDefaultAsync(ct);
        if (file is null) return NotFound();

        var rejection = await ValidateContentAccessAsync(
            studentId.Value, file.SubjectId, RequiredContentScope(file.Type), ct);
        if (rejection is not null) return rejection;

        var favorite = await _db.Favorites
            .SingleOrDefaultAsync(item => item.StudentId == studentId.Value && item.LibraryFileId == fileId, ct);
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
            .Where(question => question.Id == questionId && question.Status == ContentStatus.Published)
            .Select(question => (Guid?)question.SubjectId)
            .SingleOrDefaultAsync(ct);

    private async Task<IActionResult?> ValidateContentAccessAsync(
        Guid studentId,
        Guid subjectId,
        SubscriptionContentScope contentScope,
        CancellationToken ct)
    {
        var entitlement = await ValidateEntitlementAsync(studentId, subjectId, ct);
        if (entitlement.Rejection is not null) return entitlement.Rejection;

        return await _entitlements.CanAccessSubjectContentAsync(studentId, subjectId, contentScope, ct)
            ? null
            : Forbid();
    }

    private static SubscriptionContentScope RequiredContentScope(LibraryFileType type) =>
        type is LibraryFileType.Video or LibraryFileType.Audio
            ? SubscriptionContentScope.VideoAudio
            : SubscriptionContentScope.LecturesText;

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

public sealed record CreateFavoriteRequest(Guid? QuestionId, Guid? LibraryFileId);
public sealed record FavoriteMutationDto(Guid FavoriteId, Guid TargetId, string TargetType, bool IsFavorite);
public sealed record FavoriteItemDto(
    Guid FavoriteId,
    string TargetType,
    Guid TargetId,
    Guid SubjectId,
    string Title,
    string? Subtitle,
    string Meta,
    DateTime CreatedAt);
