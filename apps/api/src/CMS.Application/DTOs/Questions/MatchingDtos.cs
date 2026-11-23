namespace CMS.Application.DTOs.Questions;

// ===== Wave 20.5 (owner decision 3) — the Matching (وصل) question type =====

/// <summary>One item of a matching question (a prompt or a target), with its stable id.</summary>
public record MatchingItemDto(
    Guid Id,
    string Text,
    int SortOrder);

/// <summary>One correct pairing (prompt → target).</summary>
public record MatchingPairDto(
    Guid PromptId,
    Guid TargetId);

/// <summary>
/// The FULL matching payload (admin read/write): prompts, targets and the correct
/// pairs map. Only the admin surfaces and the POST-answer results may ever carry
/// the pairs — student read DTOs use <see cref="MatchingStudentDto"/> instead.
/// </summary>
public record MatchingPayloadDto(
    List<MatchingItemDto> Prompts,
    List<MatchingItemDto> Targets,
    List<MatchingPairDto> Pairs,
    // Night Task 7 — optional rules (default false / null = legacy W20.5 behavior).
    bool AllowMultiMap = false,
    string? PromptNumbering = null,
    string? TargetNumbering = null);

/// <summary>
/// The STUDENT-facing matching payload: prompts + targets only. The correct pairs
/// must never leak before the student answers (the same reveal discipline every
/// other type follows).
/// </summary>
public record MatchingStudentDto(
    List<MatchingItemDto> Prompts,
    List<MatchingItemDto> Targets,
    // Night Task 7 — presentation/rules metadata (no pairs leak: safe pre-answer).
    bool AllowMultiMap = false,
    string? PromptNumbering = null,
    string? TargetNumbering = null);

/// <summary>Per-pair grading result disclosed after answering.</summary>
public record MatchingPairResultDto(
    Guid PromptId,
    Guid? SubmittedTargetId,
    Guid CorrectTargetId,
    bool IsCorrect);

/// <summary>
/// The post-answer matching result: per-pair correctness + the full correct map
/// (the reveal moment — same contract as CorrectOptionIds for choice types).
/// </summary>
public record MatchingResultDto(
    bool IsCorrect,
    List<MatchingPairResultDto> Pairs,
    List<MatchingPairDto> CorrectPairs);
