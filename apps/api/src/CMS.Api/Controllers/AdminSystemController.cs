using System.Security.Claims;
using CMS.Application.Commands.Maintenance;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace CMS.Api.Controllers;

/// <summary>
/// Command Center P1 — system-maintenance endpoints (SuperAdmin only, re-auth'd).
///
/// POST /api/v1/admin/system/wipe
///   Module-scoped bulk deletion for demo/dummy data. dryRun=true previews the exact
///   per-table row counts; a real run requires the typed confirmation "DELETE"/"حذف"
///   and the acting admin's password. One transaction, children-first FK-safe order,
///   audit-logged as a Critical security event.
///
/// POST /api/v1/admin/system/hard-delete
///   Physical deletion of a single entity (bypasses soft-delete). When cross-domain
///   dependents exist and cascade=false the request FAILS LOUDLY with the child counts;
///   cascade=true deletes the subtree children-first. Audit-logged as Critical.
///
/// Both are gated by the SuperAdmin policy INDEPENDENT of the permission matrix:
/// system-level destructors cannot be delegated via roles.
///
/// PR-1: the controller carries the strict "danger-zone" rate-limit policy (the
/// endpoints run Argon2 re-authentication on every call — a flood must hit 429, not
/// the CPU) and exposes the read-only hard-delete flag state for the Danger Zone UI.
/// The flag itself is enforced inside SystemMaintenanceHandlers — this surface is
/// cosmetic only.
/// </summary>
[ApiController]
[Route("api/v1/admin/system")]
[Authorize(Policy = "SuperAdmin")]
[EnableRateLimiting("danger-zone")]
public sealed class AdminSystemController : ControllerBase
{
    private readonly ISender _mediator;
    private readonly IConfiguration _configuration;

    public AdminSystemController(ISender mediator, IConfiguration configuration)
    {
        _mediator = mediator;
        _configuration = configuration;
    }

    /// <summary>Preview (dryRun) or execute a module data wipe.</summary>
    [HttpPost("wipe")]
    [ProducesResponseType(typeof(WipeResultDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<WipeResultDto>> Wipe([FromBody] WipeDataRequestDto dto, CancellationToken ct)
        => Ok(await _mediator.Send(
            new WipeDataCommand(GetAdminId(), dto.Module, dto.ConfirmText, dto.ActorPassword, dto.DryRun), ct));

    /// <summary>Hard-delete one entity, optionally cascading its dependents.</summary>
    [HttpPost("hard-delete")]
    [ProducesResponseType(typeof(HardDeleteResultDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<HardDeleteResultDto>> HardDelete([FromBody] HardDeleteRequestDto dto, CancellationToken ct)
        => Ok(await _mediator.Send(
            new HardDeleteCommand(GetAdminId(), dto.Module, dto.TargetId, dto.ActorPassword, dto.Cascade), ct));

    /// <summary>
    /// PR-1: read-only mirror of the backend hard-delete flag for the Danger Zone UI.
    /// The authoritative enforcement lives in SystemMaintenanceHandlers — this merely
    /// lets the UI show an honest "disabled in this environment" state instead of
    /// letting an admin type a password only to receive HARD_DELETE_DISABLED.
    /// </summary>
    [HttpGet("hard-delete/status")]
    [ProducesResponseType(typeof(HardDeleteStatusDto), StatusCodes.Status200OK)]
    public ActionResult<HardDeleteStatusDto> HardDeleteStatus()
        => Ok(new HardDeleteStatusDto(SystemMaintenanceHandlers.IsHardDeleteEnabled(_configuration)));

    private Guid GetAdminId()
    {
        var value = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(value, out var adminId) ? adminId : throw new UnauthorizedAccessException();
    }
}

/// <summary>Request body for POST /api/v1/admin/system/wipe.</summary>
public sealed record WipeDataRequestDto(string Module, string ConfirmText, string ActorPassword, bool DryRun);

/// <summary>Request body for POST /api/v1/admin/system/hard-delete.</summary>
public sealed record HardDeleteRequestDto(string Module, Guid TargetId, string ActorPassword, bool Cascade);

/// <summary>PR-1: backend hard-delete flag state (read-only mirror for the UI).</summary>
public sealed record HardDeleteStatusDto(bool Enabled);
