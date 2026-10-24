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
    int PageSize = 20
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
    LibraryFileCategory? Category = null
) : IRequest<UploadUrlDto>;

public record CompleteUploadCommand(
    Guid FileId, string FileKey, long ActualFileSize,
    int? PagesCount, int? DurationSeconds,
    string? YoutubeVideoId, Guid CreatedBy
) : IRequest<LibraryFileDto>;

// ===== Admin: Update/Delete =====
public record UpdateLibraryFileCommand(
    Guid Id, string Title, string? Description,
    List<string> Tags, Guid? LectureId
) : IRequest<LibraryFileDto>;

public record PublishLibraryFileCommand(Guid Id, Guid PublishedBy) : IRequest<LibraryFileDto>;
public record ArchiveLibraryFileCommand(Guid Id, Guid ArchivedBy) : IRequest<LibraryFileDto>;
public record DeleteLibraryFileCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;

// ===== Paged Result =====
public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);
