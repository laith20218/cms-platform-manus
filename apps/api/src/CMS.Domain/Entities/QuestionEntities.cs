using CMS.Domain.Common;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Domain.Entities;

/// <summary>
/// Question entity - core content of the platform.
/// Supports MCQ currently, extensible to other types.
/// </summary>
public class Question : AuditableEntity
{
    public QuestionType Type { get; private set; }
    public Guid SubjectId { get; private set; }
    public Guid? LectureId { get; private set; }
    public Guid? ExamId { get; private set; }

    // Content
    public string Text { get; private set; } = string.Empty;
    public string? TextHtml { get; private set; }
    public string CorrectAnswer { get; private set; } = string.Empty;
    public string Explanation { get; private set; } = string.Empty;
    public string? ExplanationHtml { get; private set; }

    // Metadata
    public List<string> Tags { get; private set; } = new();
    public Difficulty Difficulty { get; private set; }
    public int? Year { get; private set; }
    public string? Reference { get; private set; }
    /// <summary>
    /// Push 2 / Track 1: institutional paragraph tag (وسم الفقرة) — locates the question inside
    /// the official curriculum document (e.g. "الفصل الأول"). Nullable: legacy rows stay valid.
    /// </summary>
    public string? ParagraphTag { get; private set; }

    // Denormalized stats
    public int ViewsCount { get; private set; }
    public int AttemptsCount { get; private set; }
    public int CorrectAttempts { get; private set; }
    public int ReportsCount { get; private set; }

    // Status
    public ContentStatus Status { get; private set; }

    // Navigation
    public Subject Subject { get; private set; } = null!;
    public Lecture? Lecture { get; private set; }
    // Legacy one-to-many association retained while existing data is migrated to ExamQuestion.
    public Exam? Exam { get; private set; }
    public ICollection<ExamQuestion> ExamQuestions { get; private set; } = new List<ExamQuestion>();
    public List<QuestionOption> Options { get; private set; } = new();
    public ICollection<QuestionImage> Images { get; private set; } = new List<QuestionImage>();

    // Factory method
    public static Question Create(
        string text,
        QuestionType type,
        Guid subjectId,
        Guid? lectureId,
        Difficulty difficulty,
        List<string>? tags,
        Guid createdBy)
    {
        if (string.IsNullOrWhiteSpace(text))
            throw new DomainException("Question text is required");

        return new Question
        {
            Text = text,
            Type = type,
            SubjectId = subjectId,
            LectureId = lectureId,
            Difficulty = difficulty,
            Tags = tags ?? new List<string>(),
            Status = ContentStatus.Draft,
            CreatedBy = createdBy
        };
    }

    public void AddOption(string text, bool isCorrect, string letter = "")
    {
        var option = QuestionOption.Create(Id, text, isCorrect, letter, Options.Count);
        Options.Add(option);

        if (isCorrect)
        {
            CorrectAnswer = option.Id.ToString();
        }
    }

