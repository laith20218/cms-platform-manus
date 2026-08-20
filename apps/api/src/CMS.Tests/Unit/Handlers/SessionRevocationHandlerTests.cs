using CMS.Application.Commands.Auth;
using CMS.Application.Handlers.Auth;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using Microsoft.Extensions.Configuration;
using Moq;

namespace CMS.Tests.Unit.Handlers;

public class SessionRevocationHandlerTests
{
    private static IConfiguration OtpEnabledConfiguration() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["Features:OtpEnabled"] = "true" })
        .Build();

    [Fact]
    public async Task LogoutCommand_RevokesSpecifiedSession()
    {
        var sessions = new Mock<ISessionService>();
        var sessionId = Guid.NewGuid();
        var handler = new LogoutCommandHandler(sessions.Object);

        await handler.Handle(new LogoutCommand(sessionId), CancellationToken.None);

        sessions.Verify(s => s.RevokeAsync(sessionId, "logout", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ResetPassword_RevokesAllStudentSessions()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var cache = new Mock<ICacheService>();
        cache.Setup(c => c.GetAsync<string>(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("135790");
        cache.Setup(c => c.GetAndRemoveAsync<string>(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("135790");
        var hasher = new Mock<IPasswordHasher>();
        hasher.Setup(h => h.HashPassword("NewPassword123!")).Returns("new-hash");
        var passwordPolicy = new Mock<IPasswordPolicy>();
        var sessions = new Mock<ISessionService>();
        var handler = new ResetPasswordCommandHandler(
            new StudentRepository(db), cache.Object, hasher.Object, sessions.Object, passwordPolicy.Object, OtpEnabledConfiguration(), new Mock<ISecurityAuditWriter>().Object);

        await handler.Handle(new ResetPasswordCommand(student.Phone, "135790", "NewPassword123!"), CancellationToken.None);

        sessions.Verify(s => s.RevokeAllForUserAsync(student.Id, "password_reset", It.IsAny<CancellationToken>()), Times.Once);
        cache.Verify(c => c.GetAndRemoveAsync<string>(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}
