using MediatR;
using CMS.Application.DTOs.Auth;

namespace CMS.Application.Commands.Auth;

// ===== Register =====
public record RegisterCommand(
    string Phone,
    string Password,
    string FullName,
    Guid UniversityId,
    Guid CollegeId,
    Guid AcademicYearId,
    bool AcceptTerms,
    string InstallationId
) : IRequest<RegisterResponse>;

// ===== Verify OTP =====
public record VerifyOtpCommand(
    string Phone,
    string OtpCode,
    string InstallationId
) : IRequest<AuthResponse>;

// ===== Resend OTP =====
public record ResendOtpCommand(
    string Phone,
    string InstallationId
) : IRequest<Unit>;

// ===== Login (Student) =====
public record LoginCommand(
    string Phone,
    string Password,
    string DeviceFingerprint,
    string? DeviceName
) : IRequest<AuthResponse>;

// ===== Login (Admin) =====
public record AdminLoginCommand(
    string Email,
    string Password,
    string? TwoFactorCode,
    string? InstallationId = null
) : IRequest<AuthResponse>;

// ===== Refresh Token =====
public record RefreshTokenCommand(
    string RefreshToken,
    string InstallationId
) : IRequest<TokenResponse>;

// ===== Logout =====
public record LogoutCommand(
    Guid SessionId
) : IRequest<Unit>;

// ===== Forgot Password =====
public record ForgotPasswordCommand(
    string Phone
) : IRequest<Unit>;

// ===== Reset Password =====
public record ResetPasswordCommand(
    string Phone,
    string OtpCode,
    string NewPassword
) : IRequest<Unit>;

// ===== Change Password =====
public record ChangePasswordCommand(
    Guid UserId,
    string CurrentPassword,
    string NewPassword
) : IRequest<Unit>;

// ===== Native Session Exchange (Owner decision 2026-11-28) =====
/// <summary>
/// Exchanges a short-lived WEB access token (JWT) for a native session bound to
/// the same student + installation. The web token is VALIDATED server-side
/// (signature, issuer, audience, lifetime) and never stored; the issued native
/// session is access-only (no refresh token) and renews by re-running the
/// exchange. Requires an active device binding for the student role — same
/// rule as a normal login.
/// </summary>
public record NativeSessionExchangeCommand(
    string WebAccessToken,
    string InstallationId,
    string? DeviceName
) : IRequest<NativeSessionResponse>;
