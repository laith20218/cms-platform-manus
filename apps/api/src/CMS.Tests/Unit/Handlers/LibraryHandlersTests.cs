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
/// </summary>
public sealed class LibraryHandlersTests
{
    private static (LibraryHandlers Handler, Mock<IFileStorageService> Storage) Create(ApplicationDbContext db)
    {
        var storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        storage.Setup(service => service.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        var scanner = new Mock<IFileScanner>();
        var entitlements = new Mock<IEntitlementService>();
        var handler = new LibraryHandlers(
            db,
            new UnitOfWork(db),
            storage.Object,
            scanner.Object,
            entitlements.Object,
            NullLogger<LibraryHandlers>.Instance);
        return (handler, storage);
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
        var (handler, storage) = Create(db);

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
        var (handler, storage) = Create(db);
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
        var (handler, _) = Create(db);

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
        var (handler, storage) = Create(db);
        storage.Setup(service => service.GetSignedUploadUrlAsync(It.IsAny<string>(), contentType, It.IsAny<TimeSpan>()))
            .ReturnsAsync("https://storage.example.com/signed-put");
        // Type enum must match the allowed document family (Pdf/Html/Image).
        var type = contentType.StartsWith("image/") ? "Image" : contentType == "text/html" ? "Html" : "Pdf";

        var result = await handler.Handle(new RequestUploadUrlCommand(
            "file.pdf", contentType, 1024, subject.Id, null, type, "عنوان", null, Guid.NewGuid()), CancellationToken.None);

        result.UploadUrl.Should().NotBeNullOrWhiteSpace();
        result.FileKey.Should().StartWith("library/");
    }
}
