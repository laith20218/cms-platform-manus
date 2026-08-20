using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Academic;
using CMS.Application.DTOs.Academic;
using CMS.Domain.Entities;
using CMS.Domain.Exceptions;
using CMS.Application.Interfaces;

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
    IRequestHandler<GetSubjectByIdQuery, SubjectDto>,
    IRequestHandler<GetSubjectBySlugQuery, SubjectDto>,
    IRequestHandler<GetLecturesBySubjectQuery, List<LectureDto>>,
    IRequestHandler<GetLectureByIdQuery, LectureDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IEntitlementService _entitlements;

    public AcademicQueryHandlers(IApplicationDbContext db, IEntitlementService entitlements)
    {
        _db = db;
        _entitlements = entitlements;
    }

    // ===== Universities =====
    public async Task<PagedResult<UniversityDto>> Handle(GetUniversitiesQuery req, CancellationToken ct)
    {
        var query = _db.Universities.AsNoTracking().Where(u => u.DeletedAt == null);
        var total = await query.CountAsync(ct);
        var items = await query
            .OrderBy(u => u.SortOrder)
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .Select(u => new UniversityDto(
                u.Id, u.NameAr, u.NameEn, u.Slug, u.LogoUrl, u.Description,
                _db.Colleges.Count(c => c.UniversityId == u.Id && c.DeletedAt == null)
            ))
            .ToListAsync(ct);
        return new PagedResult<UniversityDto>(items, total, req.Page, req.PageSize, (int)Math.Ceiling(total / (double)req.PageSize));
    }

    public async Task<UniversityDto> Handle(GetUniversityByIdQuery req, CancellationToken ct) =>
        await _db.Universities.AsNoTracking()
            .Where(u => u.Id == req.Id && u.DeletedAt == null)
            .Select(u => new UniversityDto(u.Id, u.NameAr, u.NameEn, u.Slug, u.LogoUrl, u.Description,
                _db.Colleges.Count(c => c.UniversityId == u.Id && c.DeletedAt == null)))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("University", req.Id);

    public async Task<List<CollegeDto>> Handle(GetCollegesByUniversityQuery req, CancellationToken ct) =>
        await _db.Colleges.AsNoTracking()
            .Where(c => c.UniversityId == req.UniversityId && c.DeletedAt == null)
            .OrderBy(c => c.SortOrder)
            .Select(c => new CollegeDto(c.Id, c.UniversityId, c.NameAr, c.NameEn, c.Slug, c.Icon,
                _db.AcademicYears.Count(y => y.CollegeId == c.Id && y.DeletedAt == null)))
            .ToListAsync(ct);

    // ===== Colleges =====
    public async Task<CollegeDto> Handle(GetCollegeByIdQuery req, CancellationToken ct) =>
        await _db.Colleges.AsNoTracking()
            .Where(c => c.Id == req.Id && c.DeletedAt == null)
            .Select(c => new CollegeDto(c.Id, c.UniversityId, c.NameAr, c.NameEn, c.Slug, c.Icon,
                _db.AcademicYears.Count(y => y.CollegeId == c.Id)))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("College", req.Id);

    public async Task<List<AcademicYearDto>> Handle(GetYearsByCollegeQuery req, CancellationToken ct) =>
        await _db.AcademicYears.AsNoTracking()
            .Where(y => y.CollegeId == req.CollegeId && y.DeletedAt == null)
            .OrderBy(y => y.YearNumber)
            .Select(y => new AcademicYearDto(y.Id, y.CollegeId, y.NameAr, y.NameEn, y.Slug, y.YearNumber,
                _db.Semesters.Count(s => s.AcademicYearId == y.Id)))
            .ToListAsync(ct);

    // ===== Academic Years =====
    public async Task<AcademicYearDto> Handle(GetAcademicYearByIdQuery req, CancellationToken ct) =>
        await _db.AcademicYears.AsNoTracking()
            .Where(y => y.Id == req.Id && y.DeletedAt == null)
            .Select(y => new AcademicYearDto(y.Id, y.CollegeId, y.NameAr, y.NameEn, y.Slug, y.YearNumber,
                _db.Semesters.Count(s => s.AcademicYearId == y.Id)))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("AcademicYear", req.Id);

    public async Task<List<SemesterDto>> Handle(GetSemestersByYearQuery req, CancellationToken ct) =>
        await _db.Semesters.AsNoTracking()
            .Where(s => s.AcademicYearId == req.YearId && s.DeletedAt == null)
            .OrderBy(s => s.SemesterNumber)
            .Select(s => new SemesterDto(s.Id, s.AcademicYearId, s.NameAr, s.NameEn, s.Slug, s.SemesterNumber,
                _db.Subjects.Count(sub => sub.SemesterId == s.Id && sub.DeletedAt == null)))
            .ToListAsync(ct);

    // ===== Semesters =====
    public async Task<SemesterDto> Handle(GetSemesterByIdQuery req, CancellationToken ct) =>
        await _db.Semesters.AsNoTracking()
            .Where(s => s.Id == req.Id && s.DeletedAt == null)
            .Select(s => new SemesterDto(s.Id, s.AcademicYearId, s.NameAr, s.NameEn, s.Slug, s.SemesterNumber,
                _db.Subjects.Count(sub => sub.SemesterId == s.Id)))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("Semester", req.Id);

    public async Task<List<SubjectDto>> Handle(GetSubjectsBySemesterQuery req, CancellationToken ct)
    {
        var subjects = await _db.Subjects.AsNoTracking()
            .Where(s => s.SemesterId == req.SemesterId && s.DeletedAt == null && s.Status == "active")
            .OrderBy(s => s.SortOrder)
            .Select(s => new SubjectDto(
                s.Id, s.SemesterId, s.NameAr, s.NameEn, s.Slug, s.Code, s.Description, s.Icon, s.Color,
                _db.Questions.Count(q => q.SubjectId == s.Id && q.Status == Domain.Enums.ContentStatus.Published),
                _db.Lectures.Count(l => l.SubjectId == s.Id && l.DeletedAt == null),
                _db.Exams.Count(e => e.SubjectId == s.Id && e.Status == Domain.Enums.ContentStatus.Published),
                null // UserProgress loaded separately if studentId provided
            ))
            .ToListAsync(ct);
        return subjects;
    }

    // ===== Subjects =====
    public async Task<SubjectDto> Handle(GetSubjectByIdQuery req, CancellationToken ct)
    {
        var subject = await _db.Subjects.AsNoTracking()
            .Where(s => s.Id == req.Id && s.DeletedAt == null)
            .Select(s => new SubjectDto(
                s.Id, s.SemesterId, s.NameAr, s.NameEn, s.Slug, s.Code, s.Description, s.Icon, s.Color,
                _db.Questions.Count(q => q.SubjectId == s.Id && q.Status == Domain.Enums.ContentStatus.Published),
                _db.Lectures.Count(l => l.SubjectId == s.Id),
                _db.Exams.Count(e => e.SubjectId == s.Id && e.Status == Domain.Enums.ContentStatus.Published),
                null
            ))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("Subject", req.Id);

        // Load user progress if studentId provided
        if (req.StudentId.HasValue)
        {
            var answered = await _db.AttemptLogs.CountAsync(a => a.StudentId == req.StudentId.Value && a.Question.SubjectId == req.Id, ct);
            var total = subject.TotalQuestions;
            subject = subject with { UserProgress = new SubjectProgressDto(answered, 0, total > 0 ? answered * 100.0 / total : 0) };
        }

        return subject;
    }

    public async Task<SubjectDto> Handle(GetSubjectBySlugQuery req, CancellationToken ct)
    {
        var subject = await _db.Subjects.AsNoTracking()
            .Where(s => s.Slug == req.Slug && s.DeletedAt == null)
            .Select(s => new SubjectDto(
                s.Id, s.SemesterId, s.NameAr, s.NameEn, s.Slug, s.Code, s.Description, s.Icon, s.Color,
                _db.Questions.Count(q => q.SubjectId == s.Id && q.Status == Domain.Enums.ContentStatus.Published),
                _db.Lectures.Count(l => l.SubjectId == s.Id),
                _db.Exams.Count(e => e.SubjectId == s.Id && e.Status == Domain.Enums.ContentStatus.Published),
                null
            ))
            .FirstOrDefaultAsync(ct)
        ?? throw new NotFoundException("Subject", req.Slug);

        if (req.StudentId.HasValue)
        {
            var answered = await _db.AttemptLogs.CountAsync(a => a.StudentId == req.StudentId.Value && a.Question.SubjectId == subject.Id, ct);
            var total = subject.TotalQuestions;
            subject = subject with { UserProgress = new SubjectProgressDto(answered, 0, total > 0 ? answered * 100.0 / total : 0) };
        }

        return subject;
    }

    // ===== Lectures =====
    public async Task<List<LectureDto>> Handle(GetLecturesBySubjectQuery req, CancellationToken ct)
    {
        if (!req.StudentId.HasValue || !await _entitlements.CanAccessSubjectAsync(req.StudentId.Value, req.SubjectId, "read_lecture", ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        var lectures = await _db.Lectures.AsNoTracking()
            .Where(l => l.SubjectId == req.SubjectId && l.DeletedAt == null && l.Status == "active")
            .OrderBy(l => l.LectureNumber)
            .Select(l => new LectureDto(
                l.Id, l.SubjectId, l.NameAr, l.NameEn, l.Slug, l.LectureNumber, l.DurationMinutes,
                _db.Questions.Count(q => q.LectureId == l.Id && q.Status == Domain.Enums.ContentStatus.Published),
                0, 0
            ))
            .ToListAsync(ct);

        // Load user progress if studentId provided
        if (req.StudentId.HasValue)
        {
            foreach (var lecture in lectures)
            {
                var answered = await _db.AttemptLogs.CountAsync(a => a.StudentId == req.StudentId.Value && a.Question.LectureId == lecture.Id, ct);
                var total = lecture.QuestionsCount;
                var updated = lecture with { UserAnswered = answered, UserProgress = total > 0 ? answered * 100.0 / total : 0 };
                lectures[lectures.IndexOf(lecture)] = updated;
            }
        }

        return lectures;
    }

    public async Task<LectureDto> Handle(GetLectureByIdQuery req, CancellationToken ct)
    {
        var lecture = await _db.Lectures.AsNoTracking()
            .Where(l => l.Id == req.Id && l.DeletedAt == null && l.Status == "active")
            .Select(l => new { l.Id, l.SubjectId })
            .FirstOrDefaultAsync(ct)
            ?? throw new NotFoundException("Lecture", req.Id);

        if (!await _entitlements.CanAccessSubjectAsync(req.StudentId, lecture.SubjectId, "read_lecture", ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        return await _db.Lectures.AsNoTracking()
            .Where(l => l.Id == lecture.Id)
            .Select(l => new LectureDto(
                l.Id, l.SubjectId, l.NameAr, l.NameEn, l.Slug, l.LectureNumber, l.DurationMinutes,
                _db.Questions.Count(q => q.LectureId == l.Id && q.Status == Domain.Enums.ContentStatus.Published),
                0, 0
            ))
            .SingleAsync(ct);
    }
}

/// <summary>
/// Handles all academic hierarchy create/update/delete commands.
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
    IRequestHandler<UpdateLectureCommand, LectureDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;

    public AcademicCommandHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork)
    {
        _db = db;
        _unitOfWork = unitOfWork;
    }

    // ===== Universities =====
    public async Task<UniversityDto> Handle(CreateUniversityCommand req, CancellationToken ct)
    {
        var uni = University.Create(req.NameAr, req.Slug, req.NameEn);
        if (req.Description != null) uni.Update(req.NameAr, req.NameEn, req.Description, req.LogoUrl);
        await _db.Universities.AddAsync(uni, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new UniversityDto(uni.Id, uni.NameAr, uni.NameEn, uni.Slug, uni.LogoUrl, uni.Description, 0);
    }

    public async Task<UniversityDto> Handle(UpdateUniversityCommand req, CancellationToken ct)
    {
        var uni = await _db.Universities.FirstOrDefaultAsync(u => u.Id == req.Id && u.DeletedAt == null, ct)
            ?? throw new NotFoundException("University", req.Id);
        uni.Update(req.NameAr, req.NameEn, req.Description, req.LogoUrl);
        await _unitOfWork.SaveChangesAsync(ct);
        return new UniversityDto(uni.Id, uni.NameAr, uni.NameEn, uni.Slug, uni.LogoUrl, uni.Description, 0);
    }

    public async Task<Unit> Handle(DeleteUniversityCommand req, CancellationToken ct)
    {
        var uni = await _db.Universities.FirstOrDefaultAsync(u => u.Id == req.Id, ct)
            ?? throw new NotFoundException("University", req.Id);
        uni.DeletedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    // ===== Colleges =====
    public async Task<CollegeDto> Handle(CreateCollegeCommand req, CancellationToken ct)
    {
        var college = College.Create(req.UniversityId, req.NameAr, req.Slug, req.NameEn);
        await _db.Colleges.AddAsync(college, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new CollegeDto(college.Id, college.UniversityId, college.NameAr, college.NameEn, college.Slug, college.Icon, 0);
    }

    public async Task<CollegeDto> Handle(UpdateCollegeCommand req, CancellationToken ct)
    {
        var college = await _db.Colleges.FirstOrDefaultAsync(c => c.Id == req.Id && c.DeletedAt == null, ct)
            ?? throw new NotFoundException("College", req.Id);
        typeof(College).GetProperty("NameAr")?.SetValue(college, req.NameAr);
        typeof(College).GetProperty("NameEn")?.SetValue(college, req.NameEn);
        await _unitOfWork.SaveChangesAsync(ct);
        return new CollegeDto(college.Id, college.UniversityId, college.NameAr, college.NameEn, college.Slug, college.Icon, 0);
    }

    public async Task<Unit> Handle(DeleteCollegeCommand req, CancellationToken ct)
    {
        var college = await _db.Colleges.FirstOrDefaultAsync(c => c.Id == req.Id, ct)
            ?? throw new NotFoundException("College", req.Id);
        college.DeletedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    // ===== Academic Years =====
    public async Task<AcademicYearDto> Handle(CreateAcademicYearCommand req, CancellationToken ct)
    {
        var year = AcademicYear.Create(req.CollegeId, req.NameAr, req.Slug, req.YearNumber);
        await _db.AcademicYears.AddAsync(year, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new AcademicYearDto(year.Id, year.CollegeId, year.NameAr, year.NameEn, year.Slug, year.YearNumber, 0);
    }

    public async Task<AcademicYearDto> Handle(UpdateAcademicYearCommand req, CancellationToken ct)
    {
        var year = await _db.AcademicYears.FirstOrDefaultAsync(y => y.Id == req.Id && y.DeletedAt == null, ct)
            ?? throw new NotFoundException("AcademicYear", req.Id);
        typeof(AcademicYear).GetProperty("NameAr")?.SetValue(year, req.NameAr);
        typeof(AcademicYear).GetProperty("NameEn")?.SetValue(year, req.NameEn);
        await _unitOfWork.SaveChangesAsync(ct);
        return new AcademicYearDto(year.Id, year.CollegeId, year.NameAr, year.NameEn, year.Slug, year.YearNumber, 0);
    }

    // ===== Semesters =====
    public async Task<SemesterDto> Handle(CreateSemesterCommand req, CancellationToken ct)
    {
        var sem = Semester.Create(req.AcademicYearId, req.NameAr, req.Slug, req.SemesterNumber);
        await _db.Semesters.AddAsync(sem, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new SemesterDto(sem.Id, sem.AcademicYearId, sem.NameAr, sem.NameEn, sem.Slug, sem.SemesterNumber, 0);
    }

    // ===== Subjects =====
    public async Task<SubjectDto> Handle(CreateSubjectCommand req, CancellationToken ct)
    {
        var subject = Subject.Create(req.SemesterId, req.NameAr, req.Slug, req.NameEn);
        if (req.Color != null) typeof(Subject).GetProperty("Color")?.SetValue(subject, req.Color);
        if (req.Description != null) typeof(Subject).GetProperty("Description")?.SetValue(subject, req.Description);
        if (req.Code != null) typeof(Subject).GetProperty("Code")?.SetValue(subject, req.Code);
        await _db.Subjects.AddAsync(subject, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new SubjectDto(subject.Id, subject.SemesterId, subject.NameAr, subject.NameEn, subject.Slug, req.Code, req.Description, subject.Icon, req.Color, 0, 0, 0, null);
    }

    public async Task<SubjectDto> Handle(UpdateSubjectCommand req, CancellationToken ct)
    {
        var subject = await _db.Subjects.FirstOrDefaultAsync(s => s.Id == req.Id && s.DeletedAt == null, ct)
            ?? throw new NotFoundException("Subject", req.Id);
        typeof(Subject).GetProperty("NameAr")?.SetValue(subject, req.NameAr);
        typeof(Subject).GetProperty("NameEn")?.SetValue(subject, req.NameEn);
        typeof(Subject).GetProperty("Description")?.SetValue(subject, req.Description);
        typeof(Subject).GetProperty("Color")?.SetValue(subject, req.Color);
        await _unitOfWork.SaveChangesAsync(ct);
        return new SubjectDto(subject.Id, subject.SemesterId, subject.NameAr, subject.NameEn, subject.Slug, subject.Code, subject.Description, subject.Icon, subject.Color, 0, 0, 0, null);
    }

    // ===== Lectures =====
    public async Task<LectureDto> Handle(CreateLectureCommand req, CancellationToken ct)
    {
        var lecture = Lecture.Create(req.SubjectId, req.TitleAr, req.Slug, req.LectureNumber);
        if (req.DurationMinutes.HasValue) typeof(Lecture).GetProperty("DurationMinutes")?.SetValue(lecture, req.DurationMinutes);
        await _db.Lectures.AddAsync(lecture, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return new LectureDto(lecture.Id, lecture.SubjectId, lecture.NameAr, lecture.NameEn, lecture.Slug, lecture.LectureNumber, req.DurationMinutes, 0, 0, 0);
    }

    public async Task<LectureDto> Handle(UpdateLectureCommand req, CancellationToken ct)
    {
        var lecture = await _db.Lectures.FirstOrDefaultAsync(l => l.Id == req.Id && l.DeletedAt == null, ct)
            ?? throw new NotFoundException("Lecture", req.Id);
        typeof(Lecture).GetProperty("NameAr")?.SetValue(lecture, req.TitleAr);
        typeof(Lecture).GetProperty("NameEn")?.SetValue(lecture, req.TitleEn);
        typeof(Lecture).GetProperty("DurationMinutes")?.SetValue(lecture, req.DurationMinutes);
        await _unitOfWork.SaveChangesAsync(ct);
        return new LectureDto(lecture.Id, lecture.SubjectId, lecture.NameAr, lecture.NameEn, lecture.Slug, lecture.LectureNumber, req.DurationMinutes, 0, 0, 0);
    }
}

