using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services;

/// <summary>
/// A short-lived S3 client bound to the Upstash Blob (Cloudflare R2) endpoint, together
/// with the bucket name the credentials are scoped to and the exact <see cref="ServiceURL"/>
/// the client addresses (logged at mint time; carries no credentials).
/// </summary>
public sealed record UpstashS3Lease(IAmazonS3 Client, string Bucket, string ServiceURL, DateTimeOffset ExpiresAt);

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
/// operations the presign endpoint cannot serve (DELETE, LIST, multipart initiate/abort)
/// must go through the S3-compatible API with SigV4 credentials.
///
/// HOTFIX 10.8c (1.A): production logs showed the minted client addressing
/// <c>https://&lt;bucket-proxy&gt;.upstash.io/</c> instead of an R2 endpoint, and every S3
/// call answering <c>AmazonS3Exception: Access Denied</c>. The official @upstash/blob SDK
/// (v0.0.11) validates the same field — it refuses any <c>endpoint</c> whose host does not
/// end with <c>.r2.cloudflarestorage.com</c> ("credentials response named an unexpected
/// endpoint"). This factory now mirrors that contract:
///   1. an explicit <c>Upstash:Blob:S3Endpoint</c> override wins when configured (ops
///      escape hatch — forces the correct R2 URL without a code deploy);
///   2. otherwise the first endpoint-bearing field that IS an R2 host is chosen;
///   3. otherwise the legacy <c>endpoint</c> field is used as a last resort, with a loud
///      warning naming the exact non-R2 ServiceURL (the S3 call itself will then fail
///      and surface as a clean 503 at the API boundary instead of a bare 500).
/// The exact ServiceURL actually used is logged on every mint (no tokens — the URL is
/// host-only) and carried on the lease.
///
/// HOTFIX 10.8d (1.A): with the endpoint verified correct, R2 STILL answered
/// <c>403 Access Denied</c> on initiate-upload. Root cause: AWS SDK for .NET 3.7.4xx+
/// defaults to <c>RequestChecksumCalculation = WHEN_SUPPORTED</c> — it decorates
/// CreateMultipartUpload/PutObject with <c>x-amz-sdk-checksum-algorithm</c> (and
/// <c>x-amz-checksum-crc32</c>) headers that Cloudflare R2 rejects. The SDK was upgraded
/// to 3.7.421.10 (the config knobs exist only in late 3.7.4xx) and every client minted
/// here pins <c>RequestChecksumCalculation = WHEN_REQUIRED</c> +
/// <c>ResponseChecksumValidation = WHEN_REQUIRED</c> — no checksum headers unless the
/// operation itself requires one. Wire-level proof: docs/ops/ + the 10.8d report.
///
/// Configuration keys:
///   Upstash:Blob:Token — the UPSTASH_BLOB_TOKEN (secret; never logged).
///   Upstash:Blob:S3Endpoint — optional R2 endpoint override, e.g.
///     https://&lt;account-id&gt;.r2.cloudflarestorage.com (never logged with credentials;
///     the URL contains none).
/// </summary>
public sealed class UpstashS3ClientFactory : IUpstashS3ClientFactory
{
    private const string AgentUrl = "https://blob.upstash.io";
    private const string HttpClientName = "UpstashBlob";
    private const string R2HostSuffix = ".r2.cloudflarestorage.com";

    /// <summary>Credentials are refreshed this long before their stated expiry.</summary>
    private static readonly TimeSpan ExpirySafetyMargin = TimeSpan.FromMinutes(5);

    /// <summary>Back-off before the single retry of a transient exchange failure.</summary>
    private static readonly TimeSpan ExchangeRetryDelay = TimeSpan.FromMilliseconds(750);

    /// <summary>
    /// Endpoint-bearing JSON fields scanned on the credentials response, in priority
    /// order. The official SDK reads <c>endpoint</c>; the alternates cover agent-side
    /// renames without guessing which one Upstash ships next.
    /// </summary>
    private static readonly string[] EndpointCandidateFields = ["endpoint", "s3Endpoint", "r2Endpoint", "url"];

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<UpstashS3ClientFactory> _logger;
    private readonly string _token;
    private readonly string? _endpointOverride;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private UpstashS3Lease? _cached;

