using CMS.Application.BackgroundJobs;
using CMS.Application.Commands.Courses;
using CMS.Application.DTOs.Courses;
using CMS.Application.Handlers.Courses;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// PR-5 — course (video course) lifecycle completion + the object-retention contract:
///  • unpublish reverts a Published course to Draft (episodes/blobs untouched);
///  • duplicate copies the metadata as a fresh Draft with its own public code and
///    deliberately NO episodes (an upload episode owns its stored blob — a copied row
///    would make two courses co-own one physical object);
///  • restore returns an Archived course to Draft;
///  • usage reports real episode counts/views/favorites/in-flight uploads;
///  • a NORMAL course/episode delete must NEVER physically delete the stored blobs
///    (the pre-PR-5 hidden blob cleanup inside the CRUD handlers is gone — retention
///    first, final deletion is a separate approved operation).
/// </summary>
public sealed class CourseLifecycleAdminHandlerTests
{
    private sealed class RecordingActivityWriter : IAdminActivityWriter
    {
        public List<(AdminActivityActionType Action, string? ResourceId)> Actions { get; } = new();

        public Task LogAsync(Guid adminId, AdminActivityActionType actionType, string? resourceId = null, object? metadata = null, Guid? sessionId = null, CancellationToken ct = default)
        {
            Actions.Add((actionType, resourceId));
            return Task.CompletedTask;
        }
    }

    private static (CourseHandlers Handler, Mock<IFileStorageService> Storage, RecordingActivityWriter Activity) Create(ApplicationDbContext db)
    {
        var storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        var settings = new Mock<ISystemSettingsService>();
        settings.Setup(service => service.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);
        var activity = new RecordingActivityWriter();
        var handler = new CourseHandlers(
            db,
            new UnitOfWork(db),
            storage.Object,
            Mock.Of<IEntitlementService>(),
            settings.Object,
            activity,
            NullLogger<CourseHandlers>.Instance,
            new TranscodingChannelQueue(),
            new TranscodingJobRegistry());
        return (handler, storage, activity);
    }

    private static async Task<Course> SeedCourseAsync(ApplicationDbContext db, ContentStatus status = ContentStatus.Draft)
    {
        var subject = db.Subjects.First();
        var course = new Course { SubjectId = subject.Id, Title = "كورس الباطنة الشامل", Status = status };
        db.Courses.Add(course);
        await db.SaveChangesAsync();
        return course;
    }

    private static async Task<CourseEpisode> SeedUploadEpisodeAsync(ApplicationDbContext db, Course course, string fileKey, int views = 0)
    {
        var episode = new CourseEpisode
        {
            CourseId = course.Id,
            Title = "حلقة مرفوعة",
            EpisodeNumber = 1,
            FileKey = fileKey,
            FileSize = 2048,
            ContentType = "video/mp4",
            SourceType = CourseEpisodeSource.Upload,
            ViewsCount = views,
        };
        db.CourseEpisodes.Add(episode);
        await db.SaveChangesAsync();
        return episode;
    }

    // ===== Unpublish =====

    [Fact]
    public async Task Unpublish_RevertsPublishedCourseToDraft_LeavesEpisodesUntouched()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        await SeedUploadEpisodeAsync(db, course, "courses/c1/e1");
        var (handler, _, activity) = Create(db);

        var result = await handler.Handle(new UnpublishCourseCommand(course.Id, db.Admins.First().Id), CancellationToken.None);

