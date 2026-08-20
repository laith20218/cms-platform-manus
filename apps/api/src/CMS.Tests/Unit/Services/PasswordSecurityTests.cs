using CMS.Domain.Entities;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Security;
using FluentAssertions;

namespace CMS.Tests.Unit.Services;

public class PasswordSecurityTests
{
    [Fact]
    public void Argon2id_Hash_VerifiesAndUsesDistinctSalt()
    {
        var hasher = new PasswordHasher();

        var first = hasher.HashPassword("StrongPassword123!");
        var second = hasher.HashPassword("StrongPassword123!");

        first.Should().StartWith("$argon2id$v=19$");
        first.Should().NotBe(second);
        hasher.VerifyPassword("StrongPassword123!", first).Should().BeTrue();
        hasher.VerifyPassword("WrongPassword123!", first).Should().BeFalse();
        hasher.NeedsRehash(first).Should().BeFalse();
    }

    [Fact]
    public void BCryptLegacyHash_VerifiesAndRequiresRehash()
    {
        var hasher = new PasswordHasher();
        var legacy = BCrypt.Net.BCrypt.HashPassword("LegacyPassword123!", 12);

        hasher.VerifyPassword("LegacyPassword123!", legacy).Should().BeTrue();
        hasher.NeedsRehash(legacy).Should().BeTrue();
    }

    [Theory]
    [InlineData("short1!")]
    [InlineData("alllowercase123!")]
    [InlineData("ALLUPPERCASE123!")]
    [InlineData("Password123!")]
    public void PasswordPolicy_RejectsWeakPasswords(string password)
    {
        var policy = new PasswordPolicy();

        var act = () => policy.EnsureValid(password);

        act.Should().Throw<DomainException>().Which.ErrorCode.Should().Be("PASSWORD_POLICY_VIOLATION");
    }

    [Fact]
    public void PasswordPolicy_AcceptsStrongPassword()
    {
        var policy = new PasswordPolicy();

        var act = () => policy.EnsureValid("Bespoke!Medical2026");

        act.Should().NotThrow();
    }

    [Fact]
    public void Student_FailedLoginThreshold_LocksThenClearResetsState()
    {
        var student = Student.Create("0991234567", "hash", "طالب اختبار");

        student.RegisterFailedLogin(3, 15);
        student.RegisterFailedLogin(3, 15);
        student.IsLockedOut().Should().BeFalse();
        student.RegisterFailedLogin(3, 15);
        student.IsLockedOut().Should().BeTrue();

        student.ClearLoginFailures();

        student.IsLockedOut().Should().BeFalse();
        student.FailedLoginCount.Should().Be(0);
    }
}
