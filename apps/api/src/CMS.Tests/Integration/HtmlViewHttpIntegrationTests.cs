using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CMS.Tests.Integration;

/// <summary>
/// R51 — integration coverage for the HTML view token flow:
///   POST /api/v1/library/{id}/html-access  (JWT + role + entitlement + rate limit)
///   GET  /api/v1/library/{id}/html-view?t= (token IS the authorization; per-file CSP header)
///
/// Supervisor contract (R51 §3.A):
///  - Issue: 401 without auth, 403 without entitlement, 200 with valid file.
///  - View: 401 expired / used / mismatched fileId, 200 valid.
///  - CSP header: script-src 'unsafe-inline' when EnableScripts=true, 'none'
///    otherwise; frame-ancestors = the student-web origin (Cors:StudentApp).
///
/// R56 additions: the INTERACTIVE response body carries the HtmlStorageShim
/// right after the &lt;head&gt; open tag (or prepended when the document has
/// none); STATIC rows stay verbatim (script-src 'none' makes the shim dead
/// bytes, and the R51 zero-modification contract is preserved for them). The
/// stored object is never rewritten — the fake storage keeps the original
/// bytes and every assertion reads back from it as ground truth.
///
/// R58 — test isolation: every issue-consuming test mints its OWN student
/// identity (NewStudentId), so the default student's shared 5-per-minute
/// issue bucket can no longer make pass/fail depend on xUnit's execution
/// order within the class. Test-only change; production rate limits are
/// untouched.
/// </summary>
public sealed class HtmlViewHttpIntegrationTests : IClassFixture<HtmlViewHttpFactory>
{
    private readonly HtmlViewHttpFactory _factory;
    public HtmlViewHttpIntegrationTests(HtmlViewHttpFactory factory) => _factory = factory;

    // ===== Issue endpoint =====

