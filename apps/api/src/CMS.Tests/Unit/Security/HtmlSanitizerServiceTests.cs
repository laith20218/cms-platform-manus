using System.Text;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Security;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace CMS.Tests.Unit.Security;

/// <summary>
/// A2-5 — HtmlSanitizerService (Ganss.XSS) in-place HTML sanitization:
/// dangerous markup is stripped and the object is overwritten at the same key,
/// clean documents are left untouched, and every failure mode is fail-closed.
/// Uses a hand-rolled in-memory IFileStorageService fake — no network involved.
/// </summary>
public sealed class HtmlSanitizerServiceTests
{
    /// <summary>In-memory object store: key → bytes. Records every PutAsync call.</summary>
    private sealed class FakeStorage : IFileStorageService
    {
        public Dictionary<string, byte[]> Objects { get; } = new();
        public List<(string Key, string ContentType)> Puts { get; } = new();
        public Func<string, Stream>? DownloadOverride { get; set; }

        public Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry, long? contentLength = null, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<string> GetSignedUrlAsync(string key, TimeSpan expiry, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task DeleteAsync(string key, CancellationToken ct = default)
        {
            Objects.Remove(key);
            return Task.CompletedTask;
        }

        public Task<bool> ExistsAsync(string key, CancellationToken ct = default)
            => Task.FromResult(Objects.ContainsKey(key));

        public Task<Stream> DownloadAsync(string key, CancellationToken ct = default)
        {
            if (DownloadOverride is not null)
                return Task.FromResult(DownloadOverride(key));
            if (!Objects.TryGetValue(key, out var bytes))
                throw new InvalidOperationException($"object not found: {key}");
            return Task.FromResult<Stream>(new MemoryStream(bytes, writable: false));
        }

        public Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default)
        {
            using var buffer = new MemoryStream();
            content.CopyTo(buffer);
            Objects[key] = buffer.ToArray();
            Puts.Add((key, contentType));
            return Task.CompletedTask;
        }

        // Push 4 / Track 4: multipart members are not exercised by these tests.
        public Task<string> InitiateMultipartUploadAsync(string key, string contentType, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<string> PresignUploadPartAsync(string key, string uploadId, int partNumber, TimeSpan expiry, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<List<CMS.Application.Interfaces.UploadedPartInfo>> ListMultipartPartsAsync(string key, string uploadId, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task CompleteMultipartUploadAsync(string key, string uploadId, IReadOnlyList<CMS.Application.Interfaces.CompletedPart> parts, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task AbortMultipartUploadAsync(string key, string uploadId, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");

        public Task<long> GetObjectSizeAsync(string key, CancellationToken ct = default)
            => Task.FromResult(Objects.TryGetValue(key, out var bytes) ? (long)bytes.Length : 0L);

        public Task<string> GetSignedUrlViaCredentialsAsync(string key, TimeSpan desiredExpiry, CancellationToken ct = default)
            => throw new NotSupportedException("not used by these tests");
    }

    private static HtmlSanitizerService Build(FakeStorage storage) =>
        new(storage, NullLogger<HtmlSanitizerService>.Instance);

    private static void Store(FakeStorage storage, string key, string html) =>
        storage.Objects[key] = Encoding.UTF8.GetBytes(html);

    private static string ReadBack(FakeStorage storage, string key) =>
        Encoding.UTF8.GetString(storage.Objects[key]);

    [Fact]
    public async Task SanitizeAsync_StripsScriptAndEventHandlers_ThenOverwritesInPlace()
    {
        var storage = new FakeStorage();
        const string key = "library/html/dirty";
        Store(storage, key,
            "<div onclick=\"evil()\"><p>ملاحظات المحاضرة</p><script>alert('xss')</script>"
            + "<a href=\"javascript:evil()\">رابط</a><a href=\"https://example.com\">رابط آمن</a></div>");
        var svc = Build(storage);

        await svc.SanitizeAsync(key, ReadSize(storage, key));

        var sanitized = ReadBack(storage, key);
        sanitized.Should().NotContain("script", "script tags must be stripped");
        sanitized.Should().NotContain("onclick", "inline event handlers must be stripped");
        sanitized.Should().NotContain("javascript:", "javascript: URLs must be neutralized");
        sanitized.Should().Contain("ملاحظات المحاضرة", "ordinary Arabic content must be preserved");
        sanitized.Should().Contain("https://example.com", "safe links must survive");
        storage.Puts.Should().ContainSingle(put => put.Key == key && put.ContentType == "text/html",
            "the sanitized document must overwrite the original object at the same key");
    }

    [Fact]
    public async Task SanitizeAsync_CleanDocument_NoRewrite()
    {
        var storage = new FakeStorage();
        const string key = "library/html/clean";
        const string clean = "<p>تلخيص نظيف <b>بلا مخاطر</b></p>";
        Store(storage, key, clean);
        var svc = Build(storage);

        await svc.SanitizeAsync(key, ReadSize(storage, key));

        ReadBack(storage, key).Should().Be(clean);
        storage.Puts.Should().BeEmpty("an already-clean document must not be rewritten");
    }

    [Fact]
    public async Task SanitizeAsync_BodyLargerThanDeclaredCeiling_ThrowsWithoutRewrite()
    {
        var storage = new FakeStorage();
        const string key = "library/html/liar";
        Store(storage, key, new string('a', 5000));
        var svc = Build(storage);

        var act = () => svc.SanitizeAsync(key, declaredSizeBytes: 100);

        await act.Should().ThrowAsync<InvalidOperationException>(
            "a storage body larger than the declared ceiling must never be buffered");
        storage.Puts.Should().BeEmpty();
    }

    [Fact]
    public async Task SanitizeAsync_DownloadFailure_Propagates()
    {
        var storage = new FakeStorage
        {
            DownloadOverride = _ => throw new HttpRequestException("storage outage")
        };
        var svc = Build(storage);

        var act = () => svc.SanitizeAsync("library/html/gone", 1024);

        await act.Should().ThrowAsync<HttpRequestException>(
            "a storage outage must propagate so the caller rejects the upload");
    }

    [Fact]
    public async Task SanitizeAsync_ZeroDeclaredSize_IsNoOp()
    {
        var storage = new FakeStorage();
        var svc = Build(storage);

        var act = () => svc.SanitizeAsync("library/html/empty", 0);

        await act.Should().NotThrowAsync("a zero-sized declaration has nothing to sanitize");
        storage.Puts.Should().BeEmpty();
    }

    private static long ReadSize(FakeStorage storage, string key) => storage.Objects[key].Length;
}
