using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMS.Infrastructure.Services;
using CMS.Infrastructure.Persistence;
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
    private readonly ApplicationDbContext _db;

    public SecurityController(SecurityService securityService, IPermissionService permissions, ApplicationDbContext db)
    {
        _securityService = securityService;
        _permissions = permissions;
        _db = db;
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
        // Fetch the student + active device binding for richer context
        var student = await _db.Students.AsNoTracking().FirstOrDefaultAsync(s => s.Id == studentId, ct);
        var deviceBinding = await _db.DeviceBindings.AsNoTracking()
            .Where(d => d.StudentId == studentId && d.IsActive)
            .OrderByDescending(d => d.LastUsed)
            .FirstOrDefaultAsync(ct);
        return Ok(logs.Select(l => new
        {
            l.Id,
            eventType = l.EventType.ToString(),
            severity = l.Severity.ToString(),
            l.Description,
            l.IpAddress,
            l.DeviceFingerprint,
            l.CreatedAt,
            studentName = student?.FullName,
            studentPhone = student?.Phone,
            // Device binding context (from the active binding, not per-log)
            deviceName = deviceBinding?.DeviceName,
            deviceType = deviceBinding?.DeviceType,
            deviceOs = deviceBinding?.Os,
            deviceBrowser = deviceBinding?.Browser,
            deviceUserAgent = deviceBinding?.UserAgent,
            deviceBoundAt = deviceBinding?.BoundAt,
            deviceLastUsed = deviceBinding?.LastUsed,
            deviceIsActive = deviceBinding?.IsActive ?? false
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
        // Fetch student + admin names for human-readable actor display
        var studentIds = alerts.Where(a => a.StudentId.HasValue).Select(a => a.StudentId!.Value).Distinct().ToList();
        var adminIds = alerts.Where(a => a.AdminId.HasValue).Select(a => a.AdminId!.Value).Distinct().ToList();
        var students = await _db.Students.AsNoTracking().Where(s => studentIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct);
        var admins = await _db.Admins.AsNoTracking().Where(a => adminIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);
        return Ok(alerts.Select(a => new
        {
            a.Id,
            eventType = a.EventType.ToString(),
            severity = a.Severity.ToString(),
            a.Description,
            studentId = a.StudentId,
            studentName = a.StudentId.HasValue && students.TryGetValue(a.StudentId.Value, out var s) ? s.FullName : null,
            adminId = a.AdminId,
            adminName = a.AdminId.HasValue && admins.TryGetValue(a.AdminId.Value, out var adm) ? adm.FullName : null,
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
