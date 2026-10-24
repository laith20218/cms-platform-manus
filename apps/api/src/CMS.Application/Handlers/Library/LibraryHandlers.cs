using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CMS.Application.Commands.Library;
using CMS.Application.DTOs.Library;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Library;

/// <summary>
/// Handles all library file operations: listing, access (signed URLs),
/// view tracking, upload, update, delete.
/// </summary>
public class LibraryHandlers :
    IRequestHandler<GetLibraryFilesQuery, PagedResult<LibraryFileListItemDto>>,
    IRequestHandler<GetLectureTextFilesQuery, PagedResult<LibraryFileListItemDto>>,
    IRequestHandler<GetLibraryFileByIdQuery, LibraryFileDto>,
    IRequestHandler<GetFileAccessCommand, FileAccessDto>,
    IRequestHandler<RecordFileViewCommand, Unit>,
    IRequestHandler<RequestUploadUrlCommand, UploadUrlDto>,
    IRequestHandler<CompleteUploadCommand, LibraryFileDto>,
    IRequestHandler<UpdateLibraryFileCommand, LibraryFileDto>,
    IRequestHandler<PublishLibraryFileCommand, LibraryFileDto>,
    IRequestHandler<ArchiveLibraryFileCommand, LibraryFileDto>,
    IRequestHandler<DeleteLibraryFileCommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IFileStorageService _storage;
    private readonly IFileScanner _scanner;
    private readonly IEntitlementService _entitlements;
    private readonly ISystemSettingsService _settings;
    private readonly IHtmlBlobSanitizer _htmlSanitizer;
    private readonly ILogger<LibraryHandlers> _logger;

    public LibraryHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IFileStorageService storage,
        IFileScanner scanner,
        IEntitlementService entitlements,
        ISystemSettingsService settings,
        IHtmlBlobSanitizer htmlSanitizer,
        ILogger<LibraryHandlers> logger)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _storage = storage;
        _scanner = scanner;
        _entitlements = entitlements;
        _settings = settings;
        _htmlSanitizer = htmlSanitizer;
        _logger = logger;
    }

    // ===== Queries =====
    public async Task<PagedResult<LibraryFileListItemDto>> Handle(GetLibraryFilesQuery req, CancellationToken ct)
    {
        if (!await _entitlements.CanAccessSubjectAsync(req.StudentId, req.SubjectId, "read", ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى مكتبة هذه المادة");

        var query = _db.LibraryFiles.AsNoTracking()
            .Where(f => f.SubjectId == req.SubjectId && f.Status == ContentStatus.Published && f.DeletedAt == null);

        if (!string.IsNullOrEmpty(req.Type))
            query = query.Where(f => f.Type == Enum.Parse<LibraryFileType>(req.Type, true));

        var files = await query
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync(ct);
        files = (await Task.WhenAll(files.Select(async file => new
        {
            File = file,
            Allowed = await _entitlements.CanAccessSubjectContentAsync(req.StudentId, file.SubjectId, RequiredContentScope(file.Type), ct)
        })))
            .Where(candidate => candidate.Allowed)
            .Select(candidate => candidate.File)
            .ToList();
        var total = files.Count;
        files = files.Skip((req.Page - 1) * req.PageSize).Take(req.PageSize).ToList();
        var visibleFileIds = files.Select(file => file.Id).ToList();
        var favoriteFileIds = await _db.Favorites.AsNoTracking()
            .Where(favorite => favorite.StudentId == req.StudentId
                && favorite.LibraryFileId.HasValue
                && visibleFileIds.Contains(favorite.LibraryFileId.Value))
            .Select(favorite => favorite.LibraryFileId!.Value)
            .ToHashSetAsync(ct);

        var items = files.Select(f => new LibraryFileListItemDto(
            f.Id, f.Type.ToString(), f.Title, f.Description,
            f.FileSize, f.DurationSeconds, f.PagesCount, f.ThumbnailUrl,
            f.ViewsCount, favoriteFileIds.Contains(f.Id)
        )).ToList();

        return new PagedResult<LibraryFileListItemDto>(items, total, req.Page, req.PageSize, (int)Math.Ceiling(total / (double)req.PageSize));
    }

    public async Task<PagedResult<LibraryFileListItemDto>> Handle(GetLectureTextFilesQuery req, CancellationToken ct)
    {
        var lecture = await _db.Lectures.AsNoTracking()
            .Where(item => item.Id == req.LectureId && item.DeletedAt == null && item.Status == "active"
                && item.Subject.DeletedAt == null && item.Subject.Semester.DeletedAt == null
                && item.Subject.Semester.AcademicYear.DeletedAt == null
                && item.Subject.Semester.AcademicYear.College.DeletedAt == null
                && item.Subject.Semester.AcademicYear.College.University.DeletedAt == null)
            .Select(item => new { item.Id, item.SubjectId })
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Lecture", req.LectureId);
        if (!await _entitlements.CanAccessSubjectContentAsync(req.StudentId, lecture.SubjectId, SubscriptionContentScope.LecturesText, ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى ملفات هذه المحاضرة");

        var files = await _db.LibraryFiles.AsNoTracking()
            .Where(file => file.LectureId == lecture.Id
                && file.Status == ContentStatus.Published
                && file.DeletedAt == null
                && file.Type != LibraryFileType.Video
                && file.Type != LibraryFileType.Audio)
            .OrderByDescending(file => file.CreatedAt)
            .ToListAsync(ct);
        var total = files.Count;
        files = files.Skip((req.Page - 1) * req.PageSize).Take(req.PageSize).ToList();
        var visibleFileIds = files.Select(file => file.Id).ToList();
        var favoriteFileIds = await _db.Favorites.AsNoTracking()
            .Where(favorite => favorite.StudentId == req.StudentId
                && favorite.LibraryFileId.HasValue
                && visibleFileIds.Contains(favorite.LibraryFileId.Value))
            .Select(favorite => favorite.LibraryFileId!.Value)
            .ToHashSetAsync(ct);
        var items = files.Select(file => new LibraryFileListItemDto(
            file.Id, file.Type.ToString(), file.Title, file.Description,
            file.FileSize, file.DurationSeconds, file.PagesCount, file.ThumbnailUrl,
            file.ViewsCount, favoriteFileIds.Contains(file.Id))).ToList();
        return new PagedResult<LibraryFileListItemDto>(items, total, req.Page, req.PageSize, (int)Math.Ceiling(total / (double)req.PageSize));
    }

    public async Task<LibraryFileDto> Handle(GetLibraryFileByIdQuery req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == req.Id && f.Status == ContentStatus.Published && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("LibraryFile", req.Id);
        var studentId = req.StudentId ?? throw new ForbiddenException("لا تملك صلاحية الوصول إلى هذا الملف");
        if (!await _entitlements.CanAccessSubjectContentAsync(studentId, file.SubjectId, RequiredContentScope(file.Type), ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى هذا الملف");

        return MapToDto(file);
    }

    // ===== Access (Signed URL) =====
    public async Task<FileAccessDto> Handle(GetFileAccessCommand req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.FileId && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("LibraryFile", req.FileId);
        if (file.Status != ContentStatus.Published || file.VirusScanStatus != VirusScanStatus.Clean
            || !await _entitlements.CanAccessSubjectContentAsync(req.StudentId, file.SubjectId, RequiredContentScope(file.Type), ct))
            throw new ForbiddenException("لا تملك صلاحية تنزيل هذا الملف أو لم يكتمل فحصه");

        // Get student info for watermark
        var student = await _db.Students.AsNoTracking().FirstOrDefaultAsync(s => s.Id == req.StudentId, ct)
            ?? throw new NotFoundException("Student", req.StudentId);

        // For YouTube videos, return the embed URL (no signed URL needed)
        if (file.Type == LibraryFileType.Video && !string.IsNullOrEmpty(file.YoutubeVideoId))
        {
            return new FileAccessDto(
                $"https://www.youtube.com/embed/{file.YoutubeVideoId}?rel=0&modestbranding=1",
                DateTime.UtcNow.AddHours(1),
                BuildWatermark(student)
            );
        }

        // For other files, generate signed URL (5-minute expiry)
        var signedUrl = await _storage.GetSignedUrlAsync(file.FileUrl, TimeSpan.FromMinutes(5));

        return new FileAccessDto(
            signedUrl,
            DateTime.UtcNow.AddMinutes(5),
            BuildWatermark(student)
        );
    }

    // ===== View Recording =====
    public async Task<Unit> Handle(RecordFileViewCommand req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.FileId && f.Status == ContentStatus.Published && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("LibraryFile", req.FileId);
        if (!await _entitlements.CanAccessSubjectContentAsync(req.StudentId, file.SubjectId, RequiredContentScope(file.Type), ct))
            throw new ForbiddenException("لا تملك صلاحية تسجيل مشاهدة هذا الملف");

        // Record the view
        _db.LibraryViews.Add(new LibraryView
        {
            StudentId = req.StudentId,
            FileId = req.FileId,
            DurationSeconds = req.DurationSeconds,
            PagesViewed = req.PagesViewed,
            CompletionPercentage = req.CompletionPercentage,
            ViewedAt = DateTime.UtcNow
        });

        // Update file view count
        typeof(LibraryFile).GetProperty("ViewsCount")?.SetValue(file, file.ViewsCount + 1);

        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    // ===== Admin: Upload =====
    /// <summary>
    /// Strict server-side MIME allow-list for the institutional library. Video and audio
    /// media are intentionally rejected here — they belong to course episodes, not the
    /// document library. The declared type is enforced before any presigned URL is issued,
    /// because the PUT URL binds the Content-Type server-side.
    /// </summary>
    private static readonly HashSet<string> AllowedLibraryContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf",
        "text/html",
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword"
    };

    // ===== Per-type upload ceilings (A2-3) =====
    // Each allow-listed content type maps to a system-settings key (upload.limit.*_mb) with a
    // hardcoded fallback used only when the setting row is missing or unparseable. Editors with
    // Settings.Edit permission can retune the limits at runtime without a redeploy.
    private const int DefaultPdfLimitMb = 200;
    private const int DefaultHtmlLimitMb = 10;
    private const int DefaultImageLimitMb = 20;

    private static readonly Dictionary<string, (string SettingKey, int DefaultMb)> ContentTypeUploadLimits =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["application/pdf"] = ("upload.limit.pdf_mb", DefaultPdfLimitMb),
            ["application/msword"] = ("upload.limit.pdf_mb", DefaultPdfLimitMb),
            ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] = ("upload.limit.pdf_mb", DefaultPdfLimitMb),
            ["text/html"] = ("upload.limit.html_mb", DefaultHtmlLimitMb),
            ["image/png"] = ("upload.limit.image_mb", DefaultImageLimitMb),
            ["image/jpeg"] = ("upload.limit.image_mb", DefaultImageLimitMb),
            ["image/webp"] = ("upload.limit.image_mb", DefaultImageLimitMb),
        };

    /// <summary>Resolves the per-type upload ceiling in bytes: system setting first, hardcoded fallback when absent/unparseable.</summary>
    private async Task<long> GetUploadLimitBytesAsync(string contentType, CancellationToken ct)
    {
        if (!ContentTypeUploadLimits.TryGetValue(contentType.Trim(), out var policy))
            return DefaultPdfLimitMb * 1024L * 1024L; // unreachable for allow-listed callers; conservative default

        var raw = await _settings.GetAsync(policy.SettingKey, ct);
        var limitMb = int.TryParse(raw, out var parsed) && parsed > 0 ? parsed : policy.DefaultMb;
        return limitMb * 1024L * 1024L;
    }

    public async Task<UploadUrlDto> Handle(RequestUploadUrlCommand req, CancellationToken ct)
    {
        // Validate declared content type against the strict library allow-list.
        if (string.IsNullOrWhiteSpace(req.ContentType) || !AllowedLibraryContentTypes.Contains(req.ContentType.Trim()))
            throw new DomainException("نوع الملف غير مسموح به في المكتبة", "INVALID_FILE_TYPE");

        // Validate file type
        if (!Enum.TryParse<LibraryFileType>(req.Type, true, out var fileType))
            throw new DomainException("نوع الملف غير صالح", "INVALID_FILE_TYPE");

        // Per-type size ceiling (A2-3): editable at runtime via system settings with hardcoded fallbacks.
        var maxBytes = await GetUploadLimitBytesAsync(req.ContentType, ct);
        if (req.FileSize > maxBytes)
            throw new DomainException(
                $"حجم الملف يتجاوز الحد المسموح لهذا النوع ({maxBytes / (1024 * 1024)} ميجابايت)",
                "FILE_TOO_LARGE");

        // Server-generated object key: Guid-based to prevent path traversal.
        // The user-supplied FileName is stored as metadata only, never used as the key path.
        var fileKey = $"library/{Guid.NewGuid():N}/{Guid.NewGuid():N}";

        // Issue a short-lived pre-signed PUT URL for direct browser upload to S3-compatible storage.
        // The PUT verb, ContentType and (A2-1) the declared ContentLength are all bound server-side
        // into the signature, so the client can neither mutate the type nor push a differently-sized body.
        var uploadUrl = await _storage.GetSignedUploadUrlAsync(fileKey, req.ContentType, TimeSpan.FromMinutes(30), req.FileSize, ct);

        // Create library file record (pending upload)
        var file = new LibraryFile
        {
            SubjectId = req.SubjectId,
            LectureId = req.LectureId,
            Type = fileType,
            Category = req.Category,
            Title = req.Title,
            Description = req.Description,
            FileUrl = fileKey,
            FileSize = req.FileSize,
            FileFormat = req.ContentType,
            Tags = new List<string>(),
            Status = ContentStatus.Draft,
            VirusScanStatus = VirusScanStatus.Pending
        };

        typeof(LibraryFile).GetProperty("CreatedBy")?.SetValue(file, req.CreatedBy);

        await _db.LibraryFiles.AddAsync(file, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new UploadUrlDto(uploadUrl, fileKey, file.Id);
    }

    public async Task<LibraryFileDto> Handle(CompleteUploadCommand req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.FileId, ct)
            ?? throw new NotFoundException("LibraryFile", req.FileId);

        // Verify file exists in storage
        var exists = await _storage.ExistsAsync(req.FileKey, ct);
        if (!exists)
            throw new DomainException("لم يتم العثور على الملف في التخزين", "FILE_NOT_UPLOADED");

        // A2-5: HTML documents are sanitized in place (Ganss.XSS) before the upload is accepted.
        // A failed sanitization rejects the upload: the blob is deleted and the row is parked in
        // scan status Error so it can never be published.
        if (string.Equals(file.FileFormat, "text/html", StringComparison.OrdinalIgnoreCase))
        {
            var htmlLimitBytes = await GetUploadLimitBytesAsync("text/html", ct);
            if (req.ActualFileSize > htmlLimitBytes)
                throw new DomainException("حجم ملف HTML يتجاوز الحد المسموح", "FILE_TOO_LARGE");

            try
            {
                await _htmlSanitizer.SanitizeAsync(req.FileKey, req.ActualFileSize, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex,
                    "HTML sanitization failed; rejecting upload. FileId={FileId} FileKey={FileKey}",
                    file.Id, req.FileKey);
                file.VirusScanStatus = VirusScanStatus.Error;
                await _unitOfWork.SaveChangesAsync(ct);
                try
                {
                    await _storage.DeleteAsync(req.FileKey, ct);
                }
                catch (Exception cleanupEx)
                {
                    _logger.LogWarning(cleanupEx,
                        "Blob cleanup after failed sanitization also failed; an orphaned blob remains. FileKey={FileKey}",
                        req.FileKey);
                }
                throw new DomainException("فشل تعقيم ملف HTML وتم رفض الرفع", "HTML_SANITIZATION_FAILED");
            }
        }

        var scan = await _scanner.ScanAsync(req.FileKey, file.FileFormat, ct);
        file.VirusScanStatus = scan.IsClean
            ? VirusScanStatus.Clean
            : scan.IsInfected ? VirusScanStatus.Infected : VirusScanStatus.Error;

        // Update file metadata
        typeof(LibraryFile).GetProperty("FileSize")?.SetValue(file, req.ActualFileSize);
        if (req.PagesCount.HasValue) typeof(LibraryFile).GetProperty("PagesCount")?.SetValue(file, req.PagesCount);
        if (req.DurationSeconds.HasValue) typeof(LibraryFile).GetProperty("DurationSeconds")?.SetValue(file, req.DurationSeconds);
        if (!string.IsNullOrEmpty(req.YoutubeVideoId))
            typeof(LibraryFile).GetProperty("YoutubeVideoId")?.SetValue(file, req.YoutubeVideoId);

        // Do not publish before an external scanner records a clean verdict.
        // The completion endpoint only confirms storage; publication remains a separate privileged action.
        await _unitOfWork.SaveChangesAsync(ct);
        return MapToDto(file);
    }

    // ===== Admin: Update =====
    public async Task<LibraryFileDto> Handle(UpdateLibraryFileCommand req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.Id && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("LibraryFile", req.Id);

        typeof(LibraryFile).GetProperty("Title")?.SetValue(file, req.Title);
        typeof(LibraryFile).GetProperty("Description")?.SetValue(file, req.Description);
        typeof(LibraryFile).GetProperty("Tags")?.SetValue(file, req.Tags);
        typeof(LibraryFile).GetProperty("LectureId")?.SetValue(file, req.LectureId);

        await _unitOfWork.SaveChangesAsync(ct);
        return MapToDto(file);
    }

    // ===== Admin: Lifecycle =====
    public async Task<LibraryFileDto> Handle(PublishLibraryFileCommand req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.Id && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("LibraryFile", req.Id);

        if (file.VirusScanStatus != VirusScanStatus.Clean)
            throw new DomainException("لا يمكن نشر ملف قبل اكتمال الفحص الأمني بنجاح", "FILE_SCAN_NOT_CLEAN");

        file.Status = ContentStatus.Published;
        await _unitOfWork.SaveChangesAsync(ct);
        return MapToDto(file);
    }

    public async Task<LibraryFileDto> Handle(ArchiveLibraryFileCommand req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.Id && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("LibraryFile", req.Id);

        file.Status = ContentStatus.Archived;
        await _unitOfWork.SaveChangesAsync(ct);
        return MapToDto(file);
    }

    // ===== Admin: Delete =====
    public async Task<Unit> Handle(DeleteLibraryFileCommand req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.Id, ct)
            ?? throw new NotFoundException("LibraryFile", req.Id);

        // Soft delete
        typeof(LibraryFile).GetProperty("DeletedAt")?.SetValue(file, DateTime.UtcNow);
        typeof(LibraryFile).GetProperty("Status")?.SetValue(file, ContentStatus.Deleted);

        await _unitOfWork.SaveChangesAsync(ct);

        // Best-effort blob cleanup: removing the stored object keeps storage free of
        // orphaned blobs after a delete. A storage failure must NOT fail the already
        // committed database delete — the warning is logged and an idempotent cleanup
        // pass can retry later.
        try
        {
            await _storage.DeleteAsync(file.FileUrl, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Blob cleanup failed after library file delete. FileId={FileId} FileKey={FileKey}",
                file.Id, file.FileUrl);
        }

        return Unit.Value;
    }

    // ===== Helpers =====
    private static WatermarkDto BuildWatermark(Domain.Entities.Student student) => new(
        student.FullName,
        student.Phone,
        DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm"),
        "CMS"
    );

    private static SubscriptionContentScope RequiredContentScope(LibraryFileType type) => type is LibraryFileType.Video or LibraryFileType.Audio
        ? SubscriptionContentScope.VideoAudio
        : SubscriptionContentScope.LecturesText;

    private static LibraryFileDto MapToDto(LibraryFile f) => new(
        f.Id, f.SubjectId, f.LectureId, f.Type.ToString(), f.Category?.ToString(),
        f.Title, f.Description, f.FileSize, f.FileFormat,
        f.DurationSeconds, f.PagesCount, f.ThumbnailUrl,
        f.YoutubeVideoId, f.Tags, f.ViewsCount, f.FavoritesCount,
        f.CreatedAt
    );
}
