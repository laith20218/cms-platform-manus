using CMS.Api.Authorization;
using CMS.Application.Interfaces;
using FluentAssertions;
using Microsoft.AspNetCore.Authorization;

namespace CMS.Tests.Unit.Authorization;

/// <summary>
/// PR-8 authorization wiring: the ServersView policy exists, carries exactly the
/// PermissionRequirement(Resources.Servers, Actions.View), and the "servers" resource is part
/// of the Resources.All registry (so the permission service accepts it — super admins pass via
/// the role bypass, no seeded role grant carries it).
/// </summary>
public sealed class ServersViewPolicyTests
{
    [Fact]
    public void ServersView_PolicyExists_WithServersViewRequirement()
    {
        var options = new AuthorizationOptions();
        Policies.Register(options);

        var policy = options.GetPolicy(Policies.ServersView);
        policy.Should().NotBeNull("the ServersView policy must be registered for the servers dashboard");

        var requirement = policy!.Requirements.OfType<PermissionRequirement>().Single();
        requirement.Resource.Should().Be(Resources.Servers);
        requirement.Action.Should().Be(Actions.View);
    }

    [Fact]
    public void Servers_ResourceIsRegistered()
    {
        Resources.Servers.Should().Be("servers");
        Resources.All.Should().Contain(Resources.Servers);
        Resources.All.Should().HaveCount(20, "one new resource (servers) joined the registry");
        Resources.All.Should().OnlyHaveUniqueItems();
    }
}
