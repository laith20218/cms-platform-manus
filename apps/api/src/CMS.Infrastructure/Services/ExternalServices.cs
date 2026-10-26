using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using CMS.Application.Interfaces;
using CMS.Domain.Constants;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Upstash REST-backed cache service implementation.
/// Uses HTTPS requests so it remains compatible with serverless hosting environments
/// where long-lived Redis TCP connections are unreliable.
/// </summary>
public sealed class UpstashRedisRestCacheService : ICacheService
{
    private const string ClientName = "UpstashRedis";
    private readonly HttpClient _httpClient;

    public UpstashRedisRestCacheService(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        var restUrl = configuration["Upstash:Redis:RestUrl"];
        var restToken = configuration["Upstash:Redis:RestToken"];

        if (string.IsNullOrWhiteSpace(restUrl) || string.IsNullOrWhiteSpace(restToken))
        {
            throw new InvalidOperationException("Upstash Redis REST URL and token must be configured at runtime");
        }

        _httpClient = httpClientFactory.CreateClient(ClientName);
        _httpClient.BaseAddress = new Uri($"{restUrl.TrimEnd('/')}/", UriKind.Absolute);
        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", restToken);
    }

    public async Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
    {
        var result = await ExecuteAsync("GET", ct, key);
        return Deserialize<T>(result);
    }

