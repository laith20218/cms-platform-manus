using System.Security.Claims;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CMS.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/entitlements")]
[EnableRateLimiting("auth")]
public sealed class EntitlementsController : ControllerBase
{
    private readonly ISignedEntitlementService _signedEntitlements;

    public EntitlementsController(ISignedEntitlementService signedEntitlements) => _signedEntitlements = signedEntitlements;

    [HttpPost("issue")]
    [ProducesResponseType(typeof(EntitlementTokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public Task<ActionResult<EntitlementTokenResponse>> Issue(CancellationToken ct) => IssueCore(ct);

    [HttpPost("renew")]
    [ProducesResponseType(typeof(EntitlementTokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public Task<ActionResult<EntitlementTokenResponse>> Renew(CancellationToken ct) => IssueCore(ct);

    private async Task<ActionResult<EntitlementTokenResponse>> IssueCore(CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(userId, out var studentId))
            return Unauthorized();

        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(installationId))
            return Unauthorized();

        try
        {
            var token = await _signedEntitlements.IssueAsync(studentId, installationId, ct);
            return Ok(new EntitlementTokenResponse(token));
        }
        catch (UnauthorizedAccessException)
        {
            return Unauthorized();
        }
    }
}

public sealed record EntitlementTokenResponse(string Token);
