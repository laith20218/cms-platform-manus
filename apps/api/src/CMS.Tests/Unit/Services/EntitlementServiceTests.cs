using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace CMS.Tests.Unit.Services;

public class EntitlementServiceTests
{
    [Fact]
    public async Task CanAccessQuestionAsync_ActiveSubjectGrant_AllowsStudent()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = await db.Students.SingleAsync();
        var subject = await db.Subjects.SingleAsync();
        var question = await db.Questions.FirstAsync(q => q.SubjectId == subject.Id);
        db.StudentSubscriptions.Add(ActiveGrant(student.Id, subject.Id));
        await db.SaveChangesAsync();

        var service = new EntitlementService(db);

        (await service.CanAccessSubjectAsync(student.Id, subject.Id, "read")).Should().BeTrue();
        (await service.CanAccessQuestionAsync(student.Id, question.Id, "read")).Should().BeTrue();
    }

    [Fact]
    public async Task CanAccessSubjectAsync_ExpiredGrant_DeniesStudent()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = await db.Students.SingleAsync();
        var subject = await db.Subjects.SingleAsync();
        var expired = ActiveGrant(student.Id, subject.Id);
        expired.StartsAt = DateTime.UtcNow.AddDays(-14);
        expired.ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
        db.StudentSubscriptions.Add(expired);
        await db.SaveChangesAsync();

        var service = new EntitlementService(db);

        (await service.CanAccessSubjectAsync(student.Id, subject.Id, "read")).Should().BeFalse();
    }

    [Fact]
    public async Task CanAccessQuestionAsync_DifferentStudentWithoutGrant_DeniesIdorAttempt()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var entitledStudent = await db.Students.SingleAsync();
        var subject = await db.Subjects.SingleAsync();
        var question = await db.Questions.FirstAsync(q => q.SubjectId == subject.Id);
        db.StudentSubscriptions.Add(ActiveGrant(entitledStudent.Id, subject.Id));

        var otherStudent = Student.Create("0991234567", "hash", "طالب آخر");
        otherStudent.SetAcademicInfo(
            entitledStudent.UniversityId!.Value,
            entitledStudent.CollegeId!.Value,
            entitledStudent.AcademicYearId!.Value);
        otherStudent.VerifyPhone();
        db.Students.Add(otherStudent);
        await db.SaveChangesAsync();

        var service = new EntitlementService(db);

        (await service.CanAccessQuestionAsync(otherStudent.Id, question.Id, "read")).Should().BeFalse();
    }

    private static StudentSubscription ActiveGrant(Guid studentId, Guid subjectId) => new()
    {
        StudentId = studentId,
        ScopeType = SubscriptionScopeType.Subject,
        ScopeSubjectId = subjectId,
        Status = SubscriptionStatus.Active,
        StartsAt = DateTime.UtcNow.AddMinutes(-1),
        ExpiresAt = DateTime.UtcNow.AddDays(7)
    };
}
