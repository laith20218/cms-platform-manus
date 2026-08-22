using MediatR;
using CMS.Application.DTOs.Exams;

namespace CMS.Application.Commands.Exams;

// ===== Queries =====
public record GetExamsBySubjectQuery(Guid SubjectId, Guid? StudentId) : IRequest<List<ExamListItemDto>>;
public record GetExamByIdQuery(Guid Id, Guid StudentId) : IRequest<ExamDto>;

// ===== Start Session =====
public record StartExamSessionCommand(
    Guid ExamId, Guid StudentId, string Mode
) : IRequest<ExamSessionDto>;

// ===== Submit Exam =====
public record SubmitExamCommand(
    Guid SessionId, Guid StudentId, List<ExamAnswerDto> Answers
) : IRequest<ExamResultDto>;

// ===== Get Results =====
public record GetExamResultQuery(Guid SessionId, Guid StudentId) : IRequest<ExamResultDto>;

// ===== Review =====
public record GetExamReviewQuery(Guid SessionId, Guid StudentId) : IRequest<ExamReviewDto>;

// ===== Admin: Create/Update Exam =====
public record CreateExamCommand(
    Guid SubjectId, string TitleAr, string? TitleEn, string Slug,
    int Year, int DurationMinutes, decimal PassingScore,
    Guid CreatedBy
) : IRequest<ExamDto>;

public record PublishExamCommand(Guid Id) : IRequest<Unit>;
public record UpdateExamCommand(Guid Id, string TitleAr, string? TitleEn, string? Description, int DurationMinutes, decimal PassingScore, bool AllowReview) : IRequest<ExamDto>;
public record ArchiveExamCommand(Guid Id) : IRequest<Unit>;
public record DeleteExamCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;
