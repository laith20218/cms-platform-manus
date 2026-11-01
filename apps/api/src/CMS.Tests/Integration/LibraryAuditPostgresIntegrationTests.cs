using System.Security.Claims;
using CMS.Api.Controllers;
using CMS.Application.DependencyInjection;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Security;
using CMS.Infrastructure.Services;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

using CMS.Tests.Infrastructure;

namespace CMS.Tests.Integration;

[Trait("Category", "PostgresIntegration")]
[Collection("PostgresIntegration")]
public sealed class LibraryAuditPostgresIntegrationTests
{
    [PostgresFact]
    public async Task TamperedEntitlement_RealLibraryAccessTriggerPersistsDeniedEvents()
    {
        var connectionString = Environment.GetEnvironmentVariable("CMS_PHASE34_TEST_POSTGRES") ?? throw new InvalidOperationException("BLOCKED: set CMS_PHASE34_TEST_POSTGRES.");
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new ApplicationDbContext(options);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var university = University.Create($"جامعة Library {suffix}", $"lib-u-{suffix}", "Library University");
        var college = College.Create(university.Id, "كلية Library", $"lib-c-{suffix}", "Library College");
        var year = AcademicYear.Create(college.Id, "سنة Library", $"lib-y-{suffix}", 1);
        var semester = Semester.Create(year.Id, "فصل Library", $"lib-s-{suffix}", 1);
        var subject = Subject.Create(semester.Id, "مادة Library", $"lib-sub-{suffix}", "Library Subject");
        var student = Student.Create($"09{Random.Shared.Next(10_000_000, 99_999_999)}", "library-audit-hash", "Library Audit Student");
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();
        var file = new LibraryFile { SubjectId = subject.Id, Type = LibraryFileType.Pdf, Title = "Audit File", FileUrl = "private/audit.pdf", FileSize = 128, Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean };
        const string installation = "phase44-library-installation";
        db.AddRange(university, college, year, semester, subject, student, file);
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student.Id, DeviceFingerprint = installation, IsActive = true });
        db.StudentSubscriptions.Add(new StudentSubscription { StudentId = student.Id, ScopeType = SubscriptionScopeType.Subject, ScopeSubjectId = subject.Id, Status = SubscriptionStatus.Active, StartsAt = DateTime.UtcNow.AddMinutes(-1), ExpiresAt = DateTime.UtcNow.AddDays(1) });
        await db.SaveChangesAsync();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Entitlements:SigningKey"] = "phase44-library-entitlement-signing-key-long-enough",
            ["Security:Entitlements:LifetimeMinutes"] = "20", ["Security:Audit:BatchSize"] = "10", ["Security:Audit:FlushSeconds"] = "60", ["Security:Audit:QueueCapacity"] = "20"
        }).Build();
        var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(services.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var audit = new SecurityService(db, new Mock<ICacheService>().Object, batch, correlation, configuration);
        var controller = new LibraryController(new Mock<ISender>(MockBehavior.Strict).Object, new SignedEntitlementService(db, configuration), new Mock<IPermissionService>().Object, audit);
        var requestServices = new ServiceCollection().AddSingleton<IApplicationDbContext>(db).BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = requestServices, User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", student.Id.ToString()) }, "test")) };
        context.Request.Headers["X-Installation-Id"] = installation;
        context.Request.Headers["X-Entitlement"] = "tampered.entitlement";
        controller.ControllerContext = new ControllerContext { HttpContext = context };

        var result = await controller.GetAccess(file.Id, CancellationToken.None);
        result.Should().BeOfType<ForbidResult>();

        await using var verifyDb = new ApplicationDbContext(options);
        var events = await verifyDb.SecurityLogs.AsNoTracking().Where(log => log.StudentId == student.Id && log.CorrelationId == correlation.CorrelationId &&
            (log.EventType == SecurityEventType.EntitlementDenied || log.EventType == SecurityEventType.FileAccessDenied)).ToListAsync();
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.EntitlementDenied && log.Severity == SecuritySeverity.Warning);
        events.Should().ContainSingle(log => log.EventType == SecurityEventType.FileAccessDenied && log.Severity == SecuritySeverity.Warning);
        events.Should().OnlyContain(log => log.CreatedAt > DateTime.UtcNow.AddMinutes(-2));
        events.Select(log => log.Description.ToLowerInvariant()).Should().OnlyContain(description => !description.Contains("tampered.entitlement") && !description.Contains("token") && !description.Contains("secret"));
    }

    [PostgresFact]
    public async Task ValidEntitlement_RealControllerAndLibraryHandlerPersistFileAccess()
    {
        var connectionString = Environment.GetEnvironmentVariable("CMS_PHASE34_TEST_POSTGRES") ?? throw new InvalidOperationException("BLOCKED: set CMS_PHASE34_TEST_POSTGRES.");
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new ApplicationDbContext(options);
        var suffix = Guid.NewGuid().ToString("N")[..8];
        var university = University.Create($"جامعة Access {suffix}", $"access-u-{suffix}", "Access University");
        var college = College.Create(university.Id, "كلية Access", $"access-c-{suffix}", "Access College");
        var year = AcademicYear.Create(college.Id, "سنة Access", $"access-y-{suffix}", 1);
        var semester = Semester.Create(year.Id, "فصل Access", $"access-s-{suffix}", 1);
        var subject = Subject.Create(semester.Id, "مادة Access", $"access-sub-{suffix}", "Access Subject");
        var student = Student.Create($"09{Random.Shared.Next(10_000_000, 99_999_999)}", "library-access-hash", "Library Access Student");
        student.SetAcademicInfo(university.Id, college.Id, year.Id);
        student.VerifyPhone();
        var file = new LibraryFile { SubjectId = subject.Id, Type = LibraryFileType.Pdf, Title = "Access File", FileUrl = "private/access.pdf", FileSize = 128, Status = ContentStatus.Published, VirusScanStatus = VirusScanStatus.Clean };
        const string installation = "phase44-library-access-installation";
        db.AddRange(university, college, year, semester, subject, student, file);
        db.DeviceBindings.Add(new DeviceBinding { StudentId = student.Id, DeviceFingerprint = installation, IsActive = true });
        db.StudentSubscriptions.Add(new StudentSubscription { StudentId = student.Id, ScopeType = SubscriptionScopeType.Subject, ScopeSubjectId = subject.Id, Status = SubscriptionStatus.Active, StartsAt = DateTime.UtcNow.AddMinutes(-1), ExpiresAt = DateTime.UtcNow.AddDays(1) });
        await db.SaveChangesAsync();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Security:Entitlements:SigningKey"] = "phase44-library-access-entitlement-signing-key-long", ["Security:Entitlements:LifetimeMinutes"] = "20",
            ["Security:Audit:BatchSize"] = "10", ["Security:Audit:FlushSeconds"] = "60", ["Security:Audit:QueueCapacity"] = "20"
        }).Build();
        var batchScope = new ServiceCollection().AddDbContext<ApplicationDbContext>(builder => builder.UseNpgsql(connectionString)).BuildServiceProvider();
        var batch = new SecurityEventBatchService(batchScope.GetRequiredService<IServiceScopeFactory>(), configuration, NullLogger<SecurityEventBatchService>.Instance);
        var correlation = new CorrelationContext { CorrelationId = Guid.NewGuid().ToString("N") };
        var cache = new Mock<ICacheService>();
        var audit = new SecurityService(db, cache.Object, batch, correlation, configuration);
        var storage = new Mock<IFileStorageService>();
        storage.Setup(service => service.GetSignedUrlAsync("private/access.pdf", It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>())).ReturnsAsync("https://storage.test/access");
        var scanner = new Mock<IFileScanner>();
        // A2: LibraryHandlers now takes ISystemSettingsService (upload limits) and
        // IHtmlBlobSanitizer (HTML upload sanitization) — provide test doubles.
        var settings = new Mock<ISystemSettingsService>();
        settings.Setup(service => service.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync((string?)null);
        var sanitizer = new Mock<IHtmlBlobSanitizer>();
        using var provider = new ServiceCollection().AddLogging().AddApplicationServices()
            .AddSingleton<IApplicationDbContext>(db).AddSingleton<IUnitOfWork>(new CMS.Infrastructure.Repositories.UnitOfWork(db))
            .AddSingleton<IFileStorageService>(storage.Object).AddSingleton<IFileScanner>(scanner.Object)
            .AddSingleton<ISystemSettingsService>(settings.Object).AddSingleton<IHtmlBlobSanitizer>(sanitizer.Object)
            .AddSingleton<IEntitlementService>(new EntitlementService(db))
            // Push 2 / Track 2: LibraryHandlers now also takes IAdminActivityWriter.
            .AddSingleton<IAdminActivityWriter>(new CMS.Infrastructure.Services.AdminActivityWriter(db, Microsoft.Extensions.Logging.Abstractions.NullLogger<CMS.Infrastructure.Services.AdminActivityWriter>.Instance))
            // R39 CI fix: Wave 13 (13.A) added IHtmlCspInjector to LibraryHandlers for
            // upload-time CSP meta injection; production Program.cs registers the real
            // stateless service, so mirror it here or MediatR cannot activate the handler
            // (precedent: ActivityMonitorHandlerTests uses the same real injector).
            .AddSingleton<IHtmlCspInjector>(new HtmlCspInjectorService())
            .BuildServiceProvider();
        var entitlement = new SignedEntitlementService(db, configuration);
        var token = await entitlement.IssueAsync(student.Id, installation);
        var controller = new LibraryController(provider.GetRequiredService<ISender>(), entitlement, new Mock<IPermissionService>().Object, audit);
        var context = new DefaultHttpContext { RequestServices = provider, User = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim("sub", student.Id.ToString()) }, "test")) };
        context.Request.Headers["X-Installation-Id"] = installation;
        context.Request.Headers["X-Entitlement"] = token;
        controller.ControllerContext = new ControllerContext { HttpContext = context };

        var result = await controller.GetAccess(file.Id, CancellationToken.None);
        result.Should().BeOfType<OkObjectResult>();
        await batch.FlushAsync();
        await using var verifyDb = new ApplicationDbContext(options);
        var auditLog = await verifyDb.SecurityLogs.AsNoTracking().SingleAsync(log => log.StudentId == student.Id && log.EventType == SecurityEventType.FileAccess && log.CorrelationId == correlation.CorrelationId);
        auditLog.Severity.Should().Be(SecuritySeverity.Info);
        auditLog.CreatedAt.Should().BeOnOrAfter(DateTime.UtcNow.AddMinutes(-2));
        auditLog.Description.ToLowerInvariant().Should().NotContain("token").And.NotContain("secret").And.NotContain("key");
    }
}
