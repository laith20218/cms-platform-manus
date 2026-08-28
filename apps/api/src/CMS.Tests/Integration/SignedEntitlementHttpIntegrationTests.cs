using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CMS.Application.Interfaces;
using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Questions;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Moq;

namespace CMS.Tests.Integration;

[Collection("SignedEntitlementHttp")]
public sealed class SignedEntitlementHttpIntegrationTests : IClassFixture<SignedEntitlementHttpFactory>
{
    private readonly SignedEntitlementHttpFactory _factory;

    public SignedEntitlementHttpIntegrationTests(SignedEntitlementHttpFactory factory) => _factory = factory;

    [Fact]
    public async Task Issue_WithAuthenticatedBoundStudent_ReturnsSignedEntitlement()
    {
        var response = await _factory.Client.SendAsync(_factory.EntitlementRequest("issue"));

        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var payload = await response.Content.ReadFromJsonAsync<EntitlementResponse>();
        payload!.Token.Should().Contain(".");
    }

    [Fact]
    public async Task Renew_WithAuthenticatedBoundStudent_ReturnsSignedEntitlement()
    {
        var response = await _factory.Client.SendAsync(_factory.EntitlementRequest("renew"));

        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var payload = await response.Content.ReadFromJsonAsync<EntitlementResponse>();
        payload!.Token.Should().Contain(".");
    }

