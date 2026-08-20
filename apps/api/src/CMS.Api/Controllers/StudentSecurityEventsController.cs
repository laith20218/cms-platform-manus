using System.Net;
using System.Security.Claims;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CMS.Api.Controllers;

/// <summary>
/// Receives a deliberately narrow set of best-effort browser protection signals.
/// These signals are advisory only; the server derives the durable audit fields
/// and never accepts arbitrary severity or description text from the client.
/// </summary>
[ApiController]
[Route("api/v1/security/events")]
[Authorize(Roles = "student")]
[EnableRateLimiting("security-events")]
public sealed class StudentSecurityEventsController : ControllerBase
{
    private readonly ISecurityEventBatch _events;
    private readonly ICorrelationContext _correlation;

    public StudentSecurityEventsController(ISecurityEventBatch events, ICorrelationContext correlation)
    {
        _events = events;
        _correlation = correlation;
    }

    [HttpPost]
    public async Task<IActionResult> Report([FromBody] StudentSecurityEventRequest request, CancellationToken ct)
    {
        var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subject, out var studentId)) return Unauthorized();

        var eventDefinition = request.EventType switch
        {
            "copy_attempt" => (SecurityEventType.CopyAttempt, SecuritySeverity.Warning, "Browser copy or cut action blocked"),
            "devtools_detected" => (SecurityEventType.DevtoolsDetected, SecuritySeverity.Warning, "Browser developer tools signal observed"),
            "screenshot_attempt" => (SecurityEventType.ScreenshotAttempt, SecuritySeverity.Info, "Browser focus-loss screenshot signal observed"),
            _ => ((SecurityEventType?)null, (SecuritySeverity?)null, (string?)null)
        };
        if (eventDefinition.Item1 is null || eventDefinition.Item2 is null || eventDefinition.Item3 is null)
            return BadRequest(new { error = "Unsupported security event type" });

        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();

        await _events.EnqueueAsync(new SecurityEventWrite(
            studentId,
            null,
            eventDefinition.Item1.Value,
            eventDefinition.Item2.Value,
            eventDefinition.Item3,
            IPAddress.TryParse(ipAddress, out var parsedIp) ? parsedIp.ToString() : null,
            string.IsNullOrWhiteSpace(userAgent) ? null : userAgent,
            string.IsNullOrWhiteSpace(installationId) ? null : installationId,
            _correlation.CorrelationId), ct);

        return Accepted();
    }
}

public sealed record StudentSecurityEventRequest(string EventType);
