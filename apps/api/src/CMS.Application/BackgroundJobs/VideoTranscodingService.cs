using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using CMS.Application.Exceptions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CMS.Application.BackgroundJobs;

// ====================================================================
// Push 10.3 — FFmpeg transcoding pipeline: queue + ladder + hosted worker.
//
// Lifecycle (state machine — ProcessingStatus on CourseEpisode/LibraryFile):
//   Pending ──► Transcoding_360p ──► Transcoding_720p ──► Transcoding_1080p ──► Ready
//      │                (single ffmpeg run; the rung statuses advance as overall      │
//      │                 encoding progress passes ⅓ and ⅔ — see FfmpegLadder)        │
//      └────────────────────────── any failure ──► Failed (terminal; retry = admin) ─┘
//
// The worker is a hosted BackgroundService: complete-upload handlers enqueue a
// TranscodingJob for video assets; the worker downloads the source from object
// storage, probes it with ffprobe, runs ONE ffmpeg invocation (the multi-variant
// var_stream_map ladder — industry standard, see FfmpegLadder.BuildHlsLadderArgs),
// uploads the generated tree back, and pins HlsKey to master.m3u8.
// ====================================================================

/// <summary>One asset awaiting the FFmpeg pipeline. Enqueued at complete-upload (video/* only).</summary>
public readonly record struct TranscodingJob(MediaAssetType AssetType, Guid AssetId);

/// <summary>
/// In-memory enqueue surface for handlers. Bounded (200): a full queue leaves the asset
/// Pending (never throws into the upload flow); a future admin sweep can re-enqueue.
/// This is intentionally NOT durable — a restart drops queued jobs, whose assets simply
/// stay Pending until re-enqueued (retry surface arrives with the Push 10.4 admin UI).
/// </summary>
public interface ITranscodingQueue
{
    /// <summary>False = queue at capacity; the asset remains Pending for a later sweep.</summary>
    bool TryEnqueue(TranscodingJob job);
}

public sealed class TranscodingChannelQueue : ITranscodingQueue
{
    public const int Capacity = 200;

    private readonly Channel<TranscodingJob> _channel = Channel.CreateBounded<TranscodingJob>(
        new BoundedChannelOptions(Capacity) { SingleReader = true, SingleWriter = false, FullMode = BoundedChannelFullMode.DropWrite });

    internal ChannelReader<TranscodingJob> Reader => _channel.Reader;

    public bool TryEnqueue(TranscodingJob job) => _channel.Writer.TryWrite(job);
}

/// <summary>
/// The hosted worker. Single-consumer by design: transcoding is CPU/disk heavy; one job
/// at a time keeps Render's container predictable (scale-out = more replicas later, the
/// queue stays per-instance).
/// </summary>
public sealed class VideoTranscodingService : BackgroundService
{
    /// <summary>Env overrides (kept as env, not appsettings: deployment-knob, not product config).</summary>
    public const string FfmpegPathEnv = "FFMPEG_PATH";
    public const string FfprobePathEnv = "FFPROBE_PATH";
    public const string TimeoutMinutesEnv = "FFMPEG_TIMEOUT_MINUTES";
    private const int DefaultTimeoutMinutes = 60;

    private readonly TranscodingChannelQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<VideoTranscodingService> _logger;

