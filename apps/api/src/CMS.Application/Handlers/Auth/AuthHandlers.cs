using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;
using CMS.Application.Commands.Auth;
using CMS.Application.DTOs.Auth;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Auth;

internal static class OtpFeaturePolicy
{
    public static bool IsEnabled(IConfiguration configuration) =>
        bool.TryParse(configuration["Features:OtpEnabled"], out var enabled) && enabled;

    public static void EnsureEnabled(IConfiguration configuration)
    {
        if (!IsEnabled(configuration))
            throw new DomainException("ميزة OTP مؤجلة حالياً ولا يمكن استخدامها", "OTP_DEFERRED");
    }
}

/// <summary>
/// Handles student registration.
/// Creates account in "pending verification" state and sends OTP.
/// </summary>
public class RegisterCommandHandler : IRequestHandler<RegisterCommand, RegisterResponse>
{
    private readonly IStudentRepository _studentRepo;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ICacheService _cache;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPasswordPolicy _passwordPolicy;
    private readonly IConfiguration _configuration;

    public RegisterCommandHandler(
        IStudentRepository studentRepo,
        IPasswordHasher passwordHasher,
        ICacheService cache,
        IUnitOfWork unitOfWork,
        IPasswordPolicy passwordPolicy,
        IConfiguration configuration)
    {
        _studentRepo = studentRepo;
        _passwordHasher = passwordHasher;
        _cache = cache;
        _unitOfWork = unitOfWork;
        _passwordPolicy = passwordPolicy;
        _configuration = configuration;
    }

