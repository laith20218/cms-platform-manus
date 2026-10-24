using MediatR;
using CMS.Application.DTOs.Admin;
using CMS.Application.Commands.Dashboard;

namespace CMS.Application.Commands.Admin;

// ===== Push 2 / Track 2: activity-monitor queries (super-admin only) =====

/// <summary>
/// Paginated admin sessions for the activity monitor. Ordered newest-first by CreatedAt.
/// Returns duration metrics, captured device context, and per-session action counters
/// aggregated from AdminActivityLogs.
/// </summary>
public record GetAdminSessionsQuery(
    int Page = 1,
    int PageSize = 20,
    Guid? AdminId = null
) : IRequest<PagedResult<AdminSessionDto>>;

/// <summary>
/// Paginated admin activity logs, filterable by admin and/or acting session.
/// </summary>
public record GetAdminActivityLogsQuery(
    int Page = 1,
    int PageSize = 20,
    Guid? AdminId = null,
    Guid? SessionId = null
) : IRequest<PagedResult<AdminActivityLogDto>>;