    public VideoTranscodingService(TranscodingChannelQueue queue, IServiceScopeFactory scopeFactory, ILogger<VideoTranscodingService> logger)
    {
        // DI registers the concrete queue once and forwards it as ITranscodingQueue —
        // handlers and this worker share ONE channel instance.
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("VideoTranscodingService started (ffmpeg={Ffmpeg})", ResolveFfmpegPath());
        try
        {
            await foreach (var job in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await ProcessJobAsync(job, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    throw; // host shutdown — let the finally-less loop unwind cleanly
                }
                catch (Exception ex)
                {
                    // The job's own pipeline already marked the asset Failed and logged the
                    // dual-language messages; this is the never-crash-the-worker backstop.
                    _logger.LogError(ex, "Transcoding job crashed outside the pipeline guard. {AssetType} {AssetId}", job.AssetType, job.AssetId);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // normal shutdown
        }
    }

    // ================= pipeline =================

    private async Task ProcessJobAsync(TranscodingJob job, CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<IFileStorageService>();

        // ---- resolve the asset (skip: deleted, not Pending, no source key) ----
        string sourceKey;
        Func<ProcessingStatus?, Task> saveStatus;
        Func<string?, Task> saveReady;

        if (job.AssetType == MediaAssetType.CourseEpisode)
        {
            var episode = await db.CourseEpisodes.FirstOrDefaultAsync(e => e.Id == job.AssetId && e.DeletedAt == null, ct);
            if (episode is null || episode.ProcessingStatus != ProcessingStatus.Pending || string.IsNullOrEmpty(episode.FileKey))
                return;
            sourceKey = episode.FileKey;
            saveStatus = async status => { episode.ProcessingStatus = status; await db.SaveChangesAsync(ct); };
            saveReady = async hlsKey => { episode.HlsKey = hlsKey; episode.ProcessingStatus = ProcessingStatus.Ready; await db.SaveChangesAsync(ct); };
        }
        else
        {
            var file = await db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == job.AssetId && f.DeletedAt == null, ct);
            if (file is null || file.ProcessingStatus != ProcessingStatus.Pending || string.IsNullOrEmpty(file.FileUrl))
                return;
            sourceKey = file.FileUrl;
            saveStatus = async status => { file.ProcessingStatus = status; await db.SaveChangesAsync(ct); };
            saveReady = async hlsKey => { file.HlsKey = hlsKey; file.ProcessingStatus = ProcessingStatus.Ready; await db.SaveChangesAsync(ct); };
        }

        var workspace = Path.Combine(Path.GetTempPath(), "cms-transcode", $"{job.AssetType}-{job.AssetId:N}");
        try
        {
            // Clean slate (a crashed earlier attempt must never leak half-written segments).
            if (Directory.Exists(workspace)) Directory.Delete(workspace, recursive: true);
            Directory.CreateDirectory(workspace);
            var sourcePath = Path.Combine(workspace, "source");
            var outputDir = Path.Combine(workspace, "out");
            Directory.CreateDirectory(outputDir);

            // ---- 1. download the source from object storage ----
            _logger.LogInformation("Transcode {AssetType} {AssetId}: downloading {Key}", job.AssetType, job.AssetId, sourceKey);
            await using (var download = await storage.DownloadAsync(sourceKey, ct))
            await using (var localFile = File.Create(sourcePath))
            {
                await download.CopyToAsync(localFile, 81_920, ct);
            }

            // ---- 2. probe (dimensions/duration/audio presence drive the ladder) ----
            var probe = await FfmpegLadder.ProbeAsync(sourcePath, ct);
            if (probe is null)
                throw new MediaProcessingException(
                    technicalDetails: $"ffprobe could not read the source object (key: {sourceKey}). The file may be corrupt or not a media container.");

            // ---- 3. run the ladder (statuses advance inside onProgress) ----
            var ffmpegArgs = FfmpegLadder.BuildHlsLadderArgs(sourcePath, outputDir, probe.Height, probe.HasAudio);
            await saveStatus(ProcessingStatus.Transcoding_360p);
            _logger.LogInformation(
                "Transcode {AssetType} {AssetId}: ffmpeg ladder starting ({Rungs} rungs, {Duration:F0}s source)",
                job.AssetType, job.AssetId, ffmpegArgs.RungNames.Count, probe.DurationSeconds);

            // Local phase tracker (NOT an instance field: jobs run sequentially but the
            // field would leak the phase into the next job).
            var phase = ProcessingStatus.Transcoding_360p;
            await RunFfmpegAsync(ffmpegArgs.Args, probe.DurationSeconds, ct, async fraction =>
            {
                // Ladder rungs encode in lockstep (single command) — the rung statuses are
                // the progress phases: 360p at start, 720p past ⅓, 1080p past ⅔.
                var next = fraction >= 2.0 / 3.0
                    ? ProcessingStatus.Transcoding_1080p
                    : fraction >= 1.0 / 3.0 ? ProcessingStatus.Transcoding_720p : ProcessingStatus.Transcoding_360p;
                if (next != phase) { phase = next; await saveStatus(next); }
            });

            // ---- 4. upload the generated tree ----
            var contentTypeFor = (string ext) => ext.Equals(".m3u8", StringComparison.OrdinalIgnoreCase)
                ? "application/vnd.apple.mpegurl"
                : "video/mp2t";
            var uploaded = 0;
            foreach (var filePath in Directory.EnumerateFiles(outputDir, "*", SearchOption.AllDirectories))
            {
                var relative = Path.GetRelativePath(outputDir, filePath).Replace('\\', '/');
                var key = $"{sourceKey}/hls/{relative}";
                await using var content = File.OpenRead(filePath);
                await storage.PutAsync(key, content, contentTypeFor(Path.GetExtension(filePath)), ct);
                uploaded++;
            }

            // ---- 5. finalize: HlsKey → master.m3u8, status Ready ----
            await saveReady($"{sourceKey}/hls/master.m3u8");
            _logger.LogInformation(
                "Transcode {AssetType} {AssetId}: Ready — {Files} HLS objects under {Prefix}/hls/",
                job.AssetType, job.AssetId, uploaded, sourceKey);
        }
        catch (MediaProcessingException mex)
        {
            _logger.LogError(mex,
                "Transcoding failed. {AssetType} {AssetId}. Human: {Human} | Technical: {Technical}",
                job.AssetType, job.AssetId, mex.HumanMessage, mex.TechnicalDetails);
            await TryMarkFailedAsync(db, job);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Host shutdown mid-job: best-effort reset so the next boot re-picks it.
            await TryResetToPendingAsync(db, job);
            throw;
        }
        catch (Exception ex)
        {
            var wrapped = new MediaProcessingException(innerException: ex,
                technicalDetails: $"Unhandled pipeline error: {ex.GetType().Name}: {ex.Message}");
            _logger.LogError(wrapped,
                "Transcoding failed (unhandled). {AssetType} {AssetId}. Human: {Human} | Technical: {Technical}",
                job.AssetType, job.AssetId, wrapped.HumanMessage, wrapped.TechnicalDetails);
            await TryMarkFailedAsync(db, job);
        }
        finally
        {
            try { if (Directory.Exists(workspace)) Directory.Delete(workspace, recursive: true); }
            catch (Exception cleanupEx) { _logger.LogWarning(cleanupEx, "Temp workspace cleanup failed: {Path}", workspace); }
        }
    }

    // ================= ffmpeg process runner =================

    private async Task RunFfmpegAsync(IReadOnlyList<string> args, double durationSeconds, CancellationToken ct,
        Func<double, Task> onProgress)
    {
        var ffmpeg = ResolveFfmpegPath();
        if (!IsOnPath(ffmpeg))
            throw new MediaProcessingException(technicalDetails:
                $"FFmpeg binary not found at '{ffmpeg}' (set {FfmpegPathEnv}). Transcoding cannot run on this host.");

        var timeoutMinutes = ParseTimeoutMinutes();
        var psi = new ProcessStartInfo
        {
            FileName = ffmpeg,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var arg in args) psi.ArgumentList.Add(arg);

        using var process = new Process { StartInfo = psi };
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(TimeSpan.FromMinutes(timeoutMinutes));

        if (!process.Start())
            throw new MediaProcessingException(technicalDetails: "FFmpeg process failed to start.");

        var stderrTail = new StringBuilder();
        var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token)
            .ContinueWith(t => { if (t.IsCompletedSuccessfully) AppendTail(stderrTail, t.Result); }, TaskScheduler.Default);

        try
        {
            string? line;
            while ((line = await process.StandardOutput.ReadLineAsync(timeoutCts.Token)) != null)
            {
                // -progress pipe:1 emits "key=value" blocks; out_time_us is the encode clock
                // (out_time_ms carries the same microseconds — historic ffmpeg quirk).
                if (line.StartsWith("out_time_us=", StringComparison.Ordinal) &&
                    long.TryParse(line.AsSpan("out_time_us=".Length), out var us) && durationSeconds > 0)
                {
                    var fraction = Math.Clamp(us / 1_000_000.0 / durationSeconds, 0.0, 1.0);
                    await onProgress(fraction);
                }
                else if (line.StartsWith("progress=end", StringComparison.Ordinal))
                {
                    await onProgress(1.0);
                }
            }

            await process.WaitForExitAsync(timeoutCts.Token);

            if (process.ExitCode != 0)
                throw new MediaProcessingException(technicalDetails:
                    $"FFmpeg exited with code {process.ExitCode}: {stderrTail}");
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            Kill(process);
            throw new MediaProcessingException(technicalDetails:
                $"FFmpeg timed out after {timeoutMinutes} minutes and was terminated.");
        }
        finally
        {
            if (!process.HasExited) Kill(process);
            await stderrTask; // observe faults only; tail already captured in the continuation
        }
    }

