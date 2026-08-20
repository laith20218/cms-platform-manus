using MediatR;
using CMS.Application.DTOs.Notifications;

namespace CMS.Application.Commands.Notifications;

// ===== Student: Get Notifications =====
public record GetNotificationsQuery(
    Guid StudentId,
    bool UnreadOnly = false,
    int Page = 1,
    int PageSize = 20
) : IRequest<PagedResult<NotificationListItemDto>>;

public record GetUnreadCountQuery(Guid StudentId) : IRequest<int>;

// ===== Student: Mark as Read =====
public record MarkNotificationReadCommand(Guid NotificationId, Guid StudentId) : IRequest<Unit>;
public record MarkAllReadCommand(Guid StudentId) : IRequest<Unit>;

// ===== Student: Register Push Token =====
public record RegisterPushTokenCommand(Guid StudentId, string Token, string Platform) : IRequest<Unit>;

// ===== Admin: Send Notification =====
public record SendNotificationCommand(
    string Type, string Title, string Body,
    string? Icon, string? ActionUrl, string? ActionLabel,
    string TargetType, Guid? TargetId,
    DateTime? ScheduledAt, Guid SentBy
) : IRequest<SendNotificationResultDto>;

// ===== Admin: Get Notification Stats =====
public record GetNotificationStatsQuery(Guid NotificationId) : IRequest<NotificationStatsDto>;

// ===== Admin: Get Sent Notifications =====
public record GetSentNotificationsQuery(int Page = 1, int PageSize = 20) : IRequest<PagedResult<NotificationListItemDto>>;

// ===== Paged Result =====
public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);
