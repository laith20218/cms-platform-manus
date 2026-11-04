namespace CMS.Application.DTOs.Favorites;

/// <summary>
/// W15.0 — one custom favorites list header (GET /api/v1/favorites/lists row). QuestionsCount
/// is computed server-side (grouped membership count). ContainsQuestion is only populated
/// when the query carries a QuestionId — the QuestionPage list-picker uses it to render
/// per-list checkboxes without a second round-trip.
/// </summary>
public sealed record FavoriteListDto(
    Guid Id,
    string Name,
    string? Description,
    string? Color,
    int QuestionsCount,
    bool? ContainsQuestion,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>Result of a create/update list mutation (the fields the UI needs to refresh chips).</summary>
public sealed record FavoriteListMutationDto(
    Guid Id,
    string Name);

/// <summary>
/// Result of adding a question to a list. IsNew distinguishes 201 Created (fresh
/// membership) from 200 OK (idempotent duplicate) at the API layer — same convention as
/// CreateFavoriteResult.
/// </summary>
public sealed record AddQuestionToFavoriteListResult(
    Guid ListId,
    Guid QuestionId,
    bool IsNew);
