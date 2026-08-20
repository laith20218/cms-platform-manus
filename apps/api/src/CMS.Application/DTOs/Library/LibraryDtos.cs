namespace CMS.Application.DTOs.Library;

// ===== Library File DTOs =====
public record LibraryFileDto(
    Guid Id,
    Guid SubjectId,
    Guid? LectureId,
    string Type,        // pdf, html, image, video, summary, comprehensive, paragraph
    string Title,
    string? Description,
    long FileSize,
    string? FileFormat,
    int? DurationSeconds,
    int? PagesCount,
    string? ThumbnailUrl,
    string? YoutubeVideoId,
    List<string> Tags,
    int ViewsCount,
    int FavoritesCount,
    DateTime CreatedAt
);

public record LibraryFileListItemDto(
    Guid Id,
    string Type,
    string Title,
    string? Description,
    long FileSize,
    int? DurationSeconds,
    int? PagesCount,
    string? ThumbnailUrl,
    int ViewsCount,
    bool IsFavorite
);

// ===== Access (Signed URL) =====
public record FileAccessDto(
    string AccessUrl,
    DateTime ExpiresAt,
    WatermarkDto Watermark
);

public record WatermarkDto(
    string StudentName,
    string StudentPhone,
    string Timestamp,
    string SiteName
);

// ===== View Recording =====
public record RecordViewDto(
    int DurationSeconds,
    int? PagesViewed,
    decimal? CompletionPercentage
);

// ===== Upload (Admin) =====
public record RequestUploadUrlDto(
    string FileName,
    string ContentType,
    long FileSize,
    Guid SubjectId,
    Guid? LectureId,
    string Type,
    string Title,
    string? Description
);

public record UploadUrlDto(
    string UploadUrl,
    string FileKey,
    Guid FileId
);

public record CompleteUploadDto(
    Guid FileId,
    string FileKey,
    long ActualFileSize,
    int? PagesCount,
    int? DurationSeconds,
    string? YoutubeVideoId
);

// ===== Admin: Update/Delete =====
public record UpdateLibraryFileDto(
    string Title,
    string? Description,
    List<string> Tags,
    Guid? LectureId
);
