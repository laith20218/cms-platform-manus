using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Admin;
using CMS.Application.DTOs.Auth;
using CMS.Application.Handlers.Admin;
using CMS.Application.Interfaces;
using CMS.Api.Security;

namespace CMS.Api.Controllers;

/// <summary>
/// Admin authentication controller - handles admin login, 2FA, and permissions.
/// </summary>
[ApiController]
[Route("api/v1/auth/admin")]
public class AdminAuthController : ControllerBase
{
    private readonly ISender _mediator;
    private readonly AdminLoginRateLimiter _loginRateLimiter;

    public AdminAuthController(ISender mediator, AdminLoginRateLimiter loginRateLimiter)
    {
        _mediator = mediator;
        _loginRateLimiter = loginRateLimiter;
    }

    /// <summary>
    /// Login as admin (with optional 2FA). Rate limited per IP and per normalized e-mail.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<ActionResult<AuthResponse>> Login(
        [FromBody] AdminLoginRequest request, CancellationToken ct)
    {
        var verdict = _loginRateLimiter.Acquire(
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            request.Email);
        if (!verdict.Allowed)
        {
            Response.Headers.RetryAfter = verdict.RetryAfterSeconds.ToString();
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                error = "TOO_MANY_ATTEMPTS",
                message = "تم تجاوز الحد المسموح من محاولات الدخول. حاول مجدداً بعد قليل."
            });
        }

        var result = await _mediator.Send(new AdminLoginCommand(
            request.Email, request.Password, request.TwoFactorCode, request.InstallationId,
            // Push 2 / Track 2: captured here (not via IHttpContextAccessor) and persisted
            // onto the created UserSession for the activity monitor. After Fix-3 this is the
            // real client IP behind Render's proxy.
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            Request.Headers.UserAgent.ToString()), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get current admin's classic permission grants.
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
    /// Push 3 / Track 3: current admin's UI-permission envelope (mode / isSuperAdmin /
    /// registryVersion / allKeys / allowedKeys). allKeys always carries the full registry
    /// so admin-web can detect drift between its mirror and the backend registry.
    /// 503 UI_PERMISSIONS_UNAVAILABLE when both the cache and the database are unavailable.
    /// </summary>
    [HttpGet("me/ui-permissions")]
    [Authorize(Roles = "admin,super_admin")]
    [ProducesResponseType(typeof(MyUiPermissionsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<MyUiPermissionsDto>> GetMyUiPermissions(CancellationToken ct)
    {
        var adminId = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(adminId)) return Unauthorized();

        var result = await _mediator.Send(new GetMyUiPermissionsQuery(Guid.Parse(adminId)), ct);
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
