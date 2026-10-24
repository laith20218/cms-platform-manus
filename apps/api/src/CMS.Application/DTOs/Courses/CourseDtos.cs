namespace CMS.Application.DTOs.Courses;

// ===== Student-facing =====
public record CourseListItemDto(
    Guid Id,
    Guid SubjectId,
    string SubjectNameAr,
    string Title,
    string? Description,
    string? CoverImageUrl,
    int EpisodesCount,
    int TotalDurationSeconds,
    int TotalViewsCount
);

public record CourseDto(
    Guid Id,
    Guid SubjectId,
    string Title,
    string? Description,
    string? CoverImageUrl,
    string Status,
    int EpisodesCount,
    DateTime CreatedAt,
    List<CourseEpisodeDto> Episodes
);

public record CourseEpisodeDto(
    Guid Id,
    Guid CourseId,
    string Title,
    int EpisodeNumber,
    int? DurationSeconds,
    string SourceType,   // Upload | YouTube
    long? FileSize,
    string? ContentType,
    string? YoutubeVideoId,
    bool UploadCompleted, // true when the blob is ready for playback
    int ViewsCount
);

/// <summary>Mirror of the library FileAccessDto contract: playback URL + watermark envelope.</summary>
public record EpisodeAccessDto(
    string AccessUrl,
    DateTime ExpiresAt,
    WatermarkEnvelopeDto Watermark
);

public record WatermarkEnvelopeDto(
    string StudentName,
    string StudentPhone,
    string Timestamp,
    string SiteName
);

// ===== Admin: multipart upload =====
public record InitiateUploadDto(
    Guid EpisodeId,
    string UploadId,
    string FileKey,
    int PartSizeBytes,        // 64 MB fixed (decision د4)
    int PartCount,
    List<string> PartUrls     // presigned UploadPart PUT URLs, index 0 = part 1
);

public record MultipartStatusDto(
    Guid EpisodeId,
    string UploadId,
    string FileKey,
    int PartSizeBytes,
    int PartCount,
    List<UploadedPartStateDto> UploadedParts, // parts already stored — client skips these
    List<string> PendingPartUrls              // fresh presigned URLs for the remaining parts
);

public record UploadedPartStateDto(
    int PartNumber,
    long Size,
    string ETag
);

public record CompletedPartDto(
    int PartNumber,
    string ETag
);
