using System.Text.RegularExpressions;

namespace CMS.Application.BackgroundJobs;

// ====================================================================
// R22.2 — Ghostscript font diagnostics parser.
//
// Production testing (Wave 11.9 rollout) showed some Word-generated PDFs
// carry pre-shaped/broken text streams that pdfwrite cannot fully repair.
// Ghostscript still TELLS us what it had to do — substitution / missing /
// non-embeddable font warnings on stdout+stderr — and that evidence is the
// diagnostic surface support needs when an admin reports "الخط لا يزال
// غير مثالي". The player itself stays on R19 path rendering universally
// (R22.1), so this report is purely informational.
//
// BuildReport turns the raw console output into a clean, deduped,
// human-readable Arabic list (exact task-book phrasing):
//
//   الخط الأصلي (X) غير مدمج، وتم استبداله بـ (Y).
//
// The caller persists it into the EXISTING LibraryFile.ProcessingError
// column on success (no schema change) and the DTOs expose it as
// diagnosticReport. Null = no warnings detected (and the worker then
// stores null — the row looks exactly like a clean 11.9 success).
// ====================================================================

/// <summary>R22.2 — raw Ghostscript output → Arabic font diagnostics report (or null).</summary>
public static partial class GhostscriptDiagnostics
{
    private const int MaxReportLines = 20;

    /// <summary>Real GS shapes: "Substituting font Amiri for SakkalMajalla." —
    /// the word AFTER for/with is the ORIGINAL requested font, the word after
    /// "font" is the substitute GS actually used. Some GS versions bracket the
    /// names: "Substituting font [Amiri] for [SakkalMajalla]."</summary>
    [GeneratedRegex(@"Substituting\s+font\s+(?<sub>[^\s.,;:]+)\s+(?:for|with)\s+(?<orig>[^\s.,;:]+)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SubstitutionRegex();

    /// <summary>"Could not find font SakkalMajalla." / "Cannot find font X:" —
    /// the task-book example wording.</summary>
    [GeneratedRegex(@"(?:Could\s+not\s+find|Cannot\s+find|Can't\s+find)\s+(?:the\s+)?font\s*[:\s]+\s*[""']?(?<name>[^\s.,;:""']+)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MissingFontRegex();

    /// <summary>"Can't find (or can't open) font file ""/usr/share/fonts/X.ttf""." —
    /// the family is guessed from the file stem.</summary>
    [GeneratedRegex(@"Can't\s+find\s+\(or\s+can't\s+open\)\s+font\s+file\s+[""']?(?<path>[^""'\r\n]+)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex FontFileRegex();

    /// <summary>pdfwrite's end-of-run block: "The following fonts could not be
    /// embedded in the PDF:" followed by one font name per line.</summary>
    private const string NotEmbeddedHeader = "could not be embedded";

    /// <summary>
    /// Parses the combined Ghostscript console output into the Arabic report.
    /// Returns null when the output is empty or carries no font warnings —
    /// callers persist null so clean runs stay byte-identical to Wave 11.9.
    /// </summary>
    public static string? BuildReport(string? gsOutput)
    {
        if (string.IsNullOrWhiteSpace(gsOutput)) return null;

        var lines = new List<string>();

        // 1) Substitutions — the actionable signal (the player's path rendering
        //    will draw the substitute's outlines).
        foreach (Match match in SubstitutionRegex().Matches(gsOutput))
        {
            var substitute = CleanName(match.Groups["sub"].Value);
            var original = CleanName(match.Groups["orig"].Value);
            if (original.Length == 0 || substitute.Length == 0) continue;
            lines.Add($"الخط الأصلي ({original}) غير مدمج، وتم استبداله بـ ({substitute}).");
        }

        // 2) Explicit "could not find font X" wording.
        foreach (Match match in MissingFontRegex().Matches(gsOutput))
        {
            var name = CleanName(match.Groups["name"].Value);
            if (name.Length == 0) continue;
            lines.Add($"الخط الأصلي ({name}) غير مدمج في الملف.");
        }

        // 3) Unopenable font FILES — report the stem (the family GS hunted for).
        foreach (Match match in FontFileRegex().Matches(gsOutput))
        {
            var stem = Path.GetFileNameWithoutExtension(Path.GetFileName(CleanName(match.Groups["path"].Value)));
            if (stem.Length == 0) continue;
            lines.Add($"الخط الأصلي ({stem}) غير مدمج في الملف.");
        }

        // 4) The "could not be embedded" block — one name per line after the header.
        var inBlock = false;
        foreach (var rawLine in gsOutput.Split('\n'))
        {
            var line = rawLine.TrimEnd('\r');
            if (!inBlock)
            {
                var headerIndex = line.IndexOf(NotEmbeddedHeader, StringComparison.OrdinalIgnoreCase);
                if (headerIndex < 0) continue;
                inBlock = true;
                // A name may ride the same line after the last colon.
                var colon = line.LastIndexOf(':');
                if (colon >= 0 && colon > headerIndex)
                {
                    var name = CleanName(line[(colon + 1)..].Trim().TrimEnd(',', ';', '.'));
                    if (name.Length > 0) lines.Add($"الخط الأصلي ({name}) غير مدمج في الملف.");
                }
                continue;
            }

            var entry = line.Trim();
            if (entry.Length == 0) { inBlock = false; continue; }              // blank line ends the block
            var cleaned = CleanName(entry.TrimEnd(',', ';', '.'));
            if (cleaned.Length == 0) { inBlock = false; continue; }
            // Prose guard: real entries are font names, not sentences.
            if (cleaned.Contains(' ') && cleaned.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length > 3) { inBlock = false; continue; }
            if (cleaned.Contains("font", StringComparison.OrdinalIgnoreCase)) { inBlock = false; continue; }
            lines.Add($"الخط الأصلي ({cleaned}) غير مدمج في الملف.");
        }

        var report = lines
            .Where(line => !string.IsNullOrWhiteSpace(line))
            .Distinct(StringComparer.Ordinal)
            .Take(MaxReportLines)
            .ToList();

        return report.Count == 0 ? null : string.Join("\n", report);
    }

    /// <summary>Strips the punctuation GS wraps font names in ([ ] ( ) ' " ,).</summary>
    private static string CleanName(string raw)
    {
        var trimmed = raw.Trim().Trim('[', ']', '(', ')', '\'', '"', ',');
        return trimmed.Trim();
    }
}