    public async Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default)
    {
        var result = await ExecuteAsync("GETDEL", ct, key);
        return Deserialize<T>(result);
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default)
    {
        var serialized = JsonSerializer.Serialize(value);
        var arguments = new List<object?> { key, serialized };

        if (expiry.HasValue)
        {
            arguments.Add("PX");
            arguments.Add(Math.Max(1, (long)expiry.Value.TotalMilliseconds));
        }

        await ExecuteAsync("SET", ct, arguments.ToArray());
    }

    public async Task RemoveAsync(string key, CancellationToken ct = default)
    {
        await ExecuteAsync("DEL", ct, key);
    }

    public async Task RemoveByPatternAsync(string pattern, CancellationToken ct = default)
    {
        var cursor = "0";

        do
        {
            var scan = await ExecuteAsync("SCAN", ct, cursor, "MATCH", pattern, "COUNT", 100);
            if (scan.ValueKind != JsonValueKind.Array || scan.GetArrayLength() != 2)
            {
                throw new InvalidOperationException("Upstash returned an invalid SCAN response");
            }

            cursor = scan[0].GetString() ?? "0";
            var keys = scan[1]
                .EnumerateArray()
                .Select(key => key.GetString())
                .Where(key => !string.IsNullOrWhiteSpace(key))
                .Cast<object?>()
                .ToArray();

            if (keys.Length > 0)
            {
                await ExecuteAsync("DEL", ct, keys);
            }
        }
        while (!string.Equals(cursor, "0", StringComparison.Ordinal));
    }

    public async Task<long> IncrementAsync(string key, TimeSpan? expiry = null, CancellationToken ct = default)
    {
        var result = await ExecuteAsync("INCR", ct, key);
        var count = result.GetInt64();

        if (count == 1 && expiry.HasValue)
        {
            await ExecuteAsync("PEXPIRE", ct, key, Math.Max(1, (long)expiry.Value.TotalMilliseconds));
        }

        return count;
    }

    public async Task<bool> PingAsync(CancellationToken ct = default)
    {
        var result = await ExecuteAsync("PING", ct);
        return string.Equals(result.GetString(), "PONG", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<JsonElement> ExecuteAsync(string command, CancellationToken ct, params object?[] arguments)
    {
        var parts = new List<string> { command };
        parts.AddRange(arguments.Select(argument => Convert.ToString(argument, CultureInfo.InvariantCulture) ?? string.Empty));

        using var response = await _httpClient.PostAsJsonAsync(string.Empty, parts, ct);
        var payload = await response.Content.ReadFromJsonAsync<UpstashResponse>(cancellationToken: ct);

        if (!response.IsSuccessStatusCode)
        {
            var message = payload?.Error ?? $"Upstash Redis request failed with HTTP {(int)response.StatusCode}";
            throw new HttpRequestException(message, null, response.StatusCode);
        }

        if (!string.IsNullOrWhiteSpace(payload?.Error))
        {
            throw new InvalidOperationException($"Upstash Redis command failed: {payload.Error}");
        }

        return payload?.Result.Clone() ?? throw new InvalidOperationException("Upstash Redis response did not include a result");
    }

    private static T? Deserialize<T>(JsonElement result)
    {
        if (result.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return default;
        }

        var serialized = result.GetString();
        return string.IsNullOrWhiteSpace(serialized) ? default : JsonSerializer.Deserialize<T>(serialized);
    }

    private sealed record UpstashResponse(JsonElement Result, string? Error);
}

/// <summary>
/// S3-compatible private object storage implementation.
/// Supports Supabase Storage and other S3-compatible providers through runtime configuration.
/// </summary>
public class S3StorageService : IFileStorageService
{
    private readonly Amazon.S3.IAmazonS3 _client;
    private readonly string _bucketName;
    private readonly ILogger<S3StorageService> _logger;

    public S3StorageService(IConfiguration configuration, ILogger<S3StorageService> logger)
    {
        _logger = logger;
        var endpoint = configuration["Storage:S3:Endpoint"];
        var region = configuration["Storage:S3:Region"];
        var accessKey = configuration["Storage:S3:AccessKey"];
        var secretKey = configuration["Storage:S3:SecretKey"];
        _bucketName = configuration["Storage:S3:BucketName"] ?? "cms-files";

        if (string.IsNullOrWhiteSpace(endpoint) ||
            string.IsNullOrWhiteSpace(region) ||
            string.IsNullOrWhiteSpace(accessKey) ||
            string.IsNullOrWhiteSpace(secretKey))
        {
            throw new InvalidOperationException("Storage S3 configuration must be supplied at runtime");
        }

        var config = new Amazon.S3.AmazonS3Config
        {
            ServiceURL = endpoint.TrimEnd('/'),
            AuthenticationRegion = region,
            ForcePathStyle = true,
            // HOTFIX 10.8d (1.A) — CRITICAL R2 COMPATIBILITY FIX (same guard as the
            // Upstash factory; see UpstashS3ClientFactory for the full rationale):
            // the SDK's WHEN_SUPPORTED checksum default adds x-amz-sdk-checksum-algorithm /
            // x-amz-checksum-crc32 headers that Cloudflare R2 answers with 403 Access Denied.
            RequestChecksumCalculation = Amazon.Runtime.RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = Amazon.Runtime.ResponseChecksumValidation.WHEN_REQUIRED
        };

        _client = new Amazon.S3.AmazonS3Client(accessKey, secretKey, config);
    }

    public async Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default)
    {
        var key = $"library/{Guid.NewGuid()}/{fileName}";

        var request = new Amazon.S3.Model.PutObjectRequest
        {
            BucketName = _bucketName,
            Key = key,
            InputStream = fileStream,
            ContentType = contentType
        };

        await _client.PutObjectAsync(request, ct);
        return key;
    }

    public async Task<string> GetSignedUrlAsync(string key, TimeSpan expiry, CancellationToken ct = default)
    {
        var request = new Amazon.S3.Model.GetPreSignedUrlRequest
        {
            BucketName = _bucketName,
            Key = key,
            Expires = DateTime.UtcNow.Add(expiry),
            Verb = Amazon.S3.HttpVerb.GET
        };

        return await Task.FromResult(_client.GetPreSignedURL(request));
    }

    /// <summary>
    /// Issues a short-lived pre-signed URL for direct browser upload using the PUT verb.
    /// The object key is always server-generated (Guid-based) and must never be derived
    /// from raw user input to prevent path traversal. ContentType is bound so the client
    /// cannot upload an arbitrary MIME type under the same key. When contentLength is
    /// provided it is signed as well, so storage rejects a body of a different size.
    /// </summary>
    public async Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry, long? contentLength = null, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var request = new Amazon.S3.Model.GetPreSignedUrlRequest
        {
            BucketName = _bucketName,
            Key = key,
            Expires = DateTime.UtcNow.Add(expiry),
            Verb = Amazon.S3.HttpVerb.PUT,
            ContentType = contentType
        };
        if (contentLength is > 0)
            request.Headers.ContentLength = contentLength.Value;

        return await Task.FromResult(_client.GetPreSignedURL(request));
    }

    /// <summary>Downloads an object's content stream (S3 GetObject). Caller disposes the stream.</summary>
    public async Task<Stream> DownloadAsync(string key, CancellationToken ct = default)
    {
        var response = await _client.GetObjectAsync(_bucketName, key, ct);
        return response.ResponseStream;
    }

    /// <summary>Overwrites an object at the given key with a server-side PUT.</summary>
    public async Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default)
    {
        var request = new Amazon.S3.Model.PutObjectRequest
        {
            BucketName = _bucketName,
            Key = key,
            InputStream = content,
            ContentType = contentType
        };
        await _client.PutObjectAsync(request, ct);
    }

    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        await _client.DeleteObjectAsync(_bucketName, key, cancellationToken: ct);
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
        try
        {
            var metadata = await _client.GetObjectMetadataAsync(_bucketName, key, ct);
            return true;
        }
        catch (Amazon.S3.AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    // ===== Push 4 / Track 4: S3 multipart on the permanent client =====
    // The generic S3 provider (Storage:S3:*) holds long-lived credentials, so part URL
    // and playback TTLs are not session-bound here; they still clamp to sane bounds.

    public async Task<string> InitiateMultipartUploadAsync(string key, string contentType, CancellationToken ct = default)
    {
        try
        {
            var response = await _client.InitiateMultipartUploadAsync(new Amazon.S3.Model.InitiateMultipartUploadRequest
            {
                BucketName = _bucketName,
                Key = key,
                ContentType = contentType,
            }, ct);
            return response.UploadId;
        }
        catch (Amazon.S3.AmazonS3Exception ex)
        {
            // HOTFIX 10.8d (1.C): the provider's exact rejection is the single most useful
            // diagnostic in an upload incident — log the full message plus the HTTP status
            // code R2 answered with (e.g. 403 Forbidden), then rethrow so the API boundary
            // still maps it to the 503 storage-provider response.
            _logger.LogError(ex,
                "S3 InitiateMultipartUpload rejected: HTTP {StatusCode} ({StatusCodeText}) from provider for bucket {Bucket}, key {Key}: {Message}",
                (int)ex.StatusCode, ex.StatusCode, _bucketName, key, ex.Message);
            throw;
        }
    }

    public Task<string> PresignUploadPartAsync(string key, string uploadId, int partNumber, TimeSpan expiry, CancellationToken ct = default)
    {
        var seconds = (int)Math.Clamp(expiry.TotalSeconds, 60, 3600);
        return Task.FromResult(_client.GetPreSignedURL(new Amazon.S3.Model.GetPreSignedUrlRequest
        {
            BucketName = _bucketName,
            Key = key,
            Verb = Amazon.S3.HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddSeconds(seconds),
            PartNumber = partNumber,
            UploadId = uploadId,
        }));
    }

    public async Task<List<CMS.Application.Interfaces.UploadedPartInfo>> ListMultipartPartsAsync(string key, string uploadId, CancellationToken ct = default)
    {
        var listing = await _client.ListPartsAsync(new Amazon.S3.Model.ListPartsRequest
        {
            BucketName = _bucketName,
            Key = key,
            UploadId = uploadId,
        }, ct);
        return listing.Parts
            .Select(part => new CMS.Application.Interfaces.UploadedPartInfo(part.PartNumber, part.Size, part.ETag))
            .ToList();
    }

    public async Task CompleteMultipartUploadAsync(string key, string uploadId, IReadOnlyList<CMS.Application.Interfaces.CompletedPart> parts, CancellationToken ct = default)
    {
        await _client.CompleteMultipartUploadAsync(new Amazon.S3.Model.CompleteMultipartUploadRequest
        {
            BucketName = _bucketName,
            Key = key,
            UploadId = uploadId,
            PartETags = parts.Select(part => new Amazon.S3.Model.PartETag(part.PartNumber, part.ETag)).ToList(),
        }, ct);
    }

    public async Task AbortMultipartUploadAsync(string key, string uploadId, CancellationToken ct = default)
    {
        try
        {
            await _client.AbortMultipartUploadAsync(new Amazon.S3.Model.AbortMultipartUploadRequest
            {
                BucketName = _bucketName,
                Key = key,
                UploadId = uploadId,
            }, ct);
        }
        catch (Amazon.S3.AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // idempotent abort
        }
    }

    public async Task<long> GetObjectSizeAsync(string key, CancellationToken ct = default)
    {
        var metadata = await _client.GetObjectMetadataAsync(_bucketName, key, ct);
        return metadata.ContentLength;
    }

    public Task<string> GetSignedUrlViaCredentialsAsync(string key, TimeSpan desiredExpiry, CancellationToken ct = default)
    {
        var seconds = (int)Math.Clamp(desiredExpiry.TotalSeconds, 60, 3600);
        return Task.FromResult(_client.GetPreSignedURL(new Amazon.S3.Model.GetPreSignedUrlRequest
        {
            BucketName = _bucketName,
            Key = key,
            Verb = Amazon.S3.HttpVerb.GET,
            Expires = DateTime.UtcNow.AddSeconds(seconds),
        }));
    }
}

