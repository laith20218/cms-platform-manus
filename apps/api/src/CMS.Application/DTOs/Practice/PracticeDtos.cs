using CMS.Application.DTOs.Questions;

namespace CMS.Application.DTOs.Practice;

/// <summary>W14.2 B.3 (D13) — practice session DTOs.</summary>
public record PracticeSessionDto(
    Guid SessionId,
    Guid ExamModelId,
    string ExamTitleAr,
    string Status,
    DateTime StartedAt,
    DateTime LastAccessedAt,
    decimal? Score,
    int TotalQuestions,
    int AnsweredCount,
    int CorrectCount,
    List<PracticeQuestionStateDto> Questions);

/// <summary>Per-question state inside a practice session (answer + grade only — never the correct answer while in progress).</summary>
public record PracticeQuestionStateDto(
    Guid QuestionId,
    int SortOrder,
    string? SelectedAnswer,
    bool? IsCorrect,
    DateTime? AnsweredAt);

public record SubmitPracticeAnswerDto(
    Guid QuestionId,
    string SelectedAnswer,
    int? DurationSeconds = null,
    DateTime? AnsweredAt = null,
    // W14.4 (A.4) — optional categorized lens (echoed by the client on every call).
    Guid? LectureId = null,
    bool UntaggedLecture = false,
    string? ParagraphTag = null,
    bool UntaggedTag = false);

/// <summary>W14.4 — query-param shape of the same lens for GET progress.</summary>
public record PracticeProgressFilterDto(
    Guid? LectureId = null,
    bool UntaggedLecture = false,
    string? ParagraphTag = null,
    bool UntaggedTag = false);

public record SubmitPracticeAnswerResultDto(
    Guid SessionId,
    Guid QuestionId,
    bool? IsCorrect,
    int AnsweredCount,
    int TotalQuestions,
    decimal? Score,
    string Status,
    // W14.4 (B.1) — immediate-feedback disclosure, mirroring AnswerResultDto's post-answer
    // pattern (correctness is only ever revealed AFTER the student has answered).
    List<Guid>? CorrectOptionIds = null,
    string? CorrectAnswerText = null,
    string? Explanation = null,
    string? ExplanationHtml = null,
    string? Reference = null);

public record PracticeProgressDto(
    Guid SessionId,
    Guid ExamModelId,
    string Status,
    int TotalQuestions,
    int AnsweredCount,
    int CorrectCount,
    int WrongCount,
    int UngradedCount,
    double CompletionPercent,
    decimal? Score,
    DateTime StartedAt,
    DateTime LastAccessedAt);

public record StartPracticeSessionResultDto(
    Guid SessionId,
    Guid ExamModelId,
    bool Created,
    string Status,
    DateTime StartedAt,
    DateTime LastAccessedAt,
    decimal? Score,
    // W14.4 (B.1) — the composition question set so the practice page can render
    // without a second round trip. Options/images carry NO correctness flags.
    int TotalQuestions = 0,
    List<PracticeQuestionDto>? Questions = null);

// ===== W14.4 (A.4/B.1) — categorized practice =====

/// <summary>One practice question as rendered by the practice player (correctness intentionally absent).</summary>
public record PracticeQuestionDto(
    Guid Id,
    int Number,
    string Text,
    string? TextHtml,
    string Type,
    string Difficulty,
    string? ParagraphTag,
    string? LectureTitle,
    List<QuestionOptionDto> Options,
    List<QuestionImageDto> Images);

/// <summary>Lecture node of the categorized tree; LectureId = NULL marks the "غير مصنف" bucket.</summary>
public record CategorizedPracticeLectureDto(
    Guid? LectureId,
    string LectureTitle,
    int? LectureNumber,
    int QuestionsCount,
    List<CategorizedPracticeGroupDto> Groups);

/// <summary>Paragraph-tag node; ParagraphTag = NULL marks the "غير مصنف" group.</summary>
public record CategorizedPracticeGroupDto(
    string? ParagraphTag,
    int QuestionsCount);

public record CategorizedPracticeTreeDto(
    Guid SubjectId,
    string SubjectName,
    int TotalQuestions,
    int UncategorizedCount,
    /// <summary>Published exam anchoring practice sessions for this subject (NULL when none exists yet).</summary>
    Guid? AnchorExamModelId,
    List<CategorizedPracticeLectureDto> Lectures);

/// <summary>Request body of POST /practice/categorized/{subjectId}/start.</summary>
public record StartCategorizedPracticeDto(
    Guid? LectureId = null,
    bool UntaggedLecture = false,
    string? ParagraphTag = null,
    bool UntaggedTag = false);

public record StartCategorizedPracticeResultDto(
    Guid SessionId,
    Guid AnchorExamModelId,
    bool Created,
    string Status,
    DateTime StartedAt,
    DateTime LastAccessedAt,
    decimal? Score,
    int TotalQuestions,
    List<PracticeQuestionDto> Questions);
