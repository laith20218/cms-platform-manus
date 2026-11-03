using CMS.Application.Commands.Practice;
using CMS.Application.DTOs.Practice;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// W14.2 B.3 — DB-backed practice tracking (D13). The client is offline-first
/// (LocalStorage + 30s periodic sync, D8) and this API is the eventual source of
/// truth. Every route is entitlement-gated against the model exam's subject.
/// </summary>
[ApiController]
[Route("api/v1/practice")]
[Authorize]
public sealed class PracticeController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;
    private readonly IApplicationDbContext _db;

    public PracticeController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements, IApplicationDbContext db)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
        _db = db;
    }

    /// <summary>Idempotent get-or-create for one student's open practice run over a model exam.</summary>
    [HttpPost("{examModelId:guid}/start")]
    public async Task<ActionResult<StartPracticeSessionResultDto>> Start(Guid examModelId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForExamAsync(examModelId, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new StartPracticeSessionCommand(studentId.Value, examModelId), ct));
    }

    [HttpPut("{sessionId:guid}/answer")]
    public async Task<ActionResult<SubmitPracticeAnswerResultDto>> SubmitAnswer(
        Guid sessionId, [FromBody] SubmitPracticeAnswerDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await SessionEntitlementRejectionAsync(studentId.Value, sessionId, ct);
        if (rejection is not null) return rejection;
        // W14.4: the categorized lens is echoed by the client and re-verified per answer.
        var filter = MapFilter(dto.LectureId, dto.UntaggedLecture, dto.ParagraphTag, dto.UntaggedTag);
        return Ok(await _mediator.Send(new SubmitPracticeAnswerCommand(
            studentId.Value, sessionId, dto.QuestionId, dto.SelectedAnswer, dto.DurationSeconds, dto.AnsweredAt, filter), ct));
    }

    [HttpPost("{sessionId:guid}/reset-question/{questionId:guid}")]
    public async Task<IActionResult> ResetQuestion(Guid sessionId, Guid questionId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await SessionEntitlementRejectionAsync(studentId.Value, sessionId, ct);
        if (rejection is not null) return rejection;
        await _mediator.Send(new ResetPracticeQuestionCommand(studentId.Value, sessionId, questionId), ct);
        return NoContent();
    }

    /// <summary>Wipes every answer of the session (D13 reset story, server-tracked).</summary>
    [HttpPost("{sessionId:guid}/reset")]
    public async Task<IActionResult> ResetSession(Guid sessionId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await SessionEntitlementRejectionAsync(studentId.Value, sessionId, ct);
        if (rejection is not null) return rejection;
        await _mediator.Send(new ResetPracticeSessionCommand(studentId.Value, sessionId), ct);
        return NoContent();
    }

    [HttpGet("{sessionId:guid}/progress")]
    public async Task<ActionResult<PracticeProgressDto>> GetProgress(
        Guid sessionId, [FromQuery] PracticeProgressFilterDto? filter, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await SessionEntitlementRejectionAsync(studentId.Value, sessionId, ct);
        if (rejection is not null) return rejection;
        var categoryFilter = filter is null
            ? null
            : MapFilter(filter.LectureId, filter.UntaggedLecture, filter.ParagraphTag, filter.UntaggedTag);
        return Ok(await _mediator.Send(new GetPracticeProgressQuery(studentId.Value, sessionId, categoryFilter), ct));
    }

    // ===== W14.4 (A.4) — categorized practice =====

    /// <summary>The subject's practice-eligible questions grouped Lecture → ParagraphTag,
    /// with the anchor exam that will persist practice sessions for the subject.</summary>
    [HttpGet("categorized/{subjectId:guid}")]
    public async Task<ActionResult<CategorizedPracticeTreeDto>> GetCategorizedTree(Guid subjectId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetCategorizedPracticeTreeQuery(studentId.Value, subjectId), ct));
    }

    /// <summary>Starts (or resumes) a practice session over the (lecture, paragraphTag) filter.
    /// The response carries the ordered question set so the player renders in one round trip.</summary>
    [HttpPost("categorized/{subjectId:guid}/start")]
    public async Task<ActionResult<StartCategorizedPracticeResultDto>> StartCategorized(
        Guid subjectId, [FromBody] StartCategorizedPracticeDto? dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new StartCategorizedPracticeCommand(
            studentId.Value, subjectId,
            dto?.LectureId, dto?.UntaggedLecture ?? false, dto?.ParagraphTag, dto?.UntaggedTag ?? false), ct));
    }

    // ===== helpers =====

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;

    /// <summary>NULL when the client sent no lens (exam-composition semantics stay W14.2).</summary>
    private static PracticeCategoryFilter? MapFilter(Guid? lectureId, bool untaggedLecture, string? paragraphTag, bool untaggedTag) =>
        lectureId.HasValue || untaggedLecture || !string.IsNullOrWhiteSpace(paragraphTag) || untaggedTag
            ? new PracticeCategoryFilter(lectureId, untaggedLecture, paragraphTag, untaggedTag)
            : null;

    private async Task<Guid?> SubjectIdForExamAsync(Guid examId, CancellationToken ct) =>
        await _db.Exams.AsNoTracking()
            .Where(exam => exam.Id == examId && exam.Status == CMS.Domain.Enums.ContentStatus.Published && exam.DeletedAt == null)
            .Select(exam => (Guid?)exam.SubjectId)
            .FirstOrDefaultAsync(ct);

    private async Task<ActionResult?> SessionEntitlementRejectionAsync(Guid studentId, Guid sessionId, CancellationToken ct)
    {
        var subjectId = await _db.PracticeSessions.AsNoTracking()
            .Where(session => session.Id == sessionId && session.StudentId == studentId)
            .Select(session => (Guid?)session.ExamModel.SubjectId)
            .FirstOrDefaultAsync(ct);
        return await EntitlementRejectionAsync(studentId, subjectId, ct);
    }

    private async Task<ActionResult?> EntitlementRejectionAsync(Guid studentId, Guid? subjectId, CancellationToken ct)
    {
        if (!subjectId.HasValue) return NotFound();
        var token = Request.Headers["X-Entitlement"].FirstOrDefault();
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(installationId)) return Unauthorized();
        var validation = await _signedEntitlements.ValidateAsync(token, studentId, installationId, subjectId, ct);
        // W14.2 A.2 discipline: 403 = ProblemDetails with detail.
        return validation.IsValid
            ? null
            : Problem(statusCode: StatusCodes.Status403Forbidden,
                detail: validation.FailureReason ?? "الاشتراك لا يغطي محتوى هذه المادة");
    }
}
