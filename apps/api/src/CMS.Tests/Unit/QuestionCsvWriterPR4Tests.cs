using CMS.Application.Common;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Unit;

/// <summary>
/// PR-4 — unit coverage for the question-bank export primitives:
///  • QuestionCsvWriter: RFC 4180 escaping, UTF-8 BOM, fixed header, row cap,
///    and CSV formula-injection neutralization.
///  • Question.SetTags: trim/dedupe/limits — the domain validator of record for
///    bulk tagging (PR-4).
///  • Contract guard: the STUDENT preview DTO stays correctness-free (the admin
///    preview superset is a separate type — student surfaces must never gain
///    explanation/correct-answer fields).
/// </summary>
public sealed class QuestionCsvWriterPR4Tests
{
    // ===== CSV escaping =====

    [Theory]
    [InlineData("plain", "plain")]
    [InlineData("with,comma", "\"with,comma\"")]
    [InlineData("with\"quote", "\"with\"\"quote\"")]
    [InlineData("line\nbreak", "\"line\nbreak\"")]
    [InlineData("=cmd", "\"'=cmd\"")]
    [InlineData("+1", "\"'+1\"")]
    [InlineData("@sum", "\"'@sum\"")]
    [InlineData("-5", "\"'-5\"")]
    [InlineData("", "")]
    public void Escape_FollowsRfc4180_AndNeutralizesFormulas(string input, string expected)
        => QuestionCsvWriter.Escape(input).Should().Be(expected);

    [Fact]
    public void Render_StartsWithBomAndHeaderRow()
    {
        var csv = QuestionCsvWriter.Render(Enumerable.Empty<Question>());

        csv.Should().StartWith("\uFEFF");
        csv.Should().Contain("id,text,type,difficulty,status,lecture,tags,paragraph_tag,year,options_count,attempts_count,correct_rate,created_at,updated_at,author_id");
    }

    [Fact]
    public void Render_EscapesCommasQuotesAndNewlinesInsideQuestionText()
    {
        var question = Question.Create(
            "سؤال \"اختبار\", مع فواصل\nوأسطر", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string> { "tag,with,commas" }, Guid.NewGuid());
        question.AddOption("خيار 1", true, "A");
        question.AddOption("خيار 2", false, "B");

        var csv = QuestionCsvWriter.Render(new[] { question });

        csv.Should().Contain("\"سؤال \"\"اختبار\"\", مع فواصل\nوأسطر\"");
        csv.Should().Contain("\"tag,with,commas\"");
    }

    [Fact]
    public void Render_CapsRowsAtMaxRows()
    {
        var questions = Enumerable.Range(0, QuestionCsvWriter.MaxRows + 50)
            .Select(_ => Question.Create(
                $"سؤال {Guid.NewGuid():N}", QuestionType.Mcq, Guid.NewGuid(), null,
                Difficulty.Easy, new List<string>(), Guid.NewGuid()))
            .ToList();

        var csv = QuestionCsvWriter.Render(questions);

        var dataRows = csv.Split('\n').Count(line => line.Trim().Length > 0) - 1;
        dataRows.Should().Be(QuestionCsvWriter.MaxRows);
    }

    // ===== Question.SetTags (bulk tagging domain rules) =====

    [Fact]
    public void SetTags_TrimsDedupesAndDropsEmptyEntries()
    {
        var question = Question.Create("سؤال", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());

        question.SetTags(new List<string> { " anatomy ", "", "anatomy", "physiology " });

        question.Tags.Should().BeEquivalentTo(new List<string> { "anatomy", "physiology" }, options => options.WithStrictOrdering());
    }

    [Fact]
    public void SetTags_CapsAtTwentyEntries()
    {
        var question = Question.Create("سؤال", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());

        question.SetTags(Enumerable.Range(1, 30).Select(i => $"tag-{i}"));

        question.Tags.Count.Should().Be(20);
    }

    [Fact]
    public void SetTags_RejectsTagsLongerThanFiftyChars()
    {
        var question = Question.Create("سؤال", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());

        var act = () => question.SetTags(new List<string> { new string('a', 51) });

        act.Should().Throw<DomainException>();
    }

    // ===== Student preview contract guard =====

    [Fact]
    public void StudentPreviewDto_StaysCorrectnessFree()
    {
        // The STUDENT preview DTO (questions/random) must never gain authoring
        // fields — the PR-4 admin preview superset is a separate type on purpose.
        var studentDtoProperties = typeof(CMS.Application.DTOs.Questions.QuestionPreviewDto).GetProperties().Select(p => p.Name).ToList();
        var forbidden = new[] { "Explanation", "ExplanationHtml", "CorrectAnswerText", "CorrectOptionId", "CorrectOptionLetter", "Matching", "Status", "Reference" };

        foreach (var name in forbidden)
            studentDtoProperties.Should().NotContain(name, $"students must never see {name} before answering");
    }
}
