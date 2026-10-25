using CMS.Domain.Constants;
using FluentAssertions;

namespace CMS.Tests.Unit.Constants;

/// <summary>
/// Push 10.0 — MediaPolicy is the single source of truth for presigned-URL TTLs.
/// These values are load-bearing: the playback endpoint hands them to clients as the
/// URL's honest lifetime, and refactor regressions must fail here, not in production.
/// </summary>
public sealed class MediaPolicyTests
{
    [Fact]
    public void PlaybackUrlTtlSeconds_Is540()
    {
        MediaPolicy.PlaybackUrlTtlSeconds.Should().Be(540);
    }

    [Fact]
    public void UploadUrlTtlSeconds_Is600()
    {
        MediaPolicy.UploadUrlTtlSeconds.Should().Be(600);
    }

    [Fact]
    public void PresignedAccessTtlSeconds_Is300()
    {
        MediaPolicy.PresignedAccessTtlSeconds.Should().Be(300);
    }

    [Fact]
    public void AvatarUrlTtlSeconds_Is600()
    {
        MediaPolicy.AvatarUrlTtlSeconds.Should().Be(600);
    }

    [Fact]
    public void UpstashPresignCapSeconds_Is600()
    {
        // Upstash Blob's presign agent refuses anything longer than 10 minutes.
        MediaPolicy.UpstashPresignCapSeconds.Should().Be(600);
    }

    [Fact]
    public void EveryTtl_FitsUnderTheUpstashPresignCap()
    {
        MediaPolicy.PlaybackUrlTtlSeconds.Should().BeLessOrEqualTo(MediaPolicy.UpstashPresignCapSeconds);
        MediaPolicy.UploadUrlTtlSeconds.Should().BeLessOrEqualTo(MediaPolicy.UpstashPresignCapSeconds);
        MediaPolicy.PresignedAccessTtlSeconds.Should().BeLessOrEqualTo(MediaPolicy.UpstashPresignCapSeconds);
        MediaPolicy.AvatarUrlTtlSeconds.Should().BeLessOrEqualTo(MediaPolicy.UpstashPresignCapSeconds);
    }
}