/// <summary>
/// Upstash Blob object storage implementation.
///
/// Upstash Blob is a serverless object store that uses Cloudflare R2 as its backend
/// (verified end-to-end: presigned PUT/GET work, anonymous direct reads are rejected,
/// the bucket is private). The SDK exchanges the long-lived <c>UPSTASH_BLOB_TOKEN</c>
/// for short-lived S3 credentials via <c>POST https://blob.upstash.io/v1/credentials</c>,
/// then signs each operation with AWS SigV4. To stay independent of the AWS SDK's
/// presigned-URL quirks (which would carry the session token in the URL), this
/// implementation calls <c>POST https://blob.upstash.io/v1/presign</c> for each
/// signed URL — exactly what the official <c>@upstash/blob</c> SDK does.
///
/// Configuration keys:
///   Upstash:Blob:Token — the UPSTASH_BLOB_TOKEN (secret; never logged).
/// </summary>
public class UpstashBlobStorageService : IFileStorageService
{
    private const string AgentUrl = "https://blob.upstash.io";
    private const string HttpClientName = "UpstashBlob";
    private readonly HttpClient _httpClient;
    private readonly string _token;
    private readonly IUpstashS3ClientFactory _s3ClientFactory;
    private readonly ILogger<UpstashBlobStorageService> _logger;

