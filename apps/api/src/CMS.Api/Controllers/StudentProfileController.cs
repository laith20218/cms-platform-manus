using System.Security.Claims;
using CMS.Application.Interfaces;
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

    public StudentProfileController(IApplicationDbContext db) => _db = db;

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
