using System.Reflection;
using System.Security.Claims;
using CMS.Api.Controllers;
using CMS.Application.Commands.Stats;
using CMS.Application.DTOs.Profile;
using CMS.Application.Handlers.Stats;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Moq;

namespace CMS.Tests.Unit.Controllers;

/// <summary>
/// W15.4.4.0a — GET/PUT /api/v1/profile/leaderboard-sharing: the mutual-sharing
/// consent toggle (D2/D4). Pure controller unit tests (CoursesControllerProblemDetailsTests
/// pattern): in-memory DbContext, the real SecurityService over mocked cache/batch,
/// claims injected via a DefaultHttpContext principal.
/// </summary>
public sealed class LeaderboardSharingEndpointTests
{
    private static StudentProfileController ControllerFor(ApplicationDbContext db, Guid? studentId)
    {
        var security = new SecurityService(
            db,
            new Mock<ICacheService>().Object,
            new Mock<ISecurityEventBatch>().Object,
            new CorrelationContext(),
            new ConfigurationBuilder().Build());

        var claims = studentId is { } id
            ? new[] { new Claim("sub", id.ToString()) }
            : Array.Empty<Claim>();
        return new StudentProfileController(
            db,
            db,
            new Mock<IFileStorageService>().Object,
            security,
            new Mock<ILogger<StudentProfileController>>().Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test")),
                },
            },
        };
    }

    [Fact]
    public async Task Get_ReturnsDefaultFalseForSeededStudent()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);

        var action = await ControllerFor(db, student.Id).GetLeaderboardSharing(CancellationToken.None);

        var ok = action.Result.Should().BeOfType<OkObjectResult>().Subject;
        ok.Value.Should().BeOfType<LeaderboardSharingDto>()
            .Which.SharesLeaderboard.Should().BeFalse();
    }

    [Fact]
    public async Task Put_True_PersistsEchoesAndAudits()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);

        var action = await ControllerFor(db, student.Id)
            .SetLeaderboardSharing(new SetLeaderboardSharingRequest(true), CancellationToken.None);

        var ok = action.Result.Should().BeOfType<OkObjectResult>().Subject;
        ok.Value.Should().BeOfType<LeaderboardSharingDto>()
            .Which.SharesLeaderboard.Should().BeTrue();
        (await db.Students.AsNoTracking().SingleAsync(s => s.Id == student.Id))
            .SharesLeaderboard.Should().BeTrue();
        // UpdateProfile pattern: SecurityAlert/Warning persists immediately to the Audit Center.
        (await db.SecurityLogs.CountAsync(
            log => log.StudentId == student.Id && log.EventType == SecurityEventType.SecurityAlert))
            .Should().Be(1);
    }

    [Fact]
    public async Task Put_False_PersistsAndEchoesFalse()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        student.SetLeaderboardSharing(true);
        await db.SaveChangesAsync();

        var action = await ControllerFor(db, student.Id)
            .SetLeaderboardSharing(new SetLeaderboardSharingRequest(false), CancellationToken.None);

        var ok = action.Result.Should().BeOfType<OkObjectResult>().Subject;
        ok.Value.Should().BeOfType<LeaderboardSharingDto>()
            .Which.SharesLeaderboard.Should().BeFalse();
        (await db.Students.AsNoTracking().SingleAsync(s => s.Id == student.Id))
            .SharesLeaderboard.Should().BeFalse();
        // 15.5a (DEBT-LEADERBOARD-AUDIT): an effective toggle OFF is audited too —
        // the UpdateProfile pattern covers BOTH directions of the flip.
        (await db.SecurityLogs.CountAsync(
            log => log.StudentId == student.Id && log.EventType == SecurityEventType.SecurityAlert))
            .Should().Be(1);
    }

    [Fact]
    public async Task Put_NullBodyOrMissingValue_Returns400()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var controller = ControllerFor(db, student.Id);

        (await controller.SetLeaderboardSharing(null, CancellationToken.None))
            .Result.Should().BeOfType<BadRequestObjectResult>();
        (await controller.SetLeaderboardSharing(new SetLeaderboardSharingRequest(null), CancellationToken.None))
            .Result.Should().BeOfType<BadRequestObjectResult>();
        // A rejected request changes nothing.
        (await db.Students.AsNoTracking().SingleAsync(s => s.Id == student.Id))
            .SharesLeaderboard.Should().BeFalse();
    }

    [Fact]
    public async Task Endpoints_RequireAuthenticatedStudent()
    {
        // Class-level [Authorize(Roles = "student")] — same guard as the other profile endpoints.
        var attribute = typeof(StudentProfileController).GetCustomAttribute<AuthorizeAttribute>();
        attribute.Should().NotBeNull();
        attribute!.Roles.Should().Contain("student");

        // Without a resolvable student id the actions return 401 themselves.
        var db = TestDbHelper.CreateInMemoryContext();
        var anonymous = ControllerFor(db, null);
        (await anonymous.GetLeaderboardSharing(CancellationToken.None))
            .Result.Should().BeOfType<UnauthorizedResult>();
        (await anonymous.SetLeaderboardSharing(new SetLeaderboardSharingRequest(true), CancellationToken.None))
            .Result.Should().BeOfType<UnauthorizedResult>();
    }

    [Fact]
    public async Task ToggledOffStudent_VanishesFromLeaderboard_AndCannotViewIt()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);
        var question = TestDbHelper.GetTestQuestion(db);

        // Two opted-in students with attempts in the entitled subject.
        student.SetLeaderboardSharing(true);
        var peer = Student.Create(
            "099" + Random.Shared.Next(1000000, 9999999),
            $"pass_{Guid.NewGuid():N}",
            $"زميل {Guid.NewGuid().ToString()[..8]}");
        peer.SetLeaderboardSharing(true);
        db.Students.Add(peer);
        foreach (var id in new[] { student.Id, peer.Id })
        {
            db.AttemptLogs.Add(new AttemptLog
            {
                StudentId = id, QuestionId = question.Id,
                IsCorrect = true, IsFirstAttempt = true, AttemptNumber = 1
            });
            db.AttemptLogs.Add(new AttemptLog
            {
                StudentId = id, QuestionId = question.Id,
                IsCorrect = false, IsFirstAttempt = true, AttemptNumber = 1
            });
        }
        await db.SaveChangesAsync();

        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        entitlements
            .Setup(svc => svc.CanAccessSubjectAsync(It.IsAny<Guid>(), subject.Id, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        // Loose cache: every GetAsync misses, so both handler calls recompute from the DB.
        var handler = new StatsHandlers(db, new Mock<ICacheService>(MockBehavior.Loose).Object, entitlements.Object);

        var before = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100), CancellationToken.None);
        before.TopStudents.Should().HaveCount(2);

        // The peer opts out through the endpoint…
        await ControllerFor(db, peer.Id)
            .SetLeaderboardSharing(new SetLeaderboardSharingRequest(false), CancellationToken.None);

        // …they vanish from the student's view…
        var after = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100), CancellationToken.None);
        after.TopStudents.Select(e => e.StudentName).Should().NotContain(peer.FullName);
        after.TopStudents.Should().ContainSingle();

        // …and are themselves 403-blocked from viewing the leaderboard (D4 message).
        var act = async () => await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, peer.Id, "all", 100), CancellationToken.None);
        var consentEx = (await act.Should().ThrowAsync<ForbiddenException>()).Which;
        consentEx.Message.Should().Contain("لم تُفعّل المشاركة في لوحة الصدارة");
        consentEx.ErrorCode.Should().Be("LEADERBOARD_NOT_OPTED_IN");
    }

    // ===== W15.5a: version-based cache invalidation (DEBT-LEADERBOARD-CACHE-INVALIDATE) =====

    /// <summary>
    /// A real dictionary-backed cache (OfflineHttpCache pattern): GetAsync serves a
    /// stored entry verbatim, so a cache HIT is observable. Unlike the Loose Moq cache
    /// used by ToggledOffStudent_Vanishes…, only the PUT's version bump can explain the
    /// fresh result asserted below.
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
    public async Task Put_EffectiveToggle_InvalidatesLeaderboardCache_Immediately()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        student.SetLeaderboardSharing(true);
        var subject = TestDbHelper.GetTestSubject(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var peer = Student.Create(
            "099" + Random.Shared.Next(1000000, 9999999),
            $"pass_{Guid.NewGuid():N}",
            $"زميل {Guid.NewGuid().ToString()[..8]}");
        peer.SetLeaderboardSharing(true);
        db.Students.Add(peer);
        foreach (var id in new[] { student.Id, peer.Id })
        {
            db.AttemptLogs.Add(new AttemptLog
            {
                StudentId = id,
                QuestionId = question.Id,
                IsCorrect = true,
                IsFirstAttempt = true,
                AttemptNumber = 1
            });
            db.AttemptLogs.Add(new AttemptLog
            {
                StudentId = id,
                QuestionId = question.Id,
                IsCorrect = false,
                IsFirstAttempt = true,
                AttemptNumber = 1
            });
        }
        await db.SaveChangesAsync();

        var entitlements = new Mock<IEntitlementService>(MockBehavior.Strict);
        entitlements
            .Setup(svc => svc.CanAccessSubjectAsync(It.IsAny<Guid>(), subject.Id, "read", It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        // A REAL cache this time: the first query's entry WOULD be served verbatim on
        // a second hit. Without the version bump performed by the PUT below, the peer
        // would stay visible for the full 60s TTL (the W15.4.4.0a compromise).
        var cache = new DictionaryCache();
        var handler = new StatsHandlers(db, cache, entitlements.Object);

        var before = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100), CancellationToken.None);
        before.TopStudents.Should().HaveCount(2);

        // The peer opts out through the endpoint…
        await ControllerFor(db, peer.Id)
            .SetLeaderboardSharing(new SetLeaderboardSharingRequest(false), CancellationToken.None);

        // …and the very next query (same instant, TTL far from elapsed) reflects it.
        var after = await handler.Handle(
            new GetLeaderboardQuery("subject", subject.Id, student.Id, "all", 100), CancellationToken.None);
        after.TopStudents.Select(e => e.StudentName).Should().NotContain(peer.FullName);
        after.TopStudents.Should().ContainSingle();

        // The PUT bumped the cache version: two distinct versioned keys exist.
        cache.Stored.Keys.Should().HaveCount(2);
        cache.Stored.Keys.Should().OnlyContain(k => k.StartsWith("leaderboard:v"));
    }
}
