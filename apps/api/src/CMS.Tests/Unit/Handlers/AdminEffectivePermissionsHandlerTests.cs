using System.Text.Json;
using CMS.Application.Commands.Admin;
using CMS.Application.Handlers.Admin;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// PR-7 (Settings + Role Studio): the effective-permissions view of one administrator —
/// super_admin_bypass vs. role_grants shapes. Super admins: access source is the bypass,
/// the grants list is EMPTY, and the UI envelope is full. Custom-role admins: grants are
/// parsed from the role's AdminPermissions rows (Actions JSON), the UI envelope reports
/// the configured key count, and the academic scope resolves to human-readable names.
/// </summary>
public class AdminEffectivePermissionsHandlerTests
{
    private static AdministratorManagementHandlers CreateHandler(ApplicationDbContext db)
        => new(db, new UnitOfWork(db), new Mock<IPasswordHasher>().Object, new Mock<IPasswordPolicy>().Object,
            new Mock<ISessionService>().Object, new Mock<ICacheService>().Object, new Mock<ISecurityAuditWriter>().Object);

    [Fact]
    public async Task SuperAdminTarget_BypassShape_EmptyGrants_UiFull()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var handler = CreateHandler(db);

        var result = await handler.Handle(new GetAdminEffectivePermissionsQuery(actor.Id, actor.Id), CancellationToken.None);

