using CMS.Application.Commands.Exams;
using CMS.Application.DTOs.Exams;
using CMS.Application.Handlers.Exams;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// PR-5 — exam lifecycle completion (admin surface):
///  • duplicate copies the configuration AND the ordered question composition as a
///    fresh Draft (sessions/results are never copied; the slug stays distinct);
///  • restore returns an archived exam to Draft (only Archived rows qualify);
///  • archive is dependency-aware: an exam inside a PUBLISHED exam-course bundle is
///    refused (EXAM_IN_PUBLISHED_BUNDLE); draft bundles never block;
///  • the pre-flight composition validation collects per-question issues instead of
///    throwing, with byte-identical messages to the publish-time checks, so the
///    editor can warn BEFORE the publish attempt fails.
/// </summary>
public sealed class ExamLifecycleAdminHandlerTests
{
    private static ExamSessionHandlers Build(ApplicationDbContext db) =>
        new(db, new UnitOfWork(db), Mock.Of<IEntitlementService>());

    private static async Task<Exam> AddExamAsync(ApplicationDbContext db, Guid subjectId, string title, ContentStatus status = ContentStatus.Published)
    {
        var admin = db.Admins.First();
        var exam = Exam.Create(subjectId, title, $"exam-{Guid.NewGuid():N}", 2025, admin.Id);
        if (status == ContentStatus.Published) exam.Publish();
        if (status == ContentStatus.Archived) exam.Archive();
        db.Exams.Add(exam);
        await db.SaveChangesAsync();
        return exam;
    }

    private static async Task<Exam> AddComposedExamAsync(ApplicationDbContext db, Guid subjectId)
    {
        var admin = db.Admins.First();
        var exam = Exam.Create(subjectId, "اختبار مؤلف", $"exam-{Guid.NewGuid():N}", 2025, admin.Id);
        db.Exams.Add(exam);
        var questions = db.Questions.Where(q => q.SubjectId == subjectId && q.Status == ContentStatus.Published).ToList();
        for (var index = 0; index < questions.Count; index++)
            await db.ExamQuestions.AddAsync(ExamQuestion.Create(exam.Id, questions[index].Id, index));
        exam.SetQuestionCount(questions.Count);
        await db.SaveChangesAsync();
        return exam;
    }

    // ===== Duplicate =====

    [Fact]
    public async Task Duplicate_CopiesConfigurationAndComposition_AsFreshDraft()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var source = await AddComposedExamAsync(db, subject.Id);
        source.Configure("عنوان معدل", "Title En", "وصف", ExamType.Midterm, 2025, null,
            90, 55.5m, 3, null, null, 2,
            shuffleQuestions: false, shuffleOptions: true, showResultsImmediately: false,
            allowReview: true, showCorrectAnswers: true, showExplanations: false);
        source.Publish();
        await db.SaveChangesAsync();
        var handler = Build(db);
        var actor = db.Admins.First().Id;

        var copy = await handler.Handle(new DuplicateExamCommand(source.Id, actor), CancellationToken.None);

