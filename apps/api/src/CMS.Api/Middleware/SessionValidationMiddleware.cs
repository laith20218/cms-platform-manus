using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using CMS.Application.Interfaces;

namespace CMS.Api.Middleware;

/// <summary>
/// Enforces server-side session revocation after JWT signature validation. This makes
/// logout, password-reset, device-revoke, and refresh-reuse invalidation effective
/// before protected endpoints execute.
/// </summary>
public sealed class SessionValidationMiddleware
{
    private readonly RequestDelegate _next;

    public SessionValidationMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, ISessionService sessions)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var sid = context.User.FindFirst("sid")?.Value;
            var installationId = context.User.FindFirst("installation_id")?.Value;
            var tokenVersion = context.User.FindFirst("tv")?.Value;

            if (!Guid.TryParse(sid, out var sessionId)
                || string.IsNullOrWhiteSpace(installationId)
                || !int.TryParse(tokenVersion, out var version)
                || !await sessions.IsActiveAsync(sessionId, version, installationId, context.RequestAborted))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/problem+json";
                await context.Response.WriteAsJsonAsync(new ProblemDetails
                {
                    Title = "Unauthorized",
                    Status = StatusCodes.Status401Unauthorized,
                    Detail = "الجلسة غير صالحة أو تم إبطالها"
                });
                return;
            }
        }

        await _next(context);
    }
}
