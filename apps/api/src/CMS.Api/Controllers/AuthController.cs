using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Microsoft.AspNetCore.RateLimiting;
using CMS.Application.Commands.Auth;
using CMS.Application.DTOs.Auth;
using CMS.Application.Interfaces;

namespace CMS.Api.Controllers;

/// <summary>
/// Authentication controller - handles login, register, OTP, password reset.
/// </summary>
[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly ISender _mediator;
    private readonly IStudentRepository _students;

    public AuthController(ISender mediator, IStudentRepository students)
    {
        _mediator = mediator;
        _students = students;
    }

    /// <summary>
    /// Register a new student account.
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(RegisterResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RegisterResponse>> Register(
        [FromBody] RegisterRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new RegisterCommand(
            request.Phone, request.Password, request.FullName,
            request.UniversityId, request.CollegeId, request.AcademicYearId,
            request.AcceptTerms, request.InstallationId
        ), ct);

        return CreatedAtAction(nameof(Register), result);
    }

    /// <summary>
    /// Verify OTP code to activate account.
    /// </summary>
    [HttpPost("verify-otp")]
    [EnableRateLimiting("otp")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AuthResponse>> VerifyOtp(
        [FromBody] VerifyOtpRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new VerifyOtpCommand(request.Phone, request.OtpCode, request.InstallationId), ct);
        return Ok(result);
    }

    /// <summary>
    /// Reissues an OTP for an unverified registration while preserving the active installation binding.
    /// </summary>
    [HttpPost("resend-otp")]
    [EnableRateLimiting("otp")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ResendOtp([FromBody] ResendOtpRequest request, CancellationToken ct)
    {
        await _mediator.Send(new ResendOtpCommand(request.Phone, request.InstallationId), ct);
        return NoContent();
    }

    /// <summary>
    /// Returns the authenticated student's canonical identity for application rehydration.
    /// </summary>
    [HttpGet("me")]
    [Authorize(Roles = "student")]
    [ProducesResponseType(typeof(UserDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<UserDto>> Me(CancellationToken ct)
    {
        var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subject, out var studentId)) return Unauthorized();

        var student = await _students.GetByIdAsync(studentId, ct);
        if (student is null) return Unauthorized();

        return Ok(new UserDto(student.Id, student.Phone, student.FullName, "student", student.AvatarUrl, null, null));
    }

    /// <summary>
    /// Login as student.
    /// </summary>
    [HttpPost("login")]
    [EnableRateLimiting("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<AuthResponse>> Login(
        [FromBody] LoginRequest request, CancellationToken ct)
    {
        var result = await _mediator.Send(new LoginCommand(
            request.Phone, request.Password,
            request.DeviceFingerprint, request.DeviceName
        ), ct);
        return Ok(result);
    }

    /// <summary>
    /// Refresh access token using refresh token.
    /// </summary>
    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(TokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<TokenResponse>> Refresh(
        [FromBody] RefreshTokenRequest request, CancellationToken ct)
    {
        var installationId = Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(installationId)) return Unauthorized();
        var result = await _mediator.Send(new RefreshTokenCommand(request.RefreshToken, installationId), ct);
        return Ok(result);
    }

    /// <summary>
    /// Logout - invalidate tokens.
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var sessionId = User.FindFirst("sid")?.Value;
        if (!Guid.TryParse(sessionId, out var parsedSessionId)) return Unauthorized();

        await _mediator.Send(new LogoutCommand(parsedSessionId), ct);
        return NoContent();
    }

    /// <summary>
    /// Request password reset OTP.
    /// </summary>
    [HttpPost("forgot-password")]
    [EnableRateLimiting("password-reset")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest request, CancellationToken ct)
    {
        await _mediator.Send(new ForgotPasswordCommand(request.Phone), ct);
        return NoContent();
    }

    /// <summary>
    /// Reset password using OTP.
    /// </summary>
    [HttpPost("reset-password")]
    [EnableRateLimiting("password-reset")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        await _mediator.Send(new ResetPasswordCommand(
            request.Phone, request.OtpCode, request.NewPassword
        ), ct);
        return NoContent();
    }

    /// <summary>
    /// Change password (requires authentication).
    /// </summary>
    [HttpPost("change-password")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirst("sub")?.Value;

        if (string.IsNullOrEmpty(userId))
            return Unauthorized();

        await _mediator.Send(new ChangePasswordCommand(
            Guid.Parse(userId), request.CurrentPassword, request.NewPassword
        ), ct);

        return NoContent();
    }
}
