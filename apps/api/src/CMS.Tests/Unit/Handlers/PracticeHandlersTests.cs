using CMS.Application.Commands.Practice;
using CMS.Application.Handlers.Practice;
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
/// W14.2 F.1 — practice tracking (B.3/D13): idempotent start, snapshot-consistent
/// grading, auto-completion with frozen score, per-question and full resets,
/// ownership enforcement and progress accounting.
/// </summary>
public class PracticeHandlersTests
{
    private static (PracticeHandlers Handler, ApplicationDbContext Db, IUnitOfWork Uow) Build()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var uow = new UnitOfWork(db);
        var entitlements = new Mock<IEntitlementService>();
        entitlements.Setup(service => service.CanAccessSubjectContentAsync(It.IsAny<Guid>(), It.IsAny<Guid>(),
            SubscriptionContentScope.QuestionsExams, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        return (new PracticeHandlers(db, uow, entitlements.Object), db, uow);
    }

    private static Guid CorrectOptionId(ApplicationDbContext db, Question question) =>
        question.Options.Single(option => option.IsCorrect).Id;

    [Fact]
    public async Task Start_IsIdempotentGetOrCreate()
    {
        var (handler, db, _) = Build();
        var student = TestDbHelper.GetTestStudent(db);
        var exam = db.Exams.First(); // seeded Published exam

        var first = await handler.Handle(new StartPracticeSessionCommand(student.Id, exam.Id), CancellationToken.None);
        first.Created.Should().BeTrue();
        first.Status.Should().Be(nameof(PracticeSessionStatus.InProgress));

        var second = await handler.Handle(new StartPracticeSessionCommand(student.Id, exam.Id), CancellationToken.None);
        second.Created.Should().BeFalse();
        second.SessionId.Should().Be(first.SessionId);
        (await db.PracticeSessions.CountAsync(session => session.StudentId == student.Id && session.ExamModelId == exam.Id)).Should().Be(1);
    }

    [Fact]
    public async Task Submit_GradesAgainstBank_AutoCompletesAndFreezesScore()
    {
        var (handler, db, _) = Build();
        var student = TestDbHelper.GetTestStudent(db);
        var exam = db.Exams.First();
        var question = db.Questions.Include(item => item.Options).First();
        db.ExamQuestions.Add(ExamQuestion.Create(exam.Id, question.Id, 0));
        exam.SetQuestionCount(1);
        await db.SaveChangesAsync();

        var started = await handler.Handle(new StartPracticeSessionCommand(student.Id, exam.Id), CancellationToken.None);
        var wrongOption = question.Options.First(option => !option.IsCorrect).Id.ToString();

        var wrong = await handler.Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, question.Id, wrongOption, 12, null), CancellationToken.None);
        wrong.IsCorrect.Should().BeFalse();
        wrong.Status.Should().Be(nameof(PracticeSessionStatus.Completed)); // single-question exam: all graded → auto-complete
        wrong.Score.Should().Be(0);

        // Ungrading via reset: withdraw the answer, session unfreezes.
        await handler.Handle(new ResetPracticeQuestionCommand(student.Id, started.SessionId, question.Id), CancellationToken.None);
        var unfrozen = await db.PracticeSessions.SingleAsync(session => session.Id == started.SessionId);
        unfrozen.Status.Should().Be(PracticeSessionStatus.InProgress);
        unfrozen.Score.Should().BeNull();

        var correct = await handler.Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, question.Id, CorrectOptionId(db, question).ToString(), 8, null), CancellationToken.None);
        correct.IsCorrect.Should().BeTrue();
        correct.Score.Should().Be(100);
        (await db.PracticeSessions.SingleAsync(session => session.Id == started.SessionId))
            .Status.Should().Be(PracticeSessionStatus.Completed);
    }

    [Fact]
    public async Task ResetSession_WipesAllAnswers()
    {
        var (handler, db, _) = Build();
        var student = TestDbHelper.GetTestStudent(db);
        var exam = db.Exams.First();
        var question1 = db.Questions.Include(item => item.Options).First();
        var question2 = db.Questions.Include(item => item.Options).ToList()[1];
        db.ExamQuestions.AddRange(ExamQuestion.Create(exam.Id, question1.Id, 0), ExamQuestion.Create(exam.Id, question2.Id, 1));
        exam.SetQuestionCount(2);
        await db.SaveChangesAsync();

        var started = await handler.Handle(new StartPracticeSessionCommand(student.Id, exam.Id), CancellationToken.None);
        await handler.Handle(new SubmitPracticeAnswerCommand(student.Id, started.SessionId, question1.Id,
            question1.Options.First(option => !option.IsCorrect).Id.ToString(), 5, null), CancellationToken.None);

        var progressMid = await handler.Handle(new GetPracticeProgressQuery(student.Id, started.SessionId), CancellationToken.None);
        progressMid.AnsweredCount.Should().Be(1);
        progressMid.TotalQuestions.Should().Be(2);
        progressMid.CompletionPercent.Should().Be(50);

        await handler.Handle(new ResetPracticeSessionCommand(student.Id, started.SessionId), CancellationToken.None);
        (await db.PracticeAnswers.CountAsync(answer => answer.PracticeSessionId == started.SessionId)).Should().Be(0);
        var progressAfter = await handler.Handle(new GetPracticeProgressQuery(student.Id, started.SessionId), CancellationToken.None);
        progressAfter.AnsweredCount.Should().Be(0);
        progressAfter.Status.Should().Be(nameof(PracticeSessionStatus.InProgress));
    }

    [Fact]
    public async Task Submit_RejectsForeignSession_AndForeignQuestions()
    {
        var (handler, db, _) = Build();
        var owner = TestDbHelper.GetTestStudent(db);
        var exam = db.Exams.First();
        var question = db.Questions.First();

        var strangerSession = new PracticeSession
        {
            StudentId = Guid.NewGuid(),
            ExamModelId = exam.Id,
            StartedAt = DateTime.UtcNow,
            LastAccessedAt = DateTime.UtcNow
        };
        db.PracticeSessions.Add(strangerSession);
        await db.SaveChangesAsync();

        // Ownership: a session not owned by the caller is simply not found (no leak).
        var foreignSession = () => handler.Handle(new SubmitPracticeAnswerCommand(
            owner.Id, strangerSession.Id, question.Id, "answer", 5, null), CancellationToken.None);
        await foreignSession.Should().ThrowAsync<NotFoundException>();

        // Composition: an answer for a question outside the model exam is rejected.
        var started = await handler.Handle(new StartPracticeSessionCommand(owner.Id, exam.Id), CancellationToken.None);
        var foreignQuestion = () => handler.Handle(new SubmitPracticeAnswerCommand(
            owner.Id, started.SessionId, Guid.NewGuid(), "answer", 5, null), CancellationToken.None);
        await foreignQuestion.Should().ThrowAsync<BusinessRuleViolationException>();
    }
}
