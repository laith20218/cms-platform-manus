using System.Security.Claims;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.Api.Controllers;

[ApiController]
[Route("api/v1/security/play-integrity")]
[Authorize(Roles = "student")]
public sealed class PlayIntegrityController : ControllerBase
{
    private readonly IPlayIntegrityService _playIntegrity;

    public PlayIntegrityController(IPlayIntegrityService playIntegrity) => _playIntegrity = playIntegrity;

    /// <summary>
    /// Verifies a fresh, operation-bound Play Integrity token. The default provider fails closed until Google Play
    /// Console, a server-side verifier, and replay protection are configured.
    /// </summary>
    [HttpPost("verify")]
    [ProducesResponseType(typeof(PlayIntegrityVerificationResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(PlayIntegrityVerificationResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(PlayIntegrityVerificationResponse), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PlayIntegrityVerificationResponse>> Verify(
        [FromBody] PlayIntegrityVerificationRequest request,
        CancellationToken ct)
    {
        var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault();
        if (!Guid.TryParse(subject, out var studentId) || !IsBase64Url(request.RequestHash) ||
            string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(installationId))
            return BadRequest(new PlayIntegrityVerificationResponse(false, "invalid_request", null));

        var result = await _playIntegrity.VerifyAsync(
            request,
            new PlayIntegrityVerificationContext(studentId, installationId),
            ct);

        var response = new PlayIntegrityVerificationResponse(result.IsAccepted, result.Decision, result.ValidUntil);
        return result.IsAccepted ? Ok(response) : StatusCode(StatusCodes.Status403Forbidden, response);
    }

    private static bool IsBase64Url(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length is >= 16 and <= 512 &&
        value.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_');
}

public sealed record PlayIntegrityVerificationResponse(bool Accepted, string Decision, DateTimeOffset? ValidUntil);
