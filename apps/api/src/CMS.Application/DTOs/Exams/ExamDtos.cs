namespace CMS.Application.DTOs.Exams;

// ===== Student discovery =====
public record ExamDto(
    Guid Id,
    Guid SubjectId,
    Guid? LectureId,
    string TitleAr,
    string? TitleEn,
    string Slug,
    string? Description,
    string ExamType,
    int Year,
    int DurationMinutes,
    int TotalQuestions,
    decimal PassingScore,
    DateTime? AvailableFrom,
    DateTime? AvailableUntil,
    int? MaxAttempts,
    bool ShuffleQuestions,
    bool ShuffleOptions,
    bool ShowResultsImmediately,
    bool AllowReview,
    bool ShowCorrectAnswers,
    bool ShowExplanations,
    string Status
);

public record ExamListItemDto(
    Guid Id,
    string TitleAr,
    string Slug,
    string ExamType,
    int Year,
    int DurationMinutes,
    int TotalQuestions,
    bool HasAttempted,
    double? BestScore,
    bool HasPassed,
    bool CanStart,
    string? StartBlockedReason,
    int? RemainingAttempts,
    bool HasInProgressSession
);

// ===== Student session =====
public record StartExamSessionDto(string? Mode, string? IdempotencyKey = null);

public record ExamSessionDto(
    Guid SessionId,
    Guid ExamId,
    string ExamTitle,
    string Status,
    int TotalQuestions,
    int DurationMinutes,
    DateTime StartedAt,
    DateTime ExpiresAt,
    int CurrentQuestionOrder,
    List<ExamQuestionDto> Questions
);

public record ExamQuestionDto(
    Guid Id,
    Guid SourceQuestionId,
    int Number,
    string Type,
    string Text,
    string? TextHtml,
    List<ExamOptionDto> Options,
    List<ExamImageDto> Images,
    string? SavedAnswer
);

public record ExamOptionDto(Guid Id, string Letter, string Text, string? TextHtml = null, string? ImageUrl = null);
public record ExamImageDto(Guid Id, string ImageUrl, string? AltText, string? Caption, int SortOrder);

public record SaveExamAnswerDto(Guid QuestionId, string? Answer, int? CurrentQuestionOrder = null, bool ClearAnswer = false);
public record SaveExamAnswerResultDto(Guid SessionId, Guid QuestionId, string? SavedAnswer, int AnsweredQuestions, int CurrentQuestionOrder, DateTime ExpiresAt, string Status);
public record SubmitExamDto(List<ExamAnswerDto>? Answers = null);
public record ExamAnswerDto(Guid QuestionId, string? Answer, int? DurationSeconds = null);

// ===== Student results =====
public record ExamResultDto(
    Guid SessionId,
    string Status,
    bool IsResultVisible,
    double? Score,
    bool? Passed,
    int TotalQuestions,
    int AnsweredQuestions,
    int CorrectAnswers,
    int UnansweredQuestions,
    int DurationSeconds,
    bool CanReview,
    List<WeakTopicDto> WeakestTopics,
    ExamComparisonDto? Comparison
);

public record WeakTopicDto(string Tag, double Accuracy);
public record ExamComparisonDto(double YourScore, double AverageScore, double TopScore);

// ===== Student review =====
public record ExamReviewDto(
    Guid SessionId,
    bool ShowCorrectAnswers,
    bool ShowExplanations,
    List<ReviewQuestionDto> Questions
);

public record ReviewQuestionDto(
    Guid Id,
    Guid SourceQuestionId,
    int Number,
    string Type,
    string Text,
    List<ReviewOptionDto> Options,
    string? UserAnswer,
    string? CorrectAnswer,
    bool? IsCorrect,
    string? Explanation
);

public record ReviewOptionDto(Guid Id, string Letter, string Text, bool IsCorrect, bool IsUserAnswer);

// ===== Admin exam management =====
public record AdminExamListItemDto(
    Guid Id,
    Guid SubjectId,
    Guid? LectureId,
    string TitleAr,
    string Slug,
    string ExamType,
    int Year,
    int TotalQuestions,
    int DurationMinutes,
    DateTime? AvailableFrom,
    DateTime? AvailableUntil,
    int? MaxAttempts,
    string Status,
    int AttemptsCount,
    int CompletedCount,
    double? AverageScore
);

public record AdminExamDetailsDto(ExamDto Exam, List<AdminExamQuestionDto> Questions);
public record AdminExamQuestionDto(Guid QuestionId, int SortOrder, string Text, string Type, string Difficulty, string? LectureName, List<string> Tags);
public record ExamQuestionCandidateDto(Guid Id, string Text, string Type, string Difficulty, Guid? LectureId, string? LectureName, List<string> Tags);

public record AdminExamResultDto(
    Guid SessionId,
    Guid StudentId,
    string StudentName,
    string Status,
    DateTime StartedAt,
    DateTime? CompletedAt,
    int AnsweredQuestions,
    int CorrectAnswers,
    double? Score,
    bool? Passed,
    bool IsFirstAttempt
);

public record PagedExamResultDto<T>(List<T> Items, int Page, int PageSize, int TotalCount);
