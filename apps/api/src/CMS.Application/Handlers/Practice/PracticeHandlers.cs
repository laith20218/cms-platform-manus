using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Practice;
using CMS.Application.DTOs.Practice;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Practice;

/// <summary>
/// W14.2 B.3 (D13) — DB-backed practice tracking. The client stays offline-first
/// (LocalStorage + 30s sync, D8); these handlers are the eventual source of truth.
/// Grading mirrors the question flow (AnswerQuestionCommand): MCQ/TF compare the
/// single correct option, MultipleSelect compares the full selected set, Essay is
/// left ungraded (IsCorrect = NULL). Sessions auto-complete when every question in
/// the model exam carries a graded answer — D13's "Score frozen on Completed".
/// </summary>
public sealed class PracticeHandlers :
    IRequestHandler<StartPracticeSessionCommand, StartPracticeSessionResultDto>,
    IRequestHandler<SubmitPracticeAnswerCommand, SubmitPracticeAnswerResultDto>,
    IRequestHandler<ResetPracticeQuestionCommand, Unit>,
    IRequestHandler<ResetPracticeSessionCommand, Unit>,
    IRequestHandler<GetPracticeProgressQuery, PracticeProgressDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IEntitlementService _entitlements;

    public PracticeHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork, IEntitlementService entitlements)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _entitlements = entitlements;
    }

    public async Task<StartPracticeSessionResultDto> Handle(StartPracticeSessionCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == req.ExamModelId && item.Status == ContentStatus.Published && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.ExamModelId);
        if (!await _entitlements.CanAccessSubjectContentAsync(req.StudentId, exam.SubjectId, SubscriptionContentScope.QuestionsExams, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        // Idempotent get-or-create (mirrors StartExamSession semantics): a second
        // start request for the same open session returns it instead of duplicating.
        var existing = await _db.PracticeSessions
            .FirstOrDefaultAsync(session => session.StudentId == req.StudentId
                && session.ExamModelId == req.ExamModelId
                && session.Status == PracticeSessionStatus.InProgress, ct);
        if (existing is not null)
        {
            existing.LastAccessedAt = DateTime.UtcNow;
            await _unitOfWork.SaveChangesAsync(ct);
            return MapStarted(existing, Created: false);
        }

        var session = new PracticeSession
        {
            StudentId = req.StudentId,
            ExamModelId = req.ExamModelId,
            StartedAt = DateTime.UtcNow,
            LastAccessedAt = DateTime.UtcNow,
            Status = PracticeSessionStatus.InProgress
        };
        await _db.PracticeSessions.AddAsync(session, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return MapStarted(session, Created: true);
    }

    public async Task<SubmitPracticeAnswerResultDto> Handle(SubmitPracticeAnswerCommand req, CancellationToken ct)
    {
        var session = await LoadOwnedSessionAsync(req.SessionId, req.StudentId, ct);
        if (session.Status != PracticeSessionStatus.InProgress)
            throw new ConflictException("انتهت جلسة التدريب هذه بالفعل — ابدأ جلسة جديدة");

        var exam = await _db.Exams.AsNoTracking()
            .Include(item => item.ExamQuestions)
            .FirstOrDefaultAsync(item => item.Id == session.ExamModelId, ct)
            ?? throw new NotFoundException("Exam", session.ExamModelId);
        var compositionIds = exam.ExamQuestions.Select(item => item.QuestionId).ToHashSet();
        if (!compositionIds.Contains(req.QuestionId))
            throw new BusinessRuleViolationException("السؤال لا ينتمي إلى نموذج التدريب هذا");

        var question = await _db.Questions.AsNoTracking()
            .Include(item => item.Options)
            .FirstOrDefaultAsync(item => item.Id == req.QuestionId, ct)
            ?? throw new NotFoundException("Question", req.QuestionId);

        var submitted = (req.SelectedAnswer ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(submitted))
            throw new DomainException("الإجابة مطلوبة");

        bool? isCorrect = question.Type switch
        {
            QuestionType.Essay => null, // D13: NULL = ungraded
            QuestionType.MultipleSelect => GradeMultipleSelect(question, submitted),
            _ => GradeSingleChoice(question, submitted)
        };

        var answer = await _db.PracticeAnswers
            .FirstOrDefaultAsync(item => item.PracticeSessionId == session.Id && item.QuestionId == req.QuestionId, ct);
        if (answer is null)
        {
            answer = new PracticeAnswer
            {
                PracticeSessionId = session.Id,
                QuestionId = req.QuestionId,
                SelectedAnswer = submitted,
                IsCorrect = isCorrect,
                AnsweredAt = req.AnsweredAt is { } answeredAt && answeredAt <= DateTime.UtcNow ? answeredAt : DateTime.UtcNow
            };
            await _db.PracticeAnswers.AddAsync(answer, ct);
        }
        else
        {
            answer.SelectedAnswer = submitted;
            answer.IsCorrect = isCorrect;
            answer.AnsweredAt = req.AnsweredAt is { } answeredAt && answeredAt <= DateTime.UtcNow ? answeredAt : DateTime.UtcNow;
        }
        session.LastAccessedAt = DateTime.UtcNow;

        var totalQuestions = compositionIds.Count;
        decimal? score = null;
        if (totalQuestions > 0 && await AllGradedAsync(session.Id, totalQuestions, ct))
        {
            var correct = await _db.PracticeAnswers.CountAsync(item => item.PracticeSessionId == session.Id && item.IsCorrect == true, ct);
            score = Math.Round((decimal)correct / totalQuestions * 100, 2);
            session.Score = score;
            session.Status = PracticeSessionStatus.Completed;
        }

        await _unitOfWork.SaveChangesAsync(ct);

        var answeredCount = await _db.PracticeAnswers.CountAsync(item => item.PracticeSessionId == session.Id, ct);
        return new SubmitPracticeAnswerResultDto(session.Id, req.QuestionId, isCorrect, answeredCount, totalQuestions, score, session.Status.ToString());
    }

    public async Task<Unit> Handle(ResetPracticeQuestionCommand req, CancellationToken ct)
    {
        var session = await LoadOwnedSessionAsync(req.SessionId, req.StudentId, ct);
        var answer = await _db.PracticeAnswers
            .FirstOrDefaultAsync(item => item.PracticeSessionId == session.Id && item.QuestionId == req.QuestionId, ct);
        if (answer is not null)
            _db.PracticeAnswers.Remove(answer);
        // A reset un-freezes a completed session only if it had been auto-completed —
        // the score is no longer trustworthy once an answer is withdrawn.
        if (session.Status == PracticeSessionStatus.Completed)
        {
            session.Status = PracticeSessionStatus.InProgress;
            session.Score = null;
        }
        session.LastAccessedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(ResetPracticeSessionCommand req, CancellationToken ct)
    {
        var session = await LoadOwnedSessionAsync(req.SessionId, req.StudentId, ct);
        var answers = await _db.PracticeAnswers
            .Where(item => item.PracticeSessionId == session.Id)
            .ToListAsync(ct);
        _db.PracticeAnswers.RemoveRange(answers);
        session.Score = null;
        session.Status = PracticeSessionStatus.InProgress;
        session.LastAccessedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<PracticeProgressDto> Handle(GetPracticeProgressQuery req, CancellationToken ct)
    {
        var session = await LoadOwnedSessionAsync(req.SessionId, req.StudentId, ct);
        var exam = await _db.Exams.AsNoTracking()
            .Include(item => item.ExamQuestions)
            .FirstOrDefaultAsync(item => item.Id == session.ExamModelId, ct)
            ?? throw new NotFoundException("Exam", session.ExamModelId);
        var totalQuestions = exam.ExamQuestions.Count;

        var answers = await _db.PracticeAnswers.AsNoTracking()
            .Where(item => item.PracticeSessionId == session.Id)
            .Select(item => new { item.IsCorrect })
            .ToListAsync(ct);
        var correct = answers.Count(item => item.IsCorrect == true);
        var wrong = answers.Count(item => item.IsCorrect == false);
        var ungraded = answers.Count(item => item.IsCorrect == null);

        return new PracticeProgressDto(
            session.Id,
            session.ExamModelId,
            session.Status.ToString(),
            totalQuestions,
            answers.Count,
            correct,
            wrong,
            ungraded,
            totalQuestions == 0 ? 0 : Math.Round(answers.Count / (double)totalQuestions * 100, 2),
            session.Score,
            session.StartedAt,
            session.LastAccessedAt);
    }

    private async Task<PracticeSession> LoadOwnedSessionAsync(Guid sessionId, Guid studentId, CancellationToken ct) =>
        await _db.PracticeSessions
            .FirstOrDefaultAsync(session => session.Id == sessionId && session.StudentId == studentId, ct)
        ?? throw new NotFoundException("PracticeSession", sessionId);

    private async Task<bool> AllGradedAsync(Guid sessionId, int totalQuestions, CancellationToken ct) =>
        totalQuestions > 0 &&
        await _db.PracticeAnswers.CountAsync(item => item.PracticeSessionId == sessionId, ct) >= totalQuestions &&
        await _db.PracticeAnswers.CountAsync(item => item.PracticeSessionId == sessionId && item.IsCorrect == null, ct) == 0;

    /// <summary>MCQ/TrueFalse: exactly one correct option; the submitted id must match it.</summary>
    private static bool GradeSingleChoice(Question question, string submitted) =>
        Guid.TryParse(submitted, out var selectedId) &&
        question.Options.Any(option => option.IsCorrect && option.Id == selectedId);

    /// <summary>MultipleSelect: JSON array of option ids (comma list as legacy fallback) — set equality, no duplicates.</summary>
    private static bool GradeMultipleSelect(Question question, string submitted)
    {
        var expected = question.Options.Where(option => option.IsCorrect).Select(option => option.Id).ToHashSet();
        var selected = ParseSelectedOptionIds(submitted);
        return selected.Count > 0 && selected.ToHashSet().SetEquals(expected);
    }

    private static IReadOnlyCollection<Guid> ParseSelectedOptionIds(string answer)
    {
        try
        {
            var json = JsonSerializer.Deserialize<List<Guid>>(answer, ExamJsonOptions);
            if (json is not null) return json.Distinct().ToList();
        }
        catch (JsonException)
        {
            // Legacy fallback: comma-separated ids below.
        }
        return answer.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => Guid.TryParse(value, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();
    }

    private static StartPracticeSessionResultDto MapStarted(PracticeSession session, bool Created) => new(
        session.Id, session.ExamModelId, Created, session.Status.ToString(),
        session.StartedAt, session.LastAccessedAt, session.Score);

    private static readonly JsonSerializerOptions ExamJsonOptions = new(JsonSerializerDefaults.Web);
}
