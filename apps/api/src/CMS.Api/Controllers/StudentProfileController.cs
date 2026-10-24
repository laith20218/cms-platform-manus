using System.Security.Claims;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
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
    private readonly ApplicationDbContext _rawDb;
    private readonly IFileStorageService _storage;
    private readonly SecurityService _security;
    private readonly ILogger<StudentProfileController> _logger;

    private const long MaxAvatarBytes = 3 * 1024 * 1024; // 3MB
    private const int MinFullNameLength = 2;
    private const int MaxFullNameLength = 100;
    private static readonly HashSet<string> AllowedAvatarTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp"
    };

    public StudentProfileController(
        IApplicationDbContext db,
        ApplicationDbContext rawDb,
        IFileStorageService storage,
        SecurityService security,
        ILogger<StudentProfileController> logger)
    {
        _db = db;
        _rawDb = rawDb;
        _storage = storage;
        _security = security;
        _logger = logger;
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

        // Push 8 avatar fix: the stored value is a raw storage KEY
        // (avatars/students/{id}/{guid}.ext), not a URL — the student web used to
        // render <img src> with it directly (guarded by startsWith('http')), so
        // avatars never displayed after a reload. Presign the key here so the
        // profile payload always carries a browser-usable URL.
        var avatarUrl = student.AvatarUrl;
        if (!string.IsNullOrEmpty(avatarUrl))
        {
            try { avatarUrl = await _storage.GetSignedUrlAsync(avatarUrl, TimeSpan.FromHours(6), ct); }
            catch
            {
                // Storage hiccup — fall back to the raw key (client shows initials).
                avatarUrl = null;
            }
        }

        return Ok(new StudentProfileDto(
            student.FullName,
            student.Phone,
            student.Email,
            avatarUrl,
            student.Gender,
            student.Status.ToString(),
            student.CreatedAt,
            student.LastLogin,
            universityName,
            collegeName,
            academicYearName,
            student.UniversityId,
            student.CollegeId,
            student.AcademicYearId,
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
    /// Self-service profile edit (Push 9 Task 5): email (legacy behavior) plus
    /// Full Name / College / Academic Year — the hierarchical update.
    ///
    /// Integrity guarantees:
    ///  1. Hierarchy validation — the college must exist; the year must belong
    ///     to the effective college; the university is derived from the college
    ///     (a college change inside a different university moves the whole path).
    ///  2. Active-exam guard — a student mid-exam (InProgress session) is
    ///     blocked with 409 so answers can never land on a reshaped path.
    ///  3. One EF Core transaction wraps the student update AND the audit
    ///     security-log row (visible to admins in the Audit Center immediately) —
    ///     either both persist or neither does.
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateOwnProfileRequest body, CancellationToken ct = default)
    {
        var subject = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(subject, out var studentId)) return Unauthorized();

        var student = await _rawDb.Students.FirstOrDefaultAsync(s => s.Id == studentId && s.DeletedAt == null, ct);
        if (student is null) return Unauthorized();

        var changesCollege = body.CollegeId is not null && body.CollegeId != student.CollegeId;
        var changesYear = body.AcademicYearId is not null && body.AcademicYearId != student.AcademicYearId;
        var changesName = !string.IsNullOrWhiteSpace(body.FullName)
            && !string.Equals(body.FullName.Trim(), student.FullName, StringComparison.Ordinal);
        var changesPath = changesCollege || changesYear;

        // ---- Name validation ----
        if (body.FullName is not null && !string.IsNullOrWhiteSpace(body.FullName))
        {
            var trimmed = body.FullName.Trim();
            if (trimmed.Length is < MinFullNameLength or > MaxFullNameLength)
                return BadRequest(new ProblemDetails
                {
                    Title = "الاسم غير صالح",
                    Status = 400,
                    Detail = $"يجب أن يتراوح الاسم بين {MinFullNameLength} و{MaxFullNameLength} محرفاً."
                });
        }

        // ---- Active-exam guard: no path edits mid-exam (data integrity). ----
        if (changesPath)
        {
            var now = DateTime.UtcNow;
            var activeExam = await _rawDb.ExamSessions.AsNoTracking().AnyAsync(s
                => s.StudentId == studentId
                && s.Status == ExamSessionStatus.InProgress
                && s.SubmittedAt == null
                && s.ExpiresAt > now, ct);
            if (activeExam)
                return Conflict(new ProblemDetails
                {
                    Title = "لديك اختبار قيد التنفيذ",
                    Status = 409,
                    Detail = "لا يمكن تغيير الكلية أو السنة أثناء اختبار غير مكتمل. أكمل اختبارك أولاً ثم أعد المحاولة."
                });
        }

        // ---- Hierarchy validation + old-value snapshot (for the audit trail). ----
        College? newCollege = null;
        AcademicYear? newYear = null;
        string? oldCollegeName = null, newCollegeName = null, oldYearName = null, newYearName = null;

        if (changesPath)
        {
            var effectiveCollegeId = body.CollegeId ?? student.CollegeId;
            if (effectiveCollegeId is null)
                return BadRequest(new ProblemDetails
                {
                    Title = "الكلية مطلوبة",
                    Status = 400,
                    Detail = "اختر كليتك أولاً ثم اختر السنة الدراسية."
                });

            newCollege = await _rawDb.Colleges.AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == effectiveCollegeId.Value && c.DeletedAt == null, ct);
            if (newCollege is null)
                return BadRequest(new ProblemDetails
                {
                    Title = "الكلية غير موجودة",
                    Status = 400,
                    Detail = "الكلية المختارة غير متاحة حالياً. حدّث الصفحة واختر من القائمة."
                });

            // A college change re-anchors the university (College ∈ University).
            // The year must then be re-picked INSIDE the new college.
            Guid? effectiveYearId = body.AcademicYearId ?? student.AcademicYearId;
            if (changesCollege && body.AcademicYearId is null)
                return BadRequest(new ProblemDetails
                {
                    Title = "اختر سنتك الدراسية",
                    Status = 400,
                    Detail = "عند تغيير الكلية يجب اختيار سنة دراسية ضمن كليتك الجديدة."
                });

            if (effectiveYearId is not null)
            {
                newYear = await _rawDb.AcademicYears.AsNoTracking()
                    .FirstOrDefaultAsync(y => y.Id == effectiveYearId.Value && y.DeletedAt == null, ct);
                if (newYear is null || newYear.CollegeId != newCollege.Id)
                    return BadRequest(new ProblemDetails
                    {
                        Title = "السنة لا تنتمي إلى الكلية",
                        Status = 400,
                        Detail = "السنة الدراسية المختارة لا تنتمي إلى الكلية الحالية. اختر سنة ضمن كليتك."
                    });
            }

            oldCollegeName = student.CollegeId is null
                ? null
                : await _rawDb.Colleges.AsNoTracking().Where(c => c.Id == student.CollegeId).Select(c => c.NameAr).FirstOrDefaultAsync(ct);
            oldYearName = student.AcademicYearId is null
                ? null
                : await _rawDb.AcademicYears.AsNoTracking().Where(y => y.Id == student.AcademicYearId).Select(y => y.NameAr).FirstOrDefaultAsync(ct);
            newCollegeName = newCollege.NameAr;
            newYearName = newYear?.NameAr;
        }

        // ---- Transactional write: student + audit log row, all-or-nothing. ----
        await using var transaction = await _rawDb.Database.BeginTransactionAsync(ct);
        try
        {
            var changes = new List<string>();

            if (changesName)
            {
                var oldName = student.FullName;
                student.UpdateProfile(fullName: body.FullName!.Trim(), avatarUrl: null, gender: null);
                changes.Add($"الاسم: \"{oldName}\" ← \"{student.FullName}\"");
            }

            if (changesPath)
            {
                var effectiveYearId = body.AcademicYearId ?? student.AcademicYearId;
                student.SetAcademicInfo(newCollege!.UniversityId, newCollege.Id, effectiveYearId!.Value);
                if (changesCollege)
                    changes.Add($"الكلية: \"{oldCollegeName ?? "غير محددة"}\" ← \"{newCollegeName}\"");
                if (changesYear)
                    changes.Add($"السنة: \"{oldYearName ?? "غير محددة"}\" ← \"{newYearName}\"");
            }

            if (body.Email is not null)
                student.SetEmail(body.Email);

            await _rawDb.SaveChangesAsync(ct);

            // Admin notification + audit trail (same transaction): a Warning
            // SecurityAlert row lands in the admin Audit Center immediately.
            if (changes.Count > 0)
            {
                var description = $"الطالب \"{student.FullName}\" ({student.Phone}) عدّل ملفه الشخصي — {string.Join(" · ", changes)}";
                await _security.LogSecurityEventAsync(
                    studentId: studentId,
                    adminId: null,
                    eventType: SecurityEventType.SecurityAlert,
                    severity: SecuritySeverity.Warning,
                    description: description,
                    ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
                    userAgent: Request.Headers.UserAgent.ToString(),
                    ct: ct);
            }

            await transaction.CommitAsync(ct);
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(ct);
            _logger.LogError(ex, "Profile update failed for student {StudentId} — transaction rolled back", studentId);
            return StatusCode(500, new ProblemDetails { Title = "تعذّر حفظ التعديلات", Status = 500, Detail = "حدث خطأ غير متوقع أثناء الحفظ. لم يتم تغيير أي بيانات." });
        }

        // ---- Response with resolved names (drives the instant UI refresh). ----
        var universityName = student.UniversityId is null
            ? null
            : await _rawDb.Universities.AsNoTracking().Where(u => u.Id == student.UniversityId).Select(u => u.NameAr).FirstOrDefaultAsync(ct);
        var collegeName = student.CollegeId is null
            ? null
            : await _rawDb.Colleges.AsNoTracking().Where(c => c.Id == student.CollegeId).Select(c => c.NameAr).FirstOrDefaultAsync(ct);
        var yearName = student.AcademicYearId is null
            ? null
            : await _rawDb.AcademicYears.AsNoTracking().Where(y => y.Id == student.AcademicYearId).Select(y => y.NameAr).FirstOrDefaultAsync(ct);

        return Ok(new
        {
            email = student.Email,
            fullName = student.FullName,
            universityName,
            collegeName,
            academicYearName = yearName,
            adminNotified = changesName || changesPath,
        });
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
    Guid? UniversityId,
    Guid? CollegeId,
    Guid? AcademicYearId,
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

public sealed record UpdateOwnProfileRequest(
    string? Email,
    string? FullName,
    Guid? CollegeId,
    Guid? AcademicYearId);
