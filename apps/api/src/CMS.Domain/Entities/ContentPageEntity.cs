using CMS.Domain.Common;
using CMS.Domain.Exceptions;

namespace CMS.Domain.Entities;

/// <summary>
/// Wave 16.5 — admin-managed site content pages (Terms / Privacy / Contact).
/// Smallest viable content model: a stable slug addresses the page (URL),
/// Arabic title + Arabic body carry the content, UpdatedAt/UpdatedBy audit it.
/// The body uses a markdown-lite convention consumed by student-web:
/// blank-line separated paragraphs, with «## » prefix marking a section heading.
/// </summary>
public class ContentPage : BaseEntity
{
    /// <summary>Unique, stable, lowercase slug (e.g. "terms", "privacy", "contact").</summary>
    public string Slug { get; private set; } = string.Empty;

    /// <summary>Arabic page title (rendered as the h1).</summary>
    public string TitleAr { get; private set; } = string.Empty;

    /// <summary>Arabic body — markdown-lite (paragraphs + «## » headings).</summary>
    public string BodyAr { get; private set; } = string.Empty;

    /// <summary>Admin who last updated this page.</summary>
    public Guid? UpdatedBy { get; private set; }

    private ContentPage() { }

    public static ContentPage Create(string slug, string titleAr, string bodyAr, Guid? updatedBy = null)
    {
        Validate(slug, titleAr, bodyAr);
        return new ContentPage
        {
            Slug = NormalizeSlug(slug),
            TitleAr = titleAr.Trim(),
            BodyAr = bodyAr.Trim(),
            UpdatedBy = updatedBy,
        };
    }

    public void Update(string titleAr, string bodyAr, Guid? updatedBy)
    {
        Validate(Slug, titleAr, bodyAr);
        TitleAr = titleAr.Trim();
        BodyAr = bodyAr.Trim();
        UpdatedBy = updatedBy;
        UpdatedAt = DateTime.UtcNow;
    }

    private static void Validate(string slug, string titleAr, string bodyAr)
    {
        var normalized = NormalizeSlug(slug);
        if (normalized.Length == 0 || normalized.Length > 64)
            throw new DomainException("معرّف الصفحة (slug) إلزامي وبحد أقصى 64 محرفاً", "CONTENT_SLUG_INVALID");
        if (string.IsNullOrWhiteSpace(titleAr) || titleAr.Trim().Length > 200)
            throw new DomainException("عنوان الصفحة إلزامي وبحد أقصى 200 محرف", "CONTENT_TITLE_INVALID");
        if (string.IsNullOrWhiteSpace(bodyAr) || bodyAr.Trim().Length > 20_000)
            throw new DomainException("نص الصفحة إلزامي وبحد أقصى 20000 محرف", "CONTENT_BODY_INVALID");
    }

    private static string NormalizeSlug(string slug) =>
        (slug ?? string.Empty).Trim().ToLowerInvariant();
}
