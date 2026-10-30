using System.Security.Claims;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Administrative content listings. Every list is permission checked first and then
/// restricted to the caller's persisted academic scope before materialization.
/// </summary>
[ApiController]
[Route("api/v1/admin/content")]
[Authorize(Roles = "admin,super_admin")]
public sealed class AdminContentController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    private readonly IPermissionService _permissions;

    public AdminContentController(IApplicationDbContext db, IPermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    private Guid GetAdminId() => Guid.Parse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value!);

    private async Task<AdminScope?> GetAuthorizedScopeAsync(string resource, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, resource, Actions.View, ct)) return null;
        var scope = await _permissions.GetScopeAsync(adminId, ct);
        if (scope is null) return null;
        if (!scope.IsSuperAdmin && !scope.UniversityId.HasValue && !scope.CollegeId.HasValue && !scope.YearId.HasValue && !scope.SubjectId.HasValue)
            return null;
        return scope;
    }

    [HttpGet("questions")]
    public async Task<ActionResult<AdminPagedResult<AdminQuestionListItem>>> GetQuestions(
        [FromQuery] Guid? subjectId, [FromQuery] string? status, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var scope = await GetAuthorizedScopeAsync(Resources.Questions, ct);
        if (scope is null) return Forbid();

        var query = ApplyQuestionScope(_db.Questions.AsNoTracking().Where(question => question.DeletedAt == null), scope);
        if (subjectId.HasValue) query = query.Where(question => question.SubjectId == subjectId.Value);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<CMS.Domain.Enums.ContentStatus>(status, true, out var parsedStatus))
            query = query.Where(question => question.Status == parsedStatus);
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(question => question.Text.Contains(search));

        return Ok(await PageAsync(query, page, pageSize, question => new AdminQuestionListItem(
            question.Id, question.Text, question.SubjectId, question.LectureId, question.Subject.NameAr,
            question.Lecture == null ? null : question.Lecture.NameAr, question.Difficulty.ToString(), question.Status.ToString(), question.CreatedAt), ct));
    }

    [HttpGet("exams")]
    public async Task<ActionResult<AdminPagedResult<AdminExamListItem>>> GetExams(
        [FromQuery] Guid? subjectId, [FromQuery] string? status, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var scope = await GetAuthorizedScopeAsync(Resources.Exams, ct);
        if (scope is null) return Forbid();

        var query = ApplyExamScope(_db.Exams.AsNoTracking().Where(exam => exam.DeletedAt == null), scope);
        if (subjectId.HasValue) query = query.Where(exam => exam.SubjectId == subjectId.Value);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<CMS.Domain.Enums.ContentStatus>(status, true, out var parsedStatus))
            query = query.Where(exam => exam.Status == parsedStatus);
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(exam => exam.TitleAr.Contains(search) || (exam.TitleEn != null && exam.TitleEn.Contains(search)));

        return Ok(await PageAsync(query, page, pageSize, exam => new AdminExamListItem(
            exam.Id, exam.SubjectId, exam.Subject.NameAr, exam.TitleAr, exam.TitleEn, exam.ExamType.ToString(),
            exam.DurationMinutes, exam.TotalQuestions, exam.Status.ToString(), exam.CreatedAt), ct));
    }

    [HttpGet("files")]
    public async Task<ActionResult<AdminPagedResult<AdminLibraryFileListItem>>> GetFiles(
        [FromQuery] Guid? subjectId, [FromQuery] string? status, [FromQuery] string? search, [FromQuery] string? category,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var scope = await GetAuthorizedScopeAsync(Resources.Library, ct);
        if (scope is null) return Forbid();

        var query = ApplyFileScope(_db.LibraryFiles.AsNoTracking().Where(file => file.DeletedAt == null), scope);
        if (subjectId.HasValue) query = query.Where(file => file.SubjectId == subjectId.Value);
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<CMS.Domain.Enums.ContentStatus>(status, true, out var parsedStatus))
            query = query.Where(file => file.Status == parsedStatus);
        if (!string.IsNullOrWhiteSpace(search)) query = query.Where(file => file.Title.Contains(search));
        // Push 4: institutional category filter (Curriculum | Lecture | Summary | GoldenIdeas).
        if (!string.IsNullOrWhiteSpace(category) && Enum.TryParse<CMS.Domain.Enums.LibraryFileCategory>(category, true, out var parsedCategory))
            query = query.Where(file => file.Category == parsedCategory);

        return Ok(await PageAsync(query, page, pageSize, file => new AdminLibraryFileListItem(
            file.Id, file.SubjectId, file.LectureId, file.Subject.NameAr, file.Title, file.Type.ToString(),
            file.Category == null ? null : file.Category.ToString(),
            file.FileSize, file.DurationSeconds, file.Status.ToString(), file.VirusScanStatus.ToString(), file.CreatedAt,
            // Wave 11.9 — the admin upload panel polls these keys (phase timeline +
            // error modal). Same .ToString() enum contract as the adjacent status columns.
            file.PdfProcessingStatus == null ? null : file.PdfProcessingStatus.ToString(),
            file.PdfProcessingStatus == CMS.Domain.Enums.PdfProcessingStatus.Failed ? file.ProcessingError : null,
            file.PdfProcessingStatus == CMS.Domain.Enums.PdfProcessingStatus.Ready
                && file.FileUrl.EndsWith("-fixed", StringComparison.Ordinal),
            // R22.2 — the diagnostics report rides for any PDF-pipeline row.
            file.PdfProcessingStatus == null ? null : file.ProcessingError), ct));
    }

    [HttpGet("academic/subjects/{subjectId:guid}/lectures")]
    public async Task<ActionResult<List<AdminLectureListItem>>> GetSubjectLectures(Guid subjectId, [FromQuery] bool includeArchived = false, CancellationToken ct = default)
    {
        var scope = await GetAuthorizedScopeAsync(Resources.Subjects, ct);
        if (scope is null || !await _permissions.IsInScopeAsync(GetAdminId(), "subject", subjectId, ct)) return Forbid();

        var lectures = await _db.Lectures.AsNoTracking()
            .Where(lecture => lecture.SubjectId == subjectId && (includeArchived || lecture.DeletedAt == null))
            .OrderBy(lecture => lecture.LectureNumber)
            .Select(lecture => new AdminLectureListItem(
                lecture.Id, lecture.SubjectId, lecture.NameAr, lecture.NameEn, lecture.Slug,
                lecture.LectureNumber, lecture.DurationMinutes, lecture.Description, lecture.InstructorName, lecture.SourceReference,
                lecture.Status, lecture.DeletedAt != null))
            .ToListAsync(ct);
        return Ok(lectures);
    }

    private static IQueryable<Question> ApplyQuestionScope(IQueryable<Question> query, AdminScope scope)
    {
        if (scope.IsSuperAdmin) return query;
        if (scope.UniversityId.HasValue) query = query.Where(item => item.Subject.Semester.AcademicYear.College.UniversityId == scope.UniversityId.Value);
        if (scope.CollegeId.HasValue) query = query.Where(item => item.Subject.Semester.AcademicYear.CollegeId == scope.CollegeId.Value);
        if (scope.YearId.HasValue) query = query.Where(item => item.Subject.Semester.AcademicYearId == scope.YearId.Value);
        if (scope.SubjectId.HasValue) query = query.Where(item => item.SubjectId == scope.SubjectId.Value);
        return query;
    }

    private static IQueryable<Exam> ApplyExamScope(IQueryable<Exam> query, AdminScope scope)
    {
        if (scope.IsSuperAdmin) return query;
        if (scope.UniversityId.HasValue) query = query.Where(item => item.Subject.Semester.AcademicYear.College.UniversityId == scope.UniversityId.Value);
        if (scope.CollegeId.HasValue) query = query.Where(item => item.Subject.Semester.AcademicYear.CollegeId == scope.CollegeId.Value);
        if (scope.YearId.HasValue) query = query.Where(item => item.Subject.Semester.AcademicYearId == scope.YearId.Value);
        if (scope.SubjectId.HasValue) query = query.Where(item => item.SubjectId == scope.SubjectId.Value);
        return query;
    }

    private static IQueryable<LibraryFile> ApplyFileScope(IQueryable<LibraryFile> query, AdminScope scope)
    {
        if (scope.IsSuperAdmin) return query;
        if (scope.UniversityId.HasValue) query = query.Where(item => item.Subject.Semester.AcademicYear.College.UniversityId == scope.UniversityId.Value);
        if (scope.CollegeId.HasValue) query = query.Where(item => item.Subject.Semester.AcademicYear.CollegeId == scope.CollegeId.Value);
        if (scope.YearId.HasValue) query = query.Where(item => item.Subject.Semester.AcademicYearId == scope.YearId.Value);
        if (scope.SubjectId.HasValue) query = query.Where(item => item.SubjectId == scope.SubjectId.Value);
        return query;
    }

    private static async Task<AdminPagedResult<T>> PageAsync<TEntity, T>(IQueryable<TEntity> query, int page, int pageSize, System.Linq.Expressions.Expression<Func<TEntity, T>> selector, CancellationToken ct) where TEntity : class
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(entity => EF.Property<DateTime>(entity, "CreatedAt"))
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(selector)
            .ToListAsync(ct);
        return new AdminPagedResult<T>(items, total, page, pageSize, (int)Math.Ceiling(total / (double)pageSize));
    }
}

