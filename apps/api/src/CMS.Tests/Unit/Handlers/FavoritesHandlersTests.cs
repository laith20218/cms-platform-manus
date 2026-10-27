using System.Data;
using System.Data.Common;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Moq;
using CMS.Application.Commands.Favorites;
using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Favorites;
using CMS.Application.Handlers.Favorites;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Push 11.3 — FavoritesHandlers unit coverage: list filter/sort/pagination/enrichment,
/// the ≤5-query contract (measured on SQLite via a command-counting interceptor, with the
/// REAL EntitlementService so the entitlement checks count too), episode create gates +
/// idempotency, unified delete semantics + ownership security, and the playback-url
/// IsFavorite field for episode/file paths.
/// </summary>
public class FavoritesHandlersTests
{
    // ===== helpers =====

    private static (FavoritesHandlers Handler, Mock<IEntitlementService> Entitlements, Mock<ISignedEntitlementService> Signed) Create(
        ApplicationDbContext db, bool allowAll = true)
    {
        var entitlements = new Mock<IEntitlementService>();
        entitlements
            .Setup(service => service.CanAccessSubjectContentAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<SubscriptionContentScope>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(allowAll);
        entitlements
            .Setup(service => service.GetAccessibleSubjectMapAsync(
                It.IsAny<Guid>(),
                It.IsAny<IReadOnlyCollection<(Guid SubjectId, SubscriptionContentScope Scope)>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid _, IReadOnlyCollection<(Guid SubjectId, SubscriptionContentScope Scope)> candidates, CancellationToken _) =>
                candidates
                    .GroupBy(candidate => candidate.Scope)
                    .ToDictionary(group => group.Key, group => new HashSet<Guid>(group.Select(candidate => candidate.SubjectId))));

        var signed = new Mock<ISignedEntitlementService>();
        signed
            .Setup(service => service.ValidateAsync(
                It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string _, Guid studentId, string installationId, Guid? _, CancellationToken _) =>
                new SignedEntitlementValidationResult(true, null, new SignedEntitlement(
                    studentId, installationId, null, null,
                    Array.Empty<Guid>(), Array.Empty<Guid>(), Array.Empty<Guid>(),
                    DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(15), 1, "test")));

        var handler = new FavoritesHandlers(db, new UnitOfWork(db), entitlements.Object, signed.Object);
        return (handler, entitlements, signed);
    }

    private static async Task<Course> SeedCourseAsync(ApplicationDbContext db, string title = "كورس القلب")
    {
        var subject = db.Subjects.First();
        var course = new Course { SubjectId = subject.Id, Title = title, CoverImageUrl = "https://cdn.example.com/course-cover.jpg", Status = ContentStatus.Published };
        db.Courses.Add(course);
        await db.SaveChangesAsync();
        return course;
    }

    private static async Task<CourseEpisode> SeedEpisodeAsync(ApplicationDbContext db, Guid courseId, string title = "حلقة تجريبية", ProcessingStatus? status = ProcessingStatus.Ready)
    {
        var episode = new CourseEpisode
        {
            CourseId = courseId,
            Title = title,
            EpisodeNumber = 1,
            FileKey = "courses/test/episode",
            ContentType = "video/mp4",
            SourceType = CourseEpisodeSource.Upload,
            UploadId = null,
            DurationSeconds = 2400,
            ProcessingStatus = status,
            HlsKey = status == ProcessingStatus.Ready ? "courses/test/episode/hls" : null,
        };
        db.CourseEpisodes.Add(episode);
        await db.SaveChangesAsync();
        return episode;
    }

    private static async Task<LibraryFile> SeedFileAsync(ApplicationDbContext db, string title = "ملف تجريبي", LibraryFileType type = LibraryFileType.Pdf)
    {
        var subject = db.Subjects.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = type,
            Title = title,
            FileUrl = "library/test/file",
            FileSize = 2048,
            ThumbnailUrl = "https://cdn.example.com/thumb.jpg",
            Category = LibraryFileCategory.Curriculum,
            DurationSeconds = type is LibraryFileType.Video or LibraryFileType.Audio ? 900 : null,
            Status = ContentStatus.Published,
        };
        db.LibraryFiles.Add(file);
        await db.SaveChangesAsync();
        return file;
    }

