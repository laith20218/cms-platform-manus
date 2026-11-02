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

public record SubmitPracticeAnswerDto(Guid QuestionId, string SelectedAnswer, int? DurationSeconds = null, DateTime? AnsweredAt = null);

public record SubmitPracticeAnswerResultDto(
    Guid SessionId,
    Guid QuestionId,
    bool? IsCorrect,
    int AnsweredCount,
    int TotalQuestions,
    decimal? Score,
    string Status);

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
    decimal? Score);
