using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;
using CMS.Application.BackgroundJobs;
using CMS.Application.Commands.Courses;
using CMS.Application.DTOs.Courses;
using CMS.Application.DTOs.Media;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Domain.Constants;

namespace CMS.Application.Handlers.Courses;

/// <summary>
/// Handles all course and course-episode operations: student catalog + playback access,
/// admin course CRUD and episode CRUD. Episode uploads are SINGLE presigned PUTs
/// (Hotfix 10.8f — the S3 multipart strategy was abandoned after Upstash's session
/// credentials proved unable to CreateMultipartUpload on R2; the ceiling stays 2.5 GB,
/// enforced at initiate on the declared size, bound into the presigned URL, and
/// re-verified server-side against the stored object at complete; publishing at course
/// level only — د3; ContentStatus lifecycle — د2). Entitlement reuses the existing
/// content-scope model: playback requires an active grant over the subject with scope
/// VideoAudio (FullSubject/FullYear pass). View tracking is deferred (د5) — ViewsCount
/// increments on access issuance.
/// </summary>
public class CourseHandlers :
    IRequestHandler<GetSubjectCoursesQuery, List<CourseListItemDto>>,
    IRequestHandler<GetCourseByIdQuery, CourseDto>,
    IRequestHandler<GetEpisodeAccessCommand, EpisodeAccessDto>,
    IRequestHandler<GetAdminCourseByIdQuery, CourseDto>,
    IRequestHandler<CreateCourseCommand, CourseDto>,
    IRequestHandler<UpdateCourseCommand, CourseDto>,
    IRequestHandler<PublishCourseCommand, CourseDto>,
    IRequestHandler<ArchiveCourseCommand, CourseDto>,
    IRequestHandler<DeleteCourseCommand, Unit>,
    IRequestHandler<AddYouTubeEpisodeCommand, CourseEpisodeDto>,
    IRequestHandler<UpdateEpisodeCommand, CourseEpisodeDto>,
    IRequestHandler<DeleteEpisodeCommand, Unit>,
    IRequestHandler<InitiateEpisodeUploadCommand, InitiateUploadDto>,
    IRequestHandler<GetMultipartStatusQuery, MultipartStatusDto>,
    IRequestHandler<CompleteEpisodeUploadCommand, CourseEpisodeDto>,
    IRequestHandler<AbortEpisodeUploadCommand, Unit>,
    IRequestHandler<AbortEpisodeProcessingCommand, CourseEpisodeDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IFileStorageService _storage;
    private readonly IEntitlementService _entitlements;
    private readonly ISystemSettingsService _settings;
    private readonly IAdminActivityWriter _activity;
    private readonly ILogger<CourseHandlers> _logger;
    private readonly ITranscodingQueue _transcodingQueue;
    private readonly ITranscodingJobRegistry _transcodingJobRegistry;

    /// <summary>Legacy multipart sizing (pre-10.8f rows only — the GET multipart-status
    /// resume flow still needs it for uploads initiated before the single-PUT switch).</summary>
    private const long PartSizeBytes = 64L * 1024 * 1024;

    /// <summary>
    /// Hotfix 10.8f — sentinel stored in CourseEpisode.UploadId while a SINGLE-PUT upload
    /// is in flight. Upstash's session credentials cannot CreateMultipartUpload on R2
    /// (production 403), so course episodes now upload as ONE presigned PUT. The column
    /// keeps its lifecycle semantics unchanged (non-null = upload in flight, null = blob
    /// ready for playback) with zero schema change: the sentinel occupies the "in flight"
    /// slot, and complete-upload clears it exactly like a real multipart id used to.
    /// Legacy rows carrying REAL multipart ids (created before this hotfix) keep their
    /// original abort/status behavior.
    /// </summary>
    internal const string SinglePutUploadId = "single-put";

    /// <summary>Video/audio MIME allow-list for course episodes. Documents belong to the library, not courses.</summary>
    private static readonly HashSet<string> AllowedEpisodeContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "audio/mpeg",
        "audio/mp4",
        "audio/wav",
        "audio/webm"
    };

    private const string VideoLimitSettingKey = "upload.limit.video_mb";
    private const int DefaultVideoLimitMb = 2560;

    /// <summary>Playback URL TTL — single source of truth: <see cref="MediaPolicy"/> (540 s = 9 min,
    /// under the provider's 10-minute presign cap with clock-skew headroom). The player refreshes
    /// on error/stall so long videos keep playing across refreshes.</summary>
    private static readonly TimeSpan PlaybackUrlTtl = TimeSpan.FromSeconds(MediaPolicy.PlaybackUrlTtlSeconds);

    public CourseHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IFileStorageService storage,
        IEntitlementService entitlements,
        ISystemSettingsService settings,
        IAdminActivityWriter activity,
        ILogger<CourseHandlers> logger,
        ITranscodingQueue transcodingQueue,
        // Push 10.8 — the abort bridge for abort-processing (kills in-flight FFmpeg).
        ITranscodingJobRegistry transcodingJobRegistry)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _storage = storage;
        _entitlements = entitlements;
        _settings = settings;
        _activity = activity;
        _logger = logger;
        _transcodingQueue = transcodingQueue;
        _transcodingJobRegistry = transcodingJobRegistry;
    }

    // ===== Student: catalog =====
    public async Task<List<CourseListItemDto>> Handle(GetSubjectCoursesQuery req, CancellationToken ct)
    {
        // Subject-level access first (mirrors GetLibraryFilesQuery), then the content-scope
        // filter: only students with a VideoAudio-capable grant see the course catalog.
        if (!await _entitlements.CanAccessSubjectAsync(req.StudentId, req.SubjectId, "video", ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى كورسات هذه المادة");
        if (!await _entitlements.CanAccessSubjectContentAsync(req.StudentId, req.SubjectId, SubscriptionContentScope.VideoAudio, ct))
            return [];

        var courses = await _db.Courses.AsNoTracking()
            .Where(course => course.SubjectId == req.SubjectId
                && course.Status == ContentStatus.Published
                && course.DeletedAt == null)
            .OrderByDescending(course => course.CreatedAt)
            .Select(course => new CourseListItemDto(
                course.Id,
                course.SubjectId,
                course.Subject.NameAr,
                course.Title,
                course.Description,
                course.CoverImageUrl,
                course.Episodes.Count(episode => episode.DeletedAt == null),
                course.Episodes.Where(episode => episode.DeletedAt == null).Sum(episode => episode.DurationSeconds ?? 0),
                course.Episodes.Where(episode => episode.DeletedAt == null).Sum(episode => episode.ViewsCount)))
            .ToListAsync(ct);

        return courses;
    }

    public async Task<CourseDto> Handle(GetCourseByIdQuery req, CancellationToken ct)
    {
        var course = await _db.Courses.AsNoTracking()
            .Include(course => course.Episodes)
            .FirstOrDefaultAsync(course => course.Id == req.Id
                && course.Status == ContentStatus.Published
                && course.DeletedAt == null, ct)
            ?? throw new NotFoundException("Course", req.Id);

        if (!await _entitlements.CanAccessSubjectContentAsync(req.StudentId, course.SubjectId, SubscriptionContentScope.VideoAudio, ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى هذا الكورس");

        return MapToCourseDto(course);
    }

    // ===== Student: playback access =====
    public async Task<EpisodeAccessDto> Handle(GetEpisodeAccessCommand req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.AsNoTracking()
            .Where(episode => episode.Id == req.EpisodeId && episode.DeletedAt == null)
            .Select(episode => new
            {
                Episode = episode,
                CourseSubjectId = episode.Course.SubjectId,
                CourseStatus = episode.Course.Status,
                CourseDeleted = episode.Course.DeletedAt != null
            })
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("CourseEpisode", req.EpisodeId);

        if (episode.CourseDeleted || episode.CourseStatus != ContentStatus.Published)
            throw new ForbiddenException("هذا الكورس غير متاح");

        if (episode.Episode.SourceType == CourseEpisodeSource.Upload && !string.IsNullOrEmpty(episode.Episode.UploadId))
            throw new DomainException("لم يكتمل رفع هذه الحلقة بعد", "EPISODE_UPLOAD_INCOMPLETE");

        if (!await _entitlements.CanAccessSubjectContentAsync(req.StudentId, episode.CourseSubjectId, SubscriptionContentScope.VideoAudio, ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى هذه الحلقة");

        var student = await _db.Students.AsNoTracking().FirstOrDefaultAsync(s => s.Id == req.StudentId, ct)
            ?? throw new NotFoundException("Student", req.StudentId);

        string accessUrl;
        DateTime expiresAt;
        if (episode.Episode.SourceType == CourseEpisodeSource.YouTube && !string.IsNullOrEmpty(episode.Episode.YoutubeVideoId))
        {
            accessUrl = $"https://www.youtube.com/embed/{episode.Episode.YoutubeVideoId}?rel=0&modestbranding=1";
            expiresAt = DateTime.UtcNow.AddHours(1);
        }
        else
        {
            // Object-scoped presign via the Upstash agent (/v1/presign) — Push 10.0c
            // security fix (legacy vulnerability since Push 4): the old credential-lease
            // path embedded the bucket-wide session token (X-Amz-Security-Token) in
            // every episode access URL. Agent-signed URLs name one object only, support
            // Range streaming, and the player refreshes the URL on error/stall.
            accessUrl = await _storage.GetSignedUrlAsync(episode.Episode.FileKey!, PlaybackUrlTtl, ct);
            expiresAt = DateTime.UtcNow.Add(PlaybackUrlTtl);
        }

        // Best-effort view counter (د5: durable view tracking deferred).
        var tracked = await _db.CourseEpisodes.FirstOrDefaultAsync(e => e.Id == req.EpisodeId, ct);
        if (tracked is not null)
        {
            typeof(CourseEpisode).GetProperty("ViewsCount")?.SetValue(tracked, tracked.ViewsCount + 1);
            await _unitOfWork.SaveChangesAsync(ct);
        }

        return new EpisodeAccessDto(accessUrl, expiresAt, BuildWatermark(student));
    }

    // ===== Admin: courses list =====
    public async Task<CourseDto> Handle(GetAdminCourseByIdQuery req, CancellationToken ct)
    {
        var course = await _db.Courses.AsNoTracking()
            .Include(course => course.Episodes)
            .FirstOrDefaultAsync(course => course.Id == req.Id && course.DeletedAt == null, ct)
            ?? throw new NotFoundException("Course", req.Id);
        return MapToCourseDto(course);
    }

    // ===== Admin: course CRUD =====
    public async Task<CourseDto> Handle(CreateCourseCommand req, CancellationToken ct)
    {
        var subjectExists = await _db.Subjects.AsNoTracking()
            .AnyAsync(subject => subject.Id == req.SubjectId && subject.DeletedAt == null && subject.Status == "active", ct);
        if (!subjectExists)
            throw new NotFoundException("Subject", req.SubjectId);

        var course = new Course
        {
            SubjectId = req.SubjectId,
            Title = req.Title,
            Description = req.Description,
            CoverImageUrl = req.CoverImageUrl,
            Status = ContentStatus.Draft
        };
        typeof(Course).GetProperty("CreatedBy")?.SetValue(course, req.CreatedBy);

        await _db.Courses.AddAsync(course, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        await _activity.LogAsync(req.CreatedBy, AdminActivityActionType.CreateCourse, course.Id.ToString(),
            new { courseId = course.Id, subjectId = course.SubjectId, title = course.Title }, ct: ct);

        return MapToCourseDto(course);
    }

    public async Task<CourseDto> Handle(UpdateCourseCommand req, CancellationToken ct)
    {
        var course = await _db.Courses.FirstOrDefaultAsync(course => course.Id == req.Id && course.DeletedAt == null, ct)
            ?? throw new NotFoundException("Course", req.Id);

        typeof(Course).GetProperty("Title")?.SetValue(course, req.Title);
        typeof(Course).GetProperty("Description")?.SetValue(course, req.Description);
        typeof(Course).GetProperty("CoverImageUrl")?.SetValue(course, req.CoverImageUrl);

        await _unitOfWork.SaveChangesAsync(ct);
        return MapToCourseDto(course);
    }

    public async Task<CourseDto> Handle(PublishCourseCommand req, CancellationToken ct)
    {
        var course = await _db.Courses
            .Include(course => course.Episodes)
            .FirstOrDefaultAsync(course => course.Id == req.Id && course.DeletedAt == null, ct)
            ?? throw new NotFoundException("Course", req.Id);

        // Course-level publishing (د3) — but a published course must have at least one
        // completed episode, otherwise students would see an empty shell.
        if (course.Episodes.Count(episode => episode.DeletedAt == null
                && (episode.SourceType == CourseEpisodeSource.YouTube || string.IsNullOrEmpty(episode.UploadId))) == 0)
        {
            throw new DomainException("لا يمكن نشر كورس بدون حلقة مكتملة واحدة على الأقل", "COURSE_EMPTY");
        }

        course.Status = ContentStatus.Published;
        await _unitOfWork.SaveChangesAsync(ct);
        return MapToCourseDto(course);
    }

    public async Task<CourseDto> Handle(ArchiveCourseCommand req, CancellationToken ct)
    {
        var course = await _db.Courses.FirstOrDefaultAsync(course => course.Id == req.Id && course.DeletedAt == null, ct)
            ?? throw new NotFoundException("Course", req.Id);

        course.Status = ContentStatus.Archived;
        await _unitOfWork.SaveChangesAsync(ct);
        return MapToCourseDto(course);
    }

    public async Task<Unit> Handle(DeleteCourseCommand req, CancellationToken ct)
    {
        var course = await _db.Courses
            .Include(course => course.Episodes)
            .FirstOrDefaultAsync(course => course.Id == req.Id, ct)
            ?? throw new NotFoundException("Course", req.Id);

        // Abort any in-flight multipart upload before deleting its rows.
        foreach (var episode in course.Episodes.Where(episode => !string.IsNullOrEmpty(episode.UploadId)))
        {
            try { await _storage.AbortMultipartUploadAsync(episode.FileKey!, episode.UploadId!, ct); }
            catch (Exception ex) { _logger.LogWarning(ex, "Multipart abort failed during course delete. EpisodeId={EpisodeId}", episode.Id); }
        }

        typeof(Course).GetProperty("DeletedAt")?.SetValue(course, DateTime.UtcNow);
        typeof(Course).GetProperty("DeletedBy")?.SetValue(course, req.DeletedBy);
        typeof(Course).GetProperty("Status")?.SetValue(course, ContentStatus.Deleted);
        await _unitOfWork.SaveChangesAsync(ct);

        // Best-effort blob cleanup — a storage failure must NOT fail the committed delete.
        foreach (var episode in course.Episodes.Where(episode => episode.SourceType == CourseEpisodeSource.Upload && !string.IsNullOrEmpty(episode.FileKey)))
        {
            try { await _storage.DeleteAsync(episode.FileKey!, ct); }
            catch (Exception ex) { _logger.LogWarning(ex, "Blob cleanup failed after course delete. EpisodeId={EpisodeId} FileKey={FileKey}", episode.Id, episode.FileKey); }
        }

        return Unit.Value;
    }

    // ===== Admin: episode CRUD =====
    public async Task<CourseEpisodeDto> Handle(AddYouTubeEpisodeCommand req, CancellationToken ct)
    {
        var course = await _db.Courses.FirstOrDefaultAsync(course => course.Id == req.CourseId && course.DeletedAt == null, ct)
            ?? throw new NotFoundException("Course", req.CourseId);

        await EnsureEpisodeNumberUsableAsync(req.CourseId, req.EpisodeNumber, null, ct);

        var episode = new CourseEpisode
        {
            CourseId = req.CourseId,
            Title = req.Title,
            EpisodeNumber = req.EpisodeNumber,
            DurationSeconds = req.DurationSeconds,
            SourceType = CourseEpisodeSource.YouTube,
            YoutubeVideoId = req.YoutubeVideoId,
        };
        typeof(CourseEpisode).GetProperty("CreatedBy")?.SetValue(episode, req.CreatedBy);

        await _db.CourseEpisodes.AddAsync(episode, ct);
        await SaveEpisodesWithNumberGuardAsync(ct);
        return MapToEpisodeDto(episode);
    }

    public async Task<CourseEpisodeDto> Handle(UpdateEpisodeCommand req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.FirstOrDefaultAsync(episode => episode.Id == req.Id && episode.DeletedAt == null, ct)
            ?? throw new NotFoundException("CourseEpisode", req.Id);

        await EnsureEpisodeNumberUsableAsync(episode.CourseId, req.EpisodeNumber, req.Id, ct);

        typeof(CourseEpisode).GetProperty("Title")?.SetValue(episode, req.Title);
        typeof(CourseEpisode).GetProperty("EpisodeNumber")?.SetValue(episode, req.EpisodeNumber);
        typeof(CourseEpisode).GetProperty("DurationSeconds")?.SetValue(episode, req.DurationSeconds);

        // Push 10.5 — PATCH-optional metadata from the 10.4 edit modal: null keys
        // leave the stored values untouched; an explicit description (even empty)
        // replaces the stored one after trimming.
        if (req.Description is not null)
            episode.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        if (req.Difficulty is not null)
            episode.Difficulty = req.Difficulty.Value;
        // Push 10.7 — PATCH-optional transcoding target (the edit modal's quality
        // dropdown): applies on the next encode; an already-Ready episode keeps its
        // existing HLS tree until re-encoded.
        if (req.TargetQuality is not null)
            episode.TargetQuality = req.TargetQuality.Value;

        await SaveEpisodesWithNumberGuardAsync(ct);
        return MapToEpisodeDto(episode);
    }

    public async Task<Unit> Handle(DeleteEpisodeCommand req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.FirstOrDefaultAsync(episode => episode.Id == req.Id, ct)
            ?? throw new NotFoundException("CourseEpisode", req.Id);

        string? fileKey = episode.FileKey;
        string? uploadId = episode.UploadId;

        // Push 11.3.1 — DeletedAt/DeletedBy is a SOFT delete: the row survives (only the
        // stored blob below is hard-removed), so this save is guarded defensively — with
        // favorites.course_episode_id ON DELETE RESTRICT, any future switch of this flow
        // to a hard row removal must surface the Arabic 409 (ExceptionHandlingMiddleware
        // maps ConflictException → HttpStatusCode.Conflict), never the raw 500.
        typeof(CourseEpisode).GetProperty("DeletedAt")?.SetValue(episode, DateTime.UtcNow);
        typeof(CourseEpisode).GetProperty("DeletedBy")?.SetValue(episode, req.DeletedBy);
        try
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsFavoritesEpisodeRestrict(ex))
        {
            _logger.LogWarning(
                "Episode delete blocked by favorites FK. EpisodeId={EpisodeId}", episode.Id);
            throw new ConflictException(
                "لا يمكن حذف الحلقة — بعض الطلاب أضافوها إلى المفضلة. استخدم زر الأرشفة بدلًا من الحذف.");
        }

        try
        {
            if (!string.IsNullOrEmpty(uploadId) && !string.IsNullOrEmpty(fileKey))
                await _storage.AbortMultipartUploadAsync(fileKey, uploadId, ct);
            if (episode.SourceType == CourseEpisodeSource.Upload && !string.IsNullOrEmpty(fileKey))
                await _storage.DeleteAsync(fileKey, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Blob cleanup failed after episode delete. EpisodeId={EpisodeId}", episode.Id);
        }

        return Unit.Value;
    }

    // ===== Admin: single-PUT upload orchestration (Hotfix 10.8f) =====
    public async Task<InitiateUploadDto> Handle(InitiateEpisodeUploadCommand req, CancellationToken ct)
    {
        var course = await _db.Courses.FirstOrDefaultAsync(course => course.Id == req.CourseId && course.DeletedAt == null, ct)
            ?? throw new NotFoundException("Course", req.CourseId);

        if (string.IsNullOrWhiteSpace(req.ContentType) || !AllowedEpisodeContentTypes.Contains(req.ContentType.Trim()))
            throw new DomainException("نوع الملف غير مسموح به في الحلقات (فيديو أو صوت فقط)", "INVALID_FILE_TYPE");

        var maxBytes = await GetVideoLimitBytesAsync(ct);
        if (req.FileSize <= 0 || req.FileSize > maxBytes)
            throw new DomainException(
                $"حجم الملف يتجاوز الحد المسموح لفيديوهات الكورسات ({maxBytes / (1024 * 1024)} ميجابايت)",
                "FILE_TOO_LARGE");

        await EnsureEpisodeNumberUsableAsync(req.CourseId, req.EpisodeNumber, null, ct);

        // Server-generated key (never user input — prevents path traversal). NOTE (Push 7):
        // the original fileName — Arabic or otherwise — is NEVER part of the key and never
        // enters any S3 request header; only this pure-GUID key and the sniffed content
        // type reach storage. Arabic filenames were proven innocent by production logs.
        var fileKey = $"courses/{req.CourseId}/{Guid.NewGuid():N}/{Guid.NewGuid():N}";

        // Hotfix 10.8f: ONE presigned PUT URL for the WHOLE file — the native Upstash
        // /v1/presign flow the library module already uses in production (no S3 session
        // credentials, no CreateMultipartUpload — the exact call R2 keeps rejecting with
        // 403 for Upstash's temporary credentials). The declared content type AND size are
        // bound into the signature, so storage rejects a differently-typed or differently-
        // sized body before a single byte is stored. Expiry: 10 minutes — the provider's
        // presign cap (MediaPolicy.UpstashPresignCapSeconds); the entire file must be PUT
        // within that window, which is the honest limitation of the single-PUT strategy.
        var uploadUrl = await _storage.GetSignedUploadUrlAsync(
            fileKey, req.ContentType.Trim(), TimeSpan.FromMinutes(10), req.FileSize, ct);

        var episode = new CourseEpisode
        {
            CourseId = req.CourseId,
            Title = req.Title,
            EpisodeNumber = req.EpisodeNumber,
            SourceType = CourseEpisodeSource.Upload,
            FileKey = fileKey,
            FileSize = req.FileSize, // declared; replaced by the verified actual size at complete
            ContentType = req.ContentType.Trim(),
            UploadId = SinglePutUploadId, // sentinel — "upload in flight" marker, cleared at complete
        };
        typeof(CourseEpisode).GetProperty("CreatedBy")?.SetValue(episode, req.CreatedBy);

        await _db.CourseEpisodes.AddAsync(episode, ct);
        await SaveEpisodesWithNumberGuardAsync(ct);

        // Hotfix 10.6 (1.A) pattern, carried into 10.8f: one low-noise diagnostics line —
        // presigned host+path with the query string (signature) redacted, so Render logs
        // alone prove the URL targets the R2 storage host with the expected path-style
        // bucket addressing on the PUT verb.
        if (Uri.TryCreate(uploadUrl, UriKind.Absolute, out var presigned))
            _logger.LogInformation(
                "Single-PUT presign: whole-file UploadUrl for episode {EpisodeId} ({FileSizeBytes} bytes); sample (query redacted): {SampleUrl}",
                episode.Id, req.FileSize, presigned.GetLeftPart(UriPartial.Path));

        return new InitiateUploadDto(episode.Id, uploadUrl, fileKey);
    }

    public async Task<MultipartStatusDto> Handle(GetMultipartStatusQuery req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.AsNoTracking()
            .FirstOrDefaultAsync(episode => episode.Id == req.EpisodeId && episode.DeletedAt == null, ct);

        // Hotfix 10.6 (1.D): a status poll racing the upload lifecycle (episode already
        // completed → UploadId cleared; aborted → row removed; never initiated) must
        // degrade gracefully. Answer with an explicit inactive status instead of the
        // old 400 NO_ACTIVE_UPLOAD — the admin UI then resets cleanly instead of
        // freezing mid-upload.
        if (episode is null || string.IsNullOrEmpty(episode.UploadId) || string.IsNullOrEmpty(episode.FileKey))
            return InactiveMultipartStatus(req.EpisodeId);

        // Hotfix 10.8f: single-PUT episodes carry the sentinel marker — there is no
        // multipart session upstream by construction, so answering inactive (without
        // a pointless S3 ListParts round-trip) is the honest answer. New frontends never
        // call this endpoint; the short-circuit keeps old cached clients degrading
        // gracefully during the deploy switchover.
        if (episode.UploadId == SinglePutUploadId)
            return InactiveMultipartStatus(req.EpisodeId);

        List<CMS.Application.Interfaces.UploadedPartInfo> storedParts;
        try
        {
            storedParts = await _storage.ListMultipartPartsAsync(episode.FileKey, episode.UploadId, ct);
        }
        catch (Exception ex) when (IsNoSuchUpload(ex))
        {
            // The multipart session no longer exists upstream (aborted server-side,
            // expired, or completed elsewhere while UploadId lingered in the DB) —
            // same graceful inactive answer, plus a warning for ops.
            _logger.LogWarning(ex, "Multipart session for episode {EpisodeId} no longer exists upstream", req.EpisodeId);
            return InactiveMultipartStatus(req.EpisodeId);
        }

        var storedNumbers = storedParts.Select(part => part.PartNumber).ToHashSet();

        var partCount = (int)Math.Ceiling((episode.FileSize ?? PartSizeBytes) / (double)PartSizeBytes);
        var pendingUrls = new List<string>();
        for (var partNumber = 1; partNumber <= partCount; partNumber++)
        {
            if (!storedNumbers.Contains(partNumber))
                pendingUrls.Add(await _storage.PresignUploadPartAsync(episode.FileKey, episode.UploadId, partNumber, TimeSpan.FromMinutes(9), ct));
        }

        // Hotfix 10.6 (1.A): one low-noise diagnostics line — presigned host+path with
        // the query string (signature) redacted, so Render logs alone prove the URLs
        // target the R2 storage host on the expected PUT verb.
        if (pendingUrls.Count > 0 && Uri.TryCreate(pendingUrls[0], UriKind.Absolute, out var sample))
            _logger.LogInformation(
                "Multipart status presign: {PendingCount} UploadPart PUT URLs for episode {EpisodeId}; sample (query redacted): {SampleUrl}",
                pendingUrls.Count, episode.Id, sample.GetLeftPart(UriPartial.Path));

        return new MultipartStatusDto(
            episode.Id, episode.UploadId, episode.FileKey, (int)PartSizeBytes, partCount,
            storedParts.Select(part => new UploadedPartStateDto(part.PartNumber, part.Size, part.ETag)).ToList(),
            pendingUrls);
    }

    /// <summary>Hotfix 10.6 (1.D): explicit "no live multipart session" answer — empty
    /// payloads plus <c>HasActiveUpload = false</c>; the client stops gracefully.</summary>
    private static MultipartStatusDto InactiveMultipartStatus(Guid episodeId) => new(
        episodeId, string.Empty, string.Empty, (int)PartSizeBytes, 0, [], [], HasActiveUpload: false);

    /// <summary>
    /// Matches the S3 "NotFound"/"NoSuchKey" failure without referencing the AWS SDK:
    /// the Application layer must stay AWS-free (Infrastructure owns the SDK), so the
    /// check is name- and payload-based — exact type name, its ErrorCode property (read
    /// defensively), and the documented message phrasing shared by S3 and R2 for a
    /// HEAD against a key that was never stored.
    /// </summary>
    private static bool IsObjectNotFound(Exception ex)
    {
        if (ex.GetType().Name != "AmazonS3Exception")
            return false;
        var errorCode = ex.GetType().GetProperty("ErrorCode")?.GetValue(ex) as string;
        return string.Equals(errorCode, "NotFound", StringComparison.Ordinal)
            || string.Equals(errorCode, "NoSuchKey", StringComparison.Ordinal)
            || ex.Message.Contains("does not exist", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("key does not exist", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Matches the S3 "NoSuchUpload" failure without referencing the AWS SDK: the
    /// Application layer must stay AWS-free (Infrastructure owns the SDK), so the
    /// check is name- and payload-based — exact type name, its ErrorCode property
    /// (read defensively), and the documented message phrasing shared by S3 and R2.
    /// </summary>
    private static bool IsNoSuchUpload(Exception ex)
    {
        if (ex.GetType().Name != "AmazonS3Exception")
            return false;
        var errorCode = ex.GetType().GetProperty("ErrorCode")?.GetValue(ex) as string;
        return string.Equals(errorCode, "NoSuchUpload", StringComparison.Ordinal)
            || ex.Message.Contains("NoSuchUpload", StringComparison.Ordinal)
            || ex.Message.Contains("does not exist", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<CourseEpisodeDto> Handle(CompleteEpisodeUploadCommand req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.FirstOrDefaultAsync(episode => episode.Id == req.EpisodeId && episode.DeletedAt == null, ct)
            ?? throw new NotFoundException("CourseEpisode", req.EpisodeId);

        if (string.IsNullOrEmpty(episode.UploadId) || string.IsNullOrEmpty(episode.FileKey))
            throw new DomainException("لا يوجد رفع نشط لهذه الحلقة", "NO_ACTIVE_UPLOAD");

        // Hotfix 10.8f: no parts to assemble — the browser already PUT the whole file in
        // one request. Trust, but verify server-side: HEAD the stored object to prove the
        // PUT actually landed (a complete-upload racing a failed PUT gets a clean 400,
        // not an opaque upstream 500) and read its exact size for the ceiling check.
        long actualSize;
        try
        {
            actualSize = await _storage.GetObjectSizeAsync(episode.FileKey, ct);
        }
        catch (Exception ex) when (IsObjectNotFound(ex))
        {
            throw new DomainException(
                "لم يُعثر على الملف في المخزن — تأكد أن رفع الملف اكتمل ثم أعد المحاولة",
                "BLOB_NOT_FOUND");
        }

        // Defense in depth: the ceiling was enforced on the declared size at initiate and
        // the declared size is bound into the presigned URL's signature — this independent
        // check verifies the ACTUAL stored object against the ceiling before accepting.
        var maxBytes = await GetVideoLimitBytesAsync(ct);
        if (actualSize > maxBytes)
        {
            try { await _storage.DeleteAsync(episode.FileKey, ct); } catch { /* best effort */ }
            _db.CourseEpisodes.Remove(episode);
            await _unitOfWork.SaveChangesAsync(ct);
            throw new DomainException(
                $"الحجم الفعلي للملف ({actualSize / (1024 * 1024)} ميجابايت) يتجاوز الحد المسموح ({maxBytes / (1024 * 1024)} ميجابايت)",
                "FILE_TOO_LARGE");
        }

        typeof(CourseEpisode).GetProperty("FileSize")?.SetValue(episode, actualSize);
        typeof(CourseEpisode).GetProperty("UploadId")?.SetValue(episode, null); // blob ready for playback

        // Push 10.5 — metadata from the 10.4 upload panel rides the completion body
        // (title/description/difficulty). Null keys keep the initiate-time values;
        // difficulty applies only when provided.
        if (!string.IsNullOrWhiteSpace(req.Title))
            episode.Title = req.Title.Trim();
        if (req.Description is not null)
            episode.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        if (req.Difficulty is not null)
            episode.Difficulty = req.Difficulty.Value;
        // Push 10.7 — the admin-selected transcoding target is persisted with the same
        // commit the upload completes in, BEFORE the enqueue below, so the worker reads
        // the final value when the job starts. Absent key = keep the stored target.
        if (req.TargetQuality is not null)
            episode.TargetQuality = req.TargetQuality.Value;

        // Push 10.3: video assets enter the FFmpeg HLS pipeline the moment the upload
        // completes (same commit as the blob-ready marker). Audio episodes and YouTube
        // episodes keep ProcessingStatus NULL — the pipeline never applies to them and
        // null is the established "directly playable" contract (Push 10.5).
        if (episode.ContentType?.StartsWith("video/", StringComparison.OrdinalIgnoreCase) == true)
            episode.ProcessingStatus = ProcessingStatus.Pending;

        await _unitOfWork.SaveChangesAsync(ct);

        await _activity.LogAsync(episode.CreatedBy, AdminActivityActionType.UploadEpisode, episode.Id.ToString(),
            new { episodeId = episode.Id, courseId = episode.CourseId, fileSize = actualSize, contentType = episode.ContentType }, ct: ct);

        // Enqueue AFTER the commit: an in-memory queue must never observe a rolled-back row.
        // A full queue leaves the episode Pending — a later sweep re-enqueues it.
        if (episode.ProcessingStatus == ProcessingStatus.Pending
            && !_transcodingQueue.TryEnqueue(new TranscodingJob(MediaAssetType.CourseEpisode, episode.Id)))
        {
            _logger.LogWarning("Transcoding queue at capacity; episode {EpisodeId} stays Pending until re-enqueued", episode.Id);
        }

        return MapToEpisodeDto(episode);
    }

    public async Task<Unit> Handle(AbortEpisodeUploadCommand req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.FirstOrDefaultAsync(episode => episode.Id == req.EpisodeId, ct)
            ?? throw new NotFoundException("CourseEpisode", req.EpisodeId);

        if (string.IsNullOrEmpty(episode.UploadId) || string.IsNullOrEmpty(episode.FileKey))
            throw new DomainException("لا يوجد رفع نشط لهذه الحلقة", "NO_ACTIVE_UPLOAD");

        // Hotfix 10.8f: legacy rows (created before the single-PUT switch) still carry a
        // REAL multipart id — abort that session upstream best-effort. The non-blocking
        // guard matters in production: Upstash's credentials get Access Denied on multipart
        // calls, and an abort that 500s would trap the row forever (the number never frees).
        if (episode.UploadId != SinglePutUploadId)
        {
            try
            {
                await _storage.AbortMultipartUploadAsync(episode.FileKey, episode.UploadId, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Legacy multipart abort failed (non-blocking) during upload abort. EpisodeId={EpisodeId} FileKey={FileKey} UploadId={UploadId}",
                    episode.Id, episode.FileKey, episode.UploadId);
            }
        }

        // Single-PUT rows: S3 PUT is atomic — an interrupted PUT leaves NO partial object.
        // Delete the key best-effort to cover the case where the PUT fully landed but
        // complete-upload never ran; DeleteAsync is idempotent upstream (404 swallowed).
        // Both guards non-blocking: the row removal below is what frees the episode number.
        try
        {
            await _storage.DeleteAsync(episode.FileKey, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Blob delete failed (non-blocking) during upload abort. EpisodeId={EpisodeId} FileKey={FileKey}",
                episode.Id, episode.FileKey);
        }

        // The episode row describes an upload that will never complete — remove it so the
        // episode number is freed. This is a hard delete (the row was never publishable).
        _db.CourseEpisodes.Remove(episode);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    /// <summary>
    /// Push 10.8 — the admin escape hatch for a stuck encode ("إلغاء المعالجة"):
    /// marks the episode Failed (terminal — the pipeline never touches the row again)
    /// and cancels the worker's live job through the registry, which kills the running
    /// FFmpeg process. A job still queued is skipped at dequeue by the Failed status —
    /// TryCancel being false there is fine.
    /// </summary>
    public async Task<CourseEpisodeDto> Handle(AbortEpisodeProcessingCommand req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.FirstOrDefaultAsync(episode => episode.Id == req.EpisodeId && episode.DeletedAt == null, ct)
            ?? throw new NotFoundException("CourseEpisode", req.EpisodeId);

        if (episode.ProcessingStatus is not (ProcessingStatus.Pending
                or ProcessingStatus.Transcoding_360p
                or ProcessingStatus.Transcoding_720p
                or ProcessingStatus.Transcoding_1080p))
            throw new DomainException("لا توجد معالجة نشطة لهذه الحلقة", "NO_ACTIVE_PROCESSING");

        // Persist FIRST, cancel second: the worker's abort path never writes a status,
        // so Failed is the value every reader sees from here on.
        episode.ProcessingStatus = ProcessingStatus.Failed;
        await _unitOfWork.SaveChangesAsync(ct);

        var cancelledLiveJob = _transcodingJobRegistry.TryCancel(new TranscodingJob(MediaAssetType.CourseEpisode, episode.Id));

        _logger.LogInformation(
            "Transcoding aborted by admin. EpisodeId={EpisodeId} AbortedBy={AdminId} LiveJobCancelled={LiveJobCancelled}",
            episode.Id, req.AbortedBy, cancelledLiveJob);
        return MapToEpisodeDto(episode);
    }

    // ===== Helpers =====

    /// <summary>
    /// Push 7 — episode-number availability with GHOST PURGE.
    ///
    /// ix_course_episodes_course_id_episode_number (ApplicationDbContext) is a HARD
    /// unique index: it has no partial filter on DeletedAt, so soft-deleted "ghost"
    /// rows keep holding their numbers forever. The previous check only looked at
    /// live rows (DeletedAt == null), so a retry at a ghost-held number passed the
    /// check and then the INSERT died with Postgres 23505 — surfacing as the
    /// persistent 500 the admin saw on course تجربة (ghost episode #2).
    ///
    /// Live rows still block (EPISODE_NUMBER_TAKEN). Ghosts are hard-deleted here —
    /// aborting any lingering multipart session and deleting the stored blob
    /// best-effort — and the removal rides the CALLER's SaveChanges so the purge
    /// and the new/renumbered row commit atomically.
    /// </summary>
    private async Task EnsureEpisodeNumberUsableAsync(Guid courseId, int episodeNumber, Guid? excludeEpisodeId, CancellationToken ct)
    {
        if (episodeNumber < 1)
            throw new DomainException("رقم الحلقة يجب أن يكون 1 على الأقل", "INVALID_EPISODE_NUMBER");

        // Tracked query (NOT AsNoTracking): the ghost removals below must ride the caller's SaveChanges.
        var rows = await _db.CourseEpisodes
            .Where(episode => episode.CourseId == courseId && episode.EpisodeNumber == episodeNumber)
            .ToListAsync(ct);

        if (rows.Any(row => row.DeletedAt == null && (excludeEpisodeId == null || row.Id != excludeEpisodeId)))
            throw new DomainException("رقم الحلقة مستخدم داخل هذا الكورس", "EPISODE_NUMBER_TAKEN");

        foreach (var ghost in rows.Where(row => row.DeletedAt != null))
        {
            // Hotfix 10.8c (1.B): each storage call is INDEPENDENTLY best-effort. An S3
            // "Access Denied" (or any storage failure) during ghost cleanup must never
            // block episode-number reuse or the InitiateEpisodeUploadCommand flow — the
            // failure is logged as a warning, the ghost row is still hard-purged, and the
            // new upload proceeds. Splitting the guard per call also means a failing
            // multipart-abort no longer skips the blob delete attempt.
            // Hotfix 10.8f: sentinel rows are single-PUT — there is no multipart session
            // upstream, so the abort is skipped for them entirely (the DeleteAsync below
            // already covers the orphaned whole-file object).
            if (!string.IsNullOrEmpty(ghost.UploadId)
                && ghost.UploadId != SinglePutUploadId
                && !string.IsNullOrEmpty(ghost.FileKey))
            {
                try
                {
                    await _storage.AbortMultipartUploadAsync(ghost.FileKey, ghost.UploadId, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex,
                        "Ghost-episode cleanup: AbortMultipartUploadAsync failed (non-blocking). EpisodeId={EpisodeId} FileKey={FileKey} UploadId={UploadId}",
                        ghost.Id, ghost.FileKey, ghost.UploadId);
                }
            }
            if (ghost.SourceType == CourseEpisodeSource.Upload && !string.IsNullOrEmpty(ghost.FileKey))
            {
                try
                {
                    await _storage.DeleteAsync(ghost.FileKey, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex,
                        "Ghost-episode cleanup: DeleteAsync failed (non-blocking). EpisodeId={EpisodeId} FileKey={FileKey}",
                        ghost.Id, ghost.FileKey);
                }
            }
            _db.CourseEpisodes.Remove(ghost);
        }
    }

    /// <summary>
    /// SaveChanges with a race guard (Push 7): two concurrent initiates can both pass
    /// the availability check and the second INSERT dies on the unique index. The raw
    /// DbUpdateException would surface as a 500; translate unique violations into the
    /// friendly EPISODE_NUMBER_TAKEN domain error instead (provider-agnostic matcher:
    /// PostgreSQL 23505 / "duplicate key", SQLite "UNIQUE constraint failed").
    /// </summary>
    private async Task SaveEpisodesWithNumberGuardAsync(CancellationToken ct)
    {
        try
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (IsFavoritesEpisodeRestrict(ex))
        {
            // Push 11.3.1 — the REACHABLE RESTRICT path. EnsureEpisodeNumberUsableAsync
            // hard-purges soft-deleted "ghost" rows when their number is reused (AddYouTube
            // / InitiateUpload / UpdateEpisode renumbering), and a ghost can still be
            // referenced by student favorites (favorited while live, then admin-deleted).
            // The DELETE of such a ghost dies at the DB with 23503 — surface as 409 with
            // the actionable remedy (pick another number), never the raw 500.
            _logger.LogWarning(
                "Episode-number reuse blocked by favorites FK (ghost purge). GhostEpisodeId={GhostEpisodeId}",
                ex.InnerException is PostgresException pgEx ? pgEx.MessageText : ex.Message);
            throw new ConflictException(
                "تعذّر تحرير رقم الحلقة — الحلقة المحذوفة التي تحمل هذا الرقم ما زالت في المفضلة لدى بعض الطلاب. اختر رقمًا آخر.");
        }
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
        {
            throw new DomainException("رقم الحلقة مستخدم داخل هذا الكورس (حاول برقم آخر)", "EPISODE_NUMBER_TAKEN");
        }
    }

    /// <summary>
    /// Push 11.3.1 — favorites→episode FK RESTRICT guard. favorites.course_episode_id is
    /// ON DELETE RESTRICT (migration AddEpisodeFavorites): any hard removal of a
    /// course_episodes row referenced by a student favorite dies at the database with
    /// SQLSTATE 23503 on fk_favorites_course_episodes_course_episode_id. The constraint
    /// name is matched explicitly so unrelated FK violations pass through untouched.
    /// Scans the whole inner-exception chain (same robustness as
    /// <see cref="IsUniqueConstraintViolation"/> — EF may wrap the provider exception).
    /// </summary>
    private const string FavoritesEpisodeFkName = "fk_favorites_course_episodes_course_episode_id";

    private static bool IsFavoritesEpisodeRestrict(DbUpdateException exception)
    {
        for (var scan = (Exception?)exception; scan is not null; scan = scan.InnerException)
        {
            if (scan is PostgresException { SqlState: "23503" } pgEx
                && string.Equals(pgEx.ConstraintName, FavoritesEpisodeFkName, StringComparison.Ordinal))
                return true;
        }
        return false;
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException exception)
    {
        for (var scan = (Exception?)exception; scan is not null; scan = scan.InnerException)
        {
            var message = scan.Message;
            if (message.Contains("23505", StringComparison.Ordinal)) return true; // PostgreSQL
            if (message.Contains("duplicate key", StringComparison.OrdinalIgnoreCase)) return true; // PostgreSQL / SQL Server
            if (message.Contains("unique constraint", StringComparison.OrdinalIgnoreCase)) return true; // SQLite & generic
        }
        return false;
    }

    private async Task<long> GetVideoLimitBytesAsync(CancellationToken ct)
    {
        var raw = await _settings.GetAsync(VideoLimitSettingKey, ct);
        var limitMb = int.TryParse(raw, out var parsed) && parsed > 0 ? parsed : DefaultVideoLimitMb;
        return limitMb * 1024L * 1024L;
    }

    private static WatermarkEnvelopeDto BuildWatermark(Domain.Entities.Student student) => new(
        student.FullName,
        student.Phone,
        DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm"),
        "CMS"
    );

    private static CourseDto MapToCourseDto(Course course) => new(
        course.Id, course.SubjectId, course.Title, course.Description, course.CoverImageUrl,
        course.Status.ToString(),
        course.Episodes.Count(episode => episode.DeletedAt == null),
        course.CreatedAt,
        course.Episodes
            .Where(episode => episode.DeletedAt == null)
            .OrderBy(episode => episode.EpisodeNumber)
            .Select(MapToEpisodeDto)
            .ToList());

    private static CourseEpisodeDto MapToEpisodeDto(CourseEpisode episode) => new(
        episode.Id, episode.CourseId, episode.Title, episode.EpisodeNumber, episode.DurationSeconds,
        episode.SourceType.ToString(), episode.FileSize, episode.ContentType, episode.YoutubeVideoId,
        episode.SourceType == CourseEpisodeSource.YouTube || string.IsNullOrEmpty(episode.UploadId),
        episode.ViewsCount,
        // Push 10.5 — rich metadata + transcoding lifecycle exposure (additive DTO keys;
        // the 10.4 admin/student apps already render them and degrade on absence).
        episode.Description,
        episode.Difficulty,
        episode.ProcessingStatus,
        episode.ProcessingStatus == ProcessingStatus.Failed ? MediaProcessingFailure.TechnicalDetails : null,
        episode.HlsKey,
        // Push 10.7 — stored transcoding target (feeds the edit modal's dropdown).
        episode.TargetQuality);
}
