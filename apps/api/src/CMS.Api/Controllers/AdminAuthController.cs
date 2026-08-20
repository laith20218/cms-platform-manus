using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Admin;
using CMS.Application.DTOs.Auth;
using CMS.Application.Interfaces;

namespace CMS.Api.Controllers;

/// <summary>
/// Admin authentication controller - handles admin login, 2FA, and permissions.
/// </summary>
[ApiController]
[Route("api/v1/auth/admin")]
public class AdminAuthController : ControllerBase
{
    private readonly ISender _mediator;

    public AdminAuthController(ISender mediator) => _mediator = mediator;

    /// <summary>
    /// Login as admin (with optional 2FA).
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<AuthResponse>> Login(
        [FromBody] AdminLoginRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new AdminLoginCommand(
            request.Email, request.Password, request.TwoFactorCode, request.InstallationId
        ), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get current admin's permissions.
    /// </summary>
    [HttpGet("me/permissions")]
    [Authorize(Roles = "admin,super_admin")]
    [ProducesResponseType(typeof(List<PermissionDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<List<PermissionDto>>> GetMyPermissions(CancellationToken ct)
    {
        var adminId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(adminId)) return Unauthorized();

        var result = await _mediator.Send(new GetMyPermissionsQuery(Guid.Parse(adminId)), ct);
        return Ok(result);
    }

    /// <summary>
    /// Enable 2FA for current admin.
    /// </summary>
    [HttpPost("2fa/enable")]
    [Authorize(Roles = "admin,super_admin")]
    [ProducesResponseType(typeof(Enable2FAResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<Enable2FAResponse>> Enable2FA(CancellationToken ct)
    {
        var adminId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(adminId)) return Unauthorized();

        var result = await _mediator.Send(new Enable2FACommand(Guid.Parse(adminId)), ct);
        return Ok(result);
    }

    /// <summary>
    /// Disable 2FA for current admin.
    /// </summary>
    [HttpPost("2fa/disable")]
    [Authorize(Roles = "admin,super_admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Disable2FA(
        [FromBody] Disable2FARequest request, CancellationToken ct)
    {
        var adminId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(adminId)) return Unauthorized();

        await _mediator.Send(new Disable2FACommand(Guid.Parse(adminId), request.Password), ct);
        return NoContent();
    }
}

/// <summary>
/// Request to disable 2FA.
/// </summary>
public record Disable2FARequest(string Password);
