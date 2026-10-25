using System.Text.Json;
using CMS.Application.Commands.Exams;
using CMS.Application.DTOs.Exams;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CMS.Application.Handlers.Exams;

/// <summary>
/// Student discovery and recovery queries. Every query revalidates entitlement; a client
/// may never treat a previously issued list response as a permanent access grant.
/// </summary>
public sealed class ExamQueryHandlers :
    IRequestHandler<GetExamsBySubjectQuery, List<ExamListItemDto>>,
    IRequestHandler<GetExamByIdQuery, ExamDto>,
    IRequestHandler<GetExamSessionQuery, ExamSessionDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IEntitlementService _entitlements;
    private readonly IUnitOfWork _unitOfWork;

    public ExamQueryHandlers(IApplicationDbContext db, IEntitlementService entitlements, IUnitOfWork unitOfWork)
    {
        _db = db;
        _entitlements = entitlements;
        _unitOfWork = unitOfWork;
    }

    public async Task<List<ExamListItemDto>> Handle(GetExamsBySubjectQuery req, CancellationToken ct)
    {
        await EnsureSubjectEntitlementAsync(req.StudentId, req.SubjectId, ct);
        var now = DateTime.UtcNow;
        var exams = await _db.Exams.AsNoTracking()
            .Where(exam => exam.SubjectId == req.SubjectId && exam.Status == ContentStatus.Published && exam.DeletedAt == null)
            .OrderBy(exam => exam.SortOrder)
            .ThenByDescending(exam => exam.Year)
            .ToListAsync(ct);

        var sessions = await _db.ExamSessions.AsNoTracking()
            .Where(session => session.StudentId == req.StudentId && exams.Select(exam => exam.Id).Contains(session.ExamId))
            .ToListAsync(ct);

        return exams.Select(exam =>
        {
            var examSessions = sessions.Where(session => session.ExamId == exam.Id).ToList();
            var countedAttempts = examSessions.Count(IsCountedAttempt);
            var completed = examSessions.Where(IsTerminalAttempt).ToList();
            var inProgress = examSessions.Any(session => session.Status == ExamSessionStatus.InProgress);
            var hasReachedLimit = exam.MaxAttempts.HasValue && countedAttempts >= exam.MaxAttempts.Value;
            var available = exam.IsAvailableAt(now);
            var blockedReason = !available
                ? "الاختبار غير متاح ضمن الوقت الحالي"
                : hasReachedLimit
                    ? "تم الوصول إلى الحد الأقصى للمحاولات"
                    : null;

            return new ExamListItemDto(
                exam.Id, exam.TitleAr, exam.Slug, exam.ExamType.ToString(), exam.Year,
                exam.DurationMinutes, exam.TotalQuestions, completed.Any(),
                completed.Any() ? completed.Max(session => session.Score ?? 0) : null,
                completed.Any(session => session.Passed == true),
                available && !hasReachedLimit,
                blockedReason,
                exam.MaxAttempts.HasValue ? Math.Max(0, exam.MaxAttempts.Value - countedAttempts) : null,
                inProgress);
        }).ToList();
    }

    public async Task<ExamDto> Handle(GetExamByIdQuery req, CancellationToken ct)
    {
        var exam = await _db.Exams.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == req.Id && item.Status == ContentStatus.Published && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);
        await EnsureSubjectEntitlementAsync(req.StudentId, exam.SubjectId, ct);
        return MapExam(exam);
    }

    public async Task<ExamSessionDto> Handle(GetExamSessionQuery req, CancellationToken ct)
    {
        var session = await LoadOwnedSessionAsync(req.SessionId, req.StudentId, ct);
        await EnsureSubjectEntitlementAsync(req.StudentId, session.Exam.SubjectId, ct);
        if (await FinalizeTimedOutSessionIfNeededAsync(session, ct))
            await _unitOfWork.SaveChangesAsync(ct);
        return BuildSessionDto(session);
    }

    private async Task<ExamSession> LoadOwnedSessionAsync(Guid sessionId, Guid studentId, CancellationToken ct) =>
        await _db.ExamSessions
            .Include(session => session.Exam)
            .Include(session => session.SessionQuestions)
            .Include(session => session.AttemptLogs)
            .FirstOrDefaultAsync(session => session.Id == sessionId && session.StudentId == studentId, ct)
        ?? throw new NotFoundException("ExamSession", sessionId);

    private async Task EnsureSubjectEntitlementAsync(Guid studentId, Guid subjectId, CancellationToken ct)
    {
        if (!await _entitlements.CanAccessSubjectContentAsync(studentId, subjectId, SubscriptionContentScope.QuestionsExams, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");
    }

    internal static bool IsTerminalAttempt(ExamSession session) =>
        session.Status is ExamSessionStatus.Completed or ExamSessionStatus.TimedOut;

    internal static bool IsCountedAttempt(ExamSession session) => IsTerminalAttempt(session);

    internal static ExamDto MapExam(Exam exam) => new(
        exam.Id, exam.SubjectId, exam.LectureId, exam.TitleAr, exam.TitleEn, exam.Slug,
        exam.Description, exam.ExamType.ToString(), exam.Year, exam.DurationMinutes,
        exam.TotalQuestions, exam.PassingScore, exam.AvailableFrom, exam.AvailableUntil,
        exam.MaxAttempts, exam.ShuffleQuestions, exam.ShuffleOptions,
        exam.ShowResultsImmediately, exam.AllowReview, exam.ShowCorrectAnswers,
        exam.ShowExplanations, exam.Status.ToString());

    internal static ExamSessionDto BuildSessionDto(ExamSession session)
    {
        var answers = session.AttemptLogs
            .Where(answer => answer.ExamSessionQuestionId.HasValue)
            .GroupBy(answer => answer.ExamSessionQuestionId!.Value)
            .ToDictionary(group => group.Key, group => group.Single().SelectedAnswer);

        var questions = session.SessionQuestions
            .OrderBy(question => question.SortOrder)
            .Select(question =>
            {
                var options = Deserialize<List<SnapshotOption>>(question.OptionsJson)
                    .OrderBy(option => option.SortOrder)
                    .Select((option, index) => new ExamOptionDto(
                        option.Id,
                        ((char)('A' + index)).ToString(),
                        option.Text,
                        option.TextHtml,
                        option.ImageUrl))
                    .ToList();
                var images = Deserialize<List<SnapshotImage>>(question.ImagesJson)
                    .OrderBy(image => image.SortOrder)
                    .Select(image => new ExamImageDto(image.Id, image.ImageUrl, image.AltText, image.Caption, image.SortOrder))
                    .ToList();
                return new ExamQuestionDto(
                    question.Id,
                    question.SourceQuestionId ?? Guid.Empty,
                    question.SortOrder + 1,
                    question.QuestionType.ToString(),
                    question.QuestionText,
                    question.QuestionTextHtml,
                    options,
                    images,
                    answers.GetValueOrDefault(question.Id));
            }).ToList();

        return new ExamSessionDto(
            session.Id, session.ExamId, session.Exam.TitleAr, session.Status.ToString(),
            session.TotalQuestions, session.DurationMinutesSnapshot, session.StartedAt,
            session.ExpiresAt, session.CurrentQuestionOrder, questions);
    }

    internal static async Task<bool> FinalizeTimedOutSessionIfNeededAsync(ExamSession session, CancellationToken ct)
    {
        if (session.Status != ExamSessionStatus.InProgress || DateTime.UtcNow < session.ExpiresAt)
            return false;

        await ExamSessionHandlers.FinalizeSessionAsync(session, ExamSessionStatus.TimedOut, ct);
        return true;
    }

    internal static T Deserialize<T>(string json) where T : new()
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, SerializerOptions) ?? new T();
        }
        catch (JsonException)
        {
            return new T();
        }
    }

    internal static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
    internal sealed record SnapshotOption(Guid Id, string Letter, string Text, string? TextHtml, string? ImageUrl, int SortOrder, bool IsCorrect);
    internal sealed record SnapshotImage(Guid Id, string ImageUrl, string? AltText, string? Caption, int SortOrder);
}

