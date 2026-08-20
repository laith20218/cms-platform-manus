using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CMS.Tests.Unit.Services;

public class SignedEntitlementServiceTests
{
    private const string SigningKey = "phase35-test-entitlement-key-at-least-32-bytes";
    private const string DeviceId = "installation-phase35-a";

    [Fact]
    public async Task ValidateAsync_ValidTokenForBoundDeviceAndSubject_Allows()
    {
        await using var db = await CreateEntitledContextAsync();
        var student = await db.Students.SingleAsync();
        var subject = await db.Subjects.SingleAsync();
        var service = CreateService(db);

        var token = await service.IssueAsync(student.Id, DeviceId);
        var result = await service.ValidateAsync(token, student.Id, DeviceId, subject.Id);

        result.IsValid.Should().BeTrue();
        result.Entitlement!.AllowedSubjects.Should().Contain(subject.Id);
    }

    [Fact]
    public async Task ValidateAsync_ExpiredToken_Denies()
    {
        await using var db = await CreateEntitledContextAsync();
        var student = await db.Students.SingleAsync();
        var subject = await db.Subjects.SingleAsync();
        var service = CreateService(db);

        var token = CreateToken(student.Id, DeviceId, student.UniversityId, student.CollegeId, Array.Empty<Guid>(), Array.Empty<Guid>(), new[] { subject.Id }, DateTime.UtcNow.AddMinutes(-30), DateTime.UtcNow.AddMinutes(-1));
        var result = await service.ValidateAsync(token, student.Id, DeviceId, subject.Id);

        result.IsValid.Should().BeFalse();
        result.FailureReason.Should().Contain("expired");
    }

    [Fact]
    public async Task ValidateAsync_TamperedSignature_Denies()
    {
        await using var db = await CreateEntitledContextAsync();
        var student = await db.Students.SingleAsync();
        var subject = await db.Subjects.SingleAsync();
        var service = CreateService(db);
        var token = await service.IssueAsync(student.Id, DeviceId);

        var tamperedToken = (token[0] == 'A' ? "B" : "A") + token[1..];
        var result = await service.ValidateAsync(tamperedToken, student.Id, DeviceId, subject.Id);

        result.IsValid.Should().BeFalse();
        result.FailureReason.Should().Contain("signature");
    }

    [Fact]
    public async Task ValidateAsync_DifferentBoundDevice_Denies()
    {
        await using var db = await CreateEntitledContextAsync();
        var student = await db.Students.SingleAsync();
        var subject = await db.Subjects.SingleAsync();
        var service = CreateService(db);
        var token = await service.IssueAsync(student.Id, DeviceId);

        var result = await service.ValidateAsync(token, student.Id, "installation-phase35-b", subject.Id);

        result.IsValid.Should().BeFalse();
        result.FailureReason.Should().Contain("device");
    }

    [Fact]
    public async Task ValidateAsync_SubjectOutsideSignedScope_Denies()
    {
        await using var db = await CreateEntitledContextAsync();
        var student = await db.Students.SingleAsync();
        var service = CreateService(db);

        var result = await service.ValidateAsync(await service.IssueAsync(student.Id, DeviceId), student.Id, DeviceId, Guid.NewGuid());

        result.IsValid.Should().BeFalse();
        result.FailureReason.Should().Contain("scope");
    }

    private static SignedEntitlementService CreateService(CMS.Infrastructure.Persistence.ApplicationDbContext db) => new(db, new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Entitlements:SigningKey"] = SigningKey,
            ["Security:Entitlements:LifetimeMinutes"] = "20"
        }).Build());

    private static async Task<CMS.Infrastructure.Persistence.ApplicationDbContext> CreateEntitledContextAsync()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var student = await db.Students.SingleAsync();
        var subject = await db.Subjects.SingleAsync();
        db.StudentSubscriptions.Add(new StudentSubscription
        {
            StudentId = student.Id,
            ScopeType = SubscriptionScopeType.Subject,
            ScopeSubjectId = subject.Id,
            Status = SubscriptionStatus.Active,
            StartsAt = DateTime.UtcNow.AddMinutes(-1),
            ExpiresAt = DateTime.UtcNow.AddDays(1)
        });
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student.Id, DeviceFingerprint = DeviceId, IsActive = true });
        await db.SaveChangesAsync();
        return db;
    }

    private static string CreateToken(Guid userId, string deviceId, Guid? universityId, Guid? collegeId, IReadOnlyList<Guid> years, IReadOnlyList<Guid> semesters, IReadOnlyList<Guid> subjects, DateTime issuedAt, DateTime expiresAt)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            userId, deviceId, universityId, collegeId,
            allowedYears = years, allowedSemesters = semesters, allowedSubjects = subjects,
            issuedAt, expiresAt, version = 1
        }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(SigningKey));
        return $"{ToBase64Url(payload)}.{ToBase64Url(hmac.ComputeHash(payload))}";
    }

    private static string ToBase64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
