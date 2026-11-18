namespace CMS.Application.DTOs.Content;

/// <summary>
/// Wave 16.5 — wire shape of a content page (Terms / Privacy / Contact).
/// Consumed by the public student-web pages and the admin editor alike.
/// </summary>
public sealed record ContentPageDto(
    string Slug,
    string TitleAr,
    string BodyAr,
    DateTime UpdatedAt
);
