using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CMS.Application.Commands.Courses;
using CMS.Application.DTOs.Courses;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Domain.Constants;

namespace CMS.Application.Handlers.Courses;

/// <summary>
/// Handles all course and course-episode operations: student catalog + playback access,
/// admin course CRUD, episode CRUD and the S3 multipart orchestration for videos up to
/// 2.5 GB (64 MB parts — decision د4; publishing at course level only — د3; ContentStatus
/// lifecycle — د2). Entitlement reuses the existing content-scope model: playback requires
/// an active grant over the subject with scope VideoAudio (FullSubject/FullYear pass).
/// View tracking is deferred (د5) — ViewsCount increments on access issuance.
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
    IRequestHandler<AbortEpisodeUploadCommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IFileStorageService _storage;
    private readonly IEntitlementService _entitlements;
    private readonly ISystemSettingsService _settings;
    private readonly IAdminActivityWriter _activity;
    private readonly ILogger<CourseHandlers> _logger;

    /// <summary>Fixed 64 MB part size (د4): ≤ 40 parts for a 2.5 GB video, far under the 10,000-part S3 cap.</summary>
    private const long PartSizeBytes = 64L * 1024 * 1024;
    private const int MaxPartCount = 10_000;

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
        ILogger<CourseHandlers> logger)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _storage = storage;
        _entitlements = entitlements;
        _settings = settings;
        _activity = activity;
        _logger = logger;
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

        await SaveEpisodesWithNumberGuardAsync(ct);
        return MapToEpisodeDto(episode);
    }

    public async Task<Unit> Handle(DeleteEpisodeCommand req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.FirstOrDefaultAsync(episode => episode.Id == req.Id, ct)
            ?? throw new NotFoundException("CourseEpisode", req.Id);

        string? fileKey = episode.FileKey;
        string? uploadId = episode.UploadId;

        typeof(CourseEpisode).GetProperty("DeletedAt")?.SetValue(episode, DateTime.UtcNow);
        typeof(CourseEpisode).GetProperty("DeletedBy")?.SetValue(episode, req.DeletedBy);
        await _unitOfWork.SaveChangesAsync(ct);

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

    // ===== Admin: multipart orchestration =====
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

        var partCount = (int)Math.Ceiling(req.FileSize / (double)PartSizeBytes);
        if (partCount > MaxPartCount)
            throw new DomainException("عدد الأجزاء المطلوب يتجاوز الحد المسموح", "FILE_TOO_LARGE");

        await EnsureEpisodeNumberUsableAsync(req.CourseId, req.EpisodeNumber, null, ct);

        // Server-generated key (never user input — prevents path traversal). NOTE (Push 7):
        // the original fileName — Arabic or otherwise — is NEVER part of the key and never
        // enters any S3 request header; only this pure-GUID key and the sniffed content
        // type reach storage. Arabic filenames were proven innocent by production logs.
        var fileKey = $"courses/{req.CourseId}/{Guid.NewGuid():N}/{Guid.NewGuid():N}";
        var uploadId = await _storage.InitiateMultipartUploadAsync(fileKey, req.ContentType.Trim(), ct);

        var episode = new CourseEpisode
        {
            CourseId = req.CourseId,
            Title = req.Title,
            EpisodeNumber = req.EpisodeNumber,
            SourceType = CourseEpisodeSource.Upload,
            FileKey = fileKey,
            FileSize = req.FileSize, // declared; replaced by the verified actual size at complete
            ContentType = req.ContentType.Trim(),
            UploadId = uploadId,
        };
        typeof(CourseEpisode).GetProperty("CreatedBy")?.SetValue(episode, req.CreatedBy);

        await _db.CourseEpisodes.AddAsync(episode, ct);
        await SaveEpisodesWithNumberGuardAsync(ct);

        var partUrls = new List<string>();
        for (var partNumber = 1; partNumber <= partCount; partNumber++)
            partUrls.Add(await _storage.PresignUploadPartAsync(fileKey, uploadId, partNumber, TimeSpan.FromMinutes(9), ct));

        return new InitiateUploadDto(episode.Id, uploadId, fileKey, (int)PartSizeBytes, partCount, partUrls);
    }

    public async Task<MultipartStatusDto> Handle(GetMultipartStatusQuery req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.AsNoTracking()
            .FirstOrDefaultAsync(episode => episode.Id == req.EpisodeId && episode.DeletedAt == null, ct)
            ?? throw new NotFoundException("CourseEpisode", req.EpisodeId);

        if (string.IsNullOrEmpty(episode.UploadId) || string.IsNullOrEmpty(episode.FileKey))
            throw new DomainException("لا يوجد رفع نشط لهذه الحلقة", "NO_ACTIVE_UPLOAD");

        var storedParts = await _storage.ListMultipartPartsAsync(episode.FileKey, episode.UploadId, ct);
        var storedNumbers = storedParts.Select(part => part.PartNumber).ToHashSet();

        var partCount = (int)Math.Ceiling((episode.FileSize ?? PartSizeBytes) / (double)PartSizeBytes);
        var pendingUrls = new List<string>();
        for (var partNumber = 1; partNumber <= partCount; partNumber++)
        {
            if (!storedNumbers.Contains(partNumber))
                pendingUrls.Add(await _storage.PresignUploadPartAsync(episode.FileKey, episode.UploadId, partNumber, TimeSpan.FromMinutes(9), ct));
        }

        return new MultipartStatusDto(
            episode.Id, episode.UploadId, episode.FileKey, (int)PartSizeBytes, partCount,
            storedParts.Select(part => new UploadedPartStateDto(part.PartNumber, part.Size, part.ETag)).ToList(),
            pendingUrls);
    }

    public async Task<CourseEpisodeDto> Handle(CompleteEpisodeUploadCommand req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.FirstOrDefaultAsync(episode => episode.Id == req.EpisodeId && episode.DeletedAt == null, ct)
            ?? throw new NotFoundException("CourseEpisode", req.EpisodeId);

        if (string.IsNullOrEmpty(episode.UploadId) || string.IsNullOrEmpty(episode.FileKey))
            throw new DomainException("لا يوجد رفع نشط لهذه الحلقة", "NO_ACTIVE_UPLOAD");
        if (req.Parts.Count == 0)
            throw new DomainException("قائمة الأجزاء فارغة", "INVALID_PARTS");

        await _storage.CompleteMultipartUploadAsync(
            episode.FileKey,
            episode.UploadId,
            req.Parts.Select(part => new CompletedPart(part.PartNumber, part.ETag)).ToList(),
            ct);

        // Defense in depth: the ceiling was enforced on the declared size at initiate —
        // verify the ACTUAL assembled object against it before accepting the upload.
        var maxBytes = await GetVideoLimitBytesAsync(ct);
        var actualSize = await _storage.GetObjectSizeAsync(episode.FileKey, ct);
        if (actualSize > maxBytes)
        {
            try { await _storage.AbortMultipartUploadAsync(episode.FileKey, episode.UploadId, ct); } catch { /* object already completed */ }
            try { await _storage.DeleteAsync(episode.FileKey, ct); } catch { /* best effort */ }
            _db.CourseEpisodes.Remove(episode);
            await _unitOfWork.SaveChangesAsync(ct);
            throw new DomainException(
                $"الحجم الفعلي للملف ({actualSize / (1024 * 1024)} ميجابايت) يتجاوز الحد المسموح ({maxBytes / (1024 * 1024)} ميجابايت)",
                "FILE_TOO_LARGE");
        }

        typeof(CourseEpisode).GetProperty("FileSize")?.SetValue(episode, actualSize);
        typeof(CourseEpisode).GetProperty("UploadId")?.SetValue(episode, null); // blob ready for playback
        await _unitOfWork.SaveChangesAsync(ct);

        await _activity.LogAsync(episode.CreatedBy, AdminActivityActionType.UploadEpisode, episode.Id.ToString(),
            new { episodeId = episode.Id, courseId = episode.CourseId, fileSize = actualSize, contentType = episode.ContentType }, ct: ct);

        return MapToEpisodeDto(episode);
    }

    public async Task<Unit> Handle(AbortEpisodeUploadCommand req, CancellationToken ct)
    {
        var episode = await _db.CourseEpisodes.FirstOrDefaultAsync(episode => episode.Id == req.EpisodeId, ct)
            ?? throw new NotFoundException("CourseEpisode", req.EpisodeId);

        if (string.IsNullOrEmpty(episode.UploadId) || string.IsNullOrEmpty(episode.FileKey))
            throw new DomainException("لا يوجد رفع نشط لهذه الحلقة", "NO_ACTIVE_UPLOAD");

        await _storage.AbortMultipartUploadAsync(episode.FileKey, episode.UploadId, ct);

        // The episode row describes an upload that will never complete — remove it so the
        // episode number is freed. This is a hard delete (the row was never publishable).
        _db.CourseEpisodes.Remove(episode);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
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
            try
            {
                if (!string.IsNullOrEmpty(ghost.UploadId) && !string.IsNullOrEmpty(ghost.FileKey))
                    await _storage.AbortMultipartUploadAsync(ghost.FileKey, ghost.UploadId, ct);
                if (ghost.SourceType == CourseEpisodeSource.Upload && !string.IsNullOrEmpty(ghost.FileKey))
                    await _storage.DeleteAsync(ghost.FileKey, ct);
            }
            catch (Exception ex)
            {
                // Best-effort: a storage hiccup must never block number reuse.
                _logger.LogWarning(ex, "Ghost-episode cleanup failed during episode-number reuse. EpisodeId={EpisodeId} FileKey={FileKey}", ghost.Id, ghost.FileKey);
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
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
        {
            throw new DomainException("رقم الحلقة مستخدم داخل هذا الكورس (حاول برقم آخر)", "EPISODE_NUMBER_TAKEN");
        }
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
        episode.ViewsCount);
}