    public UpstashS3ClientFactory(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<UpstashS3ClientFactory> logger)
    {
        var token = configuration["Upstash:Blob:Token"];
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Upstash:Blob:Token must be configured at runtime");
        _token = token!;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _endpointOverride = NormalizeEndpoint(configuration["Upstash:Blob:S3Endpoint"], "Upstash:Blob:S3Endpoint override");
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

            // Push 6: the Upstash credential agent occasionally answers with a
            // transient 429/5xx (observed in production as a one-off 500 on the
            // episode initiate-upload path). Retry once, after a short back-off,
            // before surfacing the failure to the caller.
            var lease = await ExchangeWithRetryAsync(ct);
            _cached = lease;
            return lease;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    private async Task<UpstashS3Lease> ExchangeWithRetryAsync(CancellationToken ct)
    {
        try
        {
            return await ExchangeCredentialsAsync(ct);
        }
        catch (Exception ex) when (IsTransientExchangeFailure(ex))
        {
            await Task.Delay(ExchangeRetryDelay, ct);
            return await ExchangeCredentialsAsync(ct);
        }
    }

    /// <summary>
    /// Transient upstream failures worth one retry: network/timeout errors talking to
    /// the Upstash agent, or exchange responses carrying HTTP 429 / 5xx. Authentication
    /// (401/403) and payload errors are NOT retried — retrying cannot fix them.
    /// </summary>
    private static bool IsTransientExchangeFailure(Exception ex) =>
        ex is HttpRequestException
            || ex is TaskCanceledException
            || (ex is UpstashExchangeException upstream
                && (upstream.StatusCode == HttpStatusCode.TooManyRequests || (int)upstream.StatusCode >= 500));

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
            throw new UpstashExchangeException(
                $"Upstash Blob S3 credential exchange failed with HTTP {(int)response.StatusCode}: {Truncate(errorBody, 200)}",
                response.StatusCode);
        }

        // Hotfix 10.8c (1.A): parse the payload as a raw JSON document so endpoint-bearing
        // fields beyond the legacy "endpoint" can be inspected — the production incident
        // showed the agent handing out a non-R2 proxy URL in that field.
        JsonDocument payload;
        try
        {
            var raw = await response.Content.ReadAsStringAsync(ct);
            payload = JsonDocument.Parse(raw);
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException("Upstash Blob S3 credential exchange returned a malformed payload", ex);
        }

