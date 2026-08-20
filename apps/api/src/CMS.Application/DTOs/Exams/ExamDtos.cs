namespace CMS.Application.DTOs.Exams;

// ===== Exam DTOs =====
public record ExamDto(
    Guid Id,
    Guid SubjectId,
    string TitleAr,
    string? TitleEn,
    string Slug,
    string? Description,
    string ExamType,
    int Year,
    int DurationMinutes,
    int TotalQuestions,
    decimal PassingScore,
    bool ShuffleQuestions,
    bool ShuffleOptions,
    bool ShowResultsImmediately,
    bool AllowReview,
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
    bool HasPassed
);

// ===== Exam Session =====
public record StartExamSessionDto(string Mode); // "test" | "review"

public record ExamSessionDto(
    Guid SessionId,
    Guid ExamId,
    string ExamTitle,
    int TotalQuestions,
    int DurationMinutes,
    DateTime ExpiresAt,
    List<ExamQuestionDto> Questions
);

public record ExamQuestionDto(
    Guid Id,
    int Number,
    string Text,
    List<ExamOptionDto> Options
);

public record ExamOptionDto(
    Guid Id,
    string Letter,
    string Text
);

// ===== Submit Exam =====
public record SubmitExamDto(List<ExamAnswerDto> Answers);

public record ExamAnswerDto(
    Guid QuestionId,
    string SelectedOptionId,
    int DurationSeconds
);

// ===== Exam Results =====
public record ExamResultDto(
    Guid SessionId,
    double Score,
    bool Passed,
    int TotalQuestions,
    int AnsweredQuestions,
    int CorrectAnswers,
    int DurationSeconds,
    List<WeakTopicDto> WeakestTopics,
    ExamComparisonDto Comparison
);

public record WeakTopicDto(
    string Tag,
    double Accuracy
);

public record ExamComparisonDto(
    double YourScore,
    double AverageScore,
    double TopScore
);

// ===== Exam Review =====
public record ExamReviewDto(
    Guid SessionId,
    List<ReviewQuestionDto> Questions
);

public record ReviewQuestionDto(
    Guid Id,
    string Text,
    List<ReviewOptionDto> Options,
    string? UserAnswer,
    string? CorrectAnswer,
    bool IsCorrect,
    string? Explanation
);

public record ReviewOptionDto(
    Guid Id,
    string Letter,
    string Text,
    bool IsCorrect,
    bool IsUserAnswer
);
