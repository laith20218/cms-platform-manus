using CMS.Domain.Common;

namespace CMS.Domain.Entities;

/// <summary>
/// A student's page bookmark inside one library PDF (Wave 12.5.B — migrated from
/// the client-only localStorage store `cms:pdf:bookmarks:&lt;fileId&gt;`).
///
/// One row per bookmarked page: the pair (StudentId, FileId, PageNumber) is UNIQUE —
/// re-bookmarking the same page is an idempotent upsert (the snippet refreshes),
/// never a duplicate. This mirrors the client contract the localStorage module had
/// (deduped, page-ascending list) so the port is 1:1.
///
/// Ownership is strictly per-student: every read/write is scoped by StudentId at the
/// application layer (handlers), exactly like FileAnnotation and MediaBookmark. Both
/// FKs cascade — bookmarks are private derivatives; a hard-deleted file or student
/// must not leave orphan rows behind.
///
/// Deliberately a first-class entity separate from Favorite (whole-file) and
/// MediaBookmark (video/audio time windows): a page bookmark points INSIDE a PDF
/// document at a 1-indexed page.
/// </summary>
public class FileBookmark : BaseEntity
{
    /// <summary>EF materialization constructor.</summary>
    public FileBookmark() { }

    public Guid FileId { get; set; }

    public Guid StudentId { get; set; }

    /// <summary>1-indexed PDF page the bookmark anchors to (CHECK: page_number ≥ 1).</summary>
    public int PageNumber { get; set; }

    /// <summary>
    /// Optional short text captured from the page at add time (first ~30 chars of the
    /// page text today). Display-only; never authoritative for identity.
    /// </summary>
    public string? Snippet { get; set; }

    public LibraryFile File { get; set; } = null!;

    public Student Student { get; set; } = null!;
}