    public void SetCorrectAnswer(string answer)
    {
        if (string.IsNullOrWhiteSpace(answer))
            throw new DomainException("A model answer is required");
        CorrectAnswer = answer.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateExplanation(string explanation)
    {
        if (string.IsNullOrWhiteSpace(explanation))
            throw new DomainException("Explanation is required");
        Explanation = explanation;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetReference(string? reference)
    {
        if (string.IsNullOrWhiteSpace(reference)) { Reference = null; }
        else { Reference = reference.Trim(); }
        UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>Push 2 / Track 1: sets or clears the curriculum paragraph tag (max 200 chars).</summary>
    public void SetParagraphTag(string? paragraphTag)
    {
        if (string.IsNullOrWhiteSpace(paragraphTag)) { ParagraphTag = null; }
        else { ParagraphTag = paragraphTag.Trim().Length > 200 ? paragraphTag.Trim()[..200] : paragraphTag.Trim(); }
        UpdatedAt = DateTime.UtcNow;
    }

    public void Publish()
    {
        if (Type == QuestionType.Essay)
        {
            if (string.IsNullOrWhiteSpace(CorrectAnswer))
                throw new BusinessRuleViolationException("Cannot publish essay question without a model answer");
        }
        else
        {
            if (!Options.Any(o => o.IsCorrect))
                throw new BusinessRuleViolationException("Cannot publish question without a correct answer");
            if (Options.Count < 2)
                throw new BusinessRuleViolationException("Question must have at least 2 options");
        }

        if (string.IsNullOrWhiteSpace(Explanation))
            throw new BusinessRuleViolationException("Cannot publish question without explanation");

        Status = ContentStatus.Published;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Archive()
    {
        Status = ContentStatus.Archived;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SoftDelete(Guid deletedBy)
    {
        Status = ContentStatus.Deleted;
        DeletedAt = DateTime.UtcNow;
        DeletedBy = deletedBy;
    }

    public void RecordAttempt(bool isCorrect)
    {
        AttemptsCount++;
        if (isCorrect)
            CorrectAttempts++;
        UpdatedAt = DateTime.UtcNow;
    }

    public void IncrementViews()
    {
        ViewsCount++;
    }

    public void IncrementReports()
    {
        ReportsCount++;
    }

    public double GetCorrectRate()
    {
        return AttemptsCount == 0 ? 0 : (double)CorrectAttempts / AttemptsCount * 100;
    }
}

/// <summary>
/// Question option (answer choice).
/// </summary>
public class QuestionOption : BaseEntity
{
    public Guid QuestionId { get; private set; }
    public string OptionLetter { get; private set; } = string.Empty;
    public string Text { get; private set; } = string.Empty;
    public string? TextHtml { get; private set; }
    public string? ImageUrl { get; private set; }
    public bool IsCorrect { get; private set; }
    public int SortOrder { get; private set; }

    // Navigation
    public Question Question { get; private set; } = null!;

    public static QuestionOption Create(Guid questionId, string text, bool isCorrect, string letter, int sortOrder)
    {
        if (string.IsNullOrWhiteSpace(text))
            throw new DomainException("Option text is required");

        return new QuestionOption
        {
            QuestionId = questionId,
            Text = text,
            IsCorrect = isCorrect,
            OptionLetter = string.IsNullOrEmpty(letter) ? ((char)('A' + sortOrder)).ToString() : letter,
            SortOrder = sortOrder
        };
    }
}

/// <summary>
/// Question image (attached to question text or explanation).
/// </summary>
public class QuestionImage : BaseEntity
{
    public Guid QuestionId { get; private set; }
    public string ImageUrl { get; private set; } = string.Empty;
    public string? AltText { get; private set; }
    public string? Caption { get; private set; }
    public int SortOrder { get; private set; }

    public Question Question { get; private set; } = null!;

    public static QuestionImage Create(Guid questionId, string imageUrl, string? altText = null, int sortOrder = 0)
    {
        return new QuestionImage
        {
            QuestionId = questionId,
            ImageUrl = imageUrl,
            AltText = altText,
            SortOrder = sortOrder
        };
    }
}

/// <summary>
/// Exam entity (collection of questions for a specific year/diet).
/// </summary>
public class Exam : AuditableEntity
{
    public Guid SubjectId { get; private set; }
    public Guid? LectureId { get; private set; }
    public string TitleAr { get; private set; } = string.Empty;
    public string? TitleEn { get; private set; }
    public string Slug { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public ExamType ExamType { get; private set; }
    public int Year { get; private set; }
    public int DurationMinutes { get; private set; } = 60;
    public int TotalQuestions { get; private set; }
    public decimal PassingScore { get; private set; } = 60.0m;
    public int SortOrder { get; private set; }
    public DateTime? AvailableFrom { get; private set; }
    public DateTime? AvailableUntil { get; private set; }
    public int? MaxAttempts { get; private set; }
    public bool ShuffleQuestions { get; private set; } = true;
    public bool ShuffleOptions { get; private set; } = true;
    public bool ShowResultsImmediately { get; private set; } = true;
    public bool AllowReview { get; private set; } = true;
    public bool ShowCorrectAnswers { get; private set; } = true;
    public bool ShowExplanations { get; private set; } = true;
    public ContentStatus Status { get; private set; }

    // Navigation
    public Subject Subject { get; private set; } = null!;
    public Lecture? Lecture { get; private set; }
    // Legacy relationship: retained only so deployed historical records remain readable.
    public ICollection<Question> Questions { get; private set; } = new List<Question>();
    public ICollection<ExamQuestion> ExamQuestions { get; private set; } = new List<ExamQuestion>();
    public ICollection<ExamSession> Sessions { get; private set; } = new List<ExamSession>();

    public static Exam Create(
        Guid subjectId,
        string titleAr,
        string slug,
        int year,
        Guid createdBy,
        ExamType examType = ExamType.Final)
    {
        if (subjectId == Guid.Empty)
            throw new DomainException("Exam subject is required");
        if (string.IsNullOrWhiteSpace(titleAr))
            throw new DomainException("Exam title is required");
        if (string.IsNullOrWhiteSpace(slug))
            throw new DomainException("Exam slug is required");
        if (year < 1)
            throw new DomainException("Exam year must be greater than zero");

        return new Exam
        {
            SubjectId = subjectId,
            TitleAr = titleAr.Trim(),
            Slug = slug.Trim(),
            Year = year,
            ExamType = examType,
            Status = ContentStatus.Draft,
            CreatedBy = createdBy
        };
    }

    public void Configure(
        string titleAr,
        string? titleEn,
        string? description,
        ExamType examType,
        int year,
        Guid? lectureId,
        int durationMinutes,
        decimal passingScore,
        int sortOrder,
        DateTime? availableFrom,
        DateTime? availableUntil,
        int? maxAttempts,
        bool shuffleQuestions,
        bool shuffleOptions,
        bool showResultsImmediately,
        bool allowReview,
        bool showCorrectAnswers,
        bool showExplanations)
    {
        if (string.IsNullOrWhiteSpace(titleAr))
            throw new DomainException("Exam title is required");
        if (year < 1)
            throw new DomainException("Exam year must be greater than zero");
        if (durationMinutes < 1)
            throw new DomainException("Exam duration must be greater than zero");
        if (passingScore is < 0 or > 100)
            throw new DomainException("Passing score must be between 0 and 100");
        if (sortOrder < 0)
            throw new DomainException("Exam sort order cannot be negative");
        if (maxAttempts is < 1)
            throw new DomainException("Maximum attempts must be greater than zero when set");
        if (availableFrom.HasValue && availableUntil.HasValue && availableUntil <= availableFrom)
            throw new DomainException("Exam availability end must be after its start");

        TitleAr = titleAr.Trim();
        TitleEn = string.IsNullOrWhiteSpace(titleEn) ? null : titleEn.Trim();
        Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        ExamType = examType;
        Year = year;
        LectureId = lectureId;
        DurationMinutes = durationMinutes;
        PassingScore = passingScore;
        SortOrder = sortOrder;
        AvailableFrom = availableFrom;
        AvailableUntil = availableUntil;
        MaxAttempts = maxAttempts;
        ShuffleQuestions = shuffleQuestions;
        ShuffleOptions = shuffleOptions;
        ShowResultsImmediately = showResultsImmediately;
        AllowReview = allowReview;
        ShowCorrectAnswers = allowReview && showCorrectAnswers;
        ShowExplanations = allowReview && showExplanations;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SetQuestionCount(int totalQuestions)
    {
        if (totalQuestions < 0)
            throw new DomainException("Exam question count cannot be negative");

        TotalQuestions = totalQuestions;
        UpdatedAt = DateTime.UtcNow;
    }

    public bool IsAvailableAt(DateTime now) =>
        (!AvailableFrom.HasValue || now >= AvailableFrom.Value)
        && (!AvailableUntil.HasValue || now <= AvailableUntil.Value);

    public void Publish()
    {
        Status = ContentStatus.Published;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Update(string titleAr, string? titleEn, string? description, int durationMinutes, decimal passingScore, bool allowReview)
    {
        Configure(
            titleAr, titleEn, description, ExamType, Year, LectureId, durationMinutes,
            passingScore, SortOrder, AvailableFrom, AvailableUntil, MaxAttempts,
            ShuffleQuestions, ShuffleOptions, ShowResultsImmediately, allowReview,
            ShowCorrectAnswers, ShowExplanations);
    }

    public void Archive()
    {
        Status = ContentStatus.Archived;
        UpdatedAt = DateTime.UtcNow;
    }

    public void SoftDelete(Guid deletedBy)
    {
        Status = ContentStatus.Deleted;
        DeletedAt = DateTime.UtcNow;
        DeletedBy = deletedBy;
        UpdatedAt = DateTime.UtcNow;
    }
}
