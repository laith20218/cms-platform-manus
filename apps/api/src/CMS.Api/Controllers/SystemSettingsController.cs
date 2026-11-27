using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using CMS.Infrastructure.Persistence;
using CMS.Application.Interfaces;
using CMS.Application.Settings;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using System.Security.Claims;

namespace CMS.Api.Controllers;

/// <summary>
/// System Settings controller — admin-editable platform configuration (key/value).
/// Separated from secrets (env vars). Requires Settings.View for read, Settings.Edit for write.
/// Only super_admin can modify security-related settings (category="security").
///
/// PR-7 (Settings + Role Studio):
///   • Every update/reset writes an append-only SystemSettingHistory row inside the SAME
///     SaveChanges as the value change (system_setting_history).
///   • Values for schema-registered keys are typed-validated before mutating
///     (SystemSettingSchema — bool/int bounds/enum/length; failures → 400 SETTING_VALUE_INVALID).
///   • Reset restores the SERVER-side registered default (SystemSettingDefaults); the
///     client-supplied DefaultValue is never read.
///   • GET feature-flags exposes the read-only environment feature-flag inventory.
/// </summary>
[ApiController]
[Route("api/v1/admin/settings")]
[Authorize(Roles = "admin,super_admin")]
public class SystemSettingsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionService _permissions;
    private readonly ISecurityAuditWriter _audit;
    private readonly IConfiguration _configuration;

    public SystemSettingsController(
        ApplicationDbContext db,
        IPermissionService permissions,
        ISecurityAuditWriter audit,
        IConfiguration configuration)
    {
        _db = db;
        _permissions = permissions;
        _audit = audit;
        _configuration = configuration;
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
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.View, ct)) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail

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
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.View, ct)) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail

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
    /// Registered keys are typed-validated (SystemSettingSchema) before mutating; every
    /// change appends a SystemSettingHistory row in the same transaction.
    /// </summary>
    [HttpPut("{key}")]
    public async Task<IActionResult> Update(string key, [FromBody] UpdateSettingRequest body, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.Edit, ct)) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail

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
                return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail
            }
        }

        var previousValue = setting.Value;
        var nextValue = body.Value ?? setting.Value;

        // PR-7: typed validation for schema-registered keys — BEFORE any mutation.
        // Throws DomainException (SETTING_VALUE_INVALID → 400 ProblemDetails via middleware).
        SystemSettingSchema.Validate(key, nextValue);

        // Validate value length (legacy cap for unregistered keys; registered string keys
        // are already bounded by their schema MaxLength above).
        if (nextValue.Length > 2000)
            return BadRequest(new ProblemDetails
            {
                Title = "Value too long",
                Status = 400,
                Detail = "Setting value must be at most 2000 characters.",
            });

        setting.Value = nextValue;
        if (body.Description is not null) setting.Description = body.Description;
        setting.UpdatedBy = adminId;

        // PR-7: history row in the SAME SaveChanges as the value change — the pair is atomic.
        _db.SystemSettingHistories.Add(SystemSettingHistory.Create(key, previousValue, setting.Value, adminId, "update"));

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
    /// Reset a setting to its REGISTERED default value (server-side defaults registry).
    /// The client-supplied DefaultValue is ignored entirely. Keys without a registered
    /// default answer 404 ("No registered default"). Runs the same typed validation as
    /// update and appends a SystemSettingHistory row (reason "reset") in the same transaction.
    /// </summary>
    [HttpPost("{key}/reset")]
    public async Task<IActionResult> Reset(string key, [FromBody] ResetSettingRequest body, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.Edit, ct)) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail

        var setting = await _db.SystemSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (setting is null) return NotFound();

        if (string.Equals(setting.Category, "security", StringComparison.OrdinalIgnoreCase))
        {
            var scope = await _permissions.GetScopeAsync(adminId, ct);
            if (scope?.IsSuperAdmin != true) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail
        }

        // PR-7: server-side defaults registry — the reset target is NEVER the client value.
        if (!SystemSettingDefaults.Values.TryGetValue(key, out var registeredDefault))
            return NotFound(new ProblemDetails
            {
                Title = "No registered default",
                Status = 404,
                Detail = "لا يوجد افتراضي مسجّل لهذا الإعداد",
            });

        var previousValue = setting.Value;

        // PR-7: reset runs the same typed validation as update (defensive — the registry
        // itself is the source of truth and must always satisfy the schema).
        SystemSettingSchema.Validate(key, registeredDefault);

        setting.Value = registeredDefault;
        setting.UpdatedBy = adminId;

        // PR-7: history row in the SAME SaveChanges as the value change — the pair is atomic.
        _db.SystemSettingHistories.Add(SystemSettingHistory.Create(key, previousValue, setting.Value, adminId, "reset"));

        await _db.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            studentId: null,
            adminId: adminId,
            eventType: SecurityEventType.AdminAction,
            severity: SecuritySeverity.Info,
            description: $"System setting '{key}' reset to default '{registeredDefault}' (was '{previousValue}')",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            deviceFingerprint: null,
            ct: ct);

        return Ok(MapToDto(setting));
    }

    // ===== PR-7: per-setting history (read-only audit trail) =====

    /// <summary>
    /// PR-7: paginated, append-only history of one setting's changes (SystemSettingHistory
    /// rows written by update/reset). Requires Settings.View. Actor names are resolved via a
    /// batch fetch; the response carries only derived display fields — no secrets, no
    /// environment values, nothing editable.
    /// </summary>
    [HttpGet("{key}/history")]
    public async Task<IActionResult> History(string key, [FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.View, ct)) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.SystemSettingHistories.AsNoTracking().Where(h => h.Key == key);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(h => h.ChangedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        // Batch-resolve actor names for human-readable display.
        var actorIds = items.Where(i => i.ChangedBy.HasValue).Select(i => i.ChangedBy!.Value).Distinct().ToList();
        var actors = actorIds.Count > 0
            ? await _db.Admins.AsNoTracking().Where(a => actorIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct)
            : new Dictionary<Guid, Admin>();

        return Ok(new
        {
            items = items.Select(h => new
            {
                id = h.Id,
                key = h.Key,
                oldValue = h.OldValue,
                newValue = h.NewValue,
                changedBy = h.ChangedBy,
                changedByName = h.ChangedBy.HasValue && actors.TryGetValue(h.ChangedBy.Value, out var actor) ? actor.FullName : null,
                changedAt = h.ChangedAt,
                reason = h.Reason,
            }),
            total,
            page,
            pageSize,
            totalPages = Math.Max(1, (int)Math.Ceiling((double)total / pageSize)),
        });
    }

    // ===== PR-7: read-only feature-flag inventory (Settings surface) =====

    /// <summary>
    /// PR-7: read-only inventory of the environment-level feature flags for the Settings
    /// surface. Requires Settings.View AND super_admin (the same gate the security-category
    /// settings use — these flags are security-relevant environment configuration, never
    /// delegated). The runtime-effective value and its source (environment vs. code default)
    /// are resolved from IConfiguration; there is NO write endpoint — the flags change only
    /// via appsettings/environment. The HardDelete entry duplicates
    /// /api/v1/admin/system/hard-delete/status for the settings surface; both are kept.
    /// </summary>
    [HttpGet("feature-flags")]
    public async Task<IActionResult> FeatureFlags(CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Settings, Actions.View, ct)) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail

        var scope = await _permissions.GetScopeAsync(adminId, ct);
        if (scope?.IsSuperAdmin != true) return Problem(statusCode: StatusCodes.Status403Forbidden, detail: "لا تملك صلاحية تنفيذ هذا الإجراء"); // W14.2: 403 = ProblemDetails with detail

        var items = FeatureFlagCatalog.All.Select(flag =>
        {
            var configured = _configuration[flag.ConfigKey];
            var fromEnvironment = !string.IsNullOrEmpty(configured);
            return new
            {
                key = flag.ConfigKey,
                rawEnvName = flag.RawEnvName,
                value = fromEnvironment ? configured! : flag.DefaultValue,
                valueType = flag.ValueType,
                source = fromEnvironment ? "environment" : "default",
                editable = false,
            };
        });
        return Ok(items);
    }

    private static object MapToDto(SystemSetting s)
    {
        var schema = SystemSettingSchema.TryGetEntry(s.Key);
        return new
        {
            id = s.Id,
            key = s.Key,
            value = s.Value,
            valueType = schema?.ValueType ?? SystemSettingSchema.StringType,
            allowedValues = schema?.AllowedValues,
            description = s.Description,
            category = s.Category,
            updatedBy = s.UpdatedBy,
            updatedAt = s.UpdatedAt,
            createdAt = s.CreatedAt,
        };
    }
}

