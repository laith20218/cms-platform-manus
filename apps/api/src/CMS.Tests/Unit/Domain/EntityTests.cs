using FluentAssertions;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Tests.Unit.Domain;

/// <summary>
/// Tests for Question domain entity business logic.
/// </summary>
public class QuestionEntityTests
{
    [Fact]
    public void Create_ValidParameters_ShouldCreateQuestion()
    {
        // Arrange
        var subjectId = Guid.NewGuid();
        var createdBy = Guid.NewGuid();

        // Act
        var question = Question.Create(
            "ما هو التشخيص؟", QuestionType.Mcq, subjectId, null,
            Difficulty.Medium, new List<string> { "cardiology" }, createdBy
        );

        // Assert
        question.Should().NotBeNull();
        question.Text.Should().Be("ما هو التشخيص؟");
        question.Type.Should().Be(QuestionType.Mcq);
        question.SubjectId.Should().Be(subjectId);
        question.Difficulty.Should().Be(Difficulty.Medium);
        question.Tags.Should().ContainSingle().Which.Should().Be("cardiology");
        question.Status.Should().Be(ContentStatus.Draft);
        question.CreatedBy.Should().Be(createdBy);
    }

    [Fact]
    public void Create_EmptyText_ShouldThrowDomainException()
    {
        // Arrange
        var act = () => Question.Create("", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());

        // Act & Assert
        act.Should().Throw<DomainException>()
            .WithMessage("Question text is required");
    }

    [Fact]
    public void AddOption_ShouldAddToOptionsList()
    {
        // Arrange
        var question = Question.Create("Test?", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());

        // Act
        question.AddOption("Option A", true);
        question.AddOption("Option B", false);

        // Assert
        question.Options.Should().HaveCount(2);
        question.Options[0].Text.Should().Be("Option A");
        question.Options[0].IsCorrect.Should().BeTrue();
        question.Options[0].OptionLetter.Should().Be("A");
        question.Options[1].OptionLetter.Should().Be("B");
        question.CorrectAnswer.Should().NotBeEmpty();
    }

    [Fact]
    public void Publish_WithoutCorrectAnswer_ShouldThrowBusinessRuleViolation()
    {
        // Arrange
        var question = Question.Create("Test?", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());
        question.AddOption("A", false);
        question.AddOption("B", false);
        question.UpdateExplanation("Explanation");

        // Act
        var act = () => question.Publish();

        // Assert
        act.Should().Throw<BusinessRuleViolationException>()
            .WithMessage("Cannot publish question without a correct answer");
    }

    [Fact]
    public void Publish_WithoutExplanation_ShouldThrowBusinessRuleViolation()
    {
        // Arrange
        var question = Question.Create("Test?", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());
        question.AddOption("A", true);
        question.AddOption("B", false);

        // Act
        var act = () => question.Publish();

        // Assert
        act.Should().Throw<BusinessRuleViolationException>()
            .WithMessage("Cannot publish question without explanation");
    }

    [Fact]
    public void Publish_WithLessThanTwoOptions_ShouldThrowBusinessRuleViolation()
    {
        // Arrange
        var question = Question.Create("Test?", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());
        question.AddOption("A", true);
        question.UpdateExplanation("Explanation");

        // Act
        var act = () => question.Publish();

        // Assert
        act.Should().Throw<BusinessRuleViolationException>()
            .WithMessage("Question must have at least 2 options");
    }

    [Fact]
    public void Publish_ValidQuestion_ShouldChangeStatusToPublished()
    {
        // Arrange
        var question = Question.Create("Test?", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());
        question.AddOption("A", true);
        question.AddOption("B", false);
        question.UpdateExplanation("Explanation");

        // Act
        question.Publish();

        // Assert
        question.Status.Should().Be(ContentStatus.Published);
    }

    [Fact]
    public void RecordAttempt_CorrectAnswer_ShouldIncrementCorrectAttempts()
    {
        // Arrange
        var question = Question.Create("Test?", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());

        // Act
        question.RecordAttempt(true);
        question.RecordAttempt(false);
        question.RecordAttempt(true);

        // Assert
        question.AttemptsCount.Should().Be(3);
        question.CorrectAttempts.Should().Be(2);
        question.GetCorrectRate().Should().BeApproximately(66.67, 0.1);
    }

    [Fact]
    public void UpdateExplanation_EmptyExplanation_ShouldThrowDomainException()
    {
        // Arrange
        var question = Question.Create("Test?", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());

        // Act
        var act = () => question.UpdateExplanation("");

        // Assert
        act.Should().Throw<DomainException>()
            .WithMessage("Explanation is required");
    }

