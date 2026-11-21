using System.Text.RegularExpressions;
using CMS.Application.BackgroundJobs;
using CMS.Application.Commands.Courses;
using CMS.Application.Commands.Library;
using CMS.Application.Common;
using CMS.Application.Handlers.Courses;
using CMS.Application.Handlers.Library;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Security;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// Wave 20.3 (owner decision 1) — six-digit public codes for library files and
/// courses: unique zero-padded auto-assignment at creation, and name-OR-code
/// search on the student list queries (digit-only terms match the zero-padded
/// code form: "1234" finds "001234"). Episodes never carry codes.
/// </summary>
public sealed class PublicCodeW203Tests
{
    private static readonly Regex SixDigitCode = new(@"^\d{6}$", RegexOptions.Compiled);

    private static (LibraryHandlers Handler, Mock<IEntitlementService> Entitlements) CreateLibrary(
        ApplicationDbContext db)
    {
        var storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        storage.Setup(service => service.GetSignedUploadUrlAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>(), It.IsAny<long?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://storage.example.com/signed-put");
        var scanner = new Mock<IFileScanner>();
        scanner.Setup(service => service.ScanAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new FileScanResult(IsClean: true, IsInfected: false, Verdict: "trusted"));
        var entitlements = new Mock<IEntitlementService>();
        var settingsService = new Mock<ISystemSettingsService>();
        settingsService.Setup(service => service.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);
        var sanitizer = new Mock<IHtmlBlobSanitizer>();
        var handler = new LibraryHandlers(
            db,
            new UnitOfWork(db),
            storage.Object,
            scanner.Object,
            entitlements.Object,
            settingsService.Object,
            sanitizer.Object,
            NullLogger<LibraryHandlers>.Instance,
            NoOp.ActivityWriter(),
            new TranscodingChannelQueue(),
            new PdfProcessingChannelQueue(),
            new HtmlCspInjectorService());
        return (handler, entitlements);
    }

    private static (CourseHandlers Handler, Mock<IEntitlementService> Entitlements) CreateCourses(ApplicationDbContext db)
    {
        var storage = new Mock<IFileStorageService>(MockBehavior.Strict);
        var entitlements = new Mock<IEntitlementService>();
        var settingsService = new Mock<ISystemSettingsService>();
        settingsService.Setup(service => service.GetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);
        var handler = new CourseHandlers(
            db,
            new UnitOfWork(db),
            storage.Object,
            entitlements.Object,
            settingsService.Object,
            NoOp.ActivityWriter(),
            NullLogger<CourseHandlers>.Instance,
            new TranscodingChannelQueue(),
            new TranscodingJobRegistry());
        return (handler, entitlements);
    }

    private static async Task<LibraryFile> SeedFileAsync(ApplicationDbContext db, string title, string? publicCode = null)
    {
        var subject = db.Subjects.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = LibraryFileType.Pdf,
            Title = title,
            FileUrl = $"library/{Guid.NewGuid():N}",
            FileSize = 1024,
            FileFormat = "application/pdf",
            Status = ContentStatus.Published,
            VirusScanStatus = VirusScanStatus.Clean,
        };
        if (publicCode is not null) file.AssignPublicCode(publicCode);
        db.LibraryFiles.Add(file);
        await db.SaveChangesAsync();
        return file;
    }

    // ===== Assignment (A/B) =====

