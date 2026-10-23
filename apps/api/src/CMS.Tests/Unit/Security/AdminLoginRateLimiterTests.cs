using CMS.Api.Security;
using FluentAssertions;
using Microsoft.Extensions.Caching.Memory;

namespace CMS.Tests.Unit.Security;

/// <summary>
/// FIX-5 — Verifies the admin login rate limiter's dual fixed-window partitions:
/// 5 attempts per minute per IP and 20 attempts per 5 minutes per normalized e-mail,
/// with a positive Retry-After hint while a window is breached.
/// </summary>
public sealed class AdminLoginRateLimiterTests
{
    private sealed class FakeTimeProvider : TimeProvider
    {
        private DateTimeOffset _utcNow = new(2026, 1, 1, 0, 0, 30, TimeSpan.Zero);
        public void Advance(TimeSpan delta) => _utcNow = _utcNow.Add(delta);
        public override DateTimeOffset GetUtcNow() => _utcNow;
    }

    private static (AdminLoginRateLimiter Limiter, FakeTimeProvider Clock) Create()
    {
        var clock = new FakeTimeProvider();
        return (new AdminLoginRateLimiter(new MemoryCache(new MemoryCacheOptions()), clock), clock);
    }

    [Fact]
    public void IpPartition_FiveAttemptsAllowed_SixthBlockedWithRetryAfter()
    {
        var (limiter, _) = Create();

        for (var attempt = 1; attempt <= 5; attempt++)
            limiter.Acquire("203.0.113.10", $"user{attempt}@example.com").Allowed.Should().BeTrue(
                $"attempt {attempt} from a fresh IP window must be allowed");

        var sixth = limiter.Acquire("203.0.113.10", "another@example.com");
        sixth.Allowed.Should().BeFalse("the 6th attempt within one minute from the same IP must be blocked");
        sixth.RetryAfterSeconds.Should().BeInRange(1, 60);
    }

    [Fact]
    public void IpPartition_WindowReset_AllowsAgain()
    {
        var (limiter, clock) = Create();

        for (var attempt = 0; attempt < 5; attempt++)
            limiter.Acquire("198.51.100.7", "someone@example.com");

        limiter.Acquire("198.51.100.7", "someone@example.com").Allowed.Should().BeFalse();

        // The fake clock starts at :30 — the 1-minute window resets at the next minute boundary.
        clock.Advance(TimeSpan.FromSeconds(31));
        limiter.Acquire("198.51.100.7", "someone@example.com").Allowed.Should().BeTrue(
            "a new fixed window must allow attempts again");
    }

    [Fact]
    public void EmailPartition_TwentyAttemptsAcrossDistinctIps_TwentyFirstBlocked()
    {
        var (limiter, _) = Create();

        for (var attempt = 1; attempt <= 20; attempt++)
            limiter.Acquire($"10.0.0.{attempt}", "target@cms.example.com").Allowed.Should().BeTrue(
                $"attempt {attempt} for the e-mail partition from a distinct IP must be allowed");

        var twentyFirst = limiter.Acquire("10.0.0.99", "target@cms.example.com");
        twentyFirst.Allowed.Should().BeFalse("the 21st attempt for the same e-mail within 5 minutes must be blocked");
        twentyFirst.RetryAfterSeconds.Should().BeInRange(1, 300);
    }

    [Fact]
    public void EmailPartition_IsNormalized_TrimmedAndCaseInsensitive()
    {
        var (limiter, _) = Create();
        AdminLoginRateLimiter.NormalizeEmail("  Admin@CMS.example.COM ").Should().Be("admin@cms.example.com");

        // 20 mixed-case/whitespace variants of the SAME e-mail, each from a distinct IP so
        // the IP partition never triggers — they must all share one e-mail quota.
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var variant = attempt % 2 == 0
                ? "Victim@CMS.Example.com"
                : "  victim@cms.example.com  ";
            limiter.Acquire($"172.16.0.{attempt}", variant).Allowed.Should().BeTrue(
                $"normalized variant {attempt} must count against the same e-mail quota");
        }

        var blocked = limiter.Acquire("172.16.0.250", "VICTIM@CMS.example.COM");
        blocked.Allowed.Should().BeFalse("the e-mail partition must normalize before counting");
    }
}
