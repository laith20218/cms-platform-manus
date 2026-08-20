using System.Net;
using System.Net.Http.Json;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CMS.Tests.Integration;

[Collection("SignedEntitlementHttp")]
public sealed class StudentSecurityEventsHttpIntegrationTests : IClassFixture<SignedEntitlementHttpFactory>
{
    private readonly SignedEntitlementHttpFactory _factory;

    public StudentSecurityEventsHttpIntegrationTests(SignedEntitlementHttpFactory factory) => _factory = factory;

    [Fact]
    public async Task SecurityEvent_WhitelistedSignal_IsAcceptedAndPersistedWithServerDerivedFields()
    {
        var response = await _factory.Client.SendAsync(SecurityEventRequest("copy_attempt", SignedEntitlementHttpFactory.InstallationA,
            new { eventType = "copy_attempt", severity = "critical", description = "client-controlled text must not persist" }));

        response.StatusCode.Should().Be(HttpStatusCode.Accepted, await response.Content.ReadAsStringAsync());
        await _factory.Services.GetRequiredService<SecurityEventBatchService>().FlushAsync();

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var stored = await db.SecurityLogs
            .Where(log => log.StudentId == _factory.StudentId && log.EventType == SecurityEventType.CopyAttempt)
            .OrderByDescending(log => log.CreatedAt)
            .FirstOrDefaultAsync();

        stored.Should().NotBeNull();
        stored!.Severity.Should().Be(SecuritySeverity.Warning);
        stored.Description.Should().Be("Browser copy or cut action blocked");
        stored.DeviceFingerprint.Should().Be(SignedEntitlementHttpFactory.InstallationA);
    }

    [Fact]
    public async Task SecurityEvent_UnsupportedSignal_IsRejectedBeforeQueueOrPersistence()
    {
        await using var beforeScope = _factory.Services.CreateAsyncScope();
        var beforeDb = beforeScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var beforeCount = await beforeDb.SecurityLogs.CountAsync(log => log.StudentId == _factory.StudentId);

        var response = await _factory.Client.SendAsync(SecurityEventRequest("unsupported-browser-signal", SignedEntitlementHttpFactory.InstallationA));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest, await response.Content.ReadAsStringAsync());
        await _factory.Services.GetRequiredService<SecurityEventBatchService>().FlushAsync();

        await using var afterScope = _factory.Services.CreateAsyncScope();
        var afterDb = afterScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        (await afterDb.SecurityLogs.CountAsync(log => log.StudentId == _factory.StudentId)).Should().Be(beforeCount);
    }

    [Fact]
    public async Task SecurityEvent_SeventhRequestFromSameStudentAndInstallation_IsRateLimited()
    {
        const string installation = "phase48-security-rate-limit";
        var responses = new List<HttpResponseMessage>();
        for (var requestNumber = 0; requestNumber < 7; requestNumber++)
            responses.Add(await _factory.Client.SendAsync(SecurityEventRequest("devtools_detected", installation)));

        responses.Take(6).Should().OnlyContain(response => response.StatusCode == HttpStatusCode.Accepted);
        responses[6].StatusCode.Should().Be(HttpStatusCode.TooManyRequests, await responses[6].Content.ReadAsStringAsync());
        foreach (var response in responses) response.Dispose();
        await _factory.Services.GetRequiredService<SecurityEventBatchService>().FlushAsync();
    }

    private HttpRequestMessage SecurityEventRequest(string eventType, string installation, object? payload = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/security/events")
        {
            Content = JsonContent.Create(payload ?? new { eventType })
        };
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", _factory.StudentId.ToString());
        request.Headers.TryAddWithoutValidation("X-Installation-Id", installation);
        return request;
    }
}
