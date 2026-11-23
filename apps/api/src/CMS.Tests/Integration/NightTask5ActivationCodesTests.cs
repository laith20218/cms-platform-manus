using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using CMS.Application.Commands.Subscriptions;
using CMS.Application.Handlers.Subscriptions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Security;
using CMS.Infrastructure.Services;
using CMS.Tests.Infrastructure;

namespace CMS.Tests.Integration;

/// <summary>
/// Night Task 5 — activation-code integrity regression suite.
///
/// 5.1 Single activation (server-enforced):
///   - a PRIVATE code binds to exactly ONE student (student self-redeem CAS,
///     and the admin manual-activate path refuses a second student);
///   - the same student can never hold two subscriptions from one code
///     (idempotent 400, also under the unique index);
///   - PUBLIC codes stay multi-student by design (one row per student).
/// 5.2 Student profile carries WHAT each code unlocks (contentScope +
///   subjectName), not only dates.
/// 5.3 Admin can see WHO activated a code with per-subject specificity and
///   filter the ledger by academic year.
///
/// HTTP-level cases run on the shared InMemory AdminEndpointFactory (auth +
/// policies exercised); the private-code CAS race semantics need a relational
/// provider and are covered by the Postgres handler-level suite below.
/// </summary>
[Collection("SignedEntitlementHttp")]
public sealed class NightTask5ActivationCodesHttpTests : IClassFixture<AdminEndpointFactory>
{
    private readonly AdminEndpointFactory _factory;

    public NightTask5ActivationCodesHttpTests(AdminEndpointFactory factory) => _factory = factory;

    private HttpRequestMessage ActivateRequest(Guid codeId, Guid studentId)
    {
        var request = _factory.SuperAdminRequest(HttpMethod.Post, $"/api/v1/admin/codes/{codeId}/activate");
        request.Content = JsonContent.Create(new { studentId });
        return request;
    }

    private async Task<(Guid codeId, Guid studentA, Guid studentB)> SeedCodePairAsync(bool isPublic, bool preBindToA = false)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var studentA = Student.Create($"095{Random.Shared.Next(1_000_000, 9_999_999)}", "hash-a", "طالب الأول");
        studentA.VerifyPhone();
        var studentB = Student.Create($"096{Random.Shared.Next(1_000_000, 9_999_999)}", "hash-b", "طالب الثاني");
        studentB.VerifyPhone();
        db.Students.AddRange(studentA, studentB);

        var batch = new CodeBatch
        {
            Name = $"night5-{Guid.NewGuid():N}"[..32], Quantity = 1, ScopeType = "university",
            ScopeUniversityId = Guid.NewGuid(), DurationDays = 30, CreatedBy = _factory.SuperAdminId,
        };
        db.CodeBatches.Add(batch);
        await db.SaveChangesAsync();

