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
/// asset's pinned HlsKey directory and streamed from object storage through the API.
///
/// Why a proxy at all: S3-style presigned URLs are object-scoped — one signature covers
/// exactly one key. An HLS ladder is a TREE of playlists and segments referenced by
/// RELATIVE URIs, so a presigned master.m3u8 cannot authorize its children: the player
/// resolves {rung}/index.m3u8 against the presigned URL and requests it from the bucket
/// WITHOUT any signature, which a private bucket rejects with 401 (the Wave 10
/// production incident). The proxy keeps the base URL on the API (same authorization
/// surface as every other student endpoint) and fetches each object server-side with
/// the storage credentials. The relative URIs inside the FFmpeg-generated playlists
/// then resolve against the proxy route, so no playlist rewriting is needed.
///
/// The handler answers a DTO carrying the object stream; the API layer wraps it in a
/// FileStreamResult with the mapped Content-Type and Cache-Control.
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
