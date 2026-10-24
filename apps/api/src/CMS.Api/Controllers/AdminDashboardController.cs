using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using CMS.Application.Commands.Dashboard;
using CMS.Application.Commands.Admin;
using CMS.Application.Commands.Subscriptions;
using CMS.Application.DTOs.Dashboard;
using CMS.Application.Handlers.Admin;
using CMS.Api.Authorization;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Persistence;
using CMS.Domain.Entities;
using CMS.Domain.Enums;

namespace CMS.Api.Controllers;

/// <summary>
/// Admin dashboard controller - provides stats, reports, and management endpoints.
/// All endpoints require admin role.
/// </summary>
[ApiController]
[Route("api/v1/admin")]
[Authorize(Roles = "admin,super_admin")]
public class AdminDashboardController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly IPermissionService _permissions;
    private readonly ISessionService _sessions;
    private readonly ApplicationDbContext _db;
    private readonly ISecurityAuditWriter _audit;

    public AdminDashboardController(MediatR.ISender mediator, IPermissionService permissions, ISessionService sessions, ApplicationDbContext db, ISecurityAuditWriter audit)
    {
        _mediator = mediator;
        _permissions = permissions;
        _sessions = sessions;
        _db = db;
        _audit = audit;
    }

    private Guid GetAdminId()
    {
        var value = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(value, out var adminId) ? adminId : throw new UnauthorizedAccessException();
    }

    /// <summary>Push 2 / Track 2: acting session id from the access token — powers per-session counters.</summary>
    private Guid? GetSessionId() => Guid.TryParse(User.FindFirst("sid")?.Value, out var id) ? id : null;

    private async Task<bool> IsInScopeAsync(string entityType, Guid entityId, CancellationToken ct) =>
        await _permissions.IsInScopeAsync(GetAdminId(), entityType, entityId, ct);

    // ===== Dashboard Stats =====

    /// <summary>
    /// Get dashboard overview statistics.
    /// </summary>
    [HttpGet("dashboard")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<DashboardStatsDto>> GetStats(CancellationToken ct)
        => Ok(await _mediator.Send(new GetDashboardStatsQuery(), ct));

    /// <summary>
    /// Get recent activity feed.
    /// </summary>
    [HttpGet("recent-activity")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<List<RecentActivityDto>>> GetRecentActivity([FromQuery] int count = 10, CancellationToken ct = default)
        => Ok(await _mediator.Send(new GetRecentActivityQuery(count), ct));

    /// <summary>
    /// Get revenue data for charts.
    /// </summary>
    [HttpGet("revenue")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<List<RevenueDataDto>>> GetRevenue([FromQuery] int months = 6, CancellationToken ct = default)
        => Ok(await _mediator.Send(new GetRevenueDataQuery(months), ct));

    /// <summary>
    /// Get student growth data for charts.
    /// </summary>
    [HttpGet("student-growth")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<List<StudentGrowthDto>>> GetStudentGrowth([FromQuery] int days = 30, CancellationToken ct = default)
        => Ok(await _mediator.Send(new GetStudentGrowthQuery(days), ct));

    /// <summary>
    /// Get top subjects by activity.
    /// </summary>
    [HttpGet("top-subjects")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<List<TopSubjectDto>>> GetTopSubjects([FromQuery] int count = 5, CancellationToken ct = default)
        => Ok(await _mediator.Send(new GetTopSubjectsQuery(count), ct));

    /// <summary>
    /// Get error reports summary.
    /// </summary>
    [HttpGet("reports/summary")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<ReportsSummaryDto>> GetReportsSummary(CancellationToken ct)
        => Ok(await _mediator.Send(new GetReportsSummaryQuery(), ct));

    // ===== Student Management =====

    /// <summary>
    /// Get paginated list of students with filters.
    /// </summary>
    [HttpGet("students")]
    [Authorize(Policy = Policies.StudentView)]
    public async Task<ActionResult<PagedResult<StudentManagementDto>>> GetStudents(
        [FromQuery] string? search, [FromQuery] Guid? universityId,
        [FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new GetStudentsQuery(search, universityId, status, page, pageSize, GetAdminId()), ct);
        return Ok(result);
    }

    /// <summary>
    /// Ban a student.
    /// </summary>
    [HttpPost("students/{id:guid}/ban")]
    [Authorize(Policy = Policies.StudentEdit)]
    public async Task<IActionResult> BanStudent(Guid id, [FromBody] BanRequestDto dto, CancellationToken ct)
    {
        if (!await IsInScopeAsync("student", id, ct)) return Forbid();
        var adminId = GetAdminId();
        await _mediator.Send(new BanStudentCommand(id, dto.Reason, dto.BanUntil, adminId), ct);
        return NoContent();
    }

    /// <summary>
    /// Unban a student.
    /// </summary>
    [HttpPost("students/{id:guid}/unban")]
    [Authorize(Policy = Policies.StudentEdit)]
    public async Task<IActionResult> UnbanStudent(Guid id, CancellationToken ct)
    {
        if (!await IsInScopeAsync("student", id, ct)) return Forbid();
        var adminId = GetAdminId();
        await _mediator.Send(new UnbanStudentCommand(id, adminId), ct);
        return NoContent();
    }

    /// <summary>
    /// Revoke every active session for a student within the administrator's academic scope.
    /// </summary>
    [HttpPost("students/{id:guid}/revoke-sessions")]
    [Authorize(Policy = Policies.StudentEdit)]
    public async Task<IActionResult> RevokeStudentSessions(Guid id, CancellationToken ct)
    {
        if (!await IsInScopeAsync("student", id, ct)) return Forbid();
        await _sessions.RevokeAllForUserAsync(id, "Revoked by authorized administrator", ct);
        return NoContent();
    }

    // ===== Super Administrator: Administrator Accounts =====

    /// <summary>
    /// Lists administrator accounts for the super-administrator console.
    /// </summary>
    [HttpGet("admins")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<PagedResult<AdminManagementDto>>> GetAdmins(
        [FromQuery] string? search,
        [FromQuery] Guid? roleId,
        [FromQuery] bool? isActive,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
        => Ok(await _mediator.Send(new GetAdminsQuery(GetAdminId(), search, roleId, isActive, page, pageSize), ct));

    /// <summary>
    /// Returns administrator details for editing in the management console.
    /// </summary>
    [HttpGet("admins/{id:guid}")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<AdminManagementDto>> GetAdmin(Guid id, CancellationToken ct)
        => Ok(await _mediator.Send(new GetAdminDetailsQuery(GetAdminId(), id), ct));

    /// <summary>
    /// Creates an administrator with an initial password and optional academic scope.
    /// </summary>
    [HttpPost("admins")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<AdminManagementDto>> CreateAdmin([FromBody] CreateAdminRequestDto dto, CancellationToken ct)
    {
        var created = await _mediator.Send(new CreateAdminCommand(
            GetAdminId(), dto.Email, dto.Password, dto.FullName, dto.Phone, dto.RoleId,
            dto.ScopeUniversityId, dto.ScopeCollegeId, dto.ScopeYearId, dto.ScopeSubjectId), ct);
        return CreatedAtAction(nameof(GetAdmin), new { id = created.Id }, created);
    }

    /// <summary>
    /// Updates an administrator's identity, assigned role, and academic scope.
    /// </summary>
    [HttpPut("admins/{id:guid}")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<AdminManagementDto>> UpdateAdmin(Guid id, [FromBody] UpdateAdminRequestDto dto, CancellationToken ct)
        => Ok(await _mediator.Send(new UpdateAdminCommand(
            GetAdminId(), id, dto.Email, dto.FullName, dto.Phone, dto.RoleId,
            dto.ScopeUniversityId, dto.ScopeCollegeId, dto.ScopeYearId, dto.ScopeSubjectId), ct));

    /// <summary>
    /// Enables or disables an administrator. Disabling immediately invalidates every live session.
    /// </summary>
    [HttpPost("admins/{id:guid}/status")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<IActionResult> SetAdminStatus(Guid id, [FromBody] SetActiveRequestDto dto, CancellationToken ct)
    {
        await _mediator.Send(new SetAdminStatusCommand(GetAdminId(), id, dto.IsActive), ct);
        return NoContent();
    }

    /// <summary>
    /// Resets an administrator password and immediately invalidates every live session.
    /// </summary>
    [HttpPost("admins/{id:guid}/reset-password")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<IActionResult> ResetAdminPassword(Guid id, [FromBody] ResetAdminPasswordRequestDto dto, CancellationToken ct)
    {
        await _mediator.Send(new ResetAdminPasswordCommand(GetAdminId(), id, dto.NewPassword), ct);
        return NoContent();
    }

    /// <summary>
    /// Permanently removes an administrator after the acting super administrator re-authenticates.
    /// </summary>
    [HttpDelete("admins/{id:guid}")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<IActionResult> DeleteAdmin(Guid id, [FromBody] DeleteAdminRequestDto dto, CancellationToken ct)
    {
        await _mediator.Send(new DeleteAdminCommand(GetAdminId(), id, dto.CurrentSuperAdminPassword), ct);
        return NoContent();
    }

    /// <summary>
    /// Replace permission grants for a non-system administrative role.
    /// </summary>
    [HttpPut("roles/{id:guid}/permissions")]
    [Authorize(Policy = Policies.RoleEdit)]
    public async Task<IActionResult> ReplaceRolePermissions(Guid id, [FromBody] ReplaceRolePermissionsRequestDto dto, CancellationToken ct)
    {
        var grants = dto.Permissions.Select(permission => new RolePermissionGrant(permission.Resource, permission.Actions, permission.Scope)).ToList();
        await _mediator.Send(new ReplaceRolePermissionsCommand(GetAdminId(), id, grants), ct);
        return NoContent();
    }

    /// <summary>
    /// Read the current permission grants for one role (system or custom).
    /// Used by the Permission Matrix Editor UI to display the current state.
    /// </summary>
    [HttpGet("roles/{id:guid}/permissions")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<List<RolePermissionGrantDto>>> GetRolePermissions(Guid id, CancellationToken ct)
        => Ok(await _mediator.Send(new GetRolePermissionsQuery(GetAdminId(), id), ct));

    // ===== Super Administrator: Role Lifecycle =====

    /// <summary>
    /// Lists system and custom roles along with administrator and permission totals.
    /// </summary>
    [HttpGet("roles")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<List<AdminRoleManagementDto>>> GetRoles(CancellationToken ct)
        => Ok(await _mediator.Send(new GetRolesQuery(GetAdminId()), ct));

    /// <summary>
    /// Creates a custom role with no permissions until its grants are configured.
    /// </summary>
    [HttpPost("roles")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<AdminRoleManagementDto>> CreateRole([FromBody] CreateRoleRequestDto dto, CancellationToken ct)
    {
        var created = await _mediator.Send(new CreateRoleCommand(GetAdminId(), dto.Name, dto.NameAr, dto.Description), ct);
        return CreatedAtAction(nameof(GetRoles), null, created);
    }

    /// <summary>
    /// Temporarily enables or disables an administrative role. Disabling invalidates assigned sessions.
    /// </summary>
    [HttpPost("roles/{id:guid}/status")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<IActionResult> SetRoleStatus(Guid id, [FromBody] SetActiveRequestDto dto, CancellationToken ct)
    {
        await _mediator.Send(new SetRoleActiveCommand(GetAdminId(), id, dto.IsActive), ct);
        return NoContent();
    }

    /// <summary>
    /// Deletes an unused custom role. Assigned administrators must be moved first.
    /// </summary>
    [HttpDelete("roles/{id:guid}")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<IActionResult> DeleteRole(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new DeleteRoleCommand(GetAdminId(), id), ct);
        return NoContent();
    }

    // ===== Push 3 / Track 3: advanced UI permissions per role =====

    /// <summary>
    /// Reads the UI-permission configuration of one role (system or custom).
    /// Serves the Advanced Permissions editor in RolesCenter.
    /// </summary>
    [HttpGet("roles/{id:guid}/ui-permissions")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<ActionResult<RoleUiPermissionsDto>> GetRoleUiPermissions(Guid id, CancellationToken ct)
        => Ok(await _mediator.Send(new GetRoleUiPermissionsQuery(GetAdminId(), id), ct));

    /// <summary>
    /// Replaces the UI-permission key set of a custom role. Keys are validated against
    /// the 62-key registry; system roles (incl. super_admin) answer 400 SYSTEM_ROLE_READONLY.
    /// </summary>
    [HttpPut("roles/{id:guid}/ui-permissions")]
    [Authorize(Policy = Policies.RoleEdit)]
    public async Task<IActionResult> ReplaceRoleUiPermissions(Guid id, [FromBody] ReplaceRoleUiPermissionsRequestDto dto, CancellationToken ct)
    {
        await _mediator.Send(new ReplaceRoleUiPermissionsCommand(GetAdminId(), id, dto.AllowedKeys), ct);
        return NoContent();
    }

    /// <summary>
    /// Resets a custom role to unconfigured (NULL = full admin-web access).
    /// </summary>
    [HttpDelete("roles/{id:guid}/ui-permissions")]
    [Authorize(Policy = Policies.RoleEdit)]
    public async Task<IActionResult> ClearRoleUiPermissions(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new ClearRoleUiPermissionsCommand(GetAdminId(), id), ct);
        return NoContent();
    }

    /// <summary>
    /// Revoke an active student subscription within the acting administrator's authorized scope.
    /// </summary>
    [HttpPost("subscriptions/{id:guid}/revoke")]
    [Authorize(Policy = Policies.CodeEdit)]
    public async Task<IActionResult> RevokeSubscription(Guid id, [FromBody] RevokeSubscriptionRequestDto dto, CancellationToken ct)
    {
        await _mediator.Send(new RevokeStudentSubscriptionCommand(GetAdminId(), id, dto.Reason), ct);
        return NoContent();
    }

    /// <summary>Cancel a code and immediately revoke all subscriptions created through it.</summary>
    [HttpPost("codes/{id:guid}/revoke")]
    [Authorize(Policy = Policies.CodeEdit)]
    public async Task<ActionResult<RevokeCodeResultDto>> RevokeCode(Guid id, [FromBody] RevokeSubscriptionRequestDto dto, CancellationToken ct)
    {
        var revokedCount = await _mediator.Send(new RevokeSubscriptionCodeCommand(GetAdminId(), id, dto.Reason), ct);
        return Ok(new RevokeCodeResultDto(id, revokedCount));
    }

    // ===== Code Management =====

    /// <summary>
    /// Get paginated list of subscription codes.
    /// </summary>
    [HttpGet("codes")]
    [Authorize(Policy = Policies.CodeView)]
    public async Task<ActionResult<PagedResult<CodeManagementDto>>> GetCodes(
        [FromQuery] string? status, [FromQuery] Guid? subjectId,
        [FromQuery] string? search, [FromQuery] string? scopeType,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new GetCodesQuery(status, subjectId, page, pageSize, GetAdminId(), search, scopeType), ct);
        return Ok(result);
    }

    /// <summary>
    /// Generate a batch of subscription codes.
    /// </summary>
    [HttpPost("codes/generate")]
    [Authorize(Policy = Policies.CodeCreate)]
    public async Task<ActionResult<GenerateCodesResultDto>> GenerateCodes([FromBody] GenerateCodesRequestDto dto, CancellationToken ct)
    {
        var result = await _mediator.Send(new GenerateCodesCommand(
            dto.ScopeType, dto.ScopeId, dto.DurationDays, dto.Quantity,
            dto.Prefix, dto.CodeExpiresAt, dto.ContentScope, dto.IsPublic, GetAdminId(), GetSessionId()
        ), ct);
        return Ok(result);
    }

    /// <summary>
    /// Manually activate a code for a student (admin-side activation).
    /// Bypasses the student self-redeem flow — the admin selects a code +
    /// a student, and the subscription is created immediately.
    /// </summary>
    [HttpPost("codes/{codeId:guid}/activate")]
    [Authorize(Policy = Policies.CodeEdit)]
    public async Task<IActionResult> ActivateCodeForStudent(Guid codeId, [FromBody] ActivateCodeRequestDto dto, CancellationToken ct)
    {
        var adminId = GetAdminId();

        // Validate code exists + is active
        var code = await _db.SubscriptionCodes.FirstOrDefaultAsync(c => c.Id == codeId, ct);
        if (code is null) return NotFound(new ProblemDetails { Title = "Code not found", Status = 404 });
        if (code.Status != Domain.Enums.CodeStatus.Active)
            return BadRequest(new ProblemDetails { Title = "Code is not active", Status = 400 });

        // Validate student exists + is active
        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == dto.StudentId && s.DeletedAt == null, ct);
        if (student is null) return NotFound(new ProblemDetails { Title = "Student not found", Status = 404 });
        if (student.Status != Domain.Enums.StudentStatus.Active)
            return BadRequest(new ProblemDetails { Title = "Student is not active", Status = 400 });

        // Check no existing subscription for this code+student
        var existing = await _db.StudentSubscriptions.AnyAsync(s => s.StudentId == dto.StudentId && s.SubscriptionCodeId == code.Id, ct);
        if (existing) return BadRequest(new ProblemDetails { Title = "This code is already activated for this student", Status = 400 });

        // Create the subscription
        var now = DateTime.UtcNow;
        var durationExpiresAt = code.DurationDays > 0 ? now.AddDays(code.DurationDays) : DateTime.MaxValue;
        var subscriptionExpiresAt = code.CodeExpiresAt.HasValue && code.CodeExpiresAt.Value < durationExpiresAt
            ? code.CodeExpiresAt.Value : durationExpiresAt;

        var subscription = new CMS.Domain.Entities.StudentSubscription
        {
            StudentId = student.Id,
            SubscriptionCodeId = code.Id,
            ScopeType = code.ScopeType,
            ContentScope = code.ContentScope,
            ScopeUniversityId = code.ScopeUniversityId,
            ScopeCollegeId = code.ScopeCollegeId,
            ScopeYearId = code.ScopeYearId,
            ScopeSemesterId = code.ScopeSemesterId,
            ScopeSubjectId = code.ScopeSubjectId,
            Status = Domain.Enums.SubscriptionStatus.Active,
            StartsAt = now,
            ExpiresAt = subscriptionExpiresAt,
        };
        _db.StudentSubscriptions.Add(subscription);

        // Mark code as used if not already
        if (!code.UsedAt.HasValue)
        {
            typeof(CMS.Domain.Entities.SubscriptionCode).GetProperty(nameof(CMS.Domain.Entities.SubscriptionCode.UsedAt))?.SetValue(code, now);
            typeof(CMS.Domain.Entities.SubscriptionCode).GetProperty(nameof(CMS.Domain.Entities.SubscriptionCode.UsedBy))?.SetValue(code, student.Id);
        }

        await _db.SaveChangesAsync(ct);

        // Audit log the manual activation
        await _audit.LogSecurityEventAsync(
            studentId: student.Id, adminId: adminId,
            eventType: SecurityEventType.AdminAction, severity: SecuritySeverity.Info,
            description: $"Code '{code.Code}' manually activated for student '{student.FullName}' by admin",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            ct: ct);

        return Ok(new { subscriptionId = subscription.Id, codeId = code.Id, studentId = student.Id, expiresAt = subscriptionExpiresAt });
    }
}

// ===== Request DTOs =====
public record BanRequestDto(string Reason, DateTime? BanUntil);
public record ActivateCodeRequestDto(Guid StudentId);
public record RolePermissionGrantRequestDto(string Resource, List<string> Actions, string Scope);
public record ReplaceRolePermissionsRequestDto(List<RolePermissionGrantRequestDto> Permissions);
public record RevokeSubscriptionRequestDto(string Reason);
public record RevokeCodeResultDto(Guid CodeId, int RevokedSubscriptions);
public record GenerateCodesRequestDto(
    string ScopeType,
    Guid? ScopeId,
    int DurationDays,
    int Quantity,
    string? Prefix,
    DateTime? CodeExpiresAt,
    string ContentScope,
    bool IsPublic
);
public record CreateAdminRequestDto(
    string Email,
    string Password,
    string FullName,
    string? Phone,
    Guid RoleId,
    Guid? ScopeUniversityId,
    Guid? ScopeCollegeId,
    Guid? ScopeYearId,
    Guid? ScopeSubjectId
);
public record UpdateAdminRequestDto(
    string Email,
    string FullName,
    string? Phone,
    Guid RoleId,
    Guid? ScopeUniversityId,
    Guid? ScopeCollegeId,
    Guid? ScopeYearId,
    Guid? ScopeSubjectId
);
public record SetActiveRequestDto(bool IsActive);
public record ResetAdminPasswordRequestDto(string NewPassword);
public record DeleteAdminRequestDto(string CurrentSuperAdminPassword);
public record CreateRoleRequestDto(string Name, string NameAr, string? Description);
public record ReplaceRoleUiPermissionsRequestDto(IReadOnlyList<string>? AllowedKeys);
