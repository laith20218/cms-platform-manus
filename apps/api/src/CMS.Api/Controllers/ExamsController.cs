using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Exams;
using CMS.Application.DTOs.Exams;
using CMS.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Exam controller - handles exam sessions, submission, results, and review.
/// </summary>
[ApiController]
[Route("api/v1/exams")]
public class ExamsController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;
    private readonly IPermissionService _permissions;

    public ExamsController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements, IPermissionService permissions)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
        _permissions = permissions;
    }

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;
    private Guid GetAdminId() => Guid.Parse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value!);

    /// <summary>
    /// Get exams for a subject (with student's attempt status).
    /// </summary>
    [HttpGet("by-subject/{subjectId:guid}")]
    [Authorize]
    public async Task<ActionResult<List<ExamListItemDto>>> GetExamsBySubject(Guid subjectId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetExamsBySubjectQuery(subjectId, studentId), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get exam details.
    /// </summary>
    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ExamDto>> GetExam(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForExamAsync(id, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetExamByIdQuery(id, studentId.Value), ct);
        return Ok(result);
    }

    /// <summary>
    /// Start a new exam session (or resume existing one).
    /// </summary>
    [HttpPost("{examId:guid}/start")]
    [Authorize]
    public async Task<ActionResult<ExamSessionDto>> StartExam(
        Guid examId, [FromBody] StartExamSessionDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForExamAsync(examId, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new StartExamSessionCommand(examId, studentId.Value, dto.Mode), ct);
        return Ok(result);
    }

    /// <summary>
    /// Submit exam answers and get results.
    /// </summary>
    [HttpPost("sessions/{sessionId:guid}/submit")]
    [Authorize]
    public async Task<ActionResult<ExamResultDto>> SubmitExam(
        Guid sessionId, [FromBody] SubmitExamDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForOwnedSessionAsync(sessionId, studentId.Value, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new SubmitExamCommand(sessionId, studentId.Value, dto.Answers), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get exam results (for a completed session).
    /// </summary>
    [HttpGet("sessions/{sessionId:guid}/results")]
    [Authorize]
    public async Task<ActionResult<ExamResultDto>> GetResults(Guid sessionId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForOwnedSessionAsync(sessionId, studentId.Value, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetExamResultQuery(sessionId, studentId.Value), ct);
        return Ok(result);
    }

    /// <summary>
    /// Review exam answers (correct + user answers + explanations).
    /// </summary>
    [HttpGet("sessions/{sessionId:guid}/review")]
    [Authorize]
    public async Task<ActionResult<ExamReviewDto>> GetReview(Guid sessionId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForOwnedSessionAsync(sessionId, studentId.Value, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetExamReviewQuery(sessionId, studentId.Value), ct);
        return Ok(result);
    }

    private async Task<Guid?> SubjectIdForExamAsync(Guid examId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        return await db.Exams.AsNoTracking()
            .Where(exam => exam.Id == examId && exam.Status == CMS.Domain.Enums.ContentStatus.Published && exam.DeletedAt == null)
            .Select(exam => (Guid?)exam.SubjectId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<Guid?> SubjectIdForOwnedSessionAsync(Guid sessionId, Guid studentId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        return await db.ExamSessions.AsNoTracking()
            .Where(session => session.Id == sessionId && session.StudentId == studentId)
            .Select(session => (Guid?)session.Exam.SubjectId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<ActionResult?> EntitlementRejectionAsync(Guid studentId, Guid? subjectId, CancellationToken ct)
    {
        if (!subjectId.HasValue) return NotFound();
        var token = Request.Headers["X-Entitlement"].FirstOrDefault();
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(installationId)) return Unauthorized();

        var validation = await _signedEntitlements.ValidateAsync(token, studentId, installationId, subjectId, ct);
        return validation.IsValid ? null : Forbid();
    }

    private async Task<bool> CanManageAsync(string action, string entityType, Guid entityId, CancellationToken ct) =>
        await _permissions.HasPermissionAsync(GetAdminId(), Resources.Exams, action, ct)
        && await _permissions.IsInScopeAsync(GetAdminId(), entityType, entityId, ct);

    // ===== Admin Endpoints =====

    /// <summary>
    /// Create a new exam (admin only).
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<ExamDto>> CreateExam([FromBody] CreateExamRequestDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Create, "subject", dto.SubjectId, ct)) return Forbid();
        var result = await _mediator.Send(new CreateExamCommand(
            dto.SubjectId, dto.TitleAr, dto.TitleEn, dto.Slug,
            dto.Year, dto.DurationMinutes, dto.PassingScore,
            GetAdminId()
        ), ct);
        return Ok(result);
    }

    /// <summary>
    /// Publish an exam (admin only).
    /// </summary>
    [HttpPost("{id:guid}/publish")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> PublishExam(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "exam", id, ct)) return Forbid();
        await _mediator.Send(new PublishExamCommand(id), ct);
        return NoContent();
    }

    /// <summary>
    /// Update exam configuration and keep its current lifecycle state (admin only).
    /// </summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<ExamDto>> UpdateExam(Guid id, [FromBody] UpdateExamRequestDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "exam", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new UpdateExamCommand(id, dto.TitleAr, dto.TitleEn, dto.Description, dto.DurationMinutes, dto.PassingScore, dto.AllowReview), ct));
    }

    /// <summary>
    /// Archive an exam so it is immediately excluded from student discovery (admin only).
    /// </summary>
    [HttpPost("{id:guid}/archive")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> ArchiveExam(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "exam", id, ct)) return Forbid();
        await _mediator.Send(new ArchiveExamCommand(id), ct);
        return NoContent();
    }

    /// <summary>
    /// Soft-delete an exam while retaining audit and historical attempt records (admin only).
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> DeleteExam(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Delete, "exam", id, ct)) return Forbid();
        await _mediator.Send(new DeleteExamCommand(id, GetAdminId()), ct);
        return NoContent();
    }
}

/// <summary>
/// Request DTO for creating an exam.
/// </summary>
public record CreateExamRequestDto(
    Guid SubjectId,
    string TitleAr,
    string? TitleEn,
    string Slug,
    int Year,
    int DurationMinutes,
    decimal PassingScore
);

public record UpdateExamRequestDto(
    string TitleAr,
    string? TitleEn,
    string? Description,
    int DurationMinutes,
    decimal PassingScore,
    bool AllowReview
);
