using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using AdminEntity = CMS.Domain.Entities.Admin;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CMS.Application.Commands.Maintenance;

/// <summary>
/// Command Center P1 — system-maintenance destructors.
///
/// WipeDataCommand: module-scoped bulk deletion of DUMMY/demo data. Per the owner's
/// locked decisions (2026-11-25): a questions wipe NEVER touches the academic
/// structure (universities/colleges/years survive); a students wipe takes the
/// students' sessions and subscriptions with them; "academic" is the nuclear tree
/// (structure dies, students/admins/codes SURVIVE with their scope references
/// nulled — every surviving scope FK is nullable, verified in the entity model).
///
/// HardDeleteCommand: physical deletion of one entity, bypassing soft-delete.
/// Children-first ordering; when direct dependents exist and <c>Cascade</c> is
/// false it FAILS LOUDLY (DomainException listing the child counts) instead of
/// silently destroying history — the D2 spirit already encoded in the FK map
/// (Restrict on question/answer history).
///
/// Safety contract for both:
///   • SuperAdmin role only (independent of the permission matrix — system-level)
///   • acting admin re-authenticates with their password (mirrors DeleteAdmin)
///   • wipe requires the typed confirmation "DELETE" or "حذف"
///   • dryRun returns per-table row counts without deleting anything
///   • PR-1 (Gate B #3): hard delete is OFF by default in EVERY environment behind
///     the backend-enforced flag Features:HardDeleteEnabled (fail-closed) — a
///     hand-crafted request against a disabled flag is rejected and audited
///   • one transaction, children-first FK-safe order, audit-logged (Critical)
/// </summary>
public sealed record WipeDataCommand(
    Guid ActorAdminId,
    string Module,
    string ConfirmText,
    string ActorPassword,
    bool DryRun) : IRequest<WipeResultDto>;

public sealed record HardDeleteCommand(
    Guid ActorAdminId,
    string Module,
    Guid TargetId,
    string ActorPassword,
    bool Cascade) : IRequest<HardDeleteResultDto>;

/// <summary>One executed (or dry-run-counted) step: table label + affected rows.</summary>
public sealed record WipeTableCountDto(string Table, int Rows);

public sealed record WipeResultDto(string Module, bool DryRun, IReadOnlyList<WipeTableCountDto> Tables);

public sealed record HardDeleteResultDto(string Module, Guid TargetId, IReadOnlyList<WipeTableCountDto> Deleted);

