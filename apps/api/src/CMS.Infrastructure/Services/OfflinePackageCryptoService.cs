using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CMS.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace CMS.Infrastructure.Services;

public sealed class OfflinePackageCryptoService : IOfflinePackageCryptoService
{
    private const int KeyBytes = 32;
    private const int NonceBytes = 12;
    private const int TagBytes = 16;
    private readonly byte[] _wrappingKey;
    private readonly byte[] _manifestKey;
    private readonly byte[]? _manifestSigningPrivateKeyPkcs8;

    public OfflinePackageCryptoService(IConfiguration configuration)
    {
        _wrappingKey = ReadKey(configuration["Security:Offline:KeyWrappingKey"], "Security:Offline:KeyWrappingKey");
        _manifestKey = ReadKey(configuration["Security:Offline:ManifestSigningKey"], "Security:Offline:ManifestSigningKey");
        _manifestSigningPrivateKeyPkcs8 = ReadOptionalPrivateKey(configuration["Security:Offline:ManifestSigningPrivateKeyPkcs8"]);
    }

    public OfflineEncryptedPackage Encrypt(
        Guid userId,
        string installationId,
        int contentVersion,
        IReadOnlyList<Guid> allowedSubjects,
        DateTime issuedAt,
        DateTime expiresAt,
        ReadOnlySpan<byte> plaintext,
        string? devicePublicKeySpki = null)
    {
        if (userId == Guid.Empty || string.IsNullOrWhiteSpace(installationId)) throw new ArgumentException("Ownership is required");
        if (contentVersion < 1 || expiresAt <= issuedAt) throw new ArgumentException("Invalid package version or expiry");
        if (!string.IsNullOrWhiteSpace(devicePublicKeySpki) && _manifestSigningPrivateKeyPkcs8 is null)
            throw new InvalidOperationException("Trusted offline issuance requires Security:Offline:ManifestSigningPrivateKeyPkcs8");
        if (expiresAt > issuedAt.AddDays(7)) throw new ArgumentException("Offline expiry exceeds policy");

        var packageId = Guid.NewGuid();
        var nonce = RandomNumberGenerator.GetBytes(NonceBytes);
        var packageKey = RandomNumberGenerator.GetBytes(KeyBytes);
        var provisional = new OfflinePackageManifest(packageId, userId, installationId, contentVersion,
            allowedSubjects.OrderBy(id => id).ToArray(), issuedAt, expiresAt, B64(nonce), string.Empty, string.Empty);
        var aad = Encoding.UTF8.GetBytes(Canonical(provisional with { AadHashBase64Url = string.Empty, SignatureBase64Url = string.Empty }));
        var aadHash = B64(SHA256.HashData(aad));
        var manifest = provisional with { AadHashBase64Url = aadHash };
        var signedManifest = manifest with { SignatureBase64Url = Sign(manifest) };
        var finalAad = Encoding.UTF8.GetBytes(Canonical(signedManifest with { SignatureBase64Url = string.Empty }));

        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagBytes];
        using (var aes = new AesGcm(packageKey, TagBytes)) aes.Encrypt(nonce, plaintext, ciphertext, tag, finalAad);

        byte[] wrapped;
        if (string.IsNullOrWhiteSpace(devicePublicKeySpki))
        {
            // Legacy test-only path. Production trusted Offline requires a device Keystore public key.
            var wrapNonce = RandomNumberGenerator.GetBytes(NonceBytes);
            var wrappedCiphertext = new byte[KeyBytes];
            var wrappedTag = new byte[TagBytes];
            using (var aes = new AesGcm(_wrappingKey, TagBytes)) aes.Encrypt(wrapNonce, packageKey, wrappedCiphertext, wrappedTag, finalAad);
            wrapped = wrapNonce.Concat(wrappedCiphertext).Concat(wrappedTag).ToArray();
        }
        else
        {
            try
            {
                using var deviceKey = RSA.Create();
                var spki = Convert.FromBase64String(devicePublicKeySpki);
                deviceKey.ImportSubjectPublicKeyInfo(spki, out var consumed);
                if (consumed != spki.Length || deviceKey.KeySize < 2048) throw new CryptographicException("Invalid offline device public key");
                wrapped = deviceKey.Encrypt(packageKey, RSAEncryptionPadding.OaepSHA256);
            }
            catch (FormatException exception) { throw new CryptographicException("Invalid offline device public key", exception); }
        }
        var releaseToken = SignRelease(signedManifest, B64(wrapped));

