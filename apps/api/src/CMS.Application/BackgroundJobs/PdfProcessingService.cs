using System.Diagnostics;
using System.Text;
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
// Wave 11.9 — Ghostscript PDF pre-processing pipeline: queue + worker.
//
// Clones the Push 10.3 VideoTranscodingService architecture (bounded channel,
// single-consumer BackgroundService, boot-time recovery sweep) for the PDF
// font problem the R16–R19 player hotfixes could only mitigate client-side:
// uploads with broken embedded fonts / missing cmaps produce isolated Arabic
// glyphs on the pdf.js canvas. The pipeline fixes the file at the SOURCE:
//
//   Pending ──► Normalizing ──► Ready          (PdfProcessingStatus on LibraryFile)
//      │              (download → gs pdfwrite → upload {key}-fixed → swap FileUrl)
//      └──────────────── any failure ──► Failed (ProcessingError = technical details)
//
// complete-upload enqueues a PdfProcessingJob for application/pdf assets; the
// worker downloads the source from object storage, re-embeds fonts with the
// OFL Arabic pack baked into the image (/app/ghostscript-fonts), uploads the
// fixed object under the sibling key "{key}-fixed" (original kept for
// rollback/audit), swaps FileUrl, and pins Ready. A source larger than the
// processing.pdf_max_mb ceiling (default 30 MB — Render free tier RAM) is
// deliberately skipped: it is marked Ready with FileUrl UNCHANGED, so the
// player's FontPipelineFixed flag stays false and R19 path rendering keeps
// protecting it.
// ====================================================================

/// <summary>One PDF awaiting the Ghostscript pass. Enqueued at complete-upload (application/pdf only).</summary>
public readonly record struct PdfProcessingJob(Guid FileId);

/// <summary>
/// In-memory enqueue surface for handlers. Bounded (200, DropWrite) — a full queue
/// leaves the file Pending (never throws into the upload flow); the boot sweep and
/// a future admin retry re-enqueue. Intentionally NOT durable, exactly like the
/// transcoding queue: a restart drops queued jobs, whose rows are recovered below.
/// </summary>
public interface IPdfProcessingQueue
{
    /// <summary>False = queue at capacity; the file remains Pending for a later sweep.</summary>
    bool TryEnqueue(PdfProcessingJob job);
}

public sealed class PdfProcessingChannelQueue : IPdfProcessingQueue
{
    public const int Capacity = 200;

    private readonly Channel<PdfProcessingJob> _channel = Channel.CreateBounded<PdfProcessingJob>(
        new BoundedChannelOptions(Capacity) { SingleReader = true, SingleWriter = false, FullMode = BoundedChannelFullMode.DropWrite });

    internal ChannelReader<PdfProcessingJob> Reader => _channel.Reader;

    public bool TryEnqueue(PdfProcessingJob job) => _channel.Writer.TryWrite(job);
}

/// <summary>
/// Abstraction over the Ghostscript process so unit tests can assert the exact
/// command vector without a real binary. The production runner executes the
/// process with a per-job watchdog (GS_TIMEOUT_MINUTES) and surfaces the stderr
/// tail as the Failure technical details.
/// </summary>
public interface IGhostscriptRunner
{
    Task RunAsync(string gsPath, IReadOnlyList<string> args, TimeSpan timeout, CancellationToken ct);
}

/// <summary>Wave 11.9 — the exact Ghostscript argument vector (task book, part I.1.B):
/// gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dEmbedAllFonts=true -dSubsetFonts=true
///     -sFONTPATH={fontsPath} -sOutputFile={output} {input}
/// pdfwrite re-embeds (or substitutes from FONTPATH) every font and rewrites the
/// document — the operation that repairs broken embedded fonts and missing cmaps.</summary>
public static class GhostscriptArgs
{
    public static string[] Build(string inputPath, string outputPath, string fontsPath) => new[]
    {
        "-dNOPAUSE",
        "-dBATCH",
        "-sDEVICE=pdfwrite",
        "-dEmbedAllFonts=true",
        "-dSubsetFonts=true",
        $"-sFONTPATH={fontsPath}",
        $"-sOutputFile={outputPath}",
        inputPath,
    };
}

