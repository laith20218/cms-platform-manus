using System.Net;
using CMS.Domain.Common;
using CMS.Domain.Enums;

namespace CMS.Domain.Entities;

/// <summary>
/// A single answer submitted by a student, either from a direct question flow or an exam session.
/// </summary>
public class AttemptLog : BaseEntity
{
    public Guid StudentId { get; set; }
    public Guid QuestionId { get; set; }
    public Guid? ExamSessionId { get; set; }
    public Guid? ExamSessionQuestionId { get; set; }
    public string? SelectedAnswer { get; set; }
    public bool IsCorrect { get; set; }
    public bool IsFirstAttempt { get; set; }
    public int AttemptNumber { get; set; }
    public int? DurationSeconds { get; set; }
    public bool IsOffline { get; set; }
    public DateTime AnsweredAt { get; set; } = DateTime.UtcNow;
    public DateTime? SyncedAt { get; set; }

    public Student Student { get; set; } = null!;
    public Question Question { get; set; } = null!;
    public ExamSession? ExamSession { get; set; }
    public ExamSessionQuestion? ExamSessionQuestion { get; set; }
}

/// <summary>
/// A student's in-progress or completed attempt for an exam.
/// </summary>
public class ExamSession : BaseEntity
{
    public Guid StudentId { get; set; }
    public Guid ExamId { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public DateTime? TimedOutAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public DateTime? AnalyticsRecordedAt { get; set; }
    public int? DurationSeconds { get; set; }
    public int DurationMinutesSnapshot { get; set; }
    public decimal PassingScoreSnapshot { get; set; }
    public bool ShowResultsImmediatelySnapshot { get; set; }
    public bool AllowReviewSnapshot { get; set; }
    public bool ShowCorrectAnswersSnapshot { get; set; }
    public bool ShowExplanationsSnapshot { get; set; }
    public int CurrentQuestionOrder { get; set; }
    public string? StartIdempotencyKey { get; set; }
    public int TotalQuestions { get; set; }
    public int AnsweredQuestions { get; set; }
    public int CorrectAnswers { get; set; }
    public double? Score { get; set; }
    public bool? Passed { get; set; }
    public ExamSessionStatus Status { get; set; } = ExamSessionStatus.InProgress;
    public bool IsFirstAttempt { get; set; }

    public Student Student { get; set; } = null!;
    public Exam Exam { get; set; } = null!;
    public ICollection<ExamSessionQuestion> SessionQuestions { get; set; } = new List<ExamSessionQuestion>();
    public ICollection<AttemptLog> AttemptLogs { get; set; } = new List<AttemptLog>();
}

/// <summary>
/// Metadata and security state for a library asset stored outside the application database.
/// </summary>
public class LibraryFile : AuditableEntity
{
    public Guid SubjectId { get; set; }
    public Guid? LectureId { get; set; }
    public LibraryFileType Type { get; set; }
    /// <summary>Institutional content category (منهاج/محاضرة/تلخيص/أفكار ذهبية). NULL on legacy rows.</summary>
    public LibraryFileCategory? Category { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string FileUrl { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string? FileFormat { get; set; }
    public int? DurationSeconds { get; set; }
    public int? PagesCount { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? YoutubeVideoId { get; set; }
    public List<string> Tags { get; set; } = new();
    public int ViewsCount { get; set; }
    public int FavoritesCount { get; set; }
    public ContentStatus Status { get; set; } = ContentStatus.Draft;
    public VirusScanStatus VirusScanStatus { get; set; } = VirusScanStatus.Pending;

    // ===== Push 10.3 — rich media metadata + transcoding lifecycle =====
    // Title and Description already exist on the entity; the new metadata surface is
    // Difficulty, plus the HLS pipeline columns (FileUrl remains the source-object key).

    /// <summary>Learning difficulty for catalog filtering. Defaults to Easy; shared with the
    /// question domain's scale (Easy=0, Medium=1, Hard=2).</summary>
    public Difficulty Difficulty { get; set; } = Difficulty.Easy;

    /// <summary>FFmpeg pipeline state. NULL for non-video files / legacy rows.</summary>
    public ProcessingStatus? ProcessingStatus { get; set; }

    /// <summary>Object-storage key of the generated HLS master playlist
    /// ({FileUrl}/hls/master.m3u8). NULL until the pipeline reaches Ready — playback
    /// keeps using FileUrl until a later push switches the player to HLS.</summary>
    public string? HlsKey { get; set; }

    public Subject Subject { get; set; } = null!;
    public Lecture? Lecture { get; set; }
    public ICollection<LibraryView> Views { get; set; } = new List<LibraryView>();
    public ICollection<Favorite> Favorites { get; set; } = new List<Favorite>();
}

/// <summary>
/// A student's progress record for a library asset.
/// </summary>
public class LibraryView : BaseEntity
{
    public Guid StudentId { get; set; }
    public Guid FileId { get; set; }
    public int? DurationSeconds { get; set; }
    public int? PagesViewed { get; set; }
    public decimal? CompletionPercentage { get; set; }
    public DateTime ViewedAt { get; set; } = DateTime.UtcNow;

    public Student Student { get; set; } = null!;
    public LibraryFile File { get; set; } = null!;
}

/// <summary>
/// An explicit acknowledgement by a student that a lecture has been completed.
/// One durable record exists for each student and lecture pair.
/// </summary>
public class LectureCompletion : BaseEntity
{
    public Guid StudentId { get; set; }
    public Guid LectureId { get; set; }
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;

    public Student Student { get; set; } = null!;
    public Lecture Lecture { get; set; } = null!;
}

/// <summary>
/// A device trusted for a student account. A single active binding enforces the device-control policy.
/// </summary>
public class DeviceBinding : BaseEntity
{
    public Guid StudentId { get; set; }
    public string DeviceFingerprint { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
    public string? DeviceType { get; set; }
    public string? Os { get; set; }
    public string? Browser { get; set; }
    /// <summary>Base64-encoded SubjectPublicKeyInfo for the Android Keystore key bound to this installation. Never stores private key material.</summary>
    public string? OfflinePackagePublicKeySpki { get; set; }
    public string? UserAgent { get; set; }
    public IPAddress? IpAddress { get; set; }
    public bool IsActive { get; set; }
    public DateTime BoundAt { get; set; } = DateTime.UtcNow;
    public DateTime LastUsed { get; set; } = DateTime.UtcNow;

    public Student Student { get; set; } = null!;
}

/// <summary>
/// A student bookmark for a question or library asset. At least one target identifier is required by application logic.
/// </summary>
public class Favorite : BaseEntity
{
    public Guid StudentId { get; set; }
    public Guid? QuestionId { get; set; }
    public Guid? LibraryFileId { get; set; }

    public Student Student { get; set; } = null!;
    public Question? Question { get; set; }
    public LibraryFile? LibraryFile { get; set; }
}

/// <summary>
/// A student-reported issue against a question.
/// </summary>
public class ErrorReport : BaseEntity
{
    public Guid StudentId { get; set; }
    public Guid QuestionId { get; set; }
    public ErrorReportReason ReasonType { get; set; }
    public string? Description { get; set; }
    public string? ScreenshotUrl { get; set; }
    public ErrorReportStatus Status { get; set; } = ErrorReportStatus.Pending;
    public Guid? AssignedTo { get; set; }      // P1-09: admin assigned to review
    public Guid? ReviewedBy { get; set; }       // P1-09: admin who started review
    public DateTime? ReviewedAt { get; set; }    // P1-09: when review started
    public Guid? ResolvedBy { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? ResolutionNotes { get; set; }

    public Student Student { get; set; } = null!;
    public Question Question { get; set; } = null!;
    public Admin? Resolver { get; set; }
    public Admin? Assignee { get; set; }
    public Admin? Reviewer { get; set; }
}

/// <summary>
/// A notification created by an administrator for an eligible target audience.
/// </summary>
public class Notification : BaseEntity
{
    public NotificationType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string? Icon { get; set; }
    public string? ActionUrl { get; set; }
    public string? ActionLabel { get; set; }
    public TargetType TargetType { get; set; }
    public Guid? TargetId { get; set; }
    public DateTime? ScheduledAt { get; set; }
    public DateTime? SentAt { get; set; }
    public DateTime? ExpiresAt { get; set; }  // P1-10: optional expiry
    public string Status { get; set; } = "draft";
    public Guid SentBy { get; set; }

    public Admin Sender { get; set; } = null!;
    public ICollection<NotificationDelivery> Deliveries { get; set; } = new List<NotificationDelivery>();
}

/// <summary>
/// Delivery status for a notification sent to a particular student.
/// </summary>
public class NotificationDelivery : BaseEntity
{
    public Guid NotificationId { get; set; }
    public Guid StudentId { get; set; }
    public NotificationChannel Channel { get; set; }
    public DeliveryStatus Status { get; set; } = DeliveryStatus.Pending;
    public DateTime? SentAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
    public DateTime? ReadAt { get; set; }
    public DateTime? ClickedAt { get; set; }
    public string? FailureReason { get; set; }

    public Notification Notification { get; set; } = null!;
    public Student Student { get; set; } = null!;
}

/// <summary>
/// An auditable security event associated with a student and/or administrator.
/// </summary>
public class SecurityLog : BaseEntity
{
    public Guid? StudentId { get; set; }
    public Guid? AdminId { get; set; }
    public SecurityEventType EventType { get; set; }
    public SecuritySeverity Severity { get; set; }
    public string Description { get; set; } = string.Empty;
    public IPAddress? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public string? DeviceFingerprint { get; set; }
    public string CorrelationId { get; set; } = string.Empty;

    public Student? Student { get; set; }
    public Admin? Admin { get; set; }
}

/// <summary>Durable ownership and lifecycle record for an encrypted offline package.</summary>
public class OfflinePackageRecord : BaseEntity
{
    public OfflinePackageRecord() { }
    public OfflinePackageRecord(Guid packageId) => Id = packageId;

    public Guid StudentId { get; set; }
    public string InstallationId { get; set; } = string.Empty;
    public int ContentVersion { get; set; }
    public string IdempotencyHash { get; set; } = string.Empty;
    public string ManifestJson { get; set; } = string.Empty;
    public string CiphertextBase64Url { get; set; } = string.Empty;
    public string TagBase64Url { get; set; } = string.Empty;
    public string WrappedKeyBase64Url { get; set; } = string.Empty;
    public string KeyReleaseToken { get; set; } = string.Empty;
    public DateTime IssuedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string Status { get; set; } = "active";

    public Student Student { get; set; } = null!;
}

/// <summary>Durable audit record for offline package issuance, key release and revocation.</summary>
public class OfflineKeyReleaseLog : BaseEntity
{
    public Guid PackageId { get; set; }
    public Guid StudentId { get; set; }
    public string InstallationId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public bool Succeeded { get; set; }
    public string? Reason { get; set; }
    public DateTime OccurredAt { get; set; } = DateTime.UtcNow;

    public Student Student { get; set; } = null!;
    public OfflinePackageRecord Package { get; set; } = null!;
}
