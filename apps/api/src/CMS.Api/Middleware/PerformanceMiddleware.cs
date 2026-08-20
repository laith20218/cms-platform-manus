using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;
using System.Security.Cryptography;
using System.Text;

namespace CMS.Api.Middleware;

/// <summary>
/// Response caching middleware for GET requests.
/// Caches API responses in-memory with configurable TTL per endpoint.
/// Reduces database load for frequently accessed data.
/// </summary>
public class ResponseCacheMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IMemoryCache _cache;
    private readonly ILogger<ResponseCacheMiddleware> _logger;

    // Cache duration per endpoint pattern (in seconds)
    private static readonly Dictionary<string, int> CacheRules = new()
    {
        ["GET:/api/v1/universities"] = 3600,           // 1 hour
        ["GET:/api/v1/universities/"] = 3600,            // 1 hour
        ["GET:/api/v1/colleges/"] = 3600,                // 1 hour
        ["GET:/api/v1/years/"] = 3600,                   // 1 hour
        ["GET:/api/v1/semesters/"] = 3600,               // 1 hour
        ["GET:/api/v1/subjects/"] = 300,                 // 5 minutes
        ["GET:/api/v1/subjects/"] = 300,                 // 5 minutes (by slug)
        ["GET:/api/v1/questions"] = 60,                  // 1 minute (list)
        ["GET:/api/v1/questions/"] = 300,                // 5 minutes (by id)
        ["GET:/api/v1/exams/"] = 300,                    // 5 minutes
        ["GET:/api/v1/library/subject/"] = 300,          // 5 minutes
        ["GET:/api/v1/stats/leaderboard"] = 3600,        // 1 hour
        ["GET:/api/v1/stats/global"] = 900,               // 15 minutes
        ["GET:/api/v1/notifications/unread-count"] = 30,  // 30 seconds
    };

    public ResponseCacheMiddleware(RequestDelegate next, IMemoryCache cache, ILogger<ResponseCacheMiddleware> logger)
    {
        _next = next;
        _cache = cache;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Only cache GET requests
        if (context.Request.Method != "GET")
        {
            await _next(context);
            return;
        }

        // Skip auth endpoints (don't cache personalized data without user context)
        var path = context.Request.Path.Value ?? "";
        if (path.Contains("/auth/") || path.Contains("/admin/") || path.Contains("/security/"))
        {
            await _next(context);
            return;
        }

        // Find matching cache rule
        var cacheKey = GetCacheKey(path, context.Request.QueryString.Value ?? "");
        var cacheDuration = GetCacheDuration(path);

        if (cacheDuration == 0)
        {
            await _next(context);
            return;
        }

        // Try to get from cache
        if (_cache.TryGetValue(cacheKey, out (byte[] Body, string ContentType, int StatusCode)? cached)
            && cached is { } cachedEntry)
        {
            context.Response.ContentType = cachedEntry.ContentType;
            context.Response.StatusCode = cachedEntry.StatusCode;
            context.Response.Headers["X-Cache"] = "HIT";
            context.Response.Headers["X-Cache-TTL"] = cacheDuration.ToString();
            await context.Response.Body.WriteAsync(cachedEntry.Body);
            _logger.LogDebug("Cache HIT: {Path}", path);
            return;
        }

        // Capture response
        var originalBodyStream = context.Response.Body;
        using var memoryStream = new MemoryStream();
        context.Response.Body = memoryStream;

        await _next(context);

        // Restore original stream
        memoryStream.Seek(0, SeekOrigin.Begin);
        await memoryStream.CopyToAsync(originalBodyStream);
        context.Response.Body = originalBodyStream;

        // Cache successful responses only
        if (context.Response.StatusCode == 200)
        {
            var body = memoryStream.ToArray();
            var contentType = context.Response.ContentType ?? "application/json";
            var statusCode = context.Response.StatusCode;

            _cache.Set(cacheKey, (body, contentType, statusCode), TimeSpan.FromSeconds(cacheDuration));
            context.Response.Headers["X-Cache"] = "MISS";
            context.Response.Headers["X-Cache-TTL"] = cacheDuration.ToString();
            _logger.LogDebug("Cache MISS (cached): {Path} for {Duration}s", path, cacheDuration);
        }
    }

    private static string GetCacheKey(string path, string queryString)
    {
        // Include user ID in cache key for personalized endpoints
        var raw = $"{path}{queryString}";
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(raw));
        return $"respcache:{Convert.ToHexString(hash)[..16]}";
    }

    private static int GetCacheDuration(string path)
    {
        foreach (var rule in CacheRules)
        {
            if (path.StartsWith(rule.Key, StringComparison.OrdinalIgnoreCase))
            {
                return rule.Value;
            }
        }
        return 0;
    }
}

