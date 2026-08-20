using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Dashboard;
using CMS.Application.Commands.Admin;
using CMS.Application.Commands.Subscriptions;
using CMS.Application.DTOs.Dashboard;
using CMS.Api.Authorization;
using CMS.Application.Interfaces;

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

    public AdminDashboardController(MediatR.ISender mediator, IPermissionService permissions)
    {
        _mediator = mediator;
        _permissions = permissions;
    }

    private Guid GetAdminId()
    {
        var value = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(value, out var adminId) ? adminId : throw new UnauthorizedAccessException();
    }

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
    /// Assign an existing administrator to a role.
    /// </summary>
    [HttpPut("admins/{id:guid}/role")]
    [Authorize(Policy = Policies.AdminEdit)]
    public async Task<IActionResult> AssignAdminRole(Guid id, [FromBody] AssignAdminRoleRequestDto dto, CancellationToken ct)
    {
        await _mediator.Send(new AssignAdminRoleCommand(GetAdminId(), id, dto.RoleId), ct);
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
    /// Revoke an active student subscription within the acting administrator's authorized scope.
    /// </summary>
    [HttpPost("subscriptions/{id:guid}/revoke")]
    [Authorize(Policy = Policies.CodeEdit)]
    public async Task<IActionResult> RevokeSubscription(Guid id, [FromBody] RevokeSubscriptionRequestDto dto, CancellationToken ct)
    {
        await _mediator.Send(new RevokeStudentSubscriptionCommand(GetAdminId(), id, dto.Reason), ct);
        return NoContent();
    }

    // ===== Code Management =====

    /// <summary>
    /// Get paginated list of subscription codes.
    /// </summary>
    [HttpGet("codes")]
    [Authorize(Policy = Policies.CodeView)]
    public async Task<ActionResult<PagedResult<CodeManagementDto>>> GetCodes(
        [FromQuery] string? status, [FromQuery] Guid? subjectId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new GetCodesQuery(status, subjectId, page, pageSize, GetAdminId()), ct);
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
            dto.Prefix, dto.CodeExpiresAt, GetAdminId()
        ), ct);
        return Ok(result);
    }
}

// ===== Request DTOs =====
public record BanRequestDto(string Reason, DateTime? BanUntil);
public record AssignAdminRoleRequestDto(Guid RoleId);
public record RolePermissionGrantRequestDto(string Resource, List<string> Actions, string Scope);
public record ReplaceRolePermissionsRequestDto(List<RolePermissionGrantRequestDto> Permissions);
public record RevokeSubscriptionRequestDto(string Reason);
public record GenerateCodesRequestDto(
    string ScopeType,
    Guid? ScopeId,
    int DurationDays,
    int Quantity,
    string? Prefix,
    DateTime? CodeExpiresAt
);
