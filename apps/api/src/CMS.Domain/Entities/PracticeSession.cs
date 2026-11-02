using CMS.Domain.Common;
using CMS.Domain.Enums;

namespace CMS.Domain.Entities;

/// <summary>
/// Wave 14.1 (D13) — one student practice run over one model exam
/// (ExamModelId → exams; model letters A/B/C live on Exam.ModelLetter, D7).
///
/// DB-backed so resets/retakes are trackable per student. Answers stream in via
/// PracticeAnswer; the client stays offline-first (LocalStorage + 30s sync, D8)
/// and this row is the eventual source of truth for practice history. Exam
/// RESULTS keep using ExamSessionQuestion snapshots (D2) — this entity is for
/// PRACTICE tracking only.
///
/// ExamModelId FK is RESTRICT: a model exam with practice history must not be
/// hard-deleted out from under a student's record.
/// </summary>
public class PracticeSession : BaseEntity
{
    /// <summary>EF materialization constructor.</summary>
    public PracticeSession() { }

    public Guid StudentId { get; set; }

    public Guid ExamModelId { get; set; }

    public DateTime StartedAt { get; set; } = DateTime.UtcNow;

    public DateTime LastAccessedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Final percentage score — frozen when Status flips to Completed. NULL while in progress.</summary>
    public decimal? Score { get; set; }

    public PracticeSessionStatus Status { get; set; } = PracticeSessionStatus.InProgress;

    public Student Student { get; set; } = null!;

    public Exam ExamModel { get; set; } = null!;

    public ICollection<PracticeAnswer> Answers { get; set; } = new List<PracticeAnswer>();
}
