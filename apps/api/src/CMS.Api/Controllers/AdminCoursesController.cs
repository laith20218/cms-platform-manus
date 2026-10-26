using System.Security.Claims;
using Amazon.S3;
using CMS.Application.Commands.Courses;
using CMS.Application.DTOs.Courses;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Administrative course management: course CRUD, episode CRUD and the single-PUT
/// upload orchestration endpoints (Hotfix 10.8f: initiate → browser XHR PUT of the whole
/// file against one presigned URL → complete | abort; the multipart strategy was
/// abandoned — Upstash's session credentials cannot CreateMultipartUpload on R2).
/// Classic RBAC lives here: every action requires the library permission family plus
/// an in-scope subject. UI permission keys (tab:library.courses, btn:library.course.*)
/// are the cosmetic layer only — they never gate this API.
/// </summary>
[ApiController]
[Route("api/v1/admin/courses")]
[Authorize(Roles = "admin,super_admin")]
public sealed class AdminCoursesController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly IApplicationDbContext _db;
    private readonly IPermissionService _permissions;
    private readonly ILogger<AdminCoursesController> _logger;

    public AdminCoursesController(
        MediatR.ISender mediator,
        IApplicationDbContext db,
        IPermissionService permissions,
        ILogger<AdminCoursesController> logger)
    {
        _mediator = mediator;
        _db = db;
        _permissions = permissions;
        _logger = logger;
    }

    private Guid GetAdminId() => Guid.Parse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value!);

    private Guid? GetSessionId() => Guid.TryParse(User.FindFirst("sid")?.Value, out var id) ? id : null;

    private async Task<bool> CanManageAsync(string action, Guid subjectId, CancellationToken ct) =>
        await _permissions.HasPermissionAsync(GetAdminId(), Resources.Library, action, ct)
        && await _permissions.IsInScopeAsync(GetAdminId(), "subject", subjectId, ct);

    private async Task<AdminScope?> GetAuthorizedScopeAsync(CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Library, Actions.View, ct)) return null;
        var scope = await _permissions.GetScopeAsync(adminId, ct);
        if (scope is null) return null;
        if (!scope.IsSuperAdmin && !scope.UniversityId.HasValue && !scope.CollegeId.HasValue && !scope.YearId.HasValue && !scope.SubjectId.HasValue)
            return null;
        return scope;
    }

    private async Task<Guid?> SubjectIdForCourseAsync(Guid courseId, CancellationToken ct) =>
        await _db.Courses.AsNoTracking()
            .Where(course => course.Id == courseId)
            .Select(course => (Guid?)course.SubjectId)
            .FirstOrDefaultAsync(ct);

    private async Task<Guid?> SubjectIdForEpisodeAsync(Guid episodeId, CancellationToken ct) =>
        await _db.CourseEpisodes.AsNoTracking()
            .Where(episode => episode.Id == episodeId)
            .Select(episode => (Guid?)episode.Course.SubjectId)
            .FirstOrDefaultAsync(ct);

    // ===== Courses: list =====

    /// <summary>
    /// Lists courses (permission checked, then restricted to the caller's academic scope).
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<AdminPagedResult<AdminCourseListItem>>> GetCourses(
        [FromQuery] Guid? subjectId, [FromQuery] string? status, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var scope = await GetAuthorizedScopeAsync(ct);
        if (scope is null) return Forbid();

        var query = _db.Courses.AsNoTracking().Where(course => course.DeletedAt == null);
        if (!scope.IsSuperAdmin)
        {
            if (scope.UniversityId.HasValue) query = query.Where(c => c.Subject.Semester.AcademicYear.College.UniversityId == scope.UniversityId.Value);
            if (scope.CollegeId.HasValue) query = query.Where(c => c.Subject.Semester.AcademicYear.CollegeId == scope.CollegeId.Value);
            if (scope.YearId.HasValue) query = query.Where(c => c.Subject.Semester.AcademicYearId == scope.YearId.Value);
            if (scope.SubjectId.HasValue) query = query.Where(c => c.SubjectId == scope.SubjectId.Value);
        }
        if (subjectId.HasValue) query = query.Where(course => course.SubjectId == subjectId.Value);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ContentStatus>(status, true, out var parsed))
            query = query.Where(course => course.Status == parsed);
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(course => course.Title.Contains(search));

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(course => course.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(course => new AdminCourseListItem(
                course.Id, course.SubjectId, course.Subject.NameAr, course.Title,
                course.Status.ToString(),
                course.Episodes.Count(episode => episode.DeletedAt == null),
                course.Episodes.Where(episode => episode.DeletedAt == null).Sum(episode => episode.ViewsCount),
                course.CreatedAt))
            .ToListAsync(ct);
        return Ok(new AdminPagedResult<AdminCourseListItem>(items, total, page, pageSize, (int)Math.Ceiling(total / (double)pageSize)));
    }

    /// <summary>Course detail including its episodes.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CourseDto>> GetCourse(Guid id, CancellationToken ct)
    {
        var scope = await GetAuthorizedScopeAsync(ct);
        if (scope is null) return Forbid();
        var subjectId = await SubjectIdForCourseAsync(id, ct);
        if (subjectId is null) return NotFound();
        if (!await _permissions.IsInScopeAsync(GetAdminId(), "subject", subjectId.Value, ct)) return Forbid();
        return Ok(await _mediator.Send(new GetAdminCourseByIdQuery(id), ct));
    }

    // ===== Courses: CRUD =====

    [HttpPost]
    public async Task<ActionResult<CourseDto>> Create([FromBody] CreateCourseDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Create, dto.SubjectId, ct)) return Forbid();
        var result = await _mediator.Send(new CreateCourseCommand(
            dto.SubjectId, dto.Title, dto.Description, dto.CoverImageUrl, GetAdminId()), ct);
        return Ok(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CourseDto>> Update(Guid id, [FromBody] UpdateCourseDto dto, CancellationToken ct)
    {
        var subjectId = await SubjectIdForCourseAsync(id, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Edit, subjectId.Value, ct)) return Forbid();
        return Ok(await _mediator.Send(new UpdateCourseCommand(id, dto.Title, dto.Description, dto.CoverImageUrl), ct));
    }

    [HttpPost("{id:guid}/publish")]
    public async Task<ActionResult<CourseDto>> Publish(Guid id, CancellationToken ct)
    {
        var subjectId = await SubjectIdForCourseAsync(id, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Edit, subjectId.Value, ct)) return Forbid();
        return Ok(await _mediator.Send(new PublishCourseCommand(id), ct));
    }

    [HttpPost("{id:guid}/archive")]
    public async Task<ActionResult<CourseDto>> Archive(Guid id, CancellationToken ct)
    {
        var subjectId = await SubjectIdForCourseAsync(id, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Edit, subjectId.Value, ct)) return Forbid();
        return Ok(await _mediator.Send(new ArchiveCourseCommand(id), ct));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var subjectId = await SubjectIdForCourseAsync(id, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Delete, subjectId.Value, ct)) return Forbid();
        await _mediator.Send(new DeleteCourseCommand(id, GetAdminId()), ct);
        return NoContent();
    }

    // ===== Episodes: CRUD =====

    /// <summary>Adds a YouTube-embedded episode (no stored blob).</summary>
    [HttpPost("{courseId:guid}/episodes/youtube")]
    public async Task<ActionResult<CourseEpisodeDto>> AddYouTubeEpisode(Guid courseId, [FromBody] AddYouTubeEpisodeDto dto, CancellationToken ct)
    {
        var subjectId = await SubjectIdForCourseAsync(courseId, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Create, subjectId.Value, ct)) return Forbid();
        return Ok(await _mediator.Send(new AddYouTubeEpisodeCommand(
            courseId, dto.Title, dto.EpisodeNumber, dto.DurationSeconds, dto.YoutubeVideoId, GetAdminId()), ct));
    }

    [HttpPut("episodes/{id:guid}")]
    public async Task<ActionResult<CourseEpisodeDto>> UpdateEpisode(Guid id, [FromBody] UpdateEpisodeDto dto, CancellationToken ct)
    {
        var subjectId = await SubjectIdForEpisodeAsync(id, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Edit, subjectId.Value, ct)) return Forbid();
        return Ok(await _mediator.Send(new UpdateEpisodeCommand(id, dto.Title, dto.EpisodeNumber, dto.DurationSeconds,
            dto.Description, dto.Difficulty, dto.TargetQuality), ct));
    }

    [HttpDelete("episodes/{id:guid}")]
    public async Task<IActionResult> DeleteEpisode(Guid id, CancellationToken ct)
    {
        var subjectId = await SubjectIdForEpisodeAsync(id, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Delete, subjectId.Value, ct)) return Forbid();
        await _mediator.Send(new DeleteEpisodeCommand(id, GetAdminId()), ct);
        return NoContent();
    }

    // ===== Episodes: single-PUT upload orchestration (Hotfix 10.8f) =====

    /// <summary>
    /// Starts a single-PUT upload: validates MIME + size ceiling + episode number, creates
    /// the episode row and returns ONE presigned PUT URL for the whole file (content type
    /// and declared size are bound into the signature). The browser PUTs the file directly
    /// to storage in a single XHR — the API never proxies media bytes.
    /// </summary>
    [HttpPost("{courseId:guid}/episodes/initiate-upload")]
    public async Task<ActionResult<InitiateUploadDto>> InitiateUpload(Guid courseId, [FromBody] InitiateUploadRequestDto dto, CancellationToken ct)
    {
        var subjectId = await SubjectIdForCourseAsync(courseId, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Create, subjectId.Value, ct)) return Forbid();
        // Hotfix 10.8c (1.C) guard, retained as defense in depth for any unexpected S3
        // provider failure (observed in production as AmazonS3Exception "Access Denied"):
        // must surface as a clean, actionable 503 — NOT a bare 500. NOTE (10.8f): the
        // initiate path now calls Upstash's /v1/presign REST API (the same flow library
        // uploads use in production); a presign failure surfaces as InvalidOperationException
        // through the global middleware. The S3 catches below remain as belt-and-braces.
        try
        {
            return Ok(await _mediator.Send(new InitiateEpisodeUploadCommand(
                courseId, dto.FileName, dto.ContentType, dto.FileSize, dto.Title, dto.EpisodeNumber, GetAdminId()), ct));
        }
        catch (AmazonS3Exception ex)
        {
            _logger.LogError(ex,
                "initiate-upload rejected by the storage provider for course {CourseId}. S3 StatusCode={S3StatusCode}, Message={S3Message}",
                courseId, (int)ex.StatusCode, ex.Message);
            return StorageProviderRejected();
        }
        catch (UpstashS3ClientFactory.UpstashExchangeException ex)
        {
            // The token was rejected at the credential-exchange step — the same operator
            // verdict applies (verify the R2 endpoint / storage credentials).
            _logger.LogError(ex,
                "initiate-upload could not mint storage credentials for course {CourseId}. Exchange StatusCode={ExchangeStatusCode}",
                courseId, (int)ex.StatusCode);
            return StorageProviderRejected();
        }
    }

    /// <summary>
    /// Hotfix 10.8c (1.C): RFC 7807 body for storage-provider failures on the upload path —
    /// 503 (retryable downstream) instead of a bare 500, with an actionable message. Shape
    /// matches the global ExceptionHandlingMiddleware (errorCode extension + problem+json).
    /// </summary>
    private ObjectResult StorageProviderRejected() =>
        new(new ProblemDetails
        {
            Type = "https://cms.example.com/errors/storage_provider_rejected",
            Title = "Storage Provider Rejected",
            Status = StatusCodes.Status503ServiceUnavailable,
            Detail = "Storage provider rejected credentials. Please verify R2 endpoint configuration.",
            Extensions = { ["errorCode"] = "STORAGE_PROVIDER_REJECTED" }
        })
        {
            StatusCode = StatusCodes.Status503ServiceUnavailable,
            ContentTypes = { "application/problem+json" }
        };

    /// <summary>
    /// Legacy multipart resume support (pre-10.8f rows only): lists the parts already
    /// stored and returns fresh presigned URLs for the remaining parts. Single-PUT
    /// episodes answer with an explicit inactive status — there is nothing to resume.
    /// </summary>
    [HttpGet("episodes/{episodeId:guid}/multipart-status")]
    public async Task<ActionResult<MultipartStatusDto>> MultipartStatus(Guid episodeId, CancellationToken ct)
    {
        var subjectId = await SubjectIdForEpisodeAsync(episodeId, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Edit, subjectId.Value, ct)) return Forbid();
        return Ok(await _mediator.Send(new GetMultipartStatusQuery(episodeId), ct));
    }

    /// <summary>
    /// Finalizes a single-PUT upload (Hotfix 10.8f — no parts): the handler HEADs the
    /// stored object to prove the browser PUT landed and to verify its actual size
    /// against the ceiling, then marks the episode ready for playback (video assets
    /// enter the transcoding pipeline).
    /// </summary>
    [HttpPost("episodes/{episodeId:guid}/complete-upload")]
    public async Task<ActionResult<CourseEpisodeDto>> CompleteUpload(Guid episodeId, [FromBody] CompleteUploadRequestDto dto, CancellationToken ct)
    {
        var subjectId = await SubjectIdForEpisodeAsync(episodeId, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Edit, subjectId.Value, ct)) return Forbid();
        // Push 10.5: metadata (title/description/difficulty) rides the complete-upload
        // body from the 10.4 upload panel — null keys keep the initiate-time values.
        // Push 10.8: TargetQuality rides too — THE 10.7 binding gap: the DTO never
        // exposed the key, so the admin's P360/P720/P1080 pick was silently dropped
        // at this boundary and the worker encoded the full Auto ladder.
        return Ok(await _mediator.Send(new CompleteEpisodeUploadCommand(episodeId,
            dto.Title, dto.Description, dto.Difficulty, dto.TargetQuality), ct));
    }

    /// <summary>
    /// Push 10.8 — aborts an in-flight server-side transcode: marks the episode
    /// Failed (terminal) and signals the worker to kill the running FFmpeg process.
    /// The admin "إلغاء المعالجة" button — an escape hatch for stuck encodes.
    /// </summary>
    [HttpPost("episodes/{episodeId:guid}/abort-processing")]
    public async Task<ActionResult<CourseEpisodeDto>> AbortProcessing(Guid episodeId, CancellationToken ct)
    {
        var subjectId = await SubjectIdForEpisodeAsync(episodeId, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Edit, subjectId.Value, ct)) return Forbid();
        return Ok(await _mediator.Send(new AbortEpisodeProcessingCommand(episodeId, GetAdminId()), ct));
    }

    /// <summary>Aborts an in-flight upload and removes the incomplete episode row.</summary>
    [HttpPost("episodes/{episodeId:guid}/abort-upload")]
    public async Task<IActionResult> AbortUpload(Guid episodeId, CancellationToken ct)
    {
        var subjectId = await SubjectIdForEpisodeAsync(episodeId, ct);
        if (subjectId is null) return NotFound();
        if (!await CanManageAsync(Actions.Delete, subjectId.Value, ct)) return Forbid();
        await _mediator.Send(new AbortEpisodeUploadCommand(episodeId, GetAdminId()), ct);
        return NoContent();
    }
}

