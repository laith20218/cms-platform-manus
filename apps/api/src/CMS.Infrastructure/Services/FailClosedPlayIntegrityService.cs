using CMS.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Safe default until a Google Play provider, replay store, and server-side verdict verification are configured.
/// It deliberately rejects every request and never writes or logs the opaque provider token.
/// </summary>
public sealed class FailClosedPlayIntegrityService : IPlayIntegrityService
{
    private readonly bool _enabled;

    public FailClosedPlayIntegrityService(IConfiguration configuration)
    {
        _enabled = configuration.GetValue<bool>("Security:PlayIntegrity:Enabled");
    }

    public Task<PlayIntegrityVerificationResult> VerifyAsync(
        PlayIntegrityVerificationRequest request,
        PlayIntegrityVerificationContext context,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.RequestHash) ||
            context.StudentId == Guid.Empty || string.IsNullOrWhiteSpace(context.InstallationId))
            return Task.FromResult(new PlayIntegrityVerificationResult(false, "invalid_request"));

        // Enabled only means the endpoint is ready for a provider; acceptance is impossible without live provider wiring.
        return Task.FromResult(new PlayIntegrityVerificationResult(
            false,
            _enabled ? "provider_not_configured" : "not_configured"));
    }
}
