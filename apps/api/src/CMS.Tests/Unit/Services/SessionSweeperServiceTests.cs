using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using CMS.Domain.Entities;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// Push 2 / Track 2: idle-session sweeper — only non-student sessions idle for more
/// than 15 minutes are closed (student sessions are governed by refresh-token expiry
/// and must NOT change behavior).
/// </summary>
public class SessionSweeperServiceTests
{
    private static (SessionSweeperService Sweeper, ApplicationDbContext Db) Build()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var services = new ServiceCollection();
        services.AddSingleton(db);
        var provider = services.BuildServiceProvider();
        var sweeper = new SessionSweeperService(provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<SessionSweeperService>.Instance);
        return (sweeper, db);
    }

    private static UserSession Seed(ApplicationDbContext db, string role, TimeSpan idleFor,
        SessionStatus status = SessionStatus.Active, bool closed = false)
    {
        var session = new UserSession
        {
            UserId = Guid.NewGuid(),
            Role = role,
            InstallationId = $"sweeper-test-{Guid.NewGuid():N}",
            FamilyId = Guid.NewGuid(),
            RefreshTokenHash = $"hash-{Guid.NewGuid():N}",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(1),
            LastActivityAt = DateTime.UtcNow - idleFor,
            Status = status,
            ClosedAt = closed ? DateTime.UtcNow.AddMinutes(-5) : null
        };
        db.UserSessions.Add(session);
        db.SaveChanges();
        return session;
    }

    [Fact]
    public async Task Sweep_ClosesIdleAdminSessions_Only()
    {
        var (sweeper, db) = Build();
        var idleAdmin = Seed(db, "admin", TimeSpan.FromMinutes(20));
        var idleSuperAdmin = Seed(db, "super_admin", TimeSpan.FromMinutes(30));
        var idleStudent = Seed(db, "student", TimeSpan.FromMinutes(40));
        var activeAdmin = Seed(db, "admin", TimeSpan.FromMinutes(2));
        var revokedAdmin = Seed(db, "admin", TimeSpan.FromMinutes(40), SessionStatus.Revoked);
        var alreadyClosed = Seed(db, "admin", TimeSpan.FromMinutes(40), closed: true);

        var closedCount = await sweeper.SweepAsync(CancellationToken.None);

        closedCount.Should().Be(2);
        db.UserSessions.AsNoTracking().Single(s => s.Id == idleAdmin.Id)
            .Should().Match<UserSession>(s => s.ClosedAt != null && s.Status == SessionStatus.Expired);
        db.UserSessions.AsNoTracking().Single(s => s.Id == idleSuperAdmin.Id)
            .Should().Match<UserSession>(s => s.ClosedAt != null && s.Status == SessionStatus.Expired);
        // Student sessions must keep their refresh-token lifetime untouched.
        db.UserSessions.AsNoTracking().Single(s => s.Id == idleStudent.Id)
            .Should().Match<UserSession>(s => s.ClosedAt == null && s.Status == SessionStatus.Active);
        db.UserSessions.AsNoTracking().Single(s => s.Id == activeAdmin.Id)
            .Should().Match<UserSession>(s => s.ClosedAt == null && s.Status == SessionStatus.Active);
        db.UserSessions.AsNoTracking().Single(s => s.Id == revokedAdmin.Id)
            .Should().Match<UserSession>(s => s.Status == SessionStatus.Revoked);
        db.UserSessions.AsNoTracking().Single(s => s.Id == alreadyClosed.Id).ClosedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task Sweep_WithNoIdleAdminSessions_ReturnsZeroAndChangesNothing()
    {
        var (sweeper, db) = Build();
        Seed(db, "admin", TimeSpan.FromMinutes(5));
        Seed(db, "student", TimeSpan.FromMinutes(50));

        var closedCount = await sweeper.SweepAsync(CancellationToken.None);

        closedCount.Should().Be(0);
        db.UserSessions.AsNoTracking().Should().OnlyContain(s => s.ClosedAt == null);
    }

    [Fact]
    public async Task Sweep_IsIdempotent_RepeatedRunsCloseNothingNew()
    {
        var (sweeper, db) = Build();
        Seed(db, "admin", TimeSpan.FromMinutes(25));

        (await sweeper.SweepAsync(CancellationToken.None)).Should().Be(1);
        (await sweeper.SweepAsync(CancellationToken.None)).Should().Be(0);
    }
}
