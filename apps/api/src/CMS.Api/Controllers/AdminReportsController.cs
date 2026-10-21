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
/// Admin reports moderation controller — list, filter, assign, transition status.
/// All endpoints require admin role + Reports.View/Edit permission.
/// </summary>
[ApiController]
[Route("api/v1/admin/reports")]
[Authorize(Roles = "admin,super_admin")]
public class AdminReportsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionService _permissions;
    private readonly ISecurityAuditWriter _audit;

    public AdminReportsController(ApplicationDbContext db, IPermissionService permissions, ISecurityAuditWriter audit)
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
    /// List error reports with filters + pagination.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        [FromQuery] string? status = null,
        [FromQuery] Guid? assignedTo = null,
        [FromQuery] Guid? questionId = null,
        [FromQuery] DateTime? dateFrom = null,
        [FromQuery] DateTime? dateTo = null,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Reports, Actions.View, ct)) return Forbid();

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.ErrorReports.AsNoTracking();

        // Safe enum parse
        if (!string.IsNullOrEmpty(status) && Enum.TryParse<ErrorReportStatus>(status, true, out var statusEnum))
            query = query.Where(r => r.Status == statusEnum);
        if (assignedTo.HasValue) query = query.Where(r => r.AssignedTo == assignedTo);
        if (questionId.HasValue) query = query.Where(r => r.QuestionId == questionId);
        if (dateFrom.HasValue) query = query.Where(r => r.CreatedAt >= dateFrom);
        if (dateTo.HasValue) query = query.Where(r => r.CreatedAt <= dateTo);
        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(r => r.Description != null && r.Description.Contains(search));

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        // Batch-fetch question texts + student names + admin names
        var questionIds = items.Select(r => r.QuestionId).Distinct().ToList();
        var studentIds = items.Select(r => r.StudentId).Distinct().ToList();
        var adminIds = items.Where(r => r.AssignedTo.HasValue).Select(r => r.AssignedTo!.Value)
            .Concat(items.Where(r => r.ResolvedBy.HasValue).Select(r => r.ResolvedBy!.Value))
            .Distinct().ToList();

        var questions = questionIds.Count > 0
            ? await _db.Questions.AsNoTracking().Where(q => questionIds.Contains(q.Id)).ToDictionaryAsync(q => q.Id, ct)
            : new Dictionary<Guid, Question>();
        var students = studentIds.Count > 0
            ? await _db.Students.AsNoTracking().Where(s => studentIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct)
            : new Dictionary<Guid, Student>();
        var admins = adminIds.Count > 0
            ? await _db.Admins.AsNoTracking().Where(a => adminIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct)
            : new Dictionary<Guid, Admin>();

        var result = items.Select(r => new
        {
            id = r.Id,
            questionId = r.QuestionId,
            questionText = questions.TryGetValue(r.QuestionId, out var q) ? (q.Text.Length > 100 ? q.Text.Substring(0, 100) + "…" : q.Text) : null,
            studentId = r.StudentId,
            studentName = students.TryGetValue(r.StudentId, out var s) ? s.FullName : null,
            reasonType = r.ReasonType.ToString(),
            description = r.Description,
            status = r.Status.ToString(),
            assignedTo = r.AssignedTo,
            assignedToName = r.AssignedTo.HasValue && admins.TryGetValue(r.AssignedTo.Value, out var a1) ? a1.FullName : null,
            reviewedBy = r.ReviewedBy,
            reviewedAt = r.ReviewedAt,
            resolvedBy = r.ResolvedBy,
            resolvedByName = r.ResolvedBy.HasValue && admins.TryGetValue(r.ResolvedBy.Value, out var a2) ? a2.FullName : null,
            resolvedAt = r.ResolvedAt,
            resolutionNotes = r.ResolutionNotes,
            createdAt = r.CreatedAt,
            updatedAt = r.UpdatedAt,
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
    /// Transition a report's status (Pending → Reviewing → Resolved/Rejected → Closed).
    /// Each transition records who did it + when.
    /// </summary>
    [HttpPut("{reportId:guid}/status")]
    public async Task<IActionResult> TransitionStatus(Guid reportId, [FromBody] TransitionReportStatusRequest body, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Reports, Actions.Edit, ct)) return Forbid();

        var report = await _db.ErrorReports.FirstOrDefaultAsync(r => r.Id == reportId, ct);
        if (report is null) return NotFound(new ProblemDetails
        {
            Title = "Report not found",
            Status = 404,
            Detail = $"No error report with id '{reportId}'",
        });

        // Parse new status
        if (!Enum.TryParse<ErrorReportStatus>(body.Status, true, out var newStatus))
            return BadRequest(new ProblemDetails { Title = "Invalid status", Status = 400, Detail = $"Valid statuses: Pending, Reviewing, Resolved, Rejected, Closed" });

        var previousStatus = report.Status;

        // Validate transition
        if (!IsValidTransition(report.Status, newStatus))
            return BadRequest(new ProblemDetails
            {
                Title = "Invalid transition",
                Status = 400,
                Detail = $"Cannot transition from {report.Status} to {newStatus}. Valid: {string.Join(", ", GetValidTransitions(report.Status))}",
            });

        // Apply transition
        report.Status = newStatus;

        // Reviewing: record who started + when
        if (newStatus == ErrorReportStatus.Reviewing && report.ReviewedBy is null)
        {
            report.ReviewedBy = adminId;
            report.ReviewedAt = DateTime.UtcNow;
        }

        // Assignee update
        if (body.AssignedTo.HasValue)
            report.AssignedTo = body.AssignedTo;

        // Resolved/Rejected: record who resolved + when + notes
        if (newStatus == ErrorReportStatus.Resolved || newStatus == ErrorReportStatus.Rejected)
        {
            report.ResolvedBy = adminId;
            report.ResolvedAt = DateTime.UtcNow;
            if (body.ResolutionNotes is not null)
                report.ResolutionNotes = body.ResolutionNotes;
            // Require resolution notes for Rejected
            if (newStatus == ErrorReportStatus.Rejected && string.IsNullOrWhiteSpace(report.ResolutionNotes))
                return BadRequest(new ProblemDetails { Title = "Resolution notes required", Status = 400, Detail = "Rejection requires a reason in resolutionNotes." });
        }

        // Closed: finalize (no additional fields, just status change)
        if (newStatus == ErrorReportStatus.Closed)
        {
            // Can only close if already Resolved or Rejected
            // (already validated via IsValidTransition)
        }

        await _db.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            studentId: report.StudentId,
            adminId: adminId,
            eventType: SecurityEventType.AdminAction,
            severity: SecuritySeverity.Info,
            description: $"Error report '{reportId}' transitioned from {previousStatus} to {newStatus}" +
                         (body.ResolutionNotes is not null ? $" (notes: {body.ResolutionNotes})" : ""),
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            ct: ct);

        return Ok(new
        {
            id = report.Id,
            status = report.Status.ToString(),
            assignedTo = report.AssignedTo,
            reviewedBy = report.ReviewedBy,
            reviewedAt = report.ReviewedAt,
            resolvedBy = report.ResolvedBy,
            resolvedAt = report.ResolvedAt,
            resolutionNotes = report.ResolutionNotes,
            updatedAt = report.UpdatedAt,
        });
    }

    /// <summary>
    /// Assign a report to a specific admin for review.
    /// </summary>
    [HttpPut("{reportId:guid}/assign")]
    public async Task<IActionResult> Assign(Guid reportId, [FromBody] AssignReportRequest body, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Reports, Actions.Edit, ct)) return Forbid();

        var report = await _db.ErrorReports.FirstOrDefaultAsync(r => r.Id == reportId, ct);
        if (report is null) return NotFound();

        report.AssignedTo = body.AdminId;
        await _db.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            studentId: report.StudentId,
            adminId: adminId,
            eventType: SecurityEventType.AdminAction,
            severity: SecuritySeverity.Info,
            description: $"Error report '{reportId}' assigned to admin '{body.AdminId}'",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            ct: ct);

        return Ok(new { id = report.Id, assignedTo = report.AssignedTo });
    }

    private static bool IsValidTransition(ErrorReportStatus from, ErrorReportStatus to)
    {
        if (from == to) return false;
        return to switch
        {
            ErrorReportStatus.Reviewing => from == ErrorReportStatus.Pending,
            ErrorReportStatus.Resolved => from == ErrorReportStatus.Reviewing || from == ErrorReportStatus.Pending,
            ErrorReportStatus.Rejected => from == ErrorReportStatus.Reviewing || from == ErrorReportStatus.Pending,
            ErrorReportStatus.Closed => from == ErrorReportStatus.Resolved || from == ErrorReportStatus.Rejected,
            _ => false,
        };
    }

    private static string[] GetValidTransitions(ErrorReportStatus from) => from switch
    {
        ErrorReportStatus.Pending => new[] { "Reviewing", "Resolved", "Rejected" },
        ErrorReportStatus.Reviewing => new[] { "Resolved", "Rejected" },
        ErrorReportStatus.Resolved => new[] { "Closed" },
        ErrorReportStatus.Rejected => new[] { "Closed" },
        ErrorReportStatus.Closed => Array.Empty<string>(),
        _ => Array.Empty<string>(),
    };
}

public record TransitionReportStatusRequest(string Status, Guid? AssignedTo = null, string? ResolutionNotes = null);
public record AssignReportRequest(Guid AdminId);
