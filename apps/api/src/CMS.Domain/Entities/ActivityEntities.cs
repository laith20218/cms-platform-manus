using CMS.Domain.Common;
using CMS.Domain.Enums;

namespace CMS.Domain.Entities;

/// <summary>
/// Push 2 / Track 2: one completed administrative action, written by the
/// <c>IAdminActivityWriter</c> injected into the CreateQuestion, CompleteUpload and
/// GenerateCodes handlers. Powers the super-admin activity monitor
/// (GET /api/v1/admin/activity/logs) together with the enriched <see cref="UserSession"/>.
/// Metadata is a JSON string stored in a jsonb column (same pattern as
/// OfflinePackageRecord.ManifestJson / ExamSessionQuestion.OptionsJson).
/// </summary>
public class AdminActivityLog : BaseEntity
{
    public Guid AdminId { get; set; }

    /// <summary>Acting session (from the access-token "sid" claim) — powers per-session counters.</summary>
    public Guid? SessionId { get; set; }

    public AdminActivityActionType ActionType { get; set; }

    /// <summary>Identifier of the affected resource as a string (question id, file id, batch id).</summary>
    public string? ResourceId { get; set; }

    /// <summary>JSON object serialized by the writer (questionType/fileSize/quantity/...).</summary>
    public string Metadata { get; set; } = "{}";

    public Admin? Admin { get; set; }
}
