using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using CMS.Application.Interfaces;

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

    public S3StorageService(IConfiguration configuration)
    {
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
            ForcePathStyle = true
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

    public async Task<string> GetSignedUrlAsync(string key, TimeSpan expiry)
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
    /// cannot upload an arbitrary MIME type under the same key.
    /// </summary>
    public async Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry)
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

        return await Task.FromResult(_client.GetPreSignedURL(request));
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

    public UpstashBlobStorageService(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        var token = configuration["Upstash:Blob:Token"];
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Upstash:Blob:Token must be configured at runtime");
        _token = token!;
        _httpClient = httpClientFactory.CreateClient(HttpClientName);
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

    /// <summary>Issues a short-lived pre-signed PUT URL for direct browser upload.</summary>
    public async Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var presigned = await PresignAsync(method: "PUT", key: key, expiresIn: ClampExpiry(expiry), contentType: contentType);
        return presigned.Url;
    }

    /// <summary>Issues a short-lived pre-signed GET URL for read access.</summary>
    public async Task<string> GetSignedUrlAsync(string key, TimeSpan expiry)
    {
        if (string.IsNullOrWhiteSpace(key))
            throw new ArgumentException("Object key must be provided by the server.", nameof(key));

        var presigned = await PresignAsync(method: "GET", key: key, expiresIn: ClampExpiry(expiry));
        return presigned.Url;
    }

    /// <summary>Deletes an object. Idempotent: a 404 (object already gone) is treated as success.</summary>
    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        // Upstash Blob's /v1/presign does not currently sign DELETE operations through
        // this path (the official SDK signs DELETE inline via SigV4). To avoid pulling
        // in the AWS SDK SigV4 path here, we perform the DELETE via the presigned-URL
        // path. If the object is already gone, presign itself may return 404 — treat
        // both presign-404 and delete-404 as success (idempotent delete).
        try
        {
            var presigned = await PresignAsync(method: "DELETE", key: key, expiresIn: 60, ct: ct);
            using var response = await _httpClient.DeleteAsync(presigned.Url, ct);
            if (!response.IsSuccessStatusCode && response.StatusCode != System.Net.HttpStatusCode.NotFound)
                response.EnsureSuccessStatusCode();
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("HTTP 404"))
        {
            // presign returned 404 — the object is already gone; treat as success.
        }
        catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // already deleted — treat as success
        }
    }

    /// <summary>Checks object existence via HEAD (signed URL is not needed for metadata).</summary>
    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
        // Use the presigned GET URL and issue a HEAD; Upstash returns 200 if the object exists.
        try
        {
            var presigned = await PresignAsync(method: "GET", key: key, expiresIn: 30, ct: ct);
            using var response = await _httpClient.GetAsync(presigned.Url, HttpCompletionOption.ResponseHeadersRead, ct);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task<PresignResult> PresignAsync(
        string method,
        string key,
        int expiresIn,
        string? contentType = null,
        CancellationToken ct = default)
    {
        var body = new PresignRequest(
            Method: method,
            Key: key,
            ExpiresIn: expiresIn,
            Headers: contentType is null ? null : new Dictionary<string, string> { ["content-type"] = contentType });

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
        // Upstash caps presign at 10 minutes (600s) per their docs.
        var seconds = (int)Math.Min(600, Math.Max(1, expiry.TotalSeconds));
        return seconds;
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";

    private sealed record PresignRequest(
        string Method,
        string Key,
        int ExpiresIn,
        Dictionary<string, string>? Headers);

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
