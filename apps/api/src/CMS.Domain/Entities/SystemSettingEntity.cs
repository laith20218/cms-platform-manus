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

/// <summary>
/// PR-7 (Settings + Role Studio): append-only audit trail of system-setting mutations.
/// One row per update/reset, written inside the SAME SaveChanges as the setting change so a
/// value can never change without its history row (atomic pair — a crash mid-request leaves
/// either both or neither). OldValue is null for the first recorded mutation of a setting
/// seeded before this table existed. Reason: "update" | "reset" (reset = restore of the
/// server-side registered default — the client-supplied default is never trusted).
/// </summary>
public class SystemSettingHistory : BaseEntity
{
    /// <summary>Setting key the row refers to (NOT an FK — history outlives key renames/deletes).</summary>
    public string Key { get; private set; } = string.Empty;

    /// <summary>Value before the mutation; null when no prior value was recorded.</summary>
    public string? OldValue { get; private set; }

    /// <summary>Value after the mutation (never null — a setting always has a value).</summary>
    public string NewValue { get; private set; } = string.Empty;

    /// <summary>Admin who performed the mutation.</summary>
    public Guid? ChangedBy { get; private set; }

    /// <summary>When the mutation happened (UtcNow).</summary>
    public DateTime ChangedAt { get; private set; }

    /// <summary>Why the value changed: "update" (explicit PUT) or "reset" (default restore).</summary>
    public string Reason { get; private set; } = "update";

    /// <summary>Factory used by the settings endpoints — keeps the private setters honest.</summary>
    public static SystemSettingHistory Create(string key, string? oldValue, string newValue, Guid? changedBy, string reason) =>
        new()
        {
            Key = key,
            OldValue = oldValue,
            NewValue = newValue,
            ChangedBy = changedBy,
            ChangedAt = DateTime.UtcNow,
            Reason = reason
        };
}
