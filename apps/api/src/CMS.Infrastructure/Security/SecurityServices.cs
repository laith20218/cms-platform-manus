using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using CMS.Application.Interfaces;

namespace CMS.Infrastructure.Security;

/// <summary>
/// Password hashing service using Argon2id. Existing BCrypt records can still be
/// verified once and are upgraded by the login handler after successful sign-in.
/// </summary>
public sealed class PasswordHasher : IPasswordHasher
{
    private const int SaltLength = 16;
    private const int HashLength = 32;
    private const int Iterations = 3;
    private const int MemorySizeKiB = 65_536;
    private const int Parallelism = 2;

    public string HashPassword(string password)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(password);
        var salt = RandomNumberGenerator.GetBytes(SaltLength);
        var hash = Derive(password, salt);
        return $"$argon2id$v=19$m={MemorySizeKiB},t={Iterations},p={Parallelism}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public bool VerifyPassword(string password, string hash)
    {
        if (string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(hash)) return false;
        if (hash.StartsWith("$2", StringComparison.Ordinal))
            return BCrypt.Net.BCrypt.Verify(password, hash);
        if (!hash.StartsWith("$argon2id$", StringComparison.Ordinal)) return false;

        var parts = hash.Split('$', StringSplitOptions.None);
        if (parts.Length != 6 || parts[1] != "argon2id" || parts[2] != "v=19") return false;
        try
        {
            var parameters = parts[3].Split(',', StringSplitOptions.TrimEntries);
            var memory = ParseParameter(parameters, "m");
            var iterations = ParseParameter(parameters, "t");
            var parallelism = ParseParameter(parameters, "p");
            if (memory < MemorySizeKiB || iterations < Iterations || parallelism < 1) return false;

            var salt = Convert.FromBase64String(parts[4]);
            var expected = Convert.FromBase64String(parts[5]);
            if (salt.Length < SaltLength || expected.Length != HashLength) return false;
            var actual = Derive(password, salt, memory, iterations, parallelism);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    public bool NeedsRehash(string hash) => !hash.StartsWith("$argon2id$v=19$m=65536,t=3,p=2$", StringComparison.Ordinal);

    private static int ParseParameter(IEnumerable<string> values, string name)
    {
        var value = values.SingleOrDefault(v => v.StartsWith($"{name}=", StringComparison.Ordinal));
        return value is not null && int.TryParse(value[(name.Length + 1)..], out var parsed) ? parsed : 0;
    }

    private static byte[] Derive(string password, byte[] salt, int memory = MemorySizeKiB, int iterations = Iterations, int parallelism = Parallelism)
    {
        using var argon2 = new Argon2id(Encoding.UTF8.GetBytes(password))
        {
            Salt = salt,
            MemorySize = memory,
            Iterations = iterations,
            DegreeOfParallelism = parallelism
        };
        return argon2.GetBytes(HashLength);
    }
}

/// <summary>Rejects weak, common, or insufficiently diverse passwords server-side.</summary>
public sealed class PasswordPolicy : IPasswordPolicy
{
    private static readonly HashSet<string> CommonPasswords = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "password123", "password123!", "12345678", "123456789", "qwerty", "admin123", "welcome123", "letmein", "cms123456"
    };

    public void EnsureValid(string password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 12 || password.Length > 128 ||
            !password.Any(char.IsUpper) || !password.Any(char.IsLower) ||
            !password.Any(char.IsDigit) || !password.Any(c => !char.IsLetterOrDigit(c)) ||
            CommonPasswords.Contains(password))
            throw new CMS.Domain.Exceptions.DomainException("كلمة المرور يجب أن تضم 12 محرفاً على الأقل وحرفاً كبيراً وصغيراً ورقماً ورمزاً خاصاً، وألا تكون شائعة", "PASSWORD_POLICY_VIOLATION");
    }
}

/// <summary>
/// JWT token service for authentication.
/// Generates access tokens (15min) and refresh tokens (7days).
/// </summary>
public class JwtTokenService : ITokenService
{
    private readonly IConfiguration _configuration;
    private readonly SymmetricSecurityKey _signingKey;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
        var secret = configuration["Jwt:Secret"];
        if (string.IsNullOrWhiteSpace(secret) || Encoding.UTF8.GetByteCount(secret) < 32)
            throw new InvalidOperationException("JWT Secret must be configured and contain at least 32 bytes");

        _signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret))
        {
            KeyId = configuration["Jwt:KeyId"] ?? "v1"
        };
    }

    public string GenerateAccessToken(
        Guid userId,
        string subject,
        string role,
        Guid sessionId,
        string installationId,
        int tokenVersion)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(JwtRegisteredClaimNames.Email, subject),
            new(ClaimTypes.Role, role),
            new("role", role),
            new("sid", sessionId.ToString()),
            new("installation_id", installationId),
            new("tv", tokenVersion.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(JwtRegisteredClaimNames.Iat, new DateTimeOffset(DateTime.UtcNow).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)
        };

        // Existing administrator routes use the broad "admin" role guard, while
        // permission decisions continue to use the persisted, specific role name.
        // The token service is invoked from separate student and administrator login
        // flows, so every non-student role is an administrator role, including custom roles.
        if (role != Roles.Student)
            claims.Add(new Claim(ClaimTypes.Role, "admin"));

        var issuer = _configuration["Jwt:Issuer"] ?? throw new InvalidOperationException("JWT issuer not configured");
        var audience = _configuration["Jwt:Audience"] ?? throw new InvalidOperationException("JWT audience not configured");
        var lifetime = int.TryParse(_configuration["Jwt:AccessTokenExpiryMinutes"], out var configuredMinutes)
            ? Math.Clamp(configuredMinutes, 1, 60)
            : 15;
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(lifetime),
            signingCredentials: new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256)
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public bool ValidateToken(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = _configuration["Jwt:Issuer"],
                ValidAudience = _configuration["Jwt:Audience"],
                IssuerSigningKey = _signingKey,
                ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 },
                ClockSkew = TimeSpan.Zero
            };

            tokenHandler.ValidateToken(token, validationParameters, out _);
            return true;
        }
        catch
        {
            return false;
        }
    }

}
