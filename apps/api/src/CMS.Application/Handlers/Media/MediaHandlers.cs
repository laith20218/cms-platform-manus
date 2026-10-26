using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CMS.Application.Commands.Media;
using CMS.Application.DTOs.Media;
using CMS.Application.Exceptions;
using CMS.Application.Interfaces;
using CMS.Domain.Constants;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Media;

/// <summary>
/// Push 10.0 — student media backend:
///   • §1.A direct playback URLs for stored video/audio (object-scoped presigned GET
///     via the Upstash agent — R2 host, Range-capable, TTL from
///     <see cref="MediaPolicy"/>); documents keep the same-origin library channel;
///   • §1.B per-asset time-range bookmarks (first-class entity, strictly separate
///     from Favorite);
///   • §1.C playback progress (resume position + derived completion, 95 % rule).
///
/// Push 10.5 — §1.A is transcoding-aware: an asset whose FFmpeg ladder is Ready and
/// has a pinned HlsKey serves the HLS master playlist (application/vnd.apple.mpegurl)
/// instead of the source object — the student player's dual engine routes .m3u8 URLs
/// to hls.js (10.4). Assets still encoding answer 409 (dual-language); terminal
/// failures answer 422 with both audiences in the ProblemDetails payload. NULL
/// ProcessingStatus keeps the legacy source-object path (audio / YouTube / pre-10.3).
///
/// Every student entry point enforces the VideoAudio content scope through
/// IEntitlementService — the same gate the course catalog and episode access use.
///
/// Push 11.1 — the HLS 401 incident fix: §1.A now answers a same-API PROXY route
/// (/api/v1/media/hls/{assetType}/{assetId}/master.m3u8 — the controller absolutizes
/// the handler's relative form) instead of a presigned master.m3u8. S3 presigns are
/// object-scoped: they cannot authorize the ladder's RELATIVE children
/// ({rung}/index.m3u8, {rung}/segment_NNN.ts), so the private bucket answered every
/// child request with 401 and the player looped on «جاري تجديد الرابط…». The new
/// GetHlsObjectQuery streams each ladder object through the API (server-side storage
/// credentials, entitlement gate per request, strict path whitelist). MP4/audio and
/// YouTube playback are unchanged.
/// </summary>
public class MediaHandlers :
    IRequestHandler<GetPlaybackUrlQuery, PlaybackUrlDto>,
    IRequestHandler<GetHlsObjectQuery, HlsObjectDto>,
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

    /// <summary>HLS master playlist MIME — the presigned key ends with master.m3u8 and
    /// the student player's dual engine routes .m3u8 URLs to hls.js (Push 10.4).</summary>
    private const string HlsContentType = "application/vnd.apple.mpegurl";

    /// <summary>Push 11.1 — MPEG-TS segment MIME (mirrors the transcoder's upload mapping).</summary>
    private const string TsContentType = "video/mp2t";

    /// <summary>Push 11.1 — playlists are tiny and must always reflect the pinned ladder
    /// (no intermediary caching of manifests).</summary>
    private const string HlsPlaylistCacheControl = "private, no-store";

    /// <summary>Push 11.1 — VOD segments are immutable per key, so a short private browser
    /// cache is safe and keeps seeks/reloads off the API.</summary>
    private const string HlsSegmentCacheControl = "private, max-age=300";

    /// <summary>Push 11.1 — max segments in one proxied path (master + rung + file = 3 in
    /// the FFmpeg layout; 8 leaves generous headroom).</summary>
    private const int HlsMaxPathSegments = 8;

    /// <summary>Push 11.1 — hard cap on the whole relative path.</summary>
    private const int HlsMaxPathLength = 256;

    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IFileStorageService _storage;
    private readonly IEntitlementService _entitlements;
    private readonly ILogger<MediaHandlers> _logger;

    public MediaHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IFileStorageService storage,
        IEntitlementService entitlements,
        ILogger<MediaHandlers> logger)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _storage = storage;
        _entitlements = entitlements;
        _logger = logger;
    }

    // ===== §1.A: direct playback URL =====

    public async Task<PlaybackUrlDto> Handle(GetPlaybackUrlQuery req, CancellationToken ct)
    {
        string fileKey;
        string contentType;
        string? hlsKey;

        if (req.AssetType == MediaAssetType.LibraryFile)
        {
            var file = await _db.LibraryFiles.AsNoTracking()
                .Where(file => file.Id == req.AssetId && file.DeletedAt == null
                    && file.Status == ContentStatus.Published
                    && file.VirusScanStatus == VirusScanStatus.Clean)
                .Select(file => new { file.FileUrl, file.Type, file.FileFormat, file.YoutubeVideoId, file.SubjectId, file.ProcessingStatus, file.HlsKey })
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

            // Push 10.5 — transcoding-aware resolution AFTER the entitlement gate
            // (processing state is never leaked to unentitled callers).
            var resolvedHlsKey = ResolveHlsKeyForPlayback(file.ProcessingStatus, file.HlsKey);
            hlsKey = resolvedHlsKey;
            fileKey = resolvedHlsKey ?? file.FileUrl;
            contentType = resolvedHlsKey is not null ? HlsContentType
                : string.IsNullOrWhiteSpace(file.FileFormat)
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

            // Push 10.5 — same transcoding-aware resolution as library files.
            var resolvedHlsKey = ResolveHlsKeyForPlayback(episode.Episode.ProcessingStatus, episode.Episode.HlsKey);
            hlsKey = resolvedHlsKey;
            fileKey = resolvedHlsKey ?? episode.Episode.FileKey!;
            contentType = resolvedHlsKey is not null ? HlsContentType
                : string.IsNullOrWhiteSpace(episode.Episode.ContentType) ? "video/mp4" : episode.Episode.ContentType!;
        }

        // Push 11.1 — HLS ladders stop handing out presigned URLs. An S3 presign is
        // object-scoped: it authorizes exactly {hlsKey} (master.m3u8), while the
        // playlists reference their children by RELATIVE URI — the player resolves them
        // against the presigned URL and requests them from the bucket with NO signature,
        // which the private bucket rejects with 401 (Wave 10 production incident). The
        // ladder is therefore served through the same-API proxy route instead; the
        // controller absolutizes the relative form against the request host. The TTL is
        // kept from MediaPolicy on purpose: the proxy URL itself does not expire, but the
        // cadence keeps the player's entitlement + access tokens fresh — the proxy gate
        // re-validates them on EVERY object request.
        var ttl = TimeSpan.FromSeconds(MediaPolicy.PlaybackUrlTtlSeconds);

        if (hlsKey is not null)
        {
            return new PlaybackUrlDto(
                HlsProxyMasterUrl(req.AssetType, req.AssetId),
                MediaPolicy.PlaybackUrlTtlSeconds,
                DateTime.UtcNow.Add(ttl),
                contentType,
                SupportsRange: false);
        }

        // Object-scoped presign via the Upstash agent (/v1/presign) — Push 10.0c security
        // fix: agent-signed GET URLs name exactly ONE object and expire with the URL.
        // The previous credential-lease path signed with the bucket-wide session
        // credential, so every playback URL embedded X-Amz-Security-Token — a
        // bucket-wide read/write grant for the URL's lifetime. R2 serves Range requests
        // directly; the player refreshes the URL on error/stall for long media.
        var url = await _storage.GetSignedUrlAsync(fileKey, ttl, ct);

        return new PlaybackUrlDto(
            url,
            MediaPolicy.PlaybackUrlTtlSeconds,
            DateTime.UtcNow.Add(ttl),
            contentType,
            SupportsRange: true);
    }

    // ===== §1.A′: Push 11.1 — HLS proxy object streaming =====

    /// <summary>
    /// Streams one object of a Ready asset's HLS ladder through the API. Gate order is
    /// deliberate: (1) the relative path is whitelisted BEFORE any database or storage
    /// work (garbage requests cost nothing), (2) the asset resolves with the same
    /// visibility rules as playback, (3) the VideoAudio entitlement gate, (4) the
    /// transcoding state (409 while encoding, 422 on terminal failure), (5) only then
    /// does storage see the derived key. A missing object answers a real 404 — B2
    /// answers 401 for missing keys in private buckets, and surfacing 404 here is what
    /// separates "ladder tree never migrated from the retired provider" (doc 04 §1
    /// secondary hypothesis) from an authorization failure.
    /// </summary>
    public async Task<HlsObjectDto> Handle(GetHlsObjectQuery req, CancellationToken ct)
    {
        if (!IsValidHlsRelativePath(req.Path))
            throw new DomainException("مسار ملف HLS غير صالح", "HLS_PATH_INVALID");

        Guid subjectId;
        ProcessingStatus? processingStatus;
        string? hlsKey;

        if (req.AssetType == MediaAssetType.LibraryFile)
        {
            var file = await _db.LibraryFiles.AsNoTracking()
                .Where(file => file.Id == req.AssetId && file.DeletedAt == null
                    && file.Status == ContentStatus.Published
                    && file.VirusScanStatus == VirusScanStatus.Clean)
                .Select(file => new { file.SubjectId, file.ProcessingStatus, file.HlsKey })
                .FirstOrDefaultAsync(ct)
                ?? throw new NotFoundException("LibraryFile", req.AssetId);

            subjectId = file.SubjectId;
            processingStatus = file.ProcessingStatus;
            hlsKey = file.HlsKey;
        }
        else
        {
            var episode = await _db.CourseEpisodes.AsNoTracking()
                .Where(episode => episode.Id == req.AssetId && episode.DeletedAt == null)
                .Select(episode => new
                {
                    episode.ProcessingStatus,
                    episode.HlsKey,
                    CourseSubjectId = episode.Course.SubjectId,
                    CourseStatus = episode.Course.Status,
                    CourseDeleted = episode.Course.DeletedAt != null
                })
                .FirstOrDefaultAsync(ct)
                ?? throw new NotFoundException("CourseEpisode", req.AssetId);

            if (episode.CourseDeleted || episode.CourseStatus != ContentStatus.Published)
                throw new ForbiddenException("هذا الكورس غير متاح");

            subjectId = episode.CourseSubjectId;
            processingStatus = episode.ProcessingStatus;
            hlsKey = episode.HlsKey;
        }

        if (!await _entitlements.CanAccessSubjectContentAsync(req.StudentId, subjectId, SubscriptionContentScope.VideoAudio, ct))
            throw new ForbiddenException("لا تملك صلاحية تشغيل هذه الوسائط");

        // Same transcoding-aware resolution as playback: 409 while encoding, 422 on
        // terminal failure, null (audio/YouTube/legacy rows — or a Ready anomaly without
        // a pinned key) means there is no ladder to proxy at all.
        var resolvedKey = ResolveHlsKeyForPlayback(processingStatus, hlsKey)
            ?? throw new NotFoundException("HlsLadder", req.AssetId);

        var objectKey = HlsObjectKeyFor(resolvedKey, req.Path);

        if (!await _storage.ExistsAsync(objectKey, ct))
        {
            // Diagnostic (mirrors the 10.13 evidence lines): a pinned-but-absent tree is
            // the retired-provider gap, not an auth problem — the key is the diff surface
            // against the bucket inventory.
            _logger.LogWarning(
                "HLS proxy miss: {AssetType} {AssetId} key {Key} — pinned ladder object absent from storage (retired-provider tree never migrated? handover doc 04 §1)",
                req.AssetType, req.AssetId, objectKey);
            throw new NotFoundException("HlsObject", objectKey);
        }

        var content = await _storage.DownloadAsync(objectKey, ct);

        _logger.LogInformation("HLS proxy hit: {AssetType} {AssetId} key {Key}",
            req.AssetType, req.AssetId, objectKey);

        var isSegment = IsSegmentPath(req.Path);
        return new HlsObjectDto(
            content,
            isSegment ? TsContentType : HlsContentType,
            isSegment ? HlsSegmentCacheControl : HlsPlaylistCacheControl);
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

    /// <summary>
    /// Push 10.5 — transcoding-aware playback key resolution.
    /// <list type="bullet">
    ///   <item><c>null</c> status — the pipeline never applied to the asset (audio,
    ///   YouTube, pre-10.3 rows): the source object stays the playback target (the
    ///   honest-degradation contract; students keep playing the MP4).</item>
    ///   <item>Pending / Transcoding_* — the ladder is still encoding: 409 Conflict
    ///   with a dual-language "still processing" message (the middleware maps
    ///   <see cref="ConflictException"/> to ProblemDetails).</item>
    ///   <item>Failed — terminal failure: <see cref="MediaProcessingException"/> →
    ///   422 Unprocessable Entity carrying the Arabic humanMessage + English
    ///   technicalDetails pair in the ProblemDetails payload.</item>
    ///   <item>Ready — returns the pinned HlsKey (master.m3u8). A Ready asset
    ///   without a key (pipeline anomaly) returns null → source-object fallback.</item>
    /// </list>
    /// Must be called AFTER the entitlement gate so processing state is never
    /// leaked to unentitled callers.
    /// </summary>
    private static string? ResolveHlsKeyForPlayback(ProcessingStatus? status, string? hlsKey)
    {
        switch (status)
        {
            case null:
                return null;
            case ProcessingStatus.Pending:
            case ProcessingStatus.Transcoding_360p:
            case ProcessingStatus.Transcoding_720p:
            case ProcessingStatus.Transcoding_1080p:
                throw new ConflictException(
                    "الفيديو قيد المعالجة على الخادم — جاري إنشاء نسخ المشاهدة، أعد المحاولة بعد قليل.\nThe video is still being processed on the server — please try again shortly.");
            case ProcessingStatus.Failed:
                throw new MediaProcessingException(technicalDetails: MediaProcessingFailure.TechnicalDetails);
            default:
                return hlsKey;
        }
    }

    /// <summary>
    /// Push 11.1 — the proxy route handed to the player for a Ready HLS asset, RELATIVE
    /// (same-API). The controller absolutizes it against the request scheme/host so the
    /// browser-side URL points at this API — the base every relative URI inside the
    /// playlists then resolves against (the property that makes the proxy work without
    /// rewriting manifests). Slugs mirror MediaController.TryParseAssetType.
    /// </summary>
    private static string HlsProxyMasterUrl(MediaAssetType assetType, Guid assetId) =>
        $"/api/v1/media/hls/{AssetTypeSlug(assetType)}/{assetId}/master.m3u8";

    private static string AssetTypeSlug(MediaAssetType assetType) =>
        assetType == MediaAssetType.LibraryFile ? "library-file" : "course-episode";

    /// <summary>
    /// Push 11.1 — strict whitelist for proxied HLS paths. The catch-all route value is
    /// user-controlled, so every shape the FFmpeg layout never produces is rejected
    /// BEFORE any database or storage access: traversal segments (.. / .), absolute
    /// paths, backslashes, anything still percent-encoded, NUL bytes, non-ASCII
    /// characters, excessive depth/length, and any extension other than .m3u8/.ts.
    /// The ladder only ever emits {master.m3u8, {rung}/index.m3u8, {rung}/segment_NNN.ts}.
    /// </summary>
    private static bool IsValidHlsRelativePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Length > HlsMaxPathLength)
            return false;
        if (path.Contains('\\') || path.Contains('%') || path.Contains('\0'))
            return false;
        if (path.StartsWith('/') || path.EndsWith('/'))
            return false;

        var segments = path.Split('/');
        if (segments.Length > HlsMaxPathSegments)
            return false;

        foreach (var segment in segments)
        {
            if (segment.Length is 0 or > 128)
                return false;
            if (segment is "." or "..")
                return false;
            // Leading/trailing dots = dotfile shapes the FFmpeg layout never emits
            // (and trailing dots are Windows path artifacts).
            if (segment.StartsWith('.') || segment.EndsWith('.'))
                return false;
            if (!segment.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-' or '.'))
                return false;
        }

        return path.EndsWith(".m3u8", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(".ts", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Derives the storage key: the HlsKey's directory (…/hls/) is the ladder
    /// root — exactly the base the playlists' relative URIs resolve against.</summary>
    private static string HlsObjectKeyFor(string hlsKey, string relativePath)
    {
        var lastSlash = hlsKey.LastIndexOf('/');
        var root = lastSlash >= 0 ? hlsKey[..(lastSlash + 1)] : string.Empty;
        return root + relativePath;
    }

    private static bool IsSegmentPath(string relativePath) =>
        relativePath.EndsWith(".ts", StringComparison.OrdinalIgnoreCase);

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
