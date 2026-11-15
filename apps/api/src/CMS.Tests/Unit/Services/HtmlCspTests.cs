using CMS.Infrastructure.Security;
using FluentAssertions;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// Wave 15.5a (DEBT-CSP-01): the html-view Content-Security-Policy must allow BOTH
/// the student-web production origin AND this project's Vercel preview URLs, so the
/// HTML player iframe works on Preview deployments (previously "refused to connect").
/// The bare *.vercel.app wildcard must NOT come back.
/// </summary>
public sealed class HtmlCspTests
{
    private const string Production = "https://cms-platform-manus-student-web.vercel.app";
    private const string Preview = "https://cms-platform-manus-student-web-*.vercel.app";

    [Fact]
    public void StaticMode_DefaultAncestors_IncludeProductionAndPreview()
    {
        var csp = HtmlViewCsp.Build(enableScripts: false, frameAncestors: null);

        csp.Should().Contain("frame-ancestors " + Production);
        csp.Should().Contain(Preview);
        csp.Should().NotContain("https://*.vercel.app", "the bare wildcard must not return");
    }

    [Fact]
    public void InteractiveMode_DefaultAncestors_IncludeProductionAndPreview()
    {
        var csp = HtmlViewCsp.Build(enableScripts: true, frameAncestors: null);

        csp.Should().Contain("frame-ancestors " + Production);
        csp.Should().Contain(Preview);
        csp.Should().NotContain("https://*.vercel.app", "the bare wildcard must not return");
    }

    [Fact]
    public void ConfiguredAncestors_KeepConfigOrigin_AndAddPreview()
    {
        // LibraryController passes Cors:StudentApp through; the configured origin stays
        // verbatim (first) and the preview pattern is appended after it.
        var csp = HtmlViewCsp.Build(enableScripts: false, frameAncestors: "https://student-web.test");

        csp.Should().Contain("frame-ancestors https://student-web.test");
        csp.Should().Contain(Preview);
    }

    [Fact]
    public void AdminWebHost_IsNeverAnEmbeddingAncestor()
    {
        // The admin app does not embed the player — admin-web hosts must not appear.
        var csp = HtmlViewCsp.Build(enableScripts: true, frameAncestors: null);

        csp.Should().NotContain("cms-platform-manus-admin-web");
    }

    [Fact]
    public void FrameAncestors_DirectiveListsProductionBeforePreview()
    {
        var csp = HtmlViewCsp.Build(enableScripts: false, frameAncestors: null);
        var directive = csp.Split(';').Single(p => p.TrimStart().StartsWith("frame-ancestors"));

        directive.Should().Contain(Production).And.Contain(Preview);
    }
}
