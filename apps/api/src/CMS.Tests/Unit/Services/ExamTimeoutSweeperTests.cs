using CMS.Api.BackgroundServices;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// W14.2 F.1 — exam timeout sweeper (D.3): expired InProgress sessions are finalized
/// through the shared finalize path; live and already-terminal sessions untouched.
/// </summary>
public class ExamTimeoutSweeperTests
{
    private static (ExamTimeoutSweeper Sweeper, ApplicationDbContext Db) Build()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var services = new ServiceCollection();
        services.AddSingleton(db);
        services.AddSingleton<ApplicationDbContext>(db);
        services.AddSingleton<IApplicationDbContext>(db);
        services.AddSingleton<IUnitOfWork>(new UnitOfWork(db));
        var provider = services.BuildServiceProvider();
        var sweeper = new ExamTimeoutSweeper(provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<ExamTimeoutSweeper>.Instance);
        return (sweeper, db);
    }

    private static ExamSession Seed(ApplicationDbContext db, TimeSpan expiresIn, ExamSessionStatus status = ExamSessionStatus.InProgress)
    {
        var session = new ExamSession
        {
            StudentId = Guid.NewGuid(),
            ExamId = Guid.NewGuid(),
            StartedAt = DateTime.UtcNow.AddHours(-1),
            ExpiresAt = DateTime.UtcNow.Add(expiresIn),
            DurationMinutesSnapshot = 60,
            PassingScoreSnapshot = 60,
            TotalQuestions = 2,
            Status = status
        };
        db.ExamSessions.Add(session);
        db.SaveChanges();
        return session;
    }

    [Fact]
    public async Task Sweep_FinalizesOnlyExpiredInProgressSessions()
    {
        var (sweeper, db) = Build();
        var expired = Seed(db, TimeSpan.FromSeconds(-5));
        var live = Seed(db, TimeSpan.FromMinutes(30));
        var completed = Seed(db, TimeSpan.FromSeconds(-60), ExamSessionStatus.Completed);
        var cancelled = Seed(db, TimeSpan.FromSeconds(-60), ExamSessionStatus.Cancelled);

        var finalized = await sweeper.SweepAsync(CancellationToken.None);

        finalized.Should().Be(1);
        var expiredRow = await db.ExamSessions.AsNoTracking().SingleAsync(session => session.Id == expired.Id);
        expiredRow.Status.Should().Be(ExamSessionStatus.TimedOut);
        expiredRow.TimedOutAt.Should().NotBeNull();
        expiredRow.CompletedAt.Should().NotBeNull();
        expiredRow.Score.Should().NotBeNull();

        (await db.ExamSessions.AsNoTracking().SingleAsync(session => session.Id == live.Id))
            .Status.Should().Be(ExamSessionStatus.InProgress);
        (await db.ExamSessions.AsNoTracking().SingleAsync(session => session.Id == completed.Id))
            .Status.Should().Be(ExamSessionStatus.Completed);
        (await db.ExamSessions.AsNoTracking().SingleAsync(session => session.Id == cancelled.Id))
            .Status.Should().Be(ExamSessionStatus.Cancelled);
    }

    [Fact]
    public async Task Sweep_IsIdempotent_SecondRunFindsNothing()
    {
        var (sweeper, db) = Build();
        Seed(db, TimeSpan.FromSeconds(-5));

        (await sweeper.SweepAsync(CancellationToken.None)).Should().Be(1);
        (await sweeper.SweepAsync(CancellationToken.None)).Should().Be(0);
    }
}
