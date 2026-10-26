using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.RegularExpressions;
using CMS.Application.BackgroundJobs;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using Xunit.Abstractions;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// Push 10.8 — LIVE pipeline evidence (task book 1.A + hard rule #3): runs the REAL
/// VideoTranscodingService worker end-to-end — real ffmpeg binary, real temp
/// workspace, real ffprobe rotation-corrected probe — against an InMemory DB and a
/// local-file storage fake, capturing the logger output.
///
/// This is the test that emits the mandated job-start line
///     "Starting job: ID={Id}, Target={TargetQuality}, SourceHeight={SourceHeight}, Rungs={Rungs}"
/// and PROVES the admin's TargetQuality choice reaches the encoder:
///   • P360 on a 1280×720 source → EXACTLY ONE rung (360p) — one rendition directory;
///   • Auto on the same source   → the source-driven ladder (360p + 720p).
///
/// The generated HLS tree is really produced and "uploaded" (the fake records the
/// object keys) so the single-vs-multi rendition claim is verified on disk, not
/// just on the log line. Skips silently when no ffmpeg binary exists on the host.
/// </summary>
public sealed partial class VideoTranscodingTargetQualityLiveTests
{
    private readonly ITestOutputHelper _output;

    public VideoTranscodingTargetQualityLiveTests(ITestOutputHelper output) => _output = output;

    [GeneratedRegex(@"Starting job: ID=([0-9a-f\-]{36}), Target=(\w+), SourceHeight=(\d+), Rungs=([\w,]+)")]
    private static partial Regex StartingJobLine();

    private static readonly Lazy<string?> SourceVideoLazy = new(GenerateSourceVideo);

    /// <summary>1280×720, 2 s, h264 — small enough for a sub-10 s encode, big enough
    /// that a 360p+720p Auto ladder is meaningfully different from one 360p rung.</summary>
    private static string? GenerateSourceVideo()
    {
        try
        {
            var path = Path.Combine(Path.GetTempPath(), $"cms-tq-live-{Guid.NewGuid():N}.mp4");
            var psi = new ProcessStartInfo
            {
                FileName = "ffmpeg",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardError = true,
            };
            psi.ArgumentList.Add("-y"); psi.ArgumentList.Add("-hide_banner"); psi.ArgumentList.Add("-loglevel"); psi.ArgumentList.Add("error");
            psi.ArgumentList.Add("-f"); psi.ArgumentList.Add("lavfi");
            psi.ArgumentList.Add("-i"); psi.ArgumentList.Add("testsrc=duration=2:size=1280x720:rate=10");
            psi.ArgumentList.Add("-pix_fmt"); psi.ArgumentList.Add("yuv420p");
            psi.ArgumentList.Add("-c:v"); psi.ArgumentList.Add("libx264");
            psi.ArgumentList.Add("-preset"); psi.ArgumentList.Add("ultrafast");
            psi.ArgumentList.Add("-crf"); psi.ArgumentList.Add("30");
            psi.ArgumentList.Add(path);
            using var process = Process.Start(psi);
            if (process is null) return null;
            process.StandardError.ReadToEnd();
            process.WaitForExit(60_000);
            return process.ExitCode == 0 && File.Exists(path) ? path : null;
        }
        catch
        {
            return null; // no ffmpeg on this host — the facts skip silently
        }
    }

    [Fact]
    public async Task P360_Encodes_Exactly_One_Rung_Even_On_A_Higher_Source()
    {
        var source = SourceVideoLazy.Value;
        if (source is null)
        {
            _output.WriteLine("SKIP — ffmpeg not available on this host.");
            return; // CI hosts without ffmpeg: nothing to prove here
        }

        var result = await RunPipelineAsync(source, TargetQuality.P360);

        result.Status.Should().Be(ProcessingStatus.Ready, "the single-rung encode completes normally");
        result.HlsKey.Should().EndWith("hls/master.m3u8");

        // The mandated evidence line — target, probed height, and the rung set.
        result.StartingJobLine.Should().NotBeNull(
            "the task-book-mandated job-start line must be emitted for every transcode");
        result.StartingJobLine!.Groups[2].Value.Should().Be("P360");
        result.StartingJobLine.Groups[3].Value.Should().Be("720", "the probe reports the source's display height");
        result.StartingJobLine.Groups[4].Value.Should().Be("360p",
            "a concrete P360 target pins the ladder to EXACTLY ONE 360p rung on a 720p source");

        // On-disk proof: exactly one rendition directory in the generated tree.
        result.VariantDirectories.Should().ContainSingle().Which.Should().Be("360p",
            "no parallel encodes — one x264 stream is the whole point of manual quality");

        _output.WriteLine("=== captured worker log ===");
        foreach (var line in result.Log) _output.WriteLine(line);
    }

