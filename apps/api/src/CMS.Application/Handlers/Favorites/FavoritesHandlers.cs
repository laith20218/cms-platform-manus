using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Favorites;
using CMS.Application.Commands.Questions; // PagedResult<T>
using CMS.Application.DTOs.Favorites;
using CMS.Application.DTOs.Media;
using CMS.Application.Exceptions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Favorites;

/// <summary>
/// Push 11.3 — the favorites read/write pipeline, migrated off the controller's direct
/// IApplicationDbContext usage (the 11.2-DIAG T2 anomaly) onto the platform's MediatR
/// convention. Three surfaces live here:
/// <list type="bullet">
/// <item>GetFavoritesQuery — the ENRICHED list: filter + sort + pagination server-side,
/// batched content-scope filtering, playback-progress join, everything the student
/// favorites card renders in ONE round-trip (no N+1, ≤ 5 EF queries total — see the
/// per-step comments; measured in FavoritesHandlersTests via a counting DbContext);</item>
/// <item>CreateEpisodeFavoriteCommand — the player star button's save (whole-episode
/// favorite; timeline clips stay in MediaBookmark, product decision #1);</item>
/// <item>CreateQuestionOrFileFavoriteCommand + DeleteFavoriteCommand — the legacy
/// question/file mutations, semantics byte-identical with the pre-11.3 controller, now
/// dispatched through the same pipeline (the new unified DELETE route reuses it for
/// episodes too).</item>
/// </list>
/// </summary>
public sealed class FavoritesHandlers :
    IRequestHandler<GetFavoritesQuery, PagedResult<FavoriteItemDto>>,
    IRequestHandler<CreateEpisodeFavoriteCommand, CreateFavoriteResult>,
    IRequestHandler<CreateQuestionOrFileFavoriteCommand, CreateFavoriteResult>,
    IRequestHandler<DeleteFavoriteCommand, Unit>
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;
    private const int QuestionTitleClamp = 160;

    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IEntitlementService _entitlements;
    private readonly ISignedEntitlementService _signedEntitlements;

    public FavoritesHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IEntitlementService entitlements,
        ISignedEntitlementService signedEntitlements)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _entitlements = entitlements;
        _signedEntitlements = signedEntitlements;
    }

    // ===== Read: enriched, filtered, sorted, paged =====

    public async Task<PagedResult<FavoriteItemDto>> Handle(GetFavoritesQuery req, CancellationToken ct)
    {
        var sort = (req.Sort ?? string.Empty).Trim().ToLowerInvariant();
        if (sort.Length == 0) sort = "recent";
        if (sort is not ("recent" or "oldest" or "alpha"))
            throw new DomainException("ترتيب المفضلة غير صالح — القيم المسموحة: recent أو oldest أو alpha", "FAVORITES_INVALID_SORT");

        var type = (req.Type ?? string.Empty).Trim().ToLowerInvariant();
        if (type.Length == 0) type = null!;
        if (type is not (null or "question" or "file" or "episode"))
            throw new DomainException("نوع المفضلة غير صالح — القيم المسموحة: question أو file أو episode", "FAVORITES_INVALID_TYPE");

        var page = Math.Max(1, req.Page);
        var pageSize = req.PageSize is <= 0 ? DefaultPageSize : Math.Clamp(req.PageSize, 1, MaxPageSize);

        // Query 1 of ≤5 — the student's favorites for the requested type with EVERY target
        // relation joined in the same query (each row has exactly one non-null target FK, so
        // the LEFT-JOIN fan-out stays one row per favorite). The per-student set is bounded
        // by the user's own favorites; the CLIENT payload remains paginated. The full-set
        // fetch (instead of DB-side Skip/Take) is deliberate: it keeps the total query count
        // within the ≤5 budget INCLUDING the batched entitlement checks, and the "alpha"
        // sort — a cross-table title ordering — is impossible in a single SQL over favorites
        // anyway, so the uniform in-memory pipeline serves all three sort modes identically.
        var favoritesQuery = _db.Favorites.AsNoTracking()
            .Include(favorite => favorite.Question)
                .ThenInclude(question => question!.Lecture)
            .Include(favorite => favorite.LibraryFile)
            .Include(favorite => favorite.CourseEpisode)
                .ThenInclude(episode => episode!.Course)
            .Where(favorite => favorite.StudentId == req.StudentId);

        favoritesQuery = type switch
        {
            "question" => favoritesQuery.Where(favorite => favorite.QuestionId != null),
            "file" => favoritesQuery.Where(favorite => favorite.LibraryFileId != null),
            "episode" => favoritesQuery.Where(favorite => favorite.CourseEpisodeId != null),
            _ => favoritesQuery,
        };

        var favorites = await favoritesQuery.ToListAsync(ct);

        // Target visibility (same gates as the create paths — a favorite may only point at
        // a target the student could have saved): questions must be Published, files
        // Published AND not soft-deleted, episodes not deleted inside a Published course.
        var classified = new List<(Favorite Favorite, Guid SubjectId, SubscriptionContentScope Scope)>();
        foreach (var favorite in favorites)
        {
            if (favorite.Question is { Status: ContentStatus.Published } question)
                classified.Add((favorite, question.SubjectId, SubscriptionContentScope.QuestionsExams));
            else if (favorite.LibraryFile is { Status: ContentStatus.Published, DeletedAt: null } file)
                classified.Add((favorite, file.SubjectId, RequiredContentScope(file.Type)));
            else if (favorite.CourseEpisode is { DeletedAt: null } episode
                && episode.Course is { Status: ContentStatus.Published, DeletedAt: null } course)
                classified.Add((favorite, course.SubjectId, SubscriptionContentScope.VideoAudio));
        }

        // Queries 2–4 of ≤5 — ONE batched entitlement evaluation for every distinct
        // (subject, scope) pair on the page's worth of candidates: student standing,
        // subject standing, active grants. Replaces the previous per-item
        // CanAccessSubjectContentAsync loop (3 queries × N items).
        var accessible = classified.Count == 0
            ? new Dictionary<SubscriptionContentScope, HashSet<Guid>>()
            : await _entitlements.GetAccessibleSubjectMapAsync(
                req.StudentId,
                classified.Select(candidate => (candidate.SubjectId, candidate.Scope)).ToList(),
                ct);
        var visible = classified
            .Where(candidate => accessible.TryGetValue(candidate.Scope, out var subjectIds)
                && subjectIds.Contains(candidate.SubjectId))
            .ToList();
        var total = visible.Count;

        // In-memory sort + pagination (uniform across all three sort modes — see above).
        IOrderedEnumerable<(Favorite Favorite, Guid SubjectId, SubscriptionContentScope Scope)> ordered = sort switch
        {
            "oldest" => visible.OrderBy(candidate => candidate.Favorite.CreatedAt),
            "alpha" => visible
                .OrderBy(candidate => TitleOf(candidate.Favorite), StringComparer.OrdinalIgnoreCase)
                .ThenBy(candidate => candidate.Favorite.CreatedAt),
            _ => visible.OrderByDescending(candidate => candidate.Favorite.CreatedAt),
        };
        var pageRows = ordered
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        // Query 5 of ≤5 — playback progress for the PAGE's video/audio targets (episodes
        // always; library files only of Video/Audio type — the only assets that ever write
        // a progress row). Skipped entirely for question/text-only pages.
        var episodeIds = pageRows
            .Where(candidate => candidate.Favorite.CourseEpisodeId.HasValue)
            .Select(candidate => candidate.Favorite.CourseEpisodeId!.Value)
            .ToList();
        var mediaFileIds = pageRows
            .Where(candidate => candidate.Favorite.LibraryFile is { Type: LibraryFileType.Video or LibraryFileType.Audio })
            .Select(candidate => candidate.Favorite.LibraryFileId!.Value)
            .ToList();
        Dictionary<(MediaAssetType AssetType, Guid AssetId), PlaybackProgress> progressByAsset;
        if (episodeIds.Count == 0 && mediaFileIds.Count == 0)
        {
            progressByAsset = new Dictionary<(MediaAssetType, Guid), PlaybackProgress>();
        }
        else
        {
            var progressRows = await _db.PlaybackProgress.AsNoTracking()
                .Where(progress => progress.StudentId == req.StudentId
                    && (progress.AssetType == MediaAssetType.CourseEpisode && episodeIds.Contains(progress.AssetId)
                        || progress.AssetType == MediaAssetType.LibraryFile && mediaFileIds.Contains(progress.AssetId)))
                .ToListAsync(ct);
            progressByAsset = progressRows.ToDictionary(progress => (progress.AssetType, progress.AssetId));
        }

        var items = pageRows.Select(candidate =>
        {
            // Progress join — episodes always; library files only of Video/Audio type
            // (the only assets that ever write a PlaybackProgress row). Questions never
            // enter the lookup, so target ids can never cross-match across asset types.
            PlaybackProgress? progress = null;
            if (candidate.Favorite.CourseEpisodeId.HasValue)
                progressByAsset.TryGetValue((MediaAssetType.CourseEpisode, candidate.Favorite.CourseEpisodeId.Value), out progress);
            else if (candidate.Favorite.LibraryFileId.HasValue
                && candidate.Favorite.LibraryFile is { Type: LibraryFileType.Video or LibraryFileType.Audio })
                progressByAsset.TryGetValue((MediaAssetType.LibraryFile, candidate.Favorite.LibraryFileId.Value), out progress);
            return MapItem(candidate.Favorite, progress);
        }).ToList();

        return new PagedResult<FavoriteItemDto>(
            items, total, page, pageSize, (int)Math.Ceiling(total / (double)pageSize));
    }

    // ===== Write: episode favorite (player star button) =====

    public async Task<CreateFavoriteResult> Handle(CreateEpisodeFavoriteCommand req, CancellationToken ct)
    {
        // Episode resolution mirrors GetPlaybackUrlQuery's gate (course visibility →
        // hosted-source → upload completion → transcoding state → entitlement).
        var episode = await _db.CourseEpisodes.AsNoTracking()
            .Where(item => item.Id == req.EpisodeId && item.DeletedAt == null)
            .Select(item => new
            {
                Episode = item,
                CourseSubjectId = item.Course.SubjectId,
                CourseStatus = item.Course.Status,
                CourseDeleted = item.Course.DeletedAt != null
            })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("CourseEpisode", req.EpisodeId);

        if (episode.CourseDeleted || episode.CourseStatus != ContentStatus.Published)
            throw new ForbiddenException("هذا الكورس غير متاح");
        if (episode.Episode.SourceType == CourseEpisodeSource.YouTube || string.IsNullOrEmpty(episode.Episode.FileKey))
            throw new DomainException("هذه الحلقة مستضافة على يوتيوب وليست لها نسخة في التخزين المباشر", "MEDIA_YOUTUBE_HOSTED");
        if (episode.Episode.SourceType == CourseEpisodeSource.Upload && !string.IsNullOrEmpty(episode.Episode.UploadId))
            throw new DomainException("لم يكتمل رفع هذه الحلقة بعد", "EPISODE_UPLOAD_INCOMPLETE");

        // Playback-identical transcoding gate (409 while the ladder is still processing,
        // 422 on terminal failure): a favorite must point at an episode the student can
        // actually play. NULL status (legacy pre-pipeline MP4) stays favoritable — that is
        // the playable source-object path.
        EnsureEpisodePlayable(episode.Episode.ProcessingStatus);

        await EnsureContentAccessAsync(
            req.StudentId, episode.CourseSubjectId, SubscriptionContentScope.VideoAudio,
            req.EntitlementToken, req.InstallationId, ct);

        // Idempotent: an existing row answers IsNew=false (API → 200 OK instead of 201).
        var existing = await _db.Favorites.AsNoTracking()
            .SingleOrDefaultAsync(favorite => favorite.StudentId == req.StudentId && favorite.CourseEpisodeId == req.EpisodeId, ct);
        if (existing is not null)
            return new CreateFavoriteResult(new FavoriteMutationDto(existing.Id, req.EpisodeId, "episode", true), IsNew: false);

        var favorite = new Favorite { StudentId = req.StudentId, CourseEpisodeId = req.EpisodeId };
        _db.Favorites.Add(favorite);
        await _unitOfWork.SaveChangesAsync(ct);
        return new CreateFavoriteResult(new FavoriteMutationDto(favorite.Id, req.EpisodeId, "episode", true), IsNew: true);
    }

    // ===== Write: legacy question/file create (POST / favorites body) =====

    public async Task<CreateFavoriteResult> Handle(CreateQuestionOrFileFavoriteCommand req, CancellationToken ct)
    {
        var hasQuestion = req.QuestionId is { } questionId && questionId != Guid.Empty;
        var hasFile = req.LibraryFileId is { } fileId && fileId != Guid.Empty;
        if (hasQuestion == hasFile)
            throw new DomainException("مطلوب هدف واحد بالضبط للمفضلة (سؤال أو ملف)", "FAVORITES_EXACTLY_ONE_TARGET_REQUIRED");

        if (hasQuestion)
        {
            var question = await _db.Questions.AsNoTracking()
                .Where(item => item.Id == req.QuestionId && item.Status == ContentStatus.Published)
                .Select(item => new { item.Id, item.SubjectId })
                .SingleOrDefaultAsync(ct)
                ?? throw new NotFoundException("Question", req.QuestionId!.Value);

            await EnsureContentAccessAsync(
                req.StudentId, question.SubjectId, SubscriptionContentScope.QuestionsExams,
                req.EntitlementToken, req.InstallationId, ct);

            var existing = await _db.Favorites
                .SingleOrDefaultAsync(favorite => favorite.StudentId == req.StudentId && favorite.QuestionId == question.Id, ct);
            if (existing is not null)
                return new CreateFavoriteResult(new FavoriteMutationDto(existing.Id, question.Id, "question", true), IsNew: false);

            var favorite = new Favorite { StudentId = req.StudentId, QuestionId = question.Id };
            _db.Favorites.Add(favorite);
            await _unitOfWork.SaveChangesAsync(ct);
            return new CreateFavoriteResult(new FavoriteMutationDto(favorite.Id, question.Id, "question", true), IsNew: true);
        }

        var file = await _db.LibraryFiles.AsNoTracking()
            .Where(item => item.Id == req.LibraryFileId && item.Status == ContentStatus.Published && item.DeletedAt == null)
            .Select(item => new { item.Id, item.SubjectId, item.Type })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("LibraryFile", req.LibraryFileId!.Value);

        await EnsureContentAccessAsync(
            req.StudentId, file.SubjectId, RequiredContentScope(file.Type),
            req.EntitlementToken, req.InstallationId, ct);

        var existingFileFavorite = await _db.Favorites
            .SingleOrDefaultAsync(favorite => favorite.StudentId == req.StudentId && favorite.LibraryFileId == file.Id, ct);
        if (existingFileFavorite is not null)
            return new CreateFavoriteResult(new FavoriteMutationDto(existingFileFavorite.Id, file.Id, "file", true), IsNew: false);

        var newFileFavorite = new Favorite { StudentId = req.StudentId, LibraryFileId = file.Id };
        _db.Favorites.Add(newFileFavorite);
        await _unitOfWork.SaveChangesAsync(ct);
        return new CreateFavoriteResult(new FavoriteMutationDto(newFileFavorite.Id, file.Id, "file", true), IsNew: true);
    }

    // ===== Write: unified delete =====

    public async Task<Unit> Handle(DeleteFavoriteCommand req, CancellationToken ct)
    {
        var targetType = (req.TargetType ?? string.Empty).Trim().ToLowerInvariant();

        Guid subjectId;
        SubscriptionContentScope scope;
        switch (targetType)
        {
            case "question":
            {
                var questionSubject = await _db.Questions.AsNoTracking()
                    .Where(item => item.Id == req.TargetId && item.Status == ContentStatus.Published)
                    .Select(item => (Guid?)item.SubjectId)
                    .SingleOrDefaultAsync(ct);
                if (questionSubject is null) throw new NotFoundException("Question", req.TargetId);
                subjectId = questionSubject.Value;
                scope = SubscriptionContentScope.QuestionsExams;
                break;
            }
            case "file":
            {
                var fileInfo = await _db.LibraryFiles.AsNoTracking()
                    .Where(item => item.Id == req.TargetId && item.DeletedAt == null)
                    .Select(item => new { item.SubjectId, item.Type })
                    .SingleOrDefaultAsync(ct)
                    ?? throw new NotFoundException("LibraryFile", req.TargetId);
                subjectId = fileInfo.SubjectId;
                scope = RequiredContentScope(fileInfo.Type);
                break;
            }
            case "episode":
            {
                var episodeSubject = await _db.CourseEpisodes.AsNoTracking()
                    .Where(item => item.Id == req.TargetId && item.DeletedAt == null)
                    .Select(item => (Guid?)item.Course.SubjectId)
                    .SingleOrDefaultAsync(ct);
                if (episodeSubject is null) throw new NotFoundException("CourseEpisode", req.TargetId);
                subjectId = episodeSubject.Value;
                scope = SubscriptionContentScope.VideoAudio;
                break;
            }
            default:
                throw new DomainException("نوع هدف المفضلة غير صالح — القيم المسموحة: question أو file أو episode", "FAVORITES_INVALID_TARGET_TYPE");
        }

        await EnsureContentAccessAsync(req.StudentId, subjectId, scope, req.EntitlementToken, req.InstallationId, ct);

        var favorite = targetType switch
        {
            "question" => await _db.Favorites
                .SingleOrDefaultAsync(item => item.StudentId == req.StudentId && item.QuestionId == req.TargetId, ct),
            "file" => await _db.Favorites
                .SingleOrDefaultAsync(item => item.StudentId == req.StudentId && item.LibraryFileId == req.TargetId, ct),
            "episode" => await _db.Favorites
                .SingleOrDefaultAsync(item => item.StudentId == req.StudentId && item.CourseEpisodeId == req.TargetId, ct),
            _ => null,
        };

        if (favorite is not null)
        {
            _db.Favorites.Remove(favorite);
            await _unitOfWork.SaveChangesAsync(ct);
        }

        return Unit.Value;
    }

    // ===== shared helpers =====

    /// <summary>
    /// Signed-entitlement validation against the target's subject (X-Entitlement +
    /// X-Installation-Id, subject-scoped) followed by the real-time content-scope check —
    /// the same two steps the pre-11.3 controller performed in ValidateContentAccessAsync.
    /// </summary>
    private async Task EnsureContentAccessAsync(
        Guid studentId, Guid subjectId, SubscriptionContentScope scope,
        string entitlementToken, string installationId, CancellationToken ct)
    {
        var validation = await _signedEntitlements.ValidateAsync(entitlementToken, studentId, installationId, subjectId, ct);
        if (!validation.IsValid)
            throw new ForbiddenException("الاستحقاق غير صالح أو لا يغطي محتوى هذه المادة");

        if (!await _entitlements.CanAccessSubjectContentAsync(studentId, subjectId, scope, ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى محتوى هذه المادة");
    }

    private static void EnsureEpisodePlayable(ProcessingStatus? status)
    {
        switch (status)
        {
            case null:
                return; // legacy pre-pipeline MP4 — the playable source-object path
            case ProcessingStatus.Pending:
            case ProcessingStatus.Transcoding_360p:
            case ProcessingStatus.Transcoding_720p:
            case ProcessingStatus.Transcoding_1080p:
                throw new ConflictException(
                    "الفيديو قيد المعالجة على الخادم — جاري إنشاء نسخ المشاهدة، أعد المحاولة بعد قليل.\nThe video is still being processed on the server — please try again shortly.");
            case ProcessingStatus.Failed:
                throw new MediaProcessingException(technicalDetails: MediaProcessingFailure.TechnicalDetails);
            default:
                return; // Ready
        }
    }

    private static SubscriptionContentScope RequiredContentScope(LibraryFileType type) =>
        type is LibraryFileType.Video or LibraryFileType.Audio
            ? SubscriptionContentScope.VideoAudio
            : SubscriptionContentScope.LecturesText;

    private static string TitleOf(Favorite favorite) => favorite switch
    {
        { Question: { } question } => ClampTitle(question.Text),
        { LibraryFile: { } file } => file.Title,
        { CourseEpisode: { } episode } => episode.Title,
        _ => string.Empty,
    };

    private static string ClampTitle(string text)
    {
        var normalized = text.Trim();
        return normalized.Length <= QuestionTitleClamp ? normalized : normalized[..QuestionTitleClamp] + "…";
    }

    private static FavoriteItemDto MapItem(Favorite favorite, PlaybackProgress? progress) => favorite switch
    {
        { Question: { } question } => new FavoriteItemDto(
            favorite.Id,
            "question",
            question.Id,
            ClampTitle(question.Text),
            question.Lecture?.NameAr,
            ThumbnailUrl: null,
            FileType: null,
            DurationSeconds: null,
            ProcessingStatus: null,
            favorite.CreatedAt,
            Progress: null),
        { LibraryFile: { } file } => new FavoriteItemDto(
            favorite.Id,
            "file",
            file.Id,
            file.Title,
            file.Category?.ToString(),
            file.ThumbnailUrl,
            file.Type.ToString().ToLowerInvariant(),
            file.DurationSeconds,
            file.ProcessingStatus?.ToString(),
            favorite.CreatedAt,
            progress is null ? null : ToProgressDto(progress)),
        { CourseEpisode: { } episode } => new FavoriteItemDto(
            favorite.Id,
            "episode",
            episode.Id,
            episode.Title,
            episode.Course?.Title,
            episode.Course?.CoverImageUrl, // product decision #2 — course cover as episode thumbnail fallback
            FileTypeOf(episode),
            episode.DurationSeconds,
            episode.ProcessingStatus?.ToString(),
            favorite.CreatedAt,
            progress is null ? null : ToProgressDto(progress)),
        _ => throw new InvalidOperationException("Favorite row without a resolved target — data integrity violation"),
    };

    private static string FileTypeOf(CourseEpisode episode) =>
        episode.ContentType?.StartsWith("audio", StringComparison.OrdinalIgnoreCase) == true ? "audio" : "video";

    private static FavoriteProgressDto ToProgressDto(PlaybackProgress progress) => new(
        progress.LastPositionSeconds,
        progress.DurationSeconds,
        progress.CompletionPercent is { } completion ? (int)Math.Round(completion) : null);
}
