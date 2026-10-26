using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;

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
        public string? LastRequestBody { get; private set; }
        public int RequestCount { get; private set; }
        public string ResponseBody { get; set; } = "{\"url\":\"https://blob.upstash.io/signed\",\"expiresAt\":1792589000}";
        public HttpStatusCode ResponseStatus { get; set; } = HttpStatusCode.OK;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            LastRequest = request;
            RequestCount++;
            // HttpClient disposes request content after the call completes — capture the
            // body string now, while it is still readable.
            if (request.Content is not null)
                LastRequestBody = await request.Content.ReadAsStringAsync(ct);
            var response = new HttpResponseMessage(ResponseStatus)
            {
                Content = new StringContent(ResponseBody, System.Text.Encoding.UTF8, "application/json")
            };
            return response;
        }
    }

    /// <summary>
    /// Stub S3 lease factory: presign-only tests never touch S3, so the default factory
    /// throws if it is ever called — proving presign paths do not leak into the S3 path.
    /// </summary>
    private sealed class StubS3Factory : IUpstashS3ClientFactory
    {
        private readonly Func<UpstashS3Lease> _lease;
        public StubS3Factory(Func<UpstashS3Lease> lease) => _lease = lease;
        public Task<UpstashS3Lease> CreateAsync(CancellationToken ct = default) => Task.FromResult(_lease());
    }

    private static IUpstashS3ClientFactory ThrowingFactory() =>
        new StubS3Factory(() => throw new InvalidOperationException(
            "The S3 client factory must not be called by presign-only operations"));

    /// <summary>
    /// Constructs the service with a real HttpClient backed by a FakeHandler, bypassing
    /// IHttpClientFactory (which is hard to wire in a unit test). We access the internal
    /// constructor via reflection-free direct HttpClient injection through a test-only subclass.
    /// </summary>
    private sealed class TestableUpstashBlobStorageService : UpstashBlobStorageService
    {
        public TestableUpstashBlobStorageService(HttpClient httpClient, IConfiguration cfg, IUpstashS3ClientFactory factory)
            : base(MakeFactory(httpClient), cfg, factory) { }

        private static IHttpClientFactory MakeFactory(HttpClient httpClient) => new SimpleFactory(httpClient);

        private sealed class SimpleFactory : IHttpClientFactory
        {
            private readonly HttpClient _client;
            public SimpleFactory(HttpClient client) => _client = client;
            public HttpClient CreateClient(string name) => _client;
        }
    }

    private static (TestableUpstashBlobStorageService svc, FakeHandler handler) BuildService(
        string? token = "test-token", IUpstashS3ClientFactory? factory = null)
    {
        var handler = new FakeHandler();
        var httpClient = new HttpClient(handler);
        var svc = new TestableUpstashBlobStorageService(httpClient, BuildConfig(token), factory ?? ThrowingFactory());
        return (svc, handler);
    }

    [Fact]
    public void Constructor_ThrowsWhenTokenMissing()
    {
        var handler = new FakeHandler();
        var act = () => new TestableUpstashBlobStorageService(new HttpClient(handler), BuildConfig(null), ThrowingFactory());
        act.Should().Throw<InvalidOperationException>()
            .WithMessage("Upstash:Blob:Token must be configured at runtime");
    }

    [Fact]
    public void Constructor_ThrowsWhenTokenEmpty()
    {
        var handler = new FakeHandler();
        var act = () => new TestableUpstashBlobStorageService(new HttpClient(handler), BuildConfig("   "), ThrowingFactory());
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

    // ===== A2-1: content-length binding =====

    [Fact]
    public async Task GetSignedUploadUrlAsync_IncludesContentLengthInSignedHeaders()
    {
        var (svc, handler) = BuildService();

        await svc.GetSignedUploadUrlAsync("library/abc/file.pdf", "application/pdf", TimeSpan.FromMinutes(5), 123_456);

        var body = handler.LastRequestBody ?? "";
        body.Should().Contain("\"content-length\":\"123456\"",
            "the declared size must be bound into the presign signature so storage rejects mismatched bodies");
        body.Should().Contain("\"content-type\":\"application/pdf\"");
    }

    [Fact]
    public async Task GetSignedUploadUrlAsync_OmitsContentLength_WhenNotProvided()
    {
        var (svc, handler) = BuildService();

        await svc.GetSignedUploadUrlAsync("library/abc/file.pdf", "application/pdf", TimeSpan.FromMinutes(5));

        var body = handler.LastRequestBody ?? "";
        body.Should().NotContain("content-length",
            "no content-length must be signed when the caller did not declare a size (read URLs, legacy callers)");
        body.Should().Contain("\"content-type\":\"application/pdf\"");
    }

    // ===== Fix-1: headers must ALWAYS be a JSON object (Upstash rejects "headers":null with 400) =====

    [Fact]
    public async Task GetSignedUploadUrlAsync_SendsHeadersAsJsonObject_NeverNull()
    {
        var (svc, handler) = BuildService();

        await svc.GetSignedUploadUrlAsync("library/abc/file.pdf", "application/pdf", TimeSpan.FromMinutes(5), 1_000);

        var body = handler.LastRequestBody ?? "";
        body.Should().Contain("\"headers\":{",
            "presign must always receive a headers OBJECT — Upstash answers null with 400 {\"error\":\"headers must be an object\"}");
        body.Should().NotContain("\"headers\":null",
            "a null headers value is rejected by Upstash presign (verified live: HTTP 400)");
        body.Should().Contain("\"content-type\":\"application/pdf\"");
        body.Should().Contain("\"content-length\":\"1000\"");
    }

    [Fact]
    public async Task GetSignedUploadUrlAsync_WithoutContentType_SendsEmptyHeadersObject()
    {
        var (svc, handler) = BuildService();

        // contentType is nullable in the presign contract — nothing to sign, but the
        // field itself must still serialize as {} rather than null.
        await svc.GetSignedUploadUrlAsync("library/abc/file.bin", null!, TimeSpan.FromMinutes(5));

        var body = handler.LastRequestBody ?? "";
        body.Should().Contain("\"headers\":{}",
            "a header-less presign PUT must serialize headers as an empty object");
        body.Should().NotContain("\"headers\":null");
    }

    [Fact]
    public async Task GetSignedUrlAsync_SendsEmptyHeadersObject_NotNull()
    {
        var (svc, handler) = BuildService();

        await svc.GetSignedUrlAsync("library/abc/file.pdf", TimeSpan.FromMinutes(5));

        var body = handler.LastRequestBody ?? "";
        body.Should().Contain("\"headers\":{}",
            "presigned GET has no headers to sign — the field must still be an object, not null");
        body.Should().NotContain("\"headers\":null");
    }

    [Fact]
    public async Task DownloadAsync_SendsEmptyHeadersObject_NotNull()
    {
        var (svc, handler) = BuildService();

        // The FakeHandler also serves the follow-up GET of the presigned URL; the
        // captured request body stays from the presign POST (GETs carry no content).
        await svc.DownloadAsync("library/abc/file.pdf");

        var body = handler.LastRequestBody ?? "";
        body.Should().Contain("\"headers\":{}");
        body.Should().NotContain("\"headers\":null");
    }

    // ===== Fix-2: deletion goes through the S3-compatible API, never presign =====

    private static (Mock<IAmazonS3> s3, IUpstashS3ClientFactory factory) BuildS3Factory(
        Action<Mock<IAmazonS3>>? setup = null)
    {
        var s3 = new Mock<IAmazonS3>();
        setup?.Invoke(s3);
        var factory = new StubS3Factory(() =>
            new UpstashS3Lease(s3.Object, "test-bucket", "https://account.r2.cloudflarestorage.com", DateTimeOffset.UtcNow.AddHours(4)));
        return (s3, factory);
    }

    [Fact]
    public async Task DeleteAsync_CallsS3DeleteObject_WithBucketAndKey()
    {
        var (s3, factory) = BuildS3Factory();
        DeleteObjectRequest? captured = null;
        s3.Setup(c => c.DeleteObjectAsync(It.IsAny<DeleteObjectRequest>(), It.IsAny<CancellationToken>()))
            .Callback<DeleteObjectRequest, CancellationToken>((r, _) => captured = r)
            .ReturnsAsync(new DeleteObjectResponse());
        var (svc, _) = BuildService(factory: factory);

        await svc.DeleteAsync("library/abc/file.pdf");

        s3.Verify(
            c => c.DeleteObjectAsync(It.IsAny<DeleteObjectRequest>(), It.IsAny<CancellationToken>()),
            Times.Once);
        captured.Should().NotBeNull();
        captured!.BucketName.Should().Be("test-bucket",
            "the bucket from the credential lease must be used, not a configured value");
        captured.Key.Should().Be("library/abc/file.pdf");
    }

    [Fact]
    public async Task DeleteAsync_MissingKey_DoesNotThrow()
    {
        // S3 DELETE is idempotent (missing keys return 204), but a defensive 404 from
        // the store must still be swallowed to preserve the idempotent contract.
        var (s3, factory) = BuildS3Factory(s3 => s3
            .Setup(c => c.DeleteObjectAsync(It.IsAny<DeleteObjectRequest>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new AmazonS3Exception("NoSuchKey") { StatusCode = HttpStatusCode.NotFound }));
        var (svc, _) = BuildService(factory: factory);

        var act = async () => await svc.DeleteAsync("library/gone/already-deleted.pdf");
        await act.Should().NotThrowAsync("deleting an already-deleted object is success, not an error");
    }

    [Fact]
    public async Task DeleteAsync_EmptyKey_SucceedsWithoutTouchingS3()
    {
        // The throwing factory proves the S3 path is never entered for an empty key.
        var (svc, _) = BuildService();

        var act = async () => await svc.DeleteAsync("");
        await act.Should().NotThrowAsync("an empty key is a no-op under the idempotent delete contract");
    }
}

/// <summary>
/// Fix-2 — verifies the S3 credential-exchange factory: payload parsing, lease caching,
/// expiry-driven refresh and fail-closed validation of incomplete payloads.
/// </summary>
public sealed class UpstashS3ClientFactoryTests
{
    private sealed class FakeHandler : HttpMessageHandler
    {
        public int RequestCount { get; private set; }
        public string ResponseBody { get; set; } = "{}";
        public HttpStatusCode ResponseStatus { get; set; } = HttpStatusCode.OK;

        /// <summary>Scripted per-request responses (Push 6 retry tests). When set, takes precedence over the fixed status/body.</summary>
        public Queue<(HttpStatusCode status, string body)> ScriptedResponses { get; } = new();

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            RequestCount++;
            var (status, body) = ScriptedResponses.Count > 0
                ? ScriptedResponses.Dequeue()
                : (ResponseStatus, ResponseBody);
            return Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json")
            });
        }
    }

    private sealed class SimpleFactory : IHttpClientFactory
    {
        private readonly HttpClient _client;
        public SimpleFactory(HttpClient client) => _client = client;
        public HttpClient CreateClient(string name) => _client;
    }

    private static (UpstashS3ClientFactory factory, FakeHandler handler) BuildFactory(
        string? response = null, string? endpointOverride = null)
    {
        var handler = new FakeHandler();
        if (response is not null)
            handler.ResponseBody = response;
        var httpClient = new HttpClient(handler);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Upstash:Blob:Token"] = "test-token",
            ["Upstash:Blob:S3Endpoint"] = endpointOverride
        }).Build();
        return (new UpstashS3ClientFactory(new SimpleFactory(httpClient), configuration,
            Microsoft.Extensions.Logging.Abstractions.NullLogger<UpstashS3ClientFactory>.Instance), handler);
    }

    private static string CredentialsJson(long expiresAtUnix) =>
        "{\"accessKeyId\":\"AKID-TEST\",\"secretAccessKey\":\"secret-test\",\"sessionToken\":\"session-test\"," +
        $"\"endpoint\":\"https://account.r2.cloudflarestorage.com\",\"bucket\":\"test-bucket-1\",\"region\":\"auto\"," +
        $"\"expiresAt\":{expiresAtUnix},\"visibility\":\"private\",\"permission\":\"object-read-write\"}}";

    /// <summary>Hotfix 10.8c reproduction: the agent hands back a non-R2 proxy URL in `endpoint` (the observed production payload shape).</summary>
    private static string NonR2EndpointCredentialsJson(long expiresAtUnix) =>
        "{\"accessKeyId\":\"AKID-TEST\",\"secretAccessKey\":\"secret-test\",\"sessionToken\":\"session-test\"," +
        $"\"endpoint\":\"https://smashing-kiwi-127167.upstash.io/\",\"bucket\":\"test-bucket-1\",\"region\":\"auto\"," +
        $"\"expiresAt\":{expiresAtUnix}}}";

    [Fact]
    public async Task CreateAsync_ParsesCredentialPayload_AndBuildsLease()
    {
        var (factory, _) = BuildFactory(CredentialsJson(4_102_444_800)); // 2100-01-01

        var lease = await factory.CreateAsync();

        lease.Bucket.Should().Be("test-bucket-1");
        lease.ExpiresAt.Should().Be(DateTimeOffset.FromUnixTimeSeconds(4_102_444_800));
        lease.Client.Should().NotBeNull();
    }

    [Fact]
    public async Task CreateAsync_CachesLease_UntilNearExpiry()
    {
        var (factory, handler) = BuildFactory(CredentialsJson(4_102_444_800));

        var first = await factory.CreateAsync();
        var second = await factory.CreateAsync();

        handler.RequestCount.Should().Be(1,
            "a far-from-expiry lease must be reused without another credential exchange");
        second.Should().BeSameAs(first);
    }

    [Fact]
    public async Task CreateAsync_RefreshesLease_WhenWithinSafetyMargin()
    {
        // Expiry 2 minutes out — inside the 5-minute refresh margin.
        var (factory, handler) = BuildFactory(
            CredentialsJson(DateTimeOffset.UtcNow.AddMinutes(2).ToUnixTimeSeconds()));

        await factory.CreateAsync();
        await factory.CreateAsync();

        handler.RequestCount.Should().Be(2,
            "a lease within the safety margin must trigger a fresh credential exchange");
    }

    [Fact]
    public async Task CreateAsync_ThrowsOnIncompletePayload()
    {
        // Missing bucket — the exchange returned an incomplete payload.
        var (factory, _) = BuildFactory(
            "{\"accessKeyId\":\"AKID-TEST\",\"secretAccessKey\":\"secret-test\",\"sessionToken\":\"session-test\"," +
            "\"endpoint\":\"https://account.r2.cloudflarestorage.com\"}");

        var act = async () => await factory.CreateAsync();
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*incomplete payload*");
    }

    [Fact]
    public async Task CreateAsync_ThrowsOnNonSuccessResponse()
    {
        var (factory, handler) = BuildFactory();
        handler.ResponseStatus = HttpStatusCode.Unauthorized;
        handler.ResponseBody = "{\"error\":\"unauthorized\"}";

        var act = async () => await factory.CreateAsync();
        await act.Should().ThrowAsync<UpstashS3ClientFactory.UpstashExchangeException>()
            .WithMessage("Upstash Blob S3 credential exchange failed with HTTP 401*")
            .Where(ex => ex.StatusCode == HttpStatusCode.Unauthorized);
        handler.RequestCount.Should().Be(1, "401 is an authentication failure — a retry cannot fix it");
    }

    // ===== Push 6: single retry on transient exchange failures =====

    [Fact]
    public async Task CreateAsync_RetriesOnce_WhenExchangeAnswers503_AndSucceeds()
    {
        var (factory, handler) = BuildFactory();
        handler.ScriptedResponses.Enqueue((HttpStatusCode.ServiceUnavailable, "{\"error\":\"upstream busy\"}"));
        handler.ScriptedResponses.Enqueue((HttpStatusCode.OK, CredentialsJson(4_102_444_800)));

        var lease = await factory.CreateAsync();

        lease.Bucket.Should().Be("test-bucket-1");
        handler.RequestCount.Should().Be(2, "a transient 503 must be retried exactly once");
    }

    [Fact]
    public async Task CreateAsync_RetriesOnce_WhenExchangeAnswers429_AndSucceeds()
    {
        var (factory, handler) = BuildFactory();
        handler.ScriptedResponses.Enqueue((HttpStatusCode.TooManyRequests, "{\"error\":\"rate limited\"}"));
        handler.ScriptedResponses.Enqueue((HttpStatusCode.OK, CredentialsJson(4_102_444_800)));

        var lease = await factory.CreateAsync();

        lease.Bucket.Should().Be("test-bucket-1");
        handler.RequestCount.Should().Be(2, "a transient 429 must be retried exactly once");
    }

    [Fact]
    public async Task CreateAsync_ThrowsAfterSingleRetry_WhenExchangeKeepsFailingWith503()
    {
        var (factory, handler) = BuildFactory();
        handler.ScriptedResponses.Enqueue((HttpStatusCode.BadGateway, "{\"error\":\"bad gateway\"}"));
        handler.ScriptedResponses.Enqueue((HttpStatusCode.ServiceUnavailable, "{\"error\":\"still busy\"}"));

        var act = async () => await factory.CreateAsync();
        await act.Should().ThrowAsync<UpstashS3ClientFactory.UpstashExchangeException>();
        handler.RequestCount.Should().Be(2, "the retry budget is exactly one — no endless retries");
    }

    // ===== Hotfix 10.8c (1.A): R2-preference endpoint selection on the minted S3 client =====

    [Fact]
    public async Task CreateAsync_WhenEndpointFieldIsNonR2_ButAlternateFieldCarriesR2_PrefersR2()
    {
        // The production incident shape: `endpoint` carries the upstash.io proxy URL while
        // another field still names the true R2 endpoint — the R2 one must win.
        var json = "{\"accessKeyId\":\"AKID-TEST\",\"secretAccessKey\":\"secret-test\",\"sessionToken\":\"session-test\"," +
            "\"endpoint\":\"https://smashing-kiwi-127167.upstash.io\",\"s3Endpoint\":\"https://acc123.r2.cloudflarestorage.com\"," +
            "\"bucket\":\"test-bucket-1\",\"region\":\"auto\",\"expiresAt\":4102444800}";
        var (factory, _) = BuildFactory(json);

        var lease = await factory.CreateAsync();

        lease.ServiceURL.Should().Be("https://acc123.r2.cloudflarestorage.com",
            "an R2 endpoint found in any response field must beat a non-R2 proxy URL in the legacy field");
    }

    [Fact]
    public async Task CreateAsync_WhenOnlyNonR2EndpointExists_UsesItAsLastResort_AndTrimsTrailingSlash()
    {
        // No R2 candidate anywhere: the legacy endpoint is still used (last resort, loudly
        // warned in logs) so behavior degrades to the current production state instead of
        // hard-failing at mint time — the API boundary then answers the clean 503.
        var (factory, _) = BuildFactory(NonR2EndpointCredentialsJson(4_102_444_800));

        var lease = await factory.CreateAsync();

        lease.ServiceURL.Should().Be("https://smashing-kiwi-127167.upstash.io",
            "the non-R2 endpoint is used as a last resort, normalized (trailing slash stripped)");
        lease.Bucket.Should().Be("test-bucket-1");
    }

    [Fact]
    public async Task CreateAsync_ConfiguredOverride_WinsOverEverything()
    {
        // Ops escape hatch: Upstash:Blob:S3Endpoint forces the correct R2 URL regardless of
        // what the agent's response carries.
        var (factory, _) = BuildFactory(NonR2EndpointCredentialsJson(4_102_444_800),
            endpointOverride: "https://forced-account.r2.cloudflarestorage.com/");

        var lease = await factory.CreateAsync();

        lease.ServiceURL.Should().Be("https://forced-account.r2.cloudflarestorage.com",
            "the explicit override must win and be normalized");
    }

    [Fact]
    public void CreateAsync_RejectsNonHttpsOverride_AtConstruction()
    {
        var act = () => BuildFactory(NonR2EndpointCredentialsJson(4_102_444_800),
            endpointOverride: "http://insecure.r2.cloudflarestorage.com");

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*absolute https URL*");
    }

    [Fact]
    public async Task CreateAsync_R2EndpointCarriesExactServiceURL_OnLease()
    {
        // The deliverable proof: the lease exposes the exact ServiceURL the client addresses,
        // host-only, no credentials — the same value the mint log emits.
        var (factory, _) = BuildFactory(CredentialsJson(4_102_444_800));

        var lease = await factory.CreateAsync();

        lease.ServiceURL.Should().Be("https://account.r2.cloudflarestorage.com");
        lease.ServiceURL.Should().NotContainAny("AKID-TEST", "secret-test", "session-test", "test-token",
            "the ServiceURL must never carry credentials or the blob token");
    }

    /// <summary>Minimal recording logger — captures formatted log lines for assertions.</summary>
    private sealed class RecordingLogger : ILogger<UpstashS3ClientFactory>
    {
        public List<(LogLevel Level, string Line)> Entries { get; } = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }
    }

    private static (UpstashS3ClientFactory factory, FakeHandler handler) BuildFactoryWithLogger(
        string response, ILogger<UpstashS3ClientFactory> logger)
    {
        var handler = new FakeHandler { ResponseBody = response };
        var httpClient = new HttpClient(handler);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Upstash:Blob:Token"] = "test-token"
        }).Build();
        return (new UpstashS3ClientFactory(new SimpleFactory(httpClient), configuration, logger), handler);
    }

    [Fact]
    public async Task CreateAsync_MintLog_NamesExactServiceURL_AndWarnsOnNonR2()
    {
        // The production incident payload: a non-R2 proxy endpoint. The mint log must
        // name the EXACT ServiceURL in use (1.A deliverable) and warn that it is not R2.
        var logger = new RecordingLogger();
        var (factory, _) = BuildFactoryWithLogger(NonR2EndpointCredentialsJson(4_102_444_800), logger);

        await factory.CreateAsync();

        var mint = logger.Entries.Should().ContainSingle(entry =>
                entry.Level == LogLevel.Information && entry.Line.StartsWith("Upstash S3 lease minted:"))
            .Subject;
        mint.Line.Should().Contain("ServiceURL=https://smashing-kiwi-127167.upstash.io",
            "the log names the exact ServiceURL the client now addresses");
        mint.Line.Should().Contain("Bucket=test-bucket-1");
        mint.Line.Should().Contain("Region=auto");
        mint.Line.Should().Contain("EndpointSource=response.endpoint(non-R2)");

        var warning = logger.Entries.Should().ContainSingle(entry =>
                entry.Level == LogLevel.Warning && entry.Line.Contains("NON-R2 endpoint"))
            .Subject;
        warning.Line.Should().Contain("https://smashing-kiwi-127167.upstash.io");

        string.Join("\n", logger.Entries.Select(entry => entry.Line)).Should().NotContainAny(
            "AKID-TEST", "secret-test", "session-test", "test-token",
            "no credential material may ever appear in log output");
    }

    [Fact]
    public async Task CreateAsync_MintLog_NoWarning_WhenEndpointIsR2()
    {
        // The healthy path: a clean R2 endpoint → one Information line, no warning.
        var logger = new RecordingLogger();
        var (factory, _) = BuildFactoryWithLogger(CredentialsJson(4_102_444_800), logger);

        await factory.CreateAsync();

        var mint = logger.Entries.Should().ContainSingle(entry =>
                entry.Level == LogLevel.Information && entry.Line.StartsWith("Upstash S3 lease minted:"))
            .Subject;
        mint.Line.Should().Contain("ServiceURL=https://account.r2.cloudflarestorage.com");
        mint.Line.Should().Contain("EndpointSource=response.endpoint");
        logger.Entries.Should().NotContain(entry => entry.Level == LogLevel.Warning,
            "an R2 endpoint is the healthy path — no warning noise");
    }
}
