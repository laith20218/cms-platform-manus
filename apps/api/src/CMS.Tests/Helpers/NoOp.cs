using CMS.Application.Interfaces;
using CMS.Domain.Enums;

namespace CMS.Tests;

/// <summary>
/// Shared no-op test doubles for the Push 2 activity-monitor seams.
/// </summary>
public static class NoOp
{
    /// <summary>
    /// An <see cref="IAdminActivityWriter"/> that records nothing — for handler tests that
    /// exercise the business path only. Tests that assert on written rows use the real
    /// <c>AdminActivityWriter</c> against an InMemory/SQLite context instead.
    /// </summary>
    public static IAdminActivityWriter ActivityWriter() => new NullActivityWriter();

    private sealed class NullActivityWriter : IAdminActivityWriter
    {
        public Task LogAsync(Guid adminId, AdminActivityActionType actionType, string? resourceId = null, object? metadata = null, Guid? sessionId = null, CancellationToken ct = default)
            => Task.CompletedTask;
    }
}
