using CMS.Application.Commands.Auth;
using CMS.Application.Handlers.Auth;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Security;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

using CMS.Tests.Infrastructure;

namespace CMS.Tests.Integration;

[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class AuthAuditPostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task Login_RealCommandPersistsLoginAndSessionCreatedWithSafeCorrelation()
    {
        await using var fixture = await CreateFixtureAsync();
        var request = new LoginCommand(fixture.Student.Phone, fixture.Password, "web-1234567890abcdef1234567890abcdef", "Audit Login Device");

        var response = await fixture.Login.Handle(request, CancellationToken.None);
        response.RefreshToken.Should().NotBeNullOrWhiteSpace();
        await fixture.Batch.FlushAsync();

        await using var verifyDb = new ApplicationDbContext(fixture.Options);
        var events = await verifyDb.SecurityLogs.AsNoTracking().Where(log => log.StudentId == fixture.Student.Id && log.CorrelationId == fixture.Correlation.CorrelationId &&
            (log.EventType == SecurityEventType.LoginSuccess || log.EventType == SecurityEventType.SessionCreated)).ToListAsync();
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.LoginSuccess && log.Severity == SecuritySeverity.Info);
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.SessionCreated && log.Severity == SecuritySeverity.Info);
        events.Should().OnlyContain(log => log.CreatedAt > DateTime.UtcNow.AddMinutes(-2));
        events.Select(log => log.Description).Should().OnlyContain(description =>
            !description.Contains(fixture.Password, StringComparison.Ordinal) &&
            !description.Contains(response.RefreshToken, StringComparison.Ordinal) &&
            !description.Contains("secret", StringComparison.OrdinalIgnoreCase));
    }

    [PostgresFact]
    public async Task LoginFailed_RealCommandPersistsActorAndSafeDescription()
    {
        await using var fixture = await CreateFixtureAsync();
        var invalid = () => fixture.Login.Handle(new LoginCommand(fixture.Student.Phone, "WrongPass!2026", "web-1234567890abcdef1234567890abcdef", "Audit Login Device"), CancellationToken.None);

        await invalid.Should().ThrowAsync<CMS.Domain.Exceptions.DomainException>();

        await using var verifyDb = new ApplicationDbContext(fixture.Options);
        var log = await verifyDb.SecurityLogs.AsNoTracking().SingleAsync(entry => entry.StudentId == fixture.Student.Id &&
            entry.EventType == SecurityEventType.LoginFailed && entry.CorrelationId == fixture.Correlation.CorrelationId);
        log.Severity.Should().Be(SecuritySeverity.Warning);
        log.CreatedAt.Should().BeOnOrAfter(DateTime.UtcNow.AddMinutes(-2));
        var description = log.Description.ToLowerInvariant();
        description.Should().NotContain("wrongpass!2026").And.NotContain("password").And.NotContain("token");
    }

    private static async Task<AuthFixture> CreateFixtureAsync()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable)
            ?? throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the PostgreSQL auth audit integration test.");
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        var db = new ApplicationDbContext(options);
        var password = "AuthAudit!2026";
        var hasher = new PasswordHasher();
        var student = Student.Create($"09{Random.Shared.Next(10_000_000, 99_999_999)}", hasher.HashPassword(password), "Auth Audit Student");
        student.VerifyPhone();
        db.Students.Add(student);
        await db.SaveChangesAsync();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:RefreshTokenExpiryDays"] = "7", ["Security:Device:SingleActiveDevice"] = "true",
            ["Security:Audit:BatchSize"] = "10", ["Security:Audit:FlushSeconds"] = "60", ["Security:Audit:QueueCapacity"] = "20"
        }).Build();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), config, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var security = new SecurityService(db, new Mock<ICacheService>().Object, batch, correlation, config);
        var tokenService = new Mock<ITokenService>();
        tokenService.Setup(service => service.GenerateAccessToken(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>())).Returns("test-access-token");
        var sessions = new SessionService(db, tokenService.Object, security, config);
        var login = new LoginCommandHandler(new StudentRepository(db), hasher, sessions, new UnitOfWork(db), config, security);
        return new AuthFixture(db, options, student, password, login, batch, correlation);
    }

    private sealed record AuthFixture(ApplicationDbContext Db, DbContextOptions<ApplicationDbContext> Options, Student Student, string Password, LoginCommandHandler Login, SecurityEventBatchService Batch, CorrelationContext Correlation) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
