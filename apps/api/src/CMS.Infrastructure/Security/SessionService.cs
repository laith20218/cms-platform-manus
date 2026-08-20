using System.Security.Cryptography;
using System.Text;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CMS.Infrastructure.Security;

/// <summary>
/// Persists opaque refresh-token sessions. Raw refresh tokens are returned once to
/// the caller and are never stored, logged, or interpreted as JWTs.
/// </summary>
public sealed class SessionService : ISessionService
{
    private readonly ApplicationDbContext _db;
    private readonly ITokenService _tokenService;
    private readonly SecurityService _securityService;
    private readonly int _refreshLifetimeDays;

    public SessionService(ApplicationDbContext db, ITokenService tokenService, SecurityService securityService, IConfiguration configuration)
    {
        _db = db;
        _tokenService = tokenService;
        _securityService = securityService;
        _refreshLifetimeDays = Math.Clamp(
            int.TryParse(configuration["Jwt:RefreshTokenExpiryDays"], out var days) ? days : 7,
            1,
            30);
    }

    public async Task<SessionTokenPair> CreateAsync(
        Guid userId,
        string subject,
        string role,
        string installationId,
        string? displayName,
        CancellationToken ct = default)
    {
        var device = await _securityService.VerifyDeviceBindingAsync(userId, installationId, null, displayName, ct);
        if (!device.IsValid)
            throw new UnauthorizedAccessException(device.Reason ?? "هذا الجهاز غير مسجل");

        var installation = await ResolveInstallationAsync(userId, installationId, displayName, ct);
        if (!installation.IsActive)
            throw new UnauthorizedAccessException("تم إلغاء هذا التثبيت");

        var rawRefreshToken = CreateOpaqueToken();
        var session = new UserSession
        {
            UserId = userId,
            Role = role,
            InstallationId = installation.InstallationId,
            FamilyId = Guid.NewGuid(),
            RefreshTokenHash = HashToken(rawRefreshToken),
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(_refreshLifetimeDays),
            LastActivityAt = DateTime.UtcNow
        };

        _db.UserSessions.Add(session);
        await _db.SaveChangesAsync(ct);
        await _securityService.LogSecurityEventAsync(userId, null, SecurityEventType.SessionCreated, SecuritySeverity.Info, "Session created", null, null, installation.InstallationId, ct);
        await _securityService.LogSecurityEventAsync(userId, null, SecurityEventType.LoginSuccess, SecuritySeverity.Info, "Login succeeded", null, null, installation.InstallationId, ct);

        return new SessionTokenPair(
            _tokenService.GenerateAccessToken(userId, subject, role, session.Id, session.InstallationId, session.TokenVersion),
            rawRefreshToken,
            session.Id,
            session.RefreshTokenExpiresAt);
    }

