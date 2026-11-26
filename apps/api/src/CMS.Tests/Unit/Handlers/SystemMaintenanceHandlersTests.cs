using CMS.Application.Commands.Maintenance;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Command Center P1 — SystemMaintenanceHandlers safety contract:
///  • re-auth (wrong password → domain error), SuperAdmin-only gate
///  • typed confirmation (DELETE / حذف accepted; anything else refused)
///  • dryRun previews counts WITHOUT deleting
///  • questions wipe deletes question rows but the academic structure SURVIVES
///  • academic (nuclear) wipe removes the structure while students/admins
///    SURVIVE with their scope references nulled
///  • students wipe takes their sessions with them
///  • hard delete fails LOUDLY on cross-domain children and succeeds on a
///    childless question (own options always go)
///  • every destructive run writes a Critical security audit event
///
/// PR-1 additions:
///  • hard delete is OFF by default (Features:HardDeleteEnabled) — fail-closed on
///    missing/unparseable/"false"; a crafted SuperAdmin request is REJECTED, audited
///    (Warning), and nothing is deleted; the kill switch fires before re-auth
///  • destructive runs write BOTH a pre-transaction intent event and the
///    post-commit executed event
///
/// Runs on SQLite in-memory (relational) because ExecuteDelete/ExecuteUpdate
/// are translated to SQL — the EF InMemory provider cannot execute them.
/// </summary>
public sealed class SystemMaintenanceHandlersTests : IDisposable
{
    private sealed class FakeHasher : IPasswordHasher
    {
        public string HashPassword(string password) => "hashed_" + password;
        public bool VerifyPassword(string password, string hash) => hash == "hashed_" + password;
        public bool NeedsRehash(string hash) => false;
    }

    private sealed class RecordingAuditWriter : ISecurityAuditWriter
    {
        public List<string> Events { get; } = [];

        public Task LogSecurityEventAsync(
            Guid? studentId, Guid? adminId, SecurityEventType eventType, SecuritySeverity severity,
            string description, string? ipAddress = null, string? userAgent = null,
            string? deviceFingerprint = null, CancellationToken ct = default)
        {
            Events.Add($"{severity}:{description}");
            return Task.CompletedTask;
        }
    }

    private readonly ApplicationDbContext _db;
    private readonly SystemMaintenanceHandlers _handler;
    private readonly RecordingAuditWriter _audit;
    private readonly Guid _adminId;
    private readonly SqliteConnection _connection;

    // The seeded super admin's PasswordHash is "hashed_admin_pass" → FakeHasher password "admin_pass".
    private const string AdminPassword = "admin_pass";

    public SystemMaintenanceHandlersTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(_connection)
            .Options;
        _db = new ApplicationDbContext(options);
        _db.Database.EnsureCreated();
        TestDbHelper.SeedTestData(_db);
        _audit = new RecordingAuditWriter();
        // PR-1: the pre-existing behavior tests exercise the ENABLED path; the
        // flag-specific tests construct their own handler via BuildHandler.
        _handler = BuildHandler("true");
        _adminId = _db.Admins.First().Id;
    }

    /// <summary>PR-1: handler factory with an explicit Features:HardDeleteEnabled value.</summary>
    private SystemMaintenanceHandlers BuildHandler(string? hardDeleteFlag)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Features:HardDeleteEnabled"] = hardDeleteFlag,
            })
            .Build();
        return new SystemMaintenanceHandlers(_db, new UnitOfWork(_db), new FakeHasher(), _audit, configuration);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    // ============================================================
    // Guards
    // ============================================================

    [Fact]
    public async Task Wipe_WrongPassword_IsRefused()
    {
        var act = () => _handler.Handle(new WipeDataCommand(_adminId, "questions", "DELETE", "wrong", DryRun: false), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Which.ErrorCode.Should().Be("INVALID_CURRENT_PASSWORD");
        _db.Questions.Count().Should().Be(2, "nothing may be deleted when re-auth fails");
    }

    [Fact]
    public async Task Wipe_NonSuperAdmin_IsRefused()
    {
        var role = AdminRole.Create("college_admin", "مدير كلية", "نطاق كلية", false);
        var collegeAdmin = Admin.Create("college@cms.example.com", "hashed_x", "College Admin", role.Id);
        _db.AdminRoles.Add(role);
        _db.Admins.Add(collegeAdmin);
        _db.SaveChanges();

        var act = () => _handler.Handle(new WipeDataCommand(collegeAdmin.Id, "questions", "DELETE", "x", DryRun: true), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Which.ErrorCode.Should().Be("FORBIDDEN_NOT_SUPER_ADMIN");
    }

    [Theory]
    [InlineData("yes")]
    [InlineData("DELETE IT")]
    [InlineData("")]
    public async Task Wipe_BadConfirmText_IsRefused(string confirmText)
    {
        var act = () => _handler.Handle(new WipeDataCommand(_adminId, "questions", confirmText, AdminPassword, DryRun: false), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Which.ErrorCode.Should().Be("INVALID_CONFIRM_TEXT");
        _db.Questions.Count().Should().Be(2);
    }

    [Theory]
    [InlineData("DELETE")]
    [InlineData("delete")]
    [InlineData(" حذف ")]
    public async Task Wipe_AcceptedConfirmTexts(string confirmText)
    {
        var result = await _handler.Handle(new WipeDataCommand(_adminId, "questions", confirmText, AdminPassword, DryRun: false), CancellationToken.None);

        result.DryRun.Should().BeFalse();
        _db.Questions.Count().Should().Be(0);
    }

    [Fact]
    public async Task Wipe_UnknownModule_IsRefused()
    {
        var act = () => _handler.Handle(new WipeDataCommand(_adminId, "everything", "DELETE", AdminPassword, DryRun: true), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Which.ErrorCode.Should().Be("INVALID_WIPE_MODULE");
    }

    // ============================================================
    // dryRun
    // ============================================================

    [Fact]
    public async Task Wipe_DryRun_CountsRows_WithoutDeletingAnything()
    {
        var result = await _handler.Handle(new WipeDataCommand(_adminId, "questions", "irrelevant-in-dryrun", AdminPassword, DryRun: true), CancellationToken.None);

        result.DryRun.Should().BeTrue();
        var questions = result.Tables.Should().ContainSingle(t => t.Table == "questions").Which;
        questions.Rows.Should().Be(2);
        result.Tables.Should().Contain(t => t.Table == "question_options" && t.Rows == 8, "the two seeded questions carry 4 options each");

        _db.Questions.Count().Should().Be(2, "dryRun must not delete");
        _db.QuestionOptions.Count().Should().Be(8);
        _audit.Events.Should().BeEmpty("dryRun is a preview, not a destructive action");
    }

    // ============================================================
    // Module semantics (locked decisions)
    // ============================================================

    [Fact]
    public async Task Wipe_Questions_DeletesQuestions_ButAcademicStructureSurvives()
    {
        var result = await _handler.Handle(new WipeDataCommand(_adminId, "questions", "DELETE", AdminPassword, DryRun: false), CancellationToken.None);

        _db.Questions.Count().Should().Be(0);
        _db.QuestionOptions.Count().Should().Be(0);
        _db.Universities.Count().Should().Be(1, "locked decision: the academic structure survives a questions wipe");
        _db.Colleges.Count().Should().Be(1);
        _db.AcademicYears.Count().Should().Be(1);
        _db.Semesters.Count().Should().Be(1);
        _db.Subjects.Count().Should().Be(1);
        _db.Lectures.Count().Should().Be(1);
        _db.Exams.Count().Should().Be(1, "exams are not questions");
        _db.Students.Count().Should().Be(1);

        _audit.Events.Should().Contain(e => e.StartsWith("Critical:") && e.Contains("action=wipe_data; phase=intent; module=questions"));
        _audit.Events.Should().Contain(e => e.StartsWith("Critical:") && e.Contains("action=wipe_data; phase=executed; module=questions"));
    }

    [Fact]
    public async Task Wipe_Students_TakesSessionsAndSubscriptions_ButCodesSurvive()
    {
        var student = TestDbHelper.GetTestStudent(_db);
        _db.UserSessions.Add(new UserSession
        {
            UserId = student.Id,
            Role = "student",
            InstallationId = "test-installation",
            FamilyId = Guid.NewGuid(),
            RefreshTokenHash = "hash",
            RefreshTokenExpiresAt = DateTime.UtcNow.AddHours(1),
            Status = SessionStatus.Active,
        });
        var batch = new CodeBatch
        {
            Name = "wipe-batch",
            Quantity = 5,
            ScopeType = "subject",
            DurationDays = 30,
            CreatedBy = _adminId,
        };
        _db.CodeBatches.Add(batch);
        _db.SubscriptionCodes.Add(new SubscriptionCode
        {
            Code = "WCODE01",
            BatchId = batch.Id,
            ScopeType = SubscriptionScopeType.Subject,
        });
        await _db.SaveChangesAsync();

        var result = await _handler.Handle(new WipeDataCommand(_adminId, "students", "DELETE", AdminPassword, DryRun: false), CancellationToken.None);

        _db.Students.Count().Should().Be(0);
        _db.UserSessions.Count().Should().Be(0, "locked decision: student sessions go with the students");
        _db.SubscriptionCodes.Count().Should().Be(1, "codes are admin-issued assets and survive");
        _db.Subjects.Count().Should().Be(1);
    }

    [Fact]
    public async Task Wipe_Academic_Nuclear_RemovesStructure_StudentsAndAdminsSurviveUnscoped()
    {
        var student = TestDbHelper.GetTestStudent(_db);
        student.UniversityId.Should().NotBeNull("seeded student is scoped before the wipe");

        var result = await _handler.Handle(new WipeDataCommand(_adminId, "academic", "DELETE", AdminPassword, DryRun: false), CancellationToken.None);

        _db.Universities.Count().Should().Be(0);
        _db.Colleges.Count().Should().Be(0);
        _db.AcademicYears.Count().Should().Be(0);
        _db.Semesters.Count().Should().Be(0);
        _db.Subjects.Count().Should().Be(0);
        _db.Lectures.Count().Should().Be(0);
        _db.Questions.Count().Should().Be(0);
        _db.Exams.Count().Should().Be(0);

        _db.Students.Count().Should().Be(1, "the nuclear tree is the structure — students survive");
        _db.Admins.Count().Should().Be(1, "admins survive");
        // ExecuteUpdate bypasses the change tracker: re-read from the store, not the
        // stale tracked instances seeded by TestDbHelper.
        var studentAfter = _db.Students.AsNoTracking().First();
        studentAfter.UniversityId.Should().BeNull("surviving scope references are nulled, not orphaned");
        studentAfter.CollegeId.Should().BeNull();
        studentAfter.AcademicYearId.Should().BeNull();
    }

    // ============================================================
    // Hard delete
    // ============================================================

    [Fact]
    public async Task HardDelete_SubjectWithChildren_FailsLoudlyWithoutCascade()
    {
        var subject = TestDbHelper.GetTestSubject(_db);

        var act = () => _handler.Handle(new HardDeleteCommand(_adminId, "subject", subject.Id, AdminPassword, Cascade: false), CancellationToken.None);

        var error = (await act.Should().ThrowAsync<DomainException>()).Which;
        error.ErrorCode.Should().Be("HARD_DELETE_HAS_CHILDREN");
        error.Message.Should().Contain("questions=2").And.Contain("exams=1").And.Contain("lectures=1");
        _db.Subjects.Count().Should().Be(1, "nothing was deleted");
    }

    [Fact]
    public async Task HardDelete_Question_RemovesOptionsAndQuestion()
    {
        var question = TestDbHelper.GetTestQuestion(_db);

        var result = await _handler.Handle(new HardDeleteCommand(_adminId, "question", question.Id, AdminPassword, Cascade: false), CancellationToken.None);

        _db.Questions.Count().Should().Be(1);
        _db.Questions.Should().NotContain(q => q.Id == question.Id);
        _db.QuestionOptions.Count(o => o.QuestionId == question.Id).Should().Be(0, "own anatomy goes with the question");
        _audit.Events.Should().Contain(e => e.StartsWith("Critical:") && e.Contains("action=hard_delete; phase=intent; module=question"));
        _audit.Events.Should().Contain(e => e.StartsWith("Critical:") && e.Contains("action=hard_delete; phase=executed; module=question"));
    }

    [Fact]
    public async Task HardDelete_UnknownTarget_IsNotFound()
    {
        var act = () => _handler.Handle(new HardDeleteCommand(_adminId, "question", Guid.NewGuid(), AdminPassword, Cascade: false), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task HardDelete_WrongPassword_IsRefused()
    {
        var question = TestDbHelper.GetTestQuestion(_db);

        var act = () => _handler.Handle(new HardDeleteCommand(_adminId, "question", question.Id, "nope", Cascade: true), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("INVALID_CURRENT_PASSWORD");
        _db.Questions.Count().Should().Be(2);
    }

    [Fact]
    public async Task HardDelete_Subject_WithCascade_RemovesWholeSubtree()
    {
        var subject = TestDbHelper.GetTestSubject(_db);

        var result = await _handler.Handle(new HardDeleteCommand(_adminId, "subject", subject.Id, AdminPassword, Cascade: true), CancellationToken.None);

        _db.Subjects.Count().Should().Be(0);
        _db.Questions.Count().Should().Be(0);
        _db.QuestionOptions.Count().Should().Be(0);
        _db.Lectures.Count().Should().Be(0);
        _db.Exams.Count().Should().Be(0);
        _db.Students.Count().Should().Be(1, "students are never collateral of a subject cascade");
    }

    // ============================================================
    // PR-1 — backend-enforced hard-delete feature flag (Gate B #3)
    // ============================================================

    [Theory]
    [InlineData(null)]    // key absent → fail closed
    [InlineData("false")]
    [InlineData("")]
    [InlineData("garbage")]
    public async Task HardDelete_FlagOffOrMissing_RejectsEvenForCraftedSuperAdminRequest(string? flag)
    {
        var handler = BuildHandler(flag);
        var question = TestDbHelper.GetTestQuestion(_db);

        var act = () => handler.Handle(new HardDeleteCommand(_adminId, "question", question.Id, AdminPassword, Cascade: true), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Which.ErrorCode.Should().Be("HARD_DELETE_DISABLED");
        _db.Questions.Count().Should().Be(2, "a disabled flag rejects the operation before any transaction");
        _db.QuestionOptions.Count().Should().Be(8);
        _audit.Events.Should().Contain(
            e => e.StartsWith("Warning:") && e.Contains("action=hard_delete; phase=rejected; reason=HARD_DELETE_DISABLED"),
            "the rejected attempt is attributed to the acting super admin");
    }

    [Fact]
    public async Task HardDelete_FlagOff_FiresBeforePasswordVerification()
    {
        // The kill switch fires before re-auth: while the capability is disabled a
        // crafted request cannot even probe the password path (and never burns Argon2).
        var handler = BuildHandler("false");
        var question = TestDbHelper.GetTestQuestion(_db);

        var act = () => handler.Handle(new HardDeleteCommand(_adminId, "question", question.Id, "wrong-password", Cascade: true), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>())
            .Which.ErrorCode.Should().Be("HARD_DELETE_DISABLED");
    }

    [Fact]
    public async Task HardDelete_FlagOn_PreservesTheLoudFailContract()
    {
        // Regression guard: enabling the flag must NOT change the loud-fail contract.
        var subject = TestDbHelper.GetTestSubject(_db);

        var act = () => _handler.Handle(new HardDeleteCommand(_adminId, "subject", subject.Id, AdminPassword, Cascade: false), CancellationToken.None);

        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("HARD_DELETE_HAS_CHILDREN");
    }

    [Fact]
    public void HardDelete_FlagParsing_IsFailClosed()
    {
        var enabled = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Features:HardDeleteEnabled"] = "true" })
            .Build();
        var missing = new ConfigurationBuilder().Build();
        var unparsable = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Features:HardDeleteEnabled"] = "yes" })
            .Build();

        SystemMaintenanceHandlers.IsHardDeleteEnabled(enabled).Should().BeTrue();
        SystemMaintenanceHandlers.IsHardDeleteEnabled(missing).Should().BeFalse("absent key means disabled");
        SystemMaintenanceHandlers.IsHardDeleteEnabled(unparsable).Should().BeFalse("unparseable value means disabled");
        SystemMaintenanceHandlers.IsHardDeleteEnabled(null!).Should().BeFalse("no configuration at all means disabled");
    }

    [Fact]
    public async Task HardDelete_RealRun_WritesIntentAndExecutedAuditEvents()
    {
        var question = TestDbHelper.GetTestQuestion(_db);

        await _handler.Handle(new HardDeleteCommand(_adminId, "question", question.Id, AdminPassword, Cascade: false), CancellationToken.None);

        _audit.Events.Should().Contain(e => e.StartsWith("Critical:") && e.Contains("action=hard_delete; phase=intent; module=question"));
        _audit.Events.Should().Contain(e => e.StartsWith("Critical:") && e.Contains("action=hard_delete; phase=executed; module=question"));
    }

    [Fact]
    public async Task Wipe_RealRun_WritesIntentAndExecutedAuditEvents()
    {
        await _handler.Handle(new WipeDataCommand(_adminId, "questions", "DELETE", AdminPassword, DryRun: false), CancellationToken.None);

        _audit.Events.Should().Contain(e => e.StartsWith("Critical:") && e.Contains("action=wipe_data; phase=intent; module=questions"));
        _audit.Events.Should().Contain(e => e.StartsWith("Critical:") && e.Contains("action=wipe_data; phase=executed; module=questions"));
    }

    // ============================================================
    // Static contract helpers
    // ============================================================

    [Theory]
    [InlineData("DELETE", true)]
    [InlineData("delete", true)]
    [InlineData("  حذف  ", true)]
    [InlineData("حذف نهائي", false)]
    [InlineData("DEL", false)]
    public void ConfirmText_Rules(string typed, bool expected)
        => SystemMaintenanceHandlers.IsValidConfirmText(typed).Should().Be(expected);
}
