using CMS.Domain.Common;

namespace CMS.Domain.Entities;

public enum SessionStatus
{
    Active = 1,
    Revoked = 2,
    Expired = 3
}

/// <summary>
/// Server-side authentication session. Refresh tokens are stored only as SHA-256 hashes.
/// </summary>
public class UserSession : BaseEntity
{
    public Guid UserId { get; set; }
    public string Role { get; set; } = string.Empty;
    public string InstallationId { get; set; } = string.Empty;
    public Guid FamilyId { get; set; }
    public string RefreshTokenHash { get; set; } = string.Empty;
    public DateTime RefreshTokenExpiresAt { get; set; }
    public DateTime? RefreshTokenUsedAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? RevocationReason { get; set; }
    public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;
    public int TokenVersion { get; set; } = 1;
    public SessionStatus Status { get; set; } = SessionStatus.Active;

    // ===== Push 2 / Track 2: activity-monitor enrichment (all nullable — legacy rows stay valid) =====
    /// <summary>Client IP captured at login (string, not inet — rendered directly in the monitor).
    /// Named IpAddress (not IPAddress) so the snake_case mapper produces ip_address.</summary>
    public string? IpAddress { get; set; }
    /// <summary>Raw User-Agent header captured at login.</summary>
    public string? UserAgent { get; set; }
    /// <summary>Parsed device summary (browser / os / deviceType) stored as a JSON string (jsonb).</summary>
    public string? DeviceDetails { get; set; }
    /// <summary>Set by the SessionSweeperService when the session goes idle (> 15 minutes).</summary>
    public DateTime? ClosedAt { get; set; }

    public bool IsActiveAt(DateTime utcNow) =>
        Status == SessionStatus.Active &&
        RevokedAt is null &&
        RefreshTokenExpiresAt > utcNow;

    public void Revoke(string reason)
    {
        if (RevokedAt is not null) return;
        Status = SessionStatus.Revoked;
        RevokedAt = DateTime.UtcNow;
        RevocationReason = reason;
        TokenVersion++;
    }
}

/// <summary>
/// Installation registry. The installation identifier is an account-scoped risk and session signal,
/// not a browser fingerprint or independent proof of identity.
/// </summary>
public class UserInstallation : BaseEntity
{
    public Guid UserId { get; set; }
    public string InstallationId { get; set; } = string.Empty;
    public string Platform { get; set; } = "web";
    public string? DisplayName { get; set; }
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }
    public string Status { get; set; } = "active";

    public bool IsActive => Status == "active" && RevokedAt is null;
}
