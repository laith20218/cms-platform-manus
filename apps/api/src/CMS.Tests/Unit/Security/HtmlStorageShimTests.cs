using System.Text.RegularExpressions;
using CMS.Infrastructure.Security;
using FluentAssertions;

namespace CMS.Tests.Unit.Security;

/// <summary>
/// R56 — HtmlStorageShim: the response-time localStorage/sessionStorage shim
/// injection for html-view. Pure string transform — no storage, no mocks.
/// Covers the R56 workorder contract: injection right AFTER the first
/// case-insensitive &lt;head …&gt; open tag (never inside the tag, never on
/// &lt;header&gt;), prepend when no head exists, first-head-only, shim
/// ordered BEFORE any lesson script, and the shim's storage surface markers.
/// </summary>
public sealed class HtmlStorageShimTests
{
    private const string ShimOpen = $"<script id=\"{HtmlStorageShim.ScriptId}\">";

    [Fact]
    public void Inject_WithPlainHead_InsertsImmediatelyAfterHeadOpenTag()
    {
        var stored = "<!DOCTYPE html><html dir=\"rtl\"><head><title>درس</title></head><body><script>window.__lesson=true;</script></body></html>";

        var served = HtmlStorageShim.Inject(stored);

        served.Should().StartWith("<!DOCTYPE html><html dir=\"rtl\"><head>" + HtmlStorageShim.ScriptTag)
            .And.EndWith("<title>درس</title></head><body><script>window.__lesson=true;</script></body></html>");
    }

    [Fact]
    public void Inject_IsCaseInsensitive_UpperAndMixedHeadTags()
    {
        var upper = HtmlStorageShim.Inject("<html><HEAD><title>t</title></HEAD></html>");
        var mixed = HtmlStorageShim.Inject("<html><Head lang=\"ar\"><title>t</title></Head></html>");

        upper.Should().Contain("<HEAD>" + ShimOpen);
        mixed.Should().Contain("<Head lang=\"ar\">" + ShimOpen);
    }

    [Fact]
    public void Inject_HeadWithAttributes_InsertsAfterTheFullOpenTag_NotInsideIt()
    {
        var html = "<html><head lang=\"ar\" dir=\"rtl\"><title>t</title></head></html>";

        var served = HtmlStorageShim.Inject(html);

        served.Should().Contain("<head lang=\"ar\" dir=\"rtl\">" + ShimOpen)
            .And.NotContain("<head" + ShimOpen);
    }

    [Fact]
    public void Inject_DoesNotMatchHeaderTag()
    {
        var html = "<html><body><header id=\"page-head\">hi</header></body></html>";

        var served = HtmlStorageShim.Inject(html);

        // No <head> present → prepend contract; the <header> element is untouched.
        served.Should().StartWith(HtmlStorageShim.ScriptTag)
            .And.Contain("<header id=\"page-head\">");
    }

    [Fact]
    public void Inject_NoHead_PrependsToWholeDocument()
    {
        var html = "<p>بدون رأس</p><script>window.__x=1;</script>";

        var served = HtmlStorageShim.Inject(html);

        served.Should().StartWith(HtmlStorageShim.ScriptTag).And.EndWith(html);
    }

    [Fact]
    public void Inject_EmptyDocument_Prepends()
    {
        HtmlStorageShim.Inject(string.Empty).Should().Be(HtmlStorageShim.ScriptTag);
    }

    [Fact]
    public void Inject_MultipleHeadLikeOccurrences_ShimsOnlyTheFirst()
    {
        var html = "<html><head><title>a</title></head><body><article><head>not-a-head</head></article></body></html>";

        var served = HtmlStorageShim.Inject(html);

        Regex.Count(served, Regex.Escape(ShimOpen)).Should().Be(1, "exactly one shim, no matter how many head-like literals");
        served.IndexOf(ShimOpen, StringComparison.Ordinal)
            .Should().BeGreaterThan(served.IndexOf("<html><head>", StringComparison.Ordinal))
            .And.BeLessThan(served.IndexOf("<title>a</title>", StringComparison.Ordinal),
                "the shim must precede everything inside the first head");
        served.Should().Contain("<article><head>not-a-head</head>", "body literals are never rewritten");
    }

    [Fact]
    public void Inject_ShimPrecedesAllLessonScripts()
    {
        var html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body><script>localStorage.setItem('x','y');</script></body></html>";

        var served = HtmlStorageShim.Inject(html);

        served.IndexOf(HtmlStorageShim.ScriptId, StringComparison.Ordinal)
            .Should().BeLessThan(served.IndexOf("localStorage.setItem", StringComparison.Ordinal),
                "the shim must be defined before the first lesson script runs");
    }

    [Theory]
    [InlineData("<head >")]
    [InlineData("<head\t\n class=\"x\">")]
    [InlineData("<HEAD DIR=\"RTL\">")]
    public void Inject_HeadOpenTagVariants_AllReceiveTheShim(string headTag)
    {
        var html = $"<html>{headTag}<title>t</title></head></html>";

        var served = HtmlStorageShim.Inject(html);

        served.Should().Contain(headTag + ShimOpen);
    }

    [Fact]
    public void ScriptTag_CarriesTheFullInMemoryStorageSurface()
    {
        var script = HtmlStorageShim.ScriptTag;

        script.Should().StartWith(ShimOpen).And.EndWith("</script>");
        script.Should().Contain("window.localStorage.getItem('test')")
            .And.Contain("window.sessionStorage.getItem('test')")
            .And.Contain("Object.defineProperty(window, 'localStorage'")
            .And.Contain("Object.defineProperty(window, 'sessionStorage'")
            .And.Contain("getItem:")
            .And.Contain("setItem:")
            .And.Contain("removeItem:")
            .And.Contain("clear:")
            .And.Contain("key:")
            .And.Contain("get length()");
    }
}
