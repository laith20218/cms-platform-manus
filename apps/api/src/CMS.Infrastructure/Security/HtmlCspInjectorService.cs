using System.Text;
using System.Text.RegularExpressions;
using CMS.Application.Interfaces;

namespace CMS.Infrastructure.Security;

/// <summary>
/// Wave 13 (F3) — defense-in-depth CSP injection for stored HTML documents.
///
/// The supervisor's ruling: CSP must be injected at UPLOAD time, so the object
/// stored in B2/R2 is already locked down even if the client-side safety net
/// (the srcDoc re-injection in the HtmlPlayer) ever fails to run. The player
/// re-runs the same idempotent transform as a second layer — belt and suspenders.
///
/// The injected policy is the strict offline profile (G-1/G-3):
///   - default-src 'none'      → nothing loads unless explicitly allowed;
///   - style-src 'unsafe-inline' / img-src data: blob: / font-src data:
///     → self-contained single-file lessons (inline styles, embedded images/fonts);
///   - connect-src 'none', frame-src 'none', object-src 'none',
///     base-uri 'none', form-action 'none'
///     → zero external connections, zero nesting, zero navigation;
///   - script-src 'unsafe-inline' is appended ONLY when the row was uploaded with
///     EnableScripts=true (team-built interactive lessons; inline scripts only —
///     there is no other allowed source, so external script URLs stay dead).
///
/// Idempotency contract: any existing CSP meta (http-equiv="Content-Security-Policy")
/// — ours from a previous pass or a foreign one — is REMOVED before a fresh tag is
/// injected, so re-running the injector never duplicates the tag. Our tag carries
/// data-cms-injected="true" as the recognizable signature (E2E asserts it).
///
/// Robustness: BOM is stripped, matching is case-insensitive and attribute-order
/// agnostic, and the three document shapes are handled — (1) normal &lt;head&gt;,
/// (2) &lt;html&gt; without &lt;head&gt;, (3) fragment/malformed markup (the meta is
/// prepended; the HTML parser hoists it into the auto-created head either way).
/// </summary>
public sealed partial class HtmlCspInjectorService : IHtmlCspInjector
{
    /// <summary>Byte offset guard: a CSP meta must live inside the first bytes of the
    /// document to be honoured for every possible load path; injecting right after
    /// &lt;head&gt; (or prepending) always satisfies this.</summary>
    private const string InjectedSignature = "data-cms-injected=\"true\"";

    private const string StaticCsp =
        "default-src 'none'; " +
        "style-src 'unsafe-inline'; " +
        "img-src data: blob:; " +
        "font-src data:; " +
        "connect-src 'none'; " +
        "frame-src 'none'; " +
        "object-src 'none'; " +
        "base-uri 'none'; " +
        "form-action 'none'";

    private const string ScriptsCsp = StaticCsp + "; script-src 'unsafe-inline'";

    [GeneratedRegex("<meta\\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex MetaTagRegex();

    [GeneratedRegex("<head\\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex HeadOpenRegex();

    [GeneratedRegex("<html\\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex HtmlOpenRegex();

    /// <inheritdoc />
    public string Inject(string html, bool enableScripts)
    {
        if (string.IsNullOrEmpty(html))
            return html ?? string.Empty;

        // BOM: a leading U+FEFF would sit before every match and confuse the
        // doctype/head anchoring for byte-oriented consumers. UTF-8 no-BOM is
        // the storage contract (objects are served with charset=utf-8).
        if (html[0] == '\uFEFF')
            html = html[1..];

        var policy = enableScripts ? ScriptsCsp : StaticCsp;
        var metaTag = $"<meta http-equiv=\"Content-Security-Policy\" {InjectedSignature} content=\"{policy}\">";

        // ---- Idempotency: strip EVERY existing CSP meta (ours or foreign) ----
        // Attribute-order agnostic: we scan each <meta ...> tag and drop it when it
        // declares the CSP http-equiv OR carries our injection signature.
        html = MetaTagRegex().Replace(html, match =>
        {
            var tag = match.Value;
            var lowered = tag.ToLowerInvariant();
            var isCspMeta = (lowered.Contains("http-equiv") && lowered.Contains("content-security-policy"))
                            || lowered.Contains("data-cms-injected");
            return isCspMeta ? string.Empty : tag;
        });

        // ---- Injection point 1: right after an existing <head ...> ----
        var head = HeadOpenRegex().Match(html);
        if (head.Success)
        {
            return string.Concat(
                html.AsSpan(0, head.Index + head.Length),
                metaTag,
                html.AsSpan(head.Index + head.Length));
        }

        // ---- Injection point 2: <html ...> without <head> — create the head ----
        var htmlOpen = HtmlOpenRegex().Match(html);
        if (htmlOpen.Success)
        {
            // BUILD FIX (13.A.1 compile pass): the original 5-argument span overload
            // string.Concat(ROS, ROS, ROS, ROS, ROS) does not exist on .NET 9 (added
            // in .NET 10) — the very first real compilation of this file (no SDK in
            // the sandbox during 13.A) surfaced CS1503. Plain string slicing has the
            // identical semantics with two extra intermediate strings at upload time.
            return string.Concat(
                html[..(htmlOpen.Index + htmlOpen.Length)],
                "<head>",
                metaTag,
                "</head>",
                html[(htmlOpen.Index + htmlOpen.Length)..]);
        }

        // ---- Injection point 3: fragment / malformed markup — prepend ----
        // The HTML parser hoists a leading <meta> into the auto-created <head>,
        // so even a body-only or truncated document gets the policy applied.
        return string.Concat(metaTag, "\n", html);
    }
}
