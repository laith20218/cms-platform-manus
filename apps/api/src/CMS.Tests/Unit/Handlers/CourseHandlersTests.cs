using CMS.Application.BackgroundJobs;
using System.Text.RegularExpressions;
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
/// Push 4 / Track 4 — course + episode business rules:
///   • course CRUD with ContentStatus lifecycle (د2) and course-level publishing (د3)
///     that requires at least one completed episode;
///   • multipart orchestration: MIME allow-list, per-type ceiling (settings-driven with
///     hardcoded fallback), 64 MB part math (د4), resume via ListParts, defense-in-depth
///     actual-size verification at complete-upload, abort + row cleanup;
///   • student access: VideoAudio content scope, upload-incomplete refusal, watermark
///     envelope, YouTube embed passthrough, best-effort view counting (د5).
/// </summary>
public sealed class CourseHandlersTests
{
    private const long PartSize = 64L * 1024 * 1024;

    private static (CourseHandlers Handler, Mock<IFileStorageService> Storage, Mock<IEntitlementService> Entitlements, Mock<ISystemSettingsService> Settings, RecordingActivityWriter Activity) Create(
        ApplicationDbContext db, Mock<ISystemSettingsService>? settings = null, IUnitOfWork? unitOfWork = null)
    {
        var storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>();
        var settingsService = settings ?? new Mock<ISystemSettingsService>();
        if (settings is null)
            settingsService.Setup(service => service.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((string?)null); // missing keys exercise the hardcoded 2560 MB fallback
        var activity = new RecordingActivityWriter();
        var handler = new CourseHandlers(
            db,
            unitOfWork ?? new UnitOfWork(db),
            storage.Object,
            entitlements.Object,
            settingsService.Object,
            activity,
            NullLogger<CourseHandlers>.Instance,
            new TranscodingChannelQueue(), // Push 10.3: real inert queue — jobs buffer, nothing consumes them in tests
            new TranscodingJobRegistry()); // Push 10.8: inert abort registry — no live jobs to cancel in tests
        return (handler, storage, entitlements, settingsService, activity);
    }

    private static async Task<Course> SeedCourseAsync(ApplicationDbContext db, ContentStatus status = ContentStatus.Draft)
    {
        var subject = db.Subjects.First();
        var course = new Course { SubjectId = subject.Id, Title = "كورس الباطنة الشامل", Status = status };
        db.Courses.Add(course);
        await db.SaveChangesAsync();
        return course;
    }

    private static async Task<CourseEpisode> SeedUploadEpisodeAsync(ApplicationDbContext db, Course course, string fileKey,
        string? uploadId = null, long fileSize = 1024, int episodeNumber = 1)
    {
        var episode = new CourseEpisode
        {
            CourseId = course.Id,
            Title = "الحلقة الأولى",
            EpisodeNumber = episodeNumber,
            SourceType = CourseEpisodeSource.Upload,
            FileKey = fileKey,
            FileSize = fileSize,
            ContentType = "video/mp4",
            UploadId = uploadId,
        };
        db.CourseEpisodes.Add(episode);
        await db.SaveChangesAsync();
        return episode;
    }

    /// <summary>Soft-deletes a seeded episode — a "ghost" that still holds its number in the hard unique index.</summary>
    private static async Task GhostifyAsync(ApplicationDbContext db, CourseEpisode episode)
    {
        episode.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    // ===== Course CRUD =====

    [Fact]
    public async Task CreateCourse_UnknownSubject_NotFound()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (handler, _, _, _, _) = Create(db);

        var act = () => handler.Handle(new CreateCourseCommand(Guid.NewGuid(), "عنوان", null, null, Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task CreateCourse_CreatesDraft_AndLogsActivity()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var admin = db.Admins.First();
        var (handler, _, _, _, activity) = Create(db);

        var course = await handler.Handle(new CreateCourseCommand(subject.Id, "كورس تشريح", "وصف", "https://cover", admin.Id), CancellationToken.None);

        course.Status.Should().Be("Draft");
        course.Episodes.Should().BeEmpty();
        activity.Actions.Should().ContainSingle(entry => entry.Action == AdminActivityActionType.CreateCourse);
        db.Courses.AsNoTracking().Single(stored => stored.Id == course.Id).Status.Should().Be(ContentStatus.Draft);
    }

    [Fact]
    public async Task PublishCourse_EmptyCourse_RejectedWithCOURSE_EMPTY()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var (handler, _, _, _, _) = Create(db);

        var act = () => handler.Handle(new PublishCourseCommand(course.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("COURSE_EMPTY");
    }

    [Fact]
    public async Task PublishCourse_WithCompletedEpisode_Succeeds()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: null);
        var (handler, _, _, _, _) = Create(db);

        var published = await handler.Handle(new PublishCourseCommand(course.Id), CancellationToken.None);

        published.Status.Should().Be("Published");
    }

    [Fact]
    public async Task PublishCourse_OnlyIncompleteEpisodes_Rejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: "mpu-inflight");
        var (handler, _, _, _, _) = Create(db);

        var act = () => handler.Handle(new PublishCourseCommand(course.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("COURSE_EMPTY",
            "an episode whose multipart upload never completed cannot satisfy the publish requirement");
    }

    [Fact]
    public async Task DeleteCourse_SoftDeletes_AbortsInFlightUploads_AndCleansBlobs()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var inFlight = await SeedUploadEpisodeAsync(db, course, "courses/a/inflight", uploadId: "mpu-1");
        var ready = await SeedUploadEpisodeAsync(db, course, "courses/b/ready", uploadId: null);
        var youtube = new CourseEpisode { CourseId = course.Id, Title = "يوتيوب", EpisodeNumber = 3, SourceType = CourseEpisodeSource.YouTube, YoutubeVideoId = "abc123" };
        db.CourseEpisodes.Add(youtube);
        await db.SaveChangesAsync();
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.AbortMultipartUploadAsync("courses/a/inflight", "mpu-1", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        storage.Setup(s => s.DeleteAsync("courses/a/inflight", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        storage.Setup(s => s.DeleteAsync("courses/b/ready", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await handler.Handle(new DeleteCourseCommand(course.Id, Guid.NewGuid()), CancellationToken.None);

        db.Courses.AsNoTracking().Single(stored => stored.Id == course.Id).DeletedAt.Should().NotBeNull();
        storage.Verify(s => s.AbortMultipartUploadAsync("courses/a/inflight", "mpu-1", It.IsAny<CancellationToken>()), Times.Once);
        storage.Verify(s => s.DeleteAsync("courses/b/ready", It.IsAny<CancellationToken>()), Times.Once,
            "completed blobs are removed best-effort");
        storage.Verify(s => s.DeleteAsync("courses/a/inflight", It.IsAny<CancellationToken>()), Times.Once,
            "the in-flight key's object is also cleaned");
        storage.VerifyNoOtherCalls();
        _ = inFlight; _ = ready;
    }

    // ===== Episode CRUD =====

    [Fact]
    public async Task AddYouTubeEpisode_DuplicateNumber_Rejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var (handler, _, _, _, _) = Create(db);
        await handler.Handle(new AddYouTubeEpisodeCommand(course.Id, "حلقة يوتيوب", 1, 600, "vid1", Guid.NewGuid()), CancellationToken.None);

        var act = () => handler.Handle(new AddYouTubeEpisodeCommand(course.Id, "حلقة أخرى", 1, 300, "vid2", Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("EPISODE_NUMBER_TAKEN");
    }

    [Fact]
    public async Task AddYouTubeEpisode_YouTubeEpisodeNeedsNoFileKey()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var (handler, _, _, _, _) = Create(db);

        var episode = await handler.Handle(new AddYouTubeEpisodeCommand(course.Id, "حلقة يوتيوب", 1, 600, "dQw4w9WgXcQ", Guid.NewGuid()), CancellationToken.None);

        episode.SourceType.Should().Be("YouTube");
        episode.UploadCompleted.Should().BeTrue("YouTube episodes are immediately playable");
        episode.YoutubeVideoId.Should().Be("dQw4w9WgXcQ");
    }

    // ===== Multipart orchestration =====

    [Fact]
    public async Task InitiateUpload_RejectsDocumentMime()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var (handler, _, _, _, _) = Create(db);

        var act = () => handler.Handle(new InitiateEpisodeUploadCommand(
            course.Id, "notes.pdf", "application/pdf", 1024, "ملف", 1, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("INVALID_FILE_TYPE",
            "documents belong to the library, not course episodes");
    }

    [Fact]
    public async Task InitiateUpload_RejectsOversize_WithSettingsDrivenCeiling()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var settings = new Mock<ISystemSettingsService>();
        settings.Setup(s => s.GetAsync("upload.limit.video_mb", It.IsAny<CancellationToken>())).ReturnsAsync("512");
        var (handler, _, _, _, _) = Create(db, settings);

        var act = () => handler.Handle(new InitiateEpisodeUploadCommand(
            course.Id, "huge.mp4", "video/mp4", 513L * 1024 * 1024, "فيديو ضخم", 1, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("FILE_TOO_LARGE");
    }

    [Fact]
    public async Task InitiateUpload_PresignsParts_With64MbMath()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.InitiateMultipartUploadAsync(It.IsAny<string>(), "video/mp4", It.IsAny<CancellationToken>()))
            .ReturnsAsync("mpu-42");
        storage.Setup(s => s.PresignUploadPartAsync(It.IsAny<string>(), "mpu-42", It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string key, string uploadId, int partNumber, TimeSpan ttl, CancellationToken _) => $"https://r2/part{partNumber}");

        // 130 MB → ceil(130/64) = 3 parts
        var initiate = await handler.Handle(new InitiateEpisodeUploadCommand(
            course.Id, "lesson.mp4", "video/mp4", 130L * 1024 * 1024, "الدرس الأول", 1, Guid.NewGuid()), CancellationToken.None);

        initiate.PartSizeBytes.Should().Be((int)PartSize);
        initiate.PartCount.Should().Be(3);
        initiate.PartUrls.Should().HaveCount(3).And.ContainInOrder("https://r2/part1", "https://r2/part2", "https://r2/part3");
        initiate.UploadId.Should().Be("mpu-42");
        var episode = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == initiate.EpisodeId);
        episode.FileSize.Should().Be(130L * 1024 * 1024, "declared size is stored until complete-upload verifies the actual size");
        episode.UploadId.Should().Be("mpu-42");
        episode.FileKey.Should().StartWith($"courses/{course.Id}/", "keys are server-generated and course-scoped");
    }

    [Fact]
    public async Task MultipartStatus_ReturnsStoredParts_AndPresignsOnlyPending()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: "mpu-7", fileSize: 130L * 1024 * 1024);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.ListMultipartPartsAsync("courses/x/y", "mpu-7", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<UploadedPartInfo> { new(1, PartSize, "etag-1") });
        storage.Setup(s => s.PresignUploadPartAsync("courses/x/y", "mpu-7", It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string key, string uploadId, int partNumber, TimeSpan ttl, CancellationToken _) => $"https://r2/resume{partNumber}");

        var status = await handler.Handle(new GetMultipartStatusQuery(episode.Id), CancellationToken.None);

        status.UploadedParts.Should().ContainSingle().Which.PartNumber.Should().Be(1);
        status.PendingPartUrls.Should().HaveCount(2).And.ContainInOrder("https://r2/resume2", "https://r2/resume3");
    }

    [Fact]
    public async Task MultipartStatus_NoActiveUpload_ReturnsGracefulInactiveStatus()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        // Episode completed earlier — UploadId cleared (blob ready for playback).
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: null);
        var (handler, storage, _, _, _) = Create(db);

        // Hotfix 10.6 (1.D): a status poll racing the upload lifecycle must answer
        // gracefully — the OLD behavior threw 400 NO_ACTIVE_UPLOAD and froze the UI.
        var status = await handler.Handle(new GetMultipartStatusQuery(episode.Id), CancellationToken.None);

        status.HasActiveUpload.Should().BeFalse("completed uploads report no live session");
        status.EpisodeId.Should().Be(episode.Id);
        status.UploadId.Should().BeEmpty();
        status.UploadedParts.Should().BeEmpty();
        status.PendingPartUrls.Should().BeEmpty();
        storage.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task MultipartStatus_EpisodeGone_ReturnsGracefulInactiveStatus()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var (handler, storage, _, _, _) = Create(db);

        // Aborted upload → row deleted; polling its id must not 404/400 the panel.
        var status = await handler.Handle(new GetMultipartStatusQuery(Guid.NewGuid()), CancellationToken.None);

        status.HasActiveUpload.Should().BeFalse("a missing episode row means no live session");
        status.UploadedParts.Should().BeEmpty();
        status.PendingPartUrls.Should().BeEmpty();
        storage.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task MultipartStatus_UploadGoneUpstream_ReturnsGracefulInactiveStatus()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: "mpu-dead");
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.ListMultipartPartsAsync("courses/x/y", "mpu-dead", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Amazon.S3.AmazonS3Exception(
                "The specified upload does not exist. The upload ID may be invalid, or the upload may have been aborted or completed."));

        // R2 reports NoSuchUpload (session aborted/expired upstream while UploadId
        // lingered) — must degrade to the inactive answer, not a 500.
        var status = await handler.Handle(new GetMultipartStatusQuery(episode.Id), CancellationToken.None);

        status.HasActiveUpload.Should().BeFalse("an upstream NoSuchUpload is a dead session");
        status.UploadedParts.Should().BeEmpty();
        status.PendingPartUrls.Should().BeEmpty();
        storage.Verify(s => s.PresignUploadPartAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Never,
            "presigning part URLs against a dead upload session only hands the browser URLs that cannot work");
    }

