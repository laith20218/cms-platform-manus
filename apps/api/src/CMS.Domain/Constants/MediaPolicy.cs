namespace CMS.Domain.Constants;

/// <summary>
/// Media-related policy constants — the single source of truth for presigned-URL TTLs
/// (Push 10.0). Scattered literal TTLs drift silently: the avatar endpoints ask for six
/// hours while the provider clamps to ten minutes, and the library access URL asked for
/// five minutes while episodes asked for nine. Every site that mints or clamps a
/// presigned URL must read its number from here so intent and reality stay aligned.
///
/// Upstash Blob caps every presigned URL at 600 seconds — the presign agent refuses
/// anything longer (see UpstashPresignCapSeconds).
/// </summary>
public static class MediaPolicy
{
    /// <summary>
    /// Direct video/audio playback URL lifetime (9 minutes). Under the provider's
    /// 10-minute presign cap with headroom for clock skew; the player refreshes the
    /// URL on error/stall so long media keeps playing across refreshes.
    /// </summary>
    public const int PlaybackUrlTtlSeconds = 540;

    /// <summary>
    /// Browser upload URL lifetime. 600 s is also the effective ceiling on Upstash
    /// (anything longer is silently clamped), so this is the honest maximum.
    /// </summary>
    public const int UploadUrlTtlSeconds = 600;

    /// <summary>
    /// Library document access URL lifetime (5 minutes) — the same value the
    /// library /access endpoint has always issued, now stated once, here.
    /// </summary>
    public const int PresignedAccessTtlSeconds = 300;

    /// <summary>
    /// Avatar read URL lifetime. Note: requests for longer values are silently
    /// clamped to the presign cap on Upstash; on an owned-R2 deployment this can be
    /// raised for real (up to 7 days).
    /// </summary>
    public const int AvatarUrlTtlSeconds = 600;

    /// <summary>
    /// Hard ceiling the Upstash presign agent enforces on every signed URL. Clamp
    /// logic must read this constant, not a local literal.
    /// </summary>
    public const int UpstashPresignCapSeconds = 600;
}
