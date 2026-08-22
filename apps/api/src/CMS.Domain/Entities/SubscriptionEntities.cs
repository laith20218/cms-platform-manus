using CMS.Domain.Common;
using CMS.Domain.Enums;

namespace CMS.Domain.Entities;

public class CodeBatch : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public string ScopeType { get; set; } = "subject";
    public SubscriptionContentScope ContentScope { get; set; } = SubscriptionContentScope.FullSubject;
    public bool IsPublic { get; set; }
    public Guid? ScopeUniversityId { get; set; }
    public Guid? ScopeCollegeId { get; set; }
    public Guid? ScopeYearId { get; set; }
    public Guid? ScopeSemesterId { get; set; }
    public Guid? ScopeSubjectId { get; set; }
    public int DurationDays { get; set; }
    public DateTime? CodeExpiresAt { get; set; }
    public Guid CreatedBy { get; set; }
}

public class SubscriptionCode : BaseEntity
{
    public string Code { get; set; } = string.Empty;
    public Guid BatchId { get; set; }
    public SubscriptionScopeType ScopeType { get; set; }
    public SubscriptionContentScope ContentScope { get; set; } = SubscriptionContentScope.FullSubject;
    public bool IsPublic { get; set; }
    public Guid? ScopeUniversityId { get; set; }
    public Guid? ScopeCollegeId { get; set; }
    public Guid? ScopeYearId { get; set; }
    public Guid? ScopeSemesterId { get; set; }
    public Guid? ScopeSubjectId { get; set; }
    public int DurationDays { get; set; }
    public DateTime? CodeExpiresAt { get; set; }
    public CodeStatus Status { get; set; } = CodeStatus.Active;
    public Guid? UsedBy { get; set; }
    public DateTime? UsedAt { get; set; }
    public Guid CreatedBy { get; set; }
}

/// <summary>
/// Server-side grant for a student. Entitlement decisions are made from this data,
/// never from scope or role identifiers supplied by a client DTO.
/// </summary>
public class StudentSubscription : BaseEntity
{
    public Guid StudentId { get; set; }
    public Guid? SubscriptionCodeId { get; set; }
    public SubscriptionScopeType ScopeType { get; set; }
    public SubscriptionContentScope ContentScope { get; set; } = SubscriptionContentScope.FullSubject;
    public Guid? ScopeUniversityId { get; set; }
    public Guid? ScopeCollegeId { get; set; }
    public Guid? ScopeYearId { get; set; }
    public Guid? ScopeSemesterId { get; set; }
    public Guid? ScopeSubjectId { get; set; }
    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.Active;
    public DateTime StartsAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? RevocationReason { get; set; }

    public bool IsActiveAt(DateTime utcNow) =>
        Status == SubscriptionStatus.Active &&
        RevokedAt is null &&
        StartsAt <= utcNow &&
        ExpiresAt > utcNow;
}