        result.AdminId.Should().Be(actor.Id);
        result.Email.Should().Be(actor.Email);
        result.FullName.Should().Be(actor.FullName);
        result.IsActive.Should().BeTrue();
        result.IsSuperAdmin.Should().BeTrue();
        result.AccessSource.Should().Be("super_admin_bypass");
        result.Grants.Should().BeEmpty("a super admin's access is the role-name bypass — no grant rows apply");
        result.UiPermissions.Mode.Should().Be("full");
        result.UiPermissions.AllowedKeysCount.Should().Be(UiPermissionRegistry.AllKeys.Length);
        result.UiPermissions.RegistryVersion.Should().Be(UiPermissionRegistry.RegistryVersion);
        result.Role.Name.Should().Be(Roles.SuperAdmin);
        result.Role.IsActive.Should().BeTrue();
        result.AcademicScope.UniversityId.Should().BeNull();
        result.AcademicScope.UniversityName.Should().BeNull();
    }

    [Fact]
    public async Task CustomRoleAdminTarget_GrantsParsed_UiCustom_ScopeNamesResolved()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();

        // Custom role with two grants (Actions JSON like the seeded roles) + configured UI keys.
        var role = AdminRole.Create("content_moderator", "مراجع محتوى");
        role.SetUiPermissions(UiPermissionRegistry.SerializeKeys(
            new[] { UiPermissionRegistry.ViewQuestions, UiPermissionRegistry.BtnQuestionsCreate }));
        db.AdminRoles.Add(role);
        db.AdminPermissions.Add(AdminPermission.Create(role.Id, Resources.Questions,
            JsonSerializer.Serialize(new List<string> { Actions.View, Actions.Edit }), "scoped"));
        db.AdminPermissions.Add(AdminPermission.Create(role.Id, Resources.Settings,
            JsonSerializer.Serialize(new List<string> { Actions.View }), "own"));

        // Target: a subject-scoped admin anchored on the seeded academic hierarchy.
        var subject = db.Subjects
            .Include(s => s.Semester).ThenInclude(semester => semester.AcademicYear).ThenInclude(year => year.College)
            .First();
        var target = Admin.Create("moderator@test.local", "mod-hash", "مراجع المحتوى", role.Id);
        target.SetScope(subject.Semester.AcademicYear.College.UniversityId,
            subject.Semester.AcademicYear.CollegeId, subject.Semester.AcademicYearId, subject.Id);
        db.Admins.Add(target);
        db.SaveChanges();

        var handler = CreateHandler(db);
        var result = await handler.Handle(new GetAdminEffectivePermissionsQuery(actor.Id, target.Id), CancellationToken.None);

        result.IsSuperAdmin.Should().BeFalse();
        result.AccessSource.Should().Be("role_grants");
        result.Grants.Should().HaveCount(2);

        var questionsGrant = result.Grants.Single(grant => grant.Resource == Resources.Questions);
        questionsGrant.Actions.Should().BeEquivalentTo(Actions.View, Actions.Edit);
        questionsGrant.Scope.Should().Be("scoped");

        var settingsGrant = result.Grants.Single(grant => grant.Resource == Resources.Settings);
        settingsGrant.Actions.Should().BeEquivalentTo(Actions.View);
        settingsGrant.Scope.Should().Be("own");

        result.UiPermissions.Mode.Should().Be("custom");
        result.UiPermissions.AllowedKeysCount.Should().Be(2);
        result.UiPermissions.RegistryVersion.Should().Be(UiPermissionRegistry.RegistryVersion);

        result.AcademicScope.UniversityId.Should().Be(subject.Semester.AcademicYear.College.UniversityId);
        result.AcademicScope.UniversityName.Should().Be(db.Universities.First().NameAr);
        result.AcademicScope.CollegeName.Should().Be(db.Colleges.First().NameAr);
        result.AcademicScope.YearName.Should().Be(db.AcademicYears.First().NameAr);
        result.AcademicScope.SubjectId.Should().Be(subject.Id);
        result.AcademicScope.SubjectName.Should().Be(subject.NameAr);
    }

    [Fact]
    public async Task CustomRoleAdminTarget_UnconfiguredUi_FullModeWithAllKeys()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var role = AdminRole.Create("fresh_role", "دور جديد");
        var target = Admin.Create("fresh@test.local", "fresh-hash", "مدير جديد", role.Id);
        db.AdminRoles.Add(role);
        db.Admins.Add(target);
        db.SaveChanges();
        var handler = CreateHandler(db);

        var result = await handler.Handle(new GetAdminEffectivePermissionsQuery(actor.Id, target.Id), CancellationToken.None);

        // NULL ui_permissions = unconfigured = full UI access (Push 3 semantics preserved).
        result.UiPermissions.Mode.Should().Be("full");
        result.UiPermissions.AllowedKeysCount.Should().Be(UiPermissionRegistry.AllKeys.Length);
        result.Grants.Should().BeEmpty("no AdminPermissions rows were seeded for the role");
    }

    [Fact]
    public async Task DisabledCustomAdminTarget_IsActiveFalse_AndGrantsStillRendered()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var role = AdminRole.Create("paused_role", "دور متوقف");
        var target = Admin.Create("paused@test.local", "paused-hash", "مدير متوقف", role.Id);
        target.SetStatus(AdminStatus.Disabled);
        db.AdminRoles.Add(role);
        db.Admins.Add(target);
        db.SaveChanges();
        var handler = CreateHandler(db);

        var result = await handler.Handle(new GetAdminEffectivePermissionsQuery(actor.Id, target.Id), CancellationToken.None);

        result.IsActive.Should().BeFalse();
        result.Grants.Should().BeEmpty();
    }

    [Fact]
    public async Task UnknownTarget_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var handler = CreateHandler(db);

        var act = () => handler.Handle(new GetAdminEffectivePermissionsQuery(actor.Id, Guid.NewGuid()), CancellationToken.None);

        (await act.Should().ThrowAsync<NotFoundException>()).Which.ErrorCode.Should().Be("NOT_FOUND");
    }

    [Fact]
    public async Task NonSuperActor_Rejected()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var role = AdminRole.Create("plain_viewer", "مشاهد");
        var nonSuperActor = Admin.Create("viewer@test.local", "viewer-hash", "مشاهد عام", role.Id);
        db.AdminRoles.Add(role);
        db.Admins.Add(nonSuperActor);
        db.SaveChanges();
        var handler = CreateHandler(db);

        var act = () => handler.Handle(new GetAdminEffectivePermissionsQuery(nonSuperActor.Id, actor.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<ForbiddenException>()).Which.ErrorCode.Should().Be("FORBIDDEN");
    }
}
