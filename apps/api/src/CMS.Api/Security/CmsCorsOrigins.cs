namespace CMS.Api.Security;

/// <summary>
/// Wave 15.5a (DEBT-CORS-01): the origin evaluator behind the "CMS" CORS policy
/// (Program.cs). Narrowed from the previous "https://*.vercel.app" wildcard (any
/// Vercel-hosted site, PR #84 temporary exception) to project-specific patterns:
/// exact config matches plus this project's Vercel deployment hosts, matched
/// host-exactly via <see cref="Uri"/> parsing. Extracted into a static helper so
/// the boundary is unit-testable (CMS.Tests Unit/Middleware/CorsTests).
/// </summary>
public static class CmsCorsOrigins
{
    private const string StudentWebProject = "cms-platform-manus-student-web";
    private const string AdminWebProject = "cms-platform-manus-admin-web";
    private const string VercelSuffix = ".vercel.app";

    /// <summary>
    /// True when the origin may call the API: (1) an exact match against the configured
    /// origins (Cors:StudentApp / Cors:AdminApp — keeps every non-Vercel environment
    /// unchanged), or (2) this project's student-web / admin-web Vercel deployment —
    /// the production host or a preview host
    /// cms-platform-manus-&lt;app&gt;-&lt;branch&gt;-&lt;hash&gt;-&lt;owner&gt;.vercel.app.
    /// Host parsing makes the boundary exact: "cms-platform-manus-student-web.evil.vercel.app"
    /// does NOT start with "cms-platform-manus-student-web-" (dot, not dash) and is rejected.
    /// </summary>
    public static bool IsAllowed(string origin, IReadOnlyList<string> configuredOrigins)
    {
        if (configuredOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase))
            return true;

        if (Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.Scheme == "https")
        {
            if (IsProjectHost(uri.Host, StudentWebProject) ||
                IsProjectHost(uri.Host, AdminWebProject))
                return true;
        }

        return false;
    }

    private static bool IsProjectHost(string host, string project)
        => host == project + VercelSuffix ||
           (host.StartsWith(project + "-", StringComparison.Ordinal) &&
            host.EndsWith(VercelSuffix, StringComparison.Ordinal));
}
