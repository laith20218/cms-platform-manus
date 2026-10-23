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
        ISecurityAuditWriter audit,
        IPasswordHasher passwordHasher)
    {
        _db = db;
        _permissions = permissions;
        _storage = storage;
        _audit = audit;
        _passwordHasher = passwordHasher;
    }

    private readonly IPasswordHasher _passwordHasher;

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
            try
            {
                storedKey = await _storage.UploadAsync(stream, avatarKey, contentType, ct);
            }
            catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException or TaskCanceledException)
            {
                return StatusCode(502, new ProblemDetails
                {
                    Title = "Avatar upload failed",
                    Status = 502,
                    Detail = $"Storage service error: {ex.Message}",
                });
            }
        }

        // Update student.AvatarUrl (use UpdateProfile to keep invariants)
        student.UpdateProfile(fullName: student.FullName, avatarUrl: storedKey, gender: student.Gender);
        await _db.SaveChangesAsync(ct);

        // Get a signed URL for immediate preview (best-effort — don't fail if this errors)
        string? signedUrl = null;
        try
        {
            signedUrl = await _storage.GetSignedUrlAsync(storedKey, TimeSpan.FromHours(1));
        }
        catch
        {
            // Preview URL is optional — the avatar is stored, just can't preview inline
        }

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

    /// <summary>
    /// Create a student manually (admin-side). Bypasses OTP verification —
    /// the student's phone is marked verified immediately so they can log in.
    /// Requires Students.Create permission + scope check.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateStudent([FromBody] CreateStudentRequest body, CancellationToken ct = default)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Students, Actions.Create, ct))
            return Forbid();

        // Validate required fields
        if (string.IsNullOrWhiteSpace(body.Phone) || string.IsNullOrWhiteSpace(body.Password)
            || string.IsNullOrWhiteSpace(body.FullName))
            return BadRequest(new ProblemDetails { Title = "Missing required fields (phone, password, fullName)", Status = 400 });

        if (body.Password.Length < 8)
            return BadRequest(new ProblemDetails { Title = "Password must be at least 8 characters", Status = 400 });

        // Check phone uniqueness
        var normalized = body.Phone.Trim();
        var phoneExists = await _db.Students.AnyAsync(s => s.Phone == normalized || s.PhoneNormalized == normalized, ct);
        if (phoneExists)
            return Conflict(new ProblemDetails { Title = "Phone number already registered", Status = 409 });

        // Validate academic hierarchy exists
        if (body.UniversityId == Guid.Empty || body.CollegeId == Guid.Empty || body.AcademicYearId == Guid.Empty)
            return BadRequest(new ProblemDetails { Title = "University, college, and academic year are required", Status = 400 });

        // Scope check: admin must be in scope of the university/college/year
        if (!await _permissions.IsInScopeAsync(adminId, "university", body.UniversityId, ct))
            return Forbid();

        // Create student
        var passwordHash = _passwordHasher.HashPassword(body.Password);
        var student = Student.Create(normalized, passwordHash, body.FullName.Trim());
        student.SetAcademicInfo(body.UniversityId, body.CollegeId, body.AcademicYearId);
        student.VerifyPhone(); // Admin bypass — skip OTP
        if (!string.IsNullOrWhiteSpace(body.Gender))
            student.UpdateProfile(fullName: null, avatarUrl: null, gender: body.Gender);
        if (!string.IsNullOrWhiteSpace(body.Email))
            student.SetEmail(body.Email);

        _db.Students.Add(student);
        await _db.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            studentId: student.Id, adminId: adminId,
            eventType: SecurityEventType.AdminAction, severity: SecuritySeverity.Info,
            description: $"Student '{student.FullName}' ({student.Phone}) created manually by admin (phone pre-verified)",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString(),
            userAgent: Request.Headers.UserAgent.ToString(),
            ct: ct);

        return CreatedAtAction(nameof(GetStudentExamSessions), new { studentId = student.Id }, new
        {
            id = student.Id,
            phone = student.Phone,
            fullName = student.FullName,
            phoneVerified = true,
            createdAt = student.CreatedAt,
        });
    }

    // ===== Student profile drawer — per-student detail endpoints =====

    private async Task<IActionResult> CheckStudentAccess(Guid studentId, CancellationToken ct)
    {
        var adminId = GetAdminId();
        if (!await _permissions.HasPermissionAsync(adminId, Resources.Students, Actions.View, ct)
            || !await _permissions.IsInScopeAsync(adminId, "student", studentId, ct)) return Forbid();

        var exists = await _db.Students.AnyAsync(s => s.Id == studentId, ct);
        return exists ? null! : NotFound(new ProblemDetails
        {
            Title = "Student not found",
            Status = 404,
            Detail = $"No student with id '{studentId}'",
        });
    }

    /// <summary>
    /// Get a student's exam sessions (for the profile drawer "Exams" tab).
    /// Returns the most recent 50 sessions with exam title, score, pass/fail.
    /// </summary>
    [HttpGet("{studentId:guid}/exam-sessions")]
    public async Task<IActionResult> GetStudentExamSessions(Guid studentId, CancellationToken ct = default)
    {
        var accessCheck = await CheckStudentAccess(studentId, ct);
        if (accessCheck is not null) return accessCheck;

        var sessions = await _db.ExamSessions.AsNoTracking()
            .Where(es => es.StudentId == studentId)
            .OrderByDescending(es => es.StartedAt)
            .Take(50)
            .Select(es => new
            {
                id = es.Id,
                examId = es.ExamId,
                examTitle = es.Exam.TitleAr,
                status = es.Status.ToString(),
                score = es.Score,
                passed = es.Passed,
                startedAt = es.StartedAt,
                completedAt = es.CompletedAt,
                totalQuestions = es.TotalQuestions,
                correctAnswers = es.CorrectAnswers,
                durationMinutes = es.DurationMinutesSnapshot,
            })
            .ToListAsync(ct);

        return Ok(new { items = sessions, total = sessions.Count });
    }

    /// <summary>
    /// Get a student's subscriptions (for the profile drawer "Subscriptions" tab).
    /// Returns the most recent 50 subscriptions with scope + status + dates.
    /// </summary>
    [HttpGet("{studentId:guid}/subscriptions")]
    public async Task<IActionResult> GetStudentSubscriptions(Guid studentId, CancellationToken ct = default)
    {
        var accessCheck = await CheckStudentAccess(studentId, ct);
        if (accessCheck is not null) return accessCheck;

        var subs = await _db.StudentSubscriptions.AsNoTracking()
            .Where(s => s.StudentId == studentId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(50)
            .Select(s => new
            {
                id = s.Id,
                status = s.Status.ToString(),
                scopeType = s.ScopeType.ToString(),
                startsAt = s.StartsAt,
                expiresAt = s.ExpiresAt,
                revokedAt = s.RevokedAt,
                revocationReason = s.RevocationReason,
                createdAt = s.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(new { items = subs, total = subs.Count });
    }

    /// <summary>
    /// Get a student's error reports (for the profile drawer "Reports" tab).
    /// Returns the most recent 50 reports filed by this student.
    /// </summary>
    [HttpGet("{studentId:guid}/reports")]
    public async Task<IActionResult> GetStudentReports(Guid studentId, CancellationToken ct = default)
    {
        var accessCheck = await CheckStudentAccess(studentId, ct);
        if (accessCheck is not null) return accessCheck;

        var reports = await _db.ErrorReports.AsNoTracking()
            .Where(r => r.StudentId == studentId)
            .OrderByDescending(r => r.CreatedAt)
            .Take(50)
            .Select(r => new
            {
                id = r.Id,
                questionId = r.QuestionId,
                questionText = r.Question.Text,
                reason = r.ReasonType.ToString(),
                description = r.Description,
                status = r.Status.ToString(),
                createdAt = r.CreatedAt,
                resolvedAt = r.ResolvedAt,
            })
            .ToListAsync(ct);

        return Ok(new { items = reports, total = reports.Count });
    }

    /// <summary>
    /// Get a student's per-subject progress (for the profile drawer "Academic" tab).
    /// Aggregates AttemptLogs by subject: total answered, correct, accuracy.
    /// </summary>
    [HttpGet("{studentId:guid}/progress")]
    public async Task<IActionResult> GetStudentProgress(Guid studentId, CancellationToken ct = default)
    {
        var accessCheck = await CheckStudentAccess(studentId, ct);
        if (accessCheck is not null) return accessCheck;

        // Server-side: filter + join AttemptLogs → Questions to get SubjectId.
        // Client-side: aggregate (to avoid EF Core Count(predicate) translation
        // pitfalls — see EXECUTION_STATUS.md "Critical Testing Gap").
        var attempts = await _db.AttemptLogs.AsNoTracking()
            .Where(a => a.StudentId == studentId)
            .Join(_db.Questions, a => a.QuestionId, q => q.Id, (a, q) => new { a.IsCorrect, a.AnsweredAt, q.SubjectId })
            .ToListAsync(ct);

        var grouped = attempts
            .GroupBy(x => x.SubjectId)
            .Select(g => new
            {
                subjectId = g.Key,
                questionsAnswered = g.Count(),
                correctAnswers = g.Count(x => x.IsCorrect),
                lastActivityDate = g.Max(x => x.AnsweredAt),
            })
            .ToList();

        var subjectIds = grouped.Select(p => p.subjectId).ToList();
        var subjects = await _db.Subjects.AsNoTracking()
            .Where(s => subjectIds.Contains(s.Id))
            .Select(s => new { s.Id, s.NameAr, s.NameEn })
            .ToListAsync(ct);

        var progress = grouped
            .Join(subjects, p => p.subjectId, s => s.Id, (p, s) => new
            {
                subjectId = p.subjectId,
                subjectName = s.NameAr,
                subjectNameEn = s.NameEn,
                questionsAnswered = p.questionsAnswered,
                correctAnswers = p.correctAnswers,
                accuracy = p.questionsAnswered > 0 ? Math.Round(p.correctAnswers * 100.0 / p.questionsAnswered, 1) : 0,
                lastActivityDate = p.lastActivityDate,
            })
            .OrderByDescending(p => p.questionsAnswered)
            .Take(50)
            .ToList();

        return Ok(new { items = progress, total = progress.Count });
    }
}

/// <summary>Request body for PUT /admin/students/{id}.</summary>
public record UpdateStudentProfileRequest(
    string? FullName,
    string? Gender  // "male" | "female" | null to keep
);

/// <summary>Request body for POST /admin/students (manual creation).</summary>
public record CreateStudentRequest(
    string Phone,
    string Password,
    string FullName,
    Guid UniversityId,
    Guid CollegeId,
    Guid AcademicYearId,
    string? Gender,  // "male" | "female" | null
    string? Email    // optional
);
