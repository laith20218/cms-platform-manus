using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMS.Infrastructure.Persistence;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using System.Security.Claims;

namespace CMS.Api.Controllers;

/// <summary>
/// System Settings controller — admin-editable platform configuration (key/value).
/// Separated from secrets (env vars). Requires Settings.View for read, Settings.Edit for write.
/// Only super_admin can modify security-related settings (category="security").
/// </summary>
[ApiController]
[Route("api/v1/admin/settings")]
[Authorize(Roles = "admin,super_admin")]
public class SystemSettingsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionService _permissions;
    private readonly ISecurityAuditWriter _audit;

    public SystemSettingsController(ApplicationDbContext db, IPermissionService permissions, ISecurityAuditWriter audit)
    {
        _db = db;
        _permissions = permissions;
        _audit = audit;
    }

    private Guid GetAdminId()
    {
        var value = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(value, out var adminId) ? adminId : throw new UnauthorizedAccessException();
    }

    /// <summary>
    /// List all system settings, optionally filtered by category.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? category, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.View, ct)) return Forbid();

        var query = _db.SystemSettings.AsNoTracking();
        if (!string.IsNullOrEmpty(category))
            query = query.Where(s => s.Category == category);

        var settings = await query.OrderBy(s => s.Category).ThenBy(s => s.Key).ToListAsync(ct);
        return Ok(settings.Select(MapToDto));
    }

    /// <summary>
    /// Get a single setting by key.
    /// </summary>
    [HttpGet("{key}")]
    public async Task<IActionResult> Get(string key, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.View, ct)) return Forbid();

        var setting = await _db.SystemSettings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == key, ct);
        if (setting is null) return NotFound(new ProblemDetails
        {
            Title = "Setting not found",
            Status = 404,
            Detail = $"No system setting with key '{key}'",
        });
        return Ok(MapToDto(setting));
    }

    /// <summary>
    /// Update a setting's value (and optionally description).
    /// Security-category settings require super_admin role.
    /// </summary>
    [HttpPut("{key}")]
    public async Task<IActionResult> Update(string key, [FromBody] UpdateSettingRequest body, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.Edit, ct)) return Forbid();

        var setting = await _db.SystemSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (setting is null) return NotFound(new ProblemDetails
        {
            Title = "Setting not found",
            Status = 404,
            Detail = $"No system setting with key '{key}'",
        });

        // Security-category settings require super_admin
        if (string.Equals(setting.Category, "security", StringComparison.OrdinalIgnoreCase))
        {
            var scope = await _permissions.GetScopeAsync(adminId, ct);
            if (scope?.IsSuperAdmin != true)
            {
                return Forbid();
            }
        }

        // Validate value length
        if (body.Value != null && body.Value.Length > 2000)
            return BadRequest(new ProblemDetails
            {
                Title = "Value too long",
                Status = 400,
                Detail = "Setting value must be at most 2000 characters.",
            });

        var previousValue = setting.Value;
        setting.Value = body.Value ?? setting.Value;
        if (body.Description is not null) setting.Description = body.Description;
        setting.UpdatedBy = adminId;

        await _db.SaveChangesAsync(ct);

        // Log the change as a security event (audit trail)
        await _audit.LogSecurityEventAsync(
            studentId: null,
            adminId: adminId,
            eventType: SecurityEventType.AdminAction,
            severity: SecuritySeverity.Info,
            description: $"System setting '{key}' updated from '{previousValue}' to '{setting.Value}'",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            deviceFingerprint: null,
            ct: ct);

        return Ok(MapToDto(setting));
    }

    /// <summary>
    /// Reset a setting to its default value (if a default exists in seed).
    /// This is a soft operation — it only restores the value, not the audit trail.
    /// </summary>
    [HttpPost("{key}/reset")]
    public async Task<IActionResult> Reset(string key, [FromBody] ResetSettingRequest body, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.Edit, ct)) return Forbid();

        var setting = await _db.SystemSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (setting is null) return NotFound();

        if (string.Equals(setting.Category, "security", StringComparison.OrdinalIgnoreCase))
        {
            var scope = await _permissions.GetScopeAsync(adminId, ct);
            if (scope?.IsSuperAdmin != true) return Forbid();
        }

        if (string.IsNullOrEmpty(body.DefaultValue))
            return BadRequest(new ProblemDetails
            {
                Title = "No default value provided",
                Status = 400,
                Detail = "Reset requires a DefaultValue in the request body.",
            });

        var previousValue = setting.Value;
        setting.Value = body.DefaultValue;
        setting.UpdatedBy = adminId;

        await _db.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            studentId: null,
            adminId: adminId,
            eventType: SecurityEventType.AdminAction,
            severity: SecuritySeverity.Info,
            description: $"System setting '{key}' reset to default '{body.DefaultValue}' (was '{previousValue}')",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            deviceFingerprint: null,
            ct: ct);

        return Ok(MapToDto(setting));
    }

    private static object MapToDto(SystemSetting s) => new
    {
        id = s.Id,
        key = s.Key,
        value = s.Value,
        description = s.Description,
        category = s.Category,
        updatedBy = s.UpdatedBy,
        updatedAt = s.UpdatedAt,
        createdAt = s.CreatedAt,
    };
}

/// <summary>Request body for PUT /settings/{key}.</summary>
public record UpdateSettingRequest(string? Value, string? Description);

/// <summary>Request body for POST /settings/{key}/reset.</summary>
public record ResetSettingRequest(string DefaultValue);
