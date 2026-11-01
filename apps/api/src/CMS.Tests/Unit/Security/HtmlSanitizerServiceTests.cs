using System.Text;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Security;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CMS.Tests.Unit.Security;

/// <summary>
/// A2-5 — HtmlSanitizerService (Ganss.XSS) in-place HTML sanitization:
/// dangerous markup is stripped and the object is overwritten at the same key,
/// clean documents are left untouched, and every failure mode is fail-closed.
/// Uses a hand-rolled in-memory IFileStorageService fake — no network involved.
///
/// 13.A.1 — the TRUSTED policy (SanitizeTrustedAsync) additionally pins:
/// inline on* handlers / <c>&lt;script&gt;</c> / <c>&lt;style&gt;</c> survive (verbatim content,
/// head-resident included via document mode), while object/embed/javascript:/base/
/// form-action/CSS expression() are stripped in BOTH modes.
/// </summary>
public sealed class HtmlSanitizerServiceTests
{
    /// <summary>In-memory object store: key → bytes. Records every PutAsync call.</summary>
    private sealed class FakeStorage : IFileStorageService
    {
        public Dictionary<string, byte[]> Objects { get; } = new();
        public List<(string Key, string ContentType)> Puts { get; } = new();
        public Func<string, Stream>? DownloadOverride { get; set; }

        public Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry, long? contentLength = null, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<string> GetSignedUrlAsync(string key, TimeSpan expiry, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task DeleteAsync(string key, CancellationToken ct = default)
        {
            Objects.Remove(key);
            return Task.CompletedTask;
        }

        public Task<bool> ExistsAsync(string key, CancellationToken ct = default)
            => Task.FromResult(Objects.ContainsKey(key));

        public Task<Stream> DownloadAsync(string key, CancellationToken ct = default)
        {
            if (DownloadOverride is not null)
                return Task.FromResult(DownloadOverride(key));
            if (!Objects.TryGetValue(key, out var bytes))
                throw new InvalidOperationException($"object not found: {key}");
            return Task.FromResult<Stream>(new MemoryStream(bytes, writable: false));
        }

        public Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default)
        {
            using var buffer = new MemoryStream();
            content.CopyTo(buffer);
            Objects[key] = buffer.ToArray();
            Puts.Add((key, contentType));
            return Task.CompletedTask;
        }