        return new OfflineEncryptedPackage(signedManifest, B64(ciphertext), B64(tag), B64(wrapped), releaseToken);
    }

    public byte[] ReleaseKey(OfflineEncryptedPackage package, Guid expectedUserId, string expectedInstallationId, DateTime utcNow)
    {
        var manifest = package.Manifest;
        if (!VerifyManifest(manifest) || manifest.UserId != expectedUserId || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(manifest.InstallationId), Encoding.UTF8.GetBytes(expectedInstallationId)) ||
            utcNow >= manifest.ExpiresAt || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(package.KeyReleaseToken), Encoding.UTF8.GetBytes(SignRelease(manifest, package.WrappedKeyBase64Url))))
            throw new UnauthorizedAccessException("Offline key release denied");

        var wrapped = FromB64(package.WrappedKeyBase64Url);
        if (wrapped.Length != NonceBytes + KeyBytes + TagBytes) throw new CryptographicException("Invalid wrapped key");
        var finalAad = Encoding.UTF8.GetBytes(Canonical(manifest with { SignatureBase64Url = string.Empty }));
        var key = new byte[KeyBytes];
        using var aes = new AesGcm(_wrappingKey, TagBytes);
        aes.Decrypt(wrapped.AsSpan(0, NonceBytes), wrapped.AsSpan(NonceBytes, KeyBytes), wrapped.AsSpan(wrapped.Length - TagBytes, TagBytes), key, finalAad);
        return key;
    }

    public byte[] Decrypt(OfflineEncryptedPackage package, ReadOnlySpan<byte> packageKey)
    {
        if (packageKey.Length != KeyBytes || !VerifyManifest(package.Manifest)) throw new CryptographicException("Invalid package key or manifest");
        var nonce = FromB64(package.Manifest.NonceBase64Url);
        var ciphertext = FromB64(package.CiphertextBase64Url);
        var tag = FromB64(package.TagBase64Url);
        var plaintext = new byte[ciphertext.Length];
        var aad = Encoding.UTF8.GetBytes(Canonical(package.Manifest with { SignatureBase64Url = string.Empty }));
        using var aes = new AesGcm(packageKey, TagBytes);
        aes.Decrypt(nonce, ciphertext, tag, plaintext, aad);
        return plaintext;
    }

    public bool VerifyManifest(OfflinePackageManifest manifest)
    {
        if (manifest.PackageId == Guid.Empty || manifest.UserId == Guid.Empty || string.IsNullOrWhiteSpace(manifest.InstallationId) ||
            manifest.ContentVersion < 1 || manifest.ExpiresAt <= manifest.IssuedAt || manifest.ExpiresAt > manifest.IssuedAt.AddDays(7)) return false;
        try
        {
            var nonce = FromB64(manifest.NonceBase64Url);
            var expectedHash = B64(SHA256.HashData(Encoding.UTF8.GetBytes(Canonical(manifest with { AadHashBase64Url = string.Empty, SignatureBase64Url = string.Empty }))));
            var signature = FromB64(manifest.SignatureBase64Url);
            var canonical = Encoding.UTF8.GetBytes(Canonical(manifest with { SignatureBase64Url = string.Empty }));
            var signatureIsValid = _manifestSigningPrivateKeyPkcs8 is null
                ? CryptographicOperations.FixedTimeEquals(signature, HMACSHA256.HashData(_manifestKey, canonical))
                : VerifyEcdsa(canonical, signature);
            return nonce.Length == NonceBytes && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(manifest.AadHashBase64Url), Encoding.UTF8.GetBytes(expectedHash)) && signatureIsValid;
        }
        catch (FormatException) { return false; }
    }

    private string Sign(OfflinePackageManifest manifest)
    {
        var canonical = Encoding.UTF8.GetBytes(Canonical(manifest with { SignatureBase64Url = string.Empty }));
        if (_manifestSigningPrivateKeyPkcs8 is null) return B64(HMACSHA256.HashData(_manifestKey, canonical));
        using var signer = ECDsa.Create();
        signer.ImportPkcs8PrivateKey(_manifestSigningPrivateKeyPkcs8, out _);
        return B64(signer.SignData(canonical, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence));
    }

    private bool VerifyEcdsa(byte[] canonical, byte[] signature)
    {
        if (_manifestSigningPrivateKeyPkcs8 is null) return false;
        using var signer = ECDsa.Create();
        signer.ImportPkcs8PrivateKey(_manifestSigningPrivateKeyPkcs8, out _);
        return signer.VerifyData(canonical, signature, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
    }
    private string SignRelease(OfflinePackageManifest manifest, string wrapped) => B64(HMACSHA256.HashData(_manifestKey, Encoding.UTF8.GetBytes($"{manifest.PackageId:N}|{manifest.UserId:N}|{manifest.InstallationId}|{manifest.ExpiresAt:O}|{wrapped}")));
    private static string Canonical(OfflinePackageManifest m) => JsonSerializer.Serialize(new { m.PackageId, m.UserId, m.InstallationId, m.ContentVersion, AllowedSubjects = m.AllowedSubjects.OrderBy(id => id), m.IssuedAt, m.ExpiresAt, m.NonceBase64Url, m.AadHashBase64Url }, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
    private static byte[]? ReadOptionalPrivateKey(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        try
        {
            var key = Convert.FromBase64String(value);
            using var signer = ECDsa.Create();
            signer.ImportPkcs8PrivateKey(key, out var consumed);
            if (consumed != key.Length || signer.KeySize < 256) throw new CryptographicException("Invalid ECDSA signing key");
            return key;
        }
        catch (FormatException exception) { throw new InvalidOperationException("Security:Offline:ManifestSigningPrivateKeyPkcs8 must be Base64 PKCS#8", exception); }
    }

    private static byte[] ReadKey(string? value, string name)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new InvalidOperationException($"{name} must be configured");
        var key = Convert.FromBase64String(value);
        if (key.Length != KeyBytes) throw new InvalidOperationException($"{name} must be exactly 32 bytes");
        return key;
    }
    private static string B64(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static byte[] FromB64(string value) => Convert.FromBase64String(value.Replace('-', '+').Replace('_', '/') + new string('=', (4 - value.Length % 4) % 4));
}
