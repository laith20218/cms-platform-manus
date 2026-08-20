using MediatR;
using CMS.Application.DTOs.Dashboard;

namespace CMS.Application.Commands.Dashboard;

// ===== Dashboard Overview =====
public record GetDashboardStatsQuery() : IRequest<DashboardStatsDto>;

// ===== Recent Activity =====
public record GetRecentActivityQuery(int Count = 10) : IRequest<List<RecentActivityDto>>;

// ===== Revenue =====
public record GetRevenueDataQuery(int Months = 6) : IRequest<List<RevenueDataDto>>;

// ===== Student Growth =====
public record GetStudentGrowthQuery(int Days = 30) : IRequest<List<StudentGrowthDto>>;

// ===== Top Subjects =====
public record GetTopSubjectsQuery(int Count = 5) : IRequest<List<TopSubjectDto>>;

// ===== Reports =====
public record GetReportsSummaryQuery() : IRequest<ReportsSummaryDto>;

// ===== Admin: Student Management =====
public record GetStudentsQuery(
    string? Search,
    Guid? UniversityId,
    string? Status,
    int Page = 1,
    int PageSize = 20,
    Guid AdminId = default
) : IRequest<PagedResult<StudentManagementDto>>;

public record StudentManagementDto(
    Guid Id,
    string FullName,
    string Phone,
    string Status,
    DateTime? LastLogin,
    int QuestionsAnswered,
    double Accuracy,
    DateTime CreatedAt,
    string? UniversityName,
    string? CollegeName
);

public record BanStudentCommand(Guid StudentId, string Reason, DateTime? BanUntil, Guid AdminId) : IRequest<Unit>;
public record UnbanStudentCommand(Guid StudentId, Guid AdminId) : IRequest<Unit>;

// ===== Admin: Code Management =====
public record GetCodesQuery(
    string? Status,
    Guid? SubjectId,
    int Page = 1,
    int PageSize = 20,
    Guid AdminId = default
) : IRequest<PagedResult<CodeManagementDto>>;

public record CodeManagementDto(
    Guid Id,
    string Code,
    string ScopeType,
    string? ScopeName,
    string Status,
    DateTime? UsedAt,
    string? UsedByName,
    DateTime CreatedAt,
    DateTime? ExpiresAt
);

public record GenerateCodesCommand(
    string ScopeType,     // subject, semester, year, college, university
    Guid? ScopeId,
    int DurationDays,
    int Quantity,
    string? Prefix,
    DateTime? CodeExpiresAt,
    Guid CreatedBy
) : IRequest<GenerateCodesResultDto>;

public record GenerateCodesResultDto(
    Guid BatchId,
    int Quantity,
    List<string> Codes
);

// ===== Paged Result =====
public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);
