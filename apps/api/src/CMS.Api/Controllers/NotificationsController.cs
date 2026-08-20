using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Notifications;
using CMS.Application.DTOs.Notifications;
using CMS.Application.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

/// <summary>
/// Notifications controller - handles in-app notifications, push tokens, and admin sending.
/// </summary>
[ApiController]
[Route("api/v1/notifications")]
public class NotificationsController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly IPermissionService _permissions;

    public NotificationsController(MediatR.ISender mediator, IPermissionService permissions)
    {
        _mediator = mediator;
        _permissions = permissions;
    }

    private Guid GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : throw new UnauthorizedAccessException();
    private Guid GetAdminId() => Guid.Parse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value!);

    /// <summary>
    /// Get student's notifications (paginated, optional unread filter).
    /// </summary>
    [HttpGet]
    [Authorize]
    public async Task<ActionResult<PagedResult<NotificationListItemDto>>> GetNotifications(
        [FromQuery] bool unreadOnly = false,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new GetNotificationsQuery(GetStudentId(), unreadOnly, page, pageSize), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get unread notification count.
    /// </summary>
    [HttpGet("unread-count")]
    [Authorize]
    public async Task<ActionResult<int>> GetUnreadCount(CancellationToken ct)
    {
        var count = await _mediator.Send(new GetUnreadCountQuery(GetStudentId()), ct);
        return Ok(count);
    }

    /// <summary>
    /// Mark a single notification as read.
    /// </summary>
    [HttpPatch("{id:guid}/read")]
    [Authorize]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct)
    {
        await _mediator.Send(new MarkNotificationReadCommand(id, GetStudentId()), ct);
        return NoContent();
    }

    /// <summary>
    /// Mark all notifications as read.
    /// </summary>
    [HttpPost("mark-all-read")]
    [Authorize]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
    {
        await _mediator.Send(new MarkAllReadCommand(GetStudentId()), ct);
        return NoContent();
    }

    /// <summary>
    /// Register a push notification token (web/ios/android).
    /// </summary>
    [HttpPost("push-token")]
    [Authorize]
    public async Task<IActionResult> RegisterPushToken([FromBody] RegisterPushTokenDto dto, CancellationToken ct)
    {
        await _mediator.Send(new RegisterPushTokenCommand(GetStudentId(), dto.Token, dto.Platform), ct);
        return NoContent();
    }

    private async Task<bool> CanTargetAsync(string action, string targetType, Guid? targetId, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Notifications, action, ct)) return false;
        var normalized = targetType.Trim().ToLowerInvariant();
        if (normalized == "all") return (await _permissions.GetScopeAsync(adminId, ct))?.IsSuperAdmin == true;
        if (!targetId.HasValue) return false;
        var entityType = normalized switch
        {
            "student" => "student",
            "subject" => "subject",
            "semester" => "semester",
            "year" => "year",
            "college" => "college",
            "university" => "university",
            _ => null
        };
        return entityType is not null && await _permissions.IsInScopeAsync(adminId, entityType, targetId.Value, ct);
    }

    // ===== Admin Endpoints =====

    /// <summary>
    /// Send a notification to targeted audience (admin only).
    /// </summary>
    [HttpPost("send")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<SendNotificationResultDto>> SendNotification(
        [FromBody] SendNotificationDto dto, CancellationToken ct)
    {
        if (!await CanTargetAsync(Actions.Create, dto.TargetType, dto.TargetId, ct)) return Forbid();
        var result = await _mediator.Send(new SendNotificationCommand(
            dto.Type, dto.Title, dto.Body,
            dto.Icon, dto.ActionUrl, dto.ActionLabel,
            dto.TargetType, dto.TargetId,
            dto.ScheduledAt, GetAdminId()
        ), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get delivery stats for a sent notification (admin only).
    /// </summary>
    [HttpGet("{id:guid}/stats")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<NotificationStatsDto>> GetStats(Guid id, CancellationToken ct)
    {
        var db = HttpContext.RequestServices.GetRequiredService<IApplicationDbContext>();
        var target = await db.Notifications.AsNoTracking()
            .Where(notification => notification.Id == id)
            .Select(notification => new { TargetType = notification.TargetType.ToString(), notification.TargetId })
            .FirstOrDefaultAsync(ct);
        if (target is null || !await CanTargetAsync(Actions.View, target.TargetType, target.TargetId, ct)) return Forbid();
        var result = await _mediator.Send(new GetNotificationStatsQuery(id), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get list of sent notifications (admin only).
    /// </summary>
    [HttpGet("sent")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<ActionResult<PagedResult<NotificationListItemDto>>> GetSentNotifications(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Notifications, Actions.View, ct)
            || (await _permissions.GetScopeAsync(adminId, ct))?.IsSuperAdmin != true) return Forbid();
        var result = await _mediator.Send(new GetSentNotificationsQuery(page, pageSize), ct);
        return Ok(result);
    }
}
