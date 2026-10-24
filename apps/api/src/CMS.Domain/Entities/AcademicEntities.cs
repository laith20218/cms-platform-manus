using CMS.Domain.Common;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Domain.Entities;

/// <summary>
/// University entity - top of the academic hierarchy.
/// </summary>
public class University : LookupEntity
{
    public string? LogoUrl { get; private set; }
    public string Country { get; private set; } = "سوريا";
    public string? City { get; private set; }
    public string? Website { get; private set; }

    // Navigation
    public ICollection<College> Colleges { get; private set; } = new List<College>();

    public static University Create(string nameAr, string slug, string? nameEn = null)
    {
        if (string.IsNullOrWhiteSpace(nameAr))
            throw new DomainException("University name is required");
        if (string.IsNullOrWhiteSpace(slug))
            throw new DomainException("University slug is required");

        return new University
        {
            NameAr = nameAr,
            NameEn = nameEn,
            Slug = slug
        };
    }

    public void Update(string nameAr, string? nameEn, string? description, string? logoUrl)
    {
        NameAr = nameAr;
        NameEn = nameEn;
        Description = description;
        LogoUrl = logoUrl;
        UpdatedAt = DateTime.UtcNow;
    }
}

/// <summary>
/// College entity - belongs to a university.
/// </summary>
public class College : LookupEntity
{
    public Guid UniversityId { get; private set; }
    public string? Icon { get; private set; }

    // Navigation
    public University University { get; private set; } = null!;
    public ICollection<AcademicYear> AcademicYears { get; private set; } = new List<AcademicYear>();

    public static College Create(Guid universityId, string nameAr, string slug, string? nameEn = null)
    {
        return new College
        {
            UniversityId = universityId,
            NameAr = nameAr,
            NameEn = nameEn,
            Slug = slug
        };
    }
}

/// <summary>
/// Academic year entity (e.g., "السنة الثالثة").
/// </summary>
public class AcademicYear : LookupEntity
{
    public Guid CollegeId { get; private set; }
    public int YearNumber { get; private set; }

    // Navigation
    public College College { get; private set; } = null!;
    public ICollection<Semester> Semesters { get; private set; } = new List<Semester>();

    public static AcademicYear Create(Guid collegeId, string nameAr, string slug, int yearNumber)
    {
        if (yearNumber < 1 || yearNumber > 7)
            throw new DomainException("Year number must be between 1 and 7");

        return new AcademicYear
        {
            CollegeId = collegeId,
            NameAr = nameAr,
            Slug = slug,
            YearNumber = yearNumber
        };
    }
}

/// <summary>
/// Semester entity (e.g., "الفصل الأول").
/// </summary>
public class Semester : LookupEntity
{
    public Guid AcademicYearId { get; private set; }
    public int SemesterNumber { get; private set; }

    // Navigation
    public AcademicYear AcademicYear { get; private set; } = null!;
    public ICollection<Subject> Subjects { get; private set; } = new List<Subject>();

    public static Semester Create(Guid academicYearId, string nameAr, string slug, int semesterNumber)
    {
        if (semesterNumber < 1 || semesterNumber > 3)
            throw new DomainException("Semester number must be between 1 and 3");

        return new Semester
        {
            AcademicYearId = academicYearId,
            NameAr = nameAr,
            Slug = slug,
            SemesterNumber = semesterNumber
        };
    }
}

/// <summary>
/// Subject entity (e.g., "الباطنة").
/// </summary>
public class Subject : LookupEntity
{
    public Guid SemesterId { get; private set; }
    public string? Code { get; private set; }
    public string? Icon { get; private set; }
    public string? Color { get; private set; }
    public int? Credits { get; private set; }

    // Navigation
    public Semester Semester { get; private set; } = null!;
    public ICollection<Lecture> Lectures { get; private set; } = new List<Lecture>();
    public ICollection<Question> Questions { get; private set; } = new List<Question>();
    public ICollection<Exam> Exams { get; private set; } = new List<Exam>();
    public ICollection<LibraryFile> LibraryFiles { get; private set; } = new List<LibraryFile>();
    public ICollection<Course> Courses { get; private set; } = new List<Course>();

    public static Subject Create(Guid semesterId, string nameAr, string slug, string? nameEn = null)
    {
        return new Subject
        {
            SemesterId = semesterId,
            NameAr = nameAr,
            NameEn = nameEn,
            Slug = slug,
            Color = "#1976D2"
        };
    }
}

/// <summary>
/// Lecture entity (e.g., "محاضرة 1: مقدمة في الباطنة").
/// </summary>
public class Lecture : LookupEntity
{
    public Guid SubjectId { get; private set; }
    public int LectureNumber { get; private set; }
    public int? DurationMinutes { get; private set; }
    public string? InstructorName { get; private set; }
    public string? SourceReference { get; private set; }

    // Navigation
    public Subject Subject { get; private set; } = null!;
    public ICollection<Question> Questions { get; private set; } = new List<Question>();

    public static Lecture Create(Guid subjectId, string titleAr, string slug, int lectureNumber)
    {
        return new Lecture
        {
            SubjectId = subjectId,
            NameAr = titleAr,
            Slug = slug,
            LectureNumber = lectureNumber,
            Status = "draft"
        };
    }

    public void Publish()
    {
        Status = "active";
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateDetails(string titleAr, string? titleEn, int? durationMinutes, string? description, string? instructorName, string? sourceReference)
    {
        NameAr = titleAr;
        NameEn = titleEn;
        DurationMinutes = durationMinutes;
        Description = description;
        InstructorName = instructorName;
        SourceReference = sourceReference;
        UpdatedAt = DateTime.UtcNow;
    }
}
