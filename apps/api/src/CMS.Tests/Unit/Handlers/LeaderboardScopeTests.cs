using CMS.Application.Commands.Stats;
using CMS.Application.Handlers.Stats;
using CMS.Application.Interfaces;
using CMS.Domain.Exceptions;
using CMS.Tests.Helpers;
using FluentAssertions;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// ADMIN-01 — Verifies that GetLeaderboardQuery enforces entitlement scope server-side.
/// Scope != "subject" or missing ScopeId must be rejected with ForbiddenException (403).
/// A valid-looking subject Guid that the student has no entitlement for must not leak cohort data.
/// </summary>
public sealed class LeaderboardScopeTests
{
    [Fact]
    public async Task Leaderboard_RejectsNonSubjectScope_WithForbiddenException()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);

        var cache = new Mock<ICacheService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);

        var act = async () => await handler.Handle(
            new GetLeaderboardQuery("year", Guid.NewGuid(), student.Id, "all", 100),
            CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
        entitlements.Verify(svc => svc.CanAccessSubjectAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Leaderboard_RejectsMissingScopeId_WithForbiddenException()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);

        var cache = new Mock<ICacheService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);

        var act = async () => await handler.Handle(
            new GetLeaderboardQuery("subject", null, student.Id, "all", 100),
            CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Leaderboard_RejectsMissingStudentId_WithForbiddenException()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);

        var cache = new Mock<ICacheService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);

        var act = async () => await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, null, "all", 100),
            CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Leaderboard_RejectsStudentWithoutEntitlement_WithForbiddenException()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);

        var cache = new Mock<ICacheService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        // The student has no active grant for the requested subject -> must be denied.
        entitlements.Setup(svc => svc.CanAccessSubjectAsync(student.Id, subject.Id, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);

        var act = async () => await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100),
            CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
        entitlements.Verify(svc => svc.CanAccessSubjectAsync(student.Id, subject.Id, "read", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Leaderboard_RejectsCrossSubjectScopeId_WhenStudentHasEntitlementOnlyForAnotherSubject()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);
        var otherSubjectId = Guid.NewGuid();

        var cache = new Mock<ICacheService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        // Student is entitled to "subject" but requests leaderboard for "otherSubjectId".
        entitlements.Setup(svc => svc.CanAccessSubjectAsync(student.Id, otherSubjectId, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);

        var act = async () => await handler.Handle(
            new GetLeaderboardQuery("subject", otherSubjectId, student.Id, "all", 100),
            CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
        // The handler must consult entitlements for the *requested* scopeId, not the student's own subject.
        entitlements.Verify(svc => svc.CanAccessSubjectAsync(student.Id, otherSubjectId, "read", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Leaderboard_AllowsAuthorizedStudent_AndQueriesOnlyAuthorizedSubject()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);

        // Use Loose mock so unconfigured generic GetAsync<T> returns default(T) without setup friction.
        var cache = new Mock<ICacheService>(MockBehavior.Loose);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        entitlements.Setup(svc => svc.CanAccessSubjectAsync(student.Id, subject.Id, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);

        var result = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100),
            CancellationToken.None);

        result.Should().NotBeNull();
        // With no attempts seeded, the leaderboard is empty but the student's rank is null.
        result.TopStudents.Should().BeEmpty();
        result.YourRank.Should().BeNull();
    }
}
