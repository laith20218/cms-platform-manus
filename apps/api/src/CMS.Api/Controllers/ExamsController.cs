using System.Security.Claims;
using CMS.Application.Commands.Exams;
using CMS.Application.DTOs.Exams;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Student-facing exam discovery, persistence, submission, result and review APIs.
/// Administrative operations live under /api/v1/admin/exams to keep the trust boundaries explicit.
/// </summary>
[ApiController]
[Route("api/v1/exams")]
[Authorize]
public sealed class ExamsController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;

    public ExamsController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
    }

    [HttpGet("by-subject/{subjectId:guid}")]
    public async Task<ActionResult<List<ExamListItemDto>>> GetExamsBySubject(Guid subjectId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetExamsBySubjectQuery(subjectId, studentId.Value), ct));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ExamDto>> GetExam(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForExamAsync(id, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetExamByIdQuery(id, studentId.Value), ct));
    }

    [HttpPost("{examId:guid}/start")]
    public async Task<ActionResult<ExamSessionDto>> StartExam(Guid examId, [FromBody] StartExamSessionDto? dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForExamAsync(examId, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        var idempotencyKey = Request.Headers["Idempotency-Key"].FirstOrDefault() ?? dto?.IdempotencyKey;
        return Ok(await _mediator.Send(new StartExamSessionCommand(examId, studentId.Value, idempotencyKey), ct));
    }

    [HttpGet("sessions/{sessionId:guid}")]
    public async Task<ActionResult<ExamSessionDto>> GetSession(Guid sessionId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForOwnedSessionAsync(sessionId, studentId.Value, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetExamSessionQuery(sessionId, studentId.Value), ct));
    }

    [HttpPut("sessions/{sessionId:guid}/questions/{questionId:guid}/answer")]
    public async Task<ActionResult<SaveExamAnswerResultDto>> SaveAnswer(Guid sessionId, Guid questionId, [FromBody] SaveExamAnswerDto dto, CancellationToken ct)
    {
        if (dto.QuestionId != questionId) return BadRequest("معرف السؤال في المسار لا يطابق جسم الطلب");
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForOwnedSessionAsync(sessionId, studentId.Value, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new SaveExamAnswerCommand(sessionId, studentId.Value, questionId, dto.Answer, dto.CurrentQuestionOrder, dto.ClearAnswer), ct));
    }

    [HttpPost("sessions/{sessionId:guid}/submit")]
    public async Task<ActionResult<ExamResultDto>> SubmitExam(Guid sessionId, [FromBody] SubmitExamDto? dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForOwnedSessionAsync(sessionId, studentId.Value, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new SubmitExamCommand(sessionId, studentId.Value, dto?.Answers), ct));
    }

    [HttpPost("sessions/{sessionId:guid}/cancel")]
    public async Task<IActionResult> CancelExam(Guid sessionId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForOwnedSessionAsync(sessionId, studentId.Value, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        await _mediator.Send(new CancelExamSessionCommand(sessionId, studentId.Value), ct);
        return NoContent();
    }

    [HttpGet("sessions/{sessionId:guid}/results")]
    public async Task<ActionResult<ExamResultDto>> GetResults(Guid sessionId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForOwnedSessionAsync(sessionId, studentId.Value, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetExamResultQuery(sessionId, studentId.Value), ct));
    }

    [HttpGet("sessions/{sessionId:guid}/review")]
    public async Task<ActionResult<ExamReviewDto>> GetReview(Guid sessionId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForOwnedSessionAsync(sessionId, studentId.Value, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetExamReviewQuery(sessionId, studentId.Value), ct));
    }

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;

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
}
