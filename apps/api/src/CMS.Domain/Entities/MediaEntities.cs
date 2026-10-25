using CMS.Domain.Common;

namespace CMS.Domain.Entities;

/// <summary>
/// The kind of media asset a bookmark or playback-progress row points at. Push 10.0.
/// </summary>
public enum MediaAssetType
{
    /// <summary>A digital-library file (video/audio). The row's AssetId is a LibraryFile id.</summary>
    LibraryFile = 0,

    /// <summary>A course episode. The row's AssetId is a CourseEpisode id.</summary>
    CourseEpisode = 1
}

/// <summary>
/// A student's labeled time-range bookmark on a media asset (Push 10.0 / §1.B).
///
/// Deliberately a first-class entity, separate from Favorite: a favorite marks a whole
/// library file as interesting; a bookmark points INSIDE a video/audio timeline at a
/// specific [StartSeconds, EndSeconds] window. The pair (StudentId, AssetType, AssetId,
/// StartSeconds, EndSeconds) is unique — re-bookmarking the exact same window is a
/// conflict, but overlapping windows are allowed.
///
/// AssetId is polymorphic (LibraryFile or CourseEpisode depending on AssetType) and is
/// validated at the application layer — there is no database-level foreign key to either
/// target table by design, so asset-type refactors never orphan FK constraints.
/// </summary>
public class MediaBookmark : BaseEntity
{
    public Guid StudentId { get; set; }

    /// <summary>Which table AssetId refers to (library_files / course_episodes).</summary>
    public MediaAssetType AssetType { get; set; }

    /// <summary>Polymorphic target id — no DB-level FK (see class docs).</summary>
    public Guid AssetId { get; set; }

    /// <summary>Inclusive start of the bookmarked window, in whole seconds (≥ 0).</summary>
    public int StartSeconds { get; set; }

    /// <summary>Exclusive end of the bookmarked window — must be &gt; StartSeconds.</summary>
    public int EndSeconds { get; set; }

    /// <summary>Trimmed, non-empty display label (1–100 chars).</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Optional free-form note (≤ 500 chars).</summary>
    public string? Note { get; set; }

    public Student Student { get; set; } = null!;
}

/// <summary>
/// A student's resume position on a media asset (Push 10.0 / §1.C) — one row per
/// (StudentId, AssetType, AssetId). Before this entity the platform had no playback
/// position tracking at all: LibraryView tracks whole-file completion for documents,
/// not a resumable timestamp inside a video/audio timeline.
///
/// Completion is derived (never trusted from the client): the 95 % rule — once the
/// reported position passes 95 % of the known duration, completion pins to 100.
/// </summary>
public class PlaybackProgress : BaseEntity
{
    public Guid StudentId { get; set; }

    public MediaAssetType AssetType { get; set; }

    /// <summary>Polymorphic target id — no DB-level FK (same rationale as MediaBookmark).</summary>
    public Guid AssetId { get; set; }

    /// <summary>Last reported playback position in whole seconds (≥ 0, clamped to duration when known).</summary>
    public int LastPositionSeconds { get; set; }

    /// <summary>Known total duration in seconds. Sticky: a known value is never overwritten by an unknown one.</summary>
    public int? DurationSeconds { get; set; }

    /// <summary>Derived completion 0–100, numeric(5,2). NULL while the duration is unknown.</summary>
    public decimal? CompletionPercent { get; set; }

    public Student Student { get; set; } = null!;
}
