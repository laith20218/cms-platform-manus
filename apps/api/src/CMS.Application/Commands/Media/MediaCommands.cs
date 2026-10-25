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
