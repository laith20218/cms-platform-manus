using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;
using CMS.Application.Commands.Auth;
using CMS.Application.Commands.Academic;
using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Auth;
using CMS.Application.Handlers.Auth;
using AcademicQueryHandlers = CMS.Application.Handlers.Academic.AcademicQueryHandlers;
using CMS.Application.Handlers.Questions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Tests for authentication command handlers.
/// </summary>
public class AuthHandlerTests
{
    [Fact]
    public async Task RegisterCommand_ValidData_ShouldCreateStudent()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var passwordHasher = new Mock<IPasswordHasher>();
        passwordHasher.Setup(p => p.HashPassword(It.IsAny<string>())).Returns("hashed_password");
        var cache = new Mock<ICacheService>();
        var passwordPolicy = new Mock<IPasswordPolicy>();
        using var uow = new UnitOfWork(db);

        var handler = new RegisterCommandHandler(new StudentRepository(db), passwordHasher.Object, cache.Object, uow, passwordPolicy.Object, OtpEnabledConfiguration());
        var cmd = new RegisterCommand(
            "0998765432", "Password123!", "محمد أحمد",
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), true, "web-0123456789abcdef0123456789abcdef"
        );

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Phone.Should().Be("0998765432");
        result.OtpRequired.Should().BeTrue();
        db.Students.Should().ContainSingle(s => s.Phone == "0998765432");
    }

    [Fact]
    public async Task RegisterCommand_DuplicatePhone_ShouldThrowConflictException()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var existingStudent = db.Students.First();
        var passwordHasher = new Mock<IPasswordHasher>();
        var cache = new Mock<ICacheService>();
        var passwordPolicy = new Mock<IPasswordPolicy>();
        using var uow = new UnitOfWork(db);

        var handler = new RegisterCommandHandler(new StudentRepository(db), passwordHasher.Object, cache.Object, uow, passwordPolicy.Object, OtpEnabledConfiguration());
        var cmd = new RegisterCommand(
            existingStudent.Phone, "Password123!", "Duplicate User",
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), true, "web-0123456789abcdef0123456789abcdef"
        );

        // Act
        var act = async () => await handler.Handle(cmd, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task LoginCommand_ValidCredentials_ShouldReturnAuthResponse()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var passwordHasher = new Mock<IPasswordHasher>();
        passwordHasher.Setup(p => p.VerifyPassword(It.IsAny<string>(), It.IsAny<string>())).Returns(true);
        var sessionService = new Mock<ISessionService>();
        sessionService.Setup(s => s.CreateAsync(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>(), It.IsAny<string?>(), It.IsAny<string?>()))
            .ReturnsAsync(new SessionTokenPair("access_token", "refresh_token", Guid.NewGuid(), DateTime.UtcNow.AddDays(7)));
        using var uow = new UnitOfWork(db);

        var handler = new LoginCommandHandler(new StudentRepository(db), passwordHasher.Object, sessionService.Object, uow, LoginConfiguration(), new Mock<ISecurityAuditWriter>().Object);
        var cmd = new LoginCommand(student.Phone, "password", "device_fp_123", "Test Device");

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.AccessToken.Should().Be("access_token");
        result.RefreshToken.Should().Be("refresh_token");
        result.User.Phone.Should().Be(student.Phone);
    }

    [Fact]
    public async Task LoginCommand_InvalidPassword_ShouldThrowDomainException()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var passwordHasher = new Mock<IPasswordHasher>();
        passwordHasher.Setup(p => p.VerifyPassword(It.IsAny<string>(), It.IsAny<string>())).Returns(false);
        var sessionService = new Mock<ISessionService>();
        using var uow = new UnitOfWork(db);

        var handler = new LoginCommandHandler(new StudentRepository(db), passwordHasher.Object, sessionService.Object, uow, LoginConfiguration(), new Mock<ISecurityAuditWriter>().Object);
        var cmd = new LoginCommand(student.Phone, "wrong_password", "device_fp", "Device");

        // Act
        var act = async () => await handler.Handle(cmd, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<DomainException>()
            .WithMessage("رقم الهاتف أو كلمة المرور غير صحيحة");
    }

    [Fact]
    public async Task LoginCommand_NonExistentPhone_ShouldThrowDomainException()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var passwordHasher = new Mock<IPasswordHasher>();
        var sessionService = new Mock<ISessionService>();
        using var uow = new UnitOfWork(db);

        var handler = new LoginCommandHandler(new StudentRepository(db), passwordHasher.Object, sessionService.Object, uow, LoginConfiguration(), new Mock<ISecurityAuditWriter>().Object);
        var cmd = new LoginCommand("0999999999", "password", "device_fp", "Device");

        // Act
        var act = async () => await handler.Handle(cmd, CancellationToken.None);

        // Assert
        await act.Should().ThrowAsync<DomainException>();
    }

    private static IConfiguration OtpEnabledConfiguration() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["Features:OtpEnabled"] = "true" })
        .Build();

    private static IConfiguration LoginConfiguration() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Login:MaxFailedAttempts"] = "5",
            ["Security:Login:LockoutMinutes"] = "15"
        })
        .Build();
}

