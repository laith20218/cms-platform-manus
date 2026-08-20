using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Creates compact HMAC-SHA256 protected entitlement tokens from the current,
/// server-side subscription and device-binding state. Tokens never grant a scope
/// supplied by the caller and are deliberately short lived.
/// </summary>
public sealed class SignedEntitlementService : ISignedEntitlementService
{
    private const int CurrentVersion = 1;
    private readonly ApplicationDbContext _db;
    private readonly byte[] _signingKey;
    private readonly TimeSpan _lifetime;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web);

    public SignedEntitlementService(ApplicationDbContext db, IConfiguration configuration)
    {
        _db = db;

        var signingKey = configuration["Security:Entitlements:SigningKey"];
        if (string.IsNullOrWhiteSpace(signingKey) || Encoding.UTF8.GetByteCount(signingKey) < 32)
            throw new InvalidOperationException("Security:Entitlements:SigningKey must be configured with at least 32 bytes.");

        _signingKey = Encoding.UTF8.GetBytes(signingKey);
        var configuredMinutes = configuration.GetValue<int?>("Security:Entitlements:LifetimeMinutes") ?? 20;
        if (configuredMinutes is < 1 or > 30)
            throw new InvalidOperationException("Security:Entitlements:LifetimeMinutes must be between 1 and 30.");

        _lifetime = TimeSpan.FromMinutes(configuredMinutes);
    }

    public async Task<string> IssueAsync(Guid studentId, string installationId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(installationId))
            throw new UnauthorizedAccessException("A device installation identifier is required.");

        var student = await _db.Students.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == studentId && s.DeletedAt == null, ct)
            ?? throw new UnauthorizedAccessException("Student is not eligible for an entitlement.");

        if (student.IsBanned())
            throw new UnauthorizedAccessException("Student is not eligible for an entitlement.");

        var deviceIsActive = await _db.DeviceBindings.AsNoTracking()
            .AnyAsync(d => d.StudentId == studentId && d.IsActive && d.DeviceFingerprint == installationId, ct);
        if (!deviceIsActive)
            throw new UnauthorizedAccessException("The supplied device is not actively bound to this student.");

        var scopes = await ResolveScopesAsync(studentId, ct);
        var now = DateTime.UtcNow;
        var unsigned = new UnsignedEntitlement(
            studentId,
            installationId,
            student.UniversityId,
            student.CollegeId,
            scopes.Years,
            scopes.Semesters,
            scopes.Subjects,
            now,
            now.Add(_lifetime),
            CurrentVersion);

        var payload = JsonSerializer.SerializeToUtf8Bytes(unsigned, _jsonOptions);
        var signature = Sign(payload);
        return $"{Base64UrlEncode(payload)}.{Base64UrlEncode(signature)}";
    }

    public async Task<SignedEntitlementValidationResult> ValidateAsync(
        string token,
        Guid expectedStudentId,
        string expectedInstallationId,
        Guid? requiredSubjectId = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(expectedInstallationId))
            return Invalid("Missing entitlement or device identifier.");

        var parts = token.Split('.', StringSplitOptions.None);
        if (parts.Length != 2)
            return Invalid("Invalid entitlement format.");

        byte[] payload;
        byte[] suppliedSignature;
        try
        {
            payload = Base64UrlDecode(parts[0]);
            suppliedSignature = Base64UrlDecode(parts[1]);
        }
        catch (FormatException)
        {
            return Invalid("Invalid entitlement encoding.");
        }

        // Reject alternate, non-canonical Base64URL spellings before comparing the
        // signature. Otherwise unused trailing bits can mutate token text without
        // changing the decoded byte sequence.
        if (!string.Equals(parts[0], Base64UrlEncode(payload), StringComparison.Ordinal) ||
            !string.Equals(parts[1], Base64UrlEncode(suppliedSignature), StringComparison.Ordinal))
            return Invalid("Invalid entitlement encoding.");

        var expectedSignature = Sign(payload);
        if (suppliedSignature.Length != expectedSignature.Length ||
            !CryptographicOperations.FixedTimeEquals(suppliedSignature, expectedSignature))
            return Invalid("Invalid entitlement signature.");

        UnsignedEntitlement? unsigned;
        try
        {
            unsigned = JsonSerializer.Deserialize<UnsignedEntitlement>(payload, _jsonOptions);
        }
        catch (JsonException)
        {
            return Invalid("Invalid entitlement payload.");
        }

        if (unsigned is null || unsigned.Version != CurrentVersion)
            return Invalid("Unsupported entitlement version.");
        if (unsigned.UserId != expectedStudentId)
            return Invalid("Entitlement user mismatch.");
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(unsigned.DeviceId), Encoding.UTF8.GetBytes(expectedInstallationId)))
            return Invalid("Entitlement device mismatch.");
        if (unsigned.IssuedAt > DateTime.UtcNow.AddMinutes(1) || unsigned.ExpiresAt <= DateTime.UtcNow)
            return Invalid("Entitlement has expired.");
        if (unsigned.ExpiresAt - unsigned.IssuedAt > _lifetime.Add(TimeSpan.FromMinutes(1)))
            return Invalid("Entitlement lifetime is invalid.");
        if (requiredSubjectId.HasValue && !unsigned.AllowedSubjects.Contains(requiredSubjectId.Value))
            return Invalid("Subject is outside the entitlement scope.");

        var deviceIsActive = await _db.DeviceBindings.AsNoTracking()
            .AnyAsync(d => d.StudentId == expectedStudentId && d.IsActive && d.DeviceFingerprint == expectedInstallationId, ct);
        if (!deviceIsActive)
            return Invalid("Device binding is no longer active.");

        return new SignedEntitlementValidationResult(
            true,
            null,
            new SignedEntitlement(
                unsigned.UserId,
                unsigned.DeviceId,
                unsigned.UniversityId,
                unsigned.CollegeId,
                unsigned.AllowedYears,
                unsigned.AllowedSemesters,
                unsigned.AllowedSubjects,
                unsigned.IssuedAt,
                unsigned.ExpiresAt,
                unsigned.Version,
                parts[1]));
    }

    private async Task<(IReadOnlyList<Guid> Years, IReadOnlyList<Guid> Semesters, IReadOnlyList<Guid> Subjects)> ResolveScopesAsync(Guid studentId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var grants = await _db.StudentSubscriptions.AsNoTracking()
            .Where(s => s.StudentId == studentId && s.Status == SubscriptionStatus.Active && s.RevokedAt == null && s.StartsAt <= now && s.ExpiresAt > now)
            .ToListAsync(ct);

        if (grants.Count == 0)
            return (Array.Empty<Guid>(), Array.Empty<Guid>(), Array.Empty<Guid>());

        var subjects = await _db.Subjects.AsNoTracking()
            .Include(s => s.Semester)
                .ThenInclude(semester => semester.AcademicYear)
                    .ThenInclude(year => year.College)
            .Where(s => s.Status == "active" && s.DeletedAt == null)
            .ToListAsync(ct);

        var allowedSubjects = subjects.Where(subject => grants.Any(grant => grant.ScopeType switch
        {
            SubscriptionScopeType.Subject => grant.ScopeSubjectId == subject.Id,
            SubscriptionScopeType.Semester => grant.ScopeSemesterId == subject.SemesterId,
            SubscriptionScopeType.Year => grant.ScopeYearId == subject.Semester.AcademicYearId,
            SubscriptionScopeType.College => grant.ScopeCollegeId == subject.Semester.AcademicYear.CollegeId,
            SubscriptionScopeType.University => grant.ScopeUniversityId == subject.Semester.AcademicYear.College.UniversityId,
            _ => false
        })).ToList();

        return (
            allowedSubjects.Select(s => s.Semester.AcademicYearId).Distinct().OrderBy(id => id).ToArray(),
            allowedSubjects.Select(s => s.SemesterId).Distinct().OrderBy(id => id).ToArray(),
            allowedSubjects.Select(s => s.Id).Distinct().OrderBy(id => id).ToArray());
    }

    private byte[] Sign(byte[] payload)
    {
        using var hmac = new HMACSHA256(_signingKey);
        return hmac.ComputeHash(payload);
    }

    private static SignedEntitlementValidationResult Invalid(string reason) => new(false, reason, null);

    private static string Base64UrlEncode(byte[] data) => Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/') switch
        {
            var base64 when base64.Length % 4 == 2 => base64 + "==",
            var base64 when base64.Length % 4 == 3 => base64 + "=",
            var base64 => base64
        };
        return Convert.FromBase64String(padded);
    }

    private sealed record UnsignedEntitlement(
        Guid UserId,
        string DeviceId,
        Guid? UniversityId,
        Guid? CollegeId,
        IReadOnlyList<Guid> AllowedYears,
        IReadOnlyList<Guid> AllowedSemesters,
        IReadOnlyList<Guid> AllowedSubjects,
        DateTime IssuedAt,
        DateTime ExpiresAt,
        int Version);
}
