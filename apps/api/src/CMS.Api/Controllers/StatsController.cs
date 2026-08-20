using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMS.Application.Commands.Stats;

namespace CMS.Api.Controllers;

/// <summary>
/// Statistics controller - provides student stats, leaderboard, and global analytics.
/// </summary>
[ApiController]
[Route("api/v1/stats")]
public class StatsController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    public StatsController(MediatR.ISender mediator) => _mediator = mediator;

    private Guid GetStudentId() => Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : throw new UnauthorizedAccessException();

    /// <summary>
    /// Get current student's detailed statistics.
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> GetMyStats([FromQuery] string period = "all", CancellationToken ct = default)
    {
        var result = await _mediator.Send(new GetStudentStatsQuery(GetStudentId(), period), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get leaderboard (by subject, year, or college).
    /// Based on first attempts only.
    /// </summary>
    [HttpGet("leaderboard")]
    [Authorize]
    public async Task<IActionResult> GetLeaderboard(
        [FromQuery] string scope = "all",
        [FromQuery] Guid? scopeId = null,
        [FromQuery] string period = "all",
        [FromQuery] int count = 100,
        CancellationToken ct = default)
    {
        var result = await _mediator.Send(new GetLeaderboardQuery(scope, scopeId, GetStudentId(), period, count), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get global platform statistics (admin only).
    /// </summary>
    [HttpGet("global")]
    [Authorize(Roles = "admin,super_admin")]
    public async Task<IActionResult> GetGlobalStats(CancellationToken ct)
    {
        var result = await _mediator.Send(new GetGlobalStatsQuery(), ct);
        return Ok(result);
    }
}
