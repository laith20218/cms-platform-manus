using CMS.Application.Commands.Practice;
using CMS.Application.Handlers.Practice;
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
/// Wave 16.2 (C3-2) — multi-lecture practice sessions, verified against the REAL
/// EntitlementService: starting a categorized session over the UNION of several
/// lectures, the legacy single-lecture payload staying the one-item special case of
/// the same code path, submit-time membership validation honoring the multi-lecture
/// lens (out-of-lens questions rejected, either-lecture answers graded), and
/// filter-scoped progress totals.
/// </summary>
public class PracticeMultiLectureW162Tests
{
    private static PracticeHandlers Create(ApplicationDbContext db) =>
        new(db, new UnitOfWork(db), new EntitlementService(db));

    private static async Task SeedGrantAsync(ApplicationDbContext db, Guid studentId, Guid subjectId)
    {
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = studentId,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subjectId,
            // Content-agnostic "read" gate (W14.4 ruling) — any active grant opens practice.
            ContentScope = SubscriptionContentScope.VideoAudio,
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await db.SaveChangesAsync();
    }

    private record SeededQuestion(Question Question, Guid CorrectOptionId, Guid WrongOptionId);

    private static async Task<SeededQuestion> SeedQuestionAsync(
        ApplicationDbContext db, Guid subjectId, Guid? lectureId, string text)
    {
        var admin = db.Admins.First();
        var question = Question.Create(text, QuestionType.Mcq, subjectId, lectureId, Difficulty.Medium, new List<string>(), admin.Id);
        question.AddOption("خيار خاطئ", false);
        question.AddOption("خيار صحيح", true);
        question.UpdateExplanation($"شرح {text}");
        question.Publish();
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return new SeededQuestion(question,
            question.Options.Single(option => option.IsCorrect).Id,
            question.Options.First(option => !option.IsCorrect).Id);
    }

    [Fact]
    public async Task StartCategorized_MultiLecture_UnionsTheListedLectures()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture1 = Lecture.Create(subject.Id, "محاضرة 1", "w162-pl1", 1);
        var lecture2 = Lecture.Create(subject.Id, "محاضرة 2", "w162-pl2", 2);
        var lecture3 = Lecture.Create(subject.Id, "محاضرة 3", "w162-pl3", 3);
        db.Lectures.AddRange(lecture1, lecture2, lecture3);
        await db.SaveChangesAsync();

        var q1 = await SeedQuestionAsync(db, subject.Id, lecture1.Id, "سؤال المحاضرة 1");
        var q2 = await SeedQuestionAsync(db, subject.Id, lecture1.Id, "سؤال آخر في المحاضرة 1");
        var q3 = await SeedQuestionAsync(db, subject.Id, lecture2.Id, "سؤال المحاضرة 2");
        await SeedQuestionAsync(db, subject.Id, lecture3.Id, "سؤال المحاضرة 3");

        var started = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, null, false, null, false,
            LectureIds: new List<Guid> { lecture1.Id, lecture2.Id }), CancellationToken.None);

        // The question set is the UNION of lectures 1+2 (3 questions: two in L1, one
        // in L2) — not their intersection and not the whole subject (which would add
        // lecture 3 + the 2 TestDbHelper lecture-less seeds).
        started.TotalQuestions.Should().Be(3);
        started.Questions.Select(q => q.Id).Should().BeEquivalentTo(new[] { q1.Question.Id, q2.Question.Id, q3.Question.Id });
    }

    [Fact]
    public async Task StartCategorized_SingleLecture_LegacyPayloadIsTheOneItemSpecialCase()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture1 = Lecture.Create(subject.Id, "محاضرة 1", "w162-sl1", 1);
        db.Lectures.Add(lecture1);
        await db.SaveChangesAsync();

        var q1 = await SeedQuestionAsync(db, subject.Id, lecture1.Id, "سؤال المحاضرة 1");
        await SeedQuestionAsync(db, subject.Id, null, "سؤال بلا محاضرة");

        // Legacy single-lecture payload (LectureId, no LectureIds)…
        var legacy = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, lecture1.Id, false, null, false), CancellationToken.None);
        legacy.TotalQuestions.Should().Be(1);
        legacy.Questions.Should().ContainSingle().Which.Id.Should().Be(q1.Question.Id);

        // …and the one-item array form of the same lens — identical set.
        var array = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, null, false, null, false,
            LectureIds: new List<Guid> { lecture1.Id }), CancellationToken.None);
        array.Questions.Should().ContainSingle().Which.Id.Should().Be(q1.Question.Id);
    }

    [Fact]
    public async Task Submit_MultiLectureLens_AcceptsEitherLecture_RejectsOutOfLens_AndScopesTotals()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture1 = Lecture.Create(subject.Id, "محاضرة 1", "w162-ml1", 1);
        var lecture2 = Lecture.Create(subject.Id, "محاضرة 2", "w162-ml2", 2);
        var lecture3 = Lecture.Create(subject.Id, "محاضرة 3", "w162-ml3", 3);
        db.Lectures.AddRange(lecture1, lecture2, lecture3);
        await db.SaveChangesAsync();

        await SeedQuestionAsync(db, subject.Id, lecture1.Id, "سؤال المحاضرة 1");
        var inSecond = await SeedQuestionAsync(db, subject.Id, lecture2.Id, "سؤال المحاضرة 2");
        var inThird = await SeedQuestionAsync(db, subject.Id, lecture3.Id, "سؤال المحاضرة 3 خارج العدسة");

        var lens = new[] { lecture1.Id, lecture2.Id };
        var started = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, null, false, null, false,
            LectureIds: lens.ToList()), CancellationToken.None);
        started.TotalQuestions.Should().Be(2);

        // A question from the SECOND lecture of the lens is an in-lens member: graded fine.
        var submitted = await Create(db).Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, inSecond.Question.Id, inSecond.CorrectOptionId.ToString(), 10, null,
            Filter: new PracticeCategoryFilter(LectureIds: lens)), CancellationToken.None);
        submitted.IsCorrect.Should().BeTrue();
        submitted.TotalQuestions.Should().Be(2);
        submitted.AnsweredCount.Should().Be(1);

        // A same-subject question from a lecture OUTSIDE the lens is a membership violation.
        var rejected = () => Create(db).Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, inThird.Question.Id, inThird.CorrectOptionId.ToString(), 10, null,
            Filter: new PracticeCategoryFilter(LectureIds: lens)), CancellationToken.None);
        await rejected.Should().ThrowAsync<BusinessRuleViolationException>();

        // Progress totals are scoped to the multi-lecture set (not the subject, not the anchor).
        var progress = await Create(db).Handle(new GetPracticeProgressQuery(
            student.Id, started.SessionId, Filter: new PracticeCategoryFilter(LectureIds: lens)), CancellationToken.None);
        progress.TotalQuestions.Should().Be(2);
        progress.AnsweredCount.Should().Be(1);
        progress.CorrectCount.Should().Be(1);

        // The un-echoed legacy single-lecture lens still validates against its one lecture.
        var singleLens = () => Create(db).Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, inSecond.Question.Id, inSecond.CorrectOptionId.ToString(), 10, null,
            Filter: new PracticeCategoryFilter(LectureId: lecture1.Id)), CancellationToken.None);
        await singleLens.Should().ThrowAsync<BusinessRuleViolationException>();
    }
}
