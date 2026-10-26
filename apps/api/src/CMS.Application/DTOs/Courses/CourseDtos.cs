using CMS.Domain.Enums;

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
    int ViewsCount,
    // ===== Push 10.5 — rich metadata + transcoding lifecycle exposure =====
    // Additive optional keys (camelCase on the wire): the 10.4 admin/student apps
    // already read them and degrade gracefully on absence, so older clients keep
    // working. `Difficulty` rides the global JsonStringEnumConverter → "Easy"|
    // "Medium"|"Hard"; `ProcessingStatus` → "Pending"…"Ready"/"Failed", null = the
    // pipeline never applied to this asset (YouTube/audio/legacy) and the source
    // object is directly playable. `ProcessingError` carries English technical
    // details ONLY while status == Failed (feeds the collapsible section of the
    // dual-language error modal); `HlsKey` exposes the master.m3u8 object key once
    // the FFmpeg ladder reaches Ready.
    string? Description = null,
    Difficulty Difficulty = Difficulty.Easy,
    ProcessingStatus? ProcessingStatus = null,
    string? ProcessingError = null,
    string? HlsKey = null,
    // Push 10.7 — admin-selected transcoding target ("Auto"|"P360"|"P720"|"P1080");
    // feeds the edit modal's quality dropdown. Auto is the stored default.
    TargetQuality TargetQuality = TargetQuality.Auto
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

// ===== Admin: single-PUT upload (Hotfix 10.8f — multipart abandoned) =====
/// <summary>
/// Hotfix 10.8f: Upstash's temporary credentials cannot CreateMultipartUpload on R2
/// (production 403), so the Admin API now issues ONE presigned PUT URL for the whole
/// file — the same native Upstash /v1/presign flow library uploads use in production.
/// The browser PUTs the entire file against <paramref name="UploadUrl"/> in a single
/// XHR, then calls complete-upload. No upload id and no parts exist in this flow.
/// The URL binds the content type AND the declared size into the signature, so
/// storage rejects a differently-typed or differently-sized body outright.
/// </summary>
public record InitiateUploadDto(
    Guid EpisodeId,
    string UploadUrl,        // single presigned PUT URL for the ENTIRE file
    string FileKey           // server-generated destination path
);

public record MultipartStatusDto(
    Guid EpisodeId,
    string UploadId,
    string FileKey,
    int PartSizeBytes,
    int PartCount,
    List<UploadedPartStateDto> UploadedParts, // parts already stored — client skips these
    List<string> PendingPartUrls,             // fresh presigned URLs for the remaining parts
    // Hotfix 10.6 (production upload CORS): false = no live multipart session
    // (completed, aborted, or gone upstream). A status poll racing the upload
    // lifecycle must degrade gracefully — not 400/500 — so the client reads this
    // flag instead of parsing an error. Optional parameter keeps every existing
    // construction and JSON payload compiling (older clients ignore the field).
    bool HasActiveUpload = true
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
