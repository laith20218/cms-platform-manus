using CMS.Api.Middleware;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Unit.Middleware;

/// <summary>
/// W-codeql: contract tests for the central log-input sanitizer — the
/// cs/log-forging remediation. Locks the behavioral promise: no control
/// character survives into a logged value, long inputs are capped, and
/// ordinary text passes through unchanged.
/// </summary>
public class LogSanitizerTests
{
    [Theory]
    [InlineData("normal path /api/v1/health", "normal path /api/v1/health")]
    [InlineData("line1\r\nline2", "line1  line2")]
    [InlineData("line1\nline2", "line1 line2")]
    [InlineData("tab\tsep", "tab sep")]
    [InlineData("nul\0byte", "nul byte")]
    [InlineData("", "")]
    public void Clean_StripsControlCharacters(string input, string expected)
    {
        LogSanitizer.Clean(input).Should().Be(expected);
    }

    [Fact]
    public void Clean_CapsLength()
    {
        var longPath = new string('a', 600);
        var result = LogSanitizer.Clean(longPath, 256);
        result.Length.Should().Be(256);
    }

    [Fact]
    public void Clean_NullAndWhitespaceOnlyInput_RendersEmptyOrSpaces()
    {
        LogSanitizer.Clean(null).Should().BeEmpty();
        LogSanitizer.Clean("\r\n\r\n").Should().Be("    ");
    }

    [Fact]
    public void Clean_ArabicTextPassesThrough()
    {
        LogSanitizer.Clean("مرحباً بالعالم").Should().Be("مرحباً بالعالم");
    }
}
