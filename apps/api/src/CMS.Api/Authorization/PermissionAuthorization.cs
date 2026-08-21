using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Persistence;

namespace CMS.Api.Authorization;

/// <summary>
/// Authorization handler for resource+action based permissions.
/// Usage: [Authorize(Policy = "QuestionManagement")]
/// </summary>
public class PermissionRequirement : IAuthorizationRequirement
{
    public string Resource { get; }
    public string Action { get; }

    public PermissionRequirement(string resource, string action)
    {
        Resource = resource;
        Action = action;
    }
}

/// <summary>
/// Handler that checks if the current admin has the required permission.
/// </summary>
public class PermissionHandler : AuthorizationHandler<PermissionRequirement>
{
    private readonly IPermissionService _permissionService;
    private readonly ILogger<PermissionHandler> _logger;

    public PermissionHandler(
        IPermissionService permissionService,
        ILogger<PermissionHandler> logger)
    {
        _permissionService = permissionService;
        _logger = logger;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        // Get admin ID from claims
        var adminIdClaim = context.User.FindFirst("sub")?.Value
            ?? context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

        if (string.IsNullOrEmpty(adminIdClaim) || !Guid.TryParse(adminIdClaim, out var adminId))
        {
            _logger.LogWarning("Permission check failed: No valid admin ID in claims");
            return;
        }

        // Reject student tokens early. Scoped administrative roles are validated by
        // the permission service against their persisted role grants below.
        var roleClaim = context.User.FindFirst("role")?.Value
            ?? context.User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;

        if (string.IsNullOrWhiteSpace(roleClaim) || roleClaim == Roles.Student)
        {
            _logger.LogWarning("Permission check failed: User is not an admin. Role: {Role}", roleClaim);
            return;
        }

        // Check permission
        var hasPermission = await _permissionService.HasPermissionAsync(
            adminId,
            requirement.Resource,
            requirement.Action
        );

        if (hasPermission)
        {
            context.Succeed(requirement);
        }
        else
        {
            _logger.LogWarning(
                "Permission denied: Admin {AdminId} does not have {Action} permission on {Resource}",
                adminId, requirement.Action, requirement.Resource
            );
        }
    }
}

/// <summary>
/// Requirement for scope-based authorization.
/// Checks if the admin can access a specific entity.
/// </summary>
public class ScopeRequirement : IAuthorizationRequirement
{
    public string EntityType { get; }

    public ScopeRequirement(string entityType)
    {
        EntityType = entityType;
    }
}

/// <summary>
/// Handler for scope-based authorization (ABAC).
/// </summary>
public class ScopeHandler : AuthorizationHandler<ScopeRequirement>
{
    private readonly IPermissionService _permissionService;
    private readonly ILogger<ScopeHandler> _logger;

    public ScopeHandler(IPermissionService permissionService, ILogger<ScopeHandler> logger)
    {
        _permissionService = permissionService;
        _logger = logger;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ScopeRequirement requirement)
    {
        var adminIdClaim = context.User.FindFirst("sub")?.Value;
        if (string.IsNullOrEmpty(adminIdClaim) || !Guid.TryParse(adminIdClaim, out var adminId))
            return;

        var scope = await _permissionService.GetScopeAsync(adminId);

        // Super admin passes all scope checks
        if (scope?.IsSuperAdmin == true)
        {
            context.Succeed(requirement);
            return;
        }

        // For now, just verify the admin has a scope set
        // Detailed entity-level scope checking happens in the handler/controller
        if (scope != null)
        {
            context.Succeed(requirement);
        }
    }
}

/// <summary>
/// Policy names for easy reference in controllers.
/// </summary>
public static class Policies
{
    // Question Management
    public const string QuestionView = "QuestionView";
    public const string QuestionCreate = "QuestionCreate";
    public const string QuestionEdit = "QuestionEdit";
    public const string QuestionDelete = "QuestionDelete";
    public const string QuestionImport = "QuestionImport";
    public const string QuestionExport = "QuestionExport";

    // Student Management
    public const string StudentView = "StudentView";
    public const string StudentEdit = "StudentEdit";

    // Code Management
    public const string CodeView = "CodeView";
    public const string CodeCreate = "CodeCreate";
    public const string CodeEdit = "CodeEdit";

    // Library Management
    public const string LibraryView = "LibraryView";
    public const string LibraryUpload = "LibraryUpload";
    public const string LibraryDelete = "LibraryDelete";

