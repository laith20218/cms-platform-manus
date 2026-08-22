namespace CMS.Domain.Common;

/// <summary>
/// Base entity for all domain entities.
/// Provides common audit properties.
/// </summary>
public abstract class BaseEntity
{
    public Guid Id { get; protected set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; protected set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; protected set; } = DateTime.UtcNow;
}

/// <summary>
/// Base entity with soft delete and audit tracking.
/// Used for content entities (questions, files, etc.).
/// </summary>
public abstract class AuditableEntity : BaseEntity
{
    public Guid CreatedBy { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }
}

/// <summary>
/// Base entity for lookup tables (universities, colleges, etc.).
/// Includes soft delete, status, and sort order.
/// </summary>
public abstract class LookupEntity : BaseEntity
{
    public string NameAr { get; protected set; } = string.Empty;
    public string? NameEn { get; protected set; }
    public string Slug { get; protected set; } = string.Empty;
    public string? Description { get; protected set; }
    public string Status { get; protected set; } = "active";
    public int SortOrder { get; protected set; }
    public DateTime? DeletedAt { get; set; }

    public bool IsArchived => DeletedAt.HasValue;

    public void Archive()
    {
        if (DeletedAt.HasValue) return;
        DeletedAt = DateTime.UtcNow;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Restore()
    {
        if (!DeletedAt.HasValue) return;
        DeletedAt = null;
        UpdatedAt = DateTime.UtcNow;
    }
}
