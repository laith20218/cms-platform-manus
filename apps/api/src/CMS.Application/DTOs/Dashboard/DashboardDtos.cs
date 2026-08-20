namespace CMS.Application.DTOs.Dashboard;

// ===== Dashboard Stats =====
public record DashboardStatsDto(
    int TotalStudents,
    int ActiveStudentsToday,
    int TotalQuestions,
    int TotalActiveCodes,
    int TotalActiveSubscriptions,
    int TotalLibraryFiles,
    int TotalExams,
    int PendingReports,
    decimal MonthlyRevenue,
    decimal RevenueChangePercent
);

// ===== Recent Activity =====
public record RecentActivityDto(
    Guid Id,
    string Type,        // "registration", "subscription", "report", "security", "upload"
    string Description,
    string? ActorName,
    DateTime CreatedAt
);

// ===== Revenue Chart =====
public record RevenueDataDto(
    string Period,      // "2026-07"
    decimal Revenue,
    int CodesSold,
    int NewSubscriptions
);

// ===== Student Growth =====
public record StudentGrowthDto(
    string Date,        // "2026-07-30"
    int NewRegistrations,
    int ActiveUsers
);

// ===== Top Subjects =====
public record TopSubjectDto(
    Guid SubjectId,
    string SubjectName,
    int QuestionsAnswered,
    double AverageAccuracy,
    int ActiveStudents
);

// ===== Most Reported Questions =====
public record ReportedQuestionDto(
    Guid QuestionId,
    string QuestionText,
    int ReportsCount,
    string MostCommonReason,
    DateTime LastReportedAt
);

// ===== Reports Summary =====
public record ReportsSummaryDto(
    int TotalReports,
    int PendingReports,
    int ResolvedReports,
    int RejectedReports,
    List<ReportedQuestionDto> RecentReports
);

// ===== Period Enum =====
public record PeriodRequest(string Period); // "today", "week", "month", "year"