    private static void AppendTail(StringBuilder tail, string value)
    {
        // Keep the LAST ~2000 chars — the diagnostic gold is at the end of ffmpeg's stderr.
        if (tail.Length + value.Length > 4000) tail.Remove(0, Math.Min(tail.Length, 2000));
        tail.Append(value);
    }

    private static void Kill(Process process)
    {
        try { process.Kill(entireProcessTree: true); }
        catch { /* already gone */ }
    }

    private async Task TryMarkFailedAsync(IApplicationDbContext db, TranscodingJob job)
    {
        try
        {
            if (job.AssetType == MediaAssetType.CourseEpisode)
            {
                var episode = await db.CourseEpisodes.FirstOrDefaultAsync(e => e.Id == job.AssetId, CancellationToken.None);
                if (episode is not null) { episode.ProcessingStatus = ProcessingStatus.Failed; await db.SaveChangesAsync(CancellationToken.None); }
            }
            else
            {
                var file = await db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == job.AssetId, CancellationToken.None);
                if (file is not null) { file.ProcessingStatus = ProcessingStatus.Failed; await db.SaveChangesAsync(CancellationToken.None); }
            }
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to persist ProcessingStatus=Failed for {Job}", job); }
    }

    private async Task TryResetToPendingAsync(IApplicationDbContext db, TranscodingJob job)
    {
        try
        {
            if (job.AssetType == MediaAssetType.CourseEpisode)
            {
                var episode = await db.CourseEpisodes.FirstOrDefaultAsync(e => e.Id == job.AssetId, CancellationToken.None);
                if (episode is not null && episode.ProcessingStatus is ProcessingStatus.Transcoding_360p
                    or ProcessingStatus.Transcoding_720p or ProcessingStatus.Transcoding_1080p)
                { episode.ProcessingStatus = ProcessingStatus.Pending; await db.SaveChangesAsync(CancellationToken.None); }
            }
            else
            {
                var file = await db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == job.AssetId, CancellationToken.None);
                if (file is not null && file.ProcessingStatus is ProcessingStatus.Transcoding_360p
                    or ProcessingStatus.Transcoding_720p or ProcessingStatus.Transcoding_1080p)
                { file.ProcessingStatus = ProcessingStatus.Pending; await db.SaveChangesAsync(CancellationToken.None); }
            }
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to reset status to Pending for {Job}", job); }
    }

