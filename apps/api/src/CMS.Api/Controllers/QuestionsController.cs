using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Questions;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Question controller - handles question CRUD, answering, reporting, and importing.
/// Students can view + answer questions. Admins can create/update/delete.
/// </summary>
[ApiController]
[Route("api/v1/questions")]
public class QuestionsController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;
    private readonly IPermissionService _permissions;

    public QuestionsController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements, IPermissionService permissions)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
        _permissions = permissions;
    }

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;
    private Guid GetAdminId() => Guid.Parse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value!);

    /// <summary>
    /// Get paginated list of questions with filters.
    /// </summary>
    [HttpGet]
    [Authorize]
    [EnableRateLimiting("questions")]
    public async Task<IActionResult> GetQuestions(
        [FromQuery] Guid? subjectId, [FromQuery] Guid? lectureId, [FromQuery] Guid? examId,
        [FromQuery] string? difficulty, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        [FromQuery] string sort = "createdAt", [FromQuery] string order = "desc",
        CancellationToken ct = default)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();

        Guid? resolvedSubjectId = subjectId;
        if (lectureId.HasValue)
        {
            var lectureSubjectId = await SubjectIdForLectureAsync(lectureId.Value, ct);
            if (!lectureSubjectId.HasValue) return NotFound();
            if (resolvedSubjectId.HasValue && resolvedSubjectId.Value != lectureSubjectId.Value)
                return BadRequest(new { error = "subjectId does not match lectureId" });
            resolvedSubjectId = lectureSubjectId;
        }
        if (examId.HasValue)
        {
            var examSubjectId = await SubjectIdForExamAsync(examId.Value, ct);
            if (!examSubjectId.HasValue) return NotFound();
            if (resolvedSubjectId.HasValue && resolvedSubjectId.Value != examSubjectId.Value)
                return BadRequest(new { error = "subjectId does not match examId" });
            resolvedSubjectId = examSubjectId;
        }
        if (!resolvedSubjectId.HasValue)
            return BadRequest(new { error = "subjectId, lectureId, or examId is required" });

        var rejection = await EntitlementRejectionAsync(studentId.Value, resolvedSubjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetQuestionsQuery(resolvedSubjectId, lectureId, examId, studentId, difficulty, search, page, pageSize, sort, order), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get a single question by ID (without correct answer if not yet answered).
    /// </summary>
    [HttpGet("{id:guid}")]
    [Authorize]
    [EnableRateLimiting("questions")]
    public async Task<IActionResult> GetQuestion(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForQuestionAsync(id, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new GetQuestionByIdQuery(id, studentId), ct);
        return Ok(result);
    }

    /// <summary>
    /// Answer a question - returns correct answer + explanation + updated stats.
    /// </summary>
    [HttpPost("{id:guid}/answer")]
    [Authorize]
    [EnableRateLimiting("questions")]
    public async Task<IActionResult> AnswerQuestion(
        Guid id, [FromBody] AnswerQuestionDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForQuestionAsync(id, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;

        var result = await _mediator.Send(new AnswerQuestionCommand(id, studentId.Value, dto.SelectedOptionId, dto.AnswerText, dto.DurationSeconds, dto.IsOffline), ct);
        return Ok(result);
    }

    /// <summary>
    /// Report an error in a question.
    /// </summary>
    [HttpPost("{id:guid}/report")]
    [Authorize]
    public async Task<IActionResult> ReportQuestion(
        Guid id, [FromBody] ReportQuestionDto dto, CancellationToken ct)
    {
        var studentId = GetStudentId() ?? throw new UnauthorizedAccessException();
        var subjectId = await SubjectIdForQuestionAsync(id, ct);
        var rejection = await EntitlementRejectionAsync(studentId, subjectId, ct);
        if (rejection is not null) return rejection;
        await _mediator.Send(new ReportQuestionCommand(id, studentId, dto.ReasonType, dto.Description, dto.ScreenshotUrl), ct);
        return NoContent();
    }

    private async Task<Guid?> SubjectIdForQuestionAsync(Guid questionId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<CMS.Application.Interfaces.IApplicationDbContext>();
        return await db.Questions.AsNoTracking()
            .Where(question => question.Id == questionId)
            .Select(question => (Guid?)question.SubjectId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<Guid?> SubjectIdForLectureAsync(Guid lectureId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<CMS.Application.Interfaces.IApplicationDbContext>();
        return await db.Lectures.AsNoTracking()
            .Where(lecture => lecture.Id == lectureId)
            .Select(lecture => (Guid?)lecture.SubjectId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<Guid?> SubjectIdForExamAsync(Guid examId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<CMS.Application.Interfaces.IApplicationDbContext>();
        return await db.Exams.AsNoTracking()
            .Where(exam => exam.Id == examId)
            .Select(exam => (Guid?)exam.SubjectId)
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
        return validation.IsValid ? null : Forbid();
    }

    private async Task<bool> CanManageAsync(string action, string entityType, Guid entityId, CancellationToken ct) =>
        await _permissions.HasPermissionAsync(GetAdminId(), Resources.Questions, action, ct)
        && await _permissions.IsInScopeAsync(GetAdminId(), entityType, entityId, ct);

    // ===== Admin Endpoints =====

    /// <summary>
    /// Create a new question (admin only).
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<QuestionDto>> CreateQuestion(
        [FromBody] CreateQuestionDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Create, "subject", dto.SubjectId, ct)) return Forbid();
        var result = await _mediator.Send(new CreateQuestionCommand(
            dto.Text, dto.Type, dto.SubjectId, dto.LectureId,
            dto.Difficulty, dto.Tags, dto.Options, dto.CorrectOptionId, dto.CorrectAnswer,
            dto.Explanation, dto.Reference, dto.Year, GetAdminId()
        ), ct);
        return CreatedAtAction(nameof(GetQuestion), new { id = result.Id }, result);
    }

    /// <summary>
    /// Update a question (admin only).
    /// </summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<QuestionDto>> UpdateQuestion(
        Guid id, [FromBody] UpdateQuestionDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "question", id, ct)) return Forbid();
        var result = await _mediator.Send(new UpdateQuestionCommand(
            id, dto.Text, dto.Difficulty, dto.Tags, dto.Explanation, dto.Reference, dto.Options, dto.CorrectAnswer
        ), ct);
        return Ok(result);
    }

    /// <summary>
    /// Delete a question (soft delete, admin only).
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> DeleteQuestion(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Delete, "question", id, ct)) return Forbid();
        await _mediator.Send(new DeleteQuestionCommand(id, GetAdminId()), ct);
        return NoContent();
    }

    /// <summary>
    /// Publish a question (admin only).
    /// </summary>
    [HttpPost("{id:guid}/publish")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> PublishQuestion(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "question", id, ct)) return Forbid();
        await _mediator.Send(new PublishQuestionCommand(id), ct);
        return NoContent();
    }

    /// <summary>
    /// Archive a question (admin only).
    /// </summary>
    [HttpPost("{id:guid}/archive")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> ArchiveQuestion(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Edit, "question", id, ct)) return Forbid();
        await _mediator.Send(new ArchiveQuestionCommand(id), ct);
        return NoContent();
    }

    /// <summary>
    /// Bulk import questions from Excel/CSV (admin only).
    /// </summary>
    [HttpPost("import")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<ImportResultDto>> ImportQuestions(
        [FromBody] ImportQuestionsDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Actions.Import, "subject", dto.SubjectId, ct)) return Forbid();
        var result = await _mediator.Send(new ImportQuestionsCommand(
            dto.SubjectId, dto.LectureId, dto.Questions, GetAdminId()
        ), ct);
        return Ok(result);
    }
}
