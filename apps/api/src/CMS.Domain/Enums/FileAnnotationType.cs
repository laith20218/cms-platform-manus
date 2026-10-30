namespace CMS.Domain.Enums;

/// <summary>
/// The kind of annotation a student placed on a library PDF page (Wave 11.8 / F2).
/// Phase 1 ships the two coordinate-based types the PDF player persists; shapes,
/// sticky notes and the smart eraser are later F2 phases and will extend this enum
/// additively (integer values are persisted, so ordering matters — never renumber).
/// </summary>
public enum FileAnnotationType
{
    /// <summary>تظليل نص — text-selection highlight (list of page-normalized rects).</summary>
    Highlight = 0,

    /// <summary>حبر حر — freehand ink stroke (page-normalized point list).</summary>
    Ink = 1
}
