using CMS.Domain.Common;
using CMS.Domain.Enums;

namespace CMS.Domain.Entities;

/// <summary>
/// A video course attached to an academic subject. Groups ordered episodes that are
/// either uploaded to object storage (up to 2.5 GB, S3 multipart) or embedded from
/// YouTube. Publishing happens at the course level only (decision د3) — episodes
/// inherit visibility from their course.
/// Entitlement follows the existing content-scope model: playback requires an active
/// subscription grant covering the subject with scope VideoAudio (or FullSubject/FullYear).
/// </summary>
public class Course : AuditableEntity
{
    public Guid SubjectId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? CoverImageUrl { get; set; }
    /// <summary>Lifecycle identical to library files (decision د2): Draft → Published → Archived.</summary>
    public ContentStatus Status { get; set; } = ContentStatus.Draft;

    public Subject Subject { get; set; } = null!;
    public ICollection<CourseEpisode> Episodes { get; set; } = new List<CourseEpisode>();
}

/// <summary>
/// A single ordered episode inside a course. For <see cref="CourseEpisodeSource.Upload"/>
/// episodes the media blob lives in object storage under a server-generated key and is
/// uploaded by the browser via S3 multipart (64 MB parts, decision د4).
/// </summary>
public class CourseEpisode : AuditableEntity
{
    public Guid CourseId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int EpisodeNumber { get; set; }

    public int? DurationSeconds { get; set; }

    /// <summary>Object-storage key for Upload episodes. NULL for YouTube episodes.
    /// Set at initiate-upload time, before any bytes are transferred.</summary>
    public string? FileKey { get; set; }

    /// <summary>Declared size in bytes between initiate and complete-upload; the actual
    /// object size after complete-upload (verified server-side via HEAD). NULL for YouTube.</summary>
    public long? FileSize { get; set; }

    /// <summary>Declared MIME type (video/mp4, video/webm, audio/mpeg, …). NULL for YouTube.</summary>
    public string? ContentType { get; set; }

    public CourseEpisodeSource SourceType { get; set; } = CourseEpisodeSource.Upload;

    /// <summary>YouTube video id for YouTube episodes. NULL for Upload episodes.</summary>
    public string? YoutubeVideoId { get; set; }

    /// <summary>Active S3 multipart upload id between initiate-upload and complete-upload.
    /// NULL once the upload completes — doubles as the "blob ready for playback" marker
    /// (the access endpoint refuses episodes whose upload is still in progress).</summary>
    public string? UploadId { get; set; }

    public int ViewsCount { get; set; }

    // ===== Push 10.3 — rich media metadata + transcoding lifecycle =====
    // Title already exists on the entity (required, set at initiate-upload); the new
    // metadata surface is Description + Difficulty, plus the HLS pipeline columns.

    /// <summary>Librarian-authored learning description (≤ 1000 chars). NULL when unset.</summary>
    public string? Description { get; set; }

    /// <summary>Learning difficulty for catalog filtering. Defaults to Easy; shared with the
    /// question domain's scale (Easy=0, Medium=1, Hard=2).</summary>
    public Difficulty Difficulty { get; set; } = Difficulty.Easy;

    /// <summary>FFmpeg pipeline state. NULL for YouTube episodes / audio episodes / legacy rows.</summary>
    public ProcessingStatus? ProcessingStatus { get; set; }

    /// <summary>Object-storage key of the generated HLS master playlist
    /// ({FileKey}/hls/master.m3u8). NULL until the pipeline reaches Ready — playback
    /// keeps using FileKey until a later push switches the player to HLS.</summary>
    public string? HlsKey { get; set; }

    /// <summary>Push 10.7 — admin-selected transcoding target (Auto = source-driven
    /// ladder; a concrete rung encodes exactly one rendition). Audio/YouTube episodes
    /// carry the column too (Auto) but the pipeline never reads it for them.</summary>
    public TargetQuality TargetQuality { get; set; } = TargetQuality.Auto;

    public Course Course { get; set; } = null!;
}
