using MediatR;
using CMS.Application.Commands.Questions; // PagedResult<T> — reused, NOT duplicated (5 per-domain copies exist; this is the canonical referenced one)
using CMS.Application.DTOs.Favorites;

namespace CMS.Application.Commands.Favorites;

// ===== Queries (Read) =====

/// <summary>
/// Push 11.3 — the enriched favorites list. Filter/sort/pagination are server-side; the
/// response envelope is the platform-standard PagedResult. Signed-entitlement validation
/// stays at the API boundary (as with /media playback-url); the handler performs the
/// batched content-scope filtering (GetAccessibleSubjectMapAsync) plus enrichment.
/// </summary>
public sealed record GetFavoritesQuery(
    Guid StudentId,
    /// <summary>null = all types; otherwise "question" | "file" | "episode".</summary>
    string? Type,
    /// <summary>"recent" (default) | "oldest" | "alpha". Invalid values → 400.</summary>
    string Sort,
    /// <summary>1-based; clamped to ≥ 1.</summary>
    int Page,
    /// <summary>Clamped to 1..100 (default 20).</summary>
    int PageSize
) : IRequest<PagedResult<FavoriteItemDto>>;

// ===== Commands (Write) =====

/// <summary>
/// Saves a WHOLE EPISODE as a favorite (player star button — product decision #1: star and
/// timeline-bookmark coexist as separate concepts). Idempotent: an existing row returns
/// IsNew=false (API answers 200 OK instead of 201 Created).
/// </summary>
public sealed record CreateEpisodeFavoriteCommand(
    Guid StudentId,
    Guid EpisodeId,
    /// <summary>Signed entitlement token (X-Entitlement) — validated against the episode's subject.</summary>
    string EntitlementToken,
    /// <summary>Installation id (X-Installation-Id) bound into the signed entitlement.</summary>
    string InstallationId
) : IRequest<CreateFavoriteResult>;

/// <summary>
/// Backward-compatible create for the legacy POST /api/v1/favorites body (questionId |
/// libraryFileId exactly one). Semantics are byte-identical with the pre-11.3 controller
/// implementation; the signed-entitlement validation moved inside the handler with it.
/// </summary>
public sealed record CreateQuestionOrFileFavoriteCommand(
    Guid StudentId,
    Guid? QuestionId,
    Guid? LibraryFileId,
    string EntitlementToken,
    string InstallationId
) : IRequest<CreateFavoriteResult>;

/// <summary>
/// Unified delete across all three target types. 404 when the TARGET entity is gone;
/// idempotent NoContent when the favorite row itself is already absent.
/// </summary>
public sealed record DeleteFavoriteCommand(
    Guid StudentId,
    /// <summary>"question" | "file" | "episode".</summary>
    string TargetType,
    Guid TargetId,
    string EntitlementToken,
    string InstallationId
) : IRequest<Unit>;
