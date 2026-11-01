using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Library;
using CMS.Application.DTOs.Library;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Library controller - manages digital library files (PDF, HTML, images, videos).
/// Students can view files via signed URLs with watermarking.
/// Admins can upload, update, delete files.
/// </summary>
[ApiController]
[Route("api/v1/library")]
public class LibraryController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;
    private readonly IPermissionService _permissions;
    private readonly ISecurityAuditWriter _audit;

    public LibraryController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements, IPermissionService permissions, ISecurityAuditWriter audit)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
        _permissions = permissions;
        _audit = audit;
    }

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;
    private Guid GetAdminId() => Guid.Parse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value!);

    /// <summary>Push 2 / Track 2: acting session id from the access token — powers per-session counters.</summary>
    private Guid? GetSessionId() => Guid.TryParse(User.FindFirst("sid")?.Value, out var id) ? id : null;

    /// <summary>
    /// Get library files for a subject (with type filter).
    /// </summary>
    [HttpGet("subject/{subjectId:guid}")]
    [Authorize]
    public async Task<IActionResult> GetFiles(
        Guid subjectId, [FromQuery] string? type, [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetLibraryFilesQuery(studentId.Value, subjectId, type, page, pageSize), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get the published text assets explicitly linked to one lecture.
    /// </summary>
    [HttpGet("lectures/{lectureId:guid}/text-files")]
    [Authorize]
    public async Task<IActionResult> GetLectureTextFiles(Guid lectureId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForLectureAsync(lectureId, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetLectureTextFilesQuery(studentId.Value, lectureId, page, pageSize), ct));
    }

    /// <summary>
    /// Get a single library file details.
    /// </summary>
    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> GetFile(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, await SubjectIdForFileAsync(id, ct), ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetLibraryFileByIdQuery(id, studentId), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get a signed URL to access a file (5-minute expiry + watermark).
    /// </summary>
    [HttpPost("{id:guid}/access")]
    [Authorize]
    public async Task<IActionResult> GetAccess(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, await SubjectIdForFileAsync(id, ct), ct);
        if (rejection is not null)
        {
            await _audit.LogSecurityEventAsync(studentId.Value, null, SecurityEventType.FileAccessDenied, SecuritySeverity.Warning, "Library file access denied", ct: ct);
            return rejection;
        }

        var result = await _mediator.Send(new GetFileAccessCommand(id, studentId.Value), ct);
        await _audit.LogSecurityEventAsync(studentId.Value, null, SecurityEventType.FileAccess, SecuritySeverity.Info, "Library file access granted", ct: ct);
        return Ok(result);
    }

    /// <summary>
    /// Streams a library file's bytes through the API (Push 9 — same-origin reader support).
    ///
    /// The storage bucket's presigned URLs carry no CORS headers, so the browser
    /// cannot fetch() them — which blocks the in-app TXT/HTML readers and blob
    /// downloads. This route re-uses the exact entitlement gate as /access
    /// (including the FileAccess audit on the access call that precedes it) and
    /// serves the object with a charset-corrected Content-Type: the HTML
    /// sanitizer strips the meta charset and storage serves text/* without one,
    /// so Arabic documents would otherwise render as mojibake.
    /// </summary>
    [HttpGet("{id:guid}/content")]
    [Authorize]
    public async Task<IActionResult> GetContent(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, await SubjectIdForFileAsync(id, ct), ct);
        if (rejection is not null)
        {
            await _audit.LogSecurityEventAsync(studentId.Value, null, SecurityEventType.FileAccessDenied, SecuritySeverity.Warning, "Library file content denied", ct: ct);
            return rejection;
        }

        var db = HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        var file = await db.LibraryFiles.AsNoTracking()
            .Where(f => f.Id == id && f.DeletedAt == null
                && f.Status == ContentStatus.Published
                && f.VirusScanStatus == VirusScanStatus.Clean)
            .Select(f => new { f.FileUrl, f.FileFormat })
            .FirstOrDefaultAsync(ct);
        if (file is null) return NotFound();

        var storage = HttpContext.RequestServices.GetRequiredService<IFileStorageService>();
        var stream = await storage.DownloadAsync(file.FileUrl, ct);

        var contentType = string.IsNullOrWhiteSpace(file.FileFormat) ? "application/octet-stream" : file.FileFormat;
        if (contentType.Equals("text/html", StringComparison.OrdinalIgnoreCase)
            || contentType.Equals("text/plain", StringComparison.OrdinalIgnoreCase))
            contentType += "; charset=utf-8";

        Response.Headers.CacheControl = "private, max-age=120";
        return File(stream, contentType);
    }

    /// <summary>
    /// Record a file view (duration, pages, completion).
    /// </summary>
    [HttpPost("{id:guid}/view")]
    [Authorize]
    public async Task<IActionResult> RecordView(Guid id, [FromBody] RecordViewDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, await SubjectIdForFileAsync(id, ct), ct);
        if (rejection is not null) return rejection;

        await _mediator.Send(new RecordFileViewCommand(id, studentId.Value, dto.DurationSeconds, dto.PagesViewed, dto.CompletionPercentage), ct);
        return NoContent();
    }

    /// <summary>
    /// Wave 11.8 / F2: list the calling student's own annotations on a PDF file.
    /// Rows are strictly owner-scoped — the response never contains another
    /// student's annotations.
    /// </summary>
    [HttpGet("{id:guid}/annotations")]
    [Authorize]
    public async Task<IActionResult> GetAnnotations(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, await SubjectIdForFileAsync(id, ct), ct);
        if (rejection is not null) return rejection;

        return Ok(await _mediator.Send(new GetFileAnnotationsQuery(id, studentId.Value), ct));
    }

    /// <summary>
    /// Wave 11.8 / F2: idempotent batch save — client-id-keyed upserts + owner-scoped
    /// deletes in one commit. The 256 KB per-endpoint body cap matches the avatar
    /// precedent: annotation strokes are small vectors, never blobs (the Kestrel
    /// 16 MB global cap is far above what this route should ever accept).
    /// </summary>
    [HttpPost("{id:guid}/annotations")]
    [Authorize]
    [RequestSizeLimit(262_144)]
    public async Task<IActionResult> SaveAnnotations(Guid id, [FromBody] SaveFileAnnotationsDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, await SubjectIdForFileAsync(id, ct), ct);
        if (rejection is not null) return rejection;

        return Ok(await _mediator.Send(new SaveFileAnnotationsCommand(id, studentId.Value, dto), ct));
    }

    private async Task<Guid?> SubjectIdForFileAsync(Guid fileId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<CMS.Application.Interfaces.IApplicationDbContext>();
        return await db.LibraryFiles.AsNoTracking()
            .Where(file => file.Id == fileId)
            .Select(file => (Guid?)file.SubjectId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<Guid?> SubjectIdForLectureAsync(Guid lectureId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        return await db.Lectures.AsNoTracking()
            .Where(lecture => lecture.Id == lectureId && lecture.DeletedAt == null && lecture.Status == "active"
                && lecture.Subject.DeletedAt == null && lecture.Subject.Semester.DeletedAt == null
                && lecture.Subject.Semester.AcademicYear.DeletedAt == null
                && lecture.Subject.Semester.AcademicYear.College.DeletedAt == null
                && lecture.Subject.Semester.AcademicYear.College.University.DeletedAt == null)
            .Select(lecture => (Guid?)lecture.SubjectId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<IActionResult?> EntitlementRejectionAsync(Guid studentId, Guid? subjectId, CancellationToken ct)
    {
        if (!subjectId.HasValue) return NotFound();
        var token = Request.Headers["X-Entitlement"].FirstOrDefault();
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(installationId)) return Unauthorized();

        var validation = await _signedEntitlements.ValidateAsync(token, studentId, installationId, subjectId, ct);
        if (validation.IsValid) return null;
        await _audit.LogSecurityEventAsync(studentId, null, SecurityEventType.EntitlementDenied, SecuritySeverity.Warning, "Entitlement validation denied access", ct: ct);
        return Forbid();
    }

    private async Task<bool> CanManageAsync(string action, string entityType, Guid entityId, CancellationToken ct) =>
        await _permissions.HasPermissionAsync(GetAdminId(), Resources.Library, action, ct)
        && await _permissions.IsInScopeAsync(GetAdminId(), entityType, entityId, ct);

    // ===== Admin Endpoints =====

    /// <summary>
    /// Request a pre-signed upload URL (admin only).
    /// File is uploaded directly to Cloudflare R2 from the browser.
    /// </summary>
    [HttpPost("upload-url")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<UploadUrlDto>> RequestUploadUrl([FromBody] RequestUploadUrlDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Create, "subject", dto.SubjectId, ct)) return Forbid();
        var result = await _mediator.Send(new RequestUploadUrlCommand(
            dto.FileName, dto.ContentType, dto.FileSize,
            dto.SubjectId, dto.LectureId, dto.Type,
            dto.Title, dto.Description, GetAdminId(), dto.Category,
            // Wave 13 (F3) — trusted interactive lesson flag (text/html only; the
            // handler re-gates it against the declared content type).
            dto.EnableScripts
        ), ct);
        return Ok(result);
    }

    /// <summary>
    /// Complete upload - verify file exists in storage and publish (admin only).
    /// </summary>
    [HttpPost("complete-upload")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<LibraryFileDto>> CompleteUpload([FromBody] CompleteUploadDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "library_file", dto.FileId, ct)) return Forbid();
        // Push 10.5: optional metadata override (null = keep upload-url-time values).
        // Push 10.8: TargetQuality rides too (the 10.7 binding gap — the DTO never
        // exposed the key, so the admin's pick was dropped at this boundary).
        var result = await _mediator.Send(new CompleteUploadCommand(
            dto.FileId, dto.FileKey, dto.ActualFileSize,
            dto.PagesCount, dto.DurationSeconds,
            dto.YoutubeVideoId, GetAdminId(), GetSessionId(),
            dto.Title, dto.Description, dto.Difficulty, dto.TargetQuality,
            // Wave 13 (F3) — contract symmetry only; the authoritative flag is the
            // value persisted on the row at upload-url time.
            dto.EnableScripts
        ), ct);
        return Ok(result);
    }

    /// <summary>
    /// Update a library file metadata (admin only).
    /// </summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<LibraryFileDto>> UpdateFile(Guid id, [FromBody] UpdateLibraryFileDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "library_file", id, ct)) return Forbid();
        var result = await _mediator.Send(new UpdateLibraryFileCommand(id, dto.Title, dto.Description, dto.Tags, dto.LectureId,
            dto.Difficulty, dto.TargetQuality), ct);
        return Ok(result);
    }

    /// <summary>
    /// Publish a clean, scanned library file for entitled students (admin only).
    /// </summary>
    [HttpPost("{id:guid}/publish")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<LibraryFileDto>> PublishFile(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "library_file", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new PublishLibraryFileCommand(id, GetAdminId()), ct));
    }

    /// <summary>
    /// Archive a library file and immediately remove it from student discovery (admin only).
    /// </summary>
    [HttpPost("{id:guid}/archive")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<LibraryFileDto>> ArchiveFile(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "library_file", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new ArchiveLibraryFileCommand(id, GetAdminId()), ct));
    }

    /// <summary>
    /// Delete a library file (soft delete, admin only).
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> DeleteFile(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Delete, "library_file", id, ct)) return Forbid();
        await _mediator.Send(new DeleteLibraryFileCommand(id, GetAdminId()), ct);
        return NoContent();
    }
}
