using System.Text.Json;
using CMS.Application.Commands.Library;
using CMS.Application.DTOs.Library;
using CMS.Application.Handlers.Library;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Wave 11.8 / F2 — FileAnnotation handler rules: idempotent client-id upserts,
/// owner-scoped deletes (a foreign id is silently ignored), batch/payload caps,
/// duplicate-id rejection, and the /access visibility gate (only live, published,
/// virus-clean files expose an annotation surface).
/// </summary>
public sealed class FileAnnotationHandlersTests
{
    private static FileAnnotationHandlers Create(ApplicationDbContext db) => new(db, new UnitOfWork(db));

    private static async Task<LibraryFile> SeedPdfAsync(ApplicationDbContext db,
        ContentStatus status = ContentStatus.Published, VirusScanStatus scan = VirusScanStatus.Clean)
    {
        var subject = db.Subjects.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = LibraryFileType.Pdf,
            Title = "ملف تعليقات تجريبي",
            FileUrl = $"library/{Guid.NewGuid():N}/{Guid.NewGuid():N}",
            FileSize = 2048,
            FileFormat = "application/pdf",
            Status = status,
            VirusScanStatus = scan
        };
        db.LibraryFiles.Add(file);
        await db.SaveChangesAsync();
        return file;
    }

    private static FileAnnotationUpsertDto Upsert(Guid id, int page = 1, string type = "Ink", object? payload = null) =>
        new(id, page, type,
            JsonSerializer.SerializeToElement(payload ?? new
            {
                points = new[] { new { x = 0.1, y = 0.2 }, new { x = 0.3, y = 0.4 } },
                color = "#ef4444",
                width = 0.004
            }));

    private static SaveFileAnnotationsDto Batch(params FileAnnotationUpsertDto[] upserts) =>
        new(upserts.ToList(), new List<Guid>());

    [Fact]
    public async Task Save_NewClientIds_InsertsWithClientIdsPreserved()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var studentId = TestDbHelper.GetTestStudent(db).Id;
        var clientId = Guid.NewGuid();

        var result = await Create(db).Handle(
            new SaveFileAnnotationsCommand(file.Id, studentId, Batch(Upsert(clientId, page: 3))), CancellationToken.None);

        result.AppliedCount.Should().Be(1);
        var row = db.FileAnnotations.AsNoTracking().Single(a => a.FileId == file.Id);
        row.Id.Should().Be(clientId, "the client-generated id is the primary key — retried batches stay idempotent");
        row.StudentId.Should().Be(studentId);
        row.PageNumber.Should().Be(3);
        row.AnnotationType.Should().Be(FileAnnotationType.Ink);
    }

    [Fact]
    public async Task Save_SameIdAcrossBatches_UpdatesInPlace_NoDuplicateRows()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var studentId = TestDbHelper.GetTestStudent(db).Id;
        var handler = Create(db);
        var clientId = Guid.NewGuid();

        await handler.Handle(new SaveFileAnnotationsCommand(file.Id, studentId,
            Batch(Upsert(clientId, payload: new { points = new[] { new { x = 0.1, y = 0.1 } }, color = "#000000", width = 0.002 }))),
            CancellationToken.None);
        await handler.Handle(new SaveFileAnnotationsCommand(file.Id, studentId,
            Batch(Upsert(clientId, page: 2, payload: new { points = new[] { new { x = 0.5, y = 0.5 } }, color = "#111111", width = 0.006 }))),
            CancellationToken.None);

        db.FileAnnotations.AsNoTracking().Count(a => a.FileId == file.Id).Should().Be(1,
            "the same client id must upsert, never duplicate");
        var row = db.FileAnnotations.AsNoTracking().Single(a => a.FileId == file.Id);
        row.PageNumber.Should().Be(2);
        row.Payload.Should().Contain("0.5");
    }

    [Fact]
    public async Task Save_DuplicateIdsWithinOneBatch_Rejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var studentId = TestDbHelper.GetTestStudent(db).Id;
        var clientId = Guid.NewGuid();

        var act = () => Create(db).Handle(
            new SaveFileAnnotationsCommand(file.Id, studentId, Batch(Upsert(clientId), Upsert(clientId, page: 2))),
            CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "ANNOTATION_DUPLICATE_ID");
    }

    [Fact]
    public async Task Save_DeleteIsOwnerScoped_ForeignIdsIgnored()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var owner = TestDbHelper.GetTestStudent(db);
        var foreigner = Student.Create("0997777777", "hashed_password_123", "طالب آخر");
        db.Students.Add(foreigner);
        await db.SaveChangesAsync();

        var foreignRow = new FileAnnotation(Guid.NewGuid(), file.Id, foreigner.Id, 1, FileAnnotationType.Highlight,
            JsonSerializer.Serialize(new { rects = new[] { new { x = 0.1, y = 0.2, w = 0.3, h = 0.02 } }, color = "#facc15" }));
        db.FileAnnotations.Add(foreignRow);
        await db.SaveChangesAsync();

        var result = await Create(db).Handle(
            new SaveFileAnnotationsCommand(file.Id, owner.Id, new SaveFileAnnotationsDto(new List<FileAnnotationUpsertDto>(), new List<Guid> { foreignRow.Id })),
            CancellationToken.None);

        result.AppliedCount.Should().Be(0, "a student can never delete another student's annotation");
        db.FileAnnotations.AsNoTracking().Any(a => a.Id == foreignRow.Id).Should().BeTrue();
    }

    [Fact]
    public async Task Save_RejectsOversizedPayload()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var studentId = TestDbHelper.GetTestStudent(db).Id;
        var huge = new string('x', 9000);

        var act = () => Create(db).Handle(
            new SaveFileAnnotationsCommand(file.Id, studentId,
                Batch(Upsert(Guid.NewGuid(), payload: new { blob = huge }))),
            CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "ANNOTATION_PAYLOAD_TOO_LARGE");
    }

    [Fact]
    public async Task Save_RejectsMoreThan200Upserts()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var studentId = TestDbHelper.GetTestStudent(db).Id;
        var upserts = Enumerable.Range(0, 201).Select(_ => Upsert(Guid.NewGuid())).ToList();

        var act = () => Create(db).Handle(
            new SaveFileAnnotationsCommand(file.Id, studentId, new SaveFileAnnotationsDto(upserts, new List<Guid>())),
            CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "ANNOTATION_BATCH_TOO_LARGE");
    }

    [Theory]
    [InlineData(0, "Ink", "INVALID_ANNOTATION_PAGE")]
    [InlineData(-4, "Ink", "INVALID_ANNOTATION_PAGE")]
    [InlineData(1, "Sticker", "INVALID_ANNOTATION_TYPE")]
    public async Task Save_RejectsInvalidPageAndType(int page, string type, string expectedCode)
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var studentId = TestDbHelper.GetTestStudent(db).Id;

        var act = () => Create(db).Handle(
            new SaveFileAnnotationsCommand(file.Id, studentId, Batch(Upsert(Guid.NewGuid(), page, type))),
            CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == expectedCode);
    }

    [Fact]
    public async Task Save_RejectsEmptyClientId()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var studentId = TestDbHelper.GetTestStudent(db).Id;

        var act = () => Create(db).Handle(
            new SaveFileAnnotationsCommand(file.Id, studentId, Batch(Upsert(Guid.Empty))),
            CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Where(ex => ex.ErrorCode == "INVALID_ANNOTATION_ID");
    }

    [Fact]
    public async Task Get_ReturnsOnlyOwnRowsOrderedByPage()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var owner = TestDbHelper.GetTestStudent(db);
        var foreigner = Student.Create("0998888888", "hashed_password_123", "طالب ثانٍ");
        db.Students.Add(foreigner);
        await db.SaveChangesAsync();

        db.FileAnnotations.Add(new FileAnnotation(Guid.NewGuid(), file.Id, owner.Id, 5, FileAnnotationType.Ink, "{}"));
        db.FileAnnotations.Add(new FileAnnotation(Guid.NewGuid(), file.Id, owner.Id, 2, FileAnnotationType.Highlight,
            JsonSerializer.Serialize(new { rects = new[] { new { x = 0.1, y = 0.2, w = 0.3, h = 0.02 } }, color = "#facc15" })));
        db.FileAnnotations.Add(new FileAnnotation(Guid.NewGuid(), file.Id, foreigner.Id, 1, FileAnnotationType.Ink, "{}"));
        await db.SaveChangesAsync();

        var rows = await Create(db).Handle(new GetFileAnnotationsQuery(file.Id, owner.Id), CancellationToken.None);

        rows.Should().HaveCount(2, "another student's rows must never leak into the response");
        rows.Select(r => r.PageNumber).Should().ContainInOrder(2, 5);
        rows.Single(r => r.PageNumber == 2).AnnotationType.Should().Be("Highlight");
        rows.Single(r => r.PageNumber == 5).Payload.ValueKind.Should().Be(JsonValueKind.Object);
    }

    [Fact]
    public async Task Save_ArchivedFile_ThrowsNotFound_MirrorsAccessGate()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db, status: ContentStatus.Archived);
        var studentId = TestDbHelper.GetTestStudent(db).Id;

        var act = () => Create(db).Handle(
            new SaveFileAnnotationsCommand(file.Id, studentId, Batch(Upsert(Guid.NewGuid()))),
            CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>(
            "an archived file loses its annotation surface together with its reading surface");
    }
}
