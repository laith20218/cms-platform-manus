using CMS.Domain.Entities;

namespace CMS.Application.Interfaces;

/// <summary>
/// Permission service - checks if a user has permission to perform an action on a resource.
/// Implements RBAC + ABAC (scope-based) authorization.
/// </summary>
public interface IPermissionService
{
    /// <summary>
    /// Check if admin can perform action on resource (within their scope).
    /// </summary>
    Task<bool> HasPermissionAsync(
        Guid adminId,
        string resource,
        string action,
        CancellationToken ct = default);

    /// <summary>
    /// Get all permissions for an admin (from role + direct).
    /// </summary>
    Task<List<PermissionDto>> GetPermissionsAsync(Guid adminId, CancellationToken ct = default);

    /// <summary>
    /// Check if admin can access a specific entity (scope check).
    /// Example: College admin can only see students in their college.
    /// </summary>
    Task<bool> IsInScopeAsync(
        Guid adminId,
        string entityType,
        Guid entityId,
        CancellationToken ct = default);

    /// <summary>
    /// Get the scope filter for an admin (for querying).
    /// Returns null for super admin (no filter needed).
    /// </summary>
    Task<AdminScope?> GetScopeAsync(Guid adminId, CancellationToken ct = default);
}

/// <summary>
/// Admin scope - defines what an admin can see/manage.
/// </summary>
public record AdminScope(
    Guid? UniversityId,
    Guid? CollegeId,
    Guid? YearId,
    Guid? SubjectId,
    bool IsSuperAdmin
);

/// <summary>
/// Permission DTO.
/// </summary>
public record PermissionDto(
    string Resource,
    List<string> Actions,
    string Scope
);

/// <summary>
/// All available resources in the system.
/// </summary>
public static class Resources
{
    public const string Universities = "universities";
    public const string Colleges = "colleges";
    public const string Years = "years";
    public const string Semesters = "semesters";
    public const string Subjects = "subjects";
    public const string Lectures = "lectures";
    public const string Questions = "questions";
    public const string Exams = "exams";
    public const string Library = "library";
    public const string Videos = "videos";
    public const string Codes = "codes";
    public const string Students = "students";
    public const string Admins = "admins";
    public const string Roles = "roles";
    public const string Notifications = "notifications";
    public const string Announcements = "announcements";
    public const string Reports = "reports";
    public const string Settings = "settings";
    public const string Logs = "logs";

    public static readonly string[] All = {
        Universities, Colleges, Years, Semesters, Subjects, Lectures,
        Questions, Exams, Library, Videos, Codes, Students,
        Admins, Roles, Notifications, Announcements, Reports, Settings, Logs
    };
}

/// <summary>
/// All available actions.
/// </summary>
public static class Actions
{
    public const string View = "view";
    public const string Create = "create";
    public const string Edit = "edit";
    public const string Delete = "delete";
    public const string Export = "export";
    public const string Import = "import";

    public static readonly string[] All = { View, Create, Edit, Delete, Export, Import };
}

/// <summary>
/// System role names.
/// </summary>
public static class Roles
{
    public const string SuperAdmin = "super_admin";
    public const string UniversityAdmin = "university_admin";
    public const string CollegeAdmin = "college_admin";
    public const string YearAdmin = "year_admin";
    public const string SubjectAdmin = "subject_admin";
    public const string Student = "student";
}
