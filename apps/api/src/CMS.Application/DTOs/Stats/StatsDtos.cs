namespace CMS.Application.DTOs.Stats;

// ===== Student Stats =====
public record StudentStatsDto(
    int TotalQuestions,
    int CorrectAnswers,
    double Accuracy,
    int CurrentStreak,
    int LongestStreak,
    int StudyTimeMinutes,
    int ExamsCompleted,
    int FavoriteCount,
    List<SubjectStatsDto> BySubject,
    DifficultyStatsDto ByDifficulty,
    int CompletedLectures,
    int ReadFiles
);

public record SubjectStatsDto(
    Guid SubjectId,
    string SubjectName,
    int QuestionsAnswered,
    double Accuracy,
    double CompletedPercentage
);

public record DifficultyStatsDto(
    DifficultyStat Easy,
    DifficultyStat Medium,
    DifficultyStat Hard
);

public record DifficultyStat(int Answered, double Accuracy);

// ===== Leaderboard =====
public record LeaderboardDto(
    List<LeaderboardEntryDto> TopStudents,
    LeaderboardEntryDto? YourRank
);

// W15.4.4.0a (D3): the student identifier no longer rides this DTO — entries are
// anonymous to the client except for the display fields; IsYou marks the requesting
// student's own row.
public record LeaderboardEntryDto(
    int Rank,
    string StudentName,
    string? AvatarUrl,
    int QuestionsAnswered,
    double Accuracy,
    bool IsYou
);

// ===== Admin: Global Stats =====
public record GlobalStatsDto(
    int TotalStudents,
    int TotalQuestions,
    int TotalAnswers,
    double PlatformAccuracy,
    int TotalExamSessions,
    int TotalLibraryViews,
    List<SubjectActivityDto> MostActiveSubjects,
    List<SubjectActivityDto> HardestSubjects,
    List<FileViewStatsDto> MostViewedFiles,
    List<HourlyActivityDto> HourlyActivity
);

public record SubjectActivityDto(
    Guid SubjectId,
    string SubjectName,
    int QuestionsAnswered,
    double Accuracy
);

public record FileViewStatsDto(
    Guid FileId,
    string Title,
    string Type,
    int ViewsCount
);

public record HourlyActivityDto(
    int Hour,
    int ActiveUsers,
    int QuestionsAnswered
);
