using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Evaluates academic access from active server-side subscriptions only. A valid
/// grant may intentionally target a subject outside the student's own enrolment.
/// </summary>
public sealed class EntitlementService : IEntitlementService
{
    private readonly ApplicationDbContext _db;

    public EntitlementService(ApplicationDbContext db) => _db = db;

    public async Task<bool> CanAccessQuestionAsync(Guid studentId, Guid questionId, string action, CancellationToken ct = default)
    {
        var subjectId = await _db.Questions.AsNoTracking()
            .Where(question => question.Id == questionId && question.Status == ContentStatus.Published)
            .Select(question => (Guid?)question.SubjectId)
            .FirstOrDefaultAsync(ct);
        return subjectId.HasValue && await CanAccessSubjectContentAsync(studentId, subjectId.Value, SubscriptionContentScope.QuestionsExams, ct);
    }

    public async Task<bool> CanAccessLectureAsync(Guid studentId, Guid lectureId, string action, CancellationToken ct = default)
    {
        var subjectId = await _db.Lectures.AsNoTracking()
            .Where(lecture => lecture.Id == lectureId && lecture.Status == "active" && lecture.DeletedAt == null)
            .Select(lecture => (Guid?)lecture.SubjectId)
            .FirstOrDefaultAsync(ct);
        return subjectId.HasValue && await CanAccessSubjectContentAsync(studentId, subjectId.Value, SubscriptionContentScope.LecturesText, ct);
    }

    public async Task<bool> CanAccessExamAsync(Guid studentId, Guid examId, string action, CancellationToken ct = default)
    {
        var subjectId = await _db.Exams.AsNoTracking()
            .Where(exam => exam.Id == examId && exam.Status == ContentStatus.Published && exam.DeletedAt == null)
            .Select(exam => (Guid?)exam.SubjectId)
            .FirstOrDefaultAsync(ct);
        return subjectId.HasValue && await CanAccessSubjectContentAsync(studentId, subjectId.Value, SubscriptionContentScope.QuestionsExams, ct);
    }

    public Task<bool> CanAccessSubjectAsync(Guid studentId, Guid subjectId, string action, CancellationToken ct = default)
    {
        var requiredScope = ResolveActionScope(action);
        return HasActiveGrantForSubjectAsync(studentId, subjectId, requiredScope, ct);
    }

    public Task<bool> CanAccessSubjectContentAsync(Guid studentId, Guid subjectId, SubscriptionContentScope requiredContentScope, CancellationToken ct = default) =>
        HasActiveGrantForSubjectAsync(studentId, subjectId, requiredContentScope, ct);

    private async Task<bool> HasActiveGrantForSubjectAsync(Guid studentId, Guid subjectId, SubscriptionContentScope? requiredContentScope, CancellationToken ct)
    {
        var student = await _db.Students.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.Id == studentId, ct);
        if (student is null || student.IsBanned() || student.DeletedAt is not null)
            return false;

        var subject = await _db.Subjects.AsNoTracking()
            .Include(candidate => candidate.Semester)
                .ThenInclude(semester => semester.AcademicYear)
                    .ThenInclude(year => year.College)
            .FirstOrDefaultAsync(candidate => candidate.Id == subjectId && candidate.Status == "active" && candidate.DeletedAt == null, ct);
        if (subject is null)
            return false;

        var now = DateTime.UtcNow;
        var grants = await _db.StudentSubscriptions.AsNoTracking()
            .Where(subscription => subscription.StudentId == studentId
                && subscription.Status == SubscriptionStatus.Active
                && subscription.RevokedAt == null
                && subscription.StartsAt <= now
                && subscription.ExpiresAt > now)
            .ToListAsync(ct);

        var year = subject.Semester.AcademicYear;
        return grants.Any(grant => MatchesAcademicScope(grant, subject, year)
            && (!requiredContentScope.HasValue || GrantsContent(grant.ContentScope, requiredContentScope.Value)));
    }

    private static bool MatchesAcademicScope(StudentSubscription grant, Subject subject, AcademicYear year) => grant.ScopeType switch
    {
        SubscriptionScopeType.Subject => grant.ScopeSubjectId == subject.Id,
        SubscriptionScopeType.Semester => grant.ScopeSemesterId == subject.SemesterId,
        SubscriptionScopeType.Year => grant.ScopeYearId == year.Id,
        SubscriptionScopeType.College => grant.ScopeCollegeId == year.CollegeId,
        SubscriptionScopeType.University => grant.ScopeUniversityId == year.College.UniversityId,
        _ => false
    };

    private static bool GrantsContent(SubscriptionContentScope granted, SubscriptionContentScope required) =>
        granted is SubscriptionContentScope.FullSubject or SubscriptionContentScope.FullYear || granted == required;

    private static SubscriptionContentScope? ResolveActionScope(string action)
    {
        if (action.Contains("question", StringComparison.OrdinalIgnoreCase) || action.Contains("exam", StringComparison.OrdinalIgnoreCase))
            return SubscriptionContentScope.QuestionsExams;
        if (action.Contains("lecture", StringComparison.OrdinalIgnoreCase) || action.Contains("text", StringComparison.OrdinalIgnoreCase))
            return SubscriptionContentScope.LecturesText;
        if (action.Contains("video", StringComparison.OrdinalIgnoreCase) || action.Contains("audio", StringComparison.OrdinalIgnoreCase))
            return SubscriptionContentScope.VideoAudio;
        return null;
    }
}