    public async Task<RegisterResponse> Handle(RegisterCommand request, CancellationToken ct)
    {
        var normalizedPhone = NormalizePhone(request.Phone);

        if (await _studentRepo.PhoneExistsAsync(normalizedPhone, ct))
            throw new ConflictException("هذا الرقم مسجّل مسبقاً. سجّل الدخول");

        _passwordPolicy.EnsureValid(request.Password);
        var passwordHash = _passwordHasher.HashPassword(request.Password);
        var student = Student.Create(request.Phone, passwordHash, request.FullName);
        student.SetAcademicInfo(request.UniversityId, request.CollegeId, request.AcademicYearId);

        await _studentRepo.AddAsync(student, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        if (!OtpFeaturePolicy.IsEnabled(_configuration))
        {
            student.VerifyPhone();
            await _studentRepo.UpdateAsync(student, ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return new RegisterResponse(student.Id, request.Phone, false, 0);
        }

        // Generate + cache OTP only when the deferred feature is explicitly enabled.
        var otp = RandomNumberGenerator.GetInt32(100_000, 1_000_000).ToString();
        student.SetOtp(otp, expiryMinutes: 5);
        await _studentRepo.UpdateAsync(student, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        await _cache.SetAsync($"otp:{normalizedPhone}", otp, TimeSpan.FromMinutes(5), ct);
        await _cache.SetAsync($"otp-installation:{normalizedPhone}", request.InstallationId, TimeSpan.FromMinutes(5), ct);

        // TODO: Send OTP via WhatsApp API

        return new RegisterResponse(student.Id, request.Phone, true, 60);
    }

    private static string NormalizePhone(string phone) =>
        phone.StartsWith("09") ? "+963" + phone[1..] :
        phone.StartsWith("9") ? "+963" + phone : phone;
}

/// <summary>
/// Handles OTP verification - activates account and returns JWT.
/// </summary>
public class VerifyOtpCommandHandler : IRequestHandler<VerifyOtpCommand, AuthResponse>
{
    private readonly IStudentRepository _studentRepo;
    private readonly ICacheService _cache;
    private readonly ISessionService _sessionService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IConfiguration _configuration;

    public VerifyOtpCommandHandler(
        IStudentRepository studentRepo,
        ICacheService cache,
        ISessionService sessionService,
        IUnitOfWork unitOfWork,
        IConfiguration configuration)
    {
        _studentRepo = studentRepo;
        _cache = cache;
        _sessionService = sessionService;
        _unitOfWork = unitOfWork;
        _configuration = configuration;
    }

    public async Task<AuthResponse> Handle(VerifyOtpCommand request, CancellationToken ct)
    {
        OtpFeaturePolicy.EnsureEnabled(_configuration);
        var normalizedPhone = NormalizePhone(request.Phone);
        var cachedOtp = await _cache.GetAsync<string>($"otp:{normalizedPhone}", ct);

        if (string.IsNullOrEmpty(cachedOtp))
            throw new DomainException("انتهت صلاحية الرمز. اطلب رمزاً جديداً", "OTP_EXPIRED");

        var expectedInstallationId = await _cache.GetAsync<string>($"otp-installation:{normalizedPhone}", ct);
        if (string.IsNullOrEmpty(expectedInstallationId)
            || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expectedInstallationId),
                Encoding.UTF8.GetBytes(request.InstallationId)))
            throw new DomainException("رمز التحقق غير مرتبط بهذا التثبيت", "OTP_INSTALLATION_MISMATCH");

        if (cachedOtp != request.OtpCode)
            throw new DomainException("رمز التحقق غير صحيح", "OTP_INVALID");

        var consumedOtp = await _cache.GetAndRemoveAsync<string>($"otp:{normalizedPhone}", ct);
        if (consumedOtp != request.OtpCode)
            throw new DomainException("انتهت صلاحية الرمز. اطلب رمزاً جديداً", "OTP_EXPIRED");

        var student = await _studentRepo.GetByPhoneAsync(normalizedPhone, ct)
            ?? throw new NotFoundException("Student", normalizedPhone);

        student.VerifyPhone();
        student.RecordLogin();
        await _studentRepo.UpdateAsync(student, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        await _cache.RemoveAsync($"otp-installation:{normalizedPhone}", ct);

        var tokens = await _sessionService.CreateAsync(
            student.Id, student.Phone, "student", request.InstallationId, null, ct);

        return new AuthResponse(tokens.AccessToken, tokens.RefreshToken, "Bearer", 600, MapToUserDto(student));
    }

    private static string NormalizePhone(string phone) =>
        phone.StartsWith("09") ? "+963" + phone[1..] :
        phone.StartsWith("9") ? "+963" + phone : phone;

    private static UserDto MapToUserDto(Student s) => new(s.Id, s.Phone, s.FullName, "student", s.AvatarUrl, null, null);
}

/// <summary>
/// Reissues a pending verification OTP only for the installation that initiated the active verification flow.
/// </summary>
public class ResendOtpCommandHandler : IRequestHandler<ResendOtpCommand, Unit>
{
    private readonly IStudentRepository _studentRepo;
    private readonly ICacheService _cache;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IConfiguration _configuration;

    public ResendOtpCommandHandler(IStudentRepository studentRepo, ICacheService cache, IUnitOfWork unitOfWork, IConfiguration configuration)
    {
        _studentRepo = studentRepo;
        _cache = cache;
        _unitOfWork = unitOfWork;
        _configuration = configuration;
    }

    public async Task<Unit> Handle(ResendOtpCommand request, CancellationToken ct)
    {
        OtpFeaturePolicy.EnsureEnabled(_configuration);
        var normalizedPhone = NormalizePhone(request.Phone);
        var student = await _studentRepo.GetByPhoneAsync(normalizedPhone, ct)
            ?? throw new NotFoundException("Student", normalizedPhone);
        if (student.PhoneVerifiedAt is not null)
            throw new DomainException("الحساب مفعل بالفعل", "OTP_NOT_REQUIRED");

        var activeInstallationId = await _cache.GetAsync<string>($"otp-installation:{normalizedPhone}", ct);
        if (!string.IsNullOrEmpty(activeInstallationId)
            && !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(activeInstallationId),
                Encoding.UTF8.GetBytes(request.InstallationId)))
            throw new DomainException("رمز التحقق غير مرتبط بهذا التثبيت", "OTP_INSTALLATION_MISMATCH");

        var otp = RandomNumberGenerator.GetInt32(100_000, 1_000_000).ToString();
        student.SetOtp(otp, expiryMinutes: 5);
        await _studentRepo.UpdateAsync(student, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await _cache.SetAsync($"otp:{normalizedPhone}", otp, TimeSpan.FromMinutes(5), ct);
        await _cache.SetAsync($"otp-installation:{normalizedPhone}", request.InstallationId, TimeSpan.FromMinutes(5), ct);
        return Unit.Value;
    }

    private static string NormalizePhone(string phone) =>
        phone.StartsWith("09") ? "+963" + phone[1..] :
        phone.StartsWith("9") ? "+963" + phone : phone;
}

/// <summary>
/// Handles student login with device binding check.
/// </summary>
public class LoginCommandHandler : IRequestHandler<LoginCommand, AuthResponse>
{
    private readonly IStudentRepository _studentRepo;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ISessionService _sessionService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IConfiguration _configuration;
    private readonly ISecurityAuditWriter _audit;

    public LoginCommandHandler(
        IStudentRepository studentRepo,
        IPasswordHasher passwordHasher,
        ISessionService sessionService,
        IUnitOfWork unitOfWork,
        IConfiguration configuration,
        ISecurityAuditWriter audit)
    {
        _studentRepo = studentRepo;
        _passwordHasher = passwordHasher;
        _sessionService = sessionService;
        _unitOfWork = unitOfWork;
        _configuration = configuration;
        _audit = audit;
    }

    public async Task<AuthResponse> Handle(LoginCommand request, CancellationToken ct)
    {
        var normalizedPhone = NormalizePhone(request.Phone);
        var student = await _studentRepo.GetByPhoneAsync(normalizedPhone, ct);
        if (student is null)
        {
            await _audit.LogSecurityEventAsync(null, null, SecurityEventType.LoginFailed, SecuritySeverity.Warning, "Login failed: invalid credentials", ct: ct);
            throw new DomainException("رقم الهاتف أو كلمة المرور غير صحيحة", "AUTH_INVALID_CREDENTIALS");
        }

        if (student.IsLockedOut())
            throw new DomainException("تم تعليق محاولات الدخول مؤقتاً. حاول لاحقاً", "AUTH_TEMPORARILY_LOCKED");

        if (!_passwordHasher.VerifyPassword(request.Password, student.PasswordHash))
        {
            student.RegisterFailedLogin(MaximumLoginAttempts, LockoutMinutes);
            await _studentRepo.UpdateAsync(student, ct);
            await _unitOfWork.SaveChangesAsync(ct);
            await _audit.LogSecurityEventAsync(student.Id, null, SecurityEventType.LoginFailed, SecuritySeverity.Warning, "Login failed: invalid credentials", ct: ct);
            throw new DomainException("رقم الهاتف أو كلمة المرور غير صحيحة", "AUTH_INVALID_CREDENTIALS");
        }

        if (student.IsBanned())
        {
            var until = student.BanUntil.HasValue ? $" حتى {student.BanUntil:yyyy-MM-dd HH:mm}" : "";
            throw new ForbiddenException($"حسابك محظور{until}. السبب: {student.BanReason}");
        }

        if (student.PhoneVerifiedAt == null)
            throw new DomainException("لم يتم تفعيل رقم الهاتف. يرجى التحقق من OTP", "PHONE_NOT_VERIFIED");

        if (_passwordHasher.NeedsRehash(student.PasswordHash))
            student.ChangePasswordHash(_passwordHasher.HashPassword(request.Password));
        student.ClearLoginFailures();
        student.RecordLogin();
        student.RecordActivity();
        await _studentRepo.UpdateAsync(student, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        var tokens = await _sessionService.CreateAsync(
            student.Id, student.Phone, "student", request.DeviceFingerprint, request.DeviceName, ct);

        return new AuthResponse(tokens.AccessToken, tokens.RefreshToken, "Bearer", 600, MapToUserDto(student));
    }

    private int MaximumLoginAttempts => int.TryParse(_configuration["Security:Login:MaxFailedAttempts"], out var value)
        ? Math.Clamp(value, 3, 10) : 5;

    private int LockoutMinutes => int.TryParse(_configuration["Security:Login:LockoutMinutes"], out var value)
        ? Math.Clamp(value, 1, 60) : 15;

    private static string NormalizePhone(string phone) =>
        phone.StartsWith("09") ? "+963" + phone[1..] :
        phone.StartsWith("9") ? "+963" + phone : phone;

    private static UserDto MapToUserDto(Student s) => new(s.Id, s.Phone, s.FullName, "student", s.AvatarUrl, null, null);
}

/// <summary>
/// Handles token refresh.
/// </summary>
public class RefreshTokenCommandHandler : IRequestHandler<RefreshTokenCommand, TokenResponse>
{
    private readonly ISessionService _sessionService;

    public RefreshTokenCommandHandler(ISessionService sessionService) => _sessionService = sessionService;

    public async Task<TokenResponse> Handle(RefreshTokenCommand request, CancellationToken ct)
    {
        var tokens = await _sessionService.RotateAsync(request.RefreshToken, request.InstallationId, ct);
        if (tokens is null)
            throw new UnauthorizedAccessException("رمز التحديث غير صالح أو منتهٍ أو أُعيد استخدامه");

        return new TokenResponse(tokens.AccessToken, tokens.RefreshToken, "Bearer", 600);
    }
}

/// <summary>
/// Handles logout - blacklists tokens.
/// </summary>
public class LogoutCommandHandler : IRequestHandler<LogoutCommand, Unit>
{
    private readonly ISessionService _sessionService;

    public LogoutCommandHandler(ISessionService sessionService) => _sessionService = sessionService;

    public async Task<Unit> Handle(LogoutCommand request, CancellationToken ct)
    {
        await _sessionService.RevokeAsync(request.SessionId, "logout", ct);
        return Unit.Value;
    }
}

/// <summary>
/// Handles forgot password - sends OTP for reset.
/// </summary>
public class ForgotPasswordCommandHandler : IRequestHandler<ForgotPasswordCommand, Unit>
{
    private readonly IStudentRepository _studentRepo;
    private readonly ICacheService _cache;
    private readonly IConfiguration _configuration;
    private readonly ISecurityAuditWriter _audit;

    public ForgotPasswordCommandHandler(IStudentRepository studentRepo, ICacheService cache, IConfiguration configuration, ISecurityAuditWriter audit)
    {
        _studentRepo = studentRepo;
        _cache = cache;
        _configuration = configuration;
        _audit = audit;
    }

    public async Task<Unit> Handle(ForgotPasswordCommand request, CancellationToken ct)
    {
        OtpFeaturePolicy.EnsureEnabled(_configuration);
        var normalizedPhone = NormalizePhone(request.Phone);
        var student = await _studentRepo.GetByPhoneAsync(normalizedPhone, ct);

        // Don't reveal if phone exists (security)
        if (student != null)
        {
            var otp = RandomNumberGenerator.GetInt32(100_000, 1_000_000).ToString();
            student.SetOtp(otp, expiryMinutes: 10);
            await _studentRepo.UpdateAsync(student, ct);

            await _cache.SetAsync($"reset:{normalizedPhone}", otp, TimeSpan.FromMinutes(10), ct);
            await _audit.LogSecurityEventAsync(student.Id, null, SecurityEventType.PasswordResetRequested, SecuritySeverity.Info, "credential_reset=requested", ct: ct);
            // TODO: Send OTP via WhatsApp
        }

        return Unit.Value;
    }

    private static string NormalizePhone(string phone) =>
        phone.StartsWith("09") ? "+963" + phone[1..] :
        phone.StartsWith("9") ? "+963" + phone : phone;
}

/// <summary>
/// Handles password reset with OTP.
/// </summary>
public class ResetPasswordCommandHandler : IRequestHandler<ResetPasswordCommand, Unit>
{
    private readonly IStudentRepository _studentRepo;
    private readonly ICacheService _cache;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ISessionService _sessionService;
    private readonly IPasswordPolicy _passwordPolicy;
    private readonly IConfiguration _configuration;
    private readonly ISecurityAuditWriter _audit;

    public ResetPasswordCommandHandler(
        IStudentRepository studentRepo,
        ICacheService cache,
        IPasswordHasher passwordHasher,
        ISessionService sessionService,
        IPasswordPolicy passwordPolicy,
        IConfiguration configuration,
        ISecurityAuditWriter audit)
    {
        _studentRepo = studentRepo;
        _cache = cache;
        _passwordHasher = passwordHasher;
        _sessionService = sessionService;
        _passwordPolicy = passwordPolicy;
        _configuration = configuration;
        _audit = audit;
    }

    public async Task<Unit> Handle(ResetPasswordCommand request, CancellationToken ct)
    {
        OtpFeaturePolicy.EnsureEnabled(_configuration);
        var normalizedPhone = NormalizePhone(request.Phone);
        var cachedOtp = await _cache.GetAsync<string>($"reset:{normalizedPhone}", ct);

        if (string.IsNullOrEmpty(cachedOtp) || cachedOtp != request.OtpCode)
            throw new DomainException("رمز التحقق غير صحيح أو منتهي الصلاحية", "OTP_INVALID");

        var consumedOtp = await _cache.GetAndRemoveAsync<string>($"reset:{normalizedPhone}", ct);
        if (consumedOtp != request.OtpCode)
            throw new DomainException("رمز التحقق غير صحيح أو منتهي الصلاحية", "OTP_INVALID");

        var student = await _studentRepo.GetByPhoneAsync(normalizedPhone, ct)
            ?? throw new NotFoundException("Student", normalizedPhone);

        _passwordPolicy.EnsureValid(request.NewPassword);
        var newHash = _passwordHasher.HashPassword(request.NewPassword);
        student.ChangePasswordHash(newHash);

        await _studentRepo.UpdateAsync(student, ct);
        await _sessionService.RevokeAllForUserAsync(student.Id, "password_reset", ct);
        await _audit.LogSecurityEventAsync(student.Id, null, SecurityEventType.PasswordChanged, SecuritySeverity.Warning, "credential_reset=completed", ct: ct);

        return Unit.Value;
    }

    private static string NormalizePhone(string phone) =>
        phone.StartsWith("09") ? "+963" + phone[1..] :
        phone.StartsWith("9") ? "+963" + phone : phone;
}

/// <summary>
/// Handles password change for authenticated user.
/// </summary>
public class ChangePasswordCommandHandler : IRequestHandler<ChangePasswordCommand, Unit>
{
    private readonly IStudentRepository _studentRepo;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ISessionService _sessionService;
    private readonly IPasswordPolicy _passwordPolicy;
    private readonly ISecurityAuditWriter _audit;

    public ChangePasswordCommandHandler(IStudentRepository studentRepo, IPasswordHasher passwordHasher, ISessionService sessionService, IPasswordPolicy passwordPolicy, ISecurityAuditWriter audit)
    {
        _studentRepo = studentRepo;
        _passwordHasher = passwordHasher;
        _sessionService = sessionService;
        _passwordPolicy = passwordPolicy;
        _audit = audit;
    }

    public async Task<Unit> Handle(ChangePasswordCommand request, CancellationToken ct)
    {
        var student = await _studentRepo.GetByIdAsync(request.UserId, ct)
            ?? throw new NotFoundException("Student", request.UserId);

        if (!_passwordHasher.VerifyPassword(request.CurrentPassword, student.PasswordHash))
            throw new DomainException("كلمة المرور الحالية غير صحيحة", "INVALID_CURRENT_PASSWORD");

        _passwordPolicy.EnsureValid(request.NewPassword);
        var newHash = _passwordHasher.HashPassword(request.NewPassword);
        student.ChangePasswordHash(newHash);

        await _studentRepo.UpdateAsync(student, ct);
        await _sessionService.RevokeAllForUserAsync(student.Id, "password_change", ct);
        await _audit.LogSecurityEventAsync(student.Id, null, SecurityEventType.PasswordChanged, SecuritySeverity.Warning, "credential_change=completed", ct: ct);
        return Unit.Value;
    }
}
