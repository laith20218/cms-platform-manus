using CMS.Api.Authorization;
using CMS.Application.DTOs.Monitoring;
using CMS.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.Api.Controllers;

/// <summary>
/// PR-8 (Servers Dashboard) — read-only provider monitoring for Render / Vercel / Neon / GitHub.
///
/// This surface is READ-ONLY BY DESIGN: no restart, deploy, env-var, domain, billing or ANY
/// mutation endpoint exists in this controller — only GET endpoints over the monitoring layer.
/// There is likewise no generic URL proxy: the provider monitors only ever issue their fixed
/// allowlisted GETs against the four hardcoded provider hosts; nothing from the request reaches
/// an upstream URL or query.
///
/// Authorization: [Authorize(Policy = ServersView)] is the permission boundary
/// (PermissionRequirement(Resources.Servers, Actions.View)) — because super_admin bypasses
/// HasPermissionAsync and NO seeded role grant carries servers.view, only super admins pass it
/// today; the additional [Authorize(Policy = "SuperAdmin")] pins the surface to the super-admin
/// ROLE as well (both attributes stack with AND semantics, matching the "initially
/// SuperAdmin-only" decision in the PR-8 plan — relaxing it later is a deliberate act).
///
/// NO SecurityLog writes are performed here on purpose: a monitoring READ is not a security
/// event (it mutates nothing and exposes no security-relevant state), and per-check audit rows
/// would flood the durable audit ledger at dashboard polling frequency. All check lines go to
/// the structured ILogger only (provider / fixed path / status / elapsed / correlationId —
/// never headers, tokens or any secret material).
///
/// Honesty requirement: when the MONITORING_* environment names are not configured, every
/// provider reports status "missing_credentials" — the dashboard never fakes an "up" state.
/// </summary>
[ApiController]
[Route("api/v1/admin/servers")]
[Authorize(Policy = Policies.ServersView)]
[Authorize(Policy = "SuperAdmin")]
public sealed class AdminServersController : ControllerBase
{
    private readonly IServersMonitorService _monitors;
    private readonly ICorrelationContext _correlation;

    public AdminServersController(IServersMonitorService monitors, ICorrelationContext correlation)
    {
        _monitors = monitors;
        _correlation = correlation;
    }

    private string CorrelationId => _correlation.CorrelationId;

    /// <summary>
    /// Overall + per-provider health: the four provider checks run in parallel
    /// (Task.WhenAll — each provider honors its own cache and failure isolation).
    /// Pass ?fresh=true to bypass the 60-second cache read (still writes back).
    /// </summary>
    [HttpGet("summary")]
    [ProducesResponseType(typeof(ServersSummary), StatusCodes.Status200OK)]
    public async Task<ActionResult<ServersSummary>> Summary([FromQuery] bool fresh = false, CancellationToken ct = default)
        => Ok(await _monitors.GetSummaryAsync(fresh, CorrelationId, ct));

    /// <summary>Render detail (service + latest deploy). Read-only.</summary>
    [HttpGet("render")]
    [ProducesResponseType(typeof(ProviderEnvelope<RenderProviderData>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProviderEnvelope<RenderProviderData>>> Render([FromQuery] bool fresh = false, CancellationToken ct = default)
        => Ok(await _monitors.GetRenderAsync(fresh, CorrelationId, ct));

    /// <summary>Vercel detail (admin + student projects with latest deployments). Read-only.</summary>
    [HttpGet("vercel")]
    [ProducesResponseType(typeof(ProviderEnvelope<VercelProviderData>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProviderEnvelope<VercelProviderData>>> Vercel([FromQuery] bool fresh = false, CancellationToken ct = default)
        => Ok(await _monitors.GetVercelAsync(fresh, CorrelationId, ct));

    /// <summary>Neon detail (project + branch; never connection material). Read-only.</summary>
    [HttpGet("neon")]
    [ProducesResponseType(typeof(ProviderEnvelope<NeonProviderData>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProviderEnvelope<NeonProviderData>>> Neon([FromQuery] bool fresh = false, CancellationToken ct = default)
        => Ok(await _monitors.GetNeonAsync(fresh, CorrelationId, ct));

    /// <summary>GitHub detail (repository + recent workflow runs). Read-only.</summary>
    [HttpGet("github")]
    [ProducesResponseType(typeof(ProviderEnvelope<GithubProviderData>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProviderEnvelope<GithubProviderData>>> Github([FromQuery] bool fresh = false, CancellationToken ct = default)
        => Ok(await _monitors.GetGithubAsync(fresh, CorrelationId, ct));

    /// <summary>
    /// Bounded in-memory check history for one provider. The provider name is validated against
    /// the four known providers; anything else is a 404 ProblemDetails. The history lives in
    /// memory only — see the bilingual window note in the response.
    /// </summary>
    [HttpGet("{provider}/history")]
    [ProducesResponseType(typeof(ProviderHistoryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public ActionResult<ProviderHistoryDto> History(string provider)
    {
        if (!ServerProviders.All.Contains(provider, StringComparer.OrdinalIgnoreCase))
        {
            return NotFound(new ProblemDetails
            {
                Title = "Unknown provider",
                Status = StatusCodes.Status404NotFound,
                Detail = $"Unknown provider '{provider}'. Known providers: {string.Join(", ", ServerProviders.All)}"
            });
        }

        var normalized = ServerProviders.All.Single(known => string.Equals(known, provider, StringComparison.OrdinalIgnoreCase));
        var history = _monitors.GetProviderHistory(normalized);
        return history is null
            ? NotFound(new ProblemDetails { Title = "Unknown provider", Status = StatusCodes.Status404NotFound, Detail = $"No monitor for provider '{provider}'" })
            : Ok(history);
    }
}
