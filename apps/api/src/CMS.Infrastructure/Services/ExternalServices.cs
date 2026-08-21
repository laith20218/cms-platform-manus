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
