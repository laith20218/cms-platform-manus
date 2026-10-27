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
public sealed class PasswordAuditPostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task PasswordResetRequested_RealHandlerPersistsSafeAuditEvent()
    {
        await using var fixture = await CreateFixtureAsync();
        fixture.Cache.Setup(cache => cache.SetAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        var handler = new ForgotPasswordCommandHandler(new StudentRepository(fixture.Db), fixture.Cache.Object, fixture.Configuration, fixture.Audit);

        await handler.Handle(new ForgotPasswordCommand(fixture.Student.Phone), CancellationToken.None);
        await fixture.Batch.FlushAsync();

        var log = await ReadSingleAsync(fixture, SecurityEventType.PasswordResetRequested);
        log.StudentId.Should().Be(fixture.Student.Id);
        log.Severity.Should().Be(SecuritySeverity.Info);
        AssertSafe(log.Description, fixture.Password, "123456");
    }

    [PostgresFact]
    public async Task PasswordResetCompleted_RealHandlerPersistsPasswordChangedWithoutSensitiveValues()
    {
        await using var fixture = await CreateFixtureAsync();
        fixture.Cache.Setup(cache => cache.GetAsync<string>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync("123456");
        fixture.Cache.Setup(cache => cache.GetAndRemoveAsync<string>(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync("123456");
        var handler = new ResetPasswordCommandHandler(new StudentRepository(fixture.Db), fixture.Cache.Object, fixture.Hasher, fixture.Sessions, new PasswordPolicy(), fixture.Configuration, fixture.Audit);

        await handler.Handle(new ResetPasswordCommand(fixture.Student.Phone, "123456", "ResetAudit!2026"), CancellationToken.None);

        var log = await ReadSingleAsync(fixture, SecurityEventType.PasswordChanged);
        log.StudentId.Should().Be(fixture.Student.Id);
        log.Severity.Should().Be(SecuritySeverity.Warning);
        log.Description.Should().Be("credential_reset=completed");
        AssertSafe(log.Description, fixture.Password, "123456", "ResetAudit!2026");
    }

    [PostgresFact]
    public async Task PasswordChanged_RealHandlerPersistsSafeAuditEvent()
    {
        await using var fixture = await CreateFixtureAsync();
        var handler = new ChangePasswordCommandHandler(new StudentRepository(fixture.Db), fixture.Hasher, fixture.Sessions, new PasswordPolicy(), fixture.Audit);

        await handler.Handle(new ChangePasswordCommand(fixture.Student.Id, fixture.Password, "ChangedAudit!2026"), CancellationToken.None);

        var log = await ReadSingleAsync(fixture, SecurityEventType.PasswordChanged);
        log.StudentId.Should().Be(fixture.Student.Id);
        log.Severity.Should().Be(SecuritySeverity.Warning);
        log.Description.Should().Be("credential_change=completed");
        AssertSafe(log.Description, fixture.Password, "ChangedAudit!2026");
    }

    private static async Task<SecurityLog> ReadSingleAsync(PasswordFixture fixture, SecurityEventType eventType)
    {
        await using var verifyDb = new ApplicationDbContext(fixture.Options);
        var log = await verifyDb.SecurityLogs.AsNoTracking().SingleAsync(entry => entry.StudentId == fixture.Student.Id && entry.EventType == eventType && entry.CorrelationId == fixture.Correlation.CorrelationId);
        log.CreatedAt.Should().BeOnOrAfter(DateTime.UtcNow.AddMinutes(-2));
        return log;
    }

    private static void AssertSafe(string description, params string[] forbidden)
    {
        var lower = description.ToLowerInvariant();
        foreach (var value in forbidden) lower.Should().NotContain(value.ToLowerInvariant());
        lower.Should().NotContain("password").And.NotContain("otp").And.NotContain("token").And.NotContain("secret").And.NotContain("api_key").And.NotContain("encryption");
    }

    private static async Task<PasswordFixture> CreateFixtureAsync()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable)
            ?? throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the PostgreSQL password audit integration test.");
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        var db = new ApplicationDbContext(options);
        var hasher = new PasswordHasher();
        var password = "CurrentAudit!2026";
        var student = Student.Create($"09{Random.Shared.Next(10_000_000, 99_999_999)}", hasher.HashPassword(password), "Password Audit Student");
        student.VerifyPhone();
        db.Students.Add(student);
        await db.SaveChangesAsync();
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Features:OtpEnabled"] = "true", ["Jwt:RefreshTokenExpiryDays"] = "7", ["Security:Device:SingleActiveDevice"] = "true",
            ["Security:Audit:BatchSize"] = "10", ["Security:Audit:FlushSeconds"] = "60", ["Security:Audit:QueueCapacity"] = "20"
        }).Build();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), config, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var cache = new Mock<ICacheService>();
        var audit = new SecurityService(db, cache.Object, batch, correlation, config);
        var tokens = new Mock<ITokenService>();
        tokens.Setup(service => service.GenerateAccessToken(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<int>())).Returns("test-access-token");
        var sessions = new SessionService(db, tokens.Object, audit, config);
        return new PasswordFixture(db, options, student, password, hasher, cache, audit, sessions, batch, config, correlation);
    }

    private sealed record PasswordFixture(ApplicationDbContext Db, DbContextOptions<ApplicationDbContext> Options, Student Student, string Password, PasswordHasher Hasher, Mock<ICacheService> Cache, SecurityService Audit, SessionService Sessions, SecurityEventBatchService Batch, IConfiguration Configuration, CorrelationContext Correlation) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
