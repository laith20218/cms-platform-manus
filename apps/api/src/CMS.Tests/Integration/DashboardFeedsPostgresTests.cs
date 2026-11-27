using CMS.Application.Commands.Dashboard;
using CMS.Application.DTOs.Dashboard;
using CMS.Application.Handlers.Dashboard;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Tests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace CMS.Tests.Integration;

/// <summary>
/// PostgreSQL-backed regression tests for the dashboard feed handlers.
///
/// The top-subjects handler shipped a LINQ shape that EF Core 9 + Npgsql could not
/// translate (constructor projection inside a GroupBy Select) — every live call
/// answered 500 while the InMemory-based HTTP tests stayed green because the
/// InMemory provider never translates to SQL. These tests run the handlers against
/// a REAL PostgreSQL database so translation failures fail CI.
/// </summary>
[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class DashboardFeedsPostgresTests
{
    [PostgresFact]
    public async Task TopSubjects_TranslatesAggregatesAndOrdersCorrectly()
    {
        var connectionString = Environment.GetEnvironmentVariable(PostgresIntegrationEnvironment.VariableName);
        connectionString.Should().NotBeNullOrWhiteSpace("the Postgres fixture publishes a connection string");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString!)
            .Options;
        await using var db = new ApplicationDbContext(options);

        var suffix = Guid.NewGuid().ToString("N")[..8];
        var university = University.Create($"جامعة الرصد {suffix}", $"dash-univ-{suffix}", "Dash University");
        var college = College.Create(university.Id, $"كلية الرصد {suffix}", $"dash-college-{suffix}", "Dash College");
        var year = AcademicYear.Create(college.Id, $"سنة الرصد {suffix}", $"dash-year-{suffix}", 1);
        var semester = Semester.Create(year.Id, $"فصل الرصد {suffix}", $"dash-sem-{suffix}", 1);
        var subjectA = Subject.Create(semester.Id, $"مادة الرصد أ {suffix}", $"dash-subject-a-{suffix}", "Dash Subject A");
        var subjectB = Subject.Create(semester.Id, $"مادة الرصد ب {suffix}", $"dash-subject-b-{suffix}", "Dash Subject B");

        var adminId = Guid.NewGuid();
        var questionA = Question.Create($"سؤال أ {suffix}", QuestionType.Mcq, subjectA.Id, null, Difficulty.Easy, null, adminId);
        var questionB = Question.Create($"سؤال ب {suffix}", QuestionType.Mcq, subjectB.Id, null, Difficulty.Easy, null, adminId);

        var s1 = Student.Create($"09{Random.Shared.Next(100_000_000, 999_999_999)}", $"hash-a-{suffix}", $"طالب رصد 1 {suffix}");
        var s2 = Student.Create($"09{Random.Shared.Next(100_000_000, 999_999_999)}", $"hash-b-{suffix}", $"طالب رصد 2 {suffix}");
        var s3 = Student.Create($"09{Random.Shared.Next(100_000_000, 999_999_999)}", $"hash-c-{suffix}", $"طالب رصد 3 {suffix}");
        s1.VerifyPhone();
        s2.VerifyPhone();
        s3.VerifyPhone();

        var attempts = new List<AttemptLog>
        {
            new() { StudentId = s1.Id, QuestionId = questionA.Id, IsCorrect = true, AnsweredAt = DateTime.UtcNow.AddMinutes(-30) },
            new() { StudentId = s1.Id, QuestionId = questionA.Id, IsCorrect = true, AnsweredAt = DateTime.UtcNow.AddMinutes(-25) },
            new() { StudentId = s2.Id, QuestionId = questionA.Id, IsCorrect = false, AnsweredAt = DateTime.UtcNow.AddMinutes(-20) },
            new() { StudentId = s3.Id, QuestionId = questionB.Id, IsCorrect = true, AnsweredAt = DateTime.UtcNow.AddMinutes(-10) }
        };

        try
        {
            db.AddRange(university, college, year, semester, subjectA, subjectB, questionA, questionB, s1, s2, s3);
            db.AttemptLogs.AddRange(attempts);
            await db.SaveChangesAsync();

            var handler = new DashboardQueryHandlers(db);
            var top = await handler.Handle(new GetTopSubjectsQuery(5), CancellationToken.None);

            // Other PostgresIntegration tests share the database — scope assertions to the
            // subjects seeded by THIS test.
            var mine = top.Where(t => t.SubjectId == subjectA.Id || t.SubjectId == subjectB.Id).ToList();
            mine.Should().HaveCount(2);

            var rowA = mine.Single(t => t.SubjectId == subjectA.Id);
            rowA.SubjectName.Should().Be(subjectA.NameAr);
            rowA.QuestionsAnswered.Should().Be(3);
            rowA.AverageAccuracy.Should().BeApproximately(66.67, 0.01);
            rowA.ActiveStudents.Should().Be(2);

            var rowB = mine.Single(t => t.SubjectId == subjectB.Id);
            rowB.QuestionsAnswered.Should().Be(1);
            rowB.AverageAccuracy.Should().BeApproximately(100.0, 0.01);
            rowB.ActiveStudents.Should().Be(1);

            // Subject A has more answered questions → it must rank above subject B.
            mine.IndexOf(rowA).Should().BeLessThan(mine.IndexOf(rowB));
        }
        finally
        {
            // Leave the shared database exactly as we found it.
            db.AttemptLogs.RemoveRange(db.AttemptLogs.Where(a => a.QuestionId == questionA.Id || a.QuestionId == questionB.Id));
            db.Questions.RemoveRange(db.Questions.Where(q => q.Id == questionA.Id || q.Id == questionB.Id));
            db.Subjects.RemoveRange(db.Subjects.Where(s => s.Id == subjectA.Id || s.Id == subjectB.Id));
            db.Semesters.RemoveRange(db.Semesters.Where(s => s.Id == semester.Id));
            db.AcademicYears.RemoveRange(db.AcademicYears.Where(y => y.Id == year.Id));
            db.Colleges.RemoveRange(db.Colleges.Where(c => c.Id == college.Id));
            db.Universities.RemoveRange(db.Universities.Where(u => u.Id == university.Id));
            db.Students.RemoveRange(db.Students.Where(s => s.Id == s1.Id || s.Id == s2.Id || s.Id == s3.Id));
            await db.SaveChangesAsync();
        }
    }

    [PostgresFact]
    public async Task RecentActivity_And_ReportsSummary_HandleOnRealPostgres()
    {
        var connectionString = Environment.GetEnvironmentVariable(PostgresIntegrationEnvironment.VariableName);
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString!)
            .Options;
        await using var db = new ApplicationDbContext(options);

        var handler = new DashboardQueryHandlers(db);

        var activity = await handler.Handle(new GetRecentActivityQuery(6), CancellationToken.None);
        activity.Should().NotBeNull();

        var summary = await handler.Handle(new GetReportsSummaryQuery(), CancellationToken.None);
        summary.TotalReports.Should().BeGreaterThanOrEqualTo(0);
        summary.RecentReports.Should().NotBeNull();
    }
}
