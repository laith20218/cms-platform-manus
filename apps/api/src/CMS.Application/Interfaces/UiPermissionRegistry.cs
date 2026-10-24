using System.Text.Json;

namespace CMS.Application.Interfaces;

/// <summary>
/// Canonical registry of admin-web UI permission keys — Push 3 / Track 3.
/// 62 keys = 12 views (view:*) + 10 top-level tabs (tab:*) + 40 buttons (btn:*).
/// Key format: level:area.item (dot-namespaced, lowercase; hyphen for multi-word items).
///
/// TWO SECURITY LAYERS — this is critical and applies to every consumer:
///   1. REAL security lives ONLY in this API: [Authorize] policies + CanManageAsync → Forbid().
///      A caller that bypasses the admin-web entirely (curl, scripts, tampered bundles) is
///      stopped by the classic RBAC matrix — it does NOT need, read, or honor these UI keys.
///   2. The keys below are the COSMETIC layer: the admin-web can('btn:…') gating they power
///      only hides elements in the browser. They never grant backend access, and granting a
///      UI key can never bypass backend RBAC (a role with view:codes but no classic
///      codes:view permission still gets 403 from the API).
/// </summary>
public static class UiPermissionRegistry
{
    /// <summary>Bump when the key set changes. Mirrored by admin-web src/lib/uiPermissions.ts.</summary>
    public const string RegistryVersion = "2026-10-24.1";

    // ===== 12 views (view:*) =====
    public const string ViewOverview = "view:overview";
    public const string ViewAcademic = "view:academic";
    public const string ViewQuestions = "view:questions";
    public const string ViewExams = "view:exams";
    public const string ViewLibrary = "view:library";
    public const string ViewStudents = "view:students";
    public const string ViewCodes = "view:codes";
    public const string ViewReports = "view:reports";
    public const string ViewAdmins = "view:admins";
    public const string ViewRoles = "view:roles";
    public const string ViewAudit = "view:audit";
    public const string ViewSettings = "view:settings";

    // ===== 10 tabs (tab:*) — overview 2 + reports 8. StudentsCenter drawer tabs deferred (Q3). =====
    public const string TabOverviewMetrics = "tab:overview.metrics";
    public const string TabOverviewActivity = "tab:overview.activity";
    public const string TabReportsOverview = "tab:reports.overview";
    public const string TabReportsStudents = "tab:reports.students";
    public const string TabReportsAcademic = "tab:reports.academic";
    public const string TabReportsExams = "tab:reports.exams";
    public const string TabReportsQuestions = "tab:reports.questions";
    public const string TabReportsContent = "tab:reports.content";
    public const string TabReportsCodes = "tab:reports.codes";
    public const string TabReportsOperations = "tab:reports.operations";

