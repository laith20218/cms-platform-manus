using CMS.Domain.Common;

namespace CMS.Domain.Entities;

/// <summary>
/// System-wide configuration setting (key/value) editable by admins with Settings.Edit permission.
/// Separated from secrets (which live in env vars / secret manager, not in this table).
/// Examples: platform_name, max_upload_size_mb, watermark_text, content_review_policy.
/// </summary>
public class SystemSetting : BaseEntity
{
    /// <summary>Unique, stable, lowercase snake_case key (e.g. "platform_name").</summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>Current value as a string (parse to int/bool/DateTime at the service layer when needed).</summary>
    public string Value { get; set; } = string.Empty;

    /// <summary>Human-readable description of what this setting controls (bilingual).</summary>
    public string? Description { get; set; }

    /// <summary>Optional category for grouping in the UI (e.g. "platform", "content", "upload").</summary>
    public string? Category { get; set; }

    /// <summary>Admin who last updated this setting.</summary>
    public Guid? UpdatedBy { get; set; }

    public Admin? UpdatedByAdmin { get; set; }
}
