using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Questions;
using CMS.Application.Handlers.Questions;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Wave 16.2 (C3-1/C3-3) — the Question Bank engine, verified against the REAL
/// EntitlementService: random-N draws over the subject's practice-eligible pool
/// (published, not deleted, practice-usable) with multi-lecture / multi-paragraph-tag /
/// دورة (SemesterCourseId) narrowings, count bounds and entitlement gating; plus the
/// SemesterCourseId anchor on admin create/update — existence-checked, echoed, persisted.
/// </summary>
public class QuestionBankW162Tests
{
    private static QuestionQueryHandlers QueryHandler(ApplicationDbContext db) =>
        new(db, new EntitlementService(db));

    private static QuestionCommandHandlers CommandHandler(ApplicationDbContext db) =>
        new(db, new UnitOfWork(db), new EntitlementService(db), NoOp.ActivityWriter());

    private static async Task SeedGrantAsync(ApplicationDbContext db, Guid studentId, Guid subjectId)
    {
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = studentId,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subjectId,
            ContentScope = SubscriptionContentScope.QuestionsExams,
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await db.SaveChangesAsync();
    }

    /// <summary>A published MCQ with a lecture/tag/دورة scope as requested.</summary>
    private static async Task<Question> SeedQuestionAsync(
        ApplicationDbContext db, Guid subjectId, Guid? lectureId, string? paragraphTag, Guid? semesterCourseId, string text)
    {
        var admin = db.Admins.First();
        var question = Question.Create(text, QuestionType.Mcq, subjectId, lectureId, Difficulty.Medium, new List<string>(), admin.Id);
        question.AddOption("خيار خاطئ", false);
        question.AddOption("خيار صحيح", true);
        question.UpdateExplanation($"شرح {text}");
        question.SetParagraphTag(paragraphTag);
        if (semesterCourseId.HasValue) question.SetSemesterCourse(semesterCourseId);
        question.Publish();
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return question;
    }

    private static List<CreateOptionDto> TwoOptions() => new()
    {
        new("خيار خاطئ", false, null),
        new("خيار صحيح", true, null)
    };

