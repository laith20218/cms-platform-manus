using CMS.Application.BackgroundJobs;
using CMS.Application.Commands.Courses;
using CMS.Application.Handlers.Courses;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CMS.Tests.Integration;

/// <summary>
/// Push 4 / Track 4 — Postgres-gated contract tests for the courses schema
/// (run on a real Neon branch; skipped locally without CMS_PHASE34_TEST_POSTGRES):
///   • migration contract: courses + course_episodes with the expected shape;
///   • CHECK constraint ck_course_episodes_source (Upload ⇒ file_key NOT NULL);
///   • UNIQUE (course_id, episode_number);
///   • cascade delete of episodes with their course;
///   • full handler round-trip (create → episode → publish → access) on real Postgres
///     through the real EntitlementService.
/// </summary>
[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class CoursesPostgresIntegrationTests
{
    private static async Task<(ApplicationDbContext Db, Subject Subject, Student Student)> PrepareAsync()
    {
        var connectionString = Environment.GetEnvironmentVariable("CMS_PHASE34_TEST_POSTGRES") ?? throw new InvalidOperationException("BLOCKED: set CMS_PHASE34_TEST_POSTGRES.");
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        var db = new ApplicationDbContext(options);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var university = University.Create($"جامعة Courses {suffix}", $"crs-u-{suffix}", "Courses University");
        var college = College.Create(university.Id, "كلية Courses", $"crs-c-{suffix}", "Courses College");
        var year = AcademicYear.Create(college.Id, "سنة Courses", $"crs-y-{suffix}", 1);
        var semester = Semester.Create(year.Id, "فصل Courses", $"crs-s-{suffix}", 1);
        var subject = Subject.Create(semester.Id, "مادة Courses", $"crs-sub-{suffix}", "Courses Subject");
        var student = Student.Create($"09{Random.Shared.Next(10_000_000, 99_999_999)}", "courses-pg-hash", "Courses PG Student");
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();
        db.AddRange(university, college, year, semester, subject, student);
        await db.SaveChangesAsync();
        return (db, subject, student);
    }

    private static CourseHandlers BuildHandlers(ApplicationDbContext db) => new(
        db,
        new UnitOfWork(db),
        new Mock<IFileStorageService>().Object,
        new EntitlementService(db),
        new Mock<ISystemSettingsService>().Object,
        NoOp.ActivityWriter(),
        NullLogger<CourseHandlers>.Instance,
        new TranscodingChannelQueue()); // Push 10.3: inert queue — nothing consumes jobs in tests

    [Fact]
    public async Task MigrationContract_CoursesTablesExist_WithConstraints()
    {
        var (db, subject, _) = await PrepareAsync();
        await using (db)
        {
            var course = new Course { SubjectId = subject.Id, Title = "كورس عقد المخطط", Status = ContentStatus.Draft };
            db.Courses.Add(course);
            await db.SaveChangesAsync();

            var stored = await db.Courses.AsNoTracking().SingleAsync(c => c.Id == course.Id);
            stored.Title.Should().Be("كورس عقد المخطط");
            stored.Status.Should().Be(ContentStatus.Draft);

            // CHECK constraint: YouTube episode without file_key is fine …
            var youtube = new CourseEpisode { CourseId = course.Id, Title = "يوتيوب", EpisodeNumber = 1, SourceType = CourseEpisodeSource.YouTube, YoutubeVideoId = "abc" };
            db.CourseEpisodes.Add(youtube);
            await db.SaveChangesAsync();

            // … but an Upload episode WITHOUT file_key violates ck_course_episodes_source
            var invalid = new CourseEpisode { CourseId = course.Id, Title = "بلا مفتاح", EpisodeNumber = 2, SourceType = CourseEpisodeSource.Upload, FileKey = null! };
            db.CourseEpisodes.Add(invalid);
            var act = () => db.SaveChangesAsync();
            await act.Should().ThrowAsync<Exception>().Where(ex =>
                ex.Message.Contains("ck_course_episodes_source") ||
                (ex.InnerException != null && ex.InnerException.Message.Contains("ck_course_episodes_source")));
            db.Entry(invalid).State = EntityState.Detached;

            // UNIQUE (course_id, episode_number)
            var duplicate = new CourseEpisode { CourseId = course.Id, Title = "مكرر", EpisodeNumber = 1, SourceType = CourseEpisodeSource.YouTube, YoutubeVideoId = "xyz" };
            db.CourseEpisodes.Add(duplicate);
            var dup = () => db.SaveChangesAsync();
            await dup.Should().ThrowAsync<Exception>().Where(ex =>
                ex.Message.Contains("ix_course_episodes_course_id_episode_number") ||
                (ex.InnerException != null && ex.InnerException.Message.Contains("ix_course_episodes_course_id_episode_number")));
            db.Entry(duplicate).State = EntityState.Detached;

            // Cascade: hard-deleting the course removes its episodes
            var toDelete = await db.Courses.FirstAsync(c => c.Id == course.Id);
            db.Courses.Remove(toDelete);
            await db.SaveChangesAsync();
            (await db.CourseEpisodes.AsNoTracking().CountAsync(e => e.CourseId == course.Id)).Should().Be(0,
                "episodes cascade with their course");
        }
    }

    [Fact]
    public async Task HandlerRoundTrip_OnRealPostgres_CreateEpisodePublishAccess()
    {
        var (db, subject, student) = await PrepareAsync();
        await using (db)
        {
            var handler = BuildHandlers(db);

            // VideoAudio grant for the student over the subject
            db.StudentSubscriptions.Add(new StudentSubscription
            {
                StudentId = student.Id,
                ScopeType = SubscriptionScopeType.Subject,
                ScopeSubjectId = subject.Id,
                ContentScope = SubscriptionContentScope.VideoAudio,
                Status = SubscriptionStatus.Active,
                StartsAt = DateTime.UtcNow.AddMinutes(-1),
                ExpiresAt = DateTime.UtcNow.AddDays(1),
            });
            await db.SaveChangesAsync();

            // 1. create → draft
            var course = await handler.Handle(new CreateCourseCommand(subject.Id, "كورس حقيقي", null, null, Guid.NewGuid()), CancellationToken.None);
            course.Status.Should().Be("Draft");

            // 2. publish before any episode → COURSE_EMPTY
            (await ExpectDomainErrorCode(() => handler.Handle(new PublishCourseCommand(course.Id), CancellationToken.None)))
                .Should().Be("COURSE_EMPTY");

            // 3. YouTube episode then publish
            var episode = await handler.Handle(new AddYouTubeEpisodeCommand(course.Id, "حلقة يوتيوب", 1, 900, "abc123", Guid.NewGuid()), CancellationToken.None);
            var published = await handler.Handle(new PublishCourseCommand(course.Id), CancellationToken.None);
            published.Status.Should().Be("Published");

            // 4. student catalog sees the published course; access returns the embed + watermark
            var catalog = await handler.Handle(new GetSubjectCoursesQuery(student.Id, subject.Id), CancellationToken.None);
            catalog.Should().ContainSingle().Which.EpisodesCount.Should().Be(1);

            var access = await handler.Handle(new GetEpisodeAccessCommand(episode.Id, student.Id), CancellationToken.None);
            access.AccessUrl.Should().StartWith("https://www.youtube.com/embed/abc123");
            access.Watermark.StudentPhone.Should().NotBeNullOrEmpty();

            // 5. a student without the VideoAudio grant gets an empty catalog
            var outsider = Student.Create($"09{Random.Shared.Next(10_000_000, 99_999_999)}", "outsider-hash", "Outsider");
            db.Students.Add(outsider);
            await db.SaveChangesAsync();
            var outsiderCatalog = await handler.Handle(new GetSubjectCoursesQuery(outsider.Id, subject.Id), CancellationToken.None);
            outsiderCatalog.Should().BeEmpty("no VideoAudio grant ⇒ no course visibility");
        }
    }

    private static async Task<string> ExpectDomainErrorCode(Func<Task> act)
    {
        try { await act(); }
        catch (DomainException ex) { return ex.ErrorCode; }
        throw new InvalidOperationException("expected a DomainException but the call succeeded");
    }
}
