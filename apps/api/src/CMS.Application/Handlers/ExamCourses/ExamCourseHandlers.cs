using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.ExamCourses;
using CMS.Application.DTOs.ExamCourses;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.ExamCourses;

/// <summary>
/// W14.2 B.1 — admin lifecycle for exam-course bundles (D1) and their bank-picked
/// exam compositions (D6). Exams may never be created "inside" a bundle: AddExam
/// only links an existing bank exam, and (ExamCourseId, ExamId) uniqueness is
/// enforced both here and by the W14.1 unique index.
/// </summary>
public sealed class ExamCourseHandlers :
    IRequestHandler<CreateExamCourseCommand, ExamCourseDetailDto>,
    IRequestHandler<UpdateExamCourseCommand, ExamCourseDetailDto>,
    IRequestHandler<PublishExamCourseCommand, Unit>,
    IRequestHandler<ArchiveExamCourseCommand, Unit>,
    IRequestHandler<DeleteExamCourseCommand, Unit>,
    IRequestHandler<AddExamToCourseCommand, ExamCourseDetailDto>,
    IRequestHandler<RemoveExamFromCourseCommand, Unit>,
    IRequestHandler<ReorderCourseExamsCommand, ExamCourseDetailDto>,
    IRequestHandler<GetExamCourseByIdQuery, ExamCourseDetailDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPermissionService _permissions;

    public ExamCourseHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork, IPermissionService permissions)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _permissions = permissions;
    }

    public async Task<ExamCourseDetailDto> Handle(CreateExamCourseCommand req, CancellationToken ct)
    {
        ValidateCourseFields(req.NameAr, req.Year, req.Semester);
        var courseType = ParseCourseType(req.CourseType);
        await EnsureSubjectExistsAsync(req.SubjectId, ct);

        var course = new ExamCourse
        {
            SubjectId = req.SubjectId,
            NameAr = req.NameAr.Trim(),
            NameEn = string.IsNullOrWhiteSpace(req.NameEn) ? null : req.NameEn.Trim(),
            Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim(),
            CoverUrl = string.IsNullOrWhiteSpace(req.CoverUrl) ? null : req.CoverUrl.Trim(),
            Year = req.Year,
            Semester = req.Semester,
            CourseType = courseType,
            FreeOrPaid = req.FreeOrPaid,
            SortOrder = req.SortOrder,
            Status = ContentStatus.Draft
        };
        await _db.ExamCourses.AddAsync(course, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return await BuildDetailAsync(course.Id, ct);
    }

    public async Task<ExamCourseDetailDto> Handle(UpdateExamCourseCommand req, CancellationToken ct)
    {
        ValidateCourseFields(req.NameAr, req.Year, req.Semester);
        var courseType = ParseCourseType(req.CourseType);
        var course = await LoadCourseAsync(req.Id, ct);
        course.NameAr = req.NameAr.Trim();
        course.NameEn = string.IsNullOrWhiteSpace(req.NameEn) ? null : req.NameEn.Trim();
        course.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        course.CoverUrl = string.IsNullOrWhiteSpace(req.CoverUrl) ? null : req.CoverUrl.Trim();
        course.Year = req.Year;
        course.Semester = req.Semester;
        course.CourseType = courseType;
        course.FreeOrPaid = req.FreeOrPaid;
        course.SortOrder = req.SortOrder;
        await _unitOfWork.SaveChangesAsync(ct);
        return await BuildDetailAsync(course.Id, ct);
    }

    public async Task<Unit> Handle(PublishExamCourseCommand req, CancellationToken ct)
    {
        var course = await LoadCourseAsync(req.Id, ct);
        // A bundle students can see must actually contain something (D6 spirit —
        // mirrors EnsureCompositionCanRun for exams).
        if (!await _db.ExamCourseItems.AnyAsync(item => item.ExamCourseId == course.Id, ct))
            throw new BusinessRuleViolationException("لا يمكن نشر دورة امتحانية بلا اختبارات");
        course.Status = ContentStatus.Published;
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(ArchiveExamCourseCommand req, CancellationToken ct)
    {
        var course = await LoadCourseAsync(req.Id, ct);
        course.Status = ContentStatus.Archived;
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(DeleteExamCourseCommand req, CancellationToken ct)
    {
        var course = await LoadCourseAsync(req.Id, ct);
        course.Status = ContentStatus.Deleted;
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<ExamCourseDetailDto> Handle(AddExamToCourseCommand req, CancellationToken ct)
    {
        var course = await LoadCourseAsync(req.CourseId, ct);
        var exam = await _db.Exams.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == req.ExamId && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.ExamId);
        // D1: a bundle belongs to one subject — only same-subject bank exams may be picked.
        if (exam.SubjectId != course.SubjectId)
            throw new BusinessRuleViolationException("لا يمكن إضافة اختبار من مادة أخرى إلى الدورة");

        var exists = await _db.ExamCourseItems.AsNoTracking()
            .AnyAsync(item => item.ExamCourseId == course.Id && item.ExamId == req.ExamId, ct);
        if (exists)
            throw new ConflictException("هذا الاختبار مضاف إلى الدورة بالفعل");

        var maxOrder = await _db.ExamCourseItems.AsNoTracking()
            .Where(item => item.ExamCourseId == course.Id)
            .OrderByDescending(item => item.SortOrder)
            .Select(item => (int?)item.SortOrder)
            .FirstOrDefaultAsync(ct) ?? -1;
        await _db.ExamCourseItems.AddAsync(new ExamCourseItem
        {
            ExamCourseId = course.Id,
            ExamId = req.ExamId,
            SortOrder = maxOrder + 1
        }, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return await BuildDetailAsync(course.Id, ct);
    }

    public async Task<Unit> Handle(RemoveExamFromCourseCommand req, CancellationToken ct)
    {
        var course = await LoadCourseAsync(req.CourseId, ct);
        var item = await _db.ExamCourseItems
            .FirstOrDefaultAsync(row => row.ExamCourseId == course.Id && row.ExamId == req.ExamId, ct)
            ?? throw new NotFoundException("ExamCourseItem", req.ExamId);
        _db.ExamCourseItems.Remove(item);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<ExamCourseDetailDto> Handle(ReorderCourseExamsCommand req, CancellationToken ct)
    {
        var course = await LoadCourseAsync(req.CourseId, ct);
        if (req.ExamIds.Count == 0)
            throw new DomainException("قائمة الترتيب لا يمكن أن تكون فارغة");
        if (req.ExamIds.Distinct().Count() != req.ExamIds.Count)
            throw new DomainException("لا يمكن تكرار الاختبار نفسه في قائمة الترتيب");

        var items = await _db.ExamCourseItems
            .Where(item => item.ExamCourseId == course.Id)
            .ToListAsync(ct);
        var itemByExam = items.ToDictionary(item => item.ExamId);
        var unknown = req.ExamIds.Where(examId => !itemByExam.ContainsKey(examId)).FirstOrDefault();
        if (unknown != default)
            throw new NotFoundException("ExamCourseItem", unknown);
        if (req.ExamIds.Count != items.Count)
            throw new DomainException("قائمة الترتيب يجب أن تحوي كل اختبارات الدورة");

        for (var index = 0; index < req.ExamIds.Count; index++)
            itemByExam[req.ExamIds[index]].SortOrder = index;
        await _unitOfWork.SaveChangesAsync(ct);
        return await BuildDetailAsync(course.Id, ct);
    }

    public async Task<ExamCourseDetailDto> Handle(GetExamCourseByIdQuery req, CancellationToken ct) =>
        await BuildDetailAsync(req.Id, ct);

    private async Task<ExamCourse> LoadCourseAsync(Guid courseId, CancellationToken ct) =>
        await _db.ExamCourses.FirstOrDefaultAsync(course => course.Id == courseId, ct)
        ?? throw new NotFoundException("ExamCourse", courseId);

    private async Task EnsureSubjectExistsAsync(Guid subjectId, CancellationToken ct)
    {
        if (!await _db.Subjects.AsNoTracking().AnyAsync(subject => subject.Id == subjectId && subject.DeletedAt == null, ct))
            throw new NotFoundException("Subject", subjectId);
    }

    private static void ValidateCourseFields(string nameAr, int year, int semester)
    {
        if (string.IsNullOrWhiteSpace(nameAr))
            throw new DomainException("اسم الدورة مطلوب");
        if (nameAr.Trim().Length > 200)
            throw new DomainException("اسم الدورة لا يتجاوز 200 حرف");
        if (year < 1)
            throw new DomainException("سنة الدورة غير صالحة");
        if (semester is < 1 or > 3)
            throw new DomainException("فصل الدورة يجب أن يكون 1 أو 2 أو 3");
    }

    private static ExamCourseType ParseCourseType(string value) =>
        Enum.TryParse<ExamCourseType>(value, true, out var parsed)
            ? parsed
            : throw new DomainException("نوع الدورة غير صالح");

    internal static ExamCourseDetailDto MapCourse(ExamCourse course, string subjectName, List<ExamCourseItemDto> items) => new(
        course.Id, course.SubjectId, subjectName, course.NameAr, course.NameEn, course.Description,
        course.CoverUrl, course.Year, course.Semester, course.CourseType.ToString(), course.FreeOrPaid,
        course.SortOrder, course.Status.ToString(), items, course.CreatedAt, course.UpdatedAt);

    internal async Task<ExamCourseDetailDto> BuildDetailAsync(Guid courseId, CancellationToken ct)
    {
        var course = await _db.ExamCourses.AsNoTracking()
            .Include(item => item.Subject)
            .Include(item => item.Items).ThenInclude(item => item.Exam)
            .FirstOrDefaultAsync(item => item.Id == courseId, ct)
            ?? throw new NotFoundException("ExamCourse", courseId);
        var items = course.Items.OrderBy(item => item.SortOrder).Select(item => new ExamCourseItemDto(
            item.Id, item.ExamId, item.Exam.TitleAr, item.Exam.ModelLetter?.ToString(),
            item.Exam.TotalQuestions, item.Exam.DurationMinutes, item.Exam.Status.ToString(), item.SortOrder)).ToList();
        return MapCourse(course, course.Subject.NameAr, items);
    }
}
