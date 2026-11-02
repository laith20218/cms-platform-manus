using CMS.Api.Authorization;
using CMS.Application.Commands.ExamCourses;
using CMS.Application.DTOs.ExamCourses;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// W14.2 B.1 — admin API for exam-course bundles (D1). Double-layer auth throughout:
/// class-level role gate PLUS a per-endpoint permission policy (exam verbs, reused
/// from the exam-management resource so deployed role grants stay valid), and every
/// mutation additionally verifies the subject scope of the bundle.
/// </summary>
[ApiController]
[Route("api/v1/admin/exam-courses")]
[Authorize(Roles = "admin,super_admin")]
public sealed class AdminExamCoursesController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly IApplicationDbContext _db;
    private readonly IPermissionService _permissions;

    public AdminExamCoursesController(MediatR.ISender mediator, IApplicationDbContext db, IPermissionService permissions)
    {
        _mediator = mediator;
        _db = db;
        _permissions = permissions;
    }

    [HttpPost]
    [Authorize(Policy = Policies.ExamCourseCreate)]
    public async Task<ActionResult<ExamCourseDetailDto>> Create([FromBody] CreateExamCourseDto dto, CancellationToken ct)
    {
        if (!await CanManageSubjectAsync(Actions.Create, dto.SubjectId, ct)) return Forbidden403();
        var result = await _mediator.Send(new CreateExamCourseCommand(
            dto.SubjectId, dto.NameAr, dto.NameEn, dto.Description, dto.CoverUrl,
            dto.Year, dto.Semester, dto.CourseType, dto.FreeOrPaid, dto.SortOrder, AdminId()), ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = Policies.ExamCourseView)]
    public async Task<ActionResult<ExamCourseDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var course = await _mediator.Send(new GetExamCourseByIdQuery(id), ct);
        if (!await CanManageSubjectAsync(Actions.View, course.SubjectId, ct)) return Forbidden403();
        return Ok(course);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = Policies.ExamCourseEdit)]
    public async Task<ActionResult<ExamCourseDetailDto>> Update(Guid id, [FromBody] UpdateExamCourseDto dto, CancellationToken ct)
    {
        var existing = await _mediator.Send(new GetExamCourseByIdQuery(id), ct);
        if (!await CanManageSubjectAsync(Actions.Edit, existing.SubjectId, ct)) return Forbidden403();
        var result = await _mediator.Send(new UpdateExamCourseCommand(
            id, dto.NameAr, dto.NameEn, dto.Description, dto.CoverUrl,
            dto.Year, dto.Semester, dto.CourseType, dto.FreeOrPaid, dto.SortOrder, AdminId()), ct);
        return Ok(result);
    }

    [HttpPost("{id:guid}/publish")]
    [Authorize(Policy = Policies.ExamCourseEdit)]
    public async Task<IActionResult> Publish(Guid id, CancellationToken ct)
    {
        if (!await CanManageCourseAsync(Actions.Edit, id, ct)) return Forbidden403();
        await _mediator.Send(new PublishExamCourseCommand(id, AdminId()), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/archive")]
    [Authorize(Policy = Policies.ExamCourseEdit)]
    public async Task<IActionResult> Archive(Guid id, CancellationToken ct)
    {
        if (!await CanManageCourseAsync(Actions.Edit, id, ct)) return Forbidden403();
        await _mediator.Send(new ArchiveExamCourseCommand(id, AdminId()), ct);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = Policies.ExamCourseDelete)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (!await CanManageCourseAsync(Actions.Delete, id, ct)) return Forbidden403();
        await _mediator.Send(new DeleteExamCourseCommand(id, AdminId()), ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/exams")]
    [Authorize(Policy = Policies.ExamCourseEdit)]
    public async Task<ActionResult<ExamCourseDetailDto>> AddExam(Guid id, [FromBody] AddExamCourseExamDto dto, CancellationToken ct)
    {
        if (!await CanManageCourseAsync(Actions.Edit, id, ct)) return Forbidden403();
        return Ok(await _mediator.Send(new AddExamToCourseCommand(id, dto.ExamId, AdminId()), ct));
    }

    [HttpDelete("{id:guid}/exams/{examId:guid}")]
    [Authorize(Policy = Policies.ExamCourseEdit)]
    public async Task<ActionResult<ExamCourseDetailDto>> RemoveExam(Guid id, Guid examId, CancellationToken ct)
    {
        if (!await CanManageCourseAsync(Actions.Edit, id, ct)) return Forbidden403();
        await _mediator.Send(new RemoveExamFromCourseCommand(id, examId, AdminId()), ct);
        return Ok(await _mediator.Send(new GetExamCourseByIdQuery(id), ct));
    }

    [HttpPut("{id:guid}/reorder")]
    [Authorize(Policy = Policies.ExamCourseEdit)]
    public async Task<ActionResult<ExamCourseDetailDto>> Reorder(Guid id, [FromBody] ReorderExamCourseExamsDto dto, CancellationToken ct)
    {
        if (!await CanManageCourseAsync(Actions.Edit, id, ct)) return Forbidden403();
        return Ok(await _mediator.Send(new ReorderCourseExamsCommand(id, dto.ExamIds, AdminId()), ct));
    }

    // ===== helpers =====

    private Guid AdminId() => Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id)
        ? id
        : throw new UnauthorizedAccessException("معرّف المدير في الرمز غير صالح");

    /// <summary>W14.2 A.2 discipline: 403s carry a ProblemDetails body with detail.</summary>
    private ObjectResult Forbidden403() =>
        Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية إدارة هذه الدورة الامتحانية");

    private async Task<bool> CanManageSubjectAsync(string action, Guid subjectId, CancellationToken ct) =>
        await _permissions.HasPermissionAsync(AdminId(), Resources.Exams, action, ct)
        && await _permissions.IsInScopeAsync(AdminId(), "subject", subjectId, ct);

    private async Task<bool> CanManageCourseAsync(string action, Guid courseId, CancellationToken ct)
    {
        var subjectId = await _db.ExamCourses.AsNoTracking()
            .Where(course => course.Id == courseId)
            .Select(course => (Guid?)course.SubjectId)
            .FirstOrDefaultAsync(ct);
        if (subjectId is null) return false;
        return await CanManageSubjectAsync(action, subjectId.Value, ct);
    }
}
