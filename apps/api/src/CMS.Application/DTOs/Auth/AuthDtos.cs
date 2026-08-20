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
    UserDto User
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
