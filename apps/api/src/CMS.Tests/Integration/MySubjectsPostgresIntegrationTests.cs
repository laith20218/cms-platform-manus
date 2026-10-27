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
/// FIX-2 — Route-level coverage for GET /api/v1/subjects/my-subjects against a real
/// PostgreSQL database (the EF-translation gate that InMemory cannot provide).
/// A student claim must list exactly the subjects backed by an active subscription
/// grant; an unentitled student gets an empty 200; unauthenticated callers get 401.
/// </summary>
[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class MySubjectsPostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task MySubjects_StudentClaim_ListsOnlyEntitledSubjects_AndUnentitledGetsEmptyList()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                $"BLOCKED: set {ConnectionVariable} to run the my-subjects PostgreSQL integration test.");

        await using var factory = new MySubjectsHttpFactory(connectionString);
        try
        {
            await factory.SeedAsync();

            // 1) Unauthenticated → 401
            var anonymous = await factory.Client.GetAsync("/api/v1/subjects/my-subjects");
            anonymous.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

            // 2) Entitled student → 200 containing the subscribed subject (and not the other one)
            var entitled = await factory.Client.SendAsync(factory.StudentRequest(factory.EntitledStudentId));
            entitled.StatusCode.Should().Be(HttpStatusCode.OK, await entitled.Content.ReadAsStringAsync());
            var entitledSubjects = (await entitled.Content.ReadFromJsonAsync<List<MySubjectsItem>>())!;
            entitledSubjects.Should().NotBeNull();
            entitledSubjects.Select(subject => subject.id).Should().Contain(factory.EntitledSubjectId,
                "a student with an active subject-scope grant must see that subject");
            entitledSubjects.Select(subject => subject.id).Should().NotContain(factory.OtherSubjectId,
                "subjects without an active grant must stay hidden");
            var entitledSubject = entitledSubjects.Single(subject => subject.id == factory.EntitledSubjectId);
            entitledSubject.nameAr.Should().NotBeNullOrWhiteSpace();
            entitledSubject.slug.Should().NotBeNullOrWhiteSpace();

            // 3) Unentitled student → 200 with an empty array
            var unentitled = await factory.Client.SendAsync(factory.StudentRequest(factory.UnentitledStudentId));
            unentitled.StatusCode.Should().Be(HttpStatusCode.OK, await unentitled.Content.ReadAsStringAsync());
            var unentitledSubjects = (await unentitled.Content.ReadFromJsonAsync<List<MySubjectsItem>>())!;
            unentitledSubjects.Should().NotBeNull();
            unentitledSubjects.Should().BeEmpty("a student without any active grant must receive an empty list, not an error");
        }
        finally
        {
            await factory.CleanupAsync();
        }
    }

    public sealed record MySubjectsItem(Guid id, string nameAr, string? nameEn, string slug);
}

/// <summary>
/// Boots the full API against a real PostgreSQL database with real MediatR handlers and
/// the real entitlement service. Only transport-level concerns (authentication, session
/// validation, caching) are replaced with test doubles.
/// </summary>
internal sealed class MySubjectsHttpFactory : WebApplicationFactory<Program>, IAsyncDisposable
{
    private const string JwtSigningKey = "my-subjects-test-jwt-signing-key-32-bytes";
    private readonly string _connectionString;

    internal HttpClient Client { get; private set; } = null!;
    internal Guid EntitledStudentId { get; private set; }
    internal Guid UnentitledStudentId { get; private set; }
    internal Guid EntitledSubjectId { get; private set; }
    internal Guid OtherSubjectId { get; private set; }

    private Guid _universityId;
    private Guid _collegeId;
    private Guid _yearId;
    private Guid _semesterId;

