namespace CMS.Application.DTOs.Favorites;

/// <summary>
/// Push 11.3 — one enriched favorites row (list endpoint payload). Everything the student
/// favorites card renders is delivered in THIS shape: no per-card follow-up requests, no
/// client-side joins. Sources per target type:
/// <list type="bullet">
/// <item>question — favorites + questions (+ lecture name); no thumbnail/duration;</item>
/// <item>file — favorites + library_files (own thumbnail, size-driven metadata);</item>
/// <item>episode — favorites + course_episodes + courses (course title + course cover image
/// as the thumbnail fallback — episodes have no thumbnail column by product decision #2).</item>
/// </list>
/// PlaybackProgress rows are joined server-side for video/audio targets so the card can
/// render a progress bar and a «متابعة» action (episodes only, product decision #3).
/// </summary>
public sealed record FavoriteItemDto(
    Guid Id,
    string TargetType,          // "question" | "file" | "episode"
    Guid TargetId,
    string Title,               // question text (clamped) | file title | episode title
    string? Subtitle,           // lecture name (question) | category label (file) | course title (episode)
    string? ThumbnailUrl,       // file → own thumbnail; episode → course cover image; question → null
    string? FileType,           // "video"|"pdf"|"html"|"audio"|"image"|null (null for questions)
    int? DurationSeconds,       // episode or file duration; null for questions/texts
    string? ProcessingStatus,   // episode/file pipeline state ("Ready"/"Pending"/…); null otherwise
    DateTime CreatedAt,         // favorites.created_at — when the student saved it
    FavoriteProgressDto? Progress);

/// <summary>
/// Resume state joined from playback_progress (one row per student/asset). Nullable
/// duration/completion mirror the entity: completion stays NULL while the duration is
/// unknown — the client hides the progress bar then, but «متابعة» still works from
/// LastPositionSeconds.
/// </summary>
public sealed record FavoriteProgressDto(
    int LastPositionSeconds,
    int? DurationSeconds,
    int? CompletionPercent);

/// <summary>
/// Result of a favorite create (all target types). IsNew distinguishes 201 Created
/// (fresh row) from 200 OK (idempotent duplicate) at the API layer.
/// </summary>
public sealed record CreateFavoriteResult(
    FavoriteMutationDto Mutation,
    bool IsNew);

/// <summary>Mutation feedback shared by the player star button and the favorites page.</summary>
public sealed record FavoriteMutationDto(
    Guid FavoriteId,
    Guid TargetId,
    string TargetType,
    bool IsFavorite);
