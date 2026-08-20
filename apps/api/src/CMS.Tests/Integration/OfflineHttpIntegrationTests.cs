using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using CMS.Application.DTOs.Offline;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CMS.Tests.Integration;

[Collection("OfflineHttp")]
public sealed class OfflineHttpIntegrationTests : IClassFixture<OfflineHttpFactory>
{
    private readonly OfflineHttpFactory _factory;

    public OfflineHttpIntegrationTests(OfflineHttpFactory factory) => _factory = factory;

    [Fact]
    public async Task Download_ValidEntitlement_ReturnsEncryptedEnvelopeWithoutPlaintextOrRawKey()
    {
        const string installation = "phase45-success-installation";
        await _factory.EnsureInstallationActiveAsync(installation);
        var token = _factory.CreateSignedToken(installation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var response = await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "issue-success"));

        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = body.RootElement;
        root.TryGetProperty("manifest", out _).Should().BeTrue();
        root.TryGetProperty("ciphertextBase64Url", out var ciphertext).Should().BeTrue();
        root.TryGetProperty("tagBase64Url", out var tag).Should().BeTrue();
        root.TryGetProperty("wrappedKeyBase64Url", out var wrappedKey).Should().BeTrue();
        root.TryGetProperty("keyReleaseToken", out var releaseToken).Should().BeTrue();
        ciphertext.GetString().Should().NotBeNullOrWhiteSpace();
        tag.GetString().Should().NotBeNullOrWhiteSpace();
        wrappedKey.GetString().Should().NotBeNullOrWhiteSpace();
        releaseToken.GetString().Should().NotBeNullOrWhiteSpace();
        root.TryGetProperty("questions", out _).Should().BeFalse();
        var serialized = root.GetRawText().ToLowerInvariant();
        serialized.Should().NotContain("encryptionkey")
            .And.NotContain("rawkey")
            .And.NotContain("correct answer");
    }

    [Fact]
    public async Task Download_TrustedDeviceKey_ReturnsRsaOaepWrappedKeyBoundToSubmittedPublicKey()
    {
        const string installation = "phase45-trusted-rsa-installation";
        using var deviceKey = RSA.Create(2048);
        var devicePublicKeySpki = Convert.ToBase64String(deviceKey.ExportSubjectPublicKeyInfo());
        await _factory.EnsureInstallationActiveAsync(installation);
        var token = _factory.CreateSignedToken(installation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var response = await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "trusted-rsa-download", devicePublicKeySpki));

        response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var wrapped = OfflineHttpFactory.Base64UrlDecode(body.RootElement.GetProperty("wrappedKeyBase64Url").GetString()!);
        wrapped.Length.Should().BeGreaterThan(128);
        var packageKey = deviceKey.Decrypt(wrapped, RSAEncryptionPadding.OaepSHA256);
        packageKey.Length.Should().Be(32);
        (await _factory.GetInstallationPublicKeyAsync(installation)).Should().Be(devicePublicKeySpki);
    }

    [Fact]
    public async Task Download_TrustedClientGate_DifferentKeyForBoundInstallationIsForbiddenBeforePackageCreation()
    {
        const string installation = "phase45-key-mismatch-installation";
        await _factory.EnsureInstallationActiveAsync(installation);
        var token = _factory.CreateSignedToken(installation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        (await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "bind-original-key"))).StatusCode.Should().Be(HttpStatusCode.OK);
        var before = await _factory.PackageCountAsync();
        using var differentKey = RSA.Create(2048);
        var response = await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "replace-bound-key", Convert.ToBase64String(differentKey.ExportSubjectPublicKeyInfo())));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _factory.PackageCountAsync()).Should().Be(before);
    }

    [Fact]
    public async Task Download_TrustedClientGate_MissingDevicePublicKeyIsForbiddenBeforePackageCreation()
    {
        const string installation = "phase45-missing-device-key-installation";
        await _factory.EnsureInstallationActiveAsync(installation);
        var token = _factory.CreateSignedToken(installation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var before = await _factory.PackageCountAsync();
        var response = await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "missing-device-key", null, includeDevicePublicKey: false));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _factory.PackageCountAsync()).Should().Be(before);
    }

    [Fact]
    public async Task Download_MissingEntitlement_IsUnauthorizedBeforePackageCreation()
    {
        var before = await _factory.PackageCountAsync();
        var response = await _factory.Client.SendAsync(_factory.DownloadRequest(null, "phase45-missing-installation", "missing-entitlement"));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await _factory.PackageCountAsync()).Should().Be(before);
    }

    [Fact]
    public async Task Download_ExpiredTamperedDifferentDeviceAndOutOfScopeEntitlement_AreForbiddenBeforePackageCreation()
    {
        var before = await _factory.PackageCountAsync();
        const string expiredInstallation = "phase45-expired-installation";
        const string tamperedInstallation = "phase45-tampered-installation";
        const string scopeInstallation = "phase45-scope-installation";
        await _factory.EnsureInstallationActiveAsync(scopeInstallation);
        var expired = _factory.CreateSignedToken(expiredInstallation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-30), DateTime.UtcNow.AddMinutes(-1));
        var valid = _factory.CreateSignedToken(OfflineHttpFactory.InstallationA, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var tamperedSource = _factory.CreateSignedToken(tamperedInstallation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var tampered = (tamperedSource[0] == 'A' ? "B" : "A") + tamperedSource[1..];
        var outOfScope = _factory.CreateSignedToken(scopeInstallation, new[] { Guid.NewGuid() }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));

        (await _factory.Client.SendAsync(_factory.DownloadRequest(expired, expiredInstallation, "expired-entitlement"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _factory.Client.SendAsync(_factory.DownloadRequest(tampered, tamperedInstallation, "tampered-entitlement"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _factory.Client.SendAsync(_factory.DownloadRequest(valid, OfflineHttpFactory.InstallationB, "different-installation"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _factory.Client.SendAsync(_factory.DownloadRequest(outOfScope, scopeInstallation, "out-of-scope"))).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await _factory.PackageCountAsync()).Should().Be(before);
    }

    [Fact]
    public async Task Download_SameIdempotencyKey_ReturnsSamePackageAndCreatesOneRecord()
    {
        const string installation = "phase45-idempotency-installation";
        await _factory.EnsureInstallationActiveAsync(installation);
        var token = _factory.CreateSignedToken(installation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var before = await _factory.PackageCountAsync();
        var first = await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "stable-idempotency"));
        var second = await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "stable-idempotency"));

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        second.StatusCode.Should().Be(HttpStatusCode.OK);
        var firstBody = JsonDocument.Parse(await first.Content.ReadAsStringAsync()).RootElement;
        var secondBody = JsonDocument.Parse(await second.Content.ReadAsStringAsync()).RootElement;
        firstBody.GetProperty("packageId").GetGuid().Should().Be(secondBody.GetProperty("packageId").GetGuid());
        (await _factory.PackageCountAsync()).Should().Be(before + 1);
    }

    [Fact]
    public async Task DeleteThenSync_RevokedPackageIsForbiddenAndDoesNotCreateAttempts()
    {
        const string installation = "phase45-revocation-installation";
        await _factory.EnsureInstallationActiveAsync(installation);
        var token = _factory.CreateSignedToken(installation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issued = await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "revoke-before-sync"));
        issued.StatusCode.Should().Be(HttpStatusCode.OK);
        var packageId = JsonDocument.Parse(await issued.Content.ReadAsStringAsync()).RootElement.GetProperty("packageId").GetGuid();

        var delete = await _factory.Client.SendAsync(_factory.AuthenticatedRequest(HttpMethod.Delete, $"/api/v1/offline/packages/{packageId}", null, installation));
        delete.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var sync = await _factory.Client.SendAsync(_factory.AuthenticatedRequest(HttpMethod.Post, "/api/v1/offline/sync", new SyncOfflineAnswersDto(packageId, null, new List<OfflineAnswerDto>()), installation));

        sync.StatusCode.Should().Be(HttpStatusCode.Forbidden, await sync.Content.ReadAsStringAsync());
        (await _factory.AttemptCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task PackageStatus_OwnedInstallationReportsActiveThenRevokedWithoutEnvelope()
    {
        const string installation = "phase45-status-installation";
        await _factory.EnsureInstallationActiveAsync(installation);
        var token = _factory.CreateSignedToken(installation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issued = await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "status-package"));
        issued.StatusCode.Should().Be(HttpStatusCode.OK);
        var packageId = JsonDocument.Parse(await issued.Content.ReadAsStringAsync()).RootElement.GetProperty("packageId").GetGuid();

        var active = await _factory.Client.SendAsync(_factory.AuthenticatedRequest(HttpMethod.Get, $"/api/v1/offline/packages/{packageId}/status", null, installation));
        active.StatusCode.Should().Be(HttpStatusCode.OK);
        var activeBody = JsonDocument.Parse(await active.Content.ReadAsStringAsync()).RootElement;
        activeBody.GetProperty("status").GetString().Should().Be("active");
        activeBody.TryGetProperty("ciphertextBase64Url", out _).Should().BeFalse();
        activeBody.TryGetProperty("wrappedKeyBase64Url", out _).Should().BeFalse();

        (await _factory.Client.SendAsync(_factory.AuthenticatedRequest(HttpMethod.Delete, $"/api/v1/offline/packages/{packageId}", null, installation))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var revoked = await _factory.Client.SendAsync(_factory.AuthenticatedRequest(HttpMethod.Get, $"/api/v1/offline/packages/{packageId}/status", null, installation));
        revoked.StatusCode.Should().Be(HttpStatusCode.OK);
        JsonDocument.Parse(await revoked.Content.ReadAsStringAsync()).RootElement.GetProperty("status").GetString().Should().Be("revoked");
    }

    [Fact]
    public async Task Sync_OtherStudentsPackage_IsForbiddenBeforePersistence()
    {
        var foreignPackageId = await _factory.IssueForeignPackageAsync();
        var sync = await _factory.Client.SendAsync(_factory.AuthenticatedRequest(HttpMethod.Post, "/api/v1/offline/sync", new SyncOfflineAnswersDto(foreignPackageId, null, new List<OfflineAnswerDto>()), "phase45-foreign-sync-installation"));

        sync.StatusCode.Should().Be(HttpStatusCode.Forbidden, await sync.Content.ReadAsStringAsync());
        (await _factory.AttemptCountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Sync_AnswerOutsideManifestScope_IsRejectedFromPersistence()
    {
        const string installation = "phase45-sync-scope-installation";
        await _factory.EnsureInstallationActiveAsync(installation);
        var token = _factory.CreateSignedToken(installation, new[] { _factory.SubjectId }, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(10));
        var issued = await _factory.Client.SendAsync(_factory.DownloadRequest(token, installation, "manifest-scope-sync"));
        issued.StatusCode.Should().Be(HttpStatusCode.OK);
        var packageId = JsonDocument.Parse(await issued.Content.ReadAsStringAsync()).RootElement.GetProperty("packageId").GetGuid();

        var sync = await _factory.Client.SendAsync(_factory.AuthenticatedRequest(HttpMethod.Post, "/api/v1/offline/sync", new SyncOfflineAnswersDto(packageId, null,
            new List<OfflineAnswerDto> { new(_factory.OutOfScopeQuestionId, Guid.NewGuid().ToString(), 5, DateTime.UtcNow, false) }), installation));

        sync.StatusCode.Should().Be(HttpStatusCode.OK, await sync.Content.ReadAsStringAsync());
        var result = await sync.Content.ReadFromJsonAsync<SyncResultDto>();
        result!.SuccessCount.Should().Be(0);
        result.FailedCount.Should().Be(1);
        (await _factory.AttemptCountAsync()).Should().Be(0);
    }
}

[CollectionDefinition("OfflineHttp", DisableParallelization = true)]
public sealed class OfflineHttpCollection;

public sealed class OfflineHttpFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    internal const string InstallationA = "phase45-offline-installation-a";
    internal const string InstallationB = "phase45-offline-installation-b";
    private const string EntitlementKey = "phase45-offline-entitlement-test-key";
    private readonly string _databaseName = $"cms-phase45-offline-{Guid.NewGuid():N}";
    private readonly ServiceProvider _inMemoryEfServices = new ServiceCollection().AddEntityFrameworkInMemoryDatabase().BuildServiceProvider();
    private readonly ConcurrentDictionary<string, object?> _cache = new();
    private readonly Dictionary<string, string?> _originalEnvironment = new();
    private readonly ECDsa _manifestSigner = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private readonly RSA _defaultDeviceKey = RSA.Create(2048);

    public OfflineHttpFactory()
    {
        SetTestEnvironment("Jwt__Secret", "phase45-offline-jwt-signing-key-not-production");
        SetTestEnvironment("Jwt__Issuer", "phase45-offline-tests");
        SetTestEnvironment("Jwt__Audience", "phase45-offline-tests");
        SetTestEnvironment("Security__Entitlements__SigningKey", EntitlementKey);
        SetTestEnvironment("Security__Entitlements__LifetimeMinutes", "20");
        SetTestEnvironment("Security__Offline__KeyWrappingKey", Convert.ToBase64String(Enumerable.Range(1, 32).Select(value => (byte)value).ToArray()));
        SetTestEnvironment("Security__Offline__ManifestSigningKey", Convert.ToBase64String(Enumerable.Range(33, 32).Select(value => (byte)value).ToArray()));
        SetTestEnvironment("Security__Offline__ManifestSigningPrivateKeyPkcs8", Convert.ToBase64String(_manifestSigner.ExportPkcs8PrivateKey()));
        SetTestEnvironment("ConnectionStrings__PostgreSQL", "Host=127.0.0.1;Database=offline_http_test;Username=test");
        SetTestEnvironment("ConnectionStrings__Redis", "localhost:6379");
    }

    internal HttpClient Client { get; private set; } = null!;
    internal Guid StudentId { get; private set; }
    internal Guid SubjectId { get; private set; }
    internal Guid OutOfScopeQuestionId { get; private set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:PostgreSQL"] = "Host=127.0.0.1;Database=offline_http_test;Username=test",
            ["ConnectionStrings:Redis"] = "localhost:6379",
            ["Jwt:Secret"] = "phase45-offline-jwt-signing-key-not-production",
            ["Jwt:Issuer"] = "phase45-offline-tests",
            ["Jwt:Audience"] = "phase45-offline-tests",
            ["Security:Entitlements:SigningKey"] = EntitlementKey,
            ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Security:Offline:KeyWrappingKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(value => (byte)value).ToArray()),
            ["Security:Offline:ManifestSigningKey"] = Convert.ToBase64String(Enumerable.Range(33, 32).Select(value => (byte)value).ToArray()),
            ["Security:Offline:ManifestSigningPrivateKeyPkcs8"] = Convert.ToBase64String(_manifestSigner.ExportPkcs8PrivateKey()),
            ["Features:OfflineEnabled"] = "true",
            ["Features:OfflineAesGcmImplemented"] = "true",
            ["Features:OfflineManifestImplemented"] = "true",
            ["Features:OfflineKeyReleaseImplemented"] = "true",
            ["Features:OfflinePackageIssuanceImplemented"] = "true",
            ["Features:OfflineTrustedClientImplemented"] = "true",
            ["Security:Audit:BatchSize"] = "50",
            ["Security:Audit:FlushSeconds"] = "60",
            ["Security:Audit:QueueCapacity"] = "100"
        }));
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.RemoveAll<ApplicationDbContext>();
            services.RemoveAll<IApplicationDbContext>();
            services.AddDbContext<ApplicationDbContext>(options => options.UseInMemoryDatabase(_databaseName).UseInternalServiceProvider(_inMemoryEfServices));
            services.AddScoped<IApplicationDbContext>(provider => provider.GetRequiredService<ApplicationDbContext>());
            services.RemoveAll<ICacheService>();
            services.AddSingleton<ICacheService>(new OfflineHttpCache(_cache));
            services.RemoveAll<ISessionService>();
            var sessions = new Moq.Mock<ISessionService>();
            sessions.Setup(service => service.IsActiveAsync(Moq.It.IsAny<Guid>(), Moq.It.IsAny<int>(), Moq.It.IsAny<string>(), Moq.It.IsAny<CancellationToken>())).Returns(Task.FromResult(true));
            services.AddScoped<ISessionService>(_ => sessions.Object);
            services.AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = OfflineHttpAuthenticationHandler.Scheme;
                options.DefaultChallengeScheme = OfflineHttpAuthenticationHandler.Scheme;
            }).AddScheme<AuthenticationSchemeOptions, OfflineHttpAuthenticationHandler>(OfflineHttpAuthenticationHandler.Scheme, _ => { });
        });
    }

    public async Task InitializeAsync()
    {
        Client = CreateClient();
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var university = University.Create("جامعة Phase45", "phase45-university", "Phase45 University");
        var college = College.Create(university.Id, "كلية Phase45", "phase45-college", "Phase45 College");
        var year = AcademicYear.Create(college.Id, "السنة الأولى", "phase45-year", 1);
        var semester = Semester.Create(year.Id, "الفصل الأول", "phase45-semester", 1);
        var subject = Subject.Create(semester.Id, "مادة Phase45", "phase45-subject", "Phase45 Subject");
        var outsideSubject = Subject.Create(semester.Id, "مادة خارج الحزمة", "phase45-outside", "Outside Package Subject");
        var student = Student.Create("0990005678", "phase45-hash", "طالب Phase45");
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();
        var adminRole = AdminRole.Create("phase45-content-admin", "مدير محتوى Phase45");
        var admin = Admin.Create("phase45-admin@cms.test", "hash", "مدير Phase45", adminRole.Id);
        var question = Question.Create("Question in encrypted package", QuestionType.Mcq, subject.Id, null, Difficulty.Easy, new List<string>(), admin.Id);
        question.AddOption("Correct answer", true);
        question.AddOption("Wrong answer", false);
        question.UpdateExplanation("Encrypted package fixture explanation.");
        question.Publish();
        var outOfScopeQuestion = Question.Create("Question outside encrypted package", QuestionType.Mcq, outsideSubject.Id, null, Difficulty.Easy, new List<string>(), admin.Id);
        outOfScopeQuestion.AddOption("Outside correct", true);
        outOfScopeQuestion.AddOption("Outside wrong", false);
        outOfScopeQuestion.UpdateExplanation("Out of scope fixture explanation.");
        outOfScopeQuestion.Publish();
        db.AddRange(university, college, year, semester, subject, outsideSubject, student, adminRole, admin, question, outOfScopeQuestion);
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student.Id, DeviceFingerprint = InstallationA, IsActive = true });
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = student.Id, ScopeType = SubscriptionScopeType.Subject, ScopeSubjectId = subject.Id,
            Status = SubscriptionStatus.Active, StartsAt = DateTime.UtcNow.AddMinutes(-1), ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        await db.SaveChangesAsync();
        StudentId = student.Id;
        SubjectId = subject.Id;
        OutOfScopeQuestionId = outOfScopeQuestion.Id;
    }

    public new async Task DisposeAsync()
    {
        Client?.Dispose();
        await base.DisposeAsync();
        await _inMemoryEfServices.DisposeAsync();
        _manifestSigner.Dispose();
        _defaultDeviceKey.Dispose();
        foreach (var (key, value) in _originalEnvironment)
            Environment.SetEnvironmentVariable(key, value);
    }

    internal HttpRequestMessage DownloadRequest(string? entitlement, string installationId, string idempotencyKey, string? offlinePackagePublicKeySpki = null, bool includeDevicePublicKey = true)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/offline/download") { Content = JsonContent.Create(new { subjectId = SubjectId }) };
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", StudentId.ToString());
        request.Headers.TryAddWithoutValidation("X-Installation-Id", installationId);
        request.Headers.TryAddWithoutValidation("X-Idempotency-Key", idempotencyKey);
        if (includeDevicePublicKey) request.Headers.TryAddWithoutValidation("X-Offline-Package-Public-Key", offlinePackagePublicKeySpki ?? Convert.ToBase64String(_defaultDeviceKey.ExportSubjectPublicKeyInfo()));
        if (!string.IsNullOrWhiteSpace(entitlement)) request.Headers.TryAddWithoutValidation("X-Entitlement", entitlement);
        return request;
    }

    internal HttpRequestMessage AuthenticatedRequest(HttpMethod method, string path, object? body, string installationId)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.TryAddWithoutValidation("X-Test-Student-Id", StudentId.ToString());
        request.Headers.TryAddWithoutValidation("X-Installation-Id", installationId);
        if (body is not null) request.Content = JsonContent.Create(body);
        return request;
    }

    internal string CreateSignedToken(string installationId, IReadOnlyList<Guid> subjects, DateTime issuedAt, DateTime expiresAt)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new { userId = StudentId, deviceId = installationId, universityId = (Guid?)null, collegeId = (Guid?)null, allowedYears = Array.Empty<Guid>(), allowedSemesters = Array.Empty<Guid>(), allowedSubjects = subjects, issuedAt, expiresAt, version = 1 }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var signature = HMACSHA256.HashData(Encoding.UTF8.GetBytes(EntitlementKey), payload);
        return $"{Base64Url(payload)}.{Base64Url(signature)}";
    }

    internal async Task<Guid> IssueForeignPackageAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var foreign = Student.Create("0990006789", "phase45-foreign-hash", "طالب آخر Phase45");
        foreign.VerifyPhone();
        db.Students.Add(foreign);
        await db.SaveChangesAsync();
        var lifecycle = scope.ServiceProvider.GetRequiredService<IOfflinePackageLifecycleService>();
        var package = await lifecycle.IssueAsync(foreign.Id, "phase45-foreign-installation", 1, Guid.NewGuid().ToString("N"), new[] { SubjectId }, DateTime.UtcNow.AddDays(1), Encoding.UTF8.GetBytes("foreign-payload"));
        return package.Manifest.PackageId;
    }

    internal async Task EnsureInstallationActiveAsync(string installationId)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        if (!await db.DeviceBindings.AnyAsync(binding => binding.StudentId == StudentId && binding.DeviceFingerprint == installationId))
        {
            db.DeviceBindings.Add(new DeviceBinding { StudentId = StudentId, DeviceFingerprint = installationId, IsActive = true });
            await db.SaveChangesAsync();
        }
    }

    internal async Task<string?> GetInstallationPublicKeyAsync(string installationId)
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().DeviceBindings
            .Where(binding => binding.StudentId == StudentId && binding.DeviceFingerprint == installationId)
            .Select(binding => binding.OfflinePackagePublicKeySpki).SingleOrDefaultAsync();
    }

    internal async Task<int> PackageCountAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().OfflinePackageRecords.CountAsync();
    }

    internal async Task<int> AttemptCountAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().AttemptLogs.CountAsync();
    }

    private void SetTestEnvironment(string key, string value)
    {
        _originalEnvironment[key] = Environment.GetEnvironmentVariable(key);
        Environment.SetEnvironmentVariable(key, value);
    }

    internal static byte[] Base64UrlDecode(string value) => Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/') + new string('=', (4 - value.Length % 4) % 4));
    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

