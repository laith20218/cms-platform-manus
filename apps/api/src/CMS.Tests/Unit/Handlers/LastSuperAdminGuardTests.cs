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
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// PR-7 (Settings + Role Studio): the last-effective-super-admin guard replaces the
/// blanket SUPER_ADMIN_PROTECTED rule. Theory: (a) a non-super target is freely
/// manageable; (b) a super-admin target is manageable while another ACTIVE super admin
/// exists; (c) the last ACTIVE super admin is backend-protected on the
/// disable/delete/demote/reset-password paths (LAST_SUPER_ADMIN); (d) a SUSPENDED second
/// super admin does NOT back the mutation — only ACTIVE peers count.
/// </summary>
public class LastSuperAdminGuardTests
{
    private const string ActorPassword = "ActorAdminPass123!";
    private const string NewPassword = "BrandNewAdmin123!";

    private static (Mock<IPasswordHasher> hasher, Mock<IPasswordPolicy> policy, Mock<ISessionService> sessions, Mock<ICacheService> cache, Mock<ISecurityAuditWriter> audit) CreateSeams()
    {
        var hasher = new Mock<IPasswordHasher>();
        hasher.Setup(h => h.VerifyPassword(ActorPassword, It.IsAny<string>())).Returns(true);
        hasher.Setup(h => h.HashPassword(NewPassword)).Returns("new-admin-hash");
        return (hasher, new Mock<IPasswordPolicy>(), new Mock<ISessionService>(), new Mock<ICacheService>(), new Mock<ISecurityAuditWriter>());
    }

    private static AdministratorManagementHandlers CreateAdminHandlers(
        ApplicationDbContext db,
        Mock<IPasswordHasher> hasher,
        Mock<IPasswordPolicy> policy,
        Mock<ISessionService> sessions,
        Mock<ICacheService> cache,
        Mock<ISecurityAuditWriter> audit)
        => new(db, new UnitOfWork(db), hasher.Object, policy.Object, sessions.Object, cache.Object, audit.Object);

    private static RoleAdministrationHandlers CreateRoleHandlers(ApplicationDbContext db, Mock<ISecurityAuditWriter> audit)
        => new(db, new UnitOfWork(db), new Mock<IPermissionService>().Object, audit.Object);

    /// <summary>Creates a custom (non-system) role + an ACTIVE admin holding it.</summary>
    private static Admin CreateCustomAdmin(ApplicationDbContext db, string email)
    {
        var role = AdminRole.Create($"role_{Guid.NewGuid():N}"[..16], "دور مخصص");
        var admin = Admin.Create(email, "custom-hash", "مدير مخصص", role.Id);
        db.AdminRoles.Add(role);
        db.Admins.Add(admin);
        db.SaveChanges();
        return admin;
    }

    /// <summary>Creates an additional ACTIVE super admin (backing peer).</summary>
    private static Admin CreateSecondSuperAdmin(ApplicationDbContext db, string email)
    {
        var superRole = db.AdminRoles.First(role => role.Name == Roles.SuperAdmin);
        var admin = Admin.Create(email, "second-super-hash", "مدير عام ثانٍ", superRole.Id);
        db.Admins.Add(admin);
        db.SaveChanges();
        return admin;
    }

    // ===== (a) non-super target: always manageable =====

    [Fact]
    public async Task Disable_NonSuperTarget_IsAllowed()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var target = CreateCustomAdmin(db, "custom-target@test.local");
        var seams = CreateSeams();
        var handler = CreateAdminHandlers(db, seams.hasher, seams.policy, seams.sessions, seams.cache, seams.audit);

        await handler.Handle(new SetAdminStatusCommand(actor.Id, target.Id, IsActive: false), CancellationToken.None);