        // Push 4 / Track 4: multipart members are not exercised by these tests.
        public Task<string> InitiateMultipartUploadAsync(string key, string contentType, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<string> PresignUploadPartAsync(string key, string uploadId, int partNumber, TimeSpan expiry, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<List<CMS.Application.Interfaces.UploadedPartInfo>> ListMultipartPartsAsync(string key, string uploadId, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task CompleteMultipartUploadAsync(string key, string uploadId, IReadOnlyList<CMS.Application.Interfaces.CompletedPart> parts, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task AbortMultipartUploadAsync(string key, string uploadId, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<long> GetObjectSizeAsync(string key, CancellationToken ct = default)
            => Task.FromResult(Objects.TryGetValue(key, out var bytes) ? (long)bytes.Length : 0L);

        public Task<string> GetSignedUrlViaCredentialsAsync(string key, TimeSpan desiredExpiry, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");
    }

    private static HtmlSanitizerService Build(FakeStorage storage) =>
        new(storage, NullLogger<HtmlSanitizerService>.Instance);

    private static void Store(FakeStorage storage, string key, string html) =>
        storage.Objects[key] = Encoding.UTF8.GetBytes(html);

    private static string ReadBack(FakeStorage storage, string key) =>
        Encoding.UTF8.GetString(storage.Objects[key]);

    [Fact]
    public async Task SanitizeAsync_StripsScriptAndEventHandlers_ThenOverwritesInPlace()
    {
        var storage = new FakeStorage();
        const string key = "library/html/dirty";
        Store(storage, key,
            "<div onclick=\"evil()\"><p>ملاحظات المحاضرة</p><script>alert('xss')</script>"
            + "<a href=\"javascript:evil()\">رابط</a><a href=\"https://example.com\">رابط آمن</a></div>");
        var svc = Build(storage);

        await svc.SanitizeAsync(key, ReadSize(storage, key));

        var sanitized = ReadBack(storage, key);
        sanitized.Should().NotContain("script", "script tags must be stripped");
        sanitized.Should().NotContain("onclick", "inline event handlers must be stripped");
        sanitized.Should().NotContain("javascript:", "javascript: URLs must be neutralized");
        sanitized.Should().Contain("ملاحظات المحاضرة", "ordinary Arabic content must be preserved");
        sanitized.Should().Contain("https://example.com", "safe links must survive");
        storage.Puts.Should().ContainSingle(put => put.Key == key && put.ContentType == "text/html",
            "the sanitized document must overwrite the original object at the same key");
    }

    [Fact]
    public async Task SanitizeAsync_CleanDocument_NoRewrite()
    {
        var storage = new FakeStorage();
        const string key = "library/html/clean";
        const string clean = "<p>تلخيص نظيف <b>بلا مخاطر</b></p>";
        Store(storage, key, clean);
        var svc = Build(storage);

        await svc.SanitizeAsync(key, ReadSize(storage, key));

        ReadBack(storage, key).Should().Be(clean);
        storage.Puts.Should().BeEmpty("an already-clean document must not be rewritten");
    }

    [Fact]
    public async Task SanitizeAsync_BodyLargerThanDeclaredCeiling_ThrowsWithoutRewrite()
    {
        var storage = new FakeStorage();
        const string key = "library/html/liar";
        Store(storage, key, new string('a', 5000));
        var svc = Build(storage);

        var act = () => svc.SanitizeAsync(key, declaredSizeBytes: 100);

        await act.Should().ThrowAsync<InvalidOperationException>(
            "a storage body larger than the declared ceiling must never be buffered");
        storage.Puts.Should().BeEmpty();
    }

    [Fact]
    public async Task SanitizeAsync_DownloadFailure_Propagates()
    {
        var storage = new FakeStorage
        {
            DownloadOverride = _ => throw new HttpRequestException("storage outage")
        };
        var svc = Build(storage);

        var act = () => svc.SanitizeAsync("library/html/gone", 1024);

        await act.Should().ThrowAsync<HttpRequestException>(
            "a storage outage must propagate so the caller rejects the upload");
    }

    [Fact]
    public async Task SanitizeAsync_ZeroDeclaredSize_IsNoOp()
    {
        var storage = new FakeStorage();
        var svc = Build(storage);

        var act = () => svc.SanitizeAsync("library/html/empty", 0);

        await act.Should().NotThrowAsync("a zero-sized declaration has nothing to sanitize");
        storage.Puts.Should().BeEmpty();
    }

    // ===== 13.A.1 — the TRUSTED policy (EnableScripts=true) =====
    // Ruling: interactive lessons keep their inline event handlers and script/style
    // tags; object/embed/javascript:/base/form-action/CSS expression() die in both
    // modes. Containment = opaque-origin sandbox + connect-src 'none' (class doc).

    [Fact]
    public async Task SanitizeTrustedAsync_PreservesInlineOnclick_OnButton()
    {
        var storage = new FakeStorage();
        const string key = "library/html/trusted-button";
        Store(storage, key, "<button onclick=\"confirmChoice()\" class=\"quiz-btn\">اختر الإجابة</button>");
        var svc = Build(storage);

        var output = await svc.SanitizeTrustedAsync(key, ReadSize(storage, key));

        output.Should().Contain("<button", "the interactive element itself must survive");
        output.Should().Contain("onclick=\"confirmChoice()\"",
            "13.A.1: inline event handlers are preserved in trusted mode");
        output.Should().Contain("اختر الإجابة", "ordinary Arabic content must be preserved");
    }

    [Fact]
    public async Task SanitizeTrustedAsync_PreservesOnError_OnImg()
    {
        var storage = new FakeStorage();
        const string key = "library/html/trusted-img";
        Store(storage, key, "<img src=\"lesson.png\" onerror=\"showFallback()\" alt=\"مخطط\">");
        var svc = Build(storage);

        var output = await svc.SanitizeTrustedAsync(key, ReadSize(storage, key));

        output.Should().Contain("onerror=\"showFallback()\"",
            "13.A.1: even onerror — the classic XSS vector — is trusted in this mode");
        output.Should().Contain("lesson.png", "ordinary safe URLs must survive");
    }

    [Fact]
    public async Task SanitizeTrustedAsync_PreservesScriptTag_WithVerbatimContent()
    {
        var storage = new FakeStorage();
        const string key = "library/html/trusted-script";
        // The '<' inside the script is the point: the default Ganss LiteralText encoder
        // escapes it into "&lt;", which raw-text script content never decodes — a silent
        // syntax error. 13.A.1 pins verbatim passthrough.
        Store(storage, key, "<p>الدرس</p><script>var x = 3 < 5; initQuiz('مرحبا');</script>");
        var svc = Build(storage);

        var output = await svc.SanitizeTrustedAsync(key, ReadSize(storage, key));

        output.Should().Contain("<script>", "the script tag must survive in trusted mode");
        output.Should().Contain("3 < 5", "script content must NOT be entity-escaped (would break the JS)");
        output.Should().Contain("initQuiz", "script statements must survive verbatim");
    }

    [Fact]
    public async Task SanitizeTrustedAsync_PreservesHeadStyle_AndHeadScript_DocumentMode()
    {
        var storage = new FakeStorage();
        const string key = "library/html/trusted-head";
        // Head-resident style/script: fragment mode (Sanitize) returns only body children
        // and would silently drop both — trusted mode runs document mode for exactly this.
        Store(storage, key,
            "<html><head><style>.lesson{color:red}</style><script>boot();</script></head>"
            + "<body><p class=\"lesson\">نص التفاعل</p></body></html>");
        var svc = Build(storage);

        var output = await svc.SanitizeTrustedAsync(key, ReadSize(storage, key));

        output.Should().Contain("<style>", "head-resident <style> must survive (13.A.1)");
        output.Should().Contain(".lesson", "the CSS selector must survive");
        output.Should().Contain("color:", "the CSS declaration must survive (Ganss re-serializes colors as rgba)");
        output.Should().Contain("boot()", "head-resident <script> content must survive");
    }

    [Theory]
    [InlineData(true)]  // trusted  — kill-list is explicit (defense-in-depth)
    [InlineData(false)] // untrusted — Ganss defaults (unchanged by 13.A.1)
    public async Task SanitizeAsync_ObjectEmbed_AndJavascriptUri_StrippedInBothModes(bool trusted)
    {
        var storage = new FakeStorage();
        const string key = "library/html/hostile-vectors";
        Store(storage, key,
            "<object data=\"hostile.swf\"></object><embed src=\"hostile.swf\">"
            + "<a href=\"javascript:evil()\">رابط خبيث</a><p>محتوى سليم</p>");
        var svc = Build(storage);

        var output = trusted
            ? await svc.SanitizeTrustedAsync(key, ReadSize(storage, key))
            : await svc.SanitizeAsync(key, ReadSize(storage, key));

        output.Should().NotContain("<object", "plugin containers are stripped in BOTH modes");
        output.Should().NotContain("<embed", "plugin containers are stripped in BOTH modes");
        output.Should().NotContain("javascript:", "the javascript: scheme is stripped in BOTH modes");
        output.Should().Contain("محتوى سليم", "ordinary content must survive either way");
    }

    [Fact]
    public async Task SanitizeTrustedAsync_StripsBaseHref_AndFormActionAttributes()
    {
        var storage = new FakeStorage();
        const string key = "library/html/trusted-navigation";
        Store(storage, key,
            "<base href=\"https://evil.example/\">"
            + "<form action=\"https://evil.example/steal\" method=\"post\">"
            + "<button formaction=\"https://evil.example/hook\">إرسال</button></form>");
        var svc = Build(storage);

        var output = await svc.SanitizeTrustedAsync(key, ReadSize(storage, key));

        output.Should().NotContain("<base", "base hijacking is stripped in trusted mode");
        // "action=" also covers "formaction=" (substring) — both form-submit URL
        // attributes must be gone even though the form/button markup itself survives.
        output.Should().NotContain("action=", "form action attributes are stripped (CSP form-action 'none' backstops)");
        output.Should().Contain("<form", "the form element itself may survive");
    }

    [Fact]
    public async Task SanitizeTrustedAsync_StripsCssExpression_KeepsSafeCss()
    {
        var storage = new FakeStorage();
        const string key = "library/html/trusted-css";
        Store(storage, key,
            "<div style=\"width: expression(alert(1)); color: teal\">نص</div>"
            + "<style>.box{background-color: ivory; width: expression(alert(2))}</style>");
        var svc = Build(storage);

        var output = await svc.SanitizeTrustedAsync(key, ReadSize(storage, key));

        output.Should().NotContain("expression(", "CSS expression() is a script vector in BOTH modes");
        output.Should().Contain("color", "safe declarations in style attributes must survive");
        output.Should().Contain("background-color", "safe declarations in style elements must survive (values re-serialized as rgba)");
        output.Should().Contain("<style>", "the style element itself survives in trusted mode");
    }

    [Fact]
    public async Task SanitizeUntrusted_StripsOnclick_ExactlyAsBefore_13A1Unchanged()
    {
        var storage = new FakeStorage();
        const string key = "library/html/untrusted-button";
        Store(storage, key, "<button onclick=\"x()\">ثابت</button><script>alert(1)</script>");
        var svc = Build(storage);

        var output = await svc.SanitizeAsync(key, ReadSize(storage, key));

        output.Should().NotContain("onclick", "untrusted mode strips handlers — unchanged by 13.A.1");
        output.Should().NotContain("script", "untrusted mode strips script tags — unchanged by 13.A.1");
        output.Should().Contain("<button", "the static element itself survives");
        output.Should().Contain("ثابت", "ordinary content survives");
    }

    private static long ReadSize(FakeStorage storage, string key) => storage.Objects[key].Length;
}
