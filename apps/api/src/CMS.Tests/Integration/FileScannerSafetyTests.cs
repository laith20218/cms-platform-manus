using CMS.Infrastructure.Services;
using FluentAssertions;

namespace CMS.Tests.Integration;

public sealed class FileScannerSafetyTests
{
    [Fact]
    public async Task DefaultScanner_IsFailClosedWhenNoProviderIsConfigured()
    {
        var result = await new FailClosedFileScanner().ScanAsync("library/test.pdf", "application/pdf");

        result.IsClean.Should().BeFalse();
        result.IsInfected.Should().BeFalse();
        result.Verdict.Should().Be("not_configured");
    }
}
