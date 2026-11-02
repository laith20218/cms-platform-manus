using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Exams;
using CMS.Application.DTOs.Exams;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Exams;

/// <summary>
/// W14.2 D.1/D.2 — per-exam and per-question analytics for the admin console.
/// Numbers are computed over live rows (no materialized aggregates exist), scoped
/// to the caller's persisted academic scope like every other admin read.
/// Definitions: <c>Started</c> = every session ever created; <c>Attempts</c> =
/// scored attempts (Completed + TimedOut) — the population behind pass/fail,
/// mean, median, duration and distribution.
/// </summary>
public sealed class ExamStatsHandlers :
    IRequestHandler<GetExamStatsQuery, ExamStatsDto>,
    IRequestHandler<GetExamQuestionStatsQuery, List<ExamQuestionStatsDto>>
{
    private readonly IApplicationDbContext _db;
    private readonly IPermissionService _permissions;

    public ExamStatsHandlers(IApplicationDbContext db, IPermissionService permissions)
    {
        _db = db;
        _permissions = permissions;
    }

    /// <summary>Concrete projection row for one recorded answer (avoids dynamic dispatch).</summary>
    private sealed record AttemptRow(Guid QuestionId, string? SelectedAnswer, bool? IsCorrect, int? DurationSeconds);

    public async Task<ExamStatsDto> Handle(GetExamStatsQuery req, CancellationToken ct)
    {
        await EnsureExamInScopeAsync(req.ExamId, req.AdminId, ct);

        var sessions = await _db.ExamSessions.AsNoTracking()
            .Where(session => session.ExamId == req.ExamId)
            .Select(session => new { session.Status, session.Score, session.Passed, session.DurationSeconds })
            .ToListAsync(ct);

        var terminal = sessions.Where(session => session.Status is ExamSessionStatus.Completed or ExamSessionStatus.TimedOut).ToList();
        var scores = terminal.Where(session => session.Score.HasValue).Select(session => session.Score!.Value).OrderBy(score => score).ToList();
        var durations = terminal.Where(session => session.DurationSeconds.HasValue).Select(session => (double)session.DurationSeconds!.Value).ToList();

        var pass = terminal.Count(session => session.Passed == true);

        return new ExamStatsDto(
            req.ExamId,
            sessions.Count,
            terminal.Count,
            sessions.Count(session => session.Status == ExamSessionStatus.Completed),
            sessions.Count(session => session.Status == ExamSessionStatus.TimedOut),
            sessions.Count(session => session.Status == ExamSessionStatus.InProgress),
            sessions.Count(session => session.Status == ExamSessionStatus.Cancelled),
            pass,
            terminal.Count - pass,
            scores.Count == 0 ? null : Math.Round(scores.Average(), 2),
            scores.Count == 0 ? null : Median(scores),
            durations.Count == 0 ? 0 : Math.Round(durations.Average(), 1),
            BuildDistribution(scores));
    }

    public async Task<List<ExamQuestionStatsDto>> Handle(GetExamQuestionStatsQuery req, CancellationToken ct)
    {
        await EnsureExamInScopeAsync(req.ExamId, req.AdminId, ct);

        var composition = await _db.ExamQuestions.AsNoTracking()
            .Include(item => item.Question).ThenInclude(question => question.Options)
            .Where(item => item.ExamId == req.ExamId)
            .OrderBy(item => item.SortOrder)
            .ToListAsync(ct);

        var sessionIds = await _db.ExamSessions.AsNoTracking()
            .Where(session => session.ExamId == req.ExamId)
            .Select(session => session.Id)
            .ToListAsync(ct);

        var answers = await _db.AttemptLogs.AsNoTracking()
            .Where(answer => answer.ExamSessionId != null && sessionIds.Contains(answer.ExamSessionId!.Value))
            .Select(answer => new AttemptRow(answer.QuestionId, answer.SelectedAnswer, answer.IsCorrect, answer.DurationSeconds))
            .ToListAsync(ct);
        var answersByQuestion = answers.GroupBy(answer => answer.QuestionId).ToDictionary(group => group.Key, group => group.ToList());

        return composition.Select(item =>
        {
            var questionAnswers = answersByQuestion.GetValueOrDefault(item.QuestionId) ?? new List<AttemptRow>();
            var attempts = questionAnswers.Count;
            var correct = questionAnswers.Count(answer => answer.IsCorrect == true);
            var correctPercent = attempts == 0 ? 0 : Math.Round(correct / (double)attempts * 100, 2);
            var durations = questionAnswers
                .Where(answer => answer.DurationSeconds.HasValue)
                .Select(answer => (double)answer.DurationSeconds!.Value)
                .ToList();
            return new ExamQuestionStatsDto(
                item.QuestionId,
                item.Question.Text,
                item.SortOrder + 1,
                attempts,
                correctPercent,
                MostCommonWrongChoice(item.Question, questionAnswers),
                durations.Count == 0 ? null : Math.Round(durations.Average(), 1),
                attempts >= 10 && correctPercent < 40);
        }).ToList();
    }

    /// <summary>Most frequent wrong selection, rendered as its option letter + text when resolvable.</summary>
    private static string? MostCommonWrongChoice(Question question, IReadOnlyList<AttemptRow> answers)
    {
        var topRaw = answers.Where(answer => answer.IsCorrect == false && answer.SelectedAnswer != null)
            .GroupBy(answer => answer.SelectedAnswer!.Trim())
            .OrderByDescending(group => group.Count())
            .Select(group => group.Key)
            .FirstOrDefault();
        if (topRaw is null) return null;
        var option = question.Options.FirstOrDefault(option =>
            option.Id.ToString().Equals(topRaw, StringComparison.OrdinalIgnoreCase));
        return option is null ? topRaw : $"{option.OptionLetter}) {option.Text}";
    }

    private static double Median(List<double> orderedScores)
    {
        int mid = orderedScores.Count / 2;
        return orderedScores.Count % 2 == 1
            ? orderedScores[mid]
            : Math.Round((orderedScores[mid - 1] + orderedScores[mid]) / 2, 2);
    }

    /// <summary>Decile histogram over 0–100; the top bucket absorbs the 100 boundary.</summary>
    private static List<ScoreBucketDto> BuildDistribution(List<double> orderedScores)
    {
        var buckets = new List<ScoreBucketDto>();
        for (var from = 0; from <= 90; from += 10)
        {
            var to = from == 90 ? 100 : from + 9;
            var label = from == 90 ? "90-100" : $"{from}-{to}";
            var count = orderedScores.Count(score => score >= from && score <= to);
            buckets.Add(new ScoreBucketDto(label, count));
        }
        return buckets;
    }

    private async Task EnsureExamInScopeAsync(Guid examId, Guid adminId, CancellationToken ct)
    {
        if (!await _db.Exams.AsNoTracking().AnyAsync(exam => exam.Id == examId && exam.DeletedAt == null, ct))
            throw new NotFoundException("Exam", examId);
        if (!await _permissions.IsInScopeAsync(adminId, "exam", examId, ct))
            throw new ForbiddenException("الاختبار خارج نطاق صلاحية المدير");
    }
}
