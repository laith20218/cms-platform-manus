using MediatR;
using Microsoft.EntityFrameworkCore;
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

    public LibraryHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IFileStorageService storage,
        IFileScanner scanner,
        IEntitlementService entitlements)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _storage = storage;
        _scanner = scanner;
        _entitlements = entitlements;
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

        var items = files.Select(f => new LibraryFileListItemDto(
            f.Id, f.Type.ToString(), f.Title, f.Description,
            f.FileSize, f.DurationSeconds, f.PagesCount, f.ThumbnailUrl,
            f.ViewsCount, false // TODO: Check if student favorited
        )).ToList();

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
    public async Task<UploadUrlDto> Handle(RequestUploadUrlCommand req, CancellationToken ct)
    {
        // Validate file type
        if (!Enum.TryParse<LibraryFileType>(req.Type, true, out var fileType))
            throw new DomainException("نوع الملف غير صالح", "INVALID_FILE_TYPE");

        // Validate file size (100MB max)
        if (req.FileSize > 100 * 1024 * 1024)
            throw new DomainException("حجم الملف يتجاوز 100 ميجابايت", "FILE_TOO_LARGE");

        // Generate file key
        var fileKey = $"library/{Guid.NewGuid()}/{req.FileName}";

        // Get pre-signed upload URL (direct upload to R2)
        // Note: In production, use GetSignedUrlAsync for PUT operation
        var uploadUrl = await _storage.GetSignedUrlAsync(fileKey, TimeSpan.FromMinutes(30));

        // Create library file record (pending upload)
        var file = new LibraryFile
        {
            SubjectId = req.SubjectId,
            LectureId = req.LectureId,
            Type = fileType,
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
        f.Id, f.SubjectId, f.LectureId, f.Type.ToString(),
        f.Title, f.Description, f.FileSize, f.FileFormat,
        f.DurationSeconds, f.PagesCount, f.ThumbnailUrl,
        f.YoutubeVideoId, f.Tags, f.ViewsCount, f.FavoritesCount,
        f.CreatedAt
    );
}
