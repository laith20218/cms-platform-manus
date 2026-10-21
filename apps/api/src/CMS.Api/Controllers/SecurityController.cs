using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMS.Infrastructure.Services;
using CMS.Infrastructure.Persistence;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
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
    /// Query audit logs with filters and pagination (full audit log viewer).
    /// Returns all severities — unlike /alerts which returns Critical only.
    /// Requires Logs.View permission. Available to admin + super_admin.
    /// </summary>
    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] Guid? studentId = null,
        [FromQuery] Guid? adminId = null,
        [FromQuery] string? eventType = null,
        [FromQuery] string? severity = null,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var actorAdminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(actorAdminId, Resources.Logs, Actions.View, ct)) return Forbid();

        // Parse enum filters safely (invalid values → null, no 500)
        SecurityEventType? eventTypeEnum = null;
        if (!string.IsNullOrEmpty(eventType) && Enum.TryParse<SecurityEventType>(eventType, true, out var et))
            eventTypeEnum = et;

        SecuritySeverity? severityEnum = null;
        if (!string.IsNullOrEmpty(severity) && Enum.TryParse<SecuritySeverity>(severity, true, out var sv))
            severityEnum = sv;

        var (items, total) = await _securityService.GetAuditLogsAsync(
            page, pageSize, studentId, adminId, eventTypeEnum, severityEnum,
            dateFrom, dateTo, search, ct);

        // Batch-fetch actor names for human-readable display
        var studentIds = items.Where(i => i.StudentId.HasValue).Select(i => i.StudentId!.Value).Distinct().ToList();
        var adminIds = items.Where(i => i.AdminId.HasValue).Select(i => i.AdminId!.Value).Distinct().ToList();
        var students = studentIds.Count > 0
            ? await _db.Students.AsNoTracking().Where(s => studentIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct)
            : new Dictionary<Guid, Domain.Entities.Student>();
        var admins = adminIds.Count > 0
            ? await _db.Admins.AsNoTracking().Where(a => adminIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct)
            : new Dictionary<Guid, Domain.Entities.Admin>();

        var result = items.Select(l => new
        {
            l.Id,
            eventType = l.EventType.ToString(),
            severity = l.Severity.ToString(),
            l.Description,
            l.IpAddress,
            l.DeviceFingerprint,
            l.CorrelationId,
            l.CreatedAt,
            studentId = l.StudentId,
            studentName = l.StudentId.HasValue && students.TryGetValue(l.StudentId.Value, out var s) ? s.FullName : null,
            adminId = l.AdminId,
            adminName = l.AdminId.HasValue && admins.TryGetValue(l.AdminId.Value, out var adm) ? adm.FullName : null,
        });

        return Ok(new
        {
            items = result,
            total,
            page,
            pageSize,
            totalPages = pageSize > 0 ? (int)Math.Ceiling((double)total / pageSize) : 1
        });
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

    /// <summary>
    /// List a student's sessions (active + revoked + expired).
    /// Joins UserSession with DeviceBinding (via InstallationId) to show device context.
    /// Requires Logs.View permission + scope check.
    /// </summary>
    [HttpGet("students/{studentId:guid}/sessions")]
    public async Task<IActionResult> GetStudentSessions(Guid studentId, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Logs, Actions.View, ct)
            || !await _permissions.IsInScopeAsync(adminId, "student", studentId, ct)) return Forbid();

        var sessions = await _db.UserSessions.AsNoTracking()
            .Where(s => s.UserId == studentId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(100)
            .ToListAsync(ct);

        // Batch-fetch device bindings for this student (resolve device context)
        // Note: DeviceBinding is linked to StudentId, not per-session. We show the most
        // recent binding as the device context for display purposes.
        var deviceBinding = await _db.DeviceBindings.AsNoTracking()
            .Where(d => d.StudentId == studentId && d.IsActive)
            .OrderByDescending(d => d.LastUsed)
            .FirstOrDefaultAsync(ct);

        return Ok(sessions.Select(s => new
        {
            id = s.Id,
            role = s.Role,
            installationId = s.InstallationId,
            status = s.Status.ToString(),
            createdAt = s.CreatedAt,
            lastActivityAt = s.LastActivityAt,
            refreshTokenExpiresAt = s.RefreshTokenExpiresAt,
            revokedAt = s.RevokedAt,
            revocationReason = s.RevocationReason,
            // Device context (from the active device binding — same device for all sessions)
            deviceName = deviceBinding?.DeviceName,
            deviceType = deviceBinding?.DeviceType,
            deviceOs = deviceBinding?.Os,
            deviceBrowser = deviceBinding?.Browser,
        }));
    }

    /// <summary>
    /// Revoke a single session for a student.
    /// Requires Students.Edit permission + scope check.
    /// </summary>
    [HttpPost("students/{studentId:guid}/sessions/{sessionId:guid}/revoke")]
    public async Task<IActionResult> RevokeSession(Guid studentId, Guid sessionId, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Students, Actions.Edit, ct)
            || !await _permissions.IsInScopeAsync(adminId, "student", studentId, ct)) return Forbid();

        var session = await _db.UserSessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == studentId, ct);
        if (session is null) return NotFound(new ProblemDetails
        {
            Title = "Session not found",
            Status = 404,
            Detail = $"No session '{sessionId}' for student '{studentId}'",
        });

        if (session.Status == SecurityStatusRevoked) return NoContent(); // idempotent

        session.Revoke("Revoked by authorized administrator");
        await _db.SaveChangesAsync(ct);

        await _securityService.LogSecurityEventAsync(
            studentId: studentId,
            adminId: adminId,
            eventType: SecurityEventType.SessionRevoked,
            severity: SecuritySeverity.Info,
            description: $"Session '{sessionId}' revoked by administrator",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            ct: ct);

        return NoContent();
    }

    private const SessionStatus SecurityStatusRevoked = SessionStatus.Revoked;
}
