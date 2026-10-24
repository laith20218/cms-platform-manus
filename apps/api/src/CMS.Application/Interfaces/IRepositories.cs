using CMS.Domain.Entities;
using CMS.Domain.Enums;

namespace CMS.Application.Interfaces;

/// <summary>
/// Generic repository interface for CRUD operations.
/// </summary>
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<List<T>> GetAllAsync(CancellationToken ct = default);
    Task AddAsync(T entity, CancellationToken ct = default);
    void Update(T entity);
    void Remove(T entity);
}

/// <summary>
/// Question-specific repository.
/// </summary>
public interface IQuestionRepository
{
    Task<Question?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Question?> GetByIdWithOptionsAsync(Guid id, CancellationToken ct = default);
    Task<(List<Question> Items, int Total)> GetBySubjectAsync(
        Guid subjectId,
        int page,
        int pageSize,
        string? difficulty = null,
        string? search = null,
        CancellationToken ct = default);
    Task<List<Question>> GetByLectureAsync(Guid lectureId, CancellationToken ct = default);
    Task<List<Question>> GetByExamAsync(Guid examId, CancellationToken ct = default);
    Task AddAsync(Question question, CancellationToken ct = default);
    Task UpdateAsync(Question question, CancellationToken ct = default);
    Task SoftDeleteAsync(Guid questionId, Guid deletedBy, CancellationToken ct = default);
    Task<int> CountBySubjectAsync(Guid subjectId, CancellationToken ct = default);
}

/// <summary>
/// Student-specific repository.
/// </summary>
public interface IStudentRepository
{
    Task<Student?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Student?> GetByPhoneAsync(string phoneNormalized, CancellationToken ct = default);
    Task<bool> PhoneExistsAsync(string phoneNormalized, CancellationToken ct = default);
    Task AddAsync(Student student, CancellationToken ct = default);
    Task UpdateAsync(Student student, CancellationToken ct = default);
    Task<List<Student>> GetActiveAsync(int page, int pageSize, CancellationToken ct = default);
}

/// <summary>
/// Subscription code repository.
/// </summary>
public interface ISubscriptionCodeRepository
{
    Task<SubscriptionCode?> GetByCodeAsync(string code, CancellationToken ct = default);
    Task<List<SubscriptionCode>> GetByBatchAsync(Guid batchId, CancellationToken ct = default);
    Task AddAsync(SubscriptionCode code, CancellationToken ct = default);
    Task AddRangeAsync(List<SubscriptionCode> codes, CancellationToken ct = default);
    Task<int> CountActiveBySubjectAsync(Guid subjectId, CancellationToken ct = default);
}

/// <summary>
/// Unit of Work pattern for transactional operations.
/// </summary>
public interface IUnitOfWork : IDisposable
{
    Task<int> SaveChangesAsync(CancellationToken ct = default);
    Task BeginTransactionAsync(CancellationToken ct = default);
    Task CommitTransactionAsync(CancellationToken ct = default);
    Task RollbackTransactionAsync(CancellationToken ct = default);
}

/// <summary>
/// Cache service interface (Redis).
/// </summary>
public interface ICacheService
{
    Task<T?> GetAsync<T>(string key, CancellationToken ct = default);
    Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default);
    Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default);
    Task<long> IncrementAsync(string key, TimeSpan? expiry = null, CancellationToken ct = default);
    Task RemoveAsync(string key, CancellationToken ct = default);
    Task RemoveByPatternAsync(string pattern, CancellationToken ct = default);
}