    [Fact]
    public async Task CompleteUpload_BlankEtag_RejectedWithInvalidParts()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: "mpu-blank");
        var (handler, storage, _, _, _) = Create(db);

        // Hotfix 10.6: blank ETags (browser CORS masked the header) must fail fast
        // with a clear 400 — not an opaque upstream 500 at CompleteMultipartUpload.
        var act = () => handler.Handle(new CompleteEpisodeUploadCommand(episode.Id,
            new List<CompletedPartDto> { new(1, " ") }), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("INVALID_PARTS");
        storage.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task CompleteUpload_VerifiesActualSize_OverLimit_AbortsDeletesRowAndFails()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: "mpu-9", fileSize: 100);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.CompleteMultipartUploadAsync("courses/x/y", "mpu-9", It.IsAny<IReadOnlyList<CompletedPart>>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        storage.Setup(s => s.GetObjectSizeAsync("courses/x/y", It.IsAny<CancellationToken>()))
            .ReturnsAsync(3000L * 1024 * 1024); // actual object is ~3 GB — exceeds the 2560 MB default ceiling
        storage.Setup(s => s.DeleteAsync("courses/x/y", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        storage.Setup(s => s.AbortMultipartUploadAsync("courses/x/y", "mpu-9", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var act = () => handler.Handle(new CompleteEpisodeUploadCommand(episode.Id,
            new List<CompletedPartDto> { new(1, "etag-1") }), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("FILE_TOO_LARGE",
            "the actual assembled object is verified against the ceiling — a lying declared size cannot smuggle an oversized video");
        db.CourseEpisodes.AsNoTracking().Any(e => e.Id == episode.Id).Should().BeFalse("the offending row is removed");
        storage.Verify(s => s.DeleteAsync("courses/x/y", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CompleteUpload_MarksReady_AndLogsActivity()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: "mpu-10", fileSize: 100);
        var (handler, storage, _, _, activity) = Create(db);
        storage.Setup(s => s.CompleteMultipartUploadAsync("courses/x/y", "mpu-10", It.IsAny<IReadOnlyList<CompletedPart>>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        storage.Setup(s => s.GetObjectSizeAsync("courses/x/y", It.IsAny<CancellationToken>()))
            .ReturnsAsync(2048L);

        var completed = await handler.Handle(new CompleteEpisodeUploadCommand(episode.Id,
            new List<CompletedPartDto> { new(1, "etag-1"), new(2, "etag-2") }), CancellationToken.None);

        completed.UploadCompleted.Should().BeTrue();
        completed.FileSize.Should().Be(2048L, "the verified actual size replaces the declared size");
        var stored = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id);
        stored.UploadId.Should().BeNull("upload completion clears the in-flight marker");
        activity.Actions.Should().ContainSingle(entry => entry.Action == AdminActivityActionType.UploadEpisode);
    }

    // ===== Push 10.5 — upload-panel metadata + lifecycle exposure =====

    [Fact]
    public async Task CompleteUpload_SavesUploadPanelMetadata()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/meta/y", uploadId: "mpu-meta", fileSize: 100);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.CompleteMultipartUploadAsync("courses/meta/y", "mpu-meta", It.IsAny<IReadOnlyList<CompletedPart>>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        storage.Setup(s => s.GetObjectSizeAsync("courses/meta/y", It.IsAny<CancellationToken>()))
            .ReturnsAsync(2048L);

        var completed = await handler.Handle(new CompleteEpisodeUploadCommand(episode.Id,
            new List<CompletedPartDto> { new(1, "etag-1") },
            Title: "  الحلقة المعدلة  ",
            Description: "شرح مفصل لمنهج الباطنة",
            Difficulty: Difficulty.Hard), CancellationToken.None);

        completed.Title.Should().Be("الحلقة المعدلة", "the completion-body title overrides the initiate-time one after trimming");
        completed.Description.Should().Be("شرح مفصل لمنهج الباطنة");
        completed.Difficulty.Should().Be(Difficulty.Hard);
        var stored = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id);
        stored.Title.Should().Be("الحلقة المعدلة");
        stored.Description.Should().Be("شرح مفصل لمنهج الباطنة");
        stored.Difficulty.Should().Be(Difficulty.Hard);
        stored.ProcessingStatus.Should().Be(ProcessingStatus.Pending,
            "video completions still enter the FFmpeg pipeline (10.3) with the metadata riding the same commit");
        completed.ProcessingStatus.Should().Be(ProcessingStatus.Pending);
    }

    [Fact]
    public async Task CompleteUpload_WithoutMetadata_KeepsInitiateTimeValues()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/keep/y", uploadId: "mpu-keep", fileSize: 100);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.CompleteMultipartUploadAsync("courses/keep/y", "mpu-keep", It.IsAny<IReadOnlyList<CompletedPart>>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        storage.Setup(s => s.GetObjectSizeAsync("courses/keep/y", It.IsAny<CancellationToken>()))
            .ReturnsAsync(2048L);

        var completed = await handler.Handle(new CompleteEpisodeUploadCommand(episode.Id,
            new List<CompletedPartDto> { new(1, "etag-1") }), CancellationToken.None);

        var stored = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id);
        stored.Title.Should().Be("الحلقة الأولى", "null keys keep the initiate-time title");
        stored.Description.Should().BeNull();
        stored.Difficulty.Should().Be(Difficulty.Easy, "the entity default tier applies when the body omits difficulty");
        completed.Difficulty.Should().Be(Difficulty.Easy);
        completed.ProcessingError.Should().BeNull("technical details ride the DTO only while the pipeline is Failed");
        completed.HlsKey.Should().BeNull();
    }

    // ===== Push 10.8 — TargetQuality enforcement + abort-processing =====

    [Fact]
    public async Task CompleteUpload_Persists_AdminSelectedTargetQuality()
    {
        // The 10.7 production bug: the controller boundary dropped the admin's pick,
        // so the worker read Auto and encoded the full ladder. This guards the
        // handler side of the fixed chain (controller → command → same-commit persist).
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/tq/y", uploadId: "mpu-tq", fileSize: 100);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.CompleteMultipartUploadAsync("courses/tq/y", "mpu-tq", It.IsAny<IReadOnlyList<CompletedPart>>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        storage.Setup(s => s.GetObjectSizeAsync("courses/tq/y", It.IsAny<CancellationToken>()))
            .ReturnsAsync(2048L);

        var completed = await handler.Handle(new CompleteEpisodeUploadCommand(episode.Id,
            new List<CompletedPartDto> { new(1, "etag-1") },
            TargetQuality: TargetQuality.P360), CancellationToken.None);

        completed.TargetQuality.Should().Be(TargetQuality.P360);
        var stored = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id);
        stored.TargetQuality.Should().Be(TargetQuality.P360,
            "the admin's pick rides the SAME commit the enqueue follows, so the worker encodes exactly one 360p rung");
        stored.ProcessingStatus.Should().Be(ProcessingStatus.Pending);
    }

    [Fact]
    public async Task UpdateEpisode_PatchesTargetQuality()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/tqu/y", episodeNumber: 1);
        var (handler, _, _, _, _) = Create(db);

        var updated = await handler.Handle(new UpdateEpisodeCommand(episode.Id, "عنوان", 1, null,
            TargetQuality: TargetQuality.P720), CancellationToken.None);

        updated.TargetQuality.Should().Be(TargetQuality.P720);
        db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id).TargetQuality
            .Should().Be(TargetQuality.P720);
    }

    [Fact]
    public async Task AbortProcessing_StuckEncode_MarkedFailed()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/abort/y", uploadId: "mpu-done", fileSize: 100);
        episode.ProcessingStatus = ProcessingStatus.Transcoding_720p; // the 58% production freeze
        await db.SaveChangesAsync();
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.CompleteMultipartUploadAsync("courses/abort/y", "mpu-done", It.IsAny<IReadOnlyList<CompletedPart>>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        storage.Setup(s => s.GetObjectSizeAsync("courses/abort/y", It.IsAny<CancellationToken>()))
            .ReturnsAsync(2048L);

        var aborted = await handler.Handle(new AbortEpisodeProcessingCommand(episode.Id, Guid.NewGuid()), CancellationToken.None);

        aborted.ProcessingStatus.Should().Be(ProcessingStatus.Failed);
        var stored = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id);
        stored.ProcessingStatus.Should().Be(ProcessingStatus.Failed,
            "abort is terminal — the worker never touches the row again");
    }

    [Theory]
    [InlineData(ProcessingStatus.Ready)]
    [InlineData(ProcessingStatus.Failed)]
    public async Task AbortProcessing_NothingActive_Rejected(ProcessingStatus status)
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/na/y", uploadId: "mpu-na", fileSize: 100);
        episode.ProcessingStatus = status;
        await db.SaveChangesAsync();
        var (handler, _, _, _, _) = Create(db);

        var act = () => handler.Handle(new AbortEpisodeProcessingCommand(episode.Id, Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.ErrorCode == "NO_ACTIVE_PROCESSING");
        db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id).ProcessingStatus
            .Should().Be(status, "a rejected abort never touches the stored status");
    }

    [Fact]
    public async Task AbortProcessing_PendingEpisode_AlsoAbortable()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/pending/y", uploadId: "mpu-p", fileSize: 100);
        episode.ProcessingStatus = ProcessingStatus.Pending;
        await db.SaveChangesAsync();
        var (handler, _, _, _, _) = Create(db);

        var aborted = await handler.Handle(new AbortEpisodeProcessingCommand(episode.Id, Guid.NewGuid()), CancellationToken.None);

        aborted.ProcessingStatus.Should().Be(ProcessingStatus.Failed);
        db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id).ProcessingStatus
            .Should().Be(ProcessingStatus.Failed,
                "a queued-not-started job is killed by the status alone — the worker skips it at dequeue");
    }

    [Fact]
    public void TranscodingJobRegistry_TryCancel_CancelsTheLiveJobOnly()
    {
        // The worker side of the abort bridge: Begin exposes the job's CTS, TryCancel
        // flips it (killing FFmpeg via the linked token), End removes it, and other
        // jobs are never affected.
        var registry = new TranscodingJobRegistry();
        var job = new TranscodingJob(MediaAssetType.CourseEpisode, Guid.NewGuid());
        var other = new TranscodingJob(MediaAssetType.CourseEpisode, Guid.NewGuid());

        registry.TryCancel(job).Should().BeFalse("no live job yet");

        using var cts = new CancellationTokenSource();
        using var otherCts = new CancellationTokenSource();
        registry.Begin(job, cts);
        registry.Begin(other, otherCts);

        registry.TryCancel(job).Should().BeTrue();
        cts.IsCancellationRequested.Should().BeTrue("the live FFmpeg token is cancelled");
        otherCts.IsCancellationRequested.Should().BeFalse("unrelated jobs keep encoding");

        registry.End(job);
        registry.TryCancel(job).Should().BeFalse("the entry never outlives the job");
    }

    [Fact]
    public async Task UpdateEpisode_PatchesOptionalMetadata()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", episodeNumber: 1);
        db.CourseEpisodes.Update(episode);
        episode.Description = "الوصف القديم";
        episode.Difficulty = Difficulty.Medium;
        await db.SaveChangesAsync();
        var (handler, _, _, _, _) = Create(db);

        var updated = await handler.Handle(new UpdateEpisodeCommand(episode.Id, "عنوان جديد", 2, 120,
            Description: "  وصف محدث  ",
            Difficulty: Difficulty.Hard), CancellationToken.None);

        updated.Description.Should().Be("وصف محدث");
        updated.Difficulty.Should().Be(Difficulty.Hard);
        var stored = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id);
        stored.Description.Should().Be("وصف محدث");
        stored.Difficulty.Should().Be(Difficulty.Hard);
    }

    [Fact]
    public async Task UpdateEpisode_AbsentMetadataKeys_LeaveStoredValuesUntouched()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", episodeNumber: 1);
        db.CourseEpisodes.Update(episode);
        episode.Description = "الوصف القديم";
        episode.Difficulty = Difficulty.Hard;
        await db.SaveChangesAsync();
        var (handler, _, _, _, _) = Create(db);

        // Old callers compile against the pre-10.5 signature — PATCH semantics apply.
        var updated = await handler.Handle(new UpdateEpisodeCommand(episode.Id, "عنوان جديد", 2, 120), CancellationToken.None);

        updated.Description.Should().Be("الوصف القديم", "null description leaves the stored value untouched");
        updated.Difficulty.Should().Be(Difficulty.Hard, "null difficulty leaves the stored tier untouched");
    }

    [Fact]
    public async Task GetAdminCourse_ExposesEpisodeMetadataAndLifecycle()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var ready = await SeedUploadEpisodeAsync(db, course, "courses/ready/y", episodeNumber: 1);
        db.CourseEpisodes.Update(ready);
        ready.Description = "شرح مفصل للمنهج";
        ready.Difficulty = Difficulty.Medium;
        ready.ProcessingStatus = ProcessingStatus.Ready;
        ready.HlsKey = "courses/ready/y/hls/master.m3u8";
        var failed = await SeedUploadEpisodeAsync(db, course, "courses/failed/y", episodeNumber: 2);
        db.CourseEpisodes.Update(failed);
        failed.ProcessingStatus = ProcessingStatus.Failed;
        await db.SaveChangesAsync();
        var (handler, _, _, _, _) = Create(db);

        var detail = await handler.Handle(new GetAdminCourseByIdQuery(course.Id), CancellationToken.None);

        var readyDto = detail.Episodes.Single(e => e.Id == ready.Id);
        readyDto.Description.Should().Be("شرح مفصل للمنهج");
        readyDto.Difficulty.Should().Be(Difficulty.Medium);
        readyDto.ProcessingStatus.Should().Be(ProcessingStatus.Ready);
        readyDto.ProcessingError.Should().BeNull();
        readyDto.HlsKey.Should().Be("courses/ready/y/hls/master.m3u8",
            "the admin processing poller reads hlsKey to detect a finished ladder");

        var failedDto = detail.Episodes.Single(e => e.Id == failed.Id);
        failedDto.ProcessingStatus.Should().Be(ProcessingStatus.Failed);
        failedDto.ProcessingError.Should().NotBeNullOrEmpty(
            "the dual-language error modal's collapsible section consumes the technical string while polling a Failed asset");
        failedDto.ProcessingError.Should().Contain("Failed");
    }

    [Fact]
    public async Task AbortUpload_AbortsStorage_AndDeletesRow()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: "mpu-11");
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.AbortMultipartUploadAsync("courses/x/y", "mpu-11", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        await handler.Handle(new AbortEpisodeUploadCommand(episode.Id, Guid.NewGuid()), CancellationToken.None);

        db.CourseEpisodes.AsNoTracking().Any(e => e.Id == episode.Id).Should().BeFalse("aborted uploads free their episode number");
    }

    // ===== Student access =====

    [Fact]
    public async Task GetEpisodeAccess_IncompleteUpload_Rejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: "mpu-pending");
        var (handler, _, _, _, _) = Create(db);

        var act = () => handler.Handle(new GetEpisodeAccessCommand(episode.Id, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("EPISODE_UPLOAD_INCOMPLETE");
    }

    [Fact]
    public async Task GetEpisodeAccess_NoVideoAudioScope_Forbidden()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y");
        var student = db.Students.First();
        var (handler, _, entitlements, _, _) = Create(db);
        entitlements.Setup(e => e.CanAccessSubjectContentAsync(student.Id, course.SubjectId, SubscriptionContentScope.VideoAudio, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var act = () => handler.Handle(new GetEpisodeAccessCommand(episode.Id, student.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task GetEpisodeAccess_UploadEpisode_PresignsViaCredentials_ReturnsWatermark_AndCountsView()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        var episode = await SeedUploadEpisodeAsync(db, course, "courses/x/y");
        var student = db.Students.First();
        var (handler, storage, entitlements, _, _) = Create(db);
        entitlements.Setup(e => e.CanAccessSubjectContentAsync(student.Id, course.SubjectId, SubscriptionContentScope.VideoAudio, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        storage.Setup(s => s.GetSignedUrlAsync("courses/x/y", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://r2/signed-playback");

        var access = await handler.Handle(new GetEpisodeAccessCommand(episode.Id, student.Id), CancellationToken.None);

        access.AccessUrl.Should().Be("https://r2/signed-playback");
        access.Watermark.StudentName.Should().Be(student.FullName);
        access.Watermark.StudentPhone.Should().Be(student.Phone);
        db.CourseEpisodes.AsNoTracking().Single(e => e.Id == episode.Id).ViewsCount.Should().Be(1);
    }

    [Fact]
    public async Task GetEpisodeAccess_YouTubeEpisode_ReturnsEmbedUrl_WithoutPresigning()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        var episode = new CourseEpisode { CourseId = course.Id, Title = "يوتيوب", EpisodeNumber = 1, SourceType = CourseEpisodeSource.YouTube, YoutubeVideoId = "abc123" };
        db.CourseEpisodes.Add(episode);
        await db.SaveChangesAsync();
        var student = db.Students.First();
        var (handler, storage, entitlements, _, _) = Create(db);
        entitlements.Setup(e => e.CanAccessSubjectContentAsync(student.Id, course.SubjectId, SubscriptionContentScope.VideoAudio, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var access = await handler.Handle(new GetEpisodeAccessCommand(episode.Id, student.Id), CancellationToken.None);

        access.AccessUrl.Should().StartWith("https://www.youtube.com/embed/abc123");
        storage.VerifyNoOtherCalls();
    }

    // ===== Student catalog =====

    [Fact]
    public async Task GetSubjectCourses_NoSubjectAccess_Forbidden()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var student = db.Students.First();
        var (handler, _, entitlements, _, _) = Create(db);
        entitlements.Setup(e => e.CanAccessSubjectAsync(student.Id, subject.Id, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var act = () => handler.Handle(new GetSubjectCoursesQuery(student.Id, subject.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task GetSubjectCourses_WithoutVideoAudioScope_ReturnsEmptyList()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var student = db.Students.First();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        var (handler, _, entitlements, _, _) = Create(db);
        entitlements.Setup(e => e.CanAccessSubjectAsync(student.Id, subject.Id, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        entitlements.Setup(e => e.CanAccessSubjectContentAsync(student.Id, subject.Id, SubscriptionContentScope.VideoAudio, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var courses = await handler.Handle(new GetSubjectCoursesQuery(student.Id, subject.Id), CancellationToken.None);

        courses.Should().BeEmpty("a LecturesText-only subscription must not see the course catalog");
        _ = course;
    }

    [Fact]
    public async Task GetSubjectCourses_WithScope_ReturnsPublishedCoursesWithCounts()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var student = db.Students.First();
        var course = await SeedCourseAsync(db, ContentStatus.Published);
        await SeedUploadEpisodeAsync(db, course, "courses/x/y", uploadId: null, fileSize: 100);
        var draft = await SeedCourseAsync(db, ContentStatus.Draft);
        var (handler, _, entitlements, _, _) = Create(db);
        entitlements.Setup(e => e.CanAccessSubjectAsync(student.Id, subject.Id, It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        entitlements.Setup(e => e.CanAccessSubjectContentAsync(student.Id, subject.Id, SubscriptionContentScope.VideoAudio, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var courses = await handler.Handle(new GetSubjectCoursesQuery(student.Id, subject.Id), CancellationToken.None);

        courses.Should().ContainSingle().Which.Id.Should().Be(course.Id, "draft courses are invisible to students");
        courses[0].EpisodesCount.Should().Be(1);
        _ = draft;
    }

    // ===== Push 7: Arabic filenames + ghost-number recycling =====

    [Fact]
    public async Task InitiateUpload_ArabicFileName_StoresPureGuidKey_NeverLeaksIntoStorage()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.InitiateMultipartUploadAsync(It.IsAny<string>(), "audio/mpeg", It.IsAny<CancellationToken>()))
            .ReturnsAsync("mpu-arabic");
        storage.Setup(s => s.PresignUploadPartAsync(It.IsAny<string>(), "mpu-arabic", It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string key, string uploadId, int partNumber, TimeSpan ttl, CancellationToken _) => $"https://r2/part{partNumber}");

        // The user's real-world case: an MP3 whose name carries Arabic characters.
        var initiate = await handler.Handle(new InitiateEpisodeUploadCommand(
            course.Id, "test-عربي.mp3", "audio/mpeg", 1024, "حلقة عربية الاسم", 1, Guid.NewGuid()), CancellationToken.None);

        initiate.FileKey.Should().MatchRegex($"^courses/{course.Id}/[0-9a-f]{{32}}/[0-9a-f]{{32}}$",
            "the Arabic fileName never enters the S3 key — keys are pure server-generated GUIDs");
        storage.Verify(s => s.InitiateMultipartUploadAsync(
            It.Is<string>(key => Regex.IsMatch(key, $"^courses/{course.Id}/[0-9a-f]{{32}}/[0-9a-f]{{32}}$")),
            "audio/mpeg", It.IsAny<CancellationToken>()), Times.Once,
            "storage sees only the GUID key and the sniffed content type — no Arabic in any request");
        var episode = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == initiate.EpisodeId);
        episode.ContentType.Should().Be("audio/mpeg");
        episode.FileKey.Should().NotContain("عربي");
    }

    [Fact]
    public async Task InitiateUpload_RecyclesNumberFromSoftDeletedGhost_PurgesRowAndBlob()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var ghost = await SeedUploadEpisodeAsync(db, course, "courses/ghost/done", uploadId: null, episodeNumber: 2);
        await GhostifyAsync(db, ghost);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.DeleteAsync("courses/ghost/done", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        storage.Setup(s => s.InitiateMultipartUploadAsync(It.IsAny<string>(), "audio/mpeg", It.IsAny<CancellationToken>()))
            .ReturnsAsync("mpu-42");
        storage.Setup(s => s.PresignUploadPartAsync(It.IsAny<string>(), "mpu-42", It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string key, string uploadId, int partNumber, TimeSpan ttl, CancellationToken _) => $"https://r2/part{partNumber}");

        // The exact production scenario: re-uploading at a number a soft-deleted
        // episode still holds (hard unique index → Postgres 23505 → persistent 500).
        var initiate = await handler.Handle(new InitiateEpisodeUploadCommand(
            course.Id, "retry.mp3", "audio/mpeg", 1024, "إعادة المحاولة", 2, Guid.NewGuid()), CancellationToken.None);

        db.CourseEpisodes.AsNoTracking().Any(e => e.Id == ghost.Id).Should().BeFalse(
            "the ghost is hard-purged so the hard unique index frees the number");
        var stored = db.CourseEpisodes.AsNoTracking().Single(e => e.Id == initiate.EpisodeId);
        stored.EpisodeNumber.Should().Be(2);
        storage.Verify(s => s.DeleteAsync("courses/ghost/done", It.IsAny<CancellationToken>()), Times.Once,
            "the ghost's completed blob is cleaned best-effort");
    }

    [Fact]
    public async Task InitiateUpload_GhostWithInFlightUpload_AbortsMultipartBeforeReuse()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var ghost = await SeedUploadEpisodeAsync(db, course, "courses/ghost/inflight", uploadId: "mpu-stuck", episodeNumber: 2);
        await GhostifyAsync(db, ghost);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.AbortMultipartUploadAsync("courses/ghost/inflight", "mpu-stuck", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        storage.Setup(s => s.DeleteAsync("courses/ghost/inflight", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        storage.Setup(s => s.InitiateMultipartUploadAsync(It.IsAny<string>(), "video/mp4", It.IsAny<CancellationToken>()))
            .ReturnsAsync("mpu-new");
        storage.Setup(s => s.PresignUploadPartAsync(It.IsAny<string>(), "mpu-new", It.IsAny<int>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string key, string uploadId, int partNumber, TimeSpan ttl, CancellationToken _) => $"https://r2/part{partNumber}");

        await handler.Handle(new InitiateEpisodeUploadCommand(
            course.Id, "lesson.mp4", "video/mp4", 1024, "الدرس الثاني", 2, Guid.NewGuid()), CancellationToken.None);

        storage.Verify(s => s.AbortMultipartUploadAsync("courses/ghost/inflight", "mpu-stuck", It.IsAny<CancellationToken>()), Times.Once,
            "a lingering multipart session is aborted before the number is reused");
        storage.Verify(s => s.DeleteAsync("courses/ghost/inflight", It.IsAny<CancellationToken>()), Times.Once);
        db.CourseEpisodes.AsNoTracking().Any(e => e.Id == ghost.Id).Should().BeFalse();
    }

    [Fact]
    public async Task UpdateEpisode_RenumberOntoGhost_PurgesGhostAndSucceeds()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var live = await SeedUploadEpisodeAsync(db, course, "courses/live/ep1", uploadId: null, episodeNumber: 1);
        var ghost = await SeedUploadEpisodeAsync(db, course, "courses/ghost/done", uploadId: null, episodeNumber: 2);
        await GhostifyAsync(db, ghost);
        var (handler, storage, _, _, _) = Create(db);
        storage.Setup(s => s.DeleteAsync("courses/ghost/done", It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);

        var updated = await handler.Handle(new UpdateEpisodeCommand(live.Id, "عنوان جديد", 2, 120), CancellationToken.None);

        updated.EpisodeNumber.Should().Be(2);
        db.CourseEpisodes.AsNoTracking().Single(e => e.Id == live.Id).EpisodeNumber.Should().Be(2);
        db.CourseEpisodes.AsNoTracking().Any(e => e.Id == ghost.Id).Should().BeFalse(
            "renumbering onto a ghost-held number purges the ghost atomically");
    }

    [Fact]
    public async Task InitiateUpload_LiveRowBlocks_GhostIsNotPurgedOnRejection()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        await SeedUploadEpisodeAsync(db, course, "courses/live/ep2", uploadId: null, episodeNumber: 2);
        var ghost = await SeedUploadEpisodeAsync(db, course, "courses/ghost/ep2", uploadId: null, episodeNumber: 2);
        await GhostifyAsync(db, ghost);
        var (handler, storage, _, _, _) = Create(db);

        var act = () => handler.Handle(new InitiateEpisodeUploadCommand(
            course.Id, "clash.mp4", "video/mp4", 1024, "تعارض", 2, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("EPISODE_NUMBER_TAKEN");
        db.CourseEpisodes.AsNoTracking().Any(e => e.Id == ghost.Id).Should().BeTrue(
            "a rejected request must not purge anything — only the caller's committed SaveChanges does");
        storage.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task InitiateUpload_ConcurrentNumberRace_UniqueViolationTranslatedToFriendlyError()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var course = await SeedCourseAsync(db);
        var throwing = new Mock<IUnitOfWork>();
        throwing.Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ThrowsAsync(new DbUpdateException(
                "An error occurred while saving the entity changes. See the inner exception for details.",
                new Exception("23505: duplicate key value violates unique constraint \"ix_course_episodes_course_id_episode_number\"")));
        var (handler, storage, _, _, _) = Create(db, unitOfWork: throwing.Object);
        storage.Setup(s => s.InitiateMultipartUploadAsync(It.IsAny<string>(), "video/mp4", It.IsAny<CancellationToken>()))
            .ReturnsAsync("mpu-race");

        // Two concurrent initiates both passed the availability check; the second
        // INSERT hits the hard unique index. The raw DbUpdateException must surface
        // as a friendly domain error — NOT the 500 the admin kept seeing.
        var act = () => handler.Handle(new InitiateEpisodeUploadCommand(
            course.Id, "race.mp4", "video/mp4", 1024, "سباق", 2, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("EPISODE_NUMBER_TAKEN");
    }

    /// <summary>Activity writer that records entries in memory for assertions.</summary>
    private sealed class RecordingActivityWriter : IAdminActivityWriter
    {
        public List<(AdminActivityActionType Action, string? ResourceId)> Actions { get; } = new();

        public Task LogAsync(Guid adminId, AdminActivityActionType actionType, string? resourceId = null, object? metadata = null, Guid? sessionId = null, CancellationToken ct = default)
        {
            Actions.Add((actionType, resourceId));
            return Task.CompletedTask;
        }
    }
}
