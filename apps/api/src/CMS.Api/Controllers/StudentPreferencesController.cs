using System.Security.Claims;
using System.Text.Json;
using CMS.Application.Commands.Profile;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.Api.Controllers;

/// <summary>
/// W15.0 — the student Preferences read/write surface over the previously-unwired
/// Student.Preferences JSON column. Pass-through contract: the API never interprets keys —
/// the client may evolve them (e.g. persisted last-filter state for the Courses cascade)
/// without API churn. Validation is shape-only: the body must be a JSON object ≤ 8 KB
/// (enforced in the handler; non-JSON bodies are rejected by model binding with 400).
/// </summary>
[ApiController]
[Route("api/v1/student/preferences")]
[Authorize(Roles = "student")]
public sealed class StudentPreferencesController : ControllerBase
{
    private readonly IMediator _mediator;

    public StudentPreferencesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Returns the stored preferences object (entity default when never written).</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var result = await _mediator.Send(new GetStudentPreferencesQuery(studentId.Value), ct);
        return Ok(result);
    }

    /// <summary>Replaces the stored preferences object and returns it (canonical form).</summary>
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] JsonElement body, CancellationToken ct)
    {
        var studentId = StudentId();
        if (!studentId.HasValue) return Unauthorized();

        var result = await _mediator.Send(
            new UpdateStudentPreferencesCommand(studentId.Value, body.GetRawText()), ct);
        return Ok(result);
    }

    private Guid? StudentId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value, out var id)
        ? id
        : null;
}