internal sealed class OfflineHttpCache : ICacheService
{
    private readonly ConcurrentDictionary<string, object?> _values;
    public OfflineHttpCache(ConcurrentDictionary<string, object?> values) => _values = values;
    public Task<T?> GetAsync<T>(string key, CancellationToken ct = default) => Task.FromResult(_values.TryGetValue(key, out var value) && value is T typed ? typed : default);
    public Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default)
    {
        _values.TryRemove(key, out var value);
        return Task.FromResult(value is T typed ? typed : default);
    }
    public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default) { _values[key] = value; return Task.CompletedTask; }
    public Task RemoveAsync(string key, CancellationToken ct = default) { _values.TryRemove(key, out _); return Task.CompletedTask; }
    public Task RemoveByPatternAsync(string pattern, CancellationToken ct = default) { foreach (var key in _values.Keys.Where(key => key.Contains(pattern.Trim('*')))) _values.TryRemove(key, out _); return Task.CompletedTask; }
}

internal sealed class OfflineHttpAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    internal new const string Scheme = "Phase45OfflineTest";
    public OfflineHttpAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, ISystemClock clock) : base(options, logger, encoder, clock) { }
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Guid.TryParse(Request.Headers["X-Test-Student-Id"].FirstOrDefault(), out var studentId)) return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new ClaimsIdentity(Scheme);
        identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, studentId.ToString()));
        identity.AddClaim(new Claim("sub", studentId.ToString()));
        identity.AddClaim(new Claim(ClaimTypes.Role, "student"));
        identity.AddClaim(new Claim("sid", "11111111-1111-1111-1111-111111111111"));
        identity.AddClaim(new Claim("installation_id", Request.Headers["X-Installation-Id"].FirstOrDefault() ?? OfflineHttpFactory.InstallationA));
        identity.AddClaim(new Claim("tv", "0"));
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme)));
    }
}
