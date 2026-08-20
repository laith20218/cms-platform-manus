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
    public DbSet<ExamSession> ExamSessions => Set<ExamSession>();
    public DbSet<AttemptLog> AttemptLogs => Set<AttemptLog>();
    public DbSet<ErrorReport> ErrorReports => Set<ErrorReport>();

    // Library
    public DbSet<LibraryFile> LibraryFiles => Set<LibraryFile>();
    public DbSet<LibraryView> LibraryViews => Set<LibraryView>();

    // Users
    public DbSet<Student> Students => Set<Student>();
    public DbSet<Admin> Admins => Set<Admin>();
    public DbSet<AdminRole> AdminRoles => Set<AdminRole>();
    public DbSet<AdminPermission> AdminPermissions => Set<AdminPermission>();
    public DbSet<DeviceBinding> DeviceBindings => Set<DeviceBinding>();
    public DbSet<Favorite> Favorites => Set<Favorite>();

    // Subscriptions and entitlement grants
    public DbSet<CodeBatch> CodeBatches => Set<CodeBatch>();
    public DbSet<SubscriptionCode> SubscriptionCodes => Set<SubscriptionCode>();
    public DbSet<StudentSubscription> StudentSubscriptions => Set<StudentSubscription>();

    // Security sessions and installations
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<UserInstallation> UserInstallations => Set<UserInstallation>();

    // Notifications and security audit
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationDelivery> NotificationDeliveries => Set<NotificationDelivery>();
    public DbSet<SecurityLog> SecurityLogs => Set<SecurityLog>();
    public DbSet<OfflinePackageRecord> OfflinePackageRecords => Set<OfflinePackageRecord>();
    public DbSet<OfflineKeyReleaseLog> OfflineKeyReleaseLogs => Set<OfflineKeyReleaseLog>();

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
            entity.HasIndex(x => x.SubscriptionCodeId).IsUnique();
            entity.HasIndex(x => new { x.StudentId, x.Status, x.ExpiresAt });
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