    [Fact]
    public async Task Issue_WithoutAuth_Returns401()
    {
        var response = await _factory.Client.PostAsync($"/api/v1/library/{_factory.InteractiveHtmlId}/html-access", null);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Issue_WithoutEntitlementHeaders_Returns401()
    {
        var request = _factory.IssueRequest(_factory.InteractiveHtmlId, entitlement: null, installationId: HtmlViewHttpFactory.InstallationA);
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Issue_OutOfScopeFile_Returns403()
    {
        var token = _factory.CreateSignedToken(HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var request = _factory.IssueRequest(_factory.ForeignHtmlId, token, HtmlViewHttpFactory.InstallationA);
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Issue_UnpublishedOrNonHtmlFile_Returns404()
    {
        var token = _factory.CreateSignedToken(HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));

        var draft = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.DraftHtmlId, token, HtmlViewHttpFactory.InstallationA));
        draft.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var pdf = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.PdfFileId, token, HtmlViewHttpFactory.InstallationA));
        pdf.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Issue_ValidHtmlFile_Returns200_WithTokenUrlAndExpiry()
    {
        var studentId = NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var response = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.InteractiveHtmlId, token, HtmlViewHttpFactory.InstallationA, studentId));
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var url = body.GetProperty("url").GetString();
        url.Should().StartWith($"/api/v1/library/{_factory.InteractiveHtmlId}/html-view?t=");
        var expiresAt = body.GetProperty("expiresAt").GetDateTimeOffset();
        expiresAt.Should().BeAfter(DateTimeOffset.UtcNow.AddMinutes(4));
    }

    [Fact]
    public async Task Issue_RateLimit_SixthIssueInsideMinute_Returns429()
    {
        var token = _factory.CreateSignedTokenFor(_factory.Student2Id, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        for (var attempt = 1; attempt <= 5; attempt++)
        {
            var response = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.InteractiveHtmlId, token, HtmlViewHttpFactory.InstallationA, _factory.Student2Id));
            response.StatusCode.Should().Be(HttpStatusCode.OK, $"attempt {attempt} must succeed before the limit");
        }

        var sixth = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.InteractiveHtmlId, token, HtmlViewHttpFactory.InstallationA, _factory.Student2Id));
        sixth.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    // ===== View endpoint =====

    /// <summary>
    /// R51 deliverable evidence — the curl -I equivalent for one fixture: dumps
    /// the full html-view response headers + body head to a file so the report
    /// can quote the ACTUAL wire response. (A real curl is not possible in this
    /// sandbox — no local Postgres for a standalone API boot — so the hosted
    /// WebApplicationFactory server is exercised instead; the headers produced
    /// are the production pipeline's, middleware included.)
    /// </summary>
    [Fact]
    public async Task Evidence_HtmlView_WireHeaders_DumpedToArtifact()
    {
        var studentId = NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issue = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.InteractiveHtmlId, token, HtmlViewHttpFactory.InstallationA, studentId));
        issue.StatusCode.Should().Be(HttpStatusCode.OK);
        var url = (await issue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;

        var response = await _factory.Client.GetAsync(url);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var lines = new List<string>
        {
            $"GET {url}",
            $"HTTP/1.1 {(int)response.StatusCode} {response.StatusCode}",
        };
        foreach (var (name, values) in response.Headers) lines.Add($"{name}: {string.Join(", ", values)}");
        foreach (var (name, values) in response.Content.Headers) lines.Add($"{name}: {string.Join(", ", values)}");
        var body = await response.Content.ReadAsStringAsync();
        lines.Add(string.Empty);
        lines.Add(body.Length > 160 ? body[..160] + "…" : body);
        var artifact = Path.Combine(Path.GetTempPath(), "r51-html-view-headers.txt");
        await File.WriteAllLinesAsync(artifact, lines);

        lines.Should().Contain(l => l.StartsWith("Content-Security-Policy: ") && l.Contains("script-src 'unsafe-inline'"));
    }

    [Fact]
    public async Task View_UnknownToken_Returns401()
    {
        var response = await _factory.Client.GetAsync($"/api/v1/library/{_factory.InteractiveHtmlId}/html-view?t=not-a-real-token");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task View_MissingToken_Returns401()
    {
        var response = await _factory.Client.GetAsync($"/api/v1/library/{_factory.InteractiveHtmlId}/html-view");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task View_ValidToken_InjectsStorageShim_WithCspHeader_NoStore_NoXfo()
    {
        var studentId = NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issue = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.InteractiveHtmlId, token, HtmlViewHttpFactory.InstallationA, studentId));
        issue.StatusCode.Should().Be(HttpStatusCode.OK);
        var url = (await issue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;

        var response = await _factory.Client.GetAsync(url);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var csp = response.Headers.GetValues("Content-Security-Policy").Single();
        csp.Should().Contain("default-src 'none'");
        csp.Should().Contain("connect-src 'none'");
        csp.Should().Contain("script-src 'unsafe-inline'");
        csp.Should().Contain("frame-ancestors https://student-web.test");
        response.Headers.CacheControl.NoStore.Should().BeTrue();
        response.Content.Headers.ContentType!.ToString().Should().Be("text/html; charset=utf-8");
        response.Headers.Contains("X-Frame-Options").Should().BeFalse("frame-ancestors is the sole embedding control for this document");

        // R56 — the interactive response = stored bytes + shim right after <head>.
        // Expected body is composed from the LITERAL stored fixture (read back
        // from the storage fake as ground truth), NOT from HtmlStorageShim.Inject,
        // so this cannot pass by tautology.
        var stored = Encoding.UTF8.GetString(_factory.Storage.Objects[$"library/html/{_factory.InteractiveHtmlId:N}"]);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Be(stored.Replace("<head>", "<head>" + HtmlStorageShim.ScriptTag, StringComparison.Ordinal),
            "R56: the interactive response carries exactly the stored bytes plus the shim after <head> — nothing else changes");
        body.Should().Contain($"<head><script id=\"{HtmlStorageShim.ScriptId}\">");
        body.IndexOf(HtmlStorageShim.ScriptId, StringComparison.Ordinal)
            .Should().BeLessThan(body.IndexOf("window.__r51", StringComparison.Ordinal),
                "the shim must be defined before the lesson's own script runs");
        _factory.Storage.Objects[$"library/html/{_factory.InteractiveHtmlId:N}"]
            .Should().Equal(Encoding.UTF8.GetBytes(stored), "storage keeps the ORIGINAL bytes — the transform is response-only");
    }

    [Fact]
    public async Task View_StaticRow_ServedVerbatim_NoShim()
    {
        var studentId = NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issue = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.StaticHtmlId, token, HtmlViewHttpFactory.InstallationA, studentId));
        issue.StatusCode.Should().Be(HttpStatusCode.OK);
        var url = (await issue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;

        var response = await _factory.Client.GetAsync(url);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var stored = Encoding.UTF8.GetString(_factory.Storage.Objects[$"library/html/{_factory.StaticHtmlId:N}"]);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Be(stored, "static rows keep the R51 verbatim-bytes contract (scripts are blocked there — no shim, no mutation)");
        body.Should().NotContain(HtmlStorageShim.ScriptId);
    }

    [Fact]
    public async Task View_HeadlessLesson_ShimPrepended()
    {
        var studentId = NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issue = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.HeadlessHtmlId, token, HtmlViewHttpFactory.InstallationA, studentId));
        issue.StatusCode.Should().Be(HttpStatusCode.OK);
        var url = (await issue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;

        var response = await _factory.Client.GetAsync(url);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadAsStringAsync();
        body.Should().StartWith(HtmlStorageShim.ScriptTag, "a document without <head> gets the shim prepended (R56 workorder contract)");
        body.Should().Contain("window.__headless=true;");
    }

    [Fact]
    public async Task View_StaticRow_CspCarriesExplicitScriptSrcNone()
    {
        var studentId = NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issue = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.StaticHtmlId, token, HtmlViewHttpFactory.InstallationA, studentId));
        issue.StatusCode.Should().Be(HttpStatusCode.OK);
        var url = (await issue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;

        var response = await _factory.Client.GetAsync(url);
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var csp = response.Headers.GetValues("Content-Security-Policy").Single();
        csp.Should().Contain("script-src 'none'");
        csp.Should().NotContain("script-src 'unsafe-inline'",
            "style-src 'unsafe-inline' is legitimate (self-contained lessons) — only the SCRIPT directive must flip to 'none'");
    }

    [Fact]
    public async Task View_UsedToken_Returns401_OnSecondCall()
    {
        var studentId = NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issue = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.InteractiveHtmlId, token, HtmlViewHttpFactory.InstallationA, studentId));
        var url = (await issue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;

        (await _factory.Client.GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await _factory.Client.GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.Unauthorized, "the token is single-use");
    }

    [Fact]
    public async Task View_ExpiredToken_Returns401()
    {
        var studentId = NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issue = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.InteractiveHtmlId, token, HtmlViewHttpFactory.InstallationA, studentId));
        var url = (await issue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;

        _factory.Clock.UtcNowValue = _factory.Clock.UtcNowValue.AddMinutes(6); // TTL is 5 minutes
        (await _factory.Client.GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task View_TokenBoundToAnotherFile_Returns401()
    {
        var studentId = NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, HtmlViewHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issue = await _factory.Client.SendAsync(_factory.IssueRequest(_factory.InteractiveHtmlId, token, HtmlViewHttpFactory.InstallationA, studentId));
        var url = (await issue.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;
        var boundToken = url.Split("t=")[1];

        var mismatched = await _factory.Client.GetAsync($"/api/v1/library/{_factory.StaticHtmlId}/html-view?t={boundToken}");
        mismatched.StatusCode.Should().Be(HttpStatusCode.Unauthorized, "the token is bound to a different fileId");
    }

    /// <summary>
    /// R58 — test isolation: every issue-consuming test mints its OWN student
    /// identity, hence its own 5-per-minute issue bucket
    /// (HtmlAccessTokenService.MaxIssuesPerMinute). Passes no longer depend on
    /// xUnit execution order within the class.
    /// </summary>
    private Guid NewStudentId() => _factory.NewStudentId();
}

/// <summary>
/// WebApplicationFactory for the R51 HTML view flow: InMemory EF database,
/// test authentication scheme (X-Test-Student-Id → "student" principal),
/// in-memory storage fake and a mutable clock (token TTL travel).
/// Modeled on OfflineHttpFactory (Phase45) with LibraryFile fixtures added.
/// </summary>
public sealed class HtmlViewHttpFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    internal const string InstallationA = "r51-html-view-installation-a";
    private const string EntitlementKey = "r51-html-view-entitlement-test-key";

    private readonly string _databaseName = $"cms-r51-html-view-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection().AddEntityFrameworkInMemoryDatabase().BuildServiceProvider();
    private readonly ConcurrentDictionary<string, object?> _cache = new();

    public HttpClient Client { get; private set; } = null!;
    public Guid StudentId { get; private set; }
    public Guid Student2Id { get; private set; }
    public Guid SubjectId { get; private set; }
    public Guid InteractiveHtmlId { get; private set; }
    public Guid StaticHtmlId { get; private set; }
    public Guid HeadlessHtmlId { get; private set; }
    public Guid DraftHtmlId { get; private set; }
    public Guid PdfFileId { get; private set; }
    public Guid ForeignHtmlId { get; private set; }
    public HtmlViewStorageFake Storage { get; } = new();
    public MutableTimeProvider Clock { get; } = new();

    public HtmlViewHttpFactory()
    {
        // Same env contract OfflineHttpFactory establishes for Program.cs.
        Environment.SetEnvironmentVariable("Jwt__Secret", "r51-html-view-jwt-signing-key-not-production");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "r51-html-view-tests");
        Environment.SetEnvironmentVariable("Jwt__Audience", "r51-html-view-tests");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", EntitlementKey);
        Environment.SetEnvironmentVariable("Security__Entitlements__LifetimeMinutes", "20");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Database=r51_html_view_test;Username=test");
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Database=r51_html_view_test;Username=test",
            ["ConnectionStrings:Redis"] = "localhost:6379",
            ["Jwt:Secret"] = "r51-html-view-jwt-signing-key-not-production",
            ["Jwt:Issuer"] = "r51-html-view-tests",
            ["Jwt:Audience"] = "r51-html-view-tests",
            ["Security:Entitlements:SigningKey"] = EntitlementKey,
            ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Cors:StudentApp"] = "https://student-web.test",
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
            ["Security:Audit:QueueCapacity"] = "100"
        }));
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<ApplicationDbContext>();
            services.RemoveAll<IApplicationDbContext>();
            services.AddDbContext<ApplicationDbContext>(options => options.UseInMemoryDatabase(_databaseName).UseInternalServiceProvider(_inMemoryEfServices));
            services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
            services.RemoveAll<ICacheService>();
            services.AddSingleton<ICacheService>(new OfflineHttpCache(_cache));
            services.RemoveAll<ISessionService>();
            var sessions = new Moq.Mock<ISessionService>();
            sessions.Setup(service => service.IsActiveAsync(Moq.It.IsAny<Guid>(), Moq.It.IsAny<int>(), Moq.It.IsAny<string>(), Moq.It.IsAny<CancellationToken>())).Returns(Task.FromResult(true));
            services.AddScoped<ISessionService>(_ => sessions.Object);
            services.RemoveAll<IFileStorageService>();
            services.AddSingleton<IFileStorageService>(Storage);
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = OfflineHttpAuthenticationHandler.Scheme;
                options.DefaultChallengeScheme = OfflineHttpAuthenticationHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, OfflineHttpAuthenticationHandler>(OfflineHttpAuthenticationHandler.Scheme, _ => { });
        });
    }

    public async Task InitializeAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var university = University.Create("جامعة R51", "r51-university", "R51 University");
        var college = College.Create(university.Id, "كلية R51", "r51-college", "R51 College");
        var year = AcademicYear.Create(college.Id, "السنة الأولى", "r51-year", 1);
        var semester = Semester.Create(year.Id, "الفصل الأول", "r51-semester", 1);
        var subject = Subject.Create(semester.Id, "مادة R51", "r51-subject", "R51 Subject");
        var outsideSubject = Subject.Create(semester.Id, "مادة خارج النطاق", "r51-outside", "Outside Subject");
        var student = Student.Create("0990007771", "r51-hash", "طالب R51");
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();
        var student2 = Student.Create("0990007772", "r51-hash-2", "طالب R51 الثاني");
        student2.SetAcademicInfo(university.Id, college.Id, year.Id);
        student2.VerifyPhone();

        var interactive = new LibraryFile
        {
            SubjectId = subject.Id, Type = LibraryFileType.Html,
            Title = "درس R51 التفاعلي", FileSize = 512,
            FileFormat = "text/html", Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean, EnableScripts = true,
        };
        InteractiveHtmlId = interactive.Id;
        interactive.FileUrl = $"library/html/{InteractiveHtmlId:N}";
        var staticRow = new LibraryFile
        {
            SubjectId = subject.Id, Type = LibraryFileType.Html,
            Title = "درس R51 الثابت", FileSize = 512,
            FileFormat = "text/html", Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean, EnableScripts = false,
        };
        StaticHtmlId = staticRow.Id;
        staticRow.FileUrl = $"library/html/{StaticHtmlId:N}";
        var headless = new LibraryFile
        {
            SubjectId = subject.Id, Type = LibraryFileType.Html,
            Title = "درس R51 بلا رأس", FileSize = 256,
            FileFormat = "text/html", Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean, EnableScripts = true,
        };
        HeadlessHtmlId = headless.Id;
        headless.FileUrl = $"library/html/{HeadlessHtmlId:N}";
        var draft = new LibraryFile
        {
            SubjectId = subject.Id, Type = LibraryFileType.Html,
            Title = "مسودة R51", FileSize = 512,
            FileFormat = "text/html", Status = ContentStatus.Draft, VirusScanStatus = VirusScanStatus.Clean, EnableScripts = true,
        };
        DraftHtmlId = draft.Id;
        draft.FileUrl = $"library/html/{DraftHtmlId:N}";
        var pdf = new LibraryFile
        {
            SubjectId = subject.Id, Type = LibraryFileType.Pdf,
            Title = "ملف R51", FileSize = 512,
            FileFormat = "application/pdf", Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean,
        };
        PdfFileId = pdf.Id;
        pdf.FileUrl = $"library/pdf/{PdfFileId:N}";
        var foreign = new LibraryFile
        {
            SubjectId = outsideSubject.Id, Type = LibraryFileType.Html,
            Title = "درس R51 الخارجي", FileSize = 512,
            FileFormat = "text/html", Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean, EnableScripts = true,
        };
        ForeignHtmlId = foreign.Id;
        foreign.FileUrl = $"library/html/{ForeignHtmlId:N}";

        Storage.Objects[$"library/html/{InteractiveHtmlId:N}"] = Encoding.UTF8.GetBytes(
            "<!DOCTYPE html><html dir=\"rtl\"><head><title>R51 interactive</title></head><body><h1>درس القلب</h1><script>window.__r51=true;</script></body></html>");
        Storage.Objects[$"library/html/{StaticHtmlId:N}"] = Encoding.UTF8.GetBytes(
            "<!DOCTYPE html><html dir=\"rtl\"><head><title>R51 static</title></head><body><p>نص ثابت</p></body></html>");
        // R56 — a document with NO <head>: the shim must be PREPENDED.
        Storage.Objects[$"library/html/{HeadlessHtmlId:N}"] = Encoding.UTF8.GetBytes(
            "<p>درس بدون وسم head</p><script>window.__headless=true;</script>");

        db.AddRange(university, college, year, semester, subject, outsideSubject, student, student2);
        db.AddRange(interactive, staticRow, draft, pdf, foreign);
        db.Add(headless);
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student.Id, DeviceFingerprint = InstallationA, IsActive = true });
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student2.Id, DeviceFingerprint = InstallationA, IsActive = true });
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = student.Id, ScopeType = SubscriptionScopeType.Subject, ScopeSubjectId = subject.Id,
            Status = SubscriptionStatus.Active, StartsAt = DateTime.UtcNow.AddMinutes(-1), ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = student2.Id, ScopeType = SubscriptionScopeType.Subject, ScopeSubjectId = subject.Id,
            Status = SubscriptionStatus.Active, StartsAt = DateTime.UtcNow.AddMinutes(-1), ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await db.SaveChangesAsync();
        StudentId = student.Id;
        Student2Id = student2.Id;
        SubjectId = subject.Id;
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
    }

    /// <summary>
    /// R58 — a fresh student identity for per-test rate-limit isolation.
    /// A bare Guid is NOT sufficient: SignedEntitlementService.ValidateAsync
    /// rejects a student whose (student, installation) device binding is not
    /// active, so the binding row is seeded here on demand. Test-only — the
    /// production rate limit (HtmlAccessTokenService.MaxIssuesPerMinute) is
    /// untouched.
    /// </summary>
    internal Guid NewStudentId()
    {
        var studentId = Guid.NewGuid();
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.DeviceBindings.Add(new DeviceBinding { StudentId = studentId, DeviceFingerprint = InstallationA, IsActive = true });
        db.SaveChanges();
        return studentId;
    }

    /// <summary>POST /html-access with the test student principal + entitlement headers.</summary>
    internal HttpRequestMessage IssueRequest(Guid fileId, string? entitlement, string installationId, Guid? studentId = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/library/{fileId}/html-access");
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", (studentId ?? StudentId).ToString());
        request.Headers.TryAddWithoutValidation("X-Installation-Id", installationId);
        if (!string.IsNullOrWhiteSpace(entitlement)) request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    internal string CreateSignedToken(string installationId, IReadOnlyList<Guid> subjects, DateTime issuedAt, DateTime expiresAt) =>
        CreateSignedTokenFor(StudentId, installationId, subjects, issuedAt, expiresAt);

    internal string CreateSignedTokenFor(Guid userId, string installationId, IReadOnlyList<Guid> subjects, DateTime issuedAt, DateTime expiresAt)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            userId, deviceId = installationId, universityId = (Guid?)null, collegeId = (Guid?)null,
            allowedYears = Array.Empty<Guid>(), allowedSemesters = Array.Empty<Guid>(), allowedSubjects = subjects,
            issuedAt, expiresAt, version = 1
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var signature = HMACSHA256.HashData(Encoding.UTF8.GetBytes(EntitlementKey), payload);
        return $"{Base64Url(payload)}.{Base64Url(signature)}";
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

/// <summary>Mutable clock — drives the 5-minute TTL test without sleeping.</summary>
public sealed class MutableTimeProvider : TimeProvider
{
    public DateTimeOffset UtcNowValue { get; set; } = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => UtcNowValue;
}

/// <summary>In-memory storage fake — DownloadAsync serves the seeded bytes verbatim.</summary>
public sealed class HtmlViewStorageFake : IFileStorageService
{
    public ConcurrentDictionary<string, byte[]> Objects { get; } = new();

    public Task<Stream> DownloadAsync(string key, CancellationToken ct = default) =>
        Task.FromResult<Stream>(new MemoryStream(Objects.TryGetValue(key, out var bytes) ? bytes : Array.Empty<byte>()));

    public Task<bool> ExistsAsync(string key, CancellationToken ct = default) => Task.FromResult(Objects.ContainsKey(key));

    public Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default) => throw new NotSupportedException();
    public Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry, long? contentLength = null, CancellationToken ct = default) => throw new NotSupportedException();
    public Task<string> GetSignedUrlAsync(string key, TimeSpan expiry, CancellationToken ct = default) => throw new NotSupportedException();
    public Task DeleteAsync(string key, CancellationToken ct = default) => throw new NotSupportedException();
    public Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default) => throw new NotSupportedException();
    public Task<string> InitiateMultipartUploadAsync(string key, string contentType, CancellationToken ct = default) => throw new NotSupportedException();
    public Task<string> PresignUploadPartAsync(string key, string uploadId, int partNumber, TimeSpan expiry, CancellationToken ct = default) => throw new NotSupportedException();
    public Task<List<UploadedPartInfo>> ListMultipartPartsAsync(string key, string uploadId, CancellationToken ct = default) => throw new NotSupportedException();
    public Task CompleteMultipartUploadAsync(string key, string uploadId, IReadOnlyList<CompletedPart> parts, CancellationToken ct = default) => throw new NotSupportedException();
    public Task AbortMultipartUploadAsync(string key, string uploadId, CancellationToken ct = default) => throw new NotSupportedException();
    public Task<long> GetObjectSizeAsync(string key, CancellationToken ct = default) => Task.FromResult(Objects.TryGetValue(key, out var bytes) ? (long)bytes.Length : 0L);
    public Task<string> GetSignedUrlViaCredentialsAsync(string key, TimeSpan desiredExpiry, CancellationToken ct = default) => throw new NotSupportedException();
}
