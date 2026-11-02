namespace CMS.Application.DTOs.ExamCourses;

// ===== Admin =====

/// <summary>W14.2 B.1 — admin-facing exam-course bundle detail (D1).</summary>
public record ExamCourseDetailDto(
    Guid Id,
    Guid SubjectId,
    string SubjectName,
    string NameAr,
    string? NameEn,
    string? Description,
    string? CoverUrl,
    int Year,
    int Semester,
    string CourseType,
    bool FreeOrPaid,
    int SortOrder,
    string Status,
    List<ExamCourseItemDto> Items,
    DateTime CreatedAt,
    DateTime UpdatedAt);

/// <summary>One exam row inside a bundle (D6: exams always come from the bank).</summary>
public record ExamCourseItemDto(
    Guid ItemId,
    Guid ExamId,
    string ExamTitleAr,
    string? ModelLetter,
    int ExamTotalQuestions,
    int ExamDurationMinutes,
    string ExamStatus,
    int SortOrder);

public record CreateExamCourseDto(
    Guid SubjectId,
    string NameAr,
    string? NameEn,
    string? Description,
    string? CoverUrl,
    int Year,
    int Semester,
    string CourseType,
    bool FreeOrPaid,
    int SortOrder = 0);

public record UpdateExamCourseDto(
    string NameAr,
    string? NameEn,
    string? Description,
    string? CoverUrl,
    int Year,
    int Semester,
    string CourseType,
    bool FreeOrPaid,
    int SortOrder);

public record AddExamCourseExamDto(Guid ExamId);

/// <summary>Ordered exam ids — index becomes the item's SortOrder inside the bundle.</summary>
public record ReorderExamCourseExamsDto(List<Guid> ExamIds);

// ===== Student =====

/// <summary>W14.2 B.2 — storefront list item (D4: subject/year/semester URL filters).</summary>
public record StudentExamCourseListItemDto(
    Guid Id,
    string NameAr,
    string? NameEn,
    string? Description,
    string? CoverUrl,
    int Year,
    int Semester,
    string CourseType,
    bool FreeOrPaid,
    int ExamsCount,
    int SortOrder);

public record StudentExamCourseDetailDto(
    Guid Id,
    string NameAr,
    string? NameEn,
    string? Description,
    string? CoverUrl,
    int Year,
    int Semester,
    string CourseType,
    bool FreeOrPaid,
    List<StudentExamCourseExamDto> Exams);

/// <summary>Per-exam row enriched with the CURRENT student's attempt state.</summary>
public record StudentExamCourseExamDto(
    Guid ExamId,
    string TitleAr,
    int DurationMinutes,
    int TotalQuestions,
    int SortOrder,
    bool InProgress,
    bool Completed,
    int AttemptCount,
    double? BestScore);
