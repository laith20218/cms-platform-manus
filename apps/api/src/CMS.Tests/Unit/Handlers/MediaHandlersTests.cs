using CMS.Application.Commands.Media;
using CMS.Application.DTOs.Media;
using CMS.Application.Exceptions;
using CMS.Application.Handlers.Media;
using CMS.Application.Interfaces;
using CMS.Domain.Constants;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Push 10.0 — media backend InMemory tests:
///   • playback-url: presign call shape (storage key, TTL from MediaPolicy), gating
///     (published+clean, VideoAudio scope, YouTube refusal, upload-incomplete refusal,
///     non-streamable types);
///   • bookmarks: create/list/update/delete, duplicate conflict, validation rules,
///     owner-only mutation;
///   • playback progress: upsert create/update, completion 0/50/95/100, position
///     clamping, duration stickiness, 204-on-empty (null) semantics.
/// </summary>
public sealed class MediaHandlersTests
{
    private static (MediaHandlers Handler, Mock<IFileStorageService> Storage, Mock<IEntitlementService> Entitlements) Create(
        ApplicationDbContext db)
    {
        var storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>();
        entitlements.Setup(service => service.CanAccessSubjectContentAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<SubscriptionContentScope>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        var handler = new MediaHandlers(db, new UnitOfWork(db), storage.Object, entitlements.Object);
        return (handler, storage, entitlements);
    }

    private static async Task<LibraryFile> SeedVideoFileAsync(ApplicationDbContext db, string fileUrl = "library/test/video", LibraryFileType type = LibraryFileType.Video, int? durationSeconds = 1200)
    {
        var subject = db.Subjects.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = type,
            Title = "فيديو تجريبي",
            FileUrl = fileUrl,
            FileFormat = "video/mp4",
            DurationSeconds = durationSeconds,
            Status = ContentStatus.Published,
            VirusScanStatus = VirusScanStatus.Clean
        };
        db.LibraryFiles.Add(file);
        await db.SaveChangesAsync();
        return file;
    }

    private static async Task<CourseEpisode> SeedEpisodeAsync(ApplicationDbContext db, string fileKey = "courses/test/episode")
    {
        var subject = db.Subjects.First();
        var course = new Course { SubjectId = subject.Id, Title = "كورس تجريبي", Status = ContentStatus.Published };
        db.Courses.Add(course);
        var episode = new CourseEpisode
        {
            CourseId = course.Id,
            Title = "حلقة تجريبية",
            EpisodeNumber = 1,
            FileKey = fileKey,
            ContentType = "video/mp4",
            SourceType = CourseEpisodeSource.Upload,
            UploadId = null,
            DurationSeconds = 2400
        };
        db.CourseEpisodes.Add(episode);
        await db.SaveChangesAsync();
        return episode;
    }

    // ===== §1.A: playback-url =====

