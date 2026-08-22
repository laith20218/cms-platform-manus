using MediatR;
using CMS.Application.DTOs.Academic;

namespace CMS.Application.Commands.Academic;

// ===== Generic Paged Query =====
public record GetPagedQuery<T>(
    int Page = 1,
    int PageSize = 20,
    string? Search = null,
    string? Sort = "createdAt",
    string? Order = "desc"
);

// ===== Universities =====
public record GetUniversitiesQuery(int Page = 1, int PageSize = 50, bool IncludeArchived = false) : IRequest<PagedResult<UniversityDto>>;
public record GetUniversityByIdQuery(Guid Id) : IRequest<UniversityDto>;
public record GetCollegesByUniversityQuery(Guid UniversityId, bool IncludeArchived = false) : IRequest<List<CollegeDto>>;
public record CreateUniversityCommand(string NameAr, string? NameEn, string Slug, string? Description, string? LogoUrl, Guid CreatedBy) : IRequest<UniversityDto>;
public record UpdateUniversityCommand(Guid Id, string NameAr, string? NameEn, string? Description, string? LogoUrl) : IRequest<UniversityDto>;
public record DeleteUniversityCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;

// ===== Colleges =====
public record GetCollegeByIdQuery(Guid Id) : IRequest<CollegeDto>;
public record GetYearsByCollegeQuery(Guid CollegeId, bool IncludeArchived = false) : IRequest<List<AcademicYearDto>>;
public record CreateCollegeCommand(Guid UniversityId, string NameAr, string? NameEn, string Slug, Guid CreatedBy) : IRequest<CollegeDto>;
public record UpdateCollegeCommand(Guid Id, string NameAr, string? NameEn) : IRequest<CollegeDto>;
public record DeleteCollegeCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;

// ===== Academic Years =====
public record GetAcademicYearByIdQuery(Guid Id) : IRequest<AcademicYearDto>;
public record GetSemestersByYearQuery(Guid YearId, bool IncludeArchived = false) : IRequest<List<SemesterDto>>;
public record CreateAcademicYearCommand(Guid CollegeId, string NameAr, string? NameEn, string Slug, int YearNumber, Guid CreatedBy) : IRequest<AcademicYearDto>;
public record UpdateAcademicYearCommand(Guid Id, string NameAr, string? NameEn) : IRequest<AcademicYearDto>;

// ===== Semesters =====
public record GetSemesterByIdQuery(Guid Id) : IRequest<SemesterDto>;
public record GetSubjectsBySemesterQuery(Guid SemesterId, Guid? StudentId = null, bool IncludeArchived = false) : IRequest<List<SubjectDto>>;
public record CreateSemesterCommand(Guid AcademicYearId, string NameAr, string? NameEn, string Slug, int SemesterNumber, Guid CreatedBy) : IRequest<SemesterDto>;

// ===== Subjects =====
public record GetSubjectByIdQuery(Guid Id, Guid? StudentId = null) : IRequest<SubjectDto>;
public record GetSubjectBySlugQuery(string Slug, Guid? StudentId = null) : IRequest<SubjectDto>;
public record CreateSubjectCommand(Guid SemesterId, string NameAr, string? NameEn, string Slug, string? Code, string? Description, string? Color, Guid CreatedBy) : IRequest<SubjectDto>;
public record UpdateSubjectCommand(Guid Id, string NameAr, string? NameEn, string? Description, string? Color) : IRequest<SubjectDto>;

// ===== Lectures =====
public record GetLecturesBySubjectQuery(Guid SubjectId, Guid? StudentId = null, bool IncludeArchived = false) : IRequest<List<LectureDto>>;
public record GetLectureByIdQuery(Guid Id, Guid StudentId) : IRequest<LectureDto>;
public record CreateLectureCommand(Guid SubjectId, string TitleAr, string? TitleEn, string Slug, int LectureNumber, int? DurationMinutes, Guid CreatedBy) : IRequest<LectureDto>;
public record UpdateLectureCommand(Guid Id, string TitleAr, string? TitleEn, int? DurationMinutes) : IRequest<LectureDto>;

// ===== Archive lifecycle =====
public record ArchiveAcademicEntityCommand(string EntityType, Guid Id, Guid ArchivedBy) : IRequest<Unit>;
public record RestoreAcademicEntityCommand(string EntityType, Guid Id, Guid RestoredBy) : IRequest<Unit>;

// ===== Paged Result =====
public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);
