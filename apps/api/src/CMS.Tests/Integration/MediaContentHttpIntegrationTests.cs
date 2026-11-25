using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace CMS.Tests.Integration;

/// <summary>
/// WAVE-5 (offline media content) — the CONTRACT LOCK for the Android offline cache's
/// byte channel:
///   GET /api/v1/media/{assetType}/{assetId:guid}/content
///
/// Supervisor contract (frozen for the parallel Android agent):
///  - 401 without auth; 401 without X-Entitlement (+ X-Installation-Id, with the
///    X-Device-Fingerprint fallback); 403 on an invalid entitlement token.
///  - 200 with the EXACT stored bytes, the entity's Content-Type, and
///    Cache-Control: private, max-age=120 for a course-episode Upload video.
///  - 404 unknown asset id (both asset types); 403 entitlement-scope failure;
///    403 episode in a non-published course.
///  - 400 ProblemDetails errorCode MEDIA_YOUTUBE_HOSTED (YouTube episode, episode with
///    an empty FileKey, library video with YoutubeVideoId), EPISODE_UPLOAD_INCOMPLETE,
///    and MEDIA_TYPE_NOT_STREAMABLE (library document).
///  - 429 from the media-offline policy (60 requests / 5 minutes) on the 61st call
///    inside the window (see Content_RateLimit_SixtyFirstRequestInWindow_Returns429
///    for why this is cheap to simulate here).
///
/// Factory pattern cloned from HtmlViewHttpIntegrationTests (R51): WebApplicationFactory
/// + InMemory EF, RemoveAll&lt;IFileStorageService&gt; + the storage fake, the Phase45 test
/// authentication handler (X-Test-Student-Id → student principal), and forged signed
/// entitlement tokens minted with the factory's HMAC key. The rate-limit partition key
/// is per-installation, so every test that does not assert the limit itself uses the
/// shared InstallationA (well under 60 calls) while the limit test mints its own
/// installation bucket.
/// </summary>
public sealed class MediaContentHttpIntegrationTests : IClassFixture<MediaContentHttpFactory>
{
    private readonly MediaContentHttpFactory _factory;
    public MediaContentHttpIntegrationTests(MediaContentHttpFactory factory) => _factory = factory;

    // ===== gate: auth + signed entitlement =====

