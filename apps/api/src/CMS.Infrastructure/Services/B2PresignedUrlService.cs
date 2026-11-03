using Amazon.S3;
using Amazon.S3.Model;
using Amazon.Runtime;
using CMS.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services;

/// <summary>
/// W14.5 (Phase A) — B2 presigned URL service. Generates temporary presigned GET URLs
/// for Backblaze B2 object keys and resolves stored question-image references
/// (bare object keys or <c>b2://bucket/key</c> URIs) into fetchable URLs.
/// </summary>
/// <remarks>
/// Mirrors the S3StorageService client construction (same <c>Storage:S3:*</c> config,
/// path-style addressing for mixed-case B2 buckets, WHEN_REQUIRED checksums) but is
/// deliberately GRACEFUL where S3StorageService fails closed: presigned image URLs are
/// a read-path nicety, so a missing storage configuration must never fail a question
/// read (the exact incident class W14.5 fixes). Presigning is computed locally by the
/// AWS SDK (SigV4) — <see cref="CreatePresignedUrlAsync"/> performs no network I/O.
/// </remarks>
public sealed class B2PresignedUrlService : IPresignedUrlService
{
    private const string B2UriScheme = "b2://";
    private static readonly TimeSpan DefaultExpiry = TimeSpan.FromMinutes(60);
    private static readonly TimeSpan MaxExpiry = TimeSpan.FromDays(7);

    private readonly IAmazonS3? _client;
    private readonly string _bucketName;
    private readonly TimeSpan _expiry;
    private readonly ILogger<B2PresignedUrlService> _logger;
    private bool _warnedDisabled; // log-once guard (benign race: worst case a duplicate warning)

    public B2PresignedUrlService(IConfiguration configuration, ILogger<B2PresignedUrlService> logger)
    {
        _logger = logger;
        _bucketName = configuration["Storage:S3:BucketName"] ?? string.Empty;
        var endpoint = configuration["Storage:S3:Endpoint"];
        var region = configuration["Storage:S3:Region"];
        var accessKey = configuration["Storage:S3:AccessKey"];
        var secretKey = configuration["Storage:S3:SecretKey"];

        _expiry = configuration["Storage:S3:PresignExpiryMinutes"] is { } rawMinutes
            && int.TryParse(rawMinutes, out var minutes)
            ? TimeSpan.FromMinutes(Math.Clamp(minutes, 1, (int)MaxExpiry.TotalMinutes))
            : DefaultExpiry;

        if (string.IsNullOrWhiteSpace(endpoint) ||
            string.IsNullOrWhiteSpace(region) ||
            string.IsNullOrWhiteSpace(accessKey) ||
            string.IsNullOrWhiteSpace(secretKey) ||
            string.IsNullOrWhiteSpace(_bucketName))
        {
            // Graceful by design (see class remarks): resolution degrades to passthrough
            // with a log-once warning instead of failing reads at construction time.
            _client = null;
            return;
        }

        _client = new AmazonS3Client(accessKey, secretKey, new AmazonS3Config
        {
            ServiceURL = endpoint.TrimEnd('/'),
            AuthenticationRegion = region,
            // B2 bucket names may be mixed-case (e.g. CMSmedia) — path-style addressing
            // is the correct (and B2-supported) form. Same rationale as S3StorageService.
            ForcePathStyle = true,
            // Same R2/B2 compatibility guard as S3StorageService: keeps the SDK from
            // emitting checksum headers some S3-compatible providers reject.
            RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
        });
    }

    /// <inheritdoc />
    public Task<string> CreatePresignedUrlAsync(string objectKey, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
            throw new ArgumentException("Object key must be provided.", nameof(objectKey));
        if (_client is null)
            throw new InvalidOperationException(
                "Storage S3 configuration must be supplied for presigned URL generation");

        return Task.FromResult(_client.GetPreSignedURL(BuildGetRequest(_bucketName, objectKey.TrimStart('/'))));
    }

    /// <inheritdoc />
    public Task<string?> ResolveImageUrlAsync(string? storedValue, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(storedValue))
            return Task.FromResult(storedValue);

        // Absolute URLs (current production contract: public https bucket URLs) and
        // inline data/blob values pass through untouched.
        if (storedValue.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            storedValue.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
            storedValue.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
            storedValue.StartsWith("blob:", StringComparison.OrdinalIgnoreCase))
            return Task.FromResult<string?>(storedValue);

        try
        {
            // b2://bucket/key — explicit bucket reference; anything else is a bare
            // object key resolved against the configured bucket.
            var bucket = _bucketName;
            var key = storedValue.Trim().TrimStart('/');
            if (storedValue.StartsWith(B2UriScheme, StringComparison.OrdinalIgnoreCase))
            {
                var remainder = storedValue[B2UriScheme.Length..].Trim('/');
                var separator = remainder.IndexOf('/');
                if (separator <= 0)
                {
                    _logger.LogWarning(
                        "W14.5: stored image value '{Value}' is an unresolvable b2:// URI (no object key) — returned unchanged",
                        storedValue);
                    return Task.FromResult<string?>(storedValue);
                }
                bucket = remainder[..separator];
                key = remainder[(separator + 1)..];
            }

            if (_client is null)
            {
                if (!_warnedDisabled)
                {
                    _warnedDisabled = true;
                    _logger.LogWarning(
                        "W14.5: Storage:S3 configuration is absent — image references such as '{Value}' cannot be presigned and are returned unchanged",
                        storedValue);
                }
                return Task.FromResult<string?>(storedValue);
            }

            return Task.FromResult<string?>(_client.GetPreSignedURL(BuildGetRequest(bucket, key)));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "W14.5: presigned URL resolution failed for stored image value '{Value}' — returning the stored value unchanged",
                storedValue);
            return Task.FromResult<string?>(storedValue);
        }
    }

    private GetPreSignedUrlRequest BuildGetRequest(string bucket, string key) => new()
    {
        BucketName = bucket,
        Key = key,
        Expires = DateTime.UtcNow.Add(_expiry),
        Verb = HttpVerb.GET
    };
}
