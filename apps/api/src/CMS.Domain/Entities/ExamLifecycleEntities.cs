using CMS.Domain.Common;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Domain.Entities;

/// <summary>
/// The ordered, reusable composition of an exam. This is the authoritative relationship
/// for current exam content; Question.ExamId remains only for legacy compatibility.
/// </summary>
public class ExamQuestion : BaseEntity
{
    public Guid ExamId { get; set; }
    public Guid QuestionId { get; set; }
    public int SortOrder { get; private set; }

    public Exam Exam { get; set; } = null!;
    public Question Question { get; set; } = null!;

    public static ExamQuestion Create(Guid examId, Guid questionId, int sortOrder)
    {
        if (sortOrder < 0)
            throw new DomainException("Exam question sort order cannot be negative");

        return new ExamQuestion
        {
            ExamId = examId,
            QuestionId = questionId,
            SortOrder = sortOrder
        };
    }

    public void MoveTo(int sortOrder)
    {
        if (sortOrder < 0)
            throw new DomainException("Exam question sort order cannot be negative");

        SortOrder = sortOrder;
        UpdatedAt = DateTime.UtcNow;
    }
}

/// <summary>
/// Immutable rendering and scoring snapshot for one question in a student's exam session.
/// JSON fields contain serialised option, tag, and image snapshots, never a live bank lookup.
/// </summary>
public class ExamSessionQuestion : BaseEntity
{
    public Guid ExamSessionId { get; set; }
    public Guid? SourceQuestionId { get; set; }
    public int SortOrder { get; set; }
    public QuestionType QuestionType { get; set; }
    public string QuestionText { get; set; } = string.Empty;
    public string? QuestionTextHtml { get; set; }
    public string OptionsJson { get; set; } = "[]";
    public string CorrectAnswer { get; set; } = string.Empty;
    public string Explanation { get; set; } = string.Empty;
    public string? ExplanationHtml { get; set; }
    public string? Reference { get; set; }
    public string TagsJson { get; set; } = "[]";
    public string ImagesJson { get; set; } = "[]";

    public ExamSession ExamSession { get; set; } = null!;
}
