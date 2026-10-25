using Microsoft.EntityFrameworkCore;
using CMS.Application.Interfaces;
using CMS.Domain.Common;
using CMS.Domain.Entities;

namespace CMS.Infrastructure.Persistence;

/// <summary>
/// Main database context for CMS.
/// Uses EF Core 9 + PostgreSQL 16.
/// Applies snake_case naming convention automatically.
/// </summary>
public class ApplicationDbContext : DbContext, IApplicationDbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

    // Academic
    public DbSet<University> Universities => Set<University>();
    public DbSet<College> Colleges => Set<College>();
    public DbSet<AcademicYear> AcademicYears => Set<AcademicYear>();
    public DbSet<Semester> Semesters => Set<Semester>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Lecture> Lectures => Set<Lecture>();

    // Questions
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<QuestionOption> QuestionOptions => Set<QuestionOption>();
    public DbSet<QuestionImage> QuestionImages => Set<QuestionImage>();
    public DbSet<Exam> Exams => Set<Exam>();
    public DbSet<ExamQuestion> ExamQuestions => Set<ExamQuestion>();
    public DbSet<ExamSession> ExamSessions => Set<ExamSession>();
    public DbSet<ExamSessionQuestion> ExamSessionQuestions => Set<ExamSessionQuestion>();
    public DbSet<AttemptLog> AttemptLogs => Set<AttemptLog>();
    public DbSet<ErrorReport> ErrorReports => Set<ErrorReport>();

    // Library
    public DbSet<LibraryFile> LibraryFiles => Set<LibraryFile>();
    public DbSet<LibraryView> LibraryViews => Set<LibraryView>();
    public DbSet<LectureCompletion> LectureCompletions => Set<LectureCompletion>();

    // Push 4 / Track 4: courses and episodes
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<CourseEpisode> CourseEpisodes => Set<CourseEpisode>();

    // Users
    public DbSet<Student> Students => Set<Student>();
    public DbSet<Admin> Admins => Set<Admin>();
    public DbSet<AdminRole> AdminRoles => Set<AdminRole>();
    public DbSet<AdminPermission> AdminPermissions => Set<AdminPermission>();
    public DbSet<DeviceBinding> DeviceBindings => Set<DeviceBinding>();
    public DbSet<Favorite> Favorites => Set<Favorite>();

    // Push 10.0: media bookmarks + playback progress
    public DbSet<MediaBookmark> MediaBookmarks => Set<MediaBookmark>();
    public DbSet<PlaybackProgress> PlaybackProgress => Set<PlaybackProgress>();

    // Subscriptions and entitlement grants
    public DbSet<CodeBatch> CodeBatches => Set<CodeBatch>();
    public DbSet<SubscriptionCode> SubscriptionCodes => Set<SubscriptionCode>();
    public DbSet<StudentSubscription> StudentSubscriptions => Set<StudentSubscription>();

    // Security sessions and installations
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<UserInstallation> UserInstallations => Set<UserInstallation>();

    // Push 2 / Track 2: admin activity monitor
    public DbSet<AdminActivityLog> AdminActivityLogs => Set<AdminActivityLog>();

    // Notifications and security audit
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationDelivery> NotificationDeliveries => Set<NotificationDelivery>();
    public DbSet<SecurityLog> SecurityLogs => Set<SecurityLog>();
    public DbSet<OfflinePackageRecord> OfflinePackageRecords => Set<OfflinePackageRecord>();
    public DbSet<OfflineKeyReleaseLog> OfflineKeyReleaseLogs => Set<OfflineKeyReleaseLog>();

    // System configuration
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Apply all IEntityTypeConfiguration from this assembly
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);

        // Security and entitlement lookup constraints.
        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.HasIndex(x => x.RefreshTokenHash).IsUnique();
            entity.HasIndex(x => new { x.FamilyId, x.Status });
            entity.HasIndex(x => new { x.UserId, x.InstallationId, x.Status });
            entity.Property(x => x.DeviceDetails).HasColumnType("jsonb");
            // Push 2 / Track 2: partial index serving the idle-session sweeper.
            entity.HasIndex(x => new { x.Status, x.LastActivityAt })
                .HasDatabaseName("ix_user_sessions_sweeper")
                .HasFilter("closed_at IS NULL AND status = 1");
        });
        modelBuilder.Entity<UserInstallation>(entity =>
        {
            entity.HasIndex(x => new { x.UserId, x.InstallationId }).IsUnique();
        });
        modelBuilder.Entity<SubscriptionCode>(entity =>
        {
            entity.HasIndex(x => x.Code).IsUnique();
            entity.HasIndex(x => x.BatchId);
            entity.HasIndex(x => new { x.Status, x.ScopeSubjectId });
        });
        modelBuilder.Entity<StudentSubscription>(entity =>
        {
            entity.HasIndex(x => new { x.StudentId, x.SubscriptionCodeId }).IsUnique();
            entity.HasIndex(x => new { x.StudentId, x.Status, x.ExpiresAt });
        });
        modelBuilder.Entity<LectureCompletion>(entity =>
        {
            entity.HasIndex(x => new { x.StudentId, x.LectureId }).IsUnique();
            entity.HasIndex(x => new { x.StudentId, x.CompletedAt });
        });
        modelBuilder.Entity<SecurityLog>(entity =>
        {
            entity.HasIndex(x => new { x.CorrelationId, x.CreatedAt });
            entity.HasIndex(x => x.CreatedAt);
        });
        modelBuilder.Entity<OfflinePackageRecord>(entity =>
        {
            entity.HasIndex(x => new { x.StudentId, x.IdempotencyHash }).IsUnique();
            entity.HasIndex(x => new { x.StudentId, x.InstallationId, x.Status });
            entity.HasIndex(x => x.ExpiresAt);
            entity.Property(x => x.ManifestJson).HasColumnType("jsonb");
        });
        modelBuilder.Entity<OfflineKeyReleaseLog>(entity =>
        {
            entity.HasIndex(x => new { x.PackageId, x.OccurredAt });
            entity.HasIndex(x => new { x.StudentId, x.InstallationId, x.Action });
            entity.HasOne(x => x.Package).WithMany().HasForeignKey(x => x.PackageId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<AdminActivityLog>(entity =>
        {
            // Push 2 / Track 2: activity-monitor lookup indices. The composite is DESC on
            // created_at because the monitor renders newest actions first.
            entity.HasIndex(x => new { x.AdminId, x.CreatedAt })
                .HasDatabaseName("ix_admin_activity_logs_admin_created")
                .IsDescending(false, true);
            entity.HasIndex(x => x.ActionType)
                .HasDatabaseName("ix_admin_activity_logs_action_type");
            entity.HasIndex(x => x.SessionId);
            entity.Property(x => x.Metadata).HasColumnType("jsonb");
            entity.Property(x => x.ResourceId).HasMaxLength(100);
            entity.HasOne(x => x.Admin).WithMany().HasForeignKey(x => x.AdminId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<AdminRole>(entity =>
        {
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            // Push 3 / Track 3: UI permission keys (view:/tab:/btn:) as a JSON array.
            // NULL = unconfigured = full access (zero behavior change for existing roles).
            // A GIN index may be added later if cross-role key queries are ever needed —
            // deliberately NOT added now (Q1 decision: column approach, no index yet).
            entity.Property(x => x.UiPermissions).HasColumnType("jsonb");
        });
        // P1-10: Map Notification.Sender navigation to SentBy FK (not auto-generated sender_id)
        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasOne(n => n.Sender).WithMany().HasForeignKey(n => n.SentBy).OnDelete(DeleteBehavior.Restrict);
        });
        // P1-09: ErrorReport navigation relationships for moderation
        modelBuilder.Entity<ErrorReport>(entity =>
        {
            entity.HasOne(x => x.Assignee).WithMany().HasForeignKey(x => x.AssignedTo).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.Reviewer).WithMany().HasForeignKey(x => x.ReviewedBy).OnDelete(DeleteBehavior.SetNull);
        });
        modelBuilder.Entity<SystemSetting>(entity =>
        {
            entity.HasIndex(x => x.Key).IsUnique();
            entity.HasIndex(x => x.Category);
            entity.Property(x => x.Key).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Value).HasMaxLength(2000).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(500);
            entity.Property(x => x.Category).HasMaxLength(50);
            entity.HasOne(x => x.UpdatedByAdmin).WithMany().HasForeignKey(x => x.UpdatedBy).OnDelete(DeleteBehavior.SetNull);
        });
        modelBuilder.Entity<ExamQuestion>(entity =>
        {
            entity.HasIndex(x => new { x.ExamId, x.QuestionId }).IsUnique();
            entity.HasIndex(x => new { x.ExamId, x.SortOrder }).IsUnique();
            entity.HasOne(x => x.Exam).WithMany(x => x.ExamQuestions).HasForeignKey(x => x.ExamId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Question).WithMany(x => x.ExamQuestions).HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ExamSessionQuestion>(entity =>
        {
            entity.HasIndex(x => new { x.ExamSessionId, x.SortOrder }).IsUnique();
            entity.HasIndex(x => new { x.ExamSessionId, x.SourceQuestionId }).IsUnique().HasFilter("source_question_id IS NOT NULL");
            entity.HasOne(x => x.ExamSession).WithMany(x => x.SessionQuestions).HasForeignKey(x => x.ExamSessionId).OnDelete(DeleteBehavior.Cascade);
            entity.Property(x => x.OptionsJson).HasColumnType("jsonb");
            entity.Property(x => x.TagsJson).HasColumnType("jsonb");
            entity.Property(x => x.ImagesJson).HasColumnType("jsonb");
        });
        modelBuilder.Entity<ExamSession>(entity =>
        {
            entity.HasIndex(x => new { x.StudentId, x.ExamId }).IsUnique().HasFilter("status = 0");
            entity.HasIndex(x => new { x.ExamId, x.Status, x.CompletedAt });
            entity.HasIndex(x => x.ExpiresAt);
        });
        modelBuilder.Entity<AttemptLog>(entity =>
        {
            entity.HasIndex(x => new { x.ExamSessionId, x.QuestionId }).IsUnique().HasFilter("exam_session_id IS NOT NULL");
            entity.HasOne(x => x.ExamSessionQuestion).WithMany().HasForeignKey(x => x.ExamSessionQuestionId).OnDelete(DeleteBehavior.Restrict);
        });

        // Push 4 / Track 4: courses and episodes. Episodes cascade with their course;
        // courses are Restrict against subject hard-deletes (subjects are soft-deleted in
        // practice — a hard delete must never silently destroy course content).
        modelBuilder.Entity<Course>(entity =>
        {
            entity.HasIndex(x => x.SubjectId);
            entity.HasOne(x => x.Subject).WithMany(x => x.Courses).HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CourseEpisode>(entity =>
        {
            entity.HasIndex(x => x.CourseId);
            entity.HasIndex(x => new { x.CourseId, x.EpisodeNumber }).IsUnique();
            entity.HasOne(x => x.Course).WithMany(x => x.Episodes).HasForeignKey(x => x.CourseId).OnDelete(DeleteBehavior.Cascade);
        });

        // Push 10.0: media bookmarks + playback progress. The polymorphic AssetId has NO
        // database-level FK (library_files vs course_episodes is decided by asset_type and
        // validated in the application layer); StudentId cascades so a deleted student's
        // rows disappear with them.
        modelBuilder.Entity<MediaBookmark>(entity =>
        {
            entity.HasIndex(x => new { x.StudentId, x.AssetType, x.AssetId, x.StartSeconds, x.EndSeconds }).IsUnique();
            entity.HasIndex(x => new { x.StudentId, x.CreatedAt });
            entity.Property(x => x.Label).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Note).HasMaxLength(500);
            entity.HasOne(x => x.Student).WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<PlaybackProgress>(entity =>
        {
            entity.HasIndex(x => new { x.StudentId, x.AssetType, x.AssetId }).IsUnique();
            entity.Property(x => x.CompletionPercent).HasPrecision(5, 2);
            entity.HasOne(x => x.Student).WithMany().HasForeignKey(x => x.StudentId).OnDelete(DeleteBehavior.Cascade);
        });

        // Push 10.3: rich media metadata + transcoding lifecycle. Title already existed on
        // both entities (no length ALTER — a live-data resize could fail the migration apply);
        // the caps below apply to NEW columns only. LibraryFile.Description predates 10.3 and
        // keeps its existing unbounded mapping for the same reason.
        modelBuilder.Entity<CourseEpisode>(entity =>
        {
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.HlsKey).HasMaxLength(600);
        });
        modelBuilder.Entity<LibraryFile>(entity =>
        {
            entity.Property(x => x.HlsKey).HasMaxLength(600);
        });

        // Auto snake_case naming
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            entity.SetTableName(ToSnakeCase(entity.GetTableName()));

            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
            }

            foreach (var key in entity.GetKeys())
            {
                key.SetName(ToSnakeCase(key.GetName()));
            }

            foreach (var index in entity.GetIndexes())
            {
                index.SetDatabaseName(ToSnakeCase(index.GetDatabaseName()));
            }

            foreach (var fk in entity.GetForeignKeys())
            {
                fk.SetConstraintName(ToSnakeCase(fk.GetConstraintName()));
            }
        }

        // Table-scoped constraints must be configured after the legacy naming loop above,
        // which otherwise replaces the table mapping and drops relational annotations.
        modelBuilder.Entity<CourseEpisode>(entity =>
        {
            entity.ToTable(table => table.HasCheckConstraint("ck_course_episodes_source",
                "(source_type = 1) OR (file_key IS NOT NULL)"));
        });
        modelBuilder.Entity<Favorite>(entity =>
        {
            entity.ToTable(table => table.HasCheckConstraint("ck_favorites_exactly_one_target",
                "(question_id IS NOT NULL AND library_file_id IS NULL) OR (question_id IS NULL AND library_file_id IS NOT NULL)"));
            entity.HasIndex(x => new { x.StudentId, x.QuestionId })
                .HasDatabaseName("ix_favorites_student_id_question_id")
                .IsUnique()
                .HasFilter("question_id IS NOT NULL");
            entity.HasIndex(x => new { x.StudentId, x.LibraryFileId })
                .HasDatabaseName("ix_favorites_student_id_library_file_id")
                .IsUnique()
                .HasFilter("library_file_id IS NOT NULL");
        });

        modelBuilder.Entity<MediaBookmark>(entity =>
        {
            entity.ToTable(table => table.HasCheckConstraint("ck_media_bookmarks_range",
                "(end_seconds > start_seconds AND start_seconds >= 0)"));
        });

        // Push 10.3: partial indexes for the admin pipeline views (pending/failed sweeps).
        // Filtered = NULL rows (non-video + legacy assets) stay out of the index entirely.
        modelBuilder.Entity<CourseEpisode>(entity =>
        {
            entity.HasIndex(x => x.ProcessingStatus)
                .HasDatabaseName("ix_course_episodes_processing_status")
                .HasFilter("processing_status IS NOT NULL");
        });
        modelBuilder.Entity<LibraryFile>(entity =>
        {
            entity.HasIndex(x => x.ProcessingStatus)
                .HasDatabaseName("ix_library_files_processing_status")
                .HasFilter("processing_status IS NOT NULL");
        });

        base.OnModelCreating(modelBuilder);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        // Auto-update UpdatedAt on modified entities
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Modified)
            {
                entry.Entity.GetType().GetProperty("UpdatedAt")?.SetValue(entry.Entity, DateTime.UtcNow);
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }

    private static string ToSnakeCase(string? name)
    {
        if (string.IsNullOrEmpty(name)) return name ?? string.Empty;
        return System.Text.RegularExpressions.Regex.Replace(name, "([a-z0-9])([A-Z])", "$1_$2").ToLowerInvariant();
    }
}
