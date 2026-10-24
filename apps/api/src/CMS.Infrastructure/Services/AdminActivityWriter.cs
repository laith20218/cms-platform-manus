using System.Text.Json;
using System.Text.Json.Serialization;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Push 2 / Track 2: default <see cref="IAdminActivityWriter"/> — persists one
/// AdminActivityLog row per completed administrative action. Best-effort by design:
/// a logging failure is logged as a warning and never propagates to the caller, so the
/// business operation it records can never fail because of its own audit trail
/// (same contract as the A1 best-effort blob cleanup).
/// </summary>
public sealed class AdminActivityWriter : IAdminActivityWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly ApplicationDbContext _db;
    private readonly ILogger<AdminActivityWriter> _logger;

    public AdminActivityWriter(ApplicationDbContext db, ILogger<AdminActivityWriter> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task LogAsync(Guid adminId, AdminActivityActionType actionType, string? resourceId = null, object? metadata = null, Guid? sessionId = null, CancellationToken ct = default)
    {
        try
        {
            _db.AdminActivityLogs.Add(new AdminActivityLog
            {
                AdminId = adminId,
                SessionId = sessionId,
                ActionType = actionType,
                ResourceId = resourceId is { Length: > 100 } ? resourceId[..100] : resourceId,
                Metadata = metadata is null
                    ? "{}"
                    : JsonSerializer.Serialize(metadata, JsonOptions)
            });
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex,
                "Admin activity log write failed (best-effort, business operation unaffected). AdminId={AdminId} Action={Action} ResourceId={ResourceId}",
                adminId, actionType, resourceId);
        }
    }
}
