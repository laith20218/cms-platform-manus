namespace CMS.Application.Interfaces;

/// <summary>
/// W14.5 (Phase A) — temporary presigned URLs for question images stored in Backblaze B2.
/// </summary>
public interface IPresignedUrlService
{
    /// <summary>
    /// Generates a temporary presigned GET URL for a B2 object key in the configured
    /// bucket. Presigning is computed locally (SigV4) — there is no network round-trip.
    /// </summary>
    /// <exception cref="ArgumentException">Thrown when <paramref name="objectKey"/> is empty.</exception>
    /// <exception cref="InvalidOperationException">Thrown when Storage:S3 configuration is absent.</exception>
    Task<string> CreatePresignedUrlAsync(string objectKey, CancellationToken ct = default);

    /// <summary>
    /// Resolves a stored image reference during DTO mapping:
    /// absolute <c>http(s)://</c> URLs (the current production contract — public bucket
    /// URLs composed client-side by admin-web) and inline <c>data:</c>/<c>blob:</c> values
    /// pass through unchanged; bare object keys and <c>b2://bucket/key</c> URIs are replaced
    /// with a freshly generated presigned URL. Unresolvable values degrade to the ORIGINAL
    /// value — resolution must never fail a read request.
    /// </summary>
    Task<string?> ResolveImageUrlAsync(string? storedValue, CancellationToken ct = default);
}
