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
/// <summary>
/// PR-6 (Student Center): student list query. Status filter semantics:
///  - a <see cref="StudentStatus"/> name (e.g. "active", "banned") filters by status
///    within the non-archived population;
///  - the special value "archived" (case-insensitive) returns ONLY soft-deleted students
///    (DeletedAt != null) and drops the normal status filter — this is the surface admins
///    use to find archived students and restore them;
///  - any other/unparseable value keeps the default non-archived view.
/// </summary>
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

// ===== PR-6 (Student Center): per-student admin operations =====

/// <summary>
/// PR-6: an admin resets a student's password (danger-zone operation — the acting admin
/// re-authenticates with their own password, the new secret is policy-checked and hashed,
/// all student sessions are revoked, and only then is the change audited). The plaintext
/// password must never appear in any log, DTO, or exception.
/// </summary>
public record ResetStudentPasswordCommand(
    Guid ActorAdminId,
    Guid StudentId,
    string ActorPassword,
    string NewPassword,
    bool ForceChangeOnNextLogin
) : IRequest<Unit>;

/// <summary>PR-6: soft-archives a student (tombstone — never a hard delete). Idempotent.</summary>
public record ArchiveStudentCommand(Guid ActorAdminId, Guid StudentId) : IRequest<Unit>;

/// <summary>PR-6: restores a soft-archived student. Idempotent.</summary>
public record RestoreStudentCommand(Guid ActorAdminId, Guid StudentId) : IRequest<Unit>;

/// <summary>PR-6: full per-student profile for the admin student drawer.</summary>
public record GetStudentDetailQuery(Guid ActorAdminId, Guid StudentId) : IRequest<StudentDetailDto>;

/// <summary>
/// PR-6: student detail payload for the admin drawer — identity, ban/lockout state,
/// must-change-password + archive flags, stats, academic path, subscription summary,
/// and the active device binding. Nulls mean "unset".
/// </summary>
public record StudentDetailDto(
    Guid Id,
    string FullName,
    string Phone,
    string? Email,
    string? Gender,
    string? AvatarUrl,
    string Status,
    string? BanReason,
    DateTime? BanUntil,
    bool LockedOut,
    DateTime? LockoutUntil,
    int FailedLoginCount,
    bool PhoneVerified,
    bool MustChangePassword,
    bool Archived,
    DateTime? ArchivedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? LastLogin,
    int LoginCount,
    DateTime? LastActivityDate,
    int QuestionsAnswered,
    int CorrectAnswers,
    double Accuracy,
    int CurrentStreak,
    int LongestStreak,
    StudentAcademicInfoDto? Academic,
    StudentSubscriptionSummaryDto SubscriptionSummary,
    StudentActiveDeviceDto? ActiveDevice);

/// <summary>Academic path (university/college/year) with resolved names; nulls when unset.</summary>
public record StudentAcademicInfoDto(
    Guid? UniversityId,
    string? UniversityName,
    Guid? CollegeId,
    string? CollegeName,
    Guid? AcademicYearId,
    string? AcademicYearName);

/// <summary>Subscription summary: count of active grants + the latest subscription (or null).</summary>
public record StudentSubscriptionSummaryDto(
    int ActiveCount,
    StudentSubscriptionBriefDto? Latest);

public record StudentSubscriptionBriefDto(
    Guid Id,
    string Status,
    string ScopeType,
    DateTime StartsAt,
    DateTime ExpiresAt);

/// <summary>The student's most recently used active device binding (or null).</summary>
public record StudentActiveDeviceDto(
    string? DeviceName,
    string? DeviceType,
    string? Os,
    string? Browser,
    DateTime BoundAt,
    DateTime LastUsed);

// ===== Admin: Code Management =====
public record GetCodesQuery(
    string? Status,
    Guid? SubjectId,
    int Page = 1,
    int PageSize = 20,
    Guid AdminId = default,
    string? Search = null,
    string? ScopeType = null,
    Guid? YearId = null
) : IRequest<PagedResult<CodeManagementDto>>;

/// <summary>
/// Night Task 5.3 — per-student redemption detail for one code: who activated
/// it, what it unlocks (content scope + resolved subject name), and the
/// subscription window/state.
/// </summary>
public record CodeRedemptionDto(
    Guid SubscriptionId,
    string? StudentName,
    string? StudentPhone,
    string ContentScope,
    string? SubjectName,
    string ScopeType,
    string Status,
    DateTime StartsAt,
    DateTime ExpiresAt,
    DateTime? RevokedAt,
    string? RevocationReason
);

public record CodeManagementDto(
    Guid Id,
    string Code,
    string ScopeType,
    string ContentScope,
    bool IsPublic,
    string? ScopeName,
    string Status,
    DateTime? UsedAt,
    string? UsedByName,
    DateTime CreatedAt,
    DateTime? ExpiresAt,
    int RedemptionCount
);

public record GenerateCodesCommand(
    string ScopeType,     // subject, semester, year, college, university
    Guid? ScopeId,
    int DurationDays,
    int Quantity,
    string? Prefix,
    DateTime? CodeExpiresAt,
    string ContentScope,
    bool IsPublic,
    Guid CreatedBy,
    Guid? SessionId = null
) : IRequest<GenerateCodesResultDto>;

public record GenerateCodesResultDto(
    Guid BatchId,
    int Quantity,
    List<string> Codes
);

// ===== Paged Result =====
public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);
