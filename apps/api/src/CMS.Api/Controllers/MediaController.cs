using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
///
/// WAVE-5 (offline media content) adds §1.D — GET {assetType}/{assetId}/content streams
/// the FULL original object bytes through the API (the byte channel the Android offline
/// cache needs; presigned playback URLs are client → storage and can never enter the
/// encrypted offline store). See <see cref="GetContent"/>.
/// </summary>
[ApiController]
[Route("api/v1/media")]
[Authorize(Roles = "student")]
public class MediaController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;
    private readonly ISecurityAuditWriter _audit;

    public MediaController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements, ISecurityAuditWriter audit)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
        _audit = audit;
    }

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;

    // ===== §1.A: direct playback URL =====

    /// <summary>
    /// Issues a short-lived presigned GET URL against the object-storage host for a stored
    /// video/audio asset (Range-capable — the player seek/stall-refreshes it on expiry).
    /// YouTube-hosted media and non-video/audio assets are rejected with 400.
    /// Push 11.1 — Ready HLS assets answer the same-API PROXY route instead (see
    /// <see cref="GetHlsObject"/>): the handler returns it relative and this action
    /// absolutizes it against the request host, so hls.js resolves the ladder's relative
    /// URIs back into the proxy (auth headers attached player-side via xhrSetup).
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

        // Push 11.1 — the HLS proxy URL is minted relative (handler stays
        // HttpContext-free and unit-testable); absolutize it here. ForwardedHeaders
        // (X-Forwarded-Proto) is applied in Program.cs, so Scheme/Host are the public
        // values behind Render's proxy.
        if (result.Url.StartsWith('/'))
            result = result with { Url = $"{Request.Scheme}://{Request.Host}{Request.PathBase}{result.Url}" };

        return Ok(result);
    }

    // ===== §1.A′: Push 11.1 — HLS proxy object streaming =====

    /// <summary>
    /// Streams one file of a Ready asset's HLS ladder (master.m3u8 / {rung}/index.m3u8 /
    /// {rung}/segment_NNN.ts) from object storage through the API.
    ///
    /// Why this exists: S3 presigned URLs are object-scoped — one signature authorizes
    /// exactly ONE key. The FFmpeg ladder's playlists reference their children by
    /// RELATIVE URI, so a presigned master.m3u8 cannot authorize {rung}/index.m3u8 or the
    /// .ts segments: the player resolves them against the presigned URL and requests
    /// them from the bucket with no signature at all, which the private B2 bucket
    /// rejects with 401 — the Wave 10 incident («جاري تجديد الرابط…» forever).
    ///
    /// The proxy keeps every ladder request on the API's authorization surface (the
    /// same student role + signed-entitlement gate as playback-url, re-validated per
    /// request) and fetches the object server-side with the storage credentials.
    /// Because the base URL stays on this API, the playlists' RELATIVE URIs resolve
    /// back into this route — no manifest rewriting needed.
    ///
    /// Authorization headers arrive via the player's hls.js xhrSetup (Bearer +
    /// X-Entitlement + X-Installation-Id). Playlists answer application/vnd.apple.mpegurl
    /// with private,no-store; segments answer video/mp2t with private,max-age=300.
    /// </summary>
    [HttpGet("hls/{assetType}/{assetId:guid}/{*path}")]
    public async Task<IActionResult> GetHlsObject(string assetType, Guid assetId, string? path, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        if (!TryParseAssetType(assetType, out var type)) return BadRequest(InvalidAssetType(assetType));

        var rejection = await EntitlementRejectionAsync(studentId.Value, type, assetId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetHlsObjectQuery(studentId.Value, type, assetId, path ?? string.Empty), ct);

        Response.Headers.CacheControl = result.CacheControl;
        return new FileStreamResult(result.Content, result.ContentType);
    }

    // ===== §1.D: WAVE-5 — offline content streaming =====

    /// <summary>
    /// Streams the FULL original object bytes of a hosted video/audio asset THROUGH the
    /// API (IFileStorageService.DownloadAsync) — the offline-download counterpart of
    /// playback-url. Android's encrypted offline cache can only capture bytes that pass
    /// through the API (exactly how it downloads library files); presigned playback URLs
    /// are client → storage direct and therefore can never be cached offline, which left
    /// hosted course episodes (SourceType = Upload) with no offline path at all.
    ///
    /// Gate order is identical to playback-url: student role → the same
    /// EntitlementRejectionAsync signed-entitlement gate (X-Entitlement +
    /// X-Installation-Id, fallback X-Device-Fingerprint) → handler-side VideoAudio scope,
    /// published-course and virus-clean visibility, and the MEDIA_YOUTUBE_HOSTED /
    /// EPISODE_UPLOAD_INCOMPLETE / MEDIA_TYPE_NOT_STREAMABLE refusals. Denials at this
    /// action's gate are audited (FileAccessDenied) like the library content route.
    ///
    /// Whole-object 200 ONLY — NO Range support. This is deliberate parity with the
    /// library /{id}/content route (whose stream is likewise not range-addressable):
    /// the offline cache always consumes the complete stream, while interactive seek
    /// stays on the presigned / HLS playback channels. Content-Type comes from the entity
    /// (CourseEpisode.ContentType / LibraryFile.FileFormat) with video/audio fallbacks;
    /// responses carry Cache-Control: private, max-age=120.
    /// </summary>
    [HttpGet("{assetType}/{assetId:guid}/content")]
    [EnableRateLimiting("media-offline")]
    public async Task<IActionResult> GetContent(string assetType, Guid assetId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        if (!TryParseAssetType(assetType, out var type)) return BadRequest(InvalidAssetType(assetType));

        var rejection = await EntitlementRejectionAsync(studentId.Value, type, assetId, ct);
        if (rejection is not null)
        {
            await _audit.LogSecurityEventAsync(studentId.Value, null, SecurityEventType.FileAccessDenied, SecuritySeverity.Warning, "Media content denied", ct: ct);
            return rejection;
        }

        var result = await _mediator.Send(new GetMediaContentQuery(studentId.Value, type, assetId), ct);

        Response.Headers.CacheControl = result.CacheControl;
        return new FileStreamResult(result.Content, result.ContentType);
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
