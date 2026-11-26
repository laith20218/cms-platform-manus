using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using CMS.Application.Interfaces;
using CMS.Domain.Common;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.ValueObjects;
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

namespace CMS.Tests.Integration;

/// <summary>
/// PR-4 — READ-ONLY HTTP integration coverage for the Question Bank + Universal
/// Preview backend contracts on /api/v1/admin/questions (mutations live in
/// <see cref="AdminQuestionsBulkTagPR4Tests"/> so test order can never matter):
///  • list filters (tags, author, created/updated ranges) + allowlisted sort/order
///  • facets (authors + tags) — scoped exactly like the list
///  • CSV export — real authorized backend contract (super_admin 200, scoped role
///    admin without questions:export 403), RFC 4180 output, filters applied
///  • preview superset (explanation, correct answer, وصل payload)
///  • exam preview extension feeding the SAME universal renderer
/// </summary>
[Collection("PR4QuestionBank")]
public sealed class AdminQuestionsBankPR4Tests : IClassFixture<QuestionBankPR4Factory>
{
    private readonly QuestionBankPR4Factory _factory;

    public AdminQuestionsBankPR4Tests(QuestionBankPR4Factory factory) => _factory = factory;

    // ===== List: PR-4 filters =====

    [Fact]
    public async Task List_TagsFilter_ReturnsOnlyQuestionsCarryingAnyRequestedTag()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}&tags=cardiology";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await ReadPageAsync(response);
        page.total.Should().Be(2); // q1 + q2 carry cardiology
        page.items.Should().OnlyContain(item => item.GetProperty("tags").EnumerateArray().Any(t => t.GetString() == "cardiology"));
    }

    [Fact]
    public async Task List_TagsFilter_AcceptsCommaSeparatedValues()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}&tags=cardiology,quiz";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await ReadPageAsync(response);
        page.total.Should().Be(3); // q1 (cardiology) + q2 (cardiology) + q3 (quiz)
    }

    [Fact]
    public async Task List_AuthorFilter_ReturnsOnlyThatAuthorsQuestions()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}&authorId={_factory.ScopedAdminId}";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await ReadPageAsync(response);
        page.items.Should().OnlyContain(item => item.GetProperty("authorId").GetString() == _factory.ScopedAdminId.ToString());
        page.total.Should().Be(3); // q2 + q3 + qT2 by the scoped admin in subject A
    }

    [Fact]
    public async Task List_CreatedRange_FiltersByCreatedAt()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}&createdFrom={Uri.EscapeDataString("2025-06-03T00:00:00Z")}";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await ReadPageAsync(response);
        page.total.Should().Be(2); // q2 (June 3) + q3 (June 5) — the May bulk-tag fixtures predate the range
    }

    [Fact]
    public async Task List_UpdatedRange_FiltersByUpdatedAt()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}&updatedTo={Uri.EscapeDataString("2025-05-15T00:00:00Z")}";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await ReadPageAsync(response);
        page.total.Should().Be(3); // qT1 + qT2 + qT3 (May 1–3)
    }

    [Fact]
    public async Task List_ListItem_CarriesAuthorId()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        var page = await ReadPageAsync(response);
        page.items.Should().Contain(item => item.GetProperty("authorId").GetString() == _factory.SuperAdminId.ToString());
    }

    // ===== List: allowlisted sort =====

    [Fact]
    public async Task List_UnknownSort_Returns400()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}&sort=correctRate";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task List_UnknownOrder_Returns400()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}&order=random";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task List_SortByCreatedAtAscending_OrdersOldestFirst()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}&sort=createdAt&order=asc";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await ReadPageAsync(response);
        var createdAtList = page.items.Select(item => DateTime.Parse(item.GetProperty("createdAt").GetString()!)).ToList();
        createdAtList.Should().BeInAscendingOrder();
        page.items.First().GetProperty("id").GetString().Should().Be(_factory.QTag1Id.ToString()); // May 1 is the oldest
    }

    [Fact]
    public async Task List_DefaultSort_RemainsUpdatedAtDescending()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        var page = await ReadPageAsync(response);
        var updatedAtList = page.items.Select(item => DateTime.Parse(item.GetProperty("updatedAt").GetString()!)).ToList();
        updatedAtList.Should().BeInDescendingOrder();
    }

    [Fact]
    public async Task List_ScopedRoleAdmin_CanReadOwnSubject()
    {
        var uri = $"/api/v1/admin/questions?subjectId={_factory.SubjectAId}";
        var request = _factory.RoleAdminRequest(HttpMethod.Get, uri);
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ===== Facets =====

    [Fact]
    public async Task Facets_ReturnsDistinctAuthorsAndTags()
    {
        var uri = $"/api/v1/admin/questions/facets?subjectId={_factory.SubjectAId}";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var facets = await response.Content.ReadFromJsonAsync<JsonElement>();
        var authors = facets.GetProperty("authors").EnumerateArray().ToList();
        var tags = facets.GetProperty("tags").EnumerateArray().Select(t => t.GetString()).ToList();

        authors.Should().HaveCount(2);
        authors.Should().Contain(a => a.GetProperty("id").GetString() == _factory.ScopedAdminId.ToString());
        authors.Should().Contain(a => a.GetProperty("id").GetString() == _factory.SuperAdminId.ToString());
        tags.Should().Contain("cardiology").And.Contain("quiz");
    }

    [Fact]
    public async Task Facets_WithoutSubjectId_Returns400()
    {
        var response = await SendSuperAdminAsync(HttpMethod.Get, "/api/v1/admin/questions/facets");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Facets_ScopedRoleAdmin_CanReadFacets()
    {
        var uri = $"/api/v1/admin/questions/facets?subjectId={_factory.SubjectAId}";
        var request = _factory.RoleAdminRequest(HttpMethod.Get, uri);
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ===== Export (authorized CSV contract) =====

    [Fact]
    public async Task Export_AsSuperAdmin_ReturnsRfc4180CsvWithBomAndAllSubjectRows()
    {
        var uri = $"/api/v1/admin/questions/export?subjectId={_factory.SubjectAId}";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.ToString().Should().StartWith("text/csv");
        response.Content.Headers.ContentDisposition!.DispositionType.Should().Be("attachment");

        // ReadAsStringAsync silently strips the UTF-8 BOM while decoding — assert the
        // BOM on RAW BYTES because that is what a real browser download receives.
        var bytes = await response.Content.ReadAsByteArrayAsync();
        bytes.Should().HaveCountGreaterThan(3);
        bytes[0].Should().Be((byte)0xEF);
        bytes[1].Should().Be((byte)0xBB);
        bytes[2].Should().Be((byte)0xBF);

        var csv = await response.Content.ReadAsStringAsync();
        csv.Should().Contain("id,text,type,difficulty,status,lecture,tags,paragraph_tag");
        var dataRows = csv.Split('\n').Count(line => line.Trim().Length > 0) - 1; // minus header
        dataRows.Should().Be(6); // q1 + q2 + q3 + qT1 + qT2 + qT3
    }

    [Fact]
    public async Task Export_AsScopedRoleAdminWithoutExportPermission_Returns403()
    {
        var uri = $"/api/v1/admin/questions/export?subjectId={_factory.SubjectAId}";
        var request = _factory.RoleAdminRequest(HttpMethod.Get, uri);
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Export_AppliesTagFilter()
    {
        var uri = $"/api/v1/admin/questions/export?subjectId={_factory.SubjectAId}&tags=quiz";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        var csv = await response.Content.ReadAsStringAsync();
        csv.Should().Contain(_factory.Q3Id.ToString());
        csv.Should().NotContain(_factory.Q1Id.ToString());
        csv.Should().NotContain(_factory.Q2Id.ToString());
    }

    [Fact]
    public async Task Export_WithoutSubject_Returns400()
    {
        var response = await SendSuperAdminAsync(HttpMethod.Get, "/api/v1/admin/questions/export");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Export_EscapesQuotesAndCommasInQuestionText()
    {
        var uri = $"/api/v1/admin/questions/export?subjectId={_factory.SubjectAId}";
        var response = await SendSuperAdminAsync(HttpMethod.Get, uri);

        var csv = await response.Content.ReadAsStringAsync();
        // q2's TEXT carries a comma and quotes → RFC 4180 quoted cell with doubled quotes.
        csv.Should().Contain("\"Q2TEXT سؤال \"\"مقالي\"\", بفاصلة\"");
    }

    // ===== Preview superset =====

    [Fact]
    public async Task Preview_McqCarriesCorrectOptionAndExplanation()
    {
        var response = await SendSuperAdminAsync(HttpMethod.Get, $"/api/v1/admin/questions/{_factory.Q1Id}/preview");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        preview.GetProperty("explanation").GetString().Should().Be("شرح السؤال الأول");
        preview.GetProperty("correctOptionId").GetString().Should().NotBeNullOrEmpty();
        preview.GetProperty("correctOptionLetter").GetString().Should().Be("A");
        preview.GetProperty("status").GetString().Should().Be("Draft");
        preview.GetProperty("options").EnumerateArray()
            .Should().Contain(o => o.GetProperty("isCorrect").GetBoolean());
    }

    [Fact]
    public async Task Preview_EssayCarriesModelAnswerText()
    {
        var response = await SendSuperAdminAsync(HttpMethod.Get, $"/api/v1/admin/questions/{_factory.Q2Id}/preview");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        preview.GetProperty("correctAnswerText").GetString().Should().Be("essay model, answer");
        preview.GetProperty("correctOptionId").GetString().Should().BeNull();
        preview.GetProperty("type").GetString().Should().Be("Essay");
    }

    [Fact]
    public async Task Preview_MatchingCarriesFullPayload()
    {
        var response = await SendSuperAdminAsync(HttpMethod.Get, $"/api/v1/admin/questions/{_factory.Q3Id}/preview");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var preview = await response.Content.ReadFromJsonAsync<JsonElement>();
        var matching = preview.GetProperty("matching");
        matching.GetProperty("prompts").EnumerateArray().Count().Should().Be(2);
        matching.GetProperty("targets").EnumerateArray().Count().Should().Be(2);
        matching.GetProperty("pairs").EnumerateArray().Count().Should().Be(2);
    }

    [Fact]
    public async Task Preview_UnknownQuestion_Returns404()
    {
        var response = await SendSuperAdminAsync(HttpMethod.Get, $"/api/v1/admin/questions/{Guid.NewGuid()}/preview");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Preview_ScopedRoleAdmin_CannotReadOutOfScopeQuestion()
    {
        var request = _factory.RoleAdminRequest(HttpMethod.Get, $"/api/v1/admin/questions/{_factory.Q4OutOfScopeId}/preview");
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ===== Exam preview extension (universal renderer contract) =====

    [Fact]
    public async Task ExamPreview_QuestionsCarryExplanationAndCorrectness()
    {
        var response = await SendSuperAdminAsync(HttpMethod.Get, $"/api/v1/admin/exams/{_factory.ExamId}/preview");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var exam = await response.Content.ReadFromJsonAsync<JsonElement>();
        var questions = exam.GetProperty("questions").EnumerateArray().ToList();
        questions.Should().HaveCount(2);
        var mcq = questions.First(q => q.GetProperty("type").GetString() == "Mcq");
        mcq.GetProperty("explanation").GetString().Should().Be("شرح السؤال الأول");
        mcq.GetProperty("correctOptionId").GetString().Should().NotBeNullOrEmpty();
        mcq.GetProperty("options").EnumerateArray()
            .Should().Contain(o => o.GetProperty("isCorrect").GetBoolean());
        var essay = questions.First(q => q.GetProperty("type").GetString() == "Essay");
        essay.GetProperty("correctAnswerText").GetString().Should().Be("essay model, answer");
    }

    // ===== helpers =====

    private async Task<HttpResponseMessage> SendSuperAdminAsync(HttpMethod method, string uri)
    {
        var request = _factory.SuperAdminRequest(method, uri);
        return await _factory.Client.SendAsync(request);
    }

    private static async Task<(List<JsonElement> items, int total)> ReadPageAsync(HttpResponseMessage response)
    {
        var page = await response.Content.ReadFromJsonAsync<JsonElement>();
        return (page.GetProperty("items").EnumerateArray().ToList(), page.GetProperty("total").GetInt32());
    }
}

/// <summary>
/// PR-4 — MUTATING bulk-tag tests, isolated in their own class so each class gets
/// a fresh factory (fresh InMemory DB) and read-only assertions elsewhere can
/// never observe this class's mutations. Within the class, every test operates on
/// dedicated fixture questions so xUnit's non-deterministic order is harmless.
/// </summary>
[Collection("PR4QuestionBank")]
public sealed class AdminQuestionsBulkTagPR4Tests : IClassFixture<QuestionBankPR4Factory>
{
    private readonly QuestionBankPR4Factory _factory;

    public AdminQuestionsBulkTagPR4Tests(QuestionBankPR4Factory factory) => _factory = factory;

    [Fact]
    public async Task BulkTag_MergesAndRemovesTags()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Post, "/api/v1/admin/questions/bulk-tag");
        request.Content = JsonContent.Create(new { ids = new[] { _factory.QTag1Id, _factory.QTag2Id }, addTags = new[] { "reviewed", " anatomy " }, removeTags = new[] { "bulk-a", "bulk-b" } });
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        result.GetProperty("succeeded").GetInt32().Should().Be(2);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var qT1 = await db.Questions.AsNoTracking().FirstAsync(q => q.Id == _factory.QTag1Id);
        var qT2 = await db.Questions.AsNoTracking().FirstAsync(q => q.Id == _factory.QTag2Id);
        qT1.Tags.Should().BeEquivalentTo(new[] { "reviewed", "anatomy" }); // bulk-a removed, anatomy trimmed+added
        qT2.Tags.Should().BeEquivalentTo(new[] { "reviewed", "anatomy" }); // bulk-b removed
    }

    [Fact]
    public async Task BulkTag_ScopedAdmin_SkipsOutOfScopeQuestions()
    {
        var request = _factory.RoleAdminRequest(HttpMethod.Post, "/api/v1/admin/questions/bulk-tag");
        request.Content = JsonContent.Create(new { ids = new[] { _factory.QTag3Id, _factory.Q4OutOfScopeId }, addTags = new[] { "scoped" } });
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        result.GetProperty("requested").GetInt32().Should().Be(2);
        result.GetProperty("succeeded").GetInt32().Should().Be(1); // qT3 in scope; q4 belongs to subject B
        result.GetProperty("skipped").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task BulkTag_WithoutTags_Returns400()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Post, "/api/v1/admin/questions/bulk-tag");
        request.Content = JsonContent.Create(new { ids = new[] { _factory.QTag1Id } });
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task BulkTag_OverLimit_Returns400()
    {
        var ids = Enumerable.Range(0, 101).Select(_ => Guid.NewGuid()).ToList();
        var request = _factory.SuperAdminRequest(HttpMethod.Post, "/api/v1/admin/questions/bulk-tag");
        request.Content = JsonContent.Create(new { ids, addTags = new[] { "x" } });
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task BulkTag_RejectsOversizedTag()
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Post, "/api/v1/admin/questions/bulk-tag");
        request.Content = JsonContent.Create(new { ids = new[] { _factory.QTag1Id }, addTags = new[] { new string('a', 51) } });
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest); // DomainException → 400 via middleware
    }

    [Fact]
    public async Task BulkTag_ReportedNotNotFoundIds()
    {
        var ghost = Guid.NewGuid();
        var request = _factory.SuperAdminRequest(HttpMethod.Post, "/api/v1/admin/questions/bulk-tag");
        request.Content = JsonContent.Create(new { ids = new[] { _factory.QTag2Id, ghost }, addTags = new[] { "found" } });
        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        result.GetProperty("notFoundIds").EnumerateArray().Select(v => v.GetString())
            .Should().BeEquivalentTo(new[] { ghost.ToString() });
    }
}

// ===== PR-4 factory: InMemory EF + role-aware test auth =====
public sealed class QuestionBankPR4Factory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private const string JwtSigningKey = "pr4-question-bank-test-jwt-key-32-bytes!";
    private readonly string _databaseName = $"pr4-question-bank-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection()
        .AddEntityFrameworkInMemoryDatabase()
        .BuildServiceProvider();

    internal HttpClient Client { get; private set; } = null!;
    internal Guid SubjectAId { get; private set; }
    internal Guid SubjectBId { get; private set; }
    internal Guid SuperAdminId { get; private set; }
    internal Guid ScopedAdminId { get; private set; }
    internal Guid Q1Id { get; private set; }
    internal Guid Q2Id { get; private set; }
    internal Guid Q3Id { get; private set; }
    internal Guid Q4OutOfScopeId { get; private set; }
    internal Guid QTag1Id { get; private set; }
    internal Guid QTag2Id { get; private set; }
    internal Guid QTag3Id { get; private set; }
    internal Guid ExamId { get; private set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Environment.SetEnvironmentVariable("Jwt__Secret", JwtSigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "pr4-question-bank");
        Environment.SetEnvironmentVariable("Jwt__Audience", "pr4-question-bank");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Port=5432;Database=cms_pr4_test;Username=postgres;Password=not-used");
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "pr4-entitlement-key-32-bytes-abcdefgh!");

        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = "pr4-question-bank",
            ["Jwt:Audience"] = "pr4-question-bank",
            ["Jwt:AccessTokenExpiryMinutes"] = "15",
            ["Security:Entitlements:SigningKey"] = "pr4-entitlement-key-32-bytes-abcdefgh!",
            ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Port=5432;Database=cms_pr4_test;Username=postgres;Password=not-used",
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
            services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());

            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = PR4TestAuthHandler.Scheme;
                options.DefaultChallengeScheme = PR4TestAuthHandler.Scheme;
                options.DefaultForbidScheme = PR4TestAuthHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, PR4TestAuthHandler>(PR4TestAuthHandler.Scheme, _ => { });

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
            sessionMock.Setup(s => s.IsActiveAsync(It.IsAny<Guid>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync(true);
            services.AddScoped<ISessionService>(_ => sessionMock.Object);

            services.RemoveAll<ICacheService>();
            var cache = new Mock<ICacheService>();
            cache.Setup(c => c.GetAsync<bool?>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((bool?)null);
            cache.Setup(c => c.GetAsync<AdminScope>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((AdminScope?)null);
            cache.Setup(c => c.SetAsync(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(c => c.SetAsync(It.IsAny<string>(), It.IsAny<AdminScope>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            cache.Setup(c => c.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            services.AddScoped<ICacheService>(_ => cache.Object);

            services.RemoveAll<ISecurityAuditWriter>();
            var auditMock = new Mock<ISecurityAuditWriter>();
            auditMock.Setup(a => a.LogSecurityEventAsync(
                It.IsAny<Guid?>(), It.IsAny<Guid?>(),
                It.IsAny<SecurityEventType>(), It.IsAny<SecuritySeverity>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<CancellationToken>()))
                .Returns(Task.CompletedTask);
            services.AddScoped<ISecurityAuditWriter>(_ => auditMock.Object);
        });
    }

    public async Task InitializeAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var university = University.Create("جامعة PR4", "pr4-uni", "PR4 University");
        var college = College.Create(university.Id, "كلية PR4", "pr4-college", "PR4 College");
        var year = AcademicYear.Create(college.Id, "سنة PR4", "pr4-year", 1);
        var semester = Semester.Create(year.Id, "فصل PR4", "pr4-semester", 1);
        var subjectA = Subject.Create(semester.Id, "مادة A", "pr4-subject-a", "PR4 Subject A");
        var subjectB = Subject.Create(semester.Id, "مادة B", "pr4-subject-b", "PR4 Subject B");
        SubjectAId = subjectA.Id;
        SubjectBId = subjectB.Id;

        var superRole = AdminRole.Create("super_admin", "مدير عام");
        var editorRole = AdminRole.Create("editor", "محرر");
        editorRole.ReplacePermissions(new List<AdminPermission>
        {
            AdminPermission.Create(editorRole.Id, "questions", JsonSerializer.Serialize(new[] { "view", "create", "edit" }), "own"),
        });
        var superAdmin = Admin.Create("pr4-super@test.com", "not-used", "مدير PR4 العام", superRole.Id);
        var scopedAdmin = Admin.Create("pr4-editor@test.com", "not-used", "محرر PR4", editorRole.Id);
        scopedAdmin.SetScope(null, null, null, subjectA.Id); // subject-scoped editor
        SuperAdminId = superAdmin.Id;
        ScopedAdminId = scopedAdmin.Id;

        // q1 — MCQ by the super admin (tags cardiology+exam-2025).
        var q1 = Question.Create("Q1TEXT سؤال تشريح القلب", QuestionType.Mcq, subjectA.Id, null,
            Difficulty.Easy, new List<string> { "cardiology", "exam-2025" }, superAdmin.Id);
        q1.AddOption("الخيار الأول", true, "A");
        q1.AddOption("الخيار الثاني", false, "B");
        q1.UpdateExplanation("شرح السؤال الأول");
        SetTimestamps(q1, new DateTime(2025, 6, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2025, 6, 1, 0, 0, 0, DateTimeKind.Utc));
        Q1Id = q1.Id;

        // q2 — Essay by the scoped admin (TEXT carries CSV-hostile characters).
        var q2 = Question.Create("Q2TEXT سؤال \"مقالي\", بفاصلة", QuestionType.Essay, subjectA.Id, null,
            Difficulty.Medium, new List<string> { "cardiology" }, scopedAdmin.Id);
        q2.SetCorrectAnswer("essay model, answer");
        q2.UpdateExplanation("شرح السؤال المقالي");
        SetTimestamps(q2, new DateTime(2025, 6, 3, 0, 0, 0, DateTimeKind.Utc), new DateTime(2025, 6, 3, 12, 0, 0, DateTimeKind.Utc));
        Q2Id = q2.Id;

        // q3 — Matching with a full bijective payload.
        var prompt1 = Guid.NewGuid();
        var prompt2 = Guid.NewGuid();
        var target1 = Guid.NewGuid();
        var target2 = Guid.NewGuid();
        var q3 = Question.Create("Q3TEXT سؤال وصل", QuestionType.Matching, subjectA.Id, null,
            Difficulty.Hard, new List<string> { "quiz" }, scopedAdmin.Id);
        q3.SetMatchingPayload(new MatchingPayload
        {
            Prompts = new List<MatchingItem> { new(prompt1, "موجه 1", 0), new(prompt2, "موجه 2", 1) },
            Targets = new List<MatchingItem> { new(target1, "هدف 1", 0), new(target2, "هدف 2", 1) },
            Pairs = new List<MatchingPair> { new(prompt1, target1), new(prompt2, target2) },
        });
        q3.UpdateExplanation("شرح سؤال الوصل");
        SetTimestamps(q3, new DateTime(2025, 6, 5, 0, 0, 0, DateTimeKind.Utc), new DateTime(2025, 6, 5, 0, 0, 0, DateTimeKind.Utc));
        Q3Id = q3.Id;

        // q4 — MCQ in subject B (out of the scoped admin's scope).
        var q4 = Question.Create("Q4TEXT سؤال خارج النطاق", QuestionType.Mcq, subjectB.Id, null,
            Difficulty.Easy, new List<string> { "cardiology" }, scopedAdmin.Id);
        q4.AddOption("خيار", true, "A");
        q4.AddOption("خيار آخر", false, "B");
        q4.UpdateExplanation("شرح خارج النطاق");
        Q4OutOfScopeId = q4.Id;

        // qT1–qT3 — dedicated bulk-tag fixtures (May timestamps keep them outside
        // the created-range/updated-range read assertions in the sibling class).
        var qT1 = Question.Create("QTAG1 سؤال وسم جماعي 1", QuestionType.Mcq, subjectA.Id, null,
            Difficulty.Easy, new List<string> { "bulk-a" }, superAdmin.Id);
        qT1.AddOption("خيار", true, "A");
        qT1.AddOption("خيار آخر", false, "B");
        qT1.UpdateExplanation("شرح");
        SetTimestamps(qT1, new DateTime(2025, 5, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2025, 5, 1, 0, 0, 0, DateTimeKind.Utc));
        QTag1Id = qT1.Id;

        var qT2 = Question.Create("QTAG2 سؤال وسم جماعي 2", QuestionType.Mcq, subjectA.Id, null,
            Difficulty.Easy, new List<string> { "bulk-b" }, scopedAdmin.Id);
        qT2.AddOption("خيار", true, "A");
        qT2.AddOption("خيار آخر", false, "B");
        qT2.UpdateExplanation("شرح");
        SetTimestamps(qT2, new DateTime(2025, 5, 2, 0, 0, 0, DateTimeKind.Utc), new DateTime(2025, 5, 2, 0, 0, 0, DateTimeKind.Utc));
        QTag2Id = qT2.Id;

        var qT3 = Question.Create("QTAG3 سؤال وسم جماعي 3", QuestionType.Mcq, subjectA.Id, null,
            Difficulty.Easy, new List<string>(), superAdmin.Id);
        qT3.AddOption("خيار", true, "A");
        qT3.AddOption("خيار آخر", false, "B");
        qT3.UpdateExplanation("شرح");
        SetTimestamps(qT3, new DateTime(2025, 5, 3, 0, 0, 0, DateTimeKind.Utc), new DateTime(2025, 5, 3, 0, 0, 0, DateTimeKind.Utc));
        QTag3Id = qT3.Id;

        // Exam composed of q1 + q2 (universal exam preview contract).
        var exam = Exam.Create(subjectA.Id, "امتحان PR4", "pr4-exam", 2025, superAdmin.Id);
        ExamId = exam.Id;
        db.AddRange(university, college, year, semester, subjectA, subjectB, superRole, editorRole, superAdmin, scopedAdmin, q1, q2, q3, q4, qT1, qT2, qT3, exam);
        db.ExamQuestions.AddRange(
            ExamQuestion.Create(exam.Id, q1.Id, 0),
            ExamQuestion.Create(exam.Id, q2.Id, 1));
        await db.SaveChangesAsync();
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
    }

    internal HttpRequestMessage SuperAdminRequest(HttpMethod method, string uri) =>
        AdminRequest(method, uri, SuperAdminId, "super_admin,admin");

    /// <summary>Calls AS the subject-scoped role admin (editor: view/create/edit, NO export).</summary>
    internal HttpRequestMessage RoleAdminRequest(HttpMethod method, string uri) =>
        AdminRequest(method, uri, ScopedAdminId, "admin");

    private static HttpRequestMessage AdminRequest(HttpMethod method, string uri, Guid adminId, string roles)
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Id", adminId.ToString());
        request.Headers.TryAddWithoutValidation("X-Test-Admin-Roles", roles);
        return request;
    }

    private static void SetTimestamps(BaseEntity entity, DateTime createdAt, DateTime updatedAt)
    {
        typeof(BaseEntity).GetProperty("CreatedAt")?.SetValue(entity, createdAt);
        typeof(BaseEntity).GetProperty("UpdatedAt")?.SetValue(entity, updatedAt);
    }
}

// ===== Role-aware test auth handler =====
internal sealed class PR4TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal new const string Scheme = "PR4TestAuth";

    public PR4TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ISystemClock clock)
        : base(options, logger, encoder, clock) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var adminHeader = Request.Headers["X-Test-Admin-Id"].FirstOrDefault();
        if (!Guid.TryParse(adminHeader, out var adminId))
            return Task.FromResult(AuthenticateResult.NoResult());

        // Default caller = super_admin + admin; "admin" simulates a plain role admin.
        var rolesHeader = Request.Headers["X-Test-Admin-Roles"].FirstOrDefault() ?? "super_admin,admin";

        var identity = new ClaimsIdentity(Scheme);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, adminId.ToString()));
        identity.AddClaim(new Claim("sub", adminId.ToString()));
        foreach (var role in rolesHeader.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            identity.AddClaim(new Claim(ClaimTypes.Role, role));
        identity.AddClaim(new Claim("sid", Guid.Parse("22222222-2222-2222-2222-222222222222").ToString()));
        identity.AddClaim(new Claim("installation_id", "pr4-test-installation"));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}
