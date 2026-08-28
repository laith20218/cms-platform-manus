using CMS.Application.Commands.Exams;
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

public class ExamLifecycleHandlerTests
{
    [Fact]
    public async Task Start_Save_Submit_PreservesSnapshotAndCalculatesServerResult()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var student = TestDbHelper.GetTestStudent(db);
        var exam = await CreatePublishedExamAsync(db);
        var handler = CreateHandler(db, uow);

        var session = await handler.Handle(new StartExamSessionCommand(exam.Id, student.Id, "start-1"), CancellationToken.None);
        var sessionQuestion = session.Questions.Should().ContainSingle().Subject;
        var correctOption = sessionQuestion.Options.Single(option => option.Letter == "B");

        await handler.Handle(new SaveExamAnswerCommand(session.SessionId, student.Id, sessionQuestion.Id, $"[\"{correctOption.Id}\"]", 0, false), CancellationToken.None);
        var result = await handler.Handle(new SubmitExamCommand(session.SessionId, student.Id), CancellationToken.None);

        result.Status.Should().Be(nameof(ExamSessionStatus.Completed));
        result.Score.Should().Be(100);
        result.CorrectAnswers.Should().Be(1);
        result.AnsweredQuestions.Should().Be(1);
        (await db.ExamSessionQuestions.SingleAsync(question => question.ExamSessionId == session.SessionId)).QuestionText.Should().Be(sessionQuestion.Text);
        (await db.ExamSessions.SingleAsync(item => item.Id == session.SessionId)).AnalyticsRecordedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Start_ReturnsExistingInProgressSession_AndDoesNotDuplicateSnapshot()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var student = TestDbHelper.GetTestStudent(db);
        var exam = await CreatePublishedExamAsync(db);
        var handler = CreateHandler(db, uow);

        var first = await handler.Handle(new StartExamSessionCommand(exam.Id, student.Id, "one"), CancellationToken.None);
        var retry = await handler.Handle(new StartExamSessionCommand(exam.Id, student.Id, "two"), CancellationToken.None);

        retry.SessionId.Should().Be(first.SessionId);
        (await db.ExamSessions.CountAsync(session => session.StudentId == student.Id && session.ExamId == exam.Id && session.Status == ExamSessionStatus.InProgress)).Should().Be(1);
        (await db.ExamSessionQuestions.CountAsync(question => question.ExamSessionId == first.SessionId)).Should().Be(1);
    }

    [Fact]
    public async Task Cancel_BeforeAnswer_IsUncounted_ButCancelAfterAnswerIsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var student = TestDbHelper.GetTestStudent(db);
        var exam = await CreatePublishedExamAsync(db);
        var handler = CreateHandler(db, uow);

        var cancellable = await handler.Handle(new StartExamSessionCommand(exam.Id, student.Id, null), CancellationToken.None);
        await handler.Handle(new CancelExamSessionCommand(cancellable.SessionId, student.Id), CancellationToken.None);
        (await db.ExamSessions.SingleAsync(session => session.Id == cancellable.SessionId)).Status.Should().Be(ExamSessionStatus.Cancelled);

        var next = await handler.Handle(new StartExamSessionCommand(exam.Id, student.Id, null), CancellationToken.None);
        var question = next.Questions.Single();
        await handler.Handle(new SaveExamAnswerCommand(next.SessionId, student.Id, question.Id, $"[\"{question.Options[0].Id}\"]", 0, false), CancellationToken.None);
        var action = () => handler.Handle(new CancelExamSessionCommand(next.SessionId, student.Id), CancellationToken.None);
        await action.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task GetResult_WhenSessionExpired_FinalizesAsTimedOut()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var student = TestDbHelper.GetTestStudent(db);
        var exam = await CreatePublishedExamAsync(db);
        var handler = CreateHandler(db, uow);
        var started = await handler.Handle(new StartExamSessionCommand(exam.Id, student.Id, null), CancellationToken.None);
        var persisted = await db.ExamSessions.SingleAsync(session => session.Id == started.SessionId);
        persisted.ExpiresAt = DateTime.UtcNow.AddSeconds(-1);
        await db.SaveChangesAsync();

        var result = await handler.Handle(new GetExamResultQuery(started.SessionId, student.Id), CancellationToken.None);

        result.Status.Should().Be(nameof(ExamSessionStatus.TimedOut));
        (await db.ExamSessions.SingleAsync(session => session.Id == started.SessionId)).CompletedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Start_RejectsAttemptWhenMaximumCountedAttemptsReached()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var student = TestDbHelper.GetTestStudent(db);
        var exam = await CreatePublishedExamAsync(db, maxAttempts: 1);
        db.ExamSessions.Add(new ExamSession
        {
            StudentId = student.Id,
            ExamId = exam.Id,
            StartedAt = DateTime.UtcNow.AddHours(-2),
            ExpiresAt = DateTime.UtcNow.AddHours(-1),
            CompletedAt = DateTime.UtcNow.AddHours(-1),
            DurationMinutesSnapshot = 60,
            PassingScoreSnapshot = 60,
            TotalQuestions = 1,
            Status = ExamSessionStatus.Completed,
            Score = 100,
            Passed = true
        });
        await db.SaveChangesAsync();
        var handler = CreateHandler(db, uow);

        var action = () => handler.Handle(new StartExamSessionCommand(exam.Id, student.Id, null), CancellationToken.None);

        await action.Should().ThrowAsync<ForbiddenException>();
    }

    private static ExamSessionHandlers CreateHandler(ApplicationDbContext db, IUnitOfWork uow)
    {
        var entitlements = new Mock<IEntitlementService>();
        entitlements.Setup(service => service.CanAccessSubjectContentAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), SubscriptionContentScope.QuestionsExams, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        return new ExamSessionHandlers(db, uow, entitlements.Object);
    }

    private static async Task<Exam> CreatePublishedExamAsync(ApplicationDbContext db, int? maxAttempts = null)
    {
        var question = db.Questions.First();
        var admin = db.Admins.First();
        var exam = Exam.Create(question.SubjectId, "اختبار دورة الحياة", $"exam-lifecycle-{Guid.NewGuid():N}", 2026, admin.Id, ExamType.Quiz);
        exam.Configure("اختبار دورة الحياة", null, null, ExamType.Quiz, 2026, null, 30, 60, 0, null, null, maxAttempts, false, false, true, true, true, true);
        exam.SetQuestionCount(1);
        exam.Publish();
        db.Exams.Add(exam);
        db.ExamQuestions.Add(ExamQuestion.Create(exam.Id, question.Id, 0));
        await db.SaveChangesAsync();
        return exam;
    }
}