    public MySubjectsHttpFactory(string connectionString) => _connectionString = connectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Both the env vars and the in-memory config are set, mirroring AdminEndpointFactory:
        // some Program.cs registrations read configuration lazily and must never observe nulls.
        Environment.SetEnvironmentVariable("Jwt__Secret", JwtSigningKey);
        Environment.SetEnvironmentVariable("Jwt__Issuer", "my-subjects-test");
        Environment.SetEnvironmentVariable("Jwt__Audience", "my-subjects-test");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", "my-subjects-entitlement-key-32-bytes!!");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", _connectionString);
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");

        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Secret"] = JwtSigningKey,
            ["Jwt:Issuer"] = "my-subjects-test",
            ["Jwt:Audience"] = "my-subjects-test",
            ["Security:Entitlements:SigningKey"] = "my-subjects-entitlement-key-32-bytes!!",
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
                options.DefaultAuthenticateScheme = MySubjectsTestAuthenticationHandler.Scheme;
                options.DefaultChallengeScheme = MySubjectsTestAuthenticationHandler.Scheme;
                options.DefaultForbidScheme = MySubjectsTestAuthenticationHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, MySubjectsTestAuthenticationHandler>(MySubjectsTestAuthenticationHandler.Scheme, _ => { });

            services.PostConfigure<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>(
                Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme,
                options =>
                {
                    options.Events ??= new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents();
                    options.Events.OnAuthenticationFailed = _ => Task.CompletedTask;
                    options.Events.OnMessageReceived = _ => Task.CompletedTask;
                });

            // The route contract is exercised with a pre-validated student identity;
            // session revocation semantics have their own dedicated test suites.
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

    internal HttpRequestMessage StudentRequest(Guid studentId) => new(HttpMethod.Get, "/api/v1/subjects/my-subjects")
    {
        Headers = { { "X-Test-Student-Id", studentId.ToString() } }
    };

    internal async Task SeedAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var suffix = Guid.NewGuid().ToString("N")[..8];
        var phoneDigits = Random.Shared.Next(100, 999).ToString();
        var university = University.Create($"جامعة my-subjects {suffix}", $"my-subjects-uni-{suffix}");
        var college = College.Create(university.Id, $"كلية my-subjects {suffix}", $"my-subjects-college-{suffix}");
        var year = AcademicYear.Create(college.Id, $"سنة my-subjects {suffix}", $"my-subjects-year-{suffix}", 1);
        var semester = Semester.Create(year.Id, $"فصل my-subjects {suffix}", $"my-subjects-semester-{suffix}", 1);
        var entitledSubject = Subject.Create(semester.Id, $"مادة مشتركة {suffix}", $"my-subjects-entitled-{suffix}");
        var otherSubject = Subject.Create(semester.Id, $"مادة غير مشتركة {suffix}", $"my-subjects-other-{suffix}");
        var entitledStudent = Student.Create($"0990{phoneDigits}1", "not-used", $"طالب مشترك {suffix}");
        entitledStudent.SetAcademicInfo(university.Id, college.Id, year.Id);
        entitledStudent.VerifyPhone();
        var unentitledStudent = Student.Create($"0990{phoneDigits}2", "not-used", $"طالب غير مشترك {suffix}");
        unentitledStudent.SetAcademicInfo(university.Id, college.Id, year.Id);
        unentitledStudent.VerifyPhone();

        var grant = new StudentSubscription
        {
            StudentId = entitledStudent.Id,
            ScopeType = SubscriptionScopeType.Subject,
            ContentScope = SubscriptionContentScope.FullSubject,
            ScopeSubjectId = entitledSubject.Id,
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        };

        db.Universities.Add(university);
        db.Colleges.Add(college);
        db.AcademicYears.Add(year);
        db.Semesters.Add(semester);
        db.Subjects.AddRange(entitledSubject, otherSubject);
        db.Students.AddRange(entitledStudent, unentitledStudent);
        db.StudentSubscriptions.Add(grant);
        await db.SaveChangesAsync();

        _universityId = university.Id;
        _collegeId = college.Id;
        _yearId = year.Id;
        _semesterId = semester.Id;
        EntitledStudentId = entitledStudent.Id;
        UnentitledStudentId = unentitledStudent.Id;
        EntitledSubjectId = entitledSubject.Id;
        OtherSubjectId = otherSubject.Id;
    }

    internal async Task CleanupAsync()
    {
        try
        {
            await using var scope = Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            await db.StudentSubscriptions
                .Where(subscription => subscription.StudentId == EntitledStudentId)
                .ExecuteDeleteAsync();
            await db.Students
                .Where(student => student.Id == EntitledStudentId || student.Id == UnentitledStudentId)
                .ExecuteDeleteAsync();
            await db.Subjects
                .Where(subject => subject.Id == EntitledSubjectId || subject.Id == OtherSubjectId)
                .ExecuteDeleteAsync();
            await db.Semesters.Where(semester => semester.Id == _semesterId).ExecuteDeleteAsync();
            await db.AcademicYears.Where(year => year.Id == _yearId).ExecuteDeleteAsync();
            await db.Colleges.Where(college => college.Id == _collegeId).ExecuteDeleteAsync();
            await db.Universities.Where(university => university.Id == _universityId).ExecuteDeleteAsync();
        }
        catch
        {
            // Cleanup is best-effort — a leftover seeded row never invalidates a test verdict.
        }
    }
}

internal sealed class MySubjectsTestAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal const string Scheme = "MySubjectsTest";

    public MySubjectsTestAuthenticationHandler(
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
        identity.AddClaim(new Claim("sid", Guid.Parse("22222222-2222-2222-2222-222222222222").ToString()));
        identity.AddClaim(new Claim("installation_id", "my-subjects-test-installation"));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}
