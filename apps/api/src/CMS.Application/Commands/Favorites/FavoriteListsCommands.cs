using MediatR;
using CMS.Application.Commands.Questions; // PagedResult<T> — the canonical referenced envelope
using CMS.Application.DTOs.Favorites;

namespace CMS.Application.Commands.Favorites;

// ===== Queries (Read) =====

/// <summary>
/// W15.0 — the student's custom favorites lists with computed question counts, ordered by
/// creation (stable chip order). When QuestionId is provided, each row additionally reports
/// whether THAT question is a member (the QuestionPage list-picker's checkbox state).
/// </summary>
public sealed record GetFavoriteListsQuery(
    Guid StudentId,
    /// <summary>Optional — set by the list picker to resolve per-list membership in one call.</summary>
    Guid? QuestionId
) : IRequest<IReadOnlyList<FavoriteListDto>>;

/// <summary>
/// W15.0 — the questions inside one custom list, paged and server-filtered. The response
/// rows reuse the FavoriteItemDto question-card shape (TargetType="question") so the
/// FavoritesPage renders list contents with the SAME card component as flat question
/// favorites. Entitlement-gated per subject exactly like the enriched flat list.
/// </summary>
public sealed record GetQuestionsInFavoriteListQuery(
    Guid StudentId,
    Guid ListId,
    /// <summary>Optional question-text contains filter.</summary>
    string? Search,
    int Page,
    int PageSize,
    string EntitlementToken,
    string InstallationId
) : IRequest<PagedResult<FavoriteItemDto>>;

// ===== Commands (Write) =====

/// <summary>Creates a named list. Name conflicts (same student, same trimmed name) → 409.</summary>
public sealed record CreateFavoriteListCommand(
    Guid StudentId,
    string Name,
    string? Description,
    string? Color
) : IRequest<FavoriteListMutationDto>;

/// <summary>
/// Partial update (rename / change color): null fields stay unchanged. Ownership is
/// enforced by the (Id, StudentId) lookup — a foreign list id resolves to 404.
/// </summary>
public sealed record UpdateFavoriteListCommand(
    Guid StudentId,
    Guid ListId,
    string? Name,
    string? Description,
    string? Color
) : IRequest<FavoriteListMutationDto>;

/// <summary>
/// Deletes a list. HARD delete: membership rows cascade away (ExamCourseItem precedent —
/// a membership row is meaningless without its list); the questions themselves are never
/// touched, and flat favorites are a separate bucket.
/// </summary>
public sealed record DeleteFavoriteListCommand(
    Guid StudentId,
    Guid ListId
) : IRequest<Unit>;

/// <summary>
/// Adds a question to a list. Gates mirror CreateQuestionOrFileFavoriteCommand: the
/// question must exist AND be Published, and the student must hold the QuestionsExams
/// content scope for the question's subject (signed entitlement + real-time check).
/// Idempotent: an existing membership returns IsNew=false (200 instead of 201).
/// </summary>
public sealed record AddQuestionToFavoriteListCommand(
    Guid StudentId,
    Guid ListId,
    Guid QuestionId,
    string EntitlementToken,
    string InstallationId
) : IRequest<AddQuestionToFavoriteListResult>;

/// <summary>
/// Removes a question's membership. Idempotent NoContent when the row is already absent.
/// Unlike DeleteFavoriteCommand (which 404s on unpublished targets), the question lookup
/// here deliberately skips the Published filter: REMOVING one's own row must stay possible
/// after a question is unpublished or soft-deleted.
/// </summary>
public sealed record RemoveQuestionFromFavoriteListCommand(
    Guid StudentId,
    Guid ListId,
    Guid QuestionId,
    string EntitlementToken,
    string InstallationId
) : IRequest<Unit>;
