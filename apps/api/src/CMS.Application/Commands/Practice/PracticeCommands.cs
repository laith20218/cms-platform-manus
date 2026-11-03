using MediatR;
using CMS.Application.DTOs.Practice;

namespace CMS.Application.Commands.Practice;

// ===== W14.2 B.3 (D13) — DB-backed practice tracking =====

/// <summary>Idempotent get-or-create: returns the existing InProgress session for (student, model exam).</summary>
public record StartPracticeSessionCommand(Guid StudentId, Guid ExamModelId) : IRequest<StartPracticeSessionResultDto>;

/// <summary>Upsert one answer; graded against the bank (essay → NULL = ungraded). Auto-completes the session when every question carries a graded answer.</summary>
public record SubmitPracticeAnswerCommand(
    Guid StudentId,
    Guid SessionId,
    Guid QuestionId,
    string SelectedAnswer,
    int? DurationSeconds,
    DateTime? AnsweredAt,
    // W14.4 (A.4) — categorized lens. When present, membership is validated against
    // the (lecture, paragraphTag) filter instead of the anchor exam's composition and
    // all totals/progress/auto-complete math is scoped to the filtered question set.
    PracticeCategoryFilter? Filter = null
) : IRequest<SubmitPracticeAnswerResultDto>;

/// <summary>Removes the saved answer for one question (back to unanswered).</summary>
public record ResetPracticeQuestionCommand(Guid StudentId, Guid SessionId, Guid QuestionId) : IRequest<Unit>;

/// <summary>Wipes every answer in the session; the session stays InProgress with Score reset.</summary>
public record ResetPracticeSessionCommand(Guid StudentId, Guid SessionId) : IRequest<Unit>;

public record GetPracticeProgressQuery(
    Guid StudentId,
    Guid SessionId,
    // W14.4 (A.4) — optional categorized lens for filter-scoped totals (see SubmitPracticeAnswerCommand).
    PracticeCategoryFilter? Filter = null
) : IRequest<PracticeProgressDto>;

// ===== W14.4 (A.4) — categorized practice =====

/// <summary>
/// The (lecture, paragraphTag) lens of the categorized practice tree. NULL LectureId +
/// UntaggedLecture=false means "no lecture constraint"; UntaggedLecture=true restricts to
/// questions with NO lecture (the "غير مصنف" bucket). ParagraphTag behaves the same way.
/// </summary>
public record PracticeCategoryFilter(
    Guid? LectureId = null,
    bool UntaggedLecture = false,
    string? ParagraphTag = null,
    bool UntaggedTag = false);

/// <summary>Tree of the subject's practice-eligible questions grouped Lecture → ParagraphTag.</summary>
public record GetCategorizedPracticeTreeQuery(Guid StudentId, Guid SubjectId) : IRequest<CategorizedPracticeTreeDto>;

/// <summary>
/// Starts (or resumes) a practice session over the filtered question set. The session is
/// anchored to the subject's published exam whose composition best covers the filter —
/// the anchor is a persistence/ownership key (PracticeSession.ExamModelId is NOT nullable,
/// W14.1 schema), NOT the question-set authority; the filter is.
/// </summary>
public record StartCategorizedPracticeCommand(
    Guid StudentId,
    Guid SubjectId,
    Guid? LectureId,
    bool UntaggedLecture,
    string? ParagraphTag,
    bool UntaggedTag) : IRequest<StartCategorizedPracticeResultDto>;
