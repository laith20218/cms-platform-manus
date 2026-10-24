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

    public Course Course { get; set; } = null!;
}