public record AdminCourseListItem(Guid Id, Guid SubjectId, string SubjectName, string Title, string Status, int EpisodesCount, int ViewsCount, DateTime CreatedAt);
public record CreateCourseDto(Guid SubjectId, string Title, string? Description, string? CoverImageUrl);
public record UpdateCourseDto(string Title, string? Description, string? CoverImageUrl);
public record AddYouTubeEpisodeDto(string Title, int EpisodeNumber, int? DurationSeconds, string YoutubeVideoId);
public record UpdateEpisodeDto(
    string Title,
    int EpisodeNumber,
    int? DurationSeconds,
    // Push 10.5 — PATCH-optional metadata from the 10.4 edit modal.
    string? Description = null,
    Difficulty? Difficulty = null,
    // Push 10.8 — PATCH-optional transcoding target from the edit modal's quality
    // dropdown (the 10.7 gap: the command accepted it, this boundary dropped it).
    TargetQuality? TargetQuality = null
);
public record InitiateUploadRequestDto(string FileName, string ContentType, long FileSize, string Title, int EpisodeNumber);
public record CompleteUploadRequestDto(
    // Hotfix 10.8f — no parts: the browser PUT the whole file in one request before
    // calling this endpoint. Old clients still sending a "parts" key are simply
    // ignored by ASP.NET model binding (unknown JSON keys don't bind).
    // Push 10.5 — additive metadata keys sent by the 10.4 upload panel.
    string? Title = null,
    string? Description = null,
    Difficulty? Difficulty = null,
    // Push 10.8 — the upload panel's quality dropdown value ("Auto"|"P360"|"P720"|
    // "P1080" via the JsonStringEnumConverter). Absent = keep the stored target.
    TargetQuality? TargetQuality = null
);
