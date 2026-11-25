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

    /// <summary>
    /// Returns a log-safe rendering of <paramref name="value"/>: every control
    /// character (CR, LF, NUL, …) replaced with a space and the result capped
    /// to <paramref name="maxLength"/>. Null renders as an empty string.
    /// </summary>
    public static string Clean(string? value, int maxLength = DefaultMaxLength)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        if (value.Length <= maxLength && !ContainsControlChar(value)) return value;

        var builder = new System.Text.StringBuilder(value.Length);
        var kept = 0;
        foreach (var ch in value)
        {
            if (kept >= maxLength) break;
            if (char.IsControl(ch))
            {
                builder.Append(' ');
                kept++;
            }
            else
            {
                builder.Append(ch);
                kept++;
            }
        }
        return builder.ToString();
    }

    private static bool ContainsControlChar(string value)
    {
        foreach (var ch in value) if (char.IsControl(ch)) return true;
        return false;
    }
}
