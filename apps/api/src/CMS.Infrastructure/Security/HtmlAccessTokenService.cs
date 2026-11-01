using System.Collections.Concurrent;
using System.Security.Cryptography;
using CMS.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Security;

/// <summary>
/// R51 — in-memory implementation of <see cref="IHtmlAccessTokenService"/>.
///
/// Token shape: 32 cryptographic-random bytes, base64url-encoded (opaque —
/// carries no file/student data; the binding lives server-side in the map).
///
/// Guarantees:
///  - TTL: every entry carries its own expiry (5 minutes after issue); the
///    clock comes from the injected <see cref="TimeProvider"/> (TimeProvider.System
///    in production) so tests can travel in time deterministically.
///  - Single-use: consumption is a single atomic ConcurrentDictionary.TryRemove —
///    a racing duplicate request for the same token loses the race and fails closed.
///  - Rate limit: max 5 issues per student per rolling 60s window; the 6th
///    issue inside the window returns null (controller answers 429).
///  - Sweep: expired entries are pruned opportunistically on every Issue so
///    the map cannot grow without bound.
///
/// The map is per-process by design: tokens are worthless after a restart or
/// across a load-balanced pair, and no storage is ever touched (R51 constraint).
/// </summary>
public sealed class HtmlAccessTokenService : IHtmlAccessTokenService
{
    internal const int TokenTtlMinutes = 5;
    internal const int MaxIssuesPerMinute = 5;
    private static readonly TimeSpan RateWindow = TimeSpan.FromMinutes(1);

    private readonly record struct Entry(Guid FileId, Guid StudentId, DateTimeOffset ExpiresAt);

    private readonly ConcurrentDictionary<string, Entry> _tokens = new();
    private readonly ConcurrentDictionary<Guid, Queue<DateTimeOffset>> _issueLog = new();
    private readonly TimeProvider _clock;
    private readonly ILogger<HtmlAccessTokenService> _logger;

    public HtmlAccessTokenService(TimeProvider clock, ILogger<HtmlAccessTokenService> logger)
    {
        _clock = clock;
        _logger = logger;
    }

    /// <summary>Cryptographic-random 32 bytes → base64url (no padding, URL-safe).</summary>
    internal static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public HtmlAccessTokenGrant? Issue(Guid fileId, Guid studentId)
    {
        var now = _clock.GetUtcNow();
        SweepExpired(now);

        if (!TryLogIssue(studentId, now))
        {
            _logger.LogWarning("HTML access issue rate-limited for student {StudentId} (file {FileId})", studentId, fileId);
            return null;
        }

        var token = NewToken();
        var expiresAt = now.AddMinutes(TokenTtlMinutes);
        _tokens[token] = new Entry(fileId, studentId, expiresAt);
        _logger.LogInformation("HTML access token issued for student {StudentId} on file {FileId}", studentId, fileId);
        return new HtmlAccessTokenGrant(token, expiresAt);
    }

    public HtmlAccessTokenPayload? Consume(string token, string? ip)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        // Atomic take: a successful TryRemove IS the single-use guarantee —
        // the token cannot be consumed twice even under concurrent requests.
        if (!_tokens.TryRemove(token, out var entry)) return null;

        if (entry.ExpiresAt <= _clock.GetUtcNow())
        {
            _logger.LogWarning("HTML access token expired before use (file {FileId}, ip {Ip})", entry.FileId, ip ?? "unknown");
            return null;
        }

        _logger.LogInformation("HTML access token consumed (file {FileId}, student {StudentId}, ip {Ip})", entry.FileId, entry.StudentId, ip ?? "unknown");
        return new HtmlAccessTokenPayload(entry.FileId, entry.StudentId);
    }

    private void SweepExpired(DateTimeOffset now)
    {
        foreach (var key in _tokens.Keys)
        {
            if (_tokens.TryGetValue(key, out var entry) && entry.ExpiresAt <= now)
                _tokens.TryRemove(key, out _);
        }
    }

    private bool TryLogIssue(Guid studentId, DateTimeOffset now)
    {
        var window = _issueLog.GetOrAdd(studentId, _ => new Queue<DateTimeOffset>());
        lock (window)
        {
            while (window.Count > 0 && now - window.Peek() > RateWindow) window.Dequeue();
            if (window.Count >= MaxIssuesPerMinute) return false;
            window.Enqueue(now);
            return true;
        }
    }
}

/// <summary>
/// R51 — the per-file Content-Security-Policy <b>response header</b> for
/// GET /library/{id}/html-view. Identical profile to the retired client-side
/// injector (html-csp.ts: default-src 'none' offline base, explicit script-src
/// in both modes per R44) PLUS frame-ancestors naming the student-web origin:
/// the document is now framed cross-origin, so the header alone decides who
/// may embed it. The browser enforces this policy on the iframe document —
/// no client-side meta injection exists anymore (single source of truth).
/// </summary>
public static class HtmlViewCsp
{
    /// <summary>Fallback when Cors:StudentApp is not configured — the deployed
    /// student-web origin (R51 workorder value).</summary>
    public const string DefaultFrameAncestors = "https://cms-platform-manus-student-web.vercel.app";

    public static string Build(bool enableScripts, string frameAncestors) =>
        "default-src 'none'; " +
        "style-src 'unsafe-inline'; " +
        "img-src data: blob:; " +
        "font-src data:; " +
        "media-src data: blob:; " +
        "connect-src 'none'; " +
        "frame-src 'none'; " +
        "object-src 'none'; " +
        "base-uri 'none'; " +
        "form-action 'none'; " +
        (enableScripts ? "script-src 'unsafe-inline'; " : "script-src 'none'; ") +
        "frame-ancestors " + (string.IsNullOrWhiteSpace(frameAncestors) ? DefaultFrameAncestors : frameAncestors.Trim());
}