    // ===== 40 buttons (btn:*) =====
    // Questions (5) — Save & Add Another is covered by btn:questions.create (Q4).
    public const string BtnQuestionsCreate = "btn:questions.create";
    public const string BtnQuestionsPublish = "btn:questions.publish";
    public const string BtnQuestionsArchive = "btn:questions.archive";
    public const string BtnQuestionsDelete = "btn:questions.delete";
    public const string BtnQuestionsEdit = "btn:questions.edit";
    // Exams (4)
    public const string BtnExamsCreate = "btn:exams.create";
    public const string BtnExamsPublish = "btn:exams.publish";
    public const string BtnExamsArchive = "btn:exams.archive";
    public const string BtnExamsDelete = "btn:exams.delete";
    // Library (4)
    public const string BtnLibraryUpload = "btn:library.upload";
    public const string BtnLibraryPublish = "btn:library.publish";
    public const string BtnLibraryArchive = "btn:library.archive";
    public const string BtnLibraryDelete = "btn:library.delete";
    // Codes (4)
    public const string BtnCodesGenerate = "btn:codes.generate";
    public const string BtnCodesRevoke = "btn:codes.revoke";
    public const string BtnCodesRevokeBulk = "btn:codes.revoke-bulk";
    public const string BtnCodesExport = "btn:codes.export";
    // Students (3)
    public const string BtnStudentsEdit = "btn:students.edit";
    public const string BtnStudentsBan = "btn:students.ban";
    public const string BtnStudentsRevokeSession = "btn:students.revoke-session";
    // Academic (7) — 5 stage adds + lecture add + archive
    public const string BtnAcademicAddUniversity = "btn:academic.add-university";
    public const string BtnAcademicAddCollege = "btn:academic.add-college";
    public const string BtnAcademicAddYear = "btn:academic.add-year";
    public const string BtnAcademicAddSemester = "btn:academic.add-semester";
    public const string BtnAcademicAddSubject = "btn:academic.add-subject";
    public const string BtnAcademicAddLecture = "btn:academic.add-lecture";
    public const string BtnAcademicArchive = "btn:academic.archive";
    // Settings (2)
    public const string BtnSettingsSave = "btn:settings.save";
    public const string BtnSettingsReset = "btn:settings.reset";
    // Admins (5)
    public const string BtnAdminsCreate = "btn:admins.create";
    public const string BtnAdminsEdit = "btn:admins.edit";
    public const string BtnAdminsResetPassword = "btn:admins.reset-password";
    public const string BtnAdminsStatus = "btn:admins.status";
    public const string BtnAdminsDelete = "btn:admins.delete";
    // Roles (4) — the Advanced UI-permissions button shares btn:roles.matrix (same family).
    public const string BtnRolesCreate = "btn:roles.create";
    public const string BtnRolesMatrix = "btn:roles.matrix";
    public const string BtnRolesStatus = "btn:roles.status";
    public const string BtnRolesDelete = "btn:roles.delete";
    // Overview (1)
    public const string BtnOverviewComposeNotification = "btn:overview.compose-notification";
    // Reports (1) — lives in the Students report tab, which owns the export button.
    public const string BtnReportsExport = "btn:reports.export";

    public static readonly string[] ViewKeys =
    [
        ViewOverview, ViewAcademic, ViewQuestions, ViewExams, ViewLibrary, ViewStudents,
        ViewCodes, ViewReports, ViewAdmins, ViewRoles, ViewAudit, ViewSettings
    ];

    public static readonly string[] TabKeys =
    [
        TabOverviewMetrics, TabOverviewActivity,
        TabReportsOverview, TabReportsStudents, TabReportsAcademic, TabReportsExams,
        TabReportsQuestions, TabReportsContent, TabReportsCodes, TabReportsOperations
    ];

    public static readonly string[] ButtonKeys =
    [
        BtnQuestionsCreate, BtnQuestionsPublish, BtnQuestionsArchive, BtnQuestionsDelete, BtnQuestionsEdit,
        BtnExamsCreate, BtnExamsPublish, BtnExamsArchive, BtnExamsDelete,
        BtnLibraryUpload, BtnLibraryPublish, BtnLibraryArchive, BtnLibraryDelete,
        BtnCodesGenerate, BtnCodesRevoke, BtnCodesRevokeBulk, BtnCodesExport,
        BtnStudentsEdit, BtnStudentsBan, BtnStudentsRevokeSession,
        BtnAcademicAddUniversity, BtnAcademicAddCollege, BtnAcademicAddYear, BtnAcademicAddSemester,
        BtnAcademicAddSubject, BtnAcademicAddLecture, BtnAcademicArchive,
        BtnSettingsSave, BtnSettingsReset,
        BtnAdminsCreate, BtnAdminsEdit, BtnAdminsResetPassword, BtnAdminsStatus, BtnAdminsDelete,
        BtnRolesCreate, BtnRolesMatrix, BtnRolesStatus, BtnRolesDelete,
        BtnOverviewComposeNotification,
        BtnReportsExport
    ];

    /// <summary>All 62 keys in canonical order: views, then tabs, then buttons.</summary>
    public static readonly string[] AllKeys =
    [
        .. ViewKeys, .. TabKeys, .. ButtonKeys
    ];

