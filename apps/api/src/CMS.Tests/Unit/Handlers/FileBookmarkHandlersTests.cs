using CMS.Application.Commands.Library;
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
/// Wave 12.5.B — FileBookmark handler rules: idempotent per-page upserts (same page
/// refreshes the snippet, never duplicates — the localStorage dedupe contract now
/// enforced by the handler AND the DB unique triple), owner-scoped reads, owner-only
/// deletes (a foreign bookmarkId is a 403 ForbiddenException, MediaBookmark precedent),
/// page ≥ 1 validation, and the /access visibility gate (only live, published,
/// virus-clean files expose a bookmark surface).
///
/// §11 honesty note: the EF InMemory provider does not enforce relational unique
/// indexes or CHECK constraints — the unique-triple and page≥1 rules are covered here
/// at the handler layer (the enforcing code path) and in the migration itself
/// (20261102043218_AddFileBookmarks: ix_file_bookmarks_student_id_file_id_page_number
/// unique + ck_file_bookmarks_page), which the Postgres integration ladder applies.
/// </summary>
public sealed class FileBookmarkHandlersTests
{
    private static FileBookmarkHandlers Create(ApplicationDbContext db) => new(db, new UnitOfWork(db));

    private static async Task<LibraryFile> SeedPdfAsync(ApplicationDbContext db,
        ContentStatus status = ContentStatus.Published, VirusScanStatus scan = VirusScanStatus.Clean)
    {
        var subject = db.Subjects.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = LibraryFileType.Pdf,
            Title = "ملف علامات تجريبي",
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

    private static async Task<Student> SeedForeignStudentAsync(ApplicationDbContext db)
    {
        var foreign = Student.Create("0991234599", "hashed_password_foreign", "طالب آخر");
        db.Students.Add(foreign);
        await db.SaveChangesAsync();
        return foreign;
    }

    [Fact]
    public async Task Upsert_NewPage_InsertsRowAndReturnsDto()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var studentId = TestDbHelper.GetTestStudent(db).Id;

        var dto = await Create(db).Handle(
            new UpsertFileBookmarkCommand(file.Id, studentId, new(7, "Cardiology — page seven")), CancellationToken.None);

        dto.PageNumber.Should().Be(7);
        dto.Snippet.Should().Be("Cardiology — page seven");
        var row = db.FileBookmarks.AsNoTracking().Single(b => b.FileId == file.Id);
        row.StudentId.Should().Be(studentId);
        row.PageNumber.Should().Be(7);
    }

    [Fact]
    public async Task Upsert_SamePageTwice_RefreshesSnippetWithoutDuplicating()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var studentId = TestDbHelper.GetTestStudent(db).Id;
        var handler = Create(db);

        var first = await handler.Handle(
            new UpsertFileBookmarkCommand(file.Id, studentId, new(3, "first snippet")), CancellationToken.None);
        var second = await handler.Handle(
            new UpsertFileBookmarkCommand(file.Id, studentId, new(3, "refreshed snippet")), CancellationToken.None);

        second.Id.Should().Be(first.Id, "the unique triple makes the re-add an in-place refresh");
        second.Snippet.Should().Be("refreshed snippet");
        db.FileBookmarks.AsNoTracking().Count(b => b.FileId == file.Id).Should().Be(1);
    }

    [Fact]
    public async Task Get_ReturnsOnlyCallerRowsOrderedByPage()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var me = TestDbHelper.GetTestStudent(db).Id;
        var foreign = await SeedForeignStudentAsync(db);
        var handler = Create(db);

        await handler.Handle(new UpsertFileBookmarkCommand(file.Id, me, new(9, null)), CancellationToken.None);
        await handler.Handle(new UpsertFileBookmarkCommand(file.Id, me, new(2, "early")), CancellationToken.None);
        await handler.Handle(new UpsertFileBookmarkCommand(file.Id, foreign.Id, new(5, "not mine")), CancellationToken.None);

        var rows = await Create(db).Handle(new GetFileBookmarksQuery(file.Id, me), CancellationToken.None);
        rows.Select(r => r.PageNumber).Should().Equal([2, 9], "page-ascending, foreign rows excluded");
        rows.Should().OnlyContain(r => r.Snippet != "not mine");
    }

    [Fact]
    public async Task Get_ArchivedFile_ThrowsNotFound()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db, status: ContentStatus.Archived);
        var me = TestDbHelper.GetTestStudent(db).Id;

        var act = () => Create(db).Handle(new GetFileBookmarksQuery(file.Id, me), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>("an archived file loses its bookmark surface with its reading surface");
    }

    [Fact]
    public async Task Upsert_PageZero_ThrowsDomainException()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var me = TestDbHelper.GetTestStudent(db).Id;

        var act = () => Create(db).Handle(
            new UpsertFileBookmarkCommand(file.Id, me, new(0, null)), CancellationToken.None);
        await act.Should().ThrowAsync<DomainException>().Where(e => e.ErrorCode == "INVALID_BOOKMARK_PAGE");
    }

    [Fact]
    public async Task Upsert_SnippetOver120Chars_ThrowsDomainException()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var me = TestDbHelper.GetTestStudent(db).Id;

        var act = () => Create(db).Handle(
            new UpsertFileBookmarkCommand(file.Id, me, new(1, new string('x', 121))), CancellationToken.None);
        await act.Should().ThrowAsync<DomainException>().Where(e => e.ErrorCode == "BOOKMARK_SNIPPET_TOO_LARGE");
    }

    [Fact]
    public async Task Delete_OwnBookmark_RemovesRow()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var me = TestDbHelper.GetTestStudent(db).Id;
        var handler = Create(db);

        var dto = await handler.Handle(
            new UpsertFileBookmarkCommand(file.Id, me, new(4, null)), CancellationToken.None);
        await handler.Handle(new DeleteFileBookmarkCommand(me, dto.Id), CancellationToken.None);

        db.FileBookmarks.AsNoTracking().Any(b => b.Id == dto.Id).Should().BeFalse();
    }

    [Fact]
    public async Task Delete_ForeignBookmark_ThrowsForbidden()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var file = await SeedPdfAsync(db);
        var me = TestDbHelper.GetTestStudent(db).Id;
        var foreign = await SeedForeignStudentAsync(db);

        var dto = await Create(db).Handle(
            new UpsertFileBookmarkCommand(file.Id, foreign.Id, new(4, null)), CancellationToken.None);

        var act = () => Create(db).Handle(new DeleteFileBookmarkCommand(me, dto.Id), CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>("owner-only delete — a foreign bookmarkId is a 403, not a silent no-op");
        db.FileBookmarks.AsNoTracking().Any(b => b.Id == dto.Id).Should().BeTrue("a rejected delete must not remove the owner's row");
    }

    [Fact]
    public async Task Delete_MissingBookmark_ThrowsNotFound()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var me = TestDbHelper.GetTestStudent(db).Id;

        var act = () => Create(db).Handle(new DeleteFileBookmarkCommand(me, Guid.NewGuid()), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }
}
