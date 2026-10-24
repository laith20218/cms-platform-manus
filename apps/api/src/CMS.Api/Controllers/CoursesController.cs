using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Courses;
using CMS.Application.DTOs.Courses;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Student-facing courses: catalog per subject, course detail with episodes and the
/// episode playback access endpoint. Mirrors the library contract — every request
/// carries the signed entitlement token (X-Entitlement) validated against the course's
/// subject, and playback additionally requires the VideoAudio content scope.
/// </summary>
[ApiController]
[Route("api/v1/courses")]
public class CoursesController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;
    private readonly ISecurityAuditWriter _audit;

    public CoursesController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements, ISecurityAuditWriter audit)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
        _audit = audit;
    }

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;

    /// <summary>
    /// Courses catalog for a subject — only students holding a VideoAudio-capable grant
    /// receive entries (others get an empty list, mirroring the library file listing).
    /// </summary>
    [HttpGet("subject/{subjectId:guid}")]
    [Authorize]
    public async Task<IActionResult> GetSubjectCourses(Guid subjectId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        return Ok(await _mediator.Send(new GetSubjectCoursesQuery(studentId.Value, subjectId), ct));
    }

    /// <summary>Course detail with its ordered episodes.</summary>
    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> GetCourse(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForCourseAsync(id, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        return Ok(await _mediator.Send(new GetCourseByIdQuery(id, studentId.Value), ct));
    }

    /// <summary>
    /// Playback access for one episode: presigned streaming URL (or YouTube embed) plus
    /// the dynamic watermark envelope (student name + phone). Upload episodes whose
    /// multipart upload has not completed are refused.
    /// </summary>
    [HttpPost("episodes/{id:guid}/access")]
    [Authorize]
    public async Task<IActionResult> GetEpisodeAccess(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForEpisodeAsync(id, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null)
        {
            await _audit.LogSecurityEventAsync(studentId.Value, null, SecurityEventType.FileAccessDenied, SecuritySeverity.Warning, "Course episode access denied", ct: ct);
            return rejection;
        }

        var result = await _mediator.Send(new GetEpisodeAccessCommand(id, studentId.Value), ct);
        await _audit.LogSecurityEventAsync(studentId.Value, null, SecurityEventType.FileAccess, SecuritySeverity.Info, "Course episode access granted", ct: ct);
        return Ok(result);
    }

    private async Task<Guid?> SubjectIdForCourseAsync(Guid courseId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        return await db.Courses.AsNoTracking()
            .Where(course => course.Id == courseId)
            .Select(course => (Guid?)course.SubjectId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<Guid?> SubjectIdForEpisodeAsync(Guid episodeId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        return await db.CourseEpisodes.AsNoTracking()
            .Where(episode => episode.Id == episodeId)
            .Select(episode => (Guid?)episode.Course.SubjectId)
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
}
