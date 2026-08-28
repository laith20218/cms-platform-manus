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
        var perKindLimit = Math.Min(10, cappedLimit);
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

        var subjectResults = await (
            from item in _db.Subjects.AsNoTracking()
            join semester in _db.Semesters.AsNoTracking() on item.SemesterId equals semester.Id
            join academicYear in _db.AcademicYears.AsNoTracking() on semester.AcademicYearId equals academicYear.Id
            join college in _db.Colleges.AsNoTracking() on academicYear.CollegeId equals college.Id
            join university in _db.Universities.AsNoTracking() on college.UniversityId equals university.Id
            where entitledSubjectIds.Contains(item.Id)
                && (item.NameAr.Contains(term) || (item.NameEn ?? string.Empty).Contains(term) || (item.Code ?? string.Empty).Contains(term))
            orderby item.NameAr
            select new StudentSearchResultDto("subject", item.Id, item.NameAr, item.NameEn, item.Slug,
                university.NameAr + " · " + college.NameAr + " · " + academicYear.NameAr,
                null, null, null, null, null))
            .Take(perKindLimit)
            .ToListAsync(ct);

        var lectureResults = await (
            from lecture in _db.Lectures.AsNoTracking()
            join academicSubject in _db.Subjects.AsNoTracking() on lecture.SubjectId equals academicSubject.Id
            join semester in _db.Semesters.AsNoTracking() on academicSubject.SemesterId equals semester.Id
            join academicYear in _db.AcademicYears.AsNoTracking() on semester.AcademicYearId equals academicYear.Id
            join college in _db.Colleges.AsNoTracking() on academicYear.CollegeId equals college.Id
            join university in _db.Universities.AsNoTracking() on college.UniversityId equals university.Id
            where entitledSubjectIds.Contains(academicSubject.Id)
                && lecture.Status == "active" && lecture.DeletedAt == null
                && (lecture.NameAr.Contains(term) || (lecture.NameEn ?? string.Empty).Contains(term) || (lecture.Description ?? string.Empty).Contains(term))
                && activeGrants.Any(grant => ((grant.ScopeType == SubscriptionScopeType.Subject && grant.ScopeSubjectId == academicSubject.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Semester && grant.ScopeSemesterId == semester.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Year && grant.ScopeYearId == academicYear.Id)
                    || (grant.ScopeType == SubscriptionScopeType.College && grant.ScopeCollegeId == college.Id)
                    || (grant.ScopeType == SubscriptionScopeType.University && grant.ScopeUniversityId == university.Id))
                    && (grant.ContentScope == SubscriptionContentScope.LecturesText
                        || grant.ContentScope == SubscriptionContentScope.FullSubject
                        || grant.ContentScope == SubscriptionContentScope.FullYear))
            orderby lecture.NameAr
            select new StudentSearchResultDto("lecture", lecture.Id, lecture.NameAr, lecture.Description, academicSubject.Slug,
                university.NameAr + " · " + college.NameAr + " · " + academicYear.NameAr + " · " + academicSubject.NameAr,
                academicSubject.NameAr, lecture.Id, academicSubject.Id, lecture.LectureNumber, null))
            .Take(perKindLimit)
            .ToListAsync(ct);

        var questionResults = await (
            from question in _db.Questions.AsNoTracking()
            join academicSubject in _db.Subjects.AsNoTracking() on question.SubjectId equals academicSubject.Id
            join semester in _db.Semesters.AsNoTracking() on academicSubject.SemesterId equals semester.Id
            join academicYear in _db.AcademicYears.AsNoTracking() on semester.AcademicYearId equals academicYear.Id
            join college in _db.Colleges.AsNoTracking() on academicYear.CollegeId equals college.Id
            join university in _db.Universities.AsNoTracking() on college.UniversityId equals university.Id
            where entitledSubjectIds.Contains(academicSubject.Id)
                && question.Status == ContentStatus.Published
                && (question.Text.Contains(term) || question.Options.Any(option => option.Text.Contains(term)) || (question.Reference ?? string.Empty).Contains(term) || question.Tags.Any(tag => tag.Contains(term)))
                && activeGrants.Any(grant => ((grant.ScopeType == SubscriptionScopeType.Subject && grant.ScopeSubjectId == academicSubject.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Semester && grant.ScopeSemesterId == semester.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Year && grant.ScopeYearId == academicYear.Id)
                    || (grant.ScopeType == SubscriptionScopeType.College && grant.ScopeCollegeId == college.Id)
                    || (grant.ScopeType == SubscriptionScopeType.University && grant.ScopeUniversityId == university.Id))
                    && (grant.ContentScope == SubscriptionContentScope.QuestionsExams
                        || grant.ContentScope == SubscriptionContentScope.FullSubject
                        || grant.ContentScope == SubscriptionContentScope.FullYear))
            orderby question.UpdatedAt descending
            select new StudentSearchResultDto("question", question.Id, question.Text, question.Reference, academicSubject.Slug,
                university.NameAr + " · " + college.NameAr + " · " + academicYear.NameAr + " · " + academicSubject.NameAr,
                academicSubject.NameAr, question.LectureId, academicSubject.Id, null, null))
            .Take(perKindLimit)
            .ToListAsync(ct);

        var fileResults = await (
            from file in _db.LibraryFiles.AsNoTracking()
            join academicSubject in _db.Subjects.AsNoTracking() on file.SubjectId equals academicSubject.Id
            join semester in _db.Semesters.AsNoTracking() on academicSubject.SemesterId equals semester.Id
            join academicYear in _db.AcademicYears.AsNoTracking() on semester.AcademicYearId equals academicYear.Id
            join college in _db.Colleges.AsNoTracking() on academicYear.CollegeId equals college.Id
            join university in _db.Universities.AsNoTracking() on college.UniversityId equals university.Id
            where entitledSubjectIds.Contains(academicSubject.Id)
                && file.Status == ContentStatus.Published && file.DeletedAt == null && file.VirusScanStatus == VirusScanStatus.Clean
                && (file.Title.Contains(term) || (file.Description ?? string.Empty).Contains(term) || file.Tags.Any(tag => tag.Contains(term)))
                && activeGrants.Any(grant => ((grant.ScopeType == SubscriptionScopeType.Subject && grant.ScopeSubjectId == academicSubject.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Semester && grant.ScopeSemesterId == semester.Id)
                    || (grant.ScopeType == SubscriptionScopeType.Year && grant.ScopeYearId == academicYear.Id)
                    || (grant.ScopeType == SubscriptionScopeType.College && grant.ScopeCollegeId == college.Id)
                    || (grant.ScopeType == SubscriptionScopeType.University && grant.ScopeUniversityId == university.Id))
                    && ((file.Type == LibraryFileType.Video || file.Type == LibraryFileType.Audio)
                        ? (grant.ContentScope == SubscriptionContentScope.VideoAudio || grant.ContentScope == SubscriptionContentScope.FullSubject || grant.ContentScope == SubscriptionContentScope.FullYear)
                        : (grant.ContentScope == SubscriptionContentScope.LecturesText || grant.ContentScope == SubscriptionContentScope.FullSubject || grant.ContentScope == SubscriptionContentScope.FullYear)))
            orderby file.UpdatedAt descending
            select new StudentSearchResultDto(file.Type == LibraryFileType.Video ? "video" : file.Type == LibraryFileType.Audio ? "audio" : file.Type == LibraryFileType.Summary ? "summary" : file.Type == LibraryFileType.Pdf ? "pdf" : file.Type == LibraryFileType.Html ? "html" : file.Type == LibraryFileType.Image ? "image" : file.Type == LibraryFileType.Comprehensive ? "comprehensive" : "paragraph", file.Id, file.Title, file.Description, academicSubject.Slug,
                university.NameAr + " · " + college.NameAr + " · " + academicYear.NameAr + " · " + academicSubject.NameAr,
                academicSubject.NameAr, file.LectureId, academicSubject.Id, null, file.Type == LibraryFileType.Video ? "video" : file.Type == LibraryFileType.Audio ? "audio" : file.Type == LibraryFileType.Summary ? "summary" : file.Type == LibraryFileType.Pdf ? "pdf" : file.Type == LibraryFileType.Html ? "html" : file.Type == LibraryFileType.Image ? "image" : file.Type == LibraryFileType.Comprehensive ? "comprehensive" : "paragraph"))
            .Take(perKindLimit)
            .ToListAsync(ct);

        var results = subjectResults.Concat(lectureResults).Concat(questionResults).Concat(fileResults).Take(cappedLimit).ToList();
        return Ok(new StudentSearchResponseDto(results));
    }

}

public sealed record StudentSearchResponseDto(IReadOnlyList<StudentSearchResultDto> Items);
public sealed record StudentSearchResultDto(
    string Kind, Guid Id, string Title, string? Subtitle, string SubjectSlug, string AcademicContext,
    string? SubjectName, Guid? LectureId, Guid? SubjectId, int? LectureNumber, string? FileType);