    [Fact]
    public async Task Auto_On_The_Same_Source_Keeps_The_Source_Driven_Ladder()
    {
        var source = SourceVideoLazy.Value;
        if (source is null)
        {
            _output.WriteLine("SKIP — ffmpeg not available on this host.");
            return;
        }

        var result = await RunPipelineAsync(source, TargetQuality.Auto);

        result.Status.Should().Be(ProcessingStatus.Ready);
        result.StartingJobLine.Should().NotBeNull();
        result.StartingJobLine!.Groups[2].Value.Should().Be("Auto");
        result.StartingJobLine.Groups[4].Value.Should().Be("360p,720p",
            "Auto keeps the Push 10.3 behaviour: every rung ≤ the source, never upscale");
        result.VariantDirectories.Should().BeEquivalentTo(new[] { "360p", "720p" },
            "the Auto ladder really encodes both renditions on a 720p source");

        _output.WriteLine("=== captured worker log ===");
        foreach (var line in result.Log) _output.WriteLine(line);
    }

    // ================= live pipeline harness =================

    private sealed record PipelineRun(
        ProcessingStatus Status,
        string? HlsKey,
        IReadOnlyList<string> Log,
        Match? StartingJobLine,
        IReadOnlyList<string> VariantDirectories);

    private async Task<PipelineRun> RunPipelineAsync(string sourceVideo, TargetQuality targetQuality)
    {
        var root = new InMemoryDatabaseRoot();
        var dbName = $"tq-live-{Guid.NewGuid():N}";

        ApplicationDbContext CreateContext()
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseInMemoryDatabase(dbName, root)
                .Options;
            return new ApplicationDbContext(options);
        }

        // Seed: subject → course → one Pending video episode carrying the target.
        Guid episodeId;
        await using (var seed = CreateContext())
        {
            TestDbHelper.SeedTestData(seed);
            var subject = seed.Subjects.First();
            var course = new Course { SubjectId = subject.Id, Title = "كورس التحقق الحي", Status = ContentStatus.Published };
            seed.Courses.Add(course);
            var episode = new CourseEpisode
            {
                CourseId = course.Id,
                Title = "حلقة التحقق من الجودة",
                EpisodeNumber = 1,
                SourceType = CourseEpisodeSource.Upload,
                FileKey = "courses/live-tq/episode.mp4",
                FileSize = 1234,
                ContentType = "video/mp4",
                UploadId = null,
                ProcessingStatus = ProcessingStatus.Pending,
                TargetQuality = targetQuality,
            };
            seed.CourseEpisodes.Add(episode);
            await seed.SaveChangesAsync();
            episodeId = episode.Id;
        }

        var storage = new LocalFileStorage(sourceVideo);
        var logger = new CapturingLogger();

        var services = new ServiceCollection();
        services.AddScoped<IApplicationDbContext>(_ => CreateContext());
        services.AddSingleton<IFileStorageService>(storage);
        var provider = services.BuildServiceProvider();
        var scopeFactory = provider.GetRequiredService<IServiceScopeFactory>();

        var queue = new TranscodingChannelQueue();
        var registry = new TranscodingJobRegistry();
        using var worker = new VideoTranscodingService(queue, registry, scopeFactory, logger);

        // Enqueue BEFORE start; the boot sweep re-enqueues harmlessly (the duplicate
        // skips at dequeue once the row is Ready).
        queue.TryEnqueue(new TranscodingJob(MediaAssetType.CourseEpisode, episodeId));

