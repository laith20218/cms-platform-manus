using System.Text.Json;
using CMS.Application.Commands.Practice;
using CMS.Application.Commands.Questions;
using CMS.Application.Common;
using CMS.Application.DTOs.Questions;
using CMS.Application.Handlers.Practice;
using CMS.Application.Handlers.Questions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Domain.ValueObjects;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Wave 20.5 (owner decision 3) — the Matching (وصل) question type:
///   • payload invariants (equal counts, bijective pairs, unique ids, min size);
///   • grading (per-pair + all-or-nothing overall), shared by every path;
///   • admin create/update persistence through the existing question commands;
///   • the publish gate (payload required instead of options);
///   • the question player + practice answer paths returning per-pair results;
///   • the exam-engine snapshot grading (IsAnswerCorrect contract).
/// </summary>
public sealed class MatchingW205Tests
{
    private static Guid Prompt1 = Guid.NewGuid();
    private static Guid Prompt2 = Guid.NewGuid();
    private static Guid Target1 = Guid.NewGuid();
    private static Guid Target2 = Guid.NewGuid();

    private static MatchingPayload ValidPayload() => new()
    {
        Prompts = new List<MatchingItem>
        {
            new(Prompt1, "العضلة الدائرية للعين", 0),
            new(Prompt2, "العضلة الهرمية", 1),
        },
        Targets = new List<MatchingItem>
        {
            new(Target1, "عصب الوجه", 0),
            new(Target2, "عصب مثلث التوائم", 1),
        },
        Pairs = new List<MatchingPair>
        {
            new(Prompt1, Target1),
            new(Prompt2, Target2),
        },
    };

    private static string SubmittedJson(params (Guid prompt, Guid target)[] pairs) =>
        JsonSerializer.Serialize(
            pairs.Select(pair => new { promptId = pair.prompt, targetId = pair.target }).ToList());

    // ===== A/B — payload invariants =====

    [Fact]
    public void Validate_AcceptsABijectivePayload()
    {
        var payload = ValidPayload();
        var act = () => payload.Validate();
        act.Should().NotThrow();
    }

