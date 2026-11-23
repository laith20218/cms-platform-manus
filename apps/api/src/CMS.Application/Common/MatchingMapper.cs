using CMS.Application.DTOs.Questions;
using CMS.Domain.ValueObjects;

namespace CMS.Application.Common;

/// <summary>
/// Wave 20.5 — DTO ↔ domain mapping for the Matching (وصل) payload, plus the
/// submitted-answer parser shared by every grading path (question player,
/// practice, timed exams). One implementation, no drift.
/// </summary>
public static class MatchingMapper
{
    public static MatchingPayload ToDomain(MatchingPayloadDto dto) => new()
    {
        Prompts = dto.Prompts.Select(item => new MatchingItem(item.Id, item.Text, item.SortOrder)).ToList(),
        Targets = dto.Targets.Select(item => new MatchingItem(item.Id, item.Text, item.SortOrder)).ToList(),
        Pairs = dto.Pairs.Select(pair => new MatchingPair(pair.PromptId, pair.TargetId)).ToList(),
        AllowMultiMap = dto.AllowMultiMap,
        PromptNumbering = dto.PromptNumbering,
        TargetNumbering = dto.TargetNumbering,
    };

    /// <summary>The FULL payload (admin / post-answer surfaces only — carries the pairs).</summary>
    public static MatchingPayloadDto ToDto(MatchingPayload payload) => new(
        payload.Prompts.OrderBy(item => item.SortOrder)
            .Select(item => new MatchingItemDto(item.Id, item.Text, item.SortOrder)).ToList(),
        payload.Targets.OrderBy(item => item.SortOrder)
            .Select(item => new MatchingItemDto(item.Id, item.Text, item.SortOrder)).ToList(),
        payload.Pairs.Select(pair => new MatchingPairDto(pair.PromptId, pair.TargetId)).ToList(),
        payload.AllowMultiMap,
        payload.PromptNumbering,
        payload.TargetNumbering);

    /// <summary>The STUDENT payload — prompts + targets, never the pairs (anti-leak).
    /// Night Task 7: carries the rules metadata (multi-map + numbering) the
    /// student UI needs to render and interact correctly.</summary>
    public static MatchingStudentDto ToStudentDto(MatchingPayload payload) => new(
        payload.Prompts.OrderBy(item => item.SortOrder)
            .Select(item => new MatchingItemDto(item.Id, item.Text, item.SortOrder)).ToList(),
        payload.Targets.OrderBy(item => item.SortOrder)
            .Select(item => new MatchingItemDto(item.Id, item.Text, item.SortOrder)).ToList(),
        payload.AllowMultiMap,
        payload.PromptNumbering,
        payload.TargetNumbering);

    public static MatchingResultDto ToResultDto((bool IsCorrect, IReadOnlyList<MatchingPayload.PairGrade> Pairs) grade, MatchingPayload payload) => new(
        grade.IsCorrect,
        grade.Pairs.Select(pair => new MatchingPairResultDto(pair.PromptId, pair.SubmittedTargetId, pair.CorrectTargetId, pair.IsCorrect)).ToList(),
        payload.Pairs.Select(pair => new MatchingPairDto(pair.PromptId, pair.TargetId)).ToList());

    /// <summary>
    /// Parses a submitted matching answer — a JSON array of
    /// {"promptId":"…","targetId":"…"} objects (camelCase, case-insensitive).
    /// Unparseable input yields an empty list (every pair then grades wrong —
    /// the honest verdict for a malformed submission, never a crash).
    /// </summary>
    public static List<MatchingPair> ParseSubmittedPairs(string? submitted)
    {
        if (string.IsNullOrWhiteSpace(submitted)) return new List<MatchingPair>();
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<List<MatchingPair>>(submitted, PayloadJson.Options) ?? new List<MatchingPair>();
        }
        catch (System.Text.Json.JsonException)
        {
            return new List<MatchingPair>();
        }
    }

    private static class PayloadJson
    {
        public static readonly System.Text.Json.JsonSerializerOptions Options = new()
        {
            PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
        };
    }
}
