using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using CMS.Application.Commands.Admin;
using AuthAdminLoginCommand = CMS.Application.Commands.Auth.AdminLoginCommand;
using CMS.Application.DTOs.Auth;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Admin;

/// <summary>
/// Handles admin login with 2FA support.
/// </summary>
public class AdminLoginCommandHandler :
    IRequestHandler<AdminLoginCommand, AuthResponse>,
    IRequestHandler<AuthAdminLoginCommand, AuthResponse>
{
    private readonly IApplicationDbContext _db;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ISessionService _sessionService;
    private readonly ICacheService _cache;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISecurityAuditWriter _audit;

    public AdminLoginCommandHandler(
        IApplicationDbContext db,
        IPasswordHasher passwordHasher,
        ISessionService sessionService,
        ICacheService cache,
        IUnitOfWork unitOfWork,
        ISecurityAuditWriter audit)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _sessionService = sessionService;
        _cache = cache;
        _unitOfWork = unitOfWork;
        _audit = audit;
    }

    public Task<AuthResponse> Handle(AdminLoginCommand request, CancellationToken ct) =>
        HandleLoginAsync(request.Email, request.Password, request.TwoFactorCode, request.InstallationId, ct);

    public Task<AuthResponse> Handle(AuthAdminLoginCommand request, CancellationToken ct) =>
        HandleLoginAsync(request.Email, request.Password, request.TwoFactorCode, request.InstallationId, ct);

    private async Task<AuthResponse> HandleLoginAsync(
        string email,
        string password,
        string? twoFactorCode,
        string? requestedInstallationId,
        CancellationToken ct)
    {
        var admin = await _db.Admins
            .Include(a => a.Role)
            .FirstOrDefaultAsync(a => a.Email == email.ToLowerInvariant(), ct)
            ?? throw new DomainException("البريد أو كلمة المرور غير صحيحة", "AUTH_INVALID_CREDENTIALS");

        // Verify password
        if (!_passwordHasher.VerifyPassword(password, admin.PasswordHash))
            throw new DomainException("البريد أو كلمة المرور غير صحيحة", "AUTH_INVALID_CREDENTIALS");

        // Check status
        if (admin.Status != AdminStatus.Active)
            throw new ForbiddenException("حسابك معطّل. تواصل مع Super Admin");

        // 2FA check
        if (admin.TwoFactorEnabled)
        {
            if (string.IsNullOrEmpty(twoFactorCode))
                throw new DomainException("مطلوب رمز التحقق الثنائي (2FA)", "TWO_FACTOR_REQUIRED");

            if (string.IsNullOrWhiteSpace(admin.TwoFactorSecret)
                || !VerifyTotp(admin.TwoFactorSecret, twoFactorCode, out var timeStep))
            {
                await _audit.LogSecurityEventAsync(null, admin.Id, SecurityEventType.MfaFailed, SecuritySeverity.Warning,
                    "mfa_result=invalid_challenge", ct: ct);
                throw new DomainException("رمز 2FA غير صحيح", "TWO_FACTOR_INVALID");
            }

            var replayKey = $"totp-used:{admin.Id}:{timeStep}";
            if (await _cache.GetAsync<bool?>(replayKey, ct) == true)
            {
                await _audit.LogSecurityEventAsync(null, admin.Id, SecurityEventType.MfaFailed, SecuritySeverity.Warning,
                    "mfa_result=replayed_challenge", ct: ct);
                throw new DomainException("تم استخدام رمز 2FA بالفعل", "TWO_FACTOR_REPLAY");
            }
            await _cache.SetAsync(replayKey, true, TimeSpan.FromMinutes(2), ct);
        }

        // Record login
        admin.RecordLogin();
        _db.Admins.Update(admin);
        await _unitOfWork.SaveChangesAsync(ct);

        var installationId = string.IsNullOrWhiteSpace(requestedInstallationId)
            ? $"admin-web-{Guid.NewGuid():N}"
            : requestedInstallationId;
        var tokens = await _sessionService.CreateAsync(
            admin.Id, admin.Email, admin.Role.Name, installationId, "Admin Web", ct);

        return new AuthResponse(
            tokens.AccessToken,
            tokens.RefreshToken,
            "Bearer",
            600,
            new UserDto(
                admin.Id,
                admin.Email,
                admin.FullName,
                admin.Role.Name,
                admin.AvatarUrl,
                null,
                null
            )
        );
    }

    private static bool VerifyTotp(string secret, string code, out long acceptedStep)
    {
        acceptedStep = 0;
        if (code.Length != 6 || !code.All(char.IsDigit)) return false;
        var key = Base32Decode(secret);
        var currentStep = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30;
        for (var offset = -1; offset <= 1; offset++)
        {
            var step = currentStep + offset;
            if (CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(ComputeTotp(key, step)), Encoding.UTF8.GetBytes(code)))
            {
                acceptedStep = step;
                return true;
            }
        }
        return false;
    }

    private static string ComputeTotp(byte[] key, long timeStep)
    {
        var counter = BitConverter.GetBytes(timeStep);
        if (BitConverter.IsLittleEndian) Array.Reverse(counter);
        using var hmac = new HMACSHA1(key);
        var hash = hmac.ComputeHash(counter);
        var offset = hash[^1] & 0x0F;
        var binary = ((hash[offset] & 0x7F) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
        return (binary % 1_000_000).ToString("D6");
    }

    private static byte[] Base32Decode(string input)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var buffer = 0;
        var bitsLeft = 0;
        var bytes = new List<byte>();
        foreach (var character in input.Replace("=", string.Empty).ToUpperInvariant())
        {
            var value = alphabet.IndexOf(character);
            if (value < 0) throw new ArgumentException("Invalid Base32 secret");
            buffer = (buffer << 5) | value;
            bitsLeft += 5;
            if (bitsLeft >= 8)
            {
                bytes.Add((byte)(buffer >> (bitsLeft - 8)));
                bitsLeft -= 8;
            }
        }
        return bytes.ToArray();
    }
}

