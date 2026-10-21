using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CMS.Infrastructure.Persistence;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using System.Security.Claims;

namespace CMS.Api.Controllers;

/// <summary>
/// Admin student management controller — profile updates + avatar upload.
/// All endpoints require admin role + Students.Edit permission + scope check.
/// </summary>
[ApiController]
[Route("api/v1/admin/students")]
[Authorize(Roles = "admin,super_admin")]
public class AdminStudentsController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionService _permissions;
    private readonly IFileStorageService _storage;
    private readonly ISecurityAuditWriter _audit;

    // Avatar constraints
    private const long MaxAvatarBytes = 3 * 1024 * 1024; // 3MB
    private static readonly HashSet<string> AllowedAvatarTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp"
    };

    public AdminStudentsController(
        ApplicationDbContext db,
        IPermissionService permissions,
        IFileStorageService storage,
        ISecurityAuditWriter audit)
    {
        _db = db;
        _permissions = permissions;
        _storage = storage;
        _audit = audit;
    }

    private Guid GetAdminId()
    {
        var value = User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(value, out var adminId) ? adminId : throw new UnauthorizedAccessException();
    }

    /// <summary>
    /// Update a student's profile (full name + academic info).
    /// Requires Students.Edit permission + scope check (admin must be in scope of student).
    /// </summary>
    [HttpPut("{studentId:guid}")]
    public async Task<IActionResult> UpdateProfile(Guid studentId, [FromBody] UpdateStudentProfileRequest body, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Students, Actions.Edit, ct)
            || !await _permissions.IsInScopeAsync(adminId, "student", studentId, ct)) return Forbid();

        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == studentId, ct);
        if (student is null) return NotFound(new ProblemDetails
        {
            Title = "Student not found",
            Status = 404,
            Detail = $"No student with id '{studentId}'",
        });

        var previousName = student.FullName;
        // Use the domain method to keep invariants intact
        student.UpdateProfile(
            fullName: body.FullName ?? student.FullName,
            avatarUrl: student.AvatarUrl,  // avatar updated via dedicated endpoint
            gender: body.Gender ?? student.Gender);

        await _db.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            studentId: studentId,
            adminId: adminId,
            eventType: SecurityEventType.AdminAction,
            severity: SecuritySeverity.Info,
            description: $"Student profile updated (name: '{previousName}' → '{student.FullName}')",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            ct: ct);

        return Ok(new
        {
            id = student.Id,
            fullName = student.FullName,
            phone = student.Phone,
            avatarUrl = student.AvatarUrl,
            gender = student.Gender,
            updatedAt = student.UpdatedAt,
        });
    }

    /// <summary>
    /// Upload a student avatar image. Validates type + size, stores via IFileStorageService.
    /// Returns the new avatar URL (signed URL valid for the storage's default TTL).
    /// </summary>
    [HttpPost("{studentId:guid}/avatar")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxAvatarBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAvatarBytes)]
    public async Task<IActionResult> UploadAvatar(Guid studentId, [FromForm] IFormFile file, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Students, Actions.Edit, ct)
            || !await _permissions.IsInScopeAsync(adminId, "student", studentId, ct)) return Forbid();

        if (file is null || file.Length == 0)
            return BadRequest(new ProblemDetails { Title = "No file provided", Status = 400 });

        if (file.Length > MaxAvatarBytes)
            return BadRequest(new ProblemDetails
            {
                Title = "File too large",
                Status = 400,
                Detail = $"Avatar must be at most {MaxAvatarBytes / 1024 / 1024} MB",
            });

        var contentType = file.ContentType;
        if (!AllowedAvatarTypes.Contains(contentType))
            return BadRequest(new ProblemDetails
            {
                Title = "Invalid file type",
                Status = 400,
                Detail = $"Allowed types: {string.Join(", ", AllowedAvatarTypes)}",
            });

        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == studentId, ct);
        if (student is null) return NotFound();

        // Delete previous avatar if exists (best-effort — ignore failures)
        if (!string.IsNullOrEmpty(student.AvatarUrl))
        {
            try { await _storage.DeleteAsync(student.AvatarUrl, ct); }
            catch { /* best-effort cleanup */ }
        }

        // Upload new avatar with a unique key
        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrEmpty(ext)) ext = contentType switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => ".bin"
        };
        var avatarKey = $"avatars/students/{studentId}/{Guid.NewGuid():N}{ext}";

        string storedKey;
        await using (var stream = file.OpenReadStream())
        {
            storedKey = await _storage.UploadAsync(stream, avatarKey, contentType, ct);
        }

        // Update student.AvatarUrl (use UpdateProfile to keep invariants)
        student.UpdateProfile(fullName: student.FullName, avatarUrl: storedKey, gender: student.Gender);
        await _db.SaveChangesAsync(ct);

        // Get a signed URL for immediate preview
        var signedUrl = await _storage.GetSignedUrlAsync(storedKey, TimeSpan.FromHours(1));

        await _audit.LogSecurityEventAsync(
            studentId: studentId,
            adminId: adminId,
            eventType: SecurityEventType.AdminAction,
            severity: SecuritySeverity.Info,
            description: $"Student avatar uploaded ({contentType}, {file.Length} bytes)",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            ct: ct);

        return Ok(new
        {
            avatarUrl = storedKey,
            previewUrl = signedUrl,
            contentType,
            sizeBytes = file.Length,
        });
    }
}

/// <summary>Request body for PUT /admin/students/{id}.</summary>
public record UpdateStudentProfileRequest(
    string? FullName,
    string? Gender  // "male" | "female" | null to keep
);
