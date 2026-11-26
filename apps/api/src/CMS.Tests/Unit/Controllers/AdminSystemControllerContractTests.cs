using System.Reflection;
using CMS.Api.Controllers;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Xunit;

namespace CMS.Tests.Unit.Controllers;

/// <summary>
/// PR-1 — structural guard for the Danger Zone surface (Gate B decisions #2/#3):
///  • the system-maintenance controller stays behind the SuperAdmin policy —
///    system-level destructors cannot be delegated via roles
///  • the strict "danger-zone" rate-limit policy stays attached to the controller:
///    every call runs Argon2 re-authentication, so a flood must hit 429 instead of
///    burning CPU (the policy was previously defined but attached to nothing)
///  • the read-only hard-delete flag mirror exists (GET /hard-delete/status) so the
///    Danger Zone UI can show an honest disabled state — the authoritative flag
///    check lives in SystemMaintenanceHandlers and is covered by its own tests
///  • wipe/hard-delete remain POST-only verbs (no destructive GET surface)
/// </summary>
public sealed class AdminSystemControllerContractTests
{
    private static readonly Type Controller = typeof(AdminSystemController);

    [Fact]
    public void Controller_RequiresSuperAdminPolicy()
        => Controller.GetCustomAttribute<AuthorizeAttribute>()!.Policy.Should().Be("SuperAdmin");

    [Fact]
    public void Controller_IsThrottledByTheDangerZonePolicy()
    {
        var attribute = Controller.GetCustomAttribute<EnableRateLimitingAttribute>();

        attribute.Should().NotBeNull("system destructors must be rate-limited");
        attribute!.PolicyName.Should().Be("danger-zone");
    }

    [Fact]
    public void HardDeleteStatus_IsReadOnly_And_MirrorsTheBackendFlag()
    {
        var method = Controller.GetMethod(nameof(AdminSystemController.HardDeleteStatus),
            BindingFlags.Public | BindingFlags.Instance);

        method.Should().NotBeNull("the UI reads the backend flag state from GET /api/v1/admin/system/hard-delete/status");
        method!.GetCustomAttribute<HttpGetAttribute>().Should().NotBeNull("status must be a GET — read-only by contract");
    }

    [Fact]
    public void Wipe_And_HardDelete_RemainHttpPostOnly()
    {
        Controller.GetMethod(nameof(AdminSystemController.Wipe))!
            .GetCustomAttribute<HttpPostAttribute>().Should().NotBeNull();
        Controller.GetMethod(nameof(AdminSystemController.HardDelete))!
            .GetCustomAttribute<HttpPostAttribute>().Should().NotBeNull();
    }
}
