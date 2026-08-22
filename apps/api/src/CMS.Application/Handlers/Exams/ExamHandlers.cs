using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Exams;
using CMS.Application.DTOs.Exams;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Application.Interfaces;

namespace CMS.Application.Handlers.Exams;

/// <summary>
/// Handles exam queries and session management.
/// </summary>
public class ExamQueryHandlers :
    IRequestHandler<GetExamsBySubjectQuery, List<ExamListItemDto>>,
    IRequestHandler<GetExamByIdQuery, ExamDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IEntitlementService _entitlements;

    public ExamQueryHandlers(IApplicationDbContext db, IEntitlementService entitlements)
    {
        _db = db;
        _entitlements = entitlements;
    }

    public async Task<List<ExamListItemDto>> Handle(GetExamsBySubjectQuery req, CancellationToken ct)
    {
        if (!req.StudentId.HasValue || !await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId.Value, req.SubjectId, SubscriptionContentScope.QuestionsExams, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        var exams = await _db.Exams.AsNoTracking()
            .Where(e => e.SubjectId == req.SubjectId && e.Status == ContentStatus.Published && e.DeletedAt == null)
            .OrderByDescending(e => e.Year)
            .ToListAsync(ct);

        var result = new List<ExamListItemDto>();
        foreach (var exam in exams)
        {
            bool hasAttempted = false;
            double? bestScore = null;
            bool hasPassed = false;

            if (req.StudentId.HasValue)
            {
                var sessions = await _db.ExamSessions
                    .Where(s => s.ExamId == exam.Id && s.StudentId == req.StudentId && s.Status == ExamSessionStatus.Completed)
                    .ToListAsync(ct);
                hasAttempted = sessions.Any();
                bestScore = sessions.Any() ? sessions.Max(s => s.Score ?? 0) : null;
                hasPassed = sessions.Any(s => s.Passed == true);
            }

            result.Add(new ExamListItemDto(
                exam.Id, exam.TitleAr, exam.Slug, exam.ExamType.ToString(),
                exam.Year, exam.DurationMinutes, exam.TotalQuestions,
                hasAttempted, bestScore, hasPassed
            ));
        }
        return result;
    }

    public async Task<ExamDto> Handle(GetExamByIdQuery req, CancellationToken ct)
    {
        var exam = await _db.Exams.AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == req.Id && e.Status == ContentStatus.Published && e.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);

        if (!await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId, exam.SubjectId, SubscriptionContentScope.QuestionsExams, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        return new ExamDto(
            exam.Id, exam.SubjectId, exam.TitleAr, exam.TitleEn, exam.Slug,
            exam.Description, exam.ExamType.ToString(), exam.Year,
            exam.DurationMinutes, exam.TotalQuestions, exam.PassingScore,
            exam.ShuffleQuestions, exam.ShuffleOptions,
            exam.ShowResultsImmediately, exam.AllowReview, exam.Status.ToString()
        );
    }
}

