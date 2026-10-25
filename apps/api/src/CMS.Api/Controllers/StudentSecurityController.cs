using System.Security.Claims;
using System.Text.Json;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Student-facing session management (Push 9 Task 3).
///
/// The admin <see cref="SecurityController"/> exposes the same data behind
/// Logs.View permissions; this controller is the STUDENT's own scoped view:
/// every route is hard-scoped to the authenticated student and the current
/// installation is resolved from the X-Installation-Id header the web client
/// already sends on every request. Students can list their active sessions and
/// revoke any of them (or all others) — the "sessions and devices" surface that
/// previously shipped as a placeholder because no safe server path existed.
/// </summary>
[ApiController]
[Route("api/v1/security/my-sessions")]
[Authorize(Roles = "student")]
public sealed class StudentSecurityController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly SecurityService _securityService;

    public StudentSecurityController(ApplicationDbContext db, SecurityService securityService)
    {
        _db = db;
        _securityService = securityService;
    }

    private Guid StudentId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")!.Value);

    private string? CurrentInstallationId =>
        Request.Headers.TryGetValue("X-Installation-Id", out var value) && !string.IsNullOrWhiteSpace(value)
            ? value.ToString()
            : null;

    /// <summary>
    /// Lists the student's sessions (active first, newest first) with device
    /// context (browser / os / device type / IP) parsed from the stored
    /// UserAgent + DeviceDetails. The session bound to the calling installation
    /// carries <c>current: true</c>.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetMySessions(CancellationToken ct = default)
    {
        var studentId = StudentId;
        var currentInstallation = CurrentInstallationId;

        var sessions = await _db.UserSessions.AsNoTracking()
            .Where(s => s.UserId == studentId)
            .OrderByDescending(s => s.Status == SessionStatus.Active)
            .ThenByDescending(s => s.LastActivityAt)
            .Take(50)
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        var items = sessions.Select(s =>
        {
            var (browser, os, deviceType) = ParseDeviceDetails(s.DeviceDetails, s.UserAgent);
            var isActive = s.Status == SessionStatus.Active
                && s.RevokedAt is null
                && s.RefreshTokenExpiresAt > now;
            return new
            {
                id = s.Id,
                current = currentInstallation is not null && s.InstallationId == currentInstallation,
                status = s.Status.ToString(),
                isActive,
                createdAt = s.CreatedAt,
                lastActivityAt = s.LastActivityAt,
                expiresAt = s.RefreshTokenExpiresAt,
                revokedAt = s.RevokedAt,
                installationId = s.InstallationId,
                browser,
                os,
                deviceType,
                ipAddress = s.IpAddress,
            };
        });

        return Ok(items);
    }

    /// <summary>
    /// Revokes ONE of the student's own sessions (never another student's —
    /// the row must belong to the caller). Idempotent.
    /// </summary>
    [HttpPost("{sessionId:guid}/revoke")]
    public async Task<IActionResult> RevokeMySession(Guid sessionId, CancellationToken ct = default)
    {
        var studentId = StudentId;
        var session = await _db.UserSessions
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == studentId, ct);
        if (session is null)
            return NotFound(new ProblemDetails { Title = "Session not found", Status = 404 });

        if (session.Status == SessionStatus.Revoked) return NoContent();

        session.Revoke("Revoked by the student from the sessions page");
        await _db.SaveChangesAsync(ct);

        await _securityService.LogSecurityEventAsync(
            studentId: studentId,
            adminId: null,
            eventType: SecurityEventType.SessionRevoked,
            severity: SecuritySeverity.Info,
            description: "Student revoked their own session from the devices page",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            deviceFingerprint: session.InstallationId,
            ct: ct);

        return NoContent();
    }

    /// <summary>
    /// "Log out from all other devices": revokes every ACTIVE session except the
    /// one bound to the calling installation. Returns how many were revoked.
    /// </summary>
    [HttpPost("revoke-others")]
    public async Task<IActionResult> RevokeOtherSessions(CancellationToken ct = default)
    {
        var studentId = StudentId;
        var currentInstallation = CurrentInstallationId;
        var now = DateTime.UtcNow;

        var others = await _db.UserSessions
            .Where(s => s.UserId == studentId
                && s.Status == SessionStatus.Active
                && s.RevokedAt == null
                && s.RefreshTokenExpiresAt > now
                && (currentInstallation == null || s.InstallationId != currentInstallation))
            .ToListAsync(ct);

        foreach (var session in others)
            session.Revoke("Student logged out from all other devices");

        if (others.Count > 0)
            await _db.SaveChangesAsync(ct);

        await _securityService.LogSecurityEventAsync(
            studentId: studentId,
            adminId: null,
            eventType: SecurityEventType.SessionRevoked,
            severity: SecuritySeverity.Info,
            description: $"Student logged out from {others.Count} other device(s)",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            deviceFingerprint: currentInstallation,
            ct: ct);

        return Ok(new { revokedCount = others.Count });
    }

    /// <summary>Parses the stored DeviceDetails JSON with a User-Agent fallback.</summary>
    private static (string? Browser, string? Os, string? DeviceType) ParseDeviceDetails(string? deviceDetails, string? userAgent)
    {
        if (!string.IsNullOrWhiteSpace(deviceDetails))
        {
            try
            {
                using var doc = JsonDocument.Parse(deviceDetails);
                var root = doc.RootElement;
                return (
                    root.TryGetProperty("browser", out var b) && b.ValueKind == JsonValueKind.String ? b.GetString() : null,
                    root.TryGetProperty("os", out var o) && o.ValueKind == JsonValueKind.String ? o.GetString() : null,
                    root.TryGetProperty("deviceType", out var d) && d.ValueKind == JsonValueKind.String ? d.GetString() : null);
            }
            catch (JsonException)
            {
                // malformed legacy payload — fall through to the raw fingerprint summary
            }
        }

        if (string.IsNullOrWhiteSpace(userAgent)) return (null, null, null);
        var ua = userAgent.ToLowerInvariant();
        var deviceType = ua.Contains("mobile") || ua.Contains("iphone") || (ua.Contains("android") && !ua.Contains("tablet"))
            ? "mobile"
            : ua.Contains("ipad") || ua.Contains("tablet") ? "tablet" : "desktop";
        return (null, null, deviceType);
    }
}
