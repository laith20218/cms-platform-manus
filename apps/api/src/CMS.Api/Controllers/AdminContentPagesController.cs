using System.Security.Claims;
using CMS.Application.Commands.Content;
using CMS.Application.DTOs.Content;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.Api.Controllers;

/// <summary>
/// Wave 16.5 — admin editor surface for the site content pages (Terms / Privacy /
/// Contact). Super-admin only: legal texts carry platform-wide impact, and the
/// admin-web nav gates this view the same way (superOnly, no new UI-permission
/// registry key). Reads list every page; PUT upserts by slug.
/// </summary>
[ApiController]
[Route("api/v1/admin/content")]
[Authorize(Roles = "super_admin")]
public sealed class AdminContentPagesController : ControllerBase
{
    private readonly IMediator _mediator;

    public AdminContentPagesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Lists every content page (admin editor list).</summary>
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ContentPageDto>>> List(CancellationToken ct)
    {
        var pages = await _mediator.Send(new ListContentPagesQuery(), ct);
        return Ok(pages);
    }

    /// <summary>Creates or updates one content page by slug (title + body, Arabic).</summary>
    [HttpPut("{slug}")]
    public async Task<ActionResult<ContentPageDto>> Upsert(
        string slug,
        [FromBody] UpsertContentPageRequest body,
        CancellationToken ct)
    {
        try
        {
            var page = await _mediator.Send(
                new UpsertContentPageCommand(slug, body.TitleAr, body.BodyAr, AdminId()), ct);
            return Ok(page);
        }
        catch (CMS.Domain.Exceptions.DomainException ex)
        {
            // Arabic validation messages from the entity (empty/oversized title or body).
            return BadRequest(new ProblemDetails
            {
                Title = "تعذّر حفظ الصفحة",
                Status = StatusCodes.Status400BadRequest,
                Detail = ex.Message,
            });
        }
    }

    private Guid AdminId() =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value, out var id)
            ? id
            : throw new UnauthorizedAccessException();
}

/// <summary>Request body for PUT /api/v1/admin/content/{slug}.</summary>
public sealed record UpsertContentPageRequest(string TitleAr, string BodyAr);
