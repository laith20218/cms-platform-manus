using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Academic;
using CMS.Application.DTOs.Academic;
using CMS.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Academic hierarchy controller - manages universities, colleges, years, semesters, subjects, lectures.
/// Students can view (GET), admins can create/update/delete.
/// </summary>
[ApiController]
[Route("api/v1")]
public class AcademicController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly IPermissionService _permissions;
    private readonly IServiceProvider _services;

    public AcademicController(MediatR.ISender mediator, IPermissionService permissions, IServiceProvider services)
    {
        _mediator = mediator;
        _permissions = permissions;
        _services = services;
    }

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;
    private Guid GetAdminId() => Guid.Parse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value!);

    private async Task<bool> CanManageAsync(string resource, string action, string entityType, Guid entityId, CancellationToken ct) =>
        await _permissions.HasPermissionAsync(GetAdminId(), resource, action, ct)
        && await _permissions.IsInScopeAsync(GetAdminId(), entityType, entityId, ct);

    private async Task<bool> CanCreateUniversityAsync(CancellationToken ct)
    {
        var scope = await _permissions.GetScopeAsync(GetAdminId(), ct);
        return scope?.IsSuperAdmin == true
            && await _permissions.HasPermissionAsync(GetAdminId(), Resources.Universities, Actions.Create, ct);
    }

    // ===== Universities =====
    [HttpGet("universities")]
    [AllowAnonymous]
    public async Task<ActionResult<PagedResult<UniversityDto>>> GetUniversities([FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
        => Ok(await _mediator.Send(new GetUniversitiesQuery(page, pageSize), ct));

    [HttpGet("universities/{id:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<UniversityDto>> GetUniversity(Guid id, CancellationToken ct)
        => Ok(await _mediator.Send(new GetUniversityByIdQuery(id), ct));

    [HttpPost("universities")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<UniversityDto>> CreateUniversity([FromBody] CreateUniversityDto dto, CancellationToken ct)
    {
        if (!await CanCreateUniversityAsync(ct)) return Forbid();
        var result = await _mediator.Send(new CreateUniversityCommand(dto.NameAr, dto.NameEn, dto.Slug, dto.Description, dto.LogoUrl, GetAdminId()), ct);
        return CreatedAtAction(nameof(GetUniversity), new { id = result.Id }, result);
    }

    [HttpPut("universities/{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<UniversityDto>> UpdateUniversity(Guid id, [FromBody] UpdateUniversityDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Universities, Actions.Edit, "university", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new UpdateUniversityCommand(id, dto.NameAr, dto.NameEn, dto.Description, dto.LogoUrl), ct));
    }

    [HttpDelete("universities/{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> DeleteUniversity(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Universities, Actions.Delete, "university", id, ct)) return Forbid();
        await _mediator.Send(new DeleteUniversityCommand(id, GetAdminId()), ct);
        return NoContent();
    }

    // ===== Colleges =====
    [HttpGet("universities/{universityId:guid}/colleges")]
    [AllowAnonymous]
    public async Task<ActionResult<List<CollegeDto>>> GetColleges(Guid universityId, CancellationToken ct)
        => Ok(await _mediator.Send(new GetCollegesByUniversityQuery(universityId), ct));

    [HttpGet("colleges/{id:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<CollegeDto>> GetCollege(Guid id, CancellationToken ct)
        => Ok(await _mediator.Send(new GetCollegeByIdQuery(id), ct));

    [HttpPost("colleges")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<CollegeDto>> CreateCollege([FromBody] CreateCollegeDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Colleges, Actions.Create, "university", dto.UniversityId, ct)) return Forbid();
        var result = await _mediator.Send(new CreateCollegeCommand(dto.UniversityId, dto.NameAr, dto.NameEn, dto.Slug, GetAdminId()), ct);
        return Ok(result);
    }

    [HttpPut("colleges/{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<CollegeDto>> UpdateCollege(Guid id, [FromBody] UpdateCollegeDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Colleges, Actions.Edit, "college", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new UpdateCollegeCommand(id, dto.NameAr, dto.NameEn), ct));
    }

    [HttpDelete("colleges/{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> DeleteCollege(Guid id, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Colleges, Actions.Delete, "college", id, ct)) return Forbid();
        await _mediator.Send(new DeleteCollegeCommand(id, GetAdminId()), ct);
        return NoContent();
    }

    // ===== Academic Years =====
    [HttpGet("colleges/{collegeId:guid}/years")]
    [AllowAnonymous]
    public async Task<ActionResult<List<AcademicYearDto>>> GetYears(Guid collegeId, CancellationToken ct)
        => Ok(await _mediator.Send(new GetYearsByCollegeQuery(collegeId), ct));

    [HttpGet("years/{id:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<AcademicYearDto>> GetYear(Guid id, CancellationToken ct)
        => Ok(await _mediator.Send(new GetAcademicYearByIdQuery(id), ct));

    [HttpPost("years")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<AcademicYearDto>> CreateYear([FromBody] CreateAcademicYearDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Years, Actions.Create, "college", dto.CollegeId, ct)) return Forbid();
        return Ok(await _mediator.Send(new CreateAcademicYearCommand(dto.CollegeId, dto.NameAr, dto.NameEn, dto.Slug, dto.YearNumber, GetAdminId()), ct));
    }

    [HttpPut("years/{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<AcademicYearDto>> UpdateYear(Guid id, [FromBody] UpdateAcademicYearDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Years, Actions.Edit, "year", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new UpdateAcademicYearCommand(id, dto.NameAr, dto.NameEn), ct));
    }

    // ===== Semesters =====
    [HttpGet("years/{yearId:guid}/semesters")]
    [Authorize]
    public async Task<ActionResult<List<SemesterDto>>> GetSemesters(Guid yearId, CancellationToken ct)
        => Ok(await _mediator.Send(new GetSemestersByYearQuery(yearId), ct));

    [HttpGet("semesters/{id:guid}")]
    [Authorize]
    public async Task<ActionResult<SemesterDto>> GetSemester(Guid id, CancellationToken ct)
        => Ok(await _mediator.Send(new GetSemesterByIdQuery(id), ct));

    [HttpPost("semesters")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<SemesterDto>> CreateSemester([FromBody] CreateSemesterDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Semesters, Actions.Create, "year", dto.AcademicYearId, ct)) return Forbid();
        return Ok(await _mediator.Send(new CreateSemesterCommand(dto.AcademicYearId, dto.NameAr, dto.NameEn, dto.Slug, dto.SemesterNumber, GetAdminId()), ct));
    }

    // ===== Subjects =====
    [HttpGet("semesters/{semesterId:guid}/subjects")]
    [Authorize]
    public async Task<ActionResult<List<SubjectDto>>> GetSubjects(Guid semesterId, CancellationToken ct)
        => Ok(await _mediator.Send(new GetSubjectsBySemesterQuery(semesterId, GetStudentId()), ct));

    [HttpGet("subjects/{id:guid}")]
    [Authorize]
    public async Task<ActionResult<SubjectDto>> GetSubject(Guid id, CancellationToken ct)
        => Ok(await _mediator.Send(new GetSubjectByIdQuery(id, GetStudentId()), ct));

    [HttpGet("subjects/{slug}")]
    [Authorize]
    public async Task<ActionResult<SubjectDto>> GetSubjectBySlug(string slug, CancellationToken ct)
        => Ok(await _mediator.Send(new GetSubjectBySlugQuery(slug, GetStudentId()), ct));

    [HttpPost("subjects")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<SubjectDto>> CreateSubject([FromBody] CreateSubjectDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Subjects, Actions.Create, "semester", dto.SemesterId, ct)) return Forbid();
        return Ok(await _mediator.Send(new CreateSubjectCommand(dto.SemesterId, dto.NameAr, dto.NameEn, dto.Slug, dto.Code, dto.Description, dto.Color, GetAdminId()), ct));
    }

    [HttpPut("subjects/{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<SubjectDto>> UpdateSubject(Guid id, [FromBody] UpdateSubjectDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Subjects, Actions.Edit, "subject", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new UpdateSubjectCommand(id, dto.NameAr, dto.NameEn, dto.Description, dto.Color), ct));
    }

    private async Task<Guid?> SubjectIdForLectureAsync(Guid lectureId, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        return await db.Lectures.AsNoTracking()
            .Where(lecture => lecture.Id == lectureId && lecture.DeletedAt == null && lecture.Status == "active")
            .Select(lecture => (Guid?)lecture.SubjectId)
            .FirstOrDefaultAsync(ct);
    }

    private async Task<ActionResult?> EntitlementRejectionAsync(Guid studentId, Guid? subjectId, CancellationToken ct)
    {
        if (!subjectId.HasValue) return NotFound();
        var token = Request.Headers["X-Entitlement"].FirstOrDefault();
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(installationId)) return Unauthorized();

        var signedEntitlements = _services.GetRequiredService<ISignedEntitlementService>();
        var validation = await signedEntitlements.ValidateAsync(token, studentId, installationId, subjectId, ct);
        return validation.IsValid ? null : Forbid();
    }

    // ===== Lectures =====
    [HttpGet("subjects/{subjectId:guid}/lectures")]
    [Authorize]
    public async Task<ActionResult<List<LectureDto>>> GetLectures(Guid subjectId, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetLecturesBySubjectQuery(subjectId, studentId), ct));
    }

    [HttpGet("lectures/{id:guid}")]
    [Authorize]
    public async Task<ActionResult<LectureDto>> GetLecture(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await SubjectIdForLectureAsync(id, ct);
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetLectureByIdQuery(id, studentId.Value), ct));
    }

    [HttpPost("lectures")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<LectureDto>> CreateLecture([FromBody] CreateLectureDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Lectures, Actions.Create, "subject", dto.SubjectId, ct)) return Forbid();
        return Ok(await _mediator.Send(new CreateLectureCommand(dto.SubjectId, dto.TitleAr, dto.TitleEn, dto.Slug, dto.LectureNumber, dto.DurationMinutes, GetAdminId()), ct));
    }

    [HttpPut("lectures/{id:guid}")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<LectureDto>> UpdateLecture(Guid id, [FromBody] UpdateLectureDto dto, CancellationToken ct)
    {
        if (!await CanManageAsync(Resources.Lectures, Actions.Edit, "lecture", id, ct)) return Forbid();
        return Ok(await _mediator.Send(new UpdateLectureCommand(id, dto.TitleAr, dto.TitleEn, dto.DurationMinutes), ct));
    }
}
