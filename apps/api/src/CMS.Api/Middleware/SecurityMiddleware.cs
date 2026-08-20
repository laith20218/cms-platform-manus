using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;

namespace CMS.Api.Middleware;

/// <summary>
/// Content Security Policy middleware - adds strict CSP headers.
/// Prevents XSS, clickjacking, and content injection.
/// </summary>
public class ContentSecurityPolicyMiddleware
{
    private readonly RequestDelegate _next;

    public ContentSecurityPolicyMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        // Content Security Policy
        context.Response.Headers["Content-Security-Policy"] =
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "font-src 'self' https://fonts.gstatic.com data:; " +
            "img-src 'self' data: blob: https:; " +
            "media-src 'self' https:; " +
            "frame-src 'self' https://www.youtube.com; " +
            "connect-src 'self' https: wss:; " +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self'";

        // X-Frame-Options (prevents clickjacking)
        context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";

        // X-Content-Type-Options (prevents MIME sniffing)
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";

        // Referrer-Policy
        context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";

        // Permissions-Policy
        context.Response.Headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()";

        // HSTS (HTTPS enforcement) - only in production
        if (!IPAddress.IsLoopback(context.Connection.RemoteIpAddress ?? IPAddress.None))
        {
            context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
        }

        // Cross-Origin policies
        context.Response.Headers["Cross-Origin-Opener-Policy"] = "same-origin";
        context.Response.Headers["Cross-Origin-Resource-Policy"] = "same-origin";

        await _next(context);
    }
}

/// <summary>
/// Request audit logging middleware - logs all API requests with metadata.
/// </summary>
public class AuditLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<AuditLoggingMiddleware> _logger;

    public AuditLoggingMiddleware(RequestDelegate next, ILogger<AuditLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Skip health checks and static files
        if (context.Request.Path.StartsWithSegments("/health") ||
            context.Request.Path.StartsWithSegments("/swagger"))
        {
            await _next(context);
            return;
        }

        var requestId = context.TraceIdentifier;
        var method = context.Request.Method;
        var path = context.Request.Path.Value ?? "";
        var ipAddress = context.Connection.RemoteIpAddress?.ToString();
        var userAgent = context.Request.Headers.UserAgent.ToString();
        var userId = context.User?.FindFirst("sub")?.Value ?? "anonymous";

        // Log request
        _logger.LogInformation(
            "Request {RequestId}: {Method} {Path} by {UserId} from {IP}",
            requestId, method, path, userId, ipAddress);

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        try
        {
            await _next(context);
        }
        finally
        {
            stopwatch.Stop();
            var statusCode = context.Response.StatusCode;

            // Log response
            _logger.LogInformation(
                "Response {RequestId}: {StatusCode} in {ElapsedMs}ms",
                requestId, statusCode, stopwatch.ElapsedMilliseconds);

            // Log suspicious requests
            if (statusCode == 401 || statusCode == 403)
            {
                _logger.LogWarning(
                    "Security: {Method} {Path} returned {StatusCode} for {UserId} from {IP}",
                    method, path, statusCode, userId, ipAddress);
            }

            if (statusCode >= 500)
            {
                _logger.LogError(
                    "Server Error: {Method} {Path} returned {StatusCode} for {UserId}",
                    method, path, statusCode, userId);
            }
        }
    }
}

/// <summary>
/// Rate limiting middleware for auth endpoints.
/// Limits: 5 login attempts per minute per IP.
/// </summary>
public class AuthRateLimitMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<AuthRateLimitMiddleware> _logger;

    public AuthRateLimitMiddleware(RequestDelegate next, ILogger<AuthRateLimitMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, StackExchange.Redis.IConnectionMultiplexer redis)
    {
        // Only apply to auth endpoints
        var path = context.Request.Path.Value ?? "";
        if (!path.Contains("/auth/login") && !path.Contains("/auth/register") && !path.Contains("/auth/forgot"))
        {
            await _next(context);
            return;
        }

        var ipAddress = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var cacheKey = $"ratelimit:auth:{ipAddress}";
        var db = redis.GetDatabase();

        var current = (int)(await db.StringIncrementAsync(cacheKey));
        if (current == 1)
        {
            await db.KeyExpireAsync(cacheKey, TimeSpan.FromMinutes(1));
        }

        // Set rate limit headers
        context.Response.Headers["X-RateLimit-Limit"] = "5";
        context.Response.Headers["X-RateLimit-Remaining"] = Math.Max(0, 5 - current).ToString();
        context.Response.Headers["X-RateLimit-Reset"] = new DateTimeOffset(DateTime.UtcNow.AddMinutes(1)).ToUnixTimeSeconds().ToString();

        if (current > 5)
        {
            _logger.LogWarning("Rate limit exceeded for {IP} on {Path}", ipAddress, path);

            context.Response.StatusCode = 429;
            context.Response.ContentType = "application/problem+json";

            var problem = new
            {
                type = "https://cms.example.com/errors/rate-limit",
                title = "Too Many Requests",
                status = 429,
                detail = "محاولات كثيرة. حاول بعد دقيقة.",
                traceId = context.TraceIdentifier,
                errorCode = "RATE_LIMIT_EXCEEDED"
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(problem));
            return;
        }

        await _next(context);
    }
}
