using System.Security.Claims;
using CMS.Application.Commands.Subscriptions;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.Api.Controllers;

[ApiController]
[Route("api/v1/subscriptions")]
[Authorize(Roles = "student")]
public sealed class SubscriptionsController : ControllerBase
{
    private readonly ISender _mediator;

    public SubscriptionsController(ISender mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Redeems an active code for the authenticated student only.</summary>
    [HttpPost("redeem")]
    [ProducesResponseType(typeof(SubscriptionRedemptionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<SubscriptionRedemptionDto>> Redeem([FromBody] RedeemSubscriptionCodeRequestDto request, CancellationToken ct)
    {
        var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subject, out var studentId))
            return Unauthorized();

        return Ok(await _mediator.Send(new RedeemSubscriptionCodeCommand(studentId, request.Code), ct));
    }
}

public record RedeemSubscriptionCodeRequestDto(string Code);
