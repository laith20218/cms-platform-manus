using CMS.Application.BackgroundJobs;
using CMS.Application.Commands.Library;
using CMS.Application.Handlers.Library;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// FIX-7 + FIX-8 — Library upload/delete server-side rules:
/// deleting a library file must also remove the stored blob (best-effort, never failing
/// the committed database delete), and upload-url requests must enforce the strict
/// document MIME allow-list before any presigned URL is issued.
/// A2 — per-type upload ceilings (settings-driven with hardcoded fallback), content-length
/// binding on presigned URLs, LibraryFileCategory persistence, and HTML sanitization on
/// upload completion.
/// </summary>
public sealed class LibraryHandlersTests
{
    private static (LibraryHandlers Handler, Mock<IFileStorageService> Storage, Mock<IHtmlBlobSanitizer> Sanitizer, Mock<IFileScanner> Scanner) Create(
        ApplicationDbContext db, Mock<ISystemSettingsService>? settings = null)
    {
        var storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        storage.Setup(service => service.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        var scanner = new Mock<IFileScanner>();
        scanner.Setup(service => service.ScanAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FileScanResult(IsClean: true, IsInfected: false, Verdict: "trusted"));
        var entitlements = new Mock<IEntitlementService>();
        // Real settings service over the InMemory database: missing keys exercise the
        // hardcoded fallback path; tests that need overrides seed SystemSettings rows.
        var settingsService = settings ?? new Mock<ISystemSettingsService>();
        if (settings is null)
        {
            settingsService.Setup(service => service.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((string?)null);
        }
        var sanitizer = new Mock<IHtmlBlobSanitizer>();
        var handler = new LibraryHandlers(
            db,
            new UnitOfWork(db),
            storage.Object,
            scanner.Object,
            entitlements.Object,
            settingsService.Object,
            sanitizer.Object,
            NullLogger<LibraryHandlers>.Instance, NoOp.ActivityWriter(),
            new TranscodingChannelQueue()); // Push 10.3: real inert queue — jobs buffer, nothing consumes them in tests
        return (handler, storage, sanitizer, scanner);
    }

    private static async Task<LibraryFile> SeedFileAsync(ApplicationDbContext db, string fileKey)
    {
        var subject = db.Subjects.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = LibraryFileType.Pdf,
            Title = "ملف اختبار الحذف",
            FileUrl = fileKey,
            FileSize = 1024,
            FileFormat = "application/pdf",
            Status = ContentStatus.Published,
            VirusScanStatus = VirusScanStatus.Clean
        };
        db.LibraryFiles.Add(file);
        await db.SaveChangesAsync();
        return file;
    }

    [Fact]
    public async Task DeleteLibraryFile_RemovesStoredBlob_AfterDatabaseDelete()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/abc/def";
        var file = await SeedFileAsync(db, fileKey);
        var (handler, storage, _, _) = Create(db);

        await handler.Handle(new DeleteLibraryFileCommand(file.Id, Guid.NewGuid()), CancellationToken.None);

        storage.Verify(service => service.DeleteAsync(fileKey, It.IsAny<CancellationToken>()), Times.Once,
            "the stored blob must be deleted together with the database row");
        db.LibraryFiles.AsNoTracking().Single(stored => stored.Id == file.Id).DeletedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task DeleteLibraryFile_StorageFailure_DoesNotFailTheRequest()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/xyz/999";
        var file = await SeedFileAsync(db, fileKey);
        var (handler, storage, _, _) = Create(db);
        storage.Setup(service => service.DeleteAsync(fileKey, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("blob endpoint unreachable"));

        var act = () => handler.Handle(new DeleteLibraryFileCommand(file.Id, Guid.NewGuid()), CancellationToken.None);

        await act.Should().NotThrowAsync(
            "a storage outage must not fail the already committed database delete");
        db.LibraryFiles.AsNoTracking().Single(stored => stored.Id == file.Id).DeletedAt.Should().NotBeNull(
            "the soft delete is already committed and must stay in place");
    }

    [Theory]
    [InlineData("video/mp4")]
    [InlineData("audio/mpeg")]
    [InlineData("application/x-msdownload")]
    [InlineData("application/zip")]
    [InlineData("image/gif")]
    public async Task RequestUploadUrl_RejectsDisallowedContentType_WithInvalidFileType(string contentType)
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, _, _, _) = Create(db);

