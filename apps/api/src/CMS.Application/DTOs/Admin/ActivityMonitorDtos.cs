namespace CMS.Application.DTOs.Admin;

// ===== Push 2 / Track 2: activity-monitor DTOs =====

/// <summary>One enriched admin session row for the monitor (super-admin only).</summary>
public record AdminSessionDto(
    Guid Id,
    Guid AdminId,
    string AdminName,
    string Role,
    DateTime StartedAt,
    DateTime LastActivityAt,
    DateTime? ClosedAt,
    /// <summary>Minutes between StartedAt and (ClosedAt ?? now), rounded down — 0 minimum.</summary>
    int DurationMinutes,
    string? IPAddress,
    string? UserAgent,
    /// <summary>Parsed device summary JSON (browser / os / deviceType) as stored at login.</summary>
    string? DeviceDetails,
    int QuestionsCount,
    int FilesCount,
    int CodesCount
);

/// <summary>One activity-log row for the monitor (super-admin only).</summary>
public record AdminActivityLogDto(
    Guid Id,
    Guid AdminId,
    string AdminName,
    string ActionType,
    string? ResourceId,
    string Metadata,
    Guid? SessionId,
    DateTime CreatedAt
);
