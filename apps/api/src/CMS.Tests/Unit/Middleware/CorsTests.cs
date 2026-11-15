using CMS.Api.Security;
using FluentAssertions;

namespace CMS.Tests.Unit.Middleware;

/// <summary>
/// Wave 15.5a (DEBT-CORS-01): pins the narrowed CORS origin evaluator
/// (CmsCorsOrigins, used by the "CMS" policy in Program.cs). Before 15.5a the
/// policy allowed https://*.vercel.app — ANY Vercel-hosted site (PR #84
/// temporary exception). These tests pin both the allowed project-specific
/// patterns and the rejected bypass shapes.
/// </summary>
public sealed class CorsTests
{
    private static readonly string[] Configured =
    {
        "https://cms-platform-manus-student-web.vercel.app", // render.yaml Cors__StudentApp
        "https://cms-platform-manus-admin-web.vercel.app"    // render.yaml Cors__AdminApp
    };

    [Theory]
    [InlineData("https://cms-platform-manus-student-web.vercel.app")]                     // production (also via config)
    [InlineData("https://cms-platform-manus-admin-web.vercel.app")]                       // production (also via config)
    [InlineData("https://cms-platform-manus-student-web-git-feat-x-abc123-laith.vercel.app")] // git preview
    [InlineData("https://cms-platform-manus-admin-web-git-feat-y-def456-laith.vercel.app")]   // git preview
    [InlineData("https://cms-platform-manus-student-web-main-789xyz-laith.vercel.app")]   // branch preview
    public void ProjectDeploymentOrigins_AreAllowed(string origin)
    {
        CmsCorsOrigins.IsAllowed(origin, Configured).Should().BeTrue();
    }

    [Fact]
    public void ConfiguredOrigin_ExactMatch_IsAllowed_CaseInsensitive()
    {
        // The non-Vercel path: whatever ops configures (custom domains, test hosts)
        // keeps working, regardless of host shape.
        CmsCorsOrigins.IsAllowed("https://student-web.test", new[] { "https://student-web.test" })
            .Should().BeTrue();
        CmsCorsOrigins.IsAllowed("https://STUDENT-WEB.TEST", new[] { "https://student-web.test" })
            .Should().BeTrue();
    }

    [Theory]
    [InlineData("https://evil.vercel.app")]                                   // unrelated Vercel site (the old wildcard accepted this)
    [InlineData("https://not-our-app.vercel.app")]                            // unrelated Vercel site
    [InlineData("https://cms-platform-manus-student-web.evil.vercel.app")]    // dot-boundary: NOT <project>-prefixed
    [InlineData("https://cms-platform-manus-admin-web.evil.vercel.app")]      // dot-boundary, admin side
    [InlineData("http://cms-platform-manus-student-web.vercel.app")]          // http scheme variant of a real host
    [InlineData("https://student-web.test")]                                  // not configured in this call
    [InlineData("https://app.cms.example.com")]                               // config fallback default, not configured here
    [InlineData("file://cms-platform-manus-student-web.vercel.app")]          // non-http(s) scheme
    public void NonProjectOrigins_AreRejected(string origin)
    {
        CmsCorsOrigins.IsAllowed(origin, Configured).Should().BeFalse();
    }

    [Fact]
    public void SamePrefixProjectOnAnotherVercelAccount_IsStillAllowed_DocumentedBoundary()
    {
        // DOCUMENTED BOUNDARY (accepted by 15.5a): a host like
        // cms-platform-manus-student-web-evil.vercel.app — a DIFFERENT Vercel project
        // whose name starts with this project's prefix — still matches the preview
        // pattern. Rejecting it would require pinning the Vercel owner slug into the
        // API (e.g. requiring the "-<owner>" suffix), which the API does not know.
        // The narrowing (any vercel.app -> project-prefixed only) is the 15.5a scope;
        // owner-suffix pinning is deliberately out of scope.
        CmsCorsOrigins.IsAllowed("https://cms-platform-manus-student-web-evil.vercel.app", Configured)
            .Should().BeTrue();
    }
}
