using CMS.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using CMS.Infrastructure.Persistence;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Reads admin-editable system settings (system_settings table) through the
/// <see cref="ISystemSettingsService"/> abstraction. Read-only: writes happen through
/// the SystemSettingsController with permission + audit checks. Callers must apply
/// their own safe fallback when a key is missing or the value does not parse.
/// </summary>
public sealed class SystemSettingsService : ISystemSettingsService
{
    private readonly ApplicationDbContext _db;

    public SystemSettingsService(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<string?> GetAsync(string key, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            return null;

        return await _db.SystemSettings
            .AsNoTracking()
            .Where(setting => setting.Key == key)
            .Select(setting => setting.Value)
            .FirstOrDefaultAsync(ct);
    }
}