        using var stopCts = new CancellationTokenSource(TimeSpan.FromSeconds(120));
        await worker.StartAsync(stopCts.Token);
        try
        {
            // Poll the shared InMemory store until the pipeline finishes.
            var deadline = DateTime.UtcNow.AddSeconds(100);
            while (DateTime.UtcNow < deadline)
            {
                await using var poll = CreateContext();
                var status = await poll.CourseEpisodes.AsNoTracking()
                    .Where(e => e.Id == episodeId)
                    .Select(e => new { e.ProcessingStatus, e.HlsKey })
                    .FirstOrDefaultAsync();
                if (status?.ProcessingStatus is ProcessingStatus.Ready or ProcessingStatus.Failed)
                {
                    var line = StartingJobLine().Matches(string.Join("\n", logger.Messages))
                        .FirstOrDefault(match => match.Groups[1].Value == episodeId.ToString());
                    var variants = storage.PutKeys
                        .Where(key => key.Contains("/hls/", StringComparison.Ordinal) && key.EndsWith("/index.m3u8", StringComparison.Ordinal))
                        .Select(key => key.Split("/hls/", StringSplitOptions.None)[1].Split('/')[0])
                        .Distinct()
                        .OrderBy(name => name)
                        .ToList();
                    return new PipelineRun(status.ProcessingStatus!.Value, status.HlsKey,
                        logger.Messages.ToList(), line, variants);
                }
                await Task.Delay(250);
            }
            throw new Xunit.Sdk.XunitException(
                $"transcode did not finish in 100s — last status unknown. Log:\n{string.Join("\n", logger.Messages)}");
        }
        finally
        {
            await worker.StopAsync(CancellationToken.None);
            await provider.DisposeAsync();
        }
    }

    /// <summary>Local-file storage fake: the source key resolves to the generated
    /// MP4; PutAsync records every object key the pipeline "uploads".</summary>
    private sealed class LocalFileStorage(string sourceFile) : IFileStorageService
    {
        public readonly ConcurrentQueue<string> PutKeys = new();

        public Task<Stream> DownloadAsync(string key, CancellationToken ct = default) =>
            Task.FromResult<Stream>(File.OpenRead(sourceFile));

        public Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default)
        {
            PutKeys.Enqueue(key);
            using var drain = new MemoryStream();
            content.CopyTo(drain); // consume the stream so the pipeline's dispose is clean
            return Task.CompletedTask;
        }

        public Task<string> UploadAsync(Stream fileStream, string fileName, string contentType, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> GetSignedUploadUrlAsync(string key, string contentType, TimeSpan expiry, long? contentLength = null, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> GetSignedUrlAsync(string key, TimeSpan expiry, CancellationToken ct = default) => throw new NotSupportedException();
        public Task DeleteAsync(string key, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<bool> ExistsAsync(string key, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> InitiateMultipartUploadAsync(string key, string contentType, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> PresignUploadPartAsync(string key, string uploadId, int partNumber, TimeSpan expiry, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<List<UploadedPartInfo>> ListMultipartPartsAsync(string key, string uploadId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task CompleteMultipartUploadAsync(string key, string uploadId, IReadOnlyList<CompletedPart> parts, CancellationToken ct = default) => throw new NotSupportedException();
        public Task AbortMultipartUploadAsync(string key, string uploadId, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<long> GetObjectSizeAsync(string key, CancellationToken ct = default) => throw new NotSupportedException();
        public Task<string> GetSignedUrlViaCredentialsAsync(string key, TimeSpan desiredExpiry, CancellationToken ct = default) => throw new NotSupportedException();
    }

    /// <summary>Captures every rendered log line (the structured-template evidence).</summary>
    private sealed class CapturingLogger : ILogger<VideoTranscodingService>
    {
        public readonly ConcurrentQueue<string> Messages = new();

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            try { Messages.Enqueue($"[{logLevel}] {formatter(state, exception)}"); }
            catch { /* never break the worker from a logging fault */ }
        }
    }
}
