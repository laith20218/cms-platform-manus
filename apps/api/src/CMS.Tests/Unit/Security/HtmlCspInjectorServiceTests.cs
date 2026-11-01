using CMS.Infrastructure.Security;
using FluentAssertions;

namespace CMS.Tests.Unit.Security;

/// <summary>
/// Wave 13 (F3) — HtmlCspInjectorService: the upload-time CSP meta injection.
/// Pure string transform — no storage, no mocks needed. Covers the contract the
/// supervisor pinned: injection at the TOP of &lt;head&gt; (created when missing),
/// idempotent replacement (never duplicated), the data-cms-injected="true"
/// signature, script-src only on the trusted path, and the BOM / fragment /
/// malformed-input robustness cases.
/// </summary>
public sealed class HtmlCspInjectorServiceTests
{
    private readonly HtmlCspInjectorService _injector = new();

    private const string StaticCspMarker = "default-src 'none'";
    private const string ScriptsCspMarker = "script-src 'unsafe-inline'";

    [Fact]
    public void Inject_IntoExistingHead_PlacesMetaAsFirstHeadChild()
    {
        var html = "<!DOCTYPE html><html dir=\"rtl\"><head><meta charset=\"utf-8\"><title>درس</title></head><body><p>مرحبا</p></body></html>";

        var result = _injector.Inject(html, enableScripts: false);

        result.Should().Contain("http-equiv=\"Content-Security-Policy\"");
        result.Should().Contain(StaticCspMarker);
        // The injected meta must sit immediately after the <head…> opening tag —
        // BEFORE the charset meta and every other head child.
        var headIndex = result.IndexOf("<head", StringComparison.OrdinalIgnoreCase);
        var metaIndex = result.IndexOf("Content-Security-Policy", StringComparison.OrdinalIgnoreCase);
        var charsetIndex = result.IndexOf("charset", StringComparison.OrdinalIgnoreCase);
        headIndex.Should().BeGreaterThan(-1);
        metaIndex.Should().BeGreaterThan(headIndex);
        metaIndex.Should().BeLessThan(charsetIndex);
        result.Should().NotContain(ScriptsCspMarker, "the strict policy carries no script-src");
    }

    [Fact]
    public void Inject_TrustedPath_AppendsInlineScriptSrc()
    {
        var html = "<html><head></head><body><script>alert(1)</script></body></html>";

        var result = _injector.Inject(html, enableScripts: true);

        result.Should().Contain(StaticCspMarker);
        result.Should().Contain(ScriptsCspMarker, "EnableScripts rows get exactly one script-src directive (inline only)");
    }

    [Fact]
    public void Inject_IsIdempotent_ReplacesInsteadOfDuplicating()
    {
        var html = "<html><head><title>t</title></head><body></body></html>";

        var first = _injector.Inject(html, enableScripts: false);
        var second = _injector.Inject(first, enableScripts: true); // re-run with a DIFFERENT policy

        RegexCount(second, "http-equiv=\"Content-Security-Policy\"").Should().Be(1,
            "re-running the injector replaces the previous meta — never duplicates");
        second.Should().Contain(ScriptsCspMarker, "the replacement carries the NEW policy");
        second.Should().Contain("data-cms-injected=\"true\"");
    }

    [Fact]
    public void Inject_ReplacesForeignCspMeta_Too()
    {
        var html = "<html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src *\"></head><body></body></html>";

        var result = _injector.Inject(html, enableScripts: false);

        RegexCount(result, "http-equiv", StringComparison.OrdinalIgnoreCase).Should().Be(1,
            "a foreign CSP meta is replaced, not stacked next to ours");
        result.Should().Contain(StaticCspMarker);
    }

    [Fact]
    public void Inject_CreatesHead_WhenMissing()
    {
        var html = "<html dir=\"rtl\"><body><p>مصدر بلا رأس</p></body></html>";

        var result = _injector.Inject(html, enableScripts: false);

        result.Should().Contain("<head>");
        result.Should().Contain("data-cms-injected=\"true\"");
        var headIndex = result.IndexOf("<head>", StringComparison.OrdinalIgnoreCase);
        var htmlIndex = result.IndexOf("<html", StringComparison.OrdinalIgnoreCase);
        headIndex.Should().BeGreaterThan(htmlIndex, "the created head follows the <html> opening tag");
    }

    [Fact]
    public void Inject_Fragment_PrependsMeta()
    {
        var html = "<p>مقطع مجرد بدون html أو head</p>";

        var result = _injector.Inject(html, enableScripts: false);

        result.Should().StartWith("<meta http-equiv=\"Content-Security-Policy\"");
        result.Should().Contain(StaticCspMarker);
    }

    [Fact]
    public void Inject_StripsBom_BeforeMatching()
    {
        var html = "\uFEFF<!DOCTYPE html><html><head><title>bom</title></head><body></body></html>";

        var result = _injector.Inject(html, enableScripts: false);

        result.Should().NotContain("\uFEFF");
        result.Should().Contain("data-cms-injected=\"true\"");
        // The meta landed INSIDE the (BOM-stripped) head, not as a prepended fragment.
        result.IndexOf("Content-Security-Policy", StringComparison.OrdinalIgnoreCase)
            .Should().BeGreaterThan(result.IndexOf("<head", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Inject_MalformedMarkup_StillProtected()
    {
        var html = "<<div><p>تركيب مكسور غير متوازن";

        var result = _injector.Inject(html, enableScripts: false);

        result.Should().Contain("http-equiv=\"Content-Security-Policy\"");
        result.Should().Contain(StaticCspMarker);
    }

    [Fact]
    public void Inject_EmptyInput_ReturnsEmpty()
    {
        _injector.Inject(string.Empty, enableScripts: true).Should().BeEmpty();
    }

    [Fact]
    public void Inject_InjectedTag_CarriesSignatureAttribute()
    {
        var result = _injector.Inject("<html><head></head><body></body></html>", enableScripts: false);

        result.Should().Contain("data-cms-injected=\"true\"",
            "the E2E suite asserts this signature on the served object");
    }

    /// <summary>Counts occurrences of a needle with a fixed comparison type.</summary>
    private static int RegexCount(string haystack, string needle, StringComparison comparison = StringComparison.Ordinal)
    {
        var count = 0;
        var index = 0;
        while ((index = haystack.IndexOf(needle, index, comparison)) >= 0)
        {
            count++;
            index += needle.Length;
        }
        return count;
    }
}
