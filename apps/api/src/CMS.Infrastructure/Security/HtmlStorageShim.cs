using System.Text.RegularExpressions;

namespace CMS.Infrastructure.Security;

/// <summary>
/// R56 — in-memory <c>localStorage</c>/<c>sessionStorage</c> shim for HTML
/// lessons served through GET /library/{id}/html-view.
///
/// Why: the html-view document is framed with sandbox="allow-scripts" (no
/// allow-same-origin — R51), so the browser assigns it an OPAQUE origin where
/// touching window.localStorage / window.sessionStorage throws SecurityError.
/// Lessons that persist preferences (dark mode, progress) crash on the very
/// first access and every line of their remaining JS dies with it (frozen
/// mobile view, dead interactivity on laptop).
///
/// Contract (R56 workorder): the shim is injected ONLY into the HTTP response
/// body of html-view — the stored object in object storage is NEVER touched.
/// It runs BEFORE any lesson script, hence right after the &lt;head&gt; open
/// tag (case-insensitive), or prepended when the document has none.
///
/// Scope guard (disclosed deviation, supervisor-visible): the controller only
/// injects on EnableScripts=true rows. Under script-src 'none' (static rows)
/// the shim could never execute — CSP + sandbox="" block all scripts — so
/// injecting there would be unreachable dead bytes, and static rows keep the
/// R51 verbatim-bytes contract.
///
/// Behavior of the script: if real storage works (a non-opaque context), the
/// try block succeeds and the shim is a no-op. Otherwise both storages are
/// replaced with per-document in-memory Maps exposing the W3C Storage surface
/// (getItem/setItem/removeItem/clear/key/length) via Object.defineProperty —
/// an own window property shadows the throwing Window.prototype accessor.
/// </summary>
public static partial class HtmlStorageShim
{
    /// <summary>The script element id — harness + tests key on it.</summary>
    public const string ScriptId = "cms-storage-shim";

    /// <summary>
    /// The shim, verbatim from the R56 workorder. Self-contained ES6, CSP-safe
    /// under script-src 'unsafe-inline' (inline, no external loads), and a
    /// no-op wherever real storage is available.
    /// </summary>
    public const string ScriptTag =
        """
        <script id="cms-storage-shim">
        (function() {
          try {
            window.localStorage.getItem('test');
            window.sessionStorage.getItem('test');
          } catch (e) {
            const createStorage = () => {
              const map = new Map();
              return {
                getItem: k => map.has(k) ? map.get(k) : null,
                setItem: (k, v) => map.set(k, String(v)),
                removeItem: k => map.delete(k),
                clear: () => map.clear(),
                key: i => Array.from(map.keys())[i] || null,
                get length() { return map.size; }
              };
            };
            Object.defineProperty(window, 'localStorage', { value: createStorage(), writable: false });
            Object.defineProperty(window, 'sessionStorage', { value: createStorage(), writable: false });
          }
        })();
        </script>
        """;

    /// <summary>
    /// Case-insensitive &lt;head …&gt; open-tag matcher. &lt;header&gt;/&lt;heading&gt;
    /// do NOT match: \b demands a non-word character right after "head".
    /// </summary>
    [GeneratedRegex(@"<head\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex HeadOpenTagRegex();

    /// <summary>
    /// Returns <paramref name="html"/> with <see cref="ScriptTag"/> inserted
    /// right after the FIRST case-insensitive &lt;head …&gt; open tag, or
    /// prepended to the whole string when the document has none (R56
    /// workorder contract). Note: prepending before a doctype flips such
    /// (rare, malformed) documents into quirks mode — accepted per the
    /// workorder's explicit "prepend" instruction.
    /// </summary>
    public static string Inject(string html)
    {
        ArgumentNullException.ThrowIfNull(html);
        var match = HeadOpenTagRegex().Match(html);
        return match.Success
            ? html.Insert(match.Index + match.Length, ScriptTag)
            : ScriptTag + html;
    }
}
