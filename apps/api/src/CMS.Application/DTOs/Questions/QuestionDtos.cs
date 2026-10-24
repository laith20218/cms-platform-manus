namespace CMS.Application.DTOs.Questions;

// ===== Question DTOs =====
public record QuestionDto(
    Guid Id,
    string Text,
    string? TextHtml,
    string Type,
    string Difficulty,
    List<string> Tags,
    string? LectureTitle,
    int? Year,
    string? Reference,
    string? ParagraphTag,
    List<QuestionOptionDto> Options,
    List<QuestionImageDto> Images,
    QuestionUserAnswerDto? UserAnswer,
    bool IsFavorite,
    QuestionStatsDto? Stats
);

public record QuestionListItemDto(
    Guid Id,
    string Text,
    string Type,
    string Difficulty,
    List<string> Tags,
    string? LectureTitle,
    int? Year,
    QuestionUserAnswerDto? UserAnswer,
    bool IsFavorite
);

public record QuestionOptionDto(
    Guid Id,
    string Letter,
    string Text,
    string? ImageUrl
);

public record QuestionImageDto(
    Guid Id,
    string ImageUrl,
    string? AltText,
    string? Caption
);

public record QuestionUserAnswerDto(
    string? SelectedOptionId,
    bool IsCorrect,
    bool IsFirstAttempt,
    DateTime? AnsweredAt
);

public record QuestionStatsDto(
    int AttemptsCount,
    double CorrectRate
);

// ===== Create/Update =====
public record CreateQuestionDto(
    string Text,
    string Type,
    Guid SubjectId,
    Guid? LectureId,
    string Difficulty,
    List<string> Tags,
    List<CreateOptionDto> Options,
    string CorrectOptionId,
    string? CorrectAnswer,
    string Explanation,
    string? Reference,
    int? Year,
    string? ParagraphTag = null
);

public record CreateOptionDto(
    string Text,
    bool IsCorrect,
    string? ImageUrl
);

public record UpdateQuestionDto(
    string Text,
    string Difficulty,
    List<string> Tags,
    string Explanation,
    string? Reference,
    List<UpdateOptionDto> Options,
    string? CorrectAnswer,
    int? Year = null,
    string? ParagraphTag = null
);

public record UpdateOptionDto(
    Guid? Id,
    string Text,
    bool IsCorrect,
    string? ImageUrl
);

// ===== Answer =====
public record AnswerQuestionDto(
    string? SelectedOptionId,
    string? AnswerText,
    int DurationSeconds,
    bool IsOffline
);

public record AnswerResultDto(
    bool IsCorrect,
    string CorrectOptionId,
    string CorrectOptionLetter,
    string Explanation,
    string? ExplanationHtml,
    string? Reference,
    bool IsFirstAttempt,
    List<AchievementDto>? NewAchievements,
    UpdatedStatsDto? UpdatedStats,
    string? CorrectAnswerText
);

public record AchievementDto(
    string Type,
    string Title,
    string Icon
);

public record UpdatedStatsDto(
    int QuestionsAnswered,
    int CorrectAnswers,
    double Accuracy,
    int CurrentStreak
);

// ===== Report =====
public record ReportQuestionDto(
    string ReasonType,
    string Description,
    string? ScreenshotUrl
);

// ===== Import =====
public record ImportQuestionsDto(
    Guid SubjectId,
    Guid? LectureId,
    List<ImportQuestionRow> Questions
);

public record ImportQuestionRow(
    string Text,
    string OptionA,
    string OptionB,
    string OptionC,
    string OptionD,
    string CorrectOption,
    string Explanation,
    string Difficulty,
    string? Tags,
    int? Year,
    string? Reference
);

public record ImportResultDto(
    int Total,
    int Success,
    int Failed,
    List<string> Errors
);

// ===== Full Question (with answer + explanation, returned after answering) =====
public record FullQuestionDto(
    Guid Id,
    string Text,
    string? TextHtml,
    string Type,
    string Difficulty,
    List<string> Tags,
    string? LectureTitle,
    int? Year,
    string? Reference,
    List<QuestionOptionDto> Options,
    string? CorrectOptionId,
    string? Explanation,
    string? ExplanationHtml,
    List<QuestionImageDto> Images,
    QuestionUserAnswerDto? UserAnswer,
    bool IsFavorite,
    QuestionStatsDto? Stats
);


// ===== Admin question management =====
public record AdminQuestionListItemDto(
    Guid Id,
    Guid SubjectId,
    Guid? LectureId,
    string Text,
    string Type,
    string Difficulty,
    string Status,
    List<string> Tags,
    string? LectureTitle,
    int OptionsCount,
    int AttemptsCount,
    double CorrectRate,
    DateTime CreatedAt,
    DateTime? UpdatedAt
);

public record AdminQuestionDetailDto(
    Guid Id,
    Guid SubjectId,
    Guid? LectureId,
    string Text,
    string Type,
    string Difficulty,
    string Status,
    List<string> Tags,
    string? Reference,
    int? Year,
    string Explanation,
    string CorrectAnswer,
    List<QuestionOptionDto> Options,
    DateTime CreatedAt,
    DateTime? UpdatedAt
);
