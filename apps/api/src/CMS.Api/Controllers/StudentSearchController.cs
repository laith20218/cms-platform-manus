using System.Security.Claims;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

[ApiController]
[Route("api/v1/search")]
[Authorize(Roles = "student")]
public sealed class StudentSearchController : ControllerBase
{
    private readonly IApplicationDbContext _db;

    public StudentSearchController(IApplicationDbContext db) => _db = db;

    [HttpGet]
    [ProducesResponseType(typeof(StudentSearchResponseDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<StudentSearchResponseDto>> Search([FromQuery] string? q, [FromQuery] int limit = 20, CancellationToken ct = default)
    {
        var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subject, out var studentId)) return Unauthorized();

        var term = q?.Trim();
        if (string.IsNullOrWhiteSpace(term) || term.Length < 2)
            return Ok(new StudentSearchResponseDto(Array.Empty<StudentSearchResultDto>()));

        var academicYearId = await _db.Students.AsNoTracking()
            .Where(student => student.Id == studentId && student.DeletedAt == null)
            .Select(student => student.AcademicYearId)
            .FirstOrDefaultAsync(ct);
        if (!academicYearId.HasValue)
            return Ok(new StudentSearchResponseDto(Array.Empty<StudentSearchResultDto>()));

        var cappedLimit = Math.Clamp(limit, 1, 30);
        var semesterIds = _db.Semesters.AsNoTracking()
            .Where(semester => semester.AcademicYearId == academicYearId.Value)
            .Select(semester => semester.Id);

        var subjectResults = await _db.Subjects.AsNoTracking()
            .Where(item => semesterIds.Contains(item.SemesterId) && (item.NameAr.Contains(term) || (item.NameEn != null && item.NameEn.Contains(term))))
            .OrderBy(item => item.NameAr)
            .Take(cappedLimit)
            .Select(item => new StudentSearchResultDto("subject", item.Id, item.NameAr, item.NameEn, item.Slug, null, null))
            .ToListAsync(ct);

        var remaining = cappedLimit - subjectResults.Count;
        if (remaining <= 0) return Ok(new StudentSearchResponseDto(subjectResults));

        var lectureResults = await (
            from lecture in _db.Lectures.AsNoTracking()
            join academicSubject in _db.Subjects.AsNoTracking() on lecture.SubjectId equals academicSubject.Id
            where semesterIds.Contains(academicSubject.SemesterId) && lecture.NameAr.Contains(term)
            orderby lecture.NameAr
            select new StudentSearchResultDto("lecture", lecture.Id, lecture.NameAr, null, academicSubject.Slug, academicSubject.NameAr, lecture.LectureNumber))
            .Take(remaining)
            .ToListAsync(ct);

        return Ok(new StudentSearchResponseDto(subjectResults.Concat(lectureResults).ToList()));
    }
}

public sealed record StudentSearchResponseDto(IReadOnlyList<StudentSearchResultDto> Items);
public sealed record StudentSearchResultDto(string Kind, Guid Id, string Title, string? Subtitle, string SubjectSlug, string? SubjectName, int? LectureNumber);