/// <summary>
/// PR-7: the five feature flags surfaced on the Settings page. ConfigKey is the
/// IConfiguration path; RawEnvName is the double-underscore environment-variable alias
/// (the documented override channel, e.g. env Features__HardDeleteEnabled=true); the
/// DefaultValue is the fail-closed code default applied when configuration has no value
/// (mirrors the runtime consumers: fail-closed bools, Library retention 30).
/// </summary>
internal static class FeatureFlagCatalog
{
    internal sealed record FeatureFlagDefinition(string ConfigKey, string RawEnvName, string DefaultValue, string ValueType);

    internal static readonly FeatureFlagDefinition[] All =
    [
        new("Features:OtpEnabled", "Features__OtpEnabled", "false", "bool"),
        new("Features:OfflineEnabled", "Features__OfflineEnabled", "false", "bool"),
        new("Features:HardDeleteEnabled", "Features__HardDeleteEnabled", "false", "bool"),
        new("Security:PlayIntegrity:Enabled", "Security__PlayIntegrity__Enabled", "false", "bool"),
        new("Library:RetentionDays", "Library__RetentionDays", "30", "int"),
    ];
}

/// <summary>Request body for PUT /settings/{key}.</summary>
public record UpdateSettingRequest(string? Value, string? Description);

/// <summary>
/// Request body for POST /settings/{key}/reset.
/// NOTE (PR-7): the DefaultValue field is IGNORED by the backend — it is kept optional
/// only for wire compatibility with existing clients. The reset target always comes from
/// the server-side defaults registry (SystemSettingDefaults); sending any value here
/// (including a malicious one) has no effect on the outcome.
/// </summary>
public record ResetSettingRequest(string? DefaultValue);