    [Fact]
    public async Task Content_WithoutAuth_Returns401()
    {
        var response = await _factory.Client.GetAsync($"/api/v1/media/course-episode/{_factory.UploadEpisodeId}/content");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Content_WithoutEntitlementHeaders_Returns401()
    {
        var request = _factory.ContentRequest("course-episode", _factory.UploadEpisodeId, entitlement: null, installationId: MediaContentHttpFactory.InstallationA);
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Content_InvalidEntitlementToken_Returns403()
    {
        var request = _factory.ContentRequest("course-episode", _factory.UploadEpisodeId, entitlement: "not-a-real-token", installationId: MediaContentHttpFactory.InstallationA);
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    /// <summary>
    /// Handler-side VideoAudio scope failure: the forged token is structurally valid
    /// (right student, right installation, subject allowed, device binding active) but
    /// the student carries NO subscription row — IEntitlementService.CanAccessSubject-
    /// ContentAsync answers false → 403. This is the gate the offline cache cannot
    /// bypass by replaying a token.
    /// </summary>
    [Fact]
    public async Task Content_EntitlementScopeFailure_Returns403()
    {
        var studentId = _factory.NewStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, MediaContentHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var request = _factory.ContentRequest("course-episode", _factory.UploadEpisodeId, token, MediaContentHttpFactory.InstallationA, studentId);
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Content_DeviceFingerprintFallback_IsAccepted()
    {
        // The frozen Android contract: X-Installation-Id may be replaced by
        // X-Device-Fingerprint — the gate falls back to it.
        var studentId = _factory.NewEntitledStudentId(MediaContentHttpFactory.DeviceFingerprintA);
        var token = _factory.CreateSignedTokenFor(studentId, MediaContentHttpFactory.DeviceFingerprintA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var request = _factory.ContentRequest("course-episode", _factory.UploadEpisodeId, token, installationId: null, studentId, deviceFingerprint: MediaContentHttpFactory.DeviceFingerprintA);
        var response = await _factory.Client.SendAsync(request);
        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Content_UnknownAssetIds_Returns404()
    {
        var token = _factory.CreateSignedToken(MediaContentHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));

        var episode = await _factory.Client.SendAsync(_factory.ContentRequest("course-episode", Guid.NewGuid(), token, MediaContentHttpFactory.InstallationA));
        episode.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var file = await _factory.Client.SendAsync(_factory.ContentRequest("library-file", Guid.NewGuid(), token, MediaContentHttpFactory.InstallationA));
        file.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    // ===== happy path: bytes through the API =====

    [Fact]
    public async Task Content_CourseEpisodeUploadVideo_Returns200WithBytesContentTypeAndCacheControl()
    {
        var studentId = _factory.NewEntitledStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, MediaContentHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var request = _factory.ContentRequest("course-episode", _factory.UploadEpisodeId, token, MediaContentHttpFactory.InstallationA, studentId);

        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.ToString().Should().Be("video/mp4");
        response.Headers.CacheControl!.Private.Should().BeTrue();
        response.Headers.CacheControl!.MaxAge.Should().Be(TimeSpan.FromSeconds(120));
        var bytes = await response.Content.ReadAsByteArrayAsync();
        bytes.Should().Equal(MediaContentHttpFactory.EpisodeBytes,
            "the offline cache stores exactly the bytes the storage served — no envelope, no transformation");
    }

    [Fact]
    public async Task Content_LibraryVideo_Returns200WithEntityContentType()
    {
        var studentId = _factory.NewEntitledStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, MediaContentHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var request = _factory.ContentRequest("library-file", _factory.LibraryVideoId, token, MediaContentHttpFactory.InstallationA, studentId);

        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        // webm is only present on the ENTITY row — proves Content-Type rides FileFormat,
        // not a hard-coded fallback.
        response.Content.Headers.ContentType!.ToString().Should().Be("video/webm");
        response.Headers.CacheControl!.Private.Should().BeTrue();
        response.Headers.CacheControl!.MaxAge.Should().Be(TimeSpan.FromSeconds(120));
        (await response.Content.ReadAsByteArrayAsync()).Should().Equal(MediaContentHttpFactory.LibraryVideoBytes);
    }

    [Fact]
    public async Task Content_LibraryAudio_MissingFileFormat_FallsBackToAudioMpeg()
    {
        var studentId = _factory.NewEntitledStudentId();
        var token = _factory.CreateSignedTokenFor(studentId, MediaContentHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var request = _factory.ContentRequest("library-file", _factory.LibraryAudioId, token, MediaContentHttpFactory.InstallationA, studentId);

        var response = await _factory.Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.ToString().Should().Be("audio/mpeg", "an audio row without FileFormat falls back to audio/mpeg");
    }

    // ===== rejections: ProblemDetails error codes =====

    [Fact]
    public async Task Content_YouTubeEpisode_Returns400WithProblemDetailsCode()
    {
        var response = await _factory.SendEntitledGetAsync("course-episode", _factory.YouTubeEpisodeId);
        await AssertProblemDetailsAsync(response, "MEDIA_YOUTUBE_HOSTED");
    }

    [Fact]
    public async Task Content_EpisodeWithEmptyFileKey_Returns400WithProblemDetailsCode()
    {
        var response = await _factory.SendEntitledGetAsync("course-episode", _factory.EmptyFileKeyEpisodeId);
        await AssertProblemDetailsAsync(response, "MEDIA_YOUTUBE_HOSTED");
    }

    [Fact]
    public async Task Content_UploadInProgressEpisode_Returns400WithProblemDetailsCode()
    {
        var response = await _factory.SendEntitledGetAsync("course-episode", _factory.IncompleteEpisodeId);
        await AssertProblemDetailsAsync(response, "EPISODE_UPLOAD_INCOMPLETE");
    }

    [Fact]
    public async Task Content_NonStreamableLibraryKind_Returns400WithProblemDetailsCode()
    {
        var response = await _factory.SendEntitledGetAsync("library-file", _factory.LibraryPdfId);
        await AssertProblemDetailsAsync(response, "MEDIA_TYPE_NOT_STREAMABLE");
    }

    [Fact]
    public async Task Content_LibraryVideoWithYoutubeId_Returns400WithProblemDetailsCode()
    {
        var response = await _factory.SendEntitledGetAsync("library-file", _factory.LibraryYouTubeVideoId);
        await AssertProblemDetailsAsync(response, "MEDIA_YOUTUBE_HOSTED");
    }

    [Fact]
    public async Task Content_EpisodeInDraftCourse_Returns403()
    {
        var response = await _factory.SendEntitledGetAsync("course-episode", _factory.DraftCourseEpisodeId);
        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ===== rate limit =====

    /// <summary>
    /// The media-offline policy is 60 requests / 5 minutes on the RateLimitKey
    /// partition. UseRateLimiter runs BEFORE authentication in the pipeline (Program.cs
    /// L394 vs L395), so unauthenticated requests still consume the bucket — which
    /// makes the simulation cheap: 60 headerless GETs (each answers 401, proving it
    /// passed the limiter and reached auth), then the 61st answers 429. The dedicated
    /// installation id keeps this bucket isolated from every other test's calls.
    /// </summary>
    [Fact]
    public async Task Content_RateLimit_SixtyFirstRequestInWindow_Returns429()
    {
        const string installation = "w5-media-content-rate-limit-installation";
        var url = $"/api/v1/media/course-episode/{_factory.UploadEpisodeId}/content";
        for (var attempt = 1; attempt <= 60; attempt++)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.TryAddWithoutValidation("X-Installation-Id", installation);
            var response = await _factory.Client.SendAsync(request);
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
                $"attempt {attempt} must pass the rate limiter (and fail at auth) before the limit");
        }

        var sixtyFirst = new HttpRequestMessage(HttpMethod.Get, url);
        sixtyFirst.Headers.TryAddWithoutValidation("X-Installation-Id", installation);
        var blocked = await _factory.Client.SendAsync(sixtyFirst);
        blocked.StatusCode.Should().Be(HttpStatusCode.TooManyRequests);
    }

    private static async Task AssertProblemDetailsAsync(HttpResponseMessage response, string expectedErrorCode)
    {
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("errorCode").GetString().Should().Be(expectedErrorCode);
    }
}

/// <summary>
/// WebApplicationFactory for the WAVE-5 media content route: InMemory EF database,
/// test authentication scheme (X-Test-Student-Id → "student" principal), the HtmlView
/// storage fake (real bytes as ground truth) and forged signed entitlement tokens.
/// Modeled on HtmlViewHttpFactory (R51) with Course/CourseEpisode fixtures added.
/// </summary>
public sealed class MediaContentHttpFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    internal const string InstallationA = "w5-media-content-installation-a";
    internal const string DeviceFingerprintA = "w5-media-content-fingerprint-a";
    private const string EntitlementKey = "w5-media-content-entitlement-test-key";

    private readonly string _databaseName = $"cms-w5-media-content-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection().AddEntityFrameworkInMemoryDatabase().BuildServiceProvider();
    private readonly ConcurrentDictionary<string, object?> _cache = new();
    private int _studentCounter;
    private Guid _universityId;
    private Guid _collegeId;
    private Guid _yearId;

    public HttpClient Client { get; private set; } = null!;
    public Guid StudentId { get; private set; }
    public Guid SubjectId { get; private set; }
    public Guid UploadEpisodeId { get; private set; }
    public Guid YouTubeEpisodeId { get; private set; }
    public Guid EmptyFileKeyEpisodeId { get; private set; }
    public Guid IncompleteEpisodeId { get; private set; }
    public Guid DraftCourseEpisodeId { get; private set; }
    public Guid LibraryVideoId { get; private set; }
    public Guid LibraryAudioId { get; private set; }
    public Guid LibraryPdfId { get; private set; }
    public Guid LibraryYouTubeVideoId { get; private set; }
    public HtmlViewStorageFake Storage { get; } = new();

    /// <summary>Distinct fixture bytes — proves each response body came from the right key.</summary>
    internal static byte[] EpisodeBytes { get; } = Encoding.UTF8.GetBytes("W5-episode-object-bytes");
    internal static byte[] LibraryVideoBytes { get; } = Encoding.UTF8.GetBytes("W5-library-video-object-bytes");
    internal static byte[] LibraryAudioBytes { get; } = Encoding.UTF8.GetBytes("W5-library-audio-object-bytes");

    public MediaContentHttpFactory()
    {
        // Same env contract OfflineHttpFactory/HtmlViewHttpFactory establish for Program.cs.
        Environment.SetEnvironmentVariable("Jwt__Secret", "w5-media-content-jwt-signing-key-not-production");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "w5-media-content-tests");
        Environment.SetEnvironmentVariable("Jwt__Audience", "w5-media-content-tests");
        Environment.SetEnvironmentVariable("Security__Entitlements__SigningKey", EntitlementKey);
        Environment.SetEnvironmentVariable("Security__Entitlements__LifetimeMinutes", "20");
        Environment.SetEnvironmentVariable("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Database=w5_media_content_test;Username=test");
        Environment.SetEnvironmentVariable("ConnectionStrings__Redis", "localhost:6379");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Database=w5_media_content_test;Username=test",
            ["ConnectionStrings:Redis"] = "localhost:6379",
            ["Jwt:Secret"] = "w5-media-content-jwt-signing-key-not-production",
            ["Jwt:Issuer"] = "w5-media-content-tests",
            ["Jwt:Audience"] = "w5-media-content-tests",
            ["Security:Entitlements:SigningKey"] = EntitlementKey,
            ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Cors:StudentApp"] = "https://student-web.test",
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
            ["Security:Audit:QueueCapacity"] = "100"
        }));
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<ApplicationDbContext>();
            services.RemoveAll<IApplicationDbContext>();
            services.AddDbContext<ApplicationDbContext>(options => options.UseInMemoryDatabase(_databaseName).UseInternalServiceProvider(_inMemoryEfServices));
            services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
            services.RemoveAll<ICacheService>();
            services.AddSingleton<ICacheService>(new OfflineHttpCache(_cache));
            services.RemoveAll<ISessionService>();
            var sessions = new Moq.Mock<ISessionService>();
            sessions.Setup(service => service.IsActiveAsync(Moq.It.IsAny<Guid>(), Moq.It.IsAny<int>(), Moq.It.IsAny<string>(), Moq.It.IsAny<CancellationToken>())).Returns(Task.FromResult(true));
            services.AddScoped<ISessionService>(_ => sessions.Object);
            services.RemoveAll<IFileStorageService>();
            services.AddSingleton<IFileStorageService>(Storage);
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = OfflineHttpAuthenticationHandler.Scheme;
                options.DefaultChallengeScheme = OfflineHttpAuthenticationHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, OfflineHttpAuthenticationHandler>(OfflineHttpAuthenticationHandler.Scheme, _ => { });
        });
    }

    public async Task InitializeAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var university = University.Create("جامعة W5", "w5-university", "W5 University");
        var college = College.Create(university.Id, "كلية W5", "w5-college", "W5 College");
        var year = AcademicYear.Create(college.Id, "السنة الأولى", "w5-year", 1);
        var semester = Semester.Create(year.Id, "الفصل الأول", "w5-semester", 1);
        var subject = Subject.Create(semester.Id, "مادة W5", "w5-subject", "W5 Subject");
        var student = Student.Create("0990007773", "w5-hash", "طالب W5");
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();

        var publishedCourse = new Course { SubjectId = subject.Id, Title = "كورس W5 المنشور", Status = ContentStatus.Published };
        var draftCourse = new Course { SubjectId = subject.Id, Title = "كورس W5 المسودة", Status = ContentStatus.Draft };
        db.AddRange(publishedCourse, draftCourse);

        var uploadEpisodeKey = $"courses/w5/{Guid.NewGuid():N}/episode.mp4";
        CourseEpisode UploadEpisode(int number, string title, string? fileKey, string? contentType, CourseEpisodeSource sourceType, string? uploadId = null, string? youtubeVideoId = null)
        {
            var episode = new CourseEpisode
            {
                CourseId = publishedCourse.Id,
                Title = title,
                EpisodeNumber = number,
                FileKey = fileKey,
                ContentType = contentType,
                SourceType = sourceType,
                UploadId = uploadId,
                YoutubeVideoId = youtubeVideoId,
                DurationSeconds = 2400
            };
            db.CourseEpisodes.Add(episode);
            return episode;
        }

        var uploadEpisode = UploadEpisode(1, "حلقة W5 المرفوعة", uploadEpisodeKey, "video/mp4", CourseEpisodeSource.Upload);
        var youTubeEpisode = UploadEpisode(2, "حلقة W5 على يوتيوب", null, null, CourseEpisodeSource.YouTube, youtubeVideoId: "w5yt123");
        var emptyFileKeyEpisode = UploadEpisode(3, "حلقة W5 بلا مفتاح", string.Empty, "video/mp4", CourseEpisodeSource.Upload);
        var incompleteEpisode = UploadEpisode(4, "حلقة W5 قيد الرفع", $"courses/w5/{Guid.NewGuid():N}/incomplete.mp4", "video/mp4", CourseEpisodeSource.Upload, uploadId: "multipart-in-progress");
        var draftCourseEpisode = new CourseEpisode
        {
            CourseId = draftCourse.Id,
            Title = "حلقة W5 في مسودة",
            EpisodeNumber = 99,
            FileKey = $"courses/w5/{Guid.NewGuid():N}/draft.mp4",
            ContentType = "video/mp4",
            SourceType = CourseEpisodeSource.Upload,
            DurationSeconds = 2400
        };
        db.CourseEpisodes.Add(draftCourseEpisode);

        LibraryFile LibraryFile(LibraryFileType type, string fileFormat)
        {
            var file = new LibraryFile
            {
                SubjectId = subject.Id,
                Type = type,
                Title = $"ملف W5 {type}",
                FileSize = 512,
                FileFormat = fileFormat,
                Status = ContentStatus.Published,
                VirusScanStatus = VirusScanStatus.Clean
            };
            file.FileUrl = $"library/w5/{file.Id:N}";
            db.LibraryFiles.Add(file);
            return file;
        }

        var libraryVideo = LibraryFile(LibraryFileType.Video, "video/webm");
        var libraryAudio = LibraryFile(LibraryFileType.Audio, null);
        var libraryPdf = LibraryFile(LibraryFileType.Pdf, "application/pdf");
        var libraryYouTubeVideo = LibraryFile(LibraryFileType.Video, "video/mp4");
        libraryYouTubeVideo.YoutubeVideoId = "w5yt456";

        Storage.Objects[uploadEpisodeKey] = EpisodeBytes;
        Storage.Objects[libraryVideo.FileUrl] = LibraryVideoBytes;
        Storage.Objects[libraryAudio.FileUrl] = LibraryAudioBytes;

        db.AddRange(university, college, year, semester, subject, student);
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student.Id, DeviceFingerprint = InstallationA, IsActive = true });
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = student.Id, ScopeType = SubscriptionScopeType.Subject, ScopeSubjectId = subject.Id,
            Status = SubscriptionStatus.Active, StartsAt = DateTime.UtcNow.AddMinutes(-1), ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await db.SaveChangesAsync();

        _universityId = university.Id;
        _collegeId = college.Id;
        _yearId = year.Id;
        StudentId = student.Id;
        SubjectId = subject.Id;
        UploadEpisodeId = uploadEpisode.Id;
        YouTubeEpisodeId = youTubeEpisode.Id;
        EmptyFileKeyEpisodeId = emptyFileKeyEpisode.Id;
        IncompleteEpisodeId = incompleteEpisode.Id;
        DraftCourseEpisodeId = draftCourseEpisode.Id;
        LibraryVideoId = libraryVideo.Id;
        LibraryAudioId = libraryAudio.Id;
        LibraryPdfId = libraryPdf.Id;
        LibraryYouTubeVideoId = libraryYouTubeVideo.Id;
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
    }

    /// <summary>
    /// R58-style test isolation: a fresh student identity per test, so the shared
    /// InstallationA 60-per-5-minute media-offline bucket can never make pass/fail
    /// depend on xUnit's execution order within the class. A bare Guid is NOT
    /// sufficient: SignedEntitlementService.ValidateAsync rejects a student whose
    /// (student, installation) device binding is not active, so the binding row is
    /// seeded here on demand (subscription deliberately NOT seeded — scope-failure
    /// tests rely on its absence).
    /// </summary>
    internal Guid NewStudentId()
    {
        var studentId = Guid.NewGuid();
        SeedDeviceBinding(studentId, InstallationA);
        return studentId;
    }

    /// <summary>
    /// Full happy-path identity: a real Student row (the handler-side EntitlementService
    /// check requires one), an active device binding on the given installation, and an
    /// active subject-scoped FullSubject grant — exactly the seeded default student's
    /// shape, but per-test isolated.
    /// </summary>
    internal Guid NewEntitledStudentId(string installation = InstallationA)
    {
        var student = Student.Create($"09900{++_studentCounter:D5}", "w5-hash", "طالب W5 جديد");
        student.SetAcademicInfo(_universityId, _collegeId, _yearId);
        student.VerifyPhone();
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.Students.Add(student);
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student.Id, DeviceFingerprint = installation, IsActive = true });
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = student.Id, ScopeType = SubscriptionScopeType.Subject, ScopeSubjectId = SubjectId,
            Status = SubscriptionStatus.Active, StartsAt = DateTime.UtcNow.AddMinutes(-1), ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        db.SaveChanges();
        return student.Id;
    }

    /// <summary>Seeds an active device binding — required for token validation.</summary>
    internal void SeedDeviceBinding(Guid studentId, string fingerprint)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        db.DeviceBindings.Add(new DeviceBinding { StudentId = studentId, DeviceFingerprint = fingerprint, IsActive = true });
        db.SaveChanges();
    }

    /// <summary>GET /content with the test student principal + entitlement headers (any of the two identifier headers).</summary>
    internal HttpRequestMessage ContentRequest(string assetType, Guid assetId, string? entitlement, string? installationId, Guid? studentId = null, string? deviceFingerprint = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/media/{assetType}/{assetId}/content");
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", (studentId ?? StudentId).ToString());
        if (!string.IsNullOrWhiteSpace(installationId)) request.Headers.TryAddWithoutValidation("X-Installation-Id", installationId);
        if (!string.IsNullOrWhiteSpace(deviceFingerprint)) request.Headers.TryAddWithoutValidation("X-Device-Fingerprint", deviceFingerprint);
        if (!string.IsNullOrWhiteSpace(entitlement)) request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    /// <summary>One entitled GET against the shared default student (token minted on demand).</summary>
    internal async Task<HttpResponseMessage> SendEntitledGetAsync(string assetType, Guid assetId)
    {
        var token = CreateSignedToken(InstallationA, new[] { SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var request = ContentRequest(assetType, assetId, token, InstallationA);
        return await Client.SendAsync(request);
    }

    internal string CreateSignedToken(string installationId, IReadOnlyList<Guid> subjects, DateTime issuedAt, DateTime expiresAt) =>
        CreateSignedTokenFor(StudentId, installationId, subjects, issuedAt, expiresAt);

    internal string CreateSignedTokenFor(Guid userId, string installationId, IReadOnlyList<Guid> subjects, DateTime issuedAt, DateTime expiresAt)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            userId, deviceId = installationId, universityId = (Guid?)null, collegeId = (Guid?)null,
            allowedYears = Array.Empty<Guid>(), allowedSemesters = Array.Empty<Guid>(), allowedSubjects = subjects,
            issuedAt, expiresAt, version = 1
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var signature = HMACSHA256.HashData(Encoding.UTF8.GetBytes(EntitlementKey), payload);
        return $"{Base64Url(payload)}.{Base64Url(signature)}";
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
