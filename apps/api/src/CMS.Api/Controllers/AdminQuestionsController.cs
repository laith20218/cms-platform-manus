using System.Security.Claims;
using CMS.Api.Authorization;
using CMS.Application.Commands.Questions;
using CMS.Application.Common;
using CMS.Application.DTOs.Questions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

// PR-4 — the admin question-bank list supports an allowlisted server-side sort.
// Anything outside this map is a 400 (fail loudly, never a silent wrong order).
// CorrectRate sorting is intentionally NOT offered: it is a computed ratio and
// ordering by it would require an untranslatable client-side evaluation.
internal static class QuestionSortFields
{
    public const string UpdatedAt = "updatedAt";
    public const string CreatedAt = "createdAt";
    public const string Attempts = "attempts";
    public const string Text = "text";

    public static readonly string[] All = { UpdatedAt, CreatedAt, Attempts, Text };

    /// <summary>Null sort/order falls back to the historical default (updatedAt desc).</summary>
    public static string? Resolve(string? sort) => string.IsNullOrWhiteSpace(sort)
        ? UpdatedAt
        : All.Contains(sort.Trim(), StringComparer.Ordinal) ? sort.Trim() : null;

    /// <summary>Null order falls back to desc; unknown values return null (→ 400).</summary>
    public static bool? IsAscending(string? order) => string.IsNullOrWhiteSpace(order)
        ? false
        : order.Trim().ToLowerInvariant() switch
        {
            "asc" => true,
            "desc" => false,
            _ => null,
        };
}

