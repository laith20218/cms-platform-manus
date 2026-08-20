using System.Text;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CMS.Tests.Unit.Services;

public sealed class OfflinePackageLifecycleServiceTests
{
    private static OfflinePackageCryptoService Crypto()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Offline:KeyWrappingKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(i => (byte)i).ToArray()),
            ["Security:Offline:ManifestSigningKey"] = Convert.ToBase64String(Enumerable.Range(33, 32).Select(i => (byte)i).ToArray())
        }).Build();
        return new OfflinePackageCryptoService(config);
    }

    [Fact]
    public async Task IssueAsync_IsIdempotentAndPersistsOneRecord()
    {
        await using var db = new ApplicationDbContext(new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var service = new OfflinePackageLifecycleService(db, Crypto());
        var studentId = Guid.NewGuid();
        var subjectId = Guid.NewGuid();
        var expires = DateTime.UtcNow.AddHours(1);

        var first = await service.IssueAsync(studentId, "device-a", 2, "request-1", new[] { subjectId }, expires, Encoding.UTF8.GetBytes("payload"));
        var second = await service.IssueAsync(studentId, "device-a", 2, "request-1", new[] { subjectId }, expires, Encoding.UTF8.GetBytes("different-payload"));

        second.Manifest.PackageId.Should().Be(first.Manifest.PackageId);
        db.OfflinePackageRecords.Count().Should().Be(1);
    }

    [Fact]
    public async Task RevokeAsync_IsOwnerBoundAndMarksRecordRevoked()
    {
        await using var db = new ApplicationDbContext(new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var service = new OfflinePackageLifecycleService(db, Crypto());
        var studentId = Guid.NewGuid();
        var package = await service.IssueAsync(studentId, "device-a", 1, "request-2", new[] { Guid.NewGuid() }, DateTime.UtcNow.AddHours(1), new byte[] { 1 });

        await service.RevokeAsync(Guid.NewGuid(), package.Manifest.PackageId, "wrong-owner");
        db.OfflinePackageRecords.Single().Status.Should().Be("active");
        await service.RevokeAsync(studentId, package.Manifest.PackageId, "logout");
        db.OfflinePackageRecords.Single().Status.Should().StartWith("revoked:");
        db.OfflinePackageRecords.Single().RevokedAt.Should().NotBeNull();
    }
}