/// <summary>
/// Get current admin's permissions.
/// </summary>
public class GetMyPermissionsQueryHandler : IRequestHandler<GetMyPermissionsQuery, List<PermissionDto>>
{
    private readonly IPermissionService _permissionService;

    public GetMyPermissionsQueryHandler(IPermissionService permissionService)
    {
        _permissionService = permissionService;
    }

    public async Task<List<PermissionDto>> Handle(GetMyPermissionsQuery request, CancellationToken ct)
    {
        return await _permissionService.GetPermissionsAsync(request.AdminId, ct);
    }
}

/// <summary>
/// Enable 2FA - generates TOTP secret + recovery codes.
/// </summary>
public class Enable2FACommandHandler : IRequestHandler<Enable2FACommand, Enable2FAResponse>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISecurityAuditWriter _audit;

    public Enable2FACommandHandler(IApplicationDbContext db, IUnitOfWork unitOfWork, ISecurityAuditWriter audit)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _audit = audit;
    }

    public async Task<Enable2FAResponse> Handle(Enable2FACommand request, CancellationToken ct)
    {
        var admin = await _db.Admins.FirstOrDefaultAsync(a => a.Id == request.AdminId, ct)
            ?? throw new NotFoundException("Admin", request.AdminId);

        // Generate TOTP secret (32 bytes base32)
        var secretBytes = new byte[20];
        using var rng = System.Security.Cryptography.RandomNumberGenerator.Create();
        rng.GetBytes(secretBytes);
        var secret = Base32Encode(secretBytes);

        // Generate 8 recovery codes
        var recoveryCodes = Enumerable.Range(0, 8)
            .Select(_ => Guid.NewGuid().ToString("N")[..16].ToUpperInvariant())
            .ToList();

        // Generate QR code URL
        var qrCodeUrl = $"otpauth://totp/CMS:{admin.Email}?secret={secret}&issuer=CMS&digits=6&period=30";

        // Save (but don't enable yet - verify first)
        admin.Enable2FA(secret, System.Text.Json.JsonSerializer.Serialize(recoveryCodes));
        _db.Admins.Update(admin);
        await _unitOfWork.SaveChangesAsync(ct);
        await _audit.LogSecurityEventAsync(null, admin.Id, SecurityEventType.MfaEnabled, SecuritySeverity.Warning,
            "mfa_status=enabled", ct: ct);

        return new Enable2FAResponse(qrCodeUrl, secret, recoveryCodes);
    }

    private static string Base32Encode(byte[] data)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var result = new StringBuilder();
        int buffer = 0, bitsLeft = 0;

        foreach (var b in data)
        {
            buffer = (buffer << 8) | b;
            bitsLeft += 8;
            while (bitsLeft >= 5)
            {
                var index = (buffer >> (bitsLeft - 5)) & 0x1F;
                result.Append(alphabet[index]);
                bitsLeft -= 5;
            }
        }

        if (bitsLeft > 0)
        {
            var index = (buffer << (5 - bitsLeft)) & 0x1F;
            result.Append(alphabet[index]);
        }

        return result.ToString();
    }
}