    private static string ResolveFfmpegPath() => Environment.GetEnvironmentVariable(FfmpegPathEnv) is { Length: > 0 } path ? path : "ffmpeg";

    private static bool IsOnPath(string fileName) =>
        Path.IsPathRooted(fileName) ? File.Exists(fileName) : true; // bare name: trust PATH; ffmpeg itself reports ENOENT as exit code + stderr

    private static int ParseTimeoutMinutes()
    {
        var raw = Environment.GetEnvironmentVariable(TimeoutMinutesEnv);
        return int.TryParse(raw, out var minutes) && minutes > 0 ? minutes : DefaultTimeoutMinutes;
    }
}

/// <summary>
/// Push 10.3 §1.E — the exact HLS ladder ffmpeg runs. ONE invocation produces all
/// rungs + master.m3u8 (industry-standard var_stream_map form; per-rung separate
/// invocations would triple the decode cost for zero benefit).
///
/// Ladder (1080p source, task-book bitrates; maxrate ≈ 107% of target, bufsize ≈ 1.5×):
///   360p  → 640×360,   h264 main,  800k (max 856k,  buf 1200k), aac  96k
///   720p  → 1280×720,  h264 main, 2800k (max 2996k, buf 4200k), aac 128k
///   1080p → 1920×1080, h264 high, 5000k (max 5350k, buf 7500k), aac 192k
///
/// GOP: -g 48 -keyint_min 48 -sc_threshold 0 (aligned to 4-second segments).
/// Segments: MPEG-TS, 4s, independent_segments, VOD playlist type.
/// Rungs whose height exceeds the source are dropped (never upscale — a 720p source
/// yields 360p+720p; 360p is always kept so every input produces an HLS output).
/// </summary>
public static class FfmpegLadder
{
    public sealed record Rung(string Name, int Width, int Height, string VideoBitrate, string MaxRate, string BufSize, string AudioBitrate, string Profile);