    [Fact]
    public void SoftDelete_ShouldSetDeletedAtAndChangeStatus()
    {
        // Arrange
        var question = Question.Create("Test?", QuestionType.Mcq, Guid.NewGuid(), null,
            Difficulty.Easy, new List<string>(), Guid.NewGuid());
        var deletedBy = Guid.NewGuid();

        // Act
        question.SoftDelete(deletedBy);

        // Assert
        question.Status.Should().Be(ContentStatus.Deleted);
        question.DeletedAt.Should().NotBeNull();
        question.DeletedBy.Should().Be(deletedBy);
    }
}

/// <summary>
/// Tests for Student domain entity business logic.
/// </summary>
public class StudentEntityTests
{
    [Fact]
    public void Create_ValidParameters_ShouldCreateStudent()
    {
        var student = Student.Create("0991234567", "hashed_pass", "أحمد العبد الله");

        student.Should().NotBeNull();
        student.Phone.Should().Be("0991234567");
        student.PhoneNormalized.Should().Be("+963991234567");
        student.FullName.Should().Be("أحمد العبد الله");
        student.Status.Should().Be(StudentStatus.Active);
    }

    [Fact]
    public void Create_EmptyPhone_ShouldThrow()
    {
        var act = () => Student.Create("", "pass", "Name");
        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void NormalizePhone_09Prefix_ShouldConvertToPlus963()
    {
        var student = Student.Create("0991234567", "pass", "Name");
        student.PhoneNormalized.Should().Be("+963991234567");
    }

    [Fact]
    public void RecordActivity_ConsecutiveDays_ShouldIncrementStreak()
    {
        var student = Student.Create("0991234567", "pass", "Name");

        student.RecordActivity();
        var firstStreak = student.CurrentStreak;

        // Simulate next day by setting LastActivityDate to yesterday
        typeof(Student).GetProperty("LastActivityDate")?.SetValue(student, DateTime.UtcNow.Date.AddDays(-1));

        student.RecordActivity();

        student.CurrentStreak.Should().Be(firstStreak + 1);
    }

    [Fact]
    public void RecordActivity_SameDay_ShouldNotChangeStreak()
    {
        var student = Student.Create("0991234567", "pass", "Name");
        student.RecordActivity();
        var streak = student.CurrentStreak;

        student.RecordActivity(); // Same day

        student.CurrentStreak.Should().Be(streak);
    }

    [Fact]
    public void RecordAnswer_Correct_ShouldIncrementCorrectAnswers()
    {
        var student = Student.Create("0991234567", "pass", "Name");

        student.RecordAnswer(true);
        student.RecordAnswer(false);
        student.RecordAnswer(true);

        student.QuestionsAnswered.Should().Be(3);
        student.CorrectAnswers.Should().Be(2);
        student.GetAccuracy().Should().BeApproximately(66.67, 0.1);
    }

    [Fact]
    public void Ban_ShouldSetStatusAndReason()
    {
        var student = Student.Create("0991234567", "pass", "Name");
        var banUntil = DateTime.UtcNow.AddDays(7);

        student.Ban("Security violation", banUntil);

        student.Status.Should().Be(StudentStatus.Banned);
        student.BanReason.Should().Be("Security violation");
        student.BanUntil.Should().Be(banUntil);
        student.IsBanned().Should().BeTrue();
    }

    [Fact]
    public void Unban_ShouldClearBanFields()
    {
        var student = Student.Create("0991234567", "pass", "Name");
        student.Ban("Test", DateTime.UtcNow.AddDays(7));

        student.Unban();

        student.Status.Should().Be(StudentStatus.Active);
        student.BanReason.Should().BeNull();
        student.IsBanned().Should().BeFalse();
    }

    [Fact]
    public void SetOtp_ShouldSetOtpAndExpiry()
    {
        var student = Student.Create("0991234567", "pass", "Name");

        student.SetOtp("1234", 5);

        student.OtpCode.Should().Be("1234");
        student.OtpExpiresAt.Should().NotBeNull();
    }

    [Fact]
    public void IsOtpValid_CorrectCodeBeforeExpiry_ShouldReturnTrue()
    {
        var student = Student.Create("0991234567", "pass", "Name");
        student.SetOtp("1234", 5);

        student.IsOtpValid("1234").Should().BeTrue();
    }

    [Fact]
    public void IsOtpValid_WrongCode_ShouldReturnFalse()
    {
        var student = Student.Create("0991234567", "pass", "Name");
        student.SetOtp("1234", 5);

        student.IsOtpValid("9999").Should().BeFalse();
    }
}
