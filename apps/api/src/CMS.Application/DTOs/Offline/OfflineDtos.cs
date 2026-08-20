namespace CMS.Application.DTOs.Offline;

/// <summary>Encrypted offline package envelope. Plaintext questions and raw AES keys are never returned.</summary>
public record OfflinePackageDto(
    Guid PackageId,
    Guid SubjectId,
    Guid? ExamId,
    string SubjectName,
    string? ExamTitle,
    int QuestionsCount,
    DateTime DownloadedAt,
    DateTime ExpiresAt,
    object Manifest,
    string CiphertextBase64Url,
    string TagBase64Url,
    string WrappedKeyBase64Url,
    string KeyReleaseToken
);

public record OfflineQuestionDto(
    Guid Id,
    string Text,
    string Type,
    string Difficulty,
    List<string> Tags,
    List<OfflineOptionDto> Options
);

public record OfflineOptionDto(Guid Id, string Letter, string Text);

public record SyncOfflineAnswersDto(Guid PackageId, Guid? ExamSessionId, List<OfflineAnswerDto> Answers);

public record OfflineAnswerDto(Guid QuestionId, string SelectedOptionId, int DurationSeconds, DateTime AnsweredAt, bool IsCorrect);

public record SyncResultDto(int TotalSynced, int SuccessCount, int FailedCount, List<string> Errors, UpdatedStatsDto? UpdatedStats);

public record UpdatedStatsDto(int QuestionsAnswered, int CorrectAnswers, double Accuracy, int CurrentStreak);

public record OfflinePackageListItemDto(Guid PackageId, string SubjectName, string? ExamTitle, int QuestionsCount, DateTime DownloadedAt, DateTime ExpiresAt, bool IsExpired, int QuestionsAnswered);

/// <summary>Minimal server-confirmed package state for local revocation enforcement; contains no encrypted payload or key material.</summary>
public record OfflinePackageStatusDto(Guid PackageId, string Status, DateTime ExpiresAt, DateTime? RevokedAt, DateTime ConfirmedAt);