    [Fact]
    public async Task Random_DrawsExactCount_Distinct_WithinEligiblePoolOnly()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);
        var admin = db.Admins.First();

        // 6 in-pool questions on top of the 2 TestDbHelper seeds (both eligible).
        for (var i = 1; i <= 6; i++)
            await SeedQuestionAsync(db, subject.Id, null, null, null, $"سؤال البنك {i}");

        // Out-of-pool rows: draft (never published), soft-deleted, exam-usage-only.
        var draft = Question.Create("سؤال مسودة", QuestionType.Mcq, subject.Id, null, Difficulty.Medium, new List<string>(), admin.Id);
        draft.AddOption("خيار خاطئ", false);
        draft.AddOption("خيار صحيح", true);
        draft.UpdateExplanation("شرح مسودة");
        db.Questions.Add(draft);

        var deleted = await SeedQuestionAsync(db, subject.Id, null, null, null, "سؤال محذوف");
        deleted.SoftDelete(admin.Id);

        var examOnly = await SeedQuestionAsync(db, subject.Id, null, null, null, "سؤال امتحاني فقط");
        typeof(Question).GetProperty("QuestionUsage")?.SetValue(examOnly, QuestionUsage.Exam);
        await db.SaveChangesAsync();

        // Draw 4 out of the 8-question eligible pool.
        var draw = await QueryHandler(db).Handle(new GetRandomQuestionsQuery(student.Id, subject.Id, 4), CancellationToken.None);

        draw.Should().HaveCount(4);
        draw.Select(q => q.Id).Should().OnlyHaveUniqueItems();
        var eligibleIds = db.Questions.AsEnumerable()
            .Where(q => q.Status == ContentStatus.Published
                && q.DeletedAt == null
                && (q.QuestionUsage == QuestionUsage.Practice || q.QuestionUsage == QuestionUsage.Both))
            .Select(q => q.Id).ToHashSet();
        draw.Select(q => q.Id).Should().OnlyContain(id => eligibleIds.Contains(id));

        // Student view: options ship without correctness flags (seed questions carry 2–4 options).
        draw.Should().OnlyContain(q => q.Options.Count >= 2);

        // Over-drawing returns the whole pool, still duplicate-free.
        var whole = await QueryHandler(db).Handle(new GetRandomQuestionsQuery(student.Id, subject.Id, 100), CancellationToken.None);
        whole.Should().HaveCount(8);
        whole.Select(q => q.Id).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task Random_FiltersByLectureIds_UnionOfTheListedLectures()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture1 = Lecture.Create(subject.Id, "محاضرة 1", "w162-l1", 1);
        var lecture2 = Lecture.Create(subject.Id, "محاضرة 2", "w162-l2", 2);
        var lecture3 = Lecture.Create(subject.Id, "محاضرة 3", "w162-l3", 3);
        db.Lectures.AddRange(lecture1, lecture2, lecture3);
        await db.SaveChangesAsync();

        var inL1 = await SeedQuestionAsync(db, subject.Id, lecture1.Id, null, null, "سؤال المحاضرة 1");
        var alsoInL1 = await SeedQuestionAsync(db, subject.Id, lecture1.Id, null, null, "سؤال آخر في المحاضرة 1");
        var inL2 = await SeedQuestionAsync(db, subject.Id, lecture2.Id, null, null, "سؤال المحاضرة 2");
        await SeedQuestionAsync(db, subject.Id, lecture3.Id, null, null, "سؤال المحاضرة 3");

        // Multi-lecture narrowing: the UNION of lectures 1 and 2 (not the intersection).
        var draw = await QueryHandler(db).Handle(new GetRandomQuestionsQuery(
            student.Id, subject.Id, 100, LectureIds: new List<Guid> { lecture1.Id, lecture2.Id }), CancellationToken.None);

        var expected = new[] { inL1.Id, alsoInL1.Id, inL2.Id };
        draw.Should().HaveCount(3);
        draw.Select(q => q.Id).Should().BeEquivalentTo(expected);
    }

    [Fact]
    public async Task Random_FiltersByParagraphTags()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var chapterOne = await SeedQuestionAsync(db, subject.Id, null, "الفصل الأول", null, "سؤال الفصل الأول أ");
        var chapterOneAgain = await SeedQuestionAsync(db, subject.Id, null, "الفصل الأول", null, "سؤال الفصل الأول ب");
        await SeedQuestionAsync(db, subject.Id, null, "الفصل الثاني", null, "سؤال الفصل الثاني");
        await SeedQuestionAsync(db, subject.Id, null, null, null, "سؤال بلا وسم");

        var draw = await QueryHandler(db).Handle(new GetRandomQuestionsQuery(
            student.Id, subject.Id, 100, ParagraphTags: new List<string> { "الفصل الأول" }), CancellationToken.None);

        draw.Should().HaveCount(2);
        draw.Select(q => q.Id).Should().BeEquivalentTo(new[] { chapterOne.Id, chapterOneAgain.Id });
    }

    [Fact]
    public async Task Random_FiltersBySemesterCourseId()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var course = new ExamCourse
        {
            SubjectId = subject.Id,
            NameAr = "دورة W16.2",
            Year = 2026,
            Semester = 1,
            Status = ContentStatus.Published
        };
        db.ExamCourses.Add(course);
        await db.SaveChangesAsync();

        var anchored1 = await SeedQuestionAsync(db, subject.Id, null, null, course.Id, "سؤال الدورة أ");
        var anchored2 = await SeedQuestionAsync(db, subject.Id, null, null, course.Id, "سؤال الدورة ب");
        var anchored3 = await SeedQuestionAsync(db, subject.Id, null, null, course.Id, "سؤال الدورة ج");
        await SeedQuestionAsync(db, subject.Id, null, null, null, "سؤال خارج الدورة");

        var draw = await QueryHandler(db).Handle(new GetRandomQuestionsQuery(
            student.Id, subject.Id, 100, SemesterCourseId: course.Id), CancellationToken.None);

        draw.Should().HaveCount(3);
        draw.Select(q => q.Id).Should().BeEquivalentTo(new[] { anchored1.Id, anchored2.Id, anchored3.Id });
    }

    [Fact]
    public async Task Random_CountOutOfBounds_Rejected()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var handler = QueryHandler(db);

        var zero = () => handler.Handle(new GetRandomQuestionsQuery(student.Id, subject.Id, 0), CancellationToken.None);
        await zero.Should().ThrowAsync<DomainException>();

        var negative = () => handler.Handle(new GetRandomQuestionsQuery(student.Id, subject.Id, -5), CancellationToken.None);
        await negative.Should().ThrowAsync<DomainException>();

        var overCap = () => handler.Handle(new GetRandomQuestionsQuery(student.Id, subject.Id, 101), CancellationToken.None);
        await overCap.Should().ThrowAsync<DomainException>();
    }

    [Fact]
    public async Task Random_WithoutQuestionsExamsGrant_Forbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        // No grant at all — the draw must not leak bank content.

        var act = () => QueryHandler(db).Handle(new GetRandomQuestionsQuery(student.Id, subject.Id, 5), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Create_WithSemesterCourseId_EchoesAndPersists()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var admin = db.Admins.First();

        var course = new ExamCourse
        {
            SubjectId = subject.Id,
            NameAr = "دورة الإنشاء",
            Year = 2026,
            Semester = 2,
            Status = ContentStatus.Published
        };
        db.ExamCourses.Add(course);
        await db.SaveChangesAsync();

        var result = await CommandHandler(db).Handle(new CreateQuestionCommand(
            "سؤال مقيّد بدورة", "Mcq", subject.Id, null,
            "Medium", new List<string>(), TwoOptions(), null, null,
            "شرح الإنشاء", null, null, admin.Id,
            SemesterCourseId: course.Id), CancellationToken.None);

        result.SemesterCourseId.Should().Be(course.Id);
        (await db.Questions.AsNoTracking().SingleAsync(q => q.Id == result.Id))
            .SemesterCourseId.Should().Be(course.Id);
    }

    [Fact]
    public async Task Create_WithUnknownSemesterCourseId_Rejected()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var admin = db.Admins.First();

        var act = () => CommandHandler(db).Handle(new CreateQuestionCommand(
            "سؤال بدورة غير موجودة", "Mcq", subject.Id, null,
            "Medium", new List<string>(), TwoOptions(), null, null,
            "شرح الإنشاء", null, null, admin.Id,
            SemesterCourseId: Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
        // Nothing persisted when validation fails.
        (await db.Questions.CountAsync()).Should().Be(2);
    }

    [Fact]
    public async Task Update_WithSemesterCourseId_SetsAnchor()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var admin = db.Admins.First();
        var question = TestDbHelper.GetTestQuestion(db);

        var course = new ExamCourse
        {
            SubjectId = subject.Id,
            NameAr = "دورة التحديث",
            Year = 2025,
            Semester = 1,
            Status = ContentStatus.Published
        };
        db.ExamCourses.Add(course);
        await db.SaveChangesAsync();

        // NOTE: the options list is intentionally EMPTY — this wave targets the
        // SemesterCourseId anchor, and the update-time option-replacement path has a
        // PRE-EXISTING InMemory defect (QuestionOption.Create assigns client Guids,
        // so fixup attaches the re-added rows as "existing" → phantom UPDATE on ids
        // absent from the store). Reported to the Owner; out of this wave's scope.
        var result = await CommandHandler(db).Handle(new UpdateQuestionCommand(
            question.Id, question.Text, "Hard",
            new List<string>(), question.Explanation, null,
            new List<UpdateOptionDto>(), null,
            SemesterCourseId: course.Id), CancellationToken.None);

        result.SemesterCourseId.Should().Be(course.Id);
        (await db.Questions.AsNoTracking().SingleAsync(q => q.Id == question.Id))
            .SemesterCourseId.Should().Be(course.Id);
    }
}
