using CMS.Domain.Common;
using CMS.Domain.Enums;

namespace CMS.Domain.Entities;

/// <summary>
/// Wave 14.1 (D1) — "الدورات الامتحانية": a named, sellable bundle of exams for one
/// subject in one academic year/semester (e.g. "دورة أولى 2025", "دورة نموذجية A").
///
/// The bundle holds NO questions of its own — ExamCourseItem rows point at exams in
/// the bank (D6: picking is always from the bank; "create new" opens the exam editor
/// in a new tab and lands here as a normal exam row). Subject deletion is RESTRICT
/// on purpose (mirrors Course: subjects are soft-deleted in practice; a hard delete
/// must never silently destroy sellable content).
///
/// FreeOrPaid: true = paid (يُفتح باشتراك/رمز), false = free. Access enforcement is
/// a 14.2 concern (entitlement service) — this wave lays down storage only.
/// </summary>
public class ExamCourse : BaseEntity
{
    /// <summary>EF materialization constructor.</summary>
    public ExamCourse() { }

    public Guid SubjectId { get; set; }

    /// <summary>Arabic display name (required, ≤200 chars).</summary>
    public string NameAr { get; set; } = string.Empty;

    public string? NameEn { get; set; }

    public string? Description { get; set; }

    /// <summary>Optional cover image URL for the storefront card (14.2+).</summary>
    public string? CoverUrl { get; set; }

    /// <summary>Academic year number (e.g. 2025) — plain int, same convention as Exam.Year.</summary>
    public int Year { get; set; }

    /// <summary>Semester number within the year (1 = first, 2 = second, 3 = رابعة/صيفي).</summary>
    public int Semester { get; set; }

    public ExamCourseType CourseType { get; set; } = ExamCourseType.First;

    /// <summary>true = paid (مدفوع), false = free (مجاني).</summary>
    public bool FreeOrPaid { get; set; }

    public int SortOrder { get; set; }

    public ContentStatus Status { get; set; } = ContentStatus.Draft;

    public Subject Subject { get; set; } = null!;

    public ICollection<ExamCourseItem> Items { get; set; } = new List<ExamCourseItem>();
}
