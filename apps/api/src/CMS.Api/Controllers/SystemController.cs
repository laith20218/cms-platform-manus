using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace CMS.Api.Controllers;

/// <summary>
/// Public platform metadata (Wave 16.4). GET /api/v1/system/version backs the
/// student app's «حول» section (SettingsPage) so the displayed version is a
/// dynamic API value instead of the hardcoded "1.0.0".
///
/// Resolution order:
///  1. Platform:Version configuration (e.g. PLATFORM__VERSION on Render — the
///     version can change without a redeploy),
///  2. the API assembly's InformationalVersion (build-stamped),
///  3. "1.0.0".
/// </summary>
[ApiController]
[Route("api/v1/system")]
public sealed class SystemController : ControllerBase
{
    /// <summary>Fallback when neither configuration nor the assembly carry a version.</summary>
    internal const string FallbackVersion = "1.0.0";

    private readonly IConfiguration _configuration;

    public SystemController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    /// <summary>Returns the platform version students see in Settings → «حول».</summary>
    [HttpGet("version")]
    [AllowAnonymous]
    [EnableRateLimiting("health")]
    public ActionResult<PlatformVersionDto> GetVersion()
    {
        return Ok(new PlatformVersionDto(ResolveVersion(_configuration)));
    }

    /// <summary>
    /// Pure resolver (unit-tested): config override → assembly InformationalVersion
    /// (a trailing "+commit" suffix is stripped) → <see cref="FallbackVersion"/>.
    /// </summary>
    public static string ResolveVersion(IConfiguration? configuration)
    {
        var configured = configuration?["Platform:Version"]?.Trim();
        if (!string.IsNullOrEmpty(configured) && configured.Length <= 32)
        {
            return configured;
        }

        var informational = typeof(Program).Assembly
            .GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion;

        if (!string.IsNullOrWhiteSpace(informational))
        {
            var plus = informational.IndexOf('+');
            var version = (plus > 0 ? informational[..plus] : informational).Trim();
            if (version.Length > 0)
            {
                return version;
            }
        }

        return FallbackVersion;
    }
}

/// <summary>Response body for GET /api/v1/system/version.</summary>
public sealed record PlatformVersionDto(string Version);
