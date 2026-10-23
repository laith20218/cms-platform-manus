using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Questions;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Application.Interfaces;

namespace CMS.Application.Handlers.Questions;

/// <summary>
/// Handles all question queries (read operations).
/// </summary>
public class QuestionQueryHandlers :
    IRequestHandler<GetQuestionsQuery, PagedResult<QuestionListItemDto>>,
    IRequestHandler<GetQuestionByIdQuery, QuestionDto>,
    IRequestHandler<GetQuestionsByLectureQuery, List<QuestionListItemDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IEntitlementService _entitlements;
    public QuestionQueryHandlers(IApplicationDbContext db, IEntitlementService entitlements)
    {
        _db = db;
        _entitlements = entitlements;
    }

    public async Task<PagedResult<QuestionListItemDto>> Handle(GetQuestionsQuery req, CancellationToken ct)
    {
        if (!req.StudentId.HasValue || !req.SubjectId.HasValue
            || !await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId.Value,
                req.SubjectId.Value,
                SubscriptionContentScope.QuestionsExams,
                ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى هذه المادة");

        var query = _db.Questions.AsNoTracking()
            .Where(q => q.Status == ContentStatus.Published);

        if (req.SubjectId.HasValue) query = query.Where(q => q.SubjectId == req.SubjectId);
        if (req.LectureId.HasValue) query = query.Where(q => q.LectureId == req.LectureId);
        if (req.ExamId.HasValue) query = query.Where(q => q.ExamId == req.ExamId);
        if (!string.IsNullOrEmpty(req.Difficulty) && Enum.TryParse<Difficulty>(req.Difficulty, true, out var diff))
            query = query.Where(q => q.Difficulty == diff);
        if (!string.IsNullOrEmpty(req.Search))
            query = query.Where(q => q.Text.Contains(req.Search));

        query = req.Sort.ToLower() switch
        {
            "difficulty" => req.Order == "asc" ? query.OrderBy(q => q.Difficulty) : query.OrderByDescending(q => q.Difficulty),
            "views" => query.OrderByDescending(q => q.ViewsCount),
            _ => req.Order == "asc" ? query.OrderBy(q => q.CreatedAt) : query.OrderByDescending(q => q.CreatedAt)
        };

        var total = await query.CountAsync(ct);
        var questions = await query
            .Skip((req.Page - 1) * req.PageSize)
            .Take(req.PageSize)
            .Include(q => q.Lecture)
            .ToListAsync(ct);

        // Batch favorite lookup — one query for the whole page, never per item.
        var favoriteIds = req.StudentId.HasValue
            ? (await _db.Favorites.AsNoTracking()
                .Where(f => f.StudentId == req.StudentId.Value
                    && f.QuestionId.HasValue
                    && questions.Select(q => q.Id).Contains(f.QuestionId.Value))
                .Select(f => f.QuestionId!.Value)
                .ToListAsync(ct))
                .ToHashSet()
            : new HashSet<Guid>();

        var items = questions.Select(q => MapToListItem(q, favoriteIds.Contains(q.Id))).ToList();

        // Load user answers if studentId provided
        if (req.StudentId.HasValue)
        {
            var questionIds = questions.Select(q => q.Id).ToList();
            var attempts = await _db.AttemptLogs
                .Where(a => a.StudentId == req.StudentId && questionIds.Contains(a.QuestionId))
                .OrderBy(a => a.CreatedAt)
                .ToListAsync(ct);
            var userAnswers = attempts
                .GroupBy(a => a.QuestionId)
                .ToDictionary(g => g.Key, g => g.First());

            foreach (var item in items)
            {
                if (userAnswers.TryGetValue(item.Id, out var answer))
                {
                    var updated = item with
                    {
                        UserAnswer = new QuestionUserAnswerDto(
                            answer.SelectedAnswer, answer.IsCorrect, answer.IsFirstAttempt, answer.AnsweredAt
                        )
                    };
                    items[items.IndexOf(item)] = updated;
                }
            }
        }

        return new PagedResult<QuestionListItemDto>(items, total, req.Page, req.PageSize, (int)Math.Ceiling(total / (double)req.PageSize));
    }

    public async Task<QuestionDto> Handle(GetQuestionByIdQuery req, CancellationToken ct)
    {
        if (!req.StudentId.HasValue || !await _entitlements.CanAccessQuestionAsync(req.StudentId.Value, req.Id, "read", ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى هذا السؤال");

        var question = await _db.Questions.AsNoTracking()
            .Include(q => q.Options.OrderBy(o => o.SortOrder))
            .Include(q => q.Images)
            .Include(q => q.Lecture)
            .FirstOrDefaultAsync(q => q.Id == req.Id && q.Status == ContentStatus.Published, ct)
            ?? throw new NotFoundException("Question", req.Id);

        var isFavorite = req.StudentId.HasValue && await _db.Favorites.AsNoTracking()
            .AnyAsync(f => f.StudentId == req.StudentId.Value && f.QuestionId == req.Id, ct);

        var dto = MapToDto(question, isFavorite);

        // Load user answer if student
        if (req.StudentId.HasValue)
        {
            var answer = await _db.AttemptLogs
                .Where(a => a.StudentId == req.StudentId && a.QuestionId == req.Id)
                .OrderBy(a => a.CreatedAt)
                .FirstOrDefaultAsync(ct);

            if (answer != null)
            {
                dto = dto with
                {
                    UserAnswer = new QuestionUserAnswerDto(answer.SelectedAnswer, answer.IsCorrect, answer.IsFirstAttempt, answer.AnsweredAt),
                    // Only show correct answer + explanation if already answered
                    Options = question.Options.Select(o => new QuestionOptionDto(o.Id, o.OptionLetter, o.Text, o.ImageUrl)).ToList(),
                };
            }
        }

        return dto;
    }

    public async Task<List<QuestionListItemDto>> Handle(GetQuestionsByLectureQuery req, CancellationToken ct)
    {
        var subjectId = await _db.Lectures.AsNoTracking()
            .Where(lecture => lecture.Id == req.LectureId && lecture.Status == "active" && lecture.DeletedAt == null)
            .Select(lecture => (Guid?)lecture.SubjectId)
            .FirstOrDefaultAsync(ct);
        if (!req.StudentId.HasValue || !subjectId.HasValue
            || !await _entitlements.CanAccessSubjectContentAsync(
                req.StudentId.Value,
                subjectId.Value,
                SubscriptionContentScope.QuestionsExams,
                ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى أسئلة هذه المحاضرة");

        var questions = await _db.Questions.AsNoTracking()
            .Where(q => q.LectureId == req.LectureId && q.SubjectId == subjectId.Value && q.Status == ContentStatus.Published)
            .OrderBy(q => q.CreatedAt)
            .Include(q => q.Lecture)
            .ToListAsync(ct);

        // Batch favorite lookup — one query for the whole lecture, never per item.
        var favoriteIds = req.StudentId.HasValue
            ? (await _db.Favorites.AsNoTracking()
                .Where(f => f.StudentId == req.StudentId.Value
                    && f.QuestionId.HasValue
                    && questions.Select(q => q.Id).Contains(f.QuestionId.Value))
                .Select(f => f.QuestionId!.Value)
                .ToListAsync(ct))
                .ToHashSet()
            : new HashSet<Guid>();

        return questions.Select(q => MapToListItem(q, favoriteIds.Contains(q.Id))).ToList();
    }

    // ===== Mappers =====
    private static QuestionListItemDto MapToListItem(Question q, bool isFavorite) => new(
        q.Id, q.Text.Length > 150 ? q.Text[..150] + "..." : q.Text,
        q.Type.ToString(), q.Difficulty.ToString(),
        q.Tags, q.Lecture?.NameAr, q.Year, null, isFavorite
    );

    private static QuestionDto MapToDto(Question q, bool isFavorite) => new(
        q.Id, q.Text, q.TextHtml, q.Type.ToString(), q.Difficulty.ToString(),
        q.Tags, q.Lecture?.NameAr, q.Year, q.Reference,
        q.Options.OrderBy(o => o.SortOrder).Select(o => new QuestionOptionDto(o.Id, o.OptionLetter, o.Text, o.ImageUrl)).ToList(),
        q.Images.Select(img => new QuestionImageDto(img.Id, img.ImageUrl, img.AltText, img.Caption)).ToList(),
        null, isFavorite, new QuestionStatsDto(q.AttemptsCount, q.GetCorrectRate())
    );
}

/// <summary>
/// Handles question create/update/delete/publish/archive commands.
/// </summary>
public class QuestionCommandHandlers :
    IRequestHandler<CreateQuestionCommand, QuestionDto>,
    IRequestHandler<UpdateQuestionCommand, QuestionDto>,
    IRequestHandler<DeleteQuestionCommand, Unit>,
    IRequestHandler<PublishQuestionCommand, Unit>,
    IRequestHandler<ArchiveQuestionCommand, Unit>,
    IRequestHandler<AnswerQuestionCommand, AnswerResultDto>,
    IRequestHandler<ReportQuestionCommand, Unit>,
    IRequestHandler<ImportQuestionsCommand, ImportResultDto>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IEntitlementService _entitlements;

    public QuestionCommandHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork, IEntitlementService entitlements)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _entitlements = entitlements;
    }

    public async Task<QuestionDto> Handle(CreateQuestionCommand req, CancellationToken ct)
    {
        var type = Enum.Parse<QuestionType>(req.Type, true);
        var difficulty = Enum.Parse<Difficulty>(req.Difficulty, true);

        var question = Question.Create(req.Text, type, req.SubjectId, req.LectureId, difficulty, req.Tags, req.CreatedBy);
        question.UpdateExplanation(req.Explanation);
        if (req.Reference != null) question.SetReference(req.Reference);
        if (req.Year.HasValue) typeof(Question).GetProperty("Year")?.SetValue(question, req.Year);

        if (type == QuestionType.Essay)
        {
            question.SetCorrectAnswer(req.CorrectAnswer ?? string.Empty);
        }
        else
        {
            for (var i = 0; i < req.Options.Count; i++)
            {
                var opt = req.Options[i];
                question.AddOption(opt.Text, opt.IsCorrect, ((char)('A' + i)).ToString());
            }
        }

        await _db.Questions.AddAsync(question, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return new QuestionDto(
            question.Id, question.Text, question.TextHtml, question.Type.ToString(),
            question.Difficulty.ToString(), question.Tags, null, req.Year, req.Reference,
            question.Options.OrderBy(o => o.SortOrder).Select(o => new QuestionOptionDto(o.Id, o.OptionLetter, o.Text, o.ImageUrl)).ToList(),
            new List<QuestionImageDto>(), null, false, new QuestionStatsDto(0, 0)
        );
    }

    public async Task<QuestionDto> Handle(UpdateQuestionCommand req, CancellationToken ct)
    {
        var question = await _db.Questions
            .Include(q => q.Options)
            .FirstOrDefaultAsync(q => q.Id == req.Id, ct)
            ?? throw new NotFoundException("Question", req.Id);

        // Update basic info via reflection
        typeof(Question).GetProperty("Text")?.SetValue(question, req.Text);
        typeof(Question).GetProperty("Difficulty")?.SetValue(question, Enum.Parse<Difficulty>(req.Difficulty, true));
        question.UpdateExplanation(req.Explanation);
        if (req.Reference != null) question.SetReference(req.Reference);
        typeof(Question).GetProperty("Tags")?.SetValue(question, req.Tags);

        if (question.Type == QuestionType.Essay)
        {
            if (!string.IsNullOrWhiteSpace(req.CorrectAnswer)) question.SetCorrectAnswer(req.CorrectAnswer);
        }
        else
        {
            _db.QuestionOptions.RemoveRange(question.Options);
            question.Options.Clear();
            for (var i = 0; i < req.Options.Count; i++)
            {
                var opt = req.Options[i];
                question.AddOption(opt.Text, opt.IsCorrect, ((char)('A' + i)).ToString());
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new QuestionDto(
            question.Id, question.Text, question.TextHtml, question.Type.ToString(),
            question.Difficulty.ToString(), question.Tags, null, question.Year, question.Reference,
            question.Options.OrderBy(o => o.SortOrder).Select(o => new QuestionOptionDto(o.Id, o.OptionLetter, o.Text, o.ImageUrl)).ToList(),
            new List<QuestionImageDto>(), null, false, new QuestionStatsDto(question.AttemptsCount, question.GetCorrectRate())
        );
    }

    public async Task<Unit> Handle(DeleteQuestionCommand req, CancellationToken ct)
    {
        var question = await _db.Questions.FirstOrDefaultAsync(q => q.Id == req.Id, ct)
            ?? throw new NotFoundException("Question", req.Id);
        question.SoftDelete(req.DeletedBy);
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(PublishQuestionCommand req, CancellationToken ct)
    {
        var question = await _db.Questions
            .Include(q => q.Options)
            .FirstOrDefaultAsync(q => q.Id == req.Id, ct)
            ?? throw new NotFoundException("Question", req.Id);
        question.Publish();
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(ArchiveQuestionCommand req, CancellationToken ct)
    {
        var question = await _db.Questions.FirstOrDefaultAsync(q => q.Id == req.Id, ct)
            ?? throw new NotFoundException("Question", req.Id);
        question.Archive();
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    /// <summary>
    /// Handles answering a question - records attempt, updates stats, returns feedback.
    /// </summary>
    public async Task<AnswerResultDto> Handle(AnswerQuestionCommand req, CancellationToken ct)
    {
        if (!await _entitlements.CanAccessQuestionAsync(req.StudentId, req.QuestionId, "answer", ct))
            throw new ForbiddenException("لا تملك صلاحية الإجابة عن هذا السؤال");

        var question = await _db.Questions
            .Include(q => q.Options)
            .FirstOrDefaultAsync(q => q.Id == req.QuestionId && q.Status == ContentStatus.Published, ct)
            ?? throw new NotFoundException("Question", req.QuestionId);

        // Check if first attempt
        var isFirstAttempt = !await _db.AttemptLogs.AnyAsync(a => a.StudentId == req.StudentId && a.QuestionId == req.QuestionId, ct);

        // Essay answers are compared only after whitespace/case normalization. They are not AI-graded.
        var correctOptions = question.Options.Where(o => o.IsCorrect).ToList();
        var correctOption = correctOptions.FirstOrDefault();
        var submittedAnswer = question.Type == QuestionType.Essay
            ? req.AnswerText?.Trim()
            : req.SelectedOptionId;
        if (string.IsNullOrWhiteSpace(submittedAnswer))
            throw new DomainException(question.Type == QuestionType.Essay ? "An answer is required" : "An option is required");
        bool isCorrect;
        if (question.Type == QuestionType.Essay)
        {
            isCorrect = string.Equals(NormalizeAnswer(submittedAnswer), NormalizeAnswer(question.CorrectAnswer), StringComparison.Ordinal);
        }
        else if (question.Type == QuestionType.MultipleSelect)
        {
            // Multi-select practice answers mirror the exam-engine contract: a JSON array of
            // option ids (comma-separated ids are accepted as a legacy fallback). The submitted
            // set must match the correct set exactly — no missing, no extra, no duplicates.
            var expectedIds = correctOptions.Select(o => o.Id).ToHashSet();
            var selectedIds = ParseSelectedOptionIds(submittedAnswer);
            isCorrect = selectedIds.Count > 0 && selectedIds.ToHashSet().SetEquals(expectedIds);
        }
        else
        {
            isCorrect = submittedAnswer == correctOption?.Id.ToString();
        }

        // Record attempt
        var attempt = new AttemptLog
        {
            StudentId = req.StudentId,
            QuestionId = req.QuestionId,
            SelectedAnswer = submittedAnswer,
            IsCorrect = isCorrect,
            IsFirstAttempt = isFirstAttempt,
            AttemptNumber = await _db.AttemptLogs.CountAsync(a => a.StudentId == req.StudentId && a.QuestionId == req.QuestionId, ct) + 1,
            DurationSeconds = req.DurationSeconds,
            IsOffline = req.IsOffline
        };
        await _db.AttemptLogs.AddAsync(attempt, ct);

        // Update question stats
        question.RecordAttempt(isCorrect);

        // Update student stats
        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == req.StudentId, ct);
        if (student != null)
        {
            student.RecordActivity();
            student.RecordAnswer(isCorrect);
        }

        await _unitOfWork.SaveChangesAsync(ct);

        // Build response
        var correctOptionIdDisplay = question.Type == QuestionType.MultipleSelect
            ? string.Join(",", correctOptions.Select(o => o.Id))
            : correctOption?.Id.ToString() ?? "";
        var correctOptionLetterDisplay = question.Type == QuestionType.MultipleSelect
            ? string.Join(",", correctOptions.Select(o => o.OptionLetter))
            : correctOption?.OptionLetter ?? "";
        return new AnswerResultDto(
            IsCorrect: isCorrect,
            CorrectOptionId: correctOptionIdDisplay,
            CorrectOptionLetter: correctOptionLetterDisplay,
            Explanation: question.Explanation,
            ExplanationHtml: question.ExplanationHtml,
            Reference: question.Reference,
            IsFirstAttempt: isFirstAttempt,
            NewAchievements: new List<AchievementDto>(), // TODO: Check achievements
            UpdatedStats: student != null ? new UpdatedStatsDto(
                student.QuestionsAnswered,
                student.CorrectAnswers,
                student.GetAccuracy(),
                student.CurrentStreak
            ) : null,
            CorrectAnswerText: question.Type == QuestionType.Essay ? question.CorrectAnswer : null
        );
    }

    private static string NormalizeAnswer(string value) => string.Join(' ', value.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();

    /// <summary>
    /// Parses a multi-select answer payload. Identical semantics to the exam engine:
    /// a JSON array of option ids, with a comma-separated list accepted as a legacy fallback.
    /// </summary>
    private static IReadOnlyCollection<Guid> ParseSelectedOptionIds(string answer)
    {
        try
        {
            using var document = System.Text.Json.JsonDocument.Parse(answer);
            if (document.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                return document.RootElement.EnumerateArray()
                    .Where(element => Guid.TryParse(element.GetString(), out _))
                    .Select(element => Guid.Parse(element.GetString()!))
                    .Distinct()
                    .ToList();
            }
        }
        catch (System.Text.Json.JsonException)
        {
            // Existing client contracts submit one GUID directly; parse it below.
        }
        return answer.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => Guid.TryParse(value, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();
    }

    public async Task<Unit> Handle(ReportQuestionCommand req, CancellationToken ct)
    {
        var question = await _db.Questions.FirstOrDefaultAsync(q => q.Id == req.QuestionId, ct)
            ?? throw new NotFoundException("Question", req.QuestionId);

        if (!Enum.TryParse<ErrorReportReason>(req.ReasonType, true, out var reasonType))
            throw new DomainException("سبب التقرير غير صالح", "INVALID_REPORT_REASON");

        var report = new ErrorReport
        {
            StudentId = req.StudentId,
            QuestionId = req.QuestionId,
            ReasonType = reasonType,
            Description = req.Description,
            ScreenshotUrl = req.ScreenshotUrl,
            Status = ErrorReportStatus.Pending
        };

        await _db.ErrorReports.AddAsync(report, ct);
        question.IncrementReports();
        await _unitOfWork.SaveChangesAsync(ct);
        return Unit.Value;
    }

    /// <summary>
    /// Bulk import questions from Excel/CSV data.
    /// </summary>
    public async Task<ImportResultDto> Handle(ImportQuestionsCommand req, CancellationToken ct)
    {
        int success = 0, failed = 0;
        var errors = new List<string>();

        for (int i = 0; i < req.Questions.Count; i++)
        {
            var row = req.Questions[i];
            try
            {
                if (string.IsNullOrWhiteSpace(row.Text)) throw new Exception("نص السؤال مطلوب");
                if (string.IsNullOrWhiteSpace(row.CorrectOption)) throw new Exception("الإجابة الصحيحة مطلوبة");
                if (!Enum.TryParse<Difficulty>(row.Difficulty, true, out var diff)) diff = Difficulty.Medium;

                var tags = row.Tags?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList() ?? new();

                var question = Question.Create(row.Text, QuestionType.Mcq, req.SubjectId, req.LectureId, diff, tags, req.CreatedBy);
                question.UpdateExplanation(row.Explanation);
                if (row.Reference != null) question.SetReference(row.Reference);
                if (row.Year.HasValue) typeof(Question).GetProperty("Year")?.SetValue(question, row.Year);

                // Add options
                var correctLetter = row.CorrectOption.ToUpper().Trim();
                question.AddOption(row.OptionA, correctLetter == "A");
                if (!string.IsNullOrWhiteSpace(row.OptionB)) question.AddOption(row.OptionB, correctLetter == "B");
                if (!string.IsNullOrWhiteSpace(row.OptionC)) question.AddOption(row.OptionC, correctLetter == "C");
                if (!string.IsNullOrWhiteSpace(row.OptionD)) question.AddOption(row.OptionD, correctLetter == "D");

                await _db.Questions.AddAsync(question, ct);
                success++;
            }
            catch (Exception ex)
            {
                failed++;
                errors.Add($"السطر {i + 1}: {ex.Message}");
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);
        return new ImportResultDto(req.Questions.Count, success, failed, errors);
    }
}
