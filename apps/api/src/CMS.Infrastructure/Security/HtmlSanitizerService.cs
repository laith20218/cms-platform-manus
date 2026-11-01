using System.Text;
using System.Text.RegularExpressions;
using CMS.Application.Interfaces;
using Ganss.Xss;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Security;

/// <summary>
/// Server-side HTML sanitizer for uploaded library documents (Ganss.XSS).
///
/// Two policies (Wave 13 / Q1 ruling, amended by 13.A.1):
///  - STRICT  (<see cref="SanitizeAsync"/>)  — the A2-5 default: strips every script,
///    iframe/object/embed, on* handler, javascript:/data: URL and CSS injection vector.
///    Unchanged by 13.A.1 — byte-for-byte the same behavior as before the amendment.
///  - TRUSTED (<see cref="SanitizeTrustedAsync"/>) — for team-built interactive lessons
///    uploaded with EnableScripts=true (G-1: only admins can upload, files are built
///    in-house). 13.A.1 policy: PRESERVES <c>&lt;script&gt;</c> AND <c>&lt;style&gt;</c>
///    tags AND every inline on* event handler (onclick, onerror, ontouchstart, …) the
///    document actually uses, while STILL stripping <c>&lt;object&gt;</c>, <c>&lt;embed&gt;</c>,
///    <c>&lt;iframe&gt;</c>, <c>&lt;base&gt;</c>, form action/formaction attributes,
///    javascript:/vbscript: URLs and CSS expression(). Trusted mode additionally runs in
///    DOCUMENT mode (SanitizeDocument) so script/style resident in <c>&lt;head&gt;</c> survive —
///    fragment mode would silently drop them (Ganss' Sanitize() returns only body children).
///    The injected CSP (HtmlCspInjectorService) allows ONLY inline script/style — any
///    external URL remains dead. Virus scanning runs for both paths (caller).
///
/// THREAT MODEL (13.A.1, documented per the supervisor's ruling): the preserved on*
/// handlers and script/style content are SAFE because the student player renders the
/// document inside an iframe sandbox with an OPAQUE origin (sandbox="allow-scripts",
/// never allow-same-origin) and the injected CSP pins connect-src 'none' / form-action
/// 'none' / frame-src 'none' / base-uri 'none'. Any script — even hostile — executes
/// with no same-origin access to CMS cookies/DOM and no network escape. The admin
/// toggle (G-1: admins only) is the trust boundary; the sandbox is the containment.
///
/// Script CONTENT is passed through verbatim: the default Ganss LiteralText encoder
/// escapes &lt;/&gt; inside raw-text elements, which would corrupt every script containing
/// comparison operators ("if (a &lt; b)" → "if (a &amp;lt; b)" — a syntax error, since
/// script content is raw text and never entity-decoded). Trusted mode swaps the encoder
/// for a no-op: the only LiteralText element that can survive the trusted allow-list is
/// script itself (style is excluded by Ganss and owned by the CSS sanitizer; title/
/// textarea/iframe/noscript are removed outright), and a literal "&lt;/script&gt;" breakout
/// is impossible by construction — the HTML tokenizer ends script data ONLY on a real
/// closing tag, so smuggling cannot turn script text into markup, and the sandbox
/// contains whatever the script does anyway.
///
/// Both methods download the HTML object, sanitize it, return the clean body AND
/// overwrite the same object key in place when the sanitizer changed anything, so the
/// database row keeps pointing at a single, always-clean object. Failure semantics are
/// fail-closed: ANY exception (storage outage, oversized body, sanitizer fault)
/// propagates to the caller, which must reject the upload and delete the blob. A
/// document that cannot be proven clean is never accepted.
///
/// Memory safety: the body is only buffered after the caller's declared ceiling is applied,
/// and the read is hard-capped at that value (plus a global 32 MB absolute cap) so a lying
/// storage object cannot OOM the container.
/// </summary>
public sealed partial class HtmlSanitizerService : IHtmlBlobSanitizer
{
    /// <summary>Sanitization hard cap independent of the caller's ceiling: 32 MB of HTML is far beyond any legitimate document.</summary>
    private const long AbsoluteHardCapBytes = 32L * 1024 * 1024;