/// <summary>Production Ghostscript runner: mirrors RunFfmpegAsync's process discipline
/// (redirect stderr, watchdog CancelAfter, kill the whole process tree on timeout,
/// exit-code 137 = OOM killer gets an explicit diagnosis). The stderr tail rides the
/// MediaProcessingException so TryMarkFailed can persist it into ProcessingError.</summary>
public sealed class ProcessGhostscriptRunner : IGhostscriptRunner
{
    public async Task RunAsync(string gsPath, IReadOnlyList<string> args, TimeSpan timeout, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName = gsPath,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var arg in args) psi.ArgumentList.Add(arg);

        using var process = new Process { StartInfo = psi };
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(timeout);

        if (!process.Start())
            throw new MediaProcessingException(technicalDetails: "Ghostscript process failed to start.");

        var stderrTail = new StringBuilder();
        var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token)
            .ContinueWith(t => { if (t.IsCompletedSuccessfully) AppendTail(stderrTail, t.Result); }, TaskScheduler.Default);

        try
        {
            // Drain stdout concurrently so a chatty GS run can never deadlock on a
            // full pipe buffer; the output carries nothing we act on (-dNOPAUSE -dBATCH
            // progress pages only).
            var stdoutTask = process.StandardOutput.ReadToEndAsync(CancellationToken.None);

            await process.WaitForExitAsync(timeoutCts.Token);

            if (process.ExitCode != 0)
            {
                if (process.ExitCode == 137)
                    throw new MediaProcessingException(
                        humanMessage: "نفدت ذاكرة الخادم أثناء معالجة هذا الملف. يرجى تجربة ملف أصغر حجماً.",
                        technicalDetails:
                            "Ghostscript was killed by SIGKILL (exit code 137 — host out of memory). " +
                            "Try a smaller PDF or lower the processing ceiling. " + stderrTail);
                throw new MediaProcessingException(technicalDetails:
                    $"Ghostscript exited with code {process.ExitCode}: {stderrTail}");
            }
            await stdoutTask; // observe (drained above); faults surface via ExitCode path
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            Kill(process);
            throw new MediaProcessingException(
                humanMessage: "استغرقت معالجة الملف وقتاً أطول من المسموح على الخادم.",
                technicalDetails: $"Ghostscript timed out after {timeout.TotalMinutes:F0} minutes and was terminated (watchdog).");
        }
        finally
        {
            if (!process.HasExited) Kill(process);
            await stderrTask; // observe faults only; tail already captured in the continuation
        }
    }

    private static void AppendTail(StringBuilder tail, string value)
    {
        // Keep the LAST ~2000 chars — GS diagnostics (font substitution warnings,
        // errors) land at the end of stderr.
        if (tail.Length + value.Length > 4000) tail.Remove(0, Math.Min(tail.Length, 2000));
        tail.Append(value);
    }

    private static void Kill(Process process)
    {
        try { process.Kill(entireProcessTree: true); }
        catch { /* already gone */ }
    }
}

/// <summary>
/// The hosted worker. Single-consumer by design (Ghostscript is CPU/RAM heavy; one
/// job at a time keeps Render's container predictable — same rationale as the
/// transcoding worker). ProcessJobAsync is internal for the unit test suite
/// (InternalsVisibleTo CMS.Tests), mirroring how the Push 10.8 live harness
/// exercises the real pipeline end-to-end.
/// </summary>
public sealed class PdfProcessingService : BackgroundService
{
    /// <summary>Env overrides (kept as env, not appsettings: deployment-knob, not product config).</summary>
    public const string GsPathEnv = "GS_PATH";
    public const string FontsPathEnv = "GHOSTSCRIPT_FONTS_PATH";
    public const string TimeoutMinutesEnv = "GS_TIMEOUT_MINUTES";
    public const string MaxMbSettingKey = "processing.pdf_max_mb";
    /// <summary>Wave 11.9 guardrail: sources above this ceiling skip Ghostscript entirely
    /// (Ready, FileUrl unchanged, player falls back to R19 path rendering). The default
    /// answers the DIAG OPEN-2 memory question for Render's 512MB free tier; admins can
    /// retune it at runtime via system settings without a redeploy.</summary>
    public const int DefaultMaxMb = 30;
    private const int DefaultTimeoutMinutes = 10;