    private static Favorite AddFavorite(ApplicationDbContext db, Guid studentId, Guid? questionId = null, Guid? libraryFileId = null, Guid? courseEpisodeId = null, DateTime? createdAt = null)
    {
        var favorite = new Favorite { StudentId = studentId, QuestionId = questionId, LibraryFileId = libraryFileId, CourseEpisodeId = courseEpisodeId };
        db.Favorites.Add(favorite);
        db.Entry(favorite).Property(entry => entry.CreatedAt).CurrentValue = createdAt ?? DateTime.UtcNow;
        db.SaveChanges();
        return favorite;
    }

    // ===== GetFavoritesQuery: filter =====

    [Fact]
    public async Task List_MixedFavorites_ReturnsAllThreeTypes()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var file = await SeedFileAsync(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        AddFavorite(db, student.Id, questionId: question.Id);
        AddFavorite(db, student.Id, libraryFileId: file.Id);
        AddFavorite(db, student.Id, courseEpisodeId: episode.Id);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, null, "recent", 1, 20), CancellationToken.None);

        result.Items.Select(item => item.TargetType).Should().BeEquivalentTo(new[] { "question", "file", "episode" });
        result.Total.Should().Be(3);
    }

    [Theory]
    [InlineData("question", "question")]
    [InlineData("file", "file")]
    [InlineData("episode", "episode")]
    public async Task List_TypeFilter_ReturnsOnlyRequestedType(string requested, string expected)
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var file = await SeedFileAsync(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        AddFavorite(db, student.Id, questionId: question.Id);
        AddFavorite(db, student.Id, libraryFileId: file.Id);
        AddFavorite(db, student.Id, courseEpisodeId: episode.Id);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, requested, "recent", 1, 20), CancellationToken.None);

        result.Items.Should().OnlyContain(item => item.TargetType == expected);
        result.Total.Should().Be(1);
    }

    [Fact]
    public async Task List_InvalidType_Rejected()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new GetFavoritesQuery(student.Id, "podcast", "recent", 1, 20), CancellationToken.None);
        await act.Should().ThrowAsync<DomainException>();
    }

    [Fact]
    public async Task List_InvalidSort_Rejected()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new GetFavoritesQuery(student.Id, null, "random", 1, 20), CancellationToken.None);
        await act.Should().ThrowAsync<DomainException>();
    }

    // ===== GetFavoritesQuery: sort =====

    [Fact]
    public async Task List_SortRecent_NewestSavedFirst()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var old = AddFavorite(db, student.Id, questionId: question.Id, createdAt: DateTime.UtcNow.AddDays(-3));
        var recent = AddFavorite(db, student.Id, questionId: question.Id == old.QuestionId ? question.Id : question.Id, createdAt: DateTime.UtcNow);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, "question", "recent", 1, 20), CancellationToken.None);

        result.Items[0].Id.Should().Be(recent.Id);
    }

    [Fact]
    public async Task List_SortOldest_OldestSavedFirst()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var old = AddFavorite(db, student.Id, questionId: question.Id, createdAt: DateTime.UtcNow.AddDays(-3));
        AddFavorite(db, student.Id, questionId: question.Id, createdAt: DateTime.UtcNow);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, "question", "oldest", 1, 20), CancellationToken.None);

        result.Items[0].Id.Should().Be(old.Id);
    }

    [Fact]
    public async Task List_SortAlpha_TitlesOrderedAcrossTypes()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var file = await SeedFileAsync(db, title: "ملف الزمالة");
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id, title: "حلقة الأوعية");
        AddFavorite(db, student.Id, libraryFileId: file.Id);
        AddFavorite(db, student.Id, courseEpisodeId: episode.Id);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, null, "alpha", 1, 20), CancellationToken.None);

        string.Join('|', result.Items.Select(item => item.Title)).Should().Be(string.Join('|', result.Items.Select(item => item.Title).OrderBy(title => title, StringComparer.OrdinalIgnoreCase)));
    }

    // ===== GetFavoritesQuery: pagination =====

    [Fact]
    public async Task List_Pagination_SecondPageSlicesAndReportsTotals()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        for (var day = 1; day <= 5; day++)
            AddFavorite(db, student.Id, questionId: question.Id, createdAt: DateTime.UtcNow.AddDays(-day));
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, "question", "recent", 2, 2), CancellationToken.None);

        result.Total.Should().Be(5);
        result.TotalPages.Should().Be(3);
        result.Items.Should().HaveCount(2);
        result.Items[0].Id.Should().Be(db.Favorites.AsNoTracking().OrderByDescending(favorite => favorite.CreatedAt).Skip(2).First().Id);
    }

    [Fact]
    public async Task List_PageSizeClampedTo100()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, null, "recent", 1, 10_000), CancellationToken.None);

        result.PageSize.Should().Be(100);
    }

    [Fact]
    public async Task List_NonPositivePageClampedToOne()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, null, "recent", -4, 20), CancellationToken.None);

        result.Page.Should().Be(1);
    }

    // ===== GetFavoritesQuery: enrichment =====

    [Fact]
    public async Task List_EpisodeEnrichment_CarriesCourseTitleCoverDurationStatusAndProgress()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        AddFavorite(db, student.Id, courseEpisodeId: episode.Id);
        db.PlaybackProgress.Add(new PlaybackProgress
        {
            StudentId = student.Id,
            AssetType = MediaAssetType.CourseEpisode,
            AssetId = episode.Id,
            LastPositionSeconds = 300,
            DurationSeconds = 2400,
            CompletionPercent = 12.5m,
        });
        await db.SaveChangesAsync();
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, "episode", "recent", 1, 20), CancellationToken.None);

        var item = result.Items.Single();
        item.Title.Should().Be(episode.Title);
        item.Subtitle.Should().Be(course.Title);
        item.ThumbnailUrl.Should().Be(course.CoverImageUrl);
        item.FileType.Should().Be("video");
        item.DurationSeconds.Should().Be(2400);
        item.ProcessingStatus.Should().Be("Ready");
        item.CourseId.Should().Be(course.Id);
        item.Progress.Should().NotBeNull();
        item.Progress!.LastPositionSeconds.Should().Be(300);
        item.Progress.CompletionPercent.Should().Be(12); // 12.5 → banker's rounding (MidpointRounding.ToEven, Math.Round default)
    }

    [Fact]
    public async Task List_FileEnrichment_CarriesOwnThumbnailTypeCategoryAndProgress()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var file = await SeedFileAsync(db, type: LibraryFileType.Video);
        AddFavorite(db, student.Id, libraryFileId: file.Id);
        db.PlaybackProgress.Add(new PlaybackProgress
        {
            StudentId = student.Id,
            AssetType = MediaAssetType.LibraryFile,
            AssetId = file.Id,
            LastPositionSeconds = 120,
            DurationSeconds = 900,
            CompletionPercent = 13.33m,
        });
        await db.SaveChangesAsync();
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, "file", "recent", 1, 20), CancellationToken.None);

        var item = result.Items.Single();
        item.ThumbnailUrl.Should().Be(file.ThumbnailUrl);
        item.FileType.Should().Be("video");
        item.DurationSeconds.Should().Be(900);
        item.Subtitle.Should().Be("Curriculum");
        item.CourseId.Should().BeNull();
        item.Progress.Should().NotBeNull();
        item.Progress!.LastPositionSeconds.Should().Be(120);
    }

    [Fact]
    public async Task List_QuestionEnrichment_ClampsLongTextAndNeverCarriesProgress()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var subject = TestDbHelper.GetTestSubject(db);
        var lecture = db.Lectures.First();
        var longText = new string('أ', 300);
        var question = Question.Create(longText, QuestionType.Mcq, subject.Id, lecture.Id, Difficulty.Easy, new List<string>(), db.Admins.First().Id);
        question.AddOption("خيار صحيح", true);
        question.AddOption("خيار آخر", false);
        question.UpdateExplanation("تفسير تجريبي للسؤال الطويل.");
        question.Publish();
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        AddFavorite(db, student.Id, questionId: question.Id);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, "question", "recent", 1, 20), CancellationToken.None);

        var item = result.Items.Single();
        item.Title.Length.Should().Be(161); // 160 chars + ellipsis
        item.Title.Should().EndWith("…");
        item.Subtitle.Should().Be(lecture.NameAr);
        item.ThumbnailUrl.Should().BeNull();
        item.FileType.Should().BeNull();
        item.Progress.Should().BeNull();
    }

    [Fact]
    public async Task List_EntitlementRevoked_ItemHidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        AddFavorite(db, student.Id, questionId: question.Id);
        var (handler, entitlements, _) = Create(db);
        entitlements
            .Setup(service => service.GetAccessibleSubjectMapAsync(
                It.IsAny<Guid>(), It.IsAny<IReadOnlyCollection<(Guid, SubscriptionContentScope)>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<SubscriptionContentScope, HashSet<Guid>>());

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, null, "recent", 1, 20), CancellationToken.None);

        result.Items.Should().BeEmpty();
        result.Total.Should().Be(0);
    }

    [Fact]
    public async Task List_UnpublishedCourse_EpisodeHidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        course.Status = ContentStatus.Draft;
        db.Courses.Update(course);
        await db.SaveChangesAsync();
        var episode = await SeedEpisodeAsync(db, course.Id);
        AddFavorite(db, student.Id, courseEpisodeId: episode.Id);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new GetFavoritesQuery(student.Id, null, "recent", 1, 20), CancellationToken.None);

        result.Items.Should().BeEmpty();
    }

    // ===== the ≤5-query contract (measured, real EntitlementService, SQLite) =====

    private sealed class QueryCountingInterceptor : DbCommandInterceptor
    {
        public int Executions;

        // NOTE: the ASYNC overrides are the ones that fire for EF async APIs (ToListAsync,
        // AnyAsync, CountAsync…). Overriding only the sync pair silently counts ZERO —
        // a false-positive trap this test explicitly guards against.
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Executions++;
            return ValueTask.FromResult(result);
        }

        public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
            DbCommand command, CommandEventData eventData, InterceptionResult<object> result, CancellationToken cancellationToken = default)
        {
            Executions++;
            return ValueTask.FromResult(result);
        }

        public override InterceptionResult<DbDataReader> ReaderExecuting(
            DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
        {
            Executions++;
            return result;
        }

        public override InterceptionResult<object> ScalarExecuting(
            DbCommand command, CommandEventData eventData, InterceptionResult<object> result)
        {
            Executions++;
            return result;
        }
    }

    private static (ApplicationDbContext Db, QueryCountingInterceptor Interceptor) CreateCountingContext()
    {
        var connection = new SqliteConnection("DataSource=:memory:");
        connection.Open();
        var interceptor = new QueryCountingInterceptor();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(connection)
            .AddInterceptors(interceptor)
            .Options;
        var db = new ApplicationDbContext(options);
        db.Database.EnsureCreated();
        TestDbHelper.SeedTestData(db);
        return (db, interceptor);
    }

    [Theory]
    [InlineData(20)]
    [InlineData(100)]
    public async Task List_QueryBudget_FiveCommandsRegardlessOfPageSize(int pageSize)
    {
        // Arrange a mixed page the realistic way: one question + one file + one episode
        // favorite, one FullSubject grant, and progress rows for the video assets —
        // then run the handler against the REAL EntitlementService on SQLite and count
        // every SQL command (readers + scalars).
        var (db, interceptor) = CreateCountingContext();
        try
        {
            var student = TestDbHelper.GetTestStudent(db);
            var subject = TestDbHelper.GetTestSubject(db);
            db.StudentSubscriptions.Add(new StudentSubscription
            {
                StudentId = student.Id,
                ScopeType = SubscriptionScopeType.Subject,
                ScopeSubjectId = subject.Id,
                ContentScope = SubscriptionContentScope.FullSubject,
                Status = SubscriptionStatus.Active,
                StartsAt = DateTime.UtcNow.AddMinutes(-1),
                ExpiresAt = DateTime.UtcNow.AddDays(7),
            });
            await db.SaveChangesAsync();

            var question = TestDbHelper.GetTestQuestion(db);
            var file = await SeedFileAsync(db, type: LibraryFileType.Video);
            var course = await SeedCourseAsync(db);
            var episode = await SeedEpisodeAsync(db, course.Id);
            AddFavorite(db, student.Id, questionId: question.Id);
            AddFavorite(db, student.Id, libraryFileId: file.Id);
            AddFavorite(db, student.Id, courseEpisodeId: episode.Id);
            db.PlaybackProgress.AddRange(
                new PlaybackProgress { StudentId = student.Id, AssetType = MediaAssetType.CourseEpisode, AssetId = episode.Id, LastPositionSeconds = 60, DurationSeconds = 2400, CompletionPercent = 2.5m },
                new PlaybackProgress { StudentId = student.Id, AssetType = MediaAssetType.LibraryFile, AssetId = file.Id, LastPositionSeconds = 30, DurationSeconds = 900, CompletionPercent = 3.33m });
            await db.SaveChangesAsync();

            interceptor.Executions = 0;
            var entitlements = new EntitlementService(db);
            var signed = new Mock<ISignedEntitlementService>();
            var handler = new FavoritesHandlers(db, new UnitOfWork(db), entitlements, signed.Object);

            var result = await handler.Handle(new GetFavoritesQuery(student.Id, null, "recent", 1, pageSize), CancellationToken.None);

            result.Items.Should().HaveCount(3); // all three types visible under the grant
            interceptor.Executions.Should().Be(5, $"the enriched list architecture issues EXACTLY 5 commands (favorites+targets fetch, student, subjects, subscriptions, progress) at pageSize={pageSize}; measured {interceptor.Executions}");
        }
        finally
        {
            db.Database.CloseConnection();
            await db.DisposeAsync();
        }
    }

    // ===== CreateEpisodeFavoriteCommand =====

    [Fact]
    public async Task CreateEpisodeFavorite_ReadyEpisode_CreatesRow()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new CreateEpisodeFavoriteCommand(student.Id, episode.Id, "token", "installation"), CancellationToken.None);

        result.IsNew.Should().BeTrue();
        result.Mutation.TargetType.Should().Be("episode");
        db.Favorites.AsNoTracking().Should().ContainSingle(favorite => favorite.StudentId == student.Id && favorite.CourseEpisodeId == episode.Id);
    }

    [Fact]
    public async Task CreateEpisodeFavorite_Duplicate_IsIdempotent()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        var existing = AddFavorite(db, student.Id, courseEpisodeId: episode.Id);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new CreateEpisodeFavoriteCommand(student.Id, episode.Id, "token", "installation"), CancellationToken.None);

        result.IsNew.Should().BeFalse();
        result.Mutation.FavoriteId.Should().Be(existing.Id);
        db.Favorites.AsNoTracking().Should().ContainSingle(favorite => favorite.CourseEpisodeId == episode.Id);
    }

    [Fact]
    public async Task CreateEpisodeFavorite_PendingEpisode_RejectedWithConflict()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id, status: ProcessingStatus.Pending);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new CreateEpisodeFavoriteCommand(student.Id, episode.Id, "token", "installation"), CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task CreateEpisodeFavorite_FailedEpisode_RejectedWith422Exception()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id, status: ProcessingStatus.Failed);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new CreateEpisodeFavoriteCommand(student.Id, episode.Id, "token", "installation"), CancellationToken.None);
        await act.Should().ThrowAsync<CMS.Application.Exceptions.MediaProcessingException>();
    }

    [Fact]
    public async Task CreateEpisodeFavorite_LegacyNullStatusEpisode_IsFavoritable()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id, status: null);
        var (handler, _, _) = Create(db);

        var result = await handler.Handle(new CreateEpisodeFavoriteCommand(student.Id, episode.Id, "token", "installation"), CancellationToken.None);

        result.IsNew.Should().BeTrue();
    }

    [Fact]
    public async Task CreateEpisodeFavorite_InvalidSignedEntitlement_Forbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        var (_, _, signed) = Create(db);
        signed
            .Setup(service => service.ValidateAsync(It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SignedEntitlementValidationResult(false, "expired", null));
        var handler = new FavoritesHandlers(db, new UnitOfWork(db), new Mock<IEntitlementService>().Object, signed.Object);

        var act = async () => await handler.Handle(new CreateEpisodeFavoriteCommand(student.Id, episode.Id, "token", "installation"), CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>();
        db.Favorites.AsNoTracking().Should().BeEmpty();
    }

    [Fact]
    public async Task CreateEpisodeFavorite_OutsideScope_Forbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        var (handler, _, _) = Create(db, allowAll: false);

        var act = async () => await handler.Handle(new CreateEpisodeFavoriteCommand(student.Id, episode.Id, "token", "installation"), CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ===== DeleteFavoriteCommand =====

    [Fact]
    public async Task DeleteFavorite_Episode_RemovesRow()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        AddFavorite(db, student.Id, courseEpisodeId: episode.Id);
        var (handler, _, _) = Create(db);

        await handler.Handle(new DeleteFavoriteCommand(student.Id, "episode", episode.Id, "token", "installation"), CancellationToken.None);

        db.Favorites.AsNoTracking().Should().BeEmpty();
    }

    [Fact]
    public async Task DeleteFavorite_AlreadyDeleted_IsIdempotent()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new DeleteFavoriteCommand(student.Id, "episode", episode.Id, "token", "installation"), CancellationToken.None);
        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task DeleteFavorite_OwnershipEnforced_AnotherStudentsRowUntouched()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var owner = TestDbHelper.GetTestStudent(db);
        var intruder = Student.Create("0999999999", "hash", "طالب متسلل");
        intruder.SetAcademicInfo(owner.UniversityId!.Value, owner.CollegeId!.Value, owner.AcademicYearId!.Value);
        intruder.VerifyPhone();
        db.Students.Add(intruder);
        await db.SaveChangesAsync();
        var course = await SeedCourseAsync(db);
        var episode = await SeedEpisodeAsync(db, course.Id);
        AddFavorite(db, owner.Id, courseEpisodeId: episode.Id);
        var (handler, _, _) = Create(db);

        await handler.Handle(new DeleteFavoriteCommand(intruder.Id, "episode", episode.Id, "token", "installation"), CancellationToken.None);

        db.Favorites.AsNoTracking().Should().ContainSingle(favorite => favorite.StudentId == owner.Id && favorite.CourseEpisodeId == episode.Id);
    }

    [Fact]
    public async Task DeleteFavorite_MissingEpisode_NotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new DeleteFavoriteCommand(student.Id, "episode", Guid.NewGuid(), "token", "installation"), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    // ===== legacy question/file create (regression: semantics preserved) =====

    [Fact]
    public async Task CreateQuestionFavorite_ExistingSemantics_Preserved()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var (handler, _, _) = Create(db);

        var created = await handler.Handle(new CreateQuestionOrFileFavoriteCommand(student.Id, question.Id, null, "token", "installation"), CancellationToken.None);
        var duplicate = await handler.Handle(new CreateQuestionOrFileFavoriteCommand(student.Id, question.Id, null, "token", "installation"), CancellationToken.None);

        created.IsNew.Should().BeTrue();
        duplicate.IsNew.Should().BeFalse();
        duplicate.Mutation.FavoriteId.Should().Be(created.Mutation.FavoriteId);
    }

    [Fact]
    public async Task CreateFavorite_BothTargetsSet_Rejected()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var file = await SeedFileAsync(db);
        var (handler, _, _) = Create(db);

        var act = async () => await handler.Handle(new CreateQuestionOrFileFavoriteCommand(student.Id, question.Id, file.Id, "token", "installation"), CancellationToken.None);
        await act.Should().ThrowAsync<DomainException>();
    }
}
