using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using CMS.Domain.Exceptions;
using FluentValidation;

namespace CMS.Api.Middleware;

/// <summary>
/// Global exception handling middleware.
/// Converts exceptions to RFC 7807 Problem Details responses.
/// </summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (ValidationException ex)
        {
            await HandleValidationException(context, ex);
        }
        catch (NotFoundException ex)
        {
            await HandleDomainException(context, ex, HttpStatusCode.NotFound);
        }
        catch (ForbiddenException ex)
        {
            await HandleDomainException(context, ex, HttpStatusCode.Forbidden);
        }
        catch (ConflictException ex)
        {
            await HandleDomainException(context, ex, HttpStatusCode.Conflict);
        }
        catch (BusinessRuleViolationException ex)
        {
            await HandleDomainException(context, ex, HttpStatusCode.BadRequest);
        }
        catch (DomainException ex)
        {
            await HandleDomainException(context, ex, HttpStatusCode.BadRequest);
        }
        catch (UnauthorizedAccessException ex)
        {
            await HandleSimpleException(context, "Unauthorized", ex.Message, HttpStatusCode.Unauthorized, "UNAUTHORIZED");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "An unhandled exception occurred. TraceId: {TraceId}", context.TraceIdentifier);
            await HandleSimpleException(context, "Internal Server Error",
                "An unexpected error occurred. Please try again later.",
                HttpStatusCode.InternalServerError, "INTERNAL_ERROR");
        }
    }

    private async Task HandleValidationException(HttpContext context, ValidationException ex)
    {
        var errors = ex.Errors
            .GroupBy(e => e.PropertyName)
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());

        var problemDetails = new ProblemDetails
        {
            Type = "https://cms.example.com/errors/validation",
            Title = "Validation Error",
            Status = (int)HttpStatusCode.BadRequest,
            Detail = "The request contains invalid data",
            Instance = context.Request.Path,
            Extensions =
            {
                ["traceId"] = context.TraceIdentifier,
                ["errors"] = errors
            }
        };

        context.Response.StatusCode = (int)HttpStatusCode.BadRequest;
        context.Response.ContentType = "application/problem+json";
        await context.Response.WriteAsJsonAsync(problemDetails);
    }

    private async Task HandleDomainException(HttpContext context, DomainException ex, HttpStatusCode statusCode)
    {
        var problemDetails = new ProblemDetails
        {
            Type = $"https://cms.example.com/errors/{ex.ErrorCode.ToLower()}",
            Title = ex.ErrorCode.Replace("_", " ").ToLowerInvariant(),
            Status = (int)statusCode,
            Detail = ex.Message,
            Instance = context.Request.Path,
            Extensions =
            {
                ["traceId"] = context.TraceIdentifier,
                ["errorCode"] = ex.ErrorCode
            }
        };

        context.Response.StatusCode = (int)statusCode;
        context.Response.ContentType = "application/problem+json";
        await context.Response.WriteAsJsonAsync(problemDetails);
    }

    private async Task HandleSimpleException(HttpContext context, string title, string detail, HttpStatusCode statusCode, string errorCode)
    {
        var problemDetails = new ProblemDetails
        {
            Type = $"https://cms.example.com/errors/{errorCode.ToLower()}",
            Title = title,
            Status = (int)statusCode,
            Detail = detail,
            Instance = context.Request.Path,
            Extensions =
            {
                ["traceId"] = context.TraceIdentifier,
                ["errorCode"] = errorCode
            }
        };

        context.Response.StatusCode = (int)statusCode;
        context.Response.ContentType = "application/problem+json";
        await context.Response.WriteAsJsonAsync(problemDetails);
    }
}

/// <summary>
/// Adds security headers to all responses. Unified with the historical
/// ContentSecurityPolicyMiddleware intent: keep CSP minimal (default-src 'self'),
/// but add HSTS, COOP and COEP for defence-in-depth without duplicating X-Frame-Options
/// or Permissions-Policy. CSP stays minimal here to avoid breaking Swagger / Vercel
/// student-web embedding; per-app CSP is enforced by Vercel via vercel.json.
/// </summary>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["X-Frame-Options"] = "DENY";
        context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
        context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        context.Response.Headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()";

        if (!context.Response.Headers.ContainsKey("Content-Security-Policy"))
        {
            context.Response.Headers["Content-Security-Policy"] = "default-src 'self'";
        }

        // HSTS: only emit when the request is not loopback, so local dev over HTTP is unaffected.
        // Render terminates TLS at the edge, so the origin server sees HTTPS and HSTS applies.
        if (!IPAddress.IsLoopback(context.Connection.RemoteIpAddress ?? IPAddress.None))
        {
            context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload";
        }

        // Cross-Origin isolation headers reduce Spectre-class side-channel risk for any
        // future use of SharedArrayBuffer / high-resolution timers in admin/student apps.
        context.Response.Headers["Cross-Origin-Opener-Policy"] = "same-origin";
        context.Response.Headers["Cross-Origin-Embedder-Policy"] = "require-corp";
        context.Response.Headers["Cross-Origin-Resource-Policy"] = "same-site";

        await _next(context);
    }
}
