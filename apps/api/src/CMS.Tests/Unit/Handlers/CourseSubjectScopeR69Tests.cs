using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using CMS.Application.BackgroundJobs;
using CMS.Application.Commands.Courses;
using CMS.Application.Handlers.Courses;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// R69 §3 — GetSubjectCoursesQuery scope semantics against the REAL EntitlementService
/// (no mocked entitlement): a student holding a READ-capable grant but no VideoAudio
/// content scope must receive an EMPTY catalog (locked UI), never the hard 403 that
/// fed the R62 self-heal issue→403 loop (R68 DIAG). Complements the mock-based
/// coverage in CourseHandlersTests with end-to-end grant-matching behavior.
/// </summary>
public class CourseSubjectScopeR69Tests
{
    // ===== helpers =====

    private static CourseHandlers Create(ApplicationDbContext db)
    {
        var entitlements = new EntitlementService(db);
        return new CourseHandlers(
            db,
            new UnitOfWork(db),
            Mock.Of<IFileStorageService>(),
            entitlements,
            Mock.Of<ISystemSettingsService>(),
            Mock.Of<IAdminActivityWriter>(),
            NullLogger<CourseHandlers>.Instance,
            Mock.Of<ITranscodingQueue>(),
            Mock.Of<ITranscodingJobRegistry>());
    }

    private static async Task SeedGrantAsync(ApplicationDbContext db, Guid studentId, Guid subjectId, SubscriptionContentScope contentScope)
    {
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = studentId,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subjectId,
            ContentScope = contentScope,
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Course> SeedCourseAsync(ApplicationDbContext db)
    {
        var subject = db.Subjects.First();
        var course = new Course { SubjectId = subject.Id, Title = "كورس التشريح", CoverImageUrl = null, Status = ContentStatus.Published };
        db.Courses.Add(course);
        await db.SaveChangesAsync();
        return course;
    }

    // ===== R69 §2.A — read-vs-video semantics =====

    [Fact]
    public async Task GetSubjectCourses_ReadGrantWithoutVideoAudio_ReturnsEmptyListNotForbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id, SubscriptionContentScope.LecturesText);
        await SeedCourseAsync(db);
        var handler = Create(db);

        var result = await handler.Handle(new GetSubjectCoursesQuery(student.Id, subject.Id), CancellationToken.None);

        // THE contract: empty list (the UI renders its locked state) — not a 403.
        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetSubjectCourses_VideoAudioGrant_ReturnsPublishedCourses()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        var course = await SeedCourseAsync(db);
        await SeedGrantAsync(db, student.Id, subject.Id, SubscriptionContentScope.VideoAudio);
        var handler = Create(db);

        var result = await handler.Handle(new GetSubjectCoursesQuery(student.Id, subject.Id), CancellationToken.None);

        result.Should().ContainSingle(item => item.Id == course.Id);
    }

    [Fact]
    public async Task GetSubjectCourses_FullSubjectGrant_ReturnsPublishedCourses()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        var course = await SeedCourseAsync(db);
        await SeedGrantAsync(db, student.Id, subject.Id, SubscriptionContentScope.FullSubject);
        var handler = Create(db);

        var result = await handler.Handle(new GetSubjectCoursesQuery(student.Id, subject.Id), CancellationToken.None);

        result.Should().ContainSingle(item => item.Id == course.Id);
    }

    [Fact]
    public async Task GetSubjectCourses_NoGrantAtAll_ThrowsForbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        var handler = Create(db);

        var act = () => handler.Handle(new GetSubjectCoursesQuery(student.Id, subject.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }
}
