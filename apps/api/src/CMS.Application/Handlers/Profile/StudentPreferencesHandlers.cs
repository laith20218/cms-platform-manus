using System.Text.Json;
using System.Text.Json.Nodes;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Profile;
using CMS.Application.Interfaces;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Profile;

/// <summary>
/// W15.0 — the student Preferences read/write pipeline over the existing (previously
/// unwired) Student.Preferences JSON column. Pass-through semantics: the handler never
/// interprets keys; it only enforces shape (a JSON OBJECT, not array/scalar) and an 8 KB
/// size cap, and stores the canonical serialization so the column never accumulates
/// whitespace/format drift. A corrupt stored value degrades to the entity default on read
/// (never a 500 on a preference read).
/// </summary>
public sealed class StudentPreferencesHandlers :
    IRequestHandler<GetStudentPreferencesQuery, JsonObject>,
    IRequestHandler<UpdateStudentPreferencesCommand, JsonObject>
{
    private const int MaxPreferencesChars = 8 * 1024;

    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;

    public StudentPreferencesHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork)
    {
        _db = db;
        _unitOfWork = unitOfWork;
    }

    public async Task<JsonObject> Handle(GetStudentPreferencesQuery req, CancellationToken ct)
    {
        var student = await FindStudentAsync(req.StudentId, ct);
        return ParseOrFallback(student.Preferences);
    }

    public async Task<JsonObject> Handle(UpdateStudentPreferencesCommand req, CancellationToken ct)
    {
        if (req.PreferencesJson.Length > MaxPreferencesChars)
            throw new DomainException(
                $"حجم التفضيلات كبير جداً — الحد الأقصى {MaxPreferencesChars} محرفاً", "PREFERENCES_TOO_LARGE");

        JsonObject parsed;
        try
        {
            var node = JsonNode.Parse(req.PreferencesJson);
            parsed = node as JsonObject
                ?? throw new DomainException("يجب أن تكون التفضيلات كائن JSON صالحاً", "PREFERENCES_INVALID_JSON");
        }
        catch (DomainException)
        {
            throw;
        }
        catch (JsonException)
        {
            throw new DomainException("يجب أن تكون التفضيلات كائن JSON صالحاً", "PREFERENCES_INVALID_JSON");
        }

        var canonical = parsed.ToJsonString();

        var student = await FindStudentAsync(req.StudentId, ct);
        student.UpdatePreferences(canonical);
        await _unitOfWork.SaveChangesAsync(ct);

        return parsed;
    }

    private async Task<CMS.Domain.Entities.Student> FindStudentAsync(Guid studentId, CancellationToken ct)
    {
        return await _db.Students
            .SingleOrDefaultAsync(student => student.Id == studentId && student.DeletedAt == null, ct)
            ?? throw new NotFoundException("Student", studentId);
    }

    private static JsonObject ParseOrFallback(string stored)
    {
        try
        {
            return JsonNode.Parse(stored) as JsonObject
                ?? FallbackDefault();
        }
        catch (JsonException)
        {
            // Corrupt stored value (manual DB edit, encoding accident): degrade to the
            // entity default instead of failing the read.
            return FallbackDefault();
        }
    }

    private static JsonObject FallbackDefault()
    {
        var fallback = new JsonObject
        {
            ["theme"] = "light",
            ["notifications"] = true,
            ["sounds"] = true,
            ["vibration"] = true,
        };
        return fallback;
    }
}