// PR-4 — tags filter. `q.Tags.Any(t => filterTags.Contains(t))` does NOT translate
// on the InMemory test provider (parameter-list Contains inside a nested Any), so
// the filter is compiled as an OR-chain of `q.Tags.Any(t => t == <constant>)` —
// one branch per requested tag, translating identically on Npgsql (EXISTS over
// unnest(tags)) and InMemory. OR semantics: a question matches when it carries ANY
// of the requested tags.
internal static class QuestionTagFilter
{
    public static IQueryable<Question> Apply(IQueryable<Question> query, IReadOnlyList<string> tags)
    {
        if (tags.Count == 0) return query;

        var parameter = System.Linq.Expressions.Expression.Parameter(typeof(Question), "q");
        System.Linq.Expressions.Expression? body = null;
        foreach (var tag in tags)
        {
            var tagParameter = System.Linq.Expressions.Expression.Parameter(typeof(string), "t");
            var equals = System.Linq.Expressions.Expression.Equal(
                tagParameter, System.Linq.Expressions.Expression.Constant(tag));
            var anyBody = System.Linq.Expressions.Expression.Lambda<Func<string, bool>>(equals, tagParameter);
            var anyCall = System.Linq.Expressions.Expression.Call(
                typeof(Enumerable), nameof(Enumerable.Any), new[] { typeof(string) },
                System.Linq.Expressions.Expression.Property(parameter, nameof(Question.Tags)), anyBody);
            body = body is null ? anyCall : System.Linq.Expressions.Expression.OrElse(body, anyCall);
        }

        return query.Where(System.Linq.Expressions.Expression.Lambda<Func<Question, bool>>(body!, parameter));
    }
}

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
        // PR-4 — question-bank filters (tags · author · created/updated ranges).
        // `tags` accepts repeated params and comma-separated values; a question
        // matches when it carries ANY of the requested tags (OR semantics).
        [FromQuery] List<string>? tags,
        [FromQuery] Guid? authorId,
        [FromQuery] DateTime? createdFrom,
        [FromQuery] DateTime? createdTo,
        [FromQuery] DateTime? updatedFrom,
        [FromQuery] DateTime? updatedTo,
        // PR-4 — allowlisted sort (fail-closed on unknown values).
        [FromQuery] string? sort,
        [FromQuery] string? order,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        if (subjectId == Guid.Empty) return BadRequest(new { error = "subjectId is required" });
        if (!await CanManageSubjectAsync(Actions.View, subjectId, ct)) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail
        if (lectureId.HasValue && !await LectureBelongsToSubjectAsync(lectureId.Value, subjectId, ct))
            return BadRequest(new { error = "lectureId does not belong to subjectId" });

        var normalizedPage = Math.Max(page, 1);
        var normalizedPageSize = Math.Clamp(pageSize, 1, 100);
        var sortField = QuestionSortFields.Resolve(sort);
        if (sortField is null) return BadRequest(new { error = $"sort must be one of: {string.Join(", ", QuestionSortFields.All)}" });
        var ascending = QuestionSortFields.IsAscending(order);
        if (ascending is null) return BadRequest(new { error = "order must be 'asc' or 'desc'" });

        var filterTags = (tags ?? new List<string>())
            .SelectMany(value => value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Where(value => value.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToList();

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
        query = QuestionTagFilter.Apply(query, filterTags);
        if (authorId.HasValue) query = query.Where(question => question.CreatedBy == authorId.Value);
        if (createdFrom.HasValue) query = query.Where(question => question.CreatedAt >= createdFrom.Value);
        if (createdTo.HasValue) query = query.Where(question => question.CreatedAt <= createdTo.Value);
        if (updatedFrom.HasValue) query = query.Where(question => question.UpdatedAt >= updatedFrom.Value);
        if (updatedTo.HasValue) query = query.Where(question => question.UpdatedAt <= updatedTo.Value);

        var ordered = ascending.Value
            ? sortField switch
            {
                QuestionSortFields.CreatedAt => query.OrderBy(question => question.CreatedAt),
                QuestionSortFields.Attempts => query.OrderBy(question => question.AttemptsCount),
                QuestionSortFields.Text => query.OrderBy(question => question.Text),
                _ => query.OrderBy(question => question.UpdatedAt),
            }
            : sortField switch
            {
                QuestionSortFields.CreatedAt => query.OrderByDescending(question => question.CreatedAt),
                QuestionSortFields.Attempts => query.OrderByDescending(question => question.AttemptsCount),
                QuestionSortFields.Text => query.OrderByDescending(question => question.Text),
                _ => query.OrderByDescending(question => question.UpdatedAt),
            };

        var total = await query.CountAsync(ct);
        var questions = await ordered
            .Include(question => question.Lecture)
            .Include(question => question.Options)
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
            question.ParagraphTag,
            question.SemesterCourseId, // Wave 16.2 (C3-3): الدورة anchor
            question.CreatedBy)).ToList(); // PR-4 — author facet

        return Ok(new PagedResult<AdminQuestionListItemDto>(
            items,
            total,
            normalizedPage,
            normalizedPageSize,
            (int)Math.Ceiling(total / (double)normalizedPageSize)));
    }

    /// <summary>
    /// PR-4 — distinct filter values for the question-bank facet bar: the authors
    /// that authored questions in the subject (with display names) and the union
    /// of tags in use. Scoped exactly like the list (QuestionView + subject scope).
    /// </summary>
    [HttpGet("facets")]
    [Authorize(Policy = Policies.QuestionView)]
    public async Task<ActionResult<QuestionFacetsDto>> Facets(
        [FromQuery] Guid subjectId,
        CancellationToken ct = default)
    {
        if (subjectId == Guid.Empty) return BadRequest(new { error = "subjectId is required" });
        if (!await CanManageSubjectAsync(Actions.View, subjectId, ct)) return Forbidden403();

        var authorIds = await _db.Questions.AsNoTracking()
            .Where(question => question.SubjectId == subjectId && question.Status != ContentStatus.Deleted)
            .Select(question => question.CreatedBy)
            .Distinct()
            .ToListAsync(ct);

        var authors = authorIds.Count == 0
            ? new List<QuestionAuthorFacetDto>()
            : (await _db.Admins.AsNoTracking()
                .Where(admin => authorIds.Contains(admin.Id))
                .Select(admin => new { admin.Id, admin.FullName, admin.Email })
                .ToListAsync(ct))
                .Select(admin => new QuestionAuthorFacetDto(admin.Id, string.IsNullOrWhiteSpace(admin.FullName) ? admin.Email : admin.FullName))
                .OrderBy(author => author.Name, StringComparer.Ordinal)
                .ToList();

        // InMemory/Npgsql note: SelectMany over a mapped collection does not translate
        // on both providers — project the tag lists, then flatten client-side (the
        // subject's question count bounds this set).
        var tagLists = await _db.Questions.AsNoTracking()
            .Where(question => question.SubjectId == subjectId && question.Status != ContentStatus.Deleted)
            .Select(question => question.Tags)
            .ToListAsync(ct);
        var tagList = tagLists
            .SelectMany(tags => tags)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(tag => tag, StringComparer.Ordinal)
            .ToList();

        return Ok(new QuestionFacetsDto(authors, tagList));
    }

    /// <summary>
    /// PR-4 — authorized CSV export of the question bank. Streams the same filtered
    /// set as the list endpoint (no paging, bounded by QuestionCsvWriter.MaxRows)
    /// behind the dedicated QuestionExport permission — never a client-only export.
    /// </summary>
    [HttpGet("export")]
    [Authorize(Policy = Policies.QuestionExport)]
    public async Task<IActionResult> Export(
        [FromQuery] Guid subjectId,
        [FromQuery] Guid? lectureId,
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] string? difficulty,
        [FromQuery] string? search,
        [FromQuery] List<string>? tags,
        [FromQuery] Guid? authorId,
        [FromQuery] DateTime? createdFrom,
        [FromQuery] DateTime? createdTo,
        [FromQuery] DateTime? updatedFrom,
        [FromQuery] DateTime? updatedTo,
        CancellationToken ct = default)
    {
        if (subjectId == Guid.Empty) return BadRequest(new { error = "subjectId is required" });
        // Export is a read: the caller must be able to VIEW the subject's questions.
        if (!await CanManageSubjectAsync(Actions.View, subjectId, ct)) return Forbidden403();
        if (lectureId.HasValue && !await LectureBelongsToSubjectAsync(lectureId.Value, subjectId, ct))
            return BadRequest(new { error = "lectureId does not belong to subjectId" });

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
        var filterTags = (tags ?? new List<string>())
            .SelectMany(value => value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Where(value => value.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (filterTags.Count > 0) query = QuestionTagFilter.Apply(query, filterTags);
        if (authorId.HasValue) query = query.Where(question => question.CreatedBy == authorId.Value);
        if (createdFrom.HasValue) query = query.Where(question => question.CreatedAt >= createdFrom.Value);
        if (createdTo.HasValue) query = query.Where(question => question.CreatedAt <= createdTo.Value);
        if (updatedFrom.HasValue) query = query.Where(question => question.UpdatedAt >= updatedFrom.Value);
        if (updatedTo.HasValue) query = query.Where(question => question.UpdatedAt <= updatedTo.Value);

        var rows = await query
            .Include(question => question.Lecture)
            .Include(question => question.Options)
            .OrderByDescending(question => question.UpdatedAt)
            .Take(QuestionCsvWriter.MaxRows)
            .ToListAsync(ct);

        var csv = QuestionCsvWriter.Render(rows);
        var fileName = $"questions-{DateTime.UtcNow:yyyyMMdd-HHmmss}.csv";
        Response.Headers.ContentType = "text/csv; charset=utf-8";
        Response.Headers.ContentDisposition = $"attachment; filename=\"{fileName}\"";
        Response.Headers["X-Export-Rows"] = rows.Count.ToString();
        return Content(csv, "text/csv; charset=utf-8");
    }

    /// <summary>
    /// PR-4 — bulk tagging through the EXISTING tag vocabulary: merges
    /// <paramref name="dto"/>.AddTags and removes RemoveTags. Scope is enforced per
    /// question (out-of-scope ids are skipped, not fatal) — same contract as
    /// bulk-publish/bulk-archive.
    /// </summary>
    [HttpPost("bulk-tag")]
    [Authorize(Policy = Policies.QuestionEdit)]
    public async Task<ActionResult<BulkQuestionResultDto>> BulkTag([FromBody] BulkQuestionTagDto dto, CancellationToken ct)
    {
        if (dto.Ids.Count == 0) return BadRequest(new { error = "ids is required" });
        if (dto.Ids.Count > 100) return BadRequest(new { error = "bulk limit is 100 ids" });

        var addTags = NormalizeTags(dto.AddTags);
        var removeTags = NormalizeTags(dto.RemoveTags);
        if (addTags.Count == 0 && removeTags.Count == 0)
            return BadRequest(new { error = "addTags or removeTags is required" });
        if (addTags.Count > 20 || removeTags.Count > 20)
            return BadRequest(new { error = "tag limit is 20 per request" });

        var (adminId, questions, notFound) = await LoadBulkBatchAsync(new BulkQuestionActionDto(dto.Ids), ct);
        if (adminId is null) return Unauthorized();

        int succeeded = 0, skipped = 0;
        foreach (var question in questions)
        {
            if (!await CanManageSubjectAsync(Actions.Edit, question.SubjectId, ct)
                || question.Status == ContentStatus.Deleted)
            {
                skipped++;
                continue;
            }
            question.SetTags(
                question.Tags
                    .Where(tag => !removeTags.Contains(tag, StringComparer.Ordinal))
                    .Concat(addTags.Where(tag => !question.Tags.Contains(tag, StringComparer.Ordinal)))
                    .ToList());
            succeeded++;
        }
        await _db.SaveChangesAsync(ct);
        return Ok(new BulkQuestionResultDto(dto.Ids.Count, succeeded, skipped, notFound));
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = Policies.QuestionView)]
    public async Task<ActionResult<AdminQuestionDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var question = await _db.Questions.AsNoTracking()
            .Include(item => item.Options)
            .FirstOrDefaultAsync(item => item.Id == id && item.Status != ContentStatus.Deleted, ct);
        if (question is null) return NotFound();
        if (!await CanManageSubjectAsync(Actions.View, question.SubjectId, ct)) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail

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

    /// <summary>W14.2 C.1: 403s carry ProblemDetails detail (wave constraint).</summary>
    private ObjectResult Forbidden403() =>
        Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء على هذا السؤال");

    // ===== W14.2 C.1 — editor completion endpoints =====

    /// <summary>Duplicates a question with its options, images and metadata as a fresh Draft.</summary>
    [HttpPost("{id:guid}/duplicate")]
    [Authorize(Policy = Policies.QuestionCreate)]
    public async Task<ActionResult<AdminQuestionDetailDto>> Duplicate(Guid id, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue) return Unauthorized();
        var source = await _db.Questions
            .Include(item => item.Options)
            .Include(item => item.Images)
            .FirstOrDefaultAsync(item => item.Id == id && item.Status != ContentStatus.Deleted, ct);
        if (source is null) return NotFound();
        if (!await CanManageSubjectAsync(Actions.Create, source.SubjectId, ct)) return Forbidden403();

        var copy = Question.Create(source.Text, source.Type, source.SubjectId, source.LectureId,
            source.Difficulty, source.Tags.ToList(), adminId.Value);
        copy.UpdateExplanation(source.Explanation);
        if (!string.IsNullOrWhiteSpace(source.Reference)) copy.SetReference(source.Reference);
        if (!string.IsNullOrWhiteSpace(source.ParagraphTag)) copy.SetParagraphTag(source.ParagraphTag);
        if (source.Year.HasValue) copy.SetYear(source.Year);
        if (source.Type == QuestionType.Essay)
        {
            copy.SetCorrectAnswer(source.CorrectAnswer);
        }
        else if (source.Type == QuestionType.Matching)
        {
            // W20.5 — duplicate carries the وصل payload verbatim (re-validated by
            // the entity); without it the copy could never publish.
            var payload = source.GetMatchingPayload();
            if (payload is not null) copy.SetMatchingPayload(payload);
        }
        else
        {
            foreach (var option in source.Options.OrderBy(option => option.SortOrder))
                copy.AddOption(option.Text, option.IsCorrect, option.OptionLetter);
        }
        await _db.Questions.AddAsync(copy, ct);
        foreach (var image in source.Images)
            await _db.QuestionImages.AddAsync(QuestionImage.Create(copy.Id, image.ImageUrl, image.AltText, image.SortOrder), ct);
        await _db.SaveChangesAsync(ct);
        return Ok(ToDetail(copy));
    }

    /// <summary>Reverts a published question to Draft (only Published rows qualify).</summary>
    [HttpPost("{id:guid}/unpublish")]
    [Authorize(Policy = Policies.QuestionEdit)]
    public async Task<IActionResult> Unpublish(Guid id, CancellationToken ct)
    {
        var question = await _db.Questions.FirstOrDefaultAsync(item => item.Id == id, ct);
        if (question is null) return NotFound();
        if (!await CanManageSubjectAsync(Actions.Edit, question.SubjectId, ct)) return Forbidden403();
        question.Unpublish();
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// PR-4 — ADMIN preview superset: the student view (text, options, images) PLUS
    /// the authoring surface (explanation, reference, correct answer, وصل payload,
    /// status) so the universal preview can simulate the student experience —
    /// including the post-answer reveal — without creating a real attempt. The
    /// same roles could fetch all of this from GET /{id}; nothing is leaked here
    /// that the caller could not already read. Student surfaces (questions/random)
    /// keep the correctness-free <see cref="QuestionPreviewDto"/>.
    /// </summary>
    [HttpGet("{id:guid}/preview")]
    [Authorize(Policy = Policies.QuestionView)]
    public async Task<ActionResult<AdminQuestionPreviewDto>> Preview(Guid id, CancellationToken ct)
    {
        var question = await _db.Questions.AsNoTracking()
            .Include(item => item.Options)
            .Include(item => item.Images)
            .FirstOrDefaultAsync(item => item.Id == id, ct);
        if (question is null) return NotFound();
        if (!await CanManageSubjectAsync(Actions.View, question.SubjectId, ct)) return Forbidden403();

        // Choice types: CorrectAnswer stores the correct OPTION id string.
        // Essay: it stores the model-answer text. Matching: unused (payload).
        string? correctOptionId = null;
        string? correctOptionLetter = null;
        string? correctAnswerText = null;
        if (question.Type is QuestionType.Mcq or QuestionType.TrueFalse or QuestionType.MultipleSelect
            or QuestionType.Ordering or QuestionType.Clinical or QuestionType.ImageBased or QuestionType.Interactive)
        {
            var correctOption = question.Options.FirstOrDefault(option => option.IsCorrect);
            if (correctOption is not null)
            {
                correctOptionId = correctOption.Id.ToString();
                correctOptionLetter = correctOption.OptionLetter;
            }
        }
        else if (question.Type == QuestionType.Essay)
        {
            correctAnswerText = question.CorrectAnswer;
        }

        return Ok(new AdminQuestionPreviewDto(
            question.Id,
            question.Text,
            question.Type.ToString(),
            question.Difficulty.ToString(),
            question.Status.ToString(),
            question.Tags,
            question.ParagraphTag,
            question.Year,
            question.Options.OrderBy(option => option.SortOrder)
                .Select(option => new AdminPreviewOptionDto(option.Id, option.OptionLetter, option.Text, option.ImageUrl, option.IsCorrect)).ToList(),
            question.Images.OrderBy(image => image.SortOrder)
                .Select(image => new PreviewImageDto(image.ImageUrl, image.AltText, image.SortOrder)).ToList(),
            question.Explanation,
            question.ExplanationHtml,
            question.Reference,
            correctOptionId,
            correctOptionLetter,
            correctAnswerText,
            question.GetMatchingPayload() is { } matching ? MatchingMapper.ToDto(matching) : null)); // W20.5
    }

    /// <summary>Bulk publish — per-question scope check; out-of-scope or already-published ids are skipped (reported, not fatal).</summary>
    [HttpPost("bulk-publish")]
    [Authorize(Policy = Policies.QuestionEdit)]
    public async Task<ActionResult<BulkQuestionResultDto>> BulkPublish([FromBody] BulkQuestionActionDto dto, CancellationToken ct)
    {
        var (adminId, questions, notFound) = await LoadBulkBatchAsync(dto, ct);
        if (adminId is null) return Unauthorized();
        if (dto.Ids.Count == 0) return BadRequest(new { error = "ids is required" });
        if (dto.Ids.Count > 100) return BadRequest(new { error = "bulk limit is 100 ids" });

        int succeeded = 0, skipped = 0;
        foreach (var question in questions)
        {
            if (!await CanManageSubjectAsync(Actions.Edit, question.SubjectId, ct) || question.Status == ContentStatus.Published)
            {
                skipped++;
                continue;
            }
            question.Publish();
            succeeded++;
        }
        await _db.SaveChangesAsync(ct);
        return Ok(new BulkQuestionResultDto(dto.Ids.Count, succeeded, skipped, notFound));
    }

    /// <summary>Bulk archive — Deleted/Archived ids are skipped; already-deleted rows never resurrect.</summary>
    [HttpPost("bulk-archive")]
    [Authorize(Policy = Policies.QuestionEdit)]
    public async Task<ActionResult<BulkQuestionResultDto>> BulkArchive([FromBody] BulkQuestionActionDto dto, CancellationToken ct)
    {
        var (adminId, questions, notFound) = await LoadBulkBatchAsync(dto, ct);
        if (adminId is null) return Unauthorized();
        if (dto.Ids.Count == 0) return BadRequest(new { error = "ids is required" });
        if (dto.Ids.Count > 100) return BadRequest(new { error = "bulk limit is 100 ids" });

        int succeeded = 0, skipped = 0;
        foreach (var question in questions)
        {
            if (!await CanManageSubjectAsync(Actions.Edit, question.SubjectId, ct)
                || question.Status is ContentStatus.Archived or ContentStatus.Deleted)
            {
                skipped++;
                continue;
            }
            question.Archive();
            succeeded++;
        }
        await _db.SaveChangesAsync(ct);
        return Ok(new BulkQuestionResultDto(dto.Ids.Count, succeeded, skipped, notFound));
    }

    /// <summary>PR-4 — trims, drops empties and de-duplicates tag input from bulk payloads.</summary>
    private static List<string> NormalizeTags(IEnumerable<string>? tags) =>
        (tags ?? Enumerable.Empty<string>())
            .Select(tag => tag.Trim())
            .Where(tag => tag.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToList();

    /// <summary>Shared loader for the bulk endpoints — skips Deleted rows, never resurrects them.</summary>
    private async Task<(Guid? AdminId, List<CMS.Domain.Entities.Question> Questions, List<Guid> NotFoundIds)> LoadBulkBatchAsync(BulkQuestionActionDto dto, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!adminId.HasValue || dto.Ids.Count == 0) return (adminId, new List<CMS.Domain.Entities.Question>(), new List<Guid>());
        var questions = await _db.Questions
            .Include(item => item.Options) // Publish() validates options — never load bare rows.
            .Where(item => dto.Ids.Contains(item.Id) && item.Status != ContentStatus.Deleted)
            .ToListAsync(ct);
        var found = questions.Select(item => item.Id).ToHashSet();
        return (adminId, questions, dto.Ids.Where(id => !found.Contains(id)).ToList());
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
        question.ParagraphTag,
        question.SemesterCourseId, // Wave 16.2 (C3-3): الدورة anchor
        question.GetMatchingPayload() is { } matching ? MatchingMapper.ToDto(matching) : null); // W20.5
}
