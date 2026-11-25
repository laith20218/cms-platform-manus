namespace CMS.Api.Middleware;

/// <summary>
/// Central log-input sanitizer (CodeQL cs/log-forging remediation).
///
/// Middleware logs request-derived values (path, method, user agent, ids).
/// Those values are user-influenced and must never reach log sinks verbatim:
/// a raw CR/LF (or other control character) in a path or header lets a caller
/// forge extra log lines. Every request-derived value that is interpolated
/// into a log message template goes through <see cref="Clean"/> first.
///
/// The sanitizer is deliberately conservative: control characters become
/// spaces, and overlong values are truncated. It does not attempt to interpret
/// or "un-escape" encoded payloads — the goal is only that the logged string
/// cannot alter the log stream's line structure. Correlation IDs and trace
/// identifiers remain the join keys across entries.
/// </summary>
public static class LogSanitizer
{
    private const int DefaultMaxLength = 256;

    // Control characters (C0 + DEL), matched by the regex pass below.
    private const string ControlCharPattern = "[\\x00-\\x1F\\x7F]";

    /// <summary>
    /// Returns a log-safe rendering of <paramref name="value"/>: every control
    /// character (CR, LF, NUL, …) replaced with a space and the result capped
    /// to <paramref name="maxLength"/>. Null renders as an empty string.
    /// </summary>
    public static string Clean(string? value, int maxLength = DefaultMaxLength)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;

        // Three independent sanitisation barriers, in order:
        //  1. constant Replace of CR — a recognised log-injection barrier,
        //  2. constant Replace of LF — likewise,
        //  3. a regex pass that rewrites every remaining control character.
        // Layering matters: the first two are the canonical modelled
        // sanitizers; the regex pass is defense-in-depth for NUL/tab/DEL and
        // any other C0 character that could still disturb log structure.
        var flattened = value.Replace("\r", " ").Replace("\n", " ");
        var stripped = System.Text.RegularExpressions.Regex.Replace(flattened, ControlCharPattern, " ");
        return stripped.Length <= maxLength ? stripped : stripped[..maxLength];
    }

}
