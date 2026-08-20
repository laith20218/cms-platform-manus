using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;

namespace CMS.Tests.Integration;

public sealed class Phase45TrustedOfflineContractVectorTests
{
    [Fact]
    public void BackendTrustedEnvelope_GeneratesAndroidJvmContractVector()
    {
        using var manifestSigner = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        using var deviceKey = RSA.Create(2048);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Offline:KeyWrappingKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(value => (byte)value).ToArray()),
            ["Security:Offline:ManifestSigningKey"] = Convert.ToBase64String(Enumerable.Range(33, 32).Select(value => (byte)value).ToArray()),
            ["Security:Offline:ManifestSigningPrivateKeyPkcs8"] = Convert.ToBase64String(manifestSigner.ExportPkcs8PrivateKey())
        }).Build();
        var service = new OfflinePackageCryptoService(configuration);
        var issuedAt = DateTime.SpecifyKind(DateTime.UtcNow.AddMinutes(-1).AddTicks(-(DateTime.UtcNow.Ticks % TimeSpan.TicksPerSecond)), DateTimeKind.Utc);
        var plaintext = Encoding.UTF8.GetBytes("phase45 trusted Android contract vector");
        var package = service.Encrypt(
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            "android-phase45-contract-installation",
            1,
            new[] { Guid.Parse("22222222-2222-2222-2222-222222222222") },
            issuedAt,
            issuedAt.AddHours(1),
            plaintext,
            Convert.ToBase64String(deviceKey.ExportSubjectPublicKeyInfo()));

        service.VerifyManifest(package.Manifest).Should().BeTrue();
        var vector = new
        {
            manifestSigningPublicKeySpkiBase64 = Convert.ToBase64String(manifestSigner.ExportSubjectPublicKeyInfo()),
            testOnlyDevicePrivateKeyPkcs8Base64 = Convert.ToBase64String(deviceKey.ExportPkcs8PrivateKey()),
            expectedPlaintextBase64 = Convert.ToBase64String(plaintext),
            canonicalForAad = JsonSerializer.Serialize(new { package.Manifest.PackageId, package.Manifest.UserId, package.Manifest.InstallationId, package.Manifest.ContentVersion, AllowedSubjects = package.Manifest.AllowedSubjects.OrderBy(id => id), package.Manifest.IssuedAt, package.Manifest.ExpiresAt, package.Manifest.NonceBase64Url, AadHashBase64Url = string.Empty }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }),
            canonicalForSignature = JsonSerializer.Serialize(new { package.Manifest.PackageId, package.Manifest.UserId, package.Manifest.InstallationId, package.Manifest.ContentVersion, AllowedSubjects = package.Manifest.AllowedSubjects.OrderBy(id => id), package.Manifest.IssuedAt, package.Manifest.ExpiresAt, package.Manifest.NonceBase64Url, package.Manifest.AadHashBase64Url }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }),
            envelope = new
            {
                manifest = package.Manifest,
                ciphertextBase64Url = package.CiphertextBase64Url,
                tagBase64Url = package.TagBase64Url,
                wrappedKeyBase64Url = package.WrappedKeyBase64Url,
                keyReleaseToken = package.KeyReleaseToken
            }
        };
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !string.Equals(directory.Name, "CMS_Source", StringComparison.Ordinal)) directory = directory.Parent;
        if (directory is null) throw new InvalidOperationException("CMS_Source root was not found from the test host directory.");
        var path = Path.Combine(directory.FullName, "apps", "android", "app", "src", "test", "resources", "phase45_trusted_contract_vector.json");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(vector, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true }));
        File.Exists(path).Should().BeTrue();
    }
}