/// <summary>
/// File storage service interface (S3-compatible, Cloudflare R2 by configuration).
/// </summary>
public interface IFileStorageService
{
    Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default);
    /// <summary>Issues a short-lived pre-signed URL for direct browser upload (PUT verb). The object key MUST be server-generated and never derived from user input. When <paramref name="contentLength"/> is provided the provider binds it into the signature so storage rejects any body whose actual size differs.</summary>
    Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry, long? contentLength = null, CancellationToken ct = default);
    /// <summary>Issues a short-lived pre-signed URL for read access (GET verb). Never use this for uploads.</summary>
    Task<string> GetSignedUrlAsync(string key, TimeSpan expiry, CancellationToken ct = default);
    Task DeleteAsync(string key, CancellationToken ct = default);
    Task<bool> ExistsAsync(string key, CancellationToken ct = default);
    /// <summary>Downloads an object's content. The caller owns the returned stream and must dispose it.</summary>
    Task<Stream> DownloadAsync(string key, CancellationToken ct = default);
    /// <summary>Overwrites an existing object at the given key (server-side upload with explicit key, used by in-place transforms such as HTML sanitization).</summary>
    Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default);

    // ===== Push 4 / Track 4: S3 multipart (course episode videos up to 2.5 GB) =====
    // All object keys are server-generated. The browser uploads parts directly to storage
    // against pre-signed UploadPart URLs; the API never proxies media bytes.

    /// <summary>Starts a multipart upload and returns the storage-side upload id.</summary>
    Task<string> InitiateMultipartUploadAsync(string key, string contentType, CancellationToken ct = default);
    /// <summary>Pre-signs a single UploadPart PUT URL (partNumber + uploadId query params). Expiry is capped by the provider (Upstash session-credential leases live ~10 minutes).</summary>
    Task<string> PresignUploadPartAsync(string key, string uploadId, int partNumber, TimeSpan expiry, CancellationToken ct = default);
    /// <summary>Lists the parts already stored for a multipart upload — the resume primitive.</summary>
    Task<List<UploadedPartInfo>> ListMultipartPartsAsync(string key, string uploadId, CancellationToken ct = default);
    /// <summary>Finalizes a multipart upload. Parts are supplied as (partNumber, etag) pairs captured by the browser from each part PUT response.</summary>
    Task CompleteMultipartUploadAsync(string key, string uploadId, IReadOnlyList<CompletedPart> parts, CancellationToken ct = default);
    /// <summary>Aborts a multipart upload and discards its stored parts (idempotent).</summary>
    Task AbortMultipartUploadAsync(string key, string uploadId, CancellationToken ct = default);
    /// <summary>Returns the stored object's exact size in bytes (HEAD) — used to verify the final multipart result against the upload ceiling.</summary>
    Task<long> GetObjectSizeAsync(string key, CancellationToken ct = default);
    /// <summary>Pre-signs a GET URL through the credential (lease) path instead of the capped presign agent — for long-lived playback of large videos. Actual validity is still bounded by the session-credential lifetime; callers must be ready to refresh.</summary>
    Task<string> GetSignedUrlViaCredentialsAsync(string key, TimeSpan desiredExpiry, CancellationToken ct = default);
}

/// <summary>A part already stored for a multipart upload, as reported by ListParts.</summary>
public sealed record UploadedPartInfo(int PartNumber, long Size, string ETag);

/// <summary>An (partNumber, ETag) pair required to complete a multipart upload.</summary>
public sealed record CompletedPart(int PartNumber, string ETag);

/// <summary>
/// Read-only access to admin-editable system settings (key/value store). Values are raw strings;
/// callers parse them and fall back to safe hardcoded defaults when a key is missing or malformed.
/// </summary>
public interface ISystemSettingsService
{
    /// <summary>Returns the raw value stored for a setting key, or null when the key does not exist.</summary>
    Task<string?> GetAsync(string key, CancellationToken ct = default);
}

/// <summary>
/// Server-side sanitizer for uploaded HTML blobs. Downloads the object from storage, strips
/// dangerous markup (scripts, event handlers, dangerous URLs) and overwrites the object in place.
/// Throws on any failure — callers must treat a failed sanitization as a rejected upload.
/// </summary>
public interface IHtmlBlobSanitizer
{
    /// <summary>Sanitizes the HTML object at <paramref name="objectKey"/> in place. <paramref name="declaredSizeBytes"/> is the enforcement ceiling: larger bodies are rejected before being buffered.</summary>
    Task SanitizeAsync(string objectKey, long declaredSizeBytes, CancellationToken ct = default);
}

/// <summary>Fail-closed scanner abstraction for stored content before publication or signed access.</summary>
public interface IFileScanner
{
    Task<FileScanResult> ScanAsync(string objectKey, string? declaredContentType, CancellationToken ct = default);
}

public sealed record FileScanResult(bool IsClean, bool IsInfected, string Verdict, string? Detail = null);

