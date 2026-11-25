using CMS.Application.Commands.Stats;
using CMS.Application.DTOs.Stats;
using CMS.Application.Handlers.Stats;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
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

        var cache = new Mock<ICacheService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);

        var act = async () => await handler.Handle(
            new GetLeaderboardQuery("year", Guid.NewGuid(), student.Id, "all", 100),
            CancellationToken.None);

        // 15.5a (DEBT-LEADERBOARD-ERROR-CODE): scope 403s carry a distinct code.
        (await act.Should().ThrowAsync<ForbiddenException>())
            .Which.ErrorCode.Should().Be("LEADERBOARD_SCOPE_INVALID");
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

        // 15.5a: missing ScopeId lands on the same scope guard as a non-subject scope.
        (await act.Should().ThrowAsync<ForbiddenException>())
            .Which.ErrorCode.Should().Be("LEADERBOARD_SCOPE_INVALID");
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

        (await act.Should().ThrowAsync<ForbiddenException>())
            .Which.ErrorCode.Should().Be("LEADERBOARD_NO_STUDENT");
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

        (await act.Should().ThrowAsync<ForbiddenException>())
            .Which.ErrorCode.Should().Be("LEADERBOARD_NOT_ENTITLED");
        entitlements.Verify(svc => svc.CanAccessSubjectAsync(student.Id, subject.Id, "read", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Leaderboard_RejectsCrossSubjectScopeId_WhenStudentHasEntitlementOnlyForAnotherSubject()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
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

        (await act.Should().ThrowAsync<ForbiddenException>())
            .Which.ErrorCode.Should().Be("LEADERBOARD_NOT_ENTITLED");
        // The handler must consult entitlements for the *requested* scopeId, not the student's own subject.
        entitlements.Verify(svc => svc.CanAccessSubjectAsync(student.Id, otherSubjectId, "read", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Leaderboard_AllowsAuthorizedStudent_AndQueriesOnlyAuthorizedSubject()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);

        // W15.4.4.0a (D2): the consent gate now 403s students who do not share their
        // own data. Opt the seeded student in so this test keeps exercising the
        // authorized happy path — its assertions are unchanged.
        student.SetLeaderboardSharing(true);
        await db.SaveChangesAsync();

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

    // ===== W15.4.4.0a: mutual-sharing consent (D2/D3/D4) =====

    /// <summary>
    /// Adds a student with the given sharing state and first attempts on the seeded
    /// question (correct + wrong mix drives accuracy for ranking).
    /// </summary>
    private static Student AddStudentWithAttempts(ApplicationDbContext db, Guid questionId, int correct, int wrong, bool shares)
    {
        var student = Student.Create(
            "0991" + Random.Shared.Next(1000000, 9999999),
            $"pass_{Guid.NewGuid():N}",
            $"طالب {Guid.NewGuid().ToString()[..8]}");
        if (shares)
            student.SetLeaderboardSharing(true);
        db.Students.Add(student);
        for (var i = 0; i < correct; i++)
            db.AttemptLogs.Add(new AttemptLog
            {
                StudentId = student.Id, QuestionId = questionId,
                IsCorrect = true, IsFirstAttempt = true, AttemptNumber = 1
            });
        for (var i = 0; i < wrong; i++)
            db.AttemptLogs.Add(new AttemptLog
            {
                StudentId = student.Id, QuestionId = questionId,
                IsCorrect = false, IsFirstAttempt = true, AttemptNumber = 1
            });
        return student;
    }

    [Fact]
    public async Task Leaderboard_RejectsNonSharingStudent_WithDistinctOptInMessage()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);

        var cache = new Mock<ICacheService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        entitlements.Setup(svc => svc.CanAccessSubjectAsync(student.Id, subject.Id, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);

        var act = async () => await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100),
            CancellationToken.None);

        // D4: the consent 403 must be distinguishable from the scope/entitlement 403s.
        // 15.5a (DEBT-LEADERBOARD-ERROR-CODE): the structured code replaces message
        // matching as the contract; the message assertion stays as a regression pin.
        var ex = (await act.Should().ThrowAsync<ForbiddenException>()).Which;
        ex.ErrorCode.Should().Be("LEADERBOARD_NOT_OPTED_IN");
        ex.Message.Should().Contain("لم تُفعّل المشاركة في لوحة الصدارة");
    }

    [Fact]
    public async Task Leaderboard_OptedInStudent_SeessOnlySharingStudents()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        student.SetLeaderboardSharing(true);
        var subject = TestDbHelper.GetTestSubject(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var sharer = AddStudentWithAttempts(db, question.Id, correct: 3, wrong: 1, shares: true);
        var hidden = AddStudentWithAttempts(db, question.Id, correct: 4, wrong: 0, shares: false);
        await db.SaveChangesAsync();

        var cache = new Mock<ICacheService>(MockBehavior.Loose);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        entitlements.Setup(svc => svc.CanAccessSubjectAsync(student.Id, subject.Id, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);
        var result = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100),
            CancellationToken.None);

        // A non-sharing student stays hidden even with a better score.
        result.TopStudents.Select(e => e.StudentName).Should().NotContain(hidden.FullName);
        result.TopStudents.Select(e => e.StudentName).Should().Contain(sharer.FullName);
    }

    [Fact]
    public async Task Leaderboard_TopStudents_ContainsOnlySharingStudents_WhenMixIsSeeded()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        student.SetLeaderboardSharing(true);
        var subject = TestDbHelper.GetTestSubject(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var sharers = new[]
        {
            AddStudentWithAttempts(db, question.Id, correct: 2, wrong: 2, shares: true),
            AddStudentWithAttempts(db, question.Id, correct: 3, wrong: 1, shares: true)
        };
        var nonSharers = new[]
        {
            AddStudentWithAttempts(db, question.Id, correct: 4, wrong: 0, shares: false),
            AddStudentWithAttempts(db, question.Id, correct: 3, wrong: 1, shares: false),
            AddStudentWithAttempts(db, question.Id, correct: 2, wrong: 2, shares: false)
        };
        await db.SaveChangesAsync();

        var cache = new Mock<ICacheService>(MockBehavior.Loose);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        entitlements.Setup(svc => svc.CanAccessSubjectAsync(student.Id, subject.Id, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);
        var result = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100),
            CancellationToken.None);

        // Exactly the two opted-in peers appear (the requesting student has no attempts);
        // the three non-sharers never do, including ones that out-score an opted-in student.
        result.TopStudents.Should().HaveCount(2);
        result.TopStudents.Select(e => e.StudentName).Should().BeEquivalentTo(sharers.Select(s => s.FullName));
        foreach (var nonSharer in nonSharers)
            result.TopStudents.Select(e => e.StudentName).Should().NotContain(nonSharer.FullName);
    }

    [Fact]
    public async Task Leaderboard_YourRank_ComputedAmongOptedInStudentsOnly()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        student.SetLeaderboardSharing(true);
        var subject = TestDbHelper.GetTestSubject(db);
        var question = TestDbHelper.GetTestQuestion(db);

        // The requesting student answers 3/4 correct (75%). A NON-sharing student has a
        // perfect score — the requesting student's rank must ignore them: rank 1, not 2.
        AddStudentWithAttempts(db, question.Id, correct: 4, wrong: 0, shares: false);
        for (var i = 0; i < 3; i++)
            db.AttemptLogs.Add(new AttemptLog
            {
                StudentId = student.Id, QuestionId = question.Id,
                IsCorrect = true, IsFirstAttempt = true, AttemptNumber = 1
            });
        db.AttemptLogs.Add(new AttemptLog
        {
            StudentId = student.Id, QuestionId = question.Id,
            IsCorrect = false, IsFirstAttempt = true, AttemptNumber = 1
        });
        await db.SaveChangesAsync();

        var cache = new Mock<ICacheService>(MockBehavior.Loose);
        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        entitlements.Setup(svc => svc.CanAccessSubjectAsync(student.Id, subject.Id, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var handler = new StatsHandlers(db, cache.Object, entitlements.Object);
        var result = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100),
            CancellationToken.None);

        result.YourRank.Should().NotBeNull();
        result.YourRank!.Rank.Should().Be(1);
        result.YourRank.IsYou.Should().BeTrue();
        result.YourRank.QuestionsAnswered.Should().Be(4);
        // The perfect-score non-sharer is invisible: the requesting student is the only entry.
        result.TopStudents.Should().ContainSingle();
    }

    [Fact]
    public void LeaderboardEntryDto_DoesNotExposeStudentId()
    {
        // D3: StudentId must not ride the wire contract — entries are anonymous
        // except for display fields and IsYou.
        typeof(LeaderboardEntryDto).GetProperty("StudentId").Should().BeNull();
    }

    // ===== W15.5a: version-based cache invalidation (DEBT-LEADERBOARD-CACHE-INVALIDATE) =====

    /// <summary>
    /// A real dictionary-backed cache (OfflineHttpCache pattern): GetAsync serves a
    /// stored entry verbatim, so a cache HIT is observable — unlike the Loose Moq cache
    /// used elsewhere, which misses forever. Only a version bump (new cache key) can
    /// force the refetch asserted below.
    /// </summary>
    private sealed class DictionaryCache : ICacheService
    {
        public readonly System.Collections.Concurrent.ConcurrentDictionary<string, object?> Stored = new();

        public Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
            => Task.FromResult(Stored.TryGetValue(key, out var value) && value is T typed ? typed : default);
        public Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default)
        {
            Stored.TryRemove(key, out var value);
            return Task.FromResult(value is T typed ? typed : default);
        }
        public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default)
        {
            Stored[key] = value;
            return Task.CompletedTask;
        }
        public Task<long> IncrementAsync(string key, TimeSpan? expiry = null, CancellationToken ct = default)
            => Task.FromResult((long)Stored.AddOrUpdate(key, 1L, (_, v) => v is long n ? n + 1 : 1L));
        public Task RemoveAsync(string key, CancellationToken ct = default)
        {
            Stored.TryRemove(key, out _);
            return Task.CompletedTask;
        }
        public Task RemoveByPatternAsync(string pattern, CancellationToken ct = default)
        {
            foreach (var key in Stored.Keys.Where(k => k.Contains(pattern.Trim('*'))))
                Stored.TryRemove(key, out _);
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task Leaderboard_InvalidateCache_BumpsVersion_AndNextQuerySeesFreshData()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        student.SetLeaderboardSharing(true);
        var subject = TestDbHelper.GetTestSubject(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var sharer = AddStudentWithAttempts(db, question.Id, correct: 3, wrong: 0, shares: true);
        await db.SaveChangesAsync();

        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        entitlements.Setup(svc => svc.CanAccessSubjectAsync(student.Id, subject.Id, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var cache = new DictionaryCache();
        var handler = new StatsHandlers(db, cache, entitlements.Object);

        // First query caches the leaderboard under leaderboard:v{N}:...
        var first = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100),
            CancellationToken.None);
        first.TopStudents.Select(e => e.StudentName).Should().Contain(sharer.FullName);

        // The peer opts out (direct DB write here; the endpoint path is covered by
        // LeaderboardSharingEndpointTests) and the cache version is bumped. The next
        // query must reflect the change IMMEDIATELY — without the bump the 60s TTL
        // would serve the stale entry containing the peer.
        sharer.SetLeaderboardSharing(false);
        await db.SaveChangesAsync();
        StatsHandlers.InvalidateLeaderboardCache();

        var second = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100),
            CancellationToken.None);
        second.TopStudents.Select(e => e.StudentName).Should().NotContain(sharer.FullName);

        // Two distinct versioned keys were stored: the bump produced a NEW key rather
        // than overwriting the old one (old entries simply expire via TTL).
        cache.Stored.Keys.Should().HaveCount(2);
        cache.Stored.Keys.Should().OnlyContain(k => k.StartsWith("leaderboard:v"));
        cache.Stored.Keys.Should().OnlyContain(k => k.Contains(":subject:"));
    }
}