    [Fact]
    public async Task RequestUploadUrl_AssignsUniqueSixDigitCode()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, _) = CreateLibrary(db);

        var first = await handler.Handle(new RequestUploadUrlCommand(
            "a.pdf", "application/pdf", 1024, subject.Id, null, "Pdf", "ملف القلب", null, Guid.NewGuid()), CancellationToken.None);
        var second = await handler.Handle(new RequestUploadUrlCommand(
            "b.pdf", "application/pdf", 1024, subject.Id, null, "Pdf", "ملف الرئة", null, Guid.NewGuid()), CancellationToken.None);

        var codes = await db.LibraryFiles
            .Where(file => file.Id == first.FileId || file.Id == second.FileId)
            .Select(file => file.PublicCode)
            .ToListAsync();
        codes.Should().HaveCount(2);
        codes.Should().OnlyContain(code => code != null && SixDigitCode.IsMatch(code));
        codes[0].Should().NotBe(codes[1], "the generated codes must be unique per table");
    }

    [Fact]
    public async Task CreateCourse_AssignsSixDigitCode_EpisodesNeverDo()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var (handler, _) = CreateCourses(db);

        var course = await handler.Handle(new CreateCourseCommand(
            subject.Id, "دورة الفيزيولوجيا", null, null, Guid.NewGuid()), CancellationToken.None);

        course.PublicCode.Should().NotBeNull();
        SixDigitCode.IsMatch(course.PublicCode!).Should().BeTrue("codes are zero-padded six digits");
        var stored = await db.Courses.SingleAsync(c => c.Id == course.Id);
        stored.PublicCode.Should().Be(course.PublicCode);
    }

    // ===== Search: name OR code (C) =====

    [Fact]
    public async Task GetLibraryFiles_SearchMatchesByCode_ExactAndZeroPadded()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        await SeedFileAsync(db, "تلخيص القلب", "001234");
        await SeedFileAsync(db, "تلخيص الرئة", "998877");
        var (handler, entitlements) = CreateLibrary(db);
        entitlements.Setup(service => service.CanAccessSubjectAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        entitlements.Setup(service => service.CanAccessSubjectContentAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<SubscriptionContentScope>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        // Exact code.
        var byCode = await handler.Handle(new GetLibraryFilesQuery(db.Students.First().Id, subject.Id, null, 1, 20, "001234"), CancellationToken.None);
        byCode.Items.Should().ContainSingle(file => file.Title == "تلخيص القلب");

        // Digit-only term shorter than six digits matches its zero-padded form.
        var unpadded = await handler.Handle(new GetLibraryFilesQuery(db.Students.First().Id, subject.Id, null, 1, 20, "1234"), CancellationToken.None);
        unpadded.Items.Should().ContainSingle(file => file.Title == "تلخيص القلب");

        // Title search still works.
        var byTitle = await handler.Handle(new GetLibraryFilesQuery(db.Students.First().Id, subject.Id, null, 1, 20, "الرئة"), CancellationToken.None);
        byTitle.Items.Should().ContainSingle(file => file.Title == "تلخيص الرئة");

        // The code rides the list DTO (D).
        byCode.Items.Single().PublicCode.Should().Be("001234");
    }

    [Fact]
    public async Task GetSubjectCourses_SearchMatchesByCode()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var subject = db.Subjects.First();
        var heart = new Course { SubjectId = subject.Id, Title = "دورة القلب", Status = ContentStatus.Published };
        heart.AssignPublicCode("004321");
        var lungs = new Course { SubjectId = subject.Id, Title = "دورة الرئة", Status = ContentStatus.Published };
        lungs.AssignPublicCode("112233");
        db.Courses.AddRange(heart, lungs);
        await db.SaveChangesAsync();
        var (handler, entitlements) = CreateCourses(db);
        entitlements.Setup(service => service.CanAccessSubjectAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        entitlements.Setup(service => service.CanAccessSubjectContentAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<SubscriptionContentScope>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var byCode = await handler.Handle(new GetSubjectCoursesQuery(db.Students.First().Id, subject.Id, "4321"), CancellationToken.None);
        byCode.Should().ContainSingle(course => course.Title == "دورة القلب");
        byCode.Single().PublicCode.Should().Be("004321");

        var byTitle = await handler.Handle(new GetSubjectCoursesQuery(db.Students.First().Id, subject.Id, "الرئة"), CancellationToken.None);
        byTitle.Should().ContainSingle(course => course.Title == "دورة الرئة");
    }

    // ===== Pure helper (unit) =====

    [Theory]
    [InlineData("1234", "001234")]
    [InlineData("001234", "001234")]
    [InlineData("999999", "999999")]
    [InlineData("0", "000000")]
    public void NormalizeSearchTerm_PadsDigits(string term, string expected)
    {
        PublicCodes.NormalizeSearchTerm(term).Should().Be(expected);
    }

    [Theory]
    [InlineData("1234567")]  // longer than six digits — not a code
    [InlineData("12a45")]    // non-digits — not a code
    [InlineData("قلب")]      // non-latin term — not a code
    [InlineData("")]
    public void NormalizeSearchTerm_RejectsNonCodeTerms(string term)
    {
        PublicCodes.NormalizeSearchTerm(term).Should().BeNull();
    }

    [Fact]
    public async Task GenerateUniqueAsync_NeverReturnsAnExistingCode()
    {
        var taken = new HashSet<string> { "000000", "000001", "500000" };
        for (var i = 0; i < 50; i++)
        {
            var code = await PublicCodes.GenerateUniqueAsync(candidate => Task.FromResult(taken.Contains(candidate)), CancellationToken.None);
            SixDigitCode.IsMatch(code).Should().BeTrue();
            taken.Contains(code).Should().BeFalse();
            taken.Add(code);
        }
    }
}
