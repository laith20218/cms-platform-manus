using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using CMS.Application.BackgroundJobs;
using CMS.Application.Exceptions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// Wave 11.9 — PdfProcessingService unit suite (red-first per the task book, then
/// green): asserts the EXACT Ghostscript command vector against the task-book
/// command, and drives the REAL worker's ProcessJobAsync end-to-end against an
/// InMemory database, a recording storage fake and a MOCKED runner — so the
/// queue→download→gs→upload-swap→status state machine is verified without needing
/// the gs binary on the host (the binary itself is smoke-tested in CI/docker).
/// </summary>
public sealed class PdfProcessingServiceTests
{
    // ================= command vector (task book part I.1.B) =================

    [Fact]
    public void GhostscriptArgs_Build_MatchesTaskBookCommand()
    {
        var args = GhostscriptArgs.Build("/tmp/w/source.pdf", "/tmp/w/fixed.pdf", "/app/ghostscript-fonts");

        args.Should().Equal(new[]
        {
            "-dNOPAUSE",
            "-dBATCH",
            "-sDEVICE=pdfwrite",
            "-dEmbedAllFonts=true",
            "-dSubsetFonts=true",
            "-sFONTPATH=/app/ghostscript-fonts",
            "-sOutputFile=/tmp/w/fixed.pdf",
            "/tmp/w/source.pdf",
        }, "the pipeline must run the exact command the Wave 11.9 task book pins");
    }

    // ================= harness =================

    private sealed record RecordedPut(string Key, byte[] Bytes, string ContentType);

    /// <summary>Storage fake: serves the seeded source object for DownloadAsync and
    /// records every PutAsync (key + bytes + content type) — the LocalFileStorage
    /// precedent from the Push 10.8 live harness.</summary>
    private sealed class RecordingStorage : IFileStorageService
    {
        private readonly ConcurrentDictionary<string, byte[]> _objects = new();
        public ConcurrentBag<RecordedPut> Puts { get; } = new();

        public RecordingStorage Seed(string key, byte[] bytes) { _objects[key] = bytes; return this; }

        public Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry, long? contentLength = null, CancellationToken ct = default)
            => Task.FromResult($"https://storage.test/{key}?put");

        public Task<string> GetSignedUrlAsync(string key, TimeSpan expiry, CancellationToken ct = default)
            => Task.FromResult($"https://storage.test/{key}?get");

        public Task DeleteAsync(string key, CancellationToken ct = default) { _objects.TryRemove(key, out _); return Task.CompletedTask; }

        public Task<bool> ExistsAsync(string key, CancellationToken ct = default) => Task.FromResult(_objects.ContainsKey(key));

        public Task<Stream> DownloadAsync(string key, CancellationToken ct = default)
        {
            if (!_objects.TryGetValue(key, out var bytes))
                throw new KeyNotFoundException($"no object seeded for key {key}");
            return Task.FromResult<Stream>(new MemoryStream(bytes));
        }

