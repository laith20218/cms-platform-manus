using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// W14.5 (Phase A) — B2 presigned URL service contract. Presigning is computed locally
/// by the AWS SDK (SigV4, no network round-trip), so these tests run against the real
/// signing pipeline offline, exactly like S3StorageServiceConfigurationTests.
/// </summary>
public sealed class B2PresignedUrlServiceTests
{
    private static IConfiguration BuildConfig(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static Dictionary<string, string?> CompleteConfig() => new()
    {
        ["Storage:S3:Endpoint"] = "https://s3.eu-central-003.backblazeb2.com",
        ["Storage:S3:Region"] = "eu-central-003",
        ["Storage:S3:AccessKey"] = "005e2f8e1b234d000000000005",
        ["Storage:S3:SecretKey"] = "K005xyzSECRETKEYabcDEFghiJKLmnoPQRstu/123456",
        ["Storage:S3:BucketName"] = "CMSmedia"
    };

    private static B2PresignedUrlService CreateService(Dictionary<string, string?>? config = null) =>
        new(BuildConfig(config ?? CompleteConfig()), NullLogger<B2PresignedUrlService>.Instance);

    [Fact]
    public async Task CreatePresignedUrlAsync_ProducesSignedGetUrl_WithConfiguredBucketAndKey()
    {
        var service = CreateService();

        var url = await service.CreatePresignedUrlAsync("library/abc/def.png");

        url.Should().StartWith("https://s3.eu-central-003.backblazeb2.com/CMSmedia/library/abc/def.png");
        url.Should().Contain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
        url.Should().Contain("X-Amz-Signature=");
        url.Should().Contain("X-Amz-Expires=3600", "the default presign expiry is 60 minutes");
    }

    [Fact]
    public async Task CreatePresignedUrlAsync_HonorsConfiguredExpiryMinutes()
    {
        var cfg = CompleteConfig();
        cfg["Storage:S3:PresignExpiryMinutes"] = "5";
        var service = CreateService(cfg);

        var url = await service.CreatePresignedUrlAsync("library/abc/def.png");

        url.Should().Contain("X-Amz-Expires=300");
    }

    [Fact]
    public async Task CreatePresignedUrlAsync_Throws_WhenConfigIsAbsent()
    {
        var service = CreateService(new Dictionary<string, string?>());

        var act = () => service.CreatePresignedUrlAsync("library/abc/def.png");

        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task CreatePresignedUrlAsync_Throws_OnEmptyKey()
    {
        var service = CreateService();

        var act = () => service.CreatePresignedUrlAsync(" ");

        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task ResolveImageUrlAsync_PassesThroughAbsoluteHttpsUrl_Unchanged()
    {
        // The current production contract: admin-web composes full public bucket URLs
        // (VITE_R2_PUBLIC_BASE + fileKey) and students render them raw — those must NOT
        // be rewritten (rewriting would double-sign already-public URLs).
        var service = CreateService();
        const string publicUrl = "https://f000.backblazeb2.com/CMSmedia/library/abc/def.png";

        (await service.ResolveImageUrlAsync(publicUrl)).Should().Be(publicUrl);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" ")]
    public async Task ResolveImageUrlAsync_PassesThroughNullAndWhitespace(string? value)
    {
        var service = CreateService();

        (await service.ResolveImageUrlAsync(value)).Should().Be(value);
    }

    [Fact]
    public async Task ResolveImageUrlAsync_PassesThroughDataUri_Unchanged()
    {
        var service = CreateService();
        const string dataUri = "data:image/png;base64,iVBORw0KGgo=";

        (await service.ResolveImageUrlAsync(dataUri)).Should().Be(dataUri);
    }

    [Fact]
    public async Task ResolveImageUrlAsync_PresignsBareObjectKey_AgainstConfiguredBucket()
    {
        var service = CreateService();

        var url = await service.ResolveImageUrlAsync("library/abc/def.png");

        url.Should().StartWith("https://s3.eu-central-003.backblazeb2.com/CMSmedia/library/abc/def.png");
        url.Should().Contain("X-Amz-Signature=");
    }

    [Fact]
    public async Task ResolveImageUrlAsync_PresignsB2Uri_AgainstExplicitBucket()
    {
        var service = CreateService();

        var url = await service.ResolveImageUrlAsync("b2://other-bucket/questions/img.png");

        url.Should().StartWith("https://s3.eu-central-003.backblazeb2.com/other-bucket/questions/img.png");
        url.Should().Contain("X-Amz-Signature=");
    }

    [Fact]
    public async Task ResolveImageUrlAsync_B2UriWithoutKey_ReturnsOriginalValue()
    {
        var service = CreateService();
        const string malformed = "b2://CMSmedia";

        (await service.ResolveImageUrlAsync(malformed)).Should().Be(malformed);
    }

    [Fact]
    public async Task ResolveImageUrlAsync_WhenConfigIsAbsent_ReturnsStoredValue()
    {
        // Graceful degradation by design: the questions read path must never fail
        // because storage configuration is missing (the W14.5 incident class).
        var service = CreateService(new Dictionary<string, string?>());

        (await service.ResolveImageUrlAsync("library/abc/def.png")).Should().Be("library/abc/def.png");
        (await service.ResolveImageUrlAsync("b2://other-bucket/questions/img.png")).Should().Be("b2://other-bucket/questions/img.png");
    }
}
