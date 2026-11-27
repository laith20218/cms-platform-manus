using MediatR;
using CMS.Application.DTOs.Library;
using CMS.Domain.Enums;

namespace CMS.Application.Commands.Library;

// ===== Queries =====
public record GetLibraryFilesQuery(
    Guid StudentId,
    Guid SubjectId,
    string? Type,
    int Page = 1,
    int PageSize = 20,
    // W20.3 — name OR public-code search term (client filter, additive).
    string? Search = null
) : IRequest<PagedResult<LibraryFileListItemDto>>;

public record GetLectureTextFilesQuery(
    Guid StudentId,
    Guid LectureId,
    int Page = 1,
    int PageSize = 20
) : IRequest<PagedResult<LibraryFileListItemDto>>;

public record GetLibraryFileByIdQuery(Guid Id, Guid? StudentId) : IRequest<LibraryFileDto>;

// ===== Access =====
public record GetFileAccessCommand(
    Guid FileId, Guid StudentId
) : IRequest<FileAccessDto>;

// ===== View Recording =====
public record RecordFileViewCommand(
    Guid FileId, Guid StudentId,
    int DurationSeconds, int? PagesViewed, decimal? CompletionPercentage
) : IRequest<Unit>;

// ===== Admin: Upload =====
public record RequestUploadUrlCommand(
    string FileName, string ContentType, long FileSize,
    Guid SubjectId, Guid? LectureId, string Type,
    string Title, string? Description, Guid CreatedBy,
    LibraryFileCategory? Category = null,
    // Wave 13 (F3/Q1) — trusted interactive lesson flag for text/html: persisted on
    // the row at creation time and authoritative for the sanitize/CSP pipeline at
    // complete-upload (the completion body can never escalate it).
    bool EnableScripts = false
) : IRequest<UploadUrlDto>;

public record CompleteUploadCommand(
    Guid FileId, string FileKey, long ActualFileSize,
    int? PagesCount, int? DurationSeconds,
    string? YoutubeVideoId, Guid CreatedBy,
    Guid? SessionId = null,
    // Push 10.5 — optional metadata override (null = keep the values captured at
    // upload-url time); difficulty is new on library files and defaults to Easy.
    string? Title = null,
    string? Description = null,
    Difficulty? Difficulty = null,
    // Push 10.7 — admin-selected transcoding target for video files (absent = keep
    // the stored value, which defaults to Auto).
    TargetQuality? TargetQuality = null,
    // Wave 13 (F3) — accepted for contract symmetry but NOT authoritative: the
    // pipeline reads the EnableScripts value persisted at upload-url time.
    bool EnableScripts = false
) : IRequest<LibraryFileDto>;

// ===== Admin: Update/Delete =====
public record UpdateLibraryFileCommand(
    Guid Id, string Title, string? Description,
    List<string> Tags, Guid? LectureId,
    // Push 10.5 — PATCH-optional difficulty: null leaves the stored tier untouched.
    Difficulty? Difficulty = null,
    // Push 10.7 — PATCH-optional transcoding target: null keeps the stored quality.
    TargetQuality? TargetQuality = null
) : IRequest<LibraryFileDto>;

public record PublishLibraryFileCommand(Guid Id, Guid PublishedBy) : IRequest<LibraryFileDto>;
public record ArchiveLibraryFileCommand(Guid Id, Guid ArchivedBy) : IRequest<LibraryFileDto>;
public record DeleteLibraryFileCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;

// ===== PR-5 — provider-neutral object-retention lifecycle =====

/// <summary>Pulls the asset from circulation on suspicion (malware, legal hold, content
/// review). Students stop seeing the file; the stored object is never touched. A reason
/// is REQUIRED and is recorded with the actor + timestamp on the row and in the audit log.</summary>
public record QuarantineLibraryFileCommand(Guid Id, Guid QuarantinedBy, string Reason) : IRequest<LibraryFileDto>;

/// <summary>Restores the asset: lifts quarantine or clears the tombstone (normal soft
/// delete). The file returns as Draft — republish is a deliberate, separate step.</summary>
public record RestoreLibraryFileCommand(Guid Id, Guid RestoredBy) : IRequest<LibraryFileDto>;

/// <summary>FINAL object deletion — separate, authorized (SuperAdmin), re-authenticated
/// (actor password), retention-aware (refuses inside the retention window) and audited.
/// Physically removes every stored object under the upload prefix, then the row (cascades
/// views/annotations/bookmarks, nulls favorites) inside one transaction. NOT reached from
/// any normal CRUD path; gated behind the same fail-closed Features:HardDeleteEnabled
/// kill switch as the system hard-delete.</summary>
public record PurgeLibraryFileCommand(Guid Id, Guid ActorAdminId, string ActorPassword) : IRequest<PurgeLibraryFileResultDto>;

// ===== Wave 11.8 / F2: PDF annotations =====
public record GetFileAnnotationsQuery(Guid FileId, Guid StudentId) : IRequest<List<FileAnnotationDto>>;

/// <summary>Idempotent batch: client-id-keyed upserts + owner-scoped deletes, one commit.</summary>
public record SaveFileAnnotationsCommand(Guid FileId, Guid StudentId, SaveFileAnnotationsDto Batch) : IRequest<SaveFileAnnotationsResultDto>;

// ===== Wave 12.5.B: PDF page bookmarks =====
public record GetFileBookmarksQuery(Guid FileId, Guid StudentId) : IRequest<List<FileBookmarkDto>>;

/// <summary>Idempotent per page: re-adding a bookmarked page refreshes its snippet (unique triple enforced by the DB).</summary>
public record UpsertFileBookmarkCommand(Guid FileId, Guid StudentId, SaveFileBookmarkDto Bookmark) : IRequest<FileBookmarkDto>;

/// <summary>Owner-only delete; a foreign bookmarkId is a 403 (MediaBookmark precedent).</summary>
public record DeleteFileBookmarkCommand(Guid StudentId, Guid BookmarkId) : IRequest<Unit>;

// ===== Paged Result =====
public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);
