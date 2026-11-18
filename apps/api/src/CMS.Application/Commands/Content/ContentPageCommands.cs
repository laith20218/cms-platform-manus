using CMS.Application.DTOs.Content;
using MediatR;

namespace CMS.Application.Commands.Content;

/// <summary>
/// Wave 16.5 — public read: one content page by slug (Terms / Privacy / Contact).
/// Returns null when the slug does not exist — the controller answers 404.
/// </summary>
public sealed record GetContentPageBySlugQuery(
    string Slug
) : IRequest<ContentPageDto?>;

/// <summary>
/// Wave 16.5 — admin read: every content page (drives the admin editor list).
/// </summary>
public sealed record ListContentPagesQuery() : IRequest<IReadOnlyList<ContentPageDto>>;

/// <summary>
/// Wave 16.5 — admin upsert: create-or-update one content page by slug.
/// The entity validates lengths/emptiness (Arabic DomainException messages);
/// the handler resolves slug conflicts for existing pages.
/// </summary>
public sealed record UpsertContentPageCommand(
    string Slug,
    string TitleAr,
    string BodyAr,
    Guid AdminId
) : IRequest<ContentPageDto>;
