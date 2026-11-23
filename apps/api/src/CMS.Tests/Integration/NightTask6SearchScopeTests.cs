using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;

namespace CMS.Tests.Integration;

/// <summary>
/// Night Task 6 — the aggregate student search endpoint must never leak or
/// hint at content outside the student's ACTIVE entitlement scope:
///
///   1. Subjects/lectures/questions/files from a NON-granted subject are
///      absent even when they match the term.
///   2. Content-scope specificity holds inside a granted subject
///      (QuestionsExams grant → questions only; VideoAudio grant →
///      video/audio files only; LecturesText grant → lectures/text files
///      only; FullSubject → everything).
///   3. A student with NO grants receives an empty result — not an error.
///   4. Non-published / infected / deleted rows stay hidden.
///
/// The server-side filter is the ONLY guard: these tests hit the HTTP route
/// directly (no client filtering involved).
/// </summary>
[Collection("SignedEntitlementHttp")]
public sealed class NightTask6SearchScopeTests : IClassFixture<AdminEndpointFactory>
{
    private readonly AdminEndpointFactory _factory;

    public NightTask6SearchScopeTests(AdminEndpointFactory factory) => _factory = factory;

    private sealed record SearchRow(string kind, Guid id, string title, Guid? subjectId, Guid? lectureId, string? fileType);
    private sealed record SearchPayload(IReadOnlyList<SearchRow> items);

    private async Task<(Guid studentId, Guid grantedSubjectId, Guid otherSubjectId)> SeedWorldAsync(SubscriptionContentScope grantedScope, bool grantAtAll = true)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        // The factory already seeds one academic hierarchy; build two fresh
        // subjects under it so the world is self-contained.
        var semester = await db.Semesters.AsNoTracking().FirstAsync();
        var grantedSubject = Subject.Create(semester.Id, "مادة القلب النووية", $"night6-a-{Guid.NewGuid():N}"[..40]);
        var otherSubject = Subject.Create(semester.Id, "مادة الجلد النووية", $"night6-b-{Guid.NewGuid():N}"[..40]);
        db.Subjects.AddRange(grantedSubject, otherSubject);

        var student = Student.Create($"097{Random.Shared.Next(1_000_000, 9_999_999)}", "hash", "باحث");
        student.VerifyPhone();
        db.Students.Add(student);

        // Identical content shape in BOTH subjects — same searchable marker —
        // so any leak from the non-granted side is unambiguous.
        const string marker = "منوماركر";
        foreach (var (subject, prefix) in new[] { (grantedSubject, "أ"), (otherSubject, "ب") })
        {
            var lecture = Lecture.Create(subject.Id, $"محاضرة {prefix} {marker}", $"night6-lec-{prefix}-{Guid.NewGuid():N}"[..44], 1);
            db.Lectures.Add(lecture);

            var question = Question.Create($"سؤال {prefix} {marker}", QuestionType.Mcq, subject.Id, null, Difficulty.Medium, new List<string> { "tag" }, Guid.NewGuid());
            question.AddOption("خيار خاطئ", false);
            question.AddOption("خيار صحيح", true);
            question.UpdateExplanation("شرح اختباري");
            question.Publish();
            db.Questions.Add(question);

            db.LibraryFiles.AddRange(
                new LibraryFile
                {
                    SubjectId = subject.Id, Type = LibraryFileType.Pdf, Title = $"ملف {prefix} {marker}",
                    FileUrl = "library/test/f", FileSize = 2048, Category = LibraryFileCategory.Curriculum,
                    Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean,
                },
                new LibraryFile
                {
                    SubjectId = subject.Id, Type = LibraryFileType.Video, Title = $"فيديو {prefix} {marker}",
                    FileUrl = "library/test/v", FileSize = 2048, Category = LibraryFileCategory.Curriculum,
                    DurationSeconds = 900, Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean,
                });
        }

        if (grantAtAll)
        {
            var batch = new CodeBatch
            {
                Name = $"night6-{Guid.NewGuid():N}"[..32], Quantity = 1, ScopeType = "subject",
                ScopeSubjectId = grantedSubject.Id, DurationDays = 30, CreatedBy = _factory.SuperAdminId,
            };
            db.CodeBatches.Add(batch);
            await db.SaveChangesAsync();
            var code = new SubscriptionCode
            {
                Code = $"N6{Random.Shared.Next(10_000_000, 99_999_999)}", BatchId = batch.Id,
                ScopeType = SubscriptionScopeType.Subject, ScopeSubjectId = grantedSubject.Id,
                ContentScope = grantedScope, DurationDays = 30, Status = CodeStatus.Used,
                IsPublic = false, CreatedBy = _factory.SuperAdminId,
            };
            db.SubscriptionCodes.Add(code);
            await db.SaveChangesAsync();
            db.StudentSubscriptions.Add(new StudentSubscription
            {
                StudentId = student.Id, SubscriptionCodeId = code.Id,
                ScopeType = SubscriptionScopeType.Subject, ScopeSubjectId = grantedSubject.Id,
                ContentScope = grantedScope, Status = SubscriptionStatus.Active,
                StartsAt = DateTime.UtcNow.AddDays(-1), ExpiresAt = DateTime.UtcNow.AddDays(29),
            });
        }