        public async Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default)
        {
            using var buffer = new MemoryStream();
            await content.CopyToAsync(buffer, ct);
            var bytes = buffer.ToArray();
            _objects[key] = bytes;
            Puts.Add(new RecordedPut(key, bytes, contentType));
        }

        // Unused by the PDF pipeline — NotSupportedException mirrors the LocalFileStorage
        // fake in VideoTranscodingTargetQualityLiveTests.
        public Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> InitiateMultipartUploadAsync(string key, string contentType, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> PresignUploadPartAsync(string key, string uploadId, int partNumber, TimeSpan expiry, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<List<UploadedPartInfo>> ListMultipartPartsAsync(string key, string uploadId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task CompleteMultipartUploadAsync(string key, string uploadId, IReadOnlyList<CompletedPart> parts, CancellationToken ct = default) => throw new NotSupportedException();
        public Task AbortMultipartUploadAsync(string key, string uploadId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<long> GetObjectSizeAsync(string key, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> GetSignedUrlViaCredentialsAsync(string key, TimeSpan desiredExpiry, CancellationToken ct = default) => throw new NotSupportedException();
    }

    private static readonly byte[] MinimalPdfBytes = "%PDF-1.7\n%%EOF\n"u8.ToArray();

    private sealed record Harness(
        PdfProcessingService Service,
        PdfProcessingChannelQueue Queue,
        RecordingStorage Storage,
        Mock<IGhostscriptRunner> Runner,
        InMemoryDatabaseRoot DbRoot,
        string DbName);

    private static Harness CreateHarness(ISystemSettingsService? settings = null)
    {
        var root = new InMemoryDatabaseRoot();
        var dbName = $"pdf-proc-{Guid.NewGuid():N}";

        ApplicationDbContext CreateContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(dbName, root)
                .Options;
            return new ApplicationDbContext(options);
        }

        var services = new ServiceCollection();
        services.AddScoped<IApplicationDbContext>(_ => CreateContext());
        var storage = new RecordingStorage();
        services.AddSingleton<IFileStorageService>(storage);
        // ALWAYS register: ProcessJobAsync resolves the ceiling from settings on every
        // job; a loose mock (GetAsync → null) exercises the hardcoded 30 MB default.
        services.AddSingleton(settings ?? new Mock<ISystemSettingsService>().Object);
        var provider = services.BuildServiceProvider();

        var queue = new PdfProcessingChannelQueue();
        var runner = new Mock<IGhostscriptRunner>();
        var service = new PdfProcessingService(
            queue,
            provider.GetRequiredService<IServiceScopeFactory>(),
            runner.Object,
            NullLogger<PdfProcessingService>.Instance);

        return new Harness(service, queue, storage, runner, root, dbName);
    }

    private static async Task<LibraryFile> SeedPendingPdfAsync(Harness harness, string key, long fileSize = 1024)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(harness.DbName, harness.DbRoot)
            .Options;
        await using var seed = new ApplicationDbContext(options);
        TestDbHelper.SeedTestData(seed);
        var subject = seed.Subjects.First();
        var file = new LibraryFile
        {
            SubjectId = subject.Id,
            Type = LibraryFileType.Pdf,
            Title = "ملف PDF للمعالجة",
            FileUrl = key,
            FileSize = fileSize,
            FileFormat = "application/pdf",
            Status = ContentStatus.Draft,
            VirusScanStatus = VirusScanStatus.Clean,
            PdfProcessingStatus = PdfProcessingStatus.Pending
        };
        seed.LibraryFiles.Add(file);
        await seed.SaveChangesAsync();
        return file;
    }

    private static ApplicationDbContext FreshContext(Harness harness)
        => new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(harness.DbName, harness.DbRoot)
            .Options);

    // ================= success path =================

    [Fact]
    public async Task ProcessJob_Success_UploadsFixedKey_SwapsFileUrl_MarksReady()
    {
        const string key = "library/aa/bb";
        var harness = CreateHarness();
        await SeedPendingPdfAsync(harness, key);
        harness.Storage.Seed(key, MinimalPdfBytes);
        // The mocked runner honours its contract: -sOutputFile=<path> must exist after RunAsync.
        harness.Runner
            .Setup(r => r.RunAsync(It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .Callback((string _, IReadOnlyList<string> args, TimeSpan _, CancellationToken _) =>
            {
                var output = args.Single(a => a.StartsWith("-sOutputFile=", StringComparison.Ordinal))["-sOutputFile=".Length..];
                File.WriteAllBytes(output, MinimalPdfBytes);
            })
            .ReturnsAsync(string.Empty); // R22.2: the runner returns the captured GS console output

        await harness.Service.ProcessJobAsync(new PdfProcessingJob((await CurrentFileAsync(harness, key)).Id), CancellationToken.None);

        var file = await CurrentFileAsync(harness, key);
        file.PdfProcessingStatus.Should().Be(PdfProcessingStatus.Ready);
        file.ProcessingError.Should().BeNull();
        file.FileUrl.Should().Be($"{key}-fixed", "the fixed object replaces the original key in FileUrl");

        var put = harness.Storage.Puts.Single();
        put.Key.Should().Be($"{key}-fixed", "the original object stays in place for rollback/audit");
        put.ContentType.Should().Be("application/pdf");
        put.Bytes.Should().NotBeEmpty();
        harness.Runner.Verify(
            r => r.RunAsync("gs",
                It.Is<IReadOnlyList<string>>(a => a.Count == 8
                    && a[0] == "-dNOPAUSE"
                    && a[1] == "-dBATCH"
                    && a[2] == "-sDEVICE=pdfwrite"
                    && a[3] == "-dEmbedAllFonts=true"
                    && a[4] == "-dSubsetFonts=true"
                    && a[5] == "-sFONTPATH=/app/ghostscript-fonts"
                    && a[6].StartsWith("-sOutputFile=", StringComparison.Ordinal)
                    && a[7].EndsWith("source.pdf", StringComparison.Ordinal)),
                It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()),
            Times.Once, "the worker must run Ghostscript with the baked-in font pack path and the task-book flags");
    }

    // ================= R22.2 — font diagnostics report =================

    [Fact]
    public async Task ProcessJob_GhostscriptSubstitutionWarnings_PersistArabicReport()
    {
        const string key = "library/55/66";
        var harness = CreateHarness();
        await SeedPendingPdfAsync(harness, key);
        harness.Storage.Seed(key, MinimalPdfBytes);
        harness.Runner
            .Setup(r => r.RunAsync(It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .Callback((string _, IReadOnlyList<string> args, TimeSpan _, CancellationToken _) =>
            {
                var output = args.Single(a => a.StartsWith("-sOutputFile=", StringComparison.Ordinal))["-sOutputFile=".Length..];
                File.WriteAllBytes(output, MinimalPdfBytes);
            })
            .ReturnsAsync(
                "Loading font SakkalMajalla from /app/ghostscript-fonts/SakkalMajalla.ttf...\n" +
                "Substituting font Amiri for SakkalMajalla.\n" +
                "Substituting font Amiri for SakkalMajalla."); // duplicate — must dedupe

        await harness.Service.ProcessJobAsync(new PdfProcessingJob((await CurrentFileAsync(harness, key)).Id), CancellationToken.None);

        var file = await CurrentFileAsync(harness, key);
        file.PdfProcessingStatus.Should().Be(PdfProcessingStatus.Ready,
            "font warnings are diagnostics, not failures — the file is still usable");
        file.ProcessingError.Should().Be("الخط الأصلي (SakkalMajalla) غير مدمج، وتم استبداله بـ (Amiri).",
            "R22.2: the human-readable Arabic report is stored in the EXISTING ProcessingError column (no schema change), deduped");
        file.FileUrl.Should().Be($"{key}-fixed", "the pipeline still swaps FileUrl normally");
    }

    // ================= ceiling guard =================

    [Fact]
    public async Task ProcessJob_OverCeiling_SkipsGhostscript_MarksReady_KeepsOriginalKey()
    {
        const string key = "library/cc/dd";
        var harness = CreateHarness();
        // 31 MB source vs the hardcoded 30 MB default → the R19 fallback must win.
        await SeedPendingPdfAsync(harness, key, fileSize: 31L * 1024 * 1024);
        harness.Storage.Seed(key, MinimalPdfBytes);

        await harness.Service.ProcessJobAsync(new PdfProcessingJob((await CurrentFileAsync(harness, key)).Id), CancellationToken.None);

        var file = await CurrentFileAsync(harness, key);
        file.PdfProcessingStatus.Should().Be(PdfProcessingStatus.Ready,
            "over-ceiling sources are marked Ready so the admin UI does not poll forever");
        file.FileUrl.Should().Be(key, "FileUrl must NOT change — FontPipelineFixed derives false and the player keeps R19 path rendering");
        file.ProcessingError.Should().BeNull();
        harness.Storage.Puts.Should().BeEmpty("no fixed object may be uploaded for a skipped source");
        harness.Runner.Verify(r => r.RunAsync(It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()),
            Times.Never, "Ghostscript must not run for over-ceiling sources (Render free-tier RAM guard)");
    }

    [Fact]
    public async Task ProcessJob_CeilingSettingOverride_IsRespected()
    {
        const string key = "library/ee/ff";
        var settings = new Mock<ISystemSettingsService>();
        settings.Setup(s => s.GetAsync(PdfProcessingService.MaxMbSettingKey, It.IsAny<CancellationToken>()))
            .ReturnsAsync("1"); // admin tightened the ceiling to 1 MB
        var harness = CreateHarness(settings.Object);
        await SeedPendingPdfAsync(harness, key, fileSize: 2L * 1024 * 1024);
        harness.Storage.Seed(key, MinimalPdfBytes);

        await harness.Service.ProcessJobAsync(new PdfProcessingJob((await CurrentFileAsync(harness, key)).Id), CancellationToken.None);

        var file = await CurrentFileAsync(harness, key);
        file.PdfProcessingStatus.Should().Be(PdfProcessingStatus.Ready);
        file.FileUrl.Should().Be(key, "the setting (1 MB) beat the 30 MB default, so a 2 MB source skips");
        harness.Runner.Verify(r => r.RunAsync(It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ================= failure path =================

    [Fact]
    public async Task ProcessJob_GhostscriptFailure_MarksFailed_WithProcessingError()
    {
        const string key = "library/11/22";
        var harness = CreateHarness();
        await SeedPendingPdfAsync(harness, key);
        harness.Storage.Seed(key, MinimalPdfBytes);
        harness.Runner
            .Setup(r => r.RunAsync(It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new MediaProcessingException(technicalDetails: "Ghostscript exited with code 1: Unrecoverable error: font failure"));

        await harness.Service.ProcessJobAsync(new PdfProcessingJob((await CurrentFileAsync(harness, key)).Id), CancellationToken.None);

        var file = await CurrentFileAsync(harness, key);
        file.PdfProcessingStatus.Should().Be(PdfProcessingStatus.Failed);
        file.ProcessingError.Should().Contain("Ghostscript exited with code 1",
            "the raw GS stderr tail is the admin error modal's technicalDetails payload");
        file.FileUrl.Should().Be(key, "a failed run must never swap FileUrl");
        harness.Storage.Puts.Should().BeEmpty("no partial fixed object may be uploaded on failure");
    }

    // ================= dequeue skip-check =================

    [Fact]
    public async Task ProcessJob_NonPendingRow_IsSkippedSilently()
    {
        const string key = "library/33/44";
        var harness = CreateHarness();
        var file = await SeedPendingPdfAsync(harness, key);
        // Terminal already (duplicate dequeue / abort race): the skip-check must win.
        await using (var update = FreshContext(harness))
        {
            var tracked = await update.LibraryFiles.FirstAsync(f => f.Id == file.Id);
            tracked.PdfProcessingStatus = PdfProcessingStatus.Failed;
            await update.SaveChangesAsync();
        }
        harness.Storage.Seed(key, MinimalPdfBytes);

        await harness.Service.ProcessJobAsync(new PdfProcessingJob(file.Id), CancellationToken.None);

        harness.Runner.Verify(r => r.RunAsync(It.IsAny<string>(), It.IsAny<IReadOnlyList<string>>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()), Times.Never,
            "only Pending rows may enter the pipeline (transcoding silent-skip diagnostic precedent)");
        (await CurrentFileAsync(harness, key)).PdfProcessingStatus.Should().Be(PdfProcessingStatus.Failed);
    }

    // ================= helpers =================

    private static async Task<LibraryFile> CurrentFileAsync(Harness harness, string key)
    {
        await using var ctx = FreshContext(harness);
        return await ctx.LibraryFiles.AsNoTracking().SingleAsync(f => f.FileUrl == key || f.FileUrl == $"{key}-fixed");
    }
}
