using System.Text;
using CMS.Domain.Entities;
using CMS.Domain.Enums;

namespace CMS.Application.Common;

/// <summary>
/// PR-4 — RFC 4180 CSV serialization for the authorized question-bank export
/// (<c>GET /api/v1/admin/questions/export</c>). Deterministic column order,
/// UTF-8 BOM for Arabic Excel compatibility, formula-injection-safe escaping
/// (leading <c>= + - @</c> is prefixed with a single quote), and a hard row cap
/// so one request can never stream an unbounded export.
/// </summary>
public static class QuestionCsvWriter
{
    /// <summary>Upper bound on exported rows per request — bounded, honest, documented.</summary>
    public const int MaxRows = 5000;

    private static readonly string[] Header =
    {
        "id", "text", "type", "difficulty", "status", "lecture", "tags", "paragraph_tag",
        "year", "options_count", "attempts_count", "correct_rate", "created_at", "updated_at", "author_id",
    };

    /// <summary>Renders the questions as a CSV document (BOM + header + rows).</summary>
    public static string Render(IEnumerable<Question> questions)
    {
        var builder = new StringBuilder();
        builder.Append('\uFEFF'); // BOM — Arabic text opens correctly in Excel
        builder.AppendLine(string.Join(",", Header));
        foreach (var question in questions.Take(MaxRows))
            AppendRow(builder, question);
        return builder.ToString();
    }

    private static void AppendRow(StringBuilder builder, Question question)
    {
        var cells = new[]
        {
            question.Id.ToString(),
            question.Text,
            question.Type.ToString(),
            question.Difficulty.ToString(),
            question.Status.ToString(),
            question.Lecture?.NameAr ?? string.Empty,
            string.Join(";", question.Tags),
            question.ParagraphTag ?? string.Empty,
            question.Year?.ToString() ?? string.Empty,
            question.Options.Count.ToString(),
            question.AttemptsCount.ToString(),
            Math.Round(question.GetCorrectRate(), 1).ToString("0.0"),
            question.CreatedAt.ToString("O"),
            question.UpdatedAt.ToString("O"),
            question.CreatedBy.ToString(),
        };
        builder.AppendLine(string.Join(",", cells.Select(cell => Escape(cell ?? string.Empty))));
    }

    /// <summary>RFC 4180 escaping + CSV formula-injection guard.</summary>
    internal static string Escape(string? value)
    {
        value ??= string.Empty;
        var needsQuotes = value.Contains(',') || value.Contains('"') || value.Contains('\n') || value.Contains('\r');
        var safe = value.Replace("\"", "\"\"");
        // Anti formula-injection: a cell that starts with = + - @ can execute as a
        // formula in Excel/LibreOffice — neutralize it with a leading apostrophe.
        if (safe.Length > 0 && (safe[0] is '=' or '+' or '-' or '@'))
        {
            safe = "'" + safe;
            needsQuotes = true;
        }
        return needsQuotes ? $"\"{safe}\"" : safe;
    }
}
