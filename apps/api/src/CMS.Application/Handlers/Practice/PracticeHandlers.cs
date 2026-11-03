using System.Text.Json;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Practice;
using CMS.Application.DTOs.Practice;
using CMS.Application.DTOs.Questions;
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
///
/// W14.4 (A.4/B.1) — categorized practice. The subject's questions grouped by
/// Lecture → ParagraphTag ("غير مصنف" when absent) start sessions whose question
/// set is the FILTER, not the anchor exam's composition: PracticeSession.ExamModelId
/// is a NOT-NULL persistence key (W14.1 schema, no migrations in this wave), so the
/// session anchors to the published exam whose composition best covers the filter,
/// while membership/totals/auto-complete are validated and computed against the
/// echoed (server-verified) filter on every request.
/// </summary>
public sealed class PracticeHandlers :
    IRequestHandler<StartPracticeSessionCommand, StartPracticeSessionResultDto>,
    IRequestHandler<SubmitPracticeAnswerCommand, SubmitPracticeAnswerResultDto>,
    IRequestHandler<ResetPracticeQuestionCommand, Unit>,
    IRequestHandler<ResetPracticeSessionCommand, Unit>,
    IRequestHandler<GetPracticeProgressQuery, PracticeProgressDto>,
    IRequestHandler<GetCategorizedPracticeTreeQuery, CategorizedPracticeTreeDto>,
    IRequestHandler<StartCategorizedPracticeCommand, StartCategorizedPracticeResultDto>
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
        // W14.4 (Phase 0 ruling): ANY active grant over the exam's subject opens
        // practice — same content-agnostic "read" gate as the exams surfaces.
        if (!await _entitlements.CanAccessSubjectAsync(req.StudentId, exam.SubjectId, "read", ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        // Idempotent get-or-create (mirrors StartExamSession semantics): a second
        // start request for the same open session returns it instead of duplicating.
        var (session, created) = await GetOrCreateSessionAsync(req.StudentId, req.ExamModelId, ct);

        // W14.4: the composition question set + persisted answer states ship with the
        // start response so the practice player renders (and resumes) in one round trip.
        var questions = await LoadCompositionQuestionsAsync(req.ExamModelId, ct);
        var answerStates = await LoadAnswerStatesAsync(session.Id, ct);
        return new StartPracticeSessionResultDto(
            session.Id, session.ExamModelId, created, session.Status.ToString(),
            session.StartedAt, session.LastAccessedAt, session.Score,
            questions.Count, questions, answerStates);
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

        // Membership: with a categorized lens the FILTER is the authority (subject +
        // lecture/tag, published, practice-eligible) — the anchor exam is a persistence
        // key only. Without it, the anchor's composition remains authoritative (W14.2):
        // the composition check runs on the raw id BEFORE any existence lookup, so a
        // foreign question id is a membership violation regardless of whether it exists.
        List<Guid>? setIds = null;
        int totalQuestions;
        Question question;
        if (req.Filter is not null)
        {
            question = await _db.Questions.AsNoTracking()
                .Include(item => item.Options)
                .FirstOrDefaultAsync(item => item.Id == req.QuestionId, ct)
                ?? throw new NotFoundException("Question", req.QuestionId);
            if (!MatchesFilter(question, exam.SubjectId, req.Filter))
                throw new BusinessRuleViolationException("السؤال لا ينتمي إلى هذا التصنيف");
            setIds = await ScopeToFilter(PracticeEligibleQuestions(exam.SubjectId), req.Filter)
                .Select(item => item.Id)
                .ToListAsync(ct);
            totalQuestions = setIds.Count;
        }
        else
        {
            var compositionIds = exam.ExamQuestions.Select(item => item.QuestionId).ToHashSet();
            if (!compositionIds.Contains(req.QuestionId))
                throw new BusinessRuleViolationException("السؤال لا ينتمي إلى نموذج التدريب هذا");
            totalQuestions = compositionIds.Count;
            question = await _db.Questions.AsNoTracking()
                .Include(item => item.Options)
                .FirstOrDefaultAsync(item => item.Id == req.QuestionId, ct)
                ?? throw new NotFoundException("Question", req.QuestionId);
        }

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

        // Persist the answer FIRST — completion is evaluated against the store, not the
        // un-saved change tracker (queries never see pending Added rows).
        await _unitOfWork.SaveChangesAsync(ct);

        decimal? score = null;
        if (totalQuestions > 0 && await AllGradedAsync(session.Id, totalQuestions, setIds, ct))
        {
            var correct = await SessionAnswers(session.Id, setIds)
                .CountAsync(item => item.IsCorrect == true, ct);
            score = Math.Round((decimal)correct / totalQuestions * 100, 2);
            session.Score = score;
            session.Status = PracticeSessionStatus.Completed;
            await _unitOfWork.SaveChangesAsync(ct);
        }

        var answeredCount = await SessionAnswers(session.Id, setIds).CountAsync(ct);

        // W14.4 (B.1): immediate-feedback disclosure — the same post-answer reveal the
        // question player has shipped since Push 4 (AnswerResultDto): correctness,
        // correct option ids (or the essay model answer) and the explanation.
        var correctOptionIds = question.Type == QuestionType.Essay
            ? new List<Guid>()
            : question.Options.Where(option => option.IsCorrect).Select(option => option.Id).ToList();
        return new SubmitPracticeAnswerResultDto(
            session.Id, req.QuestionId, isCorrect, answeredCount, totalQuestions, score, session.Status.ToString(),
            correctOptionIds,
            question.Type == QuestionType.Essay ? question.CorrectAnswer : null,
            question.Explanation, question.ExplanationHtml, question.Reference);
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

        // W14.4: with a filter, totals and counts are scoped to the filtered set.
        List<Guid>? setIds = null;
        int totalQuestions;
        if (req.Filter is not null)
        {
            setIds = await ScopeToFilter(PracticeEligibleQuestions(exam.SubjectId), req.Filter)
                .Select(item => item.Id)
                .ToListAsync(ct);
            totalQuestions = setIds.Count;
        }
        else
        {
            totalQuestions = exam.ExamQuestions.Count;
        }

        var answered = await SessionAnswers(session.Id, setIds).CountAsync(ct);
        var correct = await SessionAnswers(session.Id, setIds).CountAsync(item => item.IsCorrect == true, ct);
        var wrong = await SessionAnswers(session.Id, setIds).CountAsync(item => item.IsCorrect == false, ct);
        var ungraded = await SessionAnswers(session.Id, setIds).CountAsync(item => item.IsCorrect == null, ct);

        return new PracticeProgressDto(
            session.Id,
            session.ExamModelId,
            session.Status.ToString(),
            totalQuestions,
            answered,
            correct,
            wrong,
            ungraded,
            totalQuestions == 0 ? 0 : Math.Round(answered / (double)totalQuestions * 100, 2),
            session.Score,
            session.StartedAt,
            session.LastAccessedAt);
    }

    // ===== W14.4 (A.4) — categorized practice tree =====

    public async Task<CategorizedPracticeTreeDto> Handle(GetCategorizedPracticeTreeQuery req, CancellationToken ct)
    {
        if (!await _entitlements.CanAccessSubjectAsync(req.StudentId, req.SubjectId, "read", ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        var subject = await _db.Subjects.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == req.SubjectId, ct)
            ?? throw new NotFoundException("Subject", req.SubjectId);

        var questions = await PracticeEligibleQuestions(req.SubjectId)
            .Select(question => new
            {
                question.Id,
                question.LectureId,
                question.ParagraphTag,
                LectureTitle = question.Lecture != null ? question.Lecture.NameAr : null,
                LectureNumber = question.Lecture != null ? (int?)question.Lecture.LectureNumber : null
            })
            .ToListAsync(ct);

        var anchor = await ResolveAnchorAsync(req.SubjectId, null, ct);

        var lectures = questions
            .GroupBy(question => new { question.LectureId, question.LectureTitle, question.LectureNumber })
            .Select(group => new CategorizedPracticeLectureDto(
                group.Key.LectureId,
                group.Key.LectureTitle ?? "غير مصنف",
                group.Key.LectureNumber,
                group.Count(),
                group
                    .GroupBy(question => NormalizeTag(question.ParagraphTag))
                    .Select(tagGroup => new CategorizedPracticeGroupDto(tagGroup.Key, tagGroup.Count()))
                    .OrderBy(node => node.ParagraphTag is null ? 1 : 0) // غير مصنف last
                    .ThenBy(node => node.ParagraphTag, StringComparer.OrdinalIgnoreCase)
                    .ToList()))
            .OrderBy(node => node.LectureId is null ? 1 : 0) // uncategorized bucket last
            .ThenBy(node => node.LectureNumber ?? int.MaxValue)
            .ThenBy(node => node.LectureTitle, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new CategorizedPracticeTreeDto(
            req.SubjectId,
            subject.NameAr,
            questions.Count,
            questions.Count(question => question.LectureId is null),
            anchor?.Id,
            lectures);
    }

    // ===== W14.4 (A.4) — categorized session start =====

    public async Task<StartCategorizedPracticeResultDto> Handle(StartCategorizedPracticeCommand req, CancellationToken ct)
    {
        if (!await _entitlements.CanAccessSubjectAsync(req.StudentId, req.SubjectId, "read", ct))
            throw new ForbiddenException("لا تملك اشتراكاً صالحاً لهذه المادة");

        var filter = new PracticeCategoryFilter(req.LectureId, req.UntaggedLecture, req.ParagraphTag, req.UntaggedTag);
        var setIds = await ScopeToFilter(PracticeEligibleQuestions(req.SubjectId), filter)
            .Select(item => item.Id)
            .ToListAsync(ct);
        if (setIds.Count == 0)
            throw new BusinessRuleViolationException("لا توجد أسئلة منشورة في هذا التصنيف بعد");

        // Anchor = the published exam whose composition best covers the filtered set.
        // The anchor is a persistence/ownership key (NOT-NULL FK, W14.1 schema frozen
        // this wave); the filter — echoed and re-verified on every answer — is the
        // question-set authority.
        var anchor = await ResolveAnchorAsync(req.SubjectId, setIds, ct)
            ?? throw new BusinessRuleViolationException("لا يوجد نموذج امتحاني منشور لهذه المادة لتثبيت جلسة التدريب — جرّب لاحقاً");

        var (session, created) = await GetOrCreateSessionAsync(req.StudentId, anchor.Id, ct);
        var questions = await LoadFilteredQuestionsAsync(req.SubjectId, filter, ct);
        var answerStates = await LoadAnswerStatesAsync(session.Id, ct);

        return new StartCategorizedPracticeResultDto(
            session.Id, anchor.Id, created, session.Status.ToString(),
            session.StartedAt, session.LastAccessedAt, session.Score,
            questions.Count, questions, answerStates);
    }

    // ===== shared helpers =====

    private async Task<PracticeSession> LoadOwnedSessionAsync(Guid sessionId, Guid studentId, CancellationToken ct) =>
        await _db.PracticeSessions
            .FirstOrDefaultAsync(session => session.Id == sessionId && session.StudentId == studentId, ct)
        ?? throw new NotFoundException("PracticeSession", sessionId);

    private async Task<(PracticeSession Session, bool Created)> GetOrCreateSessionAsync(Guid studentId, Guid examModelId, CancellationToken ct)
    {
        var existing = await _db.PracticeSessions
            .FirstOrDefaultAsync(session => session.StudentId == studentId
                && session.ExamModelId == examModelId
                && session.Status == PracticeSessionStatus.InProgress, ct);
        if (existing is not null)
        {
            existing.LastAccessedAt = DateTime.UtcNow;
            await _unitOfWork.SaveChangesAsync(ct);
            return (existing, false);
        }

        var session = new PracticeSession
        {
            StudentId = studentId,
            ExamModelId = examModelId,
            StartedAt = DateTime.UtcNow,
            LastAccessedAt = DateTime.UtcNow,
            Status = PracticeSessionStatus.InProgress
        };
        await _db.PracticeSessions.AddAsync(session, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return (session, true);
    }

    /// <summary>Practice-eligible base set: published, not deleted, usable in practice (Practice|Both).</summary>
    private IQueryable<Question> PracticeEligibleQuestions(Guid subjectId) =>
        _db.Questions.AsNoTracking()
            .Where(question => question.SubjectId == subjectId
                && question.Status == ContentStatus.Published
                && question.DeletedAt == null
                && (question.QuestionUsage == QuestionUsage.Practice || question.QuestionUsage == QuestionUsage.Both));

    /// <summary>Applies the (lecture, paragraphTag) lens; Untagged* restricts to the "غير مصنف" bucket.</summary>
    private static IQueryable<Question> ScopeToFilter(IQueryable<Question> questions, PracticeCategoryFilter filter)
    {
        if (filter.UntaggedLecture) questions = questions.Where(question => question.LectureId == null);
        else if (filter.LectureId.HasValue) questions = questions.Where(question => question.LectureId == filter.LectureId.Value);
        if (filter.UntaggedTag) questions = questions.Where(question => question.ParagraphTag == null || question.ParagraphTag == "");
        else if (!string.IsNullOrWhiteSpace(filter.ParagraphTag)) questions = questions.Where(question => question.ParagraphTag == filter.ParagraphTag);
        return questions;
    }

    /// <summary>Single-question equivalent of ScopeToFilter (+ eligibility) for submit-time membership checks.</summary>
    private static bool MatchesFilter(Question question, Guid subjectId, PracticeCategoryFilter filter) =>
        question.SubjectId == subjectId
        && question.Status == ContentStatus.Published
        && question.DeletedAt == null
        && (question.QuestionUsage == QuestionUsage.Practice || question.QuestionUsage == QuestionUsage.Both)
        && (filter.UntaggedLecture
            ? question.LectureId == null
            : filter.LectureId.HasValue ? question.LectureId == filter.LectureId.Value : true)
        && (filter.UntaggedTag
            ? string.IsNullOrWhiteSpace(question.ParagraphTag)
            : string.IsNullOrWhiteSpace(filter.ParagraphTag) ? true : question.ParagraphTag == filter.ParagraphTag);

    /// <summary>Anchor pick: published exam of the subject whose composition covers most of the
    /// filtered set (tie → larger composition → earliest created → stable Id).</summary>
    private async Task<Exam?> ResolveAnchorAsync(Guid subjectId, IReadOnlyCollection<Guid>? coverageSet, CancellationToken ct)
    {
        var exams = await _db.Exams.AsNoTracking()
            .Include(exam => exam.ExamQuestions)
            .Where(exam => exam.SubjectId == subjectId && exam.Status == ContentStatus.Published && exam.DeletedAt == null)
            .ToListAsync(ct);
        if (exams.Count == 0) return null;
        return exams
            .OrderByDescending(exam => coverageSet is { Count: > 0 }
                ? exam.ExamQuestions.Count(item => coverageSet.Contains(item.QuestionId))
                : 0)
            .ThenByDescending(exam => exam.ExamQuestions.Count)
            .ThenBy(exam => exam.CreatedAt)
            .ThenBy(exam => exam.Id)
            .First();
    }

    private async Task<List<PracticeQuestionDto>> LoadCompositionQuestionsAsync(Guid examModelId, CancellationToken ct)
    {
        var pairs = await _db.ExamQuestions.AsNoTracking()
            .Where(item => item.ExamId == examModelId)
            .OrderBy(item => item.SortOrder)
            .Select(item => new { item.QuestionId, item.SortOrder })
            .ToListAsync(ct);
        if (pairs.Count == 0) return new List<PracticeQuestionDto>();

        var sortOrders = pairs.ToDictionary(pair => pair.QuestionId, pair => pair.SortOrder);
        var ids = pairs.Select(pair => pair.QuestionId).ToList();
        var questions = await _db.Questions.AsNoTracking()
            .Include(question => question.Lecture)
            .Include(question => question.Options)
            .Include(question => question.Images)
            .Where(question => ids.Contains(question.Id))
            .ToListAsync(ct);
        return questions
            .OrderBy(question => sortOrders.GetValueOrDefault(question.Id))
            .ThenBy(question => question.Id)
            .Select((question, index) => MapPracticeQuestion(question, index + 1))
            .ToList();
    }

    private async Task<List<PracticeQuestionDto>> LoadFilteredQuestionsAsync(Guid subjectId, PracticeCategoryFilter filter, CancellationToken ct)
    {
        var questions = await ScopeToFilter(PracticeEligibleQuestions(subjectId), filter)
            .Include(question => question.Lecture)
            .Include(question => question.Options)
            .Include(question => question.Images)
            .ToListAsync(ct);
        return questions
            .OrderBy(question => question.Lecture == null ? 1 : 0)
            .ThenBy(question => question.Lecture != null ? question.Lecture.LectureNumber : int.MaxValue)
            .ThenBy(question => NormalizeTag(question.ParagraphTag) is null ? 1 : 0)
            .ThenBy(question => NormalizeTag(question.ParagraphTag), StringComparer.OrdinalIgnoreCase)
            .ThenBy(question => question.CreatedAt)
            .ThenBy(question => question.Id)
            .Select((question, index) => MapPracticeQuestion(question, index + 1))
            .ToList();
    }

    private static PracticeQuestionDto MapPracticeQuestion(Question question, int number) => new(
        question.Id,
        number,
        question.Text,
        question.TextHtml,
        question.Type.ToString(),
        question.Difficulty.ToString(),
        NormalizeTag(question.ParagraphTag),
        question.Lecture?.NameAr,
        question.Options.OrderBy(option => option.SortOrder)
            .Select(option => new QuestionOptionDto(option.Id, option.OptionLetter, option.Text, option.ImageUrl))
            .ToList(),
        question.Images.OrderBy(image => image.SortOrder)
            .Select(image => new QuestionImageDto(image.Id, image.ImageUrl, image.AltText, image.Caption))
            .ToList());

    private static string? NormalizeTag(string? paragraphTag) =>
        string.IsNullOrWhiteSpace(paragraphTag) ? null : paragraphTag.Trim();

    /// <summary>W14.4 (B.1): the session's persisted answers, so a resumed run restores progress.</summary>
    private async Task<List<PracticeQuestionStateDto>> LoadAnswerStatesAsync(Guid sessionId, CancellationToken ct) =>
        await _db.PracticeAnswers.AsNoTracking()
            .Where(answer => answer.PracticeSessionId == sessionId)
            .OrderBy(answer => answer.AnsweredAt)
            .Select(answer => new PracticeQuestionStateDto(answer.QuestionId, 0, answer.SelectedAnswer, answer.IsCorrect, answer.AnsweredAt))
            .ToListAsync(ct);

    private IQueryable<PracticeAnswer> SessionAnswers(Guid sessionId, List<Guid>? setIds) =>
        setIds is null
            ? _db.PracticeAnswers.Where(item => item.PracticeSessionId == sessionId)
            : _db.PracticeAnswers.Where(item => item.PracticeSessionId == sessionId && setIds.Contains(item.QuestionId));

    private async Task<bool> AllGradedAsync(Guid sessionId, int totalQuestions, List<Guid>? setIds, CancellationToken ct) =>
        totalQuestions > 0 &&
        await SessionAnswers(sessionId, setIds).CountAsync(ct) >= totalQuestions &&
        await SessionAnswers(sessionId, setIds).CountAsync(item => item.IsCorrect == null, ct) == 0;

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

    private static readonly JsonSerializerOptions ExamJsonOptions = new(JsonSerializerDefaults.Web);
}
