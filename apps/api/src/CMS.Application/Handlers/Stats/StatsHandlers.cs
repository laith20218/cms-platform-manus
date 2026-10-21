using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Stats;
using CMS.Application.DTOs.Stats;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Stats;

/// <summary>
/// Handles statistics queries: student stats, leaderboard, global stats.
/// </summary>
public class StatsHandlers :
    IRequestHandler<GetStudentStatsQuery, StudentStatsDto>,
    IRequestHandler<GetLeaderboardQuery, LeaderboardDto>,
    IRequestHandler<GetGlobalStatsQuery, GlobalStatsDto>
{
    private readonly IApplicationDbContext _db;
    private readonly ICacheService _cache;
    private readonly IEntitlementService _entitlements;

    public StatsHandlers(IApplicationDbContext db, ICacheService cache, IEntitlementService entitlements)
    {
        _db = db;
        _cache = cache;
        _entitlements = entitlements;
    }

    // ===== Student Stats =====
    public async Task<StudentStatsDto> Handle(GetStudentStatsQuery req, CancellationToken ct)
    {
        var cacheKey = $"stats:student:{req.StudentId}:{req.Period}";
        var cached = await _cache.GetAsync<StudentStatsDto?>(cacheKey, ct);
        if (cached != null) return cached;

        var student = await _db.Students.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == req.StudentId, ct)
            ?? throw new Domain.Exceptions.NotFoundException("Student", req.StudentId);

        // Get period cutoff
        var cutoff = req.Period switch
        {
            "week" => DateTime.UtcNow.AddDays(-7),
            "month" => DateTime.UtcNow.AddMonths(-1),
            _ => DateTime.MinValue
        };

        var attempts = await _db.AttemptLogs.AsNoTracking()
            .Where(a => a.StudentId == req.StudentId && a.CreatedAt >= cutoff)
            .Include(a => a.Question)
                .ThenInclude(question => question.Subject)
            .ToListAsync(ct);

        var totalQuestions = attempts.Count;
        var correctAnswers = attempts.Count(a => a.IsCorrect);
        var accuracy = totalQuestions > 0 ? (double)correctAnswers / totalQuestions * 100 : 0;

        var studyTimeMinutes = attempts.Sum(a => a.DurationSeconds ?? 0) / 60;

        var examsCompleted = await _db.ExamSessions
            .CountAsync(s => s.StudentId == req.StudentId && s.Status == ExamSessionStatus.Completed && s.CompletedAt >= cutoff, ct);

        var favoriteCount = await _db.Favorites.CountAsync(f => f.StudentId == req.StudentId, ct);
        var completedLectures = await _db.LectureCompletions.AsNoTracking()
            .CountAsync(completion => completion.StudentId == req.StudentId && completion.CompletedAt >= cutoff, ct);
        var readFiles = await _db.LibraryViews.AsNoTracking()
            .Where(view => view.StudentId == req.StudentId && view.ViewedAt >= cutoff)
            .Select(view => view.FileId)
            .Distinct()
            .CountAsync(ct);

        // By subject. Completion counts unique answered questions against the
        // currently published bank, never raw attempts (which may be repeated).
        var subjectGroups = attempts
            .GroupBy(a => new { a.Question.SubjectId, a.Question.Subject.NameAr })
            .ToList();
        var subjectIds = subjectGroups.Select(group => group.Key.SubjectId).ToList();
        var publishedQuestionsBySubject = subjectIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await _db.Questions.AsNoTracking()
                .Where(question => subjectIds.Contains(question.SubjectId) && question.Status == ContentStatus.Published)
                .GroupBy(question => question.SubjectId)
                .Select(group => new { SubjectId = group.Key, Count = group.Count() })
                .ToDictionaryAsync(item => item.SubjectId, item => item.Count, ct);

        var bySubject = subjectGroups
            .Select(group =>
            {
                var answeredDistinct = group.Select(attempt => attempt.QuestionId).Distinct().Count();
                var publishedCount = publishedQuestionsBySubject.GetValueOrDefault(group.Key.SubjectId);
                var completedPercentage = publishedCount == 0 ? 0 : (double)answeredDistinct / publishedCount * 100;
                return new SubjectStatsDto(
                    group.Key.SubjectId,
                    group.Key.NameAr,
                    answeredDistinct,
                    group.Average(attempt => attempt.IsCorrect ? 100.0 : 0),
                    completedPercentage);
            })
            .OrderByDescending(stat => stat.QuestionsAnswered)
            .Take(10)
            .ToList();

        // By difficulty
        var byDifficulty = new DifficultyStatsDto(
            CalcDifficulty(attempts, Difficulty.Easy),
            CalcDifficulty(attempts, Difficulty.Medium),
            CalcDifficulty(attempts, Difficulty.Hard)
        );

        var result = new StudentStatsDto(
            totalQuestions, correctAnswers, accuracy,
            student.CurrentStreak, student.LongestStreak,
            studyTimeMinutes, examsCompleted, favoriteCount,
            bySubject, byDifficulty, completedLectures, readFiles
        );

        await _cache.SetAsync(cacheKey, result, TimeSpan.FromMinutes(5), ct);
        return result;
    }

    // ===== Leaderboard =====
    public async Task<LeaderboardDto> Handle(GetLeaderboardQuery req, CancellationToken ct)
    {
        // ABAC enforcement: only subject-scoped leaderboards are supported.
        // year/college/all scopes would leak cross-cohort rankings because there is no
        // entitlement path for them yet. Reject with 403 and record a security event
        // surface via ForbiddenException (the caller's ExceptionHandlingMiddleware logs 403s).
        if (!string.Equals(req.Scope, "subject", StringComparison.OrdinalIgnoreCase) || !req.ScopeId.HasValue)
            throw new ForbiddenException("يرفض النظام طلبات لوحة المتصدرين خارج نطاق مادة محددة");

        if (!req.StudentId.HasValue)
            throw new ForbiddenException("هوية الطالب مطلوبة للوصول إلى لوحة المتصدرين");

        // Server-side entitlement check: the student must have an active grant for the requested subject.
        // A valid-looking Guid that the student has no entitlement for must not leak cohort data.
        if (!await _entitlements.CanAccessSubjectAsync(req.StudentId.Value, req.ScopeId.Value, "read", ct))
            throw new ForbiddenException("لا تملك صلاحية الوصول إلى لوحة متصدرين هذه المادة");

        var cacheKey = $"leaderboard:{req.Scope}:{req.ScopeId}:{req.Period}:{req.Count}";
        var cached = await _cache.GetAsync<LeaderboardDto?>(cacheKey, ct);
        if (cached != null) return cached;

        var cutoff = req.Period switch
        {
            "week" => DateTime.UtcNow.AddDays(-7),
            "month" => DateTime.UtcNow.AddMonths(-1),
            _ => DateTime.MinValue
        };

        // Build base query for first attempts only, scoped to the authorized subject
        var query = _db.AttemptLogs.AsNoTracking()
            .Where(a => a.IsFirstAttempt && a.CreatedAt >= cutoff && a.Question.SubjectId == req.ScopeId.Value)
            .Include(a => a.Student)
            .Include(a => a.Question)
            .ThenInclude(q => q.Subject);

        var attempts = await query.ToListAsync(ct);

        // Group by student
        var rankings = attempts
            .GroupBy(a => new { a.StudentId, a.Student.FullName, a.Student.AvatarUrl })
            .Select(g => new LeaderboardEntryDto(
                0, // Rank will be assigned below
                g.Key.StudentId, g.Key.FullName, g.Key.AvatarUrl,
                g.Count(), g.Average(a => a.IsCorrect ? 100.0 : 0),
                false
            ))
            .OrderByDescending(r => r.Accuracy)
            .ThenByDescending(r => r.QuestionsAnswered)
            .Take(req.Count)
            .ToList();

        // Assign ranks
        for (int i = 0; i < rankings.Count; i++)
        {
            var entry = rankings[i];
            rankings[i] = entry with { Rank = i + 1, IsYou = req.StudentId.HasValue && entry.StudentId == req.StudentId.Value };
        }

        // Find student's rank (even if outside top N)
        LeaderboardEntryDto? yourRank = null;
        if (req.StudentId.HasValue)
        {
            yourRank = rankings.FirstOrDefault(r => r.StudentId == req.StudentId.Value);
            if (yourRank == null)
            {
                // Student not in top N - calculate their actual rank
                var studentAttempts = attempts.Where(a => a.StudentId == req.StudentId.Value).ToList();
                if (studentAttempts.Any())
                {
                    var studentAccuracy = studentAttempts.Average(a => a.IsCorrect ? 100.0 : 0);
                    var studentCount = studentAttempts.Count;
                    var rank = attempts
                        .GroupBy(a => a.StudentId)
                        .Select(g => new { Acc = g.Average(a => a.IsCorrect ? 100.0 : 0), Cnt = g.Count() })
                        .Count(x => x.Acc > studentAccuracy || (x.Acc == studentAccuracy && x.Cnt > studentCount)) + 1;

                    yourRank = new LeaderboardEntryDto(rank, req.StudentId.Value,
                        studentAttempts.First().Student.FullName, studentAttempts.First().Student.AvatarUrl,
                        studentCount, studentAccuracy, true);
                }
            }
        }

        var result = new LeaderboardDto(rankings, yourRank);
        await _cache.SetAsync(cacheKey, result, TimeSpan.FromHours(1), ct);
        return result;
    }

    // ===== Global Stats =====
    public async Task<GlobalStatsDto> Handle(GetGlobalStatsQuery req, CancellationToken ct)
    {
        var cacheKey = "stats:global";
        var cached = await _cache.GetAsync<GlobalStatsDto?>(cacheKey, ct);
        if (cached != null) return cached;

        var totalStudents = await _db.Students.CountAsync(s => s.DeletedAt == null, ct);
        var totalQuestions = await _db.Questions.CountAsync(q => q.Status == ContentStatus.Published, ct);
        var totalAnswers = await _db.AttemptLogs.CountAsync(ct);

        var correctAnswers = await _db.AttemptLogs.CountAsync(a => a.IsCorrect, ct);
        var platformAccuracy = totalAnswers > 0 ? (double)correctAnswers / totalAnswers * 100 : 0;

        var totalExamSessions = await _db.ExamSessions.CountAsync(s => s.Status == ExamSessionStatus.Completed, ct);
        var totalLibraryViews = await _db.LibraryViews.CountAsync(ct);

        // Most active subjects
        var mostActive = await _db.AttemptLogs.AsNoTracking()
            .Include(a => a.Question).ThenInclude(q => q.Subject)
            .GroupBy(a => new { a.Question.SubjectId, a.Question.Subject.NameAr })
            .Select(g => new SubjectActivityDto(g.Key.SubjectId, g.Key.NameAr, g.Count(), g.Average(a => a.IsCorrect ? 100.0 : 0)))
            .OrderByDescending(s => s.QuestionsAnswered)
            .Take(5)
            .ToListAsync(ct);

        // Hardest subjects (lowest accuracy, min 100 attempts)
        var hardest = await _db.AttemptLogs.AsNoTracking()
            .Include(a => a.Question).ThenInclude(q => q.Subject)
            .GroupBy(a => new { a.Question.SubjectId, a.Question.Subject.NameAr })
            .Where(g => g.Count() >= 100)
            .Select(g => new SubjectActivityDto(g.Key.SubjectId, g.Key.NameAr, g.Count(), g.Average(a => a.IsCorrect ? 100.0 : 0)))
            .OrderBy(s => s.Accuracy)
            .Take(5)
            .ToListAsync(ct);

        // Most viewed files
        var mostViewedFiles = await _db.LibraryFiles.AsNoTracking()
            .Where(f => f.Status == ContentStatus.Published)
            .OrderByDescending(f => f.ViewsCount)
            .Take(5)
            .Select(f => new FileViewStatsDto(f.Id, f.Title, f.Type.ToString(), f.ViewsCount))
            .ToListAsync(ct);

        // Hourly activity (last 24h)
        var last24h = DateTime.UtcNow.AddHours(-24);
        var hourlyLogs = await _db.AttemptLogs.AsNoTracking()
            .Where(a => a.CreatedAt >= last24h)
            .ToListAsync(ct);

        var hourlyActivity = Enumerable.Range(0, 24).Select(h => {
            var hourStart = DateTime.UtcNow.Date.AddHours(h);
            var hourEnd = hourStart.AddHours(1);
            var logs = hourlyLogs.Where(a => a.CreatedAt >= hourStart && a.CreatedAt < hourEnd);
            return new HourlyActivityDto(h, logs.Select(a => a.StudentId).Distinct().Count(), logs.Count());
        }).ToList();

        var result = new GlobalStatsDto(
            totalStudents, totalQuestions, totalAnswers, platformAccuracy,
            totalExamSessions, totalLibraryViews,
            mostActive, hardest, mostViewedFiles, hourlyActivity
        );

        await _cache.SetAsync(cacheKey, result, TimeSpan.FromMinutes(15), ct);
        return result;
    }

    // ===== Helper =====
    private static DifficultyStat CalcDifficulty(List<Domain.Entities.AttemptLog> attempts, Difficulty diff)
    {
        var filtered = attempts.Where(a => a.Question.Difficulty == diff).ToList();
        var answered = filtered.Count;
        var accuracy = answered > 0 ? (double)filtered.Count(a => a.IsCorrect) / answered * 100 : 0;
        return new DifficultyStat(answered, accuracy);
    }
}
