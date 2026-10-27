using System.Security.Cryptography;
using CMS.Application.Commands.Offline;
using CMS.Application.Handlers.Offline;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
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
public sealed class OfflineAuditProducerPostgresIntegrationTests
{
    private const string ConnectionVariable = "CMS_PHASE34_TEST_POSTGRES";

    [PostgresFact]
    public async Task OfflineIssueRevokeAndRejectedSync_RealHandlersPersistAllRequiredAuditEvents()
    {
        await using var fixture = await CreateFixtureAsync();
        var package = await fixture.Handler.Handle(new DownloadOfflinePackageCommand(fixture.Student.Id, fixture.Subject.Id, null, "phase44-offline-idempotency", fixture.InstallationId, fixture.DevicePublicKeySpki), CancellationToken.None);
        await fixture.Batch.FlushAsync();
        await fixture.Handler.Handle(new DeleteOfflinePackageCommand(fixture.Student.Id, package.PackageId), CancellationToken.None);
        var rejected = () => fixture.Handler.Handle(new SyncOfflineAnswersCommand(fixture.Student.Id, package.PackageId, null, new List<CMS.Application.DTOs.Offline.OfflineAnswerDto>()), CancellationToken.None);
        await rejected.Should().ThrowAsync<ForbiddenException>();

        await using var verifyDb = new ApplicationDbContext(fixture.Options);
        var boundKey = await verifyDb.DeviceBindings.AsNoTracking().SingleAsync(binding => binding.StudentId == fixture.Student.Id && binding.DeviceFingerprint == fixture.InstallationId);
        boundKey.OfflinePackagePublicKeySpki.Should().Be(fixture.DevicePublicKeySpki);
        var events = await verifyDb.SecurityLogs.AsNoTracking().Where(log => log.StudentId == fixture.Student.Id && log.CorrelationId == fixture.Correlation.CorrelationId &&
            (log.EventType == SecurityEventType.OfflinePackageCreated || log.EventType == SecurityEventType.OfflinePackageRevoked || log.EventType == SecurityEventType.OfflineSyncRejected)).ToListAsync();
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.OfflinePackageCreated && log.Severity == SecuritySeverity.Info);
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.OfflinePackageRevoked && log.Severity == SecuritySeverity.Warning);
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.OfflineSyncRejected && log.Severity == SecuritySeverity.Warning);
        events.Should().OnlyContain(log => log.CreatedAt > DateTime.UtcNow.AddMinutes(-2));
        events.Select(log => log.Description.ToLowerInvariant()).Should().OnlyContain(description =>
            !description.Contains("key") && !description.Contains("ciphertext") && !description.Contains("question") && !description.Contains("secret") && !description.Contains("token"));
    }

    private static async Task<OfflineFixture> CreateFixtureAsync()
    {
        var connectionString = Environment.GetEnvironmentVariable(ConnectionVariable)
            ?? throw new InvalidOperationException($"BLOCKED: set {ConnectionVariable} to run the PostgreSQL Offline audit integration test.");
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        var db = new ApplicationDbContext(options);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var university = University.Create($"جامعة Offline {suffix}", $"offline-u-{suffix}", "Offline University");
        var college = College.Create(university.Id, "كلية Offline", $"offline-c-{suffix}", "Offline College");
        var year = AcademicYear.Create(college.Id, "سنة Offline", $"offline-y-{suffix}", 1);
        var semester = Semester.Create(year.Id, "فصل Offline", $"offline-s-{suffix}", 1);
        var subject = Subject.Create(semester.Id, "مادة Offline", $"offline-sub-{suffix}", "Offline Subject");
        var role = AdminRole.Create($"offline-admin-role-{suffix}", "دور Offline");
        var admin = Admin.Create($"offline-admin-{suffix}@test.local", "hash", "Offline Admin", role.Id);
        var question = Question.Create("Offline audit question", QuestionType.Mcq, subject.Id, null, Difficulty.Easy, new List<string>(), admin.Id);
        question.AddOption("Correct", true);
        question.AddOption("Incorrect", false);
        question.UpdateExplanation("Offline audit explanation.");
        question.Publish();
        var student = Student.Create($"09{Random.Shared.Next(10_000_000, 99_999_999)}", "offline-audit-hash", "Offline Audit Student");
        student.VerifyPhone();
        db.AddRange(university, college, year, semester, subject, role, admin, question, student);
        const string installationId = "phase44-offline-installation";
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student.Id, DeviceFingerprint = installationId, IsActive = true });
        await db.SaveChangesAsync();
        using var deviceKey = RSA.Create(2048);
        var devicePublicKeySpki = Convert.ToBase64String(deviceKey.ExportSubjectPublicKeyInfo());
        using var manifestSigner = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Features:OfflineEnabled"] = "true", ["Features:OfflineAesGcmImplemented"] = "true", ["Features:OfflineManifestImplemented"] = "true",
            ["Features:OfflineKeyReleaseImplemented"] = "true", ["Features:OfflinePackageIssuanceImplemented"] = "true",
            ["Security:Offline:KeyWrappingKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(value => (byte)value).ToArray()),
            ["Security:Offline:ManifestSigningKey"] = Convert.ToBase64String(Enumerable.Range(33, 32).Select(value => (byte)value).ToArray()),
            ["Security:Offline:ManifestSigningPrivateKeyPkcs8"] = Convert.ToBase64String(manifestSigner.ExportPkcs8PrivateKey()),
            ["Security:Audit:BatchSize"] = "10", ["Security:Audit:FlushSeconds"] = "60", ["Security:Audit:QueueCapacity"] = "20"
        }).Build();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var cache = new Mock<ICacheService>();
        cache.Setup(service => service.SetAsync(It.IsAny<string>(), It.IsAny<object>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        cache.Setup(service => service.SetAsync(It.IsAny<string>(), It.IsAny<Dictionary<Guid, string>>(), It.IsAny<TimeSpan?>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        cache.Setup(service => service.RemoveAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        var audit = new SecurityService(db, cache.Object, batch, correlation, configuration);
        var handler = new OfflineHandlers(db, new UnitOfWork(db), cache.Object, configuration, new OfflinePackageLifecycleService(db, new OfflinePackageCryptoService(configuration)), audit);
        return new OfflineFixture(db, options, student, subject, handler, batch, correlation, installationId, devicePublicKeySpki);
    }

    private sealed record OfflineFixture(ApplicationDbContext Db, DbContextOptions<ApplicationDbContext> Options, Student Student, Subject Subject, OfflineHandlers Handler, SecurityEventBatchService Batch, CorrelationContext Correlation, string InstallationId, string DevicePublicKeySpki) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
