using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CMS.Infrastructure.Services;

public sealed class OfflinePackageLifecycleService : IOfflinePackageLifecycleService
{
    private readonly IApplicationDbContext _db;
    private readonly IOfflinePackageCryptoService _crypto;

    public OfflinePackageLifecycleService(IApplicationDbContext db, IOfflinePackageCryptoService crypto)
    {
        _db = db;
        _crypto = crypto;
    }

    public async Task<OfflineEncryptedPackage> IssueAsync(
        Guid studentId,
        string installationId,
        int contentVersion,
        string idempotencyKey,
        IReadOnlyList<Guid> allowedSubjects,
        DateTime expiresAt,
        ReadOnlyMemory<byte> plaintext,
        string? devicePublicKeySpki = null,
        CancellationToken ct = default)
    {
        if (studentId == Guid.Empty || string.IsNullOrWhiteSpace(installationId) || string.IsNullOrWhiteSpace(idempotencyKey))
            throw new ArgumentException("Student, installation and idempotency key are required");
        var idempotencyHash = HashIdempotency(studentId, installationId, contentVersion, idempotencyKey);
        var existing = await _db.OfflinePackageRecords.AsNoTracking()
            .SingleOrDefaultAsync(x => x.StudentId == studentId && x.IdempotencyHash == idempotencyHash, ct);
        if (existing is not null)
        {
            if (existing.Status != "active" || existing.ExpiresAt <= DateTime.UtcNow) throw new InvalidOperationException("Offline package is revoked or expired");
            return Deserialize(existing);
        }

        var issuedAt = DateTime.UtcNow;
        var envelope = _crypto.Encrypt(studentId, installationId, contentVersion, allowedSubjects, issuedAt, expiresAt, plaintext.Span, devicePublicKeySpki);
        var record = new OfflinePackageRecord(envelope.Manifest.PackageId)
        {
            StudentId = studentId,
            InstallationId = installationId,
            ContentVersion = contentVersion,
            IdempotencyHash = idempotencyHash,
            ManifestJson = JsonSerializer.Serialize(envelope.Manifest),
            CiphertextBase64Url = envelope.CiphertextBase64Url,
            TagBase64Url = envelope.TagBase64Url,
            WrappedKeyBase64Url = envelope.WrappedKeyBase64Url,
            KeyReleaseToken = envelope.KeyReleaseToken,
            IssuedAt = envelope.Manifest.IssuedAt,
            ExpiresAt = envelope.Manifest.ExpiresAt,
            Status = "active"
        };
        await _db.OfflinePackageRecords.AddAsync(record, ct);
        await _db.OfflineKeyReleaseLogs.AddAsync(new OfflineKeyReleaseLog
        {
            PackageId = record.Id, StudentId = studentId, InstallationId = installationId,
            Action = "issued", Succeeded = true, OccurredAt = DateTime.UtcNow
        }, ct);
        await _db.SaveChangesAsync(ct);
        return envelope;
    }

    public async Task RevokeAsync(Guid studentId, Guid packageId, string reason, CancellationToken ct = default)
    {
        var record = await _db.OfflinePackageRecords.SingleOrDefaultAsync(x => x.Id == packageId && x.StudentId == studentId, ct);
        if (record is null) return;
        record.Status = "revoked:" + (string.IsNullOrWhiteSpace(reason) ? "manual" : reason[..Math.Min(reason.Length, 64)]);
        record.RevokedAt = DateTime.UtcNow;
        await _db.OfflineKeyReleaseLogs.AddAsync(new OfflineKeyReleaseLog
        {
            PackageId = record.Id, StudentId = studentId, InstallationId = record.InstallationId,
            Action = "revoked", Succeeded = true, Reason = reason, OccurredAt = DateTime.UtcNow
        }, ct);
        await _db.SaveChangesAsync(ct);
    }

    private static string HashIdempotency(Guid studentId, string installationId, int version, string key) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{studentId:N}|{installationId}|{version}|{key}"))).ToLowerInvariant();

    private static OfflineEncryptedPackage Deserialize(OfflinePackageRecord record)
    {
        var manifest = JsonSerializer.Deserialize<OfflinePackageManifest>(record.ManifestJson)
            ?? throw new InvalidOperationException("Stored offline manifest is invalid");
        return new OfflineEncryptedPackage(manifest, record.CiphertextBase64Url, record.TagBase64Url, record.WrappedKeyBase64Url, record.KeyReleaseToken);
    }
}