/// <summary>
/// Tests for academic query handlers.
/// </summary>
public class AcademicHandlerTests
{
    [Fact]
    public async Task GetUniversitiesQuery_ShouldReturnPagedResult()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var handler = new AcademicQueryHandlers(db, AllowEntitlements(), new Mock<ICacheService>().Object);
        var query = new GetUniversitiesQuery(1, 50);

        // Act
        var result = await handler.Handle(query, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.Items.Should().HaveCount(1);
        result.Items[0].NameAr.Should().Be("جامعة حمص");
        result.Total.Should().Be(1);
    }

    [Fact]
    public async Task GetCollegesByUniversityQuery_ShouldReturnColleges()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var uni = db.Universities.First();
        var handler = new AcademicQueryHandlers(db, AllowEntitlements(), new Mock<ICacheService>().Object);

        // Act
        var result = await handler.Handle(new GetCollegesByUniversityQuery(uni.Id), CancellationToken.None);

        // Assert
        result.Should().HaveCount(1);
        result[0].NameAr.Should().Be("الطب البشري");
    }

    [Fact]
    public async Task GetSubjectsBySemesterQuery_ShouldReturnSubjectsWithCounts()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var sem = db.Semesters.First();
        var handler = new AcademicQueryHandlers(db, AllowEntitlements(), new Mock<ICacheService>().Object);

        // Act
        var result = await handler.Handle(new GetSubjectsBySemesterQuery(sem.Id), CancellationToken.None);

        // Assert
        result.Should().HaveCount(1);
        result[0].NameAr.Should().Be("الباطنة");
        result[0].TotalQuestions.Should().Be(2); // We seeded 2 questions
    }

    private static IEntitlementService AllowEntitlements()
    {
        var entitlements = new Mock<IEntitlementService>();
        entitlements.Setup(service => service.CanAccessSubjectAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return entitlements.Object;
    }
}

/// <summary>
/// Tests for question handlers.
/// </summary>
public class QuestionHandlerTests
{
    [Fact]
    public async Task GetQuestionsQuery_ShouldReturnPublishedQuestions()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var student = db.Students.First();
        var handler = new QuestionQueryHandlers(db, AllowAllEntitlements());

        // Act
        var result = await handler.Handle(new GetQuestionsQuery(subject.Id, null, null, student.Id, null, null), CancellationToken.None);

