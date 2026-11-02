using MediatR;
using CMS.Application.DTOs.ExamCourses;

namespace CMS.Application.Commands.ExamCourses;

// ===== W14.2 B.1 — ExamCourse admin lifecycle (D1/D5/D6) =====
public record CreateExamCourseCommand(
    Guid SubjectId,
    string NameAr,
    string? NameEn,
    string? Description,
    string? CoverUrl,
    int Year,
    int Semester,
    string CourseType,
    bool FreeOrPaid,
    int SortOrder,
    Guid CreatedBy
) : IRequest<ExamCourseDetailDto>;

public record UpdateExamCourseCommand(
    Guid Id,
    string NameAr,
    string? NameEn,
    string? Description,
    string? CoverUrl,
    int Year,
    int Semester,
    string CourseType,
    bool FreeOrPaid,
    int SortOrder,
    Guid UpdatedBy
) : IRequest<ExamCourseDetailDto>;

public record PublishExamCourseCommand(Guid Id, Guid PublishedBy) : IRequest<Unit>;
public record ArchiveExamCourseCommand(Guid Id, Guid ArchivedBy) : IRequest<Unit>;

/// <summary>Soft delete — Status flips to Deleted (ExamCourse is a BaseEntity: no DeletedAt column).</summary>
public record DeleteExamCourseCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;

public record AddExamToCourseCommand(Guid CourseId, Guid ExamId, Guid UpdatedBy) : IRequest<ExamCourseDetailDto>;
public record RemoveExamFromCourseCommand(Guid CourseId, Guid ExamId, Guid UpdatedBy) : IRequest<Unit>;

/// <summary>Ordered exam ids; index becomes the item's SortOrder. Full list replaces the order.</summary>
public record ReorderCourseExamsCommand(Guid CourseId, List<Guid> ExamIds, Guid UpdatedBy) : IRequest<ExamCourseDetailDto>;

public record GetExamCourseByIdQuery(Guid Id) : IRequest<ExamCourseDetailDto>;

// ===== W14.2 B.2 — student storefront (D4 filters + entitlement gate) =====
public record GetStudentExamCoursesQuery(
    Guid StudentId,
    Guid SubjectId,
    int? Year,
    int? Semester
) : IRequest<List<StudentExamCourseListItemDto>>;

public record GetStudentExamCourseDetailQuery(Guid StudentId, Guid CourseId) : IRequest<StudentExamCourseDetailDto>;
