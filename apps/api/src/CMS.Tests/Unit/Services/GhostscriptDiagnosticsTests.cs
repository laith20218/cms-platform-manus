using System.Linq;
using CMS.Application.BackgroundJobs;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// R22.2 — GhostscriptDiagnostics parsing suite. Pins the exact Arabic report
/// lines the admin support collapsible renders, across the real-world GS output
/// shapes: substitution warnings (for/with/bracketed), explicit "could not find
/// font" lines, unopenable font files, and the pdfwrite "could not be embedded"
/// block. Clean output must yield null so the worker stores no diagnostics.
/// </summary>
public sealed class GhostscriptDiagnosticsTests
{
    [Fact]
    public void Substitution_For_ProducesExactTaskBookLine()
    {
        var report = GhostscriptDiagnostics.BuildReport("Substituting font Amiri for SakkalMajalla.");

        report.Should().Be("الخط الأصلي (SakkalMajalla) غير مدمج، وتم استبداله بـ (Amiri).");
    }

    [Fact]
    public void Substitution_With_Preposition_IsAlsoParsed()
    {
        // The task book's phrasing — some GS builds/locales phrase it with "with".
        var report = GhostscriptDiagnostics.BuildReport("Substituting font Amiri with SakkalMajalla");

        report.Should().Be("الخط الأصلي (SakkalMajalla) غير مدمج، وتم استبداله بـ (Amiri).");
    }

    [Fact]
    public void Substitution_BracketedNames_AreStripped()
    {
        var report = GhostscriptDiagnostics.BuildReport("Substituting font [Amiri] for [SakkalMajalla].");

        report.Should().Be("الخط الأصلي (SakkalMajalla) غير مدمج، وتم استبداله بـ (Amiri).");
    }

    [Fact]
    public void CouldNotFindFont_IsReported()
    {
        var report = GhostscriptDiagnostics.BuildReport("Could not find font TraditionalArabic.");

        report.Should().Be("الخط الأصلي (TraditionalArabic) غير مدمج في الملف.");
    }

    [Fact]
    public void UnopenableFontFile_ReportsTheFamilyStem()
    {
        var report = GhostscriptDiagnostics.BuildReport(
            "Can't find (or can't open) font file \"/usr/share/fonts/SakkalMajalla.ttf\".");

        report.Should().Be("الخط الأصلي (SakkalMajalla) غير مدمج في الملف.");
    }

    [Fact]
    public void NotEmbeddedBlock_ListsEveryFontOnItsOwnLine()
    {
        var output = string.Join('\n',
            "Processing pages 1 to 4.",
            "The following fonts could not be embedded in the PDF:",
            "    TimesNewRomanPSMT,",
            "    ArialMT.",
            "",
            "Page 4.");

        var report = GhostscriptDiagnostics.BuildReport(output);

        report.Should().Be(string.Join('\n',
            "الخط الأصلي (TimesNewRomanPSMT) غير مدمج في الملف.",
            "الخط الأصلي (ArialMT) غير مدمج في الملف."));
    }

    [Fact]
    public void MixedOutput_IsDedupedAndStable()
    {
        var output = string.Join('\n',
            "Substituting font Amiri for SakkalMajalla.",
            "Could not find font SakkalMajalla.",
            "Substituting font Amiri for SakkalMajalla.");

        var report = GhostscriptDiagnostics.BuildReport(output);

        report.Should().Be(string.Join('\n',
            "الخط الأصلي (SakkalMajalla) غير مدمج، وتم استبداله بـ (Amiri).",
            "الخط الأصلي (SakkalMajalla) غير مدمج في الملف."));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Processing pages 1 to 3.\nPage 3.")]
    public void CleanOutput_YieldsNull(string? output)
    {
        GhostscriptDiagnostics.BuildReport(output).Should().BeNull(
            "warning-free runs must store no diagnostics (identical to Wave 11.9 rows)");
    }

    [Fact]
    public void Report_IsCappedAt20Lines()
    {
        var output = string.Join('\n', Enumerable.Range(1, 40).Select(i => $"Could not find font Font{i}."));

        var report = GhostscriptDiagnostics.BuildReport(output);

        report!.Split('\n').Should().HaveCount(20);
    }
}