        var act = () => handler.Handle(new RequestUploadUrlCommand(
            "file.bin", contentType, 1024, subject.Id, null, "Pdf", "عنوان", null, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "INVALID_FILE_TYPE");
    }

    [Theory]
    [InlineData("application/pdf")]
    [InlineData("text/html")]
    [InlineData("image/png")]
    [InlineData("image/jpeg")]
    [InlineData("image/webp")]
    [InlineData("application/vnd.openxmlformats-officedocument.wordprocessingml.document")]
    [InlineData("application/msword")]
    public async Task RequestUploadUrl_AllowsDocumentContentTypes(string contentType)
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, storage, _, _) = Create(db);
        storage.Setup(service => service.GetSignedUploadUrlAsync(It.IsAny<string>(), contentType, It.IsAny<TimeSpan>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://storage.example.com/signed-put");
        // Type enum must match the allowed document family (Pdf/Html/Image).
        var type = contentType.StartsWith("image/") ? "Image" : contentType == "text/html" ? "Html" : "Pdf";

        var result = await handler.Handle(new RequestUploadUrlCommand(
            "file.pdf", contentType, 1024, subject.Id, null, type, "عنوان", null, Guid.NewGuid()), CancellationToken.None);

        result.UploadUrl.Should().NotBeNullOrWhiteSpace();
        result.FileKey.Should().StartWith("library/");
    }

    // ===== A2-3: per-type upload ceilings (settings-driven, hardcoded fallback) =====

    [Theory]
    [InlineData("application/pdf", "Pdf", (long)201 * 1024 * 1024)]      // default pdf limit = 200 MB
    [InlineData("text/html", "Html", (long)11 * 1024 * 1024)]            // default html limit = 10 MB
    [InlineData("image/png", "Image", (long)21 * 1024 * 1024)]           // default image limit = 20 MB
    public async Task RequestUploadUrl_RejectsFileSize_AbovePerTypeDefaultLimit(string contentType, string type, long fileSize)
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, _, _, _) = Create(db); // settings mock returns null → hardcoded defaults apply

        var act = () => handler.Handle(new RequestUploadUrlCommand(
            "file", contentType, fileSize, subject.Id, null, type, "عنوان", null, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "FILE_TOO_LARGE");
    }

    [Theory]
    [InlineData("application/pdf", "Pdf", (long)200 * 1024 * 1024)]      // exactly at the pdf limit
    [InlineData("text/html", "Html", (long)10 * 1024 * 1024)]            // exactly at the html limit
    [InlineData("image/jpeg", "Image", (long)20 * 1024 * 1024)]          // exactly at the image limit
    public async Task RequestUploadUrl_AcceptsFileSize_AtPerTypeDefaultLimit(string contentType, string type, long fileSize)
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, storage, _, _) = Create(db);
        storage.Setup(service => service.GetSignedUploadUrlAsync(It.IsAny<string>(), contentType, It.IsAny<TimeSpan>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://storage.example.com/signed-put");

        var result = await handler.Handle(new RequestUploadUrlCommand(
            "file", contentType, fileSize, subject.Id, null, type, "عنوان", null, Guid.NewGuid()), CancellationToken.None);

        result.UploadUrl.Should().NotBeNullOrWhiteSpace("a file exactly at its type ceiling must be accepted");
    }

    [Fact]
    public async Task RequestUploadUrl_SystemSetting_OverridesHardcodedDefault()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var settings = new Mock<ISystemSettingsService>();
        settings.Setup(service => service.GetAsync("upload.limit.pdf_mb", It.IsAny<CancellationToken>()))
            .ReturnsAsync("50"); // admin tightened the pdf limit to 50 MB
        var (handler, _, _, _) = Create(db, settings);

        var act = () => handler.Handle(new RequestUploadUrlCommand(
            "big.pdf", "application/pdf", 60L * 1024 * 1024, subject.Id, null, "Pdf", "عنوان", null, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "FILE_TOO_LARGE",
                "the system setting (50 MB) must win over the hardcoded default (200 MB)");
    }

    [Fact]
    public async Task RequestUploadUrl_MalformedSetting_FallsBackToDefault()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var settings = new Mock<ISystemSettingsService>();
        settings.Setup(service => service.GetAsync("upload.limit.pdf_mb", It.IsAny<CancellationToken>()))
            .ReturnsAsync("not-a-number");
        var (handler, storage, _, _) = Create(db, settings);
        storage.Setup(service => service.GetSignedUploadUrlAsync(It.IsAny<string>(), "application/pdf", It.IsAny<TimeSpan>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://storage.example.com/signed-put");

        var result = await handler.Handle(new RequestUploadUrlCommand(
            "big.pdf", "application/pdf", 200L * 1024 * 1024, subject.Id, null, "Pdf", "عنوان", null, Guid.NewGuid()), CancellationToken.None);

        result.UploadUrl.Should().NotBeNullOrWhiteSpace("an unparseable setting must fall back to the hardcoded 200 MB default");
    }

    // ===== A2-1: content-length binding on presigned upload URLs =====

    [Fact]
    public async Task RequestUploadUrl_BindsDeclaredFileSizeIntoPresignedUrl()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, storage, _, _) = Create(db);
        const long declaredSize = 123_456;
        storage.Setup(service => service.GetSignedUploadUrlAsync(It.IsAny<string>(), "application/pdf", It.IsAny<TimeSpan>(), declaredSize, It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://storage.example.com/signed-put");

        var result = await handler.Handle(new RequestUploadUrlCommand(
            "f.pdf", "application/pdf", declaredSize, subject.Id, null, "Pdf", "عنوان", null, Guid.NewGuid()), CancellationToken.None);

        storage.Verify(service => service.GetSignedUploadUrlAsync(
            It.IsAny<string>(), "application/pdf", It.IsAny<TimeSpan>(), declaredSize, It.IsAny<CancellationToken>()), Times.Once,
            "the declared FileSize must be signed into the presigned URL so storage rejects a differently-sized body");
        result.UploadUrl.Should().NotBeNullOrWhiteSpace();
    }

    // ===== A2-2: LibraryFileCategory persistence =====

    [Fact]
    public async Task RequestUploadUrl_PersistsRequestedCategory()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, storage, _, _) = Create(db);
        storage.Setup(service => service.GetSignedUploadUrlAsync(It.IsAny<string>(), "application/pdf", It.IsAny<TimeSpan>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://storage.example.com/signed-put");

        var result = await handler.Handle(new RequestUploadUrlCommand(
            "f.pdf", "application/pdf", 1024, subject.Id, null, "Pdf", "عنوان", null, Guid.NewGuid(),
            Category: LibraryFileCategory.GoldenIdeas), CancellationToken.None);

        var stored = db.LibraryFiles.AsNoTracking().Single(file => file.Id == result.FileId);
        stored.Category.Should().Be(LibraryFileCategory.GoldenIdeas,
            "the requested institutional category must be persisted on the pending row");
    }

    [Fact]
    public async Task RequestUploadUrl_CategoryDefaultsToNull_ForLegacyCallers()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, storage, _, _) = Create(db);
        storage.Setup(service => service.GetSignedUploadUrlAsync(It.IsAny<string>(), "application/pdf", It.IsAny<TimeSpan>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://storage.example.com/signed-put");

        var result = await handler.Handle(new RequestUploadUrlCommand(
            "f.pdf", "application/pdf", 1024, subject.Id, null, "Pdf", "عنوان", null, Guid.NewGuid()), CancellationToken.None);

        var stored = db.LibraryFiles.AsNoTracking().Single(file => file.Id == result.FileId);
        stored.Category.Should().BeNull("omitting the category must leave the column NULL (legacy-compatible)");
    }

    // ===== A2-5: HTML sanitization on upload completion =====

    private static async Task<LibraryFile> SeedHtmlFileAsync(ApplicationDbContext db, string fileKey)
    {
        var subject = db.Subjects.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = LibraryFileType.Html,
            Category = LibraryFileCategory.Lecture,
            Title = "ملف HTML اختبار التعقيم",
            FileUrl = fileKey,
            FileSize = 512,
            FileFormat = "text/html",
            Status = ContentStatus.Draft,
            VirusScanStatus = VirusScanStatus.Pending
        };
        db.LibraryFiles.Add(file);
        await db.SaveChangesAsync();
        return file;
    }

    private static CompleteUploadCommand CompleteCommand(LibraryFile file, long actualSize = 512) =>
        new(file.Id, file.FileUrl, actualSize, null, null, null, Guid.NewGuid());

    [Fact]
    public async Task CompleteUpload_HtmlFile_InvokesSanitizer_WithActualSize()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/html/one";
        var file = await SeedHtmlFileAsync(db, fileKey);
        var (handler, storage, sanitizer, _) = Create(db);
        storage.Setup(service => service.ExistsAsync(fileKey, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await handler.Handle(CompleteCommand(file, actualSize: 4096), CancellationToken.None);

        sanitizer.Verify(service => service.SanitizeAsync(fileKey, 4096, It.IsAny<CancellationToken>()), Times.Once,
            "an HTML upload must be sanitized in place before it is accepted");
        result.Category.Should().Be("Lecture", "the DTO must expose the institutional category");
    }

    [Fact]
    public async Task CompleteUpload_NonHtmlFile_DoesNotInvokeSanitizer()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/pdf/one";
        var file = await SeedFileAsync(db, fileKey); // pdf seed
        var (handler, storage, sanitizer, _) = Create(db);
        storage.Setup(service => service.ExistsAsync(fileKey, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        await handler.Handle(CompleteCommand(file), CancellationToken.None);

        sanitizer.Verify(service => service.SanitizeAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()), Times.Never,
            "only text/html uploads go through sanitization");
    }

    [Fact]
    public async Task CompleteUpload_SanitizerFailure_DeletesBlob_RejectsWithHtmlSanitizationFailed()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/html/bad";
        var file = await SeedHtmlFileAsync(db, fileKey);
        var (handler, storage, sanitizer, _) = Create(db);
        storage.Setup(service => service.ExistsAsync(fileKey, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        sanitizer.Setup(service => service.SanitizeAsync(fileKey, It.IsAny<long>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("sanitizer fault"));

        var act = () => handler.Handle(CompleteCommand(file), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "HTML_SANITIZATION_FAILED",
                "a failed sanitization must reject the upload with a distinct error code");
        storage.Verify(service => service.DeleteAsync(fileKey, It.IsAny<CancellationToken>()), Times.Once,
            "the unsanitizable blob must be deleted from storage");
        db.LibraryFiles.AsNoTracking().Single(stored => stored.Id == file.Id).VirusScanStatus
            .Should().Be(VirusScanStatus.Error, "the row must be parked in Error so it can never be published");
    }

    [Fact]
    public async Task CompleteUpload_HtmlFile_OversizedActualSize_Rejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/html/huge";
        var file = await SeedHtmlFileAsync(db, fileKey);
        var (handler, storage, sanitizer, _) = Create(db);
        storage.Setup(service => service.ExistsAsync(fileKey, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var act = () => handler.Handle(CompleteCommand(file, actualSize: 11L * 1024 * 1024), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "FILE_TOO_LARGE",
                "an HTML body above the 10 MB ceiling must be rejected at completion time (defensive gate)");
        sanitizer.Verify(service => service.SanitizeAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()), Times.Never,
            "an oversized body must never reach the sanitizer");
    }
}
