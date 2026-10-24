using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Microsoft.Extensions.Configuration;

namespace CMS.Infrastructure.Services;

/// <summary>
/// A short-lived S3 client bound to the Upstash Blob (Cloudflare R2) endpoint, together
/// with the bucket name the credentials are scoped to.
/// </summary>
public sealed record UpstashS3Lease(IAmazonS3 Client, string Bucket, DateTimeOffset ExpiresAt);

/// <summary>
/// Creates <see cref="UpstashS3Lease"/>s by exchanging the long-lived Upstash Blob token
/// for short-lived S3 credentials. Implemented by <see cref="UpstashS3ClientFactory"/>.
/// </summary>
public interface IUpstashS3ClientFactory
{
    /// <summary>Returns a cached-or-refreshed S3 client lease. Thread-safe.</summary>
    Task<UpstashS3Lease> CreateAsync(CancellationToken ct = default);
}

/// <summary>
/// Exchanges the Upstash Blob token for short-lived S3 credentials via
/// <c>POST https://blob.upstash.io/v1/credentials</c> (Bearer auth) and builds an
/// AWS SDK S3 client pointed at the R2 endpoint the response carries.
///
/// This path exists because Upstash's <c>/v1/presign</c> only signs GET, HEAD and PUT —
/// operations the presign endpoint cannot serve (DELETE, LIST) must go through the
/// S3-compatible API with SigV4 credentials. Verified live against R2: the exchange
/// returns accessKeyId/secretAccessKey/sessionToken/endpoint/bucket/region/expiresAt
/// and the resulting client performs idempotent, 404-safe deletes.
///
/// The lease is cached and refreshed under a lock shortly before its stated expiry, so
/// steady-state deletes cost no extra round-trips.
///
/// Configuration keys:
///   Upstash:Blob:Token — the UPSTASH_BLOB_TOKEN (secret; never logged).
/// </summary>
public sealed class UpstashS3ClientFactory : IUpstashS3ClientFactory
{
    private const string AgentUrl = "https://blob.upstash.io";
    private const string HttpClientName = "UpstashBlob";

    /// <summary>Credentials are refreshed this long before their stated expiry.</summary>
    private static readonly TimeSpan ExpirySafetyMargin = TimeSpan.FromMinutes(5);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _token;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private UpstashS3Lease? _cached;

    public UpstashS3ClientFactory(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        var token = configuration["Upstash:Blob:Token"];
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Upstash:Blob:Token must be configured at runtime");
        _token = token!;
        _httpClientFactory = httpClientFactory;
    }

    public async Task<UpstashS3Lease> CreateAsync(CancellationToken ct = default)
    {
        var cached = _cached;
        if (cached is not null && !IsExpiring(cached))
            return cached;

        await _refreshLock.WaitAsync(ct);
        try
        {
            cached = _cached;
            if (cached is not null && !IsExpiring(cached))
                return cached;

            var lease = await ExchangeCredentialsAsync(ct);
            _cached = lease;
            return lease;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private static bool IsExpiring(UpstashS3Lease lease) =>
        DateTimeOffset.UtcNow >= lease.ExpiresAt - ExpirySafetyMargin;

    private async Task<UpstashS3Lease> ExchangeCredentialsAsync(CancellationToken ct)
    {
        var httpClient = _httpClientFactory.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{AgentUrl}/v1/credentials")
        {
            // The endpoint expects a JSON body; an empty object is accepted (verified live).
            Content = JsonContent.Create(new { })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);

        using var response = await httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Upstash Blob S3 credential exchange failed with HTTP {(int)response.StatusCode}: {Truncate(errorBody, 200)}");
        }

        var credentials = await response.Content.ReadFromJsonAsync<S3CredentialsResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Upstash Blob S3 credential exchange returned an empty response");

        if (string.IsNullOrWhiteSpace(credentials.AccessKeyId)
            || string.IsNullOrWhiteSpace(credentials.SecretAccessKey)
            || string.IsNullOrWhiteSpace(credentials.SessionToken)
            || string.IsNullOrWhiteSpace(credentials.Bucket)
            || string.IsNullOrWhiteSpace(credentials.Endpoint))
        {
            throw new InvalidOperationException("Upstash Blob S3 credential exchange returned an incomplete payload");
        }

        var client = new AmazonS3Client(
            new SessionAWSCredentials(credentials.AccessKeyId, credentials.SecretAccessKey, credentials.SessionToken),
            new AmazonS3Config
            {
                ServiceURL = credentials.Endpoint,
                AuthenticationRegion = string.IsNullOrWhiteSpace(credentials.Region) ? "auto" : credentials.Region,
                // Path-style addressing keeps the bucket out of the host name — the safest
                // mode for S3-compatible stores such as Cloudflare R2.
                ForcePathStyle = true
            });

        return new UpstashS3Lease(
            client,
            credentials.Bucket,
            DateTimeOffset.FromUnixTimeSeconds(credentials.ExpiresAt));
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";

    private sealed class S3CredentialsResponse
    {
        [JsonPropertyName("accessKeyId")] public string? AccessKeyId { get; init; }
        [JsonPropertyName("secretAccessKey")] public string? SecretAccessKey { get; init; }
        [JsonPropertyName("sessionToken")] public string? SessionToken { get; init; }
        [JsonPropertyName("endpoint")] public string? Endpoint { get; init; }
        [JsonPropertyName("bucket")] public string? Bucket { get; init; }
        [JsonPropertyName("region")] public string? Region { get; init; }
        [JsonPropertyName("expiresAt")] public long ExpiresAt { get; init; }
    }
}
