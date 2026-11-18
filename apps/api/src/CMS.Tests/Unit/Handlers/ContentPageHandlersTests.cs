using CMS.Application.Commands.Content;
using CMS.Application.DTOs.Content;
using CMS.Application.Handlers.Content;
using CMS.Domain.Entities;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Wave 16.5 — ContentPageHandlers unit coverage: public slug read (hit/miss),
/// admin list ordering, upsert create/update semantics, and the entity's
/// Arabic validation guards (empty/oversized title and body).
/// </summary>
public sealed class ContentPageHandlersTests
{
    private static ContentPageHandlers Create(ApplicationDbContext db) =>
        new(db, new UnitOfWork(db));

    private static async Task<ContentPage> SeedPageAsync(
        ApplicationDbContext db, string slug, string titleAr, string bodyAr)
    {
        var page = ContentPage.Create(slug, titleAr, bodyAr);
        db.ContentPages.Add(page);
        await db.SaveChangesAsync();
        return page;
    }

    [Fact]
    public async Task GetBySlug_ReturnsPage_IgnoringSlugCaseAndWhitespace()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        await SeedPageAsync(db, "terms", "شروط الاستخدام", "نص الشروط");
        var handler = Create(db);

        var result = await handler.Handle(new GetContentPageBySlugQuery("  TERMS "), CancellationToken.None);

        result.Should().NotBeNull();
        result!.Slug.Should().Be("terms");
        result.TitleAr.Should().Be("شروط الاستخدام");
        result.BodyAr.Should().Be("نص الشروط");
    }

    [Fact]
    public async Task GetBySlug_UnknownSlug_ReturnsNull()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var handler = Create(db);

        var result = await handler.Handle(new GetContentPageBySlugQuery("nope"), CancellationToken.None);

        result.Should().BeNull();
    }

    [Fact]
    public async Task List_ReturnsAllPages_OrderedBySlug()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        await SeedPageAsync(db, "privacy", "سياسة الخصوصية", "نص");
        await SeedPageAsync(db, "contact", "تواصل معنا", "نص");
        await SeedPageAsync(db, "terms", "شروط الاستخدام", "نص");
        var handler = Create(db);

        var pages = await handler.Handle(new ListContentPagesQuery(), CancellationToken.None);

        pages.Select(p => p.Slug).Should().Equal("contact", "privacy", "terms");
    }

    [Fact]
    public async Task Upsert_CreatesNewPage_WithNormalizedSlug()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var handler = Create(db);
        var adminId = db.Admins.First().Id;

        var result = await handler.Handle(
            new UpsertContentPageCommand("  Contact ", "تواصل معنا", "نص التواصل", adminId),
            CancellationToken.None);

        result.Slug.Should().Be("contact");
        result.TitleAr.Should().Be("تواصل معنا");
        db.ContentPages.Should().ContainSingle(p => p.Slug == "contact");
        db.ContentPages.Single(p => p.Slug == "contact").UpdatedBy.Should().Be(adminId);
    }

    [Fact]
    public async Task Upsert_UpdatesExistingPage_PreservingSlug()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var seeded = await SeedPageAsync(db, "terms", "شروط الاستخدام", "النص القديم");
        var handler = Create(db);
        var adminId = db.Admins.First().Id;

        var result = await handler.Handle(
            new UpsertContentPageCommand("terms", "شروط الاستخدام — محدثة", "النص الجديد", adminId),
            CancellationToken.None);

        result.TitleAr.Should().Be("شروط الاستخدام — محدثة");
        result.BodyAr.Should().Be("النص الجديد");
        db.ContentPages.Should().ContainSingle(p => p.Slug == "terms");
        seeded.UpdatedAt.Should().BeAfter(seeded.CreatedAt.AddSeconds(-1));
    }

    [Fact]
    public async Task Upsert_EmptyTitle_ThrowsArabicDomainException()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var handler = Create(db);

        var act = () => handler.Handle(
            new UpsertContentPageCommand("terms", "   ", "نص", Guid.NewGuid()),
            CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .WithMessage("*عنوان الصفحة*");
    }

    [Fact]
    public async Task Upsert_OversizedBody_ThrowsArabicDomainException()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var handler = Create(db);

        var act = () => handler.Handle(
            new UpsertContentPageCommand("terms", "عنوان", new string('ن', 20_001), Guid.NewGuid()),
            CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .WithMessage("*نص الصفحة*");
    }
}