/// <summary>
/// Issues short-lived signed access tokens only. Refresh tokens are opaque values
/// owned and validated by ISessionService, never parsed as JWTs.
/// </summary>
public interface ITokenService
{
    string GenerateAccessToken(Guid userId, string subject, string role, Guid sessionId, string installationId, int tokenVersion);
    bool ValidateToken(string token);
}

public record SessionTokenPair(string AccessToken, string RefreshToken, Guid SessionId, DateTime RefreshExpiresAt);

/// <summary>
/// Server-side session registry for opaque refresh-token rotation, reuse detection,
/// device/installation checks, and explicit revocation.
/// </summary>
public interface ISessionService
{
    Task<SessionTokenPair> CreateAsync(Guid userId, string subject, string role, string installationId, string? displayName, CancellationToken ct = default, string? ipAddress = null, string? userAgent = null);
    Task<SessionTokenPair?> RotateAsync(string refreshToken, string installationId, CancellationToken ct = default);
    Task RevokeAsync(Guid sessionId, string reason, CancellationToken ct = default);
    Task RevokeAllForUserAsync(Guid userId, string reason, CancellationToken ct = default);
    Task<bool> IsActiveAsync(Guid sessionId, int tokenVersion, string installationId, CancellationToken ct = default);
    /// <summary>
    /// Push 2 / Track 2: throttled activity heartbeat — refreshes LastActivityAt only when the
    /// stored value is older than the throttle window (single conditional UPDATE, no tracking).
    /// </summary>
    Task TouchActivityAsync(Guid sessionId, CancellationToken ct = default);
}

/// <summary>
/// Push 2 / Track 2: writes one AdminActivityLog row per completed administrative action.
/// Best-effort by design: a logging failure must never fail the business operation it records
/// (same contract as the A1 best-effort blob cleanup) — failures are swallowed and logged.
/// </summary>
public interface IAdminActivityWriter
{
    Task LogAsync(Guid adminId, CMS.Domain.Enums.AdminActivityActionType actionType, string? resourceId = null, object? metadata = null, Guid? sessionId = null, CancellationToken ct = default);
}

/// <summary>Central server-side decision point for academic subscription access.</summary>
public interface IEntitlementService
{
    Task<bool> CanAccessSubjectAsync(Guid studentId, Guid subjectId, string action, CancellationToken ct = default);
    Task<bool> CanAccessSubjectContentAsync(Guid studentId, Guid subjectId, SubscriptionContentScope requiredContentScope, CancellationToken ct = default);
    Task<bool> CanAccessQuestionAsync(Guid studentId, Guid questionId, string action, CancellationToken ct = default);
    Task<bool> CanAccessExamAsync(Guid studentId, Guid examId, string action, CancellationToken ct = default);
    Task<bool> CanAccessLectureAsync(Guid studentId, Guid lectureId, string action, CancellationToken ct = default);
}

/// <summary>Short-lived entitlement issued from verified server-side academic grants.</summary>
public sealed record SignedEntitlement(
    Guid UserId,
    string DeviceId,
    Guid? UniversityId,
    Guid? CollegeId,
    IReadOnlyList<Guid> AllowedYears,
    IReadOnlyList<Guid> AllowedSemesters,
    IReadOnlyList<Guid> AllowedSubjects,
    DateTime IssuedAt,
    DateTime ExpiresAt,
    int Version,
    string Signature);

/// <summary>Outcome of signature, expiry, device, and academic-scope validation.</summary>
public sealed record SignedEntitlementValidationResult(bool IsValid, string? FailureReason, SignedEntitlement? Entitlement);

/// <summary>Issues and validates signed, short-lived academic access entitlements.</summary>
public interface ISignedEntitlementService
{
    Task<string> IssueAsync(Guid studentId, string installationId, CancellationToken ct = default);
    Task<SignedEntitlementValidationResult> ValidateAsync(string token, Guid expectedStudentId, string expectedInstallationId, Guid? requiredSubjectId = null, CancellationToken ct = default);
}

/// <summary>Scoped request/session correlation identifier propagated into audit events.</summary>
public interface ICorrelationContext
{
    string CorrelationId { get; set; }
}

