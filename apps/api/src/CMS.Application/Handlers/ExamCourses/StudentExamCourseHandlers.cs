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
/// W14.2 B.2 — student storefront for exam-course bundles (D1/D4). Only Published
/// bundles are ever listed; D4 URL filters (subject/year/semester) are applied
/// server-side. Entitlement is enforced by the controller gate; this handler
/// additionally verifies the subject entitlement through the subscription service
/// so the data path stays fail-closed even if a future caller forgets the gate.
/// </summary>
public sealed class StudentExamCourseHandlers :
    IRequestHandler<GetStudentExamCoursesQuery, List<StudentExamCourseListItemDto>>,
    IRequestHandler<GetStudentExamCourseDetailQuery, StudentExamCourseDetailDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IEntitlementService _entitlements;

    public StudentExamCourseHandlers(IApplicationDbContext db, IEntitlementService entitlements)
    {
        _db = db;
        _entitlements = entitlements;
    }

    public async Task<List<StudentExamCourseListItemDto>> Handle(GetStudentExamCoursesQuery req, CancellationToken ct)
    {
        await EnsureSubjectEntitlementAsync(req.StudentId, req.SubjectId, ct);

        var query = _db.ExamCourses.AsNoTracking()
            .Where(course => course.SubjectId == req.SubjectId && course.Status == ContentStatus.Published);
        // D4: year/semester arrive as URL filters and narrow the list server-side.
        if (req.Year.HasValue) query = query.Where(course => course.Year == req.Year.Value);
        if (req.Semester.HasValue) query = query.Where(course => course.Semester == req.Semester.Value);

        var courses = await query
            .OrderBy(course => course.SortOrder).ThenBy(course => course.CreatedAt)
            .Select(course => new
            {
                course.Id,
                course.NameAr,
                course.NameEn,
                course.Description,
                course.CoverUrl,
                course.Year,
                course.Semester,
                course.CourseType,
                course.FreeOrPaid,
                course.SortOrder,
                ExamsCount = course.Items.Count
            })
            .ToListAsync(ct);

        return courses.Select(course => new StudentExamCourseListItemDto(
            course.Id, course.NameAr, course.NameEn, course.Description, course.CoverUrl,
            course.Year, course.Semester, course.CourseType.ToString(), course.FreeOrPaid,
            course.ExamsCount, course.SortOrder)).ToList();
    }

    public async Task<StudentExamCourseDetailDto> Handle(GetStudentExamCourseDetailQuery req, CancellationToken ct)
    {
        var course = await _db.ExamCourses.AsNoTracking()
            .Include(item => item.Items).ThenInclude(item => item.Exam)
            .FirstOrDefaultAsync(item => item.Id == req.CourseId && item.Status == ContentStatus.Published, ct)
            ?? throw new NotFoundException("ExamCourse", req.CourseId);
        await EnsureSubjectEntitlementAsync(req.StudentId, course.SubjectId, ct);

        var examIds = course.Items.Select(item => item.ExamId).ToList();
        var sessions = await _db.ExamSessions.AsNoTracking()
            .Where(session => session.StudentId == req.StudentId && examIds.Contains(session.ExamId))
            .Select(session => new { session.ExamId, session.Status, session.Score })
            .ToListAsync(ct);

        var exams = course.Items.OrderBy(item => item.SortOrder).Select(item =>
        {
            var examSessions = sessions.Where(session => session.ExamId == item.ExamId).ToList();
            var terminal = examSessions.Where(session =>
                session.Status is ExamSessionStatus.Completed or ExamSessionStatus.TimedOut).ToList();
            return new StudentExamCourseExamDto(
                item.ExamId,
                item.Exam.TitleAr,
                item.Exam.DurationMinutes,
                item.Exam.TotalQuestions,
                item.SortOrder,
                examSessions.Any(session => session.Status == ExamSessionStatus.InProgress),
                terminal.Any(),
                examSessions.Count,
                terminal.Any() ? terminal.Max(session => session.Score ?? 0) : null);
        }).ToList();

        return new StudentExamCourseDetailDto(
            course.Id, course.NameAr, course.NameEn, course.Description, course.CoverUrl,
            course.Year, course.Semester, course.CourseType.ToString(), course.FreeOrPaid, exams);
    }

    private async Task EnsureSubjectEntitlementAsync(Guid studentId, Guid subjectId, CancellationToken ct)
    {
        if (!await _entitlements.CanAccessSubjectContentAsync(studentId, subjectId, SubscriptionContentScope.QuestionsExams, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");
    }
}
