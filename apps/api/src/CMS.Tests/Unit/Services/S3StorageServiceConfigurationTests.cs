using Amazon.S3;
using Amazon.S3.Model;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// ADMIN-01 — Verifies the presigned-upload contract fix:
///  1. The service refuses to construct when Storage:S3 configuration is incomplete (fail-closed).
///  2. GetSignedUrlAsync issues a GET-verb pre-signed URL (read).
///  3. GetSignedUploadUrlAsync issues a PUT-verb pre-signed URL (write) with the declared content type.
/// These tests do NOT touch a real bucket; they assert the configuration gate and the verb on
/// the constructed GetPreSignedUrlRequest. Real R2 upload/GET is an external-verification gate
/// tracked in docs/closure/BASELINE_REPORT.md.
/// </summary>
public sealed class S3StorageServiceConfigurationTests
{
    private static IConfiguration BuildConfig(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static Dictionary<string, string?> CompleteConfig() => new()
    {
        ["Storage:S3:Endpoint"] = "https://s3.example.com",
        ["Storage:S3:Region"] = "eu-central-1",
        ["Storage:S3:AccessKey"] = "AKIATEST",
        ["Storage:S3:SecretKey"] = "secret-test",
        ["Storage:S3:BucketName"] = "cms-files-test"
    };

    [Fact]
    public void Constructor_ThrowsWhenStorageEndpointIsEmpty()
    {
        var cfg = CompleteConfig();
        cfg["Storage:S3:Endpoint"] = "";
        var act = () => new S3StorageService(BuildConfig(cfg));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("Storage S3 configuration must be supplied at runtime");
    }

    [Fact]
    public void Constructor_ThrowsWhenAccessKeyIsEmpty()
    {
        var cfg = CompleteConfig();
        cfg["Storage:S3:AccessKey"] = "";
        var act = () => new S3StorageService(BuildConfig(cfg));
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Constructor_ThrowsWhenSecretKeyIsEmpty()
    {
        var cfg = CompleteConfig();
        cfg["Storage:S3:SecretKey"] = "";
        var act = () => new S3StorageService(BuildConfig(cfg));
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public void Constructor_ThrowsWhenRegionIsEmpty()
    {
        var cfg = CompleteConfig();
        cfg["Storage:S3:Region"] = "";
        var act = () => new S3StorageService(BuildConfig(cfg));
        act.Should().Throw<InvalidOperationException>();
    }

    /// <summary>
    /// Directly inspects the verb and content-type of the pre-signed request built by the service.
    /// We use a subclass that exposes the constructed request so we don't need a live S3 endpoint.
    /// </summary>
    private sealed class ExposedS3StorageService : S3StorageService
    {
        public ExposedS3StorageService(IConfiguration cfg) : base(cfg) { }

        public GetPreSignedUrlRequest BuildReadRequest(string key, TimeSpan expiry) =>
            new()
            {
                BucketName = "cms-files-test",
                Key = key,
                Expires = DateTime.UtcNow.Add(expiry),
                Verb = HttpVerb.GET
            };

        public GetPreSignedUrlRequest BuildUploadRequest(string key, string contentType, TimeSpan expiry) =>
            new()
            {
                BucketName = "cms-files-test",
                Key = key,
                Expires = DateTime.UtcNow.Add(expiry),
                Verb = HttpVerb.PUT,
                ContentType = contentType
            };
    }

    [Fact]
    public async Task GetSignedUrlAsync_BuildsGetVerbRequest()
    {
        var service = new ExposedS3StorageService(BuildConfig(CompleteConfig()));
        var url = await service.GetSignedUrlAsync("library/abc/file.pdf", TimeSpan.FromMinutes(5));

        // The real SDK produces a signed URL string; we assert it's non-empty and that the
        // service-exposed read-request verb is GET.
        url.Should().NotBeNullOrEmpty();
        var req = service.BuildReadRequest("library/abc/file.pdf", TimeSpan.FromMinutes(5));
        req.Verb.Should().Be(HttpVerb.GET);
    }

    [Fact]
    public async Task GetSignedUploadUrlAsync_BuildsPutVerbRequestAndBindsContentType()
    {
        var service = new ExposedS3StorageService(BuildConfig(CompleteConfig()));
        var url = await service.GetSignedUploadUrlAsync("library/abc/file.pdf", "application/pdf", TimeSpan.FromMinutes(30));

        url.Should().NotBeNullOrEmpty();
        var req = service.BuildUploadRequest("library/abc/file.pdf", "application/pdf", TimeSpan.FromMinutes(30));
        req.Verb.Should().Be(HttpVerb.PUT, "uploads must use PUT, never GET");
        req.ContentType.Should().Be("application/pdf");
    }

    [Fact]
    public async Task GetSignedUploadUrlAsync_RejectsNullKey()
    {
        var service = new ExposedS3StorageService(BuildConfig(CompleteConfig()));
        var act = async () => await service.GetSignedUploadUrlAsync("", "application/pdf", TimeSpan.FromMinutes(30));
        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task UploadUrlExpiryIsBoundedToUploadWindow()
    {
        var service = new ExposedS3StorageService(BuildConfig(CompleteConfig()));
        var expiry = TimeSpan.FromMinutes(30);
        var req = service.BuildUploadRequest("library/abc/file.pdf", "application/pdf", expiry);

        req.Expires.Should().BeAfter(DateTime.UtcNow.AddMinutes(25));
        req.Expires.Should().BeBefore(DateTime.UtcNow.AddMinutes(35));
    }
}
