using System.Security.Cryptography;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Dashboard;
using CMS.Application.DTOs.Dashboard;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Application.Interfaces;

namespace CMS.Application.Handlers.Dashboard;

/// <summary>
/// Handles all admin dashboard queries and management commands.
/// </summary>
public class DashboardQueryHandlers :
    IRequestHandler<GetDashboardStatsQuery, DashboardStatsDto>,
    IRequestHandler<GetRecentActivityQuery, List<RecentActivityDto>>,
    IRequestHandler<GetRevenueDataQuery, List<RevenueDataDto>>,
    IRequestHandler<GetStudentGrowthQuery, List<StudentGrowthDto>>,
    IRequestHandler<GetTopSubjectsQuery, List<TopSubjectDto>>,
    IRequestHandler<GetReportsSummaryQuery, ReportsSummaryDto>
{
    private readonly IApplicationDbContext _db;
    public DashboardQueryHandlers(IApplicationDbContext db) => _db = db;

    public async Task<DashboardStatsDto> Handle(GetDashboardStatsQuery req, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var todayStart = new DateTime(now.Year, now.Month, now.Day, 0, 0, 0, DateTimeKind.Utc);
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var lastMonthStart = monthStart.AddMonths(-1);

        var totalStudents = await _db.Students.CountAsync(s => s.DeletedAt == null, ct);
        var activeToday = await _db.Students.CountAsync(s => s.LastLogin >= todayStart, ct);
        var totalQuestions = await _db.Questions.CountAsync(q => q.Status == ContentStatus.Published, ct);
        var totalActiveCodes = await _db.SubscriptionCodes.CountAsync(c => c.Status == CodeStatus.Active, ct);
        var totalActiveSubs = await _db.StudentSubscriptions.CountAsync(s => s.Status == SubscriptionStatus.Active && s.ExpiresAt > now, ct);
        var totalFiles = await _db.LibraryFiles.CountAsync(f => f.Status == ContentStatus.Published && f.DeletedAt == null, ct);
        var totalExams = await _db.Exams.CountAsync(e => e.Status == ContentStatus.Published && e.DeletedAt == null, ct);
        var pendingReports = await _db.ErrorReports.CountAsync(r => r.Status == ErrorReportStatus.Pending, ct);

        // Revenue: count codes used this month × average price (simplified)
        var codesThisMonth = await _db.SubscriptionCodes
            .CountAsync(c => c.UsedAt.HasValue && c.UsedAt >= monthStart, ct);
        var codesLastMonth = await _db.SubscriptionCodes
            .CountAsync(c => c.UsedAt.HasValue && c.UsedAt >= lastMonthStart && c.UsedAt < monthStart, ct);

        var avgPrice = 25000m; // Average subscription price in SYP
        var monthlyRevenue = codesThisMonth * avgPrice;
        var lastMonthRevenue = codesLastMonth * avgPrice;
        var revenueChange = lastMonthRevenue > 0
            ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
            : 100;

        return new DashboardStatsDto(
            totalStudents, activeToday, totalQuestions, totalActiveCodes,
            totalActiveSubs, totalFiles, totalExams, pendingReports,
            monthlyRevenue, (decimal)revenueChange
        );
    }

    public async Task<List<RecentActivityDto>> Handle(GetRecentActivityQuery req, CancellationToken ct)
    {
        var activities = new List<RecentActivityDto>();

        // Recent registrations
        var recentStudents = await _db.Students
            .AsNoTracking()
            .OrderByDescending(s => s.CreatedAt)
            .Take(req.Count / 3)
            .Select(s => new RecentActivityDto(
                s.Id, "registration", $"طالب جديد: {s.FullName}", s.FullName, s.CreatedAt
            ))
            .ToListAsync(ct);
        activities.AddRange(recentStudents);

        // Recent code activations
        var recentCodes = await _db.SubscriptionCodes
            .AsNoTracking()
            .Where(c => c.UsedAt.HasValue)
            .OrderByDescending(c => c.UsedAt)
            .Take(req.Count / 3)
            .Select(c => new RecentActivityDto(
                c.Id, "subscription", $"تفعيل كود اشتراك: {c.Code}", null, c.UsedAt!.Value
            ))
            .ToListAsync(ct);
        activities.AddRange(recentCodes);

        // Recent reports
        var recentReports = await _db.ErrorReports
            .AsNoTracking()
            .OrderByDescending(r => r.CreatedAt)
            .Take(req.Count / 3)
            .Select(r => new RecentActivityDto(
                r.Id, "report", $"بلاغ جديد على سؤال: {r.ReasonType}", null, r.CreatedAt
            ))
            .ToListAsync(ct);
        activities.AddRange(recentReports);

        return activities.OrderByDescending(a => a.CreatedAt).Take(req.Count).ToList();
    }

    public async Task<List<RevenueDataDto>> Handle(GetRevenueDataQuery req, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var result = new List<RevenueDataDto>();
        var avgPrice = 25000m;

        for (int i = req.Months - 1; i >= 0; i--)
        {
            var monthStart = new DateTime(now.Year, now.Month, 1).AddMonths(-i);
            var monthEnd = monthStart.AddMonths(1);

            var codesSold = await _db.SubscriptionCodes
                .CountAsync(c => c.UsedAt.HasValue && c.UsedAt >= monthStart && c.UsedAt < monthEnd, ct);

            var newSubs = await _db.StudentSubscriptions
                .CountAsync(s => s.CreatedAt >= monthStart && s.CreatedAt < monthEnd, ct);

            result.Add(new RevenueDataDto(
                monthStart.ToString("yyyy-MM"),
                codesSold * avgPrice,
                codesSold,
                newSubs
            ));
        }

        return result;
    }

    public async Task<List<StudentGrowthDto>> Handle(GetStudentGrowthQuery req, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var result = new List<StudentGrowthDto>();

        for (int i = req.Days - 1; i >= 0; i--)
        {
            var date = now.Date.AddDays(-i);
            var nextDate = date.AddDays(1);

            var newRegs = await _db.Students
                .CountAsync(s => s.CreatedAt >= date && s.CreatedAt < nextDate, ct);

            var activeUsers = await _db.Students
                .CountAsync(s => s.LastActivityDate == date, ct);

            result.Add(new StudentGrowthDto(date.ToString("yyyy-MM-dd"), newRegs, activeUsers));
        }

        return result;
    }

    public async Task<List<TopSubjectDto>> Handle(GetTopSubjectsQuery req, CancellationToken ct)
    {
        // Regression fix (route-contract wave): the previous shape projected the TopSubjectDto
        // constructor directly inside the GroupBy Select, which EF Core 9 + Npgsql cannot
        // translate (InvalidOperationException "could not be translated" — surfaced live as a
        // 500 on GET /api/v1/admin/top-subjects). The Includes were also meaningless on an
        // aggregate query. Project an anonymous row first (fully translatable), then map to
        // the DTO in memory.
        var rows = await _db.AttemptLogs
            .AsNoTracking()
            .GroupBy(a => new { a.Question.SubjectId, a.Question.Subject.NameAr })
            .Select(g => new
            {
                g.Key.SubjectId,
                SubjectName = g.Key.NameAr,
                QuestionsAnswered = g.Count(),
                AverageAccuracy = g.Average(a => a.IsCorrect ? 100.0 : 0.0),
                ActiveStudents = g.Select(a => a.StudentId).Distinct().Count()
            })
            .OrderByDescending(s => s.QuestionsAnswered)
            .Take(req.Count)
            .ToListAsync(ct);

        return rows
            .Select(r => new TopSubjectDto(r.SubjectId, r.SubjectName, r.QuestionsAnswered, r.AverageAccuracy, r.ActiveStudents))
            .ToList();
    }

    public async Task<ReportsSummaryDto> Handle(GetReportsSummaryQuery req, CancellationToken ct)
    {
        var total = await _db.ErrorReports.CountAsync(ct);
        var pending = await _db.ErrorReports.CountAsync(r => r.Status == ErrorReportStatus.Pending, ct);
        var resolved = await _db.ErrorReports.CountAsync(r => r.Status == ErrorReportStatus.Resolved, ct);
        var rejected = await _db.ErrorReports.CountAsync(r => r.Status == ErrorReportStatus.Rejected, ct);

        var recentReports = await _db.ErrorReports
            .AsNoTracking()
            .Include(r => r.Question)
            .OrderByDescending(r => r.CreatedAt)
            .Take(5)
            .Select(r => new ReportedQuestionDto(
                r.QuestionId,
                r.Question.Text.Length > 100 ? r.Question.Text.Substring(0, 100) + "..." : r.Question.Text,
                r.Question.ReportsCount,
                r.ReasonType.ToString(),
                r.CreatedAt
            ))
            .ToListAsync(ct);

        return new ReportsSummaryDto(total, pending, resolved, rejected, recentReports);
    }
}

