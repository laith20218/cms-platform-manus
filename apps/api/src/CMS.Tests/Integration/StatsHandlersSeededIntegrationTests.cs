using CMS.Application.Commands.Stats;
using CMS.Application.DTOs.Stats;
using CMS.Application.Handlers.Stats;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Tests.Helpers;
using FluentAssertions;
using Moq;

namespace CMS.Tests.Integration;

/// <summary>
/// Exercises the published-bank completion calculation against seeded EF data.
/// A second attempt at the same question must not increase completed percentage.
/// </summary>
public sealed class StatsHandlersSeededIntegrationTests
{
    [Fact]
    public async Task StudentStats_UsesDistinctAnsweredQuestionsAgainstPublishedSubjectBank()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);
        var answeredQuestion = db.Questions.First(question => question.SubjectId == subject.Id);

        db.AttemptLogs.AddRange(
            new AttemptLog
            {
                StudentId = student.Id,
                QuestionId = answeredQuestion.Id,
                IsCorrect = true,
                IsFirstAttempt = true,
                AttemptNumber = 1,
                DurationSeconds = 60
            },
            new AttemptLog
            {
                StudentId = student.Id,
                QuestionId = answeredQuestion.Id,
                IsCorrect = false,
                IsFirstAttempt = false,
                AttemptNumber = 2,
                DurationSeconds = 60
            });
        await db.SaveChangesAsync();

        var cache = new Mock<ICacheService>(MockBehavior.Strict);
        cache.Setup(service => service.GetAsync<StudentStatsDto?>(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((StudentStatsDto?)null);
        cache.Setup(service => service.SetAsync(It.IsAny<string>(), It.IsAny<StudentStatsDto>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = new StatsHandlers(db, cache.Object);
        var result = await handler.Handle(new GetStudentStatsQuery(student.Id, "all"), CancellationToken.None);

        result.TotalQuestions.Should().Be(2);
        result.CorrectAnswers.Should().Be(1);
        var subjectStats = result.BySubject.Should().ContainSingle(stat => stat.SubjectId == subject.Id).Subject;
        subjectStats.QuestionsAnswered.Should().Be(1);
        subjectStats.CompletedPercentage.Should().Be(50d);
    }
}
