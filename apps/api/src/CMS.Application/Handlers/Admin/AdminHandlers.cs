using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using CMS.Application.Commands.Admin;
using CMS.Application.Commands.Dashboard;
using AuthAdminLoginCommand = CMS.Application.Commands.Auth.AdminLoginCommand;
using CMS.Application.DTOs.Auth;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using AdminEntity = CMS.Domain.Entities.Admin;

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
        if (admin.Status != AdminStatus.Active || !admin.Role.IsActive)
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
    private readonly ICacheService? _cache;

    public RoleAdministrationHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IPermissionService permissions,
        ISecurityAuditWriter audit,
        ICacheService? cache = null)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _permissions = permissions;
        _audit = audit;
        _cache = cache;
    }

    public async Task<Unit> Handle(AssignAdminRoleCommand request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var target = await _db.Admins.Include(admin => admin.Role).FirstOrDefaultAsync(admin => admin.Id == request.TargetAdminId, ct)
            ?? throw new NotFoundException("Admin", request.TargetAdminId);
        var role = await _db.AdminRoles.FirstOrDefaultAsync(candidate => candidate.Id == request.RoleId, ct)
            ?? throw new NotFoundException("AdminRole", request.RoleId);
        if (target.Role.Name == Roles.SuperAdmin)
            throw new DomainException("لا يمكن تعديل دور حساب المدير العام", "SUPER_ADMIN_PROTECTED");
        if (!role.IsActive)
            throw new DomainException("لا يمكن تعيين دور معطّل", "ROLE_DISABLED");

        target.AssignRole(role.Id);
        await _unitOfWork.SaveChangesAsync(ct);
        await InvalidateAccessAsync(target.Id, ct);
        await _audit.LogSecurityEventAsync(
            null, request.ActorAdminId, SecurityEventType.RoleChange, SecuritySeverity.Warning,
            $"target_admin_id={target.Id}; assigned_role_id={role.Id}; assigned_role={role.Name}", ct: ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(ReplaceRolePermissionsCommand request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var role = await _db.AdminRoles
            .FirstOrDefaultAsync(candidate => candidate.Id == request.RoleId, ct)
            ?? throw new NotFoundException("AdminRole", request.RoleId);
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
        var assignedAdminIds = await _db.Admins.Where(admin => admin.RoleId == role.Id).Select(admin => admin.Id).ToListAsync(ct);
        foreach (var adminId in assignedAdminIds)
            await InvalidateAccessAsync(adminId, ct);
        await _audit.LogSecurityEventAsync(
            null, request.ActorAdminId, SecurityEventType.PermissionChange, SecuritySeverity.Warning,
            $"target_role_id={role.Id}; permission_grants={grants.Count}", ct: ct);
        return Unit.Value;
    }

    private async Task RequireSuperAdminAsync(Guid actorAdminId, CancellationToken ct)
    {
        var actor = await _db.Admins.Include(admin => admin.Role)
            .FirstOrDefaultAsync(admin => admin.Id == actorAdminId, ct);
        if (actor is null || actor.Status != AdminStatus.Active || !actor.Role.IsActive || actor.Role.Name != Roles.SuperAdmin)
            throw new ForbiddenException("لا تملك الصلاحية الإدارية المطلوبة");
    }

    private async Task InvalidateAccessAsync(Guid adminId, CancellationToken ct)
    {
        if (_cache is null) return;
        await _cache.RemoveByPatternAsync($"perm:{adminId}:*", ct);
        await _cache.RemoveAsync($"scope:{adminId}", ct);
    }
}

/// <summary>
/// Handles the super-administrator console lifecycle for administrator accounts and roles.
/// Every state-changing operation writes an audit event, and security-sensitive changes
/// revoke live sessions and cached authorization decisions before returning.
/// </summary>
public sealed class AdministratorManagementHandlers :
    IRequestHandler<CreateAdminCommand, AdminManagementDto>,
    IRequestHandler<UpdateAdminCommand, AdminManagementDto>,
    IRequestHandler<SetAdminStatusCommand, Unit>,
    IRequestHandler<ResetAdminPasswordCommand, Unit>,
    IRequestHandler<DeleteAdminCommand, Unit>,
    IRequestHandler<GetAdminsQuery, PagedResult<AdminManagementDto>>,
    IRequestHandler<GetAdminDetailsQuery, AdminManagementDto>,
    IRequestHandler<CreateRoleCommand, AdminRoleManagementDto>,
    IRequestHandler<GetRolesQuery, List<AdminRoleManagementDto>>,
    IRequestHandler<SetRoleActiveCommand, Unit>,
    IRequestHandler<DeleteRoleCommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IPasswordPolicy _passwordPolicy;
    private readonly ISessionService _sessionService;
    private readonly ICacheService _cache;
    private readonly ISecurityAuditWriter _audit;

    public AdministratorManagementHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IPasswordHasher passwordHasher,
        IPasswordPolicy passwordPolicy,
        ISessionService sessionService,
        ICacheService cache,
        ISecurityAuditWriter audit)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _passwordHasher = passwordHasher;
        _passwordPolicy = passwordPolicy;
        _sessionService = sessionService;
        _cache = cache;
        _audit = audit;
    }

    public async Task<AdminManagementDto> Handle(CreateAdminCommand request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var email = NormalizeEmail(request.Email);
        await EnsureEmailAvailableAsync(email, null, ct);
        _passwordPolicy.EnsureValid(request.Password);

        var role = await FindRoleAsync(request.RoleId, ct);
        await ValidateScopeAsync(role, request.ScopeUniversityId, request.ScopeCollegeId, request.ScopeYearId, request.ScopeSubjectId, ct);

        var admin = Admin.Create(email, _passwordHasher.HashPassword(request.Password), request.FullName.Trim(), role.Id);
        admin.UpdateDetails(email, request.FullName, request.Phone);
        admin.SetScope(request.ScopeUniversityId, request.ScopeCollegeId, request.ScopeYearId, request.ScopeSubjectId);
        await _db.Admins.AddAsync(admin, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            $"action=create_admin; target_admin_id={admin.Id}; target_role={role.Name}", ct: ct);

        return ToAdminDto(admin, role);
    }

    public async Task<AdminManagementDto> Handle(UpdateAdminCommand request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var target = await _db.Admins.Include(admin => admin.Role)
            .FirstOrDefaultAsync(admin => admin.Id == request.TargetAdminId, ct)
            ?? throw new NotFoundException("Admin", request.TargetAdminId);
        EnsureTargetIsNotSuperAdmin(target);

        var email = NormalizeEmail(request.Email);
        await EnsureEmailAvailableAsync(email, target.Id, ct);
        var role = await FindRoleAsync(request.RoleId, ct);
        await ValidateScopeAsync(role, request.ScopeUniversityId, request.ScopeCollegeId, request.ScopeYearId, request.ScopeSubjectId, ct);

        target.UpdateDetails(email, request.FullName, request.Phone);
        target.AssignRole(role.Id);
        target.SetScope(request.ScopeUniversityId, request.ScopeCollegeId, request.ScopeYearId, request.ScopeSubjectId);
        await _unitOfWork.SaveChangesAsync(ct);
        await InvalidateAccessAsync(target.Id, ct);
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            $"action=update_admin; target_admin_id={target.Id}; target_role={role.Name}", ct: ct);

        return ToAdminDto(target, role);
    }

    public async Task<Unit> Handle(SetAdminStatusCommand request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var target = await _db.Admins.Include(admin => admin.Role)
            .FirstOrDefaultAsync(admin => admin.Id == request.TargetAdminId, ct)
            ?? throw new NotFoundException("Admin", request.TargetAdminId);
        EnsureTargetIsNotSuperAdmin(target);

        target.SetStatus(request.IsActive ? AdminStatus.Active : AdminStatus.Disabled);
        await _unitOfWork.SaveChangesAsync(ct);
        if (!request.IsActive)
            await _sessionService.RevokeAllForUserAsync(target.Id, "admin_disabled", ct);
        await InvalidateAccessAsync(target.Id, ct);
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            $"action=set_admin_status; target_admin_id={target.Id}; active={request.IsActive.ToString().ToLowerInvariant()}", ct: ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(ResetAdminPasswordCommand request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var target = await _db.Admins.Include(admin => admin.Role)
            .FirstOrDefaultAsync(admin => admin.Id == request.TargetAdminId, ct)
            ?? throw new NotFoundException("Admin", request.TargetAdminId);
        EnsureTargetIsNotSuperAdmin(target);
        _passwordPolicy.EnsureValid(request.NewPassword);

        target.ChangePasswordHash(_passwordHasher.HashPassword(request.NewPassword));
        await _unitOfWork.SaveChangesAsync(ct);
        await _sessionService.RevokeAllForUserAsync(target.Id, "admin_password_reset", ct);
        await InvalidateAccessAsync(target.Id, ct);
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.PasswordChanged, SecuritySeverity.Warning,
            $"credential_reset=admin; target_admin_id={target.Id}", ct: ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(DeleteAdminCommand request, CancellationToken ct)
    {
        var actor = await RequireSuperAdminAsync(request.ActorAdminId, ct);
        if (!_passwordHasher.VerifyPassword(request.ActorPassword, actor.PasswordHash))
            throw new DomainException("كلمة مرور المدير العام غير صحيحة", "INVALID_CURRENT_PASSWORD");

        var target = await _db.Admins.Include(admin => admin.Role)
            .FirstOrDefaultAsync(admin => admin.Id == request.TargetAdminId, ct)
            ?? throw new NotFoundException("Admin", request.TargetAdminId);
        EnsureTargetIsNotSuperAdmin(target);

        await _sessionService.RevokeAllForUserAsync(target.Id, "admin_deleted", ct);
        _db.Admins.Remove(target);
        await _unitOfWork.SaveChangesAsync(ct);
        await InvalidateAccessAsync(target.Id, ct);
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Critical,
            $"action=delete_admin; target_admin_id={target.Id}", ct: ct);
        return Unit.Value;
    }

    public async Task<PagedResult<AdminManagementDto>> Handle(GetAdminsQuery request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 100);
        var query = _db.Admins.AsNoTracking().Include(admin => admin.Role).AsQueryable();
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLowerInvariant();
            query = query.Where(admin => admin.FullName.ToLower().Contains(search) ||
                admin.Email.ToLower().Contains(search) ||
                (admin.Phone != null && admin.Phone.Contains(search)));
        }
        if (request.RoleId.HasValue)
            query = query.Where(admin => admin.RoleId == request.RoleId.Value);
        if (request.IsActive.HasValue)
            query = query.Where(admin => (admin.Status == AdminStatus.Active) == request.IsActive.Value);

        var total = await query.CountAsync(ct);
        var admins = await query
            .OrderBy(admin => admin.Role.Name)
            .ThenBy(admin => admin.ScopeUniversityId)
            .ThenBy(admin => admin.ScopeCollegeId)
            .ThenBy(admin => admin.ScopeYearId)
            .ThenBy(admin => admin.ScopeSubjectId)
            .ThenBy(admin => admin.FullName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<AdminManagementDto>(
            admins.Select(admin => ToAdminDto(admin, admin.Role)).ToList(),
            total,
            page,
            pageSize,
            (int)Math.Ceiling(total / (double)pageSize));
    }

    public async Task<AdminManagementDto> Handle(GetAdminDetailsQuery request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var admin = await _db.Admins.AsNoTracking().Include(candidate => candidate.Role)
            .FirstOrDefaultAsync(candidate => candidate.Id == request.TargetAdminId, ct)
            ?? throw new NotFoundException("Admin", request.TargetAdminId);
        return ToAdminDto(admin, admin.Role);
    }

    public async Task<AdminRoleManagementDto> Handle(CreateRoleCommand request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var name = NormalizeRoleName(request.Name);
        if (await _db.AdminRoles.AnyAsync(role => role.Name == name, ct))
            throw new DomainException("اسم الدور مستخدم بالفعل", "ROLE_NAME_IN_USE");
        if (string.IsNullOrWhiteSpace(request.NameAr))
            throw new DomainException("الاسم العربي للدور مطلوب", "ROLE_NAME_AR_REQUIRED");

        var role = AdminRole.Create(name, request.NameAr.Trim(), string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim());
        await _db.AdminRoles.AddAsync(role, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.RoleChange, SecuritySeverity.Warning,
            $"action=create_role; target_role_id={role.Id}; target_role={role.Name}", ct: ct);
        return ToRoleDto(role, 0, 0);
    }

    public async Task<List<AdminRoleManagementDto>> Handle(GetRolesQuery request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        return await _db.AdminRoles.AsNoTracking()
            .OrderBy(role => role.IsSystem ? 0 : 1)
            .ThenBy(role => role.Name)
            .Select(role => new AdminRoleManagementDto(
                role.Id,
                role.Name,
                role.NameAr,
                role.Description,
                role.IsSystem,
                role.IsActive,
                role.Admins.Count,
                role.Permissions.Count,
                role.CreatedAt))
            .ToListAsync(ct);
    }

    public async Task<Unit> Handle(SetRoleActiveCommand request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var role = await _db.AdminRoles.FirstOrDefaultAsync(candidate => candidate.Id == request.RoleId, ct)
            ?? throw new NotFoundException("AdminRole", request.RoleId);
        if (role.Name == Roles.SuperAdmin && !request.IsActive)
            throw new DomainException("لا يمكن تعطيل دور المدير العام لتفادي فقدان الوصول", "SUPER_ADMIN_ROLE_LOCKOUT");

        role.SetActive(request.IsActive);
        var assignedIds = await _db.Admins.Where(admin => admin.RoleId == role.Id).Select(admin => admin.Id).ToListAsync(ct);
        await _unitOfWork.SaveChangesAsync(ct);
        if (!request.IsActive)
        {
            foreach (var adminId in assignedIds)
                await _sessionService.RevokeAllForUserAsync(adminId, "admin_role_disabled", ct);
        }
        foreach (var adminId in assignedIds)
            await InvalidateAccessAsync(adminId, ct);
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.RoleChange, SecuritySeverity.Warning,
            $"action=set_role_status; target_role_id={role.Id}; active={request.IsActive.ToString().ToLowerInvariant()}", ct: ct);
        return Unit.Value;
    }

    public async Task<Unit> Handle(DeleteRoleCommand request, CancellationToken ct)
    {
        await RequireSuperAdminAsync(request.ActorAdminId, ct);
        var role = await _db.AdminRoles.FirstOrDefaultAsync(candidate => candidate.Id == request.RoleId, ct)
            ?? throw new NotFoundException("AdminRole", request.RoleId);
        if (role.IsSystem)
            throw new DomainException("لا يمكن حذف دور نظامي", "SYSTEM_ROLE_DELETE_FORBIDDEN");
        if (await _db.Admins.AnyAsync(admin => admin.RoleId == role.Id, ct))
            throw new DomainException("انقل المدراء إلى دور آخر قبل حذف هذا الدور", "ROLE_HAS_ADMINS");

        _db.AdminRoles.Remove(role);
        await _unitOfWork.SaveChangesAsync(ct);
        await _audit.LogSecurityEventAsync(null, request.ActorAdminId, SecurityEventType.RoleChange, SecuritySeverity.Critical,
            $"action=delete_role; target_role_id={role.Id}; target_role={role.Name}", ct: ct);
        return Unit.Value;
    }

    private async Task<AdminEntity> RequireSuperAdminAsync(Guid actorAdminId, CancellationToken ct)
    {
        var actor = await _db.Admins.Include(admin => admin.Role)
            .FirstOrDefaultAsync(admin => admin.Id == actorAdminId, ct)
            ?? throw new ForbiddenException("لا تملك صلاحية المدير العام المطلوبة");
        if (actor.Status != AdminStatus.Active || !actor.Role.IsActive || actor.Role.Name != Roles.SuperAdmin)
            throw new ForbiddenException("لا تملك صلاحية المدير العام المطلوبة");
        return actor;
    }

    private async Task<AdminRole> FindRoleAsync(Guid roleId, CancellationToken ct)
    {
        var role = await _db.AdminRoles.FirstOrDefaultAsync(candidate => candidate.Id == roleId, ct)
            ?? throw new NotFoundException("AdminRole", roleId);
        if (!role.IsActive)
            throw new DomainException("لا يمكن تعيين دور معطّل", "ROLE_DISABLED");
        return role;
    }

    private async Task EnsureEmailAvailableAsync(string email, Guid? excludedAdminId, CancellationToken ct)
    {
        var inUse = await _db.Admins.AnyAsync(admin => admin.Email == email && (!excludedAdminId.HasValue || admin.Id != excludedAdminId.Value), ct);
        if (inUse)
            throw new DomainException("البريد الإلكتروني مستخدم بالفعل", "ADMIN_EMAIL_IN_USE");
    }

    private async Task ValidateScopeAsync(AdminRole role, Guid? universityId, Guid? collegeId, Guid? yearId, Guid? subjectId, CancellationToken ct)
    {
        if (role.Name == Roles.SuperAdmin)
        {
            if (universityId.HasValue || collegeId.HasValue || yearId.HasValue || subjectId.HasValue)
                throw new DomainException("دور المدير العام لا يقبل نطاقًا أكاديميًا", "SUPER_ADMIN_SCOPE_FORBIDDEN");
            return;
        }

        if (role.Name == Roles.UniversityAdmin && !universityId.HasValue ||
            role.Name == Roles.YearAdmin && !yearId.HasValue ||
            role.Name == Roles.SubjectAdmin && !subjectId.HasValue)
            throw new DomainException("النطاق الأكاديمي المطلوب للدور غير مكتمل", "ROLE_SCOPE_REQUIRED");

        if (universityId.HasValue && !await _db.Universities.AnyAsync(university => university.Id == universityId.Value && university.DeletedAt == null, ct) ||
            collegeId.HasValue && !await _db.Colleges.AnyAsync(college => college.Id == collegeId.Value && college.DeletedAt == null, ct) ||
            yearId.HasValue && !await _db.AcademicYears.AnyAsync(year => year.Id == yearId.Value && year.DeletedAt == null, ct) ||
            subjectId.HasValue && !await _db.Subjects.AnyAsync(subject => subject.Id == subjectId.Value && subject.DeletedAt == null, ct))
            throw new DomainException("أحد معرفات النطاق الأكاديمي غير صالح", "INVALID_ADMIN_SCOPE");

        var hierarchyMismatch =
            universityId.HasValue && collegeId.HasValue && !await _db.Colleges.AnyAsync(college =>
                college.Id == collegeId.Value && college.UniversityId == universityId.Value, ct) ||
            collegeId.HasValue && yearId.HasValue && !await _db.AcademicYears.AnyAsync(year =>
                year.Id == yearId.Value && year.CollegeId == collegeId.Value, ct) ||
            universityId.HasValue && yearId.HasValue && !await _db.AcademicYears.AnyAsync(year =>
                year.Id == yearId.Value && year.College.UniversityId == universityId.Value, ct) ||
            yearId.HasValue && subjectId.HasValue && !await _db.Subjects.AnyAsync(subject =>
                subject.Id == subjectId.Value && subject.Semester.AcademicYearId == yearId.Value, ct) ||
            collegeId.HasValue && subjectId.HasValue && !await _db.Subjects.AnyAsync(subject =>
                subject.Id == subjectId.Value && subject.Semester.AcademicYear.CollegeId == collegeId.Value, ct) ||
            universityId.HasValue && subjectId.HasValue && !await _db.Subjects.AnyAsync(subject =>
                subject.Id == subjectId.Value && subject.Semester.AcademicYear.College.UniversityId == universityId.Value, ct);
        if (hierarchyMismatch)
            throw new DomainException("النطاق الأكاديمي المحدد غير متسق", "INCONSISTENT_ADMIN_SCOPE");
    }

    private async Task InvalidateAccessAsync(Guid adminId, CancellationToken ct)
    {
        await _cache.RemoveByPatternAsync($"perm:{adminId}:*", ct);
        await _cache.RemoveAsync($"scope:{adminId}", ct);
    }

    private static void EnsureTargetIsNotSuperAdmin(AdminEntity target)
    {
        if (target.Role.Name == Roles.SuperAdmin)
            throw new DomainException("لا يمكن تعديل أو تعطيل أو حذف حساب المدير العام", "SUPER_ADMIN_PROTECTED");
    }

    private static string NormalizeEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@', StringComparison.Ordinal))
            throw new DomainException("البريد الإلكتروني غير صالح", "INVALID_ADMIN_EMAIL");
        return email.Trim().ToLowerInvariant();
    }

    private static string NormalizeRoleName(string name)
    {
        var normalized = name?.Trim().ToLowerInvariant() ?? string.Empty;
        if (normalized.Length is < 3 or > 50 || !normalized.All(character => char.IsLetterOrDigit(character) || character == '_'))
            throw new DomainException("اسم الدور يجب أن يتكون من أحرف أو أرقام أو شرطات سفلية", "INVALID_ROLE_NAME");
        if (normalized is Roles.SuperAdmin or Roles.UniversityAdmin or Roles.YearAdmin or Roles.SubjectAdmin)
            throw new DomainException("اسم الدور محجوز", "RESERVED_ROLE_NAME");
        return normalized;
    }

    private static AdminManagementDto ToAdminDto(AdminEntity admin, AdminRole role) => new(
        admin.Id,
        admin.FullName,
        admin.Email,
        admin.Phone,
        role.Id,
        role.Name,
        role.NameAr,
        admin.ScopeUniversityId,
        admin.ScopeCollegeId,
        admin.ScopeYearId,
        admin.ScopeSubjectId,
        admin.Status.ToString().ToLowerInvariant(),
        admin.LastLogin,
        admin.CreatedAt);

    private static AdminRoleManagementDto ToRoleDto(AdminRole role, int adminCount, int permissionCount) => new(
        role.Id,
        role.Name,
        role.NameAr,
        role.Description,
        role.IsSystem,
        role.IsActive,
        adminCount,
        permissionCount,
        role.CreatedAt);
}
