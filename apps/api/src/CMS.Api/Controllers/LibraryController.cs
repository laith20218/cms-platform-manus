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

    private async Task<Guid?> SubjectIdForFileAsync(Guid fileId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<CMS.Application.Interfaces.IApplicationDbContext>();
        return await db.LibraryFiles.AsNoTracking()
            .Where(file => file.Id == fileId)
            .Select(file => (Guid?)file.SubjectId)
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
            dto.Title, dto.Description, GetAdminId()
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
        var result = await _mediator.Send(new CompleteUploadCommand(
            dto.FileId, dto.FileKey, dto.ActualFileSize,
            dto.PagesCount, dto.DurationSeconds,
            dto.YoutubeVideoId, GetAdminId()
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
        var result = await _mediator.Send(new UpdateLibraryFileCommand(id, dto.Title, dto.Description, dto.Tags, dto.LectureId), ct);
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
