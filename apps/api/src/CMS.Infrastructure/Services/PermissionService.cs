using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Central RBAC + ABAC decision service. A role grants a resource/action capability;
/// a concrete entity must additionally resolve to the administrator's academic scope.
/// Unknown resources, unknown actions, unresolved entities, and unanchored non-super
/// administrator scopes are denied by default.
/// </summary>
public sealed class PermissionService : IPermissionService
{
    private readonly ApplicationDbContext _db;
    private readonly ICacheService _cache;

    public PermissionService(ApplicationDbContext db, ICacheService cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task<bool> HasPermissionAsync(Guid adminId, string resource, string action, CancellationToken ct = default)
    {
        if (!Resources.All.Contains(resource, StringComparer.Ordinal) || !Actions.All.Contains(action, StringComparer.Ordinal))
            return false;

        var cacheKey = $"perm:{adminId}:{resource}:{action}";
        var cached = await _cache.GetAsync<bool?>(cacheKey, ct);
        if (cached.HasValue) return cached.Value;

        var admin = await _db.Admins.AsNoTracking()
            .Include(a => a.Role)
                .ThenInclude(role => role.Permissions)
            .FirstOrDefaultAsync(a => a.Id == adminId, ct);

        if (admin is null || admin.Status != AdminStatus.Active || !admin.Role.IsActive)
            return await CachePermissionAsync(cacheKey, false, ct);

        if (admin.Role.Name == Roles.SuperAdmin)
            return await CachePermissionAsync(cacheKey, true, ct);

        var permission = admin.Role.Permissions.FirstOrDefault(permission => permission.Resource == resource);
        if (permission is null)
            return await CachePermissionAsync(cacheKey, false, ct);

        var allowedActions = System.Text.Json.JsonSerializer.Deserialize<List<string>>(permission.Actions) ?? new();
        return await CachePermissionAsync(cacheKey, allowedActions.Contains(action, StringComparer.Ordinal), ct);
    }

    public async Task<List<PermissionDto>> GetPermissionsAsync(Guid adminId, CancellationToken ct = default)
    {
        var admin = await _db.Admins.AsNoTracking()
            .Include(a => a.Role)
                .ThenInclude(role => role.Permissions)
            .FirstOrDefaultAsync(a => a.Id == adminId, ct);

        if (admin is null || admin.Status != AdminStatus.Active || !admin.Role.IsActive)
            return new();

        if (admin.Role.Name == Roles.SuperAdmin)
        {
            return Resources.All.Select(resource => new PermissionDto(
                resource,
                Actions.All.ToList(),
                "all"
            )).ToList();
        }

        return admin.Role.Permissions.Select(permission => new PermissionDto(
            permission.Resource,
            System.Text.Json.JsonSerializer.Deserialize<List<string>>(permission.Actions) ?? new(),
            permission.Scope
        )).ToList();
    }

    public async Task<bool> IsInScopeAsync(Guid adminId, string entityType, Guid entityId, CancellationToken ct = default)
    {
        var scope = await GetScopeAsync(adminId, ct);
        if (scope?.IsSuperAdmin == true) return true;
        if (scope is null || !HasScopeAnchor(scope)) return false;

        var path = await ResolveScopePathAsync(entityType, entityId, ct);
        return path is not null && ScopeContains(scope, path.Value);
    }

    public async Task<AdminScope?> GetScopeAsync(Guid adminId, CancellationToken ct = default)
    {
        var cacheKey = $"scope:{adminId}";
        var cached = await _cache.GetAsync<AdminScope?>(cacheKey, ct);
        if (cached is not null) return cached;

        var admin = await _db.Admins.AsNoTracking()
            .Include(a => a.Role)
            .FirstOrDefaultAsync(a => a.Id == adminId, ct);

        if (admin is null || admin.Status != AdminStatus.Active || !admin.Role.IsActive)
            return null;

        var scope = new AdminScope(
            admin.ScopeUniversityId,
            admin.ScopeCollegeId,
            admin.ScopeYearId,
            admin.ScopeSubjectId,
            admin.Role.Name == Roles.SuperAdmin
        );

        await _cache.SetAsync(cacheKey, scope, TimeSpan.FromMinutes(10), ct);
        return scope;
    }

    private async Task<bool> CachePermissionAsync(string cacheKey, bool value, CancellationToken ct)
    {
        await _cache.SetAsync(cacheKey, value, TimeSpan.FromMinutes(5), ct);
        return value;
    }

    private static bool HasScopeAnchor(AdminScope scope) =>
        scope.UniversityId.HasValue || scope.CollegeId.HasValue || scope.YearId.HasValue || scope.SubjectId.HasValue;

    private static bool ScopeContains(AdminScope scope, ScopePath path)
    {
        if (scope.UniversityId.HasValue && scope.UniversityId != path.UniversityId) return false;
        if (scope.CollegeId.HasValue && scope.CollegeId != path.CollegeId) return false;
        if (scope.YearId.HasValue && scope.YearId != path.YearId) return false;
        if (scope.SubjectId.HasValue && scope.SubjectId != path.SubjectId) return false;
        return true;
    }

    private async Task<ScopePath?> ResolveScopePathAsync(string entityType, Guid entityId, CancellationToken ct)
    {
        return entityType.ToLowerInvariant() switch
        {
            "university" => await _db.Universities.AsNoTracking()
                .Where(university => university.Id == entityId && university.DeletedAt == null)
                .Select(university => (ScopePath?)new ScopePath(university.Id, null, null, null))
                .FirstOrDefaultAsync(ct),
            "college" => await _db.Colleges.AsNoTracking()
                .Where(college => college.Id == entityId && college.DeletedAt == null)
                .Select(college => (ScopePath?)new ScopePath(college.UniversityId, college.Id, null, null))
                .FirstOrDefaultAsync(ct),
            "year" or "academic_year" => await _db.AcademicYears.AsNoTracking()
                .Where(year => year.Id == entityId && year.DeletedAt == null)
                .Select(year => (ScopePath?)new ScopePath(year.College.UniversityId, year.CollegeId, year.Id, null))
                .FirstOrDefaultAsync(ct),
            "semester" => await _db.Semesters.AsNoTracking()
                .Where(semester => semester.Id == entityId && semester.DeletedAt == null)
                .Select(semester => (ScopePath?)new ScopePath(
                    semester.AcademicYear.College.UniversityId,
                    semester.AcademicYear.CollegeId,
                    semester.AcademicYearId,
                    null))
                .FirstOrDefaultAsync(ct),
            "subject" => await ResolveSubjectScopePathAsync(entityId, ct),
            "lecture" => await _db.Lectures.AsNoTracking()
                .Where(lecture => lecture.Id == entityId && lecture.DeletedAt == null)
                .Select(lecture => (ScopePath?)new ScopePath(
                    lecture.Subject.Semester.AcademicYear.College.UniversityId,
                    lecture.Subject.Semester.AcademicYear.CollegeId,
                    lecture.Subject.Semester.AcademicYearId,
                    lecture.SubjectId))
                .FirstOrDefaultAsync(ct),
            "question" => await _db.Questions.AsNoTracking()
                .Where(question => question.Id == entityId && question.DeletedAt == null)
                .Select(question => (ScopePath?)new ScopePath(
                    question.Subject.Semester.AcademicYear.College.UniversityId,
                    question.Subject.Semester.AcademicYear.CollegeId,
                    question.Subject.Semester.AcademicYearId,
                    question.SubjectId))
                .FirstOrDefaultAsync(ct),
            "exam" => await _db.Exams.AsNoTracking()
                .Where(exam => exam.Id == entityId && exam.DeletedAt == null)
                .Select(exam => (ScopePath?)new ScopePath(
                    exam.Subject.Semester.AcademicYear.College.UniversityId,
                    exam.Subject.Semester.AcademicYear.CollegeId,
                    exam.Subject.Semester.AcademicYearId,
                    exam.SubjectId))
                .FirstOrDefaultAsync(ct),
            "library" or "library_file" or "file" => await _db.LibraryFiles.AsNoTracking()
                .Where(file => file.Id == entityId && file.DeletedAt == null)
                .Select(file => (ScopePath?)new ScopePath(
                    file.Subject.Semester.AcademicYear.College.UniversityId,
                    file.Subject.Semester.AcademicYear.CollegeId,
                    file.Subject.Semester.AcademicYearId,
                    file.SubjectId))
                .FirstOrDefaultAsync(ct),
            "student" => await _db.Students.AsNoTracking()
                .Where(student => student.Id == entityId && student.DeletedAt == null)
                .Select(student => (ScopePath?)new ScopePath(
                    student.UniversityId,
                    student.CollegeId,
                    student.AcademicYearId,
                    null))
                .FirstOrDefaultAsync(ct),
            "code" or "subscription_code" => await ResolveCodeScopePathAsync(entityId, ct),
            "code_batch" => await ResolveCodeBatchScopePathAsync(entityId, ct),
            _ => null
        };
    }

    private async Task<ScopePath?> ResolveSubjectScopePathAsync(Guid subjectId, CancellationToken ct) =>
        await _db.Subjects.AsNoTracking()
            .Where(subject => subject.Id == subjectId && subject.DeletedAt == null)
            .Select(subject => (ScopePath?)new ScopePath(
                subject.Semester.AcademicYear.College.UniversityId,
                subject.Semester.AcademicYear.CollegeId,
                subject.Semester.AcademicYearId,
                subject.Id))
            .FirstOrDefaultAsync(ct);

    private async Task<ScopePath?> ResolveCodeScopePathAsync(Guid codeId, CancellationToken ct)
    {
        var code = await _db.SubscriptionCodes.AsNoTracking()
            .Where(subscriptionCode => subscriptionCode.Id == codeId)
            .Select(subscriptionCode => new ScopeAnchors(
                subscriptionCode.ScopeUniversityId,
                subscriptionCode.ScopeCollegeId,
                subscriptionCode.ScopeYearId,
                subscriptionCode.ScopeSemesterId,
                subscriptionCode.ScopeSubjectId))
            .FirstOrDefaultAsync(ct);
        return await ResolveScopeAnchorsAsync(code, ct);
    }

    private async Task<ScopePath?> ResolveCodeBatchScopePathAsync(Guid batchId, CancellationToken ct)
    {
        var batch = await _db.CodeBatches.AsNoTracking()
            .Where(codeBatch => codeBatch.Id == batchId)
            .Select(codeBatch => new ScopeAnchors(
                codeBatch.ScopeUniversityId,
                codeBatch.ScopeCollegeId,
                codeBatch.ScopeYearId,
                codeBatch.ScopeSemesterId,
                codeBatch.ScopeSubjectId))
            .FirstOrDefaultAsync(ct);
        return await ResolveScopeAnchorsAsync(batch, ct);
    }

    private async Task<ScopePath?> ResolveScopeAnchorsAsync(ScopeAnchors? anchors, CancellationToken ct)
    {
        if (anchors is null) return null;
        if (anchors.SubjectId.HasValue) return await ResolveSubjectScopePathAsync(anchors.SubjectId.Value, ct);
        if (anchors.SemesterId.HasValue)
        {
            return await _db.Semesters.AsNoTracking()
                .Where(semester => semester.Id == anchors.SemesterId.Value && semester.DeletedAt == null)
                .Select(semester => (ScopePath?)new ScopePath(
                    semester.AcademicYear.College.UniversityId,
                    semester.AcademicYear.CollegeId,
                    semester.AcademicYearId,
                    null))
                .FirstOrDefaultAsync(ct);
        }
        if (anchors.YearId.HasValue)
        {
            return await _db.AcademicYears.AsNoTracking()
                .Where(year => year.Id == anchors.YearId.Value && year.DeletedAt == null)
                .Select(year => (ScopePath?)new ScopePath(year.College.UniversityId, year.CollegeId, year.Id, null))
                .FirstOrDefaultAsync(ct);
        }
        if (anchors.CollegeId.HasValue)
        {
            return await _db.Colleges.AsNoTracking()
                .Where(college => college.Id == anchors.CollegeId.Value && college.DeletedAt == null)
                .Select(college => (ScopePath?)new ScopePath(college.UniversityId, college.Id, null, null))
                .FirstOrDefaultAsync(ct);
        }
        if (anchors.UniversityId.HasValue)
        {
            return await _db.Universities.AsNoTracking()
                .Where(university => university.Id == anchors.UniversityId.Value && university.DeletedAt == null)
                .Select(university => (ScopePath?)new ScopePath(university.Id, null, null, null))
                .FirstOrDefaultAsync(ct);
        }
        return null;
    }

    private readonly record struct ScopePath(Guid? UniversityId, Guid? CollegeId, Guid? YearId, Guid? SubjectId);
    private sealed record ScopeAnchors(Guid? UniversityId, Guid? CollegeId, Guid? YearId, Guid? SemesterId, Guid? SubjectId);
}
