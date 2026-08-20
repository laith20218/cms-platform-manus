using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Evaluates subscription access from server-side identity, academic hierarchy, and
/// active grants. Client supplied resource IDs are never sufficient to grant access.
/// </summary>
public sealed class EntitlementService : IEntitlementService
{
    private readonly ApplicationDbContext _db;

    public EntitlementService(ApplicationDbContext db) => _db = db;

    public async Task<bool> CanAccessQuestionAsync(Guid studentId, Guid questionId, string action, CancellationToken ct = default)
    {
        var subjectId = await _db.Questions.AsNoTracking()
            .Where(q => q.Id == questionId && q.Status == ContentStatus.Published)
            .Select(q => (Guid?)q.SubjectId)
            .FirstOrDefaultAsync(ct);
        return subjectId.HasValue && await CanAccessSubjectAsync(studentId, subjectId.Value, action, ct);
    }

    public async Task<bool> CanAccessLectureAsync(Guid studentId, Guid lectureId, string action, CancellationToken ct = default)
    {
        var subjectId = await _db.Lectures.AsNoTracking()
            .Where(lecture => lecture.Id == lectureId && lecture.Status == "active" && lecture.DeletedAt == null)
            .Select(lecture => (Guid?)lecture.SubjectId)
            .FirstOrDefaultAsync(ct);
        return subjectId.HasValue && await CanAccessSubjectAsync(studentId, subjectId.Value, action, ct);
    }

    public async Task<bool> CanAccessExamAsync(Guid studentId, Guid examId, string action, CancellationToken ct = default)
    {
        var subjectId = await _db.Exams.AsNoTracking()
            .Where(exam => exam.Id == examId && exam.Status == ContentStatus.Published && exam.DeletedAt == null)
            .Select(exam => (Guid?)exam.SubjectId)
            .FirstOrDefaultAsync(ct);
        return subjectId.HasValue && await CanAccessSubjectAsync(studentId, subjectId.Value, action, ct);
    }

    public async Task<bool> CanAccessSubjectAsync(Guid studentId, Guid subjectId, string action, CancellationToken ct = default)
    {
        var student = await _db.Students.AsNoTracking().FirstOrDefaultAsync(s => s.Id == studentId, ct);
        if (student is null || student.IsBanned() || student.DeletedAt is not null)
            return false;

        var subject = await _db.Subjects.AsNoTracking()
            .Include(s => s.Semester)
                .ThenInclude(semester => semester.AcademicYear)
                    .ThenInclude(year => year.College)
            .FirstOrDefaultAsync(s => s.Id == subjectId && s.Status == "active" && s.DeletedAt == null, ct);
        if (subject is null)
            return false;

        var year = subject.Semester.AcademicYear;
        if (student.UniversityId != year.College.UniversityId
            || student.CollegeId != year.CollegeId
            || student.AcademicYearId != year.Id)
            return false;

        var now = DateTime.UtcNow;
        var grants = await _db.StudentSubscriptions.AsNoTracking()
            .Where(s => s.StudentId == studentId
                && s.Status == SubscriptionStatus.Active
                && s.RevokedAt == null
                && s.StartsAt <= now
                && s.ExpiresAt > now)
            .ToListAsync(ct);

        return grants.Any(grant => grant.ScopeType switch
        {
            SubscriptionScopeType.Subject => grant.ScopeSubjectId == subject.Id,
            SubscriptionScopeType.Semester => grant.ScopeSemesterId == subject.SemesterId,
            SubscriptionScopeType.Year => grant.ScopeYearId == year.Id,
            SubscriptionScopeType.College => grant.ScopeCollegeId == year.CollegeId,
            SubscriptionScopeType.University => grant.ScopeUniversityId == year.College.UniversityId,
            _ => false
        });
    }
}
