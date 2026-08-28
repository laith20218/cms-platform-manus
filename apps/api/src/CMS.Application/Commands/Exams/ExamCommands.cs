using CMS.Application.DTOs.Exams;
using MediatR;

namespace CMS.Application.Commands.Exams;

// ===== Student discovery and lifecycle =====
public record GetExamsBySubjectQuery(Guid SubjectId, Guid StudentId) : IRequest<List<ExamListItemDto>>;
public record GetExamByIdQuery(Guid Id, Guid StudentId) : IRequest<ExamDto>;
public record GetExamSessionQuery(Guid SessionId, Guid StudentId) : IRequest<ExamSessionDto>;
public record StartExamSessionCommand(Guid ExamId, Guid StudentId, string? IdempotencyKey) : IRequest<ExamSessionDto>;
public record SaveExamAnswerCommand(Guid SessionId, Guid StudentId, Guid SessionQuestionId, string? Answer, int? CurrentQuestionOrder, bool ClearAnswer) : IRequest<SaveExamAnswerResultDto>;
public record SubmitExamCommand(Guid SessionId, Guid StudentId, List<ExamAnswerDto>? LegacyAnswers = null) : IRequest<ExamResultDto>;
public record CancelExamSessionCommand(Guid SessionId, Guid StudentId) : IRequest<Unit>;
public record GetExamResultQuery(Guid SessionId, Guid StudentId) : IRequest<ExamResultDto>;
public record GetExamReviewQuery(Guid SessionId, Guid StudentId) : IRequest<ExamReviewDto>;

// ===== Admin management =====
public record ExamConfigurationInput(
    Guid SubjectId,
    Guid? LectureId,
    string TitleAr,
    string? TitleEn,
    string Slug,
    string? Description,
    string ExamType,
    int Year,
    int DurationMinutes,
    decimal PassingScore,
    int SortOrder,
    DateTime? AvailableFrom,
    DateTime? AvailableUntil,
    int? MaxAttempts,
    bool ShuffleQuestions,
    bool ShuffleOptions,
    bool ShowResultsImmediately,
    bool AllowReview,
    bool ShowCorrectAnswers,
    bool ShowExplanations
);

public record GetAdminExamsQuery(Guid AdminId, Guid? SubjectId, string? Status, string? Search, int Page, int PageSize) : IRequest<PagedExamResultDto<AdminExamListItemDto>>;
public record GetAdminExamByIdQuery(Guid Id, Guid AdminId) : IRequest<AdminExamDetailsDto>;
public record GetExamQuestionCandidatesQuery(Guid SubjectId, Guid? LectureId, string? Search, int Page, int PageSize) : IRequest<PagedExamResultDto<ExamQuestionCandidateDto>>;
public record GetAdminExamResultsQuery(Guid ExamId, Guid AdminId, string? Status, int Page, int PageSize) : IRequest<PagedExamResultDto<AdminExamResultDto>>;

public record CreateExamCommand(ExamConfigurationInput Configuration, Guid CreatedBy) : IRequest<ExamDto>;
public record UpdateExamCommand(Guid Id, ExamConfigurationInput Configuration, Guid UpdatedBy) : IRequest<ExamDto>;
public record ReplaceExamQuestionsCommand(Guid ExamId, IReadOnlyList<Guid> QuestionIds, Guid UpdatedBy) : IRequest<AdminExamDetailsDto>;
public record PublishExamCommand(Guid Id, Guid PublishedBy) : IRequest<Unit>;
public record ArchiveExamCommand(Guid Id, Guid ArchivedBy) : IRequest<Unit>;
public record DeleteExamCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;