        result.Status.Should().Be(nameof(ContentStatus.Draft));
        db.Courses.AsNoTracking().Single(c => c.Id == course.Id).Status.Should().Be(ContentStatus.Draft);
        db.CourseEpisodes.AsNoTracking().Count(e => e.CourseId == course.Id && e.DeletedAt == null)
            .Should().Be(1, "unpublish never touches episodes");
        activity.Actions.Should().Contain(a => a.Action == AdminActivityActionType.UpdateCourse);
    }

    [Fact]
    public async Task Unpublish_NonPublishedCourse_IsRefused()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Draft);
        var (handler, _, _) = Create(db);

        var act = () => handler.Handle(new UnpublishCourseCommand(course.Id, db.Admins.First().Id), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.ErrorCode == "COURSE_NOT_PUBLISHED");
    }

    // ===== Duplicate =====

    [Fact]
    public async Task Duplicate_CopiesMetadataAsFreshDraft_WithOwnPublicCode_NoEpisodes()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var source = new Course
        {
            SubjectId = subject.Id, Title = "كورس الأصل", Description = "وصف",
            CoverImageUrl = "https://cdn.example/cover.jpg", Status = ContentStatus.Published,
        };
        source.AssignPublicCode("111111");
        db.Courses.Add(source);
        await db.SaveChangesAsync();
        await SeedUploadEpisodeAsync(db, source, "courses/d1/e1");
        var (handler, _, _) = Create(db);

        var copy = await handler.Handle(new DuplicateCourseCommand(source.Id, db.Admins.First().Id), CancellationToken.None);

        var storedCopy = db.Courses.AsNoTracking().Single(c => c.Id == copy.Id);
        storedCopy.Status.Should().Be(ContentStatus.Draft, "the duplicate always starts as a Draft");
        storedCopy.Title.Should().Be("كورس الأصل");
        storedCopy.Description.Should().Be("وصف");
        storedCopy.SubjectId.Should().Be(subject.Id);
        storedCopy.PublicCode.Should().NotBe("111111", "the copy gets its own unique public code");
        db.CourseEpisodes.AsNoTracking().Count(e => e.CourseId == copy.Id).Should().Be(0,
            "episodes are deliberately NOT copied — an upload episode owns its stored blob; two rows must never co-own one physical object");
        db.CourseEpisodes.AsNoTracking().Count(e => e.CourseId == source.Id && e.DeletedAt == null).Should().Be(1,
            "the source keeps its episodes");
    }

    // ===== Restore =====

    [Fact]
    public async Task Restore_ArchivedCourse_ReturnsToDraft()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Archived);
        var (handler, _, _) = Create(db);

        await handler.Handle(new RestoreCourseCommand(course.Id, db.Admins.First().Id), CancellationToken.None);

        db.Courses.AsNoTracking().Single(c => c.Id == course.Id).Status
            .Should().Be(ContentStatus.Draft, "restore returns the course to Draft — republish re-runs COURSE_EMPTY");
    }

    [Fact]
    public async Task Restore_NonArchivedCourse_IsRefused()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        var (handler, _, _) = Create(db);

        var act = () => handler.Handle(new RestoreCourseCommand(course.Id, db.Admins.First().Id), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.ErrorCode == "COURSE_NOT_ARCHIVED");
    }

    // ===== Usage summary =====

    [Fact]
    public async Task Usage_ReportsRealEpisodeCountsViewsFavoritesAndInFlightUploads()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        var episode1 = await SeedUploadEpisodeAsync(db, course, "courses/u1/e1", views: 120);
        await SeedUploadEpisodeAsync(db, course, "courses/u1/e2", views: 80);
        var episode3 = new CourseEpisode
        {
            CourseId = course.Id, Title = "حلقة يوتيوب", EpisodeNumber = 3,
            SourceType = CourseEpisodeSource.YouTube, YoutubeVideoId = "abc123", ViewsCount = 40,
        };
        db.CourseEpisodes.Add(episode3);
        // A soft-deleted episode must not count.
        var dead = new CourseEpisode
        {
            CourseId = course.Id, Title = "محذوفة", EpisodeNumber = 4,
            SourceType = CourseEpisodeSource.YouTube, YoutubeVideoId = "xyz", ViewsCount = 999,
        };
        db.CourseEpisodes.Add(dead);
        await db.SaveChangesAsync();
        typeof(CourseEpisode).GetProperty("DeletedAt")?.SetValue(dead, DateTime.UtcNow);
        // An in-flight upload marker on a live episode.
        typeof(CourseEpisode).GetProperty(nameof(CourseEpisode.UploadId))
            ?.SetValue(episode1, CourseHandlers.SinglePutUploadId);
        await db.SaveChangesAsync();
        var student = TestDbHelper.GetTestStudent(db);
        db.Favorites.Add(new Favorite { StudentId = student.Id, CourseEpisodeId = episode1.Id });
        db.Favorites.Add(new Favorite { StudentId = student.Id, CourseEpisodeId = episode3.Id });
        await db.SaveChangesAsync();
        var (handler, _, _) = Create(db);

        var usage = await handler.Handle(new GetCourseUsageQuery(course.Id), CancellationToken.None);

        usage.EpisodesCount.Should().Be(3, "the soft-deleted episode is excluded");
        usage.TotalEpisodeViews.Should().Be(240, "120 + 80 + 40 — views across live episodes only");
        usage.EpisodeFavorites.Should().Be(2);
        usage.HasInFlightUploads.Should().BeTrue("one live episode still carries its upload marker");
    }

    // ===== Object-retention contract on normal deletes =====

    [Fact]
    public async Task DeleteCourse_NeverPhysicallyDeletesEpisodeBlobs()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        await SeedUploadEpisodeAsync(db, course, "courses/del/e1");
        var (handler, storage, _) = Create(db);

        await handler.Handle(new DeleteCourseCommand(course.Id, db.Admins.First().Id), CancellationToken.None);

        // Strict storage mock without any setup: any storage call (DeleteAsync,
        // AbortMultipartUploadAsync, …) fails the test — the normal delete path must
        // never reach storage.
        var stored = db.Courses.AsNoTracking().Single(c => c.Id == course.Id);
        stored.DeletedAt.Should().NotBeNull("the row survives as the tombstone");
        stored.Status.Should().Be(ContentStatus.Deleted);
    }

    [Fact]
    public async Task DeleteEpisode_NeverPhysicallyDeletesTheStoredBlob()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/del/e-only");
        var (handler, storage, _) = Create(db);

        await handler.Handle(new DeleteEpisodeCommand(episode.Id, db.Admins.First().Id), CancellationToken.None);

        var stored = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id);
        stored.DeletedAt.Should().NotBeNull("the row survives as the tombstone");
        // Strict storage mock without any setup: a DeleteAsync call would throw —
        // the pre-PR-5 hidden blob deletion inside this CRUD handler is gone.
    }
}
