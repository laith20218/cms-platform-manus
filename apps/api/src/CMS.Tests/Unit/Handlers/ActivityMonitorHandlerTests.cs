using CMS.Application.BackgroundJobs;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using CMS.Application.Commands.Admin;
using CMS.Application.Commands.Dashboard;
using CMS.Application.Commands.Library;
using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Library;
using CMS.Application.DTOs.Questions;
using CMS.Application.Handlers.Admin;
using CMS.Application.Handlers.Dashboard;
using CMS.Application.Handlers.Library;
using CMS.Application.Handlers.Questions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Common;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Security;
using CMS.Infrastructure.Services;
using CMS.Tests;
using CMS.Tests.Helpers;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Push 2 / Track 1 + Track 2: ParagraphTag/Year round-trips and the AdminActivityLog
/// write side (CreateQuestion / GenerateCodes / CompleteUpload) using the REAL
/// AdminActivityWriter against an InMemory context — plus the monitor read side.
/// </summary>
public class ActivityMonitorHandlerTests
{
    // ===== Track 1: Question.ParagraphTag + Year =====

    [Fact]
    public async Task CreateQuestion_WithParagraphTagAndYear_PersistsBothAndWritesActivityLog()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var admin = db.Admins.First();
        using var uow = new UnitOfWork(db);
        var writer = new AdminActivityWriter(db, NullLogger<AdminActivityWriter>.Instance);
        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), writer);
        var sessionId = Guid.NewGuid();

        var result = await handler.Handle(new CreateQuestionCommand(
            "سؤال اختبار وسم الفقرة", "Mcq", subject.Id, null,
            "Medium", new List<string> { "test" },
            new List<CreateOptionDto>
            {
                new("خيار 1", true, null),
                new("خيار 2", false, null),
            },
            "", null,
            "شرح الاختبار", null, 2024, admin.Id,
            ParagraphTag: "الفصل الأول", SessionId: sessionId), CancellationToken.None);

        result.ParagraphTag.Should().Be("الفصل الأول");
        result.Year.Should().Be(2024);

        var stored = db.Questions.AsNoTracking().Single(q => q.Id == result.Id);
        stored.ParagraphTag.Should().Be("الفصل الأول");
        stored.Year.Should().Be(2024);

        var log = db.AdminActivityLogs.AsNoTracking().Single(l => l.ActionType == AdminActivityActionType.CreateQuestion);
        log.AdminId.Should().Be(admin.Id);
        log.SessionId.Should().Be(sessionId);
        log.ResourceId.Should().Be(result.Id.ToString());
        var metadata = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(log.Metadata)!;
        metadata["questionId"].GetString().Should().Be(result.Id.ToString());
        metadata["type"].GetString().Should().Be("Mcq");
    }

    [Fact]
    public async Task CreateQuestion_WithoutParagraphTag_LeavesColumnNullAndStillLogs()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var admin = db.Admins.First();
        using var uow = new UnitOfWork(db);
        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(),
            new AdminActivityWriter(db, NullLogger<AdminActivityWriter>.Instance));

        var result = await handler.Handle(new CreateQuestionCommand(
            "سؤال بدون وسم", "TrueFalse", subject.Id, null,
            "Easy", new List<string>(),
            new List<CreateOptionDto>
            {
                new("صح", true, null),
                new("خطأ", false, null),
            },
            "", null,
            "شرح", null, null, admin.Id), CancellationToken.None);

        var stored = db.Questions.AsNoTracking().Single(q => q.Id == result.Id);
        stored.ParagraphTag.Should().BeNull();
        db.AdminActivityLogs.AsNoTracking()
            .Should().ContainSingle(l => l.ResourceId == result.Id.ToString());
    }

    [Fact]
    public async Task UpdateQuestion_CanChangeYearAndParagraphTag()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var question = db.Questions.First();
        question.SetParagraphTag("الفصل الأول");
        await db.SaveChangesAsync();
        using var uow = new UnitOfWork(db);
        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());

        var result = await handler.Handle(new UpdateQuestionCommand(
            question.Id, question.Text, "Hard",
            new List<string> { "updated" }, question.Explanation, null,
            new List<UpdateOptionDto>(), null,
            Year: 2023, ParagraphTag: "الفصل الثاني — القسم 3"), CancellationToken.None);

        result.Year.Should().Be(2023);
        result.ParagraphTag.Should().Be("الفصل الثاني — القسم 3");
        var stored = db.Questions.AsNoTracking().Single(q => q.Id == question.Id);
        stored.Year.Should().Be(2023);
        stored.ParagraphTag.Should().Be("الفصل الثاني — القسم 3");
    }

    [Fact]
    public void SetParagraphTag_TruncatesOverlongValues()
    {
        var question = Question.Create("نص", QuestionType.Mcq, Guid.NewGuid(), null, Difficulty.Easy, null, Guid.NewGuid());
        question.SetParagraphTag(new string('و', 500));
        question.ParagraphTag!.Length.Should().Be(200);
    }

    // ===== Track 2: GenerateCodes activity log =====

    [Fact]
    public async Task GenerateCodes_WritesActivityLogWithQuantity()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var admin = db.Admins.First();
        using var uow = new UnitOfWork(db);
        var permissions = new Mock<IPermissionService>();
        permissions.Setup(p => p.HasPermissionAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        permissions.Setup(p => p.IsInScopeAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var audit = new Mock<ISecurityAuditWriter>();
        var sessionId = Guid.NewGuid();
        var handler = new AdminManagementHandlers(db, uow, permissions.Object, audit.Object,
            new AdminActivityWriter(db, NullLogger<AdminActivityWriter>.Instance));

        var result = await handler.Handle(new GenerateCodesCommand(
            "subject", subject.Id, 30, 5, "P2", null, "full_subject", false, admin.Id, sessionId),
            CancellationToken.None);

        result.Quantity.Should().Be(5);
        var log = db.AdminActivityLogs.AsNoTracking().Single(l => l.ActionType == AdminActivityActionType.GenerateCode);
        log.AdminId.Should().Be(admin.Id);
        log.SessionId.Should().Be(sessionId);
        log.ResourceId.Should().Be(result.BatchId.ToString());
        var metadata = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(log.Metadata)!;
        metadata["quantity"].GetInt32().Should().Be(5);
        metadata["scopeType"].GetString().Should().Be("subject");
        metadata["durationDays"].GetInt32().Should().Be(30);
    }

    // ===== Track 2: CompleteUpload activity log =====

    [Fact]
    public async Task CompleteUpload_WritesActivityLogWithFileSizeAndContentType()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var admin = db.Admins.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = LibraryFileType.Pdf,
            Title = "ملف نشاط",
            FileUrl = "library/p2test/file",
            FileSize = 100,
            FileFormat = "application/pdf",
            Status = ContentStatus.Draft,
            VirusScanStatus = VirusScanStatus.Pending
        };
        db.LibraryFiles.Add(file);
        await db.SaveChangesAsync();

        var storage = new Mock<IFileStorageService>();
        storage.Setup(s => s.ExistsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var scanner = new Mock<IFileScanner>();
        scanner.Setup(s => s.ScanAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FileScanResult(true, false, "clean"));
        var settings = new Mock<ISystemSettingsService>();
        var sanitizer = new Mock<IHtmlBlobSanitizer>();
        using var uow = new UnitOfWork(db);
        var sessionId = Guid.NewGuid();
        var handler = new LibraryHandlers(db, uow, storage.Object, scanner.Object,
            AllowAllEntitlements(), settings.Object, sanitizer.Object,
            NullLogger<LibraryHandlers>.Instance,
            new AdminActivityWriter(db, NullLogger<AdminActivityWriter>.Instance),
            new TranscodingChannelQueue(), // Push 10.3: inert queue — nothing consumes jobs in tests
            new PdfProcessingChannelQueue(), // Wave 11.9: inert queue — same rationale
            new HtmlCspInjectorService()); // Wave 13 BUILD FIX: real stateless injector (pure transform — no mock value)

        await handler.Handle(new CompleteUploadCommand(file.Id, file.FileUrl, 2048, 3, null, null, admin.Id, sessionId),
            CancellationToken.None);

        var log = db.AdminActivityLogs.AsNoTracking().Single(l => l.ActionType == AdminActivityActionType.UploadFile);
        log.AdminId.Should().Be(admin.Id);
        log.SessionId.Should().Be(sessionId);
        log.ResourceId.Should().Be(file.Id.ToString());
        var metadata = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(log.Metadata)!;
        metadata["fileSize"].GetInt64().Should().Be(2048);
        metadata["contentType"].GetString().Should().Be("application/pdf");
    }

    // ===== Track 2: monitor read side =====

    [Fact]
    public async Task GetAdminSessions_ReturnsDurationDeviceAndActionCounters()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var admin = db.Admins.First();
        var session = new UserSession
        {
            UserId = admin.Id,
            Role = "super_admin",
            InstallationId = "p2-monitor-installation",
            FamilyId = Guid.NewGuid(),
            RefreshTokenHash = "hash-p2-monitor",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(1),
            LastActivityAt = DateTime.UtcNow.AddMinutes(-1),
            IpAddress = "203.0.113.9",
            UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
            DeviceDetails = "{\"browser\":\"Chrome\",\"os\":\"Windows\",\"deviceType\":\"desktop\"}"
        };
        typeof(BaseEntity).GetProperty("CreatedAt")!.SetValue(session, DateTime.UtcNow.AddMinutes(-30));
        db.UserSessions.Add(session);
        db.AdminActivityLogs.AddRange(
            new AdminActivityLog { AdminId = admin.Id, SessionId = session.Id, ActionType = AdminActivityActionType.CreateQuestion, ResourceId = Guid.NewGuid().ToString(), Metadata = "{}" },
            new AdminActivityLog { AdminId = admin.Id, SessionId = session.Id, ActionType = AdminActivityActionType.CreateQuestion, ResourceId = Guid.NewGuid().ToString(), Metadata = "{}" },
            new AdminActivityLog { AdminId = admin.Id, SessionId = session.Id, ActionType = AdminActivityActionType.UploadFile, ResourceId = Guid.NewGuid().ToString(), Metadata = "{}" });
        await db.SaveChangesAsync();

        var handler = new ActivityMonitorHandlers(db);
        var result = await handler.Handle(new GetAdminSessionsQuery(1, 20, null), CancellationToken.None);

        result.Total.Should().BeGreaterThanOrEqualTo(1);
        var row = result.Items.Single(s => s.Id == session.Id);
        row.AdminName.Should().Be(admin.FullName);
        row.IPAddress.Should().Be("203.0.113.9");
        row.DeviceDetails.Should().Contain("Chrome");
        row.ClosedAt.Should().BeNull();
        row.DurationMinutes.Should().BeGreaterThanOrEqualTo(29);
        row.QuestionsCount.Should().Be(2);
        row.FilesCount.Should().Be(1);
        row.CodesCount.Should().Be(0);
    }

    [Fact]
    public async Task GetAdminActivityLogs_FiltersBySessionId()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var admin = db.Admins.First();
        var sessionId = Guid.NewGuid();
        var otherSession = Guid.NewGuid();
        db.AdminActivityLogs.AddRange(
            new AdminActivityLog { AdminId = admin.Id, SessionId = sessionId, ActionType = AdminActivityActionType.GenerateCode, Metadata = "{}" },
            new AdminActivityLog { AdminId = admin.Id, SessionId = otherSession, ActionType = AdminActivityActionType.UploadFile, Metadata = "{}" });
        await db.SaveChangesAsync();

        var handler = new ActivityMonitorHandlers(db);
        var result = await handler.Handle(new GetAdminActivityLogsQuery(1, 20, null, sessionId), CancellationToken.None);

        result.Items.Should().ContainSingle(l => l.SessionId == sessionId && l.ActionType == "GenerateCode");
        var all = await handler.Handle(new GetAdminActivityLogsQuery(1, 20, null, null), CancellationToken.None);
        all.Items.Should().HaveCountGreaterThanOrEqualTo(2);
    }

    private static IEntitlementService AllowAllEntitlements()
    {
        var mock = new Mock<IEntitlementService>();
        mock.Setup(e => e.CanAccessSubjectAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        mock.Setup(e => e.CanAccessSubjectContentAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<SubscriptionContentScope>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        return mock.Object;
    }
}
