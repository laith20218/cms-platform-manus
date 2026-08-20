using CMS.Application.Interfaces;
using Serilog.Context;

namespace CMS.Api.Middleware;

public sealed class CorrelationIdMiddleware
{
    public const string HeaderName = "X-Correlation-Id";
    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, ICorrelationContext correlation)
    {
        var requested = context.Request.Headers[HeaderName].FirstOrDefault();
        var correlationId = Guid.TryParse(requested, out var parsed)
            ? parsed.ToString("N")
            : Guid.NewGuid().ToString("N");

        correlation.CorrelationId = correlationId;
        context.TraceIdentifier = correlationId;
        context.Response.Headers[HeaderName] = correlationId;

        using (LogContext.PushProperty("CorrelationId", correlationId))
        {
            _logger.LogDebug("Correlation context established for {Method} {Path}", context.Request.Method, context.Request.Path);
            await _next(context);
        }
    }
}
