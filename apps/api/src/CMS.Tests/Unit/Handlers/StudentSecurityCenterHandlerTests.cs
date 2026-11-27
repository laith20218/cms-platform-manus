using CMS.Application.Commands.Dashboard;
using CMS.Application.DTOs.Dashboard;
using CMS.Application.Handlers.Dashboard;
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
/// PR-6 (Student Center) — AdminManagementHandlers additions: the student password
/// reset (actor re-auth, hash swap, session revocation, audited), the idempotent
/// archive/restore tombstone lifecycle, the student detail projection, and the
/// "archived" status filter of GetStudentsQuery. Authorization lives at the
/// controllers, so IPermissionService is an inert mock here (no setups needed).
/// </summary>
public class StudentSecurityCenterHandlerTests
{
    private const string ActorPassword = "ActorAdminPass123!";
    private const string NewPassword = "BrandNewStudent123!";

    private static (Mock<IPasswordHasher> hasher, Mock<IPasswordPolicy> policy, Mock<ISessionService> sessions, Mock<ISecurityAuditWriter> audit) CreateSeams()
    {
        var hasher = new Mock<IPasswordHasher>();
        hasher.Setup(h => h.VerifyPassword(ActorPassword, It.IsAny<string>())).Returns(true);
        hasher.Setup(h => h.HashPassword(NewPassword)).Returns("new-student-hash");
        return (hasher, new Mock<IPasswordPolicy>(), new Mock<ISessionService>(), new Mock<ISecurityAuditWriter>());
    }

    private static AdminManagementHandlers CreateHandler(ApplicationDbContext db, Mock<IPasswordHasher> hasher, Mock<IPasswordPolicy> policy, Mock<ISessionService> sessions, Mock<ISecurityAuditWriter> audit)
        => new(db, new UnitOfWork(db), new Mock<IPermissionService>().Object, audit.Object, NoOp.ActivityWriter(), hasher.Object, policy.Object, sessions.Object);

    // ===== ResetStudentPasswordCommand =====

    [Fact]
    public async Task ResetStudentPassword_HappyPath_SwapsHashRevokesSessionsAndAudits()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var admin = db.Admins.First();
        var originalHash = student.PasswordHash;
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        await handler.Handle(new ResetStudentPasswordCommand(admin.Id, student.Id, ActorPassword, NewPassword, ForceChangeOnNextLogin: true), CancellationToken.None);

