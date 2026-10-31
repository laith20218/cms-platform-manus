namespace CMS.Domain.Enums;

/// <summary>
/// The kind of annotation a student placed on a library PDF page (Wave 11.8 / F2).
/// Phase 1 shipped the two coordinate-based types the PDF player persists;
/// Wave 11.10 (F2 Phase 2) adds shapes and sticky notes. The enum extends
/// additively (integer values are persisted, so ordering matters — never
/// renumber; the smart eraser is a later F2 phase).
/// </summary>
public enum FileAnnotationType
{
    /// <summary>تظليل نص — text-selection highlight (list of page-normalized rects).</summary>
    Highlight = 0,

    /// <summary>حبر حر — freehand ink stroke (page-normalized point list).</summary>
    Ink = 1,

    /// <summary>شكل توضيحي — diagram shape: rect | ellipse | arrow | star
    /// (page-normalized box or endpoints in the jsonb payload).</summary>
    Shape = 2,

    /// <summary>ملاحظة لاصقة — sticky note: icon anchor + text (page-normalized).</summary>
    Note = 3
}
