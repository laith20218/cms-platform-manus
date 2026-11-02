using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Library;
using CMS.Application.DTOs.Library;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Library;

/// <summary>
/// Wave 12.5.B — student PDF page bookmarks: read the caller's own bookmarks for one
/// file, add/refresh one page idempotently, and delete one of the caller's rows.
///
/// Ported from the client-only localStorage store (`cms:pdf:bookmarks:<fileId>`): the
/// per-file list stays page-ascending and deduped by page — the dedupe is now a
/// DATABASE constraint (unique StudentId+FileId+PageNumber) and the upsert semantics
/// ("same page again refreshes the snippet") live here.
///
/// Ownership model: rows are strictly per-student. GET and upsert only ever touch the
/// caller's rows; DELETE raises ForbiddenException for a foreign bookmarkId (the
/// MediaBookmark precedent — a 403, not a silent no-op, because the client addressed a
/// specific row and deserves the truth).
///
/// Visibility gate mirrors /access and annotations: only live (not deleted), Published,
/// virus-clean files expose a bookmark surface — an archived or infected file loses its
/// bookmark surface together with its reading surface.
/// </summary>
public class FileBookmarkHandlers :
    IRequestHandler<GetFileBookmarksQuery, List<FileBookmarkDto>>,
    IRequestHandler<UpsertFileBookmarkCommand, FileBookmarkDto>,
    IRequestHandler<DeleteFileBookmarkCommand, Unit>
{
    private const int MaxSnippetChars = 120;

    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;

    public FileBookmarkHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork)
    {
        _db = db;
        _unitOfWork = unitOfWork;
    }

    public async Task<List<FileBookmarkDto>> Handle(GetFileBookmarksQuery req, CancellationToken ct)
    {
        await EnsureReadableFileAsync(req.FileId, ct);

        var rows = await _db.FileBookmarks.AsNoTracking()
            .Where(b => b.FileId == req.FileId && b.StudentId == req.StudentId)
            .OrderBy(b => b.PageNumber).ThenBy(b => b.CreatedAt)
            .ToListAsync(ct);

        return rows.Select(b => new FileBookmarkDto(b.Id, b.PageNumber, b.Snippet, b.CreatedAt, b.UpdatedAt))
            .ToList();
    }

    public async Task<FileBookmarkDto> Handle(UpsertFileBookmarkCommand req, CancellationToken ct)
    {
        var page = req.Bookmark.PageNumber;
        if (page < 1)
            throw new DomainException("رقم الصفحة غير صالح", "INVALID_BOOKMARK_PAGE");
        var snippet = string.IsNullOrWhiteSpace(req.Bookmark.Snippet) ? null : req.Bookmark.Snippet.Trim();
        if (snippet is not null && snippet.Length > MaxSnippetChars)
            throw new DomainException("نص العلامة يتجاوز الحد المسموح", "BOOKMARK_SNIPPET_TOO_LARGE");

        await EnsureReadableFileAsync(req.FileId, ct);

        // Idempotent per (Student, File, Page): the unique triple turns re-adds into
        // snippet refreshes, so a retried POST can never duplicate a row.
        var row = await _db.FileBookmarks
            .FirstOrDefaultAsync(b => b.FileId == req.FileId && b.StudentId == req.StudentId && b.PageNumber == page, ct);
        if (row is null)
        {
            row = new FileBookmark { FileId = req.FileId, StudentId = req.StudentId, PageNumber = page, Snippet = snippet };
            _db.FileBookmarks.Add(row);
        }
        else if (row.Snippet != snippet)
        {
            row.Snippet = snippet;
        }

        await _unitOfWork.SaveChangesAsync(ct);
        return new FileBookmarkDto(row.Id, row.PageNumber, row.Snippet, row.CreatedAt, row.UpdatedAt);
    }

    public async Task<Unit> Handle(DeleteFileBookmarkCommand req, CancellationToken ct)
    {
        var row = await _db.FileBookmarks
            .FirstOrDefaultAsync(b => b.Id == req.BookmarkId, ct)
            ?? throw new NotFoundException("FileBookmark", req.BookmarkId);
        if (row.StudentId != req.StudentId)
            throw new ForbiddenException("لا يمكنك حذف علامة تخص طالباً آخر");

        _db.FileBookmarks.Remove(row);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    /// <summary>Same visibility rules the /access endpoint enforces for reading bytes.</summary>
    private async Task EnsureReadableFileAsync(Guid fileId, CancellationToken ct)
    {
        var fileExists = await _db.LibraryFiles.AsNoTracking()
            .AnyAsync(f => f.Id == fileId && f.DeletedAt == null
                && f.Status == ContentStatus.Published
                && f.VirusScanStatus == VirusScanStatus.Clean, ct);
        if (!fileExists)
            throw new NotFoundException("LibraryFile", fileId);
    }
}
