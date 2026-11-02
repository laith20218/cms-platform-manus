namespace CMS.Api.Middleware;

/// <summary>
/// R62 §2.A.3 — completes any CORS preflight that the "CMS" policy did not short-circuit.
///
/// Placement is load-bearing: this middleware is registered immediately AFTER
/// <c>app.UseCors("CMS")</c> (Program.cs). Preflights whose Origin IS allow-listed are
/// answered by the CORS middleware itself (204 + Access-Control-Allow-*) and never reach
/// this class. A preflight that DOES reach this point had its Origin rejected by the policy.
///
/// Before R62 such rejected preflights fell through to UseRateLimiter → UseAuthentication →
/// UseAuthorization, so an anonymous OPTIONS against an [Authorize] endpoint surfaced as a
/// confusing 401/403 "on the OPTIONS line" in browser DevTools — the exact symptom reported
/// in Wave 12.4 (laptop, Chrome 156: OPTIONS 403 on /api/v1/courses/subject/{id}) — and
/// consumed rate-limit partition evaluations for nothing.
///
/// We instead complete the preflight here with 204 and — deliberately — NO
/// Access-Control-Allow-Origin header. Per the Fetch specification the browser blocks the
/// actual request when the preflight response lacks that header, so security is unchanged:
/// disallowed origins remain fully blocked. The only observable differences are a clean
/// 204 status line and zero work done by the auth/rate-limit layers.
/// </summary>
public sealed class CorsPreflightCompletionMiddleware
{
    private readonly RequestDelegate _next;

    public CorsPreflightCompletionMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var request = context.Request;
        var isPreflight =
            HttpMethods.IsOptions(request.Method) &&
            request.Headers.ContainsKey("Origin") &&
            request.Headers.ContainsKey("Access-Control-Request-Method");

        if (isPreflight)
        {
            context.Response.StatusCode = StatusCodes.Status204NoContent;
            return;
        }

        await _next(context);
    }
}
