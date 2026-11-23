using System.Text.Json;
using System.Text.Json.Serialization;
using CMS.Domain.Exceptions;

namespace CMS.Domain.ValueObjects;

/// <summary>One side of a matching question (وصل) item — a prompt (left) or a target (right).</summary>
public record MatchingItem(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("sortOrder")] int SortOrder);

/// <summary>One correct pairing: this prompt belongs to this target.</summary>
public record MatchingPair(
    [property: JsonPropertyName("promptId")] Guid PromptId,
    [property: JsonPropertyName("targetId")] Guid TargetId);

/// <summary>
/// Wave 20.5 (owner decision 3) — the Matching (وصل) question payload:
/// two sets of items (prompts + targets) with stable ids, plus the correct
/// pairs map. Serialized as JSON onto Question.MatchingJson and snapshotted
/// verbatim onto ExamSessionQuestion.MatchingJson.
///
/// Invariants (Validate): at least 2 prompts and 2 targets, non-empty texts,
/// unique ids per set, EQUAL prompt/target counts, and a BIJECTIVE pair map —
/// every prompt paired exactly once, every target used exactly once, all ids
/// existing in their sets. Grading is all-or-nothing per pair (the
/// MultipleSelect precedent) with per-pair correctness disclosed.
/// </summary>
public record MatchingPayload
{
    public List<MatchingItem> Prompts { get; init; } = new();
    public List<MatchingItem> Targets { get; init; } = new();
    public List<MatchingPair> Pairs { get; init; } = new();

    /// <summary>
    /// Night Task 7.1 — when TRUE, a prompt (left item) may be correctly paired
    /// with MULTIPLE targets: its correct answer is a SET, and grading demands
    /// set equality per prompt. When FALSE (default) the W20.5 bijection holds
    /// unchanged — legacy content is untouched.
    /// </summary>
    [JsonPropertyName("allowMultiMap")]
    public bool AllowMultiMap { get; init; }

    /// <summary>
    /// Night Task 7.2 — numbering style per list ("digits" | "arabicLetters" |
    /// "latinLetters"). Null/unknown = the presentation default the surfaces
    /// already render (prompts: Arabic letters, targets: digits).
    /// </summary>
    [JsonPropertyName("promptNumbering")]
    public string? PromptNumbering { get; init; }
    [JsonPropertyName("targetNumbering")]
    public string? TargetNumbering { get; init; }

    internal static readonly HashSet<string> AllowedNumberingStyles = new(StringComparer.OrdinalIgnoreCase)
    {
        "digits", "arabicLetters", "latinLetters",
    };

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    /// <summary>Validates the invariants; throws DomainException (Arabic) on violation.</summary>
    public void Validate()
    {
        if (Prompts.Count < 2)
            throw new DomainException("سؤال الوصل يتطلب عنصرين على الأقل في كل قائمة");
        if (Targets.Count < 2)
            throw new DomainException("سؤال الوصل يتطلب عنصرين على الأقل في كل قائمة");
        if (Prompts.Any(item => string.IsNullOrWhiteSpace(item.Text)) || Targets.Any(item => string.IsNullOrWhiteSpace(item.Text)))
            throw new DomainException("نص عنصر الوصل لا يمكن أن يكون فارغاً");
        if (Prompts.Select(item => item.Id).Distinct().Count() != Prompts.Count
            || Targets.Select(item => item.Id).Distinct().Count() != Targets.Count)
            throw new DomainException("معرّفات عناصر الوصل يجب أن تكون فريدة داخل كل قائمة");
        if (!AllowedNumberingStyles.Contains(PromptNumbering ?? "digits")
            || !AllowedNumberingStyles.Contains(TargetNumbering ?? "digits"))
            throw new DomainException("نمط ترقيم قوائم الوصل غير صالح");

        var promptIds = Prompts.Select(item => item.Id).ToHashSet();
        var targetIds = Targets.Select(item => item.Id).ToHashSet();
        if (Pairs.Any(pair => !promptIds.Contains(pair.PromptId)))
            throw new DomainException("زواج الوصل تشير إلى عنصر غير موجود في قائمة البداية");
        if (Pairs.Any(pair => !targetIds.Contains(pair.TargetId)))
            throw new DomainException("زواج الوصل تشير إلى عنصر غير موجود في قائمة النهاية");

        if (!AllowMultiMap)
        {
            // W20.5 bijection — unchanged for every legacy payload.
            if (Prompts.Count != Targets.Count)
                throw new DomainException("يجب أن يتساوى عدد عناصر القائمتين في سؤال الوصل");
            if (Pairs.Count != Prompts.Count)
                throw new DomainException("يجب أن يغطي زواج الوصل كل عنصر مرة واحدة بالضبط");
            if (Pairs.Select(pair => pair.PromptId).Distinct().Count() != Pairs.Count
                || Pairs.Select(pair => pair.TargetId).Distinct().Count() != Pairs.Count)
                throw new DomainException("كل عنصر في سؤال الوصل يجب أن يظهر في زوج واحد فقط");
            return;
        }

        // Night Task 7.1 — multi-map: every prompt paired to AT LEAST ONE target,
        // every target used AT MOST once (only the LEFT side is relaxed), no
        // duplicate pairs. List sizes may differ (extra targets act as distractors).
        if (Pairs.Count == 0)
            throw new DomainException("سؤال الوصل يتطلب زوجاً واحداً صحيحاً على الأقل لكل عنصر");
        if (Pairs.Select(pair => (pair.PromptId, pair.TargetId)).Distinct().Count() != Pairs.Count)
            throw new DomainException("لا يمكن تكرار الزوج نفسه في سؤال الوصل");
        var promptsWithPair = Pairs.Select(pair => pair.PromptId).ToHashSet();
        if (Prompts.Any(prompt => !promptsWithPair.Contains(prompt.Id)))
            throw new DomainException("اربط كل عنصر من القائمة الأولى بإجابة صحيحة واحدة على الأقل");
        if (Pairs.Select(pair => pair.TargetId).Distinct().Count() != Pairs.Count)
            throw new DomainException("كل إجابة من القائمة الثانية تبقى صحيحة لعنصر واحد فقط");
    }

