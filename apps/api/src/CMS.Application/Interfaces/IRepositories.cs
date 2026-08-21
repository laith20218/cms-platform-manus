using CMS.Domain.Entities;

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
/// File storage service interface (Cloudflare R2).
/// </summary>
public interface IFileStorageService
{
    Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default);
    Task<string> GetSignedUrlAsync(string key, TimeSpan expiry);
    Task DeleteAsync(string key, CancellationToken ct = default);
    Task<bool> ExistsAsync(string key, CancellationToken ct = default);
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
    Task<SessionTokenPair> CreateAsync(Guid userId, string subject, string role, string installationId, string? displayName, CancellationToken ct = default);
    Task<SessionTokenPair?> RotateAsync(string refreshToken, string installationId, CancellationToken ct = default);
    Task RevokeAsync(Guid sessionId, string reason, CancellationToken ct = default);
    Task RevokeAllForUserAsync(Guid userId, string reason, CancellationToken ct = default);
    Task<bool> IsActiveAsync(Guid sessionId, int tokenVersion, string installationId, CancellationToken ct = default);
}

/// <summary>Central server-side decision point for academic subscription access.</summary>
public interface IEntitlementService
{
    Task<bool> CanAccessSubjectAsync(Guid studentId, Guid subjectId, string action, CancellationToken ct = default);
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