/// <summary>
/// Handles student and code management commands.
/// </summary>
public class AdminManagementHandlers :
    IRequestHandler<GetStudentsQuery, PagedResult<StudentManagementDto>>,
    IRequestHandler<BanStudentCommand, Unit>,
    IRequestHandler<UnbanStudentCommand, Unit>,
    IRequestHandler<ResetStudentPasswordCommand, Unit>,
    IRequestHandler<ArchiveStudentCommand, Unit>,
    IRequestHandler<RestoreStudentCommand, Unit>,
    IRequestHandler<GetStudentDetailQuery, StudentDetailDto>,
    IRequestHandler<GetCodesQuery, PagedResult<CodeManagementDto>>,
    IRequestHandler<GenerateCodesCommand, GenerateCodesResultDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPermissionService _permissions;
    private readonly ISecurityAuditWriter _audit;
    // Push 2 / Track 2: activity-monitor writer (best-effort — never fails the business op).
    private readonly IAdminActivityWriter _activity;
    // PR-6 (Student Center): actor re-auth + new-secret hashing/policy for the student
    // password reset, and session revocation for reset/archive.
    private readonly IPasswordHasher _passwordHasher;
    private readonly IPasswordPolicy _passwordPolicy;
    private readonly ISessionService _sessionService;

    public AdminManagementHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IPermissionService permissions,
        ISecurityAuditWriter audit,
        IAdminActivityWriter activity,
        IPasswordHasher passwordHasher,
        IPasswordPolicy passwordPolicy,
        ISessionService sessionService)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _permissions = permissions;
        _audit = audit;
        _activity = activity;
        _passwordHasher = passwordHasher;
        _passwordPolicy = passwordPolicy;
        _sessionService = sessionService;
    }

    public async Task<PagedResult<StudentManagementDto>> Handle(GetStudentsQuery req, CancellationToken ct)
    {
        await EnsurePermissionAsync(req.AdminId, Resources.Students, Actions.View, ct);
        var scope = await _permissions.GetScopeAsync(req.AdminId, ct) ?? throw new ForbiddenException("لا تملك نطاقاً إدارياً صالحاً");
        if (!scope.IsSuperAdmin && scope.SubjectId.HasValue)
            throw new ForbiddenException("لا يمكن لمدير المادة عرض قائمة الطلاب خارج رابط مادة-طالب صريح");
        if (!scope.IsSuperAdmin && req.UniversityId.HasValue && scope.UniversityId.HasValue && req.UniversityId != scope.UniversityId)
            throw new ForbiddenException("مرشح الجامعة خارج نطاقك الإداري");

        var query = _db.Students.AsNoTracking()
            .Include(s => s.University)
            .Include(s => s.College)
            .Where(s => s.DeletedAt == null);

        // PR-6 (Student Center): the special status "archived" flips the tombstone filter —
        // return ONLY soft-deleted students (and drop the normal status filter) so admins
        // can find and restore them. Every other status keeps the non-archived default.
        var wantsArchived = string.Equals(req.Status, "archived", StringComparison.OrdinalIgnoreCase);
        if (wantsArchived)
            query = _db.Students.AsNoTracking()
                .Include(s => s.University)
                .Include(s => s.College)
                .Where(s => s.DeletedAt != null);

        if (!scope.IsSuperAdmin)
        {
            if (scope.UniversityId.HasValue) query = query.Where(student => student.UniversityId == scope.UniversityId);
            if (scope.CollegeId.HasValue) query = query.Where(student => student.CollegeId == scope.CollegeId);
            if (scope.YearId.HasValue) query = query.Where(student => student.AcademicYearId == scope.YearId);
        }

        if (!string.IsNullOrEmpty(req.Search))
        {
            query = query.Where(s => s.FullName.Contains(req.Search) || s.Phone.Contains(req.Search));
        }

        if (req.UniversityId.HasValue)
            query = query.Where(s => s.UniversityId == req.UniversityId);

        if (!wantsArchived && !string.IsNullOrEmpty(req.Status) && Enum.TryParse<StudentStatus>(req.Status, true, out var status))
            query = query.Where(s => s.Status == status);

        var total = await query.CountAsync(ct);
        var students = await query
            .OrderByDescending(s => s.CreatedAt)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);

        var items = students.Select(s => new StudentManagementDto(
            s.Id, s.FullName, s.Phone, s.Status.ToString(),
            s.LastLogin, s.QuestionsAnswered, s.GetAccuracy(),
            s.CreatedAt, s.University?.NameAr, s.College?.NameAr
        )).ToList();

        return new PagedResult<StudentManagementDto>(items, total, req.Page, req.PageSize, (int)Math.Ceiling(total / (double)req.PageSize));
    }

    public async Task<Unit> Handle(BanStudentCommand req, CancellationToken ct)
    {
        await EnsureScopedPermissionAsync(req.AdminId, Resources.Students, Actions.Edit, "student", req.StudentId, ct);
        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == req.StudentId, ct)
            ?? throw new NotFoundException("Student", req.StudentId);

        student.Ban(req.Reason, req.BanUntil);
        await _unitOfWork.SaveChangesAsync(ct);
        await _audit.LogSecurityEventAsync(student.Id, req.AdminId, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            "action=ban_student", ct: ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(UnbanStudentCommand req, CancellationToken ct)
    {
        await EnsureScopedPermissionAsync(req.AdminId, Resources.Students, Actions.Edit, "student", req.StudentId, ct);
        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == req.StudentId, ct)
            ?? throw new NotFoundException("Student", req.StudentId);

        student.Unban();
        await _unitOfWork.SaveChangesAsync(ct);
        await _audit.LogSecurityEventAsync(student.Id, req.AdminId, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            "action=unban_student", ct: ct);
        return Unit.Value;
    }

    /// <summary>
    /// PR-6 (Student Center): admin-side student password reset. Authorization + scope are
    /// enforced by the controller (Students.Edit policy + IsInScopeAsync); this handler is
    /// the danger-zone business core: the acting admin re-authenticates with their own
    /// password, the new secret is policy-checked and hashed, every student session is
    /// revoked, and the reset is audited. The plaintext password never appears in any log,
    /// DTO, or exception. Soft-deleted (archived) students may be reset too.
    /// </summary>
    public async Task<Unit> Handle(ResetStudentPasswordCommand request, CancellationToken ct)
    {
        var actor = await _db.Admins.FirstOrDefaultAsync(a => a.Id == request.ActorAdminId, ct)
            ?? throw new NotFoundException("Admin", request.ActorAdminId);

        if (!_passwordHasher.VerifyPassword(request.ActorPassword, actor.PasswordHash))
            throw new DomainException("كلمة مرور المسؤول غير صحيحة", "INVALID_CURRENT_PASSWORD");

        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == request.StudentId, ct)
            ?? throw new NotFoundException("Student", request.StudentId);

        _passwordPolicy.EnsureValid(request.NewPassword);
        student.ChangePasswordHash(_passwordHasher.HashPassword(request.NewPassword));
        if (request.ForceChangeOnNextLogin)
            student.FlagMustChangePassword();

        await _unitOfWork.SaveChangesAsync(ct);
        await _sessionService.RevokeAllForUserAsync(student.Id, "admin_password_reset", ct);

        await _audit.LogSecurityEventAsync(
            student.Id,
            request.ActorAdminId,
            SecurityEventType.PasswordChanged,
            SecuritySeverity.Warning,
            $"credential_reset=student; target_student_id={student.Id}; force_change={request.ForceChangeOnNextLogin.ToString().ToLowerInvariant()}",
            ct: ct);
        return Unit.Value;
    }

    /// <summary>
    /// PR-6 (Student Center): soft-archive a student (tombstone — NEVER a hard delete).
    /// Idempotent: an already-archived student returns without side effects. Archiving
    /// revokes every live session so the student cannot keep using the platform.
    /// </summary>
    public async Task<Unit> Handle(ArchiveStudentCommand request, CancellationToken ct)
    {
        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == request.StudentId, ct)
            ?? throw new NotFoundException("Student", request.StudentId);

        if (student.DeletedAt is not null)
            return Unit.Value; // already archived — idempotent

        student.Archive();
        await _sessionService.RevokeAllForUserAsync(student.Id, "student_archived", ct);
        await _unitOfWork.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            student.Id,
            request.ActorAdminId,
            SecurityEventType.AdminAction,
            SecuritySeverity.Warning,
            $"action=student_archive; target_student_id={student.Id}",
            ct: ct);
        return Unit.Value;
    }

    /// <summary>
    /// PR-6 (Student Center): restore a soft-archived student. Idempotent: a student that
    /// is not archived returns without side effects. Student queries filter DeletedAt
    /// manually in LINQ (there is no global soft-delete filter), so the plain
    /// FirstOrDefaultAsync above already finds soft-deleted rows — no IgnoreQueryFilters
    /// trickery is needed.
    /// </summary>
    public async Task<Unit> Handle(RestoreStudentCommand request, CancellationToken ct)
    {
        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == request.StudentId, ct)
            ?? throw new NotFoundException("Student", request.StudentId);

        if (student.DeletedAt is null)
            return Unit.Value; // not archived — idempotent

        student.RestoreFromArchive();
        await _unitOfWork.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            student.Id,
            request.ActorAdminId,
            SecurityEventType.AdminAction,
            SecuritySeverity.Warning,
            $"action=student_restore; target_student_id={student.Id}",
            ct: ct);
        return Unit.Value;
    }

    /// <summary>
    /// PR-6 (Student Center): full per-student profile for the admin drawer — identity,
    /// ban/lockout state, must-change-password + archive flags, stats, academic path,
    /// subscription summary, and the active device binding. Authorization + scope are
    /// enforced by the controller (Students.View policy + IsInScopeAsync).
    /// </summary>
    public async Task<StudentDetailDto> Handle(GetStudentDetailQuery request, CancellationToken ct)
    {
        var student = await _db.Students.AsNoTracking()
            .Include(s => s.University)
            .Include(s => s.College)
            .Include(s => s.AcademicYear)
            .Include(s => s.Subscriptions)
            .Include(s => s.DeviceBindings)
            .FirstOrDefaultAsync(s => s.Id == request.StudentId, ct)
            ?? throw new NotFoundException("Student", request.StudentId);

        var now = DateTime.UtcNow;
        var activeSubscriptions = student.Subscriptions
            .Where(subscription => subscription.Status == SubscriptionStatus.Active && subscription.ExpiresAt > now)
            .ToList();
        var latestSubscription = student.Subscriptions
            .OrderByDescending(subscription => subscription.StartsAt)
            .FirstOrDefault();
        var activeDevice = student.DeviceBindings
            .Where(binding => binding.IsActive)
            .OrderByDescending(binding => binding.LastUsed)
            .FirstOrDefault();

        return new StudentDetailDto(
            student.Id,
            student.FullName,
            student.Phone,
            student.Email,
            student.Gender,
            student.AvatarUrl,
            student.Status.ToString(),
            student.BanReason,
            student.BanUntil,
            student.LockoutUntil.HasValue && student.LockoutUntil > now,
            student.LockoutUntil,
            student.FailedLoginCount,
            student.PhoneVerifiedAt is not null,
            student.MustChangePassword,
            student.DeletedAt is not null,
            student.DeletedAt,
            student.CreatedAt,
            student.UpdatedAt,
            student.LastLogin,
            student.LoginCount,
            student.LastActivityDate,
            student.QuestionsAnswered,
            student.CorrectAnswers,
            student.GetAccuracy(),
            student.CurrentStreak,
            student.LongestStreak,
            new StudentAcademicInfoDto(
                student.UniversityId,
                student.University?.NameAr,
                student.CollegeId,
                student.College?.NameAr,
                student.AcademicYearId,
                student.AcademicYear?.NameAr),
            new StudentSubscriptionSummaryDto(
                activeSubscriptions.Count,
                latestSubscription is null ? null : new StudentSubscriptionBriefDto(
                    latestSubscription.Id,
                    latestSubscription.Status.ToString(),
                    latestSubscription.ScopeType.ToString(),
                    latestSubscription.StartsAt,
                    latestSubscription.ExpiresAt)),
            activeDevice is null ? null : new StudentActiveDeviceDto(
                activeDevice.DeviceName,
                activeDevice.DeviceType,
                activeDevice.Os,
                activeDevice.Browser,
                activeDevice.BoundAt,
                activeDevice.LastUsed));
    }

    public async Task<PagedResult<CodeManagementDto>> Handle(GetCodesQuery req, CancellationToken ct)
    {
        await EnsurePermissionAsync(req.AdminId, Resources.Codes, Actions.View, ct);
        if (req.SubjectId.HasValue && !await _permissions.IsInScopeAsync(req.AdminId, "subject", req.SubjectId.Value, ct))
            throw new ForbiddenException("مرشح المادة خارج نطاقك الإداري");
        // Night Task 5.3 — year filter: matches BOTH year-scoped codes and
        // subject-scoped codes whose subject sits under that academic year
        // (via the subject's semester). Scope safety stays with the per-code
        // IsInScopeAsync filter below, exactly like the search/scopeType
        // filters — the year predicate only narrows the candidate set.
        List<Guid>? yearSubjectIds = null;
        if (req.YearId.HasValue)
        {
            yearSubjectIds = await _db.Subjects.AsNoTracking()
                .Where(subject => subject.Semester != null && subject.Semester.AcademicYearId == req.YearId.Value)
                .Select(subject => subject.Id)
                .ToListAsync(ct);
        }

        var query = _db.SubscriptionCodes.AsNoTracking();

        if (!string.IsNullOrEmpty(req.Status) && Enum.TryParse<CodeStatus>(req.Status, true, out var status))
            query = query.Where(c => c.Status == status);

        if (req.SubjectId.HasValue)
            query = query.Where(c => c.ScopeSubjectId == req.SubjectId);

        // Night Task 5.3 — year filter (see the note above the probe).
        if (req.YearId.HasValue)
            query = query.Where(c => c.ScopeYearId == req.YearId
                || (c.ScopeSubjectId.HasValue && yearSubjectIds != null && yearSubjectIds.Contains(c.ScopeSubjectId.Value)));

        // Search by code substring (dash-agnostic: strip dashes for comparison)
        if (!string.IsNullOrWhiteSpace(req.Search))
        {
            var search = req.Search.Trim().ToUpperInvariant();
            query = query.Where(c => c.Code.ToUpper().Contains(search));
        }

        // Filter by scope type
        if (!string.IsNullOrEmpty(req.ScopeType) && Enum.TryParse<SubscriptionScopeType>(req.ScopeType, true, out var scopeTypeFilter))
            query = query.Where(c => c.ScopeType == scopeTypeFilter);

        var candidates = await query.OrderByDescending(c => c.CreatedAt).ToListAsync(ct);
        var scopedCodes = new List<SubscriptionCode>();
        foreach (var candidate in candidates)
        {
            if (await _permissions.IsInScopeAsync(req.AdminId, "subscription_code", candidate.Id, ct))
                scopedCodes.Add(candidate);
        }

        var total = scopedCodes.Count;
        var codes = scopedCodes
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToList();

        var studentIds = codes.Where(c => c.UsedBy.HasValue).Select(c => c.UsedBy!.Value).Distinct().ToList();
        var students = await _db.Students.AsNoTracking()
            .Where(s => studentIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, ct);
        var yearIds = codes.Where(c => c.ScopeYearId.HasValue).Select(c => c.ScopeYearId!.Value).Distinct().ToList();
        var years = await _db.AcademicYears.AsNoTracking()
            .Where(year => yearIds.Contains(year.Id))
            .ToDictionaryAsync(year => year.Id, ct);

        var items = codes.Select(c => new CodeManagementDto(
            c.Id, c.Code, c.ScopeType.ToString(),
            c.ContentScope.ToString(), c.IsPublic,
            c.ScopeSubjectId.HasValue
                ? _db.Subjects.AsNoTracking().FirstOrDefault(s => s.Id == c.ScopeSubjectId)?.NameAr
                : c.ScopeYearId.HasValue && years.TryGetValue(c.ScopeYearId.Value, out var year) ? year.NameAr
                : c.ScopeCollegeId.HasValue ? "كلية كاملة" : "نطاق عام",
            c.Status.ToString(),
            c.UsedAt,
            c.UsedBy.HasValue && students.TryGetValue(c.UsedBy.Value, out var s) ? s.FullName : null,
            c.CreatedAt, c.CodeExpiresAt,
            _db.StudentSubscriptions.Count(subscription => subscription.SubscriptionCodeId == c.Id)
        )).ToList();

        return new PagedResult<CodeManagementDto>(items, total, req.Page, req.PageSize, (int)Math.Ceiling(total / (double)req.PageSize));
    }

    public async Task<GenerateCodesResultDto> Handle(GenerateCodesCommand req, CancellationToken ct)
    {
        await EnsurePermissionAsync(req.CreatedBy, Resources.Codes, Actions.Create, ct);
        var normalizedScopeType = req.ScopeType?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedScopeType) || !Enum.TryParse<SubscriptionScopeType>(normalizedScopeType, true, out var scopeType) || !req.ScopeId.HasValue)
            throw new DomainException("نطاق الكود غير صالح", "INVALID_CODE_SCOPE");
        var normalizedContentScope = req.ContentScope?.Trim().Replace("_", string.Empty).Replace("-", string.Empty);
        if (string.IsNullOrWhiteSpace(normalizedContentScope) || !Enum.TryParse<SubscriptionContentScope>(normalizedContentScope, true, out var contentScope))
            throw new DomainException("نطاق محتوى الكود غير صالح", "INVALID_CODE_CONTENT_SCOPE");
        if (contentScope == SubscriptionContentScope.FullYear && scopeType != SubscriptionScopeType.Year)
            throw new DomainException("رمز السنة الكاملة يجب أن يرتبط بسنة أكاديمية", "INVALID_FULL_YEAR_CODE_SCOPE");
        if (contentScope != SubscriptionContentScope.FullYear && scopeType != SubscriptionScopeType.Subject)
            throw new DomainException("رموز المحتوى الجزئي أو المادة الكاملة يجب أن ترتبط بمادة", "INVALID_SUBJECT_CODE_SCOPE");
        if (req.Quantity is < 1 or > 1000 || req.DurationDays < 0)
            throw new DomainException("كمية الأكواد أو مدة الوصول غير صالحة", "INVALID_CODE_GENERATION_REQUEST");
        if (req.CodeExpiresAt.HasValue && req.CodeExpiresAt.Value <= DateTime.UtcNow)
            throw new DomainException("تاريخ انتهاء الرمز يجب أن يكون في المستقبل", "INVALID_CODE_EXPIRY");
        if (!await _permissions.IsInScopeAsync(req.CreatedBy, ScopeEntityType(scopeType), req.ScopeId.Value, ct))
            throw new ForbiddenException("لا تملك صلاحية إنشاء أكواد خارج نطاقك الإداري");

        var batch = new CodeBatch
        {
            Name = $"دفعة - {DateTime.UtcNow:yyyy-MM-dd HH:mm}",
            Quantity = req.Quantity,
            ScopeType = normalizedScopeType,
            ContentScope = contentScope,
            IsPublic = req.IsPublic,
            ScopeUniversityId = scopeType == SubscriptionScopeType.University ? req.ScopeId : null,
            ScopeCollegeId = scopeType == SubscriptionScopeType.College ? req.ScopeId : null,
            ScopeYearId = scopeType == SubscriptionScopeType.Year ? req.ScopeId : null,
            ScopeSemesterId = scopeType == SubscriptionScopeType.Semester ? req.ScopeId : null,
            ScopeSubjectId = scopeType == SubscriptionScopeType.Subject ? req.ScopeId : null,
            DurationDays = req.DurationDays,
            CodeExpiresAt = req.CodeExpiresAt,
            CreatedBy = req.CreatedBy
        };

        await _db.CodeBatches.AddAsync(batch, ct);

        var codes = new List<string>();
        var codeEntities = new List<SubscriptionCode>();
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0, O, 1, I, L
        var prefix = req.Prefix?.Trim().ToUpperInvariant() ?? "";

        for (int i = 0; i < req.Quantity; i++)
        {
            string code;
            string fullCode;
            // Pre-load ALL existing codes once (server-side, translatable) so the
            // uniqueness check is done client-side. EF Core cannot translate
            // `new string((c.Code ?? "").Where(char.IsLetterOrDigit).ToArray())`
            // to SQL — it throws InvalidOperationException (same class of bug as
            // the Wave 5D DateTime.ToString(format) translation error). See
            // EXECUTION_STATUS.md → "Critical Testing Gap" for full context.
            var existingCodes = await _db.SubscriptionCodes
                .AsNoTracking()
                .Select(c => c.Code ?? "")
                .ToListAsync(ct);
            var existingNormalized = existingCodes
                .Select(c => new string(c.Where(char.IsLetterOrDigit).ToArray()))
                .ToHashSet();
            do {
                // Generate 16 alphanumeric chars and format as XXXX-XXXX-XXXX-XXXX
                // (4 groups of 4) to match the student-web activate-code UI which
                // expects exactly 4 input boxes of maxLength 4.
                var raw = new string(Enumerable.Repeat(chars, 16)
                    .Select(s => s[RandomNumberGenerator.GetInt32(s.Length)]).ToArray());
                code = $"{raw[..4]}-{raw[4..8]}-{raw[8..12]}-{raw[12..16]}";
                fullCode = prefix + code;
                // Uniqueness check uses the dash-stripped form so legacy no-dash
                // codes can't collide with the new dash-formatted ones.
                var normalizedForCheck = new string(fullCode.Where(char.IsLetterOrDigit).ToArray());
                if (!existingNormalized.Contains(normalizedForCheck)) break;
            } while (true);

            var codeEntity = new SubscriptionCode
            {
                Code = fullCode,
                BatchId = batch.Id,
                ScopeType = scopeType,
                ContentScope = contentScope,
                IsPublic = req.IsPublic,
                ScopeUniversityId = scopeType == SubscriptionScopeType.University ? req.ScopeId : null,
                ScopeCollegeId = scopeType == SubscriptionScopeType.College ? req.ScopeId : null,
                ScopeYearId = scopeType == SubscriptionScopeType.Year ? req.ScopeId : null,
                ScopeSemesterId = scopeType == SubscriptionScopeType.Semester ? req.ScopeId : null,
                ScopeSubjectId = scopeType == SubscriptionScopeType.Subject ? req.ScopeId : null,
                DurationDays = req.DurationDays,
                CodeExpiresAt = req.CodeExpiresAt,
                Status = CodeStatus.Active,
                CreatedBy = req.CreatedBy
            };

            codeEntities.Add(codeEntity);
            codes.Add(fullCode);
        }

        await _db.SubscriptionCodes.AddRangeAsync(codeEntities, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        // Push 2 / Track 2: activity log (best-effort, after the business commit).
        await _activity.LogAsync(req.CreatedBy, AdminActivityActionType.GenerateCode, batch.Id.ToString(),
            new { batchId = batch.Id, quantity = req.Quantity, scopeType = normalizedScopeType, durationDays = req.DurationDays },
            req.SessionId, ct);

        return new GenerateCodesResultDto(batch.Id, req.Quantity, codes);
    }

    private async Task EnsurePermissionAsync(Guid adminId, string resource, string action, CancellationToken ct)
    {
        if (adminId == Guid.Empty || !await _permissions.HasPermissionAsync(adminId, resource, action, ct))
            throw new ForbiddenException("لا تملك الصلاحية الإدارية المطلوبة");
    }

    private async Task EnsureScopedPermissionAsync(Guid adminId, string resource, string action, string entityType, Guid entityId, CancellationToken ct)
    {
        await EnsurePermissionAsync(adminId, resource, action, ct);
        if (!await _permissions.IsInScopeAsync(adminId, entityType, entityId, ct))
            throw new ForbiddenException("المورد المطلوب خارج نطاقك الإداري");
    }

    private static string ScopeEntityType(SubscriptionScopeType scopeType) => scopeType switch
    {
        SubscriptionScopeType.University => "university",
        SubscriptionScopeType.College => "college",
        SubscriptionScopeType.Year => "year",
        SubscriptionScopeType.Semester => "semester",
        SubscriptionScopeType.Subject => "subject",
        _ => throw new DomainException("نطاق الكود غير صالح", "INVALID_CODE_SCOPE")
    };
}