        using (payload)
        {
            var root = payload.RootElement;
            var accessKeyId = GetStringOrNull(root, "accessKeyId");
            var secretAccessKey = GetStringOrNull(root, "secretAccessKey");
            var sessionToken = GetStringOrNull(root, "sessionToken");
            var bucket = GetStringOrNull(root, "bucket");
            var region = GetStringOrNull(root, "region");

            if (string.IsNullOrWhiteSpace(accessKeyId)
                || string.IsNullOrWhiteSpace(secretAccessKey)
                || string.IsNullOrWhiteSpace(sessionToken)
                || string.IsNullOrWhiteSpace(bucket))
            {
                throw new InvalidOperationException("Upstash Blob S3 credential exchange returned an incomplete payload");
            }

            // ---- Endpoint selection (R2-preference; see class doc for the contract) ----
            string serviceUrl;
            string endpointSource;
            if (_endpointOverride is not null)
            {
                serviceUrl = _endpointOverride;
                endpointSource = "config-override";
            }
            else
            {
                var r2Candidate = EndpointCandidateFields
                    .Select(field => (field, value: GetStringOrNull(root, field)))
                    .Where(candidate => IsR2Endpoint(candidate.value))
                    .FirstOrDefault();

                if (r2Candidate.value is not null)
                {
                    serviceUrl = r2Candidate.value;
                    endpointSource = $"response.{r2Candidate.field}";
                }
                else
                {
                    var legacy = GetStringOrNull(root, "endpoint");
                    if (string.IsNullOrWhiteSpace(legacy))
                        throw new InvalidOperationException(
                            "Upstash Blob S3 credential exchange returned an incomplete payload (no endpoint)");
                    serviceUrl = NormalizeEndpoint(legacy, "response.endpoint")!;
                    endpointSource = "response.endpoint(non-R2)";
                }
            }

            var normalizedRegion = string.IsNullOrWhiteSpace(region) ? "auto" : region;

            var client = new AmazonS3Client(
                new SessionAWSCredentials(accessKeyId, secretAccessKey, sessionToken),
                new AmazonS3Config
                {
                    ServiceURL = serviceUrl,
                    AuthenticationRegion = normalizedRegion,
                    // Path-style addressing keeps the bucket out of the host name — the safest
                    // mode for S3-compatible stores such as Cloudflare R2 (matches the
                    // official @upstash/blob SDK: {endpoint}/{bucket}/{key}).
                    ForcePathStyle = true,
                    // HOTFIX 10.8d (1.A) — CRITICAL R2 COMPATIBILITY FIX:
                    // the SDK's WHEN_SUPPORTED default decorates CreateMultipartUpload and
                    // PutObject with x-amz-sdk-checksum-algorithm / x-amz-checksum-crc32
                    // headers; Cloudflare R2 rejects them with 403 Access Denied. WHEN_REQUIRED
                    // restores the classic behavior — no checksum headers unless the operation
                    // actually requires one (none of ours do).
                    RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                    ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
                });

            var expiresAtUnix = root.TryGetProperty("expiresAt", out var expiresElement)
                && expiresElement.ValueKind == JsonValueKind.Number
                && expiresElement.TryGetInt64(out var expires)
                    ? expires
                    : 0;
            if (expiresAtUnix <= 0)
                throw new InvalidOperationException(
                    "Upstash Blob S3 credential exchange returned an incomplete payload (no expiresAt)");
            var expiresAt = DateTimeOffset.FromUnixTimeSeconds(expiresAtUnix);

            // THE deliverable log: the exact ServiceURL this client now addresses. The URL
            // is host-only — it carries no credentials, no query string, no token.
            _logger.LogInformation(
                "Upstash S3 lease minted: ServiceURL={ServiceURL}, Bucket={Bucket}, Region={Region}, EndpointSource={EndpointSource}, ExpiresAt={ExpiresAt:O}",
                serviceUrl, bucket, normalizedRegion, endpointSource, expiresAt);

            if (!IsR2Endpoint(serviceUrl))
            {
                _logger.LogWarning(
                    "Upstash credentials named a NON-R2 endpoint ({ServiceURL}); the official @upstash/blob SDK refuses such responses. " +
                    "S3 operations against it may answer 'Access Denied'. Configure Upstash:Blob:S3Endpoint with the bucket's https://<account>.r2.cloudflarestorage.com URL to force the correct endpoint.",
                    serviceUrl);
            }

            return new UpstashS3Lease(client, bucket, serviceUrl, expiresAt);
        }
    }

    /// <summary>An endpoint qualifies as R2 only when it is absolute https on a *.r2.cloudflarestorage.com host.</summary>
    private static bool IsR2Endpoint(string? endpoint)
    {
        if (string.IsNullOrWhiteSpace(endpoint))
            return false;
        if (!Uri.TryCreate(endpoint.Trim(), UriKind.Absolute, out var uri))
            return false;
        return uri.Scheme == Uri.UriSchemeHttps
            && uri.Host.EndsWith(R2HostSuffix, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Normalizes a configured endpoint (trim + strip trailing slashes) and validates it is
    /// an absolute https URL. Returns null for null/blank input so overrides stay optional.
    /// </summary>
    private static string? NormalizeEndpoint(string? endpoint, string what)
    {
        if (string.IsNullOrWhiteSpace(endpoint))
            return null;
        var trimmed = endpoint.Trim().TrimEnd('/');
        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidOperationException(
                $"{what} must be an absolute https URL (got: '{trimmed}')");
        return trimmed;
    }

    private static string? GetStringOrNull(JsonElement root, string property) =>
        root.ValueKind == JsonValueKind.Object
        && root.TryGetProperty(property, out var element)
        && element.ValueKind == JsonValueKind.String
            ? element.GetString()
            : null;

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";

    /// <summary>
    /// The Upstash credential exchange answered with a non-success HTTP status.
    /// Carries the status so transient (429/5xx) failures can be retried once
    /// while authentication/payload errors surface immediately.
    /// </summary>
    public sealed class UpstashExchangeException : Exception
    {
        public HttpStatusCode StatusCode { get; }

        public UpstashExchangeException(string message, HttpStatusCode statusCode)
            : base(message)
        {
            StatusCode = statusCode;
        }
    }
}