public record AdminPagedResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);
public record AdminQuestionListItem(Guid Id, string Text, Guid SubjectId, Guid? LectureId, string SubjectName, string? LectureName, string Difficulty, string Status, DateTime CreatedAt);
public record AdminExamListItem(Guid Id, Guid SubjectId, string SubjectName, string TitleAr, string? TitleEn, string ExamType, int DurationMinutes, int TotalQuestions, string Status, DateTime CreatedAt);
public record AdminLibraryFileListItem(Guid Id, Guid SubjectId, Guid? LectureId, string SubjectName, string Title, string Type, string? Category, long FileSize, int? DurationSeconds, string Status, string VirusScanStatus, DateTime CreatedAt,
    // Wave 11.9 — Ghostscript pipeline surface (additive, nullable → legacy rows unaffected).
    string? PdfProcessingStatus = null, string? ProcessingError = null, bool FontPipelineFixed = false,
    // R22.2 — the human-readable font diagnostics report (ProcessingError doubles as
    // the diagnostics store: Arabic substitution list on Ready rows, GS stderr tail on Failed).
    string? DiagnosticReport = null);
public record AdminLectureListItem(Guid Id, Guid SubjectId, string TitleAr, string? TitleEn, string Slug, int LectureNumber, int? DurationMinutes, string? Description, string? InstructorName, string? SourceReference, string Status, bool IsArchived);
