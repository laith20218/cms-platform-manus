namespace CMS.Application.DTOs.Auth;

/// <summary>
/// Request DTOs for authentication.
/// </summary>
public record RegisterRequest(
    string Phone,
    string Password,
    string FullName,
    Guid UniversityId,
    Guid CollegeId,
    Guid AcademicYearId,
    bool AcceptTerms,
    string InstallationId
);

public record VerifyOtpRequest(
    string Phone,
    string OtpCode,
    string InstallationId
);

public record ResendOtpRequest(
    string Phone,
    string InstallationId
);

public record LoginRequest(
    string Phone,
    string Password,
    string DeviceFingerprint,
    string? DeviceName
);

public record AdminLoginRequest(
    string Email,
    string Password,
    string? TwoFactorCode,
    string? InstallationId = null
);

public record RefreshTokenRequest(
    string RefreshToken
);

public record ForgotPasswordRequest(
    string Phone
);

public record ResetPasswordRequest(
    string Phone,
    string OtpCode,
    string NewPassword
);

public record ChangePasswordRequest(
    string CurrentPassword,
    string NewPassword
);

/// <summary>
/// Response DTOs for authentication.
/// </summary>
public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    string TokenType,
    int ExpiresIn,
    UserDto User,
    // PR-6 (Student Center): true when an admin force-reset the password and the student
    // must change it at next login. Optional so existing constructions (admin login, OTP
    // verify) keep compiling and default to false.
    bool MustChangePassword = false
);

public record RegisterResponse(
    Guid StudentId,
    string Phone,
    bool OtpRequired,
    int OtpExpiresIn
);

public record UserDto(
    Guid Id,
    string Phone,
    string FullName,
    string Role,
    string? AvatarUrl,
    UniversityDto? University,
    CollegeDto? College
);

public record UniversityDto(Guid Id, string NameAr);
public record CollegeDto(Guid Id, string NameAr);

public record TokenResponse(
    string AccessToken,
    string RefreshToken,
    string TokenType,
    int ExpiresIn
);

/// <summary>
/// Owner decision (offline-experience implementation, 2026-11-28) — native
/// session exchange. The Android shell's Kotlin layer exchanges a SHORT-LIVED
/// web access token (JWT, ≤10 min) for a native session bound to the same
/// student + installation. The response deliberately carries NO refresh token:
/// the native session renews by re-running the exchange with a fresh web
/// access token, so a long-lived web credential never persists inside Kotlin
/// and never crosses the JavaScript bridge in the other direction.
/// </summary>
public record NativeSessionExchangeRequest(string WebAccessToken);

/// <summary>Short-lived, access-only native session (no refresh token).</summary>
public record NativeSessionResponse(
    string AccessToken,
    string TokenType,
    int ExpiresIn,
    Guid StudentId
);
