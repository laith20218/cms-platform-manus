using MediatR;
using CMS.Application.DTOs.Auth;
using CMS.Application.Commands.Dashboard;
using CMS.Application.Interfaces;

namespace CMS.Application.Commands.Admin;

/// <summary>
/// Login as admin (with optional 2FA).
/// </summary>
public record AdminLoginCommand(
    string Email,
    string Password,
    string? TwoFactorCode,
    string? InstallationId = null
) : IRequest<AuthResponse>;

/// <summary>
/// Enable 2FA for an admin.
/// </summary>
public record Enable2FACommand(
    Guid AdminId
) : IRequest<Enable2FAResponse>;

/// <summary>
/// Verify 2FA setup.
/// </summary>
public record Verify2FACommand(
    Guid AdminId,
    string Code
) : IRequest<Unit>;

/// <summary>
/// Disable 2FA.
/// </summary>
public record Disable2FACommand(
    Guid AdminId,
    string Password
) : IRequest<Unit>;

/// <summary>
/// Get current admin's permissions.
/// </summary>
public record GetMyPermissionsQuery(
    Guid AdminId
) : IRequest<List<PermissionDto>>;

/// <summary>
/// Response for 2FA enablement.
/// </summary>
public record Enable2FAResponse(
    string QrCodeUrl,
    string Secret,
    List<string> RecoveryCodes
);

/// <summary>
/// Assigns a role to an existing administrator. The actor must hold the admin-edit permission.
/// </summary>
public record AssignAdminRoleCommand(
    Guid ActorAdminId,
    Guid TargetAdminId,
    Guid RoleId
) : IRequest<Unit>;

/// <summary>
/// Replaces the effective permission grants for one non-system role. The actor must hold the role-edit permission.
/// </summary>
public record ReplaceRolePermissionsCommand(
    Guid ActorAdminId,
    Guid RoleId,
    IReadOnlyList<RolePermissionGrant> Permissions
) : IRequest<Unit>;

public record RolePermissionGrant(string Resource, IReadOnlyList<string> Actions, string Scope);

/// <summary>
/// A concise administrator record for the super-administrator management console.
/// </summary>
public record AdminManagementDto(
    Guid Id,
    string FullName,
    string Email,
    string? Phone,
    Guid RoleId,
    string RoleName,
    string RoleNameAr,
    Guid? ScopeUniversityId,
    Guid? ScopeCollegeId,
    Guid? ScopeYearId,
    Guid? ScopeSubjectId,
    string Status,
    DateTime? LastLogin,
    DateTime CreatedAt
);

/// <summary>
/// Creates an administrator with a policy-compliant initial password. Restricted to super administrators.
/// </summary>
public record CreateAdminCommand(
    Guid ActorAdminId,
    string Email,
    string Password,
    string FullName,
    string? Phone,
    Guid RoleId,
    Guid? ScopeUniversityId,
    Guid? ScopeCollegeId,
    Guid? ScopeYearId,
    Guid? ScopeSubjectId
) : IRequest<AdminManagementDto>;

/// <summary>
/// Updates an administrator's identity, role, and academic scope. Restricted to super administrators.
/// </summary>
public record UpdateAdminCommand(
    Guid ActorAdminId,
    Guid TargetAdminId,
    string Email,
    string FullName,
    string? Phone,
    Guid RoleId,
    Guid? ScopeUniversityId,
    Guid? ScopeCollegeId,
    Guid? ScopeYearId,
    Guid? ScopeSubjectId
) : IRequest<AdminManagementDto>;

/// <summary>
/// Sets an administrator account to active or disabled. Disabling revokes all live sessions.
/// </summary>
public record SetAdminStatusCommand(Guid ActorAdminId, Guid TargetAdminId, bool IsActive) : IRequest<Unit>;

/// <summary>
/// Sets a policy-compliant administrator password and immediately invalidates all existing sessions.
/// </summary>
public record ResetAdminPasswordCommand(Guid ActorAdminId, Guid TargetAdminId, string NewPassword) : IRequest<Unit>;

/// <summary>
/// Permanently removes an administrator after the acting super administrator re-authenticates with their current password.
/// </summary>
public record DeleteAdminCommand(Guid ActorAdminId, Guid TargetAdminId, string ActorPassword) : IRequest<Unit>;

/// <summary>
/// Retrieves administrators with optional identity, role, and active-state filters.
/// </summary>
public record GetAdminsQuery(
    Guid ActorAdminId,
    string? Search,
    Guid? RoleId,
    bool? IsActive,
    int Page = 1,
    int PageSize = 20
) : IRequest<PagedResult<AdminManagementDto>>;

/// <summary>
/// Retrieves one administrator record for the management detail view.
/// </summary>
public record GetAdminDetailsQuery(Guid ActorAdminId, Guid TargetAdminId) : IRequest<AdminManagementDto>;

/// <summary>
/// Management-view representation of an administrative role, including assignment count.
/// </summary>
public record AdminRoleManagementDto(
    Guid Id,
    string Name,
    string NameAr,
    string? Description,
    bool IsSystem,
    bool IsActive,
    int AdminCount,
    int PermissionCount,
    DateTime CreatedAt
);

/// <summary>
/// Creates a custom role with no permissions by default. Restricted to super administrators.
/// </summary>
public record CreateRoleCommand(Guid ActorAdminId, string Name, string NameAr, string? Description) : IRequest<AdminRoleManagementDto>;

/// <summary>
/// Retrieves all system and custom roles with assignment totals.
/// </summary>
public record GetRolesQuery(Guid ActorAdminId) : IRequest<List<AdminRoleManagementDto>>;

/// <summary>
/// Temporarily enables or disables a role. Disabling revokes every assigned administrator's sessions.
/// </summary>
public record SetRoleActiveCommand(Guid ActorAdminId, Guid RoleId, bool IsActive) : IRequest<Unit>;

/// <summary>
/// Deletes an unused custom role. Administrators must be reassigned first.
/// </summary>
public record DeleteRoleCommand(Guid ActorAdminId, Guid RoleId) : IRequest<Unit>;
