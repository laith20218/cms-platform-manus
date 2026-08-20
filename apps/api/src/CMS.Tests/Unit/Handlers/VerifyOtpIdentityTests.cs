using CMS.Application.Commands.Auth;
using CMS.Application.Handlers.Auth;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Moq;

namespace CMS.Tests.Unit.Handlers;

public sealed class VerifyOtpIdentityTests
{
    private static IConfiguration OtpEnabledConfiguration() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["Features:OtpEnabled"] = "true" })
        .Build();

    [Fact]
    public async Task VerifyOtp_UsesTheProvidedInstallationIdForTheCreatedSession()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = Student.Create("0997778888", "test-password-hash", "OTP Identity Student");
        db.Students.Add(student);
        await db.SaveChangesAsync();
        var installationId = "web-0123456789abcdef0123456789abcdef";
        var cache = new Mock<ICacheService>();
        const string normalizedPhone = "+963997778888";
        cache.Setup(service => service.GetAsync<string>($"otp:{normalizedPhone}", It.IsAny<CancellationToken>()))
            .ReturnsAsync("123456");
        cache.Setup(service => service.GetAsync<string>($"otp-installation:{normalizedPhone}", It.IsAny<CancellationToken>()))
            .ReturnsAsync(installationId);
        cache.Setup(service => service.GetAndRemoveAsync<string>($"otp:{normalizedPhone}", It.IsAny<CancellationToken>()))
            .ReturnsAsync("123456");
        cache.Setup(service => service.RemoveAsync($"otp:{normalizedPhone}", It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        cache.Setup(service => service.RemoveAsync($"otp-installation:{normalizedPhone}", It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var sessions = new Mock<ISessionService>();
        sessions.Setup(service => service.CreateAsync(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SessionTokenPair("access", "refresh", Guid.NewGuid(), DateTime.UtcNow.AddDays(7)));
        using var unitOfWork = new UnitOfWork(db);
        var handler = new VerifyOtpCommandHandler(new StudentRepository(db), cache.Object, sessions.Object, unitOfWork, OtpEnabledConfiguration());

        var response = await handler.Handle(
            new VerifyOtpCommand(student.Phone, "123456", installationId),
            CancellationToken.None);

        response.AccessToken.Should().Be("access");
        sessions.Verify(service => service.CreateAsync(
            student.Id, student.Phone, "student", installationId, null, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task VerifyOtp_RejectsTheCorrectCodeFromAnotherInstallationBeforeCreatingASession()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = Student.Create("0997779999", "test-password-hash", "OTP Mismatch Student");
        db.Students.Add(student);
        await db.SaveChangesAsync();
        const string normalizedPhone = "+963997779999";
        const string registeredInstallationId = "web-0123456789abcdef0123456789abcdef";
        const string differentInstallationId = "web-fedcba9876543210fedcba9876543210";
        var cache = new Mock<ICacheService>();
        cache.Setup(service => service.GetAsync<string>($"otp:{normalizedPhone}", It.IsAny<CancellationToken>()))
            .ReturnsAsync("123456");
        cache.Setup(service => service.GetAsync<string>($"otp-installation:{normalizedPhone}", It.IsAny<CancellationToken>()))
            .ReturnsAsync(registeredInstallationId);

        var sessions = new Mock<ISessionService>();
        using var unitOfWork = new UnitOfWork(db);
        var handler = new VerifyOtpCommandHandler(new StudentRepository(db), cache.Object, sessions.Object, unitOfWork, OtpEnabledConfiguration());

        var act = async () => await handler.Handle(
            new VerifyOtpCommand(student.Phone, "123456", differentInstallationId),
            CancellationToken.None);

        await act.Should().ThrowAsync<CMS.Domain.Exceptions.DomainException>();
        sessions.Verify(service => service.CreateAsync(
            It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
