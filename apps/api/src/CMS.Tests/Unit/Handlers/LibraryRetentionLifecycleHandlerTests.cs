using CMS.Application.Commands.Library;
using CMS.Application.Handlers.Library;
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
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// PR-5 — provider-neutral object-retention lifecycle for library assets:
///   Active → Archived/Tombstoned → Quarantine | Retention Pending → Restorable or
///   Final Deletion (purge).
///
/// Covered contract:
///  • quarantine requires a reason, hides the file from students (status → Archived),
///    records actor/time/reason and NEVER touches the stored object;
///  • restore lifts quarantine and clears tombstones (row returns as Draft);
///  • purge (final object deletion) is separate, SuperAdmin-authorized,
///    password-re-authenticated, retention-window aware and audited — refused with
///    the flag off, for non-super-admins, wrong passwords, active rows, and rows
///    still inside the retention window;
///  • purge deletes stored objects FIRST and the row second, so a provider failure
///    mid-flight leaves the tombstone intact and the whole operation retryable
///    (S3 delete semantics are idempotent — the retry completes);
///  • the pre-PR-5 soft delete now stamps DeletedBy on the row and the
///    retention-pending state.
///
/// Runs on SQLite in-memory (relational) because the purge flow opens an explicit
/// transaction — the EF InMemory provider cannot execute those.
/// </summary>
public sealed class LibraryRetentionLifecycleHandlerTests : IDisposable
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
    private readonly SqliteConnection _connection;
    private readonly RecordingAuditWriter _audit;
    private readonly Mock<IFileStorageService> _storage;
    private readonly Guid _superAdminId;
    private const string AdminPassword = "admin_pass"; // seeded PasswordHash is "hashed_admin_pass" via FakeHasher

    public LibraryRetentionLifecycleHandlerTests()
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
        _storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        _superAdminId = _db.Admins.First().Id;
    }

    private LibraryRetentionHandlers BuildHandler(
        string? hardDeleteFlag = "true",
        string? retentionDays = null,
        Mock<IPasswordHasher>? hasher = null)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Features:HardDeleteEnabled"] = hardDeleteFlag,
                ["Library:RetentionDays"] = retentionDays,
            })
            .Build();
        // Default: the FakeHasher over the seeded "hashed_admin_pass" row — the
        // loose Moq default would reject every password and short-circuit tests.
        var effectiveHasher = (IPasswordHasher)(hasher?.Object ?? new FakeHasher());
        return new LibraryRetentionHandlers(
            _db,
            new UnitOfWork(_db),
            _storage.Object,
            effectiveHasher,
            configuration,
            _audit,
            NullLogger<LibraryRetentionHandlers>.Instance);
    }

    private async Task<LibraryFile> SeedFileAsync(string fileKey, ContentStatus status = ContentStatus.Published)
    {
        var subject = _db.Subjects.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = LibraryFileType.Pdf,
            Title = "ملف اختبار دورة الحياة",
            FileUrl = fileKey,
            FileSize = 2048,
            FileFormat = "application/pdf",
            Status = status,
            VirusScanStatus = VirusScanStatus.Clean
        };
        _db.LibraryFiles.Add(file);
        await _db.SaveChangesAsync();
        return file;
    }

    private static void AgeTombstone(LibraryFile file, int days)
    {
        // DeletedAt/QuarantinedAt are the retention-window anchors; DeletedAt has a
        // public setter, QuarantinedAt is set through the entity method.
        typeof(LibraryFile).GetProperty(nameof(LibraryFile.QuarantinedAt))
            ?.SetValue(file, DateTime.UtcNow.AddDays(-days));
        file.DeletedAt = DateTime.UtcNow.AddDays(-days);
    }

    // ===== Quarantine =====

    [Fact]
    public async Task Quarantine_RequiresReason()
    {
        var file = await SeedFileAsync("library/q1/one");
        var handler = BuildHandler();

        var act = () => handler.Handle(new QuarantineLibraryFileCommand(file.Id, _superAdminId, "   "), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.Message.Contains("سبب العزل"));
        _db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id).RetentionState.Should().BeNull(
            "a reason-less quarantine must change nothing");
    }

    [Fact]
    public async Task Quarantine_HidesFromStudents_RecordsActorTimeReason_NeverTouchesStorage()
    {
        const string fileKey = "library/q2/two";
        var file = await SeedFileAsync(fileKey);
        var handler = BuildHandler();
        var actor = _superAdminId;

        var result = await handler.Handle(new QuarantineLibraryFileCommand(file.Id, actor, "شبهة برمز خبيث"), CancellationToken.None);

        var stored = _db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id);
        stored.RetentionState.Should().Be(LibraryRetentionState.Quarantined);
        stored.Status.Should().Be(ContentStatus.Archived, "quarantined files are hidden from students");
        stored.QuarantinedAt.Should().NotBeNull();
        stored.QuarantinedBy.Should().Be(actor);
        stored.QuarantineReason.Should().Be("شبهة برمز خبيث");
        stored.DeletedAt.Should().BeNull("quarantine is NOT a tombstone");
        result.RetentionState.Should().Be("Quarantined");
        result.QuarantineReason.Should().Be("شبهة برمز خبيث");
        _audit.Events.Should().Contain(e => e.Contains("action=library_file_quarantine") && e.StartsWith("Warning:"),
            "the quarantine transition is security-audited");
        // Strict storage mock without any setup: any storage call fails the test.
    }

    [Fact]
    public async Task Quarantine_TombstonedRow_IsRefused()
    {
        var file = await SeedFileAsync("library/q3/three");
        file.Tombstone(_superAdminId);
        await _db.SaveChangesAsync();
        var handler = BuildHandler();

        var act = () => handler.Handle(new QuarantineLibraryFileCommand(file.Id, _superAdminId, "سبب"), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>();
    }

    // ===== Restore =====

    [Fact]
    public async Task Restore_FromQuarantine_ReturnsDraft_AndClearsQuarantineFields()
    {
        var file = await SeedFileAsync("library/r1/one");
        file.Quarantine(_superAdminId, "سبب مؤقت");
        await _db.SaveChangesAsync();
        var handler = BuildHandler();

        await handler.Handle(new RestoreLibraryFileCommand(file.Id, _superAdminId), CancellationToken.None);

        var stored = _db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id);
        stored.RetentionState.Should().BeNull("restore returns the row to Active");
        stored.Status.Should().Be(ContentStatus.Draft, "restore gates republish deliberately");
        stored.QuarantineReason.Should().BeNull();
        stored.QuarantinedAt.Should().BeNull();
        stored.QuarantinedBy.Should().BeNull();
        _audit.Events.Should().Contain(e => e.Contains("action=library_file_restore") && e.StartsWith("Info:"));
    }

    [Fact]
    public async Task Restore_FromTombstone_ClearsTombstone_ReturnsDraft()
    {
        var file = await SeedFileAsync("library/r2/two");
        file.Tombstone(_superAdminId);
        await _db.SaveChangesAsync();
        var handler = BuildHandler();

        await handler.Handle(new RestoreLibraryFileCommand(file.Id, _superAdminId), CancellationToken.None);

        var stored = _db.LibraryFiles.AsNoTracking().Single(f => f.Id == file.Id);
        stored.DeletedAt.Should().BeNull("the tombstone is cleared");
        stored.DeletedBy.Should().BeNull();
        stored.RetentionState.Should().BeNull();
        stored.Status.Should().Be(ContentStatus.Draft);
    }

    [Fact]
    public async Task Restore_ActiveRow_ThrowsNothingToRestore()
    {
        var file = await SeedFileAsync("library/r3/three");
        var handler = BuildHandler();

        var act = () => handler.Handle(new RestoreLibraryFileCommand(file.Id, _superAdminId), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.Message.Contains("لا يوجد ما يُستعاد"));
    }

    // ===== Purge (final deletion) — refusal paths =====

    [Fact]
    public async Task Purge_FlagOff_IsRefusedFailClosed_NothingRuns()
    {
        var file = await SeedFileAsync("library/p1/one");
        file.Tombstone(_superAdminId);
        AgeTombstone(file, 60);
        await _db.SaveChangesAsync();
        var hasher = new Mock<IPasswordHasher>(MockBehavior.Strict); // must NEVER be reached
        var handler = BuildHandler("false", hasher: hasher);

        var act = () => handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, AdminPassword), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.ErrorCode == "HARD_DELETE_DISABLED");
        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeTrue("the row survives");
        _audit.Events.Should().Contain(e => e.Contains("action=library_file_purge; phase=rejected; reason=HARD_DELETE_DISABLED"));
    }

    [Fact]
    public async Task Purge_NonSuperAdmin_IsRefused()
    {
        var editorRole = AdminRole.Create("editor", "محرر", "نطاق محدود", false);
        _db.AdminRoles.Add(editorRole);
        var editor = Admin.Create("editor@cms.example.com", "hashed_editor_pass", "Editor", editorRole.Id);
        _db.Admins.Add(editor);
        await _db.SaveChangesAsync();
        var file = await SeedFileAsync("library/p2/two");
        file.Tombstone(_superAdminId);
        AgeTombstone(file, 60);
        await _db.SaveChangesAsync();
        var handler = BuildHandler();

        var act = () => handler.Handle(new PurgeLibraryFileCommand(file.Id, editor.Id, "editor_pass"), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.ErrorCode == "FORBIDDEN_NOT_SUPER_ADMIN");
        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeTrue();
    }

    [Fact]
    public async Task Purge_WrongPassword_IsRefused()
    {
        var file = await SeedFileAsync("library/p3/three");
        file.Tombstone(_superAdminId);
        AgeTombstone(file, 60);
        await _db.SaveChangesAsync();
        var handler = BuildHandler();

        var act = () => handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, "wrong_password"), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.ErrorCode == "INVALID_CURRENT_PASSWORD");
        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeTrue();
    }

    [Fact]
    public async Task Purge_ActiveRow_IsRefused_NotAShortcutAroundRetention()
    {
        var file = await SeedFileAsync("library/p4/four");
        var handler = BuildHandler();

        var act = () => handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, AdminPassword), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.ErrorCode == "PURGE_REQUIRES_RETENTION_STATE");
        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeTrue();
    }

    [Fact]
    public async Task Purge_InsideRetentionWindow_IsRefused()
    {
        var file = await SeedFileAsync("library/p5/five");
        file.Tombstone(_superAdminId);
        AgeTombstone(file, 10); // default window is 30 days
        await _db.SaveChangesAsync();
        var handler = BuildHandler();

        var act = () => handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, AdminPassword), CancellationToken.None);

        await act.Should().ThrowAsync<DomainException>()
            .Where(ex => ex.ErrorCode == "LIBRARY_RETENTION_ACTIVE");
        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeTrue();
    }

    // ===== Purge — success paths =====

    [Fact]
    public async Task Purge_AfterRetentionWindow_DeletesObjectsFirst_RowSecond_ReferencesCleared()
    {
        const string fileKey = "library/p6/six";
        var file = await SeedFileAsync(fileKey);
        file.Tombstone(_superAdminId);
        AgeTombstone(file, 45);
        await _db.SaveChangesAsync();

        var student = _db.Students.First();
        _db.Favorites.Add(new Favorite { StudentId = student.Id, LibraryFileId = file.Id });
        _db.LibraryViews.Add(new LibraryView { StudentId = student.Id, FileId = file.Id, DurationSeconds = 30 });
        _db.MediaBookmarks.Add(new MediaBookmark
        {
            StudentId = student.Id, AssetType = MediaAssetType.LibraryFile, AssetId = file.Id,
            StartSeconds = 0, EndSeconds = 10, Label = "علامة"
        });
        _db.PlaybackProgress.Add(new PlaybackProgress
        {
            StudentId = student.Id, AssetType = MediaAssetType.LibraryFile, AssetId = file.Id,
            LastPositionSeconds = 42
        });
        await _db.SaveChangesAsync();

        _storage.Setup(service => service.DeletePrefixAsync("library/p6", It.IsAny<CancellationToken>()))
            .ReturnsAsync(3);
        var handler = BuildHandler();

        var result = await handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, AdminPassword), CancellationToken.None);

        result.FileId.Should().Be(file.Id);
        result.FileKey.Should().Be(fileKey);
        result.Deleted.Should().Contain(step => step.Label == "library_file" && step.Rows == 1);
        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeFalse("the row is gone");
        _db.LibraryViews.AsNoTracking().Any(v => v.FileId == file.Id).Should().BeFalse();
        _db.MediaBookmarks.AsNoTracking().Any(b => b.AssetId == file.Id).Should().BeFalse();
        _db.PlaybackProgress.AsNoTracking().Any(p => p.AssetId == file.Id).Should().BeFalse();
        _db.Favorites.AsNoTracking()
            .Any(f => f.LibraryFileId == file.Id).Should().BeFalse(
                "favorites for the purged file are removed — the ternary CHECK constraint forbids dangling zero-target rows");
        _db.Favorites.AsNoTracking().Count(f => f.StudentId == student.Id).Should().Be(0,
            "the test seeded exactly one favorite and it pointed only at the purged file");
        _storage.Verify(service => service.DeletePrefixAsync("library/p6", It.IsAny<CancellationToken>()), Times.Once,
            "folder-keyed uploads are purged with one prefix delete covering original + siblings + HLS tree");
        _audit.Events.Should().Contain(e => e.Contains("action=library_file_purge; phase=intent"))
            .And.Contain(e => e.Contains("action=library_file_purge; phase=executed") && e.Contains("objects=3"));
    }

    [Fact]
    public async Task Purge_QuarantinedRow_IsEligibleAfterTheWindow()
    {
        var file = await SeedFileAsync("library/p7/seven");
        file.Quarantine(_superAdminId, "شبهة تحقق");
        AgeTombstone(file, 40); // ages QuarantinedAt through the anchor setter
        await _db.SaveChangesAsync();
        _storage.Setup(service => service.DeletePrefixAsync("library/p7", It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        var handler = BuildHandler();

        var result = await handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, AdminPassword), CancellationToken.None);

        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeFalse();
        result.Deleted.Should().NotBeNull();
    }

    [Fact]
    public async Task Purge_ProviderFailure_RetainsRow_RetryCompletes()
    {
        var file = await SeedFileAsync("library/p8/eight");
        file.Tombstone(_superAdminId);
        AgeTombstone(file, 60);
        await _db.SaveChangesAsync();
        _storage.SetupSequence(service => service.DeletePrefixAsync("library/p8", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("B2 endpoint unreachable"))
            .ReturnsAsync(2); // the retry sees the already-deleted prefix as empty success
        var handler = BuildHandler();

        var first = () => handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, AdminPassword), CancellationToken.None);
        await first.Should().ThrowAsync<IOException>();
        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeTrue(
            "a provider failure mid-flight leaves the tombstone intact — nothing was deleted from the database");

        var second = await handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, AdminPassword), CancellationToken.None);
        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeFalse(
            "the retry completes (S3 delete semantics are idempotent)");
        second.Deleted.Should().Contain(step => step.Label == "library_file");
    }

    [Fact]
    public async Task Purge_RetentionDaysZero_RemovesTheMinimumAgeGate_Deliberately()
    {
        var file = await SeedFileAsync("library/p9/nine");
        file.Tombstone(_superAdminId); // fresh tombstone — seconds old
        await _db.SaveChangesAsync();
        _storage.Setup(service => service.DeletePrefixAsync("library/p9", It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
        var handler = BuildHandler(retentionDays: "0");

        await handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, AdminPassword), CancellationToken.None);

        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeFalse(
            "an explicit Library:RetentionDays=0 is an owner configuration choice, not an accident");
    }

    [Fact]
    public async Task Purge_LegacyNonFolderKey_FallsBackToExplicitKeyDeletes()
    {
        const string legacyKey = "legacy-library-file.pdf";
        var file = await SeedFileAsync(legacyKey);
        file.Tombstone(_superAdminId);
        AgeTombstone(file, 60);
        await _db.SaveChangesAsync();
        _storage.Setup(service => service.DeleteAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _storage.Setup(service => service.DeletePrefixAsync(legacyKey, It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        var handler = BuildHandler();

        var result = await handler.Handle(new PurgeLibraryFileCommand(file.Id, _superAdminId, AdminPassword), CancellationToken.None);

        _db.LibraryFiles.AsNoTracking().Any(f => f.Id == file.Id).Should().BeFalse();
        _storage.Verify(service => service.DeleteAsync(legacyKey, It.IsAny<CancellationToken>()), Times.Once);
        foreach (var suffix in new[] { "-fixed", "-sanitized", "-ready" })
            _storage.Verify(service => service.DeleteAsync($"{legacyKey}{suffix}", It.IsAny<CancellationToken>()), Times.Once,
                "pipeline sibling keys are purged alongside the base key");
    }

    // ===== Soft delete now stamps the row (DeletedBy) =====

    [Fact]
    public async Task SoftDelete_StampedRowCarriesActorAndRetentionPendingState()
    {
        var file = await SeedFileAsync("library/s1/one");
        var actor = Guid.NewGuid();
        file.Tombstone(actor);

        file.DeletedAt.Should().NotBeNull();
        file.DeletedBy.Should().Be(actor, "PR-5: the row — not just the audit event — carries the deleting actor");
        file.RetentionState.Should().Be(LibraryRetentionState.RetentionPending);
        file.Status.Should().Be(ContentStatus.Deleted);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }
}
