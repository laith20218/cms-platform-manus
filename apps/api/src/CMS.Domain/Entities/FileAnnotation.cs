using CMS.Domain.Common;
using CMS.Domain.Enums;

namespace CMS.Domain.Entities;

/// <summary>
/// A student's private annotation on one page of a library PDF (Wave 11.8 / F2).
///
/// One row per annotation; geometry and style live in <see cref="Payload"/> as a
/// jsonb object with page-normalized coordinates (0..1), so annotations survive
/// zoom / viewport / device changes on the reader side.
///
/// Rows are keyed by CLIENT-generated ids (see the id-taking constructor): the
/// player saves annotations as idempotent batch upserts, so a retried batch can
/// never duplicate a stroke. There is intentionally no unique constraint on
/// (FileId, StudentId) — a student may place many annotations per page.
///
/// Ownership is strictly per-student: every read/write is scoped by StudentId at
/// the application layer (handlers), exactly like MediaBookmark. Both FKs cascade —
/// annotations are private derivatives; a hard-deleted file or student must not
/// leave orphan rows behind.
/// </summary>
public class FileAnnotation : BaseEntity
{
    /// <summary>EF materialization constructor.</summary>
    public FileAnnotation() { }

    /// <summary>
    /// Creates an annotation whose primary key is supplied by the client player —
    /// the base <c>Id</c> has a protected setter, so client ids enter through here
    /// (the established reflection-free route; handlers otherwise use protected
    /// setters only via the reflection pattern on legacy entities).
    /// </summary>
    public FileAnnotation(Guid id, Guid fileId, Guid studentId, int pageNumber, FileAnnotationType annotationType, string payload)
    {
        Id = id;
        FileId = fileId;
        StudentId = studentId;
        PageNumber = pageNumber;
        AnnotationType = annotationType;
        Payload = payload;
    }

    public Guid FileId { get; set; }

    public Guid StudentId { get; set; }

    /// <summary>1-indexed PDF page the annotation is anchored to (CHECK: page_number ≥ 1).</summary>
    public int PageNumber { get; set; }

    public FileAnnotationType AnnotationType { get; set; }

    /// <summary>
    /// jsonb payload — normalized geometry + style, validated app-side before
    /// persistence (object shape, ≤ 8 KB raw). Shape by type:
    /// Highlight → { rects: [{x,y,w,h}], color, textSnippet? };
    /// Ink → { points: [{x,y}], color, width } (width as a fraction of page width).
    /// </summary>
    public string Payload { get; set; } = "{}";

    public LibraryFile File { get; set; } = null!;

    public Student Student { get; set; } = null!;
}
