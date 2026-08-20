namespace CMS.Application.DTOs.Notifications;

// ===== Notification DTOs =====
public record NotificationDto(
    Guid Id,
    string Type,            // announcement, subscription_alert, new_content, security, message, achievement
    string Title,
    string Body,
    string? Icon,
    string? ActionUrl,
    string? ActionLabel,
    DateTime CreatedAt,
    bool IsRead,
    DateTime? ReadAt
);

public record NotificationListItemDto(
    Guid Id,
    string Type,
    string Title,
    string Body,
    string? Icon,
    string? ActionUrl,
    string? ActionLabel,
    DateTime CreatedAt,
    bool IsRead
);

// ===== Admin: Send Notification =====
public record SendNotificationDto(
    string Type,
    string Title,
    string Body,
    string? Icon,
    string? ActionUrl,
    string? ActionLabel,
    string TargetType,       // student, subject, semester, year, college, university, all
    Guid? TargetId,          // null for "all"
    DateTime? ScheduledAt    // null for immediate
);

public record SendNotificationResultDto(
    Guid NotificationId,
    int RecipientsCount,
    bool IsScheduled,
    DateTime? ScheduledFor
);

// ===== Admin: Notification Stats =====
public record NotificationStatsDto(
    Guid NotificationId,
    string Title,
    int TotalRecipients,
    int SentCount,
    int DeliveredCount,
    int ReadCount,
    int ClickedCount,
    int FailedCount,
    DateTime SentAt
);

// ===== Push Token Registration =====
public record RegisterPushTokenDto(
    string Token,
    string Platform         // web, ios, android
);
