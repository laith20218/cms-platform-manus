namespace CMS.Domain.Enums;

/// <summary>
/// Push 10.3 — lifecycle of an FFmpeg transcoding job on a stored media asset.
///
/// NULL on rows that never transcode: non-video assets (audio/documents),
/// YouTube-sourced episodes, and legacy rows uploaded before Push 10.3 (a
/// later admin action may enqueue those). The ladder statuses
/// (Transcoding_360p/720p/1080p) double as the progress phases the admin UI
/// will surface: the service runs the single-command multi-variant ladder
/// (all three rungs encode in lockstep, industry standard), so the rung
/// statuses advance as overall encoding progress passes ⅓ and ⅔.
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
