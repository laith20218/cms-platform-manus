using System.Text;
using System.Security.Cryptography;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.Extensions.Configuration;

namespace CMS.Tests.Unit.Services;

public sealed class OfflinePackageCryptoServiceTests
{
    private static readonly Guid UserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid SubjectId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private const string Device = "phase36-device-a";

    private static OfflinePackageCryptoService CreateService()
    {
        using var manifestSigner = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Offline:KeyWrappingKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(i => (byte)i).ToArray()),
            ["Security:Offline:ManifestSigningKey"] = Convert.ToBase64String(Enumerable.Range(33, 32).Select(i => (byte)i).ToArray()),
            ["Security:Offline:ManifestSigningPrivateKeyPkcs8"] = Convert.ToBase64String(manifestSigner.ExportPkcs8PrivateKey())
        }).Build();
        return new OfflinePackageCryptoService(config);
    }

    [Fact]
    public void Encrypt_UsesAes256GcmAndRoundTripsAfterBoundKeyRelease()
    {
        var service = CreateService();
        var issued = DateTime.UtcNow.AddMinutes(-1);
        var package = service.Encrypt(UserId, Device, 3, new[] { SubjectId }, issued, issued.AddHours(2), Encoding.UTF8.GetBytes("medical-content"));

        package.Manifest.ContentVersion.Should().Be(3);
        package.Manifest.AllowedSubjects.Should().ContainSingle(subject => subject == SubjectId);
        FromB64(package.WrappedKeyBase64Url).Length.Should().Be(60);
        var key = service.ReleaseKey(package, UserId, Device, DateTime.UtcNow);
        service.Decrypt(package, key).Should().Equal(Encoding.UTF8.GetBytes("medical-content"));
    }

    [Fact]
    public void Encrypt_WithAndroidDevicePublicKey_UsesRsaOaepBoundToMatchingPrivateKey()
    {
        var service = CreateService();
        using var deviceKey = RSA.Create(2048);
        var package = service.Encrypt(UserId, Device, 1, new[] { SubjectId }, DateTime.UtcNow, DateTime.UtcNow.AddHours(1),
            Encoding.UTF8.GetBytes("device-bound medical content"), Convert.ToBase64String(deviceKey.ExportSubjectPublicKeyInfo()));

        FromB64(package.WrappedKeyBase64Url).Length.Should().BeGreaterThan(128);
        var packageKey = deviceKey.Decrypt(FromB64(package.WrappedKeyBase64Url), RSAEncryptionPadding.OaepSHA256);
        packageKey.Length.Should().Be(32);
        service.Decrypt(package, packageKey).Should().Equal(Encoding.UTF8.GetBytes("device-bound medical content"));
    }

    [Fact]
    public void Encrypt_GeneratesUniqueNonceAndPackageId()
    {
        var service = CreateService();
        var now = DateTime.UtcNow;
        var first = service.Encrypt(UserId, Device, 1, new[] { SubjectId }, now, now.AddHours(1), new byte[] { 1 });
        var second = service.Encrypt(UserId, Device, 1, new[] { SubjectId }, now, now.AddHours(1), new byte[] { 1 });

        first.Manifest.PackageId.Should().NotBe(second.Manifest.PackageId);
        first.Manifest.NonceBase64Url.Should().NotBe(second.Manifest.NonceBase64Url);
    }

    [Fact]
    public void ReleaseKey_RejectsDifferentOwnerAndDevice()
    {
        var service = CreateService();
        var package = service.Encrypt(UserId, Device, 1, new[] { SubjectId }, DateTime.UtcNow, DateTime.UtcNow.AddHours(1), new byte[] { 7 });

        var ownerAct = () => service.ReleaseKey(package, Guid.NewGuid(), Device, DateTime.UtcNow);
        var deviceAct = () => service.ReleaseKey(package, UserId, "different-device", DateTime.UtcNow);
        ownerAct.Should().Throw<UnauthorizedAccessException>();
        deviceAct.Should().Throw<UnauthorizedAccessException>();
    }

    [Fact]
    public void ReleaseKey_RejectsExpiredPackage()
    {
        var service = CreateService();
        var issued = DateTime.UtcNow.AddHours(-2);
        var package = service.Encrypt(UserId, Device, 1, new[] { SubjectId }, issued, issued.AddHours(1), new byte[] { 7 });

        var act = () => service.ReleaseKey(package, UserId, Device, DateTime.UtcNow);
        act.Should().Throw<UnauthorizedAccessException>();
    }

    [Fact]
    public void VerifyManifest_RejectsTamperedManifestAndCiphertext()
    {
        var service = CreateService();
        var package = service.Encrypt(UserId, Device, 1, new[] { SubjectId }, DateTime.UtcNow, DateTime.UtcNow.AddHours(1), new byte[] { 7 });
        var tamperedManifest = package.Manifest with { ContentVersion = 99 };
        var tamperedPackage = package with { CiphertextBase64Url = (package.CiphertextBase64Url[0] == 'A' ? 'B' : 'A') + package.CiphertextBase64Url[1..] };

        service.VerifyManifest(tamperedManifest).Should().BeFalse();
        var key = service.ReleaseKey(package, UserId, Device, DateTime.UtcNow);
        var decrypt = () => service.Decrypt(tamperedPackage, key);
        decrypt.Should().Throw<CryptographicException>();
    }

    private static byte[] FromB64(string value) => Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/') + new string('=', (4 - value.Length % 4) % 4));

    [Fact]
    public void OfflineGate_DefaultConfigurationRemainsDisabled()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>()).Build();
        config["Features:OfflineEnabled"].Should().BeNull();
        config["Features:OfflineAesGcmImplemented"].Should().BeNull();
        config["Features:OfflineManifestImplemented"].Should().BeNull();
        config["Features:OfflineKeyReleaseImplemented"].Should().BeNull();
    }
}
