using CMS.Infrastructure.Services;
using FluentAssertions;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// ADMIN-02 — Verifies the trust-based scanner approves any uploaded object so the
/// library publication pipeline can proceed (CompleteUpload → Clean → Publish).
/// This scanner performs NO malware detection by design — see the XML doc on
/// TrustedFileScanner for the security implications and when to replace it.
/// </summary>
public sealed class TrustedFileScannerTests
{
    [Fact]
    public async Task ScanAsync_ReturnsCleanForAnyObjectKey()
    {
        var scanner = new TrustedFileScanner();

        var result = await scanner.ScanAsync("library/any-file.pdf", "application/pdf", CancellationToken.None);

        result.IsClean.Should().BeTrue("a trusted scanner must approve any uploaded object");
        result.IsInfected.Should().BeFalse();
        result.Verdict.Should().Be("trusted");
    }

    [Fact]
    public async Task ScanAsync_ReturnsCleanForAnyContentType()
    {
        var scanner = new TrustedFileScanner();

        var pdf = await scanner.ScanAsync("library/a.pdf", "application/pdf", CancellationToken.None);
        var html = await scanner.ScanAsync("library/a.html", "text/html", CancellationToken.None);
        var image = await scanner.ScanAsync("library/a.png", "image/png", CancellationToken.None);
        var video = await scanner.ScanAsync("library/a.mp4", "video/mp4", CancellationToken.None);

        new[] { pdf, html, image, video }.Should().AllSatisfy(r => r.IsClean.Should().BeTrue());
    }

    [Fact]
    public async Task ScanAsync_NeverReturnsInfectedOrNotConfigured()
    {
        var scanner = new TrustedFileScanner();

        var result = await scanner.ScanAsync("library/any", null, CancellationToken.None);

        result.IsInfected.Should().BeFalse("the trusted scanner never claims infection");
        result.Verdict.Should().NotBe("not_configured", "the trusted scanner is explicitly configured, not fail-closed");
        result.Verdict.Should().NotBe("infected");
    }
}
