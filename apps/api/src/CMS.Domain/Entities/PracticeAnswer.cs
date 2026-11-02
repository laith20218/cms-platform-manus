using CMS.Domain.Common;

namespace CMS.Domain.Entities;

/// <summary>
/// Wave 14.1 (D13) — one saved answer inside a practice session.
/// SelectedAnswer stays a free string for now (option id today; free text for
/// essay practice later). IsCorrect is nullable: NULL = not graded yet (essay /
/// sync arrived before grading). Question FK is RESTRICT — deleting a question
/// must not silently erase a student's practice history (D2 spirit).
/// </summary>
public class PracticeAnswer : BaseEntity
{
    /// <summary>EF materialization constructor.</summary>
    public PracticeAnswer() { }

    public Guid PracticeSessionId { get; set; }

    public Guid QuestionId { get; set; }

    public string? SelectedAnswer { get; set; }

    public bool? IsCorrect { get; set; }

    public DateTime AnsweredAt { get; set; } = DateTime.UtcNow;

    public PracticeSession PracticeSession { get; set; } = null!;

    public Question Question { get; set; } = null!;
}
