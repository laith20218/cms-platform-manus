using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Questions;
using CMS.Application.Handlers.Questions;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// W22.3 (R-04) — the bulk question import validation path.
///
/// Locks:
///  1. An invalid row raises the project-standard domain exception
///     (BusinessRuleViolationException) whose message rides the per-row
///     Arabic error report — the expected error path, never an opaque
///     exception/500 escaping the handler.
///  2. A mixed batch imports the valid rows and reports the invalid ones
///     in the same ImportResultDto.
/// </summary>
public class QuestionImportW223Tests
{
    private static QuestionCommandHandlers BuildHandler(ApplicationDbContext db, IUnitOfWork uow) =>
        new(db, uow, new Mock<IEntitlementService>().Object, new Mock<IAdminActivityWriter>().Object);

    private static ImportQuestionRow Row(
        string text = "سؤال سليم من الاستيراد",
        string correctOption = "A") =>
        new(text, "الخيار أ", "الخيار ب", null, null, correctOption, "شرح السؤال المستورد", "Easy", null, null, null);

    [Fact]
    public async Task Import_MissingText_ReportsTheArabicRowError_ExpectedPathNotAnException()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var handler = BuildHandler(db, uow);
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();

        var result = await handler.Handle(new ImportQuestionsCommand(
            subject.Id, null,
            new List<ImportQuestionRow> { Row(text: "   ") },
            admin.Id), CancellationToken.None);

        // The honest per-row report — NOT a thrown exception escaping the handler
        // (which the middleware would have turned into an opaque 500).
        result.Total.Should().Be(1);
        result.Success.Should().Be(0);
        result.Failed.Should().Be(1);
        result.Errors.Should().ContainSingle();
        result.Errors[0].Should().Contain("السطر 1");
        result.Errors[0].Should().Contain("نص السؤال مطلوب");
    }

    [Fact]
    public async Task Import_MissingCorrectOption_ReportsTheArabicRowError()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var handler = BuildHandler(db, uow);
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();

        var result = await handler.Handle(new ImportQuestionsCommand(
            subject.Id, null,
            new List<ImportQuestionRow> { Row(correctOption: "  ") },
            admin.Id), CancellationToken.None);

        result.Failed.Should().Be(1);
        result.Errors[0].Should().Contain("الإجابة الصحيحة مطلوبة");
    }

    [Fact]
    public async Task Import_MixedBatch_ImportsTheValidRow_AndReportsTheInvalidOne()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var handler = BuildHandler(db, uow);
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();

        var result = await handler.Handle(new ImportQuestionsCommand(
            subject.Id, null,
            new List<ImportQuestionRow> { Row(), Row(text: "   ") },
            admin.Id), CancellationToken.None);

        result.Total.Should().Be(2);
        result.Success.Should().Be(1);
        result.Failed.Should().Be(1);
        result.Errors.Should().Contain(error => error.Contains("نص السؤال مطلوب"));
        // The valid row actually persisted.
        db.Questions.Should().Contain(question => question.Text == "سؤال سليم من الاستيراد");
    }
}