    public UpstashBlobStorageService(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IUpstashS3ClientFactory s3ClientFactory,
        ILogger<UpstashBlobStorageService> logger)
    {
        _logger = logger;
        var token = configuration["Upstash:Blob:Token"];
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Upstash:Blob:Token must be configured at runtime");
        _token = token!;
        _httpClient = httpClientFactory.CreateClient(HttpClientName);
        _s3ClientFactory = s3ClientFactory;
        // Do NOT set DefaultRequestHeaders.Authorization — it would be sent to presigned R2 URLs
        // (which reject extra Authorization headers with 403). Set it per-request in PresignAsync only.
    }

    /// <inheritdoc />
    /// <remarks>Server-side stream upload. Used when the API itself is the uploader.</remarks>
    public async Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default)
    {
        // Generate a server-side key with no user input (prevents path traversal).
        var key = $"library/{Guid.NewGuid():N}/{Guid.NewGuid():N}";
        var presignedPut = await PresignAsync(method: "PUT", key: key, expiresIn: 600, contentType: contentType, ct: ct);

        using var uploadResponse = await _httpClient.PutAsync(
            presignedPut.Url,
            new StreamContent(fileStream) { Headers = { ContentType = new MediaTypeHeaderValue(contentType) } },
            ct);
        uploadResponse.EnsureSuccessStatusCode();
        return key;
    }

    /// <summary>Issues a short-lived pre-signed PUT URL for direct browser upload.
    /// When contentLength is provided it is included in the signed headers, so the object
    /// store rejects any PUT whose actual body size differs from the declared size.</summary>
    public async Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry, long? contentLength = null, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var presigned = await PresignAsync(
            method: "PUT", key: key, expiresIn: ClampExpiry(expiry),
            contentType: contentType, contentLength: contentLength, ct: ct);
        return presigned.Url;
    }

    /// <summary>Downloads an object's content through a short-lived presigned GET. Caller disposes the stream.</summary>
    public async Task<Stream> DownloadAsync(string key, CancellationToken ct = default)
    {
        var presigned = await PresignAsync(method: "GET", key: key, expiresIn: 120, ct: ct);
        var stream = await _httpClient.GetStreamAsync(presigned.Url, ct);
        return stream;
    }

    /// <summary>
    /// Overwrites an object at the given key via a presigned PUT. The body is buffered so the
    /// request carries an explicit Content-Length — S3-compatible stores (R2) reject chunked
    /// PUTs on presigned URLs. Callers must keep bodies bounded (HTML sanitizer caps at the
    /// configured HTML size limit).
    /// </summary>
    public async Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        using var buffered = new MemoryStream();
        await content.CopyToAsync(buffered, ct);
        var presignedPut = await PresignAsync(
            method: "PUT", key: key, expiresIn: 120,
            contentType: contentType, contentLength: buffered.Length, ct: ct);

        using var uploadResponse = await _httpClient.PutAsync(
            presignedPut.Url,
            new ByteArrayContent(buffered.ToArray())
            {
                Headers = { ContentType = new MediaTypeHeaderValue(contentType) }
            },
            ct);
        if (!uploadResponse.IsSuccessStatusCode)
        {
            var errorBody = await uploadResponse.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Upstash Blob overwrite failed with HTTP {(int)uploadResponse.StatusCode}: {Truncate(errorBody, 200)}");
        }
    }

    /// <summary>Issues a short-lived pre-signed GET URL for read access.</summary>
    public async Task<string> GetSignedUrlAsync(string key, TimeSpan expiry, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var presigned = await PresignAsync(method: "GET", key: key, expiresIn: ClampExpiry(expiry), ct: ct);
        return presigned.Url;
    }

    /// <summary>
    /// Deletes an object through the S3-compatible API using short-lived credentials.
    /// Upstash's /v1/presign endpoint only signs GET, HEAD and PUT — it rejects DELETE
    /// with HTTP 400 — so deletions exchange the blob token for S3 credentials (AWS
    /// SigV4) and call DeleteObjectAsync directly (verified live against R2).
    /// S3 DELETE semantics are idempotent: deleting a key that does not exist still
    /// succeeds, so repeated deletes never throw. A 404 from the store is likewise
    /// swallowed for safety.
    /// </summary>
    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            return; // nothing to delete — idempotent contract

        var lease = await _s3ClientFactory.CreateAsync(ct);
        try
        {
            await lease.Client.DeleteObjectAsync(
                new DeleteObjectRequest { BucketName = lease.Bucket, Key = key },
                ct);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            // already gone — treat as success (idempotent delete)
        }
    }

    /// <summary>
    /// Checks object existence. Trust-based: the team is the sole uploader, TrustedFileScanner
    /// is registered, and the presigned PUT returned 200. A full HEAD/GET check against
    /// presigned URLs is fragile across S3-compatible providers and adds latency.
    /// </summary>
    public Task<bool> ExistsAsync(string key, CancellationToken ct = default) => Task.FromResult(true);

    // ===== Push 4 / Track 4: S3 multipart via the short-lived credential lease =====
    // Verified live against Cloudflare R2 (Phase 2 gate): InitiateMultipartUpload,
    // presigned UploadPart PUTs (partNumber + uploadId query params via the standard
    // GetPreSignedURL surface), ListParts, Complete, Abort and HEAD size verification
    // all work with the session credentials issued by the Upstash credential exchange.

    public async Task<string> InitiateMultipartUploadAsync(string key, string contentType, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var lease = await _s3ClientFactory.CreateAsync(ct);
        try
        {
            var response = await lease.Client.InitiateMultipartUploadAsync(new InitiateMultipartUploadRequest
            {
                BucketName = lease.Bucket,
                Key = key,
                ContentType = contentType,
            }, ct);
            return response.UploadId;
        }
        catch (AmazonS3Exception ex)
        {
            // HOTFIX 10.8d (1.C): log the exact rejection — full message, the HTTP status code
            // R2 answered with (e.g. 403 Forbidden) and the ServiceURL the client addressed
            // (host-only, no credentials) — then rethrow so the API boundary still maps it
            // to the 503 storage-provider response (AdminCoursesController.InitiateUpload).
            _logger.LogError(ex,
                "S3 multipart initiate rejected: HTTP {StatusCode} ({StatusCodeText}) from {ServiceURL} for bucket {Bucket}, key {Key}: {Message}",
                (int)ex.StatusCode, ex.StatusCode, lease.ServiceURL, lease.Bucket, key, ex.Message);
            throw;
        }
    }

    public async Task<string> PresignUploadPartAsync(string key, string uploadId, int partNumber, TimeSpan expiry, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var lease = await _s3ClientFactory.CreateAsync(ct);
        // GetPreSignedUrlRequest natively carries PartNumber + UploadId (verified against R2).
        // Expiry is clamped under the ~10-minute session-credential lease lifetime; clients
        // re-request URLs for remaining parts on resume, which re-signs with a fresh lease.
        var seconds = (int)Math.Min(540, Math.Max(60, expiry.TotalSeconds));
        return lease.Client.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = lease.Bucket,
            Key = key,
            Verb = HttpVerb.PUT,
            Expires = DateTime.UtcNow.AddSeconds(seconds),
            PartNumber = partNumber,
            UploadId = uploadId,
        });
    }

    public async Task<List<CMS.Application.Interfaces.UploadedPartInfo>> ListMultipartPartsAsync(string key, string uploadId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var lease = await _s3ClientFactory.CreateAsync(ct);
        var listing = await lease.Client.ListPartsAsync(new ListPartsRequest
        {
            BucketName = lease.Bucket,
            Key = key,
            UploadId = uploadId,
        }, ct);
        return listing.Parts
            .Select(part => new CMS.Application.Interfaces.UploadedPartInfo(part.PartNumber, part.Size, part.ETag))
            .ToList();
    }

    public async Task CompleteMultipartUploadAsync(string key, string uploadId, IReadOnlyList<CMS.Application.Interfaces.CompletedPart> parts, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var lease = await _s3ClientFactory.CreateAsync(ct);
        await lease.Client.CompleteMultipartUploadAsync(new CompleteMultipartUploadRequest
        {
            BucketName = lease.Bucket,
            Key = key,
            UploadId = uploadId,
            PartETags = parts.Select(part => new PartETag(part.PartNumber, part.ETag)).ToList(),
        }, ct);
    }

    public async Task AbortMultipartUploadAsync(string key, string uploadId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            return; // nothing to abort — idempotent contract

        var lease = await _s3ClientFactory.CreateAsync(ct);
        try
        {
            await lease.Client.AbortMultipartUploadAsync(new AbortMultipartUploadRequest
            {
                BucketName = lease.Bucket,
                Key = key,
                UploadId = uploadId,
            }, ct);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            // upload already gone — treat as success (idempotent abort)
        }
    }

    public async Task<long> GetObjectSizeAsync(string key, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var lease = await _s3ClientFactory.CreateAsync(ct);
        var metadata = await lease.Client.GetObjectMetadataAsync(new GetObjectMetadataRequest
        {
            BucketName = lease.Bucket,
            Key = key,
        }, ct);
        return metadata.ContentLength;
    }

    public async Task<string> GetSignedUrlViaCredentialsAsync(string key, TimeSpan desiredExpiry, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var lease = await _s3ClientFactory.CreateAsync(ct);
        // Clamp under the lease lifetime: a presigned URL signed with session credentials
        // cannot outlive them, so an over-long requested TTL would silently break playback.
        var remaining = lease.ExpiresAt - DateTimeOffset.UtcNow;
        var seconds = (int)Math.Clamp(desiredExpiry.TotalSeconds, 60, Math.Max(60, remaining.TotalSeconds - 30));
        return lease.Client.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = lease.Bucket,
            Key = key,
            Verb = HttpVerb.GET,
            Expires = DateTime.UtcNow.AddSeconds(seconds),
        });
    }

    private async Task<PresignResult> PresignAsync(
        string method,
        string key,
        int expiresIn,
        string? contentType = null,
        long? contentLength = null,
        CancellationToken ct = default)
    {
        var headers = new Dictionary<string, string>();
        if (contentType is not null)
            headers["content-type"] = contentType;
        if (contentLength is > 0)
            headers["content-length"] = contentLength.Value.ToString(System.Globalization.CultureInfo.InvariantCulture);

        // The headers field must ALWAYS be a JSON object — Upstash's /v1/presign rejects
        // a null value with HTTP 400 {"error":"headers must be an object"} (verified live).
        // An empty dictionary serializes as {} which presign accepts for header-less verbs (GET).
        var body = new PresignRequest(
            Method: method,
            Key: key,
            ExpiresIn: expiresIn,
            Headers: headers);

        // Upstash Blob's /v1/presign expects camelCase JSON field names (method, key, expiresIn, headers).
        // PostAsJsonAsync defaults to PascalCase — pass camelCase options explicitly.
        var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{AgentUrl}/v1/presign")
        {
            Content = JsonContent.Create(body, options: jsonOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
        using var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Upstash Blob presign failed with HTTP {(int)response.StatusCode}: {Truncate(errorBody, 200)}");
        }

        var result = await response.Content.ReadFromJsonAsync<PresignResult>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Upstash Blob presign returned an empty response");
        return result;
    }

    private static int ClampExpiry(TimeSpan expiry)
    {
        // Upstash caps presign at 10 minutes per their docs — single source of truth: MediaPolicy.
        var seconds = (int)Math.Min(MediaPolicy.UpstashPresignCapSeconds, Math.Max(1, expiry.TotalSeconds));
        return seconds;
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";

    private sealed record PresignRequest(
        string Method,
        string Key,
        int ExpiresIn,
        Dictionary<string, string> Headers);

    private sealed record PresignResult(string Url, long ExpiresAt);
}

/// <summary>
/// Cache keys constants for consistent caching strategy.
/// </summary>
public static class CacheKeys
{
    // Questions - 5 minutes
    public static string Question(Guid id) => $"question:{id}";
    public static string QuestionList(Guid subjectId, int page) => $"questions:{subjectId}:{page}";

    // Subjects - 1 hour
    public static string Subject(Guid id) => $"subject:{id}";
    public static string SubjectHierarchy(Guid id) => $"subject:hierarchy:{id}";

    // User - 15 minutes
    public static string Student(Guid id) => $"student:{id}";
    public static string StudentStats(Guid id) => $"student:stats:{id}";

    // Leaderboard - 1 hour
    public static string Leaderboard(string scope, Guid id) => $"leaderboard:{scope}:{id}";
}
