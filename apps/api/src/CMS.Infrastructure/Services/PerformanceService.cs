using Microsoft.EntityFrameworkCore;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Persistence;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Performance optimization service.
/// Provides query optimization helpers and cache invalidation.
/// </summary>
public class PerformanceService
{
    private readonly ApplicationDbContext _db;
    private readonly ICacheService _cache;

    public PerformanceService(ApplicationDbContext db, ICacheService cache)
    {
        _db = db;
        _cache = cache;
    }

    /// <summary>
    /// Warm up caches on application startup.
    /// Pre-loads frequently accessed data into Redis.
    /// </summary>
    public async Task WarmUpCachesAsync(CancellationToken ct = default)
    {
        // Cache universities
        var universities = await _db.Universities.AsNoTracking()
            .Where(u => u.DeletedAt == null)
            .Select(u => new { u.Id, u.NameAr, u.NameEn, u.Slug, u.LogoUrl })
            .ToListAsync(ct);

        await _cache.SetAsync("universities:all", universities, TimeSpan.FromHours(1), ct);

        // Cache subjects hierarchy (university → college → year → semester → subject)
        var subjects = await _db.Subjects.AsNoTracking()
            .Include(s => s.Semester).ThenInclude(s => s.AcademicYear).ThenInclude(y => y.College).ThenInclude(c => c.University)
            .Where(s => s.DeletedAt == null && s.Status == "active")
            .Select(s => new
            {
                s.Id, s.NameAr, s.Slug,
                SemesterId = s.SemesterId,
                YearId = s.Semester.AcademicYearId,
                CollegeId = s.Semester.AcademicYear.CollegeId,
                UniversityId = s.Semester.AcademicYear.College.UniversityId,
            })
            .ToListAsync(ct);

        await _cache.SetAsync("subjects:hierarchy", subjects, TimeSpan.FromHours(1), ct);

        // Cache question counts per subject
        var questionCounts = await _db.Questions.AsNoTracking()
            .Where(q => q.Status == Domain.Enums.ContentStatus.Published)
            .GroupBy(q => q.SubjectId)
            .Select(g => new { SubjectId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.SubjectId, g => g.Count, ct);

        await _cache.SetAsync("questions:counts", questionCounts, TimeSpan.FromMinutes(30), ct);
    }

    /// <summary>
    /// Invalidate caches for a specific entity type.
    /// Called when data is modified (create/update/delete).
    /// </summary>
    public async Task InvalidateCacheAsync(string entityType, Guid? entityId = null, CancellationToken ct = default)
    {
        var keysToRemove = new List<string>();

        switch (entityType.ToLower())
        {
            case "university":
            case "college":
            case "year":
            case "semester":
            case "subject":
                keysToRemove.Add("universities:all");
                keysToRemove.Add("subjects:hierarchy");
                if (entityId.HasValue)
                    keysToRemove.Add($"subject:{entityId}");
                break;

            case "question":
                keysToRemove.Add("questions:counts");
                if (entityId.HasValue)
                {
                    keysToRemove.Add($"question:{entityId}");
                    // Remove question list caches (pattern-based)
                    await _cache.RemoveByPatternAsync("respcache:", ct);
                }
                break;

            case "library":
                if (entityId.HasValue)
                    keysToRemove.Add($"library:{entityId}");
                break;

            case "notification":
                // Notification caches are per-student
                break;
        }

        foreach (var key in keysToRemove)
        {
            await _cache.RemoveAsync(key, ct);
        }
    }

    /// <summary>
    /// Get database connection statistics for monitoring.
    /// </summary>
    public async Task<DbStatsDto> GetDbStatsAsync(CancellationToken ct = default)
    {
        var totalStudents = await _db.Students.CountAsync(ct);
        var totalQuestions = await _db.Questions.CountAsync(ct);
        var totalAttempts = await _db.AttemptLogs.CountAsync(ct);
        var totalExamSessions = await _db.ExamSessions.CountAsync(ct);
        var totalLibraryFiles = await _db.LibraryFiles.CountAsync(ct);
        var totalNotifications = await _db.NotificationDeliveries.CountAsync(ct);

        // Estimate DB size (rough approximation)
        var estimatedSizeMb = (totalStudents * 0.5) + (totalQuestions * 2) + (totalAttempts * 0.3) +
                              (totalExamSessions * 1) + (totalLibraryFiles * 5) + (totalNotifications * 0.2);

        return new DbStatsDto(
            totalStudents, totalQuestions, totalAttempts,
            totalExamSessions, totalLibraryFiles, totalNotifications,
            Math.Round(estimatedSizeMb, 1)
        );
    }

    /// <summary>
    /// Analyze slow queries (queries taking > 500ms).
    /// Returns recent slow query logs.
    /// </summary>
    public List<SlowQueryDto> GetSlowQueries()
    {
        // In production, this would query Serilog/Seq for slow query entries
        // For now, return empty list
        return new List<SlowQueryDto>();
    }
}

public record DbStatsDto(
    int TotalStudents,
    int TotalQuestions,
    int TotalAttempts,
    int TotalExamSessions,
    int TotalLibraryFiles,
    int TotalNotifications,
    double EstimatedSizeMb
);

public record SlowQueryDto(
    string Query,
    int DurationMs,
    DateTime ExecutedAt
);