        var code = new SubscriptionCode
        {
            Code = $"N5{Random.Shared.Next(10_000_000, 99_999_999)}{Random.Shared.Next(100, 999)}",
            BatchId = batch.Id,
            ScopeType = SubscriptionScopeType.University,
            ScopeUniversityId = batch.ScopeUniversityId,
            DurationDays = 30,
            Status = CodeStatus.Active,
            IsPublic = isPublic,
            CreatedBy = _factory.SuperAdminId,
        };
        if (preBindToA)
        {
            code.Status = CodeStatus.Used;
            code.UsedBy = studentA.Id;
            code.UsedAt = DateTime.UtcNow.AddMinutes(-5);
        }
        db.SubscriptionCodes.Add(code);
        await db.SaveChangesAsync();
        return (code.Id, studentA.Id, studentB.Id);
    }

    // ===== 5.1 admin manual-activate path =====

    [Fact]
    public async Task AdminActivate_PublicCode_TwoDistinctStudentsBothSucceed_SameStudentTwiceRefused()
    {
        var (codeId, studentA, studentB) = await SeedCodePairAsync(isPublic: true);

        var first = await _factory.Client.SendAsync(ActivateRequest(codeId, studentA));
        first.StatusCode.Should().Be(HttpStatusCode.OK, await first.Content.ReadAsStringAsync());

        var second = await _factory.Client.SendAsync(ActivateRequest(codeId, studentB));
        second.StatusCode.Should().Be(HttpStatusCode.OK, await second.Content.ReadAsStringAsync());

        // Same student again → 400 (idempotency, unique (student, code) rule).
        var repeat = await _factory.Client.SendAsync(ActivateRequest(codeId, studentA));
        repeat.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task AdminActivate_PrivateCodeAlreadyBound_RefusesSecondStudent()
    {
        var (codeId, studentA, studentB) = await SeedCodePairAsync(isPublic: false, preBindToA: true);

        // The OLD behavior stacked unlimited students onto a claimed private
        // code; the hardened path must refuse the second student outright.
        var attempt = await _factory.Client.SendAsync(ActivateRequest(codeId, studentB));
        attempt.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // And the bound student himself is idempotent-blocked by the (student,
        // code) existence rule.
        var repeatBound = await _factory.Client.SendAsync(ActivateRequest(codeId, studentA));
        repeatBound.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    // ===== 5.3 admin specificity =====

    [Fact]
    public async Task CodeRedemptions_ReturnsWhoActivated_WithScopeSpecificity()
    {
        var (codeId, studentA, _) = await SeedCodePairAsync(isPublic: true);
        var activate = await _factory.Client.SendAsync(ActivateRequest(codeId, studentA));
        activate.StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await _factory.Client.SendAsync(_factory.SuperAdminRequest(HttpMethod.Get, $"/api/v1/admin/codes/{codeId}/redemptions"));
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var rows = await response.Content.ReadFromJsonAsync<List<RedemptionRow>>();
        rows.Should().NotBeNull();
        rows.Should().HaveCount(1);
        rows![0].studentName.Should().Be("طالب الأول");
        rows[0].contentScope.Should().NotBeNullOrWhiteSpace("the admin must see WHAT the code unlocks");
        rows[0].status.Should().Be("Active");
    }

    [Fact]
    public async Task GetCodes_AcceptsYearFilter()
    {
        var response = await _factory.Client.SendAsync(_factory.SuperAdminRequest(HttpMethod.Get, "/api/v1/admin/codes?yearId=00000000-0000-0000-0000-000000000000"));
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }

    // ===== 5.2 student profile scope =====

    [Fact]
    public async Task StudentProfile_SubscriptionsCarryContentScopeAndSubjectName()
    {
        // Seed a subject-scoped subscription for the factory's test student.
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var subject = await db.Subjects.AsNoTracking().FirstAsync();
        var batch = new CodeBatch
        {
            Name = $"night5p-{Guid.NewGuid():N}"[..32], Quantity = 1, ScopeType = "subject",
            ScopeSubjectId = subject.Id, DurationDays = 30, CreatedBy = _factory.SuperAdminId,
        };
        db.CodeBatches.Add(batch);
        await db.SaveChangesAsync();
        var code = new SubscriptionCode
        {
            Code = $"N5P{Random.Shared.Next(10_000_000, 99_999_999)}",
            BatchId = batch.Id,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subject.Id,
            ContentScope = SubscriptionContentScope.QuestionsExams,
            DurationDays = 30,
            Status = CodeStatus.Used,
            IsPublic = false,
            CreatedBy = _factory.SuperAdminId,
        };
        db.SubscriptionCodes.Add(code);
        await db.SaveChangesAsync();
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = _factory.TestStudentId,
            SubscriptionCodeId = code.Id,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subject.Id,
            ContentScope = SubscriptionContentScope.QuestionsExams,
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddDays(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(29),
        });
        await db.SaveChangesAsync();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/profile");
        request.Headers.Add("X-Test-Student-Id", _factory.TestStudentId.ToString());
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var profile = await response.Content.ReadFromJsonAsync<ProfilePayload>();
        profile.Should().NotBeNull();
        profile!.subscriptions.Should().NotBeEmpty();
        var row = profile.subscriptions.Single(s => s.maskedCode != null);
        row.contentScope.Should().Be("QuestionsExams", "the student must see what the code unlocks");
        row.scopeSubjectName.Should().Be(subject.NameAr, "the student must see which subject the code activates");
    }

    private sealed record RedemptionRow(Guid subscriptionId, string? studentName, string? studentPhone, string contentScope, string? subjectName, string scopeType, string status, DateTime startsAt, DateTime expiresAt, DateTime? revokedAt, string? revocationReason);
    private sealed record ProfileSubscriptionRow(Guid id, string? maskedCode, string scopeType, string status, DateTime startsAt, DateTime expiresAt, DateTime? revokedAt, Guid? scopeSubjectId, string? contentScope, string? scopeSubjectName);
    private sealed record ProfilePayload(string fullName, string phone, string? email, string? avatarUrl, string? gender, string status, DateTime createdAt, DateTime? lastLogin, string? universityName, string? collegeName, string? academicYearName, Guid? universityId, Guid? collegeId, Guid? academicYearId, List<ProfileSubscriptionRow> subscriptions);
}

