namespace CMS.Domain.Enums;

/// <summary>
/// Question types supported by the system.
/// MCQ, true/false, multiple-select, and essay questions are active; additional types remain extensible.
/// </summary>
public enum QuestionType
{
    Mcq,
    TrueFalse,
    MultipleSelect,
    Ordering,
    Matching,
    Clinical,
    ImageBased,
    Interactive,
    Essay
}

/// <summary>
/// Question difficulty levels.
/// </summary>
public enum Difficulty
{
    Easy,
    Medium,
    Hard
}

/// <summary>
/// Content lifecycle status.
/// </summary>
public enum ContentStatus
{
    Draft,
    Review,
    Published,
    Archived,
    Deleted
}

/// <summary>
/// Exam types.
/// </summary>
public enum ExamType
{
    Final,
    Midterm,
    Quiz,
    Practice
}

/// <summary>
/// Student account status.
/// </summary>
public enum StudentStatus
{
    Active,
    Suspended,
    Banned
}

/// <summary>
/// Admin account status.
/// </summary>
public enum AdminStatus
{
    Active,
    Suspended,
    Disabled
}

/// <summary>
/// Subscription scope types.
/// </summary>
public enum SubscriptionScopeType
{
    Subject,
    Semester,
    Year,
    College,
    University
}

/// <summary>Exclusive content grant carried by a subscription code.</summary>
public enum SubscriptionContentScope
{
    QuestionsExams,
    LecturesText,
    VideoAudio,
    FullSubject,
    FullYear
}

/// <summary>
/// Subscription code status.
/// </summary>
public enum CodeStatus
{
    Active,
    Used,
    Expired,
    Cancelled
}

/// <summary>
/// Student subscription status.
/// </summary>
public enum SubscriptionStatus
{
    Active,
    Expired,
    Cancelled
}

/// <summary>
/// Exam session status.
/// </summary>
public enum ExamSessionStatus
{
    InProgress = 0,
    Completed = 1,
    Cancelled = 2,
    TimedOut = 3,

    // Legacy persisted values retained as aliases for migration compatibility.
    [Obsolete("Use Cancelled.")]
    Abandoned = Cancelled,
    [Obsolete("Use TimedOut.")]
    Expired = TimedOut
}

/// <summary>
/// Library file types.
/// </summary>
public enum LibraryFileType
{
    Pdf,
    Html,
    Image,
    Video,
    Summary,
    Comprehensive,
    Paragraph,
    Audio
}

/// <summary>
/// Source of a course episode's media.
/// </summary>
public enum CourseEpisodeSource
{
    /// <summary>Uploaded directly to object storage via S3 multipart (64 MB parts).</summary>
    Upload = 0,

    /// <summary>Embedded YouTube video (no stored blob).</summary>
    YouTube = 1
}

/// <summary>
/// File virus scan status.
/// </summary>
public enum VirusScanStatus
{
    Pending,
    Clean,
    Infected,
    Error
}

/// <summary>
/// PR-5 — provider-neutral object-retention lifecycle for library assets
/// (Backblaze B2 is the verified provider; the states carry no provider semantics).
///
/// Lifecycle: Active → (archive | tombstone | quarantine) → RetentionPending |
/// Quarantined → Restorable (restore) or Final Deletion (a separate, authorized,
/// re-authenticated, retention-aware operation that physically removes the object).
///
/// NULL on the column means Active (legacy rows predate the lifecycle).
/// A normal archive/delete NEVER physically removes the stored object.
/// </summary>
public enum LibraryRetentionState
{
    /// <summary>The row's normal operating state (NULL on the column).</summary>
    Active = 0,

    /// <summary>Soft-deleted (tombstoned): the DB row is the tombstone; the stored
    /// object stays under retention until a separate final-deletion approval runs.</summary>
    RetentionPending = 1,

    /// <summary>Pulled from circulation on suspicion (malware, legal hold, content
    /// review). Hidden from students; restorable without data loss.</summary>
    Quarantined = 2
}

/// <summary>
/// Notification types.
/// </summary>
public enum NotificationType
{
    Announcement,
    SubscriptionAlert,
    NewContent,
    Security,
    Message,
    Achievement
}

/// <summary>
/// Notification delivery channels.
/// </summary>
public enum NotificationChannel
{
    Push,
    InApp,
    Toast
}

/// <summary>
/// Notification delivery status.
/// </summary>
public enum DeliveryStatus
{
    Pending,
    Sent,
    Delivered,
    Failed,
    Read,
    Clicked
}

/// <summary>
/// Notification target audience types.
/// </summary>
public enum TargetType
{
    Student,
    Subject,
    Semester,
    Year,
    College,
    University,
    All
}

/// <summary>
/// Security event types for audit logging.
/// </summary>
public enum SecurityEventType
{
    LoginSuccess,
    LoginFailed,
    Logout,
    SessionCreated,
    SessionRevoked,
    Refresh,
    RefreshReuse,
    DeviceRegistered,
    DeviceChange,
    DeviceBindingFailed,
    DevtoolsDetected,
    ScreenshotAttempt,
    CopyAttempt,
    DownloadAttempt,
    PrintAttempt,
    MultipleAccountsSuspected,
    BanIssued,
    BanLifted,
    PasswordChanged,
    PasswordResetRequested,
    MfaEnabled,
    MfaFailed,
    MfaDisabled,
    PermissionChange,
    RoleChange,
    SubscriptionActivated,
    SubscriptionRevoked,
    OtpSent,
    OtpVerified,
    OtpFailed,
    EntitlementDenied,
    OfflinePackageCreated,
    OfflinePackageRevoked,
    OfflineSyncRejected,
    AdminScopeDenied,
    SignedUrlIssued,
    FileAccess,
    FileAccessDenied,
    FileScanRejected,
    AdminAction,
    SecurityAlert,
    SuspiciousActivity
}

/// <summary>
/// Security log severity levels.
/// </summary>
public enum SecuritySeverity
{
    Info,
    Warning,
    Critical
}

/// <summary>
/// Error report reason types.
/// </summary>
public enum ErrorReportReason
{
    Scientific,
    Typo,
    MissingOption,
    UnclearExplanation,
    Other
}

/// <summary>
/// Error report status.
/// </summary>
public enum ErrorReportStatus
{
    Pending,
    Reviewing,
    Resolved,
    Rejected,
    Closed
}

/// <summary>
/// User types for authentication.
/// </summary>
public enum UserType
{
    Student,
    Admin
}
