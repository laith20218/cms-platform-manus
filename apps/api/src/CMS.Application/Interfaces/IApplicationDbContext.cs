using CMS.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CMS.Application.Interfaces;

/// <summary>
/// Persistence contract consumed by application handlers. The infrastructure DbContext implements this contract,
/// preserving dependency direction and enabling isolated handler tests.
/// </summary>
public interface IApplicationDbContext
{
    DbSet<University> Universities { get; }
    DbSet<College> Colleges { get; }
    DbSet<AcademicYear> AcademicYears { get; }
    DbSet<Semester> Semesters { get; }
    DbSet<Subject> Subjects { get; }
    DbSet<Lecture> Lectures { get; }

    DbSet<Question> Questions { get; }
    DbSet<QuestionOption> QuestionOptions { get; }
    DbSet<QuestionImage> QuestionImages { get; }
    DbSet<Exam> Exams { get; }
    DbSet<ExamSession> ExamSessions { get; }
    DbSet<AttemptLog> AttemptLogs { get; }
    DbSet<ErrorReport> ErrorReports { get; }

    DbSet<LibraryFile> LibraryFiles { get; }
    DbSet<LibraryView> LibraryViews { get; }
    DbSet<LectureCompletion> LectureCompletions { get; }

    DbSet<Student> Students { get; }
    DbSet<Admin> Admins { get; }
    DbSet<AdminRole> AdminRoles { get; }
    DbSet<AdminPermission> AdminPermissions { get; }
    DbSet<DeviceBinding> DeviceBindings { get; }
    DbSet<Favorite> Favorites { get; }

    DbSet<CodeBatch> CodeBatches { get; }
    DbSet<SubscriptionCode> SubscriptionCodes { get; }
    DbSet<StudentSubscription> StudentSubscriptions { get; }

    DbSet<UserSession> UserSessions { get; }
    DbSet<UserInstallation> UserInstallations { get; }

    DbSet<Notification> Notifications { get; }
    DbSet<NotificationDelivery> NotificationDeliveries { get; }
    DbSet<SecurityLog> SecurityLogs { get; }
    DbSet<OfflinePackageRecord> OfflinePackageRecords { get; }
    DbSet<OfflineKeyReleaseLog> OfflineKeyReleaseLogs { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
