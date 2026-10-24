namespace CMS.Domain.Enums;

/// <summary>
/// Institutional content classification for library files — the taxonomy students
/// browse by (منهاج / محاضرة / تلخيص / أفكار ذهبية). Orthogonal to the
/// storage-oriented <see cref="LibraryFileType"/>: a curriculum PDF and a summary
/// PDF share <see cref="LibraryFileType.Pdf"/> but differ in category.
/// Nullable on the entity so every pre-existing row remains valid (NULL = legacy,
/// uncategorized).
/// </summary>
public enum LibraryFileCategory
{
    /// <summary>منهاج — curriculum material issued by the institution.</summary>
    Curriculum,

    /// <summary>محاضرة — material attached to a specific lecture.</summary>
    Lecture,

    /// <summary>تلخيص — student-facing summary documents.</summary>
    Summary,

    /// <summary>أفكار ذهبية — high-yield "golden ideas" notes.</summary>
    GoldenIdeas
}
