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
/// W14.4 (A.4) — categorized practice, verified against the REAL EntitlementService:
/// the tree groups the subject's practice-eligible questions Lecture → ParagraphTag
/// with "غير مصنف" buckets, the session start anchors to the best-coverage published
/// exam while the FILTER stays the question-set authority, and submit/progress honor
/// the echoed (server-verified) lens: out-of-filter answers are rejected, out-of-
/// composition-but-in-filter answers are graded, totals are filter-scoped and
/// auto-completion fires when the whole filtered set is graded.
/// </summary>
public class PracticeCategorizedW144Tests
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
            ContentScope = SubscriptionContentScope.VideoAudio, // non-QuestionsExams on purpose (W14.4 ruling)
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await db.SaveChangesAsync();
    }

    private record SeededQuestion(Question Question, Guid CorrectOptionId, Guid WrongOptionId);

    private static async Task<SeededQuestion> SeedQuestionAsync(
        ApplicationDbContext db, Guid subjectId, Guid? lectureId, string? paragraphTag, string text)
    {
        var admin = db.Admins.First();
        var question = Question.Create(text, QuestionType.Mcq, subjectId, lectureId, Difficulty.Medium, new List<string>(), admin.Id);
        question.AddOption("خيار خاطئ", false);
        question.AddOption("خيار صحيح", true);
        question.UpdateExplanation($"شرح {text}");
        question.SetParagraphTag(paragraphTag);
        question.Publish();
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return new SeededQuestion(question, question.Options.Single(option => option.IsCorrect).Id,
            question.Options.First(option => !option.IsCorrect).Id);
    }

    /// <summary>A published exam whose composition covers the given questions (the anchor).</summary>
    private static async Task<Exam> SeedAnchorExamAsync(ApplicationDbContext db, Guid subjectId, params Question[] composition)
    {
        var admin = db.Admins.First();
        var exam = Exam.Create(subjectId, "نموذج W14.4", $"w144-anchor-{Guid.NewGuid():N}", 2026, admin.Id, ExamType.Practice);
        for (var index = 0; index < composition.Length; index++)
            db.ExamQuestions.Add(ExamQuestion.Create(exam.Id, composition[index].Id, index));
        exam.SetQuestionCount(composition.Length);
        exam.Publish();
        db.Exams.Add(exam);
        await db.SaveChangesAsync();
        return exam;
    }

    [Fact]
    public async Task Tree_GroupsLectureThenTag_UncategorizedBucketsLast()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture = db.Lectures.First();
        var tagged = await SeedQuestionAsync(db, subject.Id, lecture.Id, "الفصل الأول", "سؤال مصنف");
        var untaggedInLecture = await SeedQuestionAsync(db, subject.Id, lecture.Id, null, "سؤال بدون وسم داخل محاضرة");
        var uncategorized = await SeedQuestionAsync(db, subject.Id, null, "وسم بلا محاضرة", "سؤال بلا محاضرة");
        var anchor = await SeedAnchorExamAsync(db, subject.Id, tagged.Question);

        var tree = await Create(db).Handle(new GetCategorizedPracticeTreeQuery(student.Id, subject.Id), CancellationToken.None);

        tree.SubjectName.Should().Be(subject.NameAr);
        tree.AnchorExamModelId.Should().Be(anchor.Id);
        // 3 seeded + the 2 TestDbHelper published questions (both lecture-less, tag-less).
        tree.TotalQuestions.Should().Be(5);
        tree.UncategorizedCount.Should().Be(3);
        tree.Lectures.Should().HaveCount(2);

        var lectureNode = tree.Lectures.Single(node => node.LectureId == lecture.Id);
        lectureNode.QuestionsCount.Should().Be(2);
        lectureNode.Groups.Should().HaveCount(2);
        lectureNode.Groups.Last().ParagraphTag.Should().BeNull(); // غير مصنف last inside the lecture
        lectureNode.Groups.First().ParagraphTag.Should().Be("الفصل الأول");

        var uncategorizedNode = tree.Lectures.Single(node => node.LectureId == null);
        uncategorizedNode.LectureTitle.Should().Be("غير مصنف");
        uncategorizedNode.QuestionsCount.Should().Be(3);
        // Uncategorized bucket itself is the LAST lecture node.
        tree.Lectures.Last().LectureId.Should().BeNull();
    }

    [Fact]
    public async Task Tree_NoGrantAtAll_ThrowsForbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();

        var act = () => Create(db).Handle(new GetCategorizedPracticeTreeQuery(student.Id, subject.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task StartCategorized_AnchorsToBestCoverage_ExposesFilteredSet()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture = db.Lectures.First();
        var inLecture = await SeedQuestionAsync(db, subject.Id, lecture.Id, null, "سؤال المحاضرة");
        var anchor = await SeedAnchorExamAsync(db, subject.Id, inLecture.Question); // composition ⊇ filter

        var started = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, lecture.Id, false, null, false), CancellationToken.None);

        started.AnchorExamModelId.Should().Be(anchor.Id);
        started.TotalQuestions.Should().Be(1); // only the lecture question — not the seeded lecture-less ones
        started.Questions.Should().ContainSingle().Which.Text.Should().Be("سؤال المحاضرة");
        (await db.PracticeSessions.CountAsync(session => session.StudentId == student.Id && session.ExamModelId == anchor.Id))
            .Should().Be(1);

        var resumed = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, lecture.Id, false, null, false), CancellationToken.None);
        resumed.SessionId.Should().Be(started.SessionId);
        resumed.Created.Should().BeFalse();
    }

    [Fact]
    public async Task StartCategorized_EmptyFilter_ThrowsBusinessRule()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);
        await SeedAnchorExamAsync(db, subject.Id);

        // A lecture id that matches nothing (the helper's seeded questions are the
        // untagged-lecture bucket, so the lecture-scoped lens is empty by construction).
        var act = () => Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, Guid.NewGuid(), false, null, false), CancellationToken.None);

        await act.Should().ThrowAsync<BusinessRuleViolationException>();
    }

    [Fact]
    public async Task StartCategorized_NoPublishedExam_ThrowsBusinessRule()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);
        // The seeded exam is Published but has NO composition — still a valid anchor.
        // Remove it to test the no-exam-at-all branch.
        db.Exams.RemoveRange(db.Exams);
        await db.SaveChangesAsync();

        var act = () => Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, null, false, null, false), CancellationToken.None);

        await act.Should().ThrowAsync<BusinessRuleViolationException>();
    }

    [Fact]
    public async Task Submit_WithFilter_GradesOutOfCompositionQuestion_AndDisclosesFeedback()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture = db.Lectures.First();
        var inLecture = await SeedQuestionAsync(db, subject.Id, lecture.Id, null, "سؤال خارج التركيبة");
        // Anchor composition deliberately does NOT contain the filtered question —
        // the filter (not the composition) is the membership authority.
        var anchor = await SeedAnchorExamAsync(db, subject.Id);

        var started = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, lecture.Id, false, null, false), CancellationToken.None);
        var filter = new PracticeCategoryFilter(lecture.Id, false, null, false);

        var wrong = await Create(db).Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, inLecture.Question.Id, inLecture.WrongOptionId.ToString(), 5, null, filter), CancellationToken.None);

        wrong.IsCorrect.Should().BeFalse();
        wrong.TotalQuestions.Should().Be(1);
        wrong.AnsweredCount.Should().Be(1);
        wrong.CorrectOptionIds.Should().Contain(inLecture.CorrectOptionId);
        wrong.Explanation.Should().Be("شرح سؤال خارج التركيبة");
        wrong.Status.Should().Be(nameof(PracticeSessionStatus.Completed)); // whole filtered set graded
        wrong.Score.Should().Be(0);
    }

    [Fact]
    public async Task Submit_WithFilter_RejectsOutOfFilterQuestion()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture = db.Lectures.First();
        var inLecture = await SeedQuestionAsync(db, subject.Id, lecture.Id, null, "سؤال داخل التصنيف");
        var outside = await SeedQuestionAsync(db, subject.Id, null, null, "سؤال خارج التصنيف");
        var anchor = await SeedAnchorExamAsync(db, subject.Id, inLecture.Question);

        var started = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, lecture.Id, false, null, false), CancellationToken.None);
        var filter = new PracticeCategoryFilter(lecture.Id, false, null, false);

        var act = () => Create(db).Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, outside.Question.Id, outside.CorrectOptionId.ToString(), 5, null, filter), CancellationToken.None);

        await act.Should().ThrowAsync<BusinessRuleViolationException>();
    }

    [Fact]
    public async Task Progress_WithFilter_ScopesTotalsToTheFilteredSet()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture = db.Lectures.First();
        var first = await SeedQuestionAsync(db, subject.Id, lecture.Id, null, "سؤال 1");
        var second = await SeedQuestionAsync(db, subject.Id, lecture.Id, null, "سؤال 2");
        var anchor = await SeedAnchorExamAsync(db, subject.Id, first.Question, second.Question);

        var started = await Create(db).Handle(new StartCategorizedPracticeCommand(
            student.Id, subject.Id, lecture.Id, false, null, false), CancellationToken.None);
        var filter = new PracticeCategoryFilter(lecture.Id, false, null, false);
        var handlers = Create(db);
        await handlers.Handle(new SubmitPracticeAnswerCommand(
            student.Id, started.SessionId, first.Question.Id, first.CorrectOptionId.ToString(), 5, null, filter), CancellationToken.None);

        var progress = await handlers.Handle(new GetPracticeProgressQuery(student.Id, started.SessionId, filter), CancellationToken.None);

        progress.TotalQuestions.Should().Be(2);
        progress.AnsweredCount.Should().Be(1);
        progress.CorrectCount.Should().Be(1);
        progress.WrongCount.Should().Be(0);
        progress.CompletionPercent.Should().Be(50);
        progress.Status.Should().Be(nameof(PracticeSessionStatus.InProgress));
    }

    [Fact]
    public async Task StartExamModel_NowShipsCompositionQuestions()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = db.Subjects.First();
        await SeedGrantAsync(db, student.Id, subject.Id);

        var lecture = db.Lectures.First();
        var question = await SeedQuestionAsync(db, subject.Id, lecture.Id, null, "سؤال التركيبة");
        var anchor = await SeedAnchorExamAsync(db, subject.Id, question.Question);

        var started = await Create(db).Handle(new StartPracticeSessionCommand(student.Id, anchor.Id), CancellationToken.None);

        started.TotalQuestions.Should().Be(1);
        started.Questions.Should().ContainSingle().Which.Id.Should().Be(question.Question.Id);
        started.Questions![0].Options.Should().HaveCount(2); // correctness flags absent (QuestionOptionDto)
    }
}
