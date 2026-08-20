using CMS.Application.Interfaces;

namespace CMS.Infrastructure.Services;

public sealed class CorrelationContext : ICorrelationContext
{
    private string? _correlationId;

    public string CorrelationId
    {
        get => string.IsNullOrWhiteSpace(_correlationId) ? _correlationId = Guid.NewGuid().ToString("N") : _correlationId;
        set => _correlationId = value;
    }
}
