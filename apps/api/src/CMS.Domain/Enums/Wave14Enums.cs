namespace CMS.Domain.Enums;

/// <summary>
/// Wave 14.1 (D1) — kind of exam-course bundle ("الدورات الامتحانية").
/// Stored as a plain int column (repo convention — no HasConversion anywhere).
/// </summary>
public enum ExamCourseType
{
    /// <summary>دورة أولى — first-diet exam bundle.</summary>
    First = 0,

    /// <summary>دورة ثانية — second-diet (retake) exam bundle.</summary>
    Second = 1,

    /// <summary>دورة تكميلية / تصحيح.</summary>
    Supplementary = 2,

    /// <summary>دورة امتحانات نموذجية — model papers (pairs with Exam.ModelLetter A/B/C, D7).</summary>
    Model = 3,

    /// <summary>دورة تدريبية — practice drills (pairs with QuestionUsage.Practice, D3).</summary>
    Practice = 4
}

/// <summary>
/// Wave 14.1 (D3) — where a question may be used. Deliberately separated from
/// QuestionType (MCQ/TF/Essay): the shape of a question and the places it may
/// appear are independent axes. Default Both so every legacy row reads as
/// usable everywhere (zero behavior change after the W14.1 backfill).
/// </summary>
public enum QuestionUsage
{
    /// <summary>Practice drills only.</summary>
    Practice = 0,

    /// <summary>Official exams only.</summary>
    Exam = 1,

    /// <summary>Default — usable in practice AND exams (legacy rows backfilled here).</summary>
    Both = 2
}

/// <summary>
/// Wave 14.1 (D13) — lifecycle of one student practice run over one model exam.
/// DB tracking (PracticeSession) replaces the client-only reset story; answers
/// stream in via PracticeAnswer while the client stays offline-first
/// (LocalStorage + 30s periodic sync, D8).
/// </summary>
public enum PracticeSessionStatus
{
    /// <summary>Opened, answers still being saved/synced.</summary>
    InProgress = 0,

    /// <summary>Finished — score computed and frozen (Score set).</summary>
    Completed = 1
}

/// <summary>
/// Wave 14.1 (D12) — classification of an ErrorReport so question reports can be
/// triaged separately from legacy free-form reports. Default Other so every
/// legacy row keeps its meaning after the W14.1 column backfill.
/// Reuses the existing ErrorReport table on purpose (D12) — no new report table.
/// </summary>
public enum ReportType
{
    /// <summary>Spelling / wording mistake in the question text.</summary>
    Typo = 0,

    /// <summary>The marked correct answer is wrong.</summary>
    WrongAnswer = 1,

    /// <summary>Attached image is unreadable / wrong / missing.</summary>
    BadImage = 2,

    /// <summary>Anything else — default for legacy rows.</summary>
    Other = 3
}
