using CMS.Application.Commands.Exams;
using CMS.Application.Handlers.Exams;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// W14.4 (C.1, D9) — Results v2: the server now computes WrongCount (no client
/// derivation), ships StrongTopics (accuracy ≥ 60, best first) beside WeakestTopics,
/// and carries the attempt history + retake availability (MaxAttempts-aware).
/// </summary>
public class ExamResultsV2W144Tests
{
    private static ExamSessionHandlers CreateHandler(ApplicationDbContext db) =>
        new(db, new UnitOfWork(db), new EntitlementService(db));

    private static async Task<Exam> CreateExamAsync(ApplicationDbContext db, bool showResultsImmediately = true, int? maxAttempts = null)
    {
        var question = db.Questions.First();
        var admin = db.Admins.First();
        var student = TestDbHelper.GetTestStudent(db);
        // Real EntitlementService → seed an active grant (any scope passes, W14.4).
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = student.Id,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = question.SubjectId,
            ContentScope = SubscriptionContentScope.FullSubject,
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        var exam = Exam.Create(question.SubjectId, "اختبار نتائج v2", $"results-v2-{Guid.NewGuid():N}", 2026, admin.Id, ExamType.Quiz);
        exam.Configure("اختبار نتائج v2", null, null, ExamType.Quiz, 2026, null, 30, 60, 0, null, null,
            maxAttempts, false, false, showResultsImmediately, true, true, true);
        exam.SetQuestionCount(1);
        exam.Publish();
        db.Exams.Add(exam);
        db.ExamQuestions.Add(ExamQuestion.Create(exam.Id, question.Id, 0));
        await db.SaveChangesAsync();
        return exam;
    }

    private static async Task<ResultSubmit> SubmitCorrectAsync(ExamSessionHandlers handler, ApplicationDbContext db, Exam exam)
    {
        var student = TestDbHelper.GetTestStudent(db);
        var session = await handler.Handle(new StartExamSessionCommand(exam.Id, student.Id, null), CancellationToken.None);
        var question = session.Questions.Single();
        var correctOption = db.Questions.Include(item => item.Options).Single(item => item.Id == question.SourceQuestionId)
            .Options.Single(option => option.IsCorrect);
        await handler.Handle(new SaveExamAnswerCommand(session.SessionId, student.Id, question.Id, $"[\"{correctOption.Id}\"]", 0, false), CancellationToken.None);
        return new ResultSubmit(
            await handler.Handle(new SubmitExamCommand(session.SessionId, student.Id), CancellationToken.None), session.SessionId);
    }

    private sealed record ResultSubmit(CMS.Application.DTOs.Exams.ExamResultDto Result, Guid SessionId);

    [Fact]
    public async Task Result_CarriesServerWrongCount_StrongTopics_AttemptsAndRetakeFields()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var handler = CreateHandler(db);
        var exam = await CreateExamAsync(db, showResultsImmediately: true, maxAttempts: 3);
        var student = TestDbHelper.GetTestStudent(db);

        var (result, _) = await SubmitCorrectAsync(handler, db, exam);

        result.Score.Should().Be(100);
        result.WrongCount.Should().Be(0); // server-computed — not answered-correct
        result.StrongTopics.Should().Contain(topic => topic.Tag == "cardiology" && topic.Accuracy == 100);
        result.WeakestTopics.Should().BeEmpty(); // everything ≥ 60
        result.MaxAttempts.Should().Be(3);
        result.RemainingAttempts.Should().Be(2); // one counted attempt used
        result.Attempts.Should().ContainSingle().Which.IsCurrent.Should().BeTrue();
        result.Attempts![0].Score.Should().Be(100);
        result.Attempts[0].Passed.Should().BeTrue();
    }

    [Fact]
    public async Task Result_SecondAttempt_ListsHistoryWithCurrentFlag()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var handler = CreateHandler(db);
        var exam = await CreateExamAsync(db, showResultsImmediately: true, maxAttempts: null);
        var student = TestDbHelper.GetTestStudent(db);

        await SubmitCorrectAsync(handler, db, exam);
        var (second, secondSessionId) = await SubmitCorrectAsync(handler, db, exam);

        second.Attempts.Should().HaveCount(2);
        second.Attempts!.Count(attempt => attempt.IsCurrent).Should().Be(1);
        second.Attempts!.Single(attempt => attempt.IsCurrent).SessionId.Should().Be(secondSessionId);
        second.RemainingAttempts.Should().BeNull(); // unlimited exam
        second.MaxAttempts.Should().BeNull();
    }

    [Fact]
    public async Task Result_HiddenResults_ZeroWrongCountAndNoHistoryLeak()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var handler = CreateHandler(db);
        var exam = await CreateExamAsync(db, showResultsImmediately: false);

        var (result, _) = await SubmitCorrectAsync(handler, db, exam);

        result.IsResultVisible.Should().BeFalse();
        result.WrongCount.Should().Be(0); // never answered-correct when hidden
        result.Attempts.Should().BeEmpty(); // history is score-sensitive → visible-gated
        result.StrongTopics.Should().BeEmpty();
    }

    [Fact]
    public async Task Result_ExhaustedAttempts_ReportsZeroRemaining()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var handler = CreateHandler(db);
        var exam = await CreateExamAsync(db, showResultsImmediately: true, maxAttempts: 1);

        var (result, _) = await SubmitCorrectAsync(handler, db, exam);

        result.RemainingAttempts.Should().Be(0);
    }
}