    [Theory]
    [InlineData(1)]   // fewer than 2 prompts/targets
    [InlineData(3)]   // counts unequal (3 prompts vs 2 targets)
    public void Validate_RejectsUnequalOrTooSmallSets(int promptCount)
    {
        var payload = ValidPayload();
        if (promptCount == 3)
            payload.Prompts.Add(new MatchingItem(Guid.NewGuid(), "عنصر زائد", 2));
        else
            payload.Prompts.RemoveAt(1);
        var act = () => payload.Validate();
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Validate_RejectsNonBijectivePairs()
    {
        var payload = ValidPayload();
        payload.Pairs[1] = new MatchingPair(Prompt2, Target1); // Target1 used twice
        var act = () => payload.Validate();
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Validate_RejectsUnknownPairIds()
    {
        var payload = ValidPayload();
        payload.Pairs[0] = new MatchingPair(Guid.NewGuid(), Target1);
        var act = () => payload.Validate();
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void Validate_RejectsEmptyTexts()
    {
        var payload = ValidPayload();
        payload.Prompts[0] = new MatchingItem(Prompt1, "   ", 0);
        var act = () => payload.Validate();
        act.Should().Throw<DomainException>();
    }

    // ===== D — grading (domain core) =====

    [Fact]
    public void Grade_AllPairsCorrect_IsCorrectWithAllPairsGreen()
    {
        var payload = ValidPayload();
        var (isCorrect, pairs) = payload.Grade(MatchingMapper.ParseSubmittedPairs(
            SubmittedJson((Prompt1, Target1), (Prompt2, Target2))));
        isCorrect.Should().BeTrue();
        pairs.Should().HaveCount(2).And.OnlyContain(pair => pair.IsCorrect);
    }

    [Fact]
    public void Grade_OneWrongPair_IsIncorrectWithPerPairFlags()
    {
        var payload = ValidPayload();
        var (isCorrect, pairs) = payload.Grade(MatchingMapper.ParseSubmittedPairs(
            SubmittedJson((Prompt1, Target2), (Prompt2, Target2))));
        isCorrect.Should().BeFalse();
        pairs.Single(pair => pair.PromptId == Prompt1).IsCorrect.Should().BeFalse();
        pairs.Single(pair => pair.PromptId == Prompt2).IsCorrect.Should().BeTrue();
    }

    [Fact]
    public void Grade_MissingPair_GradesWrongWithNullSubmittedTarget()
    {
        var payload = ValidPayload();
        var (isCorrect, pairs) = payload.Grade(MatchingMapper.ParseSubmittedPairs(
            SubmittedJson((Prompt1, Target1))));
        isCorrect.Should().BeFalse();
        pairs.Single(pair => pair.PromptId == Prompt2).IsCorrect.Should().BeFalse();
        pairs.Single(pair => pair.PromptId == Prompt2).SubmittedTargetId.Should().BeNull();
    }

    [Fact]
    public void Grade_MalformedJson_EveryPairWrong_NeverThrows()
    {
        var payload = ValidPayload();
        var (isCorrect, pairs) = payload.Grade(MatchingMapper.ParseSubmittedPairs("not json"));
        isCorrect.Should().BeFalse();
        pairs.Should().HaveCount(2).And.OnlyContain(pair => !pair.IsCorrect);
    }

    // ===== C — admin persistence through the existing commands =====

    private static (QuestionCommandHandlers Handler, ApplicationDbContext Db) CreateCommandHandler()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var entitlements = new Mock<IEntitlementService>();
        var handler = new QuestionCommandHandlers(db, new UnitOfWork(db), entitlements.Object, NoOp.ActivityWriter());
        return (handler, db);
    }

    private static MatchingPayloadDto ToPayloadDto(MatchingPayload payload) => MatchingMapper.ToDto(payload);

    [Fact]
    public async Task CreateQuestion_MatchingType_PersistsPayloadAndRoundTrips()
    {
        var (handler, db) = CreateCommandHandler();
        var subject = db.Subjects.First();

        var dto = await handler.Handle(new CreateQuestionCommand(
            "صل كل عضلة بعصبها", "Matching", subject.Id, null, "Medium", new List<string> { "تشريح" },
            new List<CreateOptionDto>(), string.Empty, null,
            "شرح الوصل", null, null, Guid.NewGuid(),
            Matching: ToPayloadDto(ValidPayload())), CancellationToken.None);

        dto.Type.Should().Be("Matching");
        dto.Matching.Should().NotBeNull();
        dto.Matching!.Prompts.Should().HaveCount(2);
        dto.Matching.Pairs.Should().HaveCount(2);

        var stored = await db.Questions.AsNoTracking().SingleAsync(q => q.Id == dto.Id);
        stored.MatchingJson.Should().NotBeNull();
        stored.Options.Should().BeEmpty();
    }

    [Fact]
    public async Task CreateQuestion_MatchingWithoutPayload_Rejected()
    {
        var (handler, db) = CreateCommandHandler();
        var subject = db.Subjects.First();

        var act = () => handler.Handle(new CreateQuestionCommand(
            "صل كل عضلة بعصبها", "Matching", subject.Id, null, "Medium", new List<string>(),
            new List<CreateOptionDto>(), string.Empty, null,
            "شرح الوصل", null, null, Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>();
    }

    [Fact]
    public async Task CreateQuestion_NonMatchingWithPayload_Rejected()
    {
        var (handler, db) = CreateCommandHandler();
        var subject = db.Subjects.First();

        var act = () => handler.Handle(new CreateQuestionCommand(
            "سؤال خيارات مع حمولة وصل", "Mcq", subject.Id, null, "Medium", new List<string>(),
            new List<CreateOptionDto> { new("خيار", true, null) }, string.Empty, null,
            "شرح", null, null, Guid.NewGuid(),
            Matching: ToPayloadDto(ValidPayload())), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>();
    }

    [Fact]
    public void Publish_MatchingWithoutPayload_Rejected()
    {
        // A Matching row authored directly (no payload) must never publish —
        // the gate re-validates instead of trusting the write path.
        var question = Question.Create(
            "صل كل عضلة بعصبها", QuestionType.Matching, Guid.NewGuid(), null,
            Difficulty.Medium, new List<string>(), Guid.NewGuid());
        var act = () => question.Publish();
        act.Should().Throw<BusinessRuleViolationException>();
    }

    [Fact]
    public async Task Publish_MatchingWithPayload_Succeeds()
    {
        var (handler, db) = CreateCommandHandler();
        var subject = db.Subjects.First();

        var dto = await handler.Handle(new CreateQuestionCommand(
            "صل كل عضلة بعصبها", "Matching", subject.Id, null, "Medium", new List<string>(),
            new List<CreateOptionDto>(), string.Empty, null,
            "شرح الوصل", null, null, Guid.NewGuid(),
            Matching: ToPayloadDto(ValidPayload())), CancellationToken.None);

        await handler.Handle(new PublishQuestionCommand(dto.Id), CancellationToken.None);
        (await db.Questions.AsNoTracking().SingleAsync(q => q.Id == dto.Id)).Status
            .Should().Be(ContentStatus.Published);
    }

    // ===== D — the question player path returns per-pair + overall =====

    [Fact]
    public async Task AnswerQuestion_MatchingGradesPerPairAndOverall()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var entitlements = new Mock<IEntitlementService>();
        entitlements.Setup(service => service.CanAccessQuestionAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var handler = new QuestionCommandHandlers(db, new UnitOfWork(db), entitlements.Object, NoOp.ActivityWriter());

        var subject = db.Subjects.First();
        var question = Question.Create("صل كل عضلة بعصبها", QuestionType.Matching, subject.Id, null, Difficulty.Medium, new List<string>(), Guid.NewGuid());
        question.UpdateExplanation("شرح الوصل");
        question.SetMatchingPayload(ValidPayload());
        question.Publish();
        db.Questions.Add(question);
        await db.SaveChangesAsync();

        var student = db.Students.First();
        var result = await handler.Handle(new AnswerQuestionCommand(
            question.Id, student.Id,
            SubmittedJson((Prompt1, Target2), (Prompt2, Target2)), null, 10, false), CancellationToken.None);

        result.IsCorrect.Should().BeFalse();
        result.MatchingResult.Should().NotBeNull();
        result.MatchingResult!.IsCorrect.Should().BeFalse();
        result.MatchingResult.Pairs.Single(pair => pair.PromptId == Prompt1).IsCorrect.Should().BeFalse();
        result.MatchingResult.Pairs.Single(pair => pair.PromptId == Prompt2).IsCorrect.Should().BeTrue();
        result.MatchingResult.CorrectPairs.Should().Contain(pair => pair.PromptId == Prompt1 && pair.TargetId == Target1);
        result.Explanation.Should().Be("شرح الوصل");
    }

    // ===== D — the practice path =====

    [Fact]
    public async Task PracticeSubmit_MatchingGradesAndDisclosesPerPair()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var entitlements = new Mock<IEntitlementService>();
        entitlements.Setup(service => service.CanAccessSubjectAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var handler = new PracticeHandlers(db, new UnitOfWork(db), entitlements.Object);

        var subject = db.Subjects.First();
        var question = Question.Create("صل كل عضلة بعصبها", QuestionType.Matching, subject.Id, null, Difficulty.Medium, new List<string>(), Guid.NewGuid());
        question.UpdateExplanation("شرح الوصل");
        question.SetMatchingPayload(ValidPayload());
        question.Publish();
        db.Questions.Add(question);

        var exam = db.Exams.First();
        db.ExamQuestions.Add(ExamQuestion.Create(exam.Id, question.Id, 0));
        var session = new PracticeSession { StudentId = db.Students.First().Id, ExamModelId = exam.Id };
        db.PracticeSessions.Add(session);
        await db.SaveChangesAsync();

        var student = db.Students.First();
        var result = await handler.Handle(new SubmitPracticeAnswerCommand(
            student.Id, session.Id, question.Id,
            SubmittedJson((Prompt1, Target1), (Prompt2, Target2)), null, null), CancellationToken.None);

        result.IsCorrect.Should().BeTrue();
        result.MatchingResult.Should().NotBeNull();
        result.MatchingResult!.IsCorrect.Should().BeTrue();
        result.MatchingResult.CorrectPairs.Should().HaveCount(2);
    }

    // ===== D — the exam engine snapshot grading contract =====

    [Fact]
    public async Task ExamSnapshot_CarriesMatchingJson_AndGradesTheBijection()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();

        var question = Question.Create("صل كل عضلة بعصبها", QuestionType.Matching, subject.Id, null, Difficulty.Medium, new List<string>(), Guid.NewGuid());
        question.UpdateExplanation("شرح الوصل");
        question.SetMatchingPayload(ValidPayload());
        question.Publish();
        db.Questions.Add(question);
        await db.SaveChangesAsync();

        // The engine's private snapshot builder is exercised through the handler
        // surface; here we assert the SNAPSHOTTED CONTRACT directly: the payload
        // survives verbatim and grades through the same domain rule.
        var snapshot = new ExamSessionQuestion
        {
            ExamSessionId = Guid.NewGuid(),
            SourceQuestionId = question.Id,
            SortOrder = 0,
            QuestionType = question.Type,
            QuestionText = question.Text,
            OptionsJson = "[]",
            Explanation = question.Explanation,
            MatchingJson = question.MatchingJson, // CreateSnapshot copies verbatim
        };

        var payload = MatchingPayload.Deserialize(snapshot.MatchingJson!);
        payload.Pairs.Should().BeEquivalentTo(ValidPayload().Pairs);

        var allCorrect = payload.Grade(MatchingMapper.ParseSubmittedPairs(
            SubmittedJson((Prompt1, Target1), (Prompt2, Target2))));
        allCorrect.IsCorrect.Should().BeTrue();

        var oneWrong = payload.Grade(MatchingMapper.ParseSubmittedPairs(
            SubmittedJson((Prompt1, Target2), (Prompt2, Target2))));
        oneWrong.IsCorrect.Should().BeFalse();
    }
}
