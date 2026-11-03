using CMS.Application.Commands.ExamCourses;
using CMS.Application.Handlers.ExamCourses;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// W14.4 — the exam-course storefront moved to the content-agnostic "read" gate
/// (Phase 0 ruling): ANY active grant lists the published bundles; grant-less
/// students keep the hard 403. Real EntitlementService, no mocks.
/// </summary>
public class ExamCourseStorefrontAnyGrantW144Tests
{
    private static (StudentExamCourseHandlers Handler, ApplicationDbContext Db) Create(ApplicationDbContext db) =>
        (new StudentExamCourseHandlers(db, new EntitlementService(db)), db);

    private static async Task SeedGrantAsync(ApplicationDbContext db, Guid studentId, Guid subjectId, SubscriptionContentScope scope)
    {
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = studentId,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subjectId,
            ContentScope = scope,
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> SeedPublishedCourseAsync(ApplicationDbContext db)
    {
        var subject = db.Subjects.First();
        var course = new ExamCourse
        {
            SubjectId = subject.Id,
            NameAr = "دورة 2026 الأولى",
            Year = 2026,
            Semester = 1,
            CourseType = ExamCourseType.First,
            FreeOrPaid = true,
            SortOrder = 0,
            Status = ContentStatus.Published
        };
        db.ExamCourses.Add(course);
        await db.SaveChangesAsync();
        return course.Id;
    }

    [Theory]
    [InlineData(SubscriptionContentScope.VideoAudio)]
    [InlineData(SubscriptionContentScope.LecturesText)]
    [InlineData(SubscriptionContentScope.FullSubject)]
    public async Task StorefrontList_AnyActiveGrant_ReturnsPublishedCourses(SubscriptionContentScope scope)
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id, scope);
        var courseId = await SeedPublishedCourseAsync(db);
        var (handler, _) = Create(db);

        var result = await handler.Handle(new GetStudentExamCoursesQuery(student.Id, subject.Id, null, null), CancellationToken.None);

        result.Should().ContainSingle(item => item.Id == courseId);
    }

    [Fact]
    public async Task StorefrontList_NoGrantAtAll_ThrowsForbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedPublishedCourseAsync(db);
        var (handler, _) = Create(db);

        var act = () => handler.Handle(new GetStudentExamCoursesQuery(student.Id, subject.Id, null, null), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }
}
