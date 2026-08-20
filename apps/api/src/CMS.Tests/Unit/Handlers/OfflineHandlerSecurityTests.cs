using System.Text.Json;
using CMS.Application.Commands.Offline;
using CMS.Application.DTOs.Offline;
using CMS.Application.Handlers.Offline;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;

namespace CMS.Tests.Unit.Handlers;

public sealed partial class OfflineHandlerSecurityTests
{
    [Fact]
    public async Task SyncAnswers_DoesNotRecordQuestionOutsideManifestSubjectScope()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var allowedSubject = TestDbHelper.GetTestSubject(db);
        var admin = await db.Admins.SingleAsync();
        var outsideSubject = Subject.Create(Guid.NewGuid(), "خارج النطاق", "outside-scope", "Outside Scope");
        var outsideQuestion = Question.Create(
            "Outside package question", QuestionType.Mcq, outsideSubject.Id, null, Difficulty.Easy, new List<string>(), admin.Id);
        outsideQuestion.AddOption("Correct", true);
        outsideQuestion.AddOption("Incorrect", false);
        outsideQuestion.UpdateExplanation("Fixture explanation required before publishing.");
        outsideQuestion.Publish();
        db.Subjects.Add(outsideSubject);
        db.Questions.Add(outsideQuestion);

        var packageId = Guid.NewGuid();
        var now = DateTime.UtcNow;
        var manifest = new OfflinePackageManifest(
            packageId, student.Id, "test-installation", 1, new[] { allowedSubject.Id },
            now, now.AddHours(1), "nonce", "aad", "signature");
        db.OfflinePackageRecords.Add(new OfflinePackageRecord(packageId)
        {
            StudentId = student.Id,
            InstallationId = "test-installation",
            ContentVersion = 1,
            IdempotencyHash = "test-idempotency",
            ManifestJson = JsonSerializer.Serialize(manifest),
            CiphertextBase64Url = "ciphertext",
            TagBase64Url = "tag",
            WrappedKeyBase64Url = "wrapped",
            KeyReleaseToken = "release",
            IssuedAt = now,
            ExpiresAt = now.AddHours(1),
            Status = "active"
        });
        await db.SaveChangesAsync();

        var cache = new Mock<ICacheService>();
        cache.Setup(service => service.GetAsync<dynamic>($"offline:{packageId}", It.IsAny<CancellationToken>()))
            .Returns(Task.FromResult<dynamic>(new { Exists = true }));
        cache.Setup(service => service.GetAsync<Dictionary<Guid, string>>($"offline:{packageId}:answers", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, string>());
        var unitOfWork = new Mock<IUnitOfWork>();
        unitOfWork.Setup(unit => unit.SaveChangesAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        var lifecycle = new Mock<IOfflinePackageLifecycleService>();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Features:OfflineEnabled"] = "true",
            ["Features:OfflineAesGcmImplemented"] = "true",
            ["Features:OfflineManifestImplemented"] = "true",
            ["Features:OfflineKeyReleaseImplemented"] = "true",
            ["Features:OfflinePackageIssuanceImplemented"] = "true"
        }).Build();
        var handler = new OfflineHandlers(db, unitOfWork.Object, cache.Object, configuration, lifecycle.Object, new Mock<ISecurityAuditWriter>().Object);

        var result = await handler.Handle(new SyncOfflineAnswersCommand(
            student.Id, packageId, null,
            new List<OfflineAnswerDto> { new(outsideQuestion.Id, outsideQuestion.Options.First(option => option.IsCorrect).Id.ToString(), 10, now, true) }), CancellationToken.None);

        result.SuccessCount.Should().Be(0);
        result.FailedCount.Should().Be(1);
        (await db.AttemptLogs.AnyAsync(log => log.QuestionId == outsideQuestion.Id)).Should().BeFalse();
    }
}


public sealed partial class OfflineHandlerSecurityTests
{
    [Fact]
    public async Task GetOfflinePackages_ReturnsOnlyActiveOwnedPackageMetadata()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);
        var now = DateTime.UtcNow;
        var activeId = Guid.NewGuid();
        var activeManifest = new OfflinePackageManifest(activeId, student.Id, "listing-installation", 1,
            new[] { subject.Id }, now.AddMinutes(-5), now.AddHours(1), "nonce", "aad", "signature");
        var expiredId = Guid.NewGuid();
        var expiredManifest = new OfflinePackageManifest(expiredId, student.Id, "listing-installation", 1,
            new[] { subject.Id }, now.AddDays(-2), now.AddDays(-1), "nonce", "aad", "signature");
        db.OfflinePackageRecords.AddRange(
            CreateRecord(activeId, student.Id, activeManifest, now.AddHours(1), "active"),
            CreateRecord(expiredId, student.Id, expiredManifest, now.AddDays(-1), "active"));
        await db.SaveChangesAsync();

        var handler = new OfflineHandlers(
            db,
            new Mock<IUnitOfWork>().Object,
            new Mock<ICacheService>().Object,
            OfflineEnabledConfiguration(),
            new Mock<IOfflinePackageLifecycleService>().Object,
            new Mock<ISecurityAuditWriter>().Object);

        var result = await handler.Handle(new GetOfflinePackagesQuery(student.Id), CancellationToken.None);

        result.Should().ContainSingle();
        var item = result.Single();
        item.PackageId.Should().Be(activeId);
        item.SubjectName.Should().Be(subject.NameAr);
        item.IsExpired.Should().BeFalse();
        item.ExpiresAt.Should().BeOnOrAfter(now);
    }

    private static OfflinePackageRecord CreateRecord(Guid packageId, Guid studentId, OfflinePackageManifest manifest, DateTime expiresAt, string status) =>
        new(packageId)
        {
            StudentId = studentId,
            InstallationId = manifest.InstallationId,
            ContentVersion = manifest.ContentVersion,
            IdempotencyHash = Guid.NewGuid().ToString("N"),
            ManifestJson = JsonSerializer.Serialize(manifest),
            CiphertextBase64Url = "ciphertext",
            TagBase64Url = "tag",
            WrappedKeyBase64Url = "wrapped",
            KeyReleaseToken = "release",
            IssuedAt = manifest.IssuedAt,
            ExpiresAt = expiresAt,
            Status = status
        };

    private static IConfiguration OfflineEnabledConfiguration() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Features:OfflineEnabled"] = "true",
        ["Features:OfflineAesGcmImplemented"] = "true",
        ["Features:OfflineManifestImplemented"] = "true",
        ["Features:OfflineKeyReleaseImplemented"] = "true",
        ["Features:OfflinePackageIssuanceImplemented"] = "true"
    }).Build();
}
