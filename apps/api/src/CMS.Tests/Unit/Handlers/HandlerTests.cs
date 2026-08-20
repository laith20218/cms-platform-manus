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
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
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
        var handler = new AcademicQueryHandlers(db, AllowEntitlements());
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
        var handler = new AcademicQueryHandlers(db, AllowEntitlements());

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
        var handler = new AcademicQueryHandlers(db, AllowEntitlements());

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

    [Fact]
    public async Task AnswerQuestionCommand_CorrectAnswer_ShouldReturnCorrectResult()
    {
        // Arrange
        using var db = TestDbHelper.CreateInMemoryContext();
        var question = db.Questions.Include(q => q.Options).First();
        var student = db.Students.First();
        using var uow = new UnitOfWork(db);
        var correctOptionId = question.Options.First(o => o.IsCorrect).Id.ToString();

        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements());
        var cmd = new AnswerQuestionCommand(question.Id, student.Id, correctOptionId, 30, false);

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

        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements());
        var cmd = new AnswerQuestionCommand(question.Id, student.Id, wrongOptionId, 20, false);

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

        var handler = new QuestionCommandHandlers(db, uow, AllowAllEntitlements());

        // First attempt
        await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, correctOptionId, 30, false), CancellationToken.None);

        // Second attempt
        var result = await handler.Handle(new AnswerQuestionCommand(question.Id, student.Id, correctOptionId, 25, false), CancellationToken.None);

        // Assert
        result.IsFirstAttempt.Should().BeFalse();
    }

    private static IEntitlementService AllowAllEntitlements()
    {
        var entitlements = new Mock<IEntitlementService>();
        entitlements.Setup(e => e.CanAccessSubjectAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        entitlements.Setup(e => e.CanAccessQuestionAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return entitlements.Object;
    }
}