        copy.Should().NotBeNull();
        var copyId = copy.Exam.Id;
        var storedCopy = db.Exams.AsNoTracking()
            .Include(e => e.ExamQuestions)
            .First(e => e.Id == copyId);
        storedCopy.Status.Should().Be(ContentStatus.Draft, "the duplicate always starts as a fresh Draft");
        storedCopy.TitleAr.Should().Be("عنوان معدل");
        storedCopy.ExamType.Should().Be(ExamType.Midterm);
        storedCopy.DurationMinutes.Should().Be(90);
        storedCopy.PassingScore.Should().Be(55.5m);
        storedCopy.ShuffleQuestions.Should().BeFalse();
        storedCopy.Slug.Should().NotBe(source.Slug, "the copy keeps a distinct slug");
        storedCopy.Slug.Should().Contain(source.Slug[..Math.Min(source.Slug.Length, 60)], "the slug stays recognizable");
        storedCopy.ExamQuestions.Should().HaveCount(source.ExamQuestions.Count,
            "the ordered question composition is copied verbatim");
        storedCopy.ExamQuestions.OrderBy(q => q.SortOrder)
            .Select(q => q.QuestionId)
            .Should().Equal(
                db.ExamQuestions.AsNoTracking()
                    .Where(eq => eq.ExamId == source.Id)
                    .OrderBy(eq => eq.SortOrder)
                    .Select(eq => eq.QuestionId),
            "composition order is preserved");
        db.ExamSessions.AsNoTracking().Any(s => s.ExamId == copyId).Should().BeFalse(
            "student sessions are never copied");
    }

    [Fact]
    public async Task Duplicate_UnknownExam_ThrowsNotFound()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var handler = Build(db);

        var act = () => handler.Handle(new DuplicateExamCommand(Guid.NewGuid(), Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    // ===== Restore =====

    [Fact]
    public async Task Restore_ArchivedExam_ReturnsToDraft()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var exam = await AddExamAsync(db, subject.Id, "اختبار مؤرشف", ContentStatus.Published);
        exam.Archive();
        await db.SaveChangesAsync();
        var handler = Build(db);
        var actor = db.Admins.First().Id;

        await handler.Handle(new RestoreExamCommand(exam.Id, actor), CancellationToken.None);

        db.Exams.AsNoTracking().Single(e => e.Id == exam.Id).Status
            .Should().Be(ContentStatus.Draft, "restore returns the exam to Draft — republish is a separate validated step");
    }

    [Fact]
    public async Task Restore_PublishedExam_IsRefused()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var exam = await AddExamAsync(db, subject.Id, "اختبار منشور");
        var handler = Build(db);

        var act = () => handler.Handle(new RestoreExamCommand(exam.Id, db.Admins.First().Id), CancellationToken.None);

        await act.Should().ThrowAsync<BusinessRuleViolationException>()
            .Where(ex => ex.Message.Contains("المؤرشفة"));
    }

    // ===== Dependency-aware archive =====

    [Fact]
    public async Task Archive_InsidePublishedBundle_IsRefused()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();
        var exam = await AddExamAsync(db, subject.Id, "اختبار ضمن دورة");
        var bundle = new ExamCourse
        {
            SubjectId = subject.Id, NameAr = "دورة منشورة", Year = 2025, Semester = 1,
            CourseType = ExamCourseType.First, FreeOrPaid = true, SortOrder = 0,
            Status = ContentStatus.Published,
        };
        db.ExamCourses.Add(bundle);
        await db.ExamQuestions.AddAsync(ExamQuestion.Create(exam.Id, db.Questions.First().Id, 0));
        await db.SaveChangesAsync();
        db.ExamCourseItems.Add(new ExamCourseItem { ExamCourseId = bundle.Id, ExamId = exam.Id, SortOrder = 0 });
        await db.SaveChangesAsync();
        var handler = Build(db);

        var act = () => handler.Handle(new ArchiveExamCommand(exam.Id, admin.Id), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.ErrorCode == "EXAM_IN_PUBLISHED_BUNDLE");
        db.Exams.AsNoTracking().Single(e => e.Id == exam.Id).Status
            .Should().Be(ContentStatus.Published, "the exam survives the refused archive");
    }

    [Fact]
    public async Task Archive_InsideDraftBundle_IsAllowed()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();
        var exam = await AddExamAsync(db, subject.Id, "اختبار ضمن مسودة دورة");
        var bundle = new ExamCourse
        {
            SubjectId = subject.Id, NameAr = "دورة مسودة", Year = 2025, Semester = 1,
            CourseType = ExamCourseType.First, FreeOrPaid = false, SortOrder = 0,
            Status = ContentStatus.Draft,
        };
        db.ExamCourses.Add(bundle);
        await db.SaveChangesAsync();
        db.ExamCourseItems.Add(new ExamCourseItem { ExamCourseId = bundle.Id, ExamId = exam.Id, SortOrder = 0 });
        await db.SaveChangesAsync();
        var handler = Build(db);

        await handler.Handle(new ArchiveExamCommand(exam.Id, admin.Id), CancellationToken.None);

        db.Exams.AsNoTracking().Single(e => e.Id == exam.Id).Status
            .Should().Be(ContentStatus.Archived, "draft bundles ship nothing — archive is safe");
    }

    // ===== Pre-flight composition validation =====

    [Fact]
    public async Task CompositionValidation_ValidComposedExam_ReportsNoIssues()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var exam = await AddComposedExamAsync(db, subject.Id);
        var handler = Build(db);

        var report = await handler.Handle(
            new GetExamCompositionValidationQuery(exam.Id, db.Admins.First().Id), CancellationToken.None);

        report.IsValid.Should().BeTrue();
        report.TotalQuestions.Should().Be(db.Questions.Count(q => q.SubjectId == subject.Id));
        report.InvalidQuestions.Should().Be(0);
        report.Issues.Should().BeEmpty();
    }

    [Fact]
    public async Task CompositionValidation_UnpublishedQuestion_IsCollectedNotThrown()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var exam = await AddComposedExamAsync(db, subject.Id);
        var composed = db.Questions.First(q => q.SubjectId == subject.Id);
        composed.Unpublish(); // the exact regression the publish check throws on
        await db.SaveChangesAsync();
        var handler = Build(db);

        var report = await handler.Handle(
            new GetExamCompositionValidationQuery(exam.Id, db.Admins.First().Id), CancellationToken.None);

        report.IsValid.Should().BeFalse();
        report.InvalidQuestions.Should().Be(1);
        report.Issues.Should().ContainSingle(issue =>
            issue.QuestionId == composed.Id && issue.IssueCode == "QUESTION_NOT_AVAILABLE")
            .Which.IssueMessageAr.Should().Be("يمكن استخدام الأسئلة المنشورة وغير المحذوفة فقط",
                "the collected message is byte-identical with the publish-time throw");
    }

    [Fact]
    public async Task CompositionValidation_EmptyExam_ReportsZeroQuestions_WithoutThrowing()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var exam = await AddExamAsync(db, subject.Id, "اختبار فارغ", ContentStatus.Draft);
        var handler = Build(db);

        var report = await handler.Handle(
            new GetExamCompositionValidationQuery(exam.Id, db.Admins.First().Id), CancellationToken.None);

        report.TotalQuestions.Should().Be(0);
        report.IsValid.Should().BeTrue("per-question validity is vacuous — the missing-composition gate stays on publish");
    }

    [Fact]
    public async Task Publish_InvalidComposition_StillThrowsFirstCollectedMessage()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var exam = await AddComposedExamAsync(db, subject.Id);
        var composed = db.Questions.First(q => q.SubjectId == subject.Id);
        composed.Unpublish();
        await db.SaveChangesAsync();
        var handler = Build(db);

        var act = () => handler.Handle(new PublishExamCommand(exam.Id, db.Admins.First().Id), CancellationToken.None);

        await act.Should().ThrowAsync<BusinessRuleViolationException>()
            .WithMessage("يمكن استخدام الأسئلة المنشورة وغير المحذوفة فقط");
    }
}