    /// <summary>
    /// 13.A.1 — matches an inline event-handler attribute name in the RAW document
    /// (onclick=, onerror=, ontouchstart=, …). Deliberately permissive by design: the
    /// only two failure modes are benign. A MISSED handler is merely stripped from the
    /// output (fail-closed: a functionality loss, never a security hole); an OVER-matched
    /// name (e.g. "once" from prose, or "on" out of data-on="…") only widens the
    /// allow-list for a handler the sandboxed, CSP-pinned iframe cannot abuse anyway
    /// (see the threat model above). Event-handler names are ASCII per the HTML spec,
    /// so [a-zA-Z]+ covers every real one; \s*=\ tolerates whitespace around the equals
    /// sign, and matching the RAW string (comments and attribute values included) only
    /// ever adds harmless allow-list entries.
    /// </summary>
    [GeneratedRegex("\\b(on[a-zA-Z]+)\\s*=", RegexOptions.Compiled)]
    private static partial Regex InlineEventHandlerRegex();

    private readonly IFileStorageService _storage;
    private readonly ILogger<HtmlSanitizerService> _logger;

    public HtmlSanitizerService(IFileStorageService storage, ILogger<HtmlSanitizerService> logger)
    {
        _storage = storage;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task<string> SanitizeAsync(string objectKey, long declaredSizeBytes, CancellationToken ct = default) =>
        SanitizeCoreAsync(objectKey, declaredSizeBytes, preserveScripts: false, ct);

    /// <inheritdoc />
    public Task<string> SanitizeTrustedAsync(string objectKey, long declaredSizeBytes, CancellationToken ct = default) =>
        SanitizeCoreAsync(objectKey, declaredSizeBytes, preserveScripts: true, ct);

    private async Task<string> SanitizeCoreAsync(string objectKey, long declaredSizeBytes, bool preserveScripts, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
            throw new ArgumentException("Object key must be provided by the server.", nameof(objectKey));

        var effectiveCap = Math.Min(Math.Max(declaredSizeBytes, 0), AbsoluteHardCapBytes);
        if (effectiveCap == 0)
            return string.Empty; // nothing to sanitize

        // ---- Bounded download: at most effectiveCap bytes are ever buffered ----
        string originalHtml;
        var buffer = new byte[effectiveCap];
        await using (var source = await _storage.DownloadAsync(objectKey, ct))
        {
            var totalRead = 0;
            while (totalRead < buffer.Length)
            {
                var read = await source.ReadAsync(buffer.AsMemory(totalRead, buffer.Length - totalRead), ct);
                if (read == 0) break;
                totalRead += read;
            }

            if (totalRead == buffer.Length && source.ReadByte() != -1)
                throw new InvalidOperationException(
                    $"HTML object '{objectKey}' exceeds the declared size ceiling ({effectiveCap} bytes); refusing to sanitize");

            originalHtml = Encoding.UTF8.GetString(buffer, 0, totalRead);
        }

        // ---- Sanitize (Ganss.XSS) ----
        // STRICT: the default policy strips script/iframe/object/embed/style vectors,
        // on* attributes, javascript:/vbscript: and dangerous data: URLs, form/action
        // rewriting — while preserving ordinary Arabic text markup. Fragment mode
        // (Sanitize) — UNCHANGED by 13.A.1.
        // TRUSTED: ConfigureTrustedPolicy below re-enables script/style/handlers and
        // runs DOCUMENT mode (SanitizeDocument) so <head>-resident script/style
        // survive. A fresh instance per call keeps the pipeline thread-safe under
        // concurrent uploads.
        string sanitizedHtml;
        try
        {
            var sanitizer = new HtmlSanitizer();
            if (preserveScripts)
            {
                ConfigureTrustedPolicy(sanitizer, originalHtml);
                // Document mode: even if only a fragment is given, a whole document
                // comes back (the parser wraps fragments in html/head/body) — which
                // also gives the CSP injector a real <head> to pin the meta into.
                sanitizedHtml = sanitizer.SanitizeDocument(originalHtml);
            }
            else
            {
                sanitizedHtml = sanitizer.Sanitize(originalHtml);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ganss.XSS sanitizer fault on object {ObjectKey} (preserveScripts={PreserveScripts})", objectKey, preserveScripts);
            throw new InvalidOperationException("HTML sanitizer fault", ex);
        }

        if (string.IsNullOrEmpty(originalHtml))
        {
            _logger.LogInformation("HTML object {ObjectKey} is empty; nothing to sanitize", objectKey);
            return sanitizedHtml;
        }

        // ---- In-place overwrite (only when the sanitizer actually changed something) ----
        if (string.Equals(sanitizedHtml, originalHtml, StringComparison.Ordinal))
        {
            _logger.LogInformation("HTML object {ObjectKey} already clean; no rewrite needed (preserveScripts={PreserveScripts})",
                objectKey, preserveScripts);
            return sanitizedHtml;
        }

        await using var sanitized = new MemoryStream(Encoding.UTF8.GetBytes(sanitizedHtml));
        await _storage.PutAsync(objectKey, sanitized, "text/html", ct);
        _logger.LogInformation(
            "HTML object {ObjectKey} sanitized in place (preserveScripts={PreserveScripts}) ({OriginalLength:N0} chars → {SanitizedLength:N0} chars)",
            objectKey, preserveScripts, originalHtml.Length, sanitizedHtml.Length);
        return sanitizedHtml;
    }

    /// <summary>
    /// 13.A.1 — the TRUSTED policy (EnableScripts=true, admin-uploaded lessons only).
    ///
    /// Keeps: <c>&lt;script&gt;</c>, <c>&lt;style&gt;</c>, every on* handler present in the
    /// document, and script text content (LiteralText encoder → no-op, see the class
    /// threat model).
    ///
    /// Strips (explicit kill-list over the Ganss defaults — belt and suspenders):
    /// <c>&lt;object&gt;</c>, <c>&lt;embed&gt;</c>, <c>&lt;iframe&gt;</c>, <c>&lt;base&gt;</c>,
    /// the form action/formaction attributes (Ganss allows "action" by default; form
    /// submission itself is dead downstream — CSP form-action 'none' + sandbox without
    /// allow-forms), javascript:/vbscript: URLs (default scheme filter) and CSS
    /// expression() (default CSS sanitizer).
    /// </summary>
    private static void ConfigureTrustedPolicy(HtmlSanitizer sanitizer, string originalHtml)
    {
        // ---- Keep executable content (13.A + 13.A.1) ----
        sanitizer.AllowedTags.Add("script");
        sanitizer.AllowedTags.Add("style");
        // Script bodies must survive verbatim (the default LiteralText encoder escapes
        // </> and would corrupt real JS); see the class-level threat model for why a
        // no-op is safe here. Style is already excluded from that encoder by Ganss and
        // is sanitized as CSS by the stylesheet pass; every other LiteralText element
        // (title, textarea, iframe, noscript, …) is removed outright by the kill-list
        // below / the Ganss defaults, so the no-op only ever applies to script.
        sanitizer.EncodeLiteralTextElementContent = static _ => { };

        // ---- Preserve ALL inline event handlers the document actually uses ----
        foreach (var name in InlineEventHandlerRegex().Matches(originalHtml)
                     .Select(match => match.Groups[1].Value.ToLowerInvariant())
                     .Distinct())
        {
            sanitizer.AllowedAttributes.Add(name);
        }

        // ---- Explicit kill-list (defense-in-depth over the Ganss defaults) ----
        sanitizer.AllowedTags.Remove("object");
        sanitizer.AllowedTags.Remove("embed");
        sanitizer.AllowedTags.Remove("iframe");
        sanitizer.AllowedTags.Remove("base");
        sanitizer.AllowedAttributes.Remove("action");
        sanitizer.AllowedAttributes.Remove("formaction");
    }
}
