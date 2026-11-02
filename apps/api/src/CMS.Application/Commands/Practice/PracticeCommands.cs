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
    DateTime? AnsweredAt
) : IRequest<SubmitPracticeAnswerResultDto>;

/// <summary>Removes the saved answer for one question (back to unanswered).</summary>
public record ResetPracticeQuestionCommand(Guid StudentId, Guid SessionId, Guid QuestionId) : IRequest<Unit>;

/// <summary>Wipes every answer in the session; the session stays InProgress with Score reset.</summary>
public record ResetPracticeSessionCommand(Guid StudentId, Guid SessionId) : IRequest<Unit>;

public record GetPracticeProgressQuery(Guid StudentId, Guid SessionId) : IRequest<PracticeProgressDto>;
