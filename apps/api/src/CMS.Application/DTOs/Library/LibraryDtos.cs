namespace CMS.Application.DTOs.Library;

using CMS.Domain.Enums;

// ===== Library File DTOs =====
public record LibraryFileDto(
    Guid Id,
    Guid SubjectId,
    Guid? LectureId,
    string Type,        // pdf, html, image, video, summary, comprehensive, paragraph
    string? Category,   // institutional category: Curriculum | Lecture | Summary | GoldenIdeas (null on legacy rows)
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
    DateTime CreatedAt,
    // ===== Push 10.5 — rich metadata + transcoding lifecycle exposure =====
    // Same additive contract as CourseEpisodeDto: enum strings via the global
    // JsonStringEnumConverter, null ProcessingStatus = pipeline never applied
    // (non-video / legacy), ProcessingError only while status == Failed.
    Difficulty Difficulty = Difficulty.Easy,
    ProcessingStatus? ProcessingStatus = null,
    string? ProcessingError = null,
    string? HlsKey = null
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
    bool IsFavorite,
    // Curricular classification (Curriculum / Lecture / Summary / GoldenIdeas) — null = uncategorized.
    string? Category = null,
    DateTime CreatedAt = default
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
    string? Description,
    LibraryFileCategory? Category = null
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
    string? YoutubeVideoId,
    // Push 10.5 — optional metadata override (null = keep the values captured at
    // upload-url time). The current library UI does not send them yet; the keys are
    // additive so the wire contract stays forward-compatible.
    string? Title = null,
    string? Description = null,
    Difficulty? Difficulty = null
);

// ===== Admin: Update/Delete =====
public record UpdateLibraryFileDto(
    string Title,
    string? Description,
    List<string> Tags,
    Guid? LectureId,
    // Push 10.5 — difficulty is PATCH-optional: null leaves the stored tier untouched.
    Difficulty? Difficulty = null
);