/// <summary>Result of a retention run. No user or security event data is removed before the configured cutoff.</summary>
public sealed record SecurityAuditRetentionResult(DateTime CutoffUtc, int DeletedCount);

/// <summary>Executes the configured retention policy for durable security audit events.</summary>
public interface ISecurityAuditRetentionService
{
    Task<SecurityAuditRetentionResult> RunOnceAsync(CancellationToken ct = default);
}

/// <summary>Application-facing audit writer. Descriptions must never include credentials, tokens, keys, or plaintext secrets.</summary>
public interface ISecurityAuditWriter
{
    Task LogSecurityEventAsync(
        Guid? studentId,
        Guid? adminId,
        CMS.Domain.Enums.SecurityEventType eventType,
        CMS.Domain.Enums.SecuritySeverity severity,
        string description,
        string? ipAddress = null,
        string? userAgent = null,
        string? deviceFingerprint = null,
        CancellationToken ct = default);
}

/// <summary>Serializable write request for a durable security audit event.</summary>
public sealed record SecurityEventWrite(
    Guid? StudentId,
    Guid? AdminId,
    CMS.Domain.Enums.SecurityEventType EventType,
    CMS.Domain.Enums.SecuritySeverity Severity,
    string Description,
    string? IpAddress,
    string? UserAgent,
    string? DeviceFingerprint,
    string CorrelationId);

/// <summary>Queues non-critical audit events and flushes them durably in ordered batches.</summary>
public interface ISecurityEventBatch
{
    ValueTask EnqueueAsync(SecurityEventWrite securityEvent, CancellationToken ct = default);
    Task FlushAsync(CancellationToken ct = default);
}

/// <summary>Versioned, device- and ownership-bound offline package manifest.</summary>
public sealed record OfflinePackageManifest(
    Guid PackageId,
    Guid UserId,
    string InstallationId,
    int ContentVersion,
    IReadOnlyList<Guid> AllowedSubjects,
    DateTime IssuedAt,
    DateTime ExpiresAt,
    string NonceBase64Url,
    string AadHashBase64Url,
    string SignatureBase64Url);

/// <summary>Encrypted package envelope; WrappedKey is opaque and never the raw AES key.</summary>
public sealed record OfflineEncryptedPackage(
    OfflinePackageManifest Manifest,
    string CiphertextBase64Url,
    string TagBase64Url,
    string WrappedKeyBase64Url,
    string KeyReleaseToken);

/// <summary>Performs AES-256-GCM package encryption and device-bound key wrapping. Trusted clients use an Android Keystore public key; legacy wrapping remains behind disabled feature gates only.</summary>
public interface IOfflinePackageCryptoService
{
    OfflineEncryptedPackage Encrypt(Guid userId, string installationId, int contentVersion, IReadOnlyList<Guid> allowedSubjects, DateTime issuedAt, DateTime expiresAt, ReadOnlySpan<byte> plaintext, string? devicePublicKeySpki = null);
    byte[] ReleaseKey(OfflineEncryptedPackage package, Guid expectedUserId, string expectedInstallationId, DateTime utcNow);
    byte[] Decrypt(OfflineEncryptedPackage package, ReadOnlySpan<byte> packageKey);
    bool VerifyManifest(OfflinePackageManifest manifest);
}

/// <summary>Durable package lifecycle with ownership, idempotency and revocation.</summary>
public interface IOfflinePackageLifecycleService
{
    Task<OfflineEncryptedPackage> IssueAsync(Guid studentId, string installationId, int contentVersion, string idempotencyKey, IReadOnlyList<Guid> allowedSubjects, DateTime expiresAt, ReadOnlyMemory<byte> plaintext, string? devicePublicKeySpki = null, CancellationToken ct = default);
    Task RevokeAsync(Guid studentId, Guid packageId, string reason, CancellationToken ct = default);
}

/// <summary>
/// Password hashing service interface.
/// </summary>
public interface IPasswordHasher
{
    string HashPassword(string password);
    bool VerifyPassword(string password, string hash);
    bool NeedsRehash(string hash);
}

/// <summary>Applies the server-side password policy before a password can be stored.</summary>
public interface IPasswordPolicy
{
    void EnsureValid(string password);
}
