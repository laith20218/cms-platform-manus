using System.Text.Json;
using CMS.Application.Commands.Offline;
using CMS.Application.DTOs.Offline;
using CMS.Application.Handlers.Offline;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// W14.2 F.1 — offline sync ownership (A.1/R75 P0): a sync referencing an exam
/// session owned by ANOTHER student is rejected with 403 ProblemDetails semantics
/// (ForbiddenException) and never records a single attempt.
/// </summary>
public class OfflineSyncOwnershipTests
{
    private static (OfflineHandlers Handler, Mock<ISecurityAuditWriter> Audit) BuildHandler(ApplicationDbContext db, Guid packageId, Guid studentId)
    {
        var now = DateTime.UtcNow;
        var manifest = new OfflinePackageManifest(
            packageId, studentId, "ownership-installation", 1,
            new[] { TestDbHelper.GetTestSubject(db).Id }, now.AddMinutes(-5), now.AddHours(1), "nonce", "aad", "signature");
        db.OfflinePackageRecords.Add(new OfflinePackageRecord(packageId)
        {
            StudentId = studentId,
            InstallationId = "ownership-installation",
            ContentVersion = 1,
            IdempotencyHash = $"hash-{Guid.NewGuid():N}",
            ManifestJson = JsonSerializer.Serialize(manifest),
            CiphertextBase64Url = "ciphertext",
            TagBase64Url = "tag",
            WrappedKeyBase64Url = "wrapped",
            KeyReleaseToken = "release",
            IssuedAt = now.AddMinutes(-5),
            ExpiresAt = now.AddHours(1),
            Status = "active"
        });
        db.SaveChanges();

        var cache = new Mock<ICacheService>();
        cache.Setup(service => service.GetAsync<dynamic>($"offline:{packageId}", It.IsAny<CancellationToken>()))
            .Returns(Task.FromResult<dynamic>(new { Exists = true }));
        cache.Setup(service => service.GetAsync<Dictionary<Guid, string>>($"offline:{packageId}:answers", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, string>());
        var unitOfWork = new Mock<IUnitOfWork>();
        unitOfWork.Setup(unit => unit.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Features:OfflineEnabled"] = "true",
            ["Features:OfflineAesGcmImplemented"] = "true",
            ["Features:OfflineManifestImplemented"] = "true",
            ["Features:OfflineKeyReleaseImplemented"] = "true",
            ["Features:OfflinePackageIssuanceImplemented"] = "true"
        }).Build();
        var audit = new Mock<ISecurityAuditWriter>();
        var handler = new OfflineHandlers(db, unitOfWork.Object, cache.Object, configuration, new Mock<IOfflinePackageLifecycleService>().Object, audit.Object);
        return (handler, audit);
    }

    [Fact]
    public async Task Sync_RejectsExamSessionOwnedByAnotherStudent()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var packageId = Guid.NewGuid();
        var strangerId = Guid.NewGuid();

        // Someone ELSE's exam session.
        db.ExamSessions.Add(new ExamSession
        {
            StudentId = strangerId,
            ExamId = Guid.NewGuid(),
            StartedAt = DateTime.UtcNow.AddMinutes(-30),
            ExpiresAt = DateTime.UtcNow.AddMinutes(30),
            DurationMinutesSnapshot = 60,
            PassingScoreSnapshot = 60,
            TotalQuestions = 1,
            Status = ExamSessionStatus.InProgress
        });
        await db.SaveChangesAsync();

        var (handler, audit) = BuildHandler(db, packageId, student.Id);

        var action = () => handler.Handle(new SyncOfflineAnswersCommand(
            student.Id, packageId, db.ExamSessions.Single().Id,
            new List<OfflineAnswerDto> { new(question.Id, Guid.NewGuid().ToString(), 10, DateTime.UtcNow, true) }), CancellationToken.None);

        await action.Should().ThrowAsync<ForbiddenException>();
        (await db.AttemptLogs.AnyAsync()).Should().BeFalse();
        audit.Verify(writer => writer.LogSecurityEventAsync(
            student.Id, null, SecurityEventType.OfflineSyncRejected, SecuritySeverity.Warning,
            It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Sync_RejectsFutureDatedAnswers()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var packageId = Guid.NewGuid();
        var (handler, _) = BuildHandler(db, packageId, student.Id);

        var result = await handler.Handle(new SyncOfflineAnswersCommand(
            student.Id, packageId, null,
            new List<OfflineAnswerDto> { new(question.Id, Guid.NewGuid().ToString(), 10, DateTime.UtcNow.AddMinutes(30), true) }), CancellationToken.None);

        result.SuccessCount.Should().Be(0);
        result.FailedCount.Should().Be(1);
        (await db.AttemptLogs.AnyAsync()).Should().BeFalse();
    }
}
