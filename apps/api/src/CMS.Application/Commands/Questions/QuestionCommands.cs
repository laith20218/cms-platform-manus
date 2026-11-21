using MediatR;
using CMS.Application.DTOs.Questions;

namespace CMS.Application.Commands.Questions;

// ===== Queries (Read) =====
public record GetQuestionsQuery(
    Guid? SubjectId,
    Guid? LectureId,
    Guid? ExamId,
    Guid? StudentId,
    string? Difficulty,
    string? Search,
    int Page = 1,
    int PageSize = 20,
    string Sort = "createdAt",
    string Order = "desc",
    // W14.2 E.1 (D3): optional usage filter (practice|exam|both).
    string? Usage = null
) : IRequest<PagedResult<QuestionListItemDto>>;

public record GetQuestionByIdQuery(Guid Id, Guid? StudentId) : IRequest<QuestionDto>;
public record GetQuestionsByLectureQuery(Guid LectureId, Guid? StudentId) : IRequest<List<QuestionListItemDto>>;

// ===== Wave 16.2 (C3-1) — random bank draw =====
/// <summary>
/// Random-N question draw for the bank/training engine. The base pool is the subject's
/// practice-eligible bank (published, not deleted, usable in practice); every parameter
/// after Count is an optional narrowing. The draw is uniform and duplicate-free — ids
/// are distinct by construction, so a question can never be drawn twice.
/// </summary>
public record GetRandomQuestionsQuery(
    Guid StudentId,
    Guid SubjectId,
    int Count,
    List<Guid>? LectureIds = null,
    List<string>? ParagraphTags = null,
    Guid? SemesterCourseId = null
) : IRequest<List<QuestionPreviewDto>>;

// ===== Commands (Write) =====
public record CreateQuestionCommand(
    string Text, string Type, Guid SubjectId, Guid? LectureId,
    string Difficulty, List<string> Tags,
    List<CreateOptionDto> Options, string CorrectOptionId, string? CorrectAnswer,
    string Explanation, string? Reference, int? Year,
    Guid CreatedBy,
    // Push 2 / Track 1: curriculum paragraph tag; Track 2: acting session for the activity log.
    string? ParagraphTag = null,
    Guid? SessionId = null,
    // Wave 16.2 (C3-3): optional exam-course ("دورة") anchor — existence-checked by the handler.
    Guid? SemesterCourseId = null,
    // W20.5 — Matching (وصل) payload (required for type=Matching).
    MatchingPayloadDto? Matching = null
) : IRequest<QuestionDto>;

public record UpdateQuestionCommand(
    Guid Id, string Text, string Difficulty,
    List<string> Tags, string Explanation, string? Reference,
    List<UpdateOptionDto> Options, string? CorrectAnswer,
    // Push 2 / Track 1: year + paragraph tag become editable after creation.
    int? Year = null,
    string? ParagraphTag = null,
    // Wave 16.2 (C3-3): optional exam-course ("دورة") anchor — set when provided
    // (mirrors the Year/ParagraphTag update semantics), existence-checked by the handler.
    Guid? SemesterCourseId = null,
    // W20.5 — Matching (وصل) payload; replaces the stored payload when provided.
    MatchingPayloadDto? Matching = null
) : IRequest<QuestionDto>;

public record DeleteQuestionCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;
public record PublishQuestionCommand(Guid Id) : IRequest<Unit>;
public record ArchiveQuestionCommand(Guid Id) : IRequest<Unit>;

// ===== Answer =====
public record AnswerQuestionCommand(
    Guid QuestionId, Guid StudentId,
    string? SelectedOptionId, string? AnswerText, int DurationSeconds, bool IsOffline
) : IRequest<AnswerResultDto>;

// ===== Report =====
public record ReportQuestionCommand(
    Guid QuestionId, Guid StudentId,
    string ReasonType, string Description, string? ScreenshotUrl,
    // W14.2 B.4 (D12): optional triage classification, default Other.
    string? ReportType = null
) : IRequest<Unit>;

// ===== Import =====
public record ImportQuestionsCommand(
    Guid SubjectId, Guid? LectureId,
    List<ImportQuestionRow> Questions,
    Guid CreatedBy
) : IRequest<ImportResultDto>;

// ===== Paged Result =====
public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);

// ===== W14.2 C.1 — editor completion endpoints =====
public record BulkQuestionActionDto(List<Guid> Ids);
