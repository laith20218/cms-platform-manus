using System.Security.Claims;
using CMS.Application.Commands.Maintenance;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

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
/// </summary>
[ApiController]
[Route("api/v1/admin/system")]
[Authorize(Policy = "SuperAdmin")]
public sealed class AdminSystemController : ControllerBase
{
    private readonly ISender _mediator;

    public AdminSystemController(ISender mediator)
    {
        _mediator = mediator;
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