        student.PasswordHash.Should().Be("new-student-hash").And.NotBe(originalHash);
        student.MustChangePassword.Should().BeTrue("force_change flag must persist for the next login");
        sessions.Verify(s => s.RevokeAllForUserAsync(student.Id, "admin_password_reset", It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.LogSecurityEventAsync(
            student.Id,
            admin.Id,
            SecurityEventType.PasswordChanged,
            SecuritySeverity.Warning,
            It.Is<string>(description => description.Contains("credential_reset=student")
                && description.Contains($"target_student_id={student.Id}")
                && description.Contains("force_change=true")
                && !description.Contains(NewPassword)),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ResetStudentPassword_WithoutForceChange_LeavesFlagCleared()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var admin = db.Admins.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        await handler.Handle(new ResetStudentPasswordCommand(admin.Id, student.Id, ActorPassword, NewPassword, ForceChangeOnNextLogin: false), CancellationToken.None);

        student.PasswordHash.Should().Be("new-student-hash");
        student.MustChangePassword.Should().BeFalse();
        audit.Verify(a => a.LogSecurityEventAsync(
            student.Id, admin.Id, SecurityEventType.PasswordChanged, SecuritySeverity.Warning,
            It.Is<string>(description => description.Contains("force_change=false")),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ResetStudentPassword_WrongActorPassword_RejectedBeforeAnyChange()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var admin = db.Admins.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        hasher.Setup(h => h.VerifyPassword("WrongActorPassword!", It.IsAny<string>())).Returns(false);
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        var act = () => handler.Handle(new ResetStudentPasswordCommand(admin.Id, student.Id, "WrongActorPassword!", NewPassword, false), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("INVALID_CURRENT_PASSWORD");
        student.PasswordHash.Should().Be("hashed_password_123");
        sessions.Verify(s => s.RevokeAllForUserAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        audit.Verify(a => a.LogSecurityEventAsync(It.IsAny<Guid?>(), It.IsAny<Guid?>(), It.IsAny<SecurityEventType>(), It.IsAny<SecuritySeverity>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ResetStudentPassword_WeakNewPassword_RejectedByPolicy()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var admin = db.Admins.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        policy.Setup(p => p.EnsureValid("weak")).Throws(new DomainException("كلمة المرور ضعيفة", "PASSWORD_POLICY_VIOLATION"));
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        var act = () => handler.Handle(new ResetStudentPasswordCommand(admin.Id, student.Id, ActorPassword, "weak", false), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("PASSWORD_POLICY_VIOLATION");
        student.PasswordHash.Should().Be("hashed_password_123");
        sessions.Verify(s => s.RevokeAllForUserAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ResetStudentPassword_UnknownStudent_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var admin = db.Admins.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        var act = () => handler.Handle(new ResetStudentPasswordCommand(admin.Id, Guid.NewGuid(), ActorPassword, NewPassword, false), CancellationToken.None);

        (await act.Should().ThrowAsync<NotFoundException>()).Which.ErrorCode.Should().Be("NOT_FOUND");
    }

    [Fact]
    public async Task ResetStudentPassword_UnknownActorAdmin_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        var act = () => handler.Handle(new ResetStudentPasswordCommand(Guid.NewGuid(), student.Id, ActorPassword, NewPassword, false), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    // ===== ArchiveStudentCommand / RestoreStudentCommand =====

    [Fact]
    public async Task ArchiveStudent_RevokesSessionsAndHidesStudent()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var admin = db.Admins.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        await handler.Handle(new ArchiveStudentCommand(admin.Id, student.Id), CancellationToken.None);

        student.DeletedAt.Should().NotBeNull("archiving sets the tombstone timestamp");
        sessions.Verify(s => s.RevokeAllForUserAsync(student.Id, "student_archived", It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.LogSecurityEventAsync(
            student.Id, admin.Id, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            It.Is<string>(description => description.Contains("action=student_archive") && description.Contains($"target_student_id={student.Id}")),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ArchiveStudent_AlreadyArchived_IsIdempotent()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var admin = db.Admins.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        await handler.Handle(new ArchiveStudentCommand(admin.Id, student.Id), CancellationToken.None);
        await handler.Handle(new ArchiveStudentCommand(admin.Id, student.Id), CancellationToken.None);

        sessions.Verify(s => s.RevokeAllForUserAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
        audit.Verify(a => a.LogSecurityEventAsync(It.IsAny<Guid?>(), It.IsAny<Guid?>(), It.IsAny<SecurityEventType>(), It.IsAny<SecuritySeverity>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ArchiveThenRestoreStudent_RestoresVisibilityAndAuditsBoth()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var admin = db.Admins.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        await handler.Handle(new ArchiveStudentCommand(admin.Id, student.Id), CancellationToken.None);
        await handler.Handle(new RestoreStudentCommand(admin.Id, student.Id), CancellationToken.None);

        student.DeletedAt.Should().BeNull("restoring clears the tombstone");
        audit.Verify(a => a.LogSecurityEventAsync(
            student.Id, admin.Id, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            It.Is<string>(description => description.Contains("action=student_restore") && description.Contains($"target_student_id={student.Id}")),
            It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RestoreStudent_NotArchived_IsIdempotent()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        var admin = db.Admins.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        await handler.Handle(new RestoreStudentCommand(admin.Id, student.Id), CancellationToken.None);

        student.DeletedAt.Should().BeNull();
        audit.Verify(a => a.LogSecurityEventAsync(It.IsAny<Guid?>(), It.IsAny<Guid?>(), It.IsAny<SecurityEventType>(), It.IsAny<SecuritySeverity>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ArchiveStudent_UnknownStudent_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var admin = db.Admins.First();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        var act = () => handler.Handle(new ArchiveStudentCommand(admin.Id, Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    // ===== GetStudentsQuery — "archived" status filter =====

    [Fact]
    public async Task GetStudentsQuery_StatusArchived_ReturnsOnlySoftDeletedStudents()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var archived = Student.Create("0993222111", "hash-archived", "طالب مؤرشف");
        archived.Archive();
        db.Students.Add(archived);
        await db.SaveChangesAsync();
        var (query, handler) = CreateStudentsQueryHandler(db);

        var result = await handler.Handle(query with { Status = "archived" }, CancellationToken.None);

        result.Total.Should().Be(1);
        result.Items.Should().ContainSingle(dto => dto.Id == archived.Id);
    }

    [Fact]
    public async Task GetStudentsQuery_StatusArchived_IsCaseInsensitive()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var archived = Student.Create("0993222112", "hash-archived", "طالب مؤرشف");
        archived.Archive();
        db.Students.Add(archived);
        await db.SaveChangesAsync();
        var (query, handler) = CreateStudentsQueryHandler(db);

        var result = await handler.Handle(query with { Status = "Archived" }, CancellationToken.None);

        result.Total.Should().Be(1);
        result.Items.Should().ContainSingle(dto => dto.Id == archived.Id);
    }

    [Fact]
    public async Task GetStudentsQuery_DefaultStatus_HidesArchivedStudents()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var active = db.Students.First();
        var archived = Student.Create("0993222213", "hash-archived", "طالب مؤرشف");
        archived.Archive();
        db.Students.Add(archived);
        await db.SaveChangesAsync();
        var (query, handler) = CreateStudentsQueryHandler(db);

        var result = await handler.Handle(query with { Status = null }, CancellationToken.None);

        result.Total.Should().Be(1);
        result.Items.Should().ContainSingle(dto => dto.Id == active.Id);
    }

    [Fact]
    public async Task GetStudentsQuery_StatusActiveWithinArchivedSearch_HidesArchivedStudents()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var active = db.Students.First();
        var archived = Student.Create("0993222314", "hash-archived", "طالب مؤرشف");
        archived.Archive();
        db.Students.Add(archived);
        await db.SaveChangesAsync();
        var (query, handler) = CreateStudentsQueryHandler(db);

        var result = await handler.Handle(query with { Status = "Active" }, CancellationToken.None);

        result.Total.Should().Be(1);
        result.Items.Should().ContainSingle(dto => dto.Id == active.Id);
    }

    private static (GetStudentsQuery Query, AdminManagementHandlers Handler) CreateStudentsQueryHandler(ApplicationDbContext db)
    {
        var permissions = new Mock<IPermissionService>();
        permissions.Setup(p => p.HasPermissionAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        permissions.Setup(p => p.GetScopeAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AdminScope(null, null, null, null, IsSuperAdmin: true));
        var handler = new AdminManagementHandlers(db, new UnitOfWork(db), permissions.Object, new Mock<ISecurityAuditWriter>().Object, NoOp.ActivityWriter(),
            new Mock<IPasswordHasher>().Object, new Mock<IPasswordPolicy>().Object, new Mock<ISessionService>().Object);
        var admin = db.Admins.First();
        return (new GetStudentsQuery(Search: null, UniversityId: null, Status: null, Page: 1, PageSize: 20, AdminId: admin.Id), handler);
    }

    // ===== GetStudentDetailQuery =====

    [Fact]
    public async Task GetStudentDetail_PopulatesEveryDrawerField()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        student.SetEmail("student@cms.example.com");
        student.UpdateProfile(fullName: null, avatarUrl: "avatars/students/key.png", gender: "male");
        student.RecordAnswer(true);
        student.RecordAnswer(false);
        student.RecordAnswer(false);
        student.RecordAnswer(false);
        student.FlagMustChangePassword();
        var now = DateTime.UtcNow;
        var activeSubscription = new StudentSubscription
        {
            StudentId = student.Id,
            ScopeType = SubscriptionScopeType.Subject,
            Status = SubscriptionStatus.Active,
            StartsAt = now.AddDays(-2),
            ExpiresAt = now.AddDays(28),
        };
        var expiredSubscription = new StudentSubscription
        {
            StudentId = student.Id,
            ScopeType = SubscriptionScopeType.College,
            Status = SubscriptionStatus.Active,
            StartsAt = now.AddMonths(-6),
            ExpiresAt = now.AddMonths(-5),
        };
        var device = new DeviceBinding
        {
            StudentId = student.Id,
            DeviceFingerprint = "fingerprint-1",
            DeviceName = "Samsung Galaxy S23",
            DeviceType = "mobile",
            Os = "Android",
            Browser = "Chrome",
            IsActive = true,
            BoundAt = now.AddDays(-10),
            LastUsed = now.AddHours(-1),
        };
        var inactiveDevice = new DeviceBinding
        {
            StudentId = student.Id,
            DeviceFingerprint = "fingerprint-0",
            DeviceName = "Old phone",
            IsActive = false,
            BoundAt = now.AddDays(-90),
            LastUsed = now.AddDays(-80),
        };
        db.StudentSubscriptions.AddRange(activeSubscription, expiredSubscription);
        db.DeviceBindings.AddRange(device, inactiveDevice);
        await db.SaveChangesAsync();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        var detail = await handler.Handle(new GetStudentDetailQuery(db.Admins.First().Id, student.Id), CancellationToken.None);

        detail.Id.Should().Be(student.Id);
        detail.FullName.Should().Be(student.FullName);
        detail.Phone.Should().Be(student.Phone);
        detail.Email.Should().Be("student@cms.example.com");
        detail.Gender.Should().Be("male");
        detail.AvatarUrl.Should().Be("avatars/students/key.png");
        detail.Status.Should().Be("Active");
        detail.BanReason.Should().BeNull();
        detail.BanUntil.Should().BeNull();
        detail.LockedOut.Should().BeFalse();
        detail.LockoutUntil.Should().BeNull();
        detail.FailedLoginCount.Should().Be(0);
        detail.PhoneVerified.Should().BeTrue("TestDbHelper verifies the seeded student's phone");
        detail.MustChangePassword.Should().BeTrue();
        detail.Archived.Should().BeFalse();
        detail.ArchivedAt.Should().BeNull();
        detail.CreatedAt.Should().Be(student.CreatedAt);
        detail.LastLogin.Should().BeNull();
        detail.LoginCount.Should().Be(0);
        detail.QuestionsAnswered.Should().Be(4);
        detail.CorrectAnswers.Should().Be(1);
        detail.Accuracy.Should().Be(25.0);
        detail.Academic.Should().NotBeNull();
        detail.Academic!.UniversityId.Should().Be(student.UniversityId);
        detail.Academic.UniversityName.Should().Be(db.Universities.First().NameAr);
        detail.Academic.CollegeName.Should().Be(db.Colleges.First().NameAr);
        detail.Academic.AcademicYearName.Should().Be(db.AcademicYears.First().NameAr);
        detail.SubscriptionSummary.Should().NotBeNull();
        detail.SubscriptionSummary.ActiveCount.Should().Be(1);
        detail.SubscriptionSummary.Latest.Should().NotBeNull();
        detail.SubscriptionSummary.Latest!.Id.Should().Be(activeSubscription.Id);
        detail.SubscriptionSummary.Latest.ScopeType.Should().Be("Subject");
        detail.ActiveDevice.Should().NotBeNull();
        detail.ActiveDevice!.DeviceName.Should().Be("Samsung Galaxy S23");
        detail.ActiveDevice.DeviceType.Should().Be("mobile");
        detail.ActiveDevice.Os.Should().Be("Android");
        detail.ActiveDevice.Browser.Should().Be("Chrome");
        detail.ActiveDevice.LastUsed.Should().Be(device.LastUsed);
    }

    [Fact]
    public async Task GetStudentDetail_ArchivedStudentWithLockout_ReportsStateFlags()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = db.Students.First();
        student.Ban("اختبار الحظر", DateTime.UtcNow.AddDays(3));
        typeof(Student).GetProperty("LockoutUntil")?.SetValue(student, DateTime.UtcNow.AddMinutes(10));
        typeof(Student).GetProperty("FailedLoginCount")?.SetValue(student, 4);
        student.Archive();
        await db.SaveChangesAsync();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        var detail = await handler.Handle(new GetStudentDetailQuery(db.Admins.First().Id, student.Id), CancellationToken.None);

        detail.Status.Should().Be("Banned");
        detail.BanReason.Should().Be("اختبار الحظر");
        detail.BanUntil.Should().NotBeNull();
        detail.LockedOut.Should().BeTrue();
        detail.LockoutUntil.Should().NotBeNull();
        detail.FailedLoginCount.Should().Be(4);
        detail.Archived.Should().BeTrue();
        detail.ArchivedAt.Should().NotBeNull();
        detail.ActiveDevice.Should().BeNull("no device bindings were seeded");
        detail.SubscriptionSummary.ActiveCount.Should().Be(0);
        detail.SubscriptionSummary.Latest.Should().BeNull();
    }

    [Fact]
    public async Task GetStudentDetail_UnknownStudent_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var (hasher, policy, sessions, audit) = CreateSeams();
        var handler = CreateHandler(db, hasher, policy, sessions, audit);

        var act = () => handler.Handle(new GetStudentDetailQuery(db.Admins.First().Id, Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }
}
