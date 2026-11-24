using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace CMS.Api.Controllers;

/// <summary>
/// Wave 4 (Owner decision 2026-11-23): additive admin visibility + revocation over the
/// durable offline package ledger (OfflinePackageRecord). Read-only over lifecycle
/// fields — no envelope ciphertext, wrapped keys, key-release tokens, or answers are
/// ever returned to the admin surface. Revocation mirrors the student self-service
/// path exactly (status flip + RevokedAt + issued-metadata cache eviction + audit)
/// and is SuperAdmin-gated.
/// </summary>
[ApiController]
[Route("api/v1/admin/offline")]
[Authorize(Policy = "SuperAdmin")]
public class AdminOfflineController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ICacheService _cache;
    private readonly ISecurityAuditWriter _audit;

    public AdminOfflineController(IApplicationDbContext db, IUnitOfWork unitOfWork, ICacheService cache, ISecurityAuditWriter audit)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _cache = cache;
        _audit = audit;
    }

    private Guid? GetAdminId() => Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    /// <summary>
    /// Latest offline package records (default 100, newest first), optionally filtered
    /// by student. Status values mirror the ledger: active / revoked (expired is
    /// derivable client-side from ExpiresAt).
    /// </summary>
    [HttpGet("packages")]
    public async Task<IActionResult> ListPackages([FromQuery] Guid? studentId, [FromQuery] int pageSize = 100, CancellationToken ct = default)
    {
        var capped = Math.Clamp(pageSize, 1, 200);
        var query = _db.OfflinePackageRecords.AsNoTracking();
        if (studentId.HasValue) query = query.Where(record => record.StudentId == studentId.Value);
        var rows = await query
            .OrderByDescending(record => record.CreatedAt)
            .Take(capped)
            .Select(record => new AdminOfflinePackageDto(
                record.Id,
                record.StudentId,
                record.Student.FullName,
                record.InstallationId,
                record.ContentVersion,
                record.Status,
                record.IssuedAt,
                record.ExpiresAt,
                record.RevokedAt,
                record.CreatedAt
            ))
            .ToListAsync(ct);
        return Ok(rows);
    }

    /// <summary>Get minimal lifecycle detail for one package (visibility + revoke target check).</summary>
    [HttpGet("packages/{packageId:guid}")]
    public async Task<IActionResult> GetPackage(Guid packageId, CancellationToken ct)
    {
        var record = await _db.OfflinePackageRecords.AsNoTracking()
            .Where(r => r.Id == packageId)
            .Select(r => new AdminOfflinePackageDto(
                r.Id, r.StudentId, r.Student.FullName, r.InstallationId, r.ContentVersion,
                r.Status, r.IssuedAt, r.ExpiresAt, r.RevokedAt, r.CreatedAt))
            .FirstOrDefaultAsync(ct);
        return record is null ? NotFound() : Ok(record);
    }

    /// <summary>
    /// Revokes one package: the next online contact (openOnline / sync) refuses it and
    /// the local envelope is invalidated; offline-continuation stops honoring it once
    /// its issued-metadata cache entry is evicted (fail closed). Idempotent on
    /// already-revoked packages.
    /// </summary>
    [HttpPost("packages/{packageId:guid}/revoke")]
    public async Task<IActionResult> RevokePackage(Guid packageId, CancellationToken ct)
    {
        var package = await _db.OfflinePackageRecords.FirstOrDefaultAsync(r => r.Id == packageId, ct);
        if (package is null) return NotFound();
        var adminId = GetAdminId();
        if (!package.RevokedAt.HasValue)
        {
            package.Status = "revoked";
            package.RevokedAt = DateTime.UtcNow;
            await _unitOfWork.SaveChangesAsync(ct);
            await _cache.RemoveAsync($"offline:{packageId}", ct);
            await _cache.RemoveAsync($"offline:{packageId}:answers", ct);
            await _audit.LogSecurityEventAsync(
                package.StudentId,
                adminId,
                SecurityEventType.OfflinePackageRevoked,
                SecuritySeverity.Warning,
                $"Offline package revoked by admin {adminId}",
                ct: ct);
        }
        return Ok(new { packageId, package.Status, package.RevokedAt });
    }
}

/// <summary>Lifecycle-only row for the admin surface — deliberately excludes envelope material.</summary>
public record AdminOfflinePackageDto(
    Guid PackageId,
    Guid StudentId,
    string StudentName,
    string InstallationId,
    int ContentVersion,
    string Status,
    DateTime IssuedAt,
    DateTime ExpiresAt,
    DateTime? RevokedAt,
    DateTime CreatedAt);
