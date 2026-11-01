using CMS.Application.BackgroundJobs;
using CMS.Application.Commands.Library;
using CMS.Application.DTOs.Library;
using CMS.Application.Handlers.Library;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Security;
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
        // Wave 13 — default loose setups: the HTML pipeline consumes the returned body
        // (it stores the {key}-sanitized / {key}-ready siblings), so un-stubbed tests
        // get a valid string instead of a null one.
        sanitizer.Setup(service => service.SanitizeAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("<p>نص نظيف</p>");
        sanitizer.Setup(service => service.SanitizeTrustedAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("<p>نص نظيف</p><script>cmsInteractive();</script>");
        var handler = new LibraryHandlers(
            db,
            new UnitOfWork(db),
            storage.Object,
            scanner.Object,
            entitlements.Object,
            settingsService.Object,
            sanitizer.Object,
            NullLogger<LibraryHandlers>.Instance, NoOp.ActivityWriter(),
            new TranscodingChannelQueue(), // Push 10.3: real inert queue — jobs buffer, nothing consumes them in tests
            new PdfProcessingChannelQueue(), // Wave 11.9: real inert queue — same rationale
            new HtmlCspInjectorService()); // Wave 13: real stateless injector (pure transform — no mock value)
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
    [InlineData("text/html", "Html", (long)21 * 1024 * 1024)]            // default html limit = 20 MB (Wave 13 / G-6)
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
    [InlineData("text/html", "Html", (long)20 * 1024 * 1024)]            // exactly at the html limit (Wave 13 / G-6)
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
        // Wave 13 pipeline: the clean body lands on the -sanitized temp key, the
        // CSP-injected final body on the -ready key (both text/html PUTs).
        SetupHtmlSiblingPuts(storage);

        var result = await handler.Handle(CompleteCommand(file, actualSize: 4096), CancellationToken.None);

        sanitizer.Verify(service => service.SanitizeAsync(fileKey, 4096, It.IsAny<CancellationToken>()), Times.Once,
            "an HTML upload must be sanitized before it is accepted");
        result.Category.Should().Be("Lecture", "the DTO must expose the institutional category");
        // Wave 13 — sibling-key swap + terminal status (Ghostscript pattern).
        storage.Verify(service => service.PutAsync($"{fileKey}-sanitized", It.IsAny<Stream>(), "text/html", It.IsAny<CancellationToken>()), Times.Once);
        storage.Verify(service => service.PutAsync($"{fileKey}-ready", It.IsAny<Stream>(), "text/html", It.IsAny<CancellationToken>()), Times.Once);
        db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id).FileUrl
            .Should().EndWith("-ready", "the pipeline swaps FileUrl to the CSP-injected sibling object");
        result.ContentProcessingStatus.Should().Be(ContentProcessingStatus.Ready);
        result.EnableScripts.Should().BeFalse("the strict policy is the default for HTML rows");
    }

    [Fact]
    public async Task CompleteUpload_HtmlFile_TrustedPath_UsesScriptPreservingSanitizer_AndSwapsToReady()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/html/trusted";
        var file = await SeedHtmlFileAsync(db, fileKey);
        file.EnableScripts = true; // Q1 ruling — the upload-url-persisted authoritative flag
        var (handler, storage, sanitizer, _) = Create(db);
        storage.Setup(service => service.ExistsAsync(fileKey, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        SetupHtmlSiblingPuts(storage);
        sanitizer.Setup(service => service.SanitizeTrustedAsync(fileKey, It.IsAny<long>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("<p>درس تفاعلي</p><script>cmsInteractive();</script>");

        var result = await handler.Handle(CompleteCommand(file), CancellationToken.None);

        sanitizer.Verify(service => service.SanitizeTrustedAsync(fileKey, It.IsAny<long>(), It.IsAny<CancellationToken>()), Times.Once,
            "EnableScripts rows take the script-preserving trusted policy");
        sanitizer.Verify(service => service.SanitizeAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()), Times.Never,
            "the strict sanitizer must not run on trusted rows");
        result.ContentProcessingStatus.Should().Be(ContentProcessingStatus.Ready);
        result.EnableScripts.Should().BeTrue();
        db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id).FileUrl.Should().EndWith("-ready");
    }

    [Fact]
    public async Task RequestUploadUrl_PersistsEnableScripts_OnlyForHtml()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, storage, _, _) = Create(db);
        storage.Setup(service => service.GetSignedUploadUrlAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://storage.example.com/signed-put");

        var html = await handler.Handle(new RequestUploadUrlCommand(
            "lesson.html", "text/html", 1024, subject.Id, null, "Html", "درس تفاعلي", null, Guid.NewGuid(),
            EnableScripts: true), CancellationToken.None);
        db.LibraryFiles.AsNoTracking().Single(f => f.Id == html.FileId).EnableScripts.Should().BeTrue(
            "the trusted flag persists on text/html rows exactly as requested");

        var pdf = await handler.Handle(new RequestUploadUrlCommand(
            "f.pdf", "application/pdf", 1024, subject.Id, null, "Pdf", "عنوان", null, Guid.NewGuid(),
            EnableScripts: true), CancellationToken.None);
        db.LibraryFiles.AsNoTracking().Single(f => f.Id == pdf.FileId).EnableScripts.Should().BeFalse(
            "a non-HTML row can never carry the trusted flag (mismatched-body defense)");
    }

    /// <summary>Wave 13 — the HTML pipeline writes two sibling objects on the strict
    /// storage mock; every HTML complete-upload test needs this setup.</summary>
    private static void SetupHtmlSiblingPuts(Mock<IFileStorageService> storage) =>
        storage.Setup(service => service.PutAsync(It.IsAny<string>(), It.IsAny<Stream>(), "text/html", It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

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

    // ===== Push 10.5 — optional metadata override + difficulty exposure =====

    [Fact]
    public async Task CompleteUpload_AppliesOptionalMetadataOverride()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/pdf/meta";
        var file = await SeedFileAsync(db, fileKey);
        var (handler, storage, _, _) = Create(db);
        storage.Setup(service => service.ExistsAsync(fileKey, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await handler.Handle(new CompleteUploadCommand(
            file.Id, fileKey, 2048, null, null, null, Guid.NewGuid(),
            Title: "  عنوان معدل  ",
            Description: "وصف مكتبي جديد",
            Difficulty: Difficulty.Hard), CancellationToken.None);

        result.Title.Should().Be("عنوان معدل");
        result.Description.Should().Be("وصف مكتبي جديد");
        result.Difficulty.Should().Be(Difficulty.Hard);
        var stored = db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id);
        stored.Title.Should().Be("عنوان معدل");
        stored.Description.Should().Be("وصف مكتبي جديد");
        stored.Difficulty.Should().Be(Difficulty.Hard);
    }

    [Fact]
    public async Task CompleteUpload_WithoutMetadata_KeepsUploadUrlTimeValues()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/pdf/keep";
        var file = await SeedFileAsync(db, fileKey);
        var (handler, storage, _, _) = Create(db);
        storage.Setup(service => service.ExistsAsync(fileKey, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var result = await handler.Handle(CompleteCommand(file), CancellationToken.None);

        var stored = db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id);
        stored.Title.Should().Be("ملف اختبار الحذف", "null keys keep the upload-url-time title");
        stored.Difficulty.Should().Be(Difficulty.Easy, "the entity default tier applies when the body omits difficulty");
        result.Difficulty.Should().Be(Difficulty.Easy);
        result.ProcessingStatus.Should().BeNull("non-video files never enter the transcoding pipeline");
        result.ProcessingError.Should().BeNull();
        result.HlsKey.Should().BeNull();
    }

    [Fact]
    public async Task UpdateLibraryFile_PatchesDifficulty_LeavesAbsentTierUntouched()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/pdf/update";
        var file = await SeedFileAsync(db, fileKey);
        db.LibraryFiles.Update(file);
        file.Difficulty = Difficulty.Medium;
        await db.SaveChangesAsync();
        var (handler, _, _, _) = Create(db);

        var updated = await handler.Handle(new UpdateLibraryFileCommand(
            file.Id, "عنوان محدث", null, new List<string>(), null, Difficulty.Hard), CancellationToken.None);

        updated.Difficulty.Should().Be(Difficulty.Hard);
        db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id).Difficulty.Should().Be(Difficulty.Hard);

        // Absent key (old callers) — PATCH semantics keep the stored tier.
        var untouched = await handler.Handle(new UpdateLibraryFileCommand(
            file.Id, "عنوان آخر", null, new List<string>(), null), CancellationToken.None);

        untouched.Difficulty.Should().Be(Difficulty.Hard, "null difficulty leaves the stored tier untouched");
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
        var stored = db.LibraryFiles.AsNoTracking().Single(stored => stored.Id == file.Id);
        stored.VirusScanStatus
            .Should().Be(VirusScanStatus.Error, "the row must be parked in Error so it can never be published");
        stored.ContentProcessingStatus
            .Should().Be(ContentProcessingStatus.Failed, "Wave 13: the pipeline records the terminal failure stage");
        stored.FileUrl.Should().Be(fileKey, "a failed pipeline never swaps FileUrl — the original key stays authoritative");
    }

    [Fact]
    public async Task CompleteUpload_HtmlFile_OversizedActualSize_Rejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/html/huge";
        var file = await SeedHtmlFileAsync(db, fileKey);
        var (handler, storage, sanitizer, _) = Create(db);
        storage.Setup(service => service.ExistsAsync(fileKey, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var act = () => handler.Handle(CompleteCommand(file, actualSize: 21L * 1024 * 1024), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "FILE_TOO_LARGE",
                "an HTML body above the 20 MB ceiling must be rejected at completion time (defensive gate)");
        sanitizer.Verify(service => service.SanitizeAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()), Times.Never,
            "an oversized body must never reach the sanitizer");
    }

    // ===== Wave 11.9 — Ghostscript PDF pipeline gates =====

    /// <summary>Self-contained handler factory for the 11.9 tests: exposes the REAL pdf
    /// queue so tests can observe the enqueue side effect (the shared Create() above
    /// keeps its inert queue private).</summary>
    private static (LibraryHandlers Handler, PdfProcessingChannelQueue PdfQueue) CreateWithPdfQueue(
        ApplicationDbContext db,
        Mock<IFileStorageService> storage,
        Mock<ISystemSettingsService>? settings = null)
    {
        var scanner = new Mock<IFileScanner>();
        scanner.Setup(service => service.ScanAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FileScanResult(IsClean: true, IsInfected: false, Verdict: "trusted"));
        var settingsService = settings ?? new Mock<ISystemSettingsService>();
        if (settings is null)
        {
            settingsService.Setup(service => service.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((string?)null);
        }
        var pdfQueue = new PdfProcessingChannelQueue();
        var sanitizer = new Mock<IHtmlBlobSanitizer>();
        sanitizer.Setup(service => service.SanitizeAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("<p>نص نظيف</p>");
        sanitizer.Setup(service => service.SanitizeTrustedAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("<p>نص نظيف</p><script>cmsInteractive();</script>");
        var handler = new LibraryHandlers(
            db, new UnitOfWork(db), storage.Object, scanner.Object,
            new Mock<IEntitlementService>().Object, settingsService.Object,
            sanitizer.Object, NullLogger<LibraryHandlers>.Instance,
            NoOp.ActivityWriter(), new TranscodingChannelQueue(), pdfQueue,
            new HtmlCspInjectorService());
        return (handler, pdfQueue);
    }

    [Fact]
    public async Task CompleteUpload_PdfFile_MarksPending_AndEnqueuesGhostscriptJob()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        const string fileKey = "library/pdf/gs";
        var file = await SeedFileAsync(db, fileKey);
        var storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        storage.Setup(service => service.ExistsAsync(fileKey, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var (handler, pdfQueue) = CreateWithPdfQueue(db, storage);

        var result = await handler.Handle(CompleteCommand(file), CancellationToken.None);

        result.PdfProcessingStatus.Should().Be(PdfProcessingStatus.Pending,
            "application/pdf uploads enter the Ghostscript pipeline at complete-upload");
        result.FontPipelineFixed.Should().BeFalse("the worker has not produced the fixed object yet");
        result.FontProcessingError.Should().BeNull();
        result.DiagnosticReport.Should().BeNull("a Pending row has no diagnostics yet");
        result.HealthStatus.Should().BeNull(
            "R22.5.1: an in-flight row is not classified yet — the badge only exists on Ready");
        db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id).PdfProcessingStatus
            .Should().Be(PdfProcessingStatus.Pending, "the status commit precedes the enqueue (Push 10.3 rationale)");
        pdfQueue.Reader.TryPeek(out var job).Should().BeTrue("complete-upload must enqueue the Ghostscript pass after the commit");
        job.FileId.Should().Be(file.Id);
    }

    [Fact]
    public async Task CompleteUpload_NonPdfFile_KeepsPdfPipelineNull()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedHtmlFileAsync(db, "library/html/nogs");
        var storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        storage.Setup(service => service.ExistsAsync("library/html/nogs", It.IsAny<CancellationToken>())).ReturnsAsync(true);
        SetupHtmlSiblingPuts(storage); // Wave 13: the HTML pipeline runs for non-PDF files too
        var (handler, pdfQueue) = CreateWithPdfQueue(db, storage);

        var result = await handler.Handle(CompleteCommand(file), CancellationToken.None);

        result.PdfProcessingStatus.Should().BeNull("non-PDF files never enter the Ghostscript pipeline");
        result.HealthStatus.Should().BeNull("R22.5.1: no pipeline → no health classification");
        pdfQueue.Reader.TryPeek(out _).Should().BeFalse("no PDF job may be enqueued for an HTML upload");
    }

    [Fact]
    public async Task PublishLibraryFile_PdfProcessingFailed_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedFileAsync(db, "library/pdf/failed");
        file.PdfProcessingStatus = PdfProcessingStatus.Failed;
        file.ProcessingError = "Ghostscript exited with code 1: Unrecoverable error";
        file.Status = ContentStatus.Draft; // unpublished — a publish attempt must NOT flip it
        await db.SaveChangesAsync();
        var (handler, _, _, _) = Create(db);

        var act = () => handler.Handle(new PublishLibraryFileCommand(file.Id, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "PDF_PROCESSING_FAILED",
                "a PDF whose Ghostscript pass failed must never be published to students");
        db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id).Status
            .Should().Be(ContentStatus.Draft, "the rejected publish must leave the row unpublished");
    }

    [Fact]
    public async Task PublishLibraryFile_PdfReadyWithFixedObject_Succeeds()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedFileAsync(db, "library/pdf/fixedkey");
        file.PdfProcessingStatus = PdfProcessingStatus.Ready;
        file.FileUrl = "library/pdf/fixedkey-fixed";
        // R22.2 — a Ready row whose run carried warnings carries the Arabic report.
        file.ProcessingError = "الخط الأصلي (SakkalMajalla) غير مدمج، وتم استبداله بـ (Amiri).";
        await db.SaveChangesAsync();
        var (handler, _, _, _) = Create(db);

        var result = await handler.Handle(new PublishLibraryFileCommand(file.Id, Guid.NewGuid()), CancellationToken.None);

        result.PdfProcessingStatus.Should().Be(PdfProcessingStatus.Ready);
        result.FontPipelineFixed.Should().BeTrue("FileUrl now points at the {key}-fixed object");
        result.DiagnosticReport.Should().Be(file.ProcessingError,
            "R22.2: Ready rows expose the stored font report via diagnosticReport");
        result.HealthStatus.Should().Be(PdfHealthStatus.BrokenArabic,
            "R22.5.1: Ready + diagnostics present → BrokenArabic (يحتاج معالجة بصرية)");
    }

    [Fact]
    public async Task PublishLibraryFile_PdfReadyButOverCeilingSkip_SucceedsWithoutFixedFlag()
    {
        // The over-ceiling skip marks Ready while FileUrl still points at the ORIGINAL
        // object — publishable, but FontPipelineFixed stays false (R19 fallback).
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedFileAsync(db, "library/pdf/original");
        file.PdfProcessingStatus = PdfProcessingStatus.Ready;
        await db.SaveChangesAsync();
        var (handler, _, _, _) = Create(db);

        var result = await handler.Handle(new PublishLibraryFileCommand(file.Id, Guid.NewGuid()), CancellationToken.None);

        result.FontPipelineFixed.Should().BeFalse("no -fixed object was produced; the player keeps R19 path rendering");
        result.DiagnosticReport.Should().BeNull("the ceiling skip runs no Ghostscript pass → no diagnostics");
        result.HealthStatus.Should().Be(PdfHealthStatus.Healthy,
            "R22.5.1: Ready + empty diagnostics → Healthy (سليم البنية)");
    }

    [Fact]
    public void PdfHealthClassification_Matrix_CoversEveryPipelineState()
    {
        // R22.5.1 — the exact task-book binary rule, plus the unclassifiable states.
        const string report = "الخط الأصلي (SakkalMajalla) غير مدمج، وتم استبداله بـ (Amiri).";

        PdfHealthStatus.Classify(PdfProcessingStatus.Ready, null)
            .Should().Be(PdfHealthStatus.Healthy, "Ready + no diagnostics → Healthy");
        PdfHealthStatus.Classify(PdfProcessingStatus.Ready, "")
            .Should().Be(PdfHealthStatus.Healthy, "empty diagnostics read as warning-free");
        PdfHealthStatus.Classify(PdfProcessingStatus.Ready, "   ")
            .Should().Be(PdfHealthStatus.Healthy, "whitespace-only diagnostics read as warning-free");
        PdfHealthStatus.Classify(PdfProcessingStatus.Ready, report)
            .Should().Be(PdfHealthStatus.BrokenArabic, "Ready + substitution report → BrokenArabic");

        PdfHealthStatus.Classify(PdfProcessingStatus.Pending, null)
            .Should().BeNull("in-flight rows are not classified yet");
        PdfHealthStatus.Classify(PdfProcessingStatus.Normalizing, report)
            .Should().BeNull("the Ghostscript pass is still running");
        PdfHealthStatus.Classify(PdfProcessingStatus.Failed, "Ghostscript exited with code 1")
            .Should().BeNull("a Failed row's health is unclassifiable — the error modal carries the evidence");
        PdfHealthStatus.Classify(null, null)
            .Should().BeNull("the pipeline never ran (non-PDF / legacy row)");
    }
}
