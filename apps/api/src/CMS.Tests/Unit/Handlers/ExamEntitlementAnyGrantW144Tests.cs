using CMS.Application.Commands.Exams;
using CMS.Application.Handlers.Exams;
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
/// W14.4 Phase 0 — the exam surfaces moved from the QuestionsExams-only content gate
/// to the content-agnostic "read" gate (same ruling as the R69 courses catalog): ANY
/// active grant over the subject (VideoAudio / LecturesText / QuestionsExams /
/// FullSubject / FullYear) opens exam discovery AND the session lifecycle. Verified
/// against the REAL EntitlementService (no mocks) so grant matching, the "active"
/// window and the hard 403 for grant-less students are all exercised end-to-end.
/// </summary>
public class ExamEntitlementAnyGrantW144Tests
{
    // ===== helpers =====

    private static (ExamQueryHandlers Queries, ExamSessionHandlers Sessions, ApplicationDbContext Db) Create(ApplicationDbContext db)
    {
        var entitlements = new EntitlementService(db);
        var uow = new UnitOfWork(db);
        return (new ExamQueryHandlers(db, entitlements, uow), new ExamSessionHandlers(db, uow, entitlements), db);
    }

    private static async Task SeedGrantAsync(ApplicationDbContext db, Guid studentId, Guid subjectId, SubscriptionContentScope contentScope, bool active = true)
    {
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = studentId,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subjectId,
            ContentScope = contentScope,
            Status = SubscriptionStatus.Active,
            StartsAt = active ? DateTime.UtcNow.AddMinutes(-1) : DateTime.UtcNow.AddMinutes(10),
            ExpiresAt = active ? DateTime.UtcNow.AddDays(1) : DateTime.UtcNow.AddDays(2)
        });
        await db.SaveChangesAsync();
    }

    /// <summary>A published exam with a one-question composition (the seeded exam has none).</summary>
    private static async Task<Exam> SeedPublishedExamWithQuestionAsync(ApplicationDbContext db)
    {
        var subject = db.Subjects.First();
        var question = db.Questions.First();
        var admin = db.Admins.First();
        var exam = Exam.Create(subject.Id, "دورة تدريبية W14.4", $"w144-exam-{Guid.NewGuid():N}", 2026, admin.Id, ExamType.Quiz);
        exam.Configure("دورة تدريبية W14.4", null, null, ExamType.Quiz, 2026, null, 30, 60, 0, null, null, null, false, false, true, true, true, true);
        exam.SetQuestionCount(1);
        exam.Publish();
        db.Exams.Add(exam);
        db.ExamQuestions.Add(ExamQuestion.Create(exam.Id, question.Id, 0));
        await db.SaveChangesAsync();
        return exam;
    }

    // ===== discovery: GET /exams/by-subject — any active grant passes =====

    [Theory]
    [InlineData(SubscriptionContentScope.VideoAudio)]
    [InlineData(SubscriptionContentScope.LecturesText)]
    [InlineData(SubscriptionContentScope.QuestionsExams)]
    [InlineData(SubscriptionContentScope.FullSubject)]
    public async Task GetExamsBySubject_AnyActiveGrant_ReturnsPublishedExams(SubscriptionContentScope scope)
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id, scope);
        await SeedPublishedExamWithQuestionAsync(db);
        var (queries, _, _) = Create(db);

        var result = await queries.Handle(new GetExamsBySubjectQuery(subject.Id, student.Id), CancellationToken.None);

        result.Should().ContainSingle(item => item.TitleAr == "دورة تدريبية W14.4");
    }

    [Fact]
    public async Task GetExamsBySubject_NoGrantAtAll_ThrowsForbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedPublishedExamWithQuestionAsync(db);
        var (queries, _, _) = Create(db);

        var act = () => queries.Handle(new GetExamsBySubjectQuery(subject.Id, student.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task GetExamsBySubject_GrantNotYetActive_ThrowsForbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id, SubscriptionContentScope.VideoAudio, active: false);
        await SeedPublishedExamWithQuestionAsync(db);
        var (queries, _, _) = Create(db);

        var act = () => queries.Handle(new GetExamsBySubjectQuery(subject.Id, student.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ===== session lifecycle: POST /{examId}/start — any active grant passes =====

    [Fact]
    public async Task StartExamSession_VideoAudioOnlyGrant_StartsSession()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id, SubscriptionContentScope.VideoAudio);
        var exam = await SeedPublishedExamWithQuestionAsync(db);
        var (_, sessions, _) = Create(db);

        var session = await sessions.Handle(new StartExamSessionCommand(exam.Id, student.Id, null), CancellationToken.None);

        session.ExamId.Should().Be(exam.Id);
        session.Questions.Should().ContainSingle();
    }

    [Fact]
    public async Task StartExamSession_NoGrantAtAll_ThrowsForbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var exam = await SeedPublishedExamWithQuestionAsync(db);
        var (_, sessions, _) = Create(db);

        var act = () => sessions.Handle(new StartExamSessionCommand(exam.Id, student.Id, null), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }
}