        // Assert
        result.Items.Should().HaveCount(2);
        result.Total.Should().Be(2);
    }

    // ===== FIX-3: IsFavorite must reflect persisted favorites (not hardcoded false) =====

    [Fact]
    public async Task GetQuestionsQuery_WithPersistedFavorite_MarksIsFavoriteTrue()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var student = db.Students.First();
        var questions = db.Questions.Include(q => q.Lecture).ToList();
        var favorited = questions[0];
        var notFavorited = questions[1];
        db.Favorites.Add(new Favorite { StudentId = student.Id, QuestionId = favorited.Id });
        await db.SaveChangesAsync();

        var handler = new QuestionQueryHandlers(db, AllowAllEntitlements());
        var result = await handler.Handle(new GetQuestionsQuery(subject.Id, null, null, student.Id, null, null), CancellationToken.None);

        result.Items.Single(item => item.Id == favorited.Id).IsFavorite.Should().BeTrue(
            "a persisted favorite must survive a reload of the question list");
        result.Items.Single(item => item.Id == notFavorited.Id).IsFavorite.Should().BeFalse();
    }

    [Fact]
    public async Task GetQuestionById_WithPersistedFavorite_MarksIsFavoriteTrue()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var question = db.Questions
            .Include(q => q.Options)
            .Include(q => q.Lecture)
            .First();
        db.Favorites.Add(new Favorite { StudentId = student.Id, QuestionId = question.Id });
        await db.SaveChangesAsync();

        var handler = new QuestionQueryHandlers(db, AllowAllEntitlements());
        var result = await handler.Handle(new GetQuestionByIdQuery(question.Id, student.Id), CancellationToken.None);

        result.IsFavorite.Should().BeTrue("the star must remain filled after a page reload");
    }

    [Fact]
    public async Task AnswerQuestionCommand_CorrectAnswer_ShouldReturnCorrectResult()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var question = db.Questions.Include(q => q.Options).First();
        var student = db.Students.First();
        using var uow = new UnitOfWork(db);
        var correctOptionId = question.Options.First(o => o.IsCorrect).Id.ToString();

        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());
        var cmd = new AnswerQuestionCommand(question.Id, student.Id, correctOptionId, null, 30, false);

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.Should().NotBeNull();
        result.IsCorrect.Should().BeTrue();
        result.IsFirstAttempt.Should().BeTrue();
        result.UpdatedStats.Should().NotBeNull();
        result.UpdatedStats!.QuestionsAnswered.Should().Be(1);
        result.UpdatedStats.CorrectAnswers.Should().Be(1);
    }

    [Fact]
    public async Task AnswerQuestionCommand_WrongAnswer_ShouldReturnIncorrectResult()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var question = db.Questions.Include(q => q.Options).First();
        var student = db.Students.First();
        using var uow = new UnitOfWork(db);
        var wrongOptionId = question.Options.First(o => !o.IsCorrect).Id.ToString();

        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());
        var cmd = new AnswerQuestionCommand(question.Id, student.Id, wrongOptionId, null, 20, false);

        // Act
        var result = await handler.Handle(cmd, CancellationToken.None);

        // Assert
        result.IsCorrect.Should().BeFalse();
        result.IsFirstAttempt.Should().BeTrue();
        result.UpdatedStats!.CorrectAnswers.Should().Be(0);
    }

    [Fact]
    public async Task AnswerQuestionCommand_SecondAttempt_ShouldNotBeFirstAttempt()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var question = db.Questions.Include(q => q.Options).First();
        var student = db.Students.First();
        using var uow = new UnitOfWork(db);
        var correctOptionId = question.Options.First(o => o.IsCorrect).Id.ToString();

        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());

        // First attempt
        await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, correctOptionId, null, 30, false), CancellationToken.None);

        // Second attempt
        var result = await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, correctOptionId, null, 25, false), CancellationToken.None);

        // Assert
        result.IsFirstAttempt.Should().BeFalse();
    }

    // ===== FIX-4: MultiSelect practice answers are graded as exact sets =====

    private static (Question Question, List<QuestionOption> Correct, List<QuestionOption> Wrong) SeedMultipleSelectQuestion(ApplicationDbContext db)
    {
        var subject = db.Subjects.First();
        var question = Question.Create("أي مما يلي من عوامل خطر القلاء المعوي؟", QuestionType.MultipleSelect, subject.Id, null, Difficulty.Medium, null, Guid.NewGuid());
        question.AddOption("الإقياء المستمر", true);
        question.AddOption("الإسهال المستمر", false);
        question.AddOption("تناول مضادات الحموضة بكثرة", true);
        question.AddOption("الفشل الكلوي المزمن", false);
        question.UpdateExplanation("الإقياء يفقد الحمض ومضادات الحموضة ترفع القلاء.");
        question.Publish();
        db.Questions.Add(question);
        db.SaveChanges();
        var tracked = db.Questions.Include(q => q.Options).Single(q => q.Id == question.Id);
        return (
            tracked,
            tracked.Options.Where(o => o.IsCorrect).ToList(),
            tracked.Options.Where(o => !o.IsCorrect).ToList()
        );
    }

    [Fact]
    public async Task AnswerQuestionCommand_MultipleSelect_ExactCorrectSet_ShouldPass()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var (question, correct, _) = SeedMultipleSelectQuestion(db);
        using var uow = new UnitOfWork(db);
        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());

        // Exam-engine contract: JSON array of option ids. Order must not matter.
        var ordered = correct.OrderByDescending(o => o.Id).Select(o => o.Id).ToList();
        var payload = System.Text.Json.JsonSerializer.Serialize(ordered);

        var result = await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, payload, null, 30, false), CancellationToken.None);

        result.IsCorrect.Should().BeTrue("an exact set match (in any order) must be graded correct");
        result.CorrectOptionId.Should().Be(string.Join(",", correct.OrderBy(o => o.OptionLetter).Select(o => o.Id)));
    }

    [Fact]
    public async Task AnswerQuestionCommand_MultipleSelect_OneOffSet_ShouldFail()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var (question, correct, wrong) = SeedMultipleSelectQuestion(db);
        using var uow = new UnitOfWork(db);
        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());

        // Correct set + one extra wrong option → must fail.
        var oneOff = correct.Select(o => o.Id).Append(wrong.First().Id).ToList();
        var payload = System.Text.Json.JsonSerializer.Serialize(oneOff);

        var result = await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, payload, null, 30, false), CancellationToken.None);

        result.IsCorrect.Should().BeFalse("a set with one extra option must not be graded correct");

        // Missing one correct option → must fail as well.
        var missingOne = correct.Take(correct.Count - 1).Select(o => o.Id).ToList();
        var missingPayload = System.Text.Json.JsonSerializer.Serialize(missingOne);
        var secondResult = await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, missingPayload, null, 20, false), CancellationToken.None);
        secondResult.IsCorrect.Should().BeFalse("a set missing one correct option must not be graded correct");
    }

    [Fact]
    public async Task AnswerQuestionCommand_MultipleSelect_EmptySet_ShouldFail()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var (question, _, _) = SeedMultipleSelectQuestion(db);
        using var uow = new UnitOfWork(db);
        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());

        var result = await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, "[]", null, 15, false), CancellationToken.None);

        result.IsCorrect.Should().BeFalse("an empty submitted set must not be graded correct");
    }

    [Fact]
    public async Task AnswerQuestionCommand_MultipleSelect_LegacyCommaSeparatedPayload_ShouldPass()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var (question, correct, _) = SeedMultipleSelectQuestion(db);
        using var uow = new UnitOfWork(db);
        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());

        // Legacy fallback contract: comma-separated ids.
        var payload = string.Join(",", correct.Select(o => o.Id));

        var result = await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, payload, null, 30, false), CancellationToken.None);

        result.IsCorrect.Should().BeTrue();
    }

    [Fact]
    public async Task AnswerEssayQuestion_ShowsModelAnswerAndExplanationAfterGrading()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var student = db.Students.First();
        var question = Question.Create("اشرح دور الكلية في جهاز المناعة", QuestionType.Essay, subject.Id, null, Difficulty.Medium, null, Guid.NewGuid());
        question.SetCorrectAnswer("تنتج الخلايا التائية وتدعم نضجها");
        question.UpdateExplanation("الكلية عضو لمفاوي أولي يشارك في تكوين ونضج الخلايا المناعية.");
        question.Publish();
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        using var uow = new UnitOfWork(db);
        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());

        var result = await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, null, "تنتج الخلايا التائية وتدعم نضجها", 42, false), CancellationToken.None);

        result.IsCorrect.Should().BeTrue();
        result.CorrectAnswerText.Should().Be("تنتج الخلايا التائية وتدعم نضجها");
        result.Explanation.Should().Contain("عضو لمفاوي");
    }

    [Fact]
    public async Task AnswerTrueFalseQuestion_ReturnsExplanationAfterAnswering()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var student = db.Students.First();
        var question = Question.Create("الخلايا التائية تنضج في الكلية.", QuestionType.TrueFalse, subject.Id, null, Difficulty.Easy, null, Guid.NewGuid());
        question.AddOption("صح", false);
        question.AddOption("خطأ", true);
        question.UpdateExplanation("الخلايا التائية تنضج في الغدة الزعترية، لا في الكلية.");
        question.Publish();
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        using var uow = new UnitOfWork(db);
        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements(), NoOp.ActivityWriter());
        var correctOptionId = question.Options.Single(option => option.IsCorrect).Id.ToString();

        var result = await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, correctOptionId, null, 17, false), CancellationToken.None);

        result.IsCorrect.Should().BeTrue();
        result.Explanation.Should().Contain("الغدة الزعترية");
        result.CorrectAnswerText.Should().BeNull();
    }

    private static IEntitlementService AllowAllEntitlements()
    {
        var entitlements = new Mock<IEntitlementService>();
        entitlements.Setup(e => e.CanAccessSubjectAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        entitlements.Setup(e => e.CanAccessSubjectContentAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<SubscriptionContentScope>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        entitlements.Setup(e => e.CanAccessQuestionAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return entitlements.Object;
    }
}
