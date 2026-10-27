using CMS.Domain.Entities;

namespace CMS.Application.DTOs.Media;

/// <summary>
/// A direct playback URL for one video/audio asset. The URL targets the object-storage
/// host (R2), is a GET presign (Range-capable), and expires after TtlSeconds — the player
/// must refresh it on error/stall for media longer than the TTL.
/// Push 11.3: IsFavorite reports the episode-favorite state (player star button initial
/// state) — computed ONLY for course episodes via one EXISTS query; always false for
/// library files (their favorite state rides the library list DTO instead).
/// </summary>
public record PlaybackUrlDto(
    string Url,
    int TtlSeconds,
    DateTime ExpiresAt,
    string ContentType,
    bool SupportsRange,
    bool IsFavorite = false
);

/// <summary>
/// Push 11.1 — one HLS ladder object served through the API proxy. <see cref="Content"/>
/// is the object stream from storage (the API layer owns disposal via the
/// FileStreamResult); <see cref="ContentType"/> and <see cref="CacheControl"/> follow the
/// object's role.
/// Push 11.1-REWRITE (Option C): the master playlist streams raw (private,no-store);
/// VARIANT playlists arrive already REWRITTEN — segment lines replaced with presigned
/// direct-to-B2 URLs (private,max-age=60). Segment objects are never streamed anymore
/// (the route answers 404 for them).
/// </summary>
public record HlsObjectDto(
    Stream Content,
    string ContentType,
    string CacheControl
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
