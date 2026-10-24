using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMS.Application.Commands.Admin;
using CMS.Application.Commands.Dashboard;
using CMS.Application.DTOs.Admin;

namespace CMS.Api.Controllers;

/// <summary>
/// Push 2 / Track 2: super-admin activity monitor — enriched admin sessions and the
/// administrative action log (questions created, files uploaded, codes generated).
/// </summary>
[ApiController]
[Route("api/v1/admin/activity")]
[Authorize(Roles = "super_admin")]
public sealed class AdminActivityController : ControllerBase
{
    private readonly ISender _mediator;

    public AdminActivityController(ISender mediator) => _mediator = mediator;

    /// <summary>
    /// Paginated admin sessions with duration, device context, and per-session action counters.
    /// </summary>
    [HttpGet("sessions")]
    [ProducesResponseType(typeof(PagedResult<AdminSessionDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<AdminSessionDto>>> GetSessions(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] Guid? adminId = null,
        CancellationToken ct = default)
        => Ok(await _mediator.Send(new GetAdminSessionsQuery(page, pageSize, adminId), ct));

    /// <summary>
    /// Paginated activity logs, filterable by admin and/or acting session.
    /// </summary>
    [HttpGet("logs")]
    [ProducesResponseType(typeof(PagedResult<AdminActivityLogDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<AdminActivityLogDto>>> GetLogs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] Guid? adminId = null,
        [FromQuery] Guid? sessionId = null,
        CancellationToken ct = default)
        => Ok(await _mediator.Send(new GetAdminActivityLogsQuery(page, pageSize, adminId, sessionId), ct));
}