    [Fact]
    public async Task GetPlaybackUrl_LibraryVideo_PresignsStorageKeyWithPolicyTtl()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, storage, _) = Create(db);

        storage.Setup(service => service.GetSignedUrlAsync("library/test/video", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://example.r2.cloudflarestorage.com/library/test/video?X-Amz-Signature=redacted");

        var result = await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        result.Url.Should().Be("https://example.r2.cloudflarestorage.com/library/test/video?X-Amz-Signature=redacted");
        result.TtlSeconds.Should().Be(MediaPolicy.PlaybackUrlTtlSeconds);
        result.ContentType.Should().Be("video/mp4");
        result.SupportsRange.Should().BeTrue();
        result.ExpiresAt.Should().BeAfter(DateTime.UtcNow);
        storage.Verify(service => service.GetSignedUrlAsync(
            "library/test/video",
            TimeSpan.FromSeconds(MediaPolicy.PlaybackUrlTtlSeconds),
            It.IsAny<CancellationToken>()));
    }

    /// <summary>
    /// Push 10.0c security fix: playback URLs must be minted through the object-scoped
    /// agent path (GetSignedUrlAsync → /v1/presign) and NEVER through the deprecated
    /// credential-lease path (GetSignedUrlViaCredentialsAsync), whose URLs embedded the
    /// bucket-wide session token (X-Amz-Security-Token). The supervisor's live test on a
    /// production URL confirmed the exposure; this pins the fix.
    /// </summary>
    [Fact]
    public async Task GetPlaybackUrl_UsesObjectScopedPresign_NeverTheCredentialLeasePath()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, storage, _) = Create(db);

        storage.Setup(service => service.GetSignedUrlAsync("library/test/video", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://example.r2.cloudflarestorage.com/library/test/video?X-Amz-Signature=redacted");

        await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        storage.Verify(service => service.GetSignedUrlAsync(
            "library/test/video",
            TimeSpan.FromSeconds(MediaPolicy.PlaybackUrlTtlSeconds),
            It.IsAny<CancellationToken>()), Times.Once);
        storage.Verify(service => service.GetSignedUrlViaCredentialsAsync(
            It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Never,
            "the credential-lease path embeds the bucket-wide session token in the URL (deprecated in 10.0c)");
    }

    [Fact]
    public async Task GetPlaybackUrl_LibraryAudio_FallsBackToAudioContentType()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db, "library/test/audio", LibraryFileType.Audio);
        db.LibraryFiles.Update(file);
        file.FileFormat = null; // audio asset without a stored format — exercises the fallback
        await db.SaveChangesAsync();
        var (handler, storage, _) = Create(db);

        storage.Setup(service => service.GetSignedUrlAsync("library/test/audio", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://example.r2.cloudflarestorage.com/library/test/audio?X-Amz-Signature=redacted");

        var result = await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        result.ContentType.Should().Be("audio/mpeg");
        storage.Verify(service => service.GetSignedUrlAsync("library/test/audio", TimeSpan.FromSeconds(MediaPolicy.PlaybackUrlTtlSeconds), It.IsAny<CancellationToken>()));
    }

    [Fact]
    public async Task GetPlaybackUrl_MissingFileFormat_DefaultsToVideoMp4()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db, "library/test/noformat");
        db.LibraryFiles.Update(file);
        file.FileFormat = null;
        await db.SaveChangesAsync();
        var (handler, storage, _) = Create(db);

        storage.Setup(service => service.GetSignedUrlAsync("library/test/noformat", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://example.r2.cloudflarestorage.com/library/test/noformat?X-Amz-Signature=redacted");

        var result = await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        result.ContentType.Should().Be("video/mp4");
    }

    [Fact]
    public async Task GetPlaybackUrl_NonStreamableType_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db, "library/test/doc.pdf", LibraryFileType.Pdf);
        var (handler, storage, _) = Create(db);

        var act = async () => await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("MEDIA_TYPE_NOT_STREAMABLE");
        storage.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task GetPlaybackUrl_YouTubeHostedVideo_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        db.LibraryFiles.Update(file);
        file.YoutubeVideoId = "abc123";
        await db.SaveChangesAsync();
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("MEDIA_YOUTUBE_HOSTED");
    }

    [Fact]
    public async Task GetPlaybackUrl_UnpublishedFile_IsNotFound()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        db.LibraryFiles.Update(file);
        file.Status = ContentStatus.Draft;
        await db.SaveChangesAsync();
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task GetPlaybackUrl_EntitlementDenied_IsForbidden()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, entitlements) = Create(db);
        entitlements.Setup(service => service.CanAccessSubjectContentAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), SubscriptionContentScope.VideoAudio, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var act = async () => await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task GetPlaybackUrl_CourseEpisode_PresignsEpisodeFileKey()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var episode = await SeedEpisodeAsync(db);
        var (handler, storage, _) = Create(db);

        storage.Setup(service => service.GetSignedUrlAsync("courses/test/episode", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://example.r2.cloudflarestorage.com/courses/test/episode?X-Amz-Signature=redacted");

        var result = await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.CourseEpisode, episode.Id), CancellationToken.None);

        result.TtlSeconds.Should().Be(MediaPolicy.PlaybackUrlTtlSeconds);
        result.ContentType.Should().Be("video/mp4");
        result.SupportsRange.Should().BeTrue();
        storage.Verify(service => service.GetSignedUrlAsync("courses/test/episode", TimeSpan.FromSeconds(MediaPolicy.PlaybackUrlTtlSeconds), It.IsAny<CancellationToken>()));
    }

    [Fact]
    public async Task GetPlaybackUrl_EpisodeUploadIncomplete_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var episode = await SeedEpisodeAsync(db);
        db.CourseEpisodes.Update(episode);
        episode.UploadId = "multipart-in-progress";
        await db.SaveChangesAsync();
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.CourseEpisode, episode.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("EPISODE_UPLOAD_INCOMPLETE");
    }

    [Fact]
    public async Task GetPlaybackUrl_EpisodeInUnpublishedCourse_IsForbidden()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var episode = await SeedEpisodeAsync(db);
        var course = db.Courses.First();
        db.Courses.Update(course);
        course.Status = ContentStatus.Draft;
        await db.SaveChangesAsync();
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.CourseEpisode, episode.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ===== Push 10.5 — transcoding-aware playback resolution =====

    [Fact]
    public async Task GetPlaybackUrl_EpisodeReadyWithHlsKey_PresignsMasterPlaylist()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var episode = await SeedEpisodeAsync(db);
        db.CourseEpisodes.Update(episode);
        episode.ProcessingStatus = ProcessingStatus.Ready;
        episode.HlsKey = "courses/test/episode/hls/master.m3u8";
        await db.SaveChangesAsync();
        var (handler, storage, _) = Create(db);

        storage.Setup(service => service.GetSignedUrlAsync("courses/test/episode/hls/master.m3u8", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://example.r2.cloudflarestorage.com/courses/test/episode/hls/master.m3u8?X-Amz-Signature=redacted");

        var result = await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.CourseEpisode, episode.Id), CancellationToken.None);

        result.Url.Should().Contain("master.m3u8", "Ready assets with a pinned HlsKey serve the HLS ladder, not the source object");
        result.ContentType.Should().Be("application/vnd.apple.mpegurl");
        result.SupportsRange.Should().BeTrue();
        storage.Verify(service => service.GetSignedUrlAsync(
            "courses/test/episode/hls/master.m3u8",
            TimeSpan.FromSeconds(MediaPolicy.PlaybackUrlTtlSeconds),
            It.IsAny<CancellationToken>()), Times.Once);
        storage.Verify(service => service.GetSignedUrlAsync(
            "courses/test/episode",
            It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Never,
            "the source MP4 must not be presigned once the ladder is Ready");
    }

    [Fact]
    public async Task GetPlaybackUrl_LibraryFileReadyWithHlsKey_PresignsMasterPlaylist()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        db.LibraryFiles.Update(file);
        file.ProcessingStatus = ProcessingStatus.Ready;
        file.HlsKey = "library/test/video/hls/master.m3u8";
        await db.SaveChangesAsync();
        var (handler, storage, _) = Create(db);

        storage.Setup(service => service.GetSignedUrlAsync("library/test/video/hls/master.m3u8", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://example.r2.cloudflarestorage.com/library/test/video/hls/master.m3u8?X-Amz-Signature=redacted");

        var result = await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        result.Url.Should().Contain("master.m3u8");
        result.ContentType.Should().Be("application/vnd.apple.mpegurl");
        storage.Verify(service => service.GetSignedUrlAsync(
            "library/test/video/hls/master.m3u8",
            TimeSpan.FromSeconds(MediaPolicy.PlaybackUrlTtlSeconds),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Theory]
    [InlineData(ProcessingStatus.Pending)]
    [InlineData(ProcessingStatus.Transcoding_360p)]
    [InlineData(ProcessingStatus.Transcoding_720p)]
    [InlineData(ProcessingStatus.Transcoding_1080p)]
    public async Task GetPlaybackUrl_WhileProcessing_IsConflict(ProcessingStatus status)
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var episode = await SeedEpisodeAsync(db);
        db.CourseEpisodes.Update(episode);
        episode.ProcessingStatus = status;
        await db.SaveChangesAsync();
        var (handler, storage, _) = Create(db);

        var act = async () => await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.CourseEpisode, episode.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<ConflictException>())
            .Which.Message.Should().Contain("قيد المعالجة",
                "the 409 carries the dual-language still-processing sentence");
        storage.VerifyNoOtherCalls(); // no presign happens while the ladder is still encoding
    }

    [Fact]
    public async Task GetPlaybackUrl_FailedAsset_ThrowsMediaProcessingException()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var episode = await SeedEpisodeAsync(db);
        db.CourseEpisodes.Update(episode);
        episode.ProcessingStatus = ProcessingStatus.Failed;
        await db.SaveChangesAsync();
        var (handler, storage, _) = Create(db);

        var act = async () => await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.CourseEpisode, episode.Id), CancellationToken.None);

        var failure = (await act.Should().ThrowAsync<MediaProcessingException>()).Which;
        failure.HumanMessage.Should().NotBeNullOrWhiteSpace("the 422 ProblemDetails leads with the Arabic human sentence");
        failure.TechnicalDetails.Should().Contain("Failed",
            "the collapsible technical section explains the terminal pipeline failure");
        storage.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task GetPlaybackUrl_LibraryFileFailed_ThrowsMediaProcessingException()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        db.LibraryFiles.Update(file);
        file.ProcessingStatus = ProcessingStatus.Failed;
        await db.SaveChangesAsync();
        var (handler, storage, _) = Create(db);

        var act = async () => await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        await act.Should().ThrowAsync<MediaProcessingException>();
        storage.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task GetPlaybackUrl_ReadyWithoutHlsKey_FallsBackToSourceObject()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var episode = await SeedEpisodeAsync(db);
        db.CourseEpisodes.Update(episode);
        episode.ProcessingStatus = ProcessingStatus.Ready; // HlsKey stays null — pipeline anomaly
        await db.SaveChangesAsync();
        var (handler, storage, _) = Create(db);

        storage.Setup(service => service.GetSignedUrlAsync("courses/test/episode", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://example.r2.cloudflarestorage.com/courses/test/episode?X-Amz-Signature=redacted");

        var result = await handler.Handle(new GetPlaybackUrlQuery(student.Id, MediaAssetType.CourseEpisode, episode.Id), CancellationToken.None);

        result.ContentType.Should().Be("video/mp4",
            "a Ready status without a pinned key must degrade to the source object instead of failing playback");
        storage.Verify(service => service.GetSignedUrlAsync("courses/test/episode", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    // ===== §1.B: bookmarks =====

    [Fact]
    public async Task CreateBookmark_ValidWindow_IsStoredWithTrimmedLabel()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "  مراجعة سريعة  ", "قبل الامتحان"), CancellationToken.None);

        result.Bookmark.Label.Should().Be("مراجعة سريعة");
        result.Bookmark.StartSeconds.Should().Be(60);
        result.Bookmark.EndSeconds.Should().Be(120);
        result.DurationKnown.Should().BeTrue();
        db.MediaBookmarks.Should().HaveCount(1);
    }

    [Fact]
    public async Task CreateBookmark_UnknownAssetDuration_IsAcceptedWithWarningFlag()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db, durationSeconds: null);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 0, 30, "بداية", null), CancellationToken.None);

        result.DurationKnown.Should().BeFalse("the API layer surfaces X-Duration-Warning: unknown for this case");
    }

    [Fact]
    public async Task CreateBookmark_ExactDuplicate_IsConflict()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "أ", null), CancellationToken.None);
        var act = async () => await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "ب", null), CancellationToken.None);

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task CreateBookmark_EmptyLabel_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 0, 10, "   ", null), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("BOOKMARK_LABEL_INVALID");
    }

    [Fact]
    public async Task CreateBookmark_LabelTooLong_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 0, 10, new string('x', 101), null), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("BOOKMARK_LABEL_INVALID");
    }

    [Fact]
    public async Task CreateBookmark_NoteTooLong_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 0, 10, "عنوان", new string('x', 501)), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("BOOKMARK_NOTE_TOO_LONG");
    }

    [Fact]
    public async Task CreateBookmark_ReversedOrZeroWindow_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var reversed = async () => await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 120, 60, "عنوان", null), CancellationToken.None);
        var zero = async () => await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 60, "عنوان", null), CancellationToken.None);
        var negative = async () => await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, -5, 60, "عنوان", null), CancellationToken.None);

        (await reversed.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("BOOKMARK_RANGE_INVALID");
        (await zero.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("BOOKMARK_RANGE_INVALID");
        (await negative.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("BOOKMARK_RANGE_INVALID");
    }

    [Fact]
    public async Task CreateBookmark_SpanOverOneHour_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 0, 3601, "عنوان", null), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("BOOKMARK_SPAN_TOO_LONG");
    }

    [Fact]
    public async Task ListBookmarks_IsOrderedByStartSeconds()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        await handler.Handle(new CreateMediaBookmarkCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 300, 360, "ثالثة", null), CancellationToken.None);
        await handler.Handle(new CreateMediaBookmarkCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 0, 30, "أولى", null), CancellationToken.None);
        await handler.Handle(new CreateMediaBookmarkCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "ثانية", null), CancellationToken.None);

        var list = await handler.Handle(new ListMediaBookmarksQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        list.Should().HaveCount(3);
        list.Select(bookmark => bookmark.StartSeconds).Should().BeInAscendingOrder();
        list[0].Label.Should().Be("أولى");
        list[1].Label.Should().Be("ثانية");
        list[2].Label.Should().Be("ثالثة");
    }

    [Fact]
    public async Task ListBookmarks_OtherStudentsAndAssets_AreExcluded()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var other = Student.Create("0936185126", "hashed_password", "طالب آخر");
        other.VerifyPhone();
        db.Students.Add(other);
        await db.SaveChangesAsync();
        var file = await SeedVideoFileAsync(db);
        var episode = await SeedEpisodeAsync(db);
        var (handler, _, _) = Create(db);

        await handler.Handle(new CreateMediaBookmarkCommand(other.Id, MediaAssetType.LibraryFile, file.Id, 0, 30, "الغير", null), CancellationToken.None);
        await handler.Handle(new CreateMediaBookmarkCommand(student.Id, MediaAssetType.CourseEpisode, episode.Id, 0, 30, "حلقة", null), CancellationToken.None);
        await handler.Handle(new CreateMediaBookmarkCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "لي", null), CancellationToken.None);

        var list = await handler.Handle(new ListMediaBookmarksQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        list.Should().ContainSingle(bookmark => bookmark.Label == "لي");
    }

    [Fact]
    public async Task UpdateBookmark_OnlyPatchesLabelAndNote()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);
        var created = await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "قبل", "ملاحظة قديمة"), CancellationToken.None);

        var updated = await handler.Handle(new UpdateMediaBookmarkCommand(
            student.Id, created.Bookmark.Id, "  بعد  ", "ملاحظة جديدة"), CancellationToken.None);

        updated.Label.Should().Be("بعد");
        updated.Note.Should().Be("ملاحظة جديدة");
        updated.StartSeconds.Should().Be(60, "the time window never moves on PATCH");
        updated.EndSeconds.Should().Be(120);
    }

    [Fact]
    public async Task UpdateBookmark_NullFields_LeaveValuesUnchanged()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);
        var created = await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "عنوان", "ملاحظة"), CancellationToken.None);

        var updated = await handler.Handle(new UpdateMediaBookmarkCommand(
            student.Id, created.Bookmark.Id, null, null), CancellationToken.None);

        updated.Label.Should().Be("عنوان");
        updated.Note.Should().Be("ملاحظة");
    }

    [Fact]
    public async Task UpdateBookmark_EmptyLabel_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);
        var created = await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "عنوان", null), CancellationToken.None);

        var act = async () => await handler.Handle(new UpdateMediaBookmarkCommand(
            student.Id, created.Bookmark.Id, " ", null), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("BOOKMARK_LABEL_INVALID");
    }

    [Fact]
    public async Task UpdateBookmark_ForeignOwner_IsForbidden()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var other = Student.Create("0936185126", "hashed_password", "طالب آخر");
        other.VerifyPhone();
        db.Students.Add(other);
        await db.SaveChangesAsync();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);
        var created = await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "عنوان", null), CancellationToken.None);

        var act = async () => await handler.Handle(new UpdateMediaBookmarkCommand(
            other.Id, created.Bookmark.Id, "معدل", null), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task DeleteBookmark_RemovesOnlyOwnersRow()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);
        var created = await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "عنوان", null), CancellationToken.None);

        await handler.Handle(new DeleteMediaBookmarkCommand(student.Id, created.Bookmark.Id), CancellationToken.None);

        db.MediaBookmarks.Should().BeEmpty();
    }

    [Fact]
    public async Task DeleteBookmark_ForeignOwner_IsForbidden()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var other = Student.Create("0936185126", "hashed_password", "طالب آخر");
        other.VerifyPhone();
        db.Students.Add(other);
        await db.SaveChangesAsync();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);
        var created = await handler.Handle(new CreateMediaBookmarkCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 60, 120, "عنوان", null), CancellationToken.None);

        var act = async () => await handler.Handle(new DeleteMediaBookmarkCommand(other.Id, created.Bookmark.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
        db.MediaBookmarks.Should().HaveCount(1);
    }

    // ===== §1.C: playback progress =====

    [Fact]
    public async Task UpsertProgress_CreatesRowWithDerivedCompletion()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new UpsertPlaybackProgressCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 600, 1200), CancellationToken.None);

        result.LastPositionSeconds.Should().Be(600);
        result.DurationSeconds.Should().Be(1200);
        result.CompletionPercent.Should().Be(50);
        db.PlaybackProgress.Should().HaveCount(1);
    }

    [Fact]
    public async Task UpsertProgress_UpdatesExistingRow()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        await handler.Handle(new UpsertPlaybackProgressCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 100, 1200), CancellationToken.None);
        var result = await handler.Handle(new UpsertPlaybackProgressCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 900, 1200), CancellationToken.None);

        db.PlaybackProgress.Should().HaveCount(1, "upsert — one row per student/asset");
        result.LastPositionSeconds.Should().Be(900);
        result.CompletionPercent.Should().Be(75);
    }

    [Fact]
    public async Task UpsertProgress_CompletionBoundaries()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var zero = await handler.Handle(new UpsertPlaybackProgressCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 0, 1200), CancellationToken.None);
        var mid = await handler.Handle(new UpsertPlaybackProgressCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 600, 1200), CancellationToken.None);
        var justUnder = await handler.Handle(new UpsertPlaybackProgressCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 1139, 1200), CancellationToken.None);
        var at95 = await handler.Handle(new UpsertPlaybackProgressCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 1140, 1200), CancellationToken.None);
        var full = await handler.Handle(new UpsertPlaybackProgressCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 1200, 1200), CancellationToken.None);

        zero.CompletionPercent.Should().Be(0);
        mid.CompletionPercent.Should().Be(50);
        justUnder.CompletionPercent.Should().Be(94.92m, "1139/1200 = 94.9167 rounds to 94.92 — anything under 95 stays a raw percentage");
        at95.CompletionPercent.Should().Be(100, "the 95 % rule pins completion to 100");
        full.CompletionPercent.Should().Be(100);
    }

    [Fact]
    public async Task UpsertProgress_PositionBeyondDuration_IsClamped()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new UpsertPlaybackProgressCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 999_999, 1200), CancellationToken.None);

        result.LastPositionSeconds.Should().Be(1200, "position is clamped to the known duration");
        result.CompletionPercent.Should().Be(100);
    }

    [Fact]
    public async Task UpsertProgress_NegativePosition_IsRejected()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new UpsertPlaybackProgressCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, -1, 1200), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("PROGRESS_POSITION_INVALID");
    }

    [Fact]
    public async Task UpsertProgress_DurationIsSticky()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        await handler.Handle(new UpsertPlaybackProgressCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 100, 1200), CancellationToken.None);
        var result = await handler.Handle(new UpsertPlaybackProgressCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 200, null), CancellationToken.None);

        result.DurationSeconds.Should().Be(1200, "a known duration is never overwritten by an unknown one");
        result.CompletionPercent.Should().BeApproximately(16.67m, 0.01m);
    }

    [Fact]
    public async Task UpsertProgress_UnknownDuration_KeepsCompletionNull()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db, durationSeconds: null);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new UpsertPlaybackProgressCommand(
            student.Id, MediaAssetType.LibraryFile, file.Id, 300, null), CancellationToken.None);

        result.DurationSeconds.Should().BeNull();
        result.CompletionPercent.Should().BeNull("completion cannot be derived without a duration");
    }

    [Fact]
    public async Task GetProgress_NoRecord_ReturnsNull()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetPlaybackProgressQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        result.Should().BeNull("the API layer maps null → 204 No Content");
    }

    [Fact]
    public async Task GetProgress_ExistingRecord_ReturnsIt()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var file = await SeedVideoFileAsync(db);
        var (handler, _, _) = Create(db);
        await handler.Handle(new UpsertPlaybackProgressCommand(student.Id, MediaAssetType.LibraryFile, file.Id, 600, 1200), CancellationToken.None);

        var result = await handler.Handle(new GetPlaybackProgressQuery(student.Id, MediaAssetType.LibraryFile, file.Id), CancellationToken.None);

        result.Should().NotBeNull();
        result!.LastPositionSeconds.Should().Be(600);
        result.CompletionPercent.Should().Be(50);
    }
}
