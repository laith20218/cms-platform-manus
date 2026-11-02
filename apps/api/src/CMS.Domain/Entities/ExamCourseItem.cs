using CMS.Domain.Common;

namespace CMS.Domain.Entities;

/// <summary>
/// Wave 14.1 (D1/D6) — join row: one exam included in one exam-course bundle.
/// (ExamCourseId, ExamId) is UNIQUE — the same exam cannot ship twice inside one
/// bundle. Both FKs cascade: a join row is meaningless without either side, and
/// the bundle owns the pairing. Reordering inside the bundle = update SortOrder.
/// </summary>
public class ExamCourseItem : BaseEntity
{
    /// <summary>EF materialization constructor.</summary>
    public ExamCourseItem() { }

    public Guid ExamCourseId { get; set; }

    public Guid ExamId { get; set; }

    public int SortOrder { get; set; }

    public ExamCourse ExamCourse { get; set; } = null!;

    public Exam Exam { get; set; } = null!;
}
