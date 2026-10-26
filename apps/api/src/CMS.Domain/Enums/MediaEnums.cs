namespace CMS.Domain.Enums;

/// <summary>
/// Push 10.3 — lifecycle of an FFmpeg transcoding job on a stored media asset.
///
/// NULL on rows that never transcode: non-video assets (audio/documents),
/// YouTube-sourced episodes, and legacy rows uploaded before Push 10.3 (a
/// later admin action may enqueue those). The ladder statuses
/// (Transcoding_360p/720p/1080p) double as the progress phases the admin UI
/// will surface: the service runs the single-command multi-variant ladder
/// (all rungs encode in lockstep, industry standard), so the rung statuses
/// advance as overall encoding progress crosses each rung's even share of the
/// ladder ACTUALLY generated — rungs above the source are dropped (never
/// upscale), so a 480p source holds Transcoding_360p until Ready.
/// </summary>
public enum ProcessingStatus
{
    /// <summary>Uploaded and waiting for an FFmpeg worker to pick the job up.</summary>
    Pending = 0,

    /// <summary>Encoding in progress — first third (360p rung of the ladder).</summary>
    Transcoding_360p = 1,

    /// <summary>Encoding in progress — middle third (720p rung of the ladder).</summary>
    Transcoding_720p = 2,

    /// <summary>Encoding in progress — final third (1080p rung of the ladder).</summary>
    Transcoding_1080p = 3,

    /// <summary>HLS ladder + master.m3u8 generated and uploaded; HlsKey points at master.m3u8.</summary>
    Ready = 4,

    /// <summary>Terminal failure (download/FFmpeg/upload). Retry is a future admin action.</summary>
    Failed = 5
}

/// <summary>
/// Push 10.7 — admin-selected transcoding target for a video asset.
///
/// <see cref="Auto"/> (default) keeps the Push 10.3 behaviour: the ladder is built
/// from the source's display dimensions (every rung at or below the source, never
/// upscale). A concrete rung (<see cref="P360"/>, <see cref="P720"/>, <see cref="P1080"/>)
/// pins the encode to EXACTLY ONE rendition — the requested rung, or the closest
/// lower rung when the source is smaller (never upscale): one x264 encoder instead
/// of up to three, which is a direct memory saving on the transcoding host.
///
/// Stored as INTEGER NOT NULL DEFAULT 0 (Auto) on CourseEpisode and LibraryFile.
/// The value rides the upload flow (initiate/complete-upload bodies) and the admin
/// edit modal; assets uploaded before Push 10.7 read as Auto.
/// </summary>
public enum TargetQuality
{
    /// <summary>System default: source-driven ladder (all rungs ≤ source height).</summary>
    Auto = 0,

    /// <summary>Single 360p rendition (640×360).</summary>
    P360 = 1,

    /// <summary>Single 720p rendition (1280×720) — or the closest lower rung when the
    /// source is below 720p (e.g. a 480p source encodes 360p, never an upscale).</summary>
    P720 = 2,

    /// <summary>Single 1080p rendition (1920×1080) — or the closest lower rung when the
    /// source is below 1080p (e.g. a 720p source encodes 720p).</summary>
    P1080 = 3
}