    public async Task<SessionTokenPair?> RotateAsync(string refreshToken, string installationId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken) || string.IsNullOrWhiteSpace(installationId))
            return null;

        var tokenHash = HashToken(refreshToken);
        var now = DateTime.UtcNow;
        var session = await _db.UserSessions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.RefreshTokenHash == tokenHash, ct);
        if (session is null)
            return null;

        if (!session.IsActiveAt(now) || !FixedTimeEquals(session.InstallationId, installationId))
            return null;

        var installation = await _db.UserInstallations.AsNoTracking()
            .FirstOrDefaultAsync(i => i.UserId == session.UserId && i.InstallationId == session.InstallationId, ct);
        if (installation is null || !installation.IsActive)
            return null;

        var deviceIsActive = await _db.DeviceBindings.AsNoTracking()
            .AnyAsync(i => i.StudentId == session.UserId && i.DeviceFingerprint == session.InstallationId && i.IsActive, ct);
        if (!deviceIsActive)
            return null;

        // Consume the old token and create its successor in one database transaction.
        // Only one concurrent caller can consume a refresh token; reuse revokes its family.
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        var consumed = await _db.UserSessions
            .Where(s => s.Id == session.Id && s.Status == SessionStatus.Active && s.RevokedAt == null && s.RefreshTokenUsedAt == null && s.RefreshTokenExpiresAt > now)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(s => s.RefreshTokenUsedAt, now)
                .SetProperty(s => s.LastActivityAt, now), ct);
        if (consumed != 1)
        {
            await transaction.RollbackAsync(ct);
            await RevokeFamilyAsync(session.FamilyId, "refresh_token_reuse", ct);
            await _securityService.LogSecurityEventAsync(session.UserId, null, SecurityEventType.RefreshReuse, SecuritySeverity.Critical, "Refresh token reuse detected; session family revoked", null, null, session.InstallationId, ct);
            return null;
        }

        var rawRefreshToken = CreateOpaqueToken();
        var successor = new UserSession
        {
            UserId = session.UserId,
            Role = session.Role,
            InstallationId = session.InstallationId,
            FamilyId = session.FamilyId,
            RefreshTokenHash = HashToken(rawRefreshToken),
            RefreshTokenExpiresAt = now.AddDays(_refreshLifetimeDays),
            LastActivityAt = now,
            TokenVersion = session.TokenVersion
        };

        _db.UserSessions.Add(successor);
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        await _securityService.LogSecurityEventAsync(successor.UserId, null, SecurityEventType.Refresh, SecuritySeverity.Info, "Refresh token rotated", null, null, successor.InstallationId, ct);

        return new SessionTokenPair(
            _tokenService.GenerateAccessToken(successor.UserId, string.Empty, successor.Role, successor.Id, successor.InstallationId, successor.TokenVersion),
            rawRefreshToken,
            successor.Id,
            successor.RefreshTokenExpiresAt);
    }

    public async Task RevokeAsync(Guid sessionId, string reason, CancellationToken ct = default)
    {
        var session = await _db.UserSessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct);
        if (session is null) return;
        session.Revoke(reason);
        await _db.SaveChangesAsync(ct);
        await _securityService.LogSecurityEventAsync(session.UserId, null, SecurityEventType.SessionRevoked, SecuritySeverity.Warning, "Session revoked", null, null, session.InstallationId, ct);
        if (string.Equals(reason, "logout", StringComparison.OrdinalIgnoreCase))
            await _securityService.LogSecurityEventAsync(session.UserId, null, SecurityEventType.Logout, SecuritySeverity.Info, "Logout completed", null, null, session.InstallationId, ct);
    }

    public async Task RevokeAllForUserAsync(Guid userId, string reason, CancellationToken ct = default)
    {
        var sessions = await _db.UserSessions
            .Where(s => s.UserId == userId && s.Status == SessionStatus.Active)
            .ToListAsync(ct);
        foreach (var session in sessions) session.Revoke(reason);
        if (sessions.Count > 0)
        {
            await _db.SaveChangesAsync(ct);
            foreach (var session in sessions)
                await _securityService.LogSecurityEventAsync(session.UserId, null, SecurityEventType.SessionRevoked, SecuritySeverity.Warning, "All active sessions revoked", null, null, session.InstallationId, ct);
        }
    }

    public async Task<bool> IsActiveAsync(Guid sessionId, int tokenVersion, string installationId, CancellationToken ct = default)
    {
        var session = await _db.UserSessions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == sessionId, ct);
        if (session is null || !session.IsActiveAt(DateTime.UtcNow) || session.TokenVersion != tokenVersion ||
            !FixedTimeEquals(session.InstallationId, installationId))
            return false;

        return await _db.DeviceBindings.AsNoTracking()
            .AnyAsync(i => i.StudentId == session.UserId && i.DeviceFingerprint == installationId && i.IsActive, ct);
    }

    private async Task<UserInstallation> ResolveInstallationAsync(Guid userId, string installationId, string? displayName, CancellationToken ct)
    {
        if (installationId.Length is < 16 or > 200)
            throw new DomainException("معرّف التثبيت غير صالح", "INSTALLATION_INVALID");

        var installation = await _db.UserInstallations
            .FirstOrDefaultAsync(i => i.UserId == userId && i.InstallationId == installationId, ct);
        if (installation is not null)
        {
            installation.LastSeenAt = DateTime.UtcNow;
            return installation;
        }

        installation = new UserInstallation
        {
            UserId = userId,
            InstallationId = installationId,
            DisplayName = displayName?.Trim()[..Math.Min(displayName.Trim().Length, 120)],
            LastSeenAt = DateTime.UtcNow
        };
        _db.UserInstallations.Add(installation);
        return installation;
    }

    private async Task RevokeFamilyAsync(Guid familyId, string reason, CancellationToken ct)
    {
        var sessions = await _db.UserSessions.Where(s => s.FamilyId == familyId).ToListAsync(ct);
        foreach (var session in sessions) session.Revoke(reason);
        await _db.SaveChangesAsync(ct);
    }

    private static string CreateOpaqueToken()
    {
        Span<byte> bytes = stackalloc byte[64];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static bool FixedTimeEquals(string left, string right) =>
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(left), Encoding.UTF8.GetBytes(right));
}
