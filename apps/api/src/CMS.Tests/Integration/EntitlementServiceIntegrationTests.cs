using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;

namespace CMS.Tests.Integration;

/// <summary>
/// Verifies the server-side decision point independently from any client entitlement token.
/// </summary>
public sealed class EntitlementServiceIntegrationTests
{
    [Fact]
    public async Task ActiveSubjectSubscription_AllowsPublishedExamInItsScope()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);
        var exam = db.Exams.Single();
        AddSubjectGrant(db, student.Id, subject.Id, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddHours(1));
        await db.SaveChangesAsync();

        var allowed = await new EntitlementService(db).CanAccessExamAsync(student.Id, exam.Id, "read");

        allowed.Should().BeTrue();
    }

    [Fact]
    public async Task ActiveSubjectSubscription_AllowsActiveLectureInItsScope()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);
        var lecture = Lecture.Create(subject.Id, "محاضرة الاستحقاق", "entitlement-lecture", 1);
        db.Lectures.Add(lecture);
        AddSubjectGrant(db, student.Id, subject.Id, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddHours(1));
        await db.SaveChangesAsync();

        var allowed = await new EntitlementService(db).CanAccessLectureAsync(student.Id, lecture.Id, "read_lecture");

        allowed.Should().BeTrue();
    }

    [Fact]
    public async Task ExpiredSubscription_DeniesPublishedExamEvenIfTheExamExists()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);
        var exam = db.Exams.Single();
        AddSubjectGrant(db, student.Id, subject.Id, DateTime.UtcNow.AddDays(-2), DateTime.UtcNow.AddMinutes(-1));
        await db.SaveChangesAsync();

        var allowed = await new EntitlementService(db).CanAccessExamAsync(student.Id, exam.Id, "start_exam");

        allowed.Should().BeFalse();
    }

    [Fact]
    public async Task SubjectScopedSubscription_DeniesExamForAnotherSubject()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var entitledSubject = TestDbHelper.GetTestSubject(db);
        var otherSubject = Subject.Create(entitledSubject.SemesterId, "مادة خارج النطاق", "out-of-scope-subject", "Out of Scope Subject");
        var outOfScopeExam = Exam.Create(otherSubject.Id, "اختبار خارج النطاق", "out-of-scope-exam", 2026, student.Id);
        outOfScopeExam.Publish();
        db.AddRange(otherSubject, outOfScopeExam);
        AddSubjectGrant(db, student.Id, entitledSubject.Id, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddHours(1));
        await db.SaveChangesAsync();

        var allowed = await new EntitlementService(db).CanAccessExamAsync(student.Id, outOfScopeExam.Id, "read");

        allowed.Should().BeFalse();
    }

    private static void AddSubjectGrant(ApplicationDbContext db, Guid studentId, Guid subjectId, DateTime startsAt, DateTime expiresAt)
    {
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = studentId,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subjectId,
            Status = SubscriptionStatus.Active,
            StartsAt = startsAt,
            ExpiresAt = expiresAt
        });
    }
}