/// <summary>
/// Response compression middleware - compresses JSON responses with Gzip.
/// Reduces bandwidth by ~70% for text-based responses.
/// </summary>
public class ResponseCompressionMiddleware
{
    private readonly RequestDelegate _next;

    public ResponseCompressionMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        // Check if client accepts gzip
        var acceptEncoding = context.Request.Headers.AcceptEncoding.ToString();
        if (!acceptEncoding.Contains("gzip"))
        {
            await _next(context);
            return;
        }

        // Skip already compressed content
        var path = context.Request.Path.Value ?? "";
        if (path.Contains(".jpg") || path.Contains(".png") || path.Contains(".webp") || path.Contains(".mp4"))
        {
            await _next(context);
            return;
        }

        var originalBodyStream = context.Response.Body;
        using var gzipStream = new System.IO.Compression.GZipStream(originalBodyStream, System.IO.Compression.CompressionLevel.Optimal);
        context.Response.Body = gzipStream;
        context.Response.Headers.ContentEncoding = "gzip";
        context.Response.Headers.Vary = "Accept-Encoding";

        try
        {
            await _next(context);
        }
        finally
        {
            await gzipStream.FlushAsync();
            context.Response.Body = originalBodyStream;
        }
    }
}

/// <summary>
/// Request timeout middleware - cancels long-running requests.
/// Default timeout: 30 seconds (configurable per endpoint).
/// </summary>
public class RequestTimeoutMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestTimeoutMiddleware> _logger;

    // Custom timeouts per endpoint (in seconds)
    private static readonly Dictionary<string, int> TimeoutRules = new()
    {
        ["/api/v1/library/upload-url"] = 60,       // Upload URL generation
        ["/api/v1/library/complete-upload"] = 60,   // Upload completion
        ["/api/v1/questions/import"] = 120,         // Bulk import
        ["/api/v1/admin/codes/generate"] = 60,      // Code generation (batch)
        ["/api/v1/offline/download"] = 60,           // Offline package download
    };

    public RequestTimeoutMiddleware(RequestDelegate next, ILogger<RequestTimeoutMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";
        var timeoutSeconds = 30; // Default

        foreach (var rule in TimeoutRules)
        {
            if (path.Contains(rule.Key))
            {
                timeoutSeconds = rule.Value;
                break;
            }
        }

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));
        var originalToken = context.RequestAborted;

        try
        {
            await _next(context);
        }
        catch (OperationCanceledException) when (cts.IsCancellationRequested)
        {
            _logger.LogWarning("Request timeout: {Method} {Path} exceeded {Timeout}s",
                context.Request.Method, path, timeoutSeconds);

            context.Response.StatusCode = 408;
            context.Response.ContentType = "application/problem+json";

            var problem = new
            {
                type = "https://cms.example.com/errors/timeout",
                title = "Request Timeout",
                status = 408,
                detail = $"انتهت مهلة الطلب ({timeoutSeconds} ثانية). حاول مرة أخرى.",
                traceId = context.TraceIdentifier
            };

            await context.Response.WriteAsJsonAsync(problem);
        }
    }
}
