using System.Security.Claims;
using CMS.Api.Authorization;
using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Questions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Administrative question directory. A caller must have the requested Questions
/// permission and be scoped to the subject that owns every listed or read question.
/// </summary>
[ApiController]
[Route("api/v1/admin/questions")]
[Authorize(Roles = "admin,super_admin")]
public sealed class AdminQuestionsController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    private readonly IPermissionService _permissions;

    public AdminQuestionsController(IApplicationDbContext db, IPermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    [HttpGet]
    [Authorize(Policy = Policies.QuestionView)]
    public async Task<ActionResult<PagedResult<AdminQuestionListItemDto>>> List(
        [FromQuery] Guid subjectId,
        [FromQuery] Guid? lectureId,
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] string? difficulty,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        if (subjectId == Guid.Empty) return BadRequest(new { error = "subjectId is required" });
        if (!await CanManageSubjectAsync(Actions.View, subjectId, ct)) return Forbid();
        if (lectureId.HasValue && !await LectureBelongsToSubjectAsync(lectureId.Value, subjectId, ct))
            return BadRequest(new { error = "lectureId does not belong to subjectId" });

        var normalizedPage = Math.Max(page, 1);
        var normalizedPageSize = Math.Clamp(pageSize, 1, 100);
        var query = _db.Questions.AsNoTracking()
            .Where(question => question.SubjectId == subjectId && question.Status != ContentStatus.Deleted);

        if (lectureId.HasValue) query = query.Where(question => question.LectureId == lectureId.Value);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ContentStatus>(status, true, out var parsedStatus))
            query = query.Where(question => question.Status == parsedStatus);
        if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<QuestionType>(type, true, out var parsedType))
            query = query.Where(question => question.Type == parsedType);
        if (!string.IsNullOrWhiteSpace(difficulty) && Enum.TryParse<Difficulty>(difficulty, true, out var parsedDifficulty))
            query = query.Where(question => question.Difficulty == parsedDifficulty);
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(question => question.Text.Contains(search));

        var total = await query.CountAsync(ct);
        var questions = await query
            .Include(question => question.Lecture)
            .Include(question => question.Options)
            .OrderByDescending(question => question.UpdatedAt)
            .Skip((normalizedPage - 1) * normalizedPageSize)
            .Take(normalizedPageSize)
            .ToListAsync(ct);

        var items = questions.Select(question => new AdminQuestionListItemDto(
            question.Id,
            question.SubjectId,
            question.LectureId,
            question.Text.ToString(),
            question.Type.ToString(),
            question.Difficulty.ToString(),
            question.Status.ToString(),
            question.Tags,
            question.Lecture?.NameAr,
            question.Options.Count,
            question.AttemptsCount,
            question.GetCorrectRate(),
            question.CreatedAt,
            question.UpdatedAt,
            question.Year,
            question.ParagraphTag)).ToList();

        return Ok(new PagedResult<AdminQuestionListItemDto>(
            items,
            total,
            normalizedPage,
            normalizedPageSize,
            (int)Math.Ceiling(total / (double)normalizedPageSize)));
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = Policies.QuestionView)]
    public async Task<ActionResult<AdminQuestionDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var question = await _db.Questions.AsNoTracking()
            .Include(item => item.Options)
            .FirstOrDefaultAsync(item => item.Id == id && item.Status != ContentStatus.Deleted, ct);
        if (question is null) return NotFound();
        if (!await CanManageSubjectAsync(Actions.View, question.SubjectId, ct)) return Forbid();

        return Ok(ToDetail(question));
    }

    // ===== W14.2 B.4 (D12) — question report triage =====

    /// <summary>
    /// Paged triage list of question error reports (D12 classification). Scoped
    /// admins see only reports whose question sits inside their persisted scope;
    /// super admins see everything.
    /// </summary>
    [HttpGet("reports")]
    [Authorize(Policy = Policies.QuestionView)]
    public async Task<ActionResult<PagedResult<AdminErrorReportListItemDto>>> ListReports(
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();

        IQueryable<CMS.Domain.Entities.ErrorReport> query = _db.ErrorReports.AsNoTracking().Include(report => report.Question);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ErrorReportStatus>(status, true, out var parsedStatus))
            query = query.Where(report => report.Status == parsedStatus);
        if (!string.IsNullOrWhiteSpace(type) && Enum.TryParse<ReportType>(type, true, out var parsedType))
            query = query.Where(report => report.ReportType == parsedType);

        // Scope narrowing mirrors AdminExamQueryHandlers.ApplyScopeAsync: super admin
        // unfiltered; a scoped admin without any academic scope gets nothing silently
        // rejected with 403 instead (fail-closed).
        var scope = await _permissions.GetScopeAsync(adminId.Value, ct);
        if (scope is { IsSuperAdmin: false })
        {
            if (!scope.UniversityId.HasValue && !scope.CollegeId.HasValue && !scope.YearId.HasValue && !scope.SubjectId.HasValue)
                return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا يوجد نطاق أكاديمي صالح للمدير");
            query = query.Where(report =>
                !scope.SubjectId.HasValue || report.Question.SubjectId == scope.SubjectId.Value);
        }
        else if (scope is null)
        {
            return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا يوجد نطاق أكاديمي صالح للمدير");
        }

        var normalizedPage = Math.Max(page, 1);
        var normalizedPageSize = Math.Clamp(pageSize, 1, 100);
        var total = await query.CountAsync(ct);
        var reports = await query
            .OrderByDescending(report => report.CreatedAt)
            .Skip((normalizedPage - 1) * normalizedPageSize)
            .Take(normalizedPageSize)
            .ToListAsync(ct);

        var items = reports.Select(report => new AdminErrorReportListItemDto(
            report.Id,
            report.QuestionId,
            report.Question.Text,
            report.StudentId,
            report.ReasonType.ToString(),
            report.ReportType.ToString(),
            report.Description,
            report.ScreenshotUrl,
            report.Status.ToString(),
            report.CreatedAt,
            report.ResolvedAt,
            report.ResolutionNotes)).ToList();

        return Ok(new PagedResult<AdminErrorReportListItemDto>(
            items, total, normalizedPage, normalizedPageSize,
            (int)Math.Ceiling(total / (double)normalizedPageSize)));
    }

    /// <summary>Marks a report Resolved (D12): sets resolver, timestamp and optional notes.</summary>
    [HttpPut("reports/{id:guid}/resolve")]
    [Authorize(Policy = Policies.QuestionEdit)]
    public async Task<IActionResult> ResolveReport(Guid id, [FromBody] ResolveErrorReportDto? dto, CancellationToken ct)
    {
        var report = await LoadReportInScopeAsync(id, Actions.Edit, ct);
        if (report is null) return NotFound();
        report.Status = ErrorReportStatus.Resolved;
        report.ResolvedBy = GetAdminId();
        report.ResolvedAt = DateTime.UtcNow;
        report.ResolutionNotes = string.IsNullOrWhiteSpace(dto?.Notes) ? null : dto!.Notes!.Trim();
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Marks a report Rejected (D12): sets resolver, timestamp and optional notes.</summary>
    [HttpPut("reports/{id:guid}/reject")]
    [Authorize(Policy = Policies.QuestionEdit)]
    public async Task<IActionResult> RejectReport(Guid id, [FromBody] ResolveErrorReportDto? dto, CancellationToken ct)
    {
        var report = await LoadReportInScopeAsync(id, Actions.Edit, ct);
        if (report is null) return NotFound();
        report.Status = ErrorReportStatus.Rejected;
        report.ResolvedBy = GetAdminId();
        report.ResolvedAt = DateTime.UtcNow;
        report.ResolutionNotes = string.IsNullOrWhiteSpace(dto?.Notes) ? null : dto!.Notes!.Trim();
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Loads a report only when the caller holds the verb AND the owning question's subject is in scope. Null when absent or out of scope (no existence leak).</summary>
    private async Task<CMS.Domain.Entities.ErrorReport?> LoadReportInScopeAsync(Guid reportId, string action, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return null;
        var report = await _db.ErrorReports
            .Include(item => item.Question)
            .FirstOrDefaultAsync(item => item.Id == reportId, ct);
        if (report is null) return null;
        if (!await _permissions.HasPermissionAsync(adminId.Value, Resources.Questions, action, ct)
            || !await _permissions.IsInScopeAsync(adminId.Value, "subject", report.Question.SubjectId, ct))
            return null;
        return report;
    }

    private async Task<bool> CanManageSubjectAsync(string action, Guid subjectId, CancellationToken ct)
    {
        var adminId = GetAdminId();
        return adminId.HasValue
            && await _permissions.HasPermissionAsync(adminId.Value, Resources.Questions, action, ct)
            && await _permissions.IsInScopeAsync(adminId.Value, "subject", subjectId, ct);
    }

    private Guid? GetAdminId() => Guid.TryParse(
        User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value,
        out var id)
        ? id
        : null;

    private async Task<bool> LectureBelongsToSubjectAsync(Guid lectureId, Guid subjectId, CancellationToken ct) =>
        await _db.Lectures.AsNoTracking().AnyAsync(lecture => lecture.Id == lectureId && lecture.SubjectId == subjectId, ct);

    private static AdminQuestionDetailDto ToDetail(Question question) => new(
        question.Id,
        question.SubjectId,
        question.LectureId,
        question.Text,
        question.Type.ToString(),
        question.Difficulty.ToString(),
        question.Status.ToString(),
        question.Tags,
        question.Reference,
        question.Year,
        question.Explanation,
        question.CorrectAnswer,
        question.Options.OrderBy(option => option.SortOrder)
            .Select(option => new QuestionOptionDto(option.Id, option.OptionLetter, option.Text, option.ImageUrl)).ToList(),
        question.CreatedAt,
        question.UpdatedAt,
        question.ParagraphTag);
}
