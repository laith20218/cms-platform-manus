using CMS.Domain.Entities;

namespace CMS.Application.DTOs.Media;

/// <summary>
/// A direct playback URL for one video/audio asset. The URL targets the object-storage
/// host (R2), is a GET presign (Range-capable), and expires after TtlSeconds — the player
/// must refresh it on error/stall for media longer than the TTL.
/// </summary>
public record PlaybackUrlDto(
    string Url,
    int TtlSeconds,
    DateTime ExpiresAt,
    string ContentType,
    bool SupportsRange
);

/// <summary>A labeled time-range bookmark on a media asset, ordered by StartSeconds.</summary>
public record MediaBookmarkDto(
    Guid Id,
    MediaAssetType AssetType,
    Guid AssetId,
    int StartSeconds,
    int EndSeconds,
    string Label,
    string? Note,
    DateTime CreatedAt
);

/// <summary>
/// Create-result envelope. DurationKnown is false when the referenced asset has no known
/// duration — the bookmark is still accepted (spec §1.B) and the API layer surfaces
/// X-Duration-Warning: unknown so the client can re-verify the window.
/// </summary>
public record CreateMediaBookmarkResult(
    MediaBookmarkDto Bookmark,
    bool DurationKnown
);

/// <summary>Resume position + derived completion for one student/asset pair.</summary>
public record PlaybackProgressDto(
    MediaAssetType AssetType,
    Guid AssetId,
    int LastPositionSeconds,
    int? DurationSeconds,
    decimal? CompletionPercent,
    DateTime UpdatedAt
);

// ===== API request bodies =====

public record CreateBookmarkDto(
    int StartSeconds,
    int EndSeconds,
    string? Label,
    string? Note
);

/// <summary>PATCH body — null means "leave unchanged".</summary>
public record UpdateBookmarkDto(
    string? Label,
    string? Note
);

public record UpsertProgressDto(
    int PositionSeconds,
    int? DurationSeconds
);
