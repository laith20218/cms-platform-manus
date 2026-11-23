using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;

using CMS.Tests.Infrastructure;

namespace CMS.Tests.Integration;

/// <summary>
/// Night Task 6 — the aggregate student search endpoint must never leak or
/// hint at content outside the student's ACTIVE entitlement scope.
/// These are HTTP-level route hits against REAL PostgreSQL (the Tags/options
/// predicates need a relational provider), exercising the server-side filter
/// as the sole guard:
///
///   1. Content from a NON-granted subject is absent even when it matches.
///   2. Content-scope specificity holds inside a granted subject.
///   3. A student with NO grants receives an empty result — not an error.
///   4. Non-published rows stay hidden even in-scope.
/// </summary>
[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class NightTask6SearchScopeTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task Search_FullSubjectGrant_ReturnsOnlyGrantedSubjectContent()
    {
        await using var factory = await SearchScopeHttpFactory.CreateAsync(SubscriptionContentScope.FullSubject, grantAtAll: true);
        try
        {
            var rows = await factory.SearchAsync("منوماركر");
            rows.Should().NotBeEmpty("the granted subject's content matches the term");
            rows.Should().OnlyContain(row => row.subjectId == factory.GrantedSubjectId || row.kind == "subject",
                "nothing from the non-granted subject may appear");
            rows.Should().Contain(row => row.kind == "question" && row.subjectId == factory.GrantedSubjectId);
            rows.Should().Contain(row => row.kind == "lecture" && row.subjectId == factory.GrantedSubjectId);
            rows.Should().Contain(row => row.kind == "pdf" && row.subjectId == factory.GrantedSubjectId);
            rows.Should().Contain(row => row.kind == "video" && row.subjectId == factory.GrantedSubjectId);
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }

    [PostgresFact]
    public async Task Search_QuestionsExamsGrant_QuestionsOnly_NoLecturesOrFiles()
    {
        await using var factory = await SearchScopeHttpFactory.CreateAsync(SubscriptionContentScope.QuestionsExams, grantAtAll: true);
        try
        {
            var rows = await factory.SearchAsync("منوماركر");
            rows.Should().Contain(row => row.kind == "question" && row.subjectId == factory.GrantedSubjectId, "questions are in scope");
            rows.Should().NotContain(row => row.kind == "lecture", "a QuestionsExams grant does not unlock lectures");
            rows.Should().NotContain(row => row.kind == "pdf", "a QuestionsExams grant does not unlock text files");
            rows.Should().NotContain(row => row.kind == "video", "a QuestionsExams grant does not unlock video/audio");
            rows.Should().OnlyContain(row => row.subjectId == factory.GrantedSubjectId || row.kind == "subject");
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }

    [PostgresFact]
    public async Task Search_VideoAudioGrant_VideoFilesOnly()
    {
        await using var factory = await SearchScopeHttpFactory.CreateAsync(SubscriptionContentScope.VideoAudio, grantAtAll: true);
        try
        {
            var rows = await factory.SearchAsync("منوماركر");
            rows.Should().Contain(row => row.kind == "video" && row.subjectId == factory.GrantedSubjectId, "video/audio files are in scope");
            rows.Should().NotContain(row => row.kind == "question", "a VideoAudio grant does not unlock questions");
            rows.Should().NotContain(row => row.kind == "lecture", "a VideoAudio grant does not unlock lectures");
            rows.Should().NotContain(row => row.kind == "pdf", "a VideoAudio grant does not unlock text files");
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }

    [PostgresFact]
    public async Task Search_LecturesTextGrant_LecturesAndTextFiles_NoVideoNoQuestions()
    {
        await using var factory = await SearchScopeHttpFactory.CreateAsync(SubscriptionContentScope.LecturesText, grantAtAll: true);
        try
        {
            var rows = await factory.SearchAsync("منوماركر");
            rows.Should().Contain(row => row.kind == "lecture" && row.subjectId == factory.GrantedSubjectId, "lectures are in scope");
            rows.Should().Contain(row => row.kind == "pdf" && row.subjectId == factory.GrantedSubjectId, "text files are in scope");
            rows.Should().NotContain(row => row.kind == "question", "a LecturesText grant does not unlock questions");
            rows.Should().NotContain(row => row.kind == "video", "a LecturesText grant does not unlock video/audio");
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }

    [PostgresFact]
    public async Task Search_NoGrantsAtAll_EmptyResultNotAnError()
    {
        await using var factory = await SearchScopeHttpFactory.CreateAsync(SubscriptionContentScope.FullSubject, grantAtAll: false);
        try
        {
            var rows = await factory.SearchAsync("منوماركر");
            rows.Should().BeEmpty("a student with no active grants must see nothing — no leak, no error");
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }

    [PostgresFact]
    public async Task Search_DraftQuestion_StaysHiddenEvenWhenInScope()
    {
        await using var factory = await SearchScopeHttpFactory.CreateAsync(SubscriptionContentScope.QuestionsExams, grantAtAll: true, seedDraftQuestion: true);
        try
        {
            var rows = await factory.SearchAsync("منوماركر");
            rows.Should().NotContain(row => row.id == factory.DraftQuestionId, "non-published rows stay hidden even inside an entitled subject");
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }
}

internal sealed record SearchRow(string kind, Guid id, string title, Guid? subjectId, Guid? lectureId, string? fileType);
internal sealed record SearchPayload(IReadOnlyList<SearchRow> items);

/// <summary>
/// Boots the real API against real PostgreSQL (same shape as MySubjectsHttpFactory)
/// and seeds a two-subject world with an identical searchable marker in both, so
/// any entitlement leak from the non-granted side is unambiguous.
/// </summary>
internal sealed class SearchScopeHttpFactory : WebApplicationFactory<Program>, IAsyncDisposable
{
    private const string JwtSigningKey = "night6-search-test-jwt-signing-key-32-bytes";
    private const string Marker = "منوماركر";
    private readonly string _connectionString;

    internal HttpClient Client { get; private set; } = null!;
    internal Guid GrantedSubjectId { get; private set; }
    internal Guid DraftQuestionId { get; private set; }
    private Guid _studentId, _otherSubjectId, _universityId, _collegeId, _yearId, _semesterId;
    private Guid _grantedLectureId, _grantedQuestionId, _grantedPdfId, _grantedVideoId;
    private Guid _otherLectureId, _otherQuestionId, _otherPdfId, _otherVideoId;

    private SearchScopeHttpFactory(string connectionString) => _connectionString = connectionString;

    internal static async Task<SearchScopeHttpFactory> CreateAsync(SubscriptionContentScope grantedScope, bool grantAtAll, bool seedDraftQuestion = false)
    {
        var connectionString = Environment.GetEnvironmentVariable("CMS_PHASE34_TEST_POSTGRES");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("BLOCKED: set CMS_PHASE34_TEST_POSTGRES to run the Night-6 search scope tests.");
        var factory = new SearchScopeHttpFactory(connectionString);
        await factory.SeedAsync(grantedScope, grantAtAll, seedDraftQuestion);
        return factory;
    }

    internal async Task<List<SearchRow>> SearchAsync(string term)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/search?q={Uri.EscapeDataString(term)}")
        {
            Headers = { { "X-Test-Student-Id", _studentId.ToString() } }
        };
        var response = await Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var payload = await response.Content.ReadFromJsonAsync<SearchPayload>();
        return payload?.items?.ToList() ?? [];
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Environment.SetEnvironmentVariable("Jwt__Secret", JwtSigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "night6-search-test");
        Environment.SetEnvironmentVariable("Jwt__Audience", "night6-search-test");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "night6-search-entitlement-key-32-bytes!!");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", _connectionString);
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");

        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = "night6-search-test",
            ["Jwt:Audience"] = "night6-search-test",
            ["Security:Entitlements:SigningKey"] = "night6-search-entitlement-key-32-bytes!!",
            ["ConnectionStrings:PostgreSQL"] = _connectionString,
            ["ConnectionStrings:Redis"] = "localhost:6379"
        }));
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<ApplicationDbContext>();
            services.RemoveAll<IApplicationDbContext>();
            services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(_connectionString));
            services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());

            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = Night6SearchTestAuthenticationHandler.Scheme;
                options.DefaultChallengeScheme = Night6SearchTestAuthenticationHandler.Scheme;
                options.DefaultForbidScheme = Night6SearchTestAuthenticationHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, Night6SearchTestAuthenticationHandler>(Night6SearchTestAuthenticationHandler.Scheme, _ => { });

            services.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>(
                Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme,
                options =>
                {
                    options.Events ??= new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents();
                    options.Events.OnAuthenticationFailed = _ => Task.CompletedTask;
                    options.Events.OnMessageReceived = _ => Task.CompletedTask;
                });

            services.RemoveAll<ISessionService>();
            var sessionMock = new Mock<ISessionService>();
            sessionMock.Setup(service => service.IsActiveAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(true);
            services.AddScoped<ISessionService>(_ => sessionMock.Object);

            services.RemoveAll<ICacheService>();
            var cache = new Mock<ICacheService>();
            cache.Setup(service => service.GetAsync<bool?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((bool?)null);
            cache.Setup(service => service.GetAsync<AdminScope?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((AdminScope?)null);
            cache.Setup(service => service.SetAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(service => service.SetAsync(It.IsAny<string>(), It.IsAny<AdminScope>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(service => service.SetAsync(It.IsAny<string>(), It.IsAny<object>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            services.AddScoped<ICacheService>(_ => cache.Object);
        });
    }

    private async Task SeedAsync(SubscriptionContentScope grantedScope, bool grantAtAll, bool seedDraftQuestion)
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var suffix = Guid.NewGuid().ToString("N")[..8];
        var phoneDigits = Random.Shared.Next(100, 999).ToString();
        var university = University.Create($"جامعة night6 {suffix}", $"night6-uni-{suffix}");
        var college = College.Create(university.Id, $"كلية night6 {suffix}", $"night6-college-{suffix}");
        var year = AcademicYear.Create(college.Id, $"سنة night6 {suffix}", $"night6-year-{suffix}", 1);
        var semester = Semester.Create(year.Id, $"فصل night6 {suffix}", $"night6-semester-{suffix}", 1);
        var grantedSubject = Subject.Create(semester.Id, $"مادة أ night6 {suffix}", $"night6-a-{suffix}");
        var otherSubject = Subject.Create(semester.Id, $"مادة ب night6 {suffix}", $"night6-b-{suffix}");
        var student = Student.Create($"0991{phoneDigits}", "not-used", $"باحث night6 {suffix}");
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();

        Guid? draftQuestionId = null;
        foreach (var (subject, granted) in new[] { (grantedSubject, true), (otherSubject, false) })
        {
            var prefix = granted ? "أ" : "ب";
            var lecture = Lecture.Create(subject.Id, $"محاضرة {prefix} {Marker}", $"night6-lec-{prefix}-{suffix}", 1);
            db.Lectures.Add(lecture);

            var question = Question.Create($"سؤال {prefix} {Marker}", QuestionType.Mcq, subject.Id, null, Difficulty.Medium, new List<string> { "tag" }, Guid.NewGuid());
            question.AddOption("خيار خاطئ", false);
            question.AddOption("خيار صحيح", true);
            question.UpdateExplanation("شرح اختباري");
            question.Publish();
            db.Questions.Add(question);

            var pdf = new LibraryFile
            {
                SubjectId = subject.Id, Type = LibraryFileType.Pdf, Title = $"ملف {prefix} {Marker}",
                FileUrl = "library/test/f", FileSize = 2048, Category = LibraryFileCategory.Curriculum,
                Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean,
            };
            var video = new LibraryFile
            {
                SubjectId = subject.Id, Type = LibraryFileType.Video, Title = $"فيديو {prefix} {Marker}",
                FileUrl = "library/test/v", FileSize = 2048, Category = LibraryFileCategory.Curriculum,
                DurationSeconds = 900, Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean,
            };
            db.LibraryFiles.AddRange(pdf, video);

            if (granted)
            {
                _grantedLectureId = lecture.Id;
                _grantedQuestionId = question.Id;
                _grantedPdfId = pdf.Id;
                _grantedVideoId = video.Id;
                if (seedDraftQuestion)
                {
                    var draft = Question.Create($"سؤال مسودة {Marker}", QuestionType.Mcq, subject.Id, null, Difficulty.Medium, new List<string> { "tag" }, Guid.NewGuid());
                    draft.AddOption("خيار خاطئ", false);
                    draft.AddOption("خيار صحيح", true);
                    draft.UpdateExplanation("شرح مسودة");
                    db.Questions.Add(draft);
                    draftQuestionId = draft.Id;
                }
            }
            else
            {
                _otherLectureId = lecture.Id;
                _otherQuestionId = question.Id;
                _otherPdfId = pdf.Id;
                _otherVideoId = video.Id;
            }
        }

        if (grantAtAll)
        {
            db.StudentSubscriptions.Add(new StudentSubscription
            {
                StudentId = student.Id,
                ScopeType = SubscriptionScopeType.Subject,
                ContentScope = grantedScope,
                ScopeSubjectId = grantedSubject.Id,
                Status = SubscriptionStatus.Active,
                StartsAt = DateTime.UtcNow.AddMinutes(-1),
                ExpiresAt = DateTime.UtcNow.AddDays(30)
            });
        }

        db.Universities.Add(university);
        db.Colleges.Add(college);
        db.AcademicYears.Add(year);
        db.Semesters.Add(semester);
        db.Subjects.AddRange(grantedSubject, otherSubject);
        db.Students.Add(student);
        await db.SaveChangesAsync();

        _studentId = student.Id;
        GrantedSubjectId = grantedSubject.Id;
        _otherSubjectId = otherSubject.Id;
        _universityId = university.Id;
        _collegeId = college.Id;
        _yearId = year.Id;
        _semesterId = semester.Id;
        if (draftQuestionId.HasValue) DraftQuestionId = draftQuestionId.Value;
    }

    internal async Task CleanupAsync()
    {
        try
        {
            await using var scope = Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.StudentSubscriptions.Where(sub => sub.StudentId == _studentId).ExecuteDeleteAsync();
            await db.Questions.Where(q => q.SubjectId == GrantedSubjectId || q.SubjectId == _otherSubjectId).ExecuteDeleteAsync();
            await db.LibraryFiles.Where(f => f.SubjectId == GrantedSubjectId || f.SubjectId == _otherSubjectId).ExecuteDeleteAsync();
            await db.Lectures.Where(l => l.SubjectId == GrantedSubjectId || l.SubjectId == _otherSubjectId).ExecuteDeleteAsync();
            await db.Students.Where(s => s.Id == _studentId).ExecuteDeleteAsync();
            await db.Subjects.Where(s => s.Id == GrantedSubjectId || s.Id == _otherSubjectId).ExecuteDeleteAsync();
            await db.Semesters.Where(s => s.Id == _semesterId).ExecuteDeleteAsync();
            await db.AcademicYears.Where(y => y.Id == _yearId).ExecuteDeleteAsync();
            await db.Colleges.Where(c => c.Id == _collegeId).ExecuteDeleteAsync();
            await db.Universities.Where(u => u.Id == _universityId).ExecuteDeleteAsync();
        }
        catch
        {
            // Cleanup is best-effort — a leftover seeded row never invalidates a test verdict.
        }
    }

    public async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
    }
}

internal sealed class Night6SearchTestAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal const string Scheme = "Night6SearchTest";

    public Night6SearchTestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ISystemClock clock)
        : base(options, logger, encoder, clock) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Guid.TryParse(Request.Headers["X-Test-Student-Id"].FirstOrDefault(), out var studentId))
            return Task.FromResult(AuthenticateResult.NoResult());

        var identity = new ClaimsIdentity(Scheme);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, studentId.ToString()));
        identity.AddClaim(new Claim("sub", studentId.ToString()));
        identity.AddClaim(new Claim(ClaimTypes.Role, "student"));
        identity.AddClaim(new Claim("role", "student"));
        identity.AddClaim(new Claim("sid", Guid.Parse("33333333-3333-3333-3333-333333333333").ToString()));
        identity.AddClaim(new Claim("installation_id", "night6-search-test-installation"));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}
