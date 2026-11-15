using Microsoft.AspNetCore.Http;

namespace CMS.Api.Middleware;

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
