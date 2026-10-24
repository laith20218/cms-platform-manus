using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Academic;
using CMS.Application.DTOs.Academic;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Academic;

/// <summary>
/// Handles all academic hierarchy queries and commands.
/// Universities → Colleges → Years → Semesters → Subjects → Lectures
/// </summary>
public class AcademicQueryHandlers :
    IRequestHandler<GetUniversitiesQuery, PagedResult<UniversityDto>>,
    IRequestHandler<GetUniversityByIdQuery, UniversityDto>,
    IRequestHandler<GetCollegesByUniversityQuery, List<CollegeDto>>,
    IRequestHandler<GetCollegeByIdQuery, CollegeDto>,
    IRequestHandler<GetYearsByCollegeQuery, List<AcademicYearDto>>,
    IRequestHandler<GetAcademicYearByIdQuery, AcademicYearDto>,
    IRequestHandler<GetSemestersByYearQuery, List<SemesterDto>>,
    IRequestHandler<GetSemesterByIdQuery, SemesterDto>,
    IRequestHandler<GetSubjectsBySemesterQuery, List<SubjectDto>>,
    IRequestHandler<GetMySubjectsQuery, List<SubjectDto>>,
    IRequestHandler<GetSubjectByIdQuery, SubjectDto>,
    IRequestHandler<GetSubjectBySlugQuery, SubjectDto>,
    IRequestHandler<GetLecturesBySubjectQuery, List<LectureDto>>,
    IRequestHandler<GetLectureByIdQuery, LectureDto>,
    IRequestHandler<CompleteLectureCommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IEntitlementService _entitlements;
    private readonly ICacheService _cache;

    public AcademicQueryHandlers(IApplicationDbContext db, IEntitlementService entitlements, ICacheService cache)
    {
        _db = db;
        _entitlements = entitlements;
        _cache = cache;
    }

    public async Task<PagedResult<UniversityDto>> Handle(GetUniversitiesQuery req, CancellationToken ct)
    {
        var query = _db.Universities.AsNoTracking().Where(university => req.IncludeArchived || university.DeletedAt == null);
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(university => university.SortOrder)
            .Skip((req.Page - 1) * req.PageSize).Take(req.PageSize)
            .Select(university => new UniversityDto(
                university.Id, university.NameAr, university.NameEn, university.Slug, university.LogoUrl, university.Description,
                _db.Colleges.Count(college => college.UniversityId == university.Id && (req.IncludeArchived || college.DeletedAt == null)),
                university.DeletedAt != null))
            .ToListAsync(ct);
        return new PagedResult<UniversityDto>(items, total, req.Page, req.PageSize, (int)Math.Ceiling(total / (double)req.PageSize));
    }

    public async Task<UniversityDto> Handle(GetUniversityByIdQuery req, CancellationToken ct) =>
        await _db.Universities.AsNoTracking()
            .Where(university => university.Id == req.Id && university.DeletedAt == null)
            .Select(university => new UniversityDto(
                university.Id, university.NameAr, university.NameEn, university.Slug, university.LogoUrl, university.Description,
                _db.Colleges.Count(college => college.UniversityId == university.Id && college.DeletedAt == null), false))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("University", req.Id);

    public async Task<List<CollegeDto>> Handle(GetCollegesByUniversityQuery req, CancellationToken ct) =>
        await _db.Colleges.AsNoTracking()
            .Where(college => college.UniversityId == req.UniversityId
                && (req.IncludeArchived || (college.DeletedAt == null && college.University.DeletedAt == null)))
            .OrderBy(college => college.SortOrder)
            .Select(college => new CollegeDto(
                college.Id, college.UniversityId, college.NameAr, college.NameEn, college.Slug, college.Icon,
                _db.AcademicYears.Count(year => year.CollegeId == college.Id && (req.IncludeArchived || year.DeletedAt == null)),
                college.DeletedAt != null))
            .ToListAsync(ct);

    public async Task<CollegeDto> Handle(GetCollegeByIdQuery req, CancellationToken ct) =>
        await _db.Colleges.AsNoTracking()
            .Where(college => college.Id == req.Id && college.DeletedAt == null && college.University.DeletedAt == null)
            .Select(college => new CollegeDto(
                college.Id, college.UniversityId, college.NameAr, college.NameEn, college.Slug, college.Icon,
                _db.AcademicYears.Count(year => year.CollegeId == college.Id && year.DeletedAt == null), false))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("College", req.Id);

    public async Task<List<AcademicYearDto>> Handle(GetYearsByCollegeQuery req, CancellationToken ct) =>
        await _db.AcademicYears.AsNoTracking()
            .Where(year => year.CollegeId == req.CollegeId
                && (req.IncludeArchived || (year.DeletedAt == null && year.College.DeletedAt == null && year.College.University.DeletedAt == null)))
            .OrderBy(year => year.YearNumber)
            .Select(year => new AcademicYearDto(
                year.Id, year.CollegeId, year.NameAr, year.NameEn, year.Slug, year.YearNumber,
                _db.Semesters.Count(semester => semester.AcademicYearId == year.Id && (req.IncludeArchived || semester.DeletedAt == null)),
                year.DeletedAt != null))
            .ToListAsync(ct);

    public async Task<AcademicYearDto> Handle(GetAcademicYearByIdQuery req, CancellationToken ct) =>
        await _db.AcademicYears.AsNoTracking()
            .Where(year => year.Id == req.Id && year.DeletedAt == null && year.College.DeletedAt == null && year.College.University.DeletedAt == null)
            .Select(year => new AcademicYearDto(
                year.Id, year.CollegeId, year.NameAr, year.NameEn, year.Slug, year.YearNumber,
                _db.Semesters.Count(semester => semester.AcademicYearId == year.Id && semester.DeletedAt == null), false))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("AcademicYear", req.Id);

    public async Task<List<SemesterDto>> Handle(GetSemestersByYearQuery req, CancellationToken ct) =>
        await _db.Semesters.AsNoTracking()
            .Where(semester => semester.AcademicYearId == req.YearId
                && (req.IncludeArchived || (semester.DeletedAt == null && semester.AcademicYear.DeletedAt == null && semester.AcademicYear.College.DeletedAt == null && semester.AcademicYear.College.University.DeletedAt == null)))
            .OrderBy(semester => semester.SemesterNumber)
            .Select(semester => new SemesterDto(
                semester.Id, semester.AcademicYearId, semester.NameAr, semester.NameEn, semester.Slug, semester.SemesterNumber,
                _db.Subjects.Count(subject => subject.SemesterId == semester.Id && (req.IncludeArchived || subject.DeletedAt == null)),
                semester.DeletedAt != null))
            .ToListAsync(ct);

    public async Task<SemesterDto> Handle(GetSemesterByIdQuery req, CancellationToken ct) =>
        await _db.Semesters.AsNoTracking()
            .Where(semester => semester.Id == req.Id && semester.DeletedAt == null && semester.AcademicYear.DeletedAt == null && semester.AcademicYear.College.DeletedAt == null && semester.AcademicYear.College.University.DeletedAt == null)
            .Select(semester => new SemesterDto(
                semester.Id, semester.AcademicYearId, semester.NameAr, semester.NameEn, semester.Slug, semester.SemesterNumber,
                _db.Subjects.Count(subject => subject.SemesterId == semester.Id && subject.DeletedAt == null), false))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("Semester", req.Id);

    public async Task<List<SubjectDto>> Handle(GetSubjectsBySemesterQuery req, CancellationToken ct)
    {
        var subjects = await _db.Subjects.AsNoTracking()
            .Where(subject => subject.SemesterId == req.SemesterId
                && (req.IncludeArchived || (subject.DeletedAt == null && subject.Status == "active"))
                && (req.IncludeArchived || (subject.Semester.DeletedAt == null && subject.Semester.AcademicYear.DeletedAt == null && subject.Semester.AcademicYear.College.DeletedAt == null && subject.Semester.AcademicYear.College.University.DeletedAt == null)))
            .OrderBy(subject => subject.SortOrder)
            .Select(subject => new SubjectDto(
                subject.Id, subject.SemesterId, subject.NameAr, subject.NameEn, subject.Slug, subject.Code, subject.Description, subject.Icon, subject.Color,
                _db.Questions.Count(question => question.SubjectId == subject.Id && question.Status == Domain.Enums.ContentStatus.Published),
                _db.Lectures.Count(lecture => lecture.SubjectId == subject.Id && (req.IncludeArchived || (lecture.DeletedAt == null && lecture.Status == "active"))),
                _db.Exams.Count(exam => exam.SubjectId == subject.Id && exam.Status == Domain.Enums.ContentStatus.Published),
                null,
                subject.DeletedAt != null,
                0,
                null,
                null))
            .ToListAsync(ct);

        if (!req.StudentId.HasValue) return subjects;

        var visibleSubjects = new List<SubjectDto>();
        foreach (var subject in subjects)
        {
            if (!await _entitlements.CanAccessSubjectAsync(req.StudentId.Value, subject.Id, "read", ct)) continue;
            visibleSubjects.Add(await ApplyStudentContentScopeAsync(subject, req.StudentId, ct));
        }
        return visibleSubjects;
    }

    /// <summary>
    /// Returns every visible subject the student holds an active subscription grant for,
    /// regardless of semester. Reuses the same per-subject entitlement decision as the
    /// semester listing so both catalogs can never disagree.
    /// </summary>
    public async Task<List<SubjectDto>> Handle(GetMySubjectsQuery req, CancellationToken ct)
    {
        var subjects = await VisibleSubjectQuery()
            .OrderBy(subject => subject.Slug)
            .ToListAsync(ct);

        var visible = new List<SubjectDto>();
        foreach (var subject in subjects)
        {
            if (!await _entitlements.CanAccessSubjectAsync(req.StudentId, subject.Id, "read", ct)) continue;
            visible.Add(await ApplyStudentContentScopeAsync(ToSubjectDto(subject), req.StudentId, ct));
        }
        return visible;
    }

    public async Task<SubjectDto> Handle(GetSubjectByIdQuery req, CancellationToken ct)
    {
        var subject = await VisibleSubjectQuery()
            .Where(item => item.Id == req.Id)
            .Select(item => ToSubjectDto(item))
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Subject", req.Id);
        return await ApplyStudentContentScopeAsync(subject, req.StudentId, ct);
    }

    public async Task<SubjectDto> Handle(GetSubjectBySlugQuery req, CancellationToken ct)
    {
        var subject = await VisibleSubjectQuery()
            .Where(item => item.Slug == req.Slug)
            .Select(item => ToSubjectDto(item))
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Subject", req.Slug);
        return await ApplyStudentContentScopeAsync(subject, req.StudentId, ct);
    }

    public async Task<List<LectureDto>> Handle(GetLecturesBySubjectQuery req, CancellationToken ct)
    {
        if (!req.StudentId.HasValue || !await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId.Value, req.SubjectId, SubscriptionContentScope.LecturesText, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        var lectures = await _db.Lectures.AsNoTracking()
            .Where(lecture => lecture.SubjectId == req.SubjectId
                && (req.IncludeArchived || (lecture.DeletedAt == null && lecture.Status != "draft"))
                && (req.IncludeArchived || (lecture.Subject.DeletedAt == null && lecture.Subject.Semester.DeletedAt == null && lecture.Subject.Semester.AcademicYear.DeletedAt == null && lecture.Subject.Semester.AcademicYear.College.DeletedAt == null && lecture.Subject.Semester.AcademicYear.College.University.DeletedAt == null)))
            .OrderBy(lecture => lecture.LectureNumber)
            .Select(lecture => new LectureDto(
                lecture.Id, lecture.SubjectId, lecture.NameAr, lecture.NameEn, lecture.Slug, lecture.LectureNumber, lecture.DurationMinutes,
                lecture.Description, lecture.InstructorName, lecture.SourceReference,
                _db.Questions.Count(question => question.LectureId == lecture.Id && question.Status == Domain.Enums.ContentStatus.Published),
                0, 0, lecture.DeletedAt != null, false, null))
            .ToListAsync(ct);

        // Index-based iteration: the loop below replaces list elements (record
        // `with` updates), which a foreach enumerator forbids ("Collection was
        // modified" — this threw 500s on /subjects/{id}/lectures in production).
        for (var index = 0; index < lectures.Count; index++)
        {
            var answered = await _db.AttemptLogs.CountAsync(attempt => attempt.StudentId == req.StudentId.Value && attempt.Question.LectureId == lectures[index].Id, ct);
            var total = lectures[index].QuestionsCount;
            lectures[index] = lectures[index] with { UserAnswered = answered, UserProgress = total > 0 ? answered * 100.0 / total : 0 };
        }

        var completedAtByLecture = await _db.LectureCompletions.AsNoTracking()
            .Where(completion => completion.StudentId == req.StudentId.Value && lectures.Select(lecture => lecture.Id).Contains(completion.LectureId))
            .ToDictionaryAsync(completion => completion.LectureId, completion => completion.CompletedAt, ct);
        for (var index = 0; index < lectures.Count; index++)
        {
            if (completedAtByLecture.TryGetValue(lectures[index].Id, out var completedAt))
                lectures[index] = lectures[index] with { IsCompleted = true, CompletedAt = completedAt };
        }
        return lectures;
    }

    public async Task<LectureDto> Handle(GetLectureByIdQuery req, CancellationToken ct)
    {
        var lecture = await _db.Lectures.AsNoTracking()
            .Where(item => item.Id == req.Id && item.DeletedAt == null && item.Status != "draft"
                && item.Subject.DeletedAt == null && item.Subject.Semester.DeletedAt == null && item.Subject.Semester.AcademicYear.DeletedAt == null && item.Subject.Semester.AcademicYear.College.DeletedAt == null && item.Subject.Semester.AcademicYear.College.University.DeletedAt == null)
            .Select(item => new { item.Id, item.SubjectId })
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Lecture", req.Id);

        if (!await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId, lecture.SubjectId, SubscriptionContentScope.LecturesText, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        var result = await _db.Lectures.AsNoTracking().Where(item => item.Id == lecture.Id)
            .Select(item => new LectureDto(
                item.Id, item.SubjectId, item.NameAr, item.NameEn, item.Slug, item.LectureNumber, item.DurationMinutes,
                item.Description, item.InstructorName, item.SourceReference,
                _db.Questions.Count(question => question.LectureId == item.Id && question.Status == Domain.Enums.ContentStatus.Published),
                0, 0, false, false, null))
            .SingleAsync(ct);
        var completedAt = await _db.LectureCompletions.AsNoTracking()
            .Where(completion => completion.StudentId == req.StudentId && completion.LectureId == lecture.Id)
            .Select(completion => (DateTime?)completion.CompletedAt)
            .FirstOrDefaultAsync(ct);
        return completedAt.HasValue ? result with { IsCompleted = true, CompletedAt = completedAt } : result;
    }

    public async Task<Unit> Handle(CompleteLectureCommand req, CancellationToken ct)
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

        if (!await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId, lecture.SubjectId, SubscriptionContentScope.LecturesText, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المحاضرة");

        var alreadyCompleted = await _db.LectureCompletions.AsNoTracking()
            .AnyAsync(completion => completion.StudentId == req.StudentId && completion.LectureId == lecture.Id, ct);
        if (alreadyCompleted) return Unit.Value;

        _db.LectureCompletions.Add(new LectureCompletion
        {
            StudentId = req.StudentId,
            LectureId = lecture.Id,
            CompletedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(ct);
        await _cache.RemoveByPatternAsync($"stats:student:{req.StudentId}:*", ct);
        return Unit.Value;
    }

    private IQueryable<Subject> VisibleSubjectQuery() => _db.Subjects.AsNoTracking().Where(subject =>
        subject.DeletedAt == null && subject.Status == "active"
        && subject.Semester.DeletedAt == null && subject.Semester.AcademicYear.DeletedAt == null
        && subject.Semester.AcademicYear.College.DeletedAt == null && subject.Semester.AcademicYear.College.University.DeletedAt == null);

    private SubjectDto ToSubjectDto(Subject subject) => new(
        subject.Id, subject.SemesterId, subject.NameAr, subject.NameEn, subject.Slug, subject.Code, subject.Description, subject.Icon, subject.Color,
        _db.Questions.Count(question => question.SubjectId == subject.Id && question.Status == Domain.Enums.ContentStatus.Published),
        _db.Lectures.Count(lecture => lecture.SubjectId == subject.Id && lecture.DeletedAt == null && lecture.Status == "active"),
        _db.Exams.Count(exam => exam.SubjectId == subject.Id && exam.Status == Domain.Enums.ContentStatus.Published),
        null, false, 0, null, null);

    private async Task<SubjectDto> ApplyStudentContentScopeAsync(SubjectDto subject, Guid? studentId, CancellationToken ct)
    {
        if (!studentId.HasValue) return subject;
        if (!await _entitlements.CanAccessSubjectAsync(studentId.Value, subject.Id, "read", ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        var canAccessQuestions = await _entitlements.CanAccessSubjectContentAsync(
            studentId.Value, subject.Id, SubscriptionContentScope.QuestionsExams, ct);
        var canAccessLectures = await _entitlements.CanAccessSubjectContentAsync(
            studentId.Value, subject.Id, SubscriptionContentScope.LecturesText, ct);
        var canAccessVideoAudio = await _entitlements.CanAccessSubjectContentAsync(
            studentId.Value, subject.Id, SubscriptionContentScope.VideoAudio, ct);

        var accessibleFiles = _db.LibraryFiles.AsNoTracking().Where(file =>
            file.SubjectId == subject.Id && file.Status == ContentStatus.Published
            && file.DeletedAt == null && file.VirusScanStatus == VirusScanStatus.Clean
            && ((canAccessLectures && file.Type != LibraryFileType.Video && file.Type != LibraryFileType.Audio)
                || (canAccessVideoAudio && (file.Type == LibraryFileType.Video || file.Type == LibraryFileType.Audio))));
        var totalFiles = await accessibleFiles.CountAsync(ct);
        var latestQuestion = canAccessQuestions
            ? await _db.Questions.AsNoTracking().Where(question => question.SubjectId == subject.Id && question.Status == ContentStatus.Published)
                .OrderByDescending(question => question.UpdatedAt).Select(question => (DateTime?)question.UpdatedAt).FirstOrDefaultAsync(ct)
            : null;
        var latestLecture = canAccessLectures
            ? await _db.Lectures.AsNoTracking().Where(lecture => lecture.SubjectId == subject.Id && lecture.DeletedAt == null && lecture.Status == "active")
                .OrderByDescending(lecture => lecture.UpdatedAt).Select(lecture => (DateTime?)lecture.UpdatedAt).FirstOrDefaultAsync(ct)
            : null;
        var latestFile = await accessibleFiles.OrderByDescending(file => file.UpdatedAt)
            .Select(file => (DateTime?)file.UpdatedAt).FirstOrDefaultAsync(ct);
        var lastContentUpdatedAt = new[] { latestQuestion, latestLecture, latestFile }.Where(value => value.HasValue).Select(value => value!.Value).DefaultIfEmpty().Max();
        var scopes = new List<string>();
        if (canAccessQuestions) scopes.Add(nameof(SubscriptionContentScope.QuestionsExams));
        if (canAccessLectures) scopes.Add(nameof(SubscriptionContentScope.LecturesText));
        if (canAccessVideoAudio) scopes.Add(nameof(SubscriptionContentScope.VideoAudio));

        var scoped = subject with
        {
            TotalQuestions = canAccessQuestions ? subject.TotalQuestions : 0,
            TotalExams = canAccessQuestions ? subject.TotalExams : 0,
            TotalLectures = canAccessLectures ? subject.TotalLectures : 0,
            TotalFiles = totalFiles,
            LastContentUpdatedAt = lastContentUpdatedAt == default ? null : lastContentUpdatedAt,
            UserProgress = null,
            ContentScopes = scopes
        };
        return canAccessQuestions ? await AddProgressAsync(scoped, studentId, ct) : scoped;
    }

    private async Task<SubjectDto> AddProgressAsync(SubjectDto subject, Guid? studentId, CancellationToken ct)
    {
        if (!studentId.HasValue) return subject;
        var answered = await _db.AttemptLogs.CountAsync(attempt => attempt.StudentId == studentId.Value && attempt.Question.SubjectId == subject.Id, ct);
        return subject with { UserProgress = new SubjectProgressDto(answered, 0, subject.TotalQuestions > 0 ? answered * 100.0 / subject.TotalQuestions : 0) };
    }
}

/// <summary>
/// Handles academic hierarchy mutations and the reversible archive lifecycle.
/// </summary>
public class AcademicCommandHandlers :
    IRequestHandler<CreateUniversityCommand, UniversityDto>,
    IRequestHandler<UpdateUniversityCommand, UniversityDto>,
    IRequestHandler<DeleteUniversityCommand, Unit>,
    IRequestHandler<CreateCollegeCommand, CollegeDto>,
    IRequestHandler<UpdateCollegeCommand, CollegeDto>,
    IRequestHandler<DeleteCollegeCommand, Unit>,
    IRequestHandler<CreateAcademicYearCommand, AcademicYearDto>,
    IRequestHandler<UpdateAcademicYearCommand, AcademicYearDto>,
    IRequestHandler<CreateSemesterCommand, SemesterDto>,
    IRequestHandler<CreateSubjectCommand, SubjectDto>,
    IRequestHandler<UpdateSubjectCommand, SubjectDto>,
    IRequestHandler<CreateLectureCommand, LectureDto>,
    IRequestHandler<UpdateLectureCommand, LectureDto>,
    IRequestHandler<PublishLectureCommand, LectureDto>,
    IRequestHandler<ArchiveAcademicEntityCommand, Unit>,
    IRequestHandler<RestoreAcademicEntityCommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;

    public AcademicCommandHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork)
    {
        _db = db;
        _unitOfWork = unitOfWork;
    }

    public async Task<UniversityDto> Handle(CreateUniversityCommand req, CancellationToken ct)
    {
        var university = University.Create(req.NameAr, req.Slug, req.NameEn);
        if (req.Description != null) university.Update(req.NameAr, req.NameEn, req.Description, req.LogoUrl);
        await _db.Universities.AddAsync(university, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new UniversityDto(university.Id, university.NameAr, university.NameEn, university.Slug, university.LogoUrl, university.Description, 0, false);
    }

    public async Task<UniversityDto> Handle(UpdateUniversityCommand req, CancellationToken ct)
    {
        var university = await _db.Universities.FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct) ?? throw new NotFoundException("University", req.Id);
        university.Update(req.NameAr, req.NameEn, req.Description, req.LogoUrl);
        await _unitOfWork.SaveChangesAsync(ct);
        return new UniversityDto(university.Id, university.NameAr, university.NameEn, university.Slug, university.LogoUrl, university.Description, 0, false);
    }

    public async Task<Unit> Handle(DeleteUniversityCommand req, CancellationToken ct)
    {
        var university = await _db.Universities.FirstOrDefaultAsync(item => item.Id == req.Id, ct) ?? throw new NotFoundException("University", req.Id);
        if (await _db.Colleges.AnyAsync(college => college.UniversityId == req.Id, ct))
            throw new BusinessRuleViolationException("University has dependent colleges and must be archived instead of deleted.");
        university.Archive();
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<CollegeDto> Handle(CreateCollegeCommand req, CancellationToken ct)
    {
        var college = College.Create(req.UniversityId, req.NameAr, req.Slug, req.NameEn);
        await _db.Colleges.AddAsync(college, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new CollegeDto(college.Id, college.UniversityId, college.NameAr, college.NameEn, college.Slug, college.Icon, 0, false);
    }

    public async Task<CollegeDto> Handle(UpdateCollegeCommand req, CancellationToken ct)
    {
        var college = await _db.Colleges.FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct) ?? throw new NotFoundException("College", req.Id);
        typeof(College).GetProperty("NameAr")?.SetValue(college, req.NameAr);
        typeof(College).GetProperty("NameEn")?.SetValue(college, req.NameEn);
        await _unitOfWork.SaveChangesAsync(ct);
        return new CollegeDto(college.Id, college.UniversityId, college.NameAr, college.NameEn, college.Slug, college.Icon, 0, false);
    }

    public async Task<Unit> Handle(DeleteCollegeCommand req, CancellationToken ct)
    {
        var college = await _db.Colleges.FirstOrDefaultAsync(item => item.Id == req.Id, ct) ?? throw new NotFoundException("College", req.Id);
        if (await _db.AcademicYears.AnyAsync(year => year.CollegeId == req.Id, ct))
            throw new BusinessRuleViolationException("College has dependent academic years and must be archived instead of deleted.");
        college.Archive();
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<AcademicYearDto> Handle(CreateAcademicYearCommand req, CancellationToken ct)
    {
        var year = AcademicYear.Create(req.CollegeId, req.NameAr, req.Slug, req.YearNumber);
        await _db.AcademicYears.AddAsync(year, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new AcademicYearDto(year.Id, year.CollegeId, year.NameAr, year.NameEn, year.Slug, year.YearNumber, 0, false);
    }

    public async Task<AcademicYearDto> Handle(UpdateAcademicYearCommand req, CancellationToken ct)
    {
        var year = await _db.AcademicYears.FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct) ?? throw new NotFoundException("AcademicYear", req.Id);
        typeof(AcademicYear).GetProperty("NameAr")?.SetValue(year, req.NameAr);
        typeof(AcademicYear).GetProperty("NameEn")?.SetValue(year, req.NameEn);
        await _unitOfWork.SaveChangesAsync(ct);
        return new AcademicYearDto(year.Id, year.CollegeId, year.NameAr, year.NameEn, year.Slug, year.YearNumber, 0, false);
    }

    public async Task<SemesterDto> Handle(CreateSemesterCommand req, CancellationToken ct)
    {
        var semester = Semester.Create(req.AcademicYearId, req.NameAr, req.Slug, req.SemesterNumber);
        await _db.Semesters.AddAsync(semester, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new SemesterDto(semester.Id, semester.AcademicYearId, semester.NameAr, semester.NameEn, semester.Slug, semester.SemesterNumber, 0, false);
    }

    public async Task<SubjectDto> Handle(CreateSubjectCommand req, CancellationToken ct)
    {
        var subject = Subject.Create(req.SemesterId, req.NameAr, req.Slug, req.NameEn);
        if (req.Color != null) typeof(Subject).GetProperty("Color")?.SetValue(subject, req.Color);
        if (req.Description != null) typeof(Subject).GetProperty("Description")?.SetValue(subject, req.Description);
        if (req.Code != null) typeof(Subject).GetProperty("Code")?.SetValue(subject, req.Code);
        await _db.Subjects.AddAsync(subject, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new SubjectDto(subject.Id, subject.SemesterId, subject.NameAr, subject.NameEn, subject.Slug, req.Code, req.Description, subject.Icon, req.Color, 0, 0, 0, null, false);
    }

    public async Task<SubjectDto> Handle(UpdateSubjectCommand req, CancellationToken ct)
    {
        var subject = await _db.Subjects.FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct) ?? throw new NotFoundException("Subject", req.Id);
        typeof(Subject).GetProperty("NameAr")?.SetValue(subject, req.NameAr);
        typeof(Subject).GetProperty("NameEn")?.SetValue(subject, req.NameEn);
        typeof(Subject).GetProperty("Description")?.SetValue(subject, req.Description);
        typeof(Subject).GetProperty("Color")?.SetValue(subject, req.Color);
        await _unitOfWork.SaveChangesAsync(ct);
        return new SubjectDto(subject.Id, subject.SemesterId, subject.NameAr, subject.NameEn, subject.Slug, subject.Code, subject.Description, subject.Icon, subject.Color, 0, 0, 0, null, false);
    }

    public async Task<LectureDto> Handle(CreateLectureCommand req, CancellationToken ct)
    {
        var lecture = Lecture.Create(req.SubjectId, req.TitleAr, req.Slug, req.LectureNumber);
        lecture.UpdateDetails(req.TitleAr, req.TitleEn, req.DurationMinutes, req.Description, req.InstructorName, req.SourceReference);
        await _db.Lectures.AddAsync(lecture, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new LectureDto(lecture.Id, lecture.SubjectId, lecture.NameAr, lecture.NameEn, lecture.Slug, lecture.LectureNumber, lecture.DurationMinutes, lecture.Description, lecture.InstructorName, lecture.SourceReference, 0, 0, 0, false);
    }

    public async Task<LectureDto> Handle(UpdateLectureCommand req, CancellationToken ct)
    {
        var lecture = await _db.Lectures.FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct) ?? throw new NotFoundException("Lecture", req.Id);
        lecture.UpdateDetails(req.TitleAr, req.TitleEn, req.DurationMinutes, req.Description, req.InstructorName, req.SourceReference);
        await _unitOfWork.SaveChangesAsync(ct);
        return new LectureDto(lecture.Id, lecture.SubjectId, lecture.NameAr, lecture.NameEn, lecture.Slug, lecture.LectureNumber, lecture.DurationMinutes, lecture.Description, lecture.InstructorName, lecture.SourceReference, 0, 0, 0, false);
    }

    public async Task<LectureDto> Handle(PublishLectureCommand req, CancellationToken ct)
    {
        var lecture = await _db.Lectures.FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Lecture", req.Id);
        lecture.Publish();
        await _unitOfWork.SaveChangesAsync(ct);
        return new LectureDto(lecture.Id, lecture.SubjectId, lecture.NameAr, lecture.NameEn, lecture.Slug, lecture.LectureNumber, lecture.DurationMinutes, lecture.Description, lecture.InstructorName, lecture.SourceReference, 0, 0, 0, false);
    }

    public async Task<Unit> Handle(ArchiveAcademicEntityCommand req, CancellationToken ct)
    {
        var entity = await FindAcademicEntityAsync(req.EntityType, req.Id, ct);
        entity.Archive();
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(RestoreAcademicEntityCommand req, CancellationToken ct)
    {
        var entity = await FindAcademicEntityAsync(req.EntityType, req.Id, ct);
        entity.Restore();
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    private async Task<CMS.Domain.Common.LookupEntity> FindAcademicEntityAsync(string entityType, Guid id, CancellationToken ct)
    {
        CMS.Domain.Common.LookupEntity? entity = entityType.ToLowerInvariant() switch
        {
            "university" => await _db.Universities.FirstOrDefaultAsync(item => item.Id == id, ct),
            "college" => await _db.Colleges.FirstOrDefaultAsync(item => item.Id == id, ct),
            "year" => await _db.AcademicYears.FirstOrDefaultAsync(item => item.Id == id, ct),
            "semester" => await _db.Semesters.FirstOrDefaultAsync(item => item.Id == id, ct),
            "subject" => await _db.Subjects.FirstOrDefaultAsync(item => item.Id == id, ct),
            "lecture" => await _db.Lectures.FirstOrDefaultAsync(item => item.Id == id, ct),
            _ => throw new BusinessRuleViolationException("Unsupported academic entity type.")
        };
        return entity ?? throw new NotFoundException(entityType, id);
    }
}