    [Fact]
    public async Task ProtectedQuestion_MissingEntitlement_ReturnsUnauthorizedBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var response = await _factory.Client.SendAsync(_factory.QuestionRequest(entitlement: null, SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedQuestion_ExpiredEntitlement_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var expired = _factory.CreateSignedToken(
            SignedEntitlementHttpFactory.InstallationA,
            new[] { _factory.SubjectId },
            DateTime.UtcNow.AddMinutes(-30),
            DateTime.UtcNow.AddMinutes(-1));

        var response = await _factory.Client.SendAsync(_factory.QuestionRequest(expired, SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden, await response.Content.ReadAsStringAsync());
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedQuestion_TamperedEntitlement_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var token = _factory.CreateSignedToken(
            SignedEntitlementHttpFactory.InstallationA,
            new[] { _factory.SubjectId },
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(10));
        var separator = token.IndexOf('.', StringComparison.Ordinal);
        var tampered = (token[0] == 'A' ? "B" : "A") + token[1..separator] + token[separator..];

        var response = await _factory.Client.SendAsync(_factory.QuestionRequest(tampered, SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden, await response.Content.ReadAsStringAsync());
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedQuestion_EntitlementForDifferentDevice_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var token = _factory.CreateSignedToken(
            SignedEntitlementHttpFactory.InstallationA,
            new[] { _factory.SubjectId },
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(10));

        var response = await _factory.Client.SendAsync(_factory.QuestionRequest(token, SignedEntitlementHttpFactory.InstallationB));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden, await response.Content.ReadAsStringAsync());
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedQuestion_EntitlementOutsideSubjectScope_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var token = _factory.CreateSignedToken(
            SignedEntitlementHttpFactory.InstallationA,
            new[] { Guid.NewGuid() },
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(10));

        var response = await _factory.Client.SendAsync(_factory.QuestionRequest(token, SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden, await response.Content.ReadAsStringAsync());
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedQuestions_ForLectureWithoutSubjectId_DerivesScopeBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var token = _factory.CreateSignedToken(
            SignedEntitlementHttpFactory.InstallationA,
            new[] { _factory.SubjectId },
            DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(10));
        _factory.Mediator
            .Setup(sender => sender.Send(
                It.Is<GetQuestionsQuery>(query => query.SubjectId == _factory.SubjectId && query.LectureId == _factory.LectureId),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PagedResult<QuestionListItemDto>(new List<QuestionListItemDto>(), 0, 1, 20, 0));

        var response = await _factory.Client.SendAsync(_factory.LectureQuestionsRequest(token));

        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        _factory.Mediator.Invocations.Should().ContainSingle();
    }

    [Fact]
    public async Task ProtectedExam_MissingEntitlement_ReturnsUnauthorizedBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var response = await _factory.Client.SendAsync(_factory.ExamRequest(entitlement: null, SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedExam_ExpiredEntitlement_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var expired = _factory.CreateSignedToken(SignedEntitlementHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-30), DateTime.UtcNow.AddMinutes(-1));
        var response = await _factory.Client.SendAsync(_factory.ExamRequest(expired, SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedExam_TamperedEntitlement_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var token = _factory.CreateSignedToken(SignedEntitlementHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var response = await _factory.Client.SendAsync(_factory.ExamRequest("A" + token[1..], SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedExam_EntitlementForDifferentDevice_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var token = _factory.CreateSignedToken(SignedEntitlementHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var response = await _factory.Client.SendAsync(_factory.ExamRequest(token, SignedEntitlementHttpFactory.InstallationB));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedExam_EntitlementOutsideSubjectScope_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var token = _factory.CreateSignedToken(SignedEntitlementHttpFactory.InstallationA, new[] { Guid.NewGuid() }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var response = await _factory.Client.SendAsync(_factory.ExamRequest(token, SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedLecture_MissingEntitlement_ReturnsUnauthorizedBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var response = await _factory.Client.SendAsync(_factory.LectureRequest(entitlement: null, SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ProtectedLecture_EntitlementOutsideSubjectScope_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var token = _factory.CreateSignedToken(SignedEntitlementHttpFactory.InstallationA, new[] { Guid.NewGuid() }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var response = await _factory.Client.SendAsync(_factory.LectureRequest(token, SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task Admin_OutsideQuestionScope_ReturnsForbiddenBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var response = await _factory.Client.SendAsync(_factory.AdminDeleteQuestionRequest(_factory.OutOfScopeQuestionId));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        _factory.Mediator.Invocations.Should().BeEmpty();
    }

    [Fact]
    public async Task ExamResult_OtherStudentsSession_ReturnsNotFoundBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var valid = _factory.CreateSignedToken(SignedEntitlementHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var response = await _factory.Client.SendAsync(_factory.ExamResultRequest(_factory.OtherStudentSessionId, valid));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        _factory.Mediator.Invocations.Should().BeEmpty();
        (await response.Content.ReadAsStringAsync()).Should().NotContain(_factory.OtherStudentSessionId.ToString());
    }

    [Fact]
    public async Task ExamSessionSave_OtherStudentsSession_ReturnsNotFoundBeforeHandler()
    {
        _factory.Mediator.Invocations.Clear();
        var valid = _factory.CreateSignedToken(SignedEntitlementHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var response = await _factory.Client.SendAsync(_factory.ExamSaveRequest(_factory.OtherStudentSessionId, Guid.NewGuid(), valid));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        _factory.Mediator.Invocations.Should().BeEmpty();
        (await response.Content.ReadAsStringAsync()).Should().NotContain(_factory.OtherStudentSessionId.ToString());
    }

    private sealed record EntitlementResponse(string Token);
}

[CollectionDefinition("SignedEntitlementHttp", DisableParallelization = true)]
public sealed class SignedEntitlementHttpCollection;

public sealed class SignedEntitlementHttpFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    internal const string InstallationA = "phase35-http-installation-a";
    internal const string InstallationB = "phase35-http-installation-b";
    private const string JwtSigningKey = "phase35-http-jwt-signing-key-with-32-bytes";
    private const string EntitlementSigningKey = "phase35-http-entitlement-signing-key-32-bytes";
    private const string Issuer = "cms-phase35-http-tests";
    private const string Audience = "cms-phase35-http-tests";
    private readonly string _databaseName = $"cms-phase35-http-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection()
        .AddEntityFrameworkInMemoryDatabase()
        .BuildServiceProvider();
    private readonly Dictionary<string, string?> _originalEnvironment = new();

    public SignedEntitlementHttpFactory()
    {
        SetTestEnvironment("Jwt__Secret", JwtSigningKey);
        SetTestEnvironment("Jwt__Issuer", Issuer);
        SetTestEnvironment("Jwt__Audience", Audience);
        SetTestEnvironment("Jwt__AccessTokenExpiryMinutes", "15");
        SetTestEnvironment("Security__Entitlements__SigningKey", EntitlementSigningKey);
        SetTestEnvironment("Security__Entitlements__LifetimeMinutes", "20");
        SetTestEnvironment("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Port=5432;Database=cms_http_test;Username=postgres;Password=not-used");
        SetTestEnvironment("ConnectionStrings__Redis", "localhost:6379");
    }

    internal Mock<ISender> Mediator { get; } = new(MockBehavior.Strict);
    internal HttpClient Client { get; private set; } = null!;
    internal Guid StudentId { get; private set; }
    internal Guid SubjectId { get; private set; }
    internal Guid ExamId { get; private set; }
    internal Guid LectureId { get; private set; }
    internal Guid OtherStudentSessionId { get; private set; }
    internal Guid AdminId { get; private set; }
    internal Guid OutOfScopeQuestionId { get; private set; }
    internal Guid FavoriteQuestionId { get; private set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:Secret", JwtSigningKey);
        builder.UseSetting("Jwt:Issuer", Issuer);
        builder.UseSetting("Jwt:Audience", Audience);
        builder.UseSetting("Security:Entitlements:SigningKey", EntitlementSigningKey);
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = Issuer,
            ["Jwt:Audience"] = Audience,
            ["Jwt:AccessTokenExpiryMinutes"] = "15",
            ["Security:Entitlements:SigningKey"] = EntitlementSigningKey,
            ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Port=5432;Database=cms_http_test;Username=postgres;Password=not-used",
            ["ConnectionStrings:Redis"] = "localhost:6379"
        }));
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<ApplicationDbContext>();
            services.RemoveAll<IApplicationDbContext>();
            services.AddDbContext<ApplicationDbContext>(options => options
                .UseInMemoryDatabase(_databaseName)
                .UseInternalServiceProvider(_inMemoryEfServices));
            services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());

            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = Phase35TestAuthenticationHandler.Scheme;
                options.DefaultChallengeScheme = Phase35TestAuthenticationHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, Phase35TestAuthenticationHandler>(Phase35TestAuthenticationHandler.Scheme, _ => { });

            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                options.Events ??= new JwtBearerEvents();
                var existingFailed = options.Events.OnAuthenticationFailed;
                options.Events.OnAuthenticationFailed = context =>
                {
                    Console.WriteLine($"HTTP_TEST_JWT_FAILURE: {context.Exception.Message}");
                    return existingFailed?.Invoke(context) ?? Task.CompletedTask;
                };
            });

            services.RemoveAll<ISessionService>();
            services.AddScoped<ISessionService>(_ => SessionService());
            services.RemoveAll<ISender>();
            services.AddScoped<ISender>(_ => Mediator.Object);
            services.RemoveAll<ICacheService>();
            var cache = new Mock<ICacheService>();
            cache.Setup(service => service.GetAsync<bool?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((bool?)null);
            cache.Setup(service => service.GetAsync<AdminScope?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((AdminScope?)null);
            cache.Setup(service => service.SetAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(service => service.SetAsync(It.IsAny<string>(), It.IsAny<AdminScope>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            services.AddScoped<ICacheService>(_ => cache.Object);
        });
    }

    public async Task InitializeAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var university = University.Create("جامعة اختبار", "test-university", "Test University");
        var college = College.Create(university.Id, "كلية اختبار", "test-college", "Test College");
        var year = AcademicYear.Create(college.Id, "السنة الأولى", "year-one", 1);
        var semester = Semester.Create(year.Id, "الفصل الأول", "semester-one", 1);
        var subject = Subject.Create(semester.Id, "مادة اختبار", "test-subject", "Test Subject");
        var student = Student.Create("0990001234", "not-used-by-http-test", "طالب HTTP");
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();

        var lecture = Lecture.Create(subject.Id, "محاضرة HTTP", "http-lecture", 1);
        lecture.Publish();
        var favoriteQuestion = Question.Create("سؤال مفضلة HTTP", QuestionType.Mcq, subject.Id, lecture.Id, Difficulty.Easy, null, createdBy: Guid.NewGuid());
        favoriteQuestion.AddOption("خيار صحيح", true);
        favoriteQuestion.AddOption("خيار خاطئ", false);
        favoriteQuestion.UpdateExplanation("تفسير اختبار مفضلة");
        favoriteQuestion.Publish();
        var exam = Exam.Create(subject.Id, "اختبار HTTP", "http-exam", 1, student.Id);
        exam.Publish();
        var otherStudent = Student.Create("0990004321", "not-used-by-http-test", "طالب آخر HTTP");
        otherStudent.SetAcademicInfo(university.Id, college.Id, year.Id);
        otherStudent.VerifyPhone();
        var outOfScopeUniversity = University.Create("جامعة خارج النطاق", "out-of-scope-university", "Out of Scope University");
        var outOfScopeCollege = College.Create(outOfScopeUniversity.Id, "كلية خارج النطاق", "out-of-scope-college", "Out of Scope College");
        var outOfScopeYear = AcademicYear.Create(outOfScopeCollege.Id, "السنة الثانية", "out-of-scope-year", 2);
        var outOfScopeSemester = Semester.Create(outOfScopeYear.Id, "الفصل الثاني", "out-of-scope-semester", 2);
        var outOfScopeSubject = Subject.Create(outOfScopeSemester.Id, "مادة خارج النطاق", "out-of-scope-subject", "Out of Scope Subject");
        var adminRole = AdminRole.Create("scoped_question_admin", "مدير أسئلة مقيّد");
        adminRole.Permissions.Add(AdminPermission.Create(adminRole.Id, Resources.Questions, "[\"delete\"]", "scoped"));
        var admin = Admin.Create("phase42-admin@cms.test", "not-used", "مدير اختبار HTTP", adminRole.Id);
        admin.SetScope(null, college.Id, null, null);
        var outOfScopeQuestion = Question.Create("سؤال خارج النطاق", QuestionType.Mcq, outOfScopeSubject.Id, null, Difficulty.Easy, null, admin.Id);
        outOfScopeQuestion.AddOption("خيار صحيح", true);
        outOfScopeQuestion.AddOption("خيار خاطئ", false);
        outOfScopeQuestion.UpdateExplanation("تفسير اختبار");
        outOfScopeQuestion.Publish();

        var otherStudentSession = new ExamSession
        {
            StudentId = otherStudent.Id,
            ExamId = exam.Id,
            Status = ExamSessionStatus.Completed,
            CompletedAt = DateTime.UtcNow,
            TotalQuestions = 0,
            Score = 100
        };

        db.AddRange(university, college, year, semester, subject, student, lecture, favoriteQuestion, exam, otherStudent, otherStudentSession,
            outOfScopeUniversity, outOfScopeCollege, outOfScopeYear, outOfScopeSemester, outOfScopeSubject, outOfScopeQuestion, adminRole, admin);
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student.Id, DeviceFingerprint = InstallationA, IsActive = true });
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = student.Id,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subject.Id,
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await db.SaveChangesAsync();
        StudentId = student.Id;
        SubjectId = subject.Id;
        ExamId = exam.Id;
        LectureId = lecture.Id;
        OtherStudentSessionId = otherStudentSession.Id;
        AdminId = admin.Id;
        OutOfScopeQuestionId = outOfScopeQuestion.Id;
        FavoriteQuestionId = favoriteQuestion.Id;
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
        foreach (var (key, value) in _originalEnvironment)
            Environment.SetEnvironmentVariable(key, value);
    }

    internal HttpRequestMessage EntitlementRequest(string action)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/entitlements/{action}");
        AddAuthentication(request, InstallationA);
        return request;
    }

    internal HttpRequestMessage QuestionRequest(string? entitlement, string installationId)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/questions?subjectId={SubjectId}");
        AddAuthentication(request, InstallationA);
        request.Headers.Remove("X-Installation-Id");
        request.Headers.TryAddWithoutValidation("X-Installation-Id", installationId);
        if (!string.IsNullOrWhiteSpace(entitlement)) request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    internal HttpRequestMessage LectureQuestionsRequest(string entitlement)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/questions?lectureId={LectureId}");
        AddAuthentication(request, InstallationA);
        request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    internal HttpRequestMessage ExamRequest(string? entitlement, string installationId)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/exams/{ExamId}");
        AddAuthentication(request, installationId);
        request.Headers.Remove("X-Installation-Id");
        request.Headers.TryAddWithoutValidation("X-Installation-Id", installationId);
        if (!string.IsNullOrWhiteSpace(entitlement)) request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    internal HttpRequestMessage AdminDeleteQuestionRequest(Guid questionId)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, $"/api/v1/questions/{questionId}");
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", AdminId.ToString());
        return request;
    }

    internal HttpRequestMessage LectureRequest(string? entitlement, string installationId)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/lectures/{LectureId}");
        AddAuthentication(request, installationId);
        request.Headers.Remove("X-Installation-Id");
        request.Headers.TryAddWithoutValidation("X-Installation-Id", installationId);
        if (!string.IsNullOrWhiteSpace(entitlement)) request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    internal HttpRequestMessage ExamResultRequest(Guid sessionId, string entitlement)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/exams/sessions/{sessionId}/results");
        AddAuthentication(request, InstallationA);
        request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    internal HttpRequestMessage ExamSaveRequest(Guid sessionId, Guid sessionQuestionId, string entitlement)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/exams/sessions/{sessionId}/questions/{sessionQuestionId}/answer")
        {
            Content = JsonContent.Create(new { questionId = sessionQuestionId, answer = (string?)null, currentQuestionOrder = 0 })
        };
        AddAuthentication(request, InstallationA);
        request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    internal HttpRequestMessage FavoriteRequest(HttpMethod method, string? entitlement, Guid? questionId = null)
    {
        var path = method == HttpMethod.Delete && questionId.HasValue
            ? $"/api/v1/favorites/{questionId.Value}"
            : "/api/v1/favorites";
        var request = new HttpRequestMessage(method, path);
        AddAuthentication(request, InstallationA);
        if (!string.IsNullOrWhiteSpace(entitlement)) request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    internal string CreateSignedToken(string deviceId, IReadOnlyList<Guid> subjects, DateTime issuedAt, DateTime expiresAt)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            userId = StudentId,
            deviceId,
            universityId = (Guid?)null,
            collegeId = (Guid?)null,
            allowedYears = Array.Empty<Guid>(),
            allowedSemesters = Array.Empty<Guid>(),
            allowedSubjects = subjects,
            issuedAt,
            expiresAt,
            version = 1
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(EntitlementSigningKey));
        return $"{Base64Url(payload)}.{Base64Url(hmac.ComputeHash(payload))}";
    }

    private void AddAuthentication(HttpRequestMessage request, string installationId)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, StudentId.ToString()),
            new Claim(ClaimTypes.Role, "student"),
            new Claim("sid", Guid.NewGuid().ToString()),
            new Claim("installation_id", installationId),
            new Claim("tv", "0")
        };
        var token = new JwtSecurityToken(
            Issuer,
            Audience,
            claims,
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSigningKey)), SecurityAlgorithms.HmacSha256));
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", StudentId.ToString());
        request.Headers.TryAddWithoutValidation("X-Installation-Id", InstallationA);
    }

    private static ISessionService SessionService()
    {
        var session = new Mock<ISessionService>();
        session.Setup(service => service.IsActiveAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return session.Object;
    }

    private void SetTestEnvironment(string key, string value)
    {
        _originalEnvironment[key] = Environment.GetEnvironmentVariable(key);
        Environment.SetEnvironmentVariable(key, value);
    }

    private static string Base64Url(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

internal sealed class Phase35TestAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal new const string Scheme = "Phase35Test";

    public Phase35TestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ISystemClock clock)
        : base(options, logger, encoder, clock) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var adminHeader = Request.Headers["X-Test-Admin-Id"].FirstOrDefault();
        var isAdmin = Guid.TryParse(adminHeader, out var adminId);
        if (!isAdmin && !Guid.TryParse(Request.Headers["X-Test-Student-Id"].FirstOrDefault(), out _))
            return Task.FromResult(AuthenticateResult.NoResult());

        var userId = isAdmin ? adminId : Guid.Parse(Request.Headers["X-Test-Student-Id"].First());
        var identity = new ClaimsIdentity(Scheme);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, userId.ToString()));
        identity.AddClaim(new Claim("sub", userId.ToString()));
        identity.AddClaim(new Claim(ClaimTypes.Role, isAdmin ? "admin" : "student"));
        identity.AddClaim(new Claim("sid", Guid.Parse("11111111-1111-1111-1111-111111111111").ToString()));
        identity.AddClaim(new Claim("installation_id", Request.Headers["X-Installation-Id"].FirstOrDefault() ?? SignedEntitlementHttpFactory.InstallationA));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}
