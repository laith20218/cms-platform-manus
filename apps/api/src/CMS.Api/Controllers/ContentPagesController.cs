using CMS.Application.Commands.Content;
using CMS.Application.DTOs.Content;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CMS.Api.Controllers;

/// <summary>
/// Wave 16.5 — public site content (Terms / Privacy / Contact) read by slug.
/// Anonymous: the legal pages are linked from the register screen (pre-login),
/// so no auth is required to read them. Writes live in AdminContentPagesController.
/// </summary>
[ApiController]
[Route("api/v1/content")]
public sealed class ContentPagesController : ControllerBase
{
    private readonly IMediator _mediator;

    public ContentPagesController(IMediator mediator)
    {
        _mediator = mediator;
    }

    /// <summary>Returns one content page by slug (e.g. terms / privacy / contact).</summary>
    /// <remarks>404 when the slug has no page; the student UI then shows its Arabic error card.</remarks>
    [HttpGet("{slug}")]
    [AllowAnonymous]
    [EnableRateLimiting("health")]
    public async Task<ActionResult<ContentPageDto>> GetBySlug(string slug, CancellationToken ct)
    {
        var page = await _mediator.Send(new GetContentPageBySlugQuery(slug), ct);
        if (page is null)
        {
            return NotFound(new ProblemDetails
            {
                Title = "الصفحة غير موجودة",
                Status = StatusCodes.Status404NotFound,
                Detail = "لم يتم العثور على هذه الصفحة. حدّث الصفحة أو أعد المحاولة لاحقاً.",
            });
        }

        return Ok(page);
    }
}