    public static readonly IReadOnlyList<Rung> FullLadder = new[]
    {
        new Rung("360p",  640,  360, "800k",  "856k",  "1200k", "96k",  "main"),
        new Rung("720p",  1280, 720, "2800k", "2996k", "4200k", "128k", "main"),
        new Rung("1080p", 1920, 1080, "5000k", "5350k", "7500k", "192k", "high"),
    };

    public sealed record ProbeResult(double DurationSeconds, int Width, int Height, bool HasAudio);

    public sealed record LadderPlan(IReadOnlyList<string> Args, IReadOnlyList<string> RungNames);

    /// <summary>Builds the exact argument vector for the multi-variant ffmpeg run.
    /// <paramref name="sourcePath"/> is the downloaded temp source; the output tree
    /// lands under <paramref name="outputDirectory"/> (master.m3u8 + one dir per rung).</summary>
    public static LadderPlan BuildHlsLadderArgs(string sourcePath, string outputDirectory, int sourceHeight, bool hasAudio)
    {
        // Never upscale: keep the rungs at or below the source height; 360p is the floor.
        var rungs = FullLadder.Where(r => r.Height <= sourceHeight).ToList();
        if (rungs.Count == 0) rungs = [FullLadder[0]];

        var args = new List<string>
        {
            "-y", "-hide_banner", "-nostats", "-loglevel", "error",
            "-progress", "pipe:1",
            "-i", sourcePath,
        };

        // ---- filter graph: split the source per rung, scale+pad to exact rung size ----
        var splitLabels = string.Join(string.Empty, Enumerable.Range(0, rungs.Count).Select(i => $"[v{i + 1}]"));
        var chainParts = new List<string> { $"[0:v]split={rungs.Count}{splitLabels}" };
        for (var i = 0; i < rungs.Count; i++)
        {
            var rung = rungs[i];
            chainParts.Add(
                $"[v{i + 1}]scale={rung.Width}:{rung.Height}:force_original_aspect_ratio=decrease," +
                $"pad={rung.Width}:{rung.Height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v{i + 1}out]");
        }
        args.Add("-filter_complex");
        args.Add(string.Join(";", chainParts));

        // ---- per-rung stream maps: scaled video (+ first audio when present) ----
        for (var i = 0; i < rungs.Count; i++)
        {
            args.Add("-map");
            args.Add($"[v{i + 1}out]");
            if (hasAudio) { args.Add("-map"); args.Add("0:a:0"); }
        }

        // ---- per-rung encodes ----
        args.AddRange(new[] { "-preset", "veryfast" }); // one preset for every x264 stream
        for (var i = 0; i < rungs.Count; i++)
        {
            var rung = rungs[i];
            args.AddRange(new[]
            {
                $"-c:v:{i}", "libx264",
                $"-profile:v:{i}", rung.Profile,
                $"-b:v:{i}", rung.VideoBitrate,
                $"-maxrate:v:{i}", rung.MaxRate,
                $"-bufsize:v:{i}", rung.BufSize,
            });
            if (hasAudio) args.AddRange(new[] { $"-c:a:{i}", "aac", $"-b:a:{i}", rung.AudioBitrate });
        }
        if (hasAudio) { args.Add("-ac"); args.Add("2"); }

        // ---- GOP alignment (4-second segments) ----
        args.AddRange(new[] { "-g", "48", "-keyint_min", "48", "-sc_threshold", "0" });

        // ---- HLS packaging ----
        var streamMap = string.Join(" ", Enumerable.Range(0, rungs.Count).Select(i =>
            hasAudio ? $"v:{i},a:{i},name:{rungs[i].Name}" : $"v:{i},name:{rungs[i].Name}"));

        args.AddRange(new[]
        {
            "-f", "hls",
            "-hls_time", "4",
            "-hls_playlist_type", "vod",
            "-hls_flags", "independent_segments",
            "-hls_segment_type", "mpegts",
            "-master_pl_name", "master.m3u8",
            "-var_stream_map", streamMap,
            "-hls_segment_filename", $"{outputDirectory}/%v/segment_%03d.ts",
            $"{outputDirectory}/%v/index.m3u8",
        });

        return new LadderPlan(args, rungs.Select(r => r.Name).ToList());
    }

