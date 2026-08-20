using MediatR;
using CMS.Application.DTOs.Auth;
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
