using CMS.Application.Commands.Dashboard;
using CMS.Application.Handlers.Dashboard;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Moq;

namespace CMS.Tests.Integration;

/// <summary>
/// Exercises RBAC and concrete academic ABAC together against real entity relationships.
/// </summary>
public sealed class PermissionServiceIntegrationTests
{
    [Fact]
    public async Task CollegeScopedAdmin_OnlyAccessesResourcesInsideTheirCollege()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var primary = TestDbHelper.GetTestSubject(db);
        var other = CreateOtherSubject(db);
        var role = CreateRole("college_admin", Resources.Students, "[\"view\",\"edit\"]");
        var admin = Admin.Create("college-admin@cms.test", "hash", "College Admin", role.Id);
        admin.SetScope(null, primary.Semester.AcademicYear.CollegeId, null, null);
        db.AddRange(role, admin);
        await db.SaveChangesAsync();

        var service = new PermissionService(db, new NoCacheService());

        (await service.IsInScopeAsync(admin.Id, "subject", primary.Id)).Should().BeTrue();
        (await service.IsInScopeAsync(admin.Id, "subject", other.Id)).Should().BeFalse();
        (await service.IsInScopeAsync(admin.Id, "unknown-entity", Guid.NewGuid())).Should().BeFalse();
    }

    [Fact]
    public async Task RoleWithoutGrantedResource_IsDeniedEvenWhenTheEntityWouldBeInScope()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var role = CreateRole("college_admin", Resources.Students, "[\"view\"]");
        var admin = Admin.Create("restricted-admin@cms.test", "hash", "Restricted Admin", role.Id);
        admin.SetScope(null, subject.Semester.AcademicYear.CollegeId, null, null);
        db.AddRange(role, admin);
        await db.SaveChangesAsync();

        var service = new PermissionService(db, new NoCacheService());

        (await service.HasPermissionAsync(admin.Id, Resources.Students, Actions.View)).Should().BeTrue();
        (await service.HasPermissionAsync(admin.Id, Resources.Codes, Actions.Create)).Should().BeFalse();
        (await service.HasPermissionAsync(admin.Id, "invented-resource", Actions.View)).Should().BeFalse();
    }

    [Fact]
    public async Task UnanchoredNonSuperAdmin_IsDeniedByDefault()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var role = CreateRole("college_admin", Resources.Codes, "[\"create\"]");
        var admin = Admin.Create("unanchored-admin@cms.test", "hash", "Unanchored Admin", role.Id);
        db.AddRange(role, admin);
        await db.SaveChangesAsync();

        var service = new PermissionService(db, new NoCacheService());

        (await service.IsInScopeAsync(admin.Id, "subject", subject.Id)).Should().BeFalse();
    }

    [Fact]
    public async Task GenerateCodesHandler_RejectsSubjectOutsideCreatingAdminsScope()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var primary = TestDbHelper.GetTestSubject(db);
        var other = CreateOtherSubject(db);
        var role = CreateRole("college_admin", Resources.Codes, "[\"create\"]");
        var admin = Admin.Create("code-admin@cms.test", "hash", "Code Admin", role.Id);
        admin.SetScope(null, primary.Semester.AcademicYear.CollegeId, null, null);
        db.AddRange(role, admin);
        await db.SaveChangesAsync();

        var unitOfWork = new Mock<IUnitOfWork>(MockBehavior.Strict);
        var handler = new AdminManagementHandlers(db, unitOfWork.Object, new PermissionService(db, new NoCacheService()), new Mock<ISecurityAuditWriter>().Object);
        var command = new GenerateCodesCommand("subject", other.Id, 30, 1, "T", DateTime.UtcNow.AddDays(1), admin.Id);

        var action = () => handler.Handle(command, CancellationToken.None);

        await action.Should().ThrowAsync<ForbiddenException>();
        db.CodeBatches.Should().BeEmpty();
        db.SubscriptionCodes.Should().BeEmpty();
    }

    private static Subject CreateOtherSubject(CMS.Infrastructure.Persistence.ApplicationDbContext db)
    {
        var university = University.Create("جامعة ثانية", "other-university", "Other University");
        var college = College.Create(university.Id, "كلية ثانية", "other-college", "Other College");
        var year = AcademicYear.Create(college.Id, "السنة الثانية", "other-year", 2);
        var semester = Semester.Create(year.Id, "الفصل الثاني", "other-semester", 2);
        var subject = Subject.Create(semester.Id, "مادة ثانية", "other-subject", "Other Subject");
        db.AddRange(university, college, year, semester, subject);
        return subject;
    }

    private static AdminRole CreateRole(string name, string resource, string actions)
    {
        var role = AdminRole.Create(name, name, "Phase 42 test role");
        role.Permissions.Add(AdminPermission.Create(role.Id, resource, actions, "scoped"));
        return role;
    }

    private sealed class NoCacheService : ICacheService
    {
        public Task<T?> GetAsync<T>(string key, CancellationToken ct = default) => Task.FromResult(default(T));
        public Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default) => Task.FromResult(default(T));
        public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default) => Task.CompletedTask;
        public Task<long> IncrementAsync(string key, TimeSpan? expiry = null, CancellationToken ct = default) => Task.FromResult(1L);
        public Task RemoveAsync(string key, CancellationToken ct = default) => Task.CompletedTask;
        public Task RemoveByPatternAsync(string pattern, CancellationToken ct = default) => Task.CompletedTask;
    }
}
