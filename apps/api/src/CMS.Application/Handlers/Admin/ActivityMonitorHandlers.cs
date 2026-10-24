using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Admin;
using CMS.Application.Commands.Dashboard;
using CMS.Application.DTOs.Admin;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;

namespace CMS.Application.Handlers.Admin;

/// <summary>
/// Push 2 / Track 2: read side of the admin activity monitor (super-admin only —
/// authorization is enforced at the controller). Joins sessions/logs with the admin
/// directory and aggregates per-session action counters from the activity logs.
/// </summary>
public class ActivityMonitorHandlers :
    IRequestHandler<GetAdminSessionsQuery, PagedResult<AdminSessionDto>>,
    IRequestHandler<GetAdminActivityLogsQuery, PagedResult<AdminActivityLogDto>>
{
    private readonly IApplicationDbContext _db;

    public ActivityMonitorHandlers(IApplicationDbContext db) => _db = db;

    public async Task<PagedResult<AdminSessionDto>> Handle(GetAdminSessionsQuery req, CancellationToken ct)
    {
        var page = Math.Max(req.Page, 1);
        var pageSize = Math.Clamp(req.PageSize, 1, 100);
        var now = DateTime.UtcNow;

        var query = from s in _db.UserSessions.AsNoTracking()
                    join a in _db.Admins.AsNoTracking() on s.UserId equals a.Id into admins
                    from a in admins.DefaultIfEmpty()
                    where s.Role != "student"
                    where req.AdminId == null || s.UserId == req.AdminId
                    orderby s.CreatedAt descending
                    select new { s, AdminName = a != null ? a.FullName : null };

        var total = await query.CountAsync(ct);
        var rows = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        // Per-session action counters, aggregated for exactly the page being rendered.
        var sessionIds = rows.Select(r => r.s.Id).ToList();
        var counters = await _db.AdminActivityLogs.AsNoTracking()
            .Where(l => l.SessionId != null && sessionIds.Contains(l.SessionId.Value))
            .GroupBy(l => new { l.SessionId, l.ActionType })
            .Select(g => new { g.Key.SessionId, g.Key.ActionType, Count = g.Count() })
            .ToListAsync(ct);

        var items = rows.Select(r =>
        {
            var counts = counters.Where(c => c.SessionId == r.s.Id).ToList();
            return new AdminSessionDto(
                r.s.Id,
                r.s.UserId,
                r.AdminName ?? "—",
                r.s.Role,
                r.s.CreatedAt,
                r.s.LastActivityAt,
                r.s.ClosedAt,
                Math.Max((int)((r.s.ClosedAt ?? now) - r.s.CreatedAt).TotalMinutes, 0),
                r.s.IpAddress,
                r.s.UserAgent,
                r.s.DeviceDetails,
                // counts is one row per (session, action) GROUP — sum the group sizes.
                QuestionsCount: counts.Where(c => c.ActionType == AdminActivityActionType.CreateQuestion).Sum(c => c.Count),
                FilesCount: counts.Where(c => c.ActionType == AdminActivityActionType.UploadFile).Sum(c => c.Count),
                CodesCount: counts.Where(c => c.ActionType == AdminActivityActionType.GenerateCode).Sum(c => c.Count)
            );
        }).ToList();

        return new PagedResult<AdminSessionDto>(items, total, page, pageSize,
            (int)Math.Ceiling(total / (double)pageSize));
    }

    public async Task<PagedResult<AdminActivityLogDto>> Handle(GetAdminActivityLogsQuery req, CancellationToken ct)
    {
        var page = Math.Max(req.Page, 1);
        var pageSize = Math.Clamp(req.PageSize, 1, 100);

        var query = from l in _db.AdminActivityLogs.AsNoTracking()
                    join a in _db.Admins.AsNoTracking() on l.AdminId equals a.Id into admins
                    from a in admins.DefaultIfEmpty()
                    where req.AdminId == null || l.AdminId == req.AdminId
                    where req.SessionId == null || l.SessionId == req.SessionId
                    orderby l.CreatedAt descending
                    select new AdminActivityLogDto(
                        l.Id,
                        l.AdminId,
                        a != null ? a.FullName : "—",
                        l.ActionType.ToString(),
                        l.ResourceId,
                        l.Metadata,
                        l.SessionId,
                        l.CreatedAt);

        var total = await query.CountAsync(ct);
        var items = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        return new PagedResult<AdminActivityLogDto>(items, total, page, pageSize,
            (int)Math.Ceiling(total / (double)pageSize));
    }
}
