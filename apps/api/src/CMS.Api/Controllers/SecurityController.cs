using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMS.Infrastructure.Services;
using CMS.Application.Interfaces;
using System.Security.Claims;

namespace CMS.Api.Controllers;

/// <summary>
/// Security controller - handles security logs, alerts, and device management.
/// Admin only.
/// </summary>
[ApiController]
[Route("api/v1/security")]
[Authorize(Roles = "admin,super_admin")]
public class SecurityController : ControllerBase
{
    private readonly SecurityService _securityService;
    private readonly IPermissionService _permissions;

    public SecurityController(SecurityService securityService, IPermissionService permissions)
    {
        _securityService = securityService;
        _permissions = permissions;
    }

    private Guid GetAdminId() => Guid.Parse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value!);

    /// <summary>
    /// Get security logs for a specific student.
    /// </summary>
    [HttpGet("students/{studentId:guid}/logs")]
    public async Task<IActionResult> GetStudentLogs(Guid studentId, [FromQuery] int count = 50, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Logs, Actions.View, ct)
            || !await _permissions.IsInScopeAsync(adminId, "student", studentId, ct)) return Forbid();
        var logs = await _securityService.GetStudentSecurityLogsAsync(studentId, count, ct);
        return Ok(logs.Select(l => new
        {
            l.Id,
            eventType = l.EventType.ToString(),
            severity = l.Severity.ToString(),
            l.Description,
            l.IpAddress,
            l.DeviceFingerprint,
            l.CreatedAt
        }));
    }

    /// <summary>
    /// Get critical security alerts.
    /// </summary>
    [HttpGet("alerts")]
    public async Task<IActionResult> GetCriticalAlerts([FromQuery] int count = 20, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        var scope = await _permissions.GetScopeAsync(adminId, ct);
        if (scope?.IsSuperAdmin != true || !await _permissions.HasPermissionAsync(adminId, Resources.Logs, Actions.View, ct)) return Forbid();
        var alerts = await _securityService.GetCriticalAlertsAsync(count, ct);
        return Ok(alerts.Select(a => new
        {
            a.Id,
            eventType = a.EventType.ToString(),
            severity = a.Severity.ToString(),
            a.Description,
            studentId = a.StudentId,
            a.IpAddress,
            a.CreatedAt
        }));
    }

    /// <summary>
    /// Unbind a student's device (allow login from new device).
    /// </summary>
    [HttpPost("students/{studentId:guid}/unbind-device")]
    public async Task<IActionResult> UnbindDevice(Guid studentId, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Students, Actions.Edit, ct)
            || !await _permissions.IsInScopeAsync(adminId, "student", studentId, ct)) return Forbid();
        await _securityService.UnbindDeviceAsync(studentId, adminId, ct);
        return NoContent();
    }
}