        target.Status.Should().Be(AdminStatus.Disabled);
    }

    // ===== (b) super target + another ACTIVE super admin exists: allowed =====

    [Fact]
    public async Task Disable_SuperTarget_WithAnotherActiveSuper_IsAllowed_AndAuditedCritical()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var target = CreateSecondSuperAdmin(db, "demotable-super@test.local");
        var seams = CreateSeams();
        var handler = CreateAdminHandlers(db, seams.hasher, seams.policy, seams.sessions, seams.cache, seams.audit);

        await handler.Handle(new SetAdminStatusCommand(actor.Id, target.Id, IsActive: false), CancellationToken.None);

        target.Status.Should().Be(AdminStatus.Disabled);
        seams.sessions.Verify(s => s.RevokeAllForUserAsync(target.Id, "admin_disabled", It.IsAny<CancellationToken>()), Times.Once);
        // PR-7: disabling a super-admin target is Critical + carries the explicit marker.
        seams.audit.Verify(a => a.LogSecurityEventAsync(
            null, actor.Id, SecurityEventType.AdminAction, SecuritySeverity.Critical,
            It.Is<string>(description => description.Contains("action=set_admin_status")
                && description.Contains("active=false")
                && description.EndsWith("; target_is_super_admin=true", StringComparison.Ordinal)),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ResetPassword_SuperTarget_WithAnotherActiveSuper_IsAllowed_AndHashChanges()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var target = CreateSecondSuperAdmin(db, "resettable-super@test.local");
        var originalHash = target.PasswordHash;
        var seams = CreateSeams();
        var handler = CreateAdminHandlers(db, seams.hasher, seams.policy, seams.sessions, seams.cache, seams.audit);

        await handler.Handle(new ResetAdminPasswordCommand(actor.Id, target.Id, NewPassword), CancellationToken.None);

        target.PasswordHash.Should().Be("new-admin-hash").And.NotBe(originalHash);
        seams.sessions.Verify(s => s.RevokeAllForUserAsync(target.Id, "admin_password_reset", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Delete_SuperTarget_WithAnotherActiveSuper_IsAllowed_AndAuditedCriticalWithMarker()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var target = CreateSecondSuperAdmin(db, "deletable-super@test.local");
        var seams = CreateSeams();
        var handler = CreateAdminHandlers(db, seams.hasher, seams.policy, seams.sessions, seams.cache, seams.audit);

        await handler.Handle(new DeleteAdminCommand(actor.Id, target.Id, ActorPassword), CancellationToken.None);

        db.Admins.Should().NotContain(admin => admin.Id == target.Id);
        seams.audit.Verify(a => a.LogSecurityEventAsync(
            null, actor.Id, SecurityEventType.AdminAction, SecuritySeverity.Critical,
            It.Is<string>(description => description.Contains("action=delete_admin")
                && description.EndsWith("; target_is_super_admin=true", StringComparison.Ordinal)),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Demote_SuperTarget_WithAnotherActiveSuper_IsAllowed_AndAuditedCriticalWithMarker()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var target = CreateSecondSuperAdmin(db, "demote-me-super@test.local");
        var plainRole = AdminRole.Create("content_moderator", "مراجع محتوى");
        db.AdminRoles.Add(plainRole);
        db.SaveChanges();
        var seams = CreateSeams();
        var handler = CreateRoleHandlers(db, seams.audit);

        await handler.Handle(new AssignAdminRoleCommand(actor.Id, target.Id, plainRole.Id), CancellationToken.None);

        target.RoleId.Should().Be(plainRole.Id);
        seams.audit.Verify(a => a.LogSecurityEventAsync(
            null, actor.Id, SecurityEventType.RoleChange, SecuritySeverity.Critical,
            It.Is<string>(description => description.Contains($"target_admin_id={target.Id}")
                && description.EndsWith("; target_is_super_admin=true", StringComparison.Ordinal)),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    // ===== (c) super target + NO other active super: LAST_SUPER_ADMIN on every path =====

    [Fact]
    public async Task Disable_LastEffectiveSuperAdmin_ThrowsLastSuperAdmin()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var seams = CreateSeams();
        var handler = CreateAdminHandlers(db, seams.hasher, seams.policy, seams.sessions, seams.cache, seams.audit);

        var act = () => handler.Handle(new SetAdminStatusCommand(actor.Id, actor.Id, IsActive: false), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("LAST_SUPER_ADMIN");
        actor.Status.Should().Be(AdminStatus.Active);
        seams.sessions.Verify(s => s.RevokeAllForUserAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ResetPassword_LastEffectiveSuperAdmin_ThrowsLastSuperAdmin()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var seams = CreateSeams();
        var handler = CreateAdminHandlers(db, seams.hasher, seams.policy, seams.sessions, seams.cache, seams.audit);

        var act = () => handler.Handle(new ResetAdminPasswordCommand(actor.Id, actor.Id, NewPassword), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("LAST_SUPER_ADMIN");
        actor.PasswordHash.Should().Be("hashed_admin_pass");
    }

    [Fact]
    public async Task Delete_LastEffectiveSuperAdmin_ThrowsLastSuperAdmin()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var seams = CreateSeams();
        var handler = CreateAdminHandlers(db, seams.hasher, seams.policy, seams.sessions, seams.cache, seams.audit);

        var act = () => handler.Handle(new DeleteAdminCommand(actor.Id, actor.Id, ActorPassword), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("LAST_SUPER_ADMIN");
        db.Admins.Should().Contain(admin => admin.Id == actor.Id, "the last effective super admin must survive the rejected delete");
    }

    [Fact]
    public async Task Demote_LastEffectiveSuperAdmin_ThrowsLastSuperAdmin()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var plainRole = AdminRole.Create("plain_support", "دعم فني");
        db.AdminRoles.Add(plainRole);
        db.SaveChanges();
        var seams = CreateSeams();
        var handler = CreateRoleHandlers(db, seams.audit);

        var act = () => handler.Handle(new AssignAdminRoleCommand(actor.Id, actor.Id, plainRole.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("LAST_SUPER_ADMIN");
        actor.RoleId.Should().NotBe(plainRole.Id);
    }

    // ===== (d) another super exists but is suspended → still blocked =====

    [Fact]
    public async Task Disable_LastActiveSuper_WhenSecondSuperIsSuspended_StillThrows()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var suspendedSecondSuper = CreateSecondSuperAdmin(db, "suspended-super@test.local");
        suspendedSecondSuper.SetStatus(AdminStatus.Disabled);
        db.SaveChanges();
        var seams = CreateSeams();
        var handler = CreateAdminHandlers(db, seams.hasher, seams.policy, seams.sessions, seams.cache, seams.audit);

        var act = () => handler.Handle(new SetAdminStatusCommand(actor.Id, actor.Id, IsActive: false), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("LAST_SUPER_ADMIN",
            "only an ACTIVE second super admin backs the mutation — a suspended one does not count");
    }

    [Fact]
    public async Task Demote_LastActiveSuper_WhenSecondSuperIsSuspended_StillThrows()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var actor = db.Admins.First();
        var suspendedSecondSuper = CreateSecondSuperAdmin(db, "sleeping-super@test.local");
        suspendedSecondSuper.SetStatus(AdminStatus.Disabled);
        db.SaveChanges();
        var plainRole = AdminRole.Create("plain_editor", "محرر");
        db.AdminRoles.Add(plainRole);
        db.SaveChanges();
        var seams = CreateSeams();
        var handler = CreateRoleHandlers(db, seams.audit);

        var act = () => handler.Handle(new AssignAdminRoleCommand(actor.Id, actor.Id, plainRole.Id), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("LAST_SUPER_ADMIN");
    }

    // ===== Actor discipline unchanged =====

    [Fact]
    public async Task Disable_ByNonSuperActor_StillForbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var superActor = db.Admins.First();
        var nonSuperActor = CreateCustomAdmin(db, "non-super-actor@test.local");
        var seams = CreateSeams();
        var handler = CreateAdminHandlers(db, seams.hasher, seams.policy, seams.sessions, seams.cache, seams.audit);

        var act = () => handler.Handle(new SetAdminStatusCommand(nonSuperActor.Id, superActor.Id, IsActive: false), CancellationToken.None);

        (await act.Should().ThrowAsync<ForbiddenException>()).Which.ErrorCode.Should().Be("FORBIDDEN",
            "the actor-side super-admin gate is unchanged — only the target-side rule was relaxed");
    }
}
