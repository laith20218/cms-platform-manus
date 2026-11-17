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
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Wave 16.2b (C3 exception) — exact-id practice sessions, verified against the REAL
/// EntitlementService: the training builder draws N random questions (GET /questions/random,
/// 16.2a C3-1) then pins the session to EXACTLY that set via StartCategorizedPracticeCommand.
/// QuestionIds with the eligible-bank intersection, submit-time membership honoring the
/// exact-id lens (in-draw answers graded, same-subject out-of-draw rejected), and
/// filter-scoped progress totals. Foreign ids (published in ANOTHER subject) must be
/// dropped, never smuggled into the session set.
/// </summary>
public class PracticeQuestionIdsW162bTests
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
    public async Task StartCategorized_QuestionIds_PinsTheSessionToExactlyTheDraw()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture = Lecture.Create(subject.Id, "محاضرة 1", "w162b-l1", 1);
        db.Lectures.Add(lecture);
        await db.SaveChangesAsync();

        // The "draw": two of the three eligible questions (a lecture-bound one and a
        // lecture-less one) — the third stays out of the set even though it is eligible.
        var drawn1 = await SeedQuestionAsync(db, subject.Id, lecture.Id, "سؤال مرسوم 1");
        var drawn2 = await SeedQuestionAsync(db, subject.Id, null, "سؤال مرسوم 2");
        var notDrawn = await SeedQuestionAsync(db, subject.Id, lecture.Id, "سؤال خارج السحبة");

        var started = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, null, false, null, false,
            QuestionIds: new List<Guid> { drawn1.Question.Id, drawn2.Question.Id }), CancellationToken.None);

        started.TotalQuestions.Should().Be(2);
        started.Questions.Select(q => q.Id).Should().BeEquivalentTo(new[] { drawn1.Question.Id, drawn2.Question.Id });
        started.Questions.Select(q => q.Id).Should().NotContain(notDrawn.Question.Id);
    }

    [Fact]
    public async Task StartCategorized_QuestionIds_IntersectsTheEligibleBank_ForeignIdsDropped()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var inSubject = await SeedQuestionAsync(db, subject.Id, null, "سؤال داخل المادة");

        // A second subject with its own published question — NOT eligible for this
        // student's session even though its id rides the QuestionIds payload.
        var otherSubject = Subject.Create(db.Semesters.First().Id, "التشريح", "anatomy-w162b", "Anatomy");
        db.Subjects.Add(otherSubject);
        await db.SaveChangesAsync();
        var foreign = await SeedQuestionAsync(db, otherSubject.Id, null, "سؤال مادة أخرى");

        // A random Guid that maps to no question at all.
        var ghost = Guid.NewGuid();

        var started = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, null, false, null, false,
            QuestionIds: new List<Guid> { inSubject.Question.Id, foreign.Question.Id, ghost }), CancellationToken.None);

        // Only the in-subject eligible id survives the intersection.
        started.TotalQuestions.Should().Be(1);
        started.Questions.Should().ContainSingle().Which.Id.Should().Be(inSubject.Question.Id);
    }

    [Fact]
    public async Task Submit_ExactIdLens_GradesInDraw_RejectsOutOfDraw_AndScopesProgress()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var inDraw1 = await SeedQuestionAsync(db, subject.Id, null, "سؤال داخل السحبة 1");
        var inDraw2 = await SeedQuestionAsync(db, subject.Id, null, "سؤال داخل السحبة 2");
        var outOfDraw = await SeedQuestionAsync(db, subject.Id, null, "سؤال خارج السحبة");

        // Two drawn questions — answering one must NOT auto-complete the session
        // (a one-question lens would flip to Completed and mask the membership check).
        var lens = new[] { inDraw1.Question.Id, inDraw2.Question.Id };
        var started = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, null, false, null, false,
            QuestionIds: lens), CancellationToken.None);
        started.TotalQuestions.Should().Be(2);

        // In-draw answer: graded fine with the exact-id echo.
        var submitted = await Create(db).Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, inDraw1.Question.Id, inDraw1.CorrectOptionId.ToString(), 10, null,
            Filter: new PracticeCategoryFilter(QuestionIds: lens)), CancellationToken.None);
        submitted.IsCorrect.Should().BeTrue();
        submitted.TotalQuestions.Should().Be(2);
        submitted.AnsweredCount.Should().Be(1);

        // A same-subject eligible question OUTSIDE the draw is a membership violation.
        var rejected = () => Create(db).Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, outOfDraw.Question.Id, outOfDraw.CorrectOptionId.ToString(), 10, null,
            Filter: new PracticeCategoryFilter(QuestionIds: lens)), CancellationToken.None);
        await rejected.Should().ThrowAsync<BusinessRuleViolationException>();

        // Progress totals stay scoped to the drawn set (not the subject, not the anchor).
        var progress = await Create(db).Handle(new GetPracticeProgressQuery(
            student.Id, started.SessionId, Filter: new PracticeCategoryFilter(QuestionIds: lens)), CancellationToken.None);
        progress.TotalQuestions.Should().Be(2);
        progress.AnsweredCount.Should().Be(1);
        progress.CorrectCount.Should().Be(1);
    }
}
