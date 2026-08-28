using System.Security.Claims;
using CMS.Api.Authorization;
using CMS.Application.Commands.Exams;
using CMS.Application.DTOs.Exams;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.Api.Controllers;

/// <summary>
/// Administrative exam management API. Permissions are evaluated by the policy and every
/// mutation additionally verifies the subject or exam is in the caller's persisted scope.
/// </summary>
[ApiController]
[Route("api/v1/admin/exams")]
[Authorize]
public sealed class AdminExamsController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly IPermissionService _permissions;

    public AdminExamsController(MediatR.ISender mediator, IPermissionService permissions)
    {
        _mediator = mediator;
        _permissions = permissions;
    }

    [HttpGet]
    [Authorize(Policy = Policies.ExamView)]
    public async Task<ActionResult<PagedExamResultDto<AdminExamListItemDto>>> List(
        [FromQuery] Guid? subjectId,
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        return Ok(await _mediator.Send(new GetAdminExamsQuery(adminId.Value, subjectId, status, search, page, pageSize), ct));
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = Policies.ExamView)]
    public async Task<ActionResult<AdminExamDetailsDto>> Get(Guid id, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        if (!await CanManageAsync(adminId.Value, Actions.View, "exam", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new GetAdminExamByIdQuery(id, adminId.Value), ct));
    }

    [HttpGet("question-candidates")]
    [Authorize(Policy = Policies.ExamManageQuestions)]
    public async Task<ActionResult<PagedExamResultDto<ExamQuestionCandidateDto>>> QuestionCandidates(
        [FromQuery] Guid subjectId,
        [FromQuery] Guid? lectureId,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        if (!await CanManageAsync(adminId.Value, Actions.Edit, "subject", subjectId, ct)) return Forbid();
        return Ok(await _mediator.Send(new GetExamQuestionCandidatesQuery(subjectId, lectureId, search, page, pageSize), ct));
    }

    [HttpPost]
    [Authorize(Policy = Policies.ExamCreate)]
    public async Task<ActionResult<ExamDto>> Create([FromBody] UpsertExamRequestDto dto, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        if (!await CanManageAsync(adminId.Value, Actions.Create, "subject", dto.SubjectId, ct)) return Forbid();
        var exam = await _mediator.Send(new CreateExamCommand(ToConfiguration(dto), adminId.Value), ct);
        return CreatedAtAction(nameof(Get), new { id = exam.Id }, exam);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = Policies.ExamEdit)]
    public async Task<ActionResult<ExamDto>> Update(Guid id, [FromBody] UpsertExamRequestDto dto, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        if (!await CanManageAsync(adminId.Value, Actions.Edit, "exam", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new UpdateExamCommand(id, ToConfiguration(dto), adminId.Value), ct));
    }

    [HttpPut("{id:guid}/questions")]
    [Authorize(Policy = Policies.ExamManageQuestions)]
    public async Task<ActionResult<AdminExamDetailsDto>> ReplaceQuestions(Guid id, [FromBody] ReplaceExamQuestionsRequestDto dto, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        if (!await CanManageAsync(adminId.Value, Actions.Edit, "exam", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new ReplaceExamQuestionsCommand(id, dto.QuestionIds, adminId.Value), ct));
    }

    [HttpPost("{id:guid}/publish")]
    [Authorize(Policy = Policies.ExamPublish)]
    public async Task<IActionResult> Publish(Guid id, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        if (!await CanManageAsync(adminId.Value, Actions.Edit, "exam", id, ct)) return Forbid();
        await _mediator.Send(new PublishExamCommand(id, adminId.Value), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/archive")]
    [Authorize(Policy = Policies.ExamArchive)]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        if (!await CanManageAsync(adminId.Value, Actions.Edit, "exam", id, ct)) return Forbid();
        await _mediator.Send(new ArchiveExamCommand(id, adminId.Value), ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = Policies.ExamDelete)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        if (!await CanManageAsync(adminId.Value, Actions.Delete, "exam", id, ct)) return Forbid();
        await _mediator.Send(new DeleteExamCommand(id, adminId.Value), ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/results")]
    [Authorize(Policy = Policies.ExamReadResults)]
    public async Task<ActionResult<PagedExamResultDto<AdminExamResultDto>>> Results(
        Guid id,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        if (!await CanManageAsync(adminId.Value, Actions.View, "exam", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new GetAdminExamResultsQuery(id, adminId.Value, status, page, pageSize), ct));
    }

    private Guid? GetAdminId()
    {
        var value = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(value, out var adminId) ? adminId : null;
    }

    private async Task<bool> CanManageAsync(Guid adminId, string action, string entityType, Guid entityId, CancellationToken ct) =>
        await _permissions.HasPermissionAsync(adminId, Resources.Exams, action, ct)
        && await _permissions.IsInScopeAsync(adminId, entityType, entityId, ct);

    private static ExamConfigurationInput ToConfiguration(UpsertExamRequestDto dto) => new(
        dto.SubjectId, dto.LectureId, dto.TitleAr, dto.TitleEn, dto.Slug, dto.Description,
        dto.ExamType, dto.Year, dto.DurationMinutes, dto.PassingScore, dto.SortOrder,
        dto.AvailableFrom, dto.AvailableUntil, dto.MaxAttempts, dto.ShuffleQuestions,
        dto.ShuffleOptions, dto.ShowResultsImmediately, dto.AllowReview,
        dto.ShowCorrectAnswers, dto.ShowExplanations);
}

public record UpsertExamRequestDto(
    Guid SubjectId,
    Guid? LectureId,
    string TitleAr,
    string? TitleEn,
    string Slug,
    string? Description,
    string ExamType,
    int Year,
    int DurationMinutes,
    decimal PassingScore,
    int SortOrder,
    DateTime? AvailableFrom,
    DateTime? AvailableUntil,
    int? MaxAttempts,
    bool ShuffleQuestions,
    bool ShuffleOptions,
    bool ShowResultsImmediately,
    bool AllowReview,
    bool ShowCorrectAnswers,
    bool ShowExplanations);

public record ReplaceExamQuestionsRequestDto(List<Guid> QuestionIds);