    /// <summary>Probes width/height/duration (video) + audio presence. Null = ffprobe failed.</summary>
    public static async Task<ProbeResult?> ProbeAsync(string sourcePath, CancellationToken ct)
    {
        var ffprobe = Environment.GetEnvironmentVariable(VideoTranscodingService.FfprobePathEnv) is { Length: > 0 } probe ? probe : "ffprobe";

        var probePsi = new ProcessStartInfo
        {
            FileName = ffprobe,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        probePsi.ArgumentList.Add("-v"); probePsi.ArgumentList.Add("error");
        probePsi.ArgumentList.Add("-select_streams"); probePsi.ArgumentList.Add("v:0");
        probePsi.ArgumentList.Add("-show_entries"); probePsi.ArgumentList.Add("stream=width,height");
        probePsi.ArgumentList.Add("-show_entries"); probePsi.ArgumentList.Add("format=duration");
        probePsi.ArgumentList.Add("-of"); probePsi.ArgumentList.Add("json");
        probePsi.ArgumentList.Add(sourcePath);

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(60));
        try
        {
            using var probeProcess = Process.Start(probePsi);
            if (probeProcess is null) return null;
            var stdout = await probeProcess.StandardOutput.ReadToEndAsync(timeoutCts.Token);
            await probeProcess.WaitForExitAsync(timeoutCts.Token);
            if (probeProcess.ExitCode != 0) return null;

            using var doc = JsonDocument.Parse(stdout);
            var root = doc.RootElement;
            var stream = root.TryGetProperty("streams", out var streams) && streams.GetArrayLength() > 0 ? streams[0] : default;
            int? width = null, height = null;
            if (stream.ValueKind == JsonValueKind.Object)
            {
                if (stream.TryGetProperty("width", out var w) && w.TryGetInt32(out var wi)) width = wi;
                if (stream.TryGetProperty("height", out var h) && h.TryGetInt32(out var hi)) height = hi;
            }
            double duration = 0;
            if (root.TryGetProperty("format", out var format) && format.TryGetProperty("duration", out var d)
                && double.TryParse(d.GetString(), out var parsed)) duration = parsed;
            if (width is null || height is null) return null; // no video stream at all

            return new ProbeResult(duration, width.Value, height.Value, await HasAudioAsync(ffprobe, sourcePath, timeoutCts.Token));
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return null; // probe timeout — treat as unreadable source
        }
        catch (Exception)
        {
            return null; // ffprobe missing / bad JSON — the pipeline reports a clear failure
        }
    }

    private static async Task<bool> HasAudioAsync(string ffprobe, string sourcePath, CancellationToken ct)
    {
        var audioPsi = new ProcessStartInfo
        {
            FileName = ffprobe,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        audioPsi.ArgumentList.Add("-v"); audioPsi.ArgumentList.Add("error");
        audioPsi.ArgumentList.Add("-select_streams"); audioPsi.ArgumentList.Add("a");
        audioPsi.ArgumentList.Add("-show_entries"); audioPsi.ArgumentList.Add("stream=index");
        audioPsi.ArgumentList.Add("-of"); audioPsi.ArgumentList.Add("csv=p=0");
        audioPsi.ArgumentList.Add(sourcePath);
        try
        {
            using var audioProcess = Process.Start(audioPsi);
            if (audioProcess is null) return false;
            var stdout = await audioProcess.StandardOutput.ReadToEndAsync(ct);
            await audioProcess.WaitForExitAsync(ct);
            return audioProcess.ExitCode == 0 && !string.IsNullOrWhiteSpace(stdout);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception) { return false; }
    }
}
