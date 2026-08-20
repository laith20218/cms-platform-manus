namespace CMS.Application.DTOs.Academic;

// ===== University =====
public record UniversityDto(
    Guid Id,
    string NameAr,
    string? NameEn,
    string Slug,
    string? LogoUrl,
    string? Description,
    int CollegesCount
);

public record CreateUniversityDto(string NameAr, string? NameEn, string Slug, string? Description, string? LogoUrl);
public record UpdateUniversityDto(string NameAr, string? NameEn, string? Description, string? LogoUrl);

// ===== College =====
public record CollegeDto(
    Guid Id,
    Guid UniversityId,
    string NameAr,
    string? NameEn,
    string Slug,
    string? Icon,
    int YearsCount
);

public record CreateCollegeDto(Guid UniversityId, string NameAr, string? NameEn, string Slug);
public record UpdateCollegeDto(string NameAr, string? NameEn);

// ===== Academic Year =====
public record AcademicYearDto(
    Guid Id,
    Guid CollegeId,
    string NameAr,
    string? NameEn,
    string Slug,
    int YearNumber,
    int SemestersCount
);

public record CreateAcademicYearDto(Guid CollegeId, string NameAr, string? NameEn, string Slug, int YearNumber);
public record UpdateAcademicYearDto(string NameAr, string? NameEn);

// ===== Semester =====
public record SemesterDto(
    Guid Id,
    Guid AcademicYearId,
    string NameAr,
    string? NameEn,
    string Slug,
    int SemesterNumber,
    int SubjectsCount
);

public record CreateSemesterDto(Guid AcademicYearId, string NameAr, string? NameEn, string Slug, int SemesterNumber);
public record UpdateSemesterDto(string NameAr, string? NameEn);

// ===== Subject =====
public record SubjectDto(
    Guid Id,
    Guid SemesterId,
    string NameAr,
    string? NameEn,
    string Slug,
    string? Code,
    string? Description,
    string? Icon,
    string? Color,
    int TotalQuestions,
    int TotalLectures,
    int TotalExams,
    SubjectProgressDto? UserProgress
);

public record SubjectProgressDto(
    int QuestionsAnswered,
    double Accuracy,
    double CompletedPercentage
);

public record CreateSubjectDto(Guid SemesterId, string NameAr, string? NameEn, string Slug, string? Code, string? Description, string? Color);
public record UpdateSubjectDto(string NameAr, string? NameEn, string? Description, string? Color);

// ===== Lecture =====
public record LectureDto(
    Guid Id,
    Guid SubjectId,
    string TitleAr,
    string? TitleEn,
    string Slug,
    int LectureNumber,
    int? DurationMinutes,
    int QuestionsCount,
    int UserAnswered,
    double UserProgress
);

public record CreateLectureDto(Guid SubjectId, string TitleAr, string? TitleEn, string Slug, int LectureNumber, int? DurationMinutes);
public record UpdateLectureDto(string TitleAr, string? TitleEn, int? DurationMinutes);
