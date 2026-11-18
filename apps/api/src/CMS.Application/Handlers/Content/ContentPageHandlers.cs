using CMS.Application.Commands.Content;
using CMS.Application.DTOs.Content;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CMS.Application.Handlers.Content;

/// <summary>
/// Wave 16.5 — the content-page pipeline (Terms / Privacy / Contact): public
/// slug read, admin list, and admin upsert. Content lives in the DB (admin-
/// editable at runtime) instead of hardcoded React components; the migration
/// seeds the three pages with the previously hardcoded Arabic text.
/// </summary>
public sealed class ContentPageHandlers :
    IRequestHandler<GetContentPageBySlugQuery, ContentPageDto?>,
    IRequestHandler<ListContentPagesQuery, IReadOnlyList<ContentPageDto>>,
    IRequestHandler<UpsertContentPageCommand, ContentPageDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;

    public ContentPageHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork)
    {
        _db = db;
        _unitOfWork = unitOfWork;
    }

    public async Task<ContentPageDto?> Handle(GetContentPageBySlugQuery request, CancellationToken ct)
    {
        var slug = NormalizeSlug(request.Slug);
        var page = await _db.ContentPages
            .AsNoTracking()
            .SingleOrDefaultAsync(p => p.Slug == slug, ct);

        return page is null ? null : Map(page);
    }

    public async Task<IReadOnlyList<ContentPageDto>> Handle(ListContentPagesQuery request, CancellationToken ct)
    {
        var pages = await _db.ContentPages
            .AsNoTracking()
            .OrderBy(p => p.Slug)
            .ToListAsync(ct);

        return pages.Select(Map).ToList();
    }

    public async Task<ContentPageDto> Handle(UpsertContentPageCommand request, CancellationToken ct)
    {
        var slug = NormalizeSlug(request.Slug);
        var existing = await _db.ContentPages
            .SingleOrDefaultAsync(p => p.Slug == slug, ct);

        if (existing is null)
        {
            var created = ContentPage.Create(slug, request.TitleAr, request.BodyAr, request.AdminId);
            _db.ContentPages.Add(created);
            await _unitOfWork.SaveChangesAsync(ct);
            return Map(created);
        }

        existing.Update(request.TitleAr, request.BodyAr, request.AdminId);
        await _unitOfWork.SaveChangesAsync(ct);
        return Map(existing);
    }

    private static string NormalizeSlug(string slug) => (slug ?? string.Empty).Trim().ToLowerInvariant();

    private static ContentPageDto Map(ContentPage page) =>
        new(page.Slug, page.TitleAr, page.BodyAr, page.UpdatedAt);
}
