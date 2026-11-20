namespace CMS.Application.Common;

/// <summary>
/// Wave 20.3 (owner decision 1) — six-digit public codes for library files and
/// video courses. Auto-generated at row creation, zero-padded ("000000"–"999999"),
/// unique per table (enforced by a unique index), always shown next to the name
/// in student-web, and searchable by name OR code. Episodes deliberately get
/// NO codes of their own (the code belongs to the file / the course as a whole).
/// </summary>
public static class PublicCodes
{
    public const int Length = 6;
    public const int Space = 1_000_000;

    /// <summary>A random zero-padded six-digit candidate.</summary>
    public static string Generate(Random random) => random.Next(Space).ToString("d6");

    /// <summary>
    /// Normalizes a student-typed search term into the zero-padded code form:
    /// "1234" → "001234". Returns null for terms that cannot be a code
    /// (non-digits, or longer than six digits) — those keep name-only matching.
    /// </summary>
    public static string? NormalizeSearchTerm(string term) =>
        term.Length <= Length && term.All(char.IsDigit) ? term.PadLeft(Length, '0') : null;

    /// <summary>
    /// Generates a code guaranteed free per <paramref name="existsAsync"/>.
    /// 30 random attempts cover any realistic density (10^6 space); the linear
    /// sweep from a random start is the deterministic fallback and terminates
    /// while fewer than 10^6 live rows exist (the unique index guarantees that).
    /// </summary>
    public static async Task<string> GenerateUniqueAsync(Func<string, Task<bool>> existsAsync, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var random = new Random();
        for (var attempt = 0; attempt < 30; attempt++)
        {
            var candidate = Generate(random);
            if (!await existsAsync(candidate)) return candidate;
        }

        var start = random.Next(Space);
        for (var offset = 0; offset < Space; offset++)
        {
            ct.ThrowIfCancellationRequested();
            var candidate = ((start + offset) % Space).ToString("d6");
            if (!await existsAsync(candidate)) return candidate;
        }

        throw new InvalidOperationException("Public code space exhausted (10^6 live rows).");
    }
}