/// <summary>
/// Mutates the student attempt lifecycle and the administrator's exam configuration.
/// Server time, snapshot data and persistence constraints are the source of truth.
/// </summary>
public sealed class ExamSessionHandlers :
    IRequestHandler<StartExamSessionCommand, ExamSessionDto>,
    IRequestHandler<SaveExamAnswerCommand, SaveExamAnswerResultDto>,
    IRequestHandler<SubmitExamCommand, ExamResultDto>,
    IRequestHandler<CancelExamSessionCommand, Unit>,
    IRequestHandler<GetExamResultQuery, ExamResultDto>,
    IRequestHandler<GetExamReviewQuery, ExamReviewDto>,
    IRequestHandler<CreateExamCommand, ExamDto>,
    IRequestHandler<UpdateExamCommand, ExamDto>,
    IRequestHandler<ReplaceExamQuestionsCommand, AdminExamDetailsDto>,
    IRequestHandler<PublishExamCommand, Unit>,
    IRequestHandler<ArchiveExamCommand, Unit>,
    IRequestHandler<DeleteExamCommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IEntitlementService _entitlements;
    private readonly ISecurityAuditWriter? _audit;

    public ExamSessionHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IEntitlementService entitlements,
        ISecurityAuditWriter? audit = null)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _entitlements = entitlements;
        _audit = audit;
    }

    public async Task<ExamSessionDto> Handle(StartExamSessionCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams
            .Include(item => item.ExamQuestions)
            .ThenInclude(item => item.Question)
            .ThenInclude(question => question.Options)
            .Include(item => item.ExamQuestions)
            .ThenInclude(item => item.Question)
            .ThenInclude(question => question.Images)
            .FirstOrDefaultAsync(item => item.Id == req.ExamId && item.Status == ContentStatus.Published && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.ExamId);

        await EnsureSubjectEntitlementAsync(req.StudentId, exam.SubjectId, ct);
        var now = DateTime.UtcNow;
        if (!exam.IsAvailableAt(now))
            throw new ForbiddenException("الاختبار غير متاح ضمن الوقت الحالي");

        var existing = await LoadOwnedSessionAsync(req.ExamId, req.StudentId, ct);
        if (existing is not null)
        {
            if (await ExamQueryHandlers.FinalizeTimedOutSessionIfNeededAsync(existing, ct))
            {
                await RecordAnalyticsIfNeededAsync(existing, ct);
                await _unitOfWork.SaveChangesAsync(ct);
            }
            else
                return ExamQueryHandlers.BuildSessionDto(existing);
        }

        var countedAttempts = await _db.ExamSessions.CountAsync(
            session => session.StudentId == req.StudentId && session.ExamId == req.ExamId &&
                       (session.Status == ExamSessionStatus.Completed || session.Status == ExamSessionStatus.TimedOut), ct);
        if (exam.MaxAttempts.HasValue && countedAttempts >= exam.MaxAttempts.Value)
            throw new ForbiddenException("تم الوصول إلى الحد الأقصى للمحاولات لهذا الاختبار");

        var composition = exam.ExamQuestions
            .OrderBy(item => item.SortOrder)
            .Select(item => item.Question)
            .ToList();
        EnsureCompositionCanRun(exam, composition);
        if (exam.ShuffleQuestions)
            composition = composition.OrderBy(_ => Guid.NewGuid()).ToList();

        var session = new ExamSession
        {
            StudentId = req.StudentId,
            ExamId = exam.Id,
            StartedAt = now,
            ExpiresAt = now.AddMinutes(exam.DurationMinutes),
            DurationMinutesSnapshot = exam.DurationMinutes,
            PassingScoreSnapshot = exam.PassingScore,
            ShowResultsImmediatelySnapshot = exam.ShowResultsImmediately,
            AllowReviewSnapshot = exam.AllowReview,
            ShowCorrectAnswersSnapshot = exam.AllowReview && exam.ShowCorrectAnswers,
            ShowExplanationsSnapshot = exam.AllowReview && exam.ShowExplanations,
            StartIdempotencyKey = NormalizeIdempotencyKey(req.IdempotencyKey),
            TotalQuestions = composition.Count,
            Status = ExamSessionStatus.InProgress,
            IsFirstAttempt = countedAttempts == 0
        };
        await _db.ExamSessions.AddAsync(session, ct);

        var snapshots = composition.Select((question, index) => BuildSnapshot(session.Id, question, index, exam.ShuffleOptions)).ToList();
        await _db.ExamSessionQuestions.AddRangeAsync(snapshots, ct);
        session.SessionQuestions = snapshots;
        session.Exam = exam;

        try
        {
            await _unitOfWork.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // The filtered PostgreSQL index is the final concurrency guard. A concurrently
            // created session is returned on the caller's retry rather than creating a duplicate.
            _db.ExamSessionQuestions.RemoveRange(snapshots);
            _db.ExamSessions.Remove(session);
            var concurrent = await LoadOwnedSessionAsync(req.ExamId, req.StudentId, ct);
            if (concurrent is null)
                throw;
            return ExamQueryHandlers.BuildSessionDto(concurrent);
        }

        await AuditAsync(req.StudentId, null, $"Exam session started: {session.Id}", ct);
        return ExamQueryHandlers.BuildSessionDto(session);
    }

    public async Task<SaveExamAnswerResultDto> Handle(SaveExamAnswerCommand req, CancellationToken ct)
    {
        var session = await LoadSessionWithSnapshotAsync(req.SessionId, req.StudentId, ct);
        await EnsureSubjectEntitlementAsync(req.StudentId, session.Exam.SubjectId, ct);
        if (await EnsureStillActiveAsync(session, ct))
            throw new ConflictException("انتهى وقت الاختبار وتم حفظ نتيجته");

        var snapshot = session.SessionQuestions.SingleOrDefault(question => question.Id == req.SessionQuestionId)
            ?? throw new NotFoundException("ExamSessionQuestion", req.SessionQuestionId);
        await SaveAnswerInternalAsync(session, snapshot, req.Answer, null, req.CurrentQuestionOrder, req.ClearAnswer, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        var stored = session.AttemptLogs.SingleOrDefault(answer => answer.ExamSessionQuestionId == snapshot.Id)?.SelectedAnswer;
        return new SaveExamAnswerResultDto(
            session.Id, snapshot.Id, stored,
            session.AnsweredQuestions, session.CurrentQuestionOrder, session.ExpiresAt, session.Status.ToString());
    }

    public async Task<ExamResultDto> Handle(SubmitExamCommand req, CancellationToken ct)
    {
        var session = await LoadSessionWithSnapshotAsync(req.SessionId, req.StudentId, ct);
        await EnsureSubjectEntitlementAsync(req.StudentId, session.Exam.SubjectId, ct);

        if (ExamQueryHandlers.IsTerminalAttempt(session))
            return await BuildResultAsync(session, ct);
        if (session.Status == ExamSessionStatus.Cancelled)
            throw new ConflictException("أُلغيت هذه المحاولة قبل الإجابة ولا يمكن تسليمها");

        if (await EnsureStillActiveAsync(session, ct))
            return await BuildResultAsync(session, ct);

        if (req.LegacyAnswers is not null)
        {
            foreach (var answer in req.LegacyAnswers)
            {
                var snapshot = session.SessionQuestions.SingleOrDefault(question => question.Id == answer.QuestionId)
                    ?? session.SessionQuestions.SingleOrDefault(question => question.SourceQuestionId == answer.QuestionId);
                if (snapshot is not null)
                    await SaveAnswerInternalAsync(session, snapshot, answer.Answer, answer.DurationSeconds, null, false, ct);
            }
        }

        await FinalizeSessionAsync(session, ExamSessionStatus.Completed, ct);
        await RecordAnalyticsIfNeededAsync(session, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await AuditAsync(req.StudentId, null, $"Exam session submitted: {session.Id}", ct);
        return await BuildResultAsync(session, ct);
    }

    public async Task<Unit> Handle(CancelExamSessionCommand req, CancellationToken ct)
    {
        var session = await LoadSessionWithSnapshotAsync(req.SessionId, req.StudentId, ct);
        await EnsureSubjectEntitlementAsync(req.StudentId, session.Exam.SubjectId, ct);
        if (await EnsureStillActiveAsync(session, ct))
            throw new ConflictException("انتهى وقت الاختبار ولا يمكن إلغاؤه");
        if (session.AttemptLogs.Any())
            throw new ConflictException("لا يمكن إلغاء محاولة بعد حفظ إجابة");

        session.Status = ExamSessionStatus.Cancelled;
        session.CancelledAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        await AuditAsync(req.StudentId, null, $"Exam session cancelled before answers: {session.Id}", ct);
        return Unit.Value;
    }

    public async Task<ExamResultDto> Handle(GetExamResultQuery req, CancellationToken ct)
    {
        var session = await LoadSessionWithSnapshotAsync(req.SessionId, req.StudentId, ct);
        await EnsureSubjectEntitlementAsync(req.StudentId, session.Exam.SubjectId, ct);
        if (await ExamQueryHandlers.FinalizeTimedOutSessionIfNeededAsync(session, ct))
        {
            await AuditAsync(req.StudentId, null, $"Exam session timed out: {session.Id}", ct);
        }
        if (!ExamQueryHandlers.IsTerminalAttempt(session))
            throw new ConflictException("لم يتم تسليم هذا الاختبار بعد");
        await RecordAnalyticsIfNeededAsync(session, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return await BuildResultAsync(session, ct);
    }

    public async Task<ExamReviewDto> Handle(GetExamReviewQuery req, CancellationToken ct)
    {
        var session = await LoadSessionWithSnapshotAsync(req.SessionId, req.StudentId, ct);
        await EnsureSubjectEntitlementAsync(req.StudentId, session.Exam.SubjectId, ct);
        if (await ExamQueryHandlers.FinalizeTimedOutSessionIfNeededAsync(session, ct))
            await AuditAsync(req.StudentId, null, $"Exam session timed out: {session.Id}", ct);
        if (!ExamQueryHandlers.IsTerminalAttempt(session))
            throw new ConflictException("المراجعة متاحة بعد إنهاء الاختبار فقط");
        await RecordAnalyticsIfNeededAsync(session, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        if (!session.AllowReviewSnapshot)
            throw new ForbiddenException("هذا الاختبار لا يدعم المراجعة");

        var answers = session.AttemptLogs
            .Where(answer => answer.ExamSessionQuestionId.HasValue)
            .GroupBy(answer => answer.ExamSessionQuestionId!.Value)
            .ToDictionary(group => group.Key, group => group.Single());

        var questions = session.SessionQuestions.OrderBy(question => question.SortOrder).Select(question =>
        {
            var options = ExamQueryHandlers.Deserialize<List<ExamQueryHandlers.SnapshotOption>>(question.OptionsJson)
                .OrderBy(option => option.SortOrder)
                .Select((option, index) => new ReviewOptionDto(
                    option.Id,
                    ((char)('A' + index)).ToString(),
                    option.Text,
                    session.ShowCorrectAnswersSnapshot && option.IsCorrect,
                    answers.GetValueOrDefault(question.Id)?.SelectedAnswer is { } selected && AnswerContainsOption(selected, option.Id)))
                .ToList();
            var answer = answers.GetValueOrDefault(question.Id);
            return new ReviewQuestionDto(
                question.Id,
                question.SourceQuestionId ?? Guid.Empty,
                question.SortOrder + 1,
                question.QuestionType.ToString(),
                question.QuestionText,
                options,
                answer?.SelectedAnswer,
                session.ShowCorrectAnswersSnapshot ? CorrectAnswerDisplay(question) : null,
                session.ShowCorrectAnswersSnapshot ? answer?.IsCorrect : null,
                session.ShowExplanationsSnapshot ? question.Explanation : null);
        }).ToList();

        return new ExamReviewDto(session.Id, session.ShowCorrectAnswersSnapshot, session.ShowExplanationsSnapshot, questions);
    }

    public async Task<ExamDto> Handle(CreateExamCommand req, CancellationToken ct)
    {
        await ValidateConfigurationReferencesAsync(req.Configuration, ct);
        var type = ParseExamType(req.Configuration.ExamType);
        var exam = Exam.Create(req.Configuration.SubjectId, req.Configuration.TitleAr, req.Configuration.Slug, req.Configuration.Year, req.CreatedBy, type);
        ConfigureExam(exam, req.Configuration, type);
        await _db.Exams.AddAsync(exam, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await AuditAsync(null, req.CreatedBy, $"Exam draft created: {exam.Id}", ct);
        return ExamQueryHandlers.MapExam(exam);
    }

    public async Task<ExamDto> Handle(UpdateExamCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams.FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);
        if (exam.SubjectId != req.Configuration.SubjectId)
            throw new DomainException("لا يمكن نقل اختبار إلى مادة مختلفة؛ أنشئ اختباراً جديداً بدلاً من ذلك");
        await ValidateConfigurationReferencesAsync(req.Configuration, ct);
        ConfigureExam(exam, req.Configuration, ParseExamType(req.Configuration.ExamType));
        await _unitOfWork.SaveChangesAsync(ct);
        await AuditAsync(null, req.UpdatedBy, $"Exam configuration updated: {exam.Id}", ct);
        return ExamQueryHandlers.MapExam(exam);
    }

    public async Task<AdminExamDetailsDto> Handle(ReplaceExamQuestionsCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams
            .Include(item => item.ExamQuestions)
            .FirstOrDefaultAsync(item => item.Id == req.ExamId && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.ExamId);
        if (req.QuestionIds.Count == 0)
            throw new DomainException("يجب اختيار سؤال واحد على الأقل للاختبار");
        if (req.QuestionIds.Distinct().Count() != req.QuestionIds.Count)
            throw new DomainException("لا يمكن تكرار السؤال نفسه داخل الاختبار");

        var questions = await _db.Questions
            .Include(question => question.Lecture)
            .Include(question => question.Options)
            .Where(question => req.QuestionIds.Contains(question.Id))
            .ToListAsync(ct);
        if (questions.Count != req.QuestionIds.Count)
            throw new NotFoundException("Question", req.QuestionIds.Except(questions.Select(question => question.Id)).First());
        EnsureQuestionsAreValidForExam(exam, questions);

        _db.ExamQuestions.RemoveRange(exam.ExamQuestions);
        var replacements = req.QuestionIds.Select((questionId, index) => ExamQuestion.Create(exam.Id, questionId, index)).ToList();
        await _db.ExamQuestions.AddRangeAsync(replacements, ct);
        exam.SetQuestionCount(replacements.Count);
        await _unitOfWork.SaveChangesAsync(ct);
        await AuditAsync(null, req.UpdatedBy, $"Exam question composition replaced: {exam.Id}; count={replacements.Count}", ct);

        return await BuildAdminDetailAsync(exam.Id, ct);
    }

    public async Task<Unit> Handle(PublishExamCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams
            .Include(item => item.ExamQuestions)
            .ThenInclude(item => item.Question)
            .ThenInclude(question => question.Options)
            .FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);
        var questions = exam.ExamQuestions.OrderBy(item => item.SortOrder).Select(item => item.Question).ToList();
        EnsureCompositionCanRun(exam, questions);
        exam.SetQuestionCount(questions.Count);
        exam.Publish();
        await _unitOfWork.SaveChangesAsync(ct);
        await AuditAsync(null, req.PublishedBy, $"Exam published: {exam.Id}", ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(ArchiveExamCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams.FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);
        exam.Archive();
        await _unitOfWork.SaveChangesAsync(ct);
        await AuditAsync(null, req.ArchivedBy, $"Exam archived: {exam.Id}", ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(DeleteExamCommand req, CancellationToken ct)
    {
        var exam = await _db.Exams.FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);
        exam.SoftDelete(req.DeletedBy);
        await _unitOfWork.SaveChangesAsync(ct);
        await AuditAsync(null, req.DeletedBy, $"Exam soft deleted: {exam.Id}", ct);
        return Unit.Value;
    }

    internal static async Task FinalizeSessionAsync(ExamSession session, ExamSessionStatus terminalStatus, CancellationToken ct)
    {
        if (terminalStatus is not (ExamSessionStatus.Completed or ExamSessionStatus.TimedOut))
            throw new ArgumentOutOfRangeException(nameof(terminalStatus));
        if (ExamQueryHandlers.IsTerminalAttempt(session))
            return;

        var answers = session.AttemptLogs
            .Where(answer => answer.ExamSessionQuestionId.HasValue)
            .GroupBy(answer => answer.ExamSessionQuestionId!.Value)
            .ToDictionary(group => group.Key, group => group.Single());
        var now = DateTime.UtcNow;
        var correct = 0;
        foreach (var snapshot in session.SessionQuestions)
        {
            if (!answers.TryGetValue(snapshot.Id, out var answer))
                continue;
            answer.IsCorrect = IsAnswerCorrect(snapshot, answer.SelectedAnswer);
            if (answer.IsCorrect) correct++;
        }

        session.AnsweredQuestions = answers.Count;
        session.CorrectAnswers = correct;
        session.Score = session.TotalQuestions == 0 ? 0 : (double)correct / session.TotalQuestions * 100;
        session.Passed = session.Score >= (double)session.PassingScoreSnapshot;
        session.DurationSeconds = Math.Max(0, (int)((terminalStatus == ExamSessionStatus.TimedOut ? session.ExpiresAt : now) - session.StartedAt).TotalSeconds);
        session.CompletedAt = terminalStatus == ExamSessionStatus.TimedOut ? session.ExpiresAt : now;
        session.SubmittedAt = terminalStatus == ExamSessionStatus.Completed ? now : null;
        session.TimedOutAt = terminalStatus == ExamSessionStatus.TimedOut ? now : null;
        session.Status = terminalStatus;
        await Task.CompletedTask;
    }

    private async Task<bool> EnsureStillActiveAsync(ExamSession session, CancellationToken ct)
    {
        if (!await ExamQueryHandlers.FinalizeTimedOutSessionIfNeededAsync(session, ct))
            return false;
        await RecordAnalyticsIfNeededAsync(session, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await AuditAsync(session.StudentId, null, $"Exam session timed out: {session.Id}", ct);
        return true;
    }

    private async Task RecordAnalyticsIfNeededAsync(ExamSession session, CancellationToken ct)
    {
        if (!ExamQueryHandlers.IsTerminalAttempt(session) || session.AnalyticsRecordedAt.HasValue)
            return;

        var sourceIds = session.SessionQuestions.Where(question => question.SourceQuestionId.HasValue).Select(question => question.SourceQuestionId!.Value).Distinct().ToList();
        var questions = sourceIds.Count == 0 ? new Dictionary<Guid, Question>() : await _db.Questions.Where(question => sourceIds.Contains(question.Id)).ToDictionaryAsync(question => question.Id, ct);
        var student = await _db.Students.FirstOrDefaultAsync(item => item.Id == session.StudentId, ct);
        if (student is not null)
        {
            student.RecordActivity();
            foreach (var answer in session.AttemptLogs.Where(answer => answer.ExamSessionQuestionId.HasValue))
                student.RecordAnswer(answer.IsCorrect);
        }
        foreach (var answer in session.AttemptLogs.Where(answer => answer.ExamSessionQuestionId.HasValue))
        {
            if (questions.TryGetValue(answer.QuestionId, out var question))
                question.RecordAttempt(answer.IsCorrect);
        }
        session.AnalyticsRecordedAt = DateTime.UtcNow;
    }

    private async Task SaveAnswerInternalAsync(ExamSession session, ExamSessionQuestion snapshot, string? rawAnswer, int? durationSeconds, int? currentQuestionOrder, bool clearAnswer, CancellationToken ct)
    {
        if (session.Status != ExamSessionStatus.InProgress)
            throw new ConflictException("لا يمكن تعديل إجابة اختبار منتهٍ");
        if (currentQuestionOrder is < 0 || currentQuestionOrder >= session.TotalQuestions)
            throw new DomainException("رقم السؤال الحالي غير صالح");

        var answer = NormalizeStoredAnswer(rawAnswer);
        var existing = session.AttemptLogs.SingleOrDefault(item => item.ExamSessionQuestionId == snapshot.Id);
        if (answer is null)
        {
            if (clearAnswer && existing is not null)
            {
                _db.AttemptLogs.Remove(existing);
                session.AttemptLogs.Remove(existing);
            }
        }
        else
        {
            ValidateAnswerShape(snapshot, answer);
            if (existing is null)
            {
                var priorAttempts = await _db.AttemptLogs.CountAsync(item => item.StudentId == session.StudentId && item.QuestionId == snapshot.SourceQuestionId, ct);
                existing = new AttemptLog
                {
                    StudentId = session.StudentId,
                    QuestionId = snapshot.SourceQuestionId ?? Guid.Empty,
                    ExamSessionId = session.Id,
                    ExamSessionQuestionId = snapshot.Id,
                    SelectedAnswer = answer,
                    IsCorrect = IsAnswerCorrect(snapshot, answer),
                    IsFirstAttempt = priorAttempts == 0,
                    AttemptNumber = priorAttempts + 1,
                    DurationSeconds = durationSeconds,
                    AnsweredAt = DateTime.UtcNow
                };
                await _db.AttemptLogs.AddAsync(existing, ct);
            }
            else
            {
                existing.SelectedAnswer = answer;
                existing.IsCorrect = IsAnswerCorrect(snapshot, answer);
                existing.DurationSeconds = durationSeconds ?? existing.DurationSeconds;
                existing.AnsweredAt = DateTime.UtcNow;
            }
        }

        session.AnsweredQuestions = session.AttemptLogs.Count(item => item.ExamSessionQuestionId.HasValue);
        if (currentQuestionOrder.HasValue)
            session.CurrentQuestionOrder = currentQuestionOrder.Value;
    }

    private async Task<ExamResultDto> BuildResultAsync(ExamSession session, CancellationToken ct)
    {
        var visible = session.ShowResultsImmediatelySnapshot;
        var weakTopics = BuildWeakTopics(session);
        ExamComparisonDto? comparison = null;
        if (visible)
        {
            var scores = await _db.ExamSessions.AsNoTracking()
                .Where(item => item.ExamId == session.ExamId &&
                    (item.Status == ExamSessionStatus.Completed || item.Status == ExamSessionStatus.TimedOut) && item.Score.HasValue)
                .Select(item => item.Score!.Value)
                .ToListAsync(ct);
            comparison = new ExamComparisonDto(session.Score ?? 0, scores.Count == 0 ? 0 : scores.Average(), scores.Count == 0 ? 0 : scores.Max());
        }

        return new ExamResultDto(
            session.Id,
            session.Status.ToString(),
            visible,
            visible ? session.Score : null,
            visible ? session.Passed : null,
            session.TotalQuestions,
            session.AnsweredQuestions,
            visible ? session.CorrectAnswers : 0,
            session.TotalQuestions - session.AnsweredQuestions,
            session.DurationSeconds ?? 0,
            session.AllowReviewSnapshot,
            visible ? weakTopics : new List<WeakTopicDto>(),
            comparison);
    }

    private static List<WeakTopicDto> BuildWeakTopics(ExamSession session)
    {
        var answers = session.AttemptLogs
            .Where(answer => answer.ExamSessionQuestionId.HasValue)
            .ToDictionary(answer => answer.ExamSessionQuestionId!.Value);
        var statistics = new Dictionary<string, (int Total, int Correct)>();
        foreach (var question in session.SessionQuestions)
        {
            var answer = answers.GetValueOrDefault(question.Id);
            foreach (var tag in ExamQueryHandlers.Deserialize<List<string>>(question.TagsJson))
            {
                if (!statistics.TryGetValue(tag, out var value)) value = (0, 0);
                statistics[tag] = (value.Total + 1, value.Correct + (answer?.IsCorrect == true ? 1 : 0));
            }
        }
        return statistics
            .Select(item => new WeakTopicDto(item.Key, item.Value.Total == 0 ? 0 : (double)item.Value.Correct / item.Value.Total * 100))
            .Where(item => item.Accuracy < 60)
            .OrderBy(item => item.Accuracy)
            .Take(5)
            .ToList();
    }

    private async Task<ExamSession> LoadSessionWithSnapshotAsync(Guid sessionId, Guid studentId, CancellationToken ct) =>
        await _db.ExamSessions
            .Include(session => session.Exam)
            .Include(session => session.SessionQuestions)
            .Include(session => session.AttemptLogs)
            .FirstOrDefaultAsync(session => session.Id == sessionId && session.StudentId == studentId, ct)
        ?? throw new NotFoundException("ExamSession", sessionId);

    private async Task<ExamSession?> LoadOwnedSessionAsync(Guid examId, Guid studentId, CancellationToken ct) =>
        await _db.ExamSessions
            .Include(session => session.Exam)
            .Include(session => session.SessionQuestions)
            .Include(session => session.AttemptLogs)
            .FirstOrDefaultAsync(session => session.ExamId == examId && session.StudentId == studentId && session.Status == ExamSessionStatus.InProgress, ct);

    private async Task EnsureSubjectEntitlementAsync(Guid studentId, Guid subjectId, CancellationToken ct)
    {
        if (!await _entitlements.CanAccessSubjectContentAsync(studentId, subjectId, SubscriptionContentScope.QuestionsExams, ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");
    }

    private static ExamSessionQuestion BuildSnapshot(Guid sessionId, Question question, int sortOrder, bool shuffleOptions)
    {
        var options = question.Options.OrderBy(option => option.SortOrder).ToList();
        if (shuffleOptions)
            options = options.OrderBy(_ => Guid.NewGuid()).ToList();
        var optionSnapshots = options.Select((option, index) => new ExamQueryHandlers.SnapshotOption(
            option.Id, ((char)('A' + index)).ToString(), option.Text, option.TextHtml, option.ImageUrl, index, option.IsCorrect)).ToList();
        var imageSnapshots = question.Images.OrderBy(image => image.SortOrder).Select(image => new ExamQueryHandlers.SnapshotImage(
            image.Id, image.ImageUrl, image.AltText, image.Caption, image.SortOrder)).ToList();
        return new ExamSessionQuestion
        {
            ExamSessionId = sessionId,
            SourceQuestionId = question.Id,
            SortOrder = sortOrder,
            QuestionType = question.Type,
            QuestionText = question.Text,
            QuestionTextHtml = question.TextHtml,
            OptionsJson = JsonSerializer.Serialize(optionSnapshots, ExamQueryHandlers.SerializerOptions),
            CorrectAnswer = question.CorrectAnswer,
            Explanation = question.Explanation,
            ExplanationHtml = question.ExplanationHtml,
            Reference = question.Reference,
            TagsJson = JsonSerializer.Serialize(question.Tags, ExamQueryHandlers.SerializerOptions),
            ImagesJson = JsonSerializer.Serialize(imageSnapshots, ExamQueryHandlers.SerializerOptions)
        };
    }

    private static void EnsureCompositionCanRun(Exam exam, IReadOnlyCollection<Question> questions)
    {
        if (questions.Count == 0)
            throw new BusinessRuleViolationException("لا يمكن نشر أو بدء اختبار بلا أسئلة");
        EnsureQuestionsAreValidForExam(exam, questions);
    }

    private static void EnsureQuestionsAreValidForExam(Exam exam, IReadOnlyCollection<Question> questions)
    {
        foreach (var question in questions)
        {
            if (question.SubjectId != exam.SubjectId)
                throw new BusinessRuleViolationException("كل سؤال في الاختبار يجب أن ينتمي إلى مادة الاختبار");
            if (exam.LectureId.HasValue && question.LectureId != exam.LectureId)
                throw new BusinessRuleViolationException("كل سؤال في اختبار المحاضرة يجب أن ينتمي إلى المحاضرة المحددة");
            if (question.Status != ContentStatus.Published || question.DeletedAt.HasValue)
                throw new BusinessRuleViolationException("يمكن استخدام الأسئلة المنشورة وغير المحذوفة فقط");
            if (question.Type is not (QuestionType.Mcq or QuestionType.TrueFalse or QuestionType.MultipleSelect))
                throw new BusinessRuleViolationException("الأسئلة التحريرية والأنواع غير الآلية لا تدخل الاختبارات المصححة آلياً حالياً");
            if (!question.Options.Any(option => option.IsCorrect) || question.Options.Count < 2)
                throw new BusinessRuleViolationException("السؤال المحدد لا يملك خيارات صالحة للتصحيح");
        }
    }

    private async Task ValidateConfigurationReferencesAsync(ExamConfigurationInput configuration, CancellationToken ct)
    {
        var subjectExists = await _db.Subjects.AnyAsync(subject => subject.Id == configuration.SubjectId && subject.DeletedAt == null, ct);
        if (!subjectExists)
            throw new NotFoundException("Subject", configuration.SubjectId);
        if (configuration.LectureId.HasValue)
        {
            var lectureExists = await _db.Lectures.AnyAsync(lecture => lecture.Id == configuration.LectureId && lecture.SubjectId == configuration.SubjectId && lecture.DeletedAt == null, ct);
            if (!lectureExists)
                throw new DomainException("المحاضرة المحددة لا تنتمي إلى مادة الاختبار");
        }
    }

    private static void ConfigureExam(Exam exam, ExamConfigurationInput input, ExamType examType) =>
        exam.Configure(
            input.TitleAr, input.TitleEn, input.Description, examType, input.Year,
            input.LectureId, input.DurationMinutes, input.PassingScore, input.SortOrder,
            input.AvailableFrom, input.AvailableUntil, input.MaxAttempts,
            input.ShuffleQuestions, input.ShuffleOptions, input.ShowResultsImmediately,
            input.AllowReview, input.ShowCorrectAnswers, input.ShowExplanations);

    private static ExamType ParseExamType(string value) =>
        Enum.TryParse<ExamType>(value, true, out var parsed)
            ? parsed
            : throw new DomainException("نوع الاختبار غير صالح");

    private static string? NormalizeStoredAnswer(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void ValidateAnswerShape(ExamSessionQuestion snapshot, string answer)
    {
        if (snapshot.QuestionType is not (QuestionType.Mcq or QuestionType.TrueFalse or QuestionType.MultipleSelect))
            throw new BusinessRuleViolationException("لا يدعم هذا الاختبار نوع السؤال المحدد للتصحيح الآلي");
        var optionIds = ExamQueryHandlers.Deserialize<List<ExamQueryHandlers.SnapshotOption>>(snapshot.OptionsJson).Select(option => option.Id).ToHashSet();
        var selected = ParseSelectedOptionIds(answer);
        if (selected.Count == 0 || selected.Any(id => !optionIds.Contains(id)))
            throw new DomainException("الإجابة لا تنتمي إلى خيارات سؤال الاختبار");
        if (snapshot.QuestionType is QuestionType.Mcq or QuestionType.TrueFalse && selected.Count != 1)
            throw new DomainException("يسمح هذا السؤال باختيار إجابة واحدة فقط");
    }

    private static bool IsAnswerCorrect(ExamSessionQuestion snapshot, string? answer)
    {
        if (string.IsNullOrWhiteSpace(answer)) return false;
        var options = ExamQueryHandlers.Deserialize<List<ExamQueryHandlers.SnapshotOption>>(snapshot.OptionsJson);
        var expected = options.Where(option => option.IsCorrect).Select(option => option.Id).OrderBy(id => id).ToArray();
        var selected = ParseSelectedOptionIds(answer).OrderBy(id => id).ToArray();
        return expected.SequenceEqual(selected);
    }

    private static IReadOnlyCollection<Guid> ParseSelectedOptionIds(string answer)
    {
        try
        {
            var json = JsonSerializer.Deserialize<List<Guid>>(answer, ExamQueryHandlers.SerializerOptions);
            if (json is not null) return json.Distinct().ToList();
        }
        catch (JsonException)
        {
            // Existing client contracts submit one GUID directly; parse it below.
        }
        return answer.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => Guid.TryParse(value, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();
    }

    private static bool AnswerContainsOption(string answer, Guid optionId) => ParseSelectedOptionIds(answer).Contains(optionId);

    private static string CorrectAnswerDisplay(ExamSessionQuestion snapshot)
    {
        if (snapshot.QuestionType == QuestionType.Essay)
            return snapshot.CorrectAnswer;
        var correct = ExamQueryHandlers.Deserialize<List<ExamQueryHandlers.SnapshotOption>>(snapshot.OptionsJson)
            .Where(option => option.IsCorrect)
            .OrderBy(option => option.SortOrder)
            .Select(option => option.Text);
        return string.Join(" | ", correct);
    }

    private static string? NormalizeIdempotencyKey(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, 128)];

    private async Task AuditAsync(Guid? studentId, Guid? adminId, string description, CancellationToken ct)
    {
        if (_audit is null) return;
        await _audit.LogSecurityEventAsync(studentId, adminId, SecurityEventType.AdminAction, SecuritySeverity.Info, description, ct: ct);
    }

    private async Task<AdminExamDetailsDto> BuildAdminDetailAsync(Guid examId, CancellationToken ct)
    {
        var exam = await _db.Exams.AsNoTracking()
            .Include(item => item.ExamQuestions)
            .ThenInclude(item => item.Question)
            .ThenInclude(question => question.Lecture)
            .FirstOrDefaultAsync(item => item.Id == examId && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", examId);
        var questions = exam.ExamQuestions.OrderBy(item => item.SortOrder).Select(item => new AdminExamQuestionDto(
            item.QuestionId, item.SortOrder, item.Question.Text, item.Question.Type.ToString(),
            item.Question.Difficulty.ToString(), item.Question.Lecture?.NameAr, item.Question.Tags)).ToList();
        return new AdminExamDetailsDto(ExamQueryHandlers.MapExam(exam), questions);
    }
}

/// <summary>
/// Administrator read models. Scope filtering is executed in the query rather than trusted
/// from the client, then controllers enforce the matching permission verb.
/// </summary>
public sealed class AdminExamQueryHandlers :
    IRequestHandler<GetAdminExamsQuery, PagedExamResultDto<AdminExamListItemDto>>,
    IRequestHandler<GetAdminExamByIdQuery, AdminExamDetailsDto>,
    IRequestHandler<GetExamQuestionCandidatesQuery, PagedExamResultDto<ExamQuestionCandidateDto>>,
    IRequestHandler<GetAdminExamResultsQuery, PagedExamResultDto<AdminExamResultDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IPermissionService _permissions;

    public AdminExamQueryHandlers(IApplicationDbContext db, IPermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    public async Task<PagedExamResultDto<AdminExamListItemDto>> Handle(GetAdminExamsQuery req, CancellationToken ct)
    {
        IQueryable<Exam> query = _db.Exams.AsNoTracking().Where(exam => exam.DeletedAt == null);
        query = await ApplyScopeAsync(query, req.AdminId, ct);
        if (req.SubjectId.HasValue) query = query.Where(exam => exam.SubjectId == req.SubjectId);
        if (!string.IsNullOrWhiteSpace(req.Status))
        {
            if (!Enum.TryParse<ContentStatus>(req.Status, true, out var status))
                throw new DomainException("حالة الاختبار غير صالحة");
            query = query.Where(exam => exam.Status == status);
        }
        if (!string.IsNullOrWhiteSpace(req.Search))
        {
            var search = req.Search.Trim().ToLower();
            query = query.Where(exam => exam.TitleAr.ToLower().Contains(search) || exam.Slug.ToLower().Contains(search));
        }

        var total = await query.CountAsync(ct);
        var exams = await query.OrderBy(exam => exam.SortOrder).ThenByDescending(exam => exam.Year)
            .Skip(NormalizePage(req.Page) * NormalizePageSize(req.PageSize))
            .Take(NormalizePageSize(req.PageSize))
            .Select(exam => new AdminExamListItemDto(
                exam.Id, exam.SubjectId, exam.LectureId, exam.TitleAr, exam.Slug,
                exam.ExamType.ToString(), exam.Year, exam.TotalQuestions, exam.DurationMinutes,
                exam.AvailableFrom, exam.AvailableUntil, exam.MaxAttempts, exam.Status.ToString(),
                exam.Sessions.Count,
                exam.Sessions.Count(session => session.Status == ExamSessionStatus.Completed || session.Status == ExamSessionStatus.TimedOut),
                exam.Sessions.Where(session => (session.Status == ExamSessionStatus.Completed || session.Status == ExamSessionStatus.TimedOut) && session.Score.HasValue).Select(session => session.Score).Average()))
            .ToListAsync(ct);
        return new PagedExamResultDto<AdminExamListItemDto>(exams, NormalizePage(req.Page) + 1, NormalizePageSize(req.PageSize), total);
    }

    public async Task<AdminExamDetailsDto> Handle(GetAdminExamByIdQuery req, CancellationToken ct)
    {
        if (!await _permissions.IsInScopeAsync(req.AdminId, "exam", req.Id, ct))
            throw new ForbiddenException("الاختبار خارج نطاق صلاحية المدير");
        var exam = await _db.Exams.AsNoTracking()
            .Include(item => item.ExamQuestions)
            .ThenInclude(item => item.Question)
            .ThenInclude(question => question.Lecture)
            .FirstOrDefaultAsync(item => item.Id == req.Id && item.DeletedAt == null, ct)
            ?? throw new NotFoundException("Exam", req.Id);
        return new AdminExamDetailsDto(ExamQueryHandlers.MapExam(exam), exam.ExamQuestions.OrderBy(item => item.SortOrder).Select(item =>
            new AdminExamQuestionDto(item.QuestionId, item.SortOrder, item.Question.Text, item.Question.Type.ToString(), item.Question.Difficulty.ToString(), item.Question.Lecture?.NameAr, item.Question.Tags)).ToList());
    }

    public async Task<PagedExamResultDto<ExamQuestionCandidateDto>> Handle(GetExamQuestionCandidatesQuery req, CancellationToken ct)
    {
        var query = _db.Questions.AsNoTracking().Include(question => question.Lecture)
            .Where(question => question.SubjectId == req.SubjectId && question.Status == ContentStatus.Published && question.DeletedAt == null &&
                (question.Type == QuestionType.Mcq || question.Type == QuestionType.TrueFalse || question.Type == QuestionType.MultipleSelect));
        if (req.LectureId.HasValue) query = query.Where(question => question.LectureId == req.LectureId);
        if (!string.IsNullOrWhiteSpace(req.Search))
        {
            var search = req.Search.Trim().ToLower();
            query = query.Where(question => question.Text.ToLower().Contains(search));
        }
        var total = await query.CountAsync(ct);
        var page = NormalizePage(req.Page);
        var size = NormalizePageSize(req.PageSize);
        var items = await query.OrderBy(question => question.CreatedAt).Skip(page * size).Take(size).Select(question =>
            new ExamQuestionCandidateDto(question.Id, question.Text, question.Type.ToString(), question.Difficulty.ToString(), question.LectureId, question.Lecture == null ? null : question.Lecture.NameAr, question.Tags)).ToListAsync(ct);
        return new PagedExamResultDto<ExamQuestionCandidateDto>(items, page + 1, size, total);
    }

    public async Task<PagedExamResultDto<AdminExamResultDto>> Handle(GetAdminExamResultsQuery req, CancellationToken ct)
    {
        if (!await _permissions.IsInScopeAsync(req.AdminId, "exam", req.ExamId, ct))
            throw new ForbiddenException("الاختبار خارج نطاق صلاحية المدير");
        var exists = await _db.Exams.AnyAsync(exam => exam.Id == req.ExamId && exam.DeletedAt == null, ct);
        if (!exists) throw new NotFoundException("Exam", req.ExamId);
        var query = _db.ExamSessions.AsNoTracking().Include(session => session.Student).Where(session => session.ExamId == req.ExamId);
        if (!string.IsNullOrWhiteSpace(req.Status))
        {
            if (!Enum.TryParse<ExamSessionStatus>(req.Status, true, out var status))
                throw new DomainException("حالة المحاولة غير صالحة");
            query = query.Where(session => session.Status == status);
        }
        var total = await query.CountAsync(ct);
        var page = NormalizePage(req.Page);
        var size = NormalizePageSize(req.PageSize);
        var items = await query.OrderByDescending(session => session.StartedAt).Skip(page * size).Take(size).Select(session =>
            new AdminExamResultDto(session.Id, session.StudentId, session.Student.FullName, session.Status.ToString(), session.StartedAt,
                session.CompletedAt, session.AnsweredQuestions, session.CorrectAnswers, session.Score, session.Passed, session.IsFirstAttempt)).ToListAsync(ct);
        return new PagedExamResultDto<AdminExamResultDto>(items, page + 1, size, total);
    }

    private async Task<IQueryable<Exam>> ApplyScopeAsync(IQueryable<Exam> query, Guid adminId, CancellationToken ct)
    {
        var scope = await _permissions.GetScopeAsync(adminId, ct);
        if (scope?.IsSuperAdmin == true) return query;
        if (scope is null || (!scope.UniversityId.HasValue && !scope.CollegeId.HasValue && !scope.YearId.HasValue && !scope.SubjectId.HasValue))
            throw new ForbiddenException("لا يوجد نطاق أكاديمي صالح للمدير");
        if (scope.SubjectId.HasValue) query = query.Where(exam => exam.SubjectId == scope.SubjectId);
        if (scope.YearId.HasValue) query = query.Where(exam => exam.Subject.Semester.AcademicYearId == scope.YearId);
        if (scope.CollegeId.HasValue) query = query.Where(exam => exam.Subject.Semester.AcademicYear.CollegeId == scope.CollegeId);
        if (scope.UniversityId.HasValue) query = query.Where(exam => exam.Subject.Semester.AcademicYear.College.UniversityId == scope.UniversityId);
        return query;
    }

    private static int NormalizePage(int page) => Math.Max(0, page - 1);
    private static int NormalizePageSize(int pageSize) => Math.Clamp(pageSize, 1, 100);
}