    private readonly PdfProcessingChannelQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IGhostscriptRunner _runner;
    private readonly ILogger<PdfProcessingService> _logger;

    public PdfProcessingService(PdfProcessingChannelQueue queue, IServiceScopeFactory scopeFactory,
        IGhostscriptRunner runner, ILogger<PdfProcessingService> logger)
    {
        // DI registers the concrete queue once and forwards it as IPdfProcessingQueue —
        // handlers and this worker share ONE channel instance (transcoding pattern).
        _queue = queue;
        _scopeFactory = scopeFactory;
        _runner = runner;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("PdfProcessingService started (gs={Gs}, fonts={Fonts})", ResolveGsPath(), ResolveFontsPath());
        try
        {
            // Same recovery contract as RecoverStuckJobsAsync: the queue is in-memory —
            // rows a previous process left mid-flight (container OOM kill, deploy
            // restart) would sit in Pending/Normalizing forever. At boot nothing is
            // processing yet: reset Normalizing → Pending and re-enqueue both.
            try { await RecoverStuckJobsAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Startup PDF processing recovery sweep failed; stuck files keep their current status.");
            }

            await foreach (var job in _queue.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await ProcessJobAsync(job, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    throw; // host shutdown — let the loop unwind cleanly
                }
                catch (Exception ex)
                {
                    // The job's own pipeline already marked the file Failed and logged the
                    // details; this is the never-crash-the-worker backstop.
                    _logger.LogError(ex, "PDF processing job crashed outside the pipeline guard. FileId={FileId}", job.FileId);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // normal shutdown
        }
    }

    // ================= pipeline =================

    internal async Task ProcessJobAsync(PdfProcessingJob job, CancellationToken stoppingToken)
    {
        var ct = stoppingToken;
        _logger.LogInformation("PDF processing job started: FileId={FileId} dequeued and entering pipeline", job.FileId);

        // The scope lives for the whole job: the failure paths below need the db to
        // persist the terminal status.
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
        var storage = scope.ServiceProvider.GetRequiredService<IFileStorageService>();
        var settings = scope.ServiceProvider.GetRequiredService<ISystemSettingsService>();

        var workspace = Path.Combine(Path.GetTempPath(), "cms-pdfprocess", $"{job.FileId:N}");
        try
        {
            // ---- resolve the file (skip: deleted, not Pending, no source key) ----
            var file = await db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == job.FileId && f.DeletedAt == null, ct);
            if (file is null || file.PdfProcessingStatus != PdfProcessingStatus.Pending || string.IsNullOrEmpty(file.FileUrl))
            {
                // Mirrors the HOTFIX 10.13 silent-skip diagnostic on the transcoding arm:
                // without this line an aborted/deleted/duplicate dequeue exits with no trace.
                _logger.LogWarning(
                    "PDF processing job skipped: file {FileId} — notFound={NotFound} status={Status} fileKeyEmpty={FileKeyEmpty}",
                    job.FileId, file is null, file?.PdfProcessingStatus?.ToString() ?? "<null>", string.IsNullOrEmpty(file?.FileUrl));
                return;
            }

            // ---- ceiling guard: too large → skip Ghostscript, Ready, R19 fallback ----
            var maxBytes = await ResolveMaxBytesAsync(settings, ct);
            if (file.FileSize > maxBytes)
            {
                _logger.LogInformation(
                    "PDF processing skipped (ceiling): file {FileId} is {SizeMb:F1}MB > {MaxMb}MB — marking Ready, keeping R19 path rendering",
                    file.Id, file.FileSize / 1024.0 / 1024.0, maxBytes / 1024 / 1024);
                file.PdfProcessingStatus = PdfProcessingStatus.Ready;
                file.ProcessingError = null;
                await db.SaveChangesAsync(ct);
                return;
            }

            // Clean slate (a crashed earlier attempt must never leak half-written files).
            if (Directory.Exists(workspace)) Directory.Delete(workspace, recursive: true);
            Directory.CreateDirectory(workspace);
            var sourcePath = Path.Combine(workspace, "source.pdf");
            var fixedPath = Path.Combine(workspace, "fixed.pdf");

            // ---- 1. download the source from object storage ----
            _logger.LogInformation("PDF process {FileId}: downloading {Key}", file.Id, file.FileUrl);
            await using (var download = await storage.DownloadAsync(file.FileUrl, ct))
            await using (var localFile = File.Create(sourcePath))
            {
                await download.CopyToAsync(localFile, 81_920, ct);
            }

            // ---- 2. Ghostscript re-embed (Normalizing = the visible admin phase) ----
            file.PdfProcessingStatus = PdfProcessingStatus.Normalizing;
            await db.SaveChangesAsync(ct);

            var args = GhostscriptArgs.Build(sourcePath, fixedPath, ResolveFontsPath());
            _logger.LogInformation("PDF process {FileId}: gs starting ({Args})",
                file.Id, string.Join(' ', args.Select(a => a.Contains(' ') ? $"\"{a}\"" : a)));
            await _runner.RunAsync(ResolveGsPath(), args, TimeSpan.FromMinutes(ParseTimeoutMinutes()), ct);
            if (!File.Exists(fixedPath))
                throw new MediaProcessingException(technicalDetails:
                    $"Ghostscript reported success but produced no output file (expected at {fixedPath}).");

            // ---- 3. upload the fixed object under the sibling key, then swap ----
            // {key}-fixed keeps the original object for rollback/audit (DIAG proposal).
            var fixedKey = $"{file.FileUrl}-fixed";
            await using (var content = File.OpenRead(fixedPath))
            {
                await storage.PutAsync(fixedKey, content, "application/pdf", ct);
            }
            file.FileUrl = fixedKey;
            file.PdfProcessingStatus = PdfProcessingStatus.Ready;
            file.ProcessingError = null;
            await db.SaveChangesAsync(ct);

            _logger.LogInformation(
                "PDF processing job completed: FileId={FileId} — status=Ready FileUrl={FileUrl}",
                file.Id, file.FileUrl);
        }
        catch (MediaProcessingException mex)
        {
            _logger.LogError(mex,
                "PDF processing failed. FileId={FileId}. Human: {Human} | Technical: {Technical}",
                job.FileId, mex.HumanMessage, mex.TechnicalDetails);
            await TryMarkFailedAsync(db, job, mex.TechnicalDetails);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Host shutdown mid-job: best-effort reset so the next boot re-picks it
            // (RecoverStuckJobsAsync also sweeps any row this couldn't reset).
            await TryResetToPendingAsync(db, job);
            throw;
        }
        catch (Exception ex)
        {
            var wrapped = new MediaProcessingException(innerException: ex,
                technicalDetails: $"Unhandled pipeline error: {ex.GetType().Name}: {ex.Message}");
            _logger.LogError(wrapped,
                "PDF processing failed (unhandled). FileId={FileId}. Technical: {Technical}",
                job.FileId, wrapped.TechnicalDetails);
            await TryMarkFailedAsync(db, job, wrapped.TechnicalDetails);
        }
        finally
        {
            try { if (Directory.Exists(workspace)) Directory.Delete(workspace, recursive: true); }
            catch (Exception cleanupEx) { _logger.LogWarning(cleanupEx, "Temp workspace cleanup failed: {Path}", workspace); }
        }
    }

    // ================= recovery + failure persistence =================

    /// <summary>Boot-time recovery sweep (transcoding precedent): Pending rows were lost
    /// with the in-memory queue (queue-full drops, restart between complete-upload and
    /// boot) and Normalizing rows are crash leftovers — reset the latter to Pending and
    /// re-enqueue both. Non-PDF assets never carry these statuses (they stay NULL).</summary>
    private async Task RecoverStuckJobsAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();

        var stuckFiles = await db.LibraryFiles
            .Where(f => f.DeletedAt == null
                && (f.PdfProcessingStatus == PdfProcessingStatus.Pending
                    || f.PdfProcessingStatus == PdfProcessingStatus.Normalizing))
            .ToListAsync(ct);

        foreach (var file in stuckFiles)
        {
            if (file.PdfProcessingStatus != PdfProcessingStatus.Pending)
                _logger.LogInformation("Recovery: file {FileId} was mid-processing (Normalizing); resetting to Pending", file.Id);
            file.PdfProcessingStatus = PdfProcessingStatus.Pending;
            if (!_queue.TryEnqueue(new PdfProcessingJob(file.Id)))
                _logger.LogWarning("Recovery: PDF queue at capacity; file {FileId} stays Pending", file.Id);
        }
        if (stuckFiles.Count > 0)
        {
            await db.SaveChangesAsync(CancellationToken.None);
            _logger.LogInformation("PDF recovery sweep re-enqueued {Count} file(s)", stuckFiles.Count);
        }
    }

