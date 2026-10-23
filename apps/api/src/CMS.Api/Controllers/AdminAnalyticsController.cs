using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMS.Infrastructure.Persistence;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using System.Security.Claims;

namespace CMS.Api.Controllers;

/// <summary>
/// Wave 3 — Advanced analytics endpoints for the 8-tab ReportsCenter.
/// Each endpoint returns data for one tab. All require SuperAdmin.
/// All accept dateFrom/dateTo for range filtering.
/// </summary>
[ApiController]
[Route("api/v1/admin/analytics")]
[Authorize(Policy = "SuperAdmin")]
public class AdminAnalyticsController : ControllerBase
{
    private readonly ApplicationDbContext _db;

    public AdminAnalyticsController(ApplicationDbContext db) => _db = db;

    private Guid GetAdminId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id)
            ? id : throw new UnauthorizedAccessException();

    private (DateTime from, DateTime to) ParseRange(DateTime? dateFrom, DateTime? dateTo, int defaultDays = 30)
    {
        var to = dateTo ?? DateTime.UtcNow;
        var from = dateFrom ?? to.AddDays(-defaultDays);
        return (from, to);
    }

    // ===== Tab 2: Students =====

    /// <summary>
    /// Student analytics: registration growth, active users, inactive students, export.
    /// </summary>
    [HttpGet("students")]
    public async Task<IActionResult> GetStudentsAnalytics(
        [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo, [FromQuery] int inactiveDays = 14, CancellationToken ct = default)
    {
        var (from, to) = ParseRange(dateFrom, dateTo, 30);
        var totalStudents = await _db.Students.CountAsync(s => s.DeletedAt == null, ct);
        var newRegistrations = await _db.Students.CountAsync(s => s.CreatedAt >= from && s.CreatedAt <= to, ct);
        var inactiveThreshold = DateTime.UtcNow.AddDays(-inactiveDays);
        var inactiveStudents = await _db.Students.CountAsync(s => s.DeletedAt == null && (s.LastActivityDate == null || s.LastActivityDate < inactiveThreshold), ct);
        var activeStudents = totalStudents - inactiveStudents;

        // Daily breakdown — server-side query (translatable) + client-side formatting.
        // NOTE: DateTime.ToString("yyyy-MM-dd") is NOT translatable by Npgsql EF Core.
        // We materialize the raw Date first, then format on the client. See
        // EXECUTION_STATUS.md → "Critical Testing Gap" for why InMemory tests
        // did not catch this (was a 500 in production).
        var rawBreakdown = await _db.Students.AsNoTracking()
            .Where(s => s.CreatedAt >= from && s.CreatedAt <= to)
            .GroupBy(s => s.CreatedAt.Date)
            .Select(g => new { date = g.Key, registrations = g.Count() })
            .OrderBy(x => x.date)
            .ToListAsync(ct);
        var dailyBreakdown = rawBreakdown
            .Select(x => new { date = x.date.ToString("yyyy-MM-dd"), x.registrations })
            .ToList();

        return Ok(new
        {
            totalStudents,
            newRegistrations,
            activeStudents,
            inactiveStudents,
            inactiveThresholdDate = inactiveThreshold,
            dailyBreakdown,
        });
    }

    // ===== Tab 3: Academic Performance =====

    /// <summary>
    /// Academic performance: per-subject pass rates, average scores, hardest subjects.
    /// </summary>
    [HttpGet("academic")]
    public async Task<IActionResult> GetAcademicPerformance(
        [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo, CancellationToken ct = default)
    {
        var (from, to) = ParseRange(dateFrom, dateTo, 90);

        var subjectStats = await _db.ExamSessions.AsNoTracking()
            .Where(es => es.CompletedAt >= from && es.CompletedAt <= to && es.Status == Domain.Enums.ExamSessionStatus.Completed)
            .Join(_db.Exams, es => es.ExamId, e => e.Id, (es, e) => new { es, e })
            .Join(_db.Subjects, x => x.e.SubjectId, s => s.Id, (x, s) => new { x.es, x.e, s })
            .GroupBy(x => new { x.s.Id, x.s.NameAr })
            .Select(g => new
            {
                subjectId = g.Key.Id,
                subjectName = g.Key.NameAr,
                totalAttempts = g.Count(),
                passedCount = g.Count(x => x.es.Passed == true),
                averageScore = g.Average(x => x.es.Score ?? 0),
            })
            .OrderByDescending(x => x.totalAttempts)
            .Take(20)
            .ToListAsync(ct);

        var hardestQuestions = await _db.AttemptLogs.AsNoTracking()
            .Where(a => a.CreatedAt >= from && a.CreatedAt <= to)
            .Join(_db.Questions, a => a.QuestionId, q => q.Id, (a, q) => new { a, q })
            .GroupBy(x => new { x.q.Id, x.q.Text })
            .Select(g => new
            {
                questionId = g.Key.Id,
                questionText = g.Key.Text,
                totalAttempts = g.Count(),
                correctRate = g.Count(x => x.a.IsCorrect) * 100.0 / g.Count(),
            })
            .OrderBy(x => x.correctRate)
            .Take(10)
            .ToListAsync(ct);

        return Ok(new
        {
            subjectStats = subjectStats.Select(s => new
            {
                s.subjectId, s.subjectName,
                s.totalAttempts,
                passRate = s.totalAttempts > 0 ? s.passedCount * 100.0 / s.totalAttempts : 0,
                averageScore = Math.Round(s.averageScore, 1),
            }),
            hardestQuestions = hardestQuestions.Select(q => new
            {
                q.questionId,
                questionText = q.questionText.Length > 80 ? q.questionText.Substring(0, 80) + "…" : q.questionText,
                q.totalAttempts,
                correctRate = Math.Round(q.correctRate, 1),
            }),
        });
    }

    // ===== Tab 4: Exams =====

    /// <summary>
    /// Exam analytics: published/draft counts, completion rates, score distribution.
    /// </summary>
    [HttpGet("exams")]
    public async Task<IActionResult> GetExamsAnalytics(
        [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo, CancellationToken ct = default)
    {
        var (from, to) = ParseRange(dateFrom, dateTo, 90);

        var publishedCount = await _db.Exams.CountAsync(e => e.Status == Domain.Enums.ContentStatus.Published, ct);
        var draftCount = await _db.Exams.CountAsync(e => e.Status == Domain.Enums.ContentStatus.Draft, ct);
        var archivedCount = await _db.Exams.CountAsync(e => e.Status == Domain.Enums.ContentStatus.Archived, ct);

        var sessions = await _db.ExamSessions.AsNoTracking()
            .Where(es => es.StartedAt >= from && es.StartedAt <= to)
            .ToListAsync(ct);

        var totalSessions = sessions.Count;
        var completedCount = sessions.Count(s => s.Status == Domain.Enums.ExamSessionStatus.Completed);
        var completionRate = totalSessions > 0 ? completedCount * 100.0 / totalSessions : 0;
        var passCount = sessions.Count(s => s.Passed == true);
        var passRate = completedCount > 0 ? passCount * 100.0 / completedCount : 0;

        // Score distribution (0-20, 20-40, 40-60, 60-80, 80-100)
        var scoreRanges = new[] { 0, 20, 40, 60, 80, 100 };
        var distribution = new List<object>();
        for (int i = 0; i < scoreRanges.Length - 1; i++)
        {
            var min = scoreRanges[i];
            var max = scoreRanges[i + 1];
            var count = sessions.Count(s => s.Score.HasValue && s.Score >= min && s.Score < max);
            distribution.Add(new { range = $"{min}-{max}%", count });
        }

        var avgDuration = sessions.Where(s => s.Status == Domain.Enums.ExamSessionStatus.Completed && s.CompletedAt.HasValue)
            .Select(s => (double)(s.CompletedAt!.Value - s.StartedAt).TotalMinutes).DefaultIfEmpty(0).Average();

        return Ok(new
        {
            publishedCount, draftCount, archivedCount,
            totalSessions, completedCount,
            completionRate = Math.Round(completionRate, 1),
            passRate = Math.Round(passRate, 1),
            avgDurationMinutes = Math.Round(avgDuration, 1),
            scoreDistribution = distribution,
        });
    }

    // ===== Tab 5: Questions =====

    /// <summary>
    /// Question bank analytics: published counts, most reported, most attempted.
    /// </summary>
    [HttpGet("questions")]
    public async Task<IActionResult> GetQuestionsAnalytics(
        [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo, CancellationToken ct = default)
    {
        var (from, to) = ParseRange(dateFrom, dateTo, 90);

        var publishedCount = await _db.Questions.CountAsync(q => q.Status == Domain.Enums.ContentStatus.Published, ct);
        var draftCount = await _db.Questions.CountAsync(q => q.Status == Domain.Enums.ContentStatus.Draft, ct);
        var archivedCount = await _db.Questions.CountAsync(q => q.Status == Domain.Enums.ContentStatus.Archived, ct);

        // Most reported questions
        var mostReported = await _db.ErrorReports.AsNoTracking()
            .Where(r => r.CreatedAt >= from && r.CreatedAt <= to)
            .Join(_db.Questions, r => r.QuestionId, q => q.Id, (r, q) => new { r, q })
            .GroupBy(x => new { x.q.Id, x.q.Text })
            .Select(g => new
            {
                questionId = g.Key.Id,
                questionText = g.Key.Text,
                reportsCount = g.Count(),
                mostCommonReason = g.GroupBy(x => x.r.ReasonType.ToString())
                    .OrderByDescending(g2 => g2.Count()).Select(g2 => g2.Key).FirstOrDefault() ?? "Unknown",
            })
            .OrderByDescending(x => x.reportsCount)
            .Take(10)
            .ToListAsync(ct);

        // Top attempted questions (by attempt logs)
        var topAttempted = await _db.AttemptLogs.AsNoTracking()
            .Where(a => a.CreatedAt >= from && a.CreatedAt <= to)
            .Join(_db.Questions, a => a.QuestionId, q => q.Id, (a, q) => new { a, q })
            .GroupBy(x => new { x.q.Id, x.q.Text })
            .Select(g => new
            {
                questionId = g.Key.Id,
                questionText = g.Key.Text,
                attempts = g.Count(),
                correctRate = g.Count(x => x.a.IsCorrect) * 100.0 / g.Count(),
            })
            .OrderByDescending(x => x.attempts)
            .Take(10)
            .ToListAsync(ct);

        return Ok(new
        {
            publishedCount, draftCount, archivedCount,
            mostReported = mostReported.Select(q => new
            {
                q.questionId,
                questionText = q.questionText.Length > 80 ? q.questionText.Substring(0, 80) + "…" : q.questionText,
                q.reportsCount, q.mostCommonReason,
            }),
            topAttempted = topAttempted.Select(q => new
            {
                q.questionId,
                questionText = q.questionText.Length > 80 ? q.questionText.Substring(0, 80) + "…" : q.questionText,
                q.attempts,
                correctRate = Math.Round(q.correctRate, 1),
            }),
        });
    }

    // ===== Tab 6: Content & Library =====

    /// <summary>
    /// Library analytics: file counts by type, total storage, views, failures.
    /// </summary>
    [HttpGet("content")]
    public async Task<IActionResult> GetContentAnalytics(
        [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo, CancellationToken ct = default)
    {
        var (from, to) = ParseRange(dateFrom, dateTo, 30);

        var publishedFiles = await _db.LibraryFiles.CountAsync(f => f.Status == Domain.Enums.ContentStatus.Published, ct);
        var draftFiles = await _db.LibraryFiles.CountAsync(f => f.Status == Domain.Enums.ContentStatus.Draft, ct);
        var archivedFiles = await _db.LibraryFiles.CountAsync(f => f.Status == Domain.Enums.ContentStatus.Archived, ct);

        var totalStorage = await _db.LibraryFiles.SumAsync(f => (long?)f.FileSize ?? 0, ct);

        var viewsByType = await _db.LibraryFiles.AsNoTracking()
            .Where(f => f.Status == Domain.Enums.ContentStatus.Published)
            .GroupBy(f => f.Type.ToString())
            .Select(g => new { type = g.Key, count = g.Count(), totalSize = g.Sum(f => f.FileSize), views = g.Sum(f => f.ViewsCount) })
            .OrderByDescending(x => x.views)
            .ToListAsync(ct);

        var totalViews = viewsByType.Sum(v => v.views);

        // Pending/failed scans
        var pendingScans = await _db.LibraryFiles.CountAsync(f => f.VirusScanStatus == Domain.Enums.VirusScanStatus.Pending, ct);
        var failedScans = await _db.LibraryFiles.CountAsync(f => f.VirusScanStatus == Domain.Enums.VirusScanStatus.Error, ct);
        var infectedFiles = await _db.LibraryFiles.CountAsync(f => f.VirusScanStatus == Domain.Enums.VirusScanStatus.Infected, ct);

        return Ok(new
        {
            publishedFiles, draftFiles, archivedFiles,
            totalStorageBytes = totalStorage,
            totalStorageMB = Math.Round(totalStorage / 1024.0 / 1024.0, 2),
            totalViews,
            viewsByType,
            pendingScans, failedScans, infectedFiles,
        });
    }

    // ===== Tab 7: Codes & Subscriptions =====

    /// <summary>
    /// Codes analytics: issued, activated, expired, revoked, estimated value.
    /// </summary>
    [HttpGet("codes")]
    public async Task<IActionResult> GetCodesAnalytics(
        [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo, CancellationToken ct = default)
    {
        var (from, to) = ParseRange(dateFrom, dateTo, 90);

        var totalIssued = await _db.SubscriptionCodes.CountAsync(c => c.CreatedAt >= from && c.CreatedAt <= to, ct);
        var activated = await _db.SubscriptionCodes.CountAsync(c => c.UsedAt.HasValue && c.UsedAt >= from && c.UsedAt <= to, ct);
        var expired = await _db.SubscriptionCodes.CountAsync(c => c.Status == Domain.Enums.CodeStatus.Expired, ct);
        var revoked = await _db.SubscriptionCodes.CountAsync(c => c.Status == Domain.Enums.CodeStatus.Cancelled, ct);
        var activationRate = totalIssued > 0 ? activated * 100.0 / totalIssued : 0;

        // Active subscriptions
        var activeSubscriptions = await _db.StudentSubscriptions.CountAsync(s => s.Status == Domain.Enums.SubscriptionStatus.Active, ct);

        // Estimated value (codesSold × fixed price 25000)
        const decimal avgPrice = 25000m;
        var estimatedValue = activated * avgPrice;

        // Daily activation breakdown — server-side query + client-side formatting.
        // See students endpoint above for rationale on the split.
        var rawActivation = await _db.SubscriptionCodes.AsNoTracking()
            .Where(c => c.UsedAt.HasValue && c.UsedAt >= from && c.UsedAt <= to)
            .GroupBy(c => c.UsedAt!.Value.Date)
            .Select(g => new { date = g.Key, activated = g.Count() })
            .OrderBy(x => x.date)
            .ToListAsync(ct);
        var dailyActivation = rawActivation
            .Select(x => new { date = x.date.ToString("yyyy-MM-dd"), x.activated })
            .ToList();

        return Ok(new
        {
            totalIssued, activated, expired, revoked,
            activationRate = Math.Round(activationRate, 1),
            activeSubscriptions,
            estimatedValue,
            estimatedValueNote = "Activated codes × 25,000 (fixed estimated price) — not actual payments",
            dailyActivation,
        });
    }

    // ===== Tab 8: Operations & Security =====

    /// <summary>
    /// Operations analytics: API errors, login attempts, security events, service health.
    /// </summary>
    [HttpGet("operations")]
    public async Task<IActionResult> GetOperationsAnalytics(
        [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo, CancellationToken ct = default)
    {
        var (from, to) = ParseRange(dateFrom, dateTo, 7);

        // Security events by type
        var securityEvents = await _db.SecurityLogs.AsNoTracking()
            .Where(s => s.CreatedAt >= from && s.CreatedAt <= to)
            .GroupBy(s => s.EventType.ToString())
            .Select(g => new { eventType = g.Key, count = g.Count() })
            .OrderByDescending(x => x.count)
            .ToListAsync(ct);

        var totalSecurityEvents = securityEvents.Sum(e => e.count);

        // Failed logins
        var failedLogins = await _db.SecurityLogs.AsNoTracking()
            .Where(s => s.EventType == SecurityEventType.LoginFailed && s.CreatedAt >= from && s.CreatedAt <= to)
            .CountAsync(ct);

        var successfulLogins = await _db.SecurityLogs.AsNoTracking()
            .Where(s => s.EventType == SecurityEventType.LoginSuccess && s.CreatedAt >= from && s.CreatedAt <= to)
            .CountAsync(ct);

        // Ban events
        var banEvents = await _db.SecurityLogs.AsNoTracking()
            .Where(s => s.EventType == SecurityEventType.BanIssued && s.CreatedAt >= from && s.CreatedAt <= to)
            .CountAsync(ct);

        // Suspicious activity
        var suspiciousEvents = await _db.SecurityLogs.AsNoTracking()
            .Where(s => (s.EventType == SecurityEventType.SuspiciousActivity || s.EventType == SecurityEventType.SecurityAlert || s.EventType == SecurityEventType.RefreshReuse) && s.CreatedAt >= from && s.CreatedAt <= to)
            .CountAsync(ct);

        // Device events
        var deviceEvents = await _db.SecurityLogs.AsNoTracking()
            .Where(s => (s.EventType == SecurityEventType.DeviceChange || s.EventType == SecurityEventType.DeviceBindingFailed) && s.CreatedAt >= from && s.CreatedAt <= to)
            .CountAsync(ct);

        // Security events by severity
        var bySeverity = await _db.SecurityLogs.AsNoTracking()
            .Where(s => s.CreatedAt >= from && s.CreatedAt <= to)
            .GroupBy(s => s.Severity.ToString())
            .Select(g => new { severity = g.Key, count = g.Count() })
            .ToListAsync(ct);

        // Audit logs count
        var auditLogCount = await _db.SecurityLogs.AsNoTracking().CountAsync(s => s.CreatedAt >= from && s.CreatedAt <= to, ct);

        return Ok(new
        {
            totalSecurityEvents,
            failedLogins, successfulLogins, banEvents, suspiciousEvents, deviceEvents,
            loginSuccessRate = (failedLogins + successfulLogins) > 0
                ? Math.Round(successfulLogins * 100.0 / (failedLogins + successfulLogins), 1)
                : 0,
            securityEventsByType = securityEvents,
            bySeverity,
            auditLogCount,
            period = new { from = from.ToString("o"), to = to.ToString("o") },
        });
    }
}
