using Microsoft.Extensions.Caching.Memory;

namespace CMS.Api.Security;

/// <summary>
/// Fixed-window rate limiter for the admin login endpoint, enforced in-process ahead of
/// credential validation. Two independent partitions are counted on every attempt:
///   • per-IP          — 5 attempts per rolling 1-minute window
///   • per-e-mail      — 20 attempts per rolling 5-minute window (normalized: trimmed, lowercased)
/// Breaching either partition rejects the attempt with the time at which its window resets,
/// so the caller can answer with HTTP 429 + Retry-After. Student login is NOT covered here.
/// </summary>
public sealed class AdminLoginRateLimiter
{
    private const int IpPermitLimit = 5;
    private const int EmailPermitLimit = 20;
    private static readonly TimeSpan IpWindow = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan EmailWindow = TimeSpan.FromMinutes(5);

    private readonly IMemoryCache _cache;
    private readonly TimeProvider _clock;

    public AdminLoginRateLimiter(IMemoryCache cache, TimeProvider clock)
    {
        _cache = cache;
        _clock = clock;
    }

    /// <summary>Outcome of a rate-limit acquisition attempt.</summary>
    /// <param name="Allowed">True when the attempt may proceed to credential validation.</param>
    /// <param name="RetryAfterSeconds">When blocked: seconds until the breached window resets (always &gt; 0).</param>
    public readonly record struct Verdict(bool Allowed, int RetryAfterSeconds);

    private sealed class Counter
    {
        public int Value = 0;
    }

    public Verdict Acquire(string? ipAddress, string? email)
    {
        var now = _clock.GetUtcNow().UtcDateTime;

        var ipCount = Increment($"admin-login:ip:{ipAddress ?? "unknown-ip"}", IpWindow, now, out var ipWindowResetUtc);
        if (ipCount > IpPermitLimit)
            return new Verdict(false, RetryAfterSeconds(now, ipWindowResetUtc));

        var emailCount = Increment($"admin-login:email:{NormalizeEmail(email)}", EmailWindow, now, out var emailWindowResetUtc);
        if (emailCount > EmailPermitLimit)
            return new Verdict(false, RetryAfterSeconds(now, emailWindowResetUtc));

        return new Verdict(true, 0);
    }

    /// <summary>Increments the fixed-window counter for one partition and reports the window start.</summary>
    private int Increment(string partitionKey, TimeSpan window, DateTime nowUtc, out DateTime windowResetUtc)
    {
        // Fixed windows are anchored to the clock, not to the first request, so counters
        // are deterministic across instances. The cache entry simply outlives its window
        // — a stale entry is unreachable because the window index is part of the key.
        var windowIndex = nowUtc.Ticks / window.Ticks;
        windowResetUtc = new DateTime((windowIndex + 1) * window.Ticks, DateTimeKind.Utc);

        var counter = _cache.GetOrCreate(partitionKey + ":" + windowIndex, entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = window;
            return new Counter();
        })!;

        return Interlocked.Increment(ref counter.Value);
    }

    private static int RetryAfterSeconds(DateTime nowUtc, DateTime windowResetUtc)
    {
        var seconds = (int)Math.Ceiling((windowResetUtc - nowUtc).TotalSeconds);
        return Math.Max(seconds, 1);
    }

    public static string NormalizeEmail(string? email) =>
        string.IsNullOrWhiteSpace(email) ? "(none)" : email.Trim().ToLowerInvariant();
}