/// <summary>
/// Handles exam session lifecycle: start, submit, results, review.
/// </summary>
public class ExamSessionHandlers :
    IRequestHandler<StartExamSessionCommand, ExamSessionDto>,
    IRequestHandler<SubmitExamCommand, ExamResultDto>,
    IRequestHandler<GetExamResultQuery, ExamResultDto>,
    IRequestHandler<GetExamReviewQuery, ExamReviewDto>,
    IRequestHandler<CreateExamCommand, ExamDto>,
    IRequestHandler<PublishExamCommand, Unit>,
    IRequestHandler<UpdateExamCommand, ExamDto>,
    IRequestHandler<ArchiveExamCommand, Unit>,
    IRequestHandler<DeleteExamCommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IEntitlementService _entitlements;

    public ExamSessionHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork, IEntitlementService entitlements)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _entitlements = entitlements;
    }

    /// <summary>
    /// Start a new exam session - returns questions (shuffled if enabled).
    /// </summary>
    public async Task<ExamSessionDto> Handle(StartExamSessionCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams
            .Include(e => e.Questions)
            .ThenInclude(q => q.Options)
            .FirstOrDefaultAsync(e => e.Id == req.ExamId && e.Status == ContentStatus.Published, ct)
            ?? throw new NotFoundException("Exam", req.ExamId);

        if (!await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId, exam.SubjectId, SubscriptionContentScope.QuestionsExams, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        // Check if student already has an in-progress session
        var existingSession = await _db.ExamSessions
            .FirstOrDefaultAsync(s => s.ExamId == req.ExamId && s.StudentId == req.StudentId
                && s.Status == ExamSessionStatus.InProgress, ct);

        if (existingSession != null)
        {
            // Resume existing session
            return await BuildSessionDto(existingSession, exam, ct);
        }

        // Get published questions for this exam
        var questions = exam.Questions
            .Where(q => q.Status == ContentStatus.Published)
            .ToList();

        if (exam.ShuffleQuestions)
        {
            questions = questions.OrderBy(_ => Guid.NewGuid()).ToList();
        }

        // Create new session
        var isFirstAttempt = !await _db.ExamSessions
            .AnyAsync(s => s.ExamId == req.ExamId && s.StudentId == req.StudentId
                && s.Status == ExamSessionStatus.Completed, ct);

        var session = new ExamSession
        {
            StudentId = req.StudentId,
            ExamId = req.ExamId,
            StartedAt = DateTime.UtcNow,
            TotalQuestions = questions.Count,
            Status = ExamSessionStatus.InProgress,
            IsFirstAttempt = isFirstAttempt
        };

        await _db.ExamSessions.AddAsync(session, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return await BuildSessionDto(session, exam, ct, questions);
    }

    /// <summary>
    /// Submit exam - calculate score, save results.
    /// </summary>
    public async Task<ExamResultDto> Handle(SubmitExamCommand req, CancellationToken ct)
    {
        var session = await _db.ExamSessions
            .Include(s => s.Exam)
            .ThenInclude(e => e.Questions)
            .ThenInclude(q => q.Options)
            .FirstOrDefaultAsync(s => s.Id == req.SessionId && s.StudentId == req.StudentId, ct)
            ?? throw new NotFoundException("ExamSession", req.SessionId);

        if (session.Status != ExamSessionStatus.InProgress)
            throw new ConflictException("تم تسليم هذا الاختبار مسبقاً");

        // Calculate results
        int correct = 0;
        int answered = 0;
        var tagStats = new Dictionary<string, (int total, int correct)>();

        foreach (var answer in req.Answers)
        {
            var question = session.Exam.Questions.FirstOrDefault(q => q.Id == answer.QuestionId);
            if (question == null) continue;

            answered++;
            var correctOption = question.Options.FirstOrDefault(o => o.IsCorrect);
            var isCorrect = answer.SelectedOptionId == correctOption?.Id.ToString();

            if (isCorrect) correct++;

            // Record attempt log
            var isFirstForQuestion = !await _db.AttemptLogs
                .AnyAsync(a => a.StudentId == req.StudentId && a.QuestionId == answer.QuestionId, ct);

            _db.AttemptLogs.Add(new AttemptLog
            {
                StudentId = req.StudentId,
                QuestionId = answer.QuestionId,
                ExamSessionId = session.Id,
                SelectedAnswer = answer.SelectedOptionId,
                IsCorrect = isCorrect,
                IsFirstAttempt = isFirstForQuestion,
                AttemptNumber = await _db.AttemptLogs.CountAsync(a => a.StudentId == req.StudentId && a.QuestionId == answer.QuestionId, ct) + 1,
                DurationSeconds = answer.DurationSeconds,
                AnsweredAt = DateTime.UtcNow
            });

            // Track tag stats for weak topics
            foreach (var tag in question.Tags)
            {
                if (!tagStats.ContainsKey(tag)) tagStats[tag] = (0, 0);
                var stats = tagStats[tag];
                tagStats[tag] = (stats.total + 1, stats.correct + (isCorrect ? 1 : 0));
            }
        }

        // Update session
        session.CompletedAt = DateTime.UtcNow;
        session.DurationSeconds = (int)(DateTime.UtcNow - session.StartedAt).TotalSeconds;
        session.AnsweredQuestions = answered;
        session.CorrectAnswers = correct;
        session.Score = session.TotalQuestions > 0 ? (double)correct / session.TotalQuestions * 100 : 0;
        session.Passed = session.Score >= (double)session.Exam.PassingScore;
        session.Status = ExamSessionStatus.Completed;

        // Update student stats
        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == req.StudentId, ct);
        if (student != null)
        {
            student.RecordActivity();
            for (int i = 0; i < correct; i++) student.RecordAnswer(true);
            for (int i = 0; i < answered - correct; i++) student.RecordAnswer(false);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        // Build weak topics (accuracy < 60%)
        var weakTopics = tagStats
            .Select(kvp => new WeakTopicDto(kvp.Key, kvp.Value.total > 0 ? (double)kvp.Value.correct / kvp.Value.total * 100 : 0))
            .Where(t => t.Accuracy < 60)
            .OrderBy(t => t.Accuracy)
            .Take(5)
            .ToList();

        // Calculate comparison stats
        var allScores = await _db.ExamSessions
            .Where(s => s.ExamId == session.ExamId && s.Status == ExamSessionStatus.Completed)
            .Select(s => s.Score ?? 0)
            .ToListAsync(ct);

        var avgScore = allScores.Any() ? allScores.Average() : 0;
        var topScore = allScores.Any() ? allScores.Max() : 0;

        return new ExamResultDto(
            session.Id, session.Score ?? 0, session.Passed ?? false,
            session.TotalQuestions, answered, correct,
            session.DurationSeconds ?? 0,
            weakTopics,
            new ExamComparisonDto(session.Score ?? 0, avgScore, topScore)
        );
    }

    public async Task<ExamResultDto> Handle(GetExamResultQuery req, CancellationToken ct)
    {
        var session = await _db.ExamSessions
            .Include(s => s.Exam)
            .FirstOrDefaultAsync(s => s.Id == req.SessionId && s.StudentId == req.StudentId, ct)
            ?? throw new NotFoundException("ExamSession", req.SessionId);

        if (session.Status != ExamSessionStatus.Completed)
            throw new ConflictException("لم يتم تسليم هذا الاختبار بعد");

        if (!await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId, session.Exam.SubjectId, SubscriptionContentScope.QuestionsExams, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        // Recalculate weak topics from attempt logs
        var attempts = await _db.AttemptLogs
            .Include(a => a.Question)
            .Where(a => a.ExamSessionId == session.Id)
            .ToListAsync(ct);

        var tagStats = new Dictionary<string, (int total, int correct)>();
        foreach (var attempt in attempts)
        {
            foreach (var tag in attempt.Question.Tags)
            {
                if (!tagStats.ContainsKey(tag)) tagStats[tag] = (0, 0);
                var s = tagStats[tag];
                tagStats[tag] = (s.total + 1, s.correct + (attempt.IsCorrect ? 1 : 0));
            }
        }

        var weakTopics = tagStats
            .Select(kvp => new WeakTopicDto(kvp.Key, kvp.Value.total > 0 ? (double)kvp.Value.correct / kvp.Value.total * 100 : 0))
            .Where(t => t.Accuracy < 60)
            .OrderBy(t => t.Accuracy)
            .Take(5)
            .ToList();

        var allScores = await _db.ExamSessions
            .Where(s => s.ExamId == session.ExamId && s.Status == ExamSessionStatus.Completed)
            .Select(s => s.Score ?? 0)
            .ToListAsync(ct);

        return new ExamResultDto(
            session.Id, session.Score ?? 0, session.Passed ?? false,
            session.TotalQuestions, session.AnsweredQuestions, session.CorrectAnswers,
            session.DurationSeconds ?? 0, weakTopics,
            new ExamComparisonDto(session.Score ?? 0, allScores.Any() ? allScores.Average() : 0, allScores.Any() ? allScores.Max() : 0)
        );
    }

    public async Task<ExamReviewDto> Handle(GetExamReviewQuery req, CancellationToken ct)
    {
        var session = await _db.ExamSessions
            .Include(s => s.Exam)
            .ThenInclude(e => e.Questions)
            .ThenInclude(q => q.Options)
            .FirstOrDefaultAsync(s => s.Id == req.SessionId && s.StudentId == req.StudentId, ct)
            ?? throw new NotFoundException("ExamSession", req.SessionId);

        if (!session.Exam.AllowReview)
            throw new ForbiddenException("هذا الاختبار لا يدعم المراجعة");

        if (!await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId, session.Exam.SubjectId, SubscriptionContentScope.QuestionsExams, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        var attempts = await _db.AttemptLogs
            .Where(a => a.ExamSessionId == session.Id)
            .ToDictionaryAsync(a => a.QuestionId, ct);

        var reviewQuestions = session.Exam.Questions
            .Where(q => q.Status == ContentStatus.Published)
            .OrderBy(q => q.CreatedAt)
            .Select(q =>
            {
                var attempt = attempts.GetValueOrDefault(q.Id);
                var correctOption = q.Options.FirstOrDefault(o => o.IsCorrect);
                return new ReviewQuestionDto(
                    q.Id, q.Text,
                    q.Options.OrderBy(o => o.SortOrder).Select(o => new ReviewOptionDto(
                        o.Id, o.OptionLetter, o.Text,
                        o.IsCorrect,
                        attempt?.SelectedAnswer == o.Id.ToString()
                    )).ToList(),
                    attempt?.SelectedAnswer,
                    correctOption?.Id.ToString(),
                    attempt?.IsCorrect ?? false,
                    q.Explanation
                );
            })
            .ToList();

        return new ExamReviewDto(session.Id, reviewQuestions);
    }

    // ===== Admin: Create / Publish =====
    public async Task<ExamDto> Handle(CreateExamCommand req, CancellationToken ct)
    {
        var exam = Exam.Create(req.SubjectId, req.TitleAr, req.Slug, req.Year, req.CreatedBy);
        typeof(Exam).GetProperty("DurationMinutes")?.SetValue(exam, req.DurationMinutes);
        typeof(Exam).GetProperty("PassingScore")?.SetValue(exam, req.PassingScore);

        await _db.Exams.AddAsync(exam, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new ExamDto(
            exam.Id, exam.SubjectId, exam.TitleAr, exam.TitleEn, exam.Slug,
            exam.Description, exam.ExamType.ToString(), exam.Year,
            req.DurationMinutes, 0, req.PassingScore,
            exam.ShuffleQuestions, exam.ShuffleOptions,
            exam.ShowResultsImmediately, exam.AllowReview, exam.Status.ToString()
        );
    }

    public async Task<Unit> Handle(PublishExamCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams.FirstOrDefaultAsync(e => e.Id == req.Id, ct)
            ?? throw new NotFoundException("Exam", req.Id);
        exam.Publish();
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<ExamDto> Handle(UpdateExamCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams.FirstOrDefaultAsync(e => e.Id == req.Id && e.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);

        exam.Update(req.TitleAr, req.TitleEn, req.Description, req.DurationMinutes, req.PassingScore, req.AllowReview);
        await _unitOfWork.SaveChangesAsync(ct);

        return new ExamDto(
            exam.Id, exam.SubjectId, exam.TitleAr, exam.TitleEn, exam.Slug,
            exam.Description, exam.ExamType.ToString(), exam.Year,
            exam.DurationMinutes, exam.TotalQuestions, exam.PassingScore,
            exam.ShuffleQuestions, exam.ShuffleOptions,
            exam.ShowResultsImmediately, exam.AllowReview, exam.Status.ToString());
    }

    public async Task<Unit> Handle(ArchiveExamCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams.FirstOrDefaultAsync(e => e.Id == req.Id && e.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);
        exam.Archive();
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(DeleteExamCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams.FirstOrDefaultAsync(e => e.Id == req.Id && e.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);
        exam.SoftDelete(req.DeletedBy);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    // ===== Helper =====
    private Task<ExamSessionDto> BuildSessionDto(ExamSession session, Exam exam, CancellationToken ct, List<Question>? questions = null)
    {
        questions ??= exam.Questions.Where(q => q.Status == ContentStatus.Published).ToList();
        if (exam.ShuffleQuestions && session.Status == ExamSessionStatus.InProgress)
        {
            // Already shuffled when created
        }

        var questionDtos = questions.Select((q, i) => new ExamQuestionDto(
            q.Id, i + 1, q.Text,
            q.Options.OrderBy(o => o.SortOrder).Select(o => new ExamOptionDto(o.Id, o.OptionLetter, o.Text)).ToList()
        )).ToList();

        var expiresAt = session.StartedAt.AddMinutes(exam.DurationMinutes);

        return Task.FromResult(new ExamSessionDto(
            session.Id, exam.Id, exam.TitleAr,
            questions.Count, exam.DurationMinutes,
            expiresAt, questionDtos
        ));
    }
}
