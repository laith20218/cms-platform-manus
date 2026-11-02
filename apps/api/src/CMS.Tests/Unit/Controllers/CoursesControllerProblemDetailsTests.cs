using System.Security.Claims;
using CMS.Api.Controllers;
using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using CMS.Infrastructure.Security;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace CMS.Tests.Unit.Controllers;

/// <summary>
/// R72 / 12.5.A.5 (supervisor Q5) — the Courses 403 must carry its reason. The bare
/// <c>Forbid()</c> dropped <c>validation.FailureReason</c>, which is exactly why the
/// denial masqueraded as an opaque device failure for so long (R68 finding). The
/// controller now returns ProblemDetails(statusCode 403, detail = reason) and the
/// student-web api-client taxonomy (ProblemDetails.detail → variant card) reads it.
///
/// Pure unit test: the rejection path touches no database — the subject id arrives
/// on the route, the entitlement service is mocked, and MediatR is never reached
/// (the rejection short-circuits before the query).
/// </summary>
public sealed class CoursesControllerProblemDetailsTests
{
    private readonly Mock<ISender> _mediator = new(MockBehavior.Strict);
    private readonly Mock<ISignedEntitlementService> _entitlements = new();
    private readonly Mock<ISecurityAuditWriter> _audit = new();

    private CoursesController CreateController()
    {
        _audit
            .Setup(writer => writer.LogSecurityEventAsync(
                It.IsAny<Guid?>(), It.IsAny<Guid?>(), It.IsAny<SecurityEventType>(), It.IsAny<SecuritySeverity>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var controller = new CoursesController(_mediator.Object, _entitlements.Object, _audit.Object);
        var context = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", Guid.NewGuid().ToString()) }, "test")),
        };
        context.Request.Headers["X-Entitlement"] = "signed.entitlement.token";
        context.Request.Headers["X-Installation-Id"] = "unit-test-installation";
        controller.ControllerContext = new ControllerContext { HttpContext = context };
        return controller;
    }

    private void SetupInvalidValidation(string failureReason) =>
        _entitlements
            .Setup(service => service.ValidateAsync(
                It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SignedEntitlementValidationResult(false, failureReason, null));

    [Theory]
    [InlineData("Subject is outside the entitlement scope.")]
    [InlineData("Entitlement device mismatch.")]
    public async Task RejectedCourseAccess_Returns403ProblemDetails_CarryingTheReason(string failureReason)
    {
        var controller = CreateController();
        SetupInvalidValidation(failureReason);

        var result = await controller.GetSubjectCourses(Guid.NewGuid(), CancellationToken.None);

        var objectResult = result.Should().BeOfType<ObjectResult>().Subject;
        objectResult.StatusCode.Should().Be(403);
        var problem = objectResult.Value.Should().BeOfType<ProblemDetails>().Subject;
        problem.Detail.Should().Be(failureReason,
            "the reason string is the whole point — the UI taxonomy and the audit trail depend on it");
    }

    [Fact]
    public async Task RejectedCourseAccess_StillWritesTheAuditEvent_WithTheReason()
    {
        var controller = CreateController();
        SetupInvalidValidation("Subject is outside the entitlement scope.");

        await controller.GetSubjectCourses(Guid.NewGuid(), CancellationToken.None);

        _audit.Verify(
            writer => writer.LogSecurityEventAsync(
                It.IsAny<Guid?>(), It.IsAny<Guid?>(), SecurityEventType.EntitlementDenied, SecuritySeverity.Warning,
                It.Is<string>(description => description.Contains("Subject is outside the entitlement scope")),
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()),
            Times.Once,
            "the R69 §2.C audit contract must survive the ProblemDetails change");
        _mediator.VerifyNoOtherCalls();
    }
}
