using System.Security.Claims;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CMS.Api.Controllers;

[ApiController]
[Route("api/v1/profile")]
[Authorize(Roles = "student")]
public sealed class StudentProfileController : ControllerBase
{
    private readonly IApplicationDbContext _db;
    private readonly IFileStorageService _storage;

    private const long MaxAvatarBytes = 3 * 1024 * 1024; // 3MB
    private static readonly HashSet<string> AllowedAvatarTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp"
    };

    public StudentProfileController(IApplicationDbContext db, IFileStorageService storage)
    {
        _db = db;
        _storage = storage;
    }

    [HttpGet]
    [ProducesResponseType(typeof(StudentProfileDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<StudentProfileDto>> Get(CancellationToken ct)
    {
        var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subject, out var studentId)) return Unauthorized();

        var student = await _db.Students.AsNoTracking()
            .Where(candidate => candidate.Id == studentId && candidate.DeletedAt == null)
            .Select(candidate => new
            {
                candidate.Id,
                candidate.FullName,
                candidate.Phone,
                candidate.Email,
                candidate.AvatarUrl,
                candidate.Gender,
                candidate.Status,
                candidate.CreatedAt,
                candidate.LastLogin,
                candidate.UniversityId,
                candidate.CollegeId,
                candidate.AcademicYearId
            })
            .FirstOrDefaultAsync(ct);
        if (student is null) return Unauthorized();

        var universityName = student.UniversityId.HasValue
            ? await _db.Universities.AsNoTracking().Where(item => item.Id == student.UniversityId.Value).Select(item => item.NameAr).FirstOrDefaultAsync(ct)
            : null;
        var collegeName = student.CollegeId.HasValue
            ? await _db.Colleges.AsNoTracking().Where(item => item.Id == student.CollegeId.Value).Select(item => item.NameAr).FirstOrDefaultAsync(ct)
            : null;
        var academicYearName = student.AcademicYearId.HasValue
            ? await _db.AcademicYears.AsNoTracking().Where(item => item.Id == student.AcademicYearId.Value).Select(item => item.NameAr).FirstOrDefaultAsync(ct)
            : null;

        var subscriptions = await (
            from subscription in _db.StudentSubscriptions.AsNoTracking()
            join code in _db.SubscriptionCodes.AsNoTracking() on subscription.SubscriptionCodeId equals (Guid?)code.Id into codes
            from code in codes.DefaultIfEmpty()
            where subscription.StudentId == student.Id
            orderby subscription.StartsAt descending
            select new
            {
                subscription.Id,
                subscription.ScopeType,
                subscription.Status,
                subscription.StartsAt,
                subscription.ExpiresAt,
                subscription.RevokedAt,
                subscription.ScopeSubjectId,
                Code = code == null ? null : code.Code
            })
            .ToListAsync(ct);

        return Ok(new StudentProfileDto(
            student.FullName,
            student.Phone,
            student.Email,
            student.AvatarUrl,
            student.Gender,
            student.Status.ToString(),
            student.CreatedAt,
            student.LastLogin,
            universityName,
            collegeName,
            academicYearName,
            subscriptions.Select(item => new StudentProfileSubscriptionDto(
                item.Id,
                MaskCode(item.Code),
                item.ScopeType.ToString(),
                item.Status.ToString(),
                item.StartsAt,
                item.ExpiresAt,
                item.RevokedAt,
                item.ScopeSubjectId)).ToList()));
    }

    /// <summary>
    /// Update the student's own email address (self-service profile edit).
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateStudentEmailRequest body, CancellationToken ct = default)
    {
        var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subject, out var studentId)) return Unauthorized();

        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == studentId && s.DeletedAt == null, ct);
        if (student is null) return Unauthorized();

        student.SetEmail(body.Email);

        await _db.SaveChangesAsync(ct);

        return Ok(new { email = student.Email });
    }

    /// <summary>
    /// Upload a student avatar image (self-service). Validates type + size,
    /// stores via IFileStorageService, returns the new avatar URL + a signed preview URL.
    /// </summary>
    [HttpPost("avatar")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxAvatarBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxAvatarBytes)]
    public async Task<IActionResult> UploadAvatar([FromForm] IFormFile file, CancellationToken ct = default)
    {
        var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subject, out var studentId)) return Unauthorized();

        if (file is null || file.Length == 0)
            return BadRequest(new ProblemDetails { Title = "No file provided", Status = 400 });

        if (file.Length > MaxAvatarBytes)
            return BadRequest(new ProblemDetails { Title = "File too large", Status = 400, Detail = $"Avatar must be at most {MaxAvatarBytes / 1024 / 1024} MB" });

        var contentType = file.ContentType;
        if (!AllowedAvatarTypes.Contains(contentType))
            return BadRequest(new ProblemDetails { Title = "Invalid file type", Status = 400, Detail = $"Allowed types: {string.Join(", ", AllowedAvatarTypes)}" });

        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == studentId && s.DeletedAt == null, ct);
        if (student is null) return Unauthorized();

        // Delete previous avatar if exists (best-effort)
        if (!string.IsNullOrEmpty(student.AvatarUrl))
        {
            try { await _storage.DeleteAsync(student.AvatarUrl, ct); }
            catch { /* best-effort cleanup */ }
        }

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
            try
            {
                storedKey = await _storage.UploadAsync(stream, avatarKey, contentType, ct);
            }
            catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException or TaskCanceledException)
            {
                return StatusCode(502, new ProblemDetails { Title = "Avatar upload failed", Status = 502, Detail = $"Storage service error: {ex.Message}" });
            }
        }

        student.UpdateProfile(fullName: student.FullName, avatarUrl: storedKey, gender: student.Gender);
        await _db.SaveChangesAsync(ct);

        string? signedUrl = null;
        try { signedUrl = await _storage.GetSignedUrlAsync(storedKey, TimeSpan.FromHours(1)); }
        catch { /* preview URL is optional */ }

        return Ok(new { avatarUrl = storedKey, previewUrl = signedUrl, contentType, sizeBytes = file.Length });
    }

    private static string? MaskCode(string? code) => string.IsNullOrWhiteSpace(code)
        ? null
        : code.Length <= 8 ? "••••••••" : $"{code[..4]}••••{code[^4..]}";
}

public sealed record StudentProfileDto(
    string FullName,
    string Phone,
    string? Email,
    string? AvatarUrl,
    string? Gender,
    string Status,
    DateTime CreatedAt,
    DateTime? LastLogin,
    string? UniversityName,
    string? CollegeName,
    string? AcademicYearName,
    IReadOnlyList<StudentProfileSubscriptionDto> Subscriptions);

public sealed record StudentProfileSubscriptionDto(
    Guid Id,
    string? MaskedCode,
    string ScopeType,
    string Status,
    DateTime StartsAt,
    DateTime ExpiresAt,
    DateTime? RevokedAt,
    Guid? ScopeSubjectId);

public sealed record UpdateStudentEmailRequest(string? Email);
