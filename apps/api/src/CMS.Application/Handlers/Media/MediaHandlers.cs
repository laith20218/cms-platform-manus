using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Media;
using CMS.Application.DTOs.Media;
using CMS.Application.Interfaces;
using CMS.Domain.Constants;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Media;

/// <summary>
/// Push 10.0 — student media backend:
///   • §1.A direct playback URLs for stored video/audio (presigned GET against the
///     storage host via the credential-lease path — R2 host, Range-capable, TTL from
///     <see cref="MediaPolicy"/>); documents keep the same-origin library channel;
///   • §1.B per-asset time-range bookmarks (first-class entity, strictly separate
///     from Favorite);
///   • §1.C playback progress (resume position + derived completion, 95 % rule).
///
/// Every student entry point enforces the VideoAudio content scope through
/// IEntitlementService — the same gate the course catalog and episode access use.
/// </summary>
public class MediaHandlers :
    IRequestHandler<GetPlaybackUrlQuery, PlaybackUrlDto>,
    IRequestHandler<CreateMediaBookmarkCommand, CreateMediaBookmarkResult>,
    IRequestHandler<ListMediaBookmarksQuery, List<MediaBookmarkDto>>,
    IRequestHandler<UpdateMediaBookmarkCommand, MediaBookmarkDto>,
    IRequestHandler<DeleteMediaBookmarkCommand, Unit>,
    IRequestHandler<UpsertPlaybackProgressCommand, PlaybackProgressDto>,
    IRequestHandler<GetPlaybackProgressQuery, PlaybackProgressDto?>
{
    private const int MaxBookmarkLabelLength = 100;
    private const int MaxBookmarkNoteLength = 500;
    private const int MaxBookmarkSpanSeconds = 3600;

    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IFileStorageService _storage;
    private readonly IEntitlementService _entitlements;

    public MediaHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IFileStorageService storage,
        IEntitlementService entitlements)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _storage = storage;
        _entitlements = entitlements;
    }

    // ===== §1.A: direct playback URL =====

    public async Task<PlaybackUrlDto> Handle(GetPlaybackUrlQuery req, CancellationToken ct)
    {
        string fileKey;
        string contentType;

        if (req.AssetType == MediaAssetType.LibraryFile)
        {
            var file = await _db.LibraryFiles.AsNoTracking()
                .Where(file => file.Id == req.AssetId && file.DeletedAt == null
                    && file.Status == ContentStatus.Published
                    && file.VirusScanStatus == VirusScanStatus.Clean)
                .Select(file => new { file.FileUrl, file.Type, file.FileFormat, file.YoutubeVideoId, file.SubjectId })
                .FirstOrDefaultAsync(ct)
                ?? throw new NotFoundException("LibraryFile", req.AssetId);

            // Streaming URLs exist only for stored video/audio blobs — documents keep using
            // the same-origin library /content channel (small files, extra security layer).
            if (file.Type is not (LibraryFileType.Video or LibraryFileType.Audio))
                throw new DomainException("روابط التشغيل المباشر مخصصة للفيديو والصوت فقط — الملفات النصية تمر عبر قناة المكتبة نفسها", "MEDIA_TYPE_NOT_STREAMABLE");
            if (file.Type == LibraryFileType.Video && !string.IsNullOrEmpty(file.YoutubeVideoId))
                throw new DomainException("هذا الفيديو مستضاف على يوتيوب وليس له نسخة في التخزين المباشر", "MEDIA_YOUTUBE_HOSTED");
            if (!await _entitlements.CanAccessSubjectContentAsync(req.StudentId, file.SubjectId, SubscriptionContentScope.VideoAudio, ct))
                throw new ForbiddenException("لا تملك صلاحية تشغيل هذه الوسائط");

            fileKey = file.FileUrl;
            contentType = string.IsNullOrWhiteSpace(file.FileFormat)
                ? (file.Type == LibraryFileType.Video ? "video/mp4" : "audio/mpeg")
                : file.FileFormat!;
        }
        else
        {
            var episode = await _db.CourseEpisodes.AsNoTracking()
                .Where(episode => episode.Id == req.AssetId && episode.DeletedAt == null)
                .Select(episode => new
                {
                    Episode = episode,
                    CourseSubjectId = episode.Course.SubjectId,
                    CourseStatus = episode.Course.Status,
                    CourseDeleted = episode.Course.DeletedAt != null
                })
                .FirstOrDefaultAsync(ct)
                ?? throw new NotFoundException("CourseEpisode", req.AssetId);

            if (episode.CourseDeleted || episode.CourseStatus != ContentStatus.Published)
                throw new ForbiddenException("هذا الكورس غير متاح");
            if (episode.Episode.SourceType == CourseEpisodeSource.YouTube || string.IsNullOrEmpty(episode.Episode.FileKey))
                throw new DomainException("هذه الحلقة مستضافة على يوتيوب وليست لها نسخة في التخزين المباشر", "MEDIA_YOUTUBE_HOSTED");
            if (episode.Episode.SourceType == CourseEpisodeSource.Upload && !string.IsNullOrEmpty(episode.Episode.UploadId))
                throw new DomainException("لم يكتمل رفع هذه الحلقة بعد", "EPISODE_UPLOAD_INCOMPLETE");
            if (!await _entitlements.CanAccessSubjectContentAsync(req.StudentId, episode.CourseSubjectId, SubscriptionContentScope.VideoAudio, ct))
                throw new ForbiddenException("لا تملك صلاحية تشغيل هذه الحلقة");

            fileKey = episode.Episode.FileKey!;
            contentType = string.IsNullOrWhiteSpace(episode.Episode.ContentType) ? "video/mp4" : episode.Episode.ContentType!;
        }

        // Lease-path presign (mirrors episode /access): GET verb against the storage host
        // (R2), so the browser range-requests media directly and the API never proxies
        // bytes. TTL is clamped under the ~10-minute session-credential lease; the player
        // refreshes the URL on error/stall for long media.
        var ttl = TimeSpan.FromSeconds(MediaPolicy.PlaybackUrlTtlSeconds);
        var url = await _storage.GetSignedUrlViaCredentialsAsync(fileKey, ttl, ct);

        return new PlaybackUrlDto(
            url,
            MediaPolicy.PlaybackUrlTtlSeconds,
            DateTime.UtcNow.Add(ttl),
            contentType,
            SupportsRange: true);
    }

    // ===== §1.B: media bookmarks =====

    public async Task<CreateMediaBookmarkResult> Handle(CreateMediaBookmarkCommand req, CancellationToken ct)
    {
        var label = (req.Label ?? string.Empty).Trim();
        if (label.Length is < 1 or > MaxBookmarkLabelLength)
            throw new DomainException("عنوان العلامة مطلوب وبحد أقصى 100 حرف", "BOOKMARK_LABEL_INVALID");
        if (req.Note is { Length: > MaxBookmarkNoteLength })
            throw new DomainException("ملاحظة العلامة لا تتجاوز 500 حرف", "BOOKMARK_NOTE_TOO_LONG");
        if (req.StartSeconds < 0 || req.EndSeconds <= req.StartSeconds)
            throw new DomainException("بداية العلامة يجب أن تكون غير سالبة وتسبق نهايتها", "BOOKMARK_RANGE_INVALID");
        if (req.EndSeconds - req.StartSeconds > MaxBookmarkSpanSeconds)
            throw new DomainException("مدة العلامة الواحدة لا تتجاوز ساعة", "BOOKMARK_SPAN_TOO_LONG");

        var asset = await ResolveAssetAsync(req.AssetType, req.AssetId, ct)
            ?? throw AssetNotFound(req.AssetType, req.AssetId);
        await EnsureContentScopeAsync(req.StudentId, asset, ct);

        // App-layer duplicate guard (the DB unique index is the backstop on PostgreSQL;
        // the InMemory provider does not enforce unique indexes).
        var duplicate = await _db.MediaBookmarks.AsNoTracking()
            .AnyAsync(bookmark => bookmark.StudentId == req.StudentId
                && bookmark.AssetType == req.AssetType
                && bookmark.AssetId == req.AssetId
                && bookmark.StartSeconds == req.StartSeconds
                && bookmark.EndSeconds == req.EndSeconds, ct);
        if (duplicate)
            throw new ConflictException("توجد علامة مطابقة لهذا المقطع مسبقاً");

        var bookmark = new MediaBookmark
        {
            StudentId = req.StudentId,
            AssetType = req.AssetType,
            AssetId = req.AssetId,
            StartSeconds = req.StartSeconds,
            EndSeconds = req.EndSeconds,
            Label = label,
            Note = req.Note
        };
        await _db.MediaBookmarks.AddAsync(bookmark, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        // Unknown duration is NOT a rejection (spec §1.B): the API layer surfaces it as
        // the X-Duration-Warning header so the client can re-verify the range.
        return new CreateMediaBookmarkResult(ToDto(bookmark), DurationKnown: asset.DurationSeconds is > 0);
    }

    public async Task<List<MediaBookmarkDto>> Handle(ListMediaBookmarksQuery req, CancellationToken ct)
    {
        var asset = await ResolveAssetAsync(req.AssetType, req.AssetId, ct)
            ?? throw AssetNotFound(req.AssetType, req.AssetId);
        await EnsureContentScopeAsync(req.StudentId, asset, ct);

        return await _db.MediaBookmarks.AsNoTracking()
            .Where(bookmark => bookmark.StudentId == req.StudentId
                && bookmark.AssetType == req.AssetType
                && bookmark.AssetId == req.AssetId)
            .OrderBy(bookmark => bookmark.StartSeconds)
            .ThenBy(bookmark => bookmark.EndSeconds)
            .Select(bookmark => new MediaBookmarkDto(
                bookmark.Id, bookmark.AssetType, bookmark.AssetId,
                bookmark.StartSeconds, bookmark.EndSeconds,
                bookmark.Label, bookmark.Note, bookmark.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<MediaBookmarkDto> Handle(UpdateMediaBookmarkCommand req, CancellationToken ct)
    {
        var bookmark = await _db.MediaBookmarks
            .FirstOrDefaultAsync(bookmark => bookmark.Id == req.BookmarkId, ct)
            ?? throw new NotFoundException("MediaBookmark", req.BookmarkId);
        if (bookmark.StudentId != req.StudentId)
            throw new ForbiddenException("لا يمكنك تعديل علامة تخص طالباً آخر");

        // PATCH semantics: null leaves the field untouched; a provided label is trimmed
        // and validated with the same rules as create. The time window never moves.
        var label = req.Label is null ? bookmark.Label : req.Label.Trim();
        if (label.Length is < 1 or > MaxBookmarkLabelLength)
            throw new DomainException("عنوان العلامة مطلوب وبحد أقصى 100 حرف", "BOOKMARK_LABEL_INVALID");
        if (req.Note is { Length: > MaxBookmarkNoteLength })
            throw new DomainException("ملاحظة العلامة لا تتجاوز 500 حرف", "BOOKMARK_NOTE_TOO_LONG");

        bookmark.Label = label;
        if (req.Note is not null)
            bookmark.Note = req.Note;
        await _unitOfWork.SaveChangesAsync(ct);

        return ToDto(bookmark);
    }

    public async Task<Unit> Handle(DeleteMediaBookmarkCommand req, CancellationToken ct)
    {
        var bookmark = await _db.MediaBookmarks
            .FirstOrDefaultAsync(bookmark => bookmark.Id == req.BookmarkId, ct)
            ?? throw new NotFoundException("MediaBookmark", req.BookmarkId);
        if (bookmark.StudentId != req.StudentId)
            throw new ForbiddenException("لا يمكنك حذف علامة تخص طالباً آخر");

        _db.MediaBookmarks.Remove(bookmark);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    // ===== §1.C: playback progress =====

    public async Task<PlaybackProgressDto> Handle(UpsertPlaybackProgressCommand req, CancellationToken ct)
    {
        if (req.PositionSeconds < 0)
            throw new DomainException("موضع التشغيل لا يمكن أن يكون سالباً", "PROGRESS_POSITION_INVALID");

        var asset = await ResolveAssetAsync(req.AssetType, req.AssetId, ct)
            ?? throw AssetNotFound(req.AssetType, req.AssetId);
        await EnsureContentScopeAsync(req.StudentId, asset, ct);

        var existing = await _db.PlaybackProgress
            .FirstOrDefaultAsync(progress => progress.StudentId == req.StudentId
                && progress.AssetType == req.AssetType
                && progress.AssetId == req.AssetId, ct);

        // Duration is sticky: a known duration is never overwritten by an unknown one —
        // first the client's report, then the stored value, then the asset's metadata.
        var duration = req.DurationSeconds is > 0 ? req.DurationSeconds
            : existing?.DurationSeconds is > 0 ? existing.DurationSeconds
            : asset.DurationSeconds is > 0 ? asset.DurationSeconds
            : null;

        // Position is clamped to the known duration; completion is ALWAYS derived
        // server-side (the client never sends a completion number it chose itself).
        var position = duration is > 0 ? Math.Min(req.PositionSeconds, duration.Value) : req.PositionSeconds;
        decimal? completion = duration is > 0 ? ComputeCompletion(position, duration.Value) : null;

        if (existing is null)
        {
            var progress = new PlaybackProgress
            {
                StudentId = req.StudentId,
                AssetType = req.AssetType,
                AssetId = req.AssetId,
                LastPositionSeconds = position,
                DurationSeconds = duration,
                CompletionPercent = completion
            };
            await _db.PlaybackProgress.AddAsync(progress, ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return ToDto(progress);
        }

        // Plain upsert semantics: the reported (clamped) position replaces the stored one.
        existing.LastPositionSeconds = position;
        existing.DurationSeconds = duration;
        existing.CompletionPercent = completion;
        await _unitOfWork.SaveChangesAsync(ct);
        return ToDto(existing);
    }

    public async Task<PlaybackProgressDto?> Handle(GetPlaybackProgressQuery req, CancellationToken ct)
    {
        var asset = await ResolveAssetAsync(req.AssetType, req.AssetId, ct)
            ?? throw AssetNotFound(req.AssetType, req.AssetId);
        await EnsureContentScopeAsync(req.StudentId, asset, ct);

        // No record yet → null; the API layer maps that to 204 No Content.
        return await _db.PlaybackProgress.AsNoTracking()
            .Where(progress => progress.StudentId == req.StudentId
                && progress.AssetType == req.AssetType
                && progress.AssetId == req.AssetId)
            .Select(progress => new PlaybackProgressDto(
                progress.AssetType, progress.AssetId,
                progress.LastPositionSeconds, progress.DurationSeconds,
                progress.CompletionPercent, progress.UpdatedAt))
            .FirstOrDefaultAsync(ct);
    }

    // ===== shared helpers =====

    /// <summary>The 95 % rule: past 95 % of the duration, completion pins to 100.</summary>
    private static decimal ComputeCompletion(int position, int duration) =>
        position >= duration * 0.95m
            ? 100m
            : Math.Round(Math.Min(100m, position * 100m / duration), 2);

    private sealed record ResolvedAsset(Guid SubjectId, int? DurationSeconds);

    /// <summary>
    /// Resolves the subject + known duration for a media asset with the same visibility
    /// rules as playback (published, not deleted, clean scan; published, not deleted course).
    /// </summary>
    private async Task<ResolvedAsset?> ResolveAssetAsync(MediaAssetType assetType, Guid assetId, CancellationToken ct)
    {
        if (assetType == MediaAssetType.LibraryFile)
            return await _db.LibraryFiles.AsNoTracking()
                .Where(file => file.Id == assetId && file.DeletedAt == null
                    && file.Status == ContentStatus.Published
                    && file.VirusScanStatus == VirusScanStatus.Clean)
                .Select(file => new ResolvedAsset(file.SubjectId, file.DurationSeconds))
                .FirstOrDefaultAsync(ct);

        return await _db.CourseEpisodes.AsNoTracking()
            .Where(episode => episode.Id == assetId && episode.DeletedAt == null
                && episode.Course.DeletedAt == null
                && episode.Course.Status == ContentStatus.Published)
            .Select(episode => new ResolvedAsset(episode.Course.SubjectId, episode.DurationSeconds))
            .FirstOrDefaultAsync(ct);
    }

    private async Task EnsureContentScopeAsync(Guid studentId, ResolvedAsset asset, CancellationToken ct)
    {
        if (!await _entitlements.CanAccessSubjectContentAsync(studentId, asset.SubjectId, SubscriptionContentScope.VideoAudio, ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى هذه الوسائط");
    }

    private static NotFoundException AssetNotFound(MediaAssetType assetType, Guid assetId) =>
        new(assetType == MediaAssetType.LibraryFile ? "LibraryFile" : "CourseEpisode", assetId);

    private static MediaBookmarkDto ToDto(MediaBookmark bookmark) => new(
        bookmark.Id, bookmark.AssetType, bookmark.AssetId,
        bookmark.StartSeconds, bookmark.EndSeconds,
        bookmark.Label, bookmark.Note, bookmark.CreatedAt);

    private static PlaybackProgressDto ToDto(PlaybackProgress progress) => new(
        progress.AssetType, progress.AssetId,
        progress.LastPositionSeconds, progress.DurationSeconds,
        progress.CompletionPercent, progress.UpdatedAt);
}
