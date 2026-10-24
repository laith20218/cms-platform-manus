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
    string Order = "desc"
) : IRequest<PagedResult<QuestionListItemDto>>;

public record GetQuestionByIdQuery(Guid Id, Guid? StudentId) : IRequest<QuestionDto>;
public record GetQuestionsByLectureQuery(Guid LectureId, Guid? StudentId) : IRequest<List<QuestionListItemDto>>;

// ===== Commands (Write) =====
public record CreateQuestionCommand(
    string Text, string Type, Guid SubjectId, Guid? LectureId,
    string Difficulty, List<string> Tags,
    List<CreateOptionDto> Options, string CorrectOptionId, string? CorrectAnswer,
    string Explanation, string? Reference, int? Year,
    Guid CreatedBy,
    // Push 2 / Track 1: curriculum paragraph tag; Track 2: acting session for the activity log.
    string? ParagraphTag = null,
    Guid? SessionId = null
) : IRequest<QuestionDto>;

public record UpdateQuestionCommand(
    Guid Id, string Text, string Difficulty,
    List<string> Tags, string Explanation, string? Reference,
    List<UpdateOptionDto> Options, string? CorrectAnswer,
    // Push 2 / Track 1: year + paragraph tag become editable after creation.
    int? Year = null,
    string? ParagraphTag = null
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
    string ReasonType, string Description, string? ScreenshotUrl
) : IRequest<Unit>;

// ===== Import =====
public record ImportQuestionsCommand(
    Guid SubjectId, Guid? LectureId,
    List<ImportQuestionRow> Questions,
    Guid CreatedBy
) : IRequest<ImportResultDto>;

// ===== Paged Result =====
public record PagedResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);