/// <summary>
/// Night Task 5.1 — private-code binding semantics at the handler level against
/// a REAL relational provider (the compare-and-swap claim path needs a
/// translatable ExecuteUpdate; InMemory cannot execute it).
/// </summary>
[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class NightTask5RedeemBindingPostgresTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    private static string RequireConnectionString()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable);
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the Night-5 redemption binding tests.");
        return connectionString;
    }

    private static async Task<SubscriptionHandlers> BuildHandlersAsync(ApplicationDbContext db)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
        }).Build();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(db.Database.GetConnectionString())).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var cache = new Mock<ICacheService>();
        var audit = new SecurityService(db, cache.Object, batch, correlation, configuration);
        var unitOfWork = new UnitOfWork(db);
        var permissions = new PermissionService(db, cache.Object);
        return new SubscriptionHandlers(db, unitOfWork, permissions, audit);
    }

    private static async Task<(SubscriptionCode code, Student a, Student b, SubscriptionHandlers handlers, ApplicationDbContext db)> SeedAsync(bool isPublic)
    {
        var connectionString = RequireConnectionString();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        var db = new ApplicationDbContext(options);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var a = Student.Create($"093{Random.Shared.Next(1_000_000, 9_999_999)}", "hash", $"طالب أ {suffix}");
        a.VerifyPhone();
        var b = Student.Create($"094{Random.Shared.Next(1_000_000, 9_999_999)}", "hash", $"طالب ب {suffix}");
        b.VerifyPhone();
        db.Students.AddRange(a, b);
        var batchRecord = new CodeBatch
        {
            Name = $"night5-{suffix}", Quantity = 1, ScopeType = "university",
            ScopeUniversityId = Guid.NewGuid(), DurationDays = 30, CreatedBy = Guid.NewGuid(),
        };
        db.CodeBatches.Add(batchRecord);
        await db.SaveChangesAsync();
        var code = new SubscriptionCode
        {
            Code = $"N5X{suffix.ToUpperInvariant()}{Random.Shared.Next(1000, 9999)}",
            BatchId = batchRecord.Id, ScopeType = SubscriptionScopeType.University,
            ScopeUniversityId = batchRecord.ScopeUniversityId, DurationDays = 30,
            Status = CodeStatus.Active, IsPublic = isPublic, CreatedBy = batchRecord.CreatedBy,
        };
        db.SubscriptionCodes.Add(code);
        await db.SaveChangesAsync();
        var handlers = await BuildHandlersAsync(db);
        return (code, a, b, handlers, db);
    }

    [PostgresFact]
    public async Task PrivateCode_BindsToExactlyOneStudent_SecondStudentRefused_CodeRowClaimed()
    {
        var (code, a, b, handlers, db) = await SeedAsync(isPublic: false);
        await using (db)
        {
            var first = await handlers.Handle(new RedeemSubscriptionCodeCommand(a.Id, code.Code), CancellationToken.None);
            first.SubscriptionId.Should().NotBe(Guid.Empty);

            // A private code is single-student by contract: the second claim fails.
            var act = async () => await handlers.Handle(new RedeemSubscriptionCodeCommand(b.Id, code.Code), CancellationToken.None);
            await act.Should().ThrowAsync<ForbiddenException>();

            // The loser must NOT leave a subscription row behind.
            var subs = await db.StudentSubscriptions.AsNoTracking()
                .Where(s => s.SubscriptionCodeId == code.Id).ToListAsync();
            subs.Should().HaveCount(1);
            subs[0].StudentId.Should().Be(a.Id);

            // The code row is claimed exactly once: Used + UsedBy = first student.
            var claimed = await db.SubscriptionCodes.AsNoTracking().SingleAsync(c => c.Id == code.Id);
            claimed.Status.Should().Be(CodeStatus.Used);
            claimed.UsedBy.Should().Be(a.Id);
            claimed.UsedAt.Should().NotBeNull();
        }
    }

    [PostgresFact]
    public async Task SameStudent_SecondRedeemOfSameCode_IsRefusedAsAlreadyRedeemed()
    {
        var (code, a, _, handlers, db) = await SeedAsync(isPublic: true);
        await using (db)
        {
            await handlers.Handle(new RedeemSubscriptionCodeCommand(a.Id, code.Code), CancellationToken.None);
            var act = async () => await handlers.Handle(new RedeemSubscriptionCodeCommand(a.Id, code.Code), CancellationToken.None);
            (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("SUBSCRIPTION_CODE_ALREADY_REDEEMED");
            var count = await db.StudentSubscriptions.AsNoTracking().CountAsync(s => s.StudentId == a.Id && s.SubscriptionCodeId == code.Id);
            count.Should().Be(1, "the unique (student, code) rule must hold even on the sequential path");
        }
    }

    [PostgresFact]
    public async Task PublicCode_AllowsDistinctStudents_EachExactlyOnce()
    {
        var (code, a, b, handlers, db) = await SeedAsync(isPublic: true);
        await using (db)
        {
            await handlers.Handle(new RedeemSubscriptionCodeCommand(a.Id, code.Code), CancellationToken.None);
            await handlers.Handle(new RedeemSubscriptionCodeCommand(b.Id, code.Code), CancellationToken.None);
            var subs = await db.StudentSubscriptions.AsNoTracking()
                .Where(s => s.SubscriptionCodeId == code.Id).ToListAsync();
            subs.Should().HaveCount(2);
            subs.Select(s => s.StudentId).Should().BeEquivalentTo([a.Id, b.Id]);
        }
    }
}