    /// <summary>
    /// Three-level tree: each view key maps to the ordered child keys (tabs + buttons)
    /// that belong to it. Every non-view key appears exactly once across the tree.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string[]> Tree = new Dictionary<string, string[]>
    {
        [ViewOverview] = [TabOverviewMetrics, TabOverviewActivity, BtnOverviewComposeNotification],
        [ViewAcademic] =
        [
            BtnAcademicAddUniversity, BtnAcademicAddCollege, BtnAcademicAddYear, BtnAcademicAddSemester,
            BtnAcademicAddSubject, BtnAcademicAddLecture, BtnAcademicArchive
        ],
        [ViewQuestions] = [BtnQuestionsCreate, BtnQuestionsPublish, BtnQuestionsArchive, BtnQuestionsDelete, BtnQuestionsEdit],
        [ViewExams] = [BtnExamsCreate, BtnExamsPublish, BtnExamsArchive, BtnExamsDelete],
        [ViewLibrary] = [BtnLibraryUpload, BtnLibraryPublish, BtnLibraryArchive, BtnLibraryDelete],
        [ViewStudents] = [BtnStudentsEdit, BtnStudentsBan, BtnStudentsRevokeSession],
        [ViewCodes] = [BtnCodesGenerate, BtnCodesRevoke, BtnCodesRevokeBulk, BtnCodesExport],
        [ViewReports] =
        [
            TabReportsOverview, TabReportsStudents, TabReportsAcademic, TabReportsExams,
            TabReportsQuestions, TabReportsContent, TabReportsCodes, TabReportsOperations,
            BtnReportsExport
        ],
        [ViewAdmins] = [BtnAdminsCreate, BtnAdminsEdit, BtnAdminsResetPassword, BtnAdminsStatus, BtnAdminsDelete],
        [ViewRoles] = [BtnRolesCreate, BtnRolesMatrix, BtnRolesStatus, BtnRolesDelete],
        [ViewAudit] = [],
        [ViewSettings] = [BtnSettingsSave, BtnSettingsReset],
    };

    /// <summary>
    /// Returns the unknown keys among <paramref name="keys"/> (trimmed, de-duplicated).
    /// Blank entries are ignored — they are not meaningful keys, not offenders.
    /// </summary>
    public static List<string> FindInvalidKeys(IEnumerable<string?>? keys)
    {
        if (keys is null) return [];
        var seen = new HashSet<string>();
        var invalid = new List<string>();
        foreach (var key in keys)
        {
            var normalized = key?.Trim();
            if (string.IsNullOrEmpty(normalized)) continue;
            if (!AllKeys.Contains(normalized) && seen.Add(normalized))
                invalid.Add(normalized);
        }
        return invalid;
    }

    /// <summary>
    /// Parses the raw stored value of admin_roles.ui_permissions.
    ///   null           → null  (role is unconfigured — full access, zero behavior change).
    ///   "[]"           → empty list (configured, every UI element hidden).
    ///   corrupt JSON / wrong shape / unknown keys → empty or filtered list — NEVER full access.
    /// Registry drift is closed: stored keys that are no longer in the registry are dropped.
    /// Survivors are returned in canonical registry order.
    /// </summary>
    public static List<string>? ParseStoredKeys(string? storedJson)
    {
        if (storedJson is null) return null;
        if (string.IsNullOrWhiteSpace(storedJson)) return [];

        List<string>? parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<List<string>>(storedJson);
        }
        catch (JsonException)
        {
            // Corrupt or wrong-shape value: treat as configured-but-empty.
            // Never widen to full access on unreadable data.
            return [];
        }
        catch (NotSupportedException)
        {
            return [];
        }

        if (parsed is null || parsed.Any(static key => key is null))
            return [];

        return AllKeys.Where(parsed.Contains).ToList();
    }

    /// <summary>Serializes keys as a JSON array string in canonical registry order (deduped).</summary>
    public static string SerializeKeys(IEnumerable<string> keys)
    {
        var ordered = AllKeys.Where(keys.Distinct().Contains).ToList();
        return JsonSerializer.Serialize(ordered);
    }
}
