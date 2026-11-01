namespace CMS.Application.Interfaces;

/// <summary>
/// A single-use HTML view grant: an opaque base64url token bound to one file
/// and one student, valid until <see cref="ExpiresAt"/> (5 minutes).
/// </summary>
public sealed record HtmlAccessTokenGrant(string Token, DateTimeOffset ExpiresAt);

/// <summary>The (fileId, studentId) pair a consumed token was bound to at issue time.</summary>
public sealed record HtmlAccessTokenPayload(Guid FileId, Guid StudentId);

/// <summary>
/// R51 — short-lived, single-use access tokens for the HTML view endpoint
/// (GET /api/v1/library/{id}/html-view?t=...).
///
/// Why: the lesson document must be served as its own HTTP response so the
/// browser applies a per-file CSP <b>header</b> to it (response-header policies
/// are authoritative for the framed document and cannot be inherited from, or
/// overridden by, the embedding app shell). The token is the authorization:
/// it is only issued to an entitled student through the JWT-gated
/// /html-access endpoint, is consumed exactly once, and dies after 5 minutes.
///
/// State is deliberately IN-MEMORY (ConcurrentDictionary) — grants are
/// worthless outside a single API process lifetime and never touch storage.
/// </summary>
public interface IHtmlAccessTokenService
{
    /// <summary>
    /// Issues a token bound to (fileId, studentId). Returns null when the
    /// per-student rate limit is exhausted (max 5 issues per rolling minute).
    /// </summary>
    HtmlAccessTokenGrant? Issue(Guid fileId, Guid studentId);

    /// <summary>
    /// Atomically consumes a token: succeeds (returns the bound pair) at most
    /// once per token, and only before expiry. Unknown, expired and already
    /// used tokens all return null (fail closed).
    /// </summary>
    HtmlAccessTokenPayload? Consume(string token, string? ip);
}
