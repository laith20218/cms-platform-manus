using System.Security.Claims;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
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

        var now = DateTime.UtcNow;
        var studentCanSearch = await _db.Students.AsNoTracking().AnyAsync(student =>
            student.Id == studentId
            && student.DeletedAt == null
            && (student.Status != StudentStatus.Banned || (student.BanUntil != null && student.BanUntil <= now)), ct);
        if (!studentCanSearch)
            return Ok(new StudentSearchResponseDto(Array.Empty<StudentSearchResultDto>()));

        var cappedLimit = Math.Clamp(limit, 1, 30);
        var activeGrants = _db.StudentSubscriptions.AsNoTracking()
            .Where(subscription => subscription.StudentId == studentId
                && subscription.Status == SubscriptionStatus.Active
                && subscription.RevokedAt == null
                && subscription.StartsAt <= now
                && subscription.ExpiresAt > now);

        var entitledSubjectIds =
            from subjectEntity in _db.Subjects.AsNoTracking()
            join semester in _db.Semesters.AsNoTracking() on subjectEntity.SemesterId equals semester.Id
            join academicYear in _db.AcademicYears.AsNoTracking() on semester.AcademicYearId equals academicYear.Id
            join college in _db.Colleges.AsNoTracking() on academicYear.CollegeId equals college.Id
            join university in _db.Universities.AsNoTracking() on college.UniversityId equals university.Id
            where subjectEntity.Status == "active" && subjectEntity.DeletedAt == null
                && semester.Status == "active" && semester.DeletedAt == null
                && academicYear.Status == "active" && academicYear.DeletedAt == null
                && college.Status == "active" && college.DeletedAt == null
                && university.Status == "active" && university.DeletedAt == null
                && activeGrants.Any(grant =>
                    (grant.ScopeType == SubscriptionScopeType.Subject && grant.ScopeSubjectId == subjectEntity.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Semester && grant.ScopeSemesterId == semester.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Year && grant.ScopeYearId == academicYear.Id)
                    || (grant.ScopeType == SubscriptionScopeType.College && grant.ScopeCollegeId == college.Id)
                    || (grant.ScopeType == SubscriptionScopeType.University && grant.ScopeUniversityId == university.Id))
            select subjectEntity.Id;

        var subjectResults = await _db.Subjects.AsNoTracking()
            .Where(item => entitledSubjectIds.Contains(item.Id)
                && (item.NameAr.Contains(term) || (item.NameEn != null && item.NameEn.Contains(term))))
            .OrderBy(item => item.NameAr)
            .Take(cappedLimit)
            .Select(item => new StudentSearchResultDto("subject", item.Id, item.NameAr, item.NameEn, item.Slug, null, null))
            .ToListAsync(ct);

        var remaining = cappedLimit - subjectResults.Count;
        if (remaining <= 0) return Ok(new StudentSearchResponseDto(subjectResults));

        var lectureResults = await (
            from lecture in _db.Lectures.AsNoTracking()
            join academicSubject in _db.Subjects.AsNoTracking() on lecture.SubjectId equals academicSubject.Id
            join semester in _db.Semesters.AsNoTracking() on academicSubject.SemesterId equals semester.Id
            join academicYear in _db.AcademicYears.AsNoTracking() on semester.AcademicYearId equals academicYear.Id
            join college in _db.Colleges.AsNoTracking() on academicYear.CollegeId equals college.Id
            join university in _db.Universities.AsNoTracking() on college.UniversityId equals university.Id
            where entitledSubjectIds.Contains(academicSubject.Id)
                && lecture.Status == "active"
                && lecture.DeletedAt == null
                && lecture.NameAr.Contains(term)
                && activeGrants.Any(grant =>
                    ((grant.ScopeType == SubscriptionScopeType.Subject && grant.ScopeSubjectId == academicSubject.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Semester && grant.ScopeSemesterId == semester.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Year && grant.ScopeYearId == academicYear.Id)
                    || (grant.ScopeType == SubscriptionScopeType.College && grant.ScopeCollegeId == college.Id)
                    || (grant.ScopeType == SubscriptionScopeType.University && grant.ScopeUniversityId == university.Id))
                    && (grant.ContentScope == SubscriptionContentScope.LecturesText
                        || grant.ContentScope == SubscriptionContentScope.FullSubject
                        || grant.ContentScope == SubscriptionContentScope.FullYear))
            orderby lecture.NameAr
            select new StudentSearchResultDto("lecture", lecture.Id, lecture.NameAr, null, academicSubject.Slug, academicSubject.NameAr, lecture.LectureNumber))
            .Take(remaining)
            .ToListAsync(ct);

        return Ok(new StudentSearchResponseDto(subjectResults.Concat(lectureResults).ToList()));
    }
}

public sealed record StudentSearchResponseDto(IReadOnlyList<StudentSearchResultDto> Items);
public sealed record StudentSearchResultDto(string Kind, Guid Id, string Title, string? Subtitle, string SubjectSlug, string? SubjectName, int? LectureNumber);