        await db.SaveChangesAsync();
        return (student.Id, grantedSubject.Id, otherSubject.Id);
    }

    private async Task<List<SearchRow>> SearchAsync(Guid studentId, string term)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/search?q={Uri.EscapeDataString(term)}");
        request.Headers.Add("X-Test-Student-Id", studentId.ToString());
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var payload = await response.Content.ReadFromJsonAsync<SearchPayload>();
        return payload?.items?.ToList() ?? [];
    }

    private async Task AssertNothingFromSubject(List<SearchRow> rows, Guid subjectId)
    {
        // Every row carries subjectId for lecture/question/file kinds; subject
        // rows are excluded from this assertion (their kind is "subject").
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var leakedLectures = await db.Lectures.AsNoTracking().Where(l => l.SubjectId == subjectId).Select(l => l.Id).ToListAsync();
        var leakedFiles = await db.LibraryFiles.AsNoTracking().Where(f => f.SubjectId == subjectId).Select(f => f.Id).ToListAsync();
        rows.Should().NotContain(r => r.subjectId == subjectId, "no content row from the non-granted subject may appear");
        rows.Should().NotContain(r => leakedLectures.Contains(r.id), "lecture rows from the non-granted subject may not appear");
        rows.Should().NotContain(r => leakedFiles.Contains(r.id), "file rows from the non-granted subject may not appear");
    }

    [Fact]
    public async Task Search_NonGrantedSubjectContent_IsCompletelyAbsent()
    {
        var (studentId, grantedId, otherId) = await SeedWorldAsync(SubscriptionContentScope.FullSubject);
        var rows = await SearchAsync(studentId, "منوماركر");
        rows.Should().NotBeEmpty("the granted subject's content matches the term");
        await AssertNothingFromSubject(rows, otherId);
        rows.Should().OnlyContain(r => r.subjectId == grantedId || r.kind == "subject");
    }

    [Fact]
    public async Task Search_QuestionsExamsGrant_QuestionsOnly_NoLecturesOrFiles()
    {
        var (studentId, grantedId, otherId) = await SeedWorldAsync(SubscriptionContentScope.QuestionsExams);
        var rows = await SearchAsync(studentId, "منوماركر");
        await AssertNothingFromSubject(rows, otherId);
        rows.Should().Contain(r => r.kind == "question" && r.subjectId == grantedId, "questions are in scope");
        rows.Should().NotContain(r => r.kind == "lecture", "a QuestionsExams grant does not unlock lectures");
        rows.Should().NotContain(r => r.kind == "pdf" || r.kind == "video" || r.kind == "file", "a QuestionsExams grant does not unlock files");
    }

    [Fact]
    public async Task Search_VideoAudioGrant_VideoFilesOnly()
    {
        var (studentId, grantedId, otherId) = await SeedWorldAsync(SubscriptionContentScope.VideoAudio);
        var rows = await SearchAsync(studentId, "منوماركر");
        await AssertNothingFromSubject(rows, otherId);
        rows.Should().Contain(r => r.kind == "video" && r.subjectId == grantedId, "video/audio files are in scope");
        rows.Should().NotContain(r => r.kind == "question", "a VideoAudio grant does not unlock questions");
        rows.Should().NotContain(r => r.kind == "lecture", "a VideoAudio grant does not unlock lectures");
        rows.Should().NotContain(r => r.kind == "pdf", "a VideoAudio grant does not unlock text files");
    }

    [Fact]
    public async Task Search_LecturesTextGrant_LecturesAndTextFiles_NoVideoNoQuestions()
    {
        var (studentId, grantedId, otherId) = await SeedWorldAsync(SubscriptionContentScope.LecturesText);
        var rows = await SearchAsync(studentId, "منوماركر");
        await AssertNothingFromSubject(rows, otherId);
        rows.Should().Contain(r => r.kind == "lecture" && r.subjectId == grantedId, "lectures are in scope");
        rows.Should().Contain(r => r.kind == "pdf" && r.subjectId == grantedId, "text files are in scope");
        rows.Should().NotContain(r => r.kind == "question", "a LecturesText grant does not unlock questions");
        rows.Should().NotContain(r => r.kind == "video", "a LecturesText grant does not unlock video/audio");
    }

    [Fact]
    public async Task Search_NoGrantsAtAll_EmptyResultNotAnError()
    {
        var (studentId, _, _) = await SeedWorldAsync(SubscriptionContentScope.FullSubject, grantAtAll: false);
        var rows = await SearchAsync(studentId, "منوماركر");
        rows.Should().BeEmpty("a student with no active grants must see nothing — no leak, no error");
    }

    [Fact]
    public async Task Search_DraftQuestion_StaysHiddenEvenWhenInScope()
    {
        var (studentId, grantedId, _) = await SeedWorldAsync(SubscriptionContentScope.QuestionsExams);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var draft = Question.Create("سؤال مسودة منوماركر", QuestionType.Mcq, grantedId, null, Difficulty.Medium, new List<string> { "tag" }, Guid.NewGuid());
        db.Questions.Add(draft);
        await db.SaveChangesAsync();

        var rows = await SearchAsync(studentId, "منوماركر");
        rows.Should().NotContain(r => r.id == draft.Id, "non-published rows stay hidden even inside an entitled subject");
    }
}
