using System.Linq.Expressions;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace CMS.Tests.Integration;

/// <summary>
/// PR-4 — guards the tag-filter LINQ formulation against provider drift.
/// `q.Tags.Any(t => parameterList.Contains(t))` and `SelectMany(q => q.Tags)` do
/// NOT translate on the InMemory test provider (the InMemory translator rejects
/// parameter-list Contains inside a nested Any, and SelectMany over a mapped
/// collection) — the API therefore compiles an OR-chain of `Any(t => t == const)`
/// and projects tag lists before flattening client-side. These probes lock both
/// facts in so a future "simplification" cannot silently break the HTTP tests.
/// </summary>
public sealed class TagFilterTranslationProbe
{
    private static ApplicationDbContext NewDb()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase($"tag-probe-{Guid.NewGuid():N}")
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public void OrChainOfAnyTagEqualsConstant_TranslatesOnInMemory()
    {
        using var db = NewDb();
        db.Questions.Add(Question.Create("probe", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string> { "A" }, Guid.NewGuid()));
        db.Questions.Add(Question.Create("probe2", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string> { "C" }, Guid.NewGuid()));
        db.SaveChanges();

        var filterTags = new List<string> { "A", "B" };

        // Mirrors QuestionTagFilter.Apply: OR-chain of q.Tags.Any(t => t == <constant>).
        var parameter = Expression.Parameter(typeof(Question), "q");
        Expression? body = null;
        foreach (var tag in filterTags)
        {
            var tagParameter = Expression.Parameter(typeof(string), "t");
            var equals = Expression.Equal(tagParameter, Expression.Constant(tag));
            var anyBody = Expression.Lambda<Func<string, bool>>(equals, tagParameter);
            var anyCall = Expression.Call(
                typeof(Enumerable), nameof(Enumerable.Any), new[] { typeof(string) },
                Expression.Property(parameter, nameof(Question.Tags)), anyBody);
            body = body is null ? anyCall : Expression.OrElse(body, anyCall);
        }
        var predicate = Expression.Lambda<Func<Question, bool>>(body!, parameter);

        db.Questions.Where(predicate).ToList().Should().HaveCount(1); // only the "A" question matches
    }

    [Fact]
    public void ProjectTagsList_TranslatesOnInMemory()
    {
        using var db = NewDb();
        db.Questions.Add(Question.Create("probe", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string> { "A", "B" }, Guid.NewGuid()));
        db.SaveChanges();

        var rows = db.Questions.AsNoTracking()
            .Select(question => question.Tags)
            .ToList();

        rows.Should().HaveCount(1);
        rows[0].Should().BeEquivalentTo(new[] { "A", "B" });
    }
}