    // Admin Management
    public const string AdminView = "AdminView";
    public const string AdminCreate = "AdminCreate";
    public const string AdminEdit = "AdminEdit";

    // Role Management
    public const string RoleView = "RoleView";
    public const string RoleEdit = "RoleEdit";

    // Notifications
    public const string NotificationSend = "NotificationSend";

    // Reports
    public const string ReportView = "ReportView";
    public const string ReportExport = "ReportExport";

    // Settings
    public const string SettingsView = "SettingsView";
    public const string SettingsEdit = "SettingsEdit";

    // Logs
    public const string LogView = "LogView";

    /// <summary>
    /// Register all policies in the authorization system.
    /// </summary>
    public static void Register(AuthorizationOptions options)
    {
        // Questions
        options.AddPolicy(QuestionView, p => p.Requirements.Add(new PermissionRequirement(Resources.Questions, Actions.View)));
        options.AddPolicy(QuestionCreate, p => p.Requirements.Add(new PermissionRequirement(Resources.Questions, Actions.Create)));
        options.AddPolicy(QuestionEdit, p => p.Requirements.Add(new PermissionRequirement(Resources.Questions, Actions.Edit)));
        options.AddPolicy(QuestionDelete, p => p.Requirements.Add(new PermissionRequirement(Resources.Questions, Actions.Delete)));
        options.AddPolicy(QuestionImport, p => p.Requirements.Add(new PermissionRequirement(Resources.Questions, Actions.Import)));
        options.AddPolicy(QuestionExport, p => p.Requirements.Add(new PermissionRequirement(Resources.Questions, Actions.Export)));

        // Students
        options.AddPolicy(StudentView, p => p.Requirements.Add(new PermissionRequirement(Resources.Students, Actions.View)));
        options.AddPolicy(StudentEdit, p => p.Requirements.Add(new PermissionRequirement(Resources.Students, Actions.Edit)));

        // Codes
        options.AddPolicy(CodeView, p => p.Requirements.Add(new PermissionRequirement(Resources.Codes, Actions.View)));
        options.AddPolicy(CodeCreate, p => p.Requirements.Add(new PermissionRequirement(Resources.Codes, Actions.Create)));
        options.AddPolicy(CodeEdit, p => p.Requirements.Add(new PermissionRequirement(Resources.Codes, Actions.Edit)));

        // Library
        options.AddPolicy(LibraryView, p => p.Requirements.Add(new PermissionRequirement(Resources.Library, Actions.View)));
        options.AddPolicy(LibraryUpload, p => p.Requirements.Add(new PermissionRequirement(Resources.Library, Actions.Create)));
        options.AddPolicy(LibraryDelete, p => p.Requirements.Add(new PermissionRequirement(Resources.Library, Actions.Delete)));

        // Admins
        options.AddPolicy(AdminView, p => p.Requirements.Add(new PermissionRequirement(Resources.Admins, Actions.View)));
        options.AddPolicy(AdminCreate, p => p.Requirements.Add(new PermissionRequirement(Resources.Admins, Actions.Create)));
        options.AddPolicy(AdminEdit, p => p.Requirements.Add(new PermissionRequirement(Resources.Admins, Actions.Edit)));

        // Roles
        options.AddPolicy(RoleView, p => p.Requirements.Add(new PermissionRequirement(Resources.Roles, Actions.View)));
        options.AddPolicy(RoleEdit, p => p.Requirements.Add(new PermissionRequirement(Resources.Roles, Actions.Edit)));

        // Notifications
        options.AddPolicy(NotificationSend, p => p.Requirements.Add(new PermissionRequirement(Resources.Notifications, Actions.Create)));

        // Reports
        options.AddPolicy(ReportView, p => p.Requirements.Add(new PermissionRequirement(Resources.Reports, Actions.View)));
        options.AddPolicy(ReportExport, p => p.Requirements.Add(new PermissionRequirement(Resources.Reports, Actions.Export)));

        // Settings
        options.AddPolicy(SettingsView, p => p.Requirements.Add(new PermissionRequirement(Resources.Settings, Actions.View)));
        options.AddPolicy(SettingsEdit, p => p.Requirements.Add(new PermissionRequirement(Resources.Settings, Actions.Edit)));

        // Logs
        options.AddPolicy(LogView, p => p.Requirements.Add(new PermissionRequirement(Resources.Logs, Actions.View)));
    }
}
