using CMS.Application.Commands.ExamCourses;
using CMS.Application.DTOs.ExamCourses;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// W14.2 B.2 — student storefront for exam-course bundles (D1). Every route is
/// entitlement-gated against the owning subject via the signed entitlement, the
/// same contract as the exam engine; handlers re-verify through the subscription
/// service (fail-closed data path).
/// </summary>
[ApiController]
[Route("api/v1/exam-courses")]
[Authorize]
public sealed class ExamCoursesController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;
    private readonly IApplicationDbContext _db;

    public ExamCoursesController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements, IApplicationDbContext db)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
        _db = db;
    }

    /// <summary>D4: subject/year/semester filters arrive on the URL and are applied server-side.</summary>
    [HttpGet("subject/{subjectId:guid}")]
    public async Task<ActionResult<List<StudentExamCourseListItemDto>>> GetBySubject(
        Guid subjectId, [FromQuery] int? year, [FromQuery] int? semester, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetStudentExamCoursesQuery(studentId.Value, subjectId, year, semester), ct));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<StudentExamCourseDetailDto>> GetDetail(Guid id, CancellationToken ct)
    {
        var studentId = GetStudentId();
        if (!studentId.HasValue) return Unauthorized();
        var subjectId = await _db.ExamCourses.AsNoTracking()
            .Where(course => course.Id == id)
            .Select(course => (Guid?)course.SubjectId)
            .FirstOrDefaultAsync(ct);
        if (!subjectId.HasValue) return NotFound();
        var rejection = await EntitlementRejectionAsync(studentId.Value, subjectId.Value, ct);
        if (rejection is not null) return rejection;
        return Ok(await _mediator.Send(new GetStudentExamCourseDetailQuery(studentId.Value, id), ct));
    }

    private Guid? GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : null;

    private async Task<ActionResult?> EntitlementRejectionAsync(Guid studentId, Guid subjectId, CancellationToken ct)
    {
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
