using MediatR;
using CMS.Application.DTOs.Media;
using CMS.Domain.Entities;

namespace CMS.Application.Commands.Media;

// ===== §1.A: direct playback URL =====

/// <summary>
/// Issues a short-lived, object-scoped presigned GET URL for a stored video/audio asset
/// so the browser range-requests media directly from object storage (R2 host) — the API
/// never proxies bytes. Non-video/audio assets and YouTube-hosted media are refused.
/// </summary>
public record GetPlaybackUrlQuery(
    Guid StudentId,
    MediaAssetType AssetType,
    Guid AssetId
) : IRequest<PlaybackUrlDto>;

/// <summary>
/// Push 11.1 — HLS proxy object fetch. One file of a Ready asset's HLS ladder
/// (master.m3u8, {rung}/index.m3u8, {rung}/segment_NNN.ts), addressed RELATIVE to the
/// asset's pinned HlsKey directory.
///
/// Why the API is in this path at all: S3-style presigned URLs are object-scoped —
/// one signature covers exactly one key. An HLS ladder is a TREE of playlists and
/// segments referenced by RELATIVE URIs, so a presigned master.m3u8 cannot authorize
/// its children (the Wave 10 401 incident), and B2 has no wildcard presigns (verified
/// live, PART B T1-Step2: 403 SignatureDoesNotMatch).
///
/// Push 11.1-REWRITE (Option C): only the PLAYLISTS stay on the API — the master is
/// streamed raw; every VARIANT playlist is downloaded and REWRITTEN so its segment
/// lines become object-scoped presigned URLs the player fetches DIRECTLY from B2
/// (browser CORS verified live, PART B T2-b). Segment (.ts/.m4s) requests against the
/// API are RETIRED and answer 404 before any storage access — the fast failure that
/// drives stale clients back to the variant for fresh presigned URLs.
/// </summary>
public record GetHlsObjectQuery(
    Guid StudentId,
    MediaAssetType AssetType,
    Guid AssetId,
    /// <summary>Slash-joined path below the asset's HlsKey directory, e.g.
    /// "master.m3u8" or "360p/segment_000.ts". Validated against a strict whitelist
    /// (see MediaHandlers.ValidateHlsRelativePath) before any storage access.</summary>
    string Path
) : IRequest<HlsObjectDto>;

// ===== WAVE-5: offline content streaming =====

/// <summary>
/// WAVE-5 (offline media content) — streams the FULL original object bytes of a stored
/// video/audio asset through the API (<see cref="IFileStorageService.DownloadAsync"/>) so
/// the Android offline cache can persist hosted course episodes in its encrypted store.
/// Presigned playback URLs are client → storage direct and can never be captured by that
/// store; this query is the media counterpart of the library file content byte-channel.
///
/// Gating mirrors <see cref="GetPlaybackUrlQuery"/> exactly (VideoAudio entitlement scope,
/// published course, YouTube and upload-incomplete refusals, non-streamable library kinds),
/// but the resolved key is ALWAYS the original object (FileKey / FileUrl) — never an HLS
/// ladder: offline playback reads the complete local file, so adaptive-streaming trees are
/// irrelevant on this path. The response is a whole-object 200 with NO Range support
/// (parity with the library content route).
/// </summary>
public record GetMediaContentQuery(
    Guid StudentId,
    MediaAssetType AssetType,
    Guid AssetId
) : IRequest<MediaContentDto>;

// ===== §1.B: media bookmarks =====

public record CreateMediaBookmarkCommand(
    Guid StudentId,
    MediaAssetType AssetType,
    Guid AssetId,
    int StartSeconds,
    int EndSeconds,
    string? Label,
    string? Note
) : IRequest<CreateMediaBookmarkResult>;

public record ListMediaBookmarksQuery(
    Guid StudentId,
    MediaAssetType AssetType,
    Guid AssetId
) : IRequest<List<MediaBookmarkDto>>;

/// <summary>PATCH semantics: only Label and/or Note are updatable — the time window never moves.</summary>
public record UpdateMediaBookmarkCommand(
    Guid StudentId,
    Guid BookmarkId,
    string? Label,
    string? Note
) : IRequest<MediaBookmarkDto>;

public record DeleteMediaBookmarkCommand(
    Guid StudentId,
    Guid BookmarkId
) : IRequest<Unit>;

// ===== §1.C: playback progress =====

/// <summary>Upsert on (StudentId, AssetType, AssetId). Completion is derived server-side (95 % rule).</summary>
public record UpsertPlaybackProgressCommand(
    Guid StudentId,
    MediaAssetType AssetType,
    Guid AssetId,
    int PositionSeconds,
    int? DurationSeconds
) : IRequest<PlaybackProgressDto>;

public record GetPlaybackProgressQuery(
    Guid StudentId,
    MediaAssetType AssetType,
    Guid AssetId
) : IRequest<PlaybackProgressDto?>;