/// <summary>
/// Disable 2FA.
/// </summary>
public class Disable2FACommandHandler : IRequestHandler<Disable2FACommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IUnitOfWork _unitOfWork;

    public Disable2FACommandHandler(
        IApplicationDbContext db,
        IPasswordHasher passwordHasher,
        IUnitOfWork unitOfWork)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _unitOfWork = unitOfWork;
    }

    public async Task<Unit> Handle(Disable2FACommand request, CancellationToken ct)
    {
        var admin = await _db.Admins.FirstOrDefaultAsync(a => a.Id == request.AdminId, ct)
            ?? throw new NotFoundException("Admin", request.AdminId);

        if (!_passwordHasher.VerifyPassword(request.Password, admin.PasswordHash))
            throw new DomainException("كلمة المرور غير صحيحة", "INVALID_PASSWORD");

        // Disable 2FA
        typeof(CMS.Domain.Entities.Admin).GetProperty("TwoFactorEnabled")?.SetValue(admin, false);
        typeof(CMS.Domain.Entities.Admin).GetProperty("TwoFactorSecret")?.SetValue(admin, null);
        typeof(CMS.Domain.Entities.Admin).GetProperty("RecoveryCodes")?.SetValue(admin, null);

        _db.Admins.Update(admin);
        await _unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}


/// <summary>
/// Applies audited administrative role and permission changes through the established permission service.
/// </summary>
public sealed class RoleAdministrationHandlers :
    IRequestHandler<AssignAdminRoleCommand, Unit>,
    IRequestHandler<ReplaceRolePermissionsCommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPermissionService _permissions;
    private readonly ISecurityAuditWriter _audit;

    public RoleAdministrationHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IPermissionService permissions,
        ISecurityAuditWriter audit)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _permissions = permissions;
        _audit = audit;
    }

    public async Task<Unit> Handle(AssignAdminRoleCommand request, CancellationToken ct)
    {
        await RequireAsync(request.ActorAdminId, Resources.Admins, Actions.Edit, ct);
        var target = await _db.Admins.FirstOrDefaultAsync(admin => admin.Id == request.TargetAdminId, ct)
            ?? throw new NotFoundException("Admin", request.TargetAdminId);
        var role = await _db.AdminRoles.FirstOrDefaultAsync(candidate => candidate.Id == request.RoleId, ct)
            ?? throw new NotFoundException("AdminRole", request.RoleId);

        target.AssignRole(role.Id);
        await _unitOfWork.SaveChangesAsync(ct);
        await _audit.LogSecurityEventAsync(
            null, request.ActorAdminId, SecurityEventType.RoleChange, SecuritySeverity.Warning,
            $"target_admin_id={target.Id}; assigned_role_id={role.Id}; assigned_role={role.Name}", ct: ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(ReplaceRolePermissionsCommand request, CancellationToken ct)
    {
        await RequireAsync(request.ActorAdminId, Resources.Roles, Actions.Edit, ct);
        var role = await _db.AdminRoles
            .FirstOrDefaultAsync(candidate => candidate.Id == request.RoleId, ct)
            ?? throw new NotFoundException("AdminRole", request.RoleId);
        if (role.IsSystem)
            throw new ForbiddenException("لا يمكن تعديل صلاحيات الدور النظامي");
        if (request.Permissions.Count == 0)
            throw new DomainException("يجب تقديم صلاحية واحدة على الأقل", "INVALID_ROLE_PERMISSIONS");

        var grants = new List<AdminPermission>();
        foreach (var grant in request.Permissions)
        {
            var resource = grant.Resource?.Trim().ToLowerInvariant();
            var scope = grant.Scope?.Trim().ToLowerInvariant();
            var actions = grant.Actions?.Select(action => action.Trim().ToLowerInvariant()).Distinct().ToList() ?? [];
            if (string.IsNullOrWhiteSpace(resource) || !Resources.All.Contains(resource) ||
                actions.Count == 0 || actions.Any(action => !Actions.All.Contains(action)) ||
                scope is not ("own" or "all" or "scoped"))
                throw new DomainException("صلاحيات الدور غير صالحة", "INVALID_ROLE_PERMISSIONS");

            grants.Add(AdminPermission.Create(role.Id, resource, System.Text.Json.JsonSerializer.Serialize(actions), scope));
        }

        var existingPermissions = await _db.AdminPermissions.Where(permission => permission.RoleId == role.Id).ToListAsync(ct);
        _db.AdminPermissions.RemoveRange(existingPermissions);
        await _db.AdminPermissions.AddRangeAsync(grants, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await _audit.LogSecurityEventAsync(
            null, request.ActorAdminId, SecurityEventType.PermissionChange, SecuritySeverity.Warning,
            $"target_role_id={role.Id}; permission_grants={grants.Count}", ct: ct);
        return Unit.Value;
    }

    private async Task RequireAsync(Guid actorAdminId, string resource, string action, CancellationToken ct)
    {
        if (actorAdminId == Guid.Empty || !await _permissions.HasPermissionAsync(actorAdminId, resource, action, ct))
            throw new ForbiddenException("لا تملك الصلاحية الإدارية المطلوبة");
    }
}
