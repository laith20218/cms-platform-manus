using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Notifications;
using CMS.Application.DTOs.Notifications;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Application.Interfaces;

namespace CMS.Application.Handlers.Notifications;

/// <summary>
/// Handles notification queries and management.
/// Supports targeted notifications (student, subject, semester, year, college, university, all).
/// </summary>
public class NotificationHandlers :
    IRequestHandler<GetNotificationsQuery, PagedResult<NotificationListItemDto>>,
    IRequestHandler<GetUnreadCountQuery, int>,
    IRequestHandler<MarkNotificationReadCommand, Unit>,
    IRequestHandler<MarkAllReadCommand, Unit>,
    IRequestHandler<RegisterPushTokenCommand, Unit>,
    IRequestHandler<SendNotificationCommand, SendNotificationResultDto>,
    IRequestHandler<GetNotificationStatsQuery, NotificationStatsDto>,
    IRequestHandler<GetSentNotificationsQuery, PagedResult<NotificationListItemDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ICacheService _cache;

    public NotificationHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork, ICacheService cache)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _cache = cache;
    }

    // ===== Student: Get Notifications =====
    public async Task<PagedResult<NotificationListItemDto>> Handle(GetNotificationsQuery req, CancellationToken ct)
    {
        var query = _db.NotificationDeliveries.AsNoTracking()
            .Include(d => d.Notification)
            .Where(d => d.StudentId == req.StudentId);

        if (req.UnreadOnly)
            query = query.Where(d => d.Status == DeliveryStatus.Delivered || d.Status == DeliveryStatus.Sent);

        var total = await query.CountAsync(ct);
        var deliveries = await query
            .OrderByDescending(d => d.CreatedAt)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);

        var items = deliveries.Select(d => new NotificationListItemDto(
            d.Notification.Id,
            d.Notification.Type.ToString(),
            d.Notification.Title,
            d.Notification.Body,
            d.Notification.Icon,
            d.Notification.ActionUrl,
            d.Notification.ActionLabel,
            d.Notification.CreatedAt,
            d.Status == DeliveryStatus.Read || d.Status == DeliveryStatus.Clicked
        )).ToList();

        return new PagedResult<NotificationListItemDto>(items, total, req.Page, req.PageSize, (int)Math.Ceiling(total / (double)req.PageSize));
    }

    public async Task<int> Handle(GetUnreadCountQuery req, CancellationToken ct)
    {
        // Try cache first
        var cacheKey = $"unread:{req.StudentId}";
        var cached = await _cache.GetAsync<int?>(cacheKey, ct);
        if (cached.HasValue) return cached.Value;

        var count = await _db.NotificationDeliveries
            .CountAsync(d => d.StudentId == req.StudentId &&
                (d.Status == DeliveryStatus.Sent || d.Status == DeliveryStatus.Delivered), ct);

        await _cache.SetAsync(cacheKey, count, TimeSpan.FromMinutes(1), ct);
        return count;
    }

    // ===== Student: Mark as Read =====
    public async Task<Unit> Handle(MarkNotificationReadCommand req, CancellationToken ct)
    {
        var delivery = await _db.NotificationDeliveries
            .FirstOrDefaultAsync(d => d.NotificationId == req.NotificationId && d.StudentId == req.StudentId, ct)
            ?? throw new NotFoundException("NotificationDelivery", req.NotificationId);

        typeof(NotificationDelivery).GetProperty("ReadAt")?.SetValue(delivery, DateTime.UtcNow);
        typeof(NotificationDelivery).GetProperty("Status")?.SetValue(delivery, DeliveryStatus.Read);

        await _unitOfWork.SaveChangesAsync(ct);

        // Invalidate unread cache
        await _cache.RemoveAsync($"unread:{req.StudentId}", ct);

        return Unit.Value;
    }

    public async Task<Unit> Handle(MarkAllReadCommand req, CancellationToken ct)
    {
        var unreadDeliveries = await _db.NotificationDeliveries
            .Where(d => d.StudentId == req.StudentId &&
                (d.Status == DeliveryStatus.Sent || d.Status == DeliveryStatus.Delivered))
            .ToListAsync(ct);

        foreach (var delivery in unreadDeliveries)
        {
            typeof(NotificationDelivery).GetProperty("ReadAt")?.SetValue(delivery, DateTime.UtcNow);
            typeof(NotificationDelivery).GetProperty("Status")?.SetValue(delivery, DeliveryStatus.Read);
        }

        await _unitOfWork.SaveChangesAsync(ct);
        await _cache.RemoveAsync($"unread:{req.StudentId}", ct);

        return Unit.Value;
    }

    // ===== Student: Register Push Token =====
    public async Task<Unit> Handle(RegisterPushTokenCommand req, CancellationToken ct)
    {
        // Store push token in cache (keyed by student ID)
        // In production, this would be stored in a dedicated table or Firebase
        var cacheKey = $"push-token:{req.StudentId}";
        await _cache.SetAsync(cacheKey, new { req.Token, req.Platform }, TimeSpan.FromDays(30), ct);

        return Unit.Value;
    }

    // ===== Admin: Send Notification =====
    public async Task<SendNotificationResultDto> Handle(SendNotificationCommand req, CancellationToken ct)
    {
        var notificationType = Enum.Parse<NotificationType>(req.Type, true);
        var targetType = Enum.Parse<TargetType>(req.TargetType, true);
        var isScheduled = req.ScheduledAt.HasValue && req.ScheduledAt > DateTime.UtcNow;

        // Create notification record
        var notification = new Notification
        {
            Type = notificationType,
            Title = req.Title,
            Body = req.Body,
            Icon = req.Icon,
            ActionUrl = req.ActionUrl,
            ActionLabel = req.ActionLabel,
            TargetType = targetType,
            TargetId = req.TargetId,
            ScheduledAt = req.ScheduledAt,
            Status = isScheduled ? "scheduled" : "sending",
            SentBy = req.SentBy
        };

        typeof(Notification).GetProperty("SentBy")?.SetValue(notification, req.SentBy);

        await _db.Notifications.AddAsync(notification, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        if (isScheduled)
        {
            // TODO: Schedule via Hangfire
            return new SendNotificationResultDto(notification.Id, 0, true, req.ScheduledAt);
        }

        // Find target students
        var targetStudents = await GetTargetStudentsAsync(targetType, req.TargetId, ct);
        var recipientsCount = targetStudents.Count;

        // Create delivery records
        var deliveries = targetStudents.Select(studentId => new NotificationDelivery
        {
            NotificationId = notification.Id,
            StudentId = studentId,
            Channel = NotificationChannel.InApp,
            Status = DeliveryStatus.Sent,
            SentAt = DateTime.UtcNow,
            DeliveredAt = DateTime.UtcNow
        }).ToList();

        await _db.NotificationDeliveries.AddRangeAsync(deliveries, ct);

        // Update notification status
        typeof(Notification).GetProperty("SentAt")?.SetValue(notification, DateTime.UtcNow);
        typeof(Notification).GetProperty("Status")?.SetValue(notification, "sent");

        await _unitOfWork.SaveChangesAsync(ct);

        // Invalidate unread cache for all recipients
        foreach (var studentId in targetStudents)
        {
            await _cache.RemoveAsync($"unread:{studentId}", ct);
        }

        // TODO: Send push notifications via FCM
        // For now, in-app notifications are sufficient

        return new SendNotificationResultDto(notification.Id, recipientsCount, false, null);
    }

    // ===== Admin: Get Notification Stats =====
    public async Task<NotificationStatsDto> Handle(GetNotificationStatsQuery req, CancellationToken ct)
    {
        var notification = await _db.Notifications.AsNoTracking()
            .FirstOrDefaultAsync(n => n.Id == req.NotificationId, ct)
            ?? throw new NotFoundException("Notification", req.NotificationId);

        var deliveries = await _db.NotificationDeliveries.AsNoTracking()
            .Where(d => d.NotificationId == req.NotificationId)
            .ToListAsync(ct);

        return new NotificationStatsDto(
            notification.Id,
            notification.Title,
            deliveries.Count,
            deliveries.Count(d => d.Status != DeliveryStatus.Pending),
            deliveries.Count(d => d.DeliveredAt.HasValue),
            deliveries.Count(d => d.ReadAt.HasValue),
            deliveries.Count(d => d.ClickedAt.HasValue),
            deliveries.Count(d => d.Status == DeliveryStatus.Failed),
            notification.SentAt ?? DateTime.UtcNow
        );
    }

    // ===== Admin: Get Sent Notifications =====
    public async Task<PagedResult<NotificationListItemDto>> Handle(GetSentNotificationsQuery req, CancellationToken ct)
    {
        var query = _db.Notifications.AsNoTracking()
            .Where(n => n.Status != "draft")
            .OrderByDescending(n => n.CreatedAt);

        var total = await query.CountAsync(ct);
        var notifications = await query
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .ToListAsync(ct);

        var items = notifications.Select(n => new NotificationListItemDto(
            n.Id, n.Type.ToString(), n.Title, n.Body,
            n.Icon, n.ActionUrl, n.ActionLabel,
            n.CreatedAt, false
        )).ToList();

        return new PagedResult<NotificationListItemDto>(items, total, req.Page, req.PageSize, (int)Math.Ceiling(total / (double)req.PageSize));
    }

    // ===== Helper: Get Target Students =====
    private async Task<List<Guid>> GetTargetStudentsAsync(TargetType targetType, Guid? targetId, CancellationToken ct)
    {
        var query = _db.Students.AsNoTracking().Where(s => s.DeletedAt == null && s.Status == StudentStatus.Active);

        query = targetType switch
        {
            TargetType.Student => targetId.HasValue ? query.Where(s => s.Id == targetId.Value) : query,
            TargetType.Subject => targetId.HasValue
                ? query.Where(s => s.Subscriptions.Any(sub => sub.ScopeSubjectId == targetId.Value && sub.Status == SubscriptionStatus.Active))
                : query,
            TargetType.Semester => targetId.HasValue
                ? query.Where(s => s.Subscriptions.Any(sub => sub.ScopeCollegeId != null)) // Simplified
                : query,
            TargetType.Year => targetId.HasValue
                ? query.Where(s => s.AcademicYearId == targetId.Value)
                : query,
            TargetType.College => targetId.HasValue
                ? query.Where(s => s.CollegeId == targetId.Value)
                : query,
            TargetType.University => targetId.HasValue
                ? query.Where(s => s.UniversityId == targetId.Value)
                : query,
            TargetType.All => query,
            _ => query
        };

        return await query.Select(s => s.Id).ToListAsync(ct);
    }
}