    public string Serialize() => JsonSerializer.Serialize(this, SerializerOptions);

    public static MatchingPayload Deserialize(string json)
    {
        var payload = JsonSerializer.Deserialize<MatchingPayload>(json, SerializerOptions)
            ?? throw new DomainException("حمولة سؤال الوصل غير صالحة");
        return payload;
    }

    /// <summary>Per-pair grading result: the submitted target vs the correct one.</summary>
    public record PairGrade(Guid PromptId, Guid? SubmittedTargetId, Guid CorrectTargetId, bool IsCorrect);

    /// <summary>
    /// Grades a submitted pairing: per-pair correctness + the overall verdict
    /// (all pairs correct — the exact-match precedent of MultipleSelect).
    /// Submitted pairs referencing unknown ids simply grade wrong; a missing
    /// pair for a prompt grades wrong with a null submitted target.
    /// </summary>
    public (bool IsCorrect, IReadOnlyList<PairGrade> Pairs) Grade(IReadOnlyCollection<MatchingPair> submitted)
    {
        if (AllowMultiMap)
            return GradeMultiMap(submitted);

        var submittedByPrompt = new Dictionary<Guid, Guid>();
        foreach (var pair in submitted)
        {
            // First submission per prompt wins; a second target for the same
            // prompt is an invalid bijection on the student side → mark the
            // prompt wrong by keeping a sentinel mismatch.
            if (!submittedByPrompt.TryAdd(pair.PromptId, pair.TargetId))
                submittedByPrompt[pair.PromptId] = Guid.Empty;
        }

        var correctByPrompt = Pairs.ToDictionary(pair => pair.PromptId, pair => pair.TargetId);
        var results = new List<PairGrade>();
        foreach (var prompt in Prompts.OrderBy(item => item.SortOrder))
        {
            // Defensive: write paths run Validate(), so every prompt has exactly
            // one correct pair — but never throw a 500 out of grading.
            var correctTarget = correctByPrompt.TryGetValue(prompt.Id, out var correct) ? correct : Guid.Empty;
            Guid? submittedTarget = submittedByPrompt.TryGetValue(prompt.Id, out var value) ? value : null;
            var promptCorrect = submittedTarget.HasValue && submittedTarget.Value == correctTarget;
            results.Add(new PairGrade(prompt.Id, submittedTarget, correctTarget, promptCorrect));
        }

        return (results.All(result => result.IsCorrect), results);
    }

    /// <summary>
    /// Night Task 7.1 — multi-map grading: per prompt, the student's submitted
    /// target SET must EQUAL the correct set. One PairGrade row is emitted per
    /// correct pair of the prompt (verdict repeated per row; SubmittedTargetId
    /// carries the submitted target matching that row's target when present) —
    /// the reveal UI renders the correct set from CorrectPairs either way.
    /// </summary>
    private (bool IsCorrect, IReadOnlyList<PairGrade> Pairs) GradeMultiMap(IReadOnlyCollection<MatchingPair> submitted)
    {
        var correctByPrompt = Pairs
            .GroupBy(pair => pair.PromptId)
            .ToDictionary(group => group.Key, group => group.Select(pair => pair.TargetId).ToHashSet());
        var submittedByPrompt = submitted
            .GroupBy(pair => pair.PromptId)
            .ToDictionary(group => group.Key, group => group.Select(pair => pair.TargetId).ToHashSet());

        var results = new List<PairGrade>();
        var allCorrect = true;
        foreach (var prompt in Prompts.OrderBy(item => item.SortOrder))
        {
            var correctSet = correctByPrompt.TryGetValue(prompt.Id, out var correct) ? correct : new HashSet<Guid>();
            var submittedSet = submittedByPrompt.TryGetValue(prompt.Id, out var submittedTargets) ? submittedTargets : new HashSet<Guid>();
            var promptCorrect = correctSet.SetEquals(submittedSet);
            if (!promptCorrect) allCorrect = false;
            foreach (var correctTarget in correctSet)
            {
                var submittedMatch = submittedSet.Contains(correctTarget) ? correctTarget : (Guid?)null;
                results.Add(new PairGrade(prompt.Id, submittedMatch, correctTarget, promptCorrect));
            }
        }

        return (allCorrect, results);
    }
}
