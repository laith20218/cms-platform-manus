using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CMS.Application.Commands.Offline;
using CMS.Application.DTOs.Offline;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.RateLimiting;

namespace CMS.Api.Controllers;

/// <summary>
/// Offline controller - manages offline content packages and sync.
/// Students can download question packages, solve offline, then sync when online.
/// </summary>
[ApiController]
[Route("api/v1/offline")]
[Authorize]
[EnableRateLimiting("offline-package")]
public class OfflineController : ControllerBase
{
    private readonly MediatR.ISender _mediator;
    private readonly ISignedEntitlementService _signedEntitlements;
    public OfflineController(MediatR.ISender mediator, ISignedEntitlementService signedEntitlements)
    {
        _mediator = mediator;
        _signedEntitlements = signedEntitlements;
    }

    private Guid GetStudentId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id :
        throw new UnauthorizedAccessException();

    /// <summary>
    /// Download a package of questions for offline use.
    /// Package includes questions + options but NOT correct answers.
    /// Correct answers are stored server-side and verified on sync.
    /// </summary>
    [HttpPost("download")]
    public async Task<IActionResult> DownloadPackage(
        [FromBody] DownloadPackageRequestDto request, CancellationToken ct)
    {
        var studentId = GetStudentId();
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        var idempotencyKey = Request.Headers["X-Idempotency-Key"].FirstOrDefault();
        var offlinePackagePublicKeySpki = Request.Headers["X-Offline-Package-Public-Key"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(installationId) || string.IsNullOrWhiteSpace(idempotencyKey)) return BadRequest("X-Installation-Id and X-Idempotency-Key are required");
        var rejection = await RequireEntitlementAsync(studentId, request.SubjectId, ct);
        if (rejection is not null) return rejection;
        var result = await _mediator.Send(new DownloadOfflinePackageCommand(
            studentId, request.SubjectId, request.ExamId, idempotencyKey, installationId, offlinePackagePublicKeySpki
        ), ct);
        return Ok(result);
    }

    private async Task<IActionResult?> RequireEntitlementAsync(Guid studentId, Guid subjectId, CancellationToken ct)
    {
        var token = Request.Headers["X-Entitlement"].FirstOrDefault();
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(installationId)) return Unauthorized();
        var validation = await _signedEntitlements.ValidateAsync(token, studentId, installationId, subjectId, ct);
        return validation.IsValid ? null : Forbid();
    }

    /// <summary>
    /// Sync offline answers when back online.
    /// Server verifies each answer and records attempt logs.
    /// </summary>
    [HttpPost("sync")]
    public async Task<ActionResult<SyncResultDto>> SyncAnswers(
    [FromBody] SyncOfflineAnswersDto request, CancellationToken ct)
    {
        var result = await _mediator.Send(new SyncOfflineAnswersCommand(
            GetStudentId(), request.PackageId, request.ExamSessionId, request.Answers
        ), ct);
        return Ok(result);
    }

    /// <summary>
    /// Get list of downloaded offline packages.
    /// </summary>
    [HttpGet("packages")]
    public async Task<ActionResult<List<OfflinePackageListItemDto>>> GetPackages(CancellationToken ct)
    {
        var result = await _mediator.Send(new GetOfflinePackagesQuery(GetStudentId()), ct);
        return Ok(result);
    }

    /// <summary>Get minimal ownership- and installation-bound package status for revocation confirmation.</summary>
    [HttpGet("packages/{packageId:guid}/status")]
    public async Task<ActionResult<OfflinePackageStatusDto>> GetPackageStatus(Guid packageId, CancellationToken ct)
    {
        var installationId = Request.Headers["X-Installation-Id"].FirstOrDefault()
            ?? Request.Headers["X-Device-Fingerprint"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(installationId)) return BadRequest("X-Installation-Id is required");
        var result = await _mediator.Send(new GetOfflinePackageStatusQuery(GetStudentId(), packageId, installationId), ct);
        return Ok(result);
    }

    /// <summary>
    /// Delete/invalidate an offline package.
    /// </summary>
    [HttpDelete("packages/{packageId:guid}")]
    public async Task<IActionResult> DeletePackage(Guid packageId, CancellationToken ct)
    {
        await _mediator.Send(new DeleteOfflinePackageCommand(GetStudentId(), packageId), ct);
        return NoContent();
    }
}

/// <summary>
/// Request DTO for downloading an offline package.
/// </summary>
public record DownloadPackageRequestDto(
    Guid SubjectId,
    Guid? ExamId
);