    private async Task TryMarkFailedAsync(IApplicationDbContext db, PdfProcessingJob job, string technicalDetails)
    {
        try
        {
            var file = await db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == job.FileId, CancellationToken.None);
            if (file is not null)
            {
                file.PdfProcessingStatus = PdfProcessingStatus.Failed;
                // Persist the raw GS stderr tail / storage error — the admin error modal
                // renders exactly this string (Push 10.4 technicalDetails contract).
                file.ProcessingError = technicalDetails;
                await db.SaveChangesAsync(CancellationToken.None);
            }
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to persist PdfProcessingStatus=Failed for {FileId}", job.FileId); }
    }

    private async Task TryResetToPendingAsync(IApplicationDbContext db, PdfProcessingJob job)
    {
        try
        {
            var file = await db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == job.FileId, CancellationToken.None);
            if (file is not null && file.PdfProcessingStatus == PdfProcessingStatus.Normalizing)
            {
                file.PdfProcessingStatus = PdfProcessingStatus.Pending;
                await db.SaveChangesAsync(CancellationToken.None);
            }
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Failed to reset PDF status to Pending for {FileId}", job.FileId); }
    }

    // ================= env/settings resolution =================

    /// <summary>Settings-first, hardcoded-fallback (A2-3 precedent): the runtime ceiling
    /// answers DIAG OPEN-2 — admins retune without a redeploy; an unparseable row falls
    /// back to the 30 MB default.</summary>
    private static async Task<long> ResolveMaxBytesAsync(ISystemSettingsService settings, CancellationToken ct)
    {
        var raw = await settings.GetAsync(MaxMbSettingKey, ct);
        var maxMb = int.TryParse(raw, out var parsed) && parsed > 0 ? parsed : DefaultMaxMb;
        return maxMb * 1024L * 1024L;
    }

    private static string ResolveGsPath() => Environment.GetEnvironmentVariable(GsPathEnv) is { Length: > 0 } path ? path : "gs";

    private static string ResolveFontsPath() =>
        Environment.GetEnvironmentVariable(FontsPathEnv) is { Length: > 0 } path ? path : "/app/ghostscript-fonts";

    private static int ParseTimeoutMinutes()
    {
        var raw = Environment.GetEnvironmentVariable(TimeoutMinutesEnv);
        return int.TryParse(raw, out var minutes) && minutes > 0 ? minutes : DefaultTimeoutMinutes;
    }
}
