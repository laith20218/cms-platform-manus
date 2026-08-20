namespace CMS.Application.Interfaces;

/// <summary>Security-sensitive operations that require a fresh, request-bound Play Integrity verdict.</summary>
public enum PlayIntegrityOperation
{
    Login = 1,
    OfflineDownload = 2,
    SensitiveContent = 3,
    PeriodicRefresh = 4
}

/// <summary>Untrusted client submission. The opaque token must never be logged or persisted verbatim.</summary>
public sealed record PlayIntegrityVerificationRequest(string Token, string RequestHash, PlayIntegrityOperation Operation);

/// <summary>Server-bound context that must agree with the request details inside a real Play Integrity verdict.</summary>
public sealed record PlayIntegrityVerificationContext(Guid StudentId, string InstallationId);

/// <summary>Fail-closed outcome. Decision is safe for an API response and contains no provider token details.</summary>
public sealed record PlayIntegrityVerificationResult(bool IsAccepted, string Decision, DateTimeOffset? ValidUntil = null);

/// <summary>
/// Verifies a fresh Play Integrity token against a request-bound context. Implementations must reject unavailable,
/// malformed, replayed, mismatched, expired, or unrecognized verdicts without exposing provider details.
/// </summary>
public interface IPlayIntegrityService
{
    Task<PlayIntegrityVerificationResult> VerifyAsync(
        PlayIntegrityVerificationRequest request,
        PlayIntegrityVerificationContext context,
        CancellationToken ct = default);
}
