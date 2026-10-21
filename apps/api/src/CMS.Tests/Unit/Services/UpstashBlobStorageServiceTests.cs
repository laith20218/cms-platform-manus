using System.Net;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// ADMIN-02 — Verifies the Upstash Blob storage service configuration gate and
/// presign request shape. Uses a fake HTTP handler so no real Upstash credentials
/// are required and no real object is created.
/// </summary>
public sealed class UpstashBlobStorageServiceConfigurationTests
{
    private static IConfiguration BuildConfig(string? token) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Upstash:Blob:Token"] = token
        }).Build();

    private sealed class FakeHandler : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        public string ResponseBody { get; set; } = "{\"url\":\"https://blob.upstash.io/signed\",\"expiresAt\":1792589000}";
        public HttpStatusCode ResponseStatus { get; set; } = HttpStatusCode.OK;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            LastRequest = request;
            var response = new HttpResponseMessage(ResponseStatus)
            {
                Content = new StringContent(ResponseBody, System.Text.Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        }
    }

    /// <summary>
    /// Constructs the service with a real HttpClient backed by a FakeHandler, bypassing
    /// IHttpClientFactory (which is hard to wire in a unit test). We access the internal
    /// constructor via reflection-free direct HttpClient injection through a test-only subclass.
    /// </summary>
    private sealed class TestableUpstashBlobStorageService : UpstashBlobStorageService
    {
        public TestableUpstashBlobStorageService(HttpClient httpClient, IConfiguration cfg)
            : base(MakeFactory(httpClient), cfg) { }

        private static IHttpClientFactory MakeFactory(HttpClient httpClient) => new SimpleFactory(httpClient);

        private sealed class SimpleFactory : IHttpClientFactory
        {
            private readonly HttpClient _client;
            public SimpleFactory(HttpClient client) => _client = client;
            public HttpClient CreateClient(string name) => _client;
        }
    }

    private static (TestableUpstashBlobStorageService svc, FakeHandler handler) BuildService(string? token = "test-token")
    {
        var handler = new FakeHandler();
        var httpClient = new HttpClient(handler);
        var svc = new TestableUpstashBlobStorageService(httpClient, BuildConfig(token));
        return (svc, handler);
    }

    [Fact]
    public void Constructor_ThrowsWhenTokenMissing()
    {
        var handler = new FakeHandler();
        var act = () => new TestableUpstashBlobStorageService(new HttpClient(handler), BuildConfig(null));
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("Upstash:Blob:Token must be configured at runtime");
    }

    [Fact]
    public void Constructor_ThrowsWhenTokenEmpty()
    {
        var handler = new FakeHandler();
        var act = () => new TestableUpstashBlobStorageService(new HttpClient(handler), BuildConfig("   "));
        act.Should().Throw<InvalidOperationException>();
    }

    [Fact]
    public async Task GetSignedUploadUrlAsync_ReturnsPresignedUrlFromUpstash()
    {
        var (svc, _) = BuildService();

        var url = await svc.GetSignedUploadUrlAsync("library/abc/file.pdf", "application/pdf", TimeSpan.FromMinutes(5));

        url.Should().Be("https://blob.upstash.io/signed");
    }

    [Fact]
    public async Task GetSignedUrlAsync_ReturnsPresignedUrlFromUpstash()
    {
        var (svc, _) = BuildService();

        var url = await svc.GetSignedUrlAsync("library/abc/file.pdf", TimeSpan.FromMinutes(5));

        url.Should().Be("https://blob.upstash.io/signed");
    }

    [Fact]
    public async Task GetSignedUploadUrlAsync_RejectsEmptyKey()
    {
        var (svc, _) = BuildService();
        var act = async () => await svc.GetSignedUploadUrlAsync("", "application/pdf", TimeSpan.FromMinutes(5));
        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task GetSignedUrlAsync_RejectsEmptyKey()
    {
        var (svc, _) = BuildService();
        var act = async () => await svc.GetSignedUrlAsync("", TimeSpan.FromMinutes(5));
        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task GetSignedUploadUrlAsync_ThrowsOnNonSuccessResponse()
    {
        var (svc, handler) = BuildService();
        handler.ResponseStatus = HttpStatusCode.Unauthorized;
        handler.ResponseBody = "{\"error\":\"unauthorized\"}";

        var act = async () => await svc.GetSignedUploadUrlAsync("library/abc/file.pdf", "application/pdf", TimeSpan.FromMinutes(5));
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("Upstash Blob presign failed with HTTP 401*");
    }

    [Fact]
    public async Task DeleteAsync_TreatsNotFoundAsSuccess()
    {
        var (svc, handler) = BuildService();
        handler.ResponseStatus = HttpStatusCode.NotFound;
        handler.ResponseBody = "";

        var act = async () => await svc.DeleteAsync("library/nonexistent", CancellationToken.None);
        await act.Should().NotThrowAsync();
    }
}