public sealed class SystemMaintenanceHandlers :
    IRequestHandler<WipeDataCommand, WipeResultDto>,
    IRequestHandler<HardDeleteCommand, HardDeleteResultDto>
{
    /// <summary>Modules accepted by the wipe endpoint (lowercase; anything else is a 4xx-style domain error).</summary>
    public static readonly IReadOnlySet<string> WipeModules = new HashSet<string>(
        ["questions", "students", "exams", "library", "courses", "subscriptions", "offline", "academic"], StringComparer.Ordinal);

    /// <summary>Modules accepted by the hard-delete endpoint.</summary>
    public static readonly IReadOnlySet<string> HardDeleteModules = new HashSet<string>(
        ["question", "exam", "course", "episode", "subject", "lecture", "exam-course", "library-file"], StringComparer.Ordinal);

    /// <summary>Typed confirmation accepted from the Danger Zone UI (Latin or Arabic).</summary>
    public static bool IsValidConfirmText(string? confirmText) =>
        string.Equals(confirmText?.Trim(), "DELETE", StringComparison.OrdinalIgnoreCase)
        || string.Equals(confirmText?.Trim(), "حذف", StringComparison.Ordinal);

    /// <summary>
    /// PR-1 (Gate B decision #3): backend-enforced hard-delete kill switch.
    /// OFF by default in every environment: a missing key, an unparseable value, or
    /// "false" all mean disabled (fail-closed). Enable explicitly via appsettings
    /// Features:HardDeleteEnabled or env Features__HardDeleteEnabled=true.
    /// Enforced here — behind the API surface — so no crafted request and no frontend
    /// behavior can bypass it. The Danger Zone UI mirrors the state read-only via
    /// GET /api/v1/admin/system/hard-delete/status (cosmetic only).
    /// </summary>
    public static bool IsHardDeleteEnabled(IConfiguration configuration) =>
        bool.TryParse(configuration?["Features:HardDeleteEnabled"], out var enabled) && enabled;

    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ISecurityAuditWriter _audit;
    private readonly IConfiguration _configuration;

    public SystemMaintenanceHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IPasswordHasher passwordHasher,
        ISecurityAuditWriter audit,
        IConfiguration configuration)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _passwordHasher = passwordHasher;
        _audit = audit;
        _configuration = configuration;
    }

    // ============================================================
    // Wipe (module-scoped bulk deletion, FK-safe children-first)
    // ============================================================

    public async Task<WipeResultDto> Handle(WipeDataCommand request, CancellationToken ct)
    {
        var actor = await RequireSuperAdminAsync(request.ActorAdminId, ct);
        if (!_passwordHasher.VerifyPassword(request.ActorPassword ?? string.Empty, actor.PasswordHash))
            throw new DomainException("كلمة مرور المدير العام غير صحيحة", "INVALID_CURRENT_PASSWORD");

        var module = (request.Module ?? string.Empty).Trim().ToLowerInvariant();
        if (!WipeModules.Contains(module))
            throw new DomainException($"وحدة غير معروفة للمحو: {module}", "INVALID_WIPE_MODULE");

        if (!request.DryRun && !IsValidConfirmText(request.ConfirmText))
            throw new DomainException("نص التأكيد غير صحيح — اكتب DELETE أو حذف", "INVALID_CONFIRM_TEXT");

        var steps = BuildWipeSteps(module);
        if (request.DryRun)
        {
            var counts = new List<WipeTableCountDto>();
            foreach (var step in steps)
            {
                var rows = await step.Count(ct);
                if (rows > 0) counts.Add(new WipeTableCountDto(step.Label, rows));
            }
            return new WipeResultDto(module, DryRun: true, counts);
        }

        // PR-1: destructive-intent audit BEFORE the transaction opens. A crash between
        // commit and the post-commit audit write can no longer leave a mass deletion
        // unaudited — the intent record is already durable even if this transaction
        // rolls back (dry-run previews stay non-destructive and are never audited).
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Critical,
            $"action=wipe_data; phase=intent; module={module}", ct: ct);

        await _unitOfWork.BeginTransactionAsync(ct);
        List<WipeTableCountDto> results;
        try
        {
            results = new List<WipeTableCountDto>();
            foreach (var step in steps)
            {
                var rows = await step.Delete(ct);
                if (rows > 0) results.Add(new WipeTableCountDto(step.Label, rows));
            }
            await _unitOfWork.CommitTransactionAsync(ct);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }

        // Post-commit: the audit write must never trigger a rollback attempt on a
        // completed transaction — its own failure propagates as-is.
        var total = results.Sum(r => r.Rows);
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Critical,
            $"action=wipe_data; phase=executed; module={module}; rows={total}; tables={results.Count}", ct: ct);
        return new WipeResultDto(module, DryRun: false, results);
    }

    // ============================================================
    // Hard delete (single entity, physical, loud-fail on children)
    // ============================================================

    public async Task<HardDeleteResultDto> Handle(HardDeleteCommand request, CancellationToken ct)
    {
        var actor = await RequireSuperAdminAsync(request.ActorAdminId, ct);

        // PR-1 (Gate B decision #3): backend-enforced kill switch, checked AFTER the
        // SuperAdmin gate (so the rejected attempt is attributable in the audit
        // stream) and BEFORE password verification or any transaction. With the flag
        // off, nothing downstream runs — no Argon2 burn, no counts, no deletion —
        // regardless of what the request carries or which frontend sent it.
        if (!IsHardDeleteEnabled(_configuration))
        {
            await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Warning,
                $"action=hard_delete; phase=rejected; reason=HARD_DELETE_DISABLED; module={request.Module}; target={request.TargetId}", ct: ct);
            throw new DomainException(
                "الحذف النهائي معطّل في هذه البيئة (Features:HardDeleteEnabled) — الأرشفة هي المسار الافتراضي",
                "HARD_DELETE_DISABLED");
        }

        if (!_passwordHasher.VerifyPassword(request.ActorPassword ?? string.Empty, actor.PasswordHash))
            throw new DomainException("كلمة مرور المدير العام غير صحيحة", "INVALID_CURRENT_PASSWORD");

        var module = (request.Module ?? string.Empty).Trim().ToLowerInvariant();
        if (!HardDeleteModules.Contains(module))
            throw new DomainException($"نوع غير معروف للحذف النهائي: {module}", "INVALID_HARD_DELETE_MODULE");

        var steps = BuildHardDeleteSteps(module, request.TargetId);

        // Not-found check BEFORE any transaction starts: a missing target must fail
        // cleanly instead of leaving an empty committed transaction to roll back.
        if (await steps[^1].Count(ct) == 0)
            throw new NotFoundException(module, request.TargetId);

        // Loud-fail contract: count cross-domain dependents FIRST; without an explicit
        // cascade the operation refuses and reports exactly what would be destroyed.
        if (!request.Cascade)
        {
            var blocking = new List<string>();
            foreach (var step in steps.Where(s => s.LoudFail))
            {
                var rows = await step.Count(ct);
                if (rows > 0) blocking.Add($"{step.Label}={rows}");
            }
            if (blocking.Count > 0)
                throw new DomainException(
                    $"لا يمكن الحذف النهائي — توجد عناصر مرتبطة ({string.Join("، ", blocking)}). فعّل خيار حذف العناصر المرتبطة للمتابعة.",
                    "HARD_DELETE_HAS_CHILDREN");
        }

        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Critical,
            $"action=hard_delete; phase=intent; module={module}; target={request.TargetId}; cascade={request.Cascade}", ct: ct);

        await _unitOfWork.BeginTransactionAsync(ct);
        List<WipeTableCountDto> results;
        try
        {
            results = new List<WipeTableCountDto>();
            foreach (var step in steps)
            {
                var rows = await step.Delete(ct);
                if (rows > 0) results.Add(new WipeTableCountDto(step.Label, rows));
            }
            await _unitOfWork.CommitTransactionAsync(ct);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }

        // Post-commit audit (see the wipe handler for the rollback rationale).
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Critical,
            $"action=hard_delete; phase=executed; module={module}; target={request.TargetId}; cascade={request.Cascade}; rows={results.Sum(r => r.Rows)}", ct: ct);
        return new HardDeleteResultDto(module, request.TargetId, results);
    }

    // ============================================================
    // Step model
    // ============================================================

    /// <summary>One ordered deletion step. LoudFail steps are counted pre-flight when cascade is off.</summary>
    private sealed record MaintenanceStep(
        string Label,
        Func<CancellationToken, Task<int>> Count,
        Func<CancellationToken, Task<int>> Delete,
        bool LoudFail = false);

    // ============================================================
    // Wipe step builders (children-first, per module)
    // ============================================================

    private List<MaintenanceStep> BuildWipeSteps(string module) => module switch
    {
        "questions" => QuestionsSteps(),
        "students" => StudentsSteps(),
        "exams" => ExamsSteps(),
        "library" => LibrarySteps(),
        "courses" => CoursesSteps(),
        "subscriptions" => SubscriptionsSteps(),
        "offline" => OfflineSteps(),
        "academic" => AcademicSteps(),
        _ => throw new DomainException($"وحدة غير معروفة للمحو: {module}", "INVALID_WIPE_MODULE"),
    };

    /// <summary>
    /// Questions module — question rows + their dependents ONLY (locked decision:
    /// academic structure survives). Exam sessions keep their D2 snapshots.
    /// </summary>
    private List<MaintenanceStep> QuestionsSteps() =>
    [
        new("error_reports", ct => _db.ErrorReports.CountAsync(ct), ct => _db.ErrorReports.ExecuteDeleteAsync(ct)),
        new("favorites_questions", ct => _db.Favorites.CountAsync(f => f.QuestionId != null, ct), ct => _db.Favorites.Where(f => f.QuestionId != null).ExecuteDeleteAsync(ct)),
        new("favorite_list_items", ct => _db.FavoriteListItems.CountAsync(ct), ct => _db.FavoriteListItems.ExecuteDeleteAsync(ct)),
        new("attempt_logs", ct => _db.AttemptLogs.CountAsync(ct), ct => _db.AttemptLogs.ExecuteDeleteAsync(ct)),
        new("exam_questions", ct => _db.ExamQuestions.CountAsync(ct), ct => _db.ExamQuestions.ExecuteDeleteAsync(ct)),
        new("practice_answers", ct => _db.PracticeAnswers.CountAsync(ct), ct => _db.PracticeAnswers.ExecuteDeleteAsync(ct)),
        new("practice_sessions", ct => _db.PracticeSessions.CountAsync(ct), ct => _db.PracticeSessions.ExecuteDeleteAsync(ct)),
        new("question_options", ct => _db.QuestionOptions.CountAsync(ct), ct => _db.QuestionOptions.ExecuteDeleteAsync(ct)),
        new("question_images", ct => _db.QuestionImages.CountAsync(ct), ct => _db.QuestionImages.ExecuteDeleteAsync(ct)),
        new("questions", ct => _db.Questions.CountAsync(ct), ct => _db.Questions.ExecuteDeleteAsync(ct)),
    ];

    /// <summary>
    /// Students module — students + their sessions, subscriptions, events, favorites,
    /// annotations, devices. Academic structure and access codes survive (codes are
    /// released: UsedBy nulled so they become assignable again).
    /// </summary>
    private List<MaintenanceStep> StudentsSteps() =>
    [
        new("notification_deliveries", ct => _db.NotificationDeliveries.CountAsync(ct), ct => _db.NotificationDeliveries.ExecuteDeleteAsync(ct)),
        new("notifications_targeted", ct => _db.Notifications.CountAsync(n => _db.Students.Any(s => s.Id == n.TargetId), ct), ct => _db.Notifications.Where(n => _db.Students.Any(s => s.Id == n.TargetId)).ExecuteDeleteAsync(ct)),
        new("security_logs_student", ct => _db.SecurityLogs.CountAsync(l => l.StudentId != null, ct), ct => _db.SecurityLogs.Where(l => l.StudentId != null).ExecuteDeleteAsync(ct)),
        new("offline_key_release_logs", ct => _db.OfflineKeyReleaseLogs.CountAsync(ct), ct => _db.OfflineKeyReleaseLogs.ExecuteDeleteAsync(ct)),
        new("offline_packages", ct => _db.OfflinePackageRecords.CountAsync(ct), ct => _db.OfflinePackageRecords.ExecuteDeleteAsync(ct)),
        new("attempt_logs", ct => _db.AttemptLogs.CountAsync(ct), ct => _db.AttemptLogs.ExecuteDeleteAsync(ct)),
        new("exam_session_questions", ct => _db.ExamSessionQuestions.CountAsync(ct), ct => _db.ExamSessionQuestions.ExecuteDeleteAsync(ct)),
        new("exam_sessions", ct => _db.ExamSessions.CountAsync(ct), ct => _db.ExamSessions.ExecuteDeleteAsync(ct)),
        new("lecture_completions", ct => _db.LectureCompletions.CountAsync(ct), ct => _db.LectureCompletions.ExecuteDeleteAsync(ct)),
        new("library_views", ct => _db.LibraryViews.CountAsync(ct), ct => _db.LibraryViews.ExecuteDeleteAsync(ct)),
        new("playback_progress", ct => _db.PlaybackProgress.CountAsync(ct), ct => _db.PlaybackProgress.ExecuteDeleteAsync(ct)),
        new("media_bookmarks", ct => _db.MediaBookmarks.CountAsync(ct), ct => _db.MediaBookmarks.ExecuteDeleteAsync(ct)),
        new("file_annotations", ct => _db.FileAnnotations.CountAsync(ct), ct => _db.FileAnnotations.ExecuteDeleteAsync(ct)),
        new("file_bookmarks", ct => _db.FileBookmarks.CountAsync(ct), ct => _db.FileBookmarks.ExecuteDeleteAsync(ct)),
        new("favorites", ct => _db.Favorites.CountAsync(ct), ct => _db.Favorites.ExecuteDeleteAsync(ct)),
        new("favorite_list_items", ct => _db.FavoriteListItems.CountAsync(ct), ct => _db.FavoriteListItems.ExecuteDeleteAsync(ct)),
        new("favorite_lists", ct => _db.FavoriteLists.CountAsync(ct), ct => _db.FavoriteLists.ExecuteDeleteAsync(ct)),
        new("student_subscriptions", ct => _db.StudentSubscriptions.CountAsync(ct), ct => _db.StudentSubscriptions.ExecuteDeleteAsync(ct)),
        new("subscription_codes_released", ct => _db.SubscriptionCodes.CountAsync(c => c.UsedBy != null, ct), ct => _db.SubscriptionCodes.Where(c => c.UsedBy != null).ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedBy, (Guid?)null), ct)),
        new("user_installations", ct => _db.UserInstallations.CountAsync(i => _db.Students.Any(s => s.Id == i.UserId), ct), ct => _db.UserInstallations.Where(i => _db.Students.Any(s => s.Id == i.UserId)).ExecuteDeleteAsync(ct)),
        new("device_bindings", ct => _db.DeviceBindings.CountAsync(ct), ct => _db.DeviceBindings.ExecuteDeleteAsync(ct)),
        new("user_sessions", ct => _db.UserSessions.CountAsync(u => _db.Students.Any(s => s.Id == u.UserId), ct), ct => _db.UserSessions.Where(u => _db.Students.Any(s => s.Id == u.UserId)).ExecuteDeleteAsync(ct)),
        new("students", ct => _db.Students.CountAsync(ct), ct => _db.Students.ExecuteDeleteAsync(ct)),
    ];

    /// <summary>Exams module — exams + their sessions/attempts/links. Questions survive.</summary>
    private List<MaintenanceStep> ExamsSteps() =>
    [
        new("attempt_logs", ct => _db.AttemptLogs.CountAsync(ct), ct => _db.AttemptLogs.ExecuteDeleteAsync(ct)),
        new("exam_session_questions", ct => _db.ExamSessionQuestions.CountAsync(ct), ct => _db.ExamSessionQuestions.ExecuteDeleteAsync(ct)),
        new("exam_sessions", ct => _db.ExamSessions.CountAsync(ct), ct => _db.ExamSessions.ExecuteDeleteAsync(ct)),
        new("exam_course_items", ct => _db.ExamCourseItems.CountAsync(ct), ct => _db.ExamCourseItems.ExecuteDeleteAsync(ct)),
        new("exam_questions", ct => _db.ExamQuestions.CountAsync(ct), ct => _db.ExamQuestions.ExecuteDeleteAsync(ct)),
        new("exams", ct => _db.Exams.CountAsync(ct), ct => _db.Exams.ExecuteDeleteAsync(ct)),
    ];

    /// <summary>Library module — library files + their bookmarks/annotations/views/favorites.</summary>
    private List<MaintenanceStep> LibrarySteps() =>
    [
        new("favorites_files", ct => _db.Favorites.CountAsync(f => f.LibraryFileId != null, ct), ct => _db.Favorites.Where(f => f.LibraryFileId != null).ExecuteDeleteAsync(ct)),
        new("file_bookmarks", ct => _db.FileBookmarks.CountAsync(ct), ct => _db.FileBookmarks.ExecuteDeleteAsync(ct)),
        new("file_annotations", ct => _db.FileAnnotations.CountAsync(ct), ct => _db.FileAnnotations.ExecuteDeleteAsync(ct)),
        new("library_views", ct => _db.LibraryViews.CountAsync(ct), ct => _db.LibraryViews.ExecuteDeleteAsync(ct)),
        new("library_files", ct => _db.LibraryFiles.CountAsync(ct), ct => _db.LibraryFiles.ExecuteDeleteAsync(ct)),
    ];

    /// <summary>Courses module — courses + episodes + episode favorites.</summary>
    private List<MaintenanceStep> CoursesSteps() =>
    [
        new("favorites_episodes", ct => _db.Favorites.CountAsync(f => f.CourseEpisodeId != null, ct), ct => _db.Favorites.Where(f => f.CourseEpisodeId != null).ExecuteDeleteAsync(ct)),
        new("course_episodes", ct => _db.CourseEpisodes.CountAsync(ct), ct => _db.CourseEpisodes.ExecuteDeleteAsync(ct)),
        new("courses", ct => _db.Courses.CountAsync(ct), ct => _db.Courses.ExecuteDeleteAsync(ct)),
    ];

    /// <summary>Subscriptions module — student subscriptions + access codes + batches.</summary>
    private List<MaintenanceStep> SubscriptionsSteps() =>
    [
        new("student_subscriptions", ct => _db.StudentSubscriptions.CountAsync(ct), ct => _db.StudentSubscriptions.ExecuteDeleteAsync(ct)),
        new("subscription_codes", ct => _db.SubscriptionCodes.CountAsync(ct), ct => _db.SubscriptionCodes.ExecuteDeleteAsync(ct)),
        new("code_batches", ct => _db.CodeBatches.CountAsync(ct), ct => _db.CodeBatches.ExecuteDeleteAsync(ct)),
    ];

    /// <summary>Offline module — offline packages + their key-release logs.</summary>
    private List<MaintenanceStep> OfflineSteps() =>
    [
        new("offline_key_release_logs", ct => _db.OfflineKeyReleaseLogs.CountAsync(ct), ct => _db.OfflineKeyReleaseLogs.ExecuteDeleteAsync(ct)),
        new("offline_packages", ct => _db.OfflinePackageRecords.CountAsync(ct), ct => _db.OfflinePackageRecords.ExecuteDeleteAsync(ct)),
    ];

    /// <summary>
    /// Academic module — the NUCLEAR tree (locked decision): the full questions/exams/
    /// courses/exam-courses/library content of every subject, then lectures → subjects →
    /// semesters → years → colleges → universities. Students, admins, and codes SURVIVE;
    /// their scope references are nulled (all nullable — verified in the entity model)
    /// BEFORE the structure goes, so no FK is ever violated.
    /// </summary>
    private List<MaintenanceStep> AcademicSteps() =>
    [
        // content of the tree, children-first (reuse the module orders)
        .. QuestionsSteps(),
        new("exam_session_questions", ct => _db.ExamSessionQuestions.CountAsync(ct), ct => _db.ExamSessionQuestions.ExecuteDeleteAsync(ct)),
        new("exam_sessions", ct => _db.ExamSessions.CountAsync(ct), ct => _db.ExamSessions.ExecuteDeleteAsync(ct)),
        new("exam_course_items", ct => _db.ExamCourseItems.CountAsync(ct), ct => _db.ExamCourseItems.ExecuteDeleteAsync(ct)),
        new("exam_questions", ct => _db.ExamQuestions.CountAsync(ct), ct => _db.ExamQuestions.ExecuteDeleteAsync(ct)),
        new("exams", ct => _db.Exams.CountAsync(ct), ct => _db.Exams.ExecuteDeleteAsync(ct)),
        new("exam_courses", ct => _db.ExamCourses.CountAsync(ct), ct => _db.ExamCourses.ExecuteDeleteAsync(ct)),
        .. CoursesSteps(),
        .. LibrarySteps(),
        new("lecture_completions", ct => _db.LectureCompletions.CountAsync(ct), ct => _db.LectureCompletions.ExecuteDeleteAsync(ct)),
        // release surviving scope references (nullable FKs → null)
        new("students_scope_cleared", ct => _db.Students.CountAsync(s => s.UniversityId != null || s.CollegeId != null || s.AcademicYearId != null, ct), ct => _db.Students.ExecuteUpdateAsync(s => s.SetProperty(x => x.UniversityId, (Guid?)null).SetProperty(x => x.CollegeId, (Guid?)null).SetProperty(x => x.AcademicYearId, (Guid?)null), ct)),
        new("admins_scope_cleared", ct => _db.Admins.CountAsync(a => a.ScopeUniversityId != null || a.ScopeCollegeId != null || a.ScopeYearId != null || a.ScopeSubjectId != null, ct), ct => _db.Admins.ExecuteUpdateAsync(a => a.SetProperty(x => x.ScopeUniversityId, (Guid?)null).SetProperty(x => x.ScopeCollegeId, (Guid?)null).SetProperty(x => x.ScopeYearId, (Guid?)null).SetProperty(x => x.ScopeSubjectId, (Guid?)null), ct)),
        new("subscription_codes_scope_cleared", ct => _db.SubscriptionCodes.CountAsync(c => c.ScopeUniversityId != null || c.ScopeCollegeId != null || c.ScopeYearId != null || c.ScopeSemesterId != null || c.ScopeSubjectId != null, ct), ct => _db.SubscriptionCodes.ExecuteUpdateAsync(c => c.SetProperty(x => x.ScopeUniversityId, (Guid?)null).SetProperty(x => x.ScopeCollegeId, (Guid?)null).SetProperty(x => x.ScopeYearId, (Guid?)null).SetProperty(x => x.ScopeSemesterId, (Guid?)null).SetProperty(x => x.ScopeSubjectId, (Guid?)null), ct)),
        new("code_batches_scope_cleared", ct => _db.CodeBatches.CountAsync(b => b.ScopeUniversityId != null || b.ScopeCollegeId != null || b.ScopeYearId != null || b.ScopeSemesterId != null || b.ScopeSubjectId != null, ct), ct => _db.CodeBatches.ExecuteUpdateAsync(b => b.SetProperty(x => x.ScopeUniversityId, (Guid?)null).SetProperty(x => x.ScopeCollegeId, (Guid?)null).SetProperty(x => x.ScopeYearId, (Guid?)null).SetProperty(x => x.ScopeSemesterId, (Guid?)null).SetProperty(x => x.ScopeSubjectId, (Guid?)null), ct)),
        new("student_subscriptions_scope_cleared", ct => _db.StudentSubscriptions.CountAsync(s => s.ScopeUniversityId != null || s.ScopeCollegeId != null || s.ScopeYearId != null || s.ScopeSemesterId != null || s.ScopeSubjectId != null, ct), ct => _db.StudentSubscriptions.ExecuteUpdateAsync(s => s.SetProperty(x => x.ScopeUniversityId, (Guid?)null).SetProperty(x => x.ScopeCollegeId, (Guid?)null).SetProperty(x => x.ScopeYearId, (Guid?)null).SetProperty(x => x.ScopeSemesterId, (Guid?)null).SetProperty(x => x.ScopeSubjectId, (Guid?)null), ct)),
        // finally the structure itself, leaf → root
        new("lectures", ct => _db.Lectures.CountAsync(ct), ct => _db.Lectures.ExecuteDeleteAsync(ct)),
        new("subjects", ct => _db.Subjects.CountAsync(ct), ct => _db.Subjects.ExecuteDeleteAsync(ct)),
        new("semesters", ct => _db.Semesters.CountAsync(ct), ct => _db.Semesters.ExecuteDeleteAsync(ct)),
        new("academic_years", ct => _db.AcademicYears.CountAsync(ct), ct => _db.AcademicYears.ExecuteDeleteAsync(ct)),
        new("colleges", ct => _db.Colleges.CountAsync(ct), ct => _db.Colleges.ExecuteDeleteAsync(ct)),
        new("universities", ct => _db.Universities.CountAsync(ct), ct => _db.Universities.ExecuteDeleteAsync(ct)),
    ];

    // ============================================================
    // Hard-delete step builders (scoped to one target id)
    // ============================================================

    private List<MaintenanceStep> BuildHardDeleteSteps(string module, Guid id) => module switch
    {
        "question" => HardDeleteQuestion(id),
        "exam" => HardDeleteExam(id),
        "course" => HardDeleteCourse(id),
        "episode" => HardDeleteEpisode(id),
        "subject" => HardDeleteSubject(id),
        "lecture" => HardDeleteLecture(id),
        "exam-course" => HardDeleteExamCourse(id),
        "library-file" => HardDeleteLibraryFile(id),
        _ => throw new DomainException($"نوع غير معروف للحذف النهائي: {module}", "INVALID_HARD_DELETE_MODULE"),
    };

    private List<MaintenanceStep> HardDeleteQuestion(Guid id) =>
    [
        new("error_reports", ct => _db.ErrorReports.CountAsync(e => e.QuestionId == id, ct), ct => _db.ErrorReports.Where(e => e.QuestionId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("favorites", ct => _db.Favorites.CountAsync(f => f.QuestionId == id, ct), ct => _db.Favorites.Where(f => f.QuestionId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("favorite_list_items", ct => _db.FavoriteListItems.CountAsync(i => i.QuestionId == id, ct), ct => _db.FavoriteListItems.Where(i => i.QuestionId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("attempt_logs", ct => _db.AttemptLogs.CountAsync(l => l.QuestionId == id, ct), ct => _db.AttemptLogs.Where(l => l.QuestionId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("practice_answers", ct => _db.PracticeAnswers.CountAsync(p => p.QuestionId == id, ct), ct => _db.PracticeAnswers.Where(p => p.QuestionId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("exam_questions", ct => _db.ExamQuestions.CountAsync(e => e.QuestionId == id, ct), ct => _db.ExamQuestions.Where(e => e.QuestionId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        // own anatomy — always deleted with the question, never "children"
        new("question_options", ct => _db.QuestionOptions.CountAsync(o => o.QuestionId == id, ct), ct => _db.QuestionOptions.Where(o => o.QuestionId == id).ExecuteDeleteAsync(ct)),
        new("question_images", ct => _db.QuestionImages.CountAsync(i => i.QuestionId == id, ct), ct => _db.QuestionImages.Where(i => i.QuestionId == id).ExecuteDeleteAsync(ct)),
        new("questions", ct => _db.Questions.CountAsync(q => q.Id == id, ct), ct => _db.Questions.Where(q => q.Id == id).ExecuteDeleteAsync(ct)),
    ];

    private List<MaintenanceStep> HardDeleteExam(Guid id) =>
    [
        new("attempt_logs", ct => _db.AttemptLogs.CountAsync(l => l.ExamSessionId != null && _db.ExamSessions.Any(s => s.Id == l.ExamSessionId && s.ExamId == id), ct), ct => _db.AttemptLogs.Where(l => l.ExamSessionId != null && _db.ExamSessions.Any(s => s.Id == l.ExamSessionId && s.ExamId == id)).ExecuteDeleteAsync(ct), LoudFail: true),
        new("exam_sessions", ct => _db.ExamSessions.CountAsync(s => s.ExamId == id, ct), ct => _db.ExamSessions.Where(s => s.ExamId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("exam_session_questions", ct => _db.ExamSessionQuestions.CountAsync(q => _db.ExamSessions.Any(s => s.Id == q.ExamSessionId && s.ExamId == id), ct), ct => _db.ExamSessionQuestions.Where(q => _db.ExamSessions.Any(s => s.Id == q.ExamSessionId && s.ExamId == id)).ExecuteDeleteAsync(ct)),
        new("exam_course_items", ct => _db.ExamCourseItems.CountAsync(i => i.ExamId == id, ct), ct => _db.ExamCourseItems.Where(i => i.ExamId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("exam_questions", ct => _db.ExamQuestions.CountAsync(e => e.ExamId == id, ct), ct => _db.ExamQuestions.Where(e => e.ExamId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("exams", ct => _db.Exams.CountAsync(e => e.Id == id, ct), ct => _db.Exams.Where(e => e.Id == id).ExecuteDeleteAsync(ct)),
    ];

    private List<MaintenanceStep> HardDeleteCourse(Guid id) =>
    [
        new("favorites_episodes", ct => _db.Favorites.CountAsync(f => f.CourseEpisodeId != null && _db.CourseEpisodes.Any(e => e.Id == f.CourseEpisodeId && e.CourseId == id), ct), ct => _db.Favorites.Where(f => f.CourseEpisodeId != null && _db.CourseEpisodes.Any(e => e.Id == f.CourseEpisodeId && e.CourseId == id)).ExecuteDeleteAsync(ct), LoudFail: true),
        new("course_episodes", ct => _db.CourseEpisodes.CountAsync(e => e.CourseId == id, ct), ct => _db.CourseEpisodes.Where(e => e.CourseId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("courses", ct => _db.Courses.CountAsync(c => c.Id == id, ct), ct => _db.Courses.Where(c => c.Id == id).ExecuteDeleteAsync(ct)),
    ];

    private List<MaintenanceStep> HardDeleteEpisode(Guid id) =>
    [
        new("favorites", ct => _db.Favorites.CountAsync(f => f.CourseEpisodeId == id, ct), ct => _db.Favorites.Where(f => f.CourseEpisodeId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("course_episodes", ct => _db.CourseEpisodes.CountAsync(e => e.Id == id, ct), ct => _db.CourseEpisodes.Where(e => e.Id == id).ExecuteDeleteAsync(ct)),
    ];

    private List<MaintenanceStep> HardDeleteLecture(Guid id) =>
    [
        new("questions", ct => _db.Questions.CountAsync(q => q.LectureId == id, ct), ct => _db.Questions.Where(q => q.LectureId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("library_files", ct => _db.LibraryFiles.CountAsync(f => f.LectureId == id, ct), ct => _db.LibraryFiles.Where(f => f.LectureId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("lecture_completions", ct => _db.LectureCompletions.CountAsync(l => l.LectureId == id, ct), ct => _db.LectureCompletions.Where(l => l.LectureId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("lectures", ct => _db.Lectures.CountAsync(l => l.Id == id, ct), ct => _db.Lectures.Where(l => l.Id == id).ExecuteDeleteAsync(ct)),
    ];

    private List<MaintenanceStep> HardDeleteExamCourse(Guid id) =>
    [
        new("questions_linked", ct => _db.Questions.CountAsync(q => q.SemesterCourseId == id, ct), ct => _db.Questions.Where(q => q.SemesterCourseId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("exam_course_items", ct => _db.ExamCourseItems.CountAsync(i => i.ExamCourseId == id, ct), ct => _db.ExamCourseItems.Where(i => i.ExamCourseId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("exam_courses", ct => _db.ExamCourses.CountAsync(c => c.Id == id, ct), ct => _db.ExamCourses.Where(c => c.Id == id).ExecuteDeleteAsync(ct)),
    ];

    private List<MaintenanceStep> HardDeleteLibraryFile(Guid id) =>
    [
        new("favorites", ct => _db.Favorites.CountAsync(f => f.LibraryFileId == id, ct), ct => _db.Favorites.Where(f => f.LibraryFileId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("file_bookmarks", ct => _db.FileBookmarks.CountAsync(b => b.FileId == id, ct), ct => _db.FileBookmarks.Where(b => b.FileId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("file_annotations", ct => _db.FileAnnotations.CountAsync(a => a.FileId == id, ct), ct => _db.FileAnnotations.Where(a => a.FileId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("library_views", ct => _db.LibraryViews.CountAsync(v => v.FileId == id, ct), ct => _db.LibraryViews.Where(v => v.FileId == id).ExecuteDeleteAsync(ct)),
        new("library_files", ct => _db.LibraryFiles.CountAsync(f => f.Id == id, ct), ct => _db.LibraryFiles.Where(f => f.Id == id).ExecuteDeleteAsync(ct)),
    ];

    /// <summary>
    /// Subject hard-delete: the whole subtree — questions (with anatomy), exams (with
    /// sessions/attempts), courses (with episodes), exam-courses, library files (with
    /// bookmarks/annotations/views), lecture completions, lectures, then the subject row.
    /// </summary>
    private List<MaintenanceStep> HardDeleteSubject(Guid id) =>
    [
        // questions of the subject + their cross-domain dependents
        new("error_reports", ct => _db.ErrorReports.CountAsync(e => _db.Questions.Any(q => q.SubjectId == id && q.Id == e.QuestionId), ct), ct => _db.ErrorReports.Where(e => _db.Questions.Any(q => q.SubjectId == id && q.Id == e.QuestionId)).ExecuteDeleteAsync(ct)),
        new("favorites", ct => _db.Favorites.CountAsync(f => f.QuestionId != null && _db.Questions.Any(q => q.SubjectId == id && q.Id == f.QuestionId), ct), ct => _db.Favorites.Where(f => f.QuestionId != null && _db.Questions.Any(q => q.SubjectId == id && q.Id == f.QuestionId)).ExecuteDeleteAsync(ct)),
        new("favorite_list_items", ct => _db.FavoriteListItems.CountAsync(i => _db.Questions.Any(q => q.SubjectId == id && q.Id == i.QuestionId), ct), ct => _db.FavoriteListItems.Where(i => _db.Questions.Any(q => q.SubjectId == id && q.Id == i.QuestionId)).ExecuteDeleteAsync(ct)),
        new("attempt_logs", ct => _db.AttemptLogs.CountAsync(l => _db.Questions.Any(q => q.SubjectId == id && q.Id == l.QuestionId), ct), ct => _db.AttemptLogs.Where(l => _db.Questions.Any(q => q.SubjectId == id && q.Id == l.QuestionId)).ExecuteDeleteAsync(ct)),
        new("practice_answers", ct => _db.PracticeAnswers.CountAsync(p => _db.Questions.Any(q => q.SubjectId == id && q.Id == p.QuestionId), ct), ct => _db.PracticeAnswers.Where(p => _db.Questions.Any(q => q.SubjectId == id && q.Id == p.QuestionId)).ExecuteDeleteAsync(ct)),
        new("exam_questions", ct => _db.ExamQuestions.CountAsync(e => _db.Questions.Any(q => q.SubjectId == id && q.Id == e.QuestionId), ct), ct => _db.ExamQuestions.Where(e => _db.Questions.Any(q => q.SubjectId == id && q.Id == e.QuestionId)).ExecuteDeleteAsync(ct)),
        new("question_options", ct => _db.QuestionOptions.CountAsync(o => _db.Questions.Any(q => q.SubjectId == id && q.Id == o.QuestionId), ct), ct => _db.QuestionOptions.Where(o => _db.Questions.Any(q => q.SubjectId == id && q.Id == o.QuestionId)).ExecuteDeleteAsync(ct)),
        new("question_images", ct => _db.QuestionImages.CountAsync(i => _db.Questions.Any(q => q.SubjectId == id && q.Id == i.QuestionId), ct), ct => _db.QuestionImages.Where(i => _db.Questions.Any(q => q.SubjectId == id && q.Id == i.QuestionId)).ExecuteDeleteAsync(ct)),
        new("questions", ct => _db.Questions.CountAsync(q => q.SubjectId == id, ct), ct => _db.Questions.Where(q => q.SubjectId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        // exams of the subject (sessions → attempts first)
        new("exam_attempt_logs", ct => _db.AttemptLogs.CountAsync(l => l.ExamSessionId != null && _db.ExamSessions.Any(s => s.ExamId == l.ExamSessionId && _db.Exams.Any(x => x.SubjectId == id && x.Id == s.ExamId)), ct), ct => _db.AttemptLogs.Where(l => l.ExamSessionId != null && _db.ExamSessions.Any(s => s.ExamId == l.ExamSessionId && _db.Exams.Any(x => x.SubjectId == id && x.Id == s.ExamId))).ExecuteDeleteAsync(ct)),
        new("exam_sessions", ct => _db.ExamSessions.CountAsync(s => _db.Exams.Any(x => x.SubjectId == id && x.Id == s.ExamId), ct), ct => _db.ExamSessions.Where(s => _db.Exams.Any(x => x.SubjectId == id && x.Id == s.ExamId)).ExecuteDeleteAsync(ct)),
        new("exam_session_questions", ct => _db.ExamSessionQuestions.CountAsync(q => _db.ExamSessions.Any(s => s.ExamId == q.ExamSessionId && _db.Exams.Any(x => x.SubjectId == id && x.Id == s.ExamId)), ct), ct => _db.ExamSessionQuestions.Where(q => _db.ExamSessions.Any(s => s.ExamId == q.ExamSessionId && _db.Exams.Any(x => x.SubjectId == id && x.Id == s.ExamId))).ExecuteDeleteAsync(ct)),
        new("exam_course_items", ct => _db.ExamCourseItems.CountAsync(i => _db.Exams.Any(x => x.SubjectId == id && x.Id == i.ExamId), ct), ct => _db.ExamCourseItems.Where(i => _db.Exams.Any(x => x.SubjectId == id && x.Id == i.ExamId)).ExecuteDeleteAsync(ct)),
        new("exam_questions", ct => _db.ExamQuestions.CountAsync(e => _db.Exams.Any(x => x.SubjectId == id && x.Id == e.ExamId), ct), ct => _db.ExamQuestions.Where(e => _db.Exams.Any(x => x.SubjectId == id && x.Id == e.ExamId)).ExecuteDeleteAsync(ct)),
        new("exams", ct => _db.Exams.CountAsync(e => e.SubjectId == id, ct), ct => _db.Exams.Where(e => e.SubjectId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        // exam-courses of the subject
        new("ec_exam_course_items", ct => _db.ExamCourseItems.CountAsync(i => _db.ExamCourses.Any(c => c.SubjectId == id && c.Id == i.ExamCourseId), ct), ct => _db.ExamCourseItems.Where(i => _db.ExamCourses.Any(c => c.SubjectId == id && c.Id == i.ExamCourseId)).ExecuteDeleteAsync(ct)),
        new("exam_courses", ct => _db.ExamCourses.CountAsync(c => c.SubjectId == id, ct), ct => _db.ExamCourses.Where(c => c.SubjectId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        // courses of the subject
        new("favorites_episodes", ct => _db.Favorites.CountAsync(f => f.CourseEpisodeId != null && _db.CourseEpisodes.Any(e => e.Id == f.CourseEpisodeId && _db.Courses.Any(c => c.SubjectId == id && c.Id == e.CourseId)), ct), ct => _db.Favorites.Where(f => f.CourseEpisodeId != null && _db.CourseEpisodes.Any(e => e.Id == f.CourseEpisodeId && _db.Courses.Any(c => c.SubjectId == id && c.Id == e.CourseId))).ExecuteDeleteAsync(ct)),
        new("course_episodes", ct => _db.CourseEpisodes.CountAsync(e => _db.Courses.Any(c => c.SubjectId == id && c.Id == e.CourseId), ct), ct => _db.CourseEpisodes.Where(e => _db.Courses.Any(c => c.SubjectId == id && c.Id == e.CourseId)).ExecuteDeleteAsync(ct), LoudFail: true),
        new("courses", ct => _db.Courses.CountAsync(c => c.SubjectId == id, ct), ct => _db.Courses.Where(c => c.SubjectId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        // library files of the subject
        new("favorites_files", ct => _db.Favorites.CountAsync(f => f.LibraryFileId != null && _db.LibraryFiles.Any(x => x.SubjectId == id && x.Id == f.LibraryFileId), ct), ct => _db.Favorites.Where(f => f.LibraryFileId != null && _db.LibraryFiles.Any(x => x.SubjectId == id && x.Id == f.LibraryFileId)).ExecuteDeleteAsync(ct)),
        new("file_bookmarks", ct => _db.FileBookmarks.CountAsync(b => _db.LibraryFiles.Any(x => x.SubjectId == id && x.Id == b.FileId), ct), ct => _db.FileBookmarks.Where(b => _db.LibraryFiles.Any(x => x.SubjectId == id && x.Id == b.FileId)).ExecuteDeleteAsync(ct)),
        new("file_annotations", ct => _db.FileAnnotations.CountAsync(a => _db.LibraryFiles.Any(x => x.SubjectId == id && x.Id == a.FileId), ct), ct => _db.FileAnnotations.Where(a => _db.LibraryFiles.Any(x => x.SubjectId == id && x.Id == a.FileId)).ExecuteDeleteAsync(ct)),
        new("library_views", ct => _db.LibraryViews.CountAsync(v => _db.LibraryFiles.Any(x => x.SubjectId == id && x.Id == v.FileId), ct), ct => _db.LibraryViews.Where(v => _db.LibraryFiles.Any(x => x.SubjectId == id && x.Id == v.FileId)).ExecuteDeleteAsync(ct)),
        new("library_files", ct => _db.LibraryFiles.CountAsync(f => f.SubjectId == id, ct), ct => _db.LibraryFiles.Where(f => f.SubjectId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        // lectures + completions
        new("lecture_completions", ct => _db.LectureCompletions.CountAsync(l => _db.Lectures.Any(x => x.SubjectId == id && x.Id == l.LectureId), ct), ct => _db.LectureCompletions.Where(l => _db.Lectures.Any(x => x.SubjectId == id && x.Id == l.LectureId)).ExecuteDeleteAsync(ct)),
        new("lectures", ct => _db.Lectures.CountAsync(l => l.SubjectId == id, ct), ct => _db.Lectures.Where(l => l.SubjectId == id).ExecuteDeleteAsync(ct), LoudFail: true),
        new("subjects", ct => _db.Subjects.CountAsync(s => s.Id == id, ct), ct => _db.Subjects.Where(s => s.Id == id).ExecuteDeleteAsync(ct)),
    ];

    // ============================================================
    // Shared guards
    // ============================================================

    private async Task<AdminEntity> RequireSuperAdminAsync(Guid adminId, CancellationToken ct)
    {
        var admin = await _db.Admins
            .AsNoTracking()
            .Include(a => a.Role)
            .FirstOrDefaultAsync(a => a.Id == adminId, ct)
            ?? throw new NotFoundException("Admin", adminId);

        if (admin.Role?.Name != Roles.SuperAdmin)
            throw new DomainException("هذه العملية متاحة للمدير العام فقط", "FORBIDDEN_NOT_SUPER_ADMIN");
        return admin;
    }
}
