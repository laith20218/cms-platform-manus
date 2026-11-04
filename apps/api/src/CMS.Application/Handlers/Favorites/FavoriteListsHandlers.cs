using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Favorites;
using CMS.Application.Commands.Questions; // PagedResult<T>
using CMS.Application.DTOs.Favorites;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Favorites;

/// <summary>
/// W15.0 — the custom favorites-lists pipeline (named question collections, separate from
/// the flat polymorphic favorites bucket; see the FavoriteList entity docblock). Surfaces:
/// <list type="bullet">
/// <item>GetFavoriteListsQuery — headers + computed counts (+ optional per-question
/// membership flags for the QuestionPage list picker) in ≤2 queries;</item>
/// <item>GetQuestionsInFavoriteListQuery — paged, search-filtered, entitlement-gated
/// question cards in the SAME FavoriteItemDto shape the flat list renders;</item>
/// <item>Create/Update/Delete list — student-owned metadata (JWT identity suffices,
/// no content scope needed) with same-name conflict detection;</item>
/// <item>Add/Remove question membership — the SAME gates as the flat question favorite
/// create/delete (Published target + QuestionsExams scope), idempotent.</item>
/// </list>
/// </summary>
public sealed class FavoriteListsHandlers :
    IRequestHandler<GetFavoriteListsQuery, IReadOnlyList<FavoriteListDto>>,
    IRequestHandler<GetQuestionsInFavoriteListQuery, PagedResult<FavoriteItemDto>>,
    IRequestHandler<CreateFavoriteListCommand, FavoriteListMutationDto>,
    IRequestHandler<UpdateFavoriteListCommand, FavoriteListMutationDto>,
    IRequestHandler<DeleteFavoriteListCommand, Unit>,
    IRequestHandler<AddQuestionToFavoriteListCommand, AddQuestionToFavoriteListResult>,
    IRequestHandler<RemoveQuestionFromFavoriteListCommand, Unit>
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;
    private const int NameMaxLength = 100;
    private const int DescriptionMaxLength = 500;
    private const int ColorMaxLength = 20;
    private const int QuestionTitleClamp = 160;

    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IEntitlementService _entitlements;
    private readonly ISignedEntitlementService _signedEntitlements;

    public FavoriteListsHandlers(
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

    // ===== Read: the student's lists (+ counts, + optional picker membership) =====

    public async Task<IReadOnlyList<FavoriteListDto>> Handle(GetFavoriteListsQuery req, CancellationToken ct)
    {
        // Query 1 — the student's non-deleted list headers, creation order (stable chips).
        var lists = await _db.FavoriteLists.AsNoTracking()
            .Where(list => list.StudentId == req.StudentId && list.DeletedAt == null)
            .OrderBy(list => list.CreatedAt)
            .ToListAsync(ct);

        if (lists.Count == 0)
            return Array.Empty<FavoriteListDto>();

        var listIds = lists.Select(list => list.Id).ToList();

        // Query 2 — grouped membership counts; when a picker QuestionId is supplied the SAME
        // query is narrowed to that question so ContainsQuestion resolves without a third call.
        var pairs = req.QuestionId is { } questionId
            ? await _db.FavoriteListItems.AsNoTracking()
                .Where(item => listIds.Contains(item.FavoriteListId) && item.QuestionId == questionId)
                .Select(item => item.FavoriteListId)
                .ToListAsync(ct)
            : null;

        var counts = await _db.FavoriteListItems.AsNoTracking()
            .Where(item => listIds.Contains(item.FavoriteListId))
            .GroupBy(item => item.FavoriteListId)
            .Select(group => new { ListId = group.Key, Count = group.Count() })
            .ToListAsync(ct);
        var countMap = counts.ToDictionary(row => row.ListId, row => row.Count);

        return lists
            .Select(list => new FavoriteListDto(
                list.Id,
                list.Name,
                list.Description,
                list.Color,
                countMap.TryGetValue(list.Id, out var count) ? count : 0,
                ContainsQuestion: pairs?.Contains(list.Id),
                list.CreatedAt,
                list.UpdatedAt))
            .ToList();
    }

    // ===== Read: questions inside one list (paged, filtered, entitlement-gated) =====

    public async Task<PagedResult<FavoriteItemDto>> Handle(GetQuestionsInFavoriteListQuery req, CancellationToken ct)
    {
        var list = await FindOwnedListAsync(req.StudentId, req.ListId, ct);

        var page = Math.Max(1, req.Page);
        var pageSize = req.PageSize is <= 0 ? DefaultPageSize : Math.Clamp(req.PageSize, 1, MaxPageSize);
        var search = req.Search?.Trim();

        // The full membership join (item → published question, newest membership first).
        // Client payload stays paginated; the per-student set is bounded by their own lists.
        var itemsQuery = from item in _db.FavoriteListItems.AsNoTracking()
                         join question in _db.Questions.AsNoTracking()
                             on item.QuestionId equals question.Id
                         where item.FavoriteListId == list.Id
                             && question.Status == ContentStatus.Published
                         select new { item, question };

        if (search is { Length: > 0 })
            itemsQuery = itemsQuery.Where(row => row.question.Text.Contains(search));

        var total = await itemsQuery.CountAsync(ct);
        var rows = await itemsQuery
            .OrderByDescending(row => row.item.CreatedAt)
            .ThenBy(row => row.question.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(row => new
            {
                ItemId = row.item.Id,
                row.item.CreatedAt,
                QuestionId = row.question.Id,
                row.question.SubjectId,
                row.question.Text,
                LectureName = _db.Lectures
                    .Where(lecture => lecture.Id == row.question.LectureId)
                    .Select(lecture => lecture.NameAr)
                    .FirstOrDefault()
            })
            .ToListAsync(ct);

        // Batched entitlement evaluation for the page's distinct subjects (same pattern as
        // the enriched flat list — one GetAccessibleSubjectMapAsync call, no per-item checks).
        var candidates = rows
            .Select(row => (row.SubjectId, SubscriptionContentScope.QuestionsExams))
            .Distinct()
            .ToList();
        var accessible = candidates.Count == 0
            ? new Dictionary<SubscriptionContentScope, HashSet<Guid>>()
            : await _entitlements.GetAccessibleSubjectMapAsync(req.StudentId, candidates, ct);

        var visible = rows
            .Where(row => accessible.TryGetValue(SubscriptionContentScope.QuestionsExams, out var subjectIds)
                && subjectIds.Contains(row.SubjectId))
            .ToList();

        // Note: Total reflects the pre-entitlement membership count (pagination stability);
        // the page itself hides inaccessible questions — identical trade-off to the flat list.
        return new PagedResult<FavoriteItemDto>(
            visible.Select(row => new FavoriteItemDto(
                row.ItemId,
                "question",
                row.QuestionId,
                row.SubjectId,
                CourseId: null,
                ClampTitle(row.Text),
                row.LectureName,
                ThumbnailUrl: null,
                FileType: null,
                DurationSeconds: null,
                ProcessingStatus: null,
                row.CreatedAt,
                Progress: null)).ToList(),
            total,
            page,
            pageSize,
            (int)Math.Ceiling(total / (double)pageSize));
    }

    // ===== Write: list CRUD =====

    public async Task<FavoriteListMutationDto> Handle(CreateFavoriteListCommand req, CancellationToken ct)
    {
        var name = ValidateName(req.Name);
        var description = ValidateOptional(req.Description, DescriptionMaxLength, "FAVORITE_LIST_DESCRIPTION_TOO_LONG");
        var color = ValidateOptional(req.Color, ColorMaxLength, "FAVORITE_LIST_COLOR_TOO_LONG");

        await EnsureNameIsFreeAsync(req.StudentId, name, excludeListId: null, ct);

        var list = FavoriteList.Create(req.StudentId, name, description, color);
        _db.FavoriteLists.Add(list);
        await _unitOfWork.SaveChangesAsync(ct);
        return new FavoriteListMutationDto(list.Id, list.Name);
    }

    public async Task<FavoriteListMutationDto> Handle(UpdateFavoriteListCommand req, CancellationToken ct)
    {
        var list = await FindOwnedListAsync(req.StudentId, req.ListId, ct);

        var name = req.Name is null ? null : ValidateName(req.Name);
        var description = ValidateOptional(req.Description, DescriptionMaxLength, "FAVORITE_LIST_DESCRIPTION_TOO_LONG");
        var color = ValidateOptional(req.Color, ColorMaxLength, "FAVORITE_LIST_COLOR_TOO_LONG");

        if (name is not null && name != list.Name)
            await EnsureNameIsFreeAsync(req.StudentId, name, excludeListId: list.Id, ct);

        list.Update(name, description, color);
        await _unitOfWork.SaveChangesAsync(ct);
        return new FavoriteListMutationDto(list.Id, list.Name);
    }

    public async Task<Unit> Handle(DeleteFavoriteListCommand req, CancellationToken ct)
    {
        var list = await FindOwnedListAsync(req.StudentId, req.ListId, ct);

        // Hard delete: membership rows cascade (DB + EF). Questions and flat favorites
        // are untouched — a deleted list never destroys content.
        _db.FavoriteLists.Remove(list);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    // ===== Write: question membership =====

    public async Task<AddQuestionToFavoriteListResult> Handle(AddQuestionToFavoriteListCommand req, CancellationToken ct)
    {
        var list = await FindOwnedListAsync(req.StudentId, req.ListId, ct);

        // Same gate as the flat question-favorite create: Published question, then the
        // signed-entitlement + real-time QuestionsExams scope check on its subject.
        var question = await _db.Questions.AsNoTracking()
            .Where(item => item.Id == req.QuestionId && item.Status == ContentStatus.Published)
            .Select(item => new { item.Id, item.SubjectId })
            .SingleOrDefaultAsync(ct)
            ?? throw new NotFoundException("Question", req.QuestionId);

        await EnsureContentAccessAsync(
            req.StudentId, question.SubjectId, SubscriptionContentScope.QuestionsExams,
            req.EntitlementToken, req.InstallationId, ct);

        var existing = await _db.FavoriteListItems
            .SingleOrDefaultAsync(item => item.FavoriteListId == list.Id && item.QuestionId == question.Id, ct);
        if (existing is not null)
            return new AddQuestionToFavoriteListResult(list.Id, question.Id, IsNew: false);

        _db.FavoriteListItems.Add(FavoriteListItem.Create(list.Id, question.Id));
        await _unitOfWork.SaveChangesAsync(ct);
        return new AddQuestionToFavoriteListResult(list.Id, question.Id, IsNew: true);
    }

    public async Task<Unit> Handle(RemoveQuestionFromFavoriteListCommand req, CancellationToken ct)
    {
        var list = await FindOwnedListAsync(req.StudentId, req.ListId, ct);

        // Deviation from DeleteFavoriteCommand (which 404s on non-Published targets):
        // removing one's OWN membership row must stay possible after a question is
        // unpublished or soft-deleted — so this lookup skips the Published filter.
        var questionSubject = await _db.Questions.AsNoTracking()
            .Where(item => item.Id == req.QuestionId)
            .Select(item => (Guid?)item.SubjectId)
            .SingleOrDefaultAsync(ct);

        if (questionSubject is not null)
        {
            await EnsureContentAccessAsync(
                req.StudentId, questionSubject.Value, SubscriptionContentScope.QuestionsExams,
                req.EntitlementToken, req.InstallationId, ct);
        }
        // questionSubject == null: the question row is gone entirely — its memberships were
        // cascaded away with it, so the idempotent no-op below is the correct answer.

        var membership = await _db.FavoriteListItems
            .SingleOrDefaultAsync(item => item.FavoriteListId == list.Id && item.QuestionId == req.QuestionId, ct);
        if (membership is not null)
        {
            _db.FavoriteListItems.Remove(membership);
            await _unitOfWork.SaveChangesAsync(ct);
        }

        return Unit.Value;
    }

    // ===== shared helpers =====

    private async Task<FavoriteList> FindOwnedListAsync(Guid studentId, Guid listId, CancellationToken ct)
    {
        // Ownership in the lookup itself: a foreign list id is indistinguishable from a
        // missing one (404) — no existence oracle for other students' lists.
        return await _db.FavoriteLists
            .SingleOrDefaultAsync(list => list.Id == listId && list.StudentId == studentId && list.DeletedAt == null, ct)
            ?? throw new NotFoundException("FavoriteList", listId);
    }

    private async Task EnsureNameIsFreeAsync(Guid studentId, string name, Guid? excludeListId, CancellationToken ct)
    {
        var taken = await _db.FavoriteLists.AsNoTracking()
            .AnyAsync(list => list.StudentId == studentId && list.DeletedAt == null
                && list.Name == name
                && (excludeListId == null || list.Id != excludeListId), ct);
        if (taken)
            throw new ConflictException("توجد قائمة أخرى بنفس الاسم — اختر اسماً مختلفاً");
    }

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

    private static string ValidateName(string? name)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length == 0)
            throw new DomainException("اسم القائمة مطلوب", "FAVORITE_LIST_NAME_REQUIRED");
        if (trimmed.Length > NameMaxLength)
            throw new DomainException($"اسم القائمة طويل جداً — الحد الأقصى {NameMaxLength} محرفاً", "FAVORITE_LIST_NAME_TOO_LONG");
        return trimmed;
    }

    private static string? ValidateOptional(string? value, int maxLength, string errorCode)
    {
        if (value is null) return null;
        var trimmed = value.Trim();
        if (trimmed.Length > maxLength)
            throw new DomainException($"قيمة الحقل طويلة جداً — الحد الأقصى {maxLength} محرفاً", errorCode);
        return trimmed.Length == 0 ? null : trimmed;
    }

    private static string ClampTitle(string text)
    {
        var normalized = text.Trim();
        return normalized.Length <= QuestionTitleClamp ? normalized : normalized[..QuestionTitleClamp] + "…";
    }
}
