using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMS.Application.Commands.Media;
using CMS.Application.DTOs.Media;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Push 10.0 — student media endpoints:
///   • POST {assetType}/{assetId}/playback-url — direct presigned GET for video/audio
///     (storage/R2 host, Range-capable, TTL from MediaPolicy); the browser streams bytes
///     straight from object storage. Documents (PDF/TXT/HTML) stay on the same-origin
///     /library/{id}/content channel.
///   • Bookmarks CRUD scoped to {assetType}/{assetId} + owner-only PATCH/DELETE.
///   • Playback progress upsert + get (resume); GET without a record answers 204.
///
/// The gate mirrors the library /access pattern: student role, then a signed entitlement
/// (X-Entitlement + X-Installation-Id headers) validated against the asset's subject.
/// The VideoAudio content scope is enforced handler-side via IEntitlementService — the
/// same gate the course catalog and episode /access use.
/// </summary>
[ApiController]
[Route("api/v1/media")]
[Authorize(Roles = "student")]
public class MediaController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;

    public MediaController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
    }

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;

    // ===== §1.A: direct playback URL =====

    /// <summary>
    /// Issues a short-lived presigned GET URL against the object-storage host for a stored
    /// video/audio asset (Range-capable — the player seek/stall-refreshes it on expiry).
    /// YouTube-hosted media and non-video/audio assets are rejected with 400.
    /// </summary>
    [HttpPost("{assetType}/{assetId:guid}/playback-url")]
    public async Task<IActionResult> GetPlaybackUrl(string assetType, Guid assetId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        if (!TryParseAssetType(assetType, out var type)) return BadRequest(InvalidAssetType(assetType));

        var rejection = await EntitlementRejectionAsync(studentId.Value, type, assetId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetPlaybackUrlQuery(studentId.Value, type, assetId), ct);
        return Ok(result);
    }

    // ===== §1.B: bookmarks =====

    /// <summary>
    /// Lists the caller's bookmarks on one asset, ordered by startSeconds. The referenced
    /// asset must be published/entitled (VideoAudio scope), same as playback.
    /// </summary>
    [HttpGet("{assetType}/{assetId:guid}/bookmarks")]
    public async Task<IActionResult> ListBookmarks(string assetType, Guid assetId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        if (!TryParseAssetType(assetType, out var type)) return BadRequest(InvalidAssetType(assetType));

        var rejection = await EntitlementRejectionAsync(studentId.Value, type, assetId, ct);
        if (rejection is not null) return rejection;

        var bookmarks = await _mediator.Send(new ListMediaBookmarksQuery(studentId.Value, type, assetId), ct);
        return Ok(bookmarks);
    }

    /// <summary>
    /// Creates a bookmark [startSeconds, endSeconds] with a required label. Unknown asset
    /// duration is NOT a rejection: the response then carries X-Duration-Warning: unknown
    /// so the client can re-verify the window.
    /// </summary>
    [HttpPost("{assetType}/{assetId:guid}/bookmarks")]
    public async Task<IActionResult> CreateBookmark(string assetType, Guid assetId, [FromBody] CreateBookmarkDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        if (!TryParseAssetType(assetType, out var type)) return BadRequest(InvalidAssetType(assetType));

        var rejection = await EntitlementRejectionAsync(studentId.Value, type, assetId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new CreateMediaBookmarkCommand(
            studentId.Value, type, assetId, dto.StartSeconds, dto.EndSeconds, dto.Label, dto.Note), ct);

        if (!result.DurationKnown)
            Response.Headers["X-Duration-Warning"] = "unknown";
        return Ok(result.Bookmark);
    }

    /// <summary>PATCH label and/or note (owner only — the time window never moves).</summary>
    [HttpPatch("bookmarks/{bookmarkId:guid}")]
    public async Task<IActionResult> UpdateBookmark(Guid bookmarkId, [FromBody] UpdateBookmarkDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();

        var bookmark = await _mediator.Send(new UpdateMediaBookmarkCommand(studentId.Value, bookmarkId, dto.Label, dto.Note), ct);
        return Ok(bookmark);
    }

    /// <summary>Deletes one of the caller's bookmarks (owner only).</summary>
    [HttpDelete("bookmarks/{bookmarkId:guid}")]
    public async Task<IActionResult> DeleteBookmark(Guid bookmarkId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();

        await _mediator.Send(new DeleteMediaBookmarkCommand(studentId.Value, bookmarkId), ct);
        return NoContent();
    }

    // ===== §1.C: playback progress =====

    /// <summary>
    /// Upserts the resume position for one student/asset pair. Completion is derived
    /// server-side (95 % rule) — a client-supplied completion is never trusted.
    /// </summary>
    [HttpPost("{assetType}/{assetId:guid}/progress")]
    public async Task<IActionResult> UpsertProgress(string assetType, Guid assetId, [FromBody] UpsertProgressDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        if (!TryParseAssetType(assetType, out var type)) return BadRequest(InvalidAssetType(assetType));

        var rejection = await EntitlementRejectionAsync(studentId.Value, type, assetId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new UpsertPlaybackProgressCommand(
            studentId.Value, type, assetId, dto.PositionSeconds, dto.DurationSeconds), ct);
        return Ok(result);
    }

    /// <summary>Returns the caller's resume position, or 204 No Content when none exists yet.</summary>
    [HttpGet("{assetType}/{assetId:guid}/progress")]
    public async Task<IActionResult> GetProgress(string assetType, Guid assetId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        if (!TryParseAssetType(assetType, out var type)) return BadRequest(InvalidAssetType(assetType));

        var rejection = await EntitlementRejectionAsync(studentId.Value, type, assetId, ct);
        if (rejection is not null) return rejection;

        var progress = await _mediator.Send(new GetPlaybackProgressQuery(studentId.Value, type, assetId), ct);
        return progress is null ? NoContent() : Ok(progress);
    }

    // ===== gate + helpers =====

    private static bool TryParseAssetType(string? assetType, out MediaAssetType type)
    {
        switch (assetType?.ToLowerInvariant())
        {
            case "library-file":
                type = MediaAssetType.LibraryFile;
                return true;
            case "course-episode":
                type = MediaAssetType.CourseEpisode;
                return true;
            default:
                type = default;
                return false;
        }
    }

    private static string InvalidAssetType(string? assetType) =>
        $"نوع الوسائط غير صالح: '{assetType}' — القيم المسموحة: library-file, course-episode";

    /// <summary>/access-style gate: resolve the asset's subject, then validate the signed
    /// entitlement (X-Entitlement + X-Installation-Id) against it. Non-null = reject.</summary>
    private async Task<IActionResult?> EntitlementRejectionAsync(Guid studentId, MediaAssetType assetType, Guid assetId, CancellationToken ct)
    {
        var subjectId = await SubjectIdForAssetAsync(assetType, assetId, ct);
        if (!subjectId.HasValue) return NotFound();

        var token = Request.Headers["X-Entitlement"].FirstOrDefault();
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(installationId)) return Unauthorized();

        var validation = await _signedEntitlements.ValidateAsync(token, studentId, installationId, subjectId, ct);
        return validation.IsValid ? null : Forbid();
    }

    private async Task<Guid?> SubjectIdForAssetAsync(MediaAssetType assetType, Guid assetId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        if (assetType == MediaAssetType.LibraryFile)
            return await db.LibraryFiles.AsNoTracking()
                .Where(file => file.Id == assetId)
                .Select(file => (Guid?)file.SubjectId)
                .FirstOrDefaultAsync(ct);

        return await db.CourseEpisodes.AsNoTracking()
            .Where(episode => episode.Id == assetId)
            .Select(episode => (Guid?)episode.Course.SubjectId)
            .FirstOrDefaultAsync(ct);
    }
}
